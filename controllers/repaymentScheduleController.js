import RepaymentSchedule from '../models/RepaymentSchedules.js';
import LoanAccount from '../models/LoanAccount.js'; 
import CustomerAccount from '../models/CustomerAccount.js';
import Transaction from '../models/Transaction.js';
import mongoose from 'mongoose';

// Helper function to validate installment data
const validateInstallment = (installment) => {
  const requiredFields = [
    'ACCT_NO', 'dueDate', 'principal', 'interest', 
    'totalPayment', 'installmentNo', 'termCode', 'paymentFrequency'
  ];
  
  const missingFields = requiredFields.filter(field => !installment[field]);
  
  if (missingFields.length > 0) {
    throw {
      code: 'INVALID_INSTALLMENT',
      message: 'Installment data is incomplete',
      status: 400,
      details: { missingFields }
    };
  }

  if (installment.status === 'PAID' && installment.amountPaid < installment.totalPayment) {
    throw {
      code: 'INVALID_PAYMENT_STATUS',
      message: 'Installment marked as PAID but amount paid is less than total payment',
      status: 400
    };
  }
};

export const recordPayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { ACCT_NO } = req.params;
    const { 
      amount, 
      paymentDate = new Date(), 
      customerAccountNo,
      paymentMethod = 'BANK_TRANSFER',
      referenceNumber,
      description,
      createdBy = 'SYSTEM'
    } = req.body;

    // Validate input
    if (!ACCT_NO || !amount || !customerAccountNo) {
      throw {
        code: 'MISSING_FIELDS',
        message: 'Missing required fields: ACCT_NO, amount, or customerAccountNo',
        status: 400
      };
    }

    if (isNaN(amount) || amount <= 0) {
      throw {
        code: 'INVALID_AMOUNT',
        message: 'Payment amount must be a valid positive number',
        status: 400
      };
    }

    // Validate payment date
    const paymentDateTime = new Date(paymentDate);
    if (isNaN(paymentDateTime.getTime())) {
      throw {
        code: 'INVALID_DATE',
        message: 'Invalid payment date',
        status: 400
      };
    }

    // 1. Find accounts and installment
    const [loanAccount, customerAccount, installment] = await Promise.all([
      LoanAccount.findOne({ ACCT_NO }).session(session),
      CustomerAccount.findOne({ ACCT_NO: customerAccountNo }).session(session),
      RepaymentSchedule.findOne({
        ACCT_NO,
        status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
        dueDate: { $lte: paymentDateTime }
      })
      .sort({ dueDate: 1, installmentNo: 1 })
      .session(session)
    ]);

    if (!loanAccount) {
      throw {
        code: 'LOAN_NOT_FOUND',
        message: 'Loan account not found',
        status: 404
      };
    }

    if (!customerAccount) {
      throw {
        code: 'CUSTOMER_ACCOUNT_NOT_FOUND',
        message: 'Customer account not found',
        status: 404
      };
    }

    if (!installment) {
      throw {
        code: 'NO_DUE_INSTALLMENTS',
        message: 'No due installments found for payment',
        status: 400
      };
    }

    // Validate installment structure
    validateInstallment(installment);

    // Validate payment frequency matches loan account
    if (loanAccount.PAYMENT_FREQUENCY !== installment.paymentFrequency) {
      throw {
        code: 'FREQUENCY_MISMATCH',
        message: 'Payment frequency does not match loan account frequency',
        status: 400
      };
    }

    // Check customer balance
    if (customerAccount.AVAILABLE_BALANCE < amount) {
      throw {
        code: 'INSUFFICIENT_FUNDS',
        message: 'Customer account has insufficient funds',
        status: 400
      };
    }

    // 2. Process payment
    const amountDue = installment.totalPayment - (installment.amountPaid || 0);
    const paymentAmount = Math.min(amount, amountDue);
    const newStatus = paymentAmount >= amountDue ? 'PAID' : 'PARTIAL';
    const isEarlyPayment = paymentDateTime < new Date(installment.dueDate);
    const isOverduePayment = paymentDateTime > new Date(installment.dueDate);

    // Calculate late fee
    let lateFee = 0;
    if (isOverduePayment) {
      const daysLate = Math.max(0, Math.ceil(
        (paymentDateTime - new Date(installment.dueDate)) / (1000 * 60 * 60 * 24)
      ));
      lateFee = daysLate * (loanAccount.lateFeePerDay || 0);
      
      if (loanAccount.maxLateFee && lateFee > loanAccount.maxLateFee) {
        lateFee = loanAccount.maxLateFee;
      }
    }

    // Calculate new remaining balance
    const principalPayment = paymentAmount - installment.interestAmount;
    const newRemainingBalance = Math.max(0, 
      (installment.remainingBalance || loanAccount.outstandingBalance) - principalPayment
    );

    // Check if this is the final payment
    const pendingInstallments = await RepaymentSchedule.countDocuments({
      ACCT_NO,
      status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] }
    }).session(session);

    const isFinalPayment = pendingInstallments === 1 && 
                         newStatus === 'PAID' && 
                         newRemainingBalance <= 0;

    // Update installment
    const updatedInstallment = await RepaymentSchedule.findOneAndUpdate(
      { _id: installment._id },
      {
        $inc: { 
          amountPaid: paymentAmount,
          feesPaid: lateFee
        },
        $set: { 
          status: newStatus,
          paymentDate: paymentDateTime,
          paymentMethod,
          isEarlyPayment,
          isOverduePayment,
          lateFeeCharged: lateFee,
          remainingBalance: newRemainingBalance,
          ...(isFinalPayment ? { isFinalInstallment: true } : {})
        }
      },
      { new: true, session }
    );

    // Update customer account (debit)
    await CustomerAccount.updateOne(
      { _id: customerAccount._id },
      {
        $inc: {
          LEDGER_BAL: -paymentAmount,
          CLEARED_BAL: -paymentAmount,
          AVAILABLE_BALANCE: -paymentAmount
        },
        $push: {
          transactionHistory: {
            type: 'LOAN_REPAYMENT',
            amount: paymentAmount,
            date: new Date(),
            reference: `Loan payment for ${ACCT_NO}`,
            relatedInstallment: installment.installmentNo,
            paymentMethod
          }
        }
      },
      { session }
    );

    // Update loan account (credit)
    await LoanAccount.updateOne(
      { _id: loanAccount._id },
      {
        $inc: {
          principalPaid: principalPayment,
          interestPaid: installment.interestAmount,
          feesPaid: lateFee,
          outstandingBalance: -(paymentAmount + lateFee)
        },
        $set: {
          LAST_PAYMENT_DATE: paymentDateTime,
          LAST_PAYMENT_AMOUNT: paymentAmount,
          LAST_PAYMENT_METHOD: paymentMethod,
          ...(isFinalPayment ? { 
            LOAN_STATUS: 'CLOSED',
            CLOSURE_DATE: new Date()
          } : {})
        },
        $push: {
          paymentHistory: {
            date: paymentDateTime,
            amount: paymentAmount,
            installmentNo: installment.installmentNo,
            lateFee: lateFee,
            paymentMethod,
            isEarlyPayment,
            isOverduePayment
          }
        }
      },
      { session }
    );

    // Record transaction
    const transaction = await Transaction.create([{
      transactionType: 'LOAN_REPAYMENT',
      amount: paymentAmount,
      debitAccount: customerAccountNo,
      creditAccount: ACCT_NO,
      reference: referenceNumber || `PYMT-${Date.now()}`,
      description: description || `Payment for ${installment.paymentFrequency.toLowerCase()} installment #${installment.installmentNo}`,
      timestamp: paymentDateTime,
      status: 'COMPLETED',
      createdBy,
      details: {
        installmentId: installment._id,
        loanAccount: ACCT_NO,
        customerAccount: customerAccountNo,
        principalAmount: principalPayment,
        interestAmount: installment.interestAmount,
        lateFee: lateFee,
        paymentMethod,
        isEarlyPayment,
        isOverduePayment,
        paymentFrequency: installment.paymentFrequency,
        termCode: installment.termCode,
        remainingBalance: newRemainingBalance,
        isFinalPayment
      }
    }], { session });

    // If final payment, record closure transaction
    if (isFinalPayment) {
      await Transaction.create([{
        transactionType: 'LOAN_CLOSURE',
        amount: 0,
        debitAccount: ACCT_NO,
        creditAccount: ACCT_NO,
        reference: `CLOSURE-${Date.now()}`,
        description: `Loan account ${ACCT_NO} closed`,
        timestamp: new Date(),
        status: 'COMPLETED',
        createdBy,
        details: {
          loanAccount: ACCT_NO,
          closureType: 'NORMAL',
          totalPayments: loanAccount.paymentHistory?.length + 1,
          totalPrincipalPaid: loanAccount.principalPaid + principalPayment,
          totalInterestPaid: loanAccount.interestPaid + installment.interestAmount
        }
      }], { session });
    }

    await session.commitTransaction();

    res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        paymentAmount,
        lateFee,
        remainingAmount: amount - paymentAmount,
        nextInstallmentDue: pendingInstallments > 1,
        loanStatus: isFinalPayment ? 'CLOSED' : loanAccount.LOAN_STATUS,
        transactionId: transaction[0]._id,
        installmentDetails: {
          number: installment.installmentNo,
          status: newStatus,
          principalPaid: principalPayment,
          interestPaid: installment.interestAmount,
          remainingBalance: newRemainingBalance,
          isFinalInstallment: isFinalPayment
        }
      }
    });

  } catch (error) {
    await session.abortTransaction();
    console.error('Payment processing error:', error);
    
    res.status(error.status || 500).json({
      success: false,
      message: 'Payment processing failed',
      error: error.message,
      code: error.code || 'PAYMENT_ERROR',
      details: error.details || null
    });
  } finally {
    await session.endSession();
  }
};

export const getRepaymentSchedule = async (req, res) => {
    const { ACCT_NO } = req.params;

    if (!ACCT_NO) {
        return res.status(400).json({ message: 'Account number is required' });
    }

    try {
        console.log('Fetching repayment schedule for account number:', ACCT_NO);

        // Check if the loan account exists
        const loanAccount = await LoanAccount.findOne({ ACCT_NO: Number(ACCT_NO) });
        if (!loanAccount) {
            return res.status(404).json({ message: 'Loan account not found' });
        }

        const now = new Date();

        // Mark overdue repayments and trigger reclassification check
        const overdueUpdates = await RepaymentSchedule.updateMany(
            {
                ACCT_NO: String(ACCT_NO),
                dueDate: { $lt: now },
                status: 'Pending'
            },
            { $set: { status: 'Overdue' } }
        );

        // If any repayments were marked overdue, check for reclassification
        if (overdueUpdates.modifiedCount > 0) {
            await AutoReclassification.checkLoanDelinquency(ACCT_NO);
        }

        // Fetch repayment schedules
        const repaymentSchedules = await RepaymentSchedule.find({ ACCT_NO: String(ACCT_NO) });

        if (repaymentSchedules.length === 0) {
            return res.status(404).json({ message: 'No repayment schedule found' });
        }

        res.status(200).json({
            message: 'Repayment schedule retrieved successfully',
            repaymentSchedules,
        });
    } catch (error) {
        console.error('Error fetching repayment schedule:', error);
        res.status(500).json({ message: 'Error fetching repayment schedule', error: error.message });
    }
};