// src/routes/calculatorRoutes.js
import express from 'express';
import LoanCalculatorController from '../controllers/LoanCalculatorController.js';

const router = express.Router();

// Loan Calculator Routes
router.post('/calculate-loan-quote', LoanCalculatorController.calculateLoanQuote);
router.post('/calculate-daily-interest', LoanCalculatorController.calculateDailyInterest);
router.post('/calculate-penalty', LoanCalculatorController.calculatePenalty);
router.post('/compare-methods', LoanCalculatorController.compareMethods);

export default router;