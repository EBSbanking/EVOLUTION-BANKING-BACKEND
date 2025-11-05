// routes/drawerRoutes.js
import express from 'express';
import {
  // Drawer CRUD Operations
  createDrawer,
  getAllDrawers,
  getDrawerById,
  updateDrawer,
  deleteDrawer,
  debugDrawerState,
  
  // Drawer Session Management
  openDrawer,
  closeDrawer,
  getDrawerBalance,

  //Drawer Transaction History
  getDrawerTransactionSummary,
  getDrawerTransactionHistory,
  

  
  // Drawer Reports
  getDrawerCloseoutReport,
  getDrawerOpeningReport,
  getMyOpenDrawers,
  
  // Administrative Functions
  forceCloseAllDrawers,
 
  updateDrawerCurrency
} from '../controllers/DrawerController.js';


const router = express.Router();

// =============================================
// DRAWER CRUD OPERATIONS
// =============================================
router.post('/', createDrawer);
router.get('/', getAllDrawers);
router.get('/:id', getDrawerById);
router.put('/:id', updateDrawer);
router.delete('/:id', deleteDrawer);


router.get('/:id', debugDrawerState);

// =============================================
// DRAWER SESSION MANAGEMENT
// =============================================
router.post('/:id/open', openDrawer);
router.post('/:id/close', closeDrawer);
router.get('/:id/balance', getDrawerBalance);


// =============================================
// DRAWER REPORTS & ANALYTICS
// =============================================
router.get('/:id/closeout-report', getDrawerCloseoutReport);
router.get('/:id/opening-report', getDrawerOpeningReport);
router.get('/user/:userId/open', getMyOpenDrawers);

// =============================================
// DRAWER CURRENCY MANAGEMENT
// =============================================
router.put('/:id/currency', updateDrawerCurrency);


//=============================================
// DRAWER TRANSACTION HISTORY ROUTE
//=============================================
router.get('/:id/transactions', getDrawerTransactionHistory);
router.get('/:id/transactions/summary', getDrawerTransactionSummary);


// =============================================
// ADMINISTRATIVE FUNCTIONS
// =============================================
router.post('/force-close-all', forceCloseAllDrawers);

export default router;