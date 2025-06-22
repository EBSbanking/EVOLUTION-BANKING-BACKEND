import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import DepositAccountSummary from '../models/DepositAccountSummary.js';
import CustomerAccount from '../models/CustomerAccount.js';

/* ---------- Helpers ---------- */
const generateSerialNumber = (len) => {
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += digits[Math.floor(Math.random() * digits.length)];
  return out;
};

/* ---------- Summary-update utilities ---------- */
const updateDepositAccountSummaryForDebit = async (acctNo, amount) => {
  const summary = await DepositAccountSummary.findOne({ ACCT_NO: acctNo });
  if (!summary) throw new Error('Deposit account summary not found');

  summary.LEDGER_BAL       -= amount;
  summary.CLEARED_BAL      -= amount;
  summary.UNCLEARED1_BAL   -= amount;
  summary.UNCLEARED2_BAL   -= amount;
  await summary.save();
};

const updateDepositAccountSummaryForCredit = async (acctNo, acctId, amount) => {
  let summary = await DepositAccountSummary.findOne({ ACCT_NO: acctNo });
  if (!summary) {
    summary = new DepositAccountSummary({
      ACCT_NO: acctNo,
      ACCT_ID: acctId,
      LEDGER_BAL: 0,
      CLEARED_BAL: 0,
      UNCLEARED1_BAL: 0,
      UNCLEARED2_BAL: 0
    });
  }

  summary.LEDGER_BAL       += amount;
  summary.CLEARED_BAL      += amount;
  summary.UNCLEARED1_BAL   += amount;
  summary.UNCLEARED2_BAL   += amount;
  await summary.save();
};

/* ---------- Controllers ---------- */
export const createTransaction = async (req, res) => {
  try {
    const {
      ACCT_NO,
      ACCT_ID,
      BU_ID,
      CUST_ID,
      ACCT_NM,
      AMOUNT,
      TRANSACTIONDATE,
      TRANSACTION_TYPE
    } = req.body;

    const custAccount = await CustomerAccount.findOne({ ACCT_NO });
    if (!custAccount)
      return res.status(400).json({ message: 'Invalid Account Number, account not found' });

    /* --- create new Transaction document --- */
    let TRANSACTION_ID = generateSerialNumber(13);
    while (await Transaction.findOne({ TRANSACTION_ID }))
      TRANSACTION_ID = generateSerialNumber(13);

    const newTransaction = await Transaction.create({
      ACCT_NO,
      ACCT_ID,
      BU_ID,
      CUST_ID,
      ACCT_NM,
      AMOUNT,
      TRANSACTIONDATE: TRANSACTIONDATE ? new Date(TRANSACTIONDATE) : new Date(),
      TRANSACTION_TYPE,
      TRANSACTION_ID,
      EVENT_ID: generateSerialNumber(7),
      TRAN_JOURNAL_ID: generateSerialNumber(13)
    });

    /* --- apply impact to summaries & customer account --- */
    if (TRANSACTION_TYPE === 'Debit') {
      await updateDepositAccountSummaryForDebit(ACCT_NO, AMOUNT);

      await CustomerAccount.updateOne(
        { ACCT_NO },
        {
          $inc: {
            LEDGER_BAL:        -AMOUNT,
            CLEARED_BAL:       -AMOUNT,
            AVAILABLE_BALANCE: -AMOUNT
          }
        }
      );
    } else if (TRANSACTION_TYPE === 'Credit') {
      await updateDepositAccountSummaryForCredit(ACCT_NO, ACCT_ID, AMOUNT);

      await CustomerAccount.updateOne(
        { ACCT_NO },
        {
          $inc: {
            LEDGER_BAL:        AMOUNT,
            CLEARED_BAL:       AMOUNT,
            AVAILABLE_BALANCE: AMOUNT
          }
        }
      );
    } else {
      return res.status(400).json({ message: 'Invalid TRANSACTION_TYPE' });
    }

    return res.status(201).json({ message: 'Transaction created successfully', data: newTransaction });
  } catch (err) {
    console.error('Error in createTransaction:', err);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const getAllTransactions = async (_req, res) => {
  try {
    const transactions = await Transaction.find();
    return res.status(200).json(transactions);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const getTransactionByAcctNo = async (req, res) => {
  try {
    const transactions = await Transaction.find({ ACCT_NO: req.params.ACCT_NO });
    if (!transactions.length)
      return res.status(404).json({ message: 'No transactions found for this account' });
    return res.status(200).json(transactions);
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export const deleteTransaction = async (req, res) => {
  try {
    const deleted = await Transaction.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Transaction not found' });
    return res.status(200).json({ message: 'Transaction deleted successfully' });
  } catch (err) {
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

export default {
  createTransaction,
  getAllTransactions,
  getTransactionByAcctNo,
  deleteTransaction
};
