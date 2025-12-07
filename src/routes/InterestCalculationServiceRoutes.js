// src/routes/loanInterestRoutes.js
import express from 'express';
import LoanInterestController from '../controllers/LoanInterestRateController.js';

// Assuming you have middleware for authentication/protection if needed
// import { protect, authorize } from '../middleware/auth.js'; // Uncomment if auth is required

const router = express.Router();

// CREATE LOAN INTEREST RATE
router.post('/create', LoanInterestController.createInterestRate);

// GET ALL INTEREST RATES (with optional query params: page, limit, search, status, rateType)
router.get('/', LoanInterestController.getAllInterestRates);

// GET INTEREST RATE BY PROD_ID
router.get('/:prodId', LoanInterestController.getInterestRate);

// GET INTEREST RATE BY LOAN_PROUD_INT_ID
router.get('/loan-product/:loanProudIntId', LoanInterestController.getInterestRateByLoanProductId);

// UPDATE INTEREST RATE BY PROD_ID
router.put('/:prodId', LoanInterestController.updateInterestRate);

// DELETE INTEREST RATE BY PROD_ID
router.delete('/:prodId', LoanInterestController.deleteInterestRate);

// UPDATE CAPITALIZATION STATUS BY LOAN_PROUD_INT_ID
router.put('/capitalization/:loanProudIntId', LoanInterestController.updateCapitalizationStatus);

// GET CAPITALIZATION STATUS BY LOAN_PROUD_INT_ID
router.get('/capitalization/:loanProudIntId', LoanInterestController.getCapitalizationStatus);

// SEARCH INTEREST RATES (with query params: search, productId, status, rateType, startDate, endDate, page, limit)
router.get('/search', LoanInterestController.searchInterestRates);

// CALCULATE EMI
router.post('/emi/calculate', LoanInterestController.calculateEMI);

// CALCULATE DAILY INTEREST
router.post('/daily-interest/calculate', LoanInterestController.calculateDailyInterest);

export default router;