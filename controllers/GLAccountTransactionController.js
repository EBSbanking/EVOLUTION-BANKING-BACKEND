import Ledger from '../models/Ledger.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import GLAccount from '../models/GLAccount.js';
import logAuditTrail from '../utils/auditLogger.js';  // Audit logger import

const isValidGLAcctNo = (glAcctNo) => {
  // Format: 6 groups of 1-3 digits separated by '-'
  const regex = /^(\d{1,3})-(\d{1,3})-(\d{1,3})-(\d{1,3})-(\d{1,3})-(\d{1,3})$/;
  return regex.test(glAcctNo);
};

// Helper to post a single GL transaction (throws errors, does NOT use res)
const postSingleGLTransaction = async (entry, req) => {
  const {
    GL_ACCT_NO,
    AMOUNT,
    TRANSACTION_TYPE,
    CREATED_BY,
    DRS_ALLOWED_FG,
    CRS_ALLOWED_FG,
    description,
    CREATE_DT
  } = entry;

  if (!GL_ACCT_NO || AMOUNT == null || !TRANSACTION_TYPE || typeof AMOUNT !== 'number') {
    throw new Error('Missing or invalid required fields');
  }

  if (!isValidGLAcctNo(GL_ACCT_NO)) throw new Error('Invalid GL_ACCT_NO format');

  const normalizedType = TRANSACTION_TYPE.toUpperCase();
  if (!['DR', 'DEBIT', 'CR', 'CREDIT'].includes(normalizedType)) {
    throw new Error('Invalid TRANSACTION_TYPE');
  }

  const ledger = await Ledger.findOne({ GL_ACCT_NO });
  if (!ledger) throw new Error(`Ledger not found for GL_ACCT_NO ${GL_ACCT_NO}`);

  let newBalance = ledger.LEDGER_BALANCE ?? 0;
  const amt = parseFloat(AMOUNT);

  if (['DR', 'DEBIT'].includes(normalizedType)) {
    if (!DRS_ALLOWED_FG) throw new Error('Debit not allowed on this account');
    newBalance -= amt;
    if (newBalance < 0) throw new Error('Insufficient funds for debit transaction');
  } else if (['CR', 'CREDIT'].includes(normalizedType)) {
    if (!CRS_ALLOWED_FG) throw new Error('Credit not allowed on this account');
    newBalance += amt;
  }

  const newTxn = new GLAccountTransaction({
    GL_ACCT_NO,
    AMOUNT: amt,
    TRANSACTION_TYPE: normalizedType,
    DRS_ALLOWED_FG: DRS_ALLOWED_FG ? 'Y' : 'N',
    CRS_ALLOWED_FG: CRS_ALLOWED_FG ? 'Y' : 'N',
    CREATED_BY,
    CREATE_DT: CREATE_DT ? new Date(CREATE_DT) : new Date(),
    ROW_TS: new Date(),
    SYS_CREATE_TS: new Date(),
    REC_ST: 'A',
    VERSION_NO: 1,
    USER_ID: CREATED_BY,
    LEDGER_NO: ledger.LEDGER_NO,
    SUB_LEDGER_NO: ledger.SUB_LEDGER_NO,
    SEG_NO: ledger.SEG_NO,
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
  });

  await newTxn.save();

  ledger.LEDGER_BALANCE = newBalance;
  await ledger.save();
  await GLAccount.updateOne({ GL_ACCT_NO }, { LEDGER_BALANCE: newBalance });

  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || 'UNKNOWN';
  await logAuditTrail('GL_ACCOUNT_TRANSACTION', newTxn._id, req.user?.id || CREATED_BY, 'CREATE', null, newTxn.toObject(), ip);

  // ✅ Optional: Create subfolder after transaction is logged
  try {
    await createRootSubfolder(newTxn._id, {
      GL_ACCT_NO,
      createdBy: CREATED_BY,
      description,
    });
  } catch (error) {
    console.error('Error creating subfolder:', error);
    // Do not throw — this shouldn't block the transaction flow
  }

  return newTxn;
};


// Controller: create a single GL account transaction
export const createGLAccountTransaction = async (req, res) => {
  try {
    const txn = await postSingleGLTransaction(req.body, req);
    return res.status(201).json({ message: `${txn.TRANSACTION_TYPE} transaction successful`, txn });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

// Controller: create a double-entry transaction (debit + credit)
export const createDoubleEntryTransaction = async (req, res) => {
  try {
    const { debitEntry, creditEntry } = req.body;

    if (!debitEntry || !creditEntry) throw new Error('Both debitEntry and creditEntry are required');
    if (parseFloat(debitEntry.AMOUNT) !== parseFloat(creditEntry.AMOUNT)) {
      throw new Error('Debit and credit amounts must be equal');
    }

    // Force transaction types for clarity
    const debitTxn = await postSingleGLTransaction({ ...debitEntry, TRANSACTION_TYPE: 'DR' }, req);
    const creditTxn = await postSingleGLTransaction({ ...creditEntry, TRANSACTION_TYPE: 'CR' }, req);

    return res.status(201).json({ message: 'Double-entry transaction successful', debitTxn, creditTxn });
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
};

// Other controllers remain unchanged...

export const getGLAccountTransactions = async (req, res) => {
  try {
    const transactions = await GLAccountTransaction.find();
    return res.status(200).json({ message: 'GL Account Transactions retrieved successfully', data: transactions });
  } catch (error) {
    console.error('Error fetching GL Account Transactions:', error);
    return res.status(500).json({ message: 'Error fetching GL Account Transactions', error: error.message });
  }
};

export const getGLAccountTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await GLAccountTransaction.findById(id);

    if (!transaction) {
      return res.status(404).json({ message: 'GL Account Transaction not found' });
    }

    return res.status(200).json({ message: 'GL Account Transaction retrieved successfully', data: transaction });
  } catch (error) {
    console.error('Error fetching GL Account Transaction:', error);
    return res.status(500).json({ message: 'Error fetching GL Account Transaction', error: error.message });
  }
};

export const getGLAccountTransactionByAcctNo = async (req, res) => {
  const { glAcctNo } = req.params;
  try {
    const transaction = await GLAccountTransaction.findOne({ GL_ACCT_NO: glAcctNo });
    if (!transaction) {
      return res.status(404).json({ message: 'GL Account transaction not found' });
    }
    res.status(200).json({ message: 'GL Account transaction retrieved successfully', data: transaction });
  } catch (error) {
    console.error('Error retrieving GL Account transaction:', error);
    res.status(500).json({ message: 'Error retrieving GL Account transaction', error: error.message });
  }
};

export const updateGLAccountTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    if (updatedData.GL_ACCT_NO && !isValidGLAcctNo(updatedData.GL_ACCT_NO)) {
      return res.status(400).json({
        message: 'Invalid GL_ACCT_NO format. It should be in the format xx-xx-xx-xx-xx-xx (e.g., 23-00-01-07-65)'
      });
    }

    const originalTransaction = await GLAccountTransaction.findById(id);
    if (!originalTransaction) {
      return res.status(404).json({ message: 'GL Account Transaction not found' });
    }

    const updatedTransaction = await GLAccountTransaction.findByIdAndUpdate(id, updatedData, { new: true });

    await logAuditTrail(
      'GL_ACCOUNT_TRANSACTION',
      id,
      req.user?.id || 'UNKNOWN',
      'UPDATE',
      originalTransaction.toObject(),
      updatedTransaction.toObject(),
      req.headers['x-forwarded-for'] || req.connection.remoteAddress
    );

    return res.status(200).json({
      message: 'GL Account Transaction updated successfully',
      data: updatedTransaction
    });
  } catch (error) {
    console.error('Error updating GL Account Transaction:', error);
    return res.status(500).json({ message: 'Error updating GL Account Transaction', error: error.message });
  }
};
