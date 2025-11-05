import express from 'express';
import { exportIncomeExpenseReport, getIncomeExpenseSummary } from '../controllers/incomeExpenseController.js';

const router = express.Router();

// Income and expense report routes
router.get('/report', exportIncomeExpenseReport);
router.get('/summary', getIncomeExpenseSummary);

export default router;