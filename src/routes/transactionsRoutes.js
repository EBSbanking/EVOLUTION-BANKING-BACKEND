// src/routes/TransactionRoutes.js
import express from 'express';
import transactionController from '../Services/postTransaction.js';

const router = express.Router();

console.log('🔧 Transaction routes loading...');

// Helper to load decryptPayload dynamically
const loadDecryptPayload = async () => {
  try {
    const module = await import('../middleware/decryptPayload.js');
    return module.default;
  } catch (error) {
    console.log('⚠️ DecryptPayload not available:', error.message);
    return null;
  }
};

// Dynamic middleware wrapper
const withDecryption = async (req, res, next) => {
  const decryptPayload = await loadDecryptPayload();
  if (decryptPayload && typeof decryptPayload === 'function') {
    return decryptPayload(req, res, next);
  }
  req.decrypted = false;
  next();
};

// Main transaction endpoint
router.post('/transactions', withDecryption, async (req, res) => {
  console.log('📥 Transaction request received');
  console.log('🔐 Decrypted:', req.decrypted);
  
  try {
    return await transactionController.postTransaction(req, res);
  } catch (error) {
    console.error('❌ Transaction error:', error);
    return res.status(500).json({
      success: false,
      message: 'Transaction failed',
      error: error.message
    });
  }
});

// In your routes file (e.g., transactionRoutes.js or index.js)

// Get daily transactions for a specific teller
router.get(
  '/transactions/teller/daily/:userId',
  transactionController.getTellerDailyTransactions
);

// Alternative with query parameter
router.get(
  '/transactions/teller/daily',
  transactionController.getTellerDailyTransactions
);

// Get teller transaction summary (for dashboard)
router.get(
  '/transactions/teller/summary',
  transactionController.getTellerTransactionSummary
);

// All other routes (keep your existing ones)
router.get('/transactions/account/:accountNo/balance', transactionController.getAccountBalance);
router.get('/transactions/account/:accountNo', transactionController.getTransactionsByAccount);
router.get('/transactions/customer/:customerId/accounts', transactionController.getCustomerAccounts);
router.get('/transactions/history', transactionController.getTransactionHistory);
router.get('/transactions/customer/id/:customerId', transactionController.getTransactionsByCustomer);
router.get('/transactions/customer/name/:customerName', transactionController.getTransactionsByCustomerName);
router.get('/transactions/export', transactionController.exportTransactions);
router.get('/transactions/export/customer/id/:customerId', transactionController.exportTransactionsByCustomer);
router.get('/transactions/export/customer/name/:customerName', transactionController.exportTransactionsByCustomerName);
router.post('/transactions/export/batch', transactionController.exportBatchTransactions);
router.get('/transactions/debug/accounts', transactionController.debugAccounts);
router.get('/transactions/health', (req, res) => {
  res.json({ status: 'healthy', service: 'transaction-api', timestamp: new Date().toISOString() });
});

export default router;