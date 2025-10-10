import express from 'express';
import {
  getGLAccounts,
  createGLAccountTransaction,
  createDoubleEntryTransaction,
  getGLAccountTransactions,
  getGLAccountTransactionById,
  getGLAccountTransactionByAcctNo,
  updateGLAccountTransaction,
  approveGLTransaction,
  rejectGLTransaction
} from '../controllers/GLAccountTransactionController.js';

import GLTransactionQueue from '../models/GLTransactionQueue.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import mongoose from 'mongoose';

const router = express.Router();

/**
 * ===========================
 * GL Accounts Routes
 * ===========================
 */
router.get('/gl-accounts', getGLAccounts);

/**
 * ===========================
 * GL Transactions Routes
 * ===========================
 */
router.post('/gl-accounts/transactions', createGLAccountTransaction);
router.post('/gl-accounts/transactions/double-entry', createDoubleEntryTransaction);
router.get('/gl-accounts/transactions', getGLAccountTransactions);

// ✅ PENDING route MUST come before ":id"
router.get('/gl-accounts/transactions/pending', async (req, res) => {
  try {
    const pendingTransactions = await GLTransactionQueue.find({
      QUEUE_STATUS: 'Pending',
    }).lean();

    if (!pendingTransactions.length) {
      return res.status(404).json({ message: 'No pending transactions found' });
    }

    return res.json({
      success: true,
      count: pendingTransactions.length,
      data: pendingTransactions,
    });
  } catch (error) {
    return res.status(500).json({
      message: 'Failed to fetch pending transactions',
      error: error.message,
    });
  }
});

// 👇 Only runs if it's an actual ObjectId
router.get('/gl-accounts/transactions/:transactionId', async (req, res) => {
  try {
    const tx = await GLAccountTransaction.findById(req.params.transactionId);
    if (!tx) {
      return res.status(404).json({ message: 'Transaction not found' });
    }
    res.json(tx);
  } catch (err) {
    res.status(500).json({
      message: 'Failed to fetch GL transaction',
      error: err.message,
    });
  }
});

// Transactions by account number
router.get('/gl-accounts/:glAcctNo/transactions', getGLAccountTransactionByAcctNo);

// Update transaction
router.put('/gl-accounts/transactions/:id', updateGLAccountTransaction);

/**
 * ===========================
 * Transaction Queue Actions
 * ===========================
 */
// ✅ Approve GL Transaction
router.post("/gl-accounts/transactions/:transactionId/approve", async (req, res) => {
  try {
    const { approverId } = req.body;
    const { transactionId } = req.params;

    if (!approverId) {
      return res.status(400).json({ message: "Missing approverId" });
    }

    let transaction = null;

    // ✅ First try ObjectId lookup
    if (mongoose.Types.ObjectId.isValid(transactionId)) {
      transaction = await GLTransactionQueue.findById(transactionId);
    }

    // ✅ Fallback to JOURNAL_ID if not found
    if (!transaction) {
      transaction = await GLTransactionQueue.findOne({ JOURNAL_ID: transactionId });
    }

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    // ✅ Check if already approved/rejected
    if (transaction.APPROVAL_STATUS === "Approved") {
      return res.status(400).json({ message: "Transaction already approved" });
    }
    if (transaction.APPROVAL_STATUS === "Rejected") {
      return res.status(400).json({ message: "Transaction was rejected, cannot approve" });
    }

    // ✅ Approve transaction (business approval)
    transaction.APPROVAL_STATUS = "Approved";
    transaction.APPROVED_BY = approverId;
    transaction.APPROVED_AT = new Date();

    // ✅ Also mark queue status as processed
    transaction.QUEUE_STATUS = "Processed";
    transaction.PROCESSED_AT = new Date();

    await transaction.save();

    return res.status(200).json({
      message: "Transaction approved and processed successfully",
      transaction,
    });
  } catch (error) {
    console.error("Approval error:", error);
    return res.status(500).json({
      message: "Transaction approval failed",
      error: error.message,
    });
  }
});

//Reject GL Transaction
// ✅ Reject transaction
router.post("/gl-accounts/transactions/:transactionId/reject", async (req, res) => {
  try {
    const { approverId } = req.body;
    const { transactionId } = req.params;

    if (!approverId) {
      return res.status(400).json({ message: "Missing approverId" });
    }

    let transaction = null;

    // ✅ First try ObjectId lookup
    if (mongoose.Types.ObjectId.isValid(transactionId)) {
      transaction = await GLTransactionQueue.findById(transactionId);
    }

    // ✅ Fallback to JOURNAL_ID if not found
    if (!transaction) {
      transaction = await GLTransactionQueue.findOne({ JOURNAL_ID: transactionId });
    }

    if (!transaction) {
      return res.status(404).json({ message: "Transaction not found" });
    }

    // ✅ Check if already processed
    if (transaction.APPROVAL_STATUS === "Approved") {
      return res.status(400).json({ message: "Transaction already approved, cannot reject" });
    }
    if (transaction.APPROVAL_STATUS === "Rejected") {
      return res.status(400).json({ message: "Transaction already rejected" });
    }

    // ✅ Reject transaction (business rejection)
    transaction.APPROVAL_STATUS = "Rejected";
    transaction.REJECTED_BY = approverId;
    transaction.REJECTED_AT = new Date();

    // ✅ Mark queue status as rejected
    transaction.QUEUE_STATUS = "Rejected";

    await transaction.save();

    return res.status(200).json({
      message: "Transaction rejected successfully",
      transaction,
    });
  } catch (error) {
    console.error("Rejection error:", error);
    return res.status(500).json({
      message: "Transaction rejection failed",
      error: error.message,
    });
  }
});


export default router;
