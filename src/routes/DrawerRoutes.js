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

  // Drawer Transaction Management
  processDrawerTransaction,
  getDrawerTransactionSummary,
  getDrawerTransactionHistory,
  
  // Drawer Reports
  getDrawerCloseoutReport,
  getDrawerOpeningReport,
  getMyOpenDrawers,
  
  // Administrative Functions
  forceCloseAllDrawers,
 
  // Currency Management
  updateDrawerCurrency,

  // NEW: Drawer Enquiry Functions
  getDrawerEnquiry,
  getMultipleDrawersEnquiry,

  // NEW: Transfer Functions
  processDrawerToDrawerTransfer,
  processDrawerToVaultTransfer,

  // NEW: Summary Functions
  getDrawersSummary,

  // NEW: Transaction Posting Functions
  postDrawerTransaction,
  postBulkDrawerTransactions,
  getDrawerTransactionById,
  reverseDrawerTransaction
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
router.get('/:id/debug', debugDrawerState);

// =============================================
// DRAWER SESSION MANAGEMENT
// =============================================
router.post('/:id/open', openDrawer);
router.post('/:id/close', closeDrawer);
router.get('/:id/balance', getDrawerBalance);

// =============================================
// DRAWER TRANSACTION OPERATIONS
// =============================================
// Single transaction posting
router.post('/transactions/post', postDrawerTransaction);

// Bulk transaction posting
router.post('/transactions/post-bulk', postBulkDrawerTransactions);

// Get specific transaction
router.get('/transactions/:transactionId', getDrawerTransactionById);

// Reverse a transaction
router.post('/transactions/:transactionId/reverse', reverseDrawerTransaction);

// Transaction history and summary
router.get('/:id/transactions', getDrawerTransactionHistory);
router.get('/:id/transactions/summary', getDrawerTransactionSummary);

// Process individual drawer transaction (existing)
router.post('/:id/transactions/process', processDrawerTransaction);

// =============================================
// DRAWER TRANSFER OPERATIONS
// =============================================
router.post('/transfer/drawer-to-drawer', processDrawerToDrawerTransfer);
router.post('/transfer/drawer-to-vault', processDrawerToVaultTransfer);

// =============================================
// DRAWER ENQUIRY OPERATIONS
// =============================================
router.get('/enquiry/:id', getDrawerEnquiry);
router.post('/enquiry/multiple', getMultipleDrawersEnquiry);

// =============================================
// DRAWER REPORTS & ANALYTICS
// =============================================
router.get('/:id/closeout-report', getDrawerCloseoutReport);
router.get('/:id/opening-report', getDrawerOpeningReport);
router.get('/user/:userId/open', getMyOpenDrawers);
router.get('/summary/all', getDrawersSummary);

// =============================================
// DRAWER CURRENCY MANAGEMENT
// =============================================
router.put('/:id/currency', updateDrawerCurrency);

// =============================================
// ADMINISTRATIVE FUNCTIONS
// =============================================
router.post('/force-close-all', forceCloseAllDrawers);

export default router;