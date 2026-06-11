// src/routes/loanInterestRoutes.js
import express from 'express';
import LoanInterestController from '../controllers/LoanInterestRateController.js'; // Corrected import path and name

const router = express.Router();

router.post('/create', LoanInterestController.createInterestRate);
router.get('/', LoanInterestController.getAllInterestRates);
router.get('/:id', LoanInterestController.getInterestRateById);
router.put('/:id', LoanInterestController.updateInterestRate);
router.delete('/:id', LoanInterestController.deleteInterestRate);
router.patch('/:id/activate', LoanInterestController.activateInterestRate);
router.post('/calculate', LoanInterestController.calculateInterest);
// Optional: router.post('/migrate-to-flat', LoanInterestController.migrateToFlatRate);

export default router;