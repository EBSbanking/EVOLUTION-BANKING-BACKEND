// routes/holidayRoutes.js
import express from 'express';
import {
  createHoliday,
  getAllHolidays,
  getHolidayById,
  updateHoliday,
  deleteHoliday,
  isDateHoliday
} from '../controllers/holidayController.js';

const router = express.Router();

router.post('/create', createHoliday);
router.get('/all', getAllHolidays);
router.get('/check', isDateHoliday); // /api/holidays/check?date=2025-12-25
router.get('/:id', getHolidayById);
router.put('/:id', updateHoliday);
router.delete('/:id', deleteHoliday);

export default router;
