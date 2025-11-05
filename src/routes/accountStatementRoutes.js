// routes/accountStatementRoutes.js
import express from 'express';
import { generateAccountStatement, exportCustomerAccounts } from '../controllers/AccountStatementController.js';

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
router.post('/:acctNo/statement', generateAccountStatement); // Add POST support


router.get("/customer-accounts", exportCustomerAccounts);

export default router;