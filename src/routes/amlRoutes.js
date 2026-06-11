// routes/amlRoutes.js
import express from 'express';
import asyncHandler from 'express-async-handler';
import rateLimit from 'express-rate-limit';
import { restrictToPermission } from '../middlewares/rbac.js';
import {
  upsertAML,
  updateAMLByCustId,
  getAMLByCustId,
  getAllAMLRecords,
  deleteAMLByCustId,
  approveAML,
  getAMLConfigurations,
  updateAMLConfigurations,
  getAMLStatistics,
  getSuspiciousTransactions,
  getPendingAMLReviews,
  approveTransaction,
  // Prembly AML Integration Functions
  checkPEPStatus,
  checkSanctionStatus,
  completeAMLScreening,
  validateCustomerTransaction
} from '../controllers/AMLController.js';

const router = express.Router();

const amlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per IP
  message: 'Too many AML requests, please try again later.'
});

router.use(amlLimiter);

// ==================== PREMBLY AML SCREENING ENDPOINTS ====================

/**
 * @route   POST /api/aml/pep-check
 * @desc    Check if a person is a Politically Exposed Person (PEP) using Prembly
 * @access  VIEW_AML_THRESHOLD
 */
router.post('/pep-check', 
  restrictToPermission('amlThreshold'), 
  asyncHandler(checkPEPStatus)
);

/**
 * @route   POST /api/aml/sanction-check
 * @desc    Check if a person is on Sanction list using Prembly
 * @access  VIEW_AML_THRESHOLD
 */
router.post('/sanction-check', 
  restrictToPermission('amlThreshold'), 
  asyncHandler(checkSanctionStatus)
);

/**
 * @route   POST /api/aml/full-screening
 * @desc    Complete AML screening (PEP + Sanction) using Prembly
 * @access  VIEW_AML_THRESHOLD
 */
router.post('/full-screening', 
  restrictToPermission('amlThreshold'), 
  asyncHandler(completeAMLScreening)
);

/**
 * @route   POST /api/aml/validate-transaction
 * @desc    Validate customer for transaction using Prembly AML screening
 * @access  PROCESS_TRANSACTIONS
 */
router.post('/validate-transaction', 
  restrictToPermission('processTransactions'), 
  asyncHandler(validateCustomerTransaction)
);

// ==================== AML CONFIGURATION ENDPOINTS ====================

/**
 * @route   GET /api/aml/configurations
 * @desc    Get all AML system configurations
 * @access  VIEW_AML_THRESHOLD
 */
router.get('/configurations', 
  restrictToPermission('amlThreshold'), 
  asyncHandler(getAMLConfigurations)
);

/**
 * @route   POST /api/aml/configurations/update
 * @desc    Update AML system configurations
 * @access  CONFIGURE_AML
 */
router.post('/configurations/update', 
  restrictToPermission('configureAML'), 
  asyncHandler(updateAMLConfigurations)
);

/**
 * @route   GET /api/aml/statistics
 * @desc    Get AML statistics and dashboard data
 * @access  VIEW_AML_THRESHOLD
 */
router.get('/statistics', 
  restrictToPermission('amlThreshold'), 
  asyncHandler(getAMLStatistics)
);

/**
 * @route   GET /api/aml/transactions/suspicious
 * @desc    Get suspicious transactions flagged by AML
 * @access  VIEW_AML_THRESHOLD
 */
router.get('/transactions/suspicious', 
  restrictToPermission('amlThreshold'), 
  asyncHandler(getSuspiciousTransactions)
);

/**
 * @route   GET /api/aml/transactions/pending
 * @desc    Get transactions pending AML review
 * @access  VIEW_AML_THRESHOLD
 */
router.get('/transactions/pending', 
  restrictToPermission('amlThreshold'), 
  asyncHandler(getPendingAMLReviews)
);

/**
 * @route   POST /api/aml/transactions/:referenceNo/approve
 * @desc    Approve a transaction flagged for AML review
 * @access  APPROVE_AML
 */
router.post('/transactions/:referenceNo/approve', 
  restrictToPermission('amlApproval'), 
  asyncHandler(approveTransaction)
);

// ==================== AML CUSTOMER RECORDS ENDPOINTS ====================

/**
 * @route   POST /api/aml/customer/upsert
 * @desc    Create or update AML record by CUST_ID with workflow
 * @access  CONFIGURE_AML
 */
router.post('/customer/upsert', 
  restrictToPermission('configureAML'), 
  asyncHandler(upsertAML)
);

/**
 * @route   PUT /api/aml/customer/update/:custId
 * @desc    Update AML record by CUST_ID only (no insert)
 * @access  CONFIGURE_AML
 */
router.put('/customer/update/:custId', 
  restrictToPermission('configureAML'), 
  asyncHandler(updateAMLByCustId)
);

/**
 * @route   POST /api/aml/customer/approve
 * @desc    Approve AML record by CUST_ID
 * @access  APPROVE_AML
 */
router.post('/customer/approve', 
  restrictToPermission('amlApproval'), 
  asyncHandler(approveAML)
);

/**
 * @route   GET /api/aml/customer/:custId
 * @desc    Get AML record by CUST_ID
 * @access  VIEW_AML_THRESHOLD
 */
router.get('/customer/:custId', 
  restrictToPermission('amlThreshold'), 
  asyncHandler(getAMLByCustId)
);

/**
 * @route   GET /api/aml/customer
 * @desc    Get all AML records with pagination and filters
 * @access  VIEW_AML_THRESHOLD
 */
router.get('/customer', 
  restrictToPermission('amlThreshold'), 
  asyncHandler(getAllAMLRecords)
);

/**
 * @route   DELETE /api/aml/customer/:custId
 * @desc    Delete AML record by CUST_ID
 * @access  CONFIGURE_AML
 */
router.delete('/customer/:custId', 
  restrictToPermission('configureAML'), 
  asyncHandler(deleteAMLByCustId)
);

// ==================== AML RISK CHECK ENDPOINTS ====================

/**
 * @route   POST /api/aml/check/transaction
 * @desc    Check a transaction for AML risk (pre-transaction)
 * @access  PROCESS_TRANSACTIONS
 */
router.post('/check/transaction', 
  restrictToPermission('processTransactions'), 
  asyncHandler(async (req, res) => {
    const { amount, account_number, transaction_type, depositor_name, description } = req.body;
    
    // Import AML monitor dynamically to avoid circular dependencies
    const AMLTransactionMonitor = (await import('../services/AMLTransactionMonitor.js')).default;
    
    // Fetch account and customer info
    const sequelize = (await import('../../config/db.js')).default;
    const [account] = await sequelize.query(
      `SELECT ca.*, c.PHONE_NO, CONCAT(c.FIRST_NAME, ' ', c.LAST_NAME) as customer_name
       FROM customer_accounts ca
       LEFT JOIN customers c ON ca.customer_id = c.CUST_ID
       WHERE ca.account_number = :accountNumber
       LIMIT 1`,
      {
        replacements: { accountNumber: account_number },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found'
      });
    }
    
    const customer = {
      CUST_ID: account.customer_id,
      CUST_NM: account.customer_name,
      PHONE_NO: account.PHONE_NO
    };
    
    const amlTransaction = {
      id: `TXN-PRE-${Date.now()}`,
      amount: parseFloat(amount),
      created_at: new Date(),
      type: transaction_type,
      additional_info: {
        source: depositor_name || 'Unknown',
        description: description || 'AML Pre-check'
      }
    };
    
    const amlCheck = await AMLTransactionMonitor.analyzeTransaction(
      amlTransaction,
      account,
      customer
    );
    
    return res.status(200).json({
      success: true,
      aml_check: {
        risk_level: amlCheck.riskLevel,
        risk_score: amlCheck.riskScore,
        risk_indicators: amlCheck.riskIndicators,
        requires_approval: amlCheck.requiresApproval,
        requires_suspicious_report: amlCheck.requiresSuspiciousReport,
        message: amlCheck.message,
        recommendation: amlCheck.riskLevel === 'LOW' ? 'PROCEED' : 
                       amlCheck.riskLevel === 'MEDIUM' ? 'REQUIRE_REVIEW' : 'BLOCK'
      }
    });
  })
);

/**
 * @route   GET /api/aml/dashboard/summary
 * @desc    Get AML dashboard summary data
 * @access  VIEW_AML_THRESHOLD
 */
router.get('/dashboard/summary', 
  restrictToPermission('amlThreshold'), 
  asyncHandler(async (req, res) => {
    const sequelize = (await import('../../config/db.js')).default;
    
    const summary = await sequelize.query(`
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN aml_risk_level = 'LOW' THEN 1 ELSE 0 END) as low_risk_count,
        SUM(CASE WHEN aml_risk_level = 'MEDIUM' THEN 1 ELSE 0 END) as medium_risk_count,
        SUM(CASE WHEN aml_risk_level = 'HIGH' THEN 1 ELSE 0 END) as high_risk_count,
        SUM(CASE WHEN aml_risk_level = 'CRITICAL' THEN 1 ELSE 0 END) as critical_risk_count,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_review_count,
        SUM(amount) as total_amount,
        AVG(aml_risk_score) as average_risk_score
      FROM deposit_transactions 
      WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
    `, { type: sequelize.QueryTypes.SELECT });
    
    res.json({
      success: true,
      data: summary[0]
    });
  })
);

// ==================== AML EXPORT ENDPOINTS ====================

/**
 * @route   GET /api/aml/export/transactions
 * @desc    Export AML transactions (CSV or JSON)
 * @access  VIEW_AML_THRESHOLD
 */
router.get('/export/transactions', 
  restrictToPermission('amlThreshold'), 
  asyncHandler(async (req, res) => {
    const { format = 'json', startDate, endDate, riskLevel } = req.query;
    const sequelize = (await import('../../config/db.js')).default;
    
    let whereClause = '1=1';
    const replacements = {};
    
    if (startDate) {
      whereClause += ' AND created_at >= :startDate';
      replacements.startDate = startDate;
    }
    
    if (endDate) {
      whereClause += ' AND created_at <= :endDate';
      replacements.endDate = endDate;
    }
    
    if (riskLevel) {
      whereClause += ' AND aml_risk_level = :riskLevel';
      replacements.riskLevel = riskLevel;
    }
    
    const transactions = await sequelize.query(`
      SELECT id, transaction_ref_no, account_number, amount, transaction_type,
             aml_risk_level, aml_risk_score, aml_indicators, status,
             created_by, transaction_date, created_at
      FROM deposit_transactions 
      WHERE ${whereClause}
      ORDER BY created_at DESC
    `, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=aml_transactions.csv');
      
      const headers = ['ID', 'Reference No', 'Account Number', 'Amount', 'Type', 
                       'Risk Level', 'Risk Score', 'Status', 'Created By', 'Transaction Date'];
      const rows = transactions.map(t => [
        t.id, t.transaction_ref_no, t.account_number, t.amount, 
        t.transaction_type, t.aml_risk_level, t.aml_risk_score, 
        t.status, t.created_by, t.transaction_date
      ]);
      const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
      
      return res.send(csv);
    }
    
    res.json({
      success: true,
      data: transactions,
      count: transactions.length
    });
  })
);

// ==================== AML HEALTH CHECK ====================

/**
 * @route   GET /api/aml/health
 * @desc    Check AML system health
 * @access  ADMIN
 */
router.get('/health', 
  restrictToPermission('admin'), 
  asyncHandler(async (req, res) => {
    const sequelize = (await import('../../config/db.js')).default;
    
    // Check database connection
    await sequelize.authenticate();
    
    // Check required tables
    const tables = await sequelize.query(`SHOW TABLES`, { type: sequelize.QueryTypes.SELECT });
    const tableNames = tables.map(t => Object.values(t)[0]);
    
    const requiredTables = ['deposit_transactions', 'deposit_account_history', 'deposit_account_summary'];
    const missingTables = requiredTables.filter(t => !tableNames.includes(t));
    
    res.json({
      success: true,
      status: 'healthy',
      database: 'connected',
      prembly_configured: !!(process.env.PREMBLY_APP_ID),
      tables: {
        present: tableNames,
        missing: missingTables,
        all_present: missingTables.length === 0
      },
      timestamp: new Date().toISOString()
    });
  })
);

export default router;