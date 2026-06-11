// src/routes/osRoutes.js
import express from 'express';

const router = express.Router();

// Helper to load OsController dynamically
const loadOsController = async () => {
  const module = await import('../controllers/OsController.js');
  return module.default;
};

// Helper to load processAutoCollections dynamically
const loadProcessAutoCollections = async () => {
  const module = await import('../Services/autoCollectionService.js');
  return module.processAutoCollections;
};

// Helper to load SystemDate model dynamically
const loadSystemDate = async () => {
  const module = await import('../models/SystemDate.js');
  return module.default;
};

// Helper to load Holiday model dynamically
const loadHoliday = async () => {
  const module = await import('../models/Holiday.js');
  return module.default;
};

// Helper to load sequelize dynamically
const loadSequelize = async () => {
  const module = await import('../../config/db.js');
  return module.sequelize;
};

// ============================================
// ROUTES (all use dynamic imports)
// ============================================

router.get('/dormant-accounts/count', async (req, res) => {
  const controller = await loadOsController();
  return controller.getDormantAccountsCount(req, res);
});

router.post('/trigger-services', async (req, res) => {
  const controller = await loadOsController();
  return controller.triggerEndOfDayProcess(req, res);
});

router.get('/status', async (req, res) => {
  const controller = await loadOsController();
  return controller.getStatus(req, res);
});

router.get('/processing-date', async (req, res) => {
  const controller = await loadOsController();
  return controller.getCurrentBusinessDate(req, res);
});

router.get('/error-service', async (req, res) => {
  const controller = await loadOsController();
  return controller.getServiceErrors(req, res);
});

router.post('/initialize-dates', async (req, res) => {
  const controller = await loadOsController();
  return controller.initializeSystemDates(req, res);
});

router.get('/debug-dates', async (req, res) => {
  const controller = await loadOsController();
  return controller.debugDates(req, res);
});

router.get('/debug-date-issues', async (req, res) => {
  const controller = await loadOsController();
  return controller.debugDateIssues(req, res);
});

router.get('/system-status', async (req, res) => {
  const controller = await loadOsController();
  return controller.getSystemStatus(req, res);
});

router.post('/update-business-date', async (req, res) => {
  const controller = await loadOsController();
  return controller.updateBusinessDate(req, res);
});

router.post('/eod/start', async (req, res) => {
  const controller = await loadOsController();
  const { userId = 'system' } = req.body;
  const mockRes = {
    statusCode: 200,
    data: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.data = data; return data; }
  };
  await controller.processEndOfDay({ body: { userId, force: false } }, mockRes);
  res.json(mockRes.data || { success: true, message: 'EOD process completed' });
});

router.post('/date/manual-set', async (req, res) => {
  const controller = await loadOsController();
  return controller.setBusinessDateManually(req, res);
});

router.post('/services/reconciliation', async (req, res) => {
  const controller = await loadOsController();
  return controller.processReconciliation(req, res);
});

router.post('/services/auto-collections', async (req, res) => {
  const processAutoCollections = await loadProcessAutoCollections();
  try {
    const result = await processAutoCollections();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: 'Auto collections processing failed', error: error.message });
  }
});

router.post('/services/loan-overdue-status', async (req, res) => {
  const controller = await loadOsController();
  return controller.processLoanOverdueAndStatus(req, res);
});

router.post('/services/gl-transactions', async (req, res) => {
  const controller = await loadOsController();
  return controller.processEODGLTransactions(req, res);
});

router.post('/date/calculate-next', async (req, res) => {
  const controller = await loadOsController();
  try {
    const { currentDate } = req.body;
    const nextDate = controller.calculateNextBusinessDate(new Date(currentDate || Date.now()));
    res.json({
      success: true,
      currentDate: currentDate || new Date().toISOString().split('T')[0],
      nextBusinessDate: nextDate.toISOString().split('T')[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/date/calculate-next-with-holidays', async (req, res) => {
  const controller = await loadOsController();
  try {
    const { currentDate } = req.body;
    const nextDate = await controller.calculateNextBusinessDateWithHolidays(new Date(currentDate || Date.now()));
    res.json({
      success: true,
      currentDate: currentDate || new Date().toISOString().split('T')[0],
      nextBusinessDate: nextDate.toISOString().split('T')[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/date/set-next', async (req, res) => {
  const controller = await loadOsController();
  try {
    const nextDate = controller.setNextBusinessDate();
    res.json({
      success: true,
      message: 'Next business date set successfully',
      nextBusinessDate: nextDate.toISOString().split('T')[0],
      currentBusinessDate: new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/eod/status', async (req, res) => {
  try {
    const SystemDate = await loadSystemDate();
    const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
    if (!systemDate) {
      return res.status(404).json({ success: false, message: 'System date not found' });
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
        eodHistory: systemDate.eodHistory?.slice(-5) || []
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/date/info', async (req, res) => {
  try {
    const SystemDate = await loadSystemDate();
    const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
    if (!systemDate) {
      return res.status(404).json({ success: false, message: 'System date not found' });
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
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/services/health', async (req, res) => {
  try {
    const SystemDate = await loadSystemDate();
    const sequelize = await loadSequelize();
    const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
    let dbConnected = false;
    try {
      await sequelize.authenticate();
      dbConnected = true;
    } catch (e) { /* ignore */ }
    res.json({
      success: true,
      data: {
        systemDate: {
          exists: !!systemDate,
          currentDate: systemDate?.currentBusinessDate,
          eodStatus: systemDate?.eodStatus,
          isEODProcessing: systemDate?.isEODProcessing || false
        },
        database: { connected: dbConnected },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/current-date', async (req, res) => {
  try {
    const SystemDate = await loadSystemDate();
    const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
    if (!systemDate) {
      return res.json({ success: true, message: 'System date not initialized', currentBusinessDate: null, systemDateExists: false });
    }
    res.json({
      success: true,
      currentBusinessDate: systemDate.currentBusinessDate,
      nextBusinessDate: systemDate.nextBusinessDate,
      eodStatus: systemDate.eodStatus,
      systemDateExists: true
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/force-set-date', async (req, res) => {
  try {
    const { newDate, userId, reason } = req.body;
    if (!newDate || !userId) {
      return res.status(400).json({ success: false, message: 'newDate and userId are required' });
    }
    const controller = await loadOsController();
    const mockRes = {
      statusCode: 200,
      data: null,
      status(code) { this.statusCode = code; return this; },
      json(data) { this.data = data; return data; }
    };
    await controller.setBusinessDateManually({ body: { newDate, updatedBy: userId, reason } }, mockRes);
    res.json(mockRes.data || { success: true, message: 'Date set successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to force set date', error: error.message });
  }
});

router.get('/holiday-check', async (req, res) => {
  try {
    const Holiday = await loadHoliday();
    const { Op } = await import('sequelize');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isHoliday = await Holiday.findOne({
      where: { date: { [Op.gte]: today, [Op.lt]: tomorrow } }
    });
    res.json({
      success: true,
      date: today.toISOString().split('T')[0],
      isHoliday: !!isHoliday,
      holidayDetails: isHoliday || null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/batch-process', async (req, res) => {
  try {
    const { services = [], userId = 'system' } = req.body;
    const validServices = ['loanOverdueStatus', 'autoCollections', 'glTransactions', 'reconciliation', 'dormantAccounts'];
    const servicesToRun = services.filter(s => validServices.includes(s));
    if (servicesToRun.length === 0) {
      return res.status(400).json({ success: false, message: 'No valid services specified' });
    }
    const controller = await loadOsController();
    const processAutoCollections = await loadProcessAutoCollections();
    const results = {};
    for (const service of servicesToRun) {
      try {
        switch (service) {
          case 'loanOverdueStatus':
            results.loanOverdueStatus = await controller.processLoanOverdueAndStatus();
            break;
          case 'autoCollections':
            results.autoCollections = await processAutoCollections();
            break;
          case 'glTransactions':
            results.glTransactions = await controller.processEODGLTransactions();
            break;
          case 'reconciliation':
            results.reconciliation = await controller.processReconciliation();
            break;
          case 'dormantAccounts':
            results.dormantAccounts = { success: true, message: 'Dormant accounts would be processed here' };
            break;
        }
      } catch (serviceError) {
        results[service] = { success: false, error: serviceError.message };
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
    res.status(500).json({ success: false, message: 'Batch processing failed', error: error.message });
  }
});

export default router;