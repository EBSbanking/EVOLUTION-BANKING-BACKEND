// routes/DrawerRoutes.js - COMPLETE UPDATED VERSION
import express from 'express';
import {
  createDrawer,
  openDrawer,
  closeDrawer,
  getAllDrawers,
  getDrawerById,
  getDrawerBalance,
  getDrawerCloseoutReport,
  getDrawerOpeningReport,
  getDrawerTransactionHistory,
  getDrawerTransactionSummary,
  getDrawerEnquiry,
  getMultipleDrawersEnquiry,
  getDrawerSummary,
  getDrawerTellerSummary,
  updateDrawerCurrency,
  updateDrawer,
  deleteDrawer,
  processDrawerTransaction,
  postDrawerTransaction,
  postBulkDrawerTransactions,
  getDrawerTransactionById,
  reverseDrawerTransaction,
  processDrawerToDrawerTransfer,
  processDrawerToVaultTransfer,
  forceCloseAllDrawers,
  getMyOpenDrawers,
  getDrawersByUserId,
  getOpenDrawersByUserId,
  getUserDrawerSummary,
  getDrawerTransactions,
  getDrawerByUser
} from '../controllers/DrawerController.js';

const router = express.Router();

// =============================================
// HEALTH & TEST ROUTES
// =============================================

router.get('/test/health', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Drawer routes are working',
    timestamp: new Date().toISOString()
  });
});

// =============================================
// USER-SPECIFIC ROUTES (MUST COME FIRST)
// =============================================

// 1. Get all drawers for a specific user (teller)
// GET /api/drawer/user/:userId
router.get('/user/:userId', getDrawersByUserId);

// 2. Get drawer for a specific user (single drawer)
// GET /api/drawer/user/:userId/drawer
router.get('/user/:userId/drawer', getDrawerByUser);

// 3. Get only open drawers for a specific user (for transaction posting)
// GET /api/drawer/user/:userId/open
router.get('/user/:userId/open', getOpenDrawersByUserId);

// 4. Get drawer summary for a specific user (dashboard)
// GET /api/drawer/user/:userId/summary
router.get('/user/:userId/summary', getUserDrawerSummary);

// 5. Get user's open drawers (alias for backward compatibility)
// GET /api/drawer/my-open/:userId
router.get('/my-open/:userId', getMyOpenDrawers);

// =============================================
// TELLER & DASHBOARD SUMMARY ROUTES
// =============================================

// 6. Teller summary (open drawers + balance)
// GET /api/drawer/teller-summary?userId=xxx
router.get('/teller-summary', getDrawerTellerSummary);

// 7. Dashboard summary (alias)
// GET /api/drawer/dashboard-summary?userId=xxx
router.get('/dashboard-summary', async (req, res) => {
  try {
    const userId = req.query.userId;
    const Drawer = (await import('../models/Drawer.js')).default;
    
    const where = { WF_STATUS: 'OPEN' };
    if (userId) where.USER_ID = userId;

    const drawers = await Drawer.findAll({ where });
    const totalBalance = drawers.reduce((sum, d) => sum + parseFloat(d.CURRENT_BALANCE || 0), 0);

    res.json({
      success: true,
      data: {
        totalBalance,
        openDrawers: drawers.length,
        summary: { 
          balance: totalBalance, 
          count: drawers.length 
        }
      }
    });
  } catch (error) {
    console.error('Error in drawer dashboard-summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch drawer dashboard summary',
      error: error.message
    });
  }
});

// 8. Get all drawers summary (admin)
// GET /api/drawer/summary
router.get('/summary', getDrawerSummary);

// =============================================
// DRAWER TRANSACTION ROUTES
// =============================================

// 9. Post a transaction to a drawer
// POST /api/drawer/transaction
router.post('/transaction', postDrawerTransaction);

// 10. Post bulk transactions
// POST /api/drawer/transactions/bulk
router.post('/transactions/bulk', postBulkDrawerTransactions);

// 11. Get transaction by ID
// GET /api/drawer/transactions/:transactionId
router.get('/transactions/:transactionId', getDrawerTransactionById);

// 12. Reverse a transaction
// POST /api/drawer/transactions/:transactionId/reverse
router.post('/transactions/:transactionId/reverse', reverseDrawerTransaction);

// 13. Get drawer transaction history
// GET /api/drawer/:id/transactions
router.get('/:id/transactions', getDrawerTransactionHistory);

// 14. Get drawer transaction summary
// GET /api/drawer/:id/transactions/summary
router.get('/:id/transactions/summary', getDrawerTransactionSummary);

// 15. Get drawer transactions with pagination
// GET /api/drawer/:id/transactions/paginated
router.get('/:id/transactions/paginated', getDrawerTransactions);

// =============================================
// DRAWER TRANSFER ROUTES
// =============================================

// 16. Drawer to drawer transfer
// POST /api/drawer/transfer/drawer-to-drawer
router.post('/transfer/drawer-to-drawer', processDrawerToDrawerTransfer);

// 17. Drawer to vault transfer
// POST /api/drawer/transfer/drawer-to-vault
router.post('/transfer/drawer-to-vault', processDrawerToVaultTransfer);

// =============================================
// DRAWER BALANCE & STATUS ROUTES
// =============================================

// 18. Get drawer balance by ID
// GET /api/drawer/:id/balance
router.get('/:id/balance', getDrawerBalance);

// 19. Get opening report
// GET /api/drawer/:id/opening-report
router.get('/:id/opening-report', getDrawerOpeningReport);

// 20. Get closeout report
// GET /api/drawer/:id/closeout-report
router.get('/:id/closeout-report', getDrawerCloseoutReport);

// 21. Get drawer enquiry (detailed)
// GET /api/drawer/:id/enquiry
router.get('/:id/enquiry', getDrawerEnquiry);

// =============================================
// DRAWER OPERATIONS (OPEN/CLOSE)
// =============================================

// 22. Create a new drawer
// POST /api/drawer
router.post('/', createDrawer);

// 23. Open a drawer
// POST /api/drawer/:id/open
router.post('/:id/open', openDrawer);

// 24. Close a drawer
// POST /api/drawer/:id/close
router.post('/:id/close', closeDrawer);

// 25. Force close all drawers (admin)
// POST /api/drawer/admin/force-close-all
router.post('/admin/force-close-all', forceCloseAllDrawers);

// 26. Update drawer currency (mid-day adjustment)
// PUT /api/drawer/:id/currency
router.put('/:id/currency', updateDrawerCurrency);

// =============================================
// DRAWER CRUD OPERATIONS
// =============================================

// 27. Get all drawers (with filters)
// GET /api/drawer
router.get('/', getAllDrawers);

// 28. Get drawer by ID (MUST BE LAST - catches all /:id routes)
// GET /api/drawer/:id
router.get('/:id', getDrawerById);

// 29. Update drawer
// PUT /api/drawer/:id
router.put('/:id', updateDrawer);

// 30. Delete drawer
// DELETE /api/drawer/:id
router.delete('/:id', deleteDrawer);

// =============================================
// MULTIPLE DRAWERS ENQUIRY
// =============================================

// 31. Get multiple drawers enquiry
// POST /api/drawer/enquiry/multiple
router.post('/enquiry/multiple', getMultipleDrawersEnquiry);

// 32. Process drawer transaction (internal)
// POST /api/drawer/process-transaction
router.post('/process-transaction', processDrawerTransaction);

export default router;