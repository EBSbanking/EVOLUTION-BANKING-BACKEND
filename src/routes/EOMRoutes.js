// routes/EOMRoutes.js
import express from 'express';
import EOMController from '../controllers/EOMController.js';
import { EOMTaskController } from '../controllers/EOMTaskController.js';
import { authenticate, authorize } from '../middlewares/auth.js';
import { validateEOMClosure, checkEOMClosure } from '../middlewares/validateEOMClosure.js';
import {
  executeEndOfMonthClosing,
  getEOMStatusAPI,
  resetEOMStatusAPI,
  getEOMLogs,
  checkEOMDateClosure
} from '../controllers/OsController.js';

const router = express.Router();

// ============================================================
// EOM REPORT ROUTES
// ============================================================

// Generate a new EOM Report
router.post(
  '/reports/generate',
  authenticate,
  authorize(1, 'finance_manager', 'accountant'),
  EOMController.generateEOMReport
);

// Get all EOM Reports
router.get(
  '/reports',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  EOMController.getEOMReports
);

// Get EOM Report Summary
router.get(
  '/reports/summary',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  EOMController.getEOMReportSummary
);

// Get EOM Report by ID
router.get(
  '/reports/:reportId',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  EOMController.getEOMReportById
);

// Archive EOM Report
router.put(
  '/reports/:reportId/archive',
  authenticate,
  authorize(1, 'finance_manager'),
  EOMController.archiveEOMReport
);

// Delete EOM Report
router.delete(
  '/reports/:reportId',
  authenticate,
  authorize(1), // Admin only
  EOMController.deleteEOMReport
);

// ============================================================
// CLOSING PERIOD ROUTES
// ============================================================

// Get all closing periods
router.get(
  '/closing-periods',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  EOMController.getClosingPeriods
);

// Get closing period by month/year
router.get(
  '/closing-periods/:month/:year',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  EOMController.getClosingPeriodByMonthYear
);

// Get closing summary
router.get(
  '/closing-periods/summary',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  EOMController.getClosingSummary
);

// Create a new closing period
router.post(
  '/closing-periods',
  authenticate,
  authorize(1, 'finance_manager'),
  EOMController.createClosingPeriod
);

// Update closing period status
router.put(
  '/closing-periods/:month/:year/status',
  authenticate,
  authorize(1, 'finance_manager'),
  EOMController.updateClosingPeriodStatus
);

// Reverse a closing period
router.post(
  '/closing-periods/:month/:year/reverse',
  authenticate,
  authorize(1), // Admin only
  EOMController.reverseClosingPeriod
);

// ============================================================
// REOPEN A CLOSED PERIOD
// ============================================================

/**
 * Reopen a closed period (Admin only)
 * POST /api/eom/reopen/:month/:year
 * 
 * Request Body:
 * {
 *   reason: 'Need to make adjustments',
 *   userId: 'admin'
 * }
 */
router.post(
  '/reopen/:month/:year',
  authenticate,
  authorize(1), // Admin only
  EOMController.reopenPeriod
);

// ============================================================
// EOM EXECUTION ROUTES (Using OsController)
// ============================================================

/**
 * Execute End of Month Closing
 * POST /api/eom/execute
 */
router.post(
  '/execute',
  authenticate,
  authorize(1, 'finance_manager', 'accountant'),
  executeEndOfMonthClosing
);

/**
 * Get EOM Status
 * GET /api/eom/status
 */
router.get(
  '/status',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  getEOMStatusAPI
);

/**
 * Reset EOM Status
 * POST /api/eom/reset
 */
router.post(
  '/reset',
  authenticate,
  authorize(1), // Admin only
  resetEOMStatusAPI
);

/**
 * Get EOM Logs
 * GET /api/eom/logs
 */
router.get(
  '/logs',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  getEOMLogs
);

/**
 * Check if a date is in a closed period
 * GET /api/eom/check-date
 */
router.get(
  '/check-date',
  authenticate,
  authorize(1, 'finance_manager', 'accountant'),
  checkEOMDateClosure
);

// ============================================================
// EOM TASK ROUTES (Alternative - Using Task System)
// ============================================================

// Execute EOM Closing with Task Management
router.post(
  '/execute-task',
  authenticate,
  authorize(1, 'finance_manager', 'accountant'),
  EOMTaskController.createAndExecuteTask
);

// Get EOM Status with Task Management
router.get(
  '/status-task',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  EOMTaskController.getEOMStatus
);

// Get task status by task ID
router.get(
  '/tasks/:taskId',
  authenticate,
  authorize(1, 'finance_manager', 'accountant'),
  EOMTaskController.getTaskStatus
);

// Get recent EOM tasks
router.get(
  '/tasks',
  authenticate,
  authorize(1, 'finance_manager', 'accountant', 'auditor'),
  EOMTaskController.getRecentTasks
);

// Restart a failed task
router.post(
  '/tasks/:taskId/restart',
  authenticate,
  authorize(1), // Admin only
  EOMTaskController.restartTask
);

// Cancel a running task
router.post(
  '/tasks/:taskId/cancel',
  authenticate,
  authorize(1), // Admin only
  EOMTaskController.cancelTask
);

// ============================================================
// EOM VALIDATION MIDDLEWARE
// ============================================================

// Middleware to validate EOM closure for a specific date
router.get(
  '/validate-date/:date',
  authenticate,
  authorize(1, 'finance_manager', 'accountant'),
  async (req, res) => {
    try {
      const { date } = req.params;
      const { organizationCode = 1, branchCode = '001' } = req.query;
      
      const d = new Date(date);
      const month = d.getMonth() + 1;
      const year = d.getFullYear();

      const { EOMClosingPeriod } = await import('../models/EOMClosingPeriod.js');
      const isClosed = await EOMClosingPeriod.isMonthClosed(month, year, organizationCode, branchCode);
      
      res.json({
        success: true,
        data: {
          date,
          month,
          year,
          isClosed,
          canPost: !isClosed,
          message: isClosed ? `Month ${month}/${year} is closed` : `Month ${month}/${year} is open`
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to validate date',
        error: error.message
      });
    }
  }
);

// ============================================================
// EXPORT MIDDLEWARE FOR USE IN OTHER ROUTES
// ============================================================

export const eomValidation = {
  validateEOMClosure,
  checkEOMClosure
};

// ============================================================
// DEFAULT EXPORT
// ============================================================

export default router;