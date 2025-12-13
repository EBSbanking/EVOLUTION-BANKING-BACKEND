import mongoose from 'mongoose';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';
import LoanRepayment from '../models/LoanRepayment.js';
import Transaction from '../models/Transaction.js';
import GroupLoan from '../models/GroupLoan.js';
import Collection from '../models/Collection.js';
import LoanPortfolio from '../models/LoanPortfolio.js';
import LoanProduct from '../models/LoanProduct.js';
import LoanEvent from '../models/LoanEvent.js';
import GLAccount from '../models/GLAccount.js';
import repaymentUtils from '../utils/repaymentUtils.js';

// Helper function to convert to Decimal128
const toDecimal128 = (value) => mongoose.Types.Decimal128.fromString(value.toFixed(2).toString());

// Helper function to generate transaction IDs
const generateTransactionIds = () => {
  const timestamp = Date.now();
  return {
    TRANSACTION_ID: `TXN-${timestamp}-${Math.floor(Math.random() * 1000)}`,
    EVENT_ID: `EVT-${timestamp}-${Math.floor(Math.random() * 1000)}`,
    TRAN_JOURNAL_ID: `JRN-${timestamp}-${Math.floor(Math.random() * 1000)}`,
    JOURNAL_ID: `JID-${timestamp}-${Math.floor(Math.random() * 1000)}`,
    transactionId: `TXID-${timestamp}-${Math.floor(Math.random() * 1000)}`
  };
};

// Helper function to validate installment data
const validateInstallment = (installment) => {
  const requiredFields = [
    'dueDate', 'principal', 'interest',
    'totalPayment', 'installmentNumber', 'remainingBalance'
  ];
 
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
    console.error('Error updating loan servicing status:', { error: error.message });
    throw error;
  } finally {
    await session.endSession();
  }
};

// Helper function to validate payment
export const validatePayment = (req) => {
  const { amount, customerAccountNo } = req.body;
  const { ACCT_NO } = req.params;
  if (!ACCT_NO) {
    throw {
      code: 'MISSING_FIELDS',
      message: 'Loan account number (ACCT_NO) is required',
      status: 400
    };
  }
  if (!amount || isNaN(amount) || amount <= 0) {
    throw {
      code: 'INVALID_AMOUNT',
      message: 'Payment amount must be a valid positive number',
      status: 400
    };
  }
  if (!customerAccountNo) {
    throw {
      code: 'MISSING_FIELDS',
      message: 'Customer account number is required',
      status: 400
    };
  }
  return {
    ACCT_NO: String(ACCT_NO),
    amount: parseFloat(amount),
    customerAccountNo: String(customerAccountNo)
  };
};

// Main repayment function with installment logic
export const recordPayment = async (req, res) => {
  console.log('=== STARTING REPAYMENT ===');
 
  const session = await mongoose.startSession();
 
  try {
    await session.startTransaction();
   
    // Get ACCT_NO from URL parameters
    const { ACCT_NO } = req.params;
   
    // Get other data from request body
    const { amount, customerAccountNo, paymentMethod = 'CASH_DEPOSIT',
            referenceNumber, description, paymentDate = new Date(), createdBy = 'SYSTEM' } = req.body;
   
    console.log('Payment data:', {
      ACCT_NO, // From params
      amount,
      customerAccountNo,
      paymentMethod,
      paymentDate: new Date(paymentDate)
    });
    // Validate all required fields
    if (!ACCT_NO) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Loan account number (ACCT_NO) is required in URL'
      });
    }
    if (!amount || isNaN(amount) || amount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Valid payment amount is required'
      });
    }
    if (!customerAccountNo) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Customer account number is required'
      });
    }
    // 1. Find Loan Account
    const loanAccount = await LoanAccount.findOne({
      ACCT_NO: String(ACCT_NO)
    }).session(session);
   
    if (!loanAccount) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Loan account not found'
      });
    }
    // 2. Check loan status
    const validStatuses = ['ACTIVE', 'DISBURSED', 'ONGOING'];
    if (!validStatuses.includes(loanAccount.LOAN_STATUS?.toUpperCase())) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Loan not active. Status: ${loanAccount.LOAN_STATUS}`
      });
    }
    // 3. Find Customer Account
    const customerAccount = await CustomerAccount.findOne({
      account_number: String(customerAccountNo)
    }).session(session);
   
    if (!customerAccount) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Customer account not found'
      });
    }
    // 4. Check balance
    let customerBalance = 0;
    if (customerAccount.ledger_balance !== undefined) {
      customerBalance = parseFloat(customerAccount.ledger_balance.toString());
    } else if (customerAccount.available_balance !== undefined) {
      customerBalance = parseFloat(customerAccount.available_balance.toString());
    }
   
    if (customerBalance < amount) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Insufficient funds. Available: ${customerBalance}`
      });
    }
    // 5. Repayment Logic - Handles multiple installments if schedule exists
    const repaymentSchedule = await RepaymentSchedule.findOne({ ACCT_NO: String(ACCT_NO) }).session(session);
    let totalPrincipalPaid = 0;
    let totalInterestPaid = 0;
    let isFinalPayment = false;
    let currentOutstanding = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL?.toString() || '0');
    let updatedSchedule = null;
    let hasSchedule = false;

    if (repaymentSchedule && repaymentSchedule.SCHEDULE && repaymentSchedule.SCHEDULE.length > 0) {
      hasSchedule = true;
      let schedule = [...repaymentSchedule.SCHEDULE]; // Copy array
      // Set overdue status for past due installments
      const now = new Date(paymentDate);
      schedule = schedule.map(inst => {
        if (inst.status === 'PENDING' && new Date(inst.dueDate) < now) {
          return { ...inst, status: 'OVERDUE' };
        }
        return inst;
      });
      // Sort by dueDate ascending
      schedule.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
      let remainingAmount = amount;
      updatedSchedule = [];
      for (let inst of schedule) {
        if (remainingAmount <= 0) {
          updatedSchedule.push(inst);
          continue;
        }
        if (inst.status === 'PAID') {
          updatedSchedule.push(inst);
          continue;
        }
        let remainingDue = parseFloat(inst.totalPayment.toString()) - parseFloat(inst.amountPaid?.toString() || '0');
        if (remainingDue <= 0) {
          updatedSchedule.push(inst);
          continue;
        }
        let payThisInst = Math.min(remainingAmount, remainingDue);
        // Apply payment: interest first, then principal
        let remainingInterest = parseFloat(inst.interest.toString()) - parseFloat(inst.interestPaid?.toString() || '0');
        let remainingPrin = parseFloat(inst.principal.toString()) - parseFloat(inst.principalPaid?.toString() || '0');
        let interestThis = Math.min(payThisInst, remainingInterest);
        let prinThis = 0;
        if (interestThis < payThisInst) {
          let remainingAfterInterest = payThisInst - interestThis;
          prinThis = Math.min(remainingAfterInterest, remainingPrin);
        }
        let newAmountPaid = parseFloat(inst.amountPaid?.toString() || '0') + interestThis + prinThis;
        let newInterestPaid = parseFloat(inst.interestPaid?.toString() || '0') + interestThis;
        let newPrincipalPaid = parseFloat(inst.principalPaid?.toString() || '0') + prinThis;
        let newStatus = newAmountPaid >= parseFloat(inst.totalPayment.toString()) ? 'PAID' : (newAmountPaid > 0 ? 'PARTIAL' : inst.status);
        // Update remaining balance (cumulative principal remaining)
        let newRemainingBalance = parseFloat(inst.remainingBalance?.toString() || currentOutstanding) - prinThis;
        const updatedInst = {
          ...inst,
          amountPaid: toDecimal128(newAmountPaid),
          interestPaid: toDecimal128(newInterestPaid),
          principalPaid: toDecimal128(newPrincipalPaid),
          status: newStatus,
          remainingBalance: toDecimal128(Math.max(0, newRemainingBalance))
        };
        updatedSchedule.push(updatedInst);
        totalInterestPaid += interestThis;
        totalPrincipalPaid += prinThis;
        remainingAmount -= (interestThis + prinThis);
        // Check if final payment
        if (newStatus === 'PAID') {
          const allPaid = updatedSchedule.every(i => i.status === 'PAID');
          if (allPaid) isFinalPayment = true;
        }
      }
      // Update schedule in DB
      await RepaymentSchedule.updateOne(
        { _id: repaymentSchedule._id },
        { $set: { SCHEDULE: updatedSchedule } },
        { session }
      );
      currentOutstanding = Math.max(0, currentOutstanding - totalPrincipalPaid);
    } else {
      // Fallback to simple logic (treat as principal)
      totalPrincipalPaid = amount;
      currentOutstanding = Math.max(0, currentOutstanding - amount);
      isFinalPayment = currentOutstanding <= 0;
    }

    const newOutstanding = currentOutstanding;
   
    // Update Loan Account
    await LoanAccount.updateOne(
      { _id: loanAccount._id },
      {
        $inc: {
          OUTSTANDING_PRINCIPAL: toDecimal128(-totalPrincipalPaid),
          TOTAL_REPAID_AMOUNT: toDecimal128(amount)
        },
        $set: {
          LAST_PAYMENT_DATE: new Date(paymentDate),
          LAST_PAYMENT_AMOUNT: toDecimal128(amount),
          LAST_PAYMENT_METHOD: paymentMethod,
          ...(isFinalPayment ? {
            LOAN_STATUS: 'CLOSED',
            CLOSURE_DATE: new Date(paymentDate)
          } : {})
        }
      },
      { session }
    );
    // Update Customer Account
    const updateFields = {};
    if (customerAccount.ledger_balance !== undefined) {
      updateFields.ledger_balance = toDecimal128(customerBalance - amount);
    }
    if (customerAccount.available_balance !== undefined) {
      updateFields.available_balance = toDecimal128(customerBalance - amount);
    }
    await CustomerAccount.updateOne(
      { _id: customerAccount._id },
      {
        $set: updateFields
      },
      { session }
    );
    // Update servicing status
    const isOverduePayment = hasSchedule && updatedSchedule.some(inst => inst.status === 'OVERDUE' && parseFloat(inst.amountPaid?.toString() || '0') < parseFloat(inst.totalPayment.toString()));
    await updateLoanServicingStatus(ACCT_NO, new Date(paymentDate), isOverduePayment);
    // Create LoanRepayment record
    const repayment = new LoanRepayment({
      ACCT_NO: String(ACCT_NO),
      amount: toDecimal128(amount),
      date: new Date(paymentDate),
      CUST_ID: String(loanAccount.CUST_ID),
      customerAccountNo: String(customerAccountNo),
      paymentMethod,
      reference: referenceNumber || `REPAY-${Date.now()}`,
      description: description || 'Loan repayment',
      status: 'COMPLETED',
      loanAccountId: loanAccount._id,
      customerAccountId: customerAccount._id,
      principalPaid: toDecimal128(totalPrincipalPaid),
      interestPaid: toDecimal128(totalInterestPaid),
      details: {
        previousBalance: customerBalance,
        newBalance: customerBalance - amount,
        previousOutstanding: currentOutstanding + totalPrincipalPaid,
        newOutstanding,
        isFinalPayment,
        hasSchedule,
        installmentsUpdated: hasSchedule ? updatedSchedule.filter(i => i.status !== 'PENDING').length : 0
      }
    });
    await repayment.save({ session });
    // 6. Create Transaction record
    // Get required data for Transaction
    const customerName = customerAccount.account_name || customerAccount.ACCT_NM ||
                         customerAccount.customer_name || 'Customer';
    const businessUnitId = loanAccount.BU_ID || customerAccount.BU_ID || 1;
    const accountId = loanAccount.ACCT_ID || customerAccount.ACCT_ID || 'DEFAULT_ACCT';
    // Generate transaction IDs
    const TRANSACTION_IDS = generateTransactionIds();
   
    // Create transaction record with all required fields
    await Transaction.create([{
      // Required fields from Transaction schema
      TRANSACTION_ID: TRANSACTION_IDS.TRANSACTION_ID,
      EVENT_ID: TRANSACTION_IDS.EVENT_ID,
      TRAN_JOURNAL_ID: TRANSACTION_IDS.TRAN_JOURNAL_ID,
      REFERENCE: referenceNumber || `REPAY-${Date.now()}`,
      ACCT_NO: String(customerAccountNo),
      ACCT_ID: accountId,
      BU_ID: businessUnitId,
      CUST_ID: String(loanAccount.CUST_ID),
      ACCT_NM: customerName,
      AMOUNT: toDecimal128(amount),
      TRANSACTION_TYPE: 'LOAN_REPAYMENT',
      TRANSACTIONDATE: new Date(paymentDate),
      transactionDirection: 'DEBIT',
      description: description || `Loan repayment for ${ACCT_NO}`,
      currency: 'NGN',
      createdBy: createdBy,
      status: 'COMPLETED',
     
      // Optional fields
      transactionId: TRANSACTION_IDS.transactionId,
      JOURNAL_ID: TRANSACTION_IDS.JOURNAL_ID,
     
      // Additional metadata
      metadata: {
        loanAccount: ACCT_NO,
        customerAccount: customerAccountNo,
        paymentMethod,
        isFinalPayment,
        hasSchedule,
        principalPaid: totalPrincipalPaid,
        interestPaid: totalInterestPaid,
        repaymentId: repayment._id
      }
    }], { session });
    console.log('Transaction record created successfully');
    // Update loan portfolio
    await updateLoanPortfolio(loanAccount, amount, totalInterestPaid > 0, true, session);
    await session.commitTransaction();
   
    console.log('=== REPAYMENT SUCCESSFUL ===');
   
    return res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        repaymentId: repayment._id,
        loanAccount: {
          ACCT_NO: loanAccount.ACCT_NO,
          newOutstanding,
          previousOutstanding: currentOutstanding + totalPrincipalPaid,
          loanStatus: isFinalPayment ? 'CLOSED' : loanAccount.LOAN_STATUS
        },
        customerAccount: {
          accountNumber: customerAccount.account_number,
          newBalance: customerBalance - amount
        },
        paymentBreakdown: {
          totalAmount: amount,
          principalPaid: totalPrincipalPaid,
          interestPaid: totalInterestPaid,
          hasSchedule,
          isFinalPayment
        }
      }
    });
  } catch (error) {
    console.error('=== REPAYMENT ERROR ===', error);
   
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
   
    return res.status(500).json({
      success: false,
      message: 'Payment processing failed',
      error: error.message,
      code: 'PAYMENT_ERROR'
    });
  } finally {
    await session.endSession();
  }
};

// Simple repayment without transaction or schedule (legacy)
export const recordPaymentSimple = async (req, res) => {
  console.log('=== STARTING SIMPLE REPAYMENT (NO TRANSACTION) ===');
 
  try {
    const { ACCT_NO } = req.params;
    const { amount, customerAccountNo, paymentMethod = 'CASH_DEPOSIT',
            referenceNumber, description, paymentDate = new Date(), createdBy = 'SYSTEM' } = req.body;
   
    console.log('Payment data:', { ACCT_NO, amount, customerAccountNo, paymentMethod });
    // Validations
    if (!ACCT_NO) {
      return res.status(400).json({
        success: false,
        message: 'Loan account number (ACCT_NO) is required'
      });
    }
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid payment amount is required'
      });
    }
    if (!customerAccountNo) {
      return res.status(400).json({
        success: false,
        message: 'Customer account number is required'
      });
    }
    // Find accounts
    const loanAccount = await LoanAccount.findOne({ ACCT_NO: String(ACCT_NO) });
    const customerAccount = await CustomerAccount.findOne({
      account_number: String(customerAccountNo)
    });
    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: 'Loan account not found'
      });
    }
    if (!customerAccount) {
      return res.status(404).json({
        success: false,
        message: 'Customer account not found'
      });
    }
    // Check loan status
    const validStatuses = ['ACTIVE', 'DISBURSED', 'ONGOING'];
    if (!validStatuses.includes(loanAccount.LOAN_STATUS?.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: `Loan not active. Status: ${loanAccount.LOAN_STATUS}`
      });
    }
    // Check balance
    let customerBalance = 0;
    if (customerAccount.ledger_balance !== undefined) {
      customerBalance = parseFloat(customerAccount.ledger_balance.toString());
    } else if (customerAccount.available_balance !== undefined) {
      customerBalance = parseFloat(customerAccount.available_balance.toString());
    }
    if (customerBalance < amount) {
      return res.status(400).json({
        success: false,
        message: `Insufficient funds. Available: ${customerBalance}`
      });
    }
    // Calculate new balances
    const currentOutstanding = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL?.toString() || '0');
    const newOutstanding = Math.max(0, currentOutstanding - amount);
    const isFinalPayment = newOutstanding <= 0;
    // Update loan account
    await LoanAccount.updateOne(
      { _id: loanAccount._id },
      {
        $inc: {
          OUTSTANDING_PRINCIPAL: toDecimal128(-amount),
          TOTAL_REPAID_AMOUNT: toDecimal128(amount)
        },
        $set: {
          LAST_PAYMENT_DATE: new Date(paymentDate),
          LAST_PAYMENT_AMOUNT: toDecimal128(amount),
          LAST_PAYMENT_METHOD: paymentMethod,
          ...(isFinalPayment ? {
            LOAN_STATUS: 'CLOSED',
            CLOSURE_DATE: new Date(paymentDate)
          } : {})
        }
      }
    );
    // Update customer account
    const updateFields = {};
    if (customerAccount.ledger_balance !== undefined) {
      updateFields.ledger_balance = toDecimal128(customerBalance - amount);
    }
    if (customerAccount.available_balance !== undefined) {
      updateFields.available_balance = toDecimal128(customerBalance - amount);
    }
    await CustomerAccount.updateOne(
      { _id: customerAccount._id },
      {
        $set: updateFields
      }
    );
    // Create repayment record
    const repayment = new LoanRepayment({
      ACCT_NO: String(ACCT_NO),
      amount: toDecimal128(amount),
      date: new Date(paymentDate),
      CUST_ID: String(loanAccount.CUST_ID),
      customerAccountNo: String(customerAccountNo),
      paymentMethod,
      reference: referenceNumber || `REPAY-${Date.now()}`,
      description: description || 'Loan repayment',
      status: 'COMPLETED',
      loanAccountId: loanAccount._id,
      customerAccountId: customerAccount._id,
      details: {
        previousBalance: customerBalance,
        newBalance: customerBalance - amount,
        previousOutstanding: currentOutstanding,
        newOutstanding: newOutstanding,
        isFinalPayment
      }
    });
    await repayment.save();
    // Update loan portfolio
    await updateLoanPortfolio(loanAccount, amount, false, true);
    console.log('=== REPAYMENT SUCCESSFUL (SIMPLE) ===');
   
    return res.status(200).json({
      success: true,
      message: 'Payment processed successfully',
      data: {
        repaymentId: repayment._id,
        loanAccount: {
          ACCT_NO: loanAccount.ACCT_NO,
          newOutstanding,
          previousOutstanding: currentOutstanding,
          loanStatus: isFinalPayment ? 'CLOSED' : loanAccount.LOAN_STATUS
        },
        customerAccount: {
          accountNumber: customerAccount.account_number,
          newBalance: customerBalance - amount
        },
        isFinalPayment
      }
    });
  } catch (error) {
    console.error('=== REPAYMENT ERROR ===', error);
    return res.status(500).json({
      success: false,
      message: 'Payment processing failed',
      error: error.message,
      code: 'PAYMENT_ERROR'
    });
  }
};

// Helper function to update loan portfolio
export const updateLoanPortfolio = async (loanAccount, amount, isInterest = false, isRepayment = true, session = null) => {
  try {
    const currentDate = new Date();
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();
   
    // Get product info from loan account
    const productId = loanAccount.PROD_ID || 1;
    const productCode = loanAccount.PRODUCT_CODE || 'DEFAULT';
    const productName = loanAccount.PRODUCT_NAME || 'General Loan';
    const productType = loanAccount.PRODUCT_TYPE || 'GENERAL_LOAN';
    const branchId = loanAccount.BRANCH_ID || '001';
   
    // Find existing portfolio or create new
    const query = {
      BRANCH_ID: branchId,
      PROD_ID: productId,
      YEAR: year,
      MONTH: month
    };
   
    const updateData = {
      $set: {
        PRODUCT_CODE: productCode,
        PRODUCT_NAME: productName,
        PRODUCT_TYPE: productType,
        CURRENCY: 'NGN',
        UPDATED_DATE: currentDate,
        UPDATED_BY: 'system'
      }
    };
   
    if (isRepayment) {
      // Update for repayments
      updateData.$inc = {
        TOTAL_REPAYMENTS: 1,
        TOTAL_RECOVERED: amount,
        TOTAL_INTEREST_RECEIVED: isInterest ? amount : 0,
        TOTAL_FEES_RECEIVED: 0
      };
    } else {
      // Update for disbursements
      updateData.$inc = {
        TOTAL_DISBURSED: amount,
        TOTAL_PRINCIPAL: amount,
        OUTSTANDING_PRINCIPAL: amount,
        NUMBER_OF_LOANS: 1,
        ACTIVE_LOANS: 1,
        DISBURSEMENT_COUNT: 1
      };
    }
   
    const options = {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
      session: session
    };
   
    await LoanPortfolio.findOneAndUpdate(query, updateData, options);
   
    console.log(`Loan portfolio updated for ${branchId}-${productCode} ${year}-${month}`);
   
  } catch (error) {
    console.error('Error updating loan portfolio:', error);
    // Don't throw error - portfolio update shouldn't fail the main transaction
  }
};

// ============================
// BULK REPAYMENT CONTROLLER
// ============================
// Individual payment processor (updated to use installment logic where possible)
const processSinglePayment = async (paymentData, session) => {
  const {
    loanAccountNo,
    amount,
    customerAccountNo,
    paymentMethod = 'CASH_DEPOSIT',
    referenceNumber,
    description,
    paymentDate = new Date(),
    createdBy = 'SYSTEM'
  } = paymentData;
  // Note: For bulk, we'll use simple logic to avoid complexity; extend if needed
  // Validate required fields
  if (!loanAccountNo) {
    throw new Error('Loan account number is required');
  }
  if (!amount || isNaN(amount) || amount <= 0) {
    throw new Error('Valid payment amount is required');
  }
  if (!customerAccountNo) {
    throw new Error('Customer account number is required');
  }
  // 1. Find Loan Account
  const loanAccount = await LoanAccount.findOne({
    ACCT_NO: String(loanAccountNo)
  }).session(session);
  if (!loanAccount) {
    throw new Error('Loan account not found');
  }
  // 2. Check loan status
  const validStatuses = ['ACTIVE', 'DISBURSED', 'ONGOING'];
  if (!validStatuses.includes(loanAccount.LOAN_STATUS?.toUpperCase())) {
    throw new Error(`Loan not active. Status: ${loanAccount.LOAN_STATUS}`);
  }
  // 3. Find Customer Account
  const customerAccount = await CustomerAccount.findOne({
    account_number: String(customerAccountNo)
  }).session(session);
  if (!customerAccount) {
    throw new Error('Customer account not found');
  }
  // 4. Check balance
  let customerBalance = 0;
  if (customerAccount.ledger_balance !== undefined) {
    customerBalance = parseFloat(customerAccount.ledger_balance.toString());
  } else if (customerAccount.available_balance !== undefined) {
    customerBalance = parseFloat(customerAccount.available_balance.toString());
  }
  if (customerBalance < amount) {
    throw new Error(`Insufficient funds. Available: ${customerBalance}`);
  }
  // 5. Simple Repayment Logic (extend to installments if needed)
  const currentOutstanding = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL?.toString() || '0');
  const newOutstanding = Math.max(0, currentOutstanding - amount);
  const isFinalPayment = newOutstanding <= 0;
  // Update Loan Account
  await LoanAccount.updateOne(
    { _id: loanAccount._id },
    {
      $inc: {
        OUTSTANDING_PRINCIPAL: toDecimal128(-amount),
        TOTAL_REPAID_AMOUNT: toDecimal128(amount)
      },
      $set: {
        LAST_PAYMENT_DATE: new Date(paymentDate),
        LAST_PAYMENT_AMOUNT: toDecimal128(amount),
        LAST_PAYMENT_METHOD: paymentMethod,
        ...(isFinalPayment ? {
          LOAN_STATUS: 'CLOSED',
          CLOSURE_DATE: new Date(paymentDate)
        } : {})
      }
    },
    { session }
  );
  // Update Customer Account
  const updateFields = {};
  if (customerAccount.ledger_balance !== undefined) {
    updateFields.ledger_balance = toDecimal128(customerBalance - amount);
  }
  if (customerAccount.available_balance !== undefined) {
    updateFields.available_balance = toDecimal128(customerBalance - amount);
  }
  await CustomerAccount.updateOne(
    { _id: customerAccount._id },
    {
      $set: updateFields
    },
    { session }
  );
  // Create LoanRepayment record
  const repayment = new LoanRepayment({
    ACCT_NO: String(loanAccountNo),
    amount: toDecimal128(amount),
    date: new Date(paymentDate),
    CUST_ID: String(loanAccount.CUST_ID),
    customerAccountNo: String(customerAccountNo),
    paymentMethod,
    reference: referenceNumber || `REPAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    description: description || 'Loan repayment',
    status: 'COMPLETED',
    loanAccountId: loanAccount._id,
    customerAccountId: customerAccount._id,
    details: {
      previousBalance: customerBalance,
      newBalance: customerBalance - amount,
      previousOutstanding: currentOutstanding,
      newOutstanding: newOutstanding,
      isFinalPayment
    }
  });
  await repayment.save({ session });
  // 6. Create Transaction record
  const customerName = customerAccount.account_name || customerAccount.ACCT_NM ||
    customerAccount.customer_name || 'Customer';
  const businessUnitId = loanAccount.BU_ID || customerAccount.BU_ID || 1;
  const accountId = loanAccount.ACCT_ID || customerAccount.ACCT_ID || 'DEFAULT_ACCT';
  const TRANSACTION_IDS = generateTransactionIds();
  await Transaction.create([{
    TRANSACTION_ID: TRANSACTION_IDS.TRANSACTION_ID,
    EVENT_ID: TRANSACTION_IDS.EVENT_ID,
    TRAN_JOURNAL_ID: TRANSACTION_IDS.TRAN_JOURNAL_ID,
    REFERENCE: referenceNumber || `REPAY-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    ACCT_NO: String(customerAccountNo),
    ACCT_ID: accountId,
    BU_ID: businessUnitId,
    CUST_ID: String(loanAccount.CUST_ID),
    ACCT_NM: customerName,
    AMOUNT: toDecimal128(amount),
    TRANSACTION_TYPE: 'LOAN_REPAYMENT',
    TRANSACTIONDATE: new Date(paymentDate),
    transactionDirection: 'DEBIT',
    description: description || `Loan repayment for ${loanAccountNo}`,
    currency: 'NGN',
    createdBy: createdBy,
    status: 'COMPLETED',
    transactionId: TRANSACTION_IDS.transactionId,
    JOURNAL_ID: TRANSACTION_IDS.JOURNAL_ID,
    metadata: {
      loanAccount: loanAccountNo,
      customerAccount: customerAccountNo,
      paymentMethod,
      isFinalPayment,
      repaymentId: repayment._id
    }
  }], { session });
  // Update loan portfolio
  await updateLoanPortfolio(loanAccount, amount, false, true, session);
  return {
    success: true,
    loanAccountNo,
    amount,
    customerAccountNo,
    referenceNumber,
    repaymentId: repayment._id,
    loanAccount: {
      ACCT_NO: loanAccount.ACCT_NO,
      newOutstanding,
      previousOutstanding: currentOutstanding,
      loanStatus: isFinalPayment ? 'CLOSED' : loanAccount.LOAN_STATUS
    },
    customerAccount: {
      accountNumber: customerAccount.account_number,
      newBalance: customerBalance - amount
    },
    isFinalPayment
  };
};

// Group loan member payment processor
const processGroupLoanMemberPayment = async (memberData, groupLoan, commonData, collectionDoc, session) => {
  const {
    memberId,
    accountNumber,
    customerId,
    customerName,
    loanAccountNo,
    amount,
    principalAmount = 0,
    interestAmount = 0,
    penaltyAmount = 0,
    savingsAmount = 0,
    installmentNumber,
    referenceNumber
  } = memberData;
  const {
    paymentDate = new Date(),
    paymentMethod = 'CASH_DEPOSIT',
    transactionReference,
    createdBy = 'SYSTEM'
  } = commonData;
  const totalLoanAmount = amount || (principalAmount + interestAmount + penaltyAmount);
  const totalAmount = totalLoanAmount + savingsAmount;
 
  if (totalAmount <= 0) {
    return {
      success: false,
      memberId,
      error: 'No payment amount specified'
    };
  }
  try {
    const memberResults = {
      success: true,
      memberId,
      accountNumber,
      customerId,
      customerName,
      totalAmount,
      loanAmount: totalLoanAmount,
      savingsAmount,
      components: {
        principalAmount,
        interestAmount,
        penaltyAmount
      }
    };
    // Process LOAN repayment if applicable
    if (totalLoanAmount > 0) {
      let memberLoanAccount;
     
      if (loanAccountNo) {
        memberLoanAccount = await LoanAccount.findOne({
          ACCT_NO: String(loanAccountNo)
        }).session(session);
      } else if (accountNumber) {
        memberLoanAccount = await LoanAccount.findOne({
          ACCT_NO: String(accountNumber)
        }).session(session);
       
        if (!memberLoanAccount && customerId) {
          memberLoanAccount = await LoanAccount.findOne({
            CUST_ID: String(customerId),
            LOAN_STATUS: { $in: ['ACTIVE', 'DISBURSED', 'ONGOING'] }
          }).session(session);
        }
      }
      if (!memberLoanAccount) {
        throw new Error(`Loan account not found for member ${memberId || customerId}`);
      }
      const validStatuses = ['ACTIVE', 'DISBURSED', 'ONGOING'];
      if (!validStatuses.includes(memberLoanAccount.LOAN_STATUS?.toUpperCase())) {
        throw new Error(`Member loan not active. Status: ${memberLoanAccount.LOAN_STATUS}`);
      }
      const isGroupMember = groupLoan.individualLoanAccounts?.some(acc =>
        acc.toString() === memberLoanAccount._id.toString()
      ) || groupLoan.members?.some(member =>
        member.memberId?.toString() === customerId ||
        member.accountNumber === accountNumber
      );
      if (!isGroupMember) {
        throw new Error(`Member ${memberId || customerId} is not part of this group loan`);
      }
      const currentOutstanding = parseFloat(memberLoanAccount.OUTSTANDING_PRINCIPAL?.toString() || '0');
      const newOutstanding = Math.max(0, currentOutstanding - totalLoanAmount);
      const isFinalPayment = newOutstanding <= 0;
      await LoanAccount.updateOne(
        { _id: memberLoanAccount._id },
        {
          $inc: {
            OUTSTANDING_PRINCIPAL: toDecimal128(-totalLoanAmount),
            TOTAL_REPAID_AMOUNT: toDecimal128(totalLoanAmount)
          },
          $set: {
            LAST_PAYMENT_DATE: new Date(paymentDate),
            LAST_PAYMENT_AMOUNT: toDecimal128(totalLoanAmount),
            LAST_PAYMENT_METHOD: paymentMethod,
            ...(isFinalPayment ? {
              LOAN_STATUS: 'CLOSED',
              CLOSURE_DATE: new Date(paymentDate)
            } : {})
          }
        },
        { session }
      );
      const memberRepayment = new LoanRepayment({
        ACCT_NO: String(memberLoanAccount.ACCT_NO),
        amount: toDecimal128(totalLoanAmount),
        date: new Date(paymentDate),
        CUST_ID: String(memberLoanAccount.CUST_ID),
        customerAccountNo: String(accountNumber || memberLoanAccount.ACCT_NO),
        paymentMethod,
        reference: referenceNumber || `${transactionReference}_${memberId || customerId}`,
        description: `Group loan repayment - ${groupLoan.groupCode}`,
        status: 'COMPLETED',
        loanAccountId: memberLoanAccount._id,
        groupLoanId: groupLoan._id,
        metadata: {
          groupLoanId: groupLoan._id,
          groupCode: groupLoan.groupCode,
          memberId,
          customerId,
          installmentNumber,
          isFinalPayment,
          components: { principalAmount, interestAmount, penaltyAmount }
        }
      });
      await memberRepayment.save({ session });
      collectionDoc.loanRepayments.push({
        loanAccountId: memberLoanAccount._id,
        loanAccountNumber: memberLoanAccount.ACCT_NO,
        customerId: customerId || memberLoanAccount.CUST_ID,
        customerName: customerName || memberLoanAccount.ACCT_NM,
        principalAmount: principalAmount || totalLoanAmount,
        interestAmount: interestAmount || 0,
        penaltyAmount: penaltyAmount || 0,
        totalAmount: totalLoanAmount,
        installmentNumber: installmentNumber,
        repaymentDate: paymentDate,
        transactionReference: referenceNumber || `${transactionReference}_${memberId}`,
        status: 'processed'
      });
      // Update loan portfolio for this member's loan
      await updateLoanPortfolio(memberLoanAccount, totalLoanAmount, false, true, session);
      memberResults.loanAccountNo = memberLoanAccount.ACCT_NO;
      memberResults.newOutstanding = newOutstanding;
      memberResults.previousOutstanding = currentOutstanding;
      memberResults.isFinalPayment = isFinalPayment;
    }
    // Process SAVINGS if applicable
    if (savingsAmount > 0) {
      collectionDoc.savingsCollections.push({
        accountNumber: accountNumber,
        customerId: customerId,
        customerName: customerName,
        amount: savingsAmount,
        savingsType: 'GROUP_SAVINGS',
        transactionReference: referenceNumber || `${transactionReference}_SAVE_${memberId}`,
        status: 'processed'
      });
      memberResults.hasSavings = true;
    }
    return memberResults;
  } catch (error) {
    console.error(`Error processing group loan member ${memberId}:`, error);
    return {
      success: false,
      memberId,
      accountNumber,
      customerId,
      error: error.message,
      attemptedAmount: totalAmount
    };
  }
};

// Main Bulk Payment Controller
export const processBulkRepayments = async (req, res) => {
  console.log('=== STARTING BULK REPAYMENT ===');
 
  const session = await mongoose.startSession();
 
  try {
    await session.startTransaction();
   
    const {
      payments = [],
      memberRepayments = [],
      commonData = {},
      repaymentType = 'INDIVIDUAL'
    } = req.body;
    const {
      paymentMethod = 'CASH_DEPOSIT',
      paymentDate = new Date(),
      description = 'Bulk loan repayment',
      createdBy = 'SYSTEM',
      groupLoanId,
      groupCode,
      transactionReference,
      isInstallment = false,
      repaymentType: groupRepaymentType = 'PRO_RATA',
      paymentFrequency
    } = commonData;
    console.log(`Processing ${repaymentType} repayments`);
    if (repaymentType === 'GROUP') {
      // GROUP LOAN REPAYMENT LOGIC
      if (!groupLoanId && !groupCode) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Group loan ID or group code is required for group repayments'
        });
      }
      if (!Array.isArray(memberRepayments) || memberRepayments.length === 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Member repayments array is required and must contain at least one member'
        });
      }
      console.log(`Processing group repayment for ${memberRepayments.length} members`);
      let groupLoan = await GroupLoan.findOne({
        $or: [
          { loanId: groupLoanId },
          { groupCode: groupCode },
          { _id: groupLoanId }
        ]
      })
      .populate('individualLoanAccounts')
      .populate('group', 'members groupCode groupName')
      .populate('members.memberId')
      .session(session);
      if (!groupLoan) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: 'Group loan not found'
        });
      }
      console.log(`✅ Found group loan: ${groupLoan.loanId}, Group Code: ${groupLoan.groupCode}`);
      const validRepaymentStatuses = [
        'disbursed', 'partially_disbursed', 'active',
        'disbursed_legacy', 'active_legacy', 'approved'
      ];
      if (!validRepaymentStatuses.includes(groupLoan.status)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Group loan must be in disbursed/active status for repayment. Current status: ${groupLoan.status}`
        });
      }
      const totalCollectionAmount = memberRepayments.reduce((sum, member) => {
        const loanAmount = member.amount || (member.principalAmount || 0) + (member.interestAmount || 0) + (member.penaltyAmount || 0);
        const savingsAmount = member.savingsAmount || 0;
        return sum + loanAmount + savingsAmount;
      }, 0);
      const collectionDoc = new Collection({
        groupId: groupLoan._id,
        groupLoanId: groupLoan._id,
        loanId: groupLoan.loanId,
        groupCode: groupLoan.groupCode,
        amount: totalCollectionAmount,
        currency: 'NGN',
        collectionDate: new Date(paymentDate),
        branch: groupLoan.branch || 100,
        relationshipManager: groupLoan.primaryRelationshipManager || groupLoan.createdBy,
        channel: 6,
        createdBy: createdBy,
        paymentMethod: paymentMethod,
        transactionReference: transactionReference || `GRP_REPAY_${groupLoan.loanId}_${Date.now()}`,
        repaymentType: 'group_loan_repayment',
        status: 'pending'
      });
      await collectionDoc.save({ session });
      console.log(`📄 Collection document created: ${collectionDoc._id}`);
      const memberResults = [];
      const repaidMembers = [];
      let totalLoanProcessed = 0;
      let totalSavingsProcessed = 0;
      for (let i = 0; i < memberRepayments.length; i++) {
        const memberData = memberRepayments[i];
       
        console.log(`Processing member ${i + 1}/${memberRepayments.length}: ${memberData.memberId || memberData.customerId}`);
       
        const result = await processGroupLoanMemberPayment(
          memberData,
          groupLoan,
          {
            paymentDate,
            paymentMethod,
            transactionReference,
            createdBy,
            isInstallment,
            paymentFrequency
          },
          collectionDoc,
          session
        );
        memberResults.push({
          index: i,
          ...result
        });
       
        if (result.success) {
          repaidMembers.push(result.memberId || result.customerId);
          totalLoanProcessed += (result.loanAmount || 0);
          totalSavingsProcessed += (result.savingsAmount || 0);
        }
      }
      const successfulRepayments = memberResults.filter(r => r.success).length;
     
      collectionDoc.processingSummary = {
        totalLoanAmount: totalLoanProcessed,
        totalSavingsAmount: totalSavingsProcessed,
        totalFeesAmount: 0,
        successfulLoanRepayments: successfulRepayments,
        failedLoanRepayments: memberResults.length - successfulRepayments,
        successfulSavings: memberResults.filter(r => r.success && r.savingsAmount > 0).length,
        failedSavings: 0,
        repaymentSchedulesUpdated: successfulRepayments,
        totalProcessedAmount: totalLoanProcessed + totalSavingsProcessed
      };
      collectionDoc.status = successfulRepayments > 0 ?
        (successfulRepayments === memberResults.length ? 'processed' : 'partially_processed') :
        'failed';
     
      collectionDoc.processedAt = new Date();
      collectionDoc.processedBy = createdBy;
      await collectionDoc.save({ session });
      // Update group loan totals
      groupLoan.totalRepaid = (groupLoan.totalRepaid || 0) + totalLoanProcessed;
     
      if (repaidMembers.length > 0) {
        const existingRepaid = groupLoan.repaidToMembers || [];
        const newRepaidSet = new Set([
          ...existingRepaid.map(id => id?.toString()),
          ...repaidMembers.map(id => id?.toString())
        ].filter(id => id));
       
        groupLoan.repaidToMembers = Array.from(newRepaidSet).map(id =>
          new mongoose.Types.ObjectId(id)
        );
      }
     
      if (isInstallment) {
        groupLoan.installmentsPaid = (groupLoan.installmentsPaid || 0) + 1;
      }
     
      const totalRepayable = groupLoan.totalRepayable || (groupLoan.totalAmount + (groupLoan.totalInterest || 0));
     
      if (groupLoan.totalRepaid >= totalRepayable) {
        groupLoan.status = 'repaid';
        groupLoan.repaidAt = new Date(paymentDate);
        groupLoan.remainingBalance = 0;
      } else {
        groupLoan.remainingBalance = totalRepayable - groupLoan.totalRepaid;
      }
     
      groupLoan.lastRepaymentDate = new Date(paymentDate);
      await groupLoan.save({ session });
      await session.commitTransaction();
      console.log('=== GROUP BULK REPAYMENT COMPLETED ===');
      return res.status(200).json({
        success: true,
        message: `Group loan repayment processed. ${successfulRepayments} members successful, ${memberResults.length - successfulRepayments} failed.`,
        data: {
          groupLoan: {
            _id: groupLoan._id,
            loanId: groupLoan.loanId,
            groupCode: groupLoan.groupCode,
            groupName: groupLoan.groupName || groupLoan.group?.groupName,
            status: groupLoan.status,
            totalRepaid: groupLoan.totalRepaid,
            remainingBalance: groupLoan.remainingBalance,
            installmentsPaid: groupLoan.installmentsPaid
          },
          collection: {
            id: collectionDoc._id,
            collectionId: collectionDoc.collectionId,
            status: collectionDoc.status,
            totalAmount: collectionDoc.amount,
            loanRepayments: collectionDoc.loanRepayments.length,
            savingsCollections: collectionDoc.savingsCollections.length,
            processingSummary: collectionDoc.processingSummary
          },
          summary: {
            totalMembers: memberRepayments.length,
            successful: successfulRepayments,
            failed: memberResults.length - successfulRepayments,
            totalLoanAmount: totalLoanProcessed,
            totalSavingsAmount: totalSavingsProcessed,
            totalAmount: totalLoanProcessed + totalSavingsProcessed
          },
          memberResults: memberResults.map((result, index) => ({
            memberIndex: index + 1,
            memberId: result.memberId || result.customerId,
            accountNumber: result.accountNumber,
            customerName: result.customerName,
            loanAccountNo: result.loanAccountNo,
            totalAmount: (result.loanAmount || 0) + (result.savingsAmount || 0),
            loanAmount: result.loanAmount || 0,
            savingsAmount: result.savingsAmount || 0,
            status: result.success ? 'success' : 'failed',
            error: result.error,
            newOutstanding: result.newOutstanding,
            previousOutstanding: result.previousOutstanding,
            isFinalPayment: result.isFinalPayment
          }))
        }
      });
    } else {
      // INDIVIDUAL LOAN REPAYMENT LOGIC
      console.log(`Processing ${payments.length} individual payments`);
      if (!Array.isArray(payments) || payments.length === 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Payments array is required and must not be empty'
        });
      }
      if (payments.length > 100) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Maximum 100 payments allowed per batch'
        });
      }
      // Validation
      const validationErrors = [];
      payments.forEach((payment, index) => {
        if (!payment.loanAccountNo) {
          validationErrors.push(`Payment ${index + 1}: Loan account number is required`);
        }
        if (!payment.amount || isNaN(payment.amount) || payment.amount <= 0) {
          validationErrors.push(`Payment ${index + 1}: Valid payment amount is required`);
        }
        if (!payment.customerAccountNo) {
          validationErrors.push(`Payment ${index + 1}: Customer account number is required`);
        }
        if (!payment.referenceNumber) {
          validationErrors.push(`Payment ${index + 1}: Reference number is required`);
        }
      });
      if (validationErrors.length > 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: validationErrors
        });
      }
      // Check for duplicate references
      const referenceSet = new Set();
      const duplicateReferences = [];
      payments.forEach((payment, index) => {
        if (referenceSet.has(payment.referenceNumber)) {
          duplicateReferences.push(`Payment ${index + 1}: Duplicate reference ${payment.referenceNumber}`);
        } else {
          referenceSet.add(payment.referenceNumber);
        }
      });
      if (duplicateReferences.length > 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Duplicate reference numbers found',
          errors: duplicateReferences
        });
      }
      // Process individual payments
      const results = [];
      const errors = [];
      let successCount = 0;
      let totalAmount = 0;
      for (let i = 0; i < payments.length; i++) {
        const payment = payments[i];
       
        try {
          console.log(`Processing payment ${i + 1}/${payments.length}: ${payment.loanAccountNo}`);
         
          const paymentData = {
            loanAccountNo: payment.loanAccountNo,
            amount: payment.amount,
            customerAccountNo: payment.customerAccountNo,
            paymentMethod: payment.paymentMethod || paymentMethod,
            referenceNumber: payment.referenceNumber,
            description: payment.description || description,
            paymentDate: payment.paymentDate || paymentDate,
            createdBy: payment.createdBy || createdBy
          };
          const result = await processSinglePayment(paymentData, session);
          results.push({
            index: i,
            status: 'success',
            ...result
          });
          successCount++;
          totalAmount += parseFloat(payment.amount);
         
        } catch (error) {
          console.error(`Error processing payment ${i + 1}:`, error.message);
          errors.push({
            index: i,
            loanAccountNo: payment.loanAccountNo,
            status: 'error',
            error: error.message,
            details: payment
          });
        }
      }
      if (successCount === 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'All payments failed',
          totalProcessed: 0,
          successful: 0,
          failed: payments.length,
          results: [],
          errors
        });
      }
      await session.commitTransaction();
      console.log('=== INDIVIDUAL BULK REPAYMENT COMPLETED ===');
     
      return res.status(200).json({
        success: true,
        message: `Bulk payment processing completed. ${successCount} successful, ${errors.length} failed`,
        summary: {
          totalProcessed: payments.length,
          successful: successCount,
          failed: errors.length,
          totalAmount: totalAmount.toFixed(2),
          successRate: ((successCount / payments.length) * 100).toFixed(2) + '%'
        },
        results,
        errors,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('=== BULK REPAYMENT ERROR ===', error);
   
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
   
    return res.status(500).json({
      success: false,
      message: 'Bulk payment processing failed',
      error: error.message,
      code: 'BULK_PAYMENT_ERROR'
    });
  } finally {
    await session.endSession();
  }
};

// Get repayment schedule
export const getRepaymentSchedule = async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    const { includeDetails = true } = req.query;
    if (!ACCT_NO) {
      return res.status(400).json({
        success: false,
        message: 'Loan account number (ACCT_NO) is required',
        code: 'MISSING_FIELDS'
      });
    }
    // Find loan account first to get basic info
    const loanAccount = await LoanAccount.findOne({
      ACCT_NO: String(ACCT_NO)
    }).select('ACCT_NM CUST_ID LOAN_STATUS AMOUNT OUTSTANDING_PRINCIPAL TERM_CD TERM_VALUE');
    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: 'Loan account not found',
        code: 'LOAN_NOT_FOUND'
      });
    }
    // Find repayment schedule
    const repaymentSchedule = await RepaymentSchedule.findOne({
      ACCT_NO: String(ACCT_NO)
    });
    if (!repaymentSchedule) {
      return res.status(200).json({
        success: true,
        message: 'No repayment schedule found for this loan account',
        code: 'NO_SCHEDULE',
        data: {
          loanAccountInfo: {
            accountNumber: loanAccount.ACCT_NO,
            customerName: loanAccount.ACCT_NM,
            loanStatus: loanAccount.LOAN_STATUS,
            loanAmount: parseFloat(loanAccount.AMOUNT?.toString() || '0'),
            outstandingBalance: parseFloat(loanAccount.OUTSTANDING_PRINCIPAL?.toString() || '0'),
            termCode: loanAccount.TERM_CD,
            termValue: loanAccount.TERM_VALUE
          },
          hasSchedule: false,
          schedule: null,
          suggestion: 'Use POST /api/repayments/:ACCT_NO/schedule to create a repayment schedule'
        }
      });
    }
    // Calculate summary statistics
    const schedule = repaymentSchedule.SCHEDULE || [];
    const paidInstallments = schedule.filter(inst => inst.status === 'PAID');
    const pendingInstallments = schedule.filter(inst =>
      inst.status === 'PENDING' || inst.status === 'PARTIAL' || inst.status === 'OVERDUE'
    );
    const overdueInstallments = schedule.filter(inst => inst.status === 'OVERDUE');
   
    const totalPaid = paidInstallments.reduce((sum, inst) =>
      sum + parseFloat(inst.amountPaid?.toString() || '0'), 0);
   
    const nextDueInstallment = pendingInstallments.sort((a, b) =>
      new Date(a.dueDate) - new Date(b.dueDate)
    )[0];
    const responseData = {
      success: true,
      message: 'Repayment schedule retrieved successfully',
      data: {
        schedule: includeDetails === 'false' ? undefined : repaymentSchedule,
        summary: {
          scheduleId: repaymentSchedule._id,
          loanAccountNo: repaymentSchedule.ACCT_NO,
          totalInstallments: schedule.length,
          paidInstallments: paidInstallments.length,
          pendingInstallments: pendingInstallments.length,
          overdueInstallments: overdueInstallments.length,
          totalAmount: parseFloat(repaymentSchedule.TOTAL_AMOUNT?.toString() || '0'),
          totalPaid,
          remainingBalance: parseFloat(loanAccount.OUTSTANDING_PRINCIPAL?.toString() || '0'),
          nextDueInstallment: nextDueInstallment ? {
            installmentNumber: nextDueInstallment.installmentNumber,
            dueDate: nextDueInstallment.dueDate,
            amountDue: parseFloat(nextDueInstallment.totalPayment.toString()) -
                      parseFloat(nextDueInstallment.amountPaid?.toString() || '0'),
            status: nextDueInstallment.status
          } : null,
          paymentFrequency: repaymentSchedule.PAYMENT_FREQUENCY,
          termType: repaymentSchedule.TERM_TYPE,
          interestRate: parseFloat(repaymentSchedule.INTEREST_RATE?.toString() || '0'),
          startDate: repaymentSchedule.START_DATE,
          endDate: repaymentSchedule.END_DATE
        }
      }
    };
    return res.status(200).json(responseData);
  } catch (error) {
    console.error('Error getting repayment schedule:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve repayment schedule',
      error: error.message,
      code: 'SCHEDULE_RETRIEVAL_ERROR'
    });
  }
};

// Create repayment schedule
export const createRepaymentSchedule = async (req, res) => {
  const session = await mongoose.startSession();
 
  try {
    await session.startTransaction();
    const { ACCT_NO } = req.params;
    const {
      termType = 'MONTH',
      termValue = 12,
      paymentFrequency = 'MONTHLY',
      interestRate,
      startDate = new Date(),
      createdBy = req.user?.id || 'SYSTEM',
      forceCreate = false // NEW: Optional parameter to force creation
    } = req.body;
    if (!ACCT_NO) {
      throw {
        code: 'MISSING_FIELDS',
        message: 'Loan account number (ACCT_NO) is required',
        status: 400
      };
    }
    // Find loan account
    const loanAccount = await LoanAccount.findOne({ ACCT_NO: String(ACCT_NO) }).session(session);
    if (!loanAccount) {
      throw {
        code: 'LOAN_NOT_FOUND',
        message: 'Loan account not found',
        status: 404
      };
    }
    // Check if schedule already exists
    const existingSchedule = await RepaymentSchedule.findOne({
      ACCT_NO: String(ACCT_NO)
    }).session(session);
    if (existingSchedule && !forceCreate) {
      // Instead of throwing error, return the existing schedule
      await session.abortTransaction();
      return res.status(200).json({
        success: true,
        message: 'Repayment schedule already exists for this loan',
        code: 'SCHEDULE_EXISTS',
        data: existingSchedule,
        metadata: {
          existingScheduleId: existingSchedule._id,
          createdDate: existingSchedule.createdAt,
          numberOfInstallments: existingSchedule.SCHEDULE?.length || 0,
          status: existingSchedule.status || 'ACTIVE'
        }
      });
    }
    // If forceCreate is true and schedule exists, update it instead
    let repaymentSchedule;
    let effectiveInterestRate;
    let schedule = [];
    if (existingSchedule && forceCreate) {
      console.log('Force updating existing repayment schedule for:', ACCT_NO);
     
      // Calculate new schedule
      const loanAmount = parseFloat(loanAccount.AMOUNT?.toString() || loanAccount.DISBURSED_AMOUNT?.toString() || '0');
      effectiveInterestRate = interestRate || parseFloat(loanAccount.INTEREST_RATE?.toString() || '12');
      const monthlyInterestRate = effectiveInterestRate / 100 / 12;
      const numberOfPayments = termValue;
      // Calculate EMI (Equated Monthly Installment) using standard formula
      const emi = loanAmount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfPayments) /
                  (Math.pow(1 + monthlyInterestRate, numberOfPayments) - 1);
      let remainingBalance = loanAmount;
      const scheduleStartDate = new Date(startDate);
      for (let i = 1; i <= numberOfPayments; i++) {
        const dueDate = new Date(scheduleStartDate);
       
        switch (termType.toUpperCase()) {
          case 'MONTH':
          case 'MONTHLY':
            dueDate.setMonth(dueDate.getMonth() + i);
            break;
          case 'QUARTERLY':
            dueDate.setMonth(dueDate.getMonth() + (i * 3));
            break;
          case 'WEEKLY':
            dueDate.setDate(dueDate.getDate() + (i * 7));
            break;
          case 'DAILY':
            dueDate.setDate(dueDate.getDate() + i);
            break;
          case 'YEARLY':
            dueDate.setFullYear(dueDate.getFullYear() + i);
            break;
          default:
            dueDate.setMonth(dueDate.getMonth() + i);
        }
        const interest = remainingBalance * monthlyInterestRate;
        const principal = emi - interest;
        const totalPayment = principal + interest;
       
        remainingBalance = Math.max(0, remainingBalance - principal);
        schedule.push({
          installmentNumber: i,
          dueDate,
          principal: toDecimal128(principal),
          interest: toDecimal128(interest),
          totalPayment: toDecimal128(totalPayment),
          remainingBalance: toDecimal128(remainingBalance),
          status: 'PENDING',
          amountPaid: toDecimal128(0),
          principalPaid: toDecimal128(0),
          interestPaid: toDecimal128(0),
          feesPaid: toDecimal128(0)
        });
      }
      // Update existing schedule
      repaymentSchedule = await RepaymentSchedule.findOneAndUpdate(
        { _id: existingSchedule._id },
        {
          $set: {
            TOTAL_AMOUNT: toDecimal128(loanAmount),
            TOTAL_INTEREST: toDecimal128(schedule.reduce((sum, inst) => sum + parseFloat(inst.interest.toString()), 0)),
            TERM_TYPE: termType.toUpperCase(),
            TERM_VALUE: termValue,
            PAYMENT_FREQUENCY: paymentFrequency.toUpperCase(),
            INTEREST_RATE: toDecimal128(effectiveInterestRate),
            START_DATE: scheduleStartDate,
            END_DATE: schedule[schedule.length - 1]?.dueDate || new Date(),
            SCHEDULE: schedule,
            updatedAt: new Date(),
            updatedBy: createdBy
          }
        },
        { new: true, session }
      );
    } else {
      // Create new schedule (original logic)
      console.log('Creating new repayment schedule for:', ACCT_NO);
     
      const loanAmount = parseFloat(loanAccount.AMOUNT?.toString() || loanAccount.DISBURSED_AMOUNT?.toString() || '0');
      effectiveInterestRate = interestRate || parseFloat(loanAccount.INTEREST_RATE?.toString() || '12');
      const monthlyInterestRate = effectiveInterestRate / 100 / 12;
      const numberOfPayments = termValue;
      const emi = loanAmount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfPayments) /
                  (Math.pow(1 + monthlyInterestRate, numberOfPayments) - 1);
      let remainingBalance = loanAmount;
      const scheduleStartDate = new Date(startDate);
      for (let i = 1; i <= numberOfPayments; i++) {
        const dueDate = new Date(scheduleStartDate);
       
        switch (termType.toUpperCase()) {
          case 'MONTH':
          case 'MONTHLY':
            dueDate.setMonth(dueDate.getMonth() + i);
            break;
          case 'QUARTERLY':
            dueDate.setMonth(dueDate.getMonth() + (i * 3));
            break;
          case 'WEEKLY':
            dueDate.setDate(dueDate.getDate() + (i * 7));
            break;
          case 'DAILY':
            dueDate.setDate(dueDate.getDate() + i);
            break;
          case 'YEARLY':
            dueDate.setFullYear(dueDate.getFullYear() + i);
            break;
          default:
            dueDate.setMonth(dueDate.getMonth() + i);
        }
        const interest = remainingBalance * monthlyInterestRate;
        const principal = emi - interest;
        const totalPayment = principal + interest;
       
        remainingBalance = Math.max(0, remainingBalance - principal);
        schedule.push({
          installmentNumber: i,
          dueDate,
          principal: toDecimal128(principal),
          interest: toDecimal128(interest),
          totalPayment: toDecimal128(totalPayment),
          remainingBalance: toDecimal128(remainingBalance),
          status: 'PENDING',
          amountPaid: toDecimal128(0),
          principalPaid: toDecimal128(0),
          interestPaid: toDecimal128(0),
          feesPaid: toDecimal128(0)
        });
      }
      // Create repayment schedule
      repaymentSchedule = new RepaymentSchedule({
        ACCT_NO: String(ACCT_NO),
        LOAN_ACCOUNT_ID: loanAccount._id,
        CUST_ID: loanAccount.CUST_ID,
        TOTAL_AMOUNT: toDecimal128(loanAmount),
        TOTAL_INTEREST: toDecimal128(schedule.reduce((sum, inst) => sum + parseFloat(inst.interest.toString()), 0)),
        TERM_TYPE: termType.toUpperCase(),
        TERM_VALUE: termValue,
        PAYMENT_FREQUENCY: paymentFrequency.toUpperCase(),
        INTEREST_RATE: toDecimal128(effectiveInterestRate),
        START_DATE: scheduleStartDate,
        END_DATE: schedule[schedule.length - 1]?.dueDate || new Date(),
        SCHEDULE: schedule,
        createdBy,
        status: 'ACTIVE'
      });
      await repaymentSchedule.save({ session });
      // Update loan account with schedule reference
      await LoanAccount.updateOne(
        { _id: loanAccount._id },
        {
          $set: {
            hasRepaymentSchedule: true,
            repaymentScheduleId: repaymentSchedule._id,
            LAST_UPDATED: new Date()
          }
        },
        { session }
      );
    }
    // Create loan event
    const event = new LoanEvent({
      ACCT_NO: String(ACCT_NO),
      eventType: forceCreate && existingSchedule ? 'SCHEDULE_UPDATED' : 'SCHEDULE_CREATED',
      status: 'SUCCESS',
      details: {
        termType,
        termValue,
        paymentFrequency,
        interestRate: effectiveInterestRate,
        numberOfInstallments: termValue,
        totalAmount: parseFloat(loanAccount.AMOUNT?.toString() || loanAccount.DISBURSED_AMOUNT?.toString() || '0'),
        totalInterest: schedule.reduce((sum, inst) => sum + parseFloat(inst.interest.toString()), 0),
        isUpdate: forceCreate && existingSchedule
      },
      createdBy
    });
    await event.save({ session });
    await session.commitTransaction();
    return res.status(201).json({
      success: true,
      message: forceCreate && existingSchedule ? 'Repayment schedule updated successfully' : 'Repayment schedule created successfully',
      data: repaymentSchedule,
      metadata: {
        scheduleId: repaymentSchedule._id,
        action: forceCreate && existingSchedule ? 'UPDATED' : 'CREATED',
        numberOfInstallments: repaymentSchedule.SCHEDULE?.length || 0,
        firstDueDate: repaymentSchedule.SCHEDULE?.[0]?.dueDate,
        lastDueDate: repaymentSchedule.SCHEDULE?.[repaymentSchedule.SCHEDULE?.length - 1]?.dueDate
      }
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('Error creating/updating repayment schedule:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to create/update repayment schedule',
      error: error.code || 'SCHEDULE_CREATION_ERROR',
      details: error.details || null
    });
  } finally {
    await session.endSession();
  }
};

// Delete repayment schedule
export const deleteRepaymentSchedule = async (req, res) => {
  const session = await mongoose.startSession();
 
  try {
    await session.startTransaction();
    const { ACCT_NO } = req.params;
    const { createdBy = req.user?.id || 'SYSTEM' } = req.body;
    if (!ACCT_NO) {
      throw {
        code: 'MISSING_FIELDS',
        message: 'Loan account number (ACCT_NO) is required',
        status: 400
      };
    }
    const repaymentSchedule = await RepaymentSchedule.findOne({
      ACCT_NO: String(ACCT_NO)
    }).session(session);
    if (!repaymentSchedule) {
      throw {
        code: 'SCHEDULE_NOT_FOUND',
        message: 'Repayment schedule not found',
        status: 404
      };
    }
    // Update loan account to remove schedule reference
    await LoanAccount.updateOne(
      { ACCT_NO: String(ACCT_NO) },
      {
        $set: {
          hasRepaymentSchedule: false,
          repaymentScheduleId: null,
          LAST_UPDATED: new Date()
        }
      },
      { session }
    );
    // Create backup record before deletion (optional)
    const backupRecord = {
      originalId: repaymentSchedule._id,
      ACCT_NO: repaymentSchedule.ACCT_NO,
      SCHEDULE: repaymentSchedule.SCHEDULE,
      deletedAt: new Date(),
      deletedBy: createdBy,
      reason: 'Manual deletion'
    };
    // Save backup to another collection or log it
    console.log('Schedule deleted - Backup:', backupRecord);
    // Delete the schedule
    await RepaymentSchedule.deleteOne({ _id: repaymentSchedule._id }, { session });
    // Create loan event
    const event = new LoanEvent({
      ACCT_NO: String(ACCT_NO),
      eventType: 'SCHEDULE_DELETED',
      status: 'SUCCESS',
      details: {
        scheduleId: repaymentSchedule._id,
        numberOfInstallments: repaymentSchedule.SCHEDULE?.length || 0,
        deletedBy: createdBy
      },
      createdBy
    });
    await event.save({ session });
    await session.commitTransaction();
    return res.status(200).json({
      success: true,
      message: 'Repayment schedule deleted successfully',
      data: {
        deletedScheduleId: repaymentSchedule._id,
        deletedAt: new Date(),
        numberOfInstallments: repaymentSchedule.SCHEDULE?.length || 0
      }
    });
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    console.error('Error deleting repayment schedule:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to delete repayment schedule',
      error: error.code || 'SCHEDULE_DELETION_ERROR',
      details: error.details || null
    });
  } finally {
    await session.endSession();
  }
};

// // Export all functions
// export {
//   recordPaymentSimple,
//   getRepaymentSchedule,
//   updateLoanServicingStatus,
//   createRepaymentSchedule,
//   deleteRepaymentSchedule,
//   processBulkRepayments
// };