import GLAccountTransaction from '../models/GLAccountTransaction.js';
import Ledger from '../models/Ledger.js';
import GLAccount from '../models/GLAccount.js';
import { logAuditTrail } from '../utils/auditLogger.js';

/**
 * Create a GL transaction and update related ledger & account balances.
 * Handles both API and internal service calls.
 */
export const createGLTransaction = async (req, res, transactionInput = null) => {
  const isAPICall = !transactionInput;
  try {
    const entry = transactionInput || req.body?.entry;

    // Input validation
    if (!entry) {
      const msg = 'Missing entry object in request body';
      return isAPICall
        ? res.status(400).json({ message: msg })
        : (() => { throw new Error(msg); })();
    }

    const {
      GL_ACCT_NO,
      AMOUNT,
      TRANSACTION_TYPE,
      DRS_ALLOWED_FG,
      CRS_ALLOWED_FG,
      CREATED_BY,
      CREATE_DT,
      description,
      SUB_LEDGER_NO,
      SEG_NO
    } = entry;

    if (
      !GL_ACCT_NO ||
      AMOUNT == null ||
      typeof AMOUNT !== 'number' ||
      !TRANSACTION_TYPE ||
      !CREATED_BY ||
      !SUB_LEDGER_NO ||
      !SEG_NO
    ) {
      const msg = 'Missing or invalid required fields in entry (GL_ACCT_NO, AMOUNT, TRANSACTION_TYPE, CREATED_BY, SUB_LEDGER_NO, SEG_NO)';
      return isAPICall
        ? res.status(400).json({ message: msg })
        : (() => { throw new Error(msg); })();
    }

    const ledger = await Ledger.findOne({ GL_ACCT_NO });
    if (!ledger) {
      const msg = `Ledger not found for GL_ACCT_NO ${GL_ACCT_NO}`;
      return isAPICall
        ? res.status(404).json({ message: msg })
        : (() => { throw new Error(msg); })();
    }

    const normalizedType = TRANSACTION_TYPE.toUpperCase();
    const amount = parseFloat(AMOUNT);
    let updatedBalance;

    // Debit logic
    if (['DEBIT', 'DR'].includes(normalizedType)) {
      if (!DRS_ALLOWED_FG) {
        const msg = 'Debit not allowed on this account';
        return isAPICall
          ? res.status(403).json({ message: msg })
          : (() => { throw new Error(msg); })();
      }
      updatedBalance = ledger.LEDGER_BALANCE - amount;
      if (updatedBalance < 0) {
        const msg = 'Insufficient funds';
        return isAPICall
          ? res.status(400).json({ message: msg })
          : (() => { throw new Error(msg); })();
      }
    }

    // Credit logic
    else if (['CREDIT', 'CR'].includes(normalizedType)) {
      if (!CRS_ALLOWED_FG) {
        const msg = 'Credit not allowed on this account';
        return isAPICall
          ? res.status(403).json({ message: msg })
          : (() => { throw new Error(msg); })();
      }
      updatedBalance = ledger.LEDGER_BALANCE + amount;
    }

    // Invalid type
    else {
      const msg = 'Invalid transaction type';
      return isAPICall
        ? res.status(400).json({ message: msg })
        : (() => { throw new Error(msg); })();
    }

    // Construct and save transaction
    const newTxn = new GLAccountTransaction({
      GL_ACCT_NO,
      AMOUNT: amount,
      TRANSACTION_TYPE: normalizedType,
      DRS_ALLOWED_FG: DRS_ALLOWED_FG ? 'Y' : 'N',
      CRS_ALLOWED_FG: CRS_ALLOWED_FG ? 'Y' : 'N',
      CREATED_BY,
      CREATE_DT: new Date(CREATE_DT),
      ROW_TS: new Date(),
      SYS_CREATE_TS: new Date(),
      REC_ST: 'A',
      VERSION_NO: 1,
      USER_ID: CREATED_BY,
      LEDGER_NO: ledger.LEDGER_NO,
      BAL_CD: ledger.BAL_CD,
      ACCT_DESC: ledger.ACCT_DESC,
      GL_ACCT_CAT_CD: ledger.GL_ACCT_CAT_CD,
      GL_ACCT_ID: ledger.GL_ACCT_ID,
      GL_ACCT_STRUCT_ID: ledger.GL_ACCT_STRUCT_ID,
      CHART_OF_ACCT_ID: ledger.CHART_OF_ACCT_ID,
      BU_ID: ledger.BU_ID,
      POST_FG: 'Y',
      CONTROL_ACCT_FG: 'N',
      description,
      SUB_LEDGER_NO,   
      SEG_NO           
    });

    await newTxn.save();

    // Update balances
    ledger.LEDGER_BALANCE = updatedBalance;
    await ledger.save();
    await GLAccount.updateOne(
      { GL_ACCT_NO },
      { $set: { LEDGER_BALANCE: updatedBalance } }
    );

    // Audit
    const ipAddress =
      req?.headers?.['x-forwarded-for'] ||
      req?.connection?.remoteAddress ||
      'UNKNOWN';

    await logAuditTrail(
      'GL_ACCOUNT_TRANSACTION',
      newTxn._id,
      req?.user?.id || CREATED_BY || 'SYSTEM',
      'CREATE',
      null,
      newTxn.toObject(),
      ipAddress
    );

    // Response
    if (isAPICall) {
      return res.status(201).json({
        message: 'GL transaction created successfully',
        transaction: newTxn
      });
    } else {
      return newTxn;
    }

  } catch (error) {
    console.error('Error in createGLTransaction:', error);
    if (isAPICall) {
      return res.status(500).json({
        message: 'Internal server error',
        error: error.message
      });
    } else {
      throw error;
    }
  }
};

export default {
  createGLTransaction
};
