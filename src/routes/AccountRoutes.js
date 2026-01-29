// src/routes/accountRoutes.js - FINAL CLEAN & ORGANIZED VERSION
import express from 'express';
import {
  getMigratedAccounts,
  getAllAccounts,
  getAccountByNumber,
  getAccountById,
  createAccount,
  updateAccount,
  deleteAccount,
  getAccountsByType,
  getAccountBalance,
  getAccountsSummary,
  searchAccounts,
  getMigrationStatistics,
} from '../controllers/accountController.js';

// Optional: Import auth middleware if these routes should be protected
// import { authenticate } from '../middleware/auth.js';

const router = express.Router();

// ========================================
// 🔒 OPTIONAL: Protect all account routes
// ========================================
// router.use(authenticate); // Uncomment to require login for all account endpoints

// ========================================
// 📊 GET Routes - Retrieval & Queries
// ========================================
router.get('/migrated', getMigratedAccounts);                    // Get all migrated accounts
router.get('/', getAllAccounts);                                 // Get all accounts (with pagination, filters)
router.get('/summary', getAccountsSummary);                      // Dashboard summary of accounts
router.get('/migration-stats', getMigrationStatistics);          // Migration progress/stats
router.get('/search', searchAccounts);                           // Search accounts by name, phone, etc.
router.get('/type/:accountType', getAccountsByType);             // Filter by type (SAVINGS, CURRENT, etc.)
router.get('/number/:accountNumber', getAccountByNumber);        // Primary lookup by account number
router.get('/:id', getAccountById);                              // Lookup by internal DB ID
router.get('/:id/balance', getAccountBalance);                   // Get current balance only

// ========================================
// ➕ POST Routes - Creation
// ========================================
router.post('/', createAccount);                                 // Create single account
router.post('/bulk', createAccount);                             // Create multiple accounts (controller handles array)

// ========================================
// ✏️ PUT / PATCH Routes - Updates
// ========================================
router.put('/:id', updateAccount);                               // Full replacement update by ID
router.patch('/:id', updateAccount);                             // Partial update by ID
router.patch('/number/:accountNumber', updateAccount);           // Partial update by account number

// ========================================
// 🗑️ DELETE Routes - Removal
// ========================================
router.delete('/:id', deleteAccount);                            // Delete by internal ID
router.delete('/number/:accountNumber', deleteAccount);          // Delete by account number

export default router;