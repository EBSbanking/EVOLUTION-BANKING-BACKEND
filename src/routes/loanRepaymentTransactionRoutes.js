// routes/loanRepaymentTransactionRoutes.js
import express from 'express';
import {
  createRepaymentTransaction,
  getRepaymentTransactions,
  getRepaymentTransactionById,
  getTransactionsByAccount,
  getTransactionsByCustomer,
  updateTransactionStatus,
  deleteRepaymentTransaction,
  getRepaymentStatistics
} from '../controllers/loanRepaymentTransactionController.js';

const router = express.Router();

// Create a new repayment transaction
router.post('/transactions', createRepaymentTransaction);

// Get all repayment transactions with filtering
router.get('/transactions', getRepaymentTransactions);

// Get repayment statistics
router.get('/transactions/statistics', getRepaymentStatistics);

// Get transaction by ID
router.get('/transactions/:id', getRepaymentTransactionById);

// Get transactions by account number
router.get('/accounts/:accountNo/transactions', getTransactionsByAccount);

// Get transactions by customer ID
router.get('/customers/:customerId/transactions', getTransactionsByCustomer);

// Update transaction status
router.patch('/transactions/:id/status', updateTransactionStatus);

// Delete (cancel) transaction
router.delete('/transactions/:id', deleteRepaymentTransaction);

export default router;