// routes/SystemDateRoutes.js
import express from 'express';
import { SystemDateController } from '../controllers/SystemDateController.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = express.Router();

// =============================================
// SYSTEM DATE MANAGEMENT ROUTES
// =============================================

// =============================================
// ✅ BUSINESS DATE STATUS ROUTE - WITH ERROR HANDLING
// =============================================
router.get(
  '/status',
  authenticate,
  async (req, res, next) => {
    try {
      // ✅ Check if controller method exists
      if (!SystemDateController.getBusinessDateStatus) {
        console.error('❌ SystemDateController.getBusinessDateStatus is undefined');
        return res.status(501).json({
          success: false,
          message: 'Business date status endpoint not implemented',
          error: 'Controller method missing'
        });
      }
      
      if (typeof SystemDateController.getBusinessDateStatus !== 'function') {
        console.error('❌ SystemDateController.getBusinessDateStatus is not a function');
        return res.status(500).json({
          success: false,
          message: 'Business date status endpoint misconfigured',
          error: 'Controller method is not a function'
        });
      }
      
      // ✅ Call the controller method
      await SystemDateController.getBusinessDateStatus(req, res);
    } catch (error) {
      console.error('❌ Error in /status route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get business date status',
        error: error.message
      });
    }
  }
);

// =============================================
// CORE DATE ROUTES
// =============================================
router.get(
  '/current',
  authenticate,
  async (req, res, next) => {
    try {
      await SystemDateController.getCurrentBusinessDate(req, res);
    } catch (error) {
      console.error('❌ Error in /current route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get current business date',
        error: error.message
      });
    }
  }
);

router.post(
  '/set',
  authenticate,
  authorize(['ADMIN', 'SYSTEM_ADMIN', 'BRANCH_MANAGER', 'OPERATIONS_MANAGER']),
  async (req, res, next) => {
    try {
      await SystemDateController.setBusinessDate(req, res);
    } catch (error) {
      console.error('❌ Error in /set route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to set business date',
        error: error.message
      });
    }
  }
);

router.post(
  '/update',
  authenticate,
  authorize(['ADMIN', 'SYSTEM_ADMIN', 'OPERATIONS_MANAGER']),
  async (req, res, next) => {
    try {
      await SystemDateController.updateBusinessDate(req, res);
    } catch (error) {
      console.error('❌ Error in /update route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update business date',
        error: error.message
      });
    }
  }
);

router.post(
  '/validate',
  authenticate,
  async (req, res, next) => {
    try {
      await SystemDateController.validateBusinessDate(req, res);
    } catch (error) {
      console.error('❌ Error in /validate route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to validate business date',
        error: error.message
      });
    }
  }
);

// =============================================
// AUTO-CORRECTION ROUTE
// =============================================
router.post(
  '/ensure-recent',
  authenticate,
  authorize(['ADMIN', 'SYSTEM_ADMIN']),
  async (req, res) => {
    try {
      const corrected = await SystemDateController.ensureRecentBusinessDate();
      res.json({
        success: true,
        corrected,
        message: corrected 
          ? 'Business date was stale and has been corrected to the most recent business day'
          : 'Business date is within acceptable range (less than 7 days behind)'
      });
    } catch (error) {
      console.error('❌ Error in /ensure-recent route:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// =============================================
// SERVER TIME ROUTES
// =============================================
router.get(
  '/server-time',
  authenticate,
  async (req, res, next) => {
    try {
      await SystemDateController.getServerTime(req, res);
    } catch (error) {
      console.error('❌ Error in /server-time route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get server time',
        error: error.message
      });
    }
  }
);

router.post(
  '/set-offset',
  authenticate,
  authorize(['ADMIN', 'SYSTEM_ADMIN']),
  async (req, res, next) => {
    try {
      await SystemDateController.setServerTimeOffset(req, res);
    } catch (error) {
      console.error('❌ Error in /set-offset route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to set server time offset',
        error: error.message
      });
    }
  }
);

// =============================================
// HOLIDAY ROUTES
// =============================================
router.get(
  '/holiday-check',
  authenticate,
  async (req, res, next) => {
    try {
      await SystemDateController.checkHoliday(req, res);
    } catch (error) {
      console.error('❌ Error in /holiday-check route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to check holiday',
        error: error.message
      });
    }
  }
);

router.get(
  '/holidays/month/:year/:month',
  authenticate,
  async (req, res, next) => {
    try {
      await SystemDateController.getHolidaysForMonth(req, res);
    } catch (error) {
      console.error('❌ Error in /holidays/month route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get holidays for month',
        error: error.message
      });
    }
  }
);

router.get(
  '/holidays/upcoming',
  authenticate,
  async (req, res, next) => {
    try {
      await SystemDateController.getUpcomingHolidays(req, res);
    } catch (error) {
      console.error('❌ Error in /holidays/upcoming route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get upcoming holidays',
        error: error.message
      });
    }
  }
);

router.get(
  '/next-business-day',
  authenticate,
  async (req, res, next) => {
    try {
      await SystemDateController.getNextBusinessDay(req, res);
    } catch (error) {
      console.error('❌ Error in /next-business-day route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get next business day',
        error: error.message
      });
    }
  }
);

// =============================================
// EOD ROUTES
// =============================================
router.post(
  '/init',
  authenticate,
  authorize(['ADMIN', 'SYSTEM_ADMIN']),
  async (req, res, next) => {
    try {
      await SystemDateController.initializeSystemDate(req, res);
    } catch (error) {
      console.error('❌ Error in /init route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initialize system date',
        error: error.message
      });
    }
  }
);

router.put(
  '/eod-status',
  authenticate,
  authorize(['ADMIN', 'SYSTEM_ADMIN', 'OPERATIONS_MANAGER']),
  async (req, res, next) => {
    try {
      await SystemDateController.updateEODStatus(req, res);
    } catch (error) {
      console.error('❌ Error in /eod-status route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update EOD status',
        error: error.message
      });
    }
  }
);

router.get(
  '/eod-history',
  authenticate,
  async (req, res, next) => {
    try {
      await SystemDateController.getEODHistory(req, res);
    } catch (error) {
      console.error('❌ Error in /eod-history route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get EOD history',
        error: error.message
      });
    }
  }
);

router.post(
  '/eod',
  authenticate,
  authorize(['ADMIN', 'SYSTEM_ADMIN', 'OPERATIONS_MANAGER', 'BRANCH_MANAGER']),
  async (req, res, next) => {
    try {
      await SystemDateController.processEOD(req, res);
    } catch (error) {
      console.error('❌ Error in /eod route:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to process EOD',
        error: error.message
      });
    }
  }
);

// =============================================
// DEBUG ROUTE - Check if controller is loaded
// =============================================
router.get(
  '/debug/controller',
  authenticate,
  authorize(['ADMIN', 'SYSTEM_ADMIN']),
  (req, res) => {
    const methods = Object.keys(SystemDateController);
    res.json({
      success: true,
      data: {
        controllerMethods: methods,
        hasGetBusinessDateStatus: methods.includes('getBusinessDateStatus'),
        getBusinessDateStatusType: typeof SystemDateController.getBusinessDateStatus,
        allMethods: methods.map(m => ({
          name: m,
          type: typeof SystemDateController[m]
        }))
      }
    });
  }
);

export default router;