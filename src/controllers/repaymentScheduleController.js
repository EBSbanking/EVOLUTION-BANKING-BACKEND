import mongoose from 'mongoose';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';
import Transaction from '../models/Transaction.js';
import LoanProduct from '../models/LoanProduct.js';
import LoanRepayment from '../models/LoanRepayment.js';
import LoanEvent from '../models/LoanEvent.js';
import GLAccount from '../models/GLAccount.js';
import { generateTransactionIds } from '../utils/generateAccountNumber.js';
import repaymentUtils from '../utils/repaymentUtils.js'; // NEW: Import updated utility for generation/validation helpers

// Helper function to validate installment data - UPDATED for new schema structure
const validateInstallment = (installment) => {
  const requiredFields = [
    'dueDate', 'principal', 'interest', 
    'totalPayment', 'installmentNumber', 'remainingBalance'
  ];
  
  // FIXED: Use == null to allow 0 / Decimal128('0')
  const missingFields = requiredFields.filter(field => installment[field] == null);
  
  if (missingFields.length > 0) {
    throw {
      code: 'INVALID_INSTALLMENT',
      message: 'Installment data is incomplete',
      status: 400,
      details: { missingFields }
    };
  }

  if (installment.status === 'PAID' && parseFloat(installment.amountPaid?.toString() || '0') < parseFloat(installment.totalPayment.toString())) {
    throw {
      code: 'INVALID_PAYMENT_STATUS',
      message: 'Installment marked as PAID but amount paid is less than total payment',
      status: 400
    };
  }
};

// Add to repayment controller - Track payment servicing status
export const updateLoanServicingStatus = async (loanAccountNo, paymentDate, isOverdue = false) => {
  const session = await mongoose.startSession();
  
  try {
    await session.startTransaction();

    const loanAccount = await LoanAccount.findOne({ ACCT_NO: loanAccountNo }).session(session);
    if (!loanAccount) {
      throw new Error('Loan account not found');
    }

    let servicingStatus = 'SERVICED';
    
    if (isOverdue) {
      // Calculate days overdue
      const repaymentSchedule = await RepaymentSchedule.findOne({ ACCT_NO: loanAccountNo }).session(session);
      if (repaymentSchedule) {
        const overdueInstallments = repaymentSchedule.SCHEDULE.filter(inst => 
          new Date(inst.dueDate) < paymentDate && 
          (inst.status === 'PENDING' || inst.status === 'OVERDUE')
        );
        
        if (overdueInstallments.length > 0) {
          const maxDaysOverdue = Math.max(...overdueInstallments.map(inst => 
            Math.ceil((paymentDate - new Date(inst.dueDate)) / (1000 * 60 * 60 * 24))
          ));
          
          if (maxDaysOverdue > 90) servicingStatus = 'DELINQUENT';
          else if (maxDaysOverdue > 30) servicingStatus = 'NON_PERFORMING';
          else servicingStatus = 'UNSERVICED';
        }
      }
    }

    // Update loan account servicing status
    await LoanAccount.updateOne(
      { _id: loanAccount._id },
      { 
        $set: { 
          SERVICING_STATUS: servicingStatus,
          LAST_SERVICING_UPDATE: paymentDate
        }
      },
      { session }
    );

    // Create servicing event
    const event = new LoanEvent({
      ACCT_NO: loanAccountNo,
      eventType: 'SERVICING_UPDATE',
      status: servicingStatus,
      details: {
        trigger: isOverdue ? 'OVERDUE_PAYMENT' : 'ON_TIME_PAYMENT',
        paymentDate,
        previousStatus: loanAccount.SERVICING_STATUS
      },
      createdBy: 'SYSTEM'
    });

    await event.save({ session });
    await session.commitTransaction();

    return servicingStatus;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error updating loan servicing status:', { error: error.message });
    throw error;
  } finally {
    await session.endSession();
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

    // FIXED: Fetch loanAccount first, then others to avoid undefined PROD_ID
    const loanAccount = await LoanAccount.findOne({ ACCT_NO: String(ACCT_NO) }).session(session);
    if (!loanAccount) {
      throw {
        code: 'LOAN_NOT_FOUND',
        message: 'Loan account not found',
        status: 404
      };
    }

    const [customerAccount, loanProduct, repaymentSchedule] = await Promise.all([
      CustomerAccount.findOne({ ACCT_NO: customerAccountNo }).session(session),
      LoanProduct.findOne({ PROD_ID: loanAccount.PROD_ID }).session(session),
      RepaymentSchedule.findOne({ ACCT_NO: String(ACCT_NO) }).session(session)
    ]);

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

    if (!repaymentSchedule || !repaymentSchedule.SCHEDULE || repaymentSchedule.SCHEDULE.length === 0) {
      throw {
        code: 'NO_REPAYMENT_SCHEDULE',
        message: 'No repayment schedule found for this loan',
        status: 404
      };
    }

    // Find the next due installment - UPDATED for new schema structure
    const pendingInstallments = repaymentSchedule.SCHEDULE.filter(inst => 
      inst.status === 'PENDING' || inst.status === 'PARTIAL' || inst.status === 'OVERDUE'
    );

    if (pendingInstallments.length === 0) {
      throw {
        code: 'NO_DUE_INSTALLMENTS',
        message: 'No due installments found for payment',
        status: 400
      };
    }

    // Get the earliest due installment
    const installment = pendingInstallments.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0];

    // Validate installment structure - UPDATED for new schema structure
    validateInstallment({
      dueDate: installment.dueDate,
      principal: installment.principal,
      interest: installment.interest,
      totalPayment: installment.totalPayment,
      installmentNumber: installment.installmentNumber,
      remainingBalance: installment.remainingBalance,
      status: installment.status,
      amountPaid: installment.amountPaid
    });

    // Validate payment frequency - UPDATED: Use utility helper for consistency
    const expectedFrequency = repaymentUtils.getPaymentFrequency(loanAccount.TERM_CD);
    if (loanAccount.PAYMENT_FREQUENCY !== expectedFrequency) {
      throw {
        code: 'FREQUENCY_MISMATCH',
        message: `Payment frequency does not match loan term code (${repaymentUtils.getTermDescription(loanAccount.TERM_CD)})`,
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
      lateFee = daysLate * (parseFloat(loanAccount.lateFeePerDay?.toString()) || 0);
      if (loanAccount.maxLateFee && lateFee > parseFloat(loanAccount.maxLateFee.toString())) {
        lateFee = parseFloat(loanAccount.maxLateFee.toString());
      }
    }

    // Calculate new remaining balance
    const newRemainingBalance = Math.max(0, parseFloat(installment.remainingBalance?.toString()) - principalPayment);

    // Check if this is the final payment
    const remainingPendingInstallments = pendingInstallments.length - (newStatus === 'PAID' ? 1 : 0);
    const isFinalPayment = remainingPendingInstallments === 0 && newStatus === 'PAID' && newRemainingBalance <= 0;

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

    // Update installment in the SCHEDULE array - UPDATED for new schema structure
    const updatedRepaymentSchedule = await RepaymentSchedule.findOneAndUpdate(
      { 
        _id: repaymentSchedule._id,
        'SCHEDULE.installmentNumber': installment.installmentNumber 
      },
      {
        $inc: {
          'SCHEDULE.$.amountPaid': mongoose.Types.Decimal128.fromString(paymentAmount.toFixed(2)),  // FIXED: Use Decimal128
          'SCHEDULE.$.principalPaid': mongoose.Types.Decimal128.fromString(principalPayment.toFixed(2)),
          'SCHEDULE.$.interestPaid': mongoose.Types.Decimal128.fromString(interestPayment.toFixed(2)),
          'SCHEDULE.$.feesPaid': mongoose.Types.Decimal128.fromString(lateFee.toFixed(2))
        },
        $set: {
          'SCHEDULE.$.status': newStatus,
          'SCHEDULE.$.paymentDate': paymentDateTime,
          'SCHEDULE.$.paymentMethod': paymentMethod,
          'SCHEDULE.$.isEarlyPayment': isEarlyPayment,
          'SCHEDULE.$.isOverduePayment': isOverduePayment,
          'SCHEDULE.$.lateFeeCharged': mongoose.Types.Decimal128.fromString(lateFee.toFixed(2)),
          'SCHEDULE.$.remainingBalance': mongoose.Types.Decimal128.fromString(newRemainingBalance.toFixed(2)),
          ...(isFinalPayment ? { 'SCHEDULE.$.isFinalInstallment': true } : {})
        }
      },
      { new: true, session }
    );

    if (!updatedRepaymentSchedule) {
      throw {
        code: 'INSTALLMENT_UPDATE_FAILED',
        message: 'Failed to update installment',
        status: 500
      };
    }

    // Update CustomerAccount (debit)
    await CustomerAccount.updateOne(
      { ACCT_NO: customerAccountNo },
      {
        $inc: {
          BALANCE: mongoose.Types.Decimal128.fromString((-(paymentAmount + lateFee)).toFixed(2))  // FIXED: Decimal128
        },
        $push: {
          transactionHistory: {
            type: 'LOAN_REPAYMENT',
            amount: mongoose.Types.Decimal128.fromString(paymentAmount.toFixed(2)),
            date: paymentDateTime,
            reference: `Loan payment for ${ACCT_NO}`,
            relatedInstallment: installment.installmentNumber,
            paymentMethod,
            lateFee: mongoose.Types.Decimal128.fromString(lateFee.toFixed(2))
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
          principalPaid: mongoose.Types.Decimal128.fromString(principalPayment.toFixed(2)),  // FIXED: Decimal128
          interestPaid: mongoose.Types.Decimal128.fromString(interestPayment.toFixed(2)),
          feesPaid: mongoose.Types.Decimal128.fromString(lateFee.toFixed(2)),
          outstandingBalance: mongoose.Types.Decimal128.fromString((-(principalPayment + lateFee)).toFixed(2)),
          TOTAL_REPAID_AMOUNT: mongoose.Types.Decimal128.fromString(paymentAmount.toFixed(2))
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
            installmentNo: installment.installmentNumber,
            lateFee: mongoose.Types.Decimal128.fromString(lateFee.toFixed(2)),
            paymentMethod,
            isEarlyPayment,
            isOverduePayment
          }
        }
      },
      { session }
    );

    // NEW: Determine and update servicing status
    let servicingStatus = 'SERVICED'; // Default for successful payments
    if (isOverduePayment) {
      servicingStatus = 'UNSERVICED'; // Or 'DELINQUENT' if you have thresholds (e.g., >30 days late)
    } else if (isEarlyPayment) {
      servicingStatus = 'SERVICED'; // Explicitly reinforce
    }

    // Only update if status changed (to avoid spam)
    const currentLoanStatus = loanAccount.SERVICING_STATUS || 'SERVICED'; // Assume default
    if (servicingStatus !== currentLoanStatus) {
      await LoanAccount.updateOne(
        { _id: loanAccount._id },
        { $set: { SERVICING_STATUS: servicingStatus } },
        { session }
      );
    }

    // NEW: Generate/emit event
    const event = new LoanEvent({
      ACCT_NO: String(ACCT_NO),
      eventType: 'SERVICING_UPDATE',
      status: servicingStatus,
      installmentNumber: installment.installmentNumber,
      details: {
        paymentAmount,
        isEarlyPayment,
        isOverduePayment,
        lateFee,
        previousStatus: currentLoanStatus,
        trigger: 'PAYMENT_PROCESSED' // Or 'PAYMENT_OVERDUE' from cron
      },
      createdBy
    });

    await event.save({ session });

    // Update GLAccount (credit) - Fixed GL account update
    if (loanProduct.loanGLAccount) {
      await GLAccount.updateOne(
        { GL_ACCT_NO: loanProduct.loanGLAccount },
        { $inc: { BALANCE: mongoose.Types.Decimal128.fromString((paymentAmount + lateFee).toFixed(2)) } }, // Credit increases liability account
        { session }
      );
    }

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
      description: description || `Payment for ${repaymentUtils.getTermDescription(loanAccount.TERM_CD).toLowerCase()} installment #${installment.installmentNumber}`,  // UPDATED: Use utility for description
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
        paymentFrequency: repaymentSchedule.paymentFrequency,
        termCode: repaymentSchedule.TERM_TYPE,
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
        nextInstallmentDue: remainingPendingInstallments > 0,
        loanStatus: isFinalPayment ? 'CLOSED' : loanAccount.LOAN_STATUS,
        transactionId: transaction[0]._id,
        repaymentId: loanRepayment._id,
        installmentDetails: {
          number: installment.installmentNumber,
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

    // FIXED: Fetch loanAccount first
    const loanAccount = await LoanAccount.findOne({ ACCT_NO: String(ACCT_NO) }).session(session);
    if (!loanAccount) {
      throw {
        code: 'LOAN_NOT_FOUND',
        message: 'Loan account not found',
        status: 404
      };
    }

    const now = new Date();

    // Fetch repayment schedule - UPDATED for new schema structure
    const repaymentSchedule = await RepaymentSchedule.findOne({ ACCT_NO: String(ACCT_NO) }).session(session);

    if (!repaymentSchedule) {
      throw {
        code: 'NO_SCHEDULE_FOUND',
        message: 'No repayment schedule found',
        status: 404
      };
    }

    // Mark overdue repayments in the SCHEDULE array - UPDATED for new schema structure
    let overdueUpdates = 0;
    if (repaymentSchedule.SCHEDULE && repaymentSchedule.SCHEDULE.length > 0) {
      const overdueInstallments = repaymentSchedule.SCHEDULE.filter(inst => 
        new Date(inst.dueDate) < now && inst.status === 'PENDING'
      );

      if (overdueInstallments.length > 0) {
        const updatePromises = overdueInstallments.map(installment =>
          RepaymentSchedule.updateOne(
            {
              _id: repaymentSchedule._id,
              'SCHEDULE.installmentNumber': installment.installmentNumber  // FIXED: Consistent field name
            },
            {
              $set: { 'SCHEDULE.$.status': 'OVERDUE' }
            },
            { session }
          )
        );

        const results = await Promise.all(updatePromises);
        overdueUpdates = results.reduce((total, result) => total + result.modifiedCount, 0);
      }
    }

    // NEW: Update loan status to OVERDUE if there are overdue installments, and set NEXT_PAYMENT_DATE
    const updatedSchedule = await RepaymentSchedule.findOne({ ACCT_NO: String(ACCT_NO) }).session(session);
    const overdueOrPendingInstallments = updatedSchedule.SCHEDULE.filter(inst => 
      inst.status === 'PENDING' || inst.status === 'OVERDUE'
    );
    if (overdueOrPendingInstallments.length > 0) {
      // Set NEXT_PAYMENT_DATE to the earliest due date
      const nextDueDate = overdueOrPendingInstallments.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0].dueDate;
      await LoanAccount.updateOne(
        { _id: loanAccount._id },
        {
          NEXT_PAYMENT_DATE: nextDueDate,
          ...(overdueOrPendingInstallments.some(inst => inst.status === 'OVERDUE') ? { LOAN_STATUS: 'OVERDUE' } : {})
        },
        { session }
      );
    } else {
      // If all paid, set to CLOSED if not already
      await LoanAccount.updateOne(
        { _id: loanAccount._id },
        { LOAN_STATUS: 'CLOSED', NEXT_PAYMENT_DATE: null },
        { session }
      );
    }

    await session.commitTransaction();
    transactionCompleted = true;

    return res.status(200).json({
      success: true,
      message: 'Repayment schedule retrieved successfully',
      data: {
        overdueUpdates,
        repaymentSchedule: updatedSchedule,
        loanStatus: overdueOrPendingInstallments.length > 0 && overdueOrPendingInstallments.some(inst => inst.status === 'OVERDUE') ? 'OVERDUE' : 'ACTIVE',
        termDescription: repaymentUtils.getTermDescription(loanAccount.TERM_CD)  // NEW: Use utility for enriched response
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