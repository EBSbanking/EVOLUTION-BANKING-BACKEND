import mongoose from 'mongoose';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Transaction from '../models/Transaction.js';
import LoanProduct from '../models/LoanProduct.js'; // Added for Loan GL
import LoanRepayment from '../models/LoanRepayment.js'; // Added for repayment tracking
import { generateTransactionIds } from '../utils/generateAccountNumber.js'; // Added for transaction IDs

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
  let transactionCompleted = false;

  try {
    await session.startTransaction();

    const { ACCT_NO } = req.params;
    const {
      amount,
      paymentDate = new Date(),
      customerAccountNo,
      paymentMethod = 'BANK_TRANSFER',
      referenceNumber,
      description,
      createdBy = req.user?.id || 'SYSTEM'
    } = req.body;

    // Validate input
    if (!req.user || !req.user.id) {
      throw {
        code: 'UNAUTHORIZED',
        message: 'Unauthorized: User not found',
        status: 401
      };
    }

    const requiredFields = ['ACCT_NO', 'amount', 'customerAccountNo'];
    const missingFields = requiredFields.filter(field => !req.body[field] && !req.params[field]);
    if (missingFields.length > 0) {
      throw {
        code: 'MISSING_FIELDS',
        message: `Missing required fields: ${missingFields.join(', ')}`,
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

    const paymentDateTime = new Date(paymentDate);
    if (isNaN(paymentDateTime.getTime())) {
      throw {
        code: 'INVALID_DATE',
        message: 'Invalid payment date',
        status: 400
      };
    }

    // Find accounts and installment
    const [loanAccount, customerAccount, loanProduct, installment] = await Promise.all([
      LoanAccount.findOne({ ACCT_NO: String(ACCT_NO) }).session(session),
      CustomerAccount.findOne({ ACCT_NO: customerAccountNo }).session(session),
      LoanProduct.findOne({ PROD_ID: { $exists: true } }).session(session), // Assumes PROD_ID from loanAccount
      RepaymentSchedule.findOne({
        ACCT_NO: String(ACCT_NO),
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

    if (!loanProduct || !loanProduct.loanGLAccount) {
      throw {
        code: 'LOAN_GL_NOT_FOUND',
        message: 'Loan GL account not configured for product',
        status: 400
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
    validateInstallment({
      ACCT_NO: installment.ACCT_NO,
      dueDate: installment.dueDate,
      principal: installment.principal,
      interest: installment.interest,
      totalPayment: installment.totalPayment,
      installmentNo: installment.installmentNo,
      termCode: installment.termCode,
      paymentFrequency: installment.paymentFrequency
    });

    // Validate payment frequency
    if (loanAccount.PAYMENT_FREQUENCY !== installment.paymentFrequency) {
      throw {
        code: 'FREQUENCY_MISMATCH',
        message: 'Payment frequency does not match loan account frequency',
        status: 400
      };
    }

    // Check customer balance
    if (parseFloat(customerAccount.BALANCE?.toString() || 0) < amount) {
      throw {
        code: 'INSUFFICIENT_FUNDS',
        message: 'Customer account has insufficient funds',
        status: 400
      };
    }

    // Process payment
    const amountDue = parseFloat(installment.totalPayment.toString()) - parseFloat(installment.amountPaid?.toString() || '0');
    const paymentAmount = Math.min(amount, amountDue);
    const interestDue = parseFloat(installment.interest.toString()) - parseFloat(installment.interestPaid?.toString() || '0');
    const principalDue = parseFloat(installment.principal.toString()) - parseFloat(installment.principalPaid?.toString() || '0');

    let interestPayment = Math.min(paymentAmount, interestDue);
    let principalPayment = Math.min(paymentAmount - interestPayment, principalDue);
    const newStatus = (interestPayment + principalPayment) >= amountDue ? 'PAID' : 'PARTIAL';
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
    const newRemainingBalance = Math.max(0, parseFloat(installment.remainingBalance?.toString() || loanAccount.outstandingBalance.toString()) - principalPayment);

    // Check if this is the final payment
    const pendingInstallments = await RepaymentSchedule.countDocuments({
      ACCT_NO: String(ACCT_NO),
      status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] }
    }).session(session);

    const isFinalPayment = pendingInstallments === 1 && newStatus === 'PAID' && newRemainingBalance <= 0;

    // Create LoanRepayment record
    const loanRepayment = new LoanRepayment({
      ACCT_NO: String(ACCT_NO),
      amount: mongoose.Types.Decimal128.fromString(paymentAmount.toFixed(2)),
      date: paymentDateTime,
      CUST_ID: loanAccount.CUST_ID,
      REPAYMENT_HISTORY: [{
        amount: mongoose.Types.Decimal128.fromString(paymentAmount.toFixed(2)),
        date: paymentDateTime
      }]
    });

    // Update installment
    const updatedInstallment = await RepaymentSchedule.findOneAndUpdate(
      { _id: installment._id },
      {
        $inc: {
          amountPaid: paymentAmount,
          principalPaid: principalPayment,
          interestPaid: interestPayment,
          feesPaid: lateFee
        },
        $set: {
          status: newStatus,
          paymentDate: paymentDateTime,
          paymentMethod,
          isEarlyPayment,
          isOverduePayment,
          lateFeeCharged: lateFee,
          remainingBalance: mongoose.Types.Decimal128.fromString(newRemainingBalance.toFixed(2)),
          ...(isFinalPayment ? { isFinalInstallment: true } : {})
        }
      },
      { new: true, session }
    );

    // Update CustomerAccount (debit)
    await CustomerAccount.updateOne(
      { ACCT_NO: customerAccountNo },
      {
        $inc: {
          BALANCE: -(paymentAmount + lateFee)
        },
        $push: {
          transactionHistory: {
            type: 'LOAN_REPAYMENT',
            amount: paymentAmount,
            date: paymentDateTime,
            reference: `Loan payment for ${ACCT_NO}`,
            relatedInstallment: installment.installmentNo,
            paymentMethod,
            lateFee
          }
        }
      },
      { session }
    );

    // Update LoanAccount
    await LoanAccount.updateOne(
      { _id: loanAccount._id },
      {
        $inc: {
          principalPaid: principalPayment,
          interestPaid: interestPayment,
          feesPaid: lateFee,
          outstandingBalance: -(paymentAmount + lateFee),
          TOTAL_REPAID_AMOUNT: paymentAmount,
          TOTAL_REPAID_INTEREST: interestPayment
        },
        $set: {
          LAST_PAYMENT_DATE: paymentDateTime,
          LAST_PAYMENT_AMOUNT: mongoose.Types.Decimal128.fromString(paymentAmount.toFixed(2)),
          LAST_PAYMENT_METHOD: paymentMethod,
          ...(isFinalPayment ? { 
            LOAN_STATUS: 'CLOSED',
            CLOSURE_DATE: paymentDateTime
          } : {})
        },
        $push: {
          paymentHistory: {
            date: paymentDateTime,
            amount: mongoose.Types.Decimal128.fromString(paymentAmount.toFixed(2)),
            installmentNo: installment.installmentNo,
            lateFee,
            paymentMethod,
            isEarlyPayment,
            isOverduePayment
          }
        }
      },
      { session }
    );

    // Update GLAccount (credit)
    await GLAccount.updateOne(
      { GL_ACCT_NO: loanProduct.loanGLAccount },
      { $inc: { BALANCE: -(paymentAmount + lateFee) } }, // Credit decreases balance
      { session }
    );

    // Record transaction
    const TRANSACTION_IDS = generateTransactionIds();
    const transaction = await Transaction.create([{
      TRANSACTION_ID: TRANSACTION_IDS.TRANSACTION_ID,
      EVENT_ID: TRANSACTION_IDS.EVENT_ID,
      JOURNAL_ID: TRANSACTION_IDS.JOURNAL_ID,
      TRAN_JOURNAL_ID: TRANSACTION_IDS.TRAN_JOURNAL_ID,
      transactionType: 'LOAN_REPAYMENT',
      amount: mongoose.Types.Decimal128.fromString(paymentAmount.toFixed(2)),
      debitAccount: customerAccountNo,
      creditAccount: loanProduct.loanGLAccount,
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
        interestAmount: interestPayment,
        lateFee,
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
        TRANSACTION_ID: generateTransactionIds().TRANSACTION_ID,
        transactionType: 'LOAN_CLOSURE',
        amount: mongoose.Types.Decimal128.fromString('0.00'),
        debitAccount: ACCT_NO,
        creditAccount: ACCT_NO,
        reference: `CLOSURE-${Date.now()}`,
        description: `Loan account ${ACCT_NO} closed`,
        timestamp: paymentDateTime,
        status: 'COMPLETED',
        createdBy,
        details: {
          loanAccount: ACCT_NO,
          closureType: 'NORMAL',
          totalPayments: (loanAccount.paymentHistory?.length || 0) + 1,
          totalPrincipalPaid: parseFloat(loanAccount.principalPaid?.toString() || '0') + principalPayment,
          totalInterestPaid: parseFloat(loanAccount.interestPaid?.toString() || '0') + interestPayment
        }
      }], { session });
    }

    // Save LoanRepayment
    await loanRepayment.save({ session });

    await session.commitTransaction();
    transactionCompleted = true;

    return res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        paymentAmount,
        lateFee,
        remainingAmount: amount - paymentAmount,
        nextInstallmentDue: pendingInstallments > 1,
        loanStatus: isFinalPayment ? 'CLOSED' : loanAccount.LOAN_STATUS,
        transactionId: transaction[0]._id,
        repaymentId: loanRepayment._id,
        installmentDetails: {
          number: installment.installmentNo,
          status: newStatus,
          principalPaid: principalPayment,
          interestPaid: interestPayment,
          remainingBalance: newRemainingBalance,
          isFinalInstallment: isFinalPayment
        }
      }
    });
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    console.error('Payment processing error:', error);
    return res.status(error.status || 500).json({
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
  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    await session.startTransaction();

    const { ACCT_NO } = req.params;

    if (!ACCT_NO) {
      throw {
        code: 'MISSING_ACCT_NO',
        message: 'Account number is required',
        status: 400
      };
    }

    // Check if the loan account exists
    const loanAccount = await LoanAccount.findOne({ ACCT_NO: String(ACCT_NO) }).session(session);
    if (!loanAccount) {
      throw {
        code: 'LOAN_NOT_FOUND',
        message: 'Loan account not found',
        status: 404
      };
    }

    const now = new Date();

    // Mark overdue repayments
    const overdueUpdates = await RepaymentSchedule.updateMany(
      {
        ACCT_NO: String(ACCT_NO),
        dueDate: { $lt: now },
        status: 'PENDING'
      },
      { $set: { status: 'OVERDUE' } },
      { session }
    );

    // Fetch repayment schedules
    const repaymentSchedules = await RepaymentSchedule.find({ ACCT_NO: String(ACCT_NO) }).session(session);

    if (repaymentSchedules.length === 0) {
      throw {
        code: 'NO_SCHEDULE_FOUND',
        message: 'No repayment schedule found',
        status: 404
      };
    }

    await session.commitTransaction();
    transactionCompleted = true;

    return res.status(200).json({
      success: true,
      message: 'Repayment schedule retrieved successfully',
      data: {
        overdueUpdates: overdueUpdates.modifiedCount,
        repaymentSchedules
      }
    });
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    console.error('Error fetching repayment schedule:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: 'Error fetching repayment schedule',
      error: error.message,
      code: error.code || 'INTERNAL_SERVER_ERROR'
    });
  } finally {
    await session.endSession();
  }
};