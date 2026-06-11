// routes/holidayRoutes.js
import express from 'express';
import {
  createHoliday,
  getAllHolidays,
  getHolidayById,
  updateHolidayByDate,
  deleteHoliday,
  isDateHoliday,
  getSkipRepaymentConfig,
  updateSkipRepaymentConfig
} from '../controllers/holidayController.js';

const router = express.Router();

// ========== SPECIFIC ROUTES FIRST (no parameters) ==========
router.post('/create', createHoliday);
router.get('/all', getAllHolidays);
router.get('/check', isDateHoliday);
router.get('/is-holiday', isDateHoliday);
router.get('/skip-repayment-config', getSkipRepaymentConfig);
router.put('/skip-repayment-config', updateSkipRepaymentConfig);

// ========== DYNAMIC ROUTES LAST (catch-all for IDs) ==========
router.get('/:id', getHolidayById);
router.put('/:id', updateHolidayByDate);
router.delete('/:id', deleteHoliday);

export default router;