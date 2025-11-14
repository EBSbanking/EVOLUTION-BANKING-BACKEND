import express from 'express';
import {

  getGLAccountByAcctNo,
  createGLAccountTransaction,
  createDoubleEntryTransaction,
  getGLAccountTransactions,
  getGLAccountTransactionById,
  getGLAccountTransactionByAcctNo,
  updateGLAccountTransaction,
  deleteGLAccountTransaction,
  approveGLTransaction,
  rejectGLTransaction,
  getPendingTransactions,
  processEODGLTransactionsService,
} from '../controllers/GLAccountTransactionController.js'; // Consolidated imports from controller

import mongoose from 'mongoose';

const router = express.Router();

/**
 * ===========================
 * GL Accounts Routes
 * ===========================
 */

router.get('/gl-accounts/:glAcctNo', getGLAccountByAcctNo);

/**
 * ===========================
 * GL Transactions Routes
 * ===========================
 */
router.post('/gl-accounts/transactions', createGLAccountTransaction);
router.post('/gl-accounts/transactions/double-entry', createDoubleEntryTransaction);
router.get('/gl-accounts/transactions', getGLAccountTransactions);

// Get pending transactions
router.get('/gl-accounts/transactions/pending', getPendingTransactions);

// Get transaction by ID (handles ObjectId)
router.get('/gl-accounts/transactions/:id', getGLAccountTransactionById);

// Transactions by account number
router.get('/gl-accounts/:glAcctNo/transactions', getGLAccountTransactionByAcctNo);

// Update transaction
router.put('/gl-accounts/transactions/:id', updateGLAccountTransaction);

// Delete transaction
router.delete('/gl-accounts/transactions/:id', deleteGLAccountTransaction);

/**
 * ===========================
 * Transaction Queue Actions
 * ===========================
 */
// Approve GL Transaction
router.post('/gl-accounts/transactions/:transactionId/approve', approveGLTransaction);

// Reject GL Transaction
router.post('/gl-accounts/transactions/:transactionId/reject', rejectGLTransaction);

// Process EOD GL Transactions (admin endpoint)
router.post('/gl-accounts/transactions/eod-process', async (req, res) => {
  try {
    const result = await processEODGLTransactionsService();
    if (result.success) {
      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.processed || [],
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.error || 'EOD processing failed',
      });
    }
  } catch (error) {
    console.error('EOD Process Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to process EOD transactions',
      error: error.message,
    });
  }
});

export default router;