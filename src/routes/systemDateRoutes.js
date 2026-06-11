// routes/systemDateRoutes.js
import express from 'express';
import { SystemDateController } from '../controllers/SystemDateController.js';

const router = express.Router();

// =============================================
// SYSTEM DATE MANAGEMENT ROUTES
// =============================================

// Core date routes
router.get('/current', SystemDateController.getCurrentBusinessDate);
router.post('/set', SystemDateController.setBusinessDate);
router.post('/update', SystemDateController.updateBusinessDate);
router.post('/validate', SystemDateController.validateBusinessDate);

// Auto-correction route (new)
router.post('/ensure-recent', async (req, res) => {
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
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Server time routes
router.get('/server-time', SystemDateController.getServerTime);
router.post('/set-offset', SystemDateController.setServerTimeOffset);

// Holiday routes
router.get('/holiday-check', SystemDateController.checkHoliday);
router.get('/holidays/month/:year/:month', SystemDateController.getHolidaysForMonth);
router.get('/holidays/upcoming', SystemDateController.getUpcomingHolidays);
router.get('/next-business-day', SystemDateController.getNextBusinessDay);

// EOD routes
router.post('/init', SystemDateController.initializeSystemDate);
router.put('/eod-status', SystemDateController.updateEODStatus);
router.get('/eod-history', SystemDateController.getEODHistory);
router.post('/eod', SystemDateController.processEOD);

export default router;