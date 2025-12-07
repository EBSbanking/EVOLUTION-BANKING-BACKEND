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
  getVaultPendingTransactions,
  validateVaultTransaction,
  getVaultTransactionByReference
} from '../controllers/VaultTransactionController.js';

const router = express.Router();

// =============================================
// VAULT TRANSACTION ROUTES
// =============================================

/**
 * @route   POST /api/vault/transactions/deposit
 * @desc    Deposit cash into vault
 * @access  Private (Vault Manager, Teller Supervisor)
 */
router.post('/deposit', vaultDeposit);

/**
 * @route   POST /api/vault/transactions/withdrawal
 * @desc    Withdraw cash from vault
 * @access  Private (Vault Manager, Branch Manager)
 */
router.post('/withdrawal', vaultWithdrawal);

/**
 * @route   POST /api/vault/transactions/vault-to-vault
 * @desc    Transfer between vaults
 * @access  Private (Vault Manager, Regional Manager)
 */
router.post('/vault-to-vault', vaultToVaultTransfer);

/**
 * @route   POST /api/vault/transactions/validate
 * @desc    Validate vault transaction before processing
 * @access  Private (Vault Manager, Teller)
 */
router.post('/validate', validateVaultTransaction);

/**
 * @route   GET /api/vault/transactions
 * @desc    Get all vault transactions with filters
 * @access  Private (Vault Manager, Auditor)
 */
router.get('/', getVaultTransactions);

/**
 * @route   GET /api/vault/transactions/search
 * @desc    Search vault transactions
 * @access  Private (Vault Manager, Auditor)
 */
router.get('/search', searchVaultTransactions);

/**
 * @route   GET /api/vault/transactions/export
 * @desc    Export vault transactions to CSV/Excel
 * @access  Private (Vault Manager, Auditor)
 */
router.get('/export', exportVaultTransactions);

/**
 * @route   GET /api/vault/transactions/pending
 * @desc    Get pending vault transactions
 * @access  Private (Vault Manager, Supervisor)
 */
router.get('/pending', getVaultPendingTransactions);

/**
 * @route   GET /api/vault/transactions/:transactionId
 * @desc    Get vault transaction by ID
 * @access  Private (Vault Manager, Auditor)
 */
router.get('/:transactionId', getVaultTransactionById);

/**
 * @route   GET /api/vault/transactions/reference/:referenceNo
 * @desc    Get vault transaction by reference number
 * @access  Private (Vault Manager, Auditor)
 */
router.get('/reference/:referenceNo', getVaultTransactionByReference);

/**
 * @route   GET /api/vault/transactions/vault/:vaultId
 * @desc    Get transaction history for specific vault
 * @access  Private (Vault Manager)
 */
router.get('/vault/:vaultId', getVaultTransactionHistory);

/**
 * @route   GET /api/vault/transactions/vault/:vaultId/balance
 * @desc    Get current balance of vault
 * @access  Private (Vault Manager, Teller)
 */
router.get('/vault/:vaultId/balance', getVaultBalance);

/**
 * @route   GET /api/vault/transactions/vault/:vaultId/summary/:date
 * @desc    Get daily summary for vault
 * @access  Private (Vault Manager, Supervisor)
 */
router.get('/vault/:vaultId/summary/:date', getVaultDailySummary);

/**
 * @route   GET /api/vault/transactions/vault/:vaultId/statistics
 * @desc    Get transaction statistics for vault
 * @access  Private (Vault Manager, Branch Manager)
 */
router.get('/vault/:vaultId/statistics', getVaultTransactionStatistics);

/**
 * @route   DELETE /api/vault/transactions/:transactionId/cancel
 * @desc    Cancel a vault transaction
 * @access  Private (Vault Manager, Branch Manager)
 */
router.delete('/:transactionId/cancel', cancelVaultTransaction);

/**
 * @route   POST /api/vault/transactions/:transactionId/reverse
 * @desc    Reverse a vault transaction
 * @access  Private (Vault Manager, Branch Manager)
 */
router.post('/:transactionId/reverse', reverseVaultTransaction);

export default router;