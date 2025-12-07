import express from 'express';
import { SystemDateController } from '../controllers/SystemDateController.js';

const router = express.Router();

// =============================================
// SYSTEM DATE MANAGEMENT ROUTES
// =============================================

// Keep existing routes
router.get('/current', SystemDateController.getCurrentBusinessDate);
router.get('/holiday-check', SystemDateController.isHoliday);
router.post('/init', SystemDateController.initializeSystemDate);
router.put('/eod-status', SystemDateController.updateEODStatus);
router.get('/eod-history', SystemDateController.getEODHistory);

// Add new routes
router.post('/set', SystemDateController.setBusinessDate);
router.post('/update', SystemDateController.updateBusinessDate);
router.post('/eod', SystemDateController.processEOD);
router.post('/validate', SystemDateController.validateBusinessDate);

export default router;