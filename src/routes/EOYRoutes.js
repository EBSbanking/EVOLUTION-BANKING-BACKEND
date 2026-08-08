// routes/EOYRoutes.js
import express from 'express';
import EOYReportController from '../controllers/EOYReportController.js';
import ClosingPeriodController from '../controllers/ClosingPeriodController.js';
import { authenticate, authorize, isAdmin } from '../middlewares/auth.js';
import {
  executeYearEndClosing,
  getEOYStatusAPI,
  resetEOYStatusAPI,
  getEOYLogs
} from '../controllers/OsController.js';

const router = express.Router();

// ============================================================
// EOY REPORT ROUTES
// ============================================================

// Generate a new EOY Report
router.post(
  '/reports/generate',
  authenticate,
  authorize(1, 'finance_manager', 'accountant'),
  EOYReportController.generateReport
);

// Get all EOY Reports
router.get(
  '/reports',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  EOYReportController.getReports
);

// Get EOY Report Summary
router.get(
  '/reports/summary',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  EOYReportController.getReportSummary
);

// Get EOY Report by ID
router.get(
  '/reports/:reportId',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  EOYReportController.getReportById
);

// Archive EOY Report
router.put(
  '/reports/:reportId/archive',
  authenticate,
  authorize(1, 'finance_manager'),
  EOYReportController.archiveReport
);

// Delete EOY Report
router.delete(
  '/reports/:reportId',
  authenticate,
  authorize(1), // Admin only
  EOYReportController.deleteReport
);

// ============================================================
// CLOSING PERIOD ROUTES
// ============================================================

// Get all closing periods
router.get(
  '/closing-periods',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  ClosingPeriodController.getClosingPeriods
);

// Get closing period by fiscal year
router.get(
  '/closing-periods/:fiscalYear',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  ClosingPeriodController.getClosingPeriodByYear
);

// Get closing summary
router.get(
  '/closing-periods/summary',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  ClosingPeriodController.getClosingSummary
);

// Create a new closing period
router.post(
  '/closing-periods',
  authenticate,
  authorize(1, 'finance_manager'),
  ClosingPeriodController.createClosingPeriod
);

// Update closing period status
router.put(
  '/closing-periods/:fiscalYear/status',
  authenticate,
  authorize(1, 'finance_manager'),
  ClosingPeriodController.updateClosingPeriodStatus
);

// Reverse a closing period
router.post(
  '/closing-periods/:fiscalYear/reverse',
  authenticate,
  authorize(1), // Admin only
  ClosingPeriodController.reverseClosingPeriod
);

// ============================================================
// EOY EXECUTION ROUTES - NEW
// ============================================================

/**
 * Execute Year-End Closing
 * POST /api/eoy/execute
 * 
 * Request Body:
 * {
 *   fiscalYear: 2025,
 *   userId: 'system',
 *   organizationCode: 1,
 *   branchCode: '001',
 *   dryRun: false,
 *   force: false,
 *   checkOnly: false
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   message: "Year-End Closing for FY2025 executed successfully",
 *   data: {
 *     fiscalYear: 2025,
 *     dryRun: false,
 *     executionTime: 12345,
 *     result: {...},
 *     status: {...}
 *   }
 * }
 */
router.post(
  '/execute',
  authenticate,
  authorize(1, 'finance_manager', 'accountant'),
  executeYearEndClosing
);

/**
 * Get EOY Status
 * GET /api/eoy/status
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     isRunning: false,
 *     isLocked: false,
 *     canRun: true,
 *     eoyState: 'IDLE',
 *     eoyProgress: 0,
 *     currentFiscalYear: null,
 *     lastEOYRun: null,
 *     errors: [],
 *     warnings: [],
 *     timestamp: '2025-01-01T00:00:00.000Z'
 *   }
 * }
 */
router.get(
  '/status',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  getEOYStatusAPI
);

/**
 * Reset EOY Status
 * POST /api/eoy/reset
 * 
 * Request Body:
 * {
 *   confirm: true
 * }
 * 
 * Response:
 * {
 *   success: true,
 *   message: "EOY status reset successfully",
 *   oldState: 'FAILED',
 *   newState: 'IDLE'
 * }
 */
router.post(
  '/reset',
  authenticate,
  authorize(1), // Admin only
  resetEOYStatusAPI
);

/**
 * Get EOY Logs
 * GET /api/eoy/logs?limit=100&level=error
 * 
 * Query Parameters:
 * - limit: number (default: 100)
 * - level: info | success | error | warning
 * 
 * Response:
 * {
 *   success: true,
 *   data: {
 *     logs: [...],
 *     count: 50,
 *     total: 150,
 *     errors: [...],
 *     warnings: [...]
 *   }
 * }
 */
router.get(
  '/logs',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  getEOYLogs
);

export default router;