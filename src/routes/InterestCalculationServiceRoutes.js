// src/routes/loanInterestRoutes.js - UPDATED COMPATIBLE VERSION
import express from 'express';
import LoanInterestController from '../controllers/LoanInterestRateController.js'; // Fixed import

const router = express.Router();

// CREATE LOAN INTEREST RATE
router.post('/create', LoanInterestController.createInterestRate);

// GET ALL INTEREST RATES (with optional query params)
router.get('/', LoanInterestController.getAllInterestRates);

// GET INTEREST RATE BY ID - NOTE: Method name changed from getInterestRate to getInterestRateById
router.get('/:id', LoanInterestController.getInterestRateById);

// UPDATE INTEREST RATE BY ID
router.put('/:id', LoanInterestController.updateInterestRate);

// DELETE INTEREST RATE BY ID
router.delete('/:id', LoanInterestController.deleteInterestRate);

// ACTIVATE INTEREST RATE
router.patch('/:id/activate', LoanInterestController.activateInterestRate);

// CALCULATE INTEREST - ADD THIS NEW ROUTE
router.post('/calculate', LoanInterestController.calculateInterest);

// Alternative route if you want to support prodId as well
// router.get('/prod/:prodId', LoanInterestController.getInterestRateByProdId);

export default router;