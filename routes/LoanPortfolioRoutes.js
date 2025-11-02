// loanRoutes.js (or integrate into your main routes file)
// This sets up the Express router for the Loan Portfolio Report
// Mount this in your app: e.g., app.use('/api', loanRoutes);

import express from 'express';
import { exportLoanPortfolio } from '../controllers/LoanPortfolioReport.js';  // Adjust path to your controller file

const router = express.Router();

// Loan Portfolio Report Route
// Supports PDF/Excel formats, optional BU_ID filter, optional date range filter, optional orientation (for PDF)
// Example: GET /api/reports/loan-portfolio?format=pdf&orientation=landscape&buId=102&startDate=2025-01-01&endDate=2025-10-30
// Example: GET /api/reports/loan-portfolio?format=excel&buId=102&startDate=2025-01-01&endDate=2025-10-30
// (Uses current date context: endDate up to October 30, 2025)
router.get('/reports/loan-portfolio', exportLoanPortfolio);

export default router;