// In your routes file
import express from 'express';
import LoanPortfolioController from '../controllers/LoanPortfolioController.js';

const router = express.Router();

router.post('/portfolio', LoanPortfolioController.createPortfolioRecord);
router.get('/portfolio/summary', LoanPortfolioController.getPortfolioSummary);
router.get('/portfolio/health', LoanPortfolioController.getPortfolioHealth);
router.post('/portfolio/generate', LoanPortfolioController.generatePortfolioForPeriod);
// ... other routes

export default router;