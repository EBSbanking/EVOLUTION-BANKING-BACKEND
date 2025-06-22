import GLAccountTransaction from '../models/GLAccountTransaction.js';
import Ledger from '../models/Ledger.js';
import GLAccount from '../models/GLAccount.js';
import { logAuditTrail } from '../utils/auditLogger.js';

export const createGLTransaction = async (
  ledger = null,
  glAccount = null,
  entry = null,
  req = null,
  res = null
) => {
  const isAPICall = !!req && !!res;

  try {
    const payload = entry || req?.body?.entry;

    if (!payload) throw new Error('Missing GL transaction payload');

    // Validate required fields
    const requiredFields = ['GL_ACCT_NO', 'AMOUNT', 'TRANSACTION_TYPE', 'CREATED_BY', 'SUB_LEDGER_NO', 'SEG_NO'];
    const missingFields = requiredFields.filter(field => !payload[field]);

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const {
      GL_ACCT_NO,
      AMOUNT,
      TRANSACTION_TYPE,
      DRS_ALLOWED_FG = false,
      CRS_ALLOWED_FG = true,
      CREATED_BY,
      CREATE_DT,
      description,
      SUB_LEDGER_NO,
      SEG_NO
    } = payload;

    // Lookups if not provided
    if (!ledger) ledger = await Ledger.findOne({ GL_ACCT_NO });
    if (!glAccount) glAccount = await GLAccount.findOne({ GL_ACCT_NO });

    // Auto-create ledger if not found
    if (!ledger) {
      if (!glAccount) {
        // Create minimal GL account if not found
        glAccount = new GLAccount({
          GL_ACCT_NO,
          ACCT_DESC: description || 'Auto-created GL Account',
          GL_ACCT_CAT_CD: 'ASSET',
          CHART_OF_ACCT_ID: 1001,
          GL_ACCT_ID: Date.now(),
          GL_ACCT_STRUCT_ID: 101, // Numeric value
          BU_ID: SEG_NO || '001',
          CREATED_BY,
          CREATE_DT: new Date()
        });
        await glAccount.save();
      }

      // Create ledger with numeric GL_ACCT_STRUCT_ID
      ledger = new Ledger({
        JOURNAL_ID: Math.floor(Math.random() * 1_000_000_000),
        LEDGER_NO: Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`),
        GL_ACCT_NO,
        BAL_CD: 'CR',
        SUB_LEDGER_NO: SUB_LEDGER_NO || '0000',
        BU_ID: glAccount.BU_ID || SEG_NO || '001',
        SEG_NO: SEG_NO || '001',
        CHART_OF_ACCT_ID: glAccount.CHART_OF_ACCT_ID || 1001,
        ACCT_DESC: glAccount.ACCT_DESC || description || 'Auto-generated Ledger',
        GL_ACCT_ID: glAccount.GL_ACCT_ID || Date.now(),
        GL_ACCT_STRUCT_ID: glAccount.GL_ACCT_STRUCT_ID || 101, // Numeric
        GL_ACCT_CAT_CD: glAccount.GL_ACCT_CAT_CD || 'ASSET',
        LEDGER_BALANCE: 0,
        CREATED_BY,
        CREATE_DT: new Date(),
      });
      await ledger.save();
    }

    // Process transaction
    const normalizedType = TRANSACTION_TYPE.toUpperCase();
    const amount = parseFloat(AMOUNT);
    let updatedBalance;

    if (['DEBIT', 'DR'].includes(normalizedType)) {
      if (!DRS_ALLOWED_FG) throw new Error('Debit not allowed on this account');
      updatedBalance = ledger.LEDGER_BALANCE - amount;
      if (updatedBalance < 0) throw new Error('Insufficient funds');
    } else if (['CREDIT', 'CR'].includes(normalizedType)) {
      if (!CRS_ALLOWED_FG) throw new Error('Credit not allowed on this account');
      updatedBalance = ledger.LEDGER_BALANCE + amount;
    } else {
      throw new Error('Invalid transaction type');
    }

    // Create transaction with numeric GL_ACCT_STRUCT_ID
    const glTxn = new GLAccountTransaction({
      GL_ACCT_NO,
      AMOUNT: amount,
      TRANSACTION_TYPE: normalizedType,
      DRS_ALLOWED_FG: DRS_ALLOWED_FG ? 'Y' : 'N',
      CRS_ALLOWED_FG: CRS_ALLOWED_FG ? 'Y' : 'N',
      CREATED_BY,
      CREATE_DT: new Date(CREATE_DT || Date.now()),
      ROW_TS: new Date(),
      SYS_CREATE_TS: new Date(),
      REC_ST: 'A',
      VERSION_NO: 1,
      USER_ID: CREATED_BY,
      LEDGER_NO: ledger.LEDGER_NO,
      BAL_CD: ledger.BAL_CD,
      ACCT_DESC: ledger.ACCT_DESC || description,
      GL_ACCT_CAT_CD: ledger.GL_ACCT_CAT_CD || 'ASSET',
      GL_ACCT_ID: ledger.GL_ACCT_ID,
      GL_ACCT_STRUCT_ID: ledger.GL_ACCT_STRUCT_ID || 101, // Numeric
      CHART_OF_ACCT_ID: ledger.CHART_OF_ACCT_ID,
      BU_ID: ledger.BU_ID,
      POST_FG: 'Y',
      CONTROL_ACCT_FG: 'N',
      description,
      SUB_LEDGER_NO,
      SEG_NO
    });

    await glTxn.save();

    // Update balances
    ledger.LEDGER_BALANCE = updatedBalance;
    await ledger.save();

    await GLAccount.updateOne(
      { GL_ACCT_NO },
      { $set: { LEDGER_BALANCE: updatedBalance } }
    );

    // ... rest of your code ...

  } catch (error) {
    console.error('❌ GL Transaction Error:', error);
    if (isAPICall) {
      return res.status(500).json({
        message: 'Transaction processing failed',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
    throw error;
  }
};