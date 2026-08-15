// src/routes/TransactionRoutes.js
import express from 'express';
import transactionController from '../Services/postTransaction.js';
import { validateEOMClosure } from '../middlewares/validateEOMClosure.js';

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
// MAIN TRANSACTION ENDPOINTS - WITH EOM VALIDATION
// ================================================================

// ✅ Create transaction - with EOM validation and decryption
router.post('/transactions', withDecryption, validateEOMClosure, async (req, res) => {
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

// ✅ Approve a pending transaction
router.put('/transactions/approve', validateEOMClosure, async (req, res) => {
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

// ✅ Reject a pending transaction
router.put('/transactions/reject', validateEOMClosure, async (req, res) => {
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

// Get pending transactions
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

router.get(
  '/transactions/teller/daily/:userId',
  transactionController.getTellerDailyTransactions
);

router.get(
  '/transactions/teller/daily',
  transactionController.getTellerDailyTransactions
);

router.get(
  '/transactions/teller/summary',
  transactionController.getTellerTransactionSummary
);

// ================================================================
// ACCOUNT ENDPOINTS
// ================================================================

router.get('/transactions/account/:accountNo/balance', transactionController.getAccountBalance);
router.get('/transactions/account/:accountNo', transactionController.getTransactionsByAccount);
router.get('/transactions/customer/:customerId/accounts', transactionController.getCustomerAccounts);

// ================================================================
// TRANSACTION HISTORY & FILTERS
// ================================================================

router.get('/transactions/history', transactionController.getTransactionHistory);
router.get('/transactions/customer/id/:customerId', transactionController.getTransactionsByCustomer);
router.get('/transactions/customer/name/:customerName', transactionController.getTransactionsByCustomerName);

// ================================================================
// EXPORT ENDPOINTS
// ================================================================

router.get('/transactions/export', transactionController.exportTransactions);

router.get('/transactions/export/customer/id/:customerId', async (req, res) => {
  try {
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

router.get('/transactions/export/customer/name/:customerName', async (req, res) => {
  try {
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

router.post('/transactions/export/batch', async (req, res) => {
  try {
    const { startDate, endDate, accountNumbers, format = 'csv' } = req.body;
    
    if (!accountNumbers || !Array.isArray(accountNumbers) || accountNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Account numbers are required for batch export'
      });
    }
    
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

router.get('/transactions/debug/accounts', async (req, res) => {
  console.log('🔍 Debug accounts endpoint called');
  try {
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
// TELLER SUMMARY ENDPOINT
// ================================================================

router.get('/teller-summary', async (req, res) => {
  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    const sequelize = (await import('../../config/db.js')).default;
    const { Op } = await import('sequelize');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

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
    eom_validation: true,
    endpoints: {
      post: '/api/transactions (EOM validated)',
      approve: '/api/transactions/approve (EOM validated)',
      reject: '/api/transactions/reject (EOM validated)',
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