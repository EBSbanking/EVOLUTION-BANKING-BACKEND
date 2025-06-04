import mongoose from 'mongoose';
import RateIndex from '../models/Rate-Index.js';
import LoanAccount from '../models/loanAccount.js';
import CustomerAccount from '../models/customerAccount.js';
import GLAccount from '../models/GLAccount.js';
import Transaction from '../models/Transaction.js';
import RepaymentSchedule from '../models/repaymentSchedule.js';
import LoanInterestRate from '../models/loanInterestRate.js';
import Ledger from '../models/Ledger.js';
import logAuditTrail from '../utils/auditLogger.js';
import Disbursement from '../models/Disbursement.js';
import CreditApplication from '../models/CreditApplication.js';




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
        loanFeeGLAcctNo,  // <--- added here
        CREATED_BY
      } = req.body;

      const requiredFields = [
        'APPL_ID', 'CUST_ID', 'ACCT_NO', 'AMOUNT',
        'TERM_CD', 'TERM_VALUE', 'INTEREST_RATE',
        'DISBURSEMENT_DATE', 'glAccountNo', 'portfolioGLAcctNo',
        'loanFeeGLAcctNo',  // <--- added here
        'CREATED_BY'
      ];

      for (const field of requiredFields) {
        if (!req.body[field]) {
          throw new Error(`${field} is required`);
        }
      }

      const amountNum = parseFloat(AMOUNT);
      if (isNaN(amountNum) || amountNum <= 0) {
        throw new Error('Invalid disbursement amount');
      }

      // Fetch necessary documents
      const [creditApp, loanAccount, portfolioGL, loanGL, loanFeeGL] = await Promise.all([
        CreditApplication.findOne({ APPL_ID: decodeURIComponent(APPL_ID), ACCT_NO }).session(session),
        LoanAccount.findOne({ ACCT_NO }).session(session),
        GLAccount.findOne({ GL_ACCT_NO: portfolioGLAcctNo }).session(session),
        GLAccount.findOne({ GL_ACCT_NO: glAccountNo }).session(session),
        GLAccount.findOne({ GL_ACCT_NO: loanFeeGLAcctNo }).session(session),  // fetch loan fee GL
      ]);

      if (!creditApp) throw new Error('Credit application not found');
      if (!loanAccount) throw new Error('Loan account not found');
      if (!portfolioGL) throw new Error('Portfolio GL account not found');
      if (!loanGL) throw new Error('Loan GL account not found');
      if (!loanFeeGL) throw new Error('Loan Fee GL account not found');

      // Create disbursement record
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
      });
      await loanDisbursement.save({ session });

      // Update loan account balances for disbursement
      const toDecimal128 = (num) => mongoose.Types.Decimal128.fromString(num.toFixed(2));
      const cleared = parseFloat(loanAccount.CLEARED_BALANCE?.toString() || '0');
      const available = parseFloat(loanAccount.AVAILABLE_BALANCE?.toString() || '0');
      const ledger = parseFloat(loanAccount.LEDGER_BALANCE?.toString() || '0');

      loanAccount.CLEARED_BALANCE = toDecimal128(cleared - amountNum);
      loanAccount.AVAILABLE_BALANCE = toDecimal128(available - amountNum);
      loanAccount.LEDGER_BALANCE = toDecimal128(ledger - amountNum);
      await loanAccount.save({ session });

      // Create ledger entries for disbursement (Debit loan, Credit portfolio)
      const journalId = generateJournalId();
      const ledgerNo1 = generateLedgerNo();
      const ledgerNo2 = generateLedgerNo();

      const debitLedger = new Ledger({
        JOURNAL_ID: journalId,
        LEDGER_NO: ledgerNo1,
        AMOUNT: amountNum,
        TRANSACTION_TYPE: 'Debit',
        CHART_OF_ACCT_ID: loanGL.CHART_OF_ACCT_ID,
        LEDGER_BALANCE: ledger - amountNum,
        ACCT_DESC: 'Loan Disbursement (Loan Account)',
        GL_ACCT_NO: loanGL.GL_ACCT_NO,
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

      const creditLedger = new Ledger({
        JOURNAL_ID: journalId,
        LEDGER_NO: ledgerNo2,
        AMOUNT: amountNum,
        TRANSACTION_TYPE: 'Credit',
        CHART_OF_ACCT_ID: portfolioGL.CHART_OF_ACCT_ID,
        LEDGER_BALANCE: amountNum,
        ACCT_DESC: 'Loan Disbursement (Portfolio GL)',
        GL_ACCT_NO: portfolioGL.GL_ACCT_NO,
        GL_ACCT_ID: portfolioGL.GL_ACCT_ID,
        GL_ACCT_STRUCT_ID: portfolioGL.GL_ACCT_STRUCT_ID,
        GL_ACCT_CAT_CD: portfolioGL.GL_ACCT_CAT,
        BAL_CD: portfolioGL.BAL_CD,
        SUB_LEDGER_NO: portfolioGL.SUB_LEDGER_NO,
        BU_ID: portfolioGL.BU_ID,
        SEG_NO: portfolioGL.SEG_NO,
        CREATED_BY,
        CREATE_DT: new Date(),
      });

      await debitLedger.save({ session });
      await creditLedger.save({ session });

      // Handle 10% Loan Application Fee

      const loanFeeAmount = parseFloat((amountNum * 0.1).toFixed(2));

      // Update loan account balances again for fee deduction
      loanAccount.CLEARED_BALANCE = toDecimal128(parseFloat(loanAccount.CLEARED_BALANCE.toString()) - loanFeeAmount);
      loanAccount.AVAILABLE_BALANCE = toDecimal128(parseFloat(loanAccount.AVAILABLE_BALANCE.toString()) - loanFeeAmount);
      loanAccount.LEDGER_BALANCE = toDecimal128(parseFloat(loanAccount.LEDGER_BALANCE.toString()) - loanFeeAmount);
      await loanAccount.save({ session });

      // Create ledger entries for loan fee (Debit loan account, Credit loan fee GL)
      const feeJournalId = generateJournalId();

      const feeDebitLedger = new Ledger({
        JOURNAL_ID: feeJournalId,
        LEDGER_NO: generateLedgerNo(),
        AMOUNT: loanFeeAmount,
        TRANSACTION_TYPE: 'Debit',
        CHART_OF_ACCT_ID: loanGL.CHART_OF_ACCT_ID,
        LEDGER_BALANCE: parseFloat(loanAccount.LEDGER_BALANCE.toString()),
        ACCT_DESC: 'Loan Application Fee (Customer Account)',
        GL_ACCT_NO: loanGL.GL_ACCT_NO,
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

      const feeCreditLedger = new Ledger({
        JOURNAL_ID: feeJournalId,
        LEDGER_NO: generateLedgerNo(),
        AMOUNT: loanFeeAmount,
        TRANSACTION_TYPE: 'Credit',
        CHART_OF_ACCT_ID: loanFeeGL.CHART_OF_ACCT_ID,
        LEDGER_BALANCE: parseFloat(loanFeeGL.LEDGER_BALANCE?.toString() || '0') + loanFeeAmount,
        ACCT_DESC: 'Loan Application Fee (Loan Fee GL)',
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
    });

    session.endSession();
    return res.status(200).json({ message: 'Loan disbursement and fee posted successfully' });
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
