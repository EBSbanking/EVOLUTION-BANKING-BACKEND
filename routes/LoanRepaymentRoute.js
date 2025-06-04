import express from 'express';
import { repayLoan, getRepaymentHistory } from '../controllers/LoanRepaymentController.js';  // Correct import

const router = express.Router();

// Route for loan repayment
router.post('/repay-loan', repayLoan);

// Route for repayment history
router.get('/repayment-history', getRepaymentHistory);

export default router;
