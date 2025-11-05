// depositAccountSummaryController.js
import DepositAccountSummary from '../models/DepositAccountSummary.js';
import DepositTransaction from '../models/DepositTransaction.js';

// Get all Deposit Account Summaries
export const getAllDepositAccountSummaries = async (req, res) => {
  try {
    const summaries = await DepositAccountSummary.find().populate('transactions');
    res.status(200).json(summaries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get Deposit Account Summary by ACCT_NO along with transaction history
export const getDepositAccountSummaryByAcctNo = async (req, res) => {
  try {
    const { acctNo } = req.params;
    const depositSummary = await DepositAccountSummary.findOne({ ACCT_NO: acctNo }).populate('transactions').exec();

    if (!depositSummary) {
      return res.status(404).json({ message: 'Deposit account not found' });
    }

    res.status(200).json(depositSummary);
  } catch (error) {
    res.status(500).json({ message: 'Internal server error', error: error.message });
  }
};

// Create a new Deposit Account Summary
export const createDepositAccountSummary = async (req, res) => {
  try {
    const newSummary = new DepositAccountSummary(req.body);
    await newSummary.save();
    res.status(201).json(newSummary);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Update an existing Deposit Account Summary by ACCT_NO
export const updateDepositAccountSummary = async (req, res) => {
  try {
    const { acctNo } = req.params;
    const updatedSummary = await DepositAccountSummary.findOneAndUpdate(
      { ACCT_NO: acctNo },
      req.body,
      { new: true }
    );

    if (updatedSummary) {
      res.status(200).json(updatedSummary);
    } else {
      res.status(404).json({ message: 'Deposit account summary not found' });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete a Deposit Account Summary by ACCT_NO
export const deleteDepositAccountSummary = async (req, res) => {
  try {
    const { acctNo } = req.params;
    const deletedSummary = await DepositAccountSummary.findOneAndDelete({ ACCT_NO: acctNo });

    if (deletedSummary) {
      res.status(204).json({ message: 'Deposit account summary deleted' });
    } else {
      res.status(404).json({ message: 'Deposit account summary not found' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get transaction history for a specific deposit account ID
export const getTransactionHistoryByAcctId = async (req, res) => {
  try {
    const { depositAcctId } = req.params;
    const transactions = await DepositTransaction.find({ DEPOSIT_ACCT_ID: depositAcctId });

    if (transactions.length > 0) {
      res.status(200).json(transactions);
    } else {
      res.status(404).json({ message: 'No transactions found for this account' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
