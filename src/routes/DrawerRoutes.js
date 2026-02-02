// routes/drawerRoutes.js - WORKING VERSION
import express from 'express';
const router = express.Router();

// Import ONLY functions that definitely exist in your DrawerController
import { 
  createDrawer,
  getAllDrawers,
  getDrawerById,
  openDrawer,
  closeDrawer,
  getDrawerBalance
} from '../controllers/DrawerController.js';

// For functions that might not exist, create placeholders
const updateDrawer = (req, res) => {
  res.status(501).json({
    success: false,
    message: 'updateDrawer not yet implemented',
    timestamp: new Date()
  });
};

const deleteDrawer = (req, res) => {
  res.status(501).json({
    success: false,
    message: 'deleteDrawer not yet implemented',
    timestamp: new Date()
  });
};

// Create placeholders for other functions you're trying to use
const getDrawerByUserId = (req, res) => {
  res.status(501).json({
    success: false,
    message: 'getDrawerByUserId not yet implemented',
    timestamp: new Date()
  });
};

const getDrawerCloseoutReport = (req, res) => {
  res.status(501).json({
    success: false,
    message: 'getDrawerCloseoutReport not yet implemented',
    timestamp: new Date()
  });
};

const getDrawerOpeningReport = (req, res) => {
  res.status(501).json({
    success: false,
    message: 'getDrawerOpeningReport not yet implemented',
    timestamp: new Date()
  });
};

// Middleware to handle database connection
router.use((req, res, next) => {
  console.log(`🎯 Drawer route: ${req.method} ${req.path}`);
  
  // Check for database connection
  const hasSequelize = !!req.sequelize || !!(req.db?.sequelize);
  
  if (!hasSequelize) {
    console.warn('⚠️ No sequelize instance found in request');
  } else {
    console.log('✅ Database connection available');
  }
  
  next();
});

// =============================================
// BASIC DRAWER ROUTES (using only functions that exist)
// =============================================

// 1. Create drawer
router.post('/', createDrawer);

// 2. Get all drawers
router.get('/', getAllDrawers);

// 3. Get drawer by ID (DRAWER_ID or DRAWER_NO)
router.get('/:id', getDrawerById);

// 4. Update drawer (placeholder)
router.put('/:id', updateDrawer);

// 5. Delete drawer (placeholder)
router.delete('/:id', deleteDrawer);

// 6. Open drawer
router.post('/:id/open', openDrawer);

// 7. Close drawer
router.post('/:id/close', closeDrawer);

// 8. Get drawer balance
router.get('/:id/balance', getDrawerBalance);

// =============================================
// ADDITIONAL ROUTES (with placeholders)
// =============================================

// Get drawers by user ID (placeholder)
router.get('/user/:userId', getDrawerByUserId);

// Get drawer closeout report (placeholder)
router.get('/report/:id', getDrawerCloseoutReport);

// Get drawer opening report (placeholder)
router.get('/:id/opening-report', getDrawerOpeningReport);

// =============================================
// TEST ENDPOINTS
// =============================================

// Health check
router.get('/test/health', (req, res) => {
  res.json({
    success: true,
    message: 'Drawer routes are working',
    timestamp: new Date(),
    availableEndpoints: [
      'POST / - Create drawer',
      'GET / - Get all drawers',
      'GET /:id - Get drawer by ID',
      'PUT /:id - Update drawer',
      'DELETE /:id - Delete drawer',
      'POST /:id/open - Open drawer',
      'POST /:id/close - Close drawer',
      'GET /:id/balance - Get drawer balance',
      'GET /user/:userId - Get drawers by user ID',
      'GET /:id/closeout-report - Get closeout report',
      'GET /:id/opening-report - Get opening report'
    ]
  });
});

// Check what controller functions are actually available
router.get('/test/controller-check', (req, res) => {
  const controllerFunctions = {
    createDrawer: typeof createDrawer,
    getAllDrawers: typeof getAllDrawers,
    getDrawerById: typeof getDrawerById,
    openDrawer: typeof openDrawer,
    closeDrawer: typeof closeDrawer,
    getDrawerBalance: typeof getDrawerBalance,
    updateDrawer: typeof updateDrawer,
    deleteDrawer: typeof deleteDrawer,
    getDrawerByUserId: typeof getDrawerByUserId,
    getDrawerCloseoutReport: typeof getDrawerCloseoutReport,
    getDrawerOpeningReport: typeof getDrawerOpeningReport
  };
  
  res.json({
    success: true,
    message: 'Controller function status',
    functions: controllerFunctions,
    note: 'Functions marked as "function" are real, "undefined" are placeholders',
    timestamp: new Date()
  });
});

// Database test endpoint
router.get('/test/database', async (req, res) => {
  try {
    // Get sequelize from request
    const sequelize = req.sequelize || (req.db && req.db.sequelize);
    
    if (!sequelize) {
      return res.json({
        success: false,
        message: 'No database connection found in request',
        recommendation: 'Make sure your server.js attaches sequelize to req.sequelize'
      });
    }
    
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection authenticated');
    
    // Check for Drawer model
    const hasDrawerModel = !!(sequelize.models && sequelize.models.Drawer);
    let drawerCount = null;
    
    if (hasDrawerModel) {
      try {
        drawerCount = await sequelize.models.Drawer.count();
      } catch (error) {
        console.log('Note: Could not count drawers:', error.message);
      }
    }
    
    res.json({
      success: true,
      message: 'Database connection successful',
      database: {
        connected: true,
        dialect: sequelize.getDialect(),
        modelsLoaded: Object.keys(sequelize.models || {}),
        drawerModelExists: hasDrawerModel,
        drawerCount
      }
    });
  } catch (error) {
    console.error('Database test failed:', error);
    res.status(500).json({
      success: false,
      message: 'Database test failed',
      error: error.message
    });
  }
});

// Simple echo endpoint for testing
router.get('/echo/:message', (req, res) => {
  res.json({
    success: true,
    message: `Echo: ${req.params.message}`,
    timestamp: new Date(),
    path: req.path,
    method: req.method
  });
});

export default router;