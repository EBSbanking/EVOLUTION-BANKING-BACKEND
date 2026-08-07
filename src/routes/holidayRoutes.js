// src/routes/holidayRoutes.js
import express from 'express';
import HolidayController from '../controllers/HolidayController.js';
import { protectAdmin, isAdminConsole } from '../middlewares/adminAuthMiddleware.js';

const router = express.Router();

// =============================================
// MIDDLEWARE - All routes require admin authentication
// =============================================
router.use(protectAdmin);
router.use(isAdminConsole);

// =============================================
// SPECIFIC ROUTES (no parameters) - MUST COME FIRST
// =============================================

// Health/status checks
router.get('/check', HolidayController.checkHoliday);
router.get('/is-holiday', HolidayController.checkHoliday);  // Alias for backward compatibility
router.get('/check-business-day', HolidayController.checkBusinessDay);
router.get('/next-business-day', HolidayController.getNextBusinessDay);

// Holiday queries
router.get('/all', HolidayController.getAllHolidays);  // Alias for backward compatibility
router.get('/upcoming', HolidayController.getUpcomingHolidays);
router.get('/range', HolidayController.getHolidaysInRange);
router.get('/month/:year/:month', HolidayController.getHolidaysForMonth);

// Configuration endpoints
router.get('/config/skip-repayment', HolidayController.getSkipRepaymentConfig);
router.put('/config/skip-repayment', HolidayController.updateSkipRepaymentConfig);

// Admin utilities
router.post('/initialize', HolidayController.initializeTable);
router.post('/bulk', HolidayController.bulkCreateHolidays);

// =============================================
// DYNAMIC ROUTES (with parameters) - MUST COME LAST
// =============================================

// GET /holidays - Main endpoint with pagination and filtering
router.get('/', HolidayController.getAllHolidays);

// POST /holidays - Create a new holiday
router.post('/', HolidayController.createHoliday);

// GET /holidays/:id - Get a single holiday
router.get('/:id', HolidayController.getHolidayById);

// PUT /holidays/:id - Update a holiday
router.put('/:id', HolidayController.updateHoliday);

// PATCH /holidays/:id/toggle - Toggle holiday status
router.patch('/:id/toggle', HolidayController.toggleHolidayStatus);

// DELETE /holidays/:id - Delete a holiday
router.delete('/:id', HolidayController.deleteHoliday);

// =============================================
// EXPORT
// =============================================
export default router;