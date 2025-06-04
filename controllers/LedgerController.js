import Ledger from '../models/Ledger.js';
import GLAccount from '../models/GLAccount.js';


// Utility to generate a unique numeric ledger number
const generateLedgerNo = () => {
  return Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
};

const generateJournalId = () => {
  return Math.floor(Math.random() * 1000000000);
};

export const createLedgerEntry = async (req, res) => {
  try {
    let {
      AMOUNT,
      TRANSACTION_TYPE,
      ACCT_NO,
      ACCT_DESC,
      GL_ACCT_NO,
      CREATED_BY,
      LEDGER_NO,
      BAL_CD,
      SUB_LEDGER_NO,
      BU_ID,
      SEG_NO,
    } = req.body;

    AMOUNT = parseFloat(AMOUNT);
    if (isNaN(AMOUNT)) return res.status(400).json({ message: 'Invalid amount' });

    if (!LEDGER_NO) {
      LEDGER_NO = generateLedgerNo();
    } else {
      LEDGER_NO = Number(LEDGER_NO);
      if (isNaN(LEDGER_NO)) return res.status(400).json({ message: 'Invalid LEDGER_NO' });
    }

    if (!TRANSACTION_TYPE || !['Credit', 'Debit'].includes(TRANSACTION_TYPE)) {
      return res.status(400).json({ message: 'Invalid transaction type' });
    }

    if (!ACCT_NO || !ACCT_DESC || !GL_ACCT_NO || !CREATED_BY || !BAL_CD || SUB_LEDGER_NO === undefined || !BU_ID || !SEG_NO) {
      return res.status(400).json({
        message: 'Missing required fields',
      });
    }

    const customerAcct = await CustomerAccount.findOne({ ACCT_NO });
    if (!customerAcct) return res.status(404).json({ message: 'Customer account not found' });

    const glAccount = await GLAccount.findOne({ GL_ACCT_NO });
    if (!glAccount || !glAccount.CHART_OF_ACCT_ID) {
      return res.status(400).json({ message: 'Invalid GL account or missing chart ID' });
    }

    const CHART_OF_ACCT_ID = glAccount.CHART_OF_ACCT_ID;
    const { GL_ACCT_ID, GL_ACCT_STRUCT_ID, GL_ACCT_CAT_CD } = glAccount;

    // Assume current balance is fetched from somewhere (not provided in this scope)
    const currentBalance = AMOUNT;

    const ledgerEntry = new Ledger({
      JOURNAL_ID: generateJournalId(),
      LEDGER_NO,
      BAL_CD,
      SUB_LEDGER_NO,
      BU_ID,
      SEG_NO,
      AMOUNT,
      TRANSACTION_TYPE,
      CHART_OF_ACCT_ID,
      ACCT_DESC,
      GL_ACCT_NO,
      LEDGER_BALANCE: currentBalance,
      GL_ACCT_ID,
      GL_ACCT_STRUCT_ID,
      GL_ACCT_CAT_CD,
      CREATED_BY,
      CREATE_DT: new Date(),
    });

    const savedEntry = await ledgerEntry.save();
    return res.status(201).json(savedEntry);
  } catch (error) {
    console.error('Error creating ledger entry:', error);
    return res.status(500).json({
      message: 'Server error creating ledger entry',
      error: error.message,
    });
  }
};

/**
 * Get ledger entries, optionally filtered by GL Account No via query param
 */
export const getLedgerEntries = async (req, res) => {
  try {
    const { glAccountNo } = req.query;

    const filter = glAccountNo ? { GL_ACCT_NO: glAccountNo } : {};
    const entries = await Ledger.find(filter).sort({ createdAt: -1 });

    return res.status(200).json(entries);
  } catch (error) {
    console.error('Error fetching ledger entries:', error);
    return res.status(500).json({ message: 'Server error fetching ledger entries' });
  }
};

/**
 * Get all ledger entries
 */
export const getAllLedgers = async (req, res) => {
  try {
    const ledgers = await Ledger.find();
    return res.status(200).json(ledgers);
  } catch (error) {
    console.error('Error fetching ledgers:', error.message);
    return res.status(500).json({
      message: 'An error occurred while fetching ledger entries',
      error: error.message,
    });
  }
};

/**
 * Get a single ledger entry by GL Account Number (param)
 */
export const getLedgerByAcctNo = async (req, res) => {
  try {
    const { GL_ACCT_NO } = req.params;
    const ledger = await Ledger.findOne({ GL_ACCT_NO });

    if (!ledger) {
      return res.status(404).json({ message: 'Ledger entry not found' });
    }

    return res.status(200).json(ledger);
  } catch (error) {
    console.error('Error fetching ledger entry:', error.message);
    return res.status(500).json({
      message: 'An error occurred while fetching the ledger entry',
      error: error.message,
    });
  }
};

/**
 * Update a ledger entry by GL Account Number (param)
 */
export const updateLedgerByAcctNo = async (req, res) => {
  try {
    const { GL_ACCT_NO } = req.params;
    const updates = req.body;

    const validFields = ['TRANSACTION_TYPE', 'AMOUNT', 'LEDGER_BALANCE', 'ACCT_DESC', 'CHART_OF_ACCT_ID', 'LEDGER_NO'];
    const hasValidUpdate = validFields.some(field => updates.hasOwnProperty(field));
    if (!hasValidUpdate) {
      return res.status(400).json({ message: 'At least one valid field is required to update the ledger entry' });
    }

    const ledger = await Ledger.findOneAndUpdate({ GL_ACCT_NO }, updates, { new: true });

    if (!ledger) {
      return res.status(404).json({ message: 'Ledger entry not found' });
    }

    return res.status(200).json({
      message: 'Ledger entry updated successfully',
      ledger,
    });
  } catch (error) {
    console.error('Error updating ledger entry:', error.message);
    return res.status(500).json({
      message: 'An error occurred while updating the ledger entry',
      error: error.message,
    });
  }
};

/**
 * Delete a ledger entry by GL Account Number (param)
 */
export const deleteLedgerByAcctNo = async (req, res) => {
  try {
    const { GL_ACCT_NO } = req.params;

    const ledger = await Ledger.findOneAndDelete({ GL_ACCT_NO });

    if (!ledger) {
      return res.status(404).json({ message: 'Ledger entry not found' });
    }

    return res.status(200).json({ message: 'Ledger entry deleted successfully' });
  } catch (error) {
    console.error('Error deleting ledger entry:', error.message);
    return res.status(500).json({
      message: 'An error occurred while deleting the ledger entry',
      error: error.message,
    });
  }
};

/**
 * Update Ledger Balance by Ledger ID
 */
export const updateLedgerBalanceById = async (req, res) => {
  try {
    const ledgerId = req.params.id;
    const { LEDGER_BALANCE } = req.body;

    let safeBalance = Number(LEDGER_BALANCE);
    if (isNaN(safeBalance)) {
      return res.status(400).json({ message: `Invalid LEDGER_BALANCE value: ${LEDGER_BALANCE}` });
    }

    const updatedLedger = await Ledger.findByIdAndUpdate(ledgerId, { LEDGER_BALANCE: safeBalance }, { new: true, runValidators: true });

    if (!updatedLedger) {
      return res.status(404).json({ message: 'Ledger not found' });
    }

    return res.status(200).json({
      message: 'Ledger updated successfully',
      ledger: updatedLedger,
    });
  } catch (err) {
    console.error('Error updating ledger:', err.message);
    return res.status(500).json({ message: 'Server error updating ledger', error: err.message });
  }
};
