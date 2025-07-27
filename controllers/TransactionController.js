import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import DepositAccountSummary from '../models/DepositAccountSummary.js';
import CustomerAccount from '../models/CustomerAccount.js';
import { GENERAL_TX_TYPES, LOAN_TX_TYPES } from '../constants/transactionTypes.js';

/* ---------- Helpers ---------- */
const generateSerialNumber = (len) => {
  const digits = '0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += digits[Math.floor(Math.random() * digits.length)];
  return out;
};

/* ---------- Summary-update utilities ---------- */
const updateDepositAccountSummaryForDebit = async (acctNo, amount, session) => {
  const summary = await DepositAccountSummary.findOne({ ACCT_NO: acctNo }).session(session);
  if (!summary) throw new Error('Deposit account summary not found');

  summary.LEDGER_BAL       -= amount;
  summary.CLEARED_BAL      -= amount;
  summary.UNCLEARED1_BAL   -= amount;
  summary.UNCLEARED2_BAL   -= amount;
  await summary.save({ session });
};

const updateDepositAccountSummaryForCredit = async (acctNo, acctId, amount, session) => {
  let summary = await DepositAccountSummary.findOne({ ACCT_NO: acctNo }).session(session);
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
  await summary.save({ session });
};

const updateLoanAccountSummary = async (acctNo, amount, session) => {
  // Implement your loan account summary update logic here
  // This would update the loan account's outstanding balance, etc.
};

/* ---------- Controllers ---------- */
export const createTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const {
      ACCT_NO,
      ACCT_ID,
      BU_ID,
      CUST_ID,
      ACCT_NM,
      AMOUNT,
      TRANSACTIONDATE,
      TRANSACTION_TYPE,
      debitAccount,
      creditAccount,
      reference,
      description
    } = req.body;

    // Validate transaction type against all possible types
    const upperType = TRANSACTION_TYPE.toUpperCase();
    const allValidTypes = [...GENERAL_TX_TYPES, ...LOAN_TX_TYPES];
    
    if (!allValidTypes.includes(upperType)) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: `Invalid TRANSACTION_TYPE. Valid types: ${allValidTypes.join(', ')}`,
        validTypes: allValidTypes,
        code: 'INVALID_TRANSACTION_TYPE'
      });
    }

    // Validate amount
    if (isNaN(AMOUNT) || AMOUNT <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Amount must be a positive number',
        code: 'INVALID_AMOUNT'
      });
    }

    const custAccount = await CustomerAccount.findOne({ ACCT_NO }).session(session);
    if (!custAccount) {
      await session.abortTransaction();
      return res.status(400).json({ 
        message: 'Invalid Account Number, account not found',
        code: 'ACCOUNT_NOT_FOUND'
      });
    }

    // Generate unique transaction IDs
    let TRANSACTION_ID = generateSerialNumber(13);
    while (await Transaction.findOne({ TRANSACTION_ID }).session(session)) {
      TRANSACTION_ID = generateSerialNumber(13);
    }

    // Create new transaction
    const newTransaction = new Transaction({
      ACCT_NO,
      ACCT_ID,
      BU_ID,
      CUST_ID,
      ACCT_NM,
      AMOUNT,
      TRANSACTIONDATE: TRANSACTIONDATE ? new Date(TRANSACTIONDATE) : new Date(),
      TRANSACTION_TYPE: upperType,
      TRANSACTION_ID,
      EVENT_ID: generateSerialNumber(7),
      TRAN_JOURNAL_ID: generateSerialNumber(13),
      debitAccount,
      creditAccount,
      reference,
      description,
      currency: 'NGN',
      createdBy: req.user?.id || 'system',
      status: 'COMPLETED'
    });

    await newTransaction.save({ session });

    // Handle different transaction types
    const isDebit = ['DEBIT', 'LOAN_DISBURSEMENT'].includes(upperType);
    const isCredit = ['CREDIT', 'LOAN_REPAYMENT'].includes(upperType);

    if (isDebit) {
      await updateDepositAccountSummaryForDebit(ACCT_NO, AMOUNT, session);
      await CustomerAccount.updateOne(
        { ACCT_NO },
        {
          $inc: {
            LEDGER_BAL: -AMOUNT,
            CLEARED_BAL: -AMOUNT,
            AVAILABLE_BALANCE: -AMOUNT
          }
        },
        { session }
      );
    } else if (isCredit) {
      await updateDepositAccountSummaryForCredit(ACCT_NO, ACCT_ID, AMOUNT, session);
      await CustomerAccount.updateOne(
        { ACCT_NO },
        {
          $inc: {
            LEDGER_BAL: AMOUNT,
            CLEARED_BAL: AMOUNT,
            AVAILABLE_BALANCE: AMOUNT
          }
        },
        { session }
      );
    }

    // Special handling for loan transactions
    if (upperType === 'LOAN_DISBURSEMENT') {
      await updateLoanAccountSummary(ACCT_NO, AMOUNT, session);
    } else if (upperType === 'LOAN_REPAYMENT') {
      await updateLoanAccountSummary(ACCT_NO, -AMOUNT, session);
    }

    await session.commitTransaction();

    return res.status(201).json({ 
      success: true,
      message: 'Transaction created successfully', 
      data: {
        ...newTransaction.toObject(),
        formattedAmount: newTransaction.formattedAmount
      }
    });

  } catch (err) {
    await session.abortTransaction();
    console.error('Error in createTransaction:', err);
    return res.status(500).json({ 
      success: false,
      message: 'Server error', 
      error: process.env.NODE_ENV === 'development' ? err.message : undefined,
      requestId: req.id || 'none',
      code: 'TRANSACTION_ERROR'
    });
  } finally {
    session.endSession();
  }
};

// ... (rest of the controller methods remain the same)

export const getAllTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type, status } = req.query;
    const query = {};
    
    if (type) query.TRANSACTION_TYPE = type.toUpperCase();
    if (status) query.status = status.toUpperCase();

    const transactions = await Transaction.find(query)
      .sort({ TRANSACTIONDATE: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Transaction.countDocuments(query);

    return res.status(200).json({
      transactions,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalTransactions: count
    });
  } catch (err) {
    return res.status(500).json({ 
      message: 'Server error', 
      error: err.message,
      requestId: req.id || 'none'
    });
  }
};

export const getTransactionByAcctNo = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const { ACCT_NO } = req.params;

    const transactions = await Transaction.find({ ACCT_NO })
      .sort({ TRANSACTIONDATE: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const count = await Transaction.countDocuments({ ACCT_NO });

    if (!transactions.length) {
      return res.status(404).json({ 
        message: 'No transactions found for this account',
        account: ACCT_NO
      });
    }

    return res.status(200).json({
      transactions,
      totalPages: Math.ceil(count / limit),
      currentPage: page,
      totalTransactions: count
    });
  } catch (err) {
    return res.status(500).json({ 
      message: 'Server error', 
      error: err.message,
      requestId: req.id || 'none'
    });
  }
};

export const deleteTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transaction = await Transaction.findById(req.params.id).session(session);
    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Reverse the transaction impact if needed
    if (transaction.status === 'COMPLETED') {
      const amount = transaction.AMOUNT;
      const isDebit = transaction.TRANSACTION_TYPE === 'DEBIT';
      const isCredit = transaction.TRANSACTION_TYPE === 'CREDIT';
      const ACCT_NO = transaction.ACCT_NO;

      if (isDebit) {
        await updateDepositAccountSummaryForCredit(ACCT_NO, transaction.ACCT_ID, amount, session);
        await CustomerAccount.updateOne(
          { ACCT_NO },
          {
            $inc: {
              LEDGER_BAL: amount,
              CLEARED_BAL: amount,
              AVAILABLE_BALANCE: amount
            }
          },
          { session }
        );
      } else if (isCredit) {
        await updateDepositAccountSummaryForDebit(ACCT_NO, amount, session);
        await CustomerAccount.updateOne(
          { ACCT_NO },
          {
            $inc: {
              LEDGER_BAL: -amount,
              CLEARED_BAL: -amount,
              AVAILABLE_BALANCE: -amount
            }
          },
          { session }
        );
      }
    }

    await Transaction.findByIdAndDelete(req.params.id, { session });
    await session.commitTransaction();

    return res.status(200).json({ message: 'Transaction deleted successfully' });
  } catch (err) {
    await session.abortTransaction();
    return res.status(500).json({ 
      message: 'Server error', 
      error: err.message,
      requestId: req.id || 'none'
    });
  } finally {
    session.endSession();
  }
};

export default {
  createTransaction,
  getAllTransactions,
  getTransactionByAcctNo,
  deleteTransaction
};