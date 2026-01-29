// routes/VaultTransactions.js
import express from 'express';
import {
  vaultDeposit,
  vaultWithdrawal,
  vaultToVaultTransfer,
  getVaultTransactions,
  getVaultTransactionById,
  getVaultBalance,
  getVaultDailySummary,
  getVaultTransactionHistory,
  cancelVaultTransaction,
  getVaultTransactionStatistics,
  searchVaultTransactions,
  exportVaultTransactions,
  reverseVaultTransaction,
  
  // New imports
  validateVaultTransaction,
  getVaultPendingTransactions,
  approveVaultTransactions,
  getVaultTransactionByReference,
  searchVaultTransactionsAdvanced,
  getTransactionReferencesByUser
} from '../controllers/vaultTransactionController.js';

const router = express.Router();

// Existing routes
router.post('/deposit', vaultDeposit);
router.post('/withdrawal', vaultWithdrawal);
router.post('/transfer', vaultToVaultTransfer);
router.get('/', getVaultTransactions);
router.get('/:transactionId', getVaultTransactionById);
router.get('/vault/:vaultId/balance', getVaultBalance);
router.get('/vault/:vaultId/daily/:date', getVaultDailySummary);
router.get('/vault/:vaultId/history', getVaultTransactionHistory);
router.post('/:transactionId/cancel', cancelVaultTransaction);
router.get('/statistics/:vaultId', getVaultTransactionStatistics);
router.get('/search', searchVaultTransactions);
router.get('/export', exportVaultTransactions);
router.post('/:transactionId/reverse', reverseVaultTransaction);

// New routes
router.post('/validate', validateVaultTransaction);
router.get('/pending', getVaultPendingTransactions);
router.post('/approve', approveVaultTransactions);
router.get('/reference/:referenceNo', getVaultTransactionByReference);
router.get('/search/advanced', searchVaultTransactionsAdvanced);
router.get('/user/:userId/references', getTransactionReferencesByUser);

export default router;