// routes/holidayRoutes.js
import express from 'express';
import {
  createHoliday,
  getAllHolidays,
  getHolidayById,
  updateHolidayByDate,
  deleteHoliday,
  isDateHoliday
} from '../controllers/holidayController.js';

const router = express.Router();

// ✅ Specific routes first
router.post('/create', createHoliday);
router.get('/all', getAllHolidays);

// check holiday by query param ?date=YYYY-MM-DD
router.get('/check', isDateHoliday);

// alternative endpoint for checking holidays
router.get('/is-holiday', isDateHoliday);

// ✅ Dynamic routes last
router.get('/:id', getHolidayById);
router.put('/:id', updateHolidayByDate);
router.delete('/:id', deleteHoliday);

export default router;
