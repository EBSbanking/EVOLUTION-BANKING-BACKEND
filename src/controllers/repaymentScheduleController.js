// controllers/RepaymentScheduleController.js - FINAL WORKING VERSION (with payment_method mapping)
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/CustomerAccount.js';
import LoanRepayment from '../models/LoanRepayment.js';
import LoanRepaymentTransaction from '../models/LoanRepaymentTransaction.js';
import Transaction from '../models/Transaction.js';
import LoanEvent from '../models/LoanEvent.js';
import logger from '../utils/logger.js';
import LoanPortfolio from '../models/LoanPortfolio.js';

// ============================
// HELPER FUNCTIONS
// ============================

const generateTransactionIds = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  const numericId = parseInt(`${timestamp}${random}`, 10);
  
  return {
    TRANSACTION_ID: `TXN-${timestamp}-${random}`,
    EVENT_ID: numericId,
    TRAN_JOURNAL_ID: `JRN-${timestamp}-${random}`,
    JOURNAL_ID: `JID-${timestamp}-${random}`,
    transactionId: `TXID-${timestamp}-${random}`,
    TRANSACTION_IDENTIFIER: numericId
  };
};

const toDecimal = (value) => {
  if (value === null || value === undefined || value === '') return 0.00;
  const num = parseFloat(value);
  return isNaN(num) ? 0.00 : parseFloat(num.toFixed(2));
};

// Map payment method to allowed values in the database
const mapPaymentMethod = (method) => {
  const mapping = {
    'CASH_DEPOSIT': 'CASH',
    'BANK_TRANSFER': 'BANK',
    'MANUAL': 'MANUAL',
    'CASH': 'CASH',
    'BANK': 'BANK',
    'TRANSFER': 'BANK'
  };
  return mapping[method] || 'OTHER';
};

// ============================
// PAYMENT PROCESSING HELPER
// ============================

async function processPaymentAgainstSchedule(repaymentSchedule, amount, paymentDate, loanAccount, transaction) {
  console.log('Processing payment against schedule...');
  let schedule = [...(repaymentSchedule.installments_json || [])];
  if (!schedule.length && repaymentSchedule.schedule) {
    schedule = [...(repaymentSchedule.schedule || [])];
  }
  
  const paymentDateTime = new Date(paymentDate);
  let remainingAmount = amount;
  let totalPrincipalPaid = 0;
  let totalInterestPaid = 0;
  let installmentsUpdated = 0;
  const detailedInstallmentsUpdated = [];

  const rawOutstanding = toDecimal(loanAccount.OUTSTANDING_PRINCIPAL || 0);
  const currentOutstanding = Math.abs(rawOutstanding);
  let previousOutstanding = currentOutstanding;
  
  console.log(`Initial outstanding (abs): ${previousOutstanding}, raw: ${rawOutstanding}`);
  console.log(`Number of installments: ${schedule.length}`);

  schedule.forEach((inst, idx) => {
    if (!inst.installmentNo) inst.installmentNo = idx + 1;
    if (!inst.amountPaid) inst.amountPaid = 0;
    if (!inst.interestPaid) inst.interestPaid = 0;
    if (!inst.principalPaid) inst.principalPaid = 0;
    if (!inst.status) inst.status = 'PENDING';
    if (!inst.remainingBalance) inst.remainingBalance = toDecimal(inst.remainingBalance || previousOutstanding);
    if (inst.status !== 'PAID' && new Date(inst.dueDate) < paymentDateTime) {
      inst.status = 'OVERDUE';
    }
  });

  schedule.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  for (let i = 0; i < schedule.length; i++) {
    const inst = schedule[i];
    if (remainingAmount <= 0.01) break;
    if (inst.status === 'PAID') continue;
    
    const totalDue = toDecimal(inst.totalPayment || (inst.principal + inst.interest));
    const paidSoFar = toDecimal(inst.amountPaid || 0);
    const remainingDue = totalDue - paidSoFar;
    if (remainingDue <= 0.01) continue;

    const payThisInst = Math.min(remainingAmount, remainingDue);
    const totalInterest = toDecimal(inst.interest || 0);
    const totalPrincipal = toDecimal(inst.principal || 0);
    const interestPaidSoFar = toDecimal(inst.interestPaid || 0);
    const principalPaidSoFar = toDecimal(inst.principalPaid || 0);
    
    const remainingInterest = totalInterest - interestPaidSoFar;
    const remainingPrincipal = totalPrincipal - principalPaidSoFar;
    
    let interestThis = Math.min(payThisInst, remainingInterest);
    let principalThis = 0;
    if (payThisInst > interestThis) {
      principalThis = Math.min(payThisInst - interestThis, remainingPrincipal);
    }

    inst.amountPaid = toDecimal(inst.amountPaid) + interestThis + principalThis;
    inst.interestPaid = toDecimal(inst.interestPaid) + interestThis;
    inst.principalPaid = toDecimal(inst.principalPaid) + principalThis;
    
    const previousRemainingBalance = toDecimal(inst.remainingBalance || previousOutstanding);
    inst.remainingBalance = Math.max(0, previousRemainingBalance - principalThis);
    
    if (toDecimal(inst.amountPaid) >= totalDue - 0.01) {
      inst.status = 'PAID';
    } else if (inst.amountPaid > 0) {
      inst.status = 'PARTIAL';
    }

    totalInterestPaid += interestThis;
    totalPrincipalPaid += principalThis;
    remainingAmount -= (interestThis + principalThis);
    installmentsUpdated++;
    
    detailedInstallmentsUpdated.push({
      installmentNo: inst.installmentNo,
      dueDate: inst.dueDate,
      amountPaid: interestThis + principalThis,
      principalPaid: principalThis,
      interestPaid: interestThis,
      status: inst.status,
      previousBalance: previousRemainingBalance,
      newBalance: inst.remainingBalance
    });
    
    previousOutstanding = inst.remainingBalance;
    console.log(`Processed installment ${inst.installmentNo}: principal=${principalThis}, interest=${interestThis}, newBalance=${inst.remainingBalance}, status=${inst.status}`);
  }

  const newOutstandingPositive = Math.max(0, currentOutstanding - totalPrincipalPaid);
  const isFinalPayment = schedule.every(inst => inst.status === 'PAID');

  console.log('Payment processing result:', {
    totalPrincipalPaid,
    totalInterestPaid,
    previousOutstanding: currentOutstanding,
    newOutstanding: newOutstandingPositive,
    isFinalPayment,
    installmentsUpdated,
    remainingAmount
  });

  return {
    updatedSchedule: schedule,
    totalPrincipalPaid,
    totalInterestPaid,
    previousOutstanding: currentOutstanding,
    newOutstanding: newOutstandingPositive,
    isFinalPayment,
    installmentsUpdated,
    detailedInstallmentsUpdated,
    remainingAmount
  };
}
// ============================
// CREATE LOAN REPAYMENT RECORDS (with unique reference and mapped payment method)
// ============================

async function createLoanRepaymentRecords(loanData, transaction) {
  console.log('Creating loan repayment records...');
  try {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000000);
    const uniqueRef = `REPAY-${timestamp}-${random}-${loanData.loanAccountId}`;
    const mappedPaymentMethod = mapPaymentMethod(loanData.paymentMethod || 'CASH');
    
    const loanRepaymentData = {
      loan_account_id: loanData.loanAccountId,
      loan_account_number: loanData.ACCT_NO,
      customer_id: loanData.CUST_ID,
      customer_name: loanData.customerName || 'Customer',
      principal_amount: loanData.principalPaid || 0,
      interest_amount: loanData.interestPaid || 0,
      penalty_amount: loanData.penaltyAmount || 0,
      total_amount: loanData.amount,
      installment_number: loanData.installmentNo || null,
      repayment_date: new Date(loanData.paymentDate),
      transaction_reference: uniqueRef,
      status: 'COMPLETED',
      collection_id: loanData.collectionId || null
    };
    console.log('Creating loan_repayments record:', loanRepaymentData);
    const loanRepayment = await LoanRepayment.create(loanRepaymentData, { transaction });
    
    const repaymentTransactionData = {
      accountId: loanData.loanAccountId,
      accountNumber: loanData.ACCT_NO,
      customerId: loanData.CUST_ID,
      transactionDate: new Date(loanData.paymentDate),
      transactionType: 'REPAYMENT',
      amount: loanData.amount,
      principalAmount: loanData.principalPaid || 0,
      interestAmount: loanData.interestPaid || 0,
      paymentMethod: mappedPaymentMethod,
      transactionReference: uniqueRef,
      repaymentType: 'REPAYMENT',
      isInstallment: loanData.isInstallment || true,
      createdBy: loanData.createdBy || 'system',
      status: 'COMPLETED',
      receiptNo: `RCP-${Date.now()}`,
      notes: loanData.description || 'Loan repayment against schedule'
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
// MAIN CONTROLLER
// ============================

export const processSchedulePayment = async (req, res) => {
  console.log('=== PROCESSING SCHEDULE PAYMENT ===');
  const transaction = await sequelize.transaction();
  try {
    const { ACCT_NO } = req.params;
    const { amount, customerAccountNo, paymentMethod = 'CASH_DEPOSIT', referenceNumber, description, paymentDate = new Date(), createdBy = 'SYSTEM' } = req.body;
    console.log('Payment request:', { ACCT_NO, amount, customerAccountNo, paymentMethod });
    if (!ACCT_NO) throw { code: 'MISSING_ACCT_NO', message: 'Loan account number is required', status: 400 };
    if (!amount || isNaN(amount) || amount <= 0) throw { code: 'INVALID_AMOUNT', message: 'Valid payment amount is required', status: 400 };
    if (!customerAccountNo) throw { code: 'MISSING_CUSTOMER_ACCOUNT', message: 'Customer account number is required', status: 400 };

    // Find Loan Account
    const loanAccount = await LoanAccount.findOne({ where: { ACCT_NO: String(ACCT_NO) }, transaction });
    if (!loanAccount) throw { code: 'LOAN_NOT_FOUND', message: `Loan account ${ACCT_NO} not found`, status: 404 };
    console.log('Found loan account:', { ACCT_NO: loanAccount.ACCT_NO, id: loanAccount.id, status: loanAccount.LOAN_STATUS, outstanding: loanAccount.OUTSTANDING_PRINCIPAL });

    // ✅ Allow repayments for OVERDUE loans
    const validStatuses = ['ACTIVE', 'DISBURSED', 'ONGOING', 'OVERDUE'];
    const loanStatus = loanAccount.LOAN_STATUS;
    if (!validStatuses.includes(loanStatus?.toUpperCase())) {
      throw { code: 'INVALID_LOAN_STATUS', message: `Loan not active. Status: ${loanStatus}`, status: 400 };
    }

    // Find Customer Account
    const customerAccount = await CustomerAccount.findOne({ where: { account_number: String(customerAccountNo) }, transaction });
    if (!customerAccount) throw { code: 'CUSTOMER_NOT_FOUND', message: `Customer account ${customerAccountNo} not found`, status: 404 };
    const customerBalance = toDecimal(customerAccount.ledger_balance || customerAccount.available_balance || 0);
    if (customerBalance < amount) throw { code: 'INSUFFICIENT_FUNDS', message: `Insufficient funds. Available: ${customerBalance}`, status: 400 };

    // Find Repayment Schedule
    const repaymentSchedule = await RepaymentSchedule.findOne({ where: { account_number: String(ACCT_NO) }, transaction });
    if (!repaymentSchedule) throw { code: 'NO_SCHEDULE', message: 'No repayment schedule found for this loan', status: 400 };

    // Process payment
    const paymentResult = await processPaymentAgainstSchedule(repaymentSchedule, amount, paymentDate, loanAccount, transaction);
    console.log('Step 5: Payment processed successfully');

    // Update Loan Account
    const currentTotalRepaid = toDecimal(loanAccount.TOTAL_REPAID_AMOUNT || 0);
    await loanAccount.update({
      OUTSTANDING_PRINCIPAL: -paymentResult.newOutstanding,
      TOTAL_REPAID_AMOUNT: currentTotalRepaid + amount,
      LAST_REPAYMENT_DATE: new Date(paymentDate),
      LAST_REPAYMENT_AMOUNT: amount,
      ...(paymentResult.isFinalPayment && { LOAN_STATUS: 'CLOSED', CLOSURE_DATE: new Date(paymentDate) })
    }, { transaction });
    console.log('Step 6: Loan account updated');

    // Update Customer Account balance
    const updateFields = {};
    if (customerAccount.ledger_balance !== undefined) updateFields.ledger_balance = customerBalance - amount;
    if (customerAccount.available_balance !== undefined) updateFields.available_balance = customerBalance - amount;
    await customerAccount.update(updateFields, { transaction });
    console.log('Step 7: Customer account updated');

    // Update Repayment Schedule
    await repaymentSchedule.update({
      installments_json: paymentResult.updatedSchedule,
      schedule: paymentResult.updatedSchedule,
      status: paymentResult.isFinalPayment ? 'COMPLETED' : 'ACTIVE'
    }, { transaction });
    console.log('Step 8: Repayment schedule updated');

    // Create repayment records
    const repaymentRecords = await createLoanRepaymentRecords({
      loanAccountId: loanAccount.id,
      ACCT_NO: loanAccount.ACCT_NO,
      CUST_ID: loanAccount.CUST_ID,
      customerName: loanAccount.ACCT_NM,
      amount: amount,
      principalPaid: paymentResult.totalPrincipalPaid,
      interestPaid: paymentResult.totalInterestPaid,
      paymentDate: paymentDate,
      paymentMethod: paymentMethod,
      description: description || 'Loan repayment against schedule',
      installmentNo: paymentResult.detailedInstallmentsUpdated[0]?.installmentNo,
      isInstallment: paymentResult.installmentsUpdated > 0,
      createdBy: createdBy
    }, transaction);
    console.log('Step 9: Repayment records created', repaymentRecords);

    // ✅ Update Loan Portfolio
    try {
      const currentDate = new Date(paymentDate);
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      const branchId = loanAccount.BU_ID || '001';
      const productId = loanAccount.LOAN_PRODUCT_ID;

      let portfolio = await LoanPortfolio.findOne({
        where: {
          BRANCH_ID: branchId,
          PROD_ID: productId,
          MONTH: month,
          YEAR: year,
          CURRENCY: 'NGN'
        },
        transaction
      });

      if (!portfolio) {
        // Create a new portfolio record for this month if not exists
        portfolio = await LoanPortfolio.create({
          BRANCH_ID: branchId,
          PROD_ID: productId,
          PRODUCT_CODE: 'DEFAULT',
          PRODUCT_NAME: 'General Loan',
          PRODUCT_TYPE: 'GENERAL_LOAN',
          MONTH: month,
          YEAR: year,
          CURRENCY: 'NGN',
          TOTAL_DISBURSED: 0,
          TOTAL_PRINCIPAL: 0,
          OUTSTANDING_PRINCIPAL: 0,
          TOTAL_REPAYMENTS: 0,
          TOTAL_RECOVERED: 0,
          NUMBER_OF_LOANS: 0,
          ACTIVE_LOANS: 0,
          DISBURSEMENT_COUNT: 0,
          STATUS: 'ACTIVE',
          CREATED_BY: createdBy,
          UPDATED_BY: createdBy
        }, { transaction });
      }

      // Update portfolio metrics
      const totalRepayments = toDecimal(portfolio.TOTAL_REPAYMENTS) + amount;
      const totalRecovered = toDecimal(portfolio.TOTAL_RECOVERED) + paymentResult.totalPrincipalPaid;
      const totalInterestReceived = toDecimal(portfolio.TOTAL_INTEREST_RECEIVED) + paymentResult.totalInterestPaid;
      const newOutstandingPortfolio = Math.max(0, toDecimal(portfolio.OUTSTANDING_PRINCIPAL) - paymentResult.totalPrincipalPaid);

      await portfolio.update({
        TOTAL_REPAYMENTS: totalRepayments,
        TOTAL_RECOVERED: totalRecovered,
        TOTAL_INTEREST_RECEIVED: totalInterestReceived,
        OUTSTANDING_PRINCIPAL: newOutstandingPortfolio,
        UPDATED_DATE: new Date(),
        UPDATED_BY: createdBy
      }, { transaction });

      // If loan is fully repaid, decrement active loans count
      if (paymentResult.isFinalPayment) {
        const activeLoans = Math.max(0, (portfolio.ACTIVE_LOANS || 0) - 1);
        await portfolio.update({ ACTIVE_LOANS: activeLoans }, { transaction });
      }

      console.log('Step 9b: Loan portfolio updated');
    } catch (portfolioError) {
      console.error('Error updating loan portfolio:', portfolioError);
      // Don't fail the entire transaction – portfolio update is non‑critical
    }

    // Create Transaction record
    const TRANSACTION_IDS = generateTransactionIds();
    const customerName = customerAccount.account_name || loanAccount.ACCT_NM || 'Customer';
    const businessUnitId = loanAccount.BU_ID || customerAccount.BU_ID || 1;
    const accountId = loanAccount.ACCT_ID || customerAccount.ACCT_ID || 'DEFAULT_ACCT';
    const uniqueTransactionRef = `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}-${loanAccount.id}`;

    await Transaction.create({
      TRANSACTION_IDENTIFIER: TRANSACTION_IDS.TRANSACTION_IDENTIFIER,
      TRANSACTION_ID: TRANSACTION_IDS.TRANSACTION_ID,
      EVENT_ID: TRANSACTION_IDS.EVENT_ID,
      TRAN_JOURNAL_ID: TRANSACTION_IDS.TRAN_JOURNAL_ID,
      JOURNAL_ID: TRANSACTION_IDS.JOURNAL_ID,
      transactionId: TRANSACTION_IDS.transactionId,
      REFERENCE: uniqueTransactionRef,
      ACCT_NO: String(customerAccountNo),
      ACCT_ID: accountId,
      BU_ID: businessUnitId,
      CUST_ID: String(loanAccount.CUST_ID),
      ACCT_NM: customerName,
      AMOUNT: amount,
      TRANSACTION_TYPE: 'LOAN_REPAYMENT',
      TRANSACTIONDATE: new Date(paymentDate),
      transactionDirection: 'DEBIT',
      description: description || `Loan repayment for ${ACCT_NO}`,
      currency: 'NGN',
      createdBy: createdBy,
      status: 'COMPLETED',
      metadata: {
        loanAccount: ACCT_NO,
        customerAccount: customerAccountNo,
        paymentMethod: paymentMethod,
        isFinalPayment: paymentResult.isFinalPayment,
        principalPaid: paymentResult.totalPrincipalPaid,
        interestPaid: paymentResult.totalInterestPaid,
        loanRepaymentId: repaymentRecords.loanRepaymentId,
        repaymentTransactionId: repaymentRecords.repaymentTransactionId,
        externalReference: referenceNumber || null
      }
    }, { transaction });
    console.log('Step 10: Transaction record created');

    // Create Loan Event
    await LoanEvent.create({
      ACCT_NO: String(ACCT_NO),
      LOAN_ACCOUNT_ID: loanAccount.id,
      CUST_ID: String(loanAccount.CUST_ID),
      eventType: 'INSTALLMENT_PAID',
      status: 'PROCESSED',
      installmentNumber: paymentResult.detailedInstallmentsUpdated[0]?.installmentNo || 1,
      dueDate: paymentResult.detailedInstallmentsUpdated[0]?.dueDate || new Date(paymentDate),
      paymentDate: new Date(paymentDate),
      amount: amount,
      principalAmount: paymentResult.totalPrincipalPaid,
      interestAmount: paymentResult.totalInterestPaid,
      transactionId: repaymentRecords.repaymentTransactionId,
      repaymentScheduleId: repaymentSchedule.id,
      details: {
        paymentMethod: paymentMethod,
        isFinalPayment: paymentResult.isFinalPayment,
        installmentsUpdated: paymentResult.detailedInstallmentsUpdated,
        loanRepaymentId: repaymentRecords.loanRepaymentId
      },
      createdBy: createdBy,
      branchId: loanAccount.BU_ID || null,
      timestamp: new Date(),
      effectiveDate: new Date(paymentDate)
    }, { transaction });
    console.log('Step 11: Loan event created');

    await transaction.commit();
    console.log('Step 12: Transaction committed');

    return res.status(200).json({
      success: true,
      message: 'Payment processed successfully against schedule',
      data: {
        repaymentId: repaymentRecords.loanRepaymentId,
        repaymentTransactionId: repaymentRecords.repaymentTransactionId,
        loanAccount: {
          ACCT_NO: loanAccount.ACCT_NO,
          accountName: loanAccount.ACCT_NM,
          newOutstanding: paymentResult.newOutstanding,
          previousOutstanding: paymentResult.previousOutstanding,
          loanStatus: paymentResult.isFinalPayment ? 'CLOSED' : loanAccount.LOAN_STATUS
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
          totalInstallments: paymentResult.updatedSchedule.length,
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
    if (transaction) await transaction.rollback();
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to process payment against schedule',
      error: error.code || 'SCHEDULE_PAYMENT_ERROR'
    });
  }
};

// ============================
// OTHER CONTROLLER FUNCTIONS (unchanged)
// ============================

export const recordManualRepayment = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { ACCT_NO } = req.params;
    const repaymentData = req.body;

    console.log('📝 Processing manual repayment for account:', ACCT_NO);

    const loanAccount = await LoanAccount.findOne({ 
      where: { ACCT_NO: String(ACCT_NO) },
      transaction
    });
    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: 'Loan account not found',
        code: 'LOAN_ACCOUNT_NOT_FOUND'
      });
    }

    const amount = parseFloat(repaymentData.amount);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid repayment amount is required',
        code: 'INVALID_AMOUNT'
      });
    }

    const repaymentRecords = await createLoanRepaymentRecords({
      loanAccountId: loanAccount.id,
      ACCT_NO: loanAccount.ACCT_NO,
      CUST_ID: loanAccount.CUST_ID,
      customerName: loanAccount.ACCT_NM,
      amount: amount,
      principalPaid: parseFloat(repaymentData.principalPaid || amount),
      interestPaid: parseFloat(repaymentData.interestPaid || 0),
      penaltyAmount: parseFloat(repaymentData.penaltyAmount || 0),
      paymentDate: repaymentData.date || new Date(),
      paymentMethod: repaymentData.paymentMethod || 'MANUAL',
      description: repaymentData.description || 'Manual repayment',
      createdBy: req.user?.id || 'system'
    }, transaction);

    if (repaymentData.updateOutstanding !== false) {
      const currentOutstanding = Math.abs(toDecimal(loanAccount.OUTSTANDING_PRINCIPAL || 0));
      const principalPaid = parseFloat(repaymentData.principalPaid || amount);
      const newOutstanding = Math.max(0, currentOutstanding - principalPaid);
      
      await loanAccount.update({
        OUTSTANDING_PRINCIPAL: -newOutstanding,
        TOTAL_REPAID_AMOUNT: toDecimal(loanAccount.TOTAL_REPAID_AMOUNT || 0) + amount,
        LAST_REPAYMENT_DATE: new Date(repaymentData.date || Date.now()),
        LAST_REPAYMENT_AMOUNT: amount
      }, { transaction });
    }

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Manual repayment recorded successfully',
      data: {
        loanRepaymentId: repaymentRecords.loanRepaymentId,
        repaymentTransactionId: repaymentRecords.repaymentTransactionId,
        receiptNumber: `RCP-${Date.now()}`,
        transactionReference: repaymentData.referenceNumber || `MANUAL-${Date.now()}`
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Record manual repayment error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to record manual repayment',
      error: error.message,
      code: 'REPAYMENT_RECORDING_ERROR'
    });
  }
};

export const getRepaymentSchedule = async (req, res) => {
  // (Keep your existing implementation – unchanged)
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

    const repaymentSchedule = await RepaymentSchedule.findOne({
      where: { account_number: String(ACCT_NO) }
    });

    if (!repaymentSchedule) {
      return res.status(200).json({
        success: true,
        message: 'No repayment schedule found for this loan account',
        code: 'NO_SCHEDULE',
        data: {
          loanAccountInfo: { accountNumber: ACCT_NO, message: 'No repayment schedule found' },
          hasSchedule: false,
          schedule: null
        }
      });
    }

    let lastRepaymentDate = null;
    const loanAccount = await LoanAccount.findOne({
      where: { ACCT_NO: String(ACCT_NO) },
      attributes: ['LAST_REPAYMENT_DATE']
    });
    if (loanAccount && loanAccount.LAST_REPAYMENT_DATE) {
      let rawDate = loanAccount.LAST_REPAYMENT_DATE;
      if (typeof rawDate === 'string' && rawDate.includes(' ')) rawDate = rawDate.replace(' ', 'T');
      lastRepaymentDate = rawDate;
    }

    let installments = repaymentSchedule.installments_json || [];
    if (!installments.length && repaymentSchedule.schedule) installments = repaymentSchedule.schedule;

    const payments = await LoanRepayment.findAll({
      where: { loan_account_number: String(ACCT_NO) },
      attributes: ['installment_number', 'repayment_date'],
      raw: true
    });
    const paymentDateMap = new Map();
    payments.forEach(p => {
      if (p.installment_number && !paymentDateMap.has(p.installment_number)) {
        let paidDate = p.repayment_date;
        if (typeof paidDate === 'string' && paidDate.includes(' ')) paidDate = paidDate.replace(' ', 'T');
        paymentDateMap.set(p.installment_number, paidDate);
      }
    });

    const now = new Date();
    const formattedInstallments = installments.map((inst, idx) => {
      const instNo = inst.installmentNo || inst.installment_number || (idx + 1);
      let paidDate = paymentDateMap.get(instNo) || inst.paidDate || null;
      const statusNormalized = (inst.status || '').toUpperCase();
      const isPaid = statusNormalized === 'PAID' || statusNormalized === 'COMPLETED';
      if (!paidDate && isPaid && lastRepaymentDate) paidDate = lastRepaymentDate;

      return {
        ...inst,
        principal: toDecimal(inst.principal),
        interest: toDecimal(inst.interest),
        totalPayment: toDecimal(inst.totalPayment),
        remainingBalance: toDecimal(inst.remainingBalance),
        amountPaid: toDecimal(inst.amountPaid || 0),
        principalPaid: toDecimal(inst.principalPaid || 0),
        interestPaid: toDecimal(inst.interestPaid || 0),
        paidDate: paidDate
      };
    });

    const paidInstallments = formattedInstallments.filter(i => i.status === 'PAID');
    const pendingInstallments = formattedInstallments.filter(i => i.status !== 'PAID');
    const overdueInstallments = pendingInstallments.filter(i => {
      if (!i.dueDate) return false;
      try { return new Date(i.dueDate) < now; } catch { return false; }
    });

    const totalPaid = paidInstallments.reduce((sum, i) => sum + i.totalPayment, 0);
    const totalOutstanding = pendingInstallments.reduce((sum, i) => sum + i.totalPayment, 0);

    const responseData = {
      success: true,
      message: 'Repayment schedule retrieved successfully',
      data: {
        loanAccountInfo: {
          id: repaymentSchedule.id,
          accountNumber: repaymentSchedule.account_number,
          customerId: repaymentSchedule.customer_id,
          startDate: repaymentSchedule.start_date,
          maturityDate: repaymentSchedule.maturity_date,
          principalAmount: toDecimal(repaymentSchedule.principal_amount),
          interestRate: toDecimal(repaymentSchedule.interest_rate),
          term: repaymentSchedule.term || 0,
          termType: repaymentSchedule.term_type || 'M',
          paymentFrequency: repaymentSchedule.payment_frequency || 'MONTHLY',
          emiAmount: toDecimal(repaymentSchedule.emi_amount),
          totalInterest: toDecimal(repaymentSchedule.total_interest),
          totalRepayment: toDecimal(repaymentSchedule.total_repayment),
          status: repaymentSchedule.status || 'PENDING'
        },
        hasSchedule: true,
        schedule: {
          id: repaymentSchedule.id,
          totalInstallments: formattedInstallments.length,
          summary: {
            totalPrincipal: toDecimal(repaymentSchedule.principal_amount),
            totalInterest: toDecimal(repaymentSchedule.total_interest),
            totalAmount: toDecimal(repaymentSchedule.total_repayment),
            totalPaid: totalPaid,
            totalOutstanding: totalOutstanding,
            paidInstallments: paidInstallments.length,
            pendingInstallments: pendingInstallments.length,
            overdueInstallments: overdueInstallments.length,
            nextDueDate: pendingInstallments.length ? pendingInstallments[0].dueDate : null,
            lastPaidDate: paidInstallments.length ? paidInstallments[paidInstallments.length-1].paidDate : null
          }
        }
      }
    };

    if (includeDetails === 'true') {
      responseData.data.schedule.detailedInstallments = formattedInstallments.map((inst, idx) => {
        const isPaid = inst.status === 'PAID';
        let isOverdue = false;
        if (inst.dueDate && !isPaid) {
          try { isOverdue = new Date(inst.dueDate) < now; } catch(e) {}
        }
        return {
          installmentNumber: inst.installmentNo || idx+1,
          dueDate: inst.dueDate,
          principalAmount: inst.principal,
          interestAmount: inst.interest,
          totalAmount: inst.totalPayment,
          remainingBalance: inst.remainingBalance,
          amountPaid: inst.amountPaid,
          paidDate: inst.paidDate || null,
          status: isPaid ? 'PAID' : (isOverdue ? 'OVERDUE' : 'PENDING'),
          lateFee: inst.lateFee || 0
        };
      });
    }

    return res.status(200).json(responseData);
  } catch (error) {
    console.error('❌ Error getting repayment schedule:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to retrieve repayment schedule',
      error: error.message,
      code: 'SCHEDULE_RETRIEVAL_ERROR'
    });
  }
};

export const createRepaymentSchedule = async (req, res) => {
  // (Keep your existing implementation – unchanged)
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

    if (!ACCT_NO) throw { code: 'MISSING_FIELDS', message: 'Loan account number required', status: 400 };

    const loanAccount = await LoanAccount.findOne({ where: { ACCT_NO: String(ACCT_NO) }, transaction });
    if (!loanAccount) throw { code: 'LOAN_NOT_FOUND', message: 'Loan account not found', status: 404 };

    const existingSchedule = await RepaymentSchedule.findOne({ where: { account_number: String(ACCT_NO) }, transaction });
    if (existingSchedule && !forceCreate) {
      await transaction.rollback();
      return res.status(200).json({
        success: true,
        message: 'Repayment schedule already exists',
        code: 'SCHEDULE_EXISTS',
        data: existingSchedule
      });
    }

    const loanAmount = toDecimal(loanAccount.AMOUNT || loanAccount.DISBURSEMENT_LIMIT || 0);
    const effectiveTerm = termValue || loanAccount.TERM_VALUE || 12;
    const effectiveRate = interestRate || toDecimal(loanAccount.INTEREST_RATE) || 12.0;
    const scheduleStartDate = new Date(startDate || loanAccount.DISBURSEMENT_DATE || new Date());

    if (loanAmount <= 0) throw { code: 'INVALID_LOAN_AMOUNT', message: 'Loan amount must be > 0', status: 400 };
    if (effectiveTerm <= 0) throw { code: 'INVALID_TERM', message: 'Term must be > 0', status: 400 };

    const totalInterest = loanAmount * (effectiveRate / 100) * (effectiveTerm / 12);
    const totalRepayment = loanAmount + totalInterest;
    const emiAmount = totalRepayment / effectiveTerm;

    let remainingPrincipal = loanAmount;
    const installments = [];

    for (let i = 1; i <= effectiveTerm; i++) {
      const interestPortion = totalInterest / effectiveTerm;
      let principalPortion = emiAmount - interestPortion;
      if (i === effectiveTerm) principalPortion = remainingPrincipal;
      remainingPrincipal -= principalPortion;
      if (remainingPrincipal < 0.01) remainingPrincipal = 0;

      const dueDate = new Date(scheduleStartDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      installments.push({
        installmentNo: i,
        dueDate: dueDate.toISOString().split('T')[0],
        principal: toDecimal(principalPortion),
        interest: toDecimal(interestPortion),
        totalPayment: toDecimal(principalPortion + interestPortion),
        remainingBalance: toDecimal(remainingPrincipal),
        status: 'PENDING',
        amountPaid: 0,
        principalPaid: 0,
        interestPaid: 0
      });
    }

    let repaymentSchedule;
    if (existingSchedule && forceCreate) {
      repaymentSchedule = await existingSchedule.update({
        principal_amount: loanAmount,
        interest_rate: effectiveRate,
        term: effectiveTerm,
        term_type: termType,
        payment_frequency: paymentFrequency,
        emi_amount: emiAmount,
        installments_json: installments,
        schedule: installments,
        total_interest: totalInterest,
        total_repayment: totalRepayment,
        start_date: scheduleStartDate,
        maturity_date: installments[installments.length-1]?.dueDate,
        status: 'ACTIVE',
        updated_at: new Date(),
        updated_by: createdBy
      }, { transaction });
    } else {
      repaymentSchedule = await RepaymentSchedule.create({
        loan_account_id: loanAccount.id,
        account_number: String(ACCT_NO),
        customer_id: loanAccount.CUST_ID,
        principal_amount: loanAmount,
        interest_rate: effectiveRate,
        interest_rate_type: loanAccount.INTEREST_RATE_TYPE || 'FIXED',
        interest_type: loanAccount.INTEREST_TYPE || 'SIMPLE',
        calculation_method: 'FLAT_RATE',
        is_term_based_rate: true,
        term: effectiveTerm,
        term_type: termType,
        payment_frequency: paymentFrequency,
        emi_amount: emiAmount,
        installments_json: installments,
        schedule: installments,
        total_interest: totalInterest,
        total_repayment: totalRepayment,
        start_date: scheduleStartDate,
        maturity_date: installments[installments.length-1]?.dueDate,
        transaction_id: `SCH-${Date.now()}`,
        created_by: createdBy,
        status: 'ACTIVE'
      }, { transaction });

      await loanAccount.update({ hasRepaymentSchedule: true, repaymentScheduleId: repaymentSchedule.id }, { transaction });
    }

    await LoanEvent.create({
      ACCT_NO: String(ACCT_NO),
      eventType: existingSchedule && forceCreate ? 'SCHEDULE_UPDATED' : 'SCHEDULE_CREATED',
      status: 'PROCESSED',
      details: { termValue: effectiveTerm, interestRate: effectiveRate, installments: effectiveTerm },
      createdBy: createdBy
    }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: existingSchedule && forceCreate ? 'Schedule updated' : 'Schedule created',
      data: repaymentSchedule,
      metadata: { scheduleId: repaymentSchedule.id, installments: installments.length, emiAmount }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error creating schedule:', error);
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
};

export const updateRepaymentSchedule = async (req, res) => {
  // Keep your existing implementation – unchanged
  const transaction = await sequelize.transaction();
  
  try {
    const { ACCT_NO } = req.params;
    const updates = { ...req.body };
    const { updatedBy = 'SYSTEM' } = updates;

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

    const allowedUpdates = [
      'installments_json', 'schedule', 'status', 'payment_frequency', 'emi_amount',
      'total_interest', 'total_repayment', 'maturity_date', 'is_schedule_complete'
    ];

    const filteredUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key) && key !== 'updatedBy') {
        filteredUpdates[key] = updates[key];
      }
    });

    if (filteredUpdates.installments_json && !filteredUpdates.schedule) {
      filteredUpdates.schedule = filteredUpdates.installments_json;
    }
    if (filteredUpdates.schedule && !filteredUpdates.installments_json) {
      filteredUpdates.installments_json = filteredUpdates.schedule;
    }

    if (Object.keys(filteredUpdates).length === 0) {
      throw {
        code: 'NO_VALID_UPDATES',
        message: 'No valid fields to update',
        status: 400
      };
    }

    filteredUpdates.updated_at = new Date();
    await repaymentSchedule.update(filteredUpdates, { transaction });

    await LoanEvent.create({
      ACCT_NO: String(ACCT_NO),
      eventType: 'SCHEDULE_UPDATED',
      status: 'PROCESSED',
      details: {
        updatedFields: Object.keys(filteredUpdates).filter(k => k !== 'updated_at'),
        previousScheduleId: repaymentSchedule.id,
        updatedBy: updatedBy
      },
      createdBy: updatedBy
    }, { transaction });

    await transaction.commit();
    await repaymentSchedule.reload({ transaction: null });

    return res.status(200).json({
      success: true,
      message: 'Repayment schedule updated successfully',
      data: repaymentSchedule,
      metadata: {
        scheduleId: repaymentSchedule.id,
        updatedAt: repaymentSchedule.updated_at
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

export const deleteRepaymentSchedule = async (req, res) => {
  // Keep your existing implementation – unchanged
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

    await LoanAccount.update({
      hasRepaymentSchedule: false,
      repaymentScheduleId: null
    }, {
      where: { ACCT_NO: String(ACCT_NO) },
      transaction
    });

    console.log('Schedule deleted - Backup:', {
      originalId: repaymentSchedule.id,
      account_number: repaymentSchedule.account_number,
      installments_json: repaymentSchedule.installments_json,
      deletedAt: new Date(),
      deletedBy: createdBy
    });

    await repaymentSchedule.destroy({ transaction });

    await LoanEvent.create({
      ACCT_NO: String(ACCT_NO),
      eventType: 'SCHEDULE_DELETED',
      status: 'PROCESSED',
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

export const getOverdueInstallments = async (req, res) => {
  // Keep your existing implementation – unchanged
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

export const recalculateSchedule = async (req, res) => {
  // Keep your existing implementation – unchanged
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

    const [loanAccount, repaymentSchedule] = await Promise.all([
      LoanAccount.findOne({ where: { ACCT_NO: String(ACCT_NO) }, transaction }),
      RepaymentSchedule.findOne({ where: { account_number: String(ACCT_NO) }, transaction })
    ]);

    if (!loanAccount || !repaymentSchedule) {
      throw {
        code: loanAccount ? 'SCHEDULE_NOT_FOUND' : 'LOAN_NOT_FOUND',
        message: loanAccount ? 'Repayment schedule not found' : 'Loan account not found',
        status: 404
      };
    }

    const currentSchedule = repaymentSchedule.installments_json || [];
    const paidInstallments = currentSchedule.filter(inst => inst.status === 'PAID');
    const remainingInstallments = currentSchedule.filter(inst => inst.status !== 'PAID');
    
    const totalPaid = paidInstallments.reduce((sum, inst) => sum + toDecimal(inst.amountPaid || 0), 0);
    const principalPaid = paidInstallments.reduce((sum, inst) => sum + toDecimal(inst.principalPaid || 0), 0);
    const interestPaid = paidInstallments.reduce((sum, inst) => sum + toDecimal(inst.interestPaid || 0), 0);
    
    const remainingPrincipal = Math.abs(toDecimal(loanAccount.OUTSTANDING_PRINCIPAL || 0));
    const effectiveInterestRate = newInterestRate || toDecimal(repaymentSchedule.interest_rate);
    const effectiveTermValue = newTermValue || (remainingInstallments.length || repaymentSchedule.term);

    const newSchedule = [];
    const startDate = new Date(recalculateFrom);
    const monthlyRate = effectiveInterestRate / 100 / 12;

    let emi;
    if (monthlyRate === 0) {
      emi = remainingPrincipal / effectiveTermValue;
    } else {
      emi = remainingPrincipal * monthlyRate * Math.pow(1 + monthlyRate, effectiveTermValue) /
            (Math.pow(1 + monthlyRate, effectiveTermValue) - 1);
    }

    let currentPrincipal = remainingPrincipal;
    let totalRemainingInterest = 0;

    for (let i = 1; i <= effectiveTermValue; i++) {
      const interest = currentPrincipal * monthlyRate;
      let principal = emi - interest;
      let totalPayment = principal + interest;
      
      if (i === effectiveTermValue) {
        principal = currentPrincipal;
        totalPayment = principal + interest;
      }
      
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

    const finalSchedule = [...paidInstallments, ...newSchedule];

    await repaymentSchedule.update({
      installments_json: finalSchedule,
      schedule: finalSchedule,
      interest_rate: effectiveInterestRate,
      term: effectiveTermValue + paidInstallments.length,
      emi_amount: emi,
      total_interest: interestPaid + totalRemainingInterest,
      total_repayment: toDecimal(repaymentSchedule.principal_amount) + interestPaid + totalRemainingInterest,
      maturity_date: newSchedule[newSchedule.length - 1]?.dueDate || repaymentSchedule.maturity_date,
      updated_at: new Date()
    }, { transaction });

    await LoanEvent.create({
      ACCT_NO: String(ACCT_NO),
      eventType: 'SCHEDULE_RECALCULATED',
      status: 'PROCESSED',
      details: {
        previousInterestRate: toDecimal(repaymentSchedule.interest_rate),
        newInterestRate: effectiveInterestRate,
        previousTerm: repaymentSchedule.term,
        newTerm: effectiveTermValue + paidInstallments.length,
        paidInstallments: paidInstallments.length,
        recalculatedInstallments: newSchedule.length,
        remainingPrincipal: remainingPrincipal,
        newEMI: emi,
        recalculatedFrom: recalculateFrom,
        recalculatedBy: createdBy
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
        newEMI: toDecimal(emi),
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

export const getPaymentHistory = async (req, res) => {
  // Keep your existing implementation – unchanged
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

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

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
    const [payments] = await sequelize.query(paymentsQuery, { replacements: allParams });

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
    const [totals] = await sequelize.query(totalsQuery, { replacements: queryParams });

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
  processSchedulePayment,
  recordManualRepayment,
  getRepaymentSchedule,
  createRepaymentSchedule,
  updateRepaymentSchedule,
  deleteRepaymentSchedule,
  getOverdueInstallments,
  recalculateSchedule,
  getPaymentHistory
};