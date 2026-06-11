// src/routes/AMLMonitorRoutes.js
import express from 'express';
import {
  analyzeTransactionForAML,
  getCustomerRiskProfile,
  getSuspiciousActivityReports,
  updateSARStatus,
  getSystemRiskMetrics
} from '../controllers/AMLTransactionMonitorController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticate);

// Analyze a transaction for AML risk
router.post('/analyze-transaction', analyzeTransactionForAML);

// Get customer risk profile with AI predictions
router.get('/customer/:customerId/risk-profile', getCustomerRiskProfile);

// Get all Suspicious Activity Reports (SARs)
router.get('/suspicious-activity-reports', getSuspiciousActivityReports);

// Update SAR status
router.put('/suspicious-activity-reports/:sarId/status', updateSARStatus);

// Get system-wide risk metrics and dashboard data
router.get('/system-risk-metrics', getSystemRiskMetrics);

export default router;