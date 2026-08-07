// src/routes/TransactionRoutes.js
import express from 'express';
import transactionController from '../Services/postTransaction.js';

const router = express.Router();

console.log('🔧 Transaction routes loading...');

// Helper to load decryptPayload dynamically
const loadDecryptPayload = async () => {
  try {
    const module = await import('../middleware/decryptPayload.js');
    return module.default;
  } catch (error) {
    console.log('⚠️ DecryptPayload not available:', error.message);
    return null;
  }
};

// Dynamic middleware wrapper
const withDecryption = async (req, res, next) => {
  const decryptPayload = await loadDecryptPayload();
  if (decryptPayload && typeof decryptPayload === 'function') {
    return decryptPayload(req, res, next);
  }
  req.decrypted = false;
  next();
};

// ================================================================
// MAIN TRANSACTION ENDPOINT
// ================================================================

// Main transaction endpoint - POST /api/transactions
router.post('/transactions', withDecryption, async (req, res) => {
  console.log('📥 Transaction request received');
  console.log('🔐 Decrypted:', req.decrypted);
  
  try {
    return await transactionController.postTransaction(req, res);
  } catch (error) {
    console.error('❌ Transaction error:', error);
    return res.status(500).json({
      success: false,
      message: 'Transaction failed',
      error: error.message
    });
  }
});

// ================================================================
// ✅ TRANSACTION APPROVAL ENDPOINTS (NEW)
// ================================================================

// Approve a pending transaction - PUT /api/transactions/approve
router.put('/transactions/approve', async (req, res) => {
  console.log('✅ Approve transaction request received');
  try {
    return await transactionController.approveTransaction(req, res);
  } catch (error) {
    console.error('❌ Approve transaction error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve transaction',
      error: error.message
    });
  }
});

// Reject a pending transaction - PUT /api/transactions/reject
router.put('/transactions/reject', async (req, res) => {
  console.log('❌ Reject transaction request received');
  try {
    return await transactionController.rejectTransaction(req, res);
  } catch (error) {
    console.error('❌ Reject transaction error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reject transaction',
      error: error.message
    });
  }
});

// Get pending transactions - GET /api/transactions/pending
router.get('/transactions/pending', async (req, res) => {
  console.log('📋 Fetching pending transactions');
  try {
    return await transactionController.getPendingTransactions(req, res);
  } catch (error) {
    console.error('❌ Error fetching pending transactions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pending transactions',
      error: error.message
    });
  }
});

// ================================================================
// TELLER TRANSACTIONS
// ================================================================

// Get daily transactions for a specific teller
router.get(
  '/transactions/teller/daily/:userId',
  transactionController.getTellerDailyTransactions
);

// Alternative with query parameter
router.get(
  '/transactions/teller/daily',
  transactionController.getTellerDailyTransactions
);

// Get teller transaction summary (for dashboard)
router.get(
  '/transactions/teller/summary',
  transactionController.getTellerTransactionSummary
);

// ================================================================
// ACCOUNT ENDPOINTS
// ================================================================

// Get account balance
router.get('/transactions/account/:accountNo/balance', transactionController.getAccountBalance);

// Get transactions by account
router.get('/transactions/account/:accountNo', transactionController.getTransactionsByAccount);

// Get customer accounts
router.get('/transactions/customer/:customerId/accounts', transactionController.getCustomerAccounts);

// ================================================================
// TRANSACTION HISTORY & FILTERS
// ================================================================

// Get transaction history with filters
router.get('/transactions/history', transactionController.getTransactionHistory);

// Get transactions by customer ID
router.get('/transactions/customer/id/:customerId', transactionController.getTransactionsByCustomer);

// Get transactions by customer name
router.get('/transactions/customer/name/:customerName', transactionController.getTransactionsByCustomerName);

// ================================================================
// EXPORT ENDPOINTS
// ================================================================

// Export transactions
router.get('/transactions/export', transactionController.exportTransactions);

// Export transactions by customer ID
router.get('/transactions/export/customer/id/:customerId', async (req, res) => {
  try {
    // Add customer ID filter to export
    req.query.customerId = req.params.customerId;
    return await transactionController.exportTransactions(req, res);
  } catch (error) {
    console.error('❌ Export error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export transactions',
      error: error.message
    });
  }
});

// Export transactions by customer name
router.get('/transactions/export/customer/name/:customerName', async (req, res) => {
  try {
    // Add customer name filter to export
    req.query.customerName = req.params.customerName;
    return await transactionController.exportTransactions(req, res);
  } catch (error) {
    console.error('❌ Export error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export transactions',
      error: error.message
    });
  }
});

// Export batch transactions
router.post('/transactions/export/batch', async (req, res) => {
  try {
    // Handle batch export with body parameters
    const { startDate, endDate, accountNumbers, format = 'csv' } = req.body;
    
    if (!accountNumbers || !Array.isArray(accountNumbers) || accountNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Account numbers are required for batch export'
      });
    }
    
    // Call the export method with multiple accounts
    // This would need to be implemented in the controller
    return await transactionController.exportBatchTransactions(req, res);
  } catch (error) {
    console.error('❌ Batch export error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to export batch transactions',
      error: error.message
    });
  }
});

// ================================================================
// DEBUG ENDPOINTS
// ================================================================

// Debug accounts
router.get('/transactions/debug/accounts', async (req, res) => {
  console.log('🔍 Debug accounts endpoint called');
  try {
    // This would need to be implemented in the controller
    // For now, return a simple response
    return res.json({
      success: true,
      message: 'Debug accounts endpoint',
      data: {
        timestamp: new Date().toISOString(),
        note: 'This is a debug endpoint'
      }
    });
  } catch (error) {
    console.error('❌ Debug error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to debug accounts',
      error: error.message
    });
  }
});

// ================================================================
// TELLER SUMMARY ENDPOINT (Legacy/Alternative)
// ================================================================

// GET /api/transaction/teller-summary
router.get('/teller-summary', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Import models
    const sequelize = (await import('../../config/db.js')).default;
    const { Op } = await import('sequelize');

    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get transaction summary for today
    const [transactions] = await sequelize.query(
      `
      SELECT 
        COUNT(*) as totalTransactions,
        SUM(amount) as totalAmount,
        SUM(CASE WHEN transaction_type IN ('DEPOSIT', 'CR', 'C') THEN amount ELSE 0 END) as totalDeposits,
        SUM(CASE WHEN transaction_type IN ('WITHDRAWAL', 'DR', 'D') THEN amount ELSE 0 END) as totalWithdrawals,
        SUM(emtl_amount) as totalEMTL,
        COUNT(CASE WHEN status = 'PENDING_APPROVAL' OR approval_status = 'PENDING' THEN 1 END) as pendingApprovals
      FROM deposit_transactions
      WHERE created_by = :userId
        AND transaction_date BETWEEN :startDate AND :endDate
        AND status = 'COMPLETED'
      `,
      {
        replacements: {
          userId,
          startDate: today,
          endDate: tomorrow
        },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const summary = transactions || {
      totalTransactions: 0,
      totalAmount: 0,
      totalDeposits: 0,
      totalWithdrawals: 0,
      totalEMTL: 0,
      pendingApprovals: 0
    };

    return res.json({
      success: true,
      data: {
        summary: {
          totalTransactions: parseInt(summary.totalTransactions || 0),
          totalAmount: parseFloat(summary.totalAmount || 0),
          totalDeposits: parseFloat(summary.totalDeposits || 0),
          totalWithdrawals: parseFloat(summary.totalWithdrawals || 0),
          totalEMTL: parseFloat(summary.totalEMTL || 0),
          pendingApprovals: parseInt(summary.pendingApprovals || 0)
        },
        userId: userId,
        date: today.toISOString().split('T')[0]
      }
    });

  } catch (error) {
    console.error('Error fetching teller summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch teller summary',
      error: error.message
    });
  }
});

// ================================================================
// HEALTH CHECK
// ================================================================

router.get('/transactions/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'transaction-api', 
    timestamp: new Date().toISOString(),
    endpoints: {
      post: '/api/transactions',
      approve: '/api/transactions/approve',
      reject: '/api/transactions/reject',
      pending: '/api/transactions/pending',
      tellerDaily: '/api/transactions/teller/daily/:userId',
      tellerSummary: '/api/transactions/teller/summary',
      accountBalance: '/api/transactions/account/:accountNo/balance',
      accountTransactions: '/api/transactions/account/:accountNo',
      history: '/api/transactions/history'
    }
  });
});

export default router;