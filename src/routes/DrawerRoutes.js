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
  getDrawersSummary,
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
  getUserDrawerSummary
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

// 2. Get only open drawers for a specific user (for transaction posting)
// GET /api/drawer/user/:userId/open
router.get('/user/:userId/open', getOpenDrawersByUserId);

// 3. Get drawer summary for a specific user (dashboard)
// GET /api/drawer/user/:userId/summary
router.get('/user/:userId/summary', getUserDrawerSummary);

// 4. Get user's open drawers (alias for backward compatibility)
// GET /api/drawer/my-open/:userId
router.get('/my-open/:userId', getMyOpenDrawers);

// =============================================
// TELLER & DASHBOARD SUMMARY ROUTES
// =============================================

// 5. Teller summary (open drawers + balance)
// GET /api/drawer/teller-summary?userId=xxx
router.get('/teller-summary', getDrawerTellerSummary);

// 6. Dashboard summary (alias)
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

// 7. Get all drawers summary (admin)
// GET /api/drawer/summary
router.get('/summary', getDrawersSummary);

// =============================================
// DRAWER TRANSACTION ROUTES
// =============================================

// 8. Post a transaction to a drawer
// POST /api/drawer/transaction
router.post('/transaction', postDrawerTransaction);

// 9. Post bulk transactions
// POST /api/drawer/transactions/bulk
router.post('/transactions/bulk', postBulkDrawerTransactions);

// 10. Get transaction by ID
// GET /api/drawer/transactions/:transactionId
router.get('/transactions/:transactionId', getDrawerTransactionById);

// 11. Reverse a transaction
// POST /api/drawer/transactions/:transactionId/reverse
router.post('/transactions/:transactionId/reverse', reverseDrawerTransaction);

// 12. Get drawer transaction history
// GET /api/drawer/:id/transactions
router.get('/:id/transactions', getDrawerTransactionHistory);

// 13. Get drawer transaction summary
// GET /api/drawer/:id/transactions/summary
router.get('/:id/transactions/summary', getDrawerTransactionSummary);

// =============================================
// DRAWER TRANSFER ROUTES
// =============================================

// 14. Drawer to drawer transfer
// POST /api/drawer/transfer/drawer-to-drawer
router.post('/transfer/drawer-to-drawer', processDrawerToDrawerTransfer);

// 15. Drawer to vault transfer
// POST /api/drawer/transfer/drawer-to-vault
router.post('/transfer/drawer-to-vault', processDrawerToVaultTransfer);

// =============================================
// DRAWER BALANCE & STATUS ROUTES
// =============================================

// 16. Get drawer balance by ID
// GET /api/drawer/:id/balance
router.get('/:id/balance', getDrawerBalance);

// 17. Get opening report
// GET /api/drawer/:id/opening-report
router.get('/:id/opening-report', getDrawerOpeningReport);

// 18. Get closeout report
// GET /api/drawer/:id/closeout-report
router.get('/:id/closeout-report', getDrawerCloseoutReport);

// 19. Get drawer enquiry (detailed)
// GET /api/drawer/:id/enquiry
router.get('/:id/enquiry', getDrawerEnquiry);

// =============================================
// DRAWER OPERATIONS (OPEN/CLOSE)
// =============================================

// 20. Create a new drawer
// POST /api/drawer
router.post('/', createDrawer);

// 21. Open a drawer
// POST /api/drawer/:id/open
router.post('/:id/open', openDrawer);

// 22. Close a drawer
// POST /api/drawer/:id/close
router.post('/:id/close', closeDrawer);

// 23. Force close all drawers (admin)
// POST /api/drawer/admin/force-close-all
router.post('/admin/force-close-all', forceCloseAllDrawers);

// 24. Update drawer currency (mid-day adjustment)
// PUT /api/drawer/:id/currency
router.put('/:id/currency', updateDrawerCurrency);

// =============================================
// DRAWER CRUD OPERATIONS
// =============================================

// 25. Get all drawers (with filters)
// GET /api/drawer
router.get('/', getAllDrawers);

// 26. Get drawer by ID (MUST BE LAST)
// GET /api/drawer/:id
router.get('/:id', getDrawerById);

// 27. Update drawer
// PUT /api/drawer/:id
router.put('/:id', updateDrawer);

// 28. Delete drawer
// DELETE /api/drawer/:id
router.delete('/:id', deleteDrawer);

// =============================================
// MULTIPLE DRAWERS ENQUIRY
// =============================================

// 29. Get multiple drawers enquiry
// POST /api/drawer/enquiry/multiple
router.post('/enquiry/multiple', getMultipleDrawersEnquiry);

// 30. Process drawer transaction (internal)
// POST /api/drawer/process-transaction
router.post('/process-transaction', processDrawerTransaction);

export default router;