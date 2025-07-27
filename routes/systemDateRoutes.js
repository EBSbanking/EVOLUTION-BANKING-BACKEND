import express from 'express';
import { SystemDateController } from '../controllers/SystemDateController.js';

const router = express.Router();

router.get('/current', SystemDateController.getCurrentBusinessDate);
router.get('/holiday-check', SystemDateController.isHoliday);
router.post('/init', SystemDateController.initializeSystemDate);
router.put('/eod-status', SystemDateController.updateEODStatus);
router.get('/eod-history', SystemDateController.getEODHistory);

export default router;
