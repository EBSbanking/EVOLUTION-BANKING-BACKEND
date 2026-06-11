// routes/accountStatementRoutes.js
import express from 'express';
import { 
  generateAccountStatement, 
  exportCustomerAccounts, 
  debugAccount,
  getAccountStatementJSON,
  debugAccountTransactions
  // Remove checkRealTransactions if not needed
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
router.get('/export', exportCustomerAccounts);
router.get('/debug/:acctNo', debugAccount);

// Get account statement as JSON (for frontend display)
router.get('/:acctNo/statement-json', getAccountStatementJSON);

// Debug endpoint to check transactions
router.get('/debug-transactions/:acctNo', debugAccountTransactions);

export default router;