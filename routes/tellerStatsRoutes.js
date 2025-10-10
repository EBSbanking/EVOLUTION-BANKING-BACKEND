// routes/tellerStatsRoutes.js
import express from 'express';
import DepositTransaction from '../models/DepositTransaction.js';
import Customer from '../models/Customer.js';
import verifyToken from '../middlewares/verifyToken.js';

const router = express.Router();

// Debug: Log when this file is loaded
console.log('✅ TellerStatsRoutes.js loaded successfully');

// Public test route to verify the route is mounted
router.get('/test-public', (req, res) => {
  console.log('🔧 Public test route accessed');
  res.json({ 
    success: true, 
    message: 'Teller stats routes are mounted correctly!',
    path: '/api/tellstat/teller/today-stats',
    timestamp: new Date().toISOString()
  });
});

// Main teller stats endpoint
router.get('/teller/today-stats',  async (req, res) => {
  try {
    console.log('📊 Teller stats endpoint hit for user:', {
      userId: req.user?._id,
      username: req.user?.username,
      BU_ID: req.user?.BU_ID,
      permissions: req.user?.permissions
    });

    // Check for VIEW_TELLER_DASHBOARD permission
    if (!req.user.permissions?.includes('VIEW_TELLER_DASHBOARD')) {
      console.warn('❌ Permission denied for user:', req.user.username);
      return res.status(403).json({ 
        success: false, 
        error: 'Access denied: VIEW_TELLER_DASHBOARD permission required' 
      });
    }

    // Validate BU_ID
    const businessUnitId = req.user.BU_ID;
    if (!businessUnitId) {
      console.error('❌ Missing BU_ID for user:', req.user.username);
      return res.status(400).json({ 
        success: false, 
        error: 'Business Unit ID not found for user' 
      });
    }

    // Set date range for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    console.log('📅 Date range for stats:', { today, tomorrow });

    // For now, return demo data to test the route
    // Later you can replace this with actual database queries
    const demoStats = {
      transactions: Math.floor(Math.random() * 20) + 5,
      deposits: Math.floor(Math.random() * 10000) + 1000,
      withdrawals: Math.floor(Math.random() * 8000) + 500,
      customers: Math.floor(Math.random() * 15) + 3
    };

    console.log('📈 Returning demo stats:', demoStats);

    // Return statistics
    res.status(200).json({
      success: true,
      data: demoStats,
      message: 'Teller statistics retrieved successfully',
      debug: {
        user: req.user.username,
        businessUnit: businessUnitId,
        dateRange: { today, tomorrow }
      }
    });

  } catch (error) {
    console.error('💥 Error in teller stats endpoint:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
      businessUnitId: req.user?.BU_ID,
    });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch statistics',
      message: error.message 
    });
  }
});

// Test route with authentication
router.get('/test-auth', verifyToken, (req, res) => {
  res.json({ 
    success: true, 
    message: 'Authenticated test route is working',
    user: {
      id: req.user._id,
      username: req.user.username,
      BU_ID: req.user.BU_ID,
      permissions: req.user.permissions
    }
  });
});

export default router;