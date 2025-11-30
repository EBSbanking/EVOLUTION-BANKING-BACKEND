import express from 'express';
import {
  getMigratedAccounts,
  getAllAccounts, // This should handle the main accounts endpoint
  getAccountByNumber,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  getAccountsByType,
  getAccountBalance,
  getAccountsSummary,
  searchAccounts,
  getMigrationStatistics
} from '../controllers/accountController.js';

const router = express.Router();

// 🔍 GET Routes
router.get('/migrated', getMigratedAccounts); // Get all migrated accounts
router.get('/', getAllAccounts); // Get all accounts with pagination & filtering
router.get('/summary', getAccountsSummary); // Get accounts summary
router.get('/migration-stats', getMigrationStatistics); // Get migration statistics
router.get('/search', searchAccounts); // Search accounts
router.get('/type/:accountType', getAccountsByType); // Get accounts by type
router.get('/number/:accountNumber', getAccountByNumber); // Get account by account number
router.get('/:id', getAccountById); // Get account by MongoDB ID
router.get('/:id/balance', getAccountBalance); // Get specific account balance

// ➕ POST Routes
router.post('/', createAccount); // Create new account
router.post('/bulk', createAccount); // Create multiple accounts (same endpoint, handles array)

// ✏️ PUT/PATCH Routes
router.put('/:id', updateAccount); // Full update
router.patch('/:id', updateAccount); // Partial update
router.patch('/number/:accountNumber', updateAccount); // Update by account number

// 🗑️ DELETE Routes
router.delete('/:id', deleteAccount); // Delete by ID
router.delete('/number/:accountNumber', deleteAccount); // Delete by account number

export default router;