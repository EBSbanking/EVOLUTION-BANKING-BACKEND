// ============================================
// MANUAL TRANSACTION ROUTES - WITH EMTL INTEGRATION
// ============================================
console.log('\n🔧 ========================================');
console.log('🔧 SETTING UP MANUAL TRANSACTION ROUTES');
console.log('🔧 ==========================================\n');

import express from 'express';
import decryptPayload from '../middleware/decryptPayload.js';
import { protect, authorize, isAdmin } from '../middlewares/authMiddleware.js';
import {
  EMTLPolicyService,
  EMTLCollectionService,
  EMTLRemittanceService,
  EMTLReceiptService,
  EMTLReportService
} from '../Services/index.js';

// ✅ USE STATIC IMPORT (no try/catch fallback)
import transactionController from '../Services/postTransaction.js';

// Verify that the controller and method exist
console.log('✅ Transaction controller loaded:', typeof transactionController);
console.log('✅ Available methods:', Object.keys(transactionController).join(', '));

// Ensure getTransactionHistory exists
if (typeof transactionController.getTransactionHistory !== 'function') {
  console.error('❌ getTransactionHistory method is missing!');
}

// ============================================================
// ✅ SAFE CALL HELPER WITH DEBUG LOGGING
// ============================================================
const safeCall = (method) => {
  return async (req, res) => {
    try {
      if (transactionController && typeof transactionController[method] === 'function') {
        await transactionController[method](req, res);
      } else {
        console.error(`❌ Method "${method}" not found. Available:`, Object.keys(transactionController));
        res.status(501).json({
          success: false,
          error: `Method "${method}" not available`,
          available: Object.keys(transactionController)
        });
      }
    } catch (err) {
      console.error(`❌ Error in ${method}:`, err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Operation failed',
          error: err.message
        });
      }
    }
  };
};

const router = express.Router();

// ============================================================
// ✅ TRANSACTION POST ROUTES (with decryption)
// ============================================================
router.post('/transactions', decryptPayload, safeCall('postTransaction'));
router.post('/transfer', decryptPayload, safeCall('postTransaction'));
router.post('/payment', decryptPayload, safeCall('postTransaction'));

// ============================================================
// ✅ ACCOUNT BALANCE & TRANSACTION QUERY ROUTES
// ============================================================
router.get('/account/:accountNo/balance', safeCall('getAccountBalance'));
router.get('/account/:accountNo', safeCall('getTransactionsByAccount'));
router.get('/history', safeCall('getTransactionHistory'));        // <-- FIXED: removed extra 'transactions/'
router.get('/debug/accounts', safeCall('debugAccounts'));

// ============================================================
// ✅ TELLER TRANSACTION ROUTES (protected)
// ============================================================
router.get('/teller/daily/:userId', protect, safeCall('getTellerDailyTransactions'));
router.get('/teller/summary', protect, safeCall('getTellerTransactionSummary'));

// ============================================================
// ✅ CUSTOMER TRANSACTION ROUTES
// ============================================================
router.get('/customer/:customerId', safeCall('getTransactionsByCustomer'));
router.get('/customer/name/:customerName', safeCall('getTransactionsByCustomerName'));

// ============================================================
// ✅ EXPORT ROUTES (protected - admin only)
// ============================================================
router.get('/export', protect, isAdmin, safeCall('exportTransactions'));

// ============================================================
// ✅ EMTL ROUTES - USING SERVICES
// ============================================================
console.log('\n📊 Setting up EMTL routes...');

/**
 * Get EMTL Report
 * GET /emtl/report?startDate=...&endDate=...&reportType=daily
 */
router.get('/emtl/report', protect, async (req, res) => {
  try {
    console.log('📊 EMTL Report requested');
    await transactionController.getEMTLReport(req, res);
  } catch (error) {
    console.error('❌ EMTL Report error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate EMTL report', 
        error: error.message 
      });
    }
  }
});

/**
 * Get Remittance Report
 * GET /emtl/report/remittance?startDate=...&endDate=...
 */
router.get('/emtl/report/remittance', protect, async (req, res) => {
  try {
    console.log('📊 Remittance Report requested');
    await transactionController.getRemittanceReport(req, res);
  } catch (error) {
    console.error('❌ Remittance Report error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate remittance report', 
        error: error.message 
      });
    }
  }
});

/**
 * Generate Receipt
 * GET /emtl/receipt/:transactionId?format=json|html
 */
router.get('/emtl/receipt/:transactionId', protect, async (req, res) => {
  try {
    console.log(`📄 Receipt requested for transaction: ${req.params.transactionId}`);
    await transactionController.generateReceipt(req, res);
  } catch (error) {
    console.error('❌ Receipt generation error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate receipt', 
        error: error.message 
      });
    }
  }
});

/**
 * Generate Remittance File (CSV)
 * GET /emtl/remittance/file?startDate=...&endDate=...
 */
router.get('/emtl/remittance/file', protect, isAdmin, async (req, res) => {
  try {
    console.log('📄 Remittance file requested');
    await transactionController.generateRemittanceFile(req, res);
  } catch (error) {
    console.error('❌ Remittance file generation error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate remittance file', 
        error: error.message 
      });
    }
  }
});

/**
 * Mark Collections as Remitted
 * POST /emtl/remittance/mark
 * Body: { batchId, remittanceReference }
 */
router.post('/emtl/remittance/mark', protect, isAdmin, async (req, res) => {
  try {
    console.log('📤 Marking collections as remitted');
    await transactionController.markCollectionsRemitted(req, res);
  } catch (error) {
    console.error('❌ Mark remitted error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to mark collections as remitted', 
        error: error.message 
      });
    }
  }
});

/**
 * Get Pending Collections
 * GET /emtl/collections/pending?limit=1000&offset=0
 */
router.get('/emtl/collections/pending', protect, async (req, res) => {
  try {
    console.log('📋 Fetching pending collections');
    await transactionController.getPendingCollections(req, res);
  } catch (error) {
    console.error('❌ Fetch pending collections error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch pending collections', 
        error: error.message 
      });
    }
  }
});

/**
 * Get Collections by Date Range
 * GET /emtl/collections?startDate=...&endDate=...&status=PENDING_REMITTANCE
 */
router.get('/emtl/collections', protect, async (req, res) => {
  try {
    console.log('📋 Fetching collections by date range');
    await transactionController.getCollectionsByDateRange(req, res);
  } catch (error) {
    console.error('❌ Fetch collections error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch collections', 
        error: error.message 
      });
    }
  }
});

/**
 * Get Collections by Account
 * GET /emtl/collections/account/:accountNo?limit=100&offset=0
 */
router.get('/emtl/collections/account/:accountNo', protect, async (req, res) => {
  try {
    console.log(`📋 Fetching collections for account: ${req.params.accountNo}`);
    await transactionController.getCollectionsByAccount(req, res);
  } catch (error) {
    console.error('❌ Fetch collections by account error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch collections', 
        error: error.message 
      });
    }
  }
});

/**
 * Get Collections by Customer
 * GET /emtl/collections/customer/:customerNo?limit=100&offset=0
 */
router.get('/emtl/collections/customer/:customerNo', protect, async (req, res) => {
  try {
    console.log(`📋 Fetching collections for customer: ${req.params.customerNo}`);
    await transactionController.getCollectionsByCustomer(req, res);
  } catch (error) {
    console.error('❌ Fetch collections by customer error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to fetch collections', 
        error: error.message 
      });
    }
  }
});

/**
 * Get EMTL Statistics
 * GET /emtl/statistics?startDate=...&endDate=...
 */
router.get('/emtl/statistics', protect, async (req, res) => {
  try {
    console.log('📊 EMTL Statistics requested');
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required'
      });
    }

    const stats = await EMTLPolicyService.getStatistics(
      new Date(startDate),
      new Date(endDate)
    );

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('❌ EMTL Statistics error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to get EMTL statistics', 
        error: error.message 
      });
    }
  }
});

/**
 * Generate Weekly Remittance Report
 * GET /emtl/remittance/weekly
 */
router.get('/emtl/remittance/weekly', protect, isAdmin, async (req, res) => {
  try {
    console.log('📊 Weekly remittance report requested');
    const report = await EMTLRemittanceService.generateWeeklyReport();
    
    return res.status(200).json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('❌ Weekly remittance report error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to generate weekly remittance report', 
        error: error.message 
      });
    }
  }
});

/**
 * Get Remittance History
 * GET /emtl/remittance/history?startDate=...&endDate=...
 */
router.get('/emtl/remittance/history', protect, isAdmin, async (req, res) => {
  try {
    console.log('📊 Remittance history requested');
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'startDate and endDate are required'
      });
    }

    const history = await EMTLRemittanceService.getRemittanceHistory(
      new Date(startDate),
      new Date(endDate)
    );

    return res.status(200).json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('❌ Remittance history error:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        success: false, 
        message: 'Failed to get remittance history', 
        error: error.message 
      });
    }
  }
});

// ============================================================
// ✅ HEALTH CHECK FOR EMTL SERVICES (public - no auth)
// ============================================================
router.get('/emtl/health', async (req, res) => {
  try {
    const policy = await EMTLPolicyService.getActivePolicy();
    return res.status(200).json({
      success: true,
      service: 'EMTL Services',
      status: 'healthy',
      policy: policy ? {
        id: policy.id,
        policy_code: policy.policy_code,
        enabled: policy.enabled,
        is_active: policy.is_active,
        levy_type: policy.levy_type,
        levy_amount: policy.levy_amount,
        threshold: policy.threshold
      } : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ EMTL Health check error:', error);
    return res.status(500).json({
      success: false,
      service: 'EMTL Services',
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================================
// ✅ ROUTE SUMMARY
// ============================================================
console.log('✅ EMTL routes setup complete');
console.log('   📊 GET  /emtl/report');
console.log('   📊 GET  /emtl/report/remittance');
console.log('   📄 GET  /emtl/receipt/:transactionId');
console.log('   📄 GET  /emtl/remittance/file');
console.log('   📤 POST /emtl/remittance/mark');
console.log('   📋 GET  /emtl/collections/pending');
console.log('   📋 GET  /emtl/collections');
console.log('   📋 GET  /emtl/collections/account/:accountNo');
console.log('   📋 GET  /emtl/collections/customer/:customerNo');
console.log('   📊 GET  /emtl/statistics');
console.log('   📊 GET  /emtl/remittance/weekly');
console.log('   📊 GET  /emtl/remittance/history');
console.log('   🏥 GET  /emtl/health');

console.log('\n✅ Transaction routes setup complete');
console.log('   📝 POST /transactions');
console.log('   📝 POST /transfer');
console.log('   📝 POST /payment');
console.log('   📊 GET  /account/:accountNo/balance');
console.log('   📊 GET  /account/:accountNo');
console.log('   📊 GET  /history');                       // <-- UPDATED
console.log('   📊 GET  /debug/accounts');
console.log('   📊 GET  /teller/daily/:userId');
console.log('   📊 GET  /teller/summary');
console.log('   📊 GET  /customer/:customerId');
console.log('   📊 GET  /customer/name/:customerName');
console.log('   📊 GET  /export');
console.log('   📊 GET  /emtl/* (all EMTL routes)');
console.log('🔧 ==========================================\n');

export default router;