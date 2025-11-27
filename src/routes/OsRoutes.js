// src/routes/osRoutes.js
import express from 'express';
import { 
  triggerEndOfDayProcess, 
  getCurrentBusinessDate, 
  getServiceErrors, 
  getDormantAccountsCount, 
  getStatus,
  initializeSystemDatesManual,
  debugDates,
  getSystemStatus,
  updateBusinessDate,
  processEndOfDay,
  setBusinessDateManually,
  processReconciliation,
  processLoanOverdueAndStatus,
  processEODGLTransactions,
  calculateNextBusinessDate,
  calculateNextBusinessDateWithHolidays,
  setNextBusinessDate,
  debugHolidaySystem,
  debugDateIssues,
  initializeSystemDates
} from '../controllers/OsController.js';

// Import processAutoCollections from the correct service file
import { processAutoCollections } from '../Services/autoCollectionService.js';

const router = express.Router();

// ============================================
// EXISTING ROUTES
// ============================================

// Service management routes
router.get('/dormant-accounts/count', getDormantAccountsCount);
router.post('/trigger-services', triggerEndOfDayProcess);
router.get('/status', getStatus);
router.get('/processing-date', getCurrentBusinessDate);
router.get('/error-service', getServiceErrors);

// Debugging routes
router.post('/initialize-dates', initializeSystemDatesManual);
router.get('/debug-dates', debugDates);
router.get('/debug-holiday-system', debugHolidaySystem);
router.get('/debug-date-issues', debugDateIssues);

// System status routes
router.get('/system-status', getSystemStatus);
router.post('/update-business-date', updateBusinessDate);

// ============================================
// EOD MANAGEMENT ROUTES
// ============================================

// EOD Processing
router.post('/eod/start', processEndOfDay);

// Manual date adjustment (admin only)
router.post('/date/manual-set', setBusinessDateManually);

// Service-specific routes
router.post('/services/reconciliation', processReconciliation);
router.post('/services/auto-collections', processAutoCollections); // Now imported correctly
router.post('/services/loan-overdue-status', processLoanOverdueAndStatus);
router.post('/services/gl-transactions', processEODGLTransactions);

// Business date calculation routes
router.post('/date/calculate-next', (req, res) => {
  try {
    const { currentDate } = req.body;
    const nextDate = calculateNextBusinessDate(new Date(currentDate || Date.now()));
    res.json({
      success: true,
      currentDate: currentDate,
      nextBusinessDate: nextDate.toISOString().split('T')[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/date/calculate-next-with-holidays', async (req, res) => {
  try {
    const { currentDate } = req.body;
    const nextDate = await calculateNextBusinessDateWithHolidays(new Date(currentDate || Date.now()));
    res.json({
      success: true,
      currentDate: currentDate,
      nextBusinessDate: nextDate.toISOString().split('T')[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

router.post('/date/set-next', (req, res) => {
  try {
    const nextDate = setNextBusinessDate();
    res.json({
      success: true,
      message: 'Next business date set successfully',
      nextBusinessDate: nextDate.toISOString().split('T')[0],
      currentBusinessDate: new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// System initialization
router.post('/system/initialize', initializeSystemDates);

// EOD Status
router.get('/eod/status', async (req, res) => {
  try {
    const SystemDate = (await import('../models/SystemDate.js')).default;
    const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
    
    if (!systemDate) {
      return res.status(404).json({
        success: false,
        message: 'System date not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        currentBusinessDate: systemDate.currentBusinessDate,
        previousBusinessDate: systemDate.previousBusinessDate,
        nextBusinessDate: systemDate.nextBusinessDate,
        eodStatus: systemDate.eodStatus,
        lastUpdated: systemDate.lastUpdated,
        eodHistory: systemDate.eodHistory?.slice(-5) || [] // Last 5 EOD operations
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// System Date Information
router.get('/date/info', async (req, res) => {
  try {
    const SystemDate = (await import('../models/SystemDate.js')).default;
    const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
    
    if (!systemDate) {
      return res.status(404).json({
        success: false,
        message: 'System date not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        currentBusinessDate: systemDate.currentBusinessDate,
        previousBusinessDate: systemDate.previousBusinessDate,
        nextBusinessDate: systemDate.nextBusinessDate,
        eodStatus: systemDate.eodStatus,
        lastUpdated: systemDate.lastUpdated,
        updatedBy: systemDate.updatedBy
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Service health check
router.get('/services/health', async (req, res) => {
  try {
    const services = [
      'loanProcessing',
      'processAutoCollections', 
      'loanStatusUpdates',
      'interestPosting',
      'glTransactions',
      'reconciliation',
      'dormantAccounts'
    ];
    
    const healthStatus = {};
    
    for (const service of services) {
      healthStatus[service] = {
        healthy: systemStatus.services[service]?.healthy || false,
        lastRun: systemStatus.services[service]?.lastRun || null,
        lastError: systemStatus.services[service]?.lastError || null
      };
    }
    
    res.json({
      success: true,
      data: healthStatus,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;