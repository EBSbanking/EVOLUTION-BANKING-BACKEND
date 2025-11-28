// routes/accountStatementRoutes.js
import express from 'express';
// In your routes file
import { generateAccountStatement, exportCustomerAccounts, debugAccount } from '../controllers/accountStatementController.js';

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
router.get('/debug/:acctNo', debugAccount); // Add this new route

export default router;





