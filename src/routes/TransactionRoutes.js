// routes/TransactionRoutes.js
import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js'; 
import decryptPayload from '../middleware/decryptPayload.js';  
import sequelize from '../../config/db.js';
import { QueryTypes } from 'sequelize';

// Create router instance
const router = express.Router();

// Import controller - use require for better compatibility
let transactionController;
try {
  // Try different import methods
  const module = await import('../Services/postTransaction.js');
  transactionController = module.default || module;
  console.log('✅ Controller loaded:', typeof transactionController);
  console.log('✅ Methods available:', Object.getOwnPropertyNames(Object.getPrototypeOf(transactionController)));
} catch (err) {
  console.error('❌ Import failed:', err.message);
  // Create fallback controller
  transactionController = {
    postTransaction: async (req, res) => {
      res.status(501).json({ error: 'Controller not loaded properly' });
    },
    getAccountBalance: async (req, res) => {
      res.status(501).json({ error: 'Not implemented' });
    },
    getTransactionsByAccount: async (req, res) => {
      res.status(501).json({ error: 'Not implemented' });
    },
    getCustomerAccounts: async (req, res) => {
      res.status(501).json({ error: 'Not implemented' });
    },
    getTransactionHistory: async (req, res) => {
      res.status(501).json({ error: 'Not implemented' });
    },
    getTransactionsByCustomer: async (req, res) => {
      res.status(501).json({ error: 'Not implemented' });
    },
    getTransactionsByCustomerName: async (req, res) => {
      res.status(501).json({ error: 'Not implemented' });
    },
    exportTransactions: async (req, res) => {
      res.status(501).json({ error: 'Not implemented' });
    },
    exportTransactionsByCustomer: async (req, res) => {
      res.status(501).json({ error: 'Not implemented' });
    },
    exportTransactionsByCustomerName: async (req, res) => {
      res.status(501).json({ error: 'Not implemented' });
    },
    exportBatchTransactions: async (req, res) => {
      res.status(501).json({ error: 'Not implemented' });
    },
    debugAccounts: async (req, res) => {
      res.status(501).json({ error: 'Not implemented' });
    }
  };
}

// Helper to safely call controller methods
const safeCall = (method) => {
  return async (req, res) => {
    try {
      if (transactionController && typeof transactionController[method] === 'function') {
        await transactionController[method](req, res);
      } else {
        res.status(501).json({ 
          error: `Method ${method} not available`,
          available: Object.keys(transactionController)
        });
      }
    } catch (err) {
      console.error(`Error in ${method}:`, err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message });
      }
    }
  };
};

console.log('🔧 Setting up Transaction Routes...');

// ==================== ENCRYPTED TRANSACTION POSTING ====================
router.post('/transactions', decryptPayload, safeCall('postTransaction'));
router.post('/transfer', decryptPayload, safeCall('postTransaction'));
router.post('/payment', decryptPayload, safeCall('postTransaction'));

// ==================== ACCOUNT BALANCE ENDPOINTS ====================
router.get('/transactions/account/:accountNo/balance', safeCall('getAccountBalance'));
router.get('/transactions/account/:accountNo', safeCall('getTransactionsByAccount'));
router.get('/transactions/customer/:customerId/accounts', safeCall('getCustomerAccounts'));

// ==================== TRANSACTION QUERY ENDPOINTS ====================
router.get('/transactions/history', safeCall('getTransactionHistory'));
router.get('/transactions/customer/id/:customerId', safeCall('getTransactionsByCustomer'));
router.get('/transactions/customer/name/:customerName', safeCall('getTransactionsByCustomerName'));

// ==================== EXPORT ENDPOINTS ====================
router.get('/transactions/export', safeCall('exportTransactions'));
router.get('/transactions/export/customer/id/:customerId', safeCall('exportTransactionsByCustomer'));
router.get('/transactions/export/customer/name/:customerName', safeCall('exportTransactionsByCustomerName'));
router.post('/transactions/export/batch', safeCall('exportBatchTransactions'));

// ==================== AML AND COMPLIANCE ENDPOINTS ====================
router.post('/transactions/aml/check', decryptPayload, async (req, res) => {
  try {
    const { amount, account_number } = req.body;
    
    const [account] = await sequelize.query(
      `SELECT ca.*, c.PHONE_NO, CONCAT(c.FIRST_NAME, ' ', c.LAST_NAME) as customer_name
       FROM customer_accounts ca
       LEFT JOIN customers c ON ca.customer_id = c.CUST_ID
       WHERE ca.account_number = :accountNumber
       LIMIT 1`,
      {
        replacements: { accountNumber: account_number },
        type: QueryTypes.SELECT
      }
    );
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }
    
    const amountValue = parseFloat(amount);
    let riskLevel = 'LOW';
    let riskScore = 10;
    let requiresApproval = false;
    let requiresSuspiciousReport = false;
    let riskIndicators = [];
    
    if (amountValue > 10000000) {
      riskLevel = 'CRITICAL';
      riskScore = 95;
      requiresSuspiciousReport = true;
      riskIndicators.push('VERY_HIGH_VALUE_TRANSACTION');
    } else if (amountValue > 5000000) {
      riskLevel = 'HIGH';
      riskScore = 75;
      requiresApproval = true;
      riskIndicators.push('HIGH_VALUE_TRANSACTION');
    } else if (amountValue > 1000000) {
      riskLevel = 'MEDIUM';
      riskScore = 50;
      riskIndicators.push('MEDIUM_VALUE_TRANSACTION');
    }
    
    return res.status(200).json({
      success: true,
      aml_check: {
        risk_level: riskLevel,
        risk_score: riskScore,
        risk_indicators: riskIndicators,
        requires_approval: requiresApproval,
        requires_suspicious_report: requiresSuspiciousReport,
        message: requiresSuspiciousReport ? 'Transaction flagged for suspicious activity review' : 
                 (requiresApproval ? 'Transaction requires approval' : 'Low risk transaction')
      }
    });
  } catch (error) {
    console.error('AML pre-check error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to perform AML check',
      error: error.message
    });
  }
});

router.get('/transactions/aml/suspicious', authMiddleware, async (req, res) => {
  try {
    const suspicious = await sequelize.query(
      `SELECT * FROM deposit_transactions 
       WHERE aml_risk_level IN ('HIGH', 'CRITICAL')
       AND status = 'COMPLETED'
       ORDER BY created_at DESC
       LIMIT 100`,
      { type: QueryTypes.SELECT }
    );
    
    return res.status(200).json({
      success: true,
      data: suspicious,
      count: suspicious.length
    });
  } catch (error) {
    console.error('Error fetching suspicious transactions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch suspicious transactions',
      error: error.message
    });
  }
});

router.get('/transactions/aml/pending', authMiddleware, async (req, res) => {
  try {
    const pending = await sequelize.query(
      `SELECT * FROM deposit_transactions 
       WHERE aml_risk_level IN ('MEDIUM', 'HIGH')
       AND status = 'PENDING'
       ORDER BY created_at DESC
       LIMIT 50`,
      { type: QueryTypes.SELECT }
    );
    
    return res.status(200).json({
      success: true,
      data: pending,
      count: pending.length
    });
  } catch (error) {
    console.error('Error fetching pending AML reviews:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pending AML reviews',
      error: error.message
    });
  }
});

router.put('/transactions/:referenceNo/approve', authMiddleware, async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { referenceNo } = req.params;
    const { approved_by, notes } = req.body;
    
    const [txn] = await sequelize.query(
      `SELECT * FROM deposit_transactions 
       WHERE transaction_ref_no = :referenceNo
       LIMIT 1`,
      {
        replacements: { referenceNo },
        type: QueryTypes.SELECT,
        transaction
      }
    );
    
    if (!txn) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Transaction not found'
      });
    }
    
    await sequelize.query(
      `UPDATE deposit_transactions 
       SET status = 'APPROVED',
           approved_by = :approvedBy,
           approved_at = NOW(),
           description = CONCAT(description, ' | AML Approved: ', :notes)
       WHERE transaction_ref_no = :referenceNo`,
      {
        replacements: { 
          referenceNo, 
          approvedBy: approved_by,
          notes: notes || 'Approved after AML review'
        },
        transaction
      }
    );
    
    await transaction.commit();
    
    return res.status(200).json({
      success: true,
      message: 'Transaction approved successfully',
      reference_no: referenceNo
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error approving transaction:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to approve transaction',
      error: error.message
    });
  }
});

// ==================== DEBUG ENDPOINTS ====================
router.get('/transactions/debug/accounts', safeCall('debugAccounts'));

router.get('/transactions/debug/health', async (req, res) => {
  try {
    await sequelize.authenticate();
    const tables = await sequelize.query(`SHOW TABLES`, { type: QueryTypes.SELECT });
    const existingTables = tables.map(t => Object.values(t)[0]);
    
    return res.status(200).json({
      success: true,
      database: 'connected',
      timestamp: new Date().toISOString(),
      tables: {
        total: existingTables.length,
        list: existingTables
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      database: 'disconnected',
      error: error.message
    });
  }
});

router.get('/transactions/debug/stats', async (req, res) => {
  try {
    const stats = await sequelize.query(
      `SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN transaction_type = 'DEPOSIT' THEN 1 ELSE 0 END) as total_deposits,
        SUM(CASE WHEN transaction_type = 'WITHDRAWAL' THEN 1 ELSE 0 END) as total_withdrawals,
        SUM(amount) as total_amount
       FROM deposit_transactions
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
      { type: QueryTypes.SELECT }
    );
    
    return res.status(200).json({
      success: true,
      stats: stats[0]
    });
  } catch (error) {
    console.error('Error fetching transaction stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch transaction statistics',
      error: error.message
    });
  }
});

console.log('✅ Transaction Routes loaded successfully');

// IMPORTANT: Ensure we export just the router
export default router;