// routes/operationalRoutes.js
import express from 'express';
import { OperationalController } from '../controllers/OperationalController.js';
import { authenticate, hasRole } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Apply authentication to all operational routes
router.use(authenticate);

// System Date Routes
router.post('/system-date/initialize',
  hasRole('SYSTEM_ADMIN'), // Only SYSTEM_ADMIN (role 1) has this permission
  async (req, res) => {
    try {
      const { date } = req.body;
      const systemDate = await OperationalController.initializeSystemDate(
        new Date(date),
        req.user.id
      );
      res.json({ success: true, data: systemDate });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
);

router.post('/eod/process',
  hasRole('OPERATIONS_MANAGER', 'SYSTEM_ADMIN', 'EOD_OPERATOR'), // Added EOD_OPERATOR
  async (req, res) => {
    try {
      const result = await OperationalController.processEndOfDay(req.user.id);
      res.json({ success: true, data: result });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

router.get('/system-date/current',
  hasRole('STAFF', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN', 'EOD_OPERATOR'), // Added EOD_OPERATOR
  async (req, res) => {
    try {
      const currentDate = await OperationalController.getCurrentBusinessDate();
      res.json({ success: true, data: currentDate });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
);

// Holiday Management Routes
router.post('/holidays',
  hasRole('OPERATIONS_MANAGER', 'SYSTEM_ADMIN'), // EOD_OPERATOR doesn't have holiday management permissions
  async (req, res) => {
    try {
      const { date, description, country, recurring } = req.body;
      const holiday = await OperationalController.addHoliday(
        new Date(date),
        description,
        country,
        recurring,
        req.user.id
      );
      res.status(201).json({ success: true, data: holiday });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
);

router.get('/holidays/check',
  hasRole('STAFF', 'OPERATIONS_MANAGER', 'SYSTEM_ADMIN', 'EOD_OPERATOR'), // Added EOD_OPERATOR
  async (req, res) => {
    try {
      const { date } = req.query;
      const isHoliday = await OperationalController.isHoliday(new Date(date));
      res.json({ success: true, isHoliday });
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
);

export default router;