// controllers/RepaymentScheduleController.js - UPDATED FOR YOUR SCHEMA
import sequelize from '../../config/db.js';
import { Op, QueryTypes } from 'sequelize';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';
import LoanRepayment from '../models/LoanRepayment.js';
import LoanRepaymentTransaction from '../models/LoanRepaymentTransaction.js';
import Transaction from '../models/Transaction.js';
import LoanEvent from '../models/LoanEvent.js';
import logger from '../utils/logger.js';

// ============================
// HELPER FUNCTIONS
// ============================

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

const toDecimal = (value) => {
  if (value === null || value === undefined || value === '') return 0.00;
  const num = parseFloat(value);
  return isNaN(num) ? 0.00 : parseFloat(num.toFixed(2));
};

// ============================
// PAYMENT PROCESSING HELPER
// ============================

async function processPaymentAgainstSchedule(repaymentSchedule, amount, paymentDate, loanAccount, transaction) {
  console.log('Processing payment against schedule...');
  
  // Get installments from installments_json column
  const schedule = [...(repaymentSchedule.installments_json || [])];
  const paymentDateTime = new Date(paymentDate);
  let remainingAmount = amount;
  let totalPrincipalPaid = 0;
  let totalInterestPaid = 0;
  let installmentsUpdated = 0;
  const detailedInstallmentsUpdated = [];

  // Get the current outstanding principal (it's negative in your DB)
  const outstandingValue = Math.abs(toDecimal(loanAccount.OUTSTANDING_PRINCIPAL || loanAccount.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l || 0));
  let previousOutstanding = outstandingValue;
  
  console.log('Initial outstanding:', previousOutstanding);
  console.log('Number of installments:', schedule.length);

  // Add default fields to each installment if they don't exist
  schedule.forEach((inst, index) => {
    if (!inst.installmentNo) inst.installmentNo = index + 1;
    if (!inst.amountPaid) inst.amountPaid = 0;
    if (!inst.interestPaid) inst.interestPaid = 0;
    if (!inst.principalPaid) inst.principalPaid = 0;
    if (!inst.status) inst.status = 'PENDING';
    if (!inst.remainingBalance) inst.remainingBalance = toDecimal(inst.remainingBalance || previousOutstanding);
    
    // Mark overdue installments
    if (inst.status === 'PENDING' && new Date(inst.dueDate) < paymentDateTime) {
      inst.status = 'OVERDUE';
    }
  });

  // Sort by due date (oldest first)
  schedule.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  // Process pending/overdue installments
  for (let i = 0; i < schedule.length; i++) {
    const inst = schedule[i];
    if (remainingAmount <= 0) break;
    
    // Skip paid installments
    if (inst.status === 'PAID') continue;
    
    // Calculate remaining due for this installment
    const totalDue = toDecimal(inst.totalPayment || 0);
    const paidSoFar = toDecimal(inst.amountPaid || 0);
    const remainingDue = totalDue - paidSoFar;
    
    if (remainingDue <= 0) continue;

    // How much to pay on this installment
    const payThisInst = Math.min(remainingAmount, remainingDue);
    
    // Calculate interest and principal portions
    const totalInterest = toDecimal(inst.interest || 0);
    const totalPrincipal = toDecimal(inst.principal || 0);
    const interestPaidSoFar = toDecimal(inst.interestPaid || 0);
    const principalPaidSoFar = toDecimal(inst.principalPaid || 0);
    
    const remainingInterest = totalInterest - interestPaidSoFar;
    const remainingPrincipal = totalPrincipal - principalPaidSoFar;
    
    // Pay interest first, then principal
    let interestThis = Math.min(payThisInst, remainingInterest);
    let principalThis = 0;
    
    if (interestThis < payThisInst) {
      const remainingAfterInterest = payThisInst - interestThis;
      principalThis = Math.min(remainingAfterInterest, remainingPrincipal);
    }

    // Update installment
    inst.amountPaid = toDecimal(inst.amountPaid || 0) + interestThis + principalThis;
    inst.interestPaid = toDecimal(inst.interestPaid || 0) + interestThis;
    inst.principalPaid = toDecimal(inst.principalPaid || 0) + principalThis;
    
    // Update remaining balance for the installment
    const previousRemainingBalance = toDecimal(inst.remainingBalance || previousOutstanding);
    inst.remainingBalance = Math.max(0, previousRemainingBalance - principalThis);
    
    // Update status
    if (toDecimal(inst.amountPaid) >= totalDue) {
      inst.status = 'PAID';
    } else if (inst.amountPaid > 0) {
      inst.status = 'PARTIAL';
    }

    // Update totals
    totalInterestPaid += interestThis;
    totalPrincipalPaid += principalThis;
    remainingAmount -= (interestThis + principalThis);
    installmentsUpdated++;
    
    // Record detailed update
    detailedInstallmentsUpdated.push({
      installmentNo: inst.installmentNo || i + 1,
      dueDate: inst.dueDate,
      amountPaid: interestThis + principalThis,
      principalPaid: principalThis,
      interestPaid: interestThis,
      status: inst.status,
      previousBalance: previousRemainingBalance,
      newBalance: inst.remainingBalance
    });
    
    // Update previousOutstanding for next iteration
    previousOutstanding = inst.remainingBalance;
    
    console.log(`Processed installment ${inst.installmentNo}:`, {
      principalThis,
      interestThis,
      newBalance: inst.remainingBalance,
      status: inst.status
    });
  }

  // Calculate new outstanding (make it negative as per your schema)
  const newOutstanding = -Math.abs(Math.max(0, previousOutstanding - totalPrincipalPaid));
  const isFinalPayment = schedule.every(inst => inst.status === 'PAID');

  console.log('Payment processing result:', {
    totalPrincipalPaid,
    totalInterestPaid,
    previousOutstanding: Math.abs(newOutstanding + totalPrincipalPaid),
    newOutstanding: Math.abs(newOutstanding),
    isFinalPayment,
    installmentsUpdated
  });

  return {
    updatedSchedule: schedule,
    totalPrincipalPaid,
    totalInterestPaid,
    previousOutstanding: Math.abs(newOutstanding + totalPrincipalPaid),
    newOutstanding: Math.abs(newOutstanding),
    isFinalPayment,
    installmentsUpdated,
    detailedInstallmentsUpdated,
    remainingAmount
  };
}

// ============================
// CREATE LOAN REPAYMENT RECORDS
// ============================

async function createLoanRepaymentRecords(loanData, transaction) {
  console.log('Creating loan repayment records...');
  
  try {
    // 1. Create record in loan_repayments table
    const loanRepaymentData = {
      loan_account_id: loanData.loanAccountId,
      loan_account_number: loanData.ACCT_NO,
      customer_id: loanData.CUST_ID,
      customer_name: loanData.customerName || 'Customer',
      principal_amount: loanData.principalPaid || 0,
      interest_amount: loanData.interestPaid || 0,
      penalty_amount: 0,
      total_amount: loanData.amount,
      installment_number: loanData.installmentNo || null,
      repayment_date: new Date(loanData.paymentDate),
      transaction_reference: loanData.reference || `REPAY-${Date.now()}`,
      status: 'completed',
      collection_id: loanData.collectionId || null
    };
    
    console.log('Creating loan_repayments record:', loanRepaymentData);
    const loanRepayment = await LoanRepayment.create(loanRepaymentData, { transaction });
    
    // 2. Create record in loan_repayment_transactions table
    const repaymentTransactionData = {
      a_c_c_t__i_d: loanData.loanAccountId,
      a_c_c_t__n_o: loanData.ACCT_NO,
      c_u_s_t__i_d: loanData.CUST_ID,
      t_r_a_n_s_a_c_t_i_o_n__d_a_t_e: new Date(loanData.paymentDate),
      t_r_a_n_s_a_c_t_i_o_n__t_y_p_e: 'REPAYMENT',
      a_m_o_u_n_t: loanData.amount,
      p_r_i_n_c_i_p_a_l__a_m_o_u_n_t: loanData.principalPaid || 0,
      i_n_t_e_r_e_s_t__a_m_o_u_n_t: loanData.interestPaid || 0,
      p_a_y_m_e_n_t__m_e_t_h_o_d: loanData.paymentMethod || 'CASH',
      t_r_a_n_s_a_c_t_i_o_n__r_e_f_e_r_e_n_c_e: loanData.reference || `REPAY-${Date.now()}`,
      r_e_p_a_y_m_e_n_t__t_y_p_e: 'REPAYMENT',
      i_s__i_n_s_t_a_l_l_m_e_n_t: loanData.isInstallment || true,
      c_r_e_a_t_e_d__b_y: loanData.createdBy || 'system',
      s_t_a_t_u_s: 'COMPLETED',
      r_e_c_e_i_p_t__n_o: `RCP-${Date.now()}`,
      n_o_t_e_s: loanData.description || 'Loan repayment against schedule'
    };
    
    console.log('Creating loan_repayment_transactions record:', repaymentTransactionData);
    const repaymentTransaction = await LoanRepaymentTransaction.create(repaymentTransactionData, { transaction });
    
    return {
      loanRepaymentId: loanRepayment.id,
      repaymentTransactionId: repaymentTransaction.id
    };
    
  } catch (error) {
    console.error('Error creating loan repayment records:', error);
    throw error;
  }
}

// ============================
// CONTROLLER FUNCTIONS
// ============================

/**
 * POST: Process payment against repayment schedule
 */
export const processSchedulePayment = async (req, res) => {
  console.log('=== PROCESSING SCHEDULE PAYMENT ===');
  
  const transaction = await sequelize.transaction();
  
  try {
    const { ACCT_NO } = req.params;
    const {
      amount,
      customerAccountNo,
      paymentMethod = 'CASH_DEPOSIT',
      referenceNumber,
      description,
      paymentDate = new Date(),
      createdBy = 'SYSTEM'
    } = req.body;

    console.log('Payment request:', {
      ACCT_NO,
      amount,
      customerAccountNo,
      paymentMethod,
      referenceNumber
    });

    // Validate required fields
    if (!ACCT_NO) {
      throw {
        code: 'MISSING_ACCT_NO',
        message: 'Loan account number is required',
        status: 400
      };
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      throw {
        code: 'INVALID_AMOUNT',
        message: 'Valid payment amount is required',
        status: 400
      };
    }

    if (!customerAccountNo) {
      throw {
        code: 'MISSING_CUSTOMER_ACCOUNT',
        message: 'Customer account number is required',
        status: 400
      };
    }

    // 1. Find Loan Account using correct column name
    const loanAccount = await LoanAccount.findOne({
      where: { a_c_c_t__n_o: String(ACCT_NO) },
      transaction
    });

    if (!loanAccount) {
      throw {
        code: 'LOAN_NOT_FOUND',
        message: `Loan account ${ACCT_NO} not found`,
        status: 404
      };
    }

    console.log('Found loan account:', {
      ACCT_NO: loanAccount.a_c_c_t__n_o,
      id: loanAccount.id,
      status: loanAccount.l_o_a_n__s_t_a_t_u_s,
      outstanding: loanAccount.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l
    });

    // 2. Check loan status
    const validStatuses = ['ACTIVE', 'DISBURSED', 'ONGOING'];
    const loanStatus = loanAccount.l_o_a_n__s_t_a_t_u_s;
    
    if (!validStatuses.includes(loanStatus?.toUpperCase())) {
      throw {
        code: 'INVALID_LOAN_STATUS',
        message: `Loan not active. Status: ${loanStatus}`,
        status: 400
      };
    }

    // 3. Find Customer Account
    const customerAccount = await CustomerAccount.findOne({
      where: { account_number: String(customerAccountNo) },
      transaction
    });

    if (!customerAccount) {
      throw {
        code: 'CUSTOMER_NOT_FOUND',
        message: `Customer account ${customerAccountNo} not found`,
        status: 404
      };
    }

    console.log('Found customer account:', {
      account_number: customerAccount.account_number,
      balance: customerAccount.ledger_balance || customerAccount.available_balance
    });

    // 4. Check balance
    const customerBalance = toDecimal(customerAccount.ledger_balance || customerAccount.available_balance || 0);
    
    if (customerBalance < amount) {
      throw {
        code: 'INSUFFICIENT_FUNDS',
        message: `Insufficient funds. Available: ${customerBalance}`,
        status: 400
      };
    }

    // 5. Find Repayment Schedule using account_number column
    const repaymentSchedule = await RepaymentSchedule.findOne({
      where: { account_number: String(ACCT_NO) },
      transaction
    });

    if (!repaymentSchedule) {
      throw {
        code: 'NO_SCHEDULE',
        message: 'No repayment schedule found for this loan',
        status: 400
      };
    }

    console.log('Found repayment schedule:', {
      id: repaymentSchedule.id,
      installments_count: repaymentSchedule.installments_json?.length || 0
    });

    // 6. Process payment against schedule
    const paymentResult = await processPaymentAgainstSchedule(
      repaymentSchedule,
      amount,
      paymentDate,
      loanAccount,
      transaction
    );

    console.log('Payment result:', {
      totalPrincipalPaid: paymentResult.totalPrincipalPaid,
      totalInterestPaid: paymentResult.totalInterestPaid,
      installmentsUpdated: paymentResult.installmentsUpdated,
      isFinalPayment: paymentResult.isFinalPayment
    });

    // 7. Update Loan Account - use correct column names
    const currentTotalRepaid = toDecimal(loanAccount.t_o_t_a_l__r_e_p_a_i_d__a_m_o_u_n_t || 0);
    
    await loanAccount.update({
      o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l: -paymentResult.newOutstanding,
      t_o_t_a_l__r_e_p_a_i_d__a_m_o_u_n_t: currentTotalRepaid + amount,
      l_a_s_t__r_e_p_a_y_m_e_n_t__d_a_t_e: new Date(paymentDate),
      l_a_s_t__r_e_p_a_y_m_e_n_t__a_m_o_u_n_t: amount,
      ...(paymentResult.isFinalPayment && {
        l_o_a_n__s_t_a_t_u_s: 'CLOSED',
        c_l_o_s_u_r_e__d_a_t_e: new Date(paymentDate)
      })
    }, { transaction });

    // 8. Update Customer Account
    const updateFields = {};
    if (customerAccount.ledger_balance !== undefined) {
      updateFields.ledger_balance = customerBalance - amount;
    }
    if (customerAccount.available_balance !== undefined) {
      updateFields.available_balance = customerBalance - amount;
    }
    
    await customerAccount.update(updateFields, { transaction });

    // 9. Update Repayment Schedule
    await repaymentSchedule.update({
      installments_json: paymentResult.updatedSchedule,
      status: paymentResult.isFinalPayment ? 'COMPLETED' : 'ACTIVE'
    }, { transaction });

    // 10. Create Loan Repayment Records in both tables
    const repaymentRecords = await createLoanRepaymentRecords({
      loanAccountId: loanAccount.id,
      ACCT_NO: loanAccount.a_c_c_t__n_o,
      CUST_ID: loanAccount.c_u_s_t__i_d,
      customerName: loanAccount.a_c_c_t__n_m,
      amount: amount,
      principalPaid: paymentResult.totalPrincipalPaid,
      interestPaid: paymentResult.totalInterestPaid,
      paymentDate: paymentDate,
      paymentMethod: paymentMethod,
      reference: referenceNumber || `REPAY-${Date.now()}`,
      description: description || 'Loan repayment against schedule',
      installmentNo: paymentResult.detailedInstallmentsUpdated[0]?.installmentNo,
      isInstallment: paymentResult.installmentsUpdated > 0,
      createdBy: createdBy
    }, transaction);

    // 11. Create Transaction record
    const TRANSACTION_IDS = generateTransactionIds();
    const customerName = customerAccount.account_name || customerAccount.ACCT_NM || 'Customer';
    const businessUnitId = loanAccount.BU_ID || customerAccount.BU_ID || 1;
    const accountId = loanAccount.ACCT_ID || customerAccount.ACCT_ID || 'DEFAULT_ACCT';

    await Transaction.create({
      TRANSACTION_ID: TRANSACTION_IDS.TRANSACTION_ID,
      EVENT_ID: TRANSACTION_IDS.EVENT_ID,
      TRAN_JOURNAL_ID: TRANSACTION_IDS.TRAN_JOURNAL_ID,
      REFERENCE: referenceNumber || `REPAY-${Date.now()}`,
      ACCT_NO: String(customerAccountNo),
      ACCT_ID: accountId,
      BU_ID: businessUnitId,
      CUST_ID: String(loanAccount.c_u_s_t__i_d),
      ACCT_NM: customerName,
      AMOUNT: amount,
      TRANSACTION_TYPE: 'LOAN_REPAYMENT',
      TRANSACTIONDATE: new Date(paymentDate),
      transactionDirection: 'DEBIT',
      description: description || `Loan repayment for ${ACCT_NO}`,
      currency: 'NGN',
      createdBy: createdBy,
      status: 'COMPLETED',
      transactionId: TRANSACTION_IDS.transactionId,
      JOURNAL_ID: TRANSACTION_IDS.JOURNAL_ID,
      metadata: {
        loanAccount: ACCT_NO,
        customerAccount: customerAccountNo,
        paymentMethod: paymentMethod,
        isFinalPayment: paymentResult.isFinalPayment,
        principalPaid: paymentResult.totalPrincipalPaid,
        interestPaid: paymentResult.totalInterestPaid,
        loanRepaymentId: repaymentRecords.loanRepaymentId,
        repaymentTransactionId: repaymentRecords.repaymentTransactionId
      }
    }, { transaction });

    // 12. Create Loan Event
    await LoanEvent.create({
      ACCT_NO: String(ACCT_NO),
      eventType: 'PAYMENT_PROCESSED',
      status: 'SUCCESS',
      details: {
        amount: amount,
        paymentMethod: paymentMethod,
        principalPaid: paymentResult.totalPrincipalPaid,
        interestPaid: paymentResult.totalInterestPaid,
        installmentsUpdated: paymentResult.detailedInstallmentsUpdated,
        isFinalPayment: paymentResult.isFinalPayment,
        loanRepaymentId: repaymentRecords.loanRepaymentId,
        repaymentTransactionId: repaymentRecords.repaymentTransactionId
      },
      createdBy: createdBy
    }, { transaction });

    await transaction.commit();

    console.log('=== SCHEDULE PAYMENT PROCESSED SUCCESSFULLY ===');

    return res.status(200).json({
      success: true,
      message: 'Payment processed successfully against schedule',
      data: {
        repaymentId: repaymentRecords.loanRepaymentId,
        repaymentTransactionId: repaymentRecords.repaymentTransactionId,
        loanAccount: {
          ACCT_NO: loanAccount.a_c_c_t__n_o,
          accountName: loanAccount.a_c_c_t__n_m,
          newOutstanding: paymentResult.newOutstanding,
          previousOutstanding: paymentResult.previousOutstanding,
          loanStatus: paymentResult.isFinalPayment ? 'CLOSED' : loanAccount.l_o_a_n__s_t_a_t_u_s
        },
        customerAccount: {
          accountNumber: customerAccount.account_number,
          newBalance: customerBalance - amount
        },
        paymentBreakdown: {
          totalAmount: amount,
          principalPaid: paymentResult.totalPrincipalPaid,
          interestPaid: paymentResult.totalInterestPaid,
          isFinalPayment: paymentResult.isFinalPayment,
          remainingAmount: paymentResult.remainingAmount
        },
        scheduleSummary: {
          totalInstallments: repaymentSchedule.installments_json?.length || 0,
          paidInstallments: paymentResult.updatedSchedule.filter(i => i.status === 'PAID').length,
          pendingInstallments: paymentResult.updatedSchedule.filter(i => 
            i.status === 'PENDING' || i.status === 'OVERDUE' || i.status === 'PARTIAL'
          ).length,
          installmentsUpdated: paymentResult.installmentsUpdated,
          updatedInstallments: paymentResult.detailedInstallmentsUpdated
        }
      }
    });

  } catch (error) {
    console.error('=== SCHEDULE PAYMENT ERROR ===', error);
    console.error('Stack trace:', error.stack);
    
    if (transaction) {
      await transaction.rollback();
    }
    
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to process payment against schedule',
      error: error.code || 'SCHEDULE_PAYMENT_ERROR',
      details: error.details || null,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Record a manual repayment without schedule processing
 */
export const recordManualRepayment = async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    const repaymentData = req.body;

    console.log('📝 Processing manual repayment for account:', ACCT_NO);

    // Find loan account using the correct column name
    const loanAccount = await LoanAccount.findOne({ 
      where: { a_c_c_t__n_o: ACCT_NO } 
    });
    
    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: 'Loan account not found',
        code: 'LOAN_ACCOUNT_NOT_FOUND'
      });
    }

    console.log('Found loan account:', loanAccount.a_c_c_t__n_o);

    // Create repayment records
    const repaymentRecords = await createLoanRepaymentRecords({
      loanAccountId: loanAccount.id,
      ACCT_NO: loanAccount.a_c_c_t__n_o,
      CUST_ID: loanAccount.c_u_s_t__i_d,
      customerName: loanAccount.a_c_c_t__n_m,
      amount: parseFloat(repaymentData.amount || 0),
      principalPaid: parseFloat(repaymentData.principalPaid || '0'),
      interestPaid: parseFloat(repaymentData.interestPaid || '0'),
      paymentDate: repaymentData.date || new Date(),
      paymentMethod: repaymentData.paymentMethod || 'MANUAL',
      reference: repaymentData.referenceNumber || `MANUAL-${Date.now()}`,
      description: repaymentData.description || 'Manual repayment',
      createdBy: req.user?.id || 'system'
    });

    // Update loan account outstanding if needed
    if (repaymentData.updateOutstanding !== false) {
      const currentOutstanding = Math.abs(toDecimal(loanAccount.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l || 0));
      const newOutstanding = Math.max(0, currentOutstanding - parseFloat(repaymentData.principalPaid || '0'));
      
      await loanAccount.update({
        o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l: -newOutstanding,
        t_o_t_a_l__r_e_p_a_i_d__a_m_o_u_n_t: toDecimal(loanAccount.t_o_t_a_l__r_e_p_a_i_d__a_m_o_u_n_t || 0) + parseFloat(repaymentData.amount),
        l_a_s_t__r_e_p_a_y_m_e_n_t__d_a_t_e: new Date(repaymentData.date || Date.now()),
        l_a_s_t__r_e_p_a_y_m_e_n_t__a_m_o_u_n_t: parseFloat(repaymentData.amount)
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Manual repayment recorded successfully',
      data: {
        loanRepaymentId: repaymentRecords.loanRepaymentId,
        repaymentTransactionId: repaymentRecords.repaymentTransactionId
      }
    });
  } catch (error) {
    console.error('Record manual repayment error:', error);
    console.error('Stack trace:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Failed to record manual repayment',
      error: error.message,
      details: error.details || null
    });
  }
};

// ============================
// OTHER FUNCTIONS
// ============================

export const getRepaymentSchedule = async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    const { includeDetails = 'true' } = req.query;
    
    if (!ACCT_NO) {
      return res.status(400).json({
        success: false,
        message: 'Loan account number (ACCT_NO) is required',
        code: 'MISSING_FIELDS'
      });
    }

    console.log('🔍 Searching for loan repayment schedule for account:', ACCT_NO);
    
    // Updated query to include all fields from your table
    const query = `
      SELECT 
        id,
        loan_account_id,
        account_number,
        customer_id,
        start_date,
        maturity_date,
        principal_amount,
        interest_rate,
        term,
        term_type,
        payment_frequency,
        status,
        total_interest,
        total_repayment,
        transaction_id,
        event_id,
        created_by,
        emi_amount,
        upfront_interest,
        guarantor_id,
        guaranteed_amount,
        installments_json,
        schedule,
        interest_rate_type,
        interest_type,
        calculation_method,
        is_term_based_rate,
        is_schedule_complete,
        created_at,
        updated_at
      FROM repayment_schedules 
      WHERE account_number = ?
    `;
    
    const results = await sequelize.query(query, {
      replacements: [String(ACCT_NO)],
      type: sequelize.QueryTypes.SELECT
    });

    if (!results || results.length === 0) {
      console.log('No schedule found for account:', ACCT_NO);
      return res.status(200).json({
        success: true,
        message: 'No repayment schedule found for this loan account',
        code: 'NO_SCHEDULE',
        data: {
          loanAccountInfo: {
            accountNumber: ACCT_NO,
            message: 'No repayment schedule found'
          },
          hasSchedule: false,
          schedule: null,
          suggestion: 'Use POST /api/repayments/:ACCT_NO/schedule to create a repayment schedule'
        }
      });
    }

    const repaymentSchedule = results[0];
    
    // Process installments - try schedule field first, then installments_json
    let installments = [];
    let installmentSource = 'none';
    
    if (repaymentSchedule.schedule) {
      try {
        installments = typeof repaymentSchedule.schedule === 'string' 
          ? JSON.parse(repaymentSchedule.schedule)
          : repaymentSchedule.schedule;
        installmentSource = 'schedule';
        console.log(`📊 Using installments from 'schedule' field: ${installments.length} installments`);
      } catch (parseError) {
        console.error('Error parsing schedule JSON:', parseError);
      }
    }
    
    // Fallback to installments_json if schedule is empty
    if (installments.length === 0 && repaymentSchedule.installments_json) {
      try {
        installments = typeof repaymentSchedule.installments_json === 'string' 
          ? JSON.parse(repaymentSchedule.installments_json)
          : repaymentSchedule.installments_json;
        installmentSource = 'installments_json';
        console.log(`📊 Using installments from 'installments_json' field: ${installments.length} installments`);
      } catch (parseError) {
        console.error('Error parsing installments_json:', parseError);
        installments = [];
      }
    }

    // Calculate totals from installments
    const now = new Date();
    const paidInstallments = installments.filter(i => i.status === 'PAID' || (i.paidDate && i.paidDate !== null));
    const pendingInstallments = installments.filter(i => !i.status || i.status !== 'PAID');
    const overdueInstallments = installments.filter(i => {
      if (i.status === 'PAID' || (i.paidDate && i.paidDate !== null)) return false;
      if (!i.dueDate) return false;
      try {
        const dueDate = new Date(i.dueDate);
        return dueDate < now;
      } catch {
        return false;
      }
    });

    const totalPaid = paidInstallments.reduce((sum, i) => {
      return sum + (parseFloat(i.totalPayment) || parseFloat(i.amountPaid) || 0);
    }, 0);

    const totalOutstanding = pendingInstallments.reduce((sum, i) => {
      return sum + (parseFloat(i.totalPayment) || parseFloat(i.dueAmount) || 0);
    }, 0);

    // Build the response data
    const responseData = {
      success: true,
      message: 'Repayment schedule retrieved successfully',
      code: 'SCHEDULE_RETRIEVED',
      data: {
        loanAccountInfo: {
          accountNumber: repaymentSchedule.account_number || ACCT_NO,
          customerId: repaymentSchedule.customer_id,
          startDate: repaymentSchedule.start_date,
          maturityDate: repaymentSchedule.maturity_date,
          principalAmount: repaymentSchedule.principal_amount,
          interestRate: repaymentSchedule.interest_rate,
          term: repaymentSchedule.term,
          termType: repaymentSchedule.term_type,
          paymentFrequency: repaymentSchedule.payment_frequency,
          emiAmount: repaymentSchedule.emi_amount,
          totalInterest: repaymentSchedule.total_interest,
          totalRepayment: repaymentSchedule.total_repayment,
          status: repaymentSchedule.status,
          upfrontInterest: repaymentSchedule.upfront_interest,
          guarantorId: repaymentSchedule.guarantor_id,
          guaranteedAmount: repaymentSchedule.guaranteed_amount,
          interestRateType: repaymentSchedule.interest_rate_type,
          interestType: repaymentSchedule.interest_type,
          calculationMethod: repaymentSchedule.calculation_method,
          isTermBasedRate: repaymentSchedule.is_term_based_rate,
          isScheduleComplete: repaymentSchedule.is_schedule_complete,
          createdBy: repaymentSchedule.created_by,
          createdAt: repaymentSchedule.created_at,
          updatedAt: repaymentSchedule.updated_at
        },
        hasSchedule: true,
        schedule: {
          id: repaymentSchedule.id,
          loanAccountId: repaymentSchedule.loan_account_id,
          transactionId: repaymentSchedule.transaction_id,
          eventId: repaymentSchedule.event_id,
          installmentSource: installmentSource,
          installments: installments,
          totalInstallments: installments.length,
          summary: {
            totalPrincipal: parseFloat(repaymentSchedule.principal_amount) || 0,
            totalInterest: parseFloat(repaymentSchedule.total_interest) || 0,
            totalAmount: parseFloat(repaymentSchedule.total_repayment) || 0,
            totalPaid: totalPaid,
            totalOutstanding: totalOutstanding,
            paidInstallments: paidInstallments.length,
            pendingInstallments: pendingInstallments.length,
            overdueInstallments: overdueInstallments.length,
            nextDueDate: pendingInstallments.length > 0 
              ? pendingInstallments[0].dueDate 
              : null,
            lastPaidDate: paidInstallments.length > 0 
              ? paidInstallments[paidInstallments.length - 1].paidDate 
              : null
          }
        }
      }
    };

    // Add detailed installment breakdown if requested
    if (includeDetails === 'true' && installments.length > 0) {
      responseData.data.schedule.detailedInstallments = installments.map((installment, index) => {
        const isPaid = installment.status === 'PAID' || (installment.paidDate && installment.paidDate !== null);
        const dueDate = new Date(installment.dueDate);
        const isOverdue = !isPaid && dueDate < now;
        
        return {
          installmentNumber: installment.installmentNo || index + 1,
          dueDate: installment.dueDate,
          principalAmount: parseFloat(installment.principal) || parseFloat(installment.principalAmount) || 0,
          interestAmount: parseFloat(installment.interest) || parseFloat(installment.interestAmount) || 0,
          totalAmount: parseFloat(installment.totalPayment) || 
                      (parseFloat(installment.principal) || 0) + (parseFloat(installment.interest) || 0),
          remainingBalance: parseFloat(installment.remainingBalance) || 0,
          amountPaid: isPaid ? (parseFloat(installment.totalPayment) || 0) : 0,
          paidDate: installment.paidDate || null,
          status: isPaid ? 'PAID' : (isOverdue ? 'OVERDUE' : 'PENDING'),
          lateFee: installment.lateFee || 0,
          remarks: installment.remarks || ''
        };
      });
    }

    console.log(`✅ Repayment schedule retrieved: ${installments.length} installments found`);
    return res.status(200).json(responseData);

  } catch (error) {
    console.error('❌ Error getting repayment schedule:', error.message);
    console.error('Stack trace:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve repayment schedule',
      error: error.message,
      code: 'SCHEDULE_RETRIEVAL_ERROR',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};


/**
 * POST: Create a new repayment schedule
 */
export const createRepaymentSchedule = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { ACCT_NO } = req.params;
    const {
      termType = 'M',
      termValue,
      paymentFrequency = 'MONTHLY',
      interestRate,
      startDate = new Date(),
      createdBy = 'SYSTEM',
      forceCreate = false
    } = req.body;

    if (!ACCT_NO) {
      throw {
        code: 'MISSING_FIELDS',
        message: 'Loan account number (ACCT_NO) is required',
        status: 400
      };
    }

    // Find loan account using correct column name
    const loanAccount = await LoanAccount.findOne({ 
      where: { a_c_c_t__n_o: String(ACCT_NO) },
      transaction
    });

    if (!loanAccount) {
      throw {
        code: 'LOAN_NOT_FOUND',
        message: 'Loan account not found',
        status: 404
      };
    }

    // Check if schedule already exists
    const existingSchedule = await RepaymentSchedule.findOne({
      where: { account_number: String(ACCT_NO) },
      transaction
    });

    if (existingSchedule && !forceCreate) {
      await transaction.rollback();
      return res.status(200).json({
        success: true,
        message: 'Repayment schedule already exists for this loan',
        code: 'SCHEDULE_EXISTS',
        data: existingSchedule,
        metadata: {
          existingScheduleId: existingSchedule.id,
          createdDate: existingSchedule.created_at,
          numberOfInstallments: existingSchedule.installments_json?.length || 0,
          status: existingSchedule.status || 'PENDING'
        }
      });
    }

    // Get loan details
    const loanAmount = toDecimal(loanAccount.a_m_o_u_n_t || loanAccount.d_i_s_b_u_r_s_e_m_e_n_t__l_i_m_i_t || 0);
    const effectiveTermValue = termValue || loanAccount.t_e_r_m__v_a_l_u_e || 12;
    const effectiveInterestRate = interestRate || toDecimal(loanAccount.i_n_t_e_r_e_s_t__r_a_t_e) || 12.0;
    const scheduleStartDate = new Date(startDate || loanAccount.s_t_a_r_t__d_t || new Date());

    // Validate inputs
    if (loanAmount <= 0) {
      throw {
        code: 'INVALID_LOAN_AMOUNT',
        message: 'Loan amount must be greater than zero',
        status: 400
      };
    }

    if (effectiveTermValue <= 0) {
      throw {
        code: 'INVALID_TERM',
        message: 'Term value must be greater than zero',
        status: 400
      };
    }

    // Generate repayment schedule based on calculation method
    let schedule = [];
    let emiAmount = 0;
    let totalInterest = 0;
    let totalRepayment = 0;

    // For FLAT RATE calculation (simple interest)
    console.log('Creating FLAT RATE repayment schedule');
    
    // Monthly interest rate
    const monthlyRate = effectiveInterestRate / 100 / 12;
    
    // Calculate total interest for the entire term
    totalInterest = loanAmount * (effectiveInterestRate / 100) * (effectiveTermValue / 12);
    totalRepayment = loanAmount + totalInterest;
    emiAmount = totalRepayment / effectiveTermValue;
    
    let remainingPrincipal = loanAmount;
    let cumulativeInterest = 0;

    for (let i = 1; i <= effectiveTermValue; i++) {
      // Calculate installment components
      const interestPortion = totalInterest / effectiveTermValue;
      let principalPortion = emiAmount - interestPortion;
      
      // Adjust for the last installment
      if (i === effectiveTermValue) {
        principalPortion = remainingPrincipal;
      }

      // Update remaining principal
      remainingPrincipal -= principalPortion;
      if (remainingPrincipal < 0.01) remainingPrincipal = 0;

      // Calculate due date
      const dueDate = new Date(scheduleStartDate);
      switch (paymentFrequency.toUpperCase()) {
        case 'DAILY':
          dueDate.setDate(dueDate.getDate() + i);
          break;
        case 'WEEKLY':
          dueDate.setDate(dueDate.getDate() + (i * 7));
          break;
        case 'BI_WEEKLY':
          dueDate.setDate(dueDate.getDate() + (i * 14));
          break;
        case 'MONTHLY':
          dueDate.setMonth(dueDate.getMonth() + i);
          break;
        case 'QUARTERLY':
          dueDate.setMonth(dueDate.getMonth() + (i * 3));
          break;
        case 'YEARLY':
          dueDate.setFullYear(dueDate.getFullYear() + i);
          break;
        default:
          dueDate.setMonth(dueDate.getMonth() + i);
      }

      schedule.push({
        installmentNo: i,
        dueDate: dueDate.toISOString().split('T')[0],
        principal: toDecimal(principalPortion),
        interest: toDecimal(interestPortion),
        totalPayment: toDecimal(principalPortion + interestPortion),
        remainingBalance: toDecimal(remainingPrincipal),
        status: 'PENDING',
        amountPaid: 0.00,
        principalPaid: 0.00,
        interestPaid: 0.00,
        feesPaid: 0.00
      });

      cumulativeInterest += interestPortion;
    }

    // Create or update repayment schedule
    let repaymentSchedule;
    const now = new Date();

    if (existingSchedule && forceCreate) {
      // Update existing schedule
      repaymentSchedule = await existingSchedule.update({
        principal_amount: loanAmount,
        interest_rate: effectiveInterestRate,
        term: effectiveTermValue,
        term_type: termType,
        payment_frequency: paymentFrequency,
        emi_amount: emiAmount,
        installments_json: schedule,
        total_interest: totalInterest,
        total_repayment: totalRepayment,
        start_date: scheduleStartDate,
        maturity_date: schedule[schedule.length - 1]?.dueDate || new Date(),
        status: 'ACTIVE',
        updated_at: now,
        updated_by: createdBy
      }, { transaction });

    } else {
      // Create new schedule
      repaymentSchedule = await RepaymentSchedule.create({
        loan_account_id: loanAccount.id,
        account_number: String(ACCT_NO),
        customer_id: loanAccount.c_u_s_t__i_d,
        principal_amount: loanAmount,
        interest_rate: effectiveInterestRate,
        interest_rate_type: loanAccount.i_n_t_e_r_e_s_t__r_a_t_e__t_y_p_e || 'FIXED',
        interest_type: loanAccount.i_n_t_e_r_e_s_t__t_y_p_e || 'SIMPLE',
        calculation_method: loanAccount.i_n_t_e_r_e_s_t__c_a_l_c_u_l_a_t_i_o_n__m_e_t_h_o_d || 'FLAT_RATE',
        is_term_based_rate: true,
        term: effectiveTermValue,
        term_type: termType,
        payment_frequency: paymentFrequency,
        emi_amount: emiAmount,
        installments_json: schedule,
        total_interest: totalInterest,
        total_repayment: totalRepayment,
        start_date: scheduleStartDate,
        maturity_date: schedule[schedule.length - 1]?.dueDate || new Date(),
        transaction_id: `SCH-${Date.now()}`,
        created_by: createdBy,
        status: 'ACTIVE'
      }, { transaction });

      // Update loan account with schedule reference
      await loanAccount.update({
        has_repayment_schedule: true,
        repayment_schedule_id: repaymentSchedule.id
      }, { transaction });
    }

    // Create loan event
    await LoanEvent.create({
      ACCT_NO: String(ACCT_NO),
      eventType: forceCreate && existingSchedule ? 'SCHEDULE_UPDATED' : 'SCHEDULE_CREATED',
      status: 'SUCCESS',
      details: {
        termType: termType,
        termValue: effectiveTermValue,
        paymentFrequency: paymentFrequency,
        interestRate: effectiveInterestRate,
        numberOfInstallments: effectiveTermValue,
        totalAmount: loanAmount,
        totalInterest: totalInterest,
        emiAmount: emiAmount,
        isUpdate: forceCreate && existingSchedule
      },
      createdBy: createdBy
    }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: forceCreate && existingSchedule ? 
        'Repayment schedule updated successfully' : 
        'Repayment schedule created successfully',
      data: repaymentSchedule,
      metadata: {
        scheduleId: repaymentSchedule.id,
        action: forceCreate && existingSchedule ? 'UPDATED' : 'CREATED',
        numberOfInstallments: repaymentSchedule.installments_json?.length || 0,
        totalAmount: toDecimal(repaymentSchedule.total_repayment),
        emiAmount: toDecimal(repaymentSchedule.emi_amount),
        firstDueDate: repaymentSchedule.installments_json?.[0]?.dueDate,
        lastDueDate: repaymentSchedule.installments_json?.[repaymentSchedule.installments_json?.length - 1]?.dueDate
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error creating/updating repayment schedule:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to create/update repayment schedule',
      error: error.code || 'SCHEDULE_CREATION_ERROR',
      details: error.details || null
    });
  }
};

/**
 * PUT: Update repayment schedule (partial update)
 */
export const updateRepaymentSchedule = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { ACCT_NO } = req.params;
    const updates = req.body;
    const { updatedBy = 'SYSTEM' } = updates;

    if (!ACCT_NO) {
      throw {
        code: 'MISSING_FIELDS',
        message: 'Loan account number (ACCT_NO) is required',
        status: 400
      };
    }

    // Find repayment schedule
    const repaymentSchedule = await RepaymentSchedule.findOne({
      where: { account_number: String(ACCT_NO) },
      transaction
    });

    if (!repaymentSchedule) {
      throw {
        code: 'SCHEDULE_NOT_FOUND',
        message: 'Repayment schedule not found',
        status: 404
      };
    }

    // Validate updates
    const allowedUpdates = [
      'installments_json', 'status', 'payment_frequency', 'emi_amount',
      'total_interest', 'total_repayment', 'maturity_date'
    ];

    const invalidUpdates = Object.keys(updates).filter(
      key => !allowedUpdates.includes(key) && key !== 'updatedBy'
    );

    if (invalidUpdates.length > 0) {
      throw {
        code: 'INVALID_UPDATES',
        message: `Invalid update fields: ${invalidUpdates.join(', ')}`,
        status: 400
      };
    }

    // Update the schedule
    await repaymentSchedule.update({
      ...updates,
      updated_at: new Date(),
      updated_by: updatedBy
    }, { transaction });

    // Create loan event
    await LoanEvent.create({
      ACCT_NO: String(ACCT_NO),
      eventType: 'SCHEDULE_UPDATED',
      status: 'SUCCESS',
      details: {
        updatedFields: Object.keys(updates).filter(key => key !== 'updatedBy'),
        previousScheduleId: repaymentSchedule.id,
        updatedBy: updatedBy
      },
      createdBy: updatedBy
    }, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Repayment schedule updated successfully',
      data: repaymentSchedule,
      metadata: {
        scheduleId: repaymentSchedule.id,
        updatedAt: repaymentSchedule.updated_at,
        updatedBy: repaymentSchedule.updated_by
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error updating repayment schedule:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to update repayment schedule',
      error: error.code || 'SCHEDULE_UPDATE_ERROR',
      details: error.details || null
    });
  }
};

/**
 * DELETE: Delete repayment schedule
 */
export const deleteRepaymentSchedule = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { ACCT_NO } = req.params;
    const { createdBy = 'SYSTEM' } = req.body;

    if (!ACCT_NO) {
      throw {
        code: 'MISSING_FIELDS',
        message: 'Loan account number (ACCT_NO) is required',
        status: 400
      };
    }

    const repaymentSchedule = await RepaymentSchedule.findOne({
      where: { account_number: String(ACCT_NO) },
      transaction
    });

    if (!repaymentSchedule) {
      throw {
        code: 'SCHEDULE_NOT_FOUND',
        message: 'Repayment schedule not found',
        status: 404
      };
    }

    // Update loan account to remove schedule reference
    await LoanAccount.update({
      has_repayment_schedule: false,
      repayment_schedule_id: null
    }, {
      where: { a_c_c_t__n_o: String(ACCT_NO) },
      transaction
    });

    // Create backup log before deletion
    const backupRecord = {
      originalId: repaymentSchedule.id,
      account_number: repaymentSchedule.account_number,
      installments_json: repaymentSchedule.installments_json,
      deletedAt: new Date(),
      deletedBy: createdBy,
      reason: 'Manual deletion'
    };

    // Log backup (you might want to save this to a separate table)
    console.log('Schedule deleted - Backup:', backupRecord);

    // Delete the schedule
    await repaymentSchedule.destroy({ transaction });

    // Create loan event
    await LoanEvent.create({
      ACCT_NO: String(ACCT_NO),
      eventType: 'SCHEDULE_DELETED',
      status: 'SUCCESS',
      details: {
        scheduleId: repaymentSchedule.id,
        numberOfInstallments: repaymentSchedule.installments_json?.length || 0,
        deletedBy: createdBy
      },
      createdBy: createdBy
    }, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Repayment schedule deleted successfully',
      data: {
        deletedScheduleId: repaymentSchedule.id,
        deletedAt: new Date(),
        numberOfInstallments: repaymentSchedule.installments_json?.length || 0
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error deleting repayment schedule:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to delete repayment schedule',
      error: error.code || 'SCHEDULE_DELETION_ERROR',
      details: error.details || null
    });
  }
};



/**
 * GET: Get overdue installments
 */
export const getOverdueInstallments = async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    const { daysThreshold = 30 } = req.query;

    if (!ACCT_NO) {
      return res.status(400).json({
        success: false,
        message: 'Loan account number (ACCT_NO) is required',
        code: 'MISSING_FIELDS'
      });
    }

    const repaymentSchedule = await RepaymentSchedule.findOne({
      where: { account_number: String(ACCT_NO) }
    });

    if (!repaymentSchedule) {
      return res.status(404).json({
        success: false,
        message: 'Repayment schedule not found',
        code: 'SCHEDULE_NOT_FOUND'
      });
    }

    const schedule = repaymentSchedule.installments_json || [];
    const now = new Date();

    const overdueInstallments = schedule.filter(inst => {
      if (inst.status === 'PAID') return false;
      
      const dueDate = new Date(inst.dueDate);
      const isOverdue = dueDate < now;
      
      if (isOverdue) {
        const daysOverdue = Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24));
        inst.daysOverdue = daysOverdue;
      }
      
      return isOverdue;
    });

    const totalOverdueAmount = overdueInstallments.reduce((sum, inst) => {
      const amountDue = toDecimal(inst.totalPayment || 0) - toDecimal(inst.amountPaid || 0);
      return sum + amountDue;
    }, 0);

    return res.status(200).json({
      success: true,
      message: 'Overdue installments retrieved successfully',
      data: {
        loanAccountNo: ACCT_NO,
        totalInstallments: schedule.length,
        overdueInstallments: overdueInstallments.length,
        totalOverdueAmount,
        overdueInstallments: overdueInstallments.map(inst => ({
          installmentNo: inst.installmentNo,
          dueDate: inst.dueDate,
          daysOverdue: inst.daysOverdue,
          principal: toDecimal(inst.principal || 0),
          interest: toDecimal(inst.interest || 0),
          totalPayment: toDecimal(inst.totalPayment || 0),
          amountPaid: toDecimal(inst.amountPaid || 0),
          amountDue: toDecimal(inst.totalPayment || 0) - toDecimal(inst.amountPaid || 0),
          status: inst.status,
          remainingBalance: toDecimal(inst.remainingBalance || 0)
        }))
      }
    });

  } catch (error) {
    console.error('Error getting overdue installments:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve overdue installments',
      error: error.message,
      code: 'OVERDUE_RETRIEVAL_ERROR'
    });
  }
};

/**
 * POST: Recalculate schedule (for interest rate changes, etc.)
 */
export const recalculateSchedule = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { ACCT_NO } = req.params;
    const {
      newInterestRate,
      newTermValue,
      recalculateFrom = new Date(),
      createdBy = 'SYSTEM'
    } = req.body;

    if (!ACCT_NO) {
      throw {
        code: 'MISSING_FIELDS',
        message: 'Loan account number (ACCT_NO) is required',
        status: 400
      };
    }

    // Find loan and schedule
    const [loanAccount, repaymentSchedule] = await Promise.all([
      LoanAccount.findOne({
        where: { a_c_c_t__n_o: String(ACCT_NO) },
        transaction
      }),
      RepaymentSchedule.findOne({
        where: { account_number: String(ACCT_NO) },
        transaction
      })
    ]);

    if (!loanAccount || !repaymentSchedule) {
      throw {
        code: loanAccount ? 'SCHEDULE_NOT_FOUND' : 'LOAN_NOT_FOUND',
        message: loanAccount ? 'Repayment schedule not found' : 'Loan account not found',
        status: 404
      };
    }

    // Get current outstanding and paid installments
    const currentSchedule = repaymentSchedule.installments_json || [];
    const paidInstallments = currentSchedule.filter(inst => inst.status === 'PAID');
    const remainingInstallments = currentSchedule.filter(inst => inst.status !== 'PAID');
    
    const totalPaid = paidInstallments.reduce((sum, inst) => sum + toDecimal(inst.amountPaid || 0), 0);
    const principalPaid = paidInstallments.reduce((sum, inst) => sum + toDecimal(inst.principalPaid || 0), 0);
    const interestPaid = paidInstallments.reduce((sum, inst) => sum + toDecimal(inst.interestPaid || 0), 0);
    
    const remainingPrincipal = Math.abs(toDecimal(loanAccount.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l || 0));
    const effectiveInterestRate = newInterestRate || toDecimal(repaymentSchedule.interest_rate);
    const effectiveTermValue = newTermValue || (remainingInstallments.length || repaymentSchedule.term);

    // Recalculate remaining schedule
    const newSchedule = [];
    const startDate = new Date(recalculateFrom);
    const monthlyRate = effectiveInterestRate / 100 / 12;

    // Calculate new EMI for remaining amount
    const emi = remainingPrincipal * monthlyRate * Math.pow(1 + monthlyRate, effectiveTermValue) /
                (Math.pow(1 + monthlyRate, effectiveTermValue) - 1);

    let currentPrincipal = remainingPrincipal;
    let totalRemainingInterest = 0;

    for (let i = 1; i <= effectiveTermValue; i++) {
      const interest = currentPrincipal * monthlyRate;
      const principal = emi - interest;
      const totalPayment = principal + interest;
      
      currentPrincipal = Math.max(0, currentPrincipal - principal);
      totalRemainingInterest += interest;

      const dueDate = new Date(startDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      newSchedule.push({
        installmentNo: paidInstallments.length + i,
        dueDate: dueDate.toISOString().split('T')[0],
        principal: toDecimal(principal),
        interest: toDecimal(interest),
        totalPayment: toDecimal(totalPayment),
        remainingBalance: toDecimal(currentPrincipal),
        status: 'PENDING',
        amountPaid: 0.00,
        principalPaid: 0.00,
        interestPaid: 0.00,
        feesPaid: 0.00,
        isRecalculated: true,
        recalculatedAt: new Date()
      });
    }

    // Combine paid and new installments
    const finalSchedule = [...paidInstallments, ...newSchedule];

    // Update repayment schedule
    await repaymentSchedule.update({
      installments_json: finalSchedule,
      interest_rate: effectiveInterestRate,
      term: effectiveTermValue + paidInstallments.length,
      emi_amount: emi,
      total_interest: interestPaid + totalRemainingInterest,
      total_repayment: toDecimal(repaymentSchedule.principal_amount) + interestPaid + totalRemainingInterest,
      maturity_date: newSchedule[newSchedule.length - 1]?.dueDate || repaymentSchedule.maturity_date,
      updated_at: new Date(),
      updated_by: createdBy
    }, { transaction });

    // Create loan event
    await LoanEvent.create({
      ACCT_NO: String(ACCT_NO),
      eventType: 'SCHEDULE_RECALCULATED',
      status: 'SUCCESS',
      details: {
        previousInterestRate: toDecimal(repaymentSchedule.interest_rate),
        newInterestRate: effectiveInterestRate,
        previousTerm: repaymentSchedule.term,
        newTerm: effectiveTermValue + paidInstallments.length,
        paidInstallments: paidInstallments.length,
        recalculatedInstallments: newSchedule.length,
        remainingPrincipal: remainingPrincipal,
        newEMI: emi,
        recalculatedFrom: recalculateFrom
      },
      createdBy: createdBy
    }, { transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Repayment schedule recalculated successfully',
      data: {
        scheduleId: repaymentSchedule.id,
        oldTerm: repaymentSchedule.term,
        newTerm: effectiveTermValue + paidInstallments.length,
        oldInterestRate: toDecimal(repaymentSchedule.interest_rate),
        newInterestRate: effectiveInterestRate,
        oldEMI: toDecimal(repaymentSchedule.emi_amount),
        newEMI: emi,
        totalPaidInstallments: paidInstallments.length,
        totalRecalculatedInstallments: newSchedule.length,
        remainingPrincipal: remainingPrincipal,
        totalRemainingInterest: totalRemainingInterest,
        summary: {
          paidAmount: totalPaid,
          principalPaid: principalPaid,
          interestPaid: interestPaid,
          remainingBalance: currentPrincipal,
          nextDueDate: newSchedule[0]?.dueDate
        }
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Error recalculating schedule:', error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to recalculate schedule',
      error: error.code || 'SCHEDULE_RECALCULATION_ERROR',
      details: error.details || null
    });
  }
};

/**
 * GET: Get payment history for a loan
 */
export const getPaymentHistory = async (req, res) => {
  try {
    const { ACCT_NO } = req.params;
    const { startDate, endDate, limit = 100 } = req.query;

    if (!ACCT_NO) {
      return res.status(400).json({
        success: false,
        message: 'Loan account number (ACCT_NO) is required',
        code: 'MISSING_FIELDS'
      });
    }

    // Build WHERE conditions
    const whereConditions = [`loan_account_number = ?`, `status = ?`];
    const queryParams = [String(ACCT_NO), 'COMPLETED'];

    if (startDate) {
      whereConditions.push(`repayment_date >= ?`);
      queryParams.push(new Date(startDate));
    }

    if (endDate) {
      whereConditions.push(`repayment_date <= ?`);
      queryParams.push(new Date(endDate));
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // Get payments
    const paymentsQuery = `
      SELECT 
        id,
        loan_account_number as ACCT_NO,
        customer_id,
        customer_name,
        principal_amount,
        interest_amount,
        penalty_amount,
        total_amount as amount,
        installment_number,
        repayment_date as date,
        transaction_reference as reference,
        status,
        created_at
      FROM loan_repayments 
      ${whereClause}
      ORDER BY repayment_date DESC 
      LIMIT ?
    `;
    
    const allParams = [...queryParams, parseInt(limit)];
    const [payments] = await sequelize.query(paymentsQuery, {
      replacements: allParams
    });

    // Get totals
    const totalsQuery = `
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as totalAmount,
        COALESCE(SUM(principal_amount), 0) as totalPrincipal,
        COALESCE(SUM(interest_amount), 0) as totalInterest,
        COALESCE(SUM(penalty_amount), 0) as totalPenalty
      FROM loan_repayments 
      ${whereClause}
    `;

    const [totals] = await sequelize.query(totalsQuery, {
      replacements: queryParams
    });

    return res.status(200).json({
      success: true,
      message: 'Payment history retrieved successfully',
      data: {
        loanAccountNo: ACCT_NO,
        totalPayments: parseInt(totals[0]?.count || 0),
        totalAmountPaid: toDecimal(totals[0]?.totalAmount || 0),
        totalPrincipalPaid: toDecimal(totals[0]?.totalPrincipal || 0),
        totalInterestPaid: toDecimal(totals[0]?.totalInterest || 0),
        totalPenaltyPaid: toDecimal(totals[0]?.totalPenalty || 0),
        payments: payments.map(payment => ({
          id: payment.id,
          loanAccountNo: payment.ACCT_NO,
          customerId: payment.customer_id,
          customerName: payment.customer_name,
          date: payment.date,
          installmentNumber: payment.installment_number,
          amount: toDecimal(payment.amount),
          principalPaid: toDecimal(payment.principal_amount),
          interestPaid: toDecimal(payment.interest_amount),
          penaltyPaid: toDecimal(payment.penalty_amount),
          reference: payment.reference,
          status: payment.status,
          createdAt: payment.created_at
        }))
      }
    });

  } catch (error) {
    console.error('Error getting payment history:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve payment history',
      error: error.message,
      code: 'PAYMENT_HISTORY_ERROR'
    });
  }
};

// ============================
// EXPORT ALL FUNCTIONS
// ============================

export default {
  getRepaymentSchedule,
  createRepaymentSchedule,
  updateRepaymentSchedule,
  deleteRepaymentSchedule,
  processSchedulePayment,
  getOverdueInstallments,
  recalculateSchedule,
  getPaymentHistory,
  recordManualRepayment
};