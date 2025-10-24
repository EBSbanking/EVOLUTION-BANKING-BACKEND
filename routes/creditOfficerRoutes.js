import express from 'express';
import CreditOfficerController from '../controllers/CreditOfficerController.js';

const router = express.Router();

// Get recent activities with pagination and filtering
router.get('/recent-activities', CreditOfficerController.getRecentActivities);

// Get today's statistics
router.get('/today-stats', CreditOfficerController.getTodayStats);

// Get statistics for a specific date range
router.get('/stats', async (req, res) => {
  // You can extend this later for date range stats
  res.status(200).json({
    success: true,
    message: 'Stats endpoint - extend this for date range functionality'
  });
});

// Get user configuration
router.get('/config', CreditOfficerController.getConfig);

// Health check for credit officer routes
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Credit officer routes are working',
    timestamp: new Date().toISOString()
  });
});

export default router;