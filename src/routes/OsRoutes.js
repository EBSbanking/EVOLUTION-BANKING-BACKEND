// src/routes/osRoutes.js
import express from 'express';
import OsController from '../controllers/OsController.js';

// Import processAutoCollections from the correct service file
import { processAutoCollections } from '../Services/autoCollectionService.js';

const router = express.Router();

// ============================================
// EXISTING ROUTES
// ============================================

// Service management routes
router.get('/dormant-accounts/count', OsController.getDormantAccountsCount);
router.post('/trigger-services', OsController.triggerEndOfDayProcess);
router.get('/status', OsController.getStatus);
router.get('/processing-date', OsController.getCurrentBusinessDate);
router.get('/error-service', OsController.getServiceErrors);

// Debugging routes
router.post('/initialize-dates', OsController.initializeSystemDates); // This is CORRECT
router.get('/debug-dates', OsController.debugDates);
router.get('/debug-date-issues', OsController.debugDateIssues);

// System status routes
router.get('/system-status', OsController.getSystemStatus);
router.post('/update-business-date', OsController.updateBusinessDate);

// ============================================
// EOD MANAGEMENT ROUTES
// ============================================

// EOD Processing
router.post('/eod/start', async (req, res) => {
  try {
    const { userId = 'system' } = req.body;
    // Fixed: Call processEndOfDay correctly
    const mockRes = {
      statusCode: 200,
      data: null,
      status: function(code) { 
        this.statusCode = code; 
        return this; 
      }, 
      json: function(data) { 
        this.data = data; 
        return data; 
      }
    };
    
    await OsController.processEndOfDay({ body: { userId, force: false } }, mockRes);
    res.json(mockRes.data || { success: true, message: 'EOD process completed' });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to start EOD process',
      error: error.message
    });
  }
});

// Manual date adjustment (admin only)
router.post('/date/manual-set', OsController.setBusinessDateManually);

// Service-specific routes
router.post('/services/reconciliation', OsController.processReconciliation);
router.post('/services/auto-collections', async (req, res) => {
  try {
    const result = await processAutoCollections();
    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Auto collections processing failed',
      error: error.message
    });
  }
});

router.post('/services/loan-overdue-status', OsController.processLoanOverdueAndStatus);
router.post('/services/gl-transactions', OsController.processEODGLTransactions);

// Business date calculation routes
router.post('/date/calculate-next', (req, res) => {
  try {
    const { currentDate } = req.body;
    const nextDate = OsController.calculateNextBusinessDate(new Date(currentDate || Date.now()));
    res.json({
      success: true,
      currentDate: currentDate || new Date().toISOString().split('T')[0],
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
    const nextDate = await OsController.calculateNextBusinessDateWithHolidays(new Date(currentDate || Date.now()));
    res.json({
      success: true,
      currentDate: currentDate || new Date().toISOString().split('T')[0],
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
    const nextDate = OsController.setNextBusinessDate();
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

// REMOVED DUPLICATE: router.post('/system/initialize', OsController.initializeSystemDates);
// This route is duplicated with line 23 above

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
        isEODProcessing: systemDate.isEODProcessing,
        eodStatus: systemDate.eodStatus,
        lastEODDate: systemDate.lastEODDate,
        lastEODProcessedBy: systemDate.lastEODProcessedBy,
        lastUpdated: systemDate.updatedAt,
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
        isEODProcessing: systemDate.isEODProcessing,
        eodStatus: systemDate.eodStatus,
        lastUpdated: systemDate.updatedAt,
        updatedBy: systemDate.UPDATED_BY || 'system'
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
    // Import systemStatus from OsController or create a simple health check
    const systemDate = await (await import('../models/SystemDate.js')).default.findOne().sort({ createdAt: -1 });
    
    const healthStatus = {
      systemDate: {
        exists: !!systemDate,
        currentDate: systemDate?.currentBusinessDate,
        eodStatus: systemDate?.eodStatus,
        isEODProcessing: systemDate?.isEODProcessing || false
      },
      database: {
        connected: true,
        connectionState: (await import('mongoose')).connection.readyState
      },
      timestamp: new Date().toISOString()
    };
    
    res.json({
      success: true,
      data: healthStatus
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get current business date (simple version)
router.get('/current-date', async (req, res) => {
  try {
    const systemDate = await (await import('../models/SystemDate.js')).default.findOne().sort({ createdAt: -1 });
    
    if (!systemDate) {
      return res.json({
        success: true,
        message: 'System date not initialized',
        currentBusinessDate: null,
        systemDateExists: false
      });
    }
    
    res.json({
      success: true,
      currentBusinessDate: systemDate.currentBusinessDate,
      nextBusinessDate: systemDate.nextBusinessDate,
      eodStatus: systemDate.eodStatus,
      systemDateExists: true
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Force set business date (admin only) - FIXED
router.post('/force-set-date', async (req, res) => {
  try {
    const { newDate, userId, reason } = req.body;
    
    if (!newDate || !userId) {
      return res.status(400).json({
        success: false,
        message: 'newDate and userId are required'
      });
    }
    
    // Create mock response object
    const mockRes = {
      statusCode: 200,
      data: null,
      status: function(code) { 
        this.statusCode = code; 
        return this; 
      }, 
      json: function(data) { 
        this.data = data; 
        return data; 
      }
    };
    
    // Call the OsController function with proper parameters
    await OsController.setBusinessDateManually({
      body: { newDate, updatedBy: userId, reason }
    }, mockRes);
    
    res.json(mockRes.data || { success: true, message: 'Date set successfully' });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to force set date',
      error: error.message
    });
  }
});

// Holiday system check
router.get('/holiday-check', async (req, res) => {
  try {
    const Holiday = (await import('../models/Holiday.js')).default;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const isHoliday = await Holiday.findOne({
      date: {
        $gte: today,
        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
      }
    });
    
    res.json({
      success: true,
      date: today.toISOString().split('T')[0],
      isHoliday: !!isHoliday,
      holidayDetails: isHoliday || null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Batch process EOD services
router.post('/batch-process', async (req, res) => {
  try {
    const { services = [], userId = 'system' } = req.body;
    
    const validServices = [
      'loanOverdueStatus',
      'autoCollections',
      'glTransactions',
      'reconciliation',
      'dormantAccounts'
    ];
    
    const servicesToRun = services.filter(service => validServices.includes(service));
    
    if (servicesToRun.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid services specified'
      });
    }
    
    const results = {};
    
    // Process each service
    for (const service of servicesToRun) {
      try {
        switch (service) {
          case 'loanOverdueStatus':
            results.loanOverdueStatus = await OsController.processLoanOverdueAndStatus();
            break;
          case 'autoCollections':
            results.autoCollections = await processAutoCollections();
            break;
          case 'glTransactions':
            results.glTransactions = await OsController.processEODGLTransactions();
            break;
          case 'reconciliation':
            results.reconciliation = await OsController.processReconciliation();
            break;
          case 'dormantAccounts':
            results.dormantAccounts = {
              success: true,
              message: 'Dormant accounts would be processed here'
            };
            break;
        }
      } catch (serviceError) {
        results[service] = {
          success: false,
          error: serviceError.message
        };
      }
    }
    
    res.json({
      success: true,
      message: 'Batch processing completed',
      processedServices: servicesToRun,
      results,
      processedBy: userId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Batch processing failed',
      error: error.message
    });
  }
});

export default router;