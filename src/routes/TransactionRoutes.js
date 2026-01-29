// routes/transactionRoutes.js
import express from 'express';
import transactionController from '../Services/postTransaction.js';
import authMiddleware from '../middlewares/authMiddleware.js'; // Optional: if you have auth middleware

const router = express.Router();

// ==================== TRANSACTION POSTING ====================
router.post('/transactions', transactionController.postTransaction);

// ==================== ACCOUNT BALANCE ENDPOINTS ====================
router.get('/transactions/account/:accountNo/balance', transactionController.getAccountBalance);
router.get('/transactions/account/:accountNo', transactionController.getTransactionsByAccount);
router.get('/transactions/customer/:customerId/accounts', transactionController.getCustomerAccounts);

// ==================== TRANSACTION QUERY ENDPOINTS ====================
router.get('/transactions/history', transactionController.getTransactionHistory);
router.get('/transactions/customer/id/:customerId', transactionController.getTransactionsByCustomer);
router.get('/transactions/customer/name/:customerName', transactionController.getTransactionsByCustomerName);

// ==================== EXPORT ENDPOINTS ====================
router.get('/transactions/export', transactionController.exportTransactions);

router.get('/transactions/export/customer/id/:customerId', transactionController.exportTransactionsByCustomer);
router.get('/transactions/export/customer/name/:customerName', transactionController.exportTransactionsByCustomerName);
router.post('/transactions/export/batch', transactionController.exportBatchTransactions); // Batch export

// ==================== DEBUG ENDPOINTS ====================
router.get('/transactions/debug/accounts', transactionController.debugAccounts);

export default router;