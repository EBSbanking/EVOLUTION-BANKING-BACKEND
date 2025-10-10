import mongoose from 'mongoose';
import Ledger from '../models/Ledger.js';
import GLAccount from '../models/GLAccount.js';

// Helper function to generate a unique journal ID
const generateJournalId = () => {
  return Math.floor(Math.random() * 1000000000).toString();
};

// Helper function to generate a unique ledger number
const generateLedgerNo = () => {
  return Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
};

export const createGLTransaction = async (req, res, transactionData, options = {}) => {
  const session = options.session || null;
  const isAPICall = !!req && !!res;

  try {
    const {
      GL_ACCT_NO,
      AMOUNT,
      TRANSACTION_TYPE,
      CREATED_BY,
      SUB_LEDGER_NO,
      SEG_NO,
      description,
      JOURNAL_ID,
      DRS_ALLOWED_FG,
      CRS_ALLOWED_FG,
      BAL_CD,
      GL_ACCT_CAT,
    } = transactionData;

    // Validate required fields
    if (!GL_ACCT_NO || !AMOUNT || !TRANSACTION_TYPE || !CREATED_BY || !BAL_CD || !SUB_LEDGER_NO || !SEG_NO || !GL_ACCT_CAT) {
      const missingFields = [
        !GL_ACCT_NO && 'GL_ACCT_NO',
        !AMOUNT && 'AMOUNT',
        !TRANSACTION_TYPE && 'TRANSACTION_TYPE',
        !CREATED_BY && 'CREATED_BY',
        !BAL_CD && 'BAL_CD',
        !SUB_LEDGER_NO && 'SUB_LEDGER_NO',
        !SEG_NO && 'SEG_NO',
        !GL_ACCT_CAT && 'GL_ACCT_CAT',
      ].filter(Boolean);
      const error = new Error(`Missing required fields: ${missingFields.join(', ')}`);
      error.status = 400;
      throw error;
    }

    // Validate amount
    const amount = parseFloat(AMOUNT);
    if (isNaN(amount) || amount <= 0) {
      const error = new Error('Invalid transaction amount');
      error.status = 400;
      throw error;
    }

    // Validate transaction type
    if (!['CR', 'DR'].includes(TRANSACTION_TYPE.toUpperCase())) {
      const error = new Error('Invalid transaction type');
      error.status = 400;
      throw error;
    }

    // Validate BAL_CD
    const balCdNumber = Number(BAL_CD);
    if (isNaN(balCdNumber)) {
      const error = new Error(`Invalid BAL_CD: ${BAL_CD}. Must be a number.`);
      error.status = 400;
      throw error;
    }

    // Validate GL account
    const glAccount = await GLAccount.findOne({ GL_ACCT_NO }).session(session);
    if (!glAccount || !glAccount.CHART_OF_ACCT_ID) {
      const error = new Error(`Invalid GL account: ${GL_ACCT_NO}`);
      error.status = 404;
      throw error;
    }

    // Calculate ledger balance update
    const currentLedger = await Ledger.findOne({ GL_ACCT_NO }).session(session);
    let ledgerBalance = currentLedger ? currentLedger.LEDGER_BALANCE : 0;
    const isSettlementGLAccount = GL_ACCT_NO === '01-002-100-115-102'; // settlementGLAccountNo
    if (TRANSACTION_TYPE.toUpperCase() === 'CR') {
      if (!CRS_ALLOWED_FG) {
        const error = new Error('Credit not allowed on this account');
        error.status = 400;
        throw error;
      }
      ledgerBalance += amount;
    } else {
      if (!DRS_ALLOWED_FG) {
        const error = new Error('Debit not allowed on this account');
        error.status = 400;
        throw error;
      }
      ledgerBalance -= amount;
      if (ledgerBalance < 0 && !glAccount.ALLOW_BAL_SWING_FG && !isSettlementGLAccount) {
        const error = new Error('Insufficient funds');
        error.status = 400;
        throw error;
      }
    }

    // Prepare ledger entry
    const ledgerEntry = new Ledger({
      GL_ACCT_NO,
      GL_ACCT_ID: glAccount.GL_ACCT_ID,
      CHART_OF_ACCT_ID: glAccount.CHART_OF_ACCT_ID,
      BAL_CD: balCdNumber,
      SUB_LEDGER_NO: Number(SUB_LEDGER_NO),
      ACCT_DESC: description || `Transaction for ${GL_ACCT_NO}`,
      LEDGER_NO: generateLedgerNo(),
      BU_ID: Number(SEG_NO),
      GL_ACCT_CAT,
      CR_ALLOWED: CRS_ALLOWED_FG,
      DR_ALLOWED: DRS_ALLOWED_FG,
      CREATED_BY,
      SEG_NO: Number(SEG_NO),
      JOURNAL_ID: JOURNAL_ID || generateJournalId(),
      LEDGER_BALANCE: ledgerBalance,
      CREATE_DT: new Date(),
      REC_ST: 'Active',
      POST_ALLOW: true,
      POST_FG: true,
      CONTROL_ACCT_FG: false,
      SUPENSE_ACCT_FG: false,
      ALLOW_BAL_SWING_FG: glAccount.ALLOW_BAL_SWING_FG || false,
    });

    // Save ledger entry
    const savedEntry = await ledgerEntry.save({ session });

    // Update GLAccount balance
    await GLAccount.updateOne(
      { GL_ACCT_NO },
      { $set: { LEDGER_BALANCE: ledgerBalance } },
      { session }
    );

    if (isAPICall) {
      return res.status(201).json({
        message: 'GL Transaction created successfully',
        transaction: savedEntry,
        updatedBalance: ledgerBalance,
      });
    }

    return savedEntry;
  } catch (error) {
    console.error('Error creating GL transaction:', {
      message: error.message,
      stack: error.stack,
      transactionData,
    });
    if (isAPICall) {
      return res.status(error.status || 500).json({
        message: 'Transaction processing failed',
        error: error.message,
      });
    }
    throw error;
  }
};