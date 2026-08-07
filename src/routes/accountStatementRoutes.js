// routes/accountStatementRoutes.js
import express from 'express';
import { 
  generateAccountStatement, 
  exportCustomerAccounts, 
  debugAccount,
  getAccountStatementJSON,
  debugAccountTransactions,
  // ✅ New transaction endpoints
  getTransactionHistory,
  getTransactionDetails,
  getTransactionTypes,
  exportTransactionHistory
} from '../controllers/AccountStatementController.js';

const router = express.Router();

/**
 * @route GET /api/account-report/:acctNo/statement
 * @desc Generate account statement PDF for an account with optional date filters
 * @query startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 * 
 * @route POST /api/account-report/:acctNo/statement  
 * @desc Generate account statement PDF for an account with date filters in request body
 * @body {startDate: YYYY-MM-DD, endDate: YYYY-MM-DD}
 */
router.get('/:acctNo/statement', generateAccountStatement);

/**
 * @route GET /api/account-report/export
 * @desc Export customer accounts data
 * @query search, limit, branch, status, dateFrom, dateTo
 */
router.get('/export', exportCustomerAccounts);

/**
 * @route GET /api/account-report/debug/:acctNo
 * @desc Debug account - check if account exists in both tables
 */
router.get('/debug/:acctNo', debugAccount);

/**
 * @route GET /api/account-report/:acctNo/statement-json
 * @desc Get account statement as JSON (for frontend display)
 * @query startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
router.get('/:acctNo/statement-json', getAccountStatementJSON);

/**
 * @route GET /api/account-report/debug-transactions/:acctNo
 * @desc Debug transactions for an account
 */
router.get('/debug-transactions/:acctNo', debugAccountTransactions);

// ============================================================
// ✅ NEW TRANSACTION ENDPOINTS
// ============================================================

/**
 * @route GET /api/account-report/transactions/:acctNo/history
 * @desc Get transaction history for a specific account
 * @query startDate, endDate, transactionType, status, limit, page, sortBy, sortOrder
 * @example /api/account-report/transactions/2411498601/history?startDate=2026-07-01&endDate=2026-07-31&limit=50
 */
router.get('/transactions/:acctNo/history', getTransactionHistory);

/**
 * @route GET /api/account-report/transactions/:transactionId/details
 * @desc Get detailed transaction information by transaction ID
 * @example /api/account-report/transactions/1/details
 */
router.get('/transactions/:transactionId/details', getTransactionDetails);

/**
 * @route GET /api/account-report/transactions/types
 * @desc Get list of all transaction types with counts
 * @example /api/account-report/transactions/types
 */
router.get('/transactions/types', getTransactionTypes);

/**
 * @route GET /api/account-report/transactions/export
 * @desc Export transaction history for an account
 * @query acctNo, startDate, endDate, transactionType, status, format (json/excel)
 * @example /api/account-report/transactions/export?acctNo=2411498601&format=json
 */
router.get('/transactions/export', exportTransactionHistory);

// ============================================================
// ✅ LEGACY/ALIAS ENDPOINTS (for backward compatibility)
// ============================================================

/**
 * @route GET /api/account-report/:acctNo/transactions
 * @desc Alias for transaction history (legacy)
 */
router.get('/:acctNo/transactions', getTransactionHistory);

export default router;