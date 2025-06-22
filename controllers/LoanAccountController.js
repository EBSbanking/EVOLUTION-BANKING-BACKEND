import mongoose from 'mongoose';
import RateIndex from '../models/Rate-Index.js';
import LoanAccount from '../models/LoanAccount.js';
import CustomerAccount from '../models/customerAccount.js';
import GLAccount from '../models/GLAccount.js';
import Transaction from '../models/Transaction.js';
import RepaymentSchedule from '../models/repaymentSchedule.js';
import LoanInterestRate from '../models/loanInterestRate.js';
import Ledger from '../models/Ledger.js';
import Disbursement from '../models/Disbursement.js';
import CreditApplication from '../models/CreditApplication.js';
import logAuditTrail from '../utils/auditLogger.js'; 



export const applyForLoan = async (req, res) => {
  const requiredFields = [
    'CUST_ID', 'ACCT_NM', 'ACCT_NO', 'APPL_ID', 'CRNCY_ID', 'BU_ID',
    'PRIMARY_OFFICER_ID', 'SECONDARY_OFFICER_ID', 'DISBURSEMENT_LIMIT',
    'START_DT', 'TERM_CD', 'TERM_VALUE', 'MATURITY_DT', 'TRANSACTION_TYPE',
    'PROD_ID', 'INDEX_RATE_ID', 'DISBURSEMENT_DATE'
  ];

  for (const field of requiredFields) {
    if (!req.body[field] || req.body[field] === '') {
      return res.status(400).json({ message: `${field} is required` });
    }
  }

  try {
    const rateIndex = await RateIndex.findOne({ INDEX_RATE_ID: req.body.INDEX_RATE_ID });
    if (!rateIndex) {
      return res.status(404).json({ message: 'Rate Index not found' });
    }

    const { INDEX_RATE, PRECISION } = rateIndex;
    const adjustedRate = INDEX_RATE / Math.pow(10, PRECISION || 0);

    const loanInterestRate = await LoanInterestRate.findOne({ PROD_ID: req.body.PROD_ID });
    if (!loanInterestRate) {
      return res.status(404).json({ message: 'Interest rate for product not found' });
    }

    const interestRate = loanInterestRate.ABSOLUTE_RATE ?? loanInterestRate.FIXED_RATE;
    if (!interestRate) {
      return res.status(400).json({ message: 'Invalid interest rate configuration' });
    }

    const loanAccount = new LoanAccount({
      ...req.body,
      INTEREST_RATE: adjustedRate || interestRate,
      CREATED_AT: new Date()
    });

    await loanAccount.save();

    // Log audit trail for loan application
    await logAudit({
      action: 'Apply Loan',
      performedBy: req.body.CREATED_BY || '',
      entity: 'LoanAccount',
      entityId: loanAccount._id,
      changes: req.body
    });

    res.status(201).json({ message: 'Loan application submitted successfully', data: loanAccount });
  } catch (error) {
    console.error('Apply Loan Error:', error);
    res.status(500).json({ message: 'Error applying for loan', error: error.message });
  }
};

export const disburseLoan = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      const {
        APPL_ID, CUST_ID, ACCT_NO, AMOUNT,
        TERM_CD, TERM_VALUE, INTEREST_RATE,
        DISBURSEMENT_DATE, glAccountNo, portfolioGLAcctNo,
        loanFeeGLAcctNo, CREATED_BY, customerAcctNo // Add customer account number
      } = req.body;

      const requiredFields = [
        'APPL_ID', 'CUST_ID', 'ACCT_NO', 'AMOUNT',
        'TERM_CD', 'TERM_VALUE', 'INTEREST_RATE',
        'DISBURSEMENT_DATE', 'glAccountNo', 'portfolioGLAcctNo',
        'loanFeeGLAcctNo', 'CREATED_BY', 'customerAcctNo' // Add to required fields
      ];

      // ... existing validation code ...

      // Add customer account lookup
      const [creditApp, loanAccount, portfolioGL, loanGL, loanFeeGL, customerAccount] = await Promise.all([
        CreditApplication.findOne({ APPL_ID: decodeURIComponent(APPL_ID), ACCT_NO }).session(session),
        LoanAccount.findOne({ ACCT_NO }).session(session),
        GLAccount.findOne({ GL_ACCT_NO: portfolioGLAcctNo }).session(session),
        GLAccount.findOne({ GL_ACCT_NO: glAccountNo }).session(session),
        GLAccount.findOne({ GL_ACCT_NO: loanFeeGLAcctNo }).session(session),
        CustomerAccount.findOne({ ACCT_NO: customerAcctNo }).session(session) // Get customer account
      ]);

      if (!customerAccount) throw new Error('Customer account not found');
      // ... other existing checks ...

      // Calculate 10% fee
      const loanFeeAmount = parseFloat((amountNum * 0.1).toFixed(2));

      // Check if customer has sufficient balance
      if (parseFloat(customerAccount.AVAILABLE_BALANCE.toString()) < loanFeeAmount) {
        throw new Error('Insufficient funds in customer account for fee');
      }

      // Deduct fee from customer account
      customerAccount.AVAILABLE_BALANCE -= loanFeeAmount;
      customerAccount.LEDGER_BAL -= loanFeeAmount;
      customerAccount.CLEARED_BAL -= loanFeeAmount;
      await customerAccount.save({ session });

      // Create disbursement record (without adding fee to loan account)
      const loanDisbursement = new Disbursement({
        APPL_ID,
        CUST_ID,
        ACCT_NO,
        DISBURSEMENT_DATE: new Date(DISBURSEMENT_DATE),
        AMOUNT: amountNum,
        TERM_CD,
        TERM_VALUE,
        INTEREST_RATE,
        STATUS: 'disbursed',
        REPAYMENT_SCHEDULE: [],
        FEE_AMOUNT: loanFeeAmount // Track fee separately
      });
      await loanDisbursement.save({ session });

      // Update loan account balances (only the principal amount)
      const toDecimal128 = (num) => mongoose.Types.Decimal128.fromString(num.toFixed(2));
      loanAccount.CLEARED_BALANCE = toDecimal128(amountNum);
      loanAccount.AVAILABLE_BALANCE = toDecimal128(amountNum);
      loanAccount.LEDGER_BALANCE = toDecimal128(amountNum);
      await loanAccount.save({ session });

      // ... existing ledger/journal code for principal amount ...

      // Create journal entries for the fee (from customer account to fee GL)
      const feeJournalId = generateJournalId();

      // Debit from customer account (through their GL account)
      const feeDebitLedger = new Ledger({
        JOURNAL_ID: feeJournalId,
        LEDGER_NO: generateLedgerNo(),
        AMOUNT: loanFeeAmount,
        TRANSACTION_TYPE: 'Debit',
        CHART_OF_ACCT_ID: loanGL.CHART_OF_ACCT_ID,
        LEDGER_BALANCE: parseFloat(customerAccount.LEDGER_BAL.toString()),
        ACCT_DESC: 'Loan Application Fee (Customer Account)',
        GL_ACCT_NO: loanGL.GL_ACCT_NO, // Or use customer's GL account if different
        GL_ACCT_ID: loanGL.GL_ACCT_ID,
        GL_ACCT_STRUCT_ID: loanGL.GL_ACCT_STRUCT_ID,
        GL_ACCT_CAT_CD: loanGL.GL_ACCT_CAT,
        BAL_CD: loanGL.BAL_CD,
        SUB_LEDGER_NO: loanGL.SUB_LEDGER_NO,
        BU_ID: loanGL.BU_ID,
        SEG_NO: loanGL.SEG_NO,
        CREATED_BY,
        CREATE_DT: new Date(),
      });

      // Credit to fee GL account
      const feeCreditLedger = new Ledger({
        JOURNAL_ID: feeJournalId,
        LEDGER_NO: generateLedgerNo(),
        AMOUNT: loanFeeAmount,
        TRANSACTION_TYPE: 'Credit',
        CHART_OF_ACCT_ID: loanFeeGL.CHART_OF_ACCT_ID,
        LEDGER_BALANCE: parseFloat(loanFeeGL.LEDGER_BALANCE?.toString() || '0') + loanFeeAmount,
        ACCT_DESC: 'Loan Application Fee (Fee Income)',
        GL_ACCT_NO: loanFeeGL.GL_ACCT_NO,
        GL_ACCT_ID: loanFeeGL.GL_ACCT_ID,
        GL_ACCT_STRUCT_ID: loanFeeGL.GL_ACCT_STRUCT_ID,
        GL_ACCT_CAT_CD: loanFeeGL.GL_ACCT_CAT,
        BAL_CD: loanFeeGL.BAL_CD,
        SUB_LEDGER_NO: loanFeeGL.SUB_LEDGER_NO,
        BU_ID: loanFeeGL.BU_ID,
        SEG_NO: loanFeeGL.SEG_NO,
        CREATED_BY,
        CREATE_DT: new Date(),
      });

      await feeDebitLedger.save({ session });
      await feeCreditLedger.save({ session });

      // ... rest of your existing code ...
    });

    session.endSession();
    return res.status(200).json({ message: 'Loan disbursement and fee processed successfully' });
  } catch (err) {
    session.endSession();
    console.error('Disbursement Error:', err);
    return res.status(500).json({ message: 'Disbursement failed', error: err.message });
  }
};
// Helper functions (implement as needed)
function generateJournalId() {
  return 'JRN-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
}

function generateUniqueTransactionId() {
  return 'TXN-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
}

function generateLedgerNo() {
  return 'LEDGER-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
}

// Correct way to export a function in ESM (ES Modules)
export const getLoanAccountByAcctNo = async (req, res) => {
    const { ACCT_NO } = req.params;
  
    if (!ACCT_NO) {
        return res.status(400).json({ message: 'Account number is required' });
    }
  
    try {
        const loanAccount = await LoanAccount.findOne({ ACCT_NO });
        if (!loanAccount) {
            return res.status(404).json({ message: 'Loan account not found' });
        }
  
        res.status(200).json({
            message: 'Loan account retrieved successfully',
            loanAccount,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching loan account', error: error.message });
    }
  };

  export const getLoanAccountsByCustomerId = async (req, res) => {
  const { custId } = req.params;

  if (!custId) {
    return res.status(400).json({ message: 'Customer ID (custId) is required' });
  }

  try {
    const loanAccounts = await LoanAccount.find({ CUST_ID: custId });

    if (!loanAccounts || loanAccounts.length === 0) {
      return res.status(404).json({ message: 'No loan accounts found for this customer' });
    }

    res.status(200).json({
      message: 'Loan accounts retrieved successfully',
      count: loanAccounts.length,
      loanAccounts,
    });
  } catch (error) {
    console.error('Error fetching loan accounts by customer ID:', error);
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};