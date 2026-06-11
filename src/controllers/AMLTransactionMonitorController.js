// src/controllers/AMLTransactionMonitorController.js
import AMLTransactionMonitor from '../services/AMLTransactionMonitor.js';
import sequelize from '../../config/db.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';

export const analyzeTransactionForAML = async (req, res) => {
  try {
    const { transactionId, accountNumber, amount, customerId } = req.body;
    
    // Fetch transaction details
    const [transaction] = await sequelize.query(
      `SELECT * FROM audit_trails WHERE id = :transactionId OR (account_no = :accountNumber AND amount = :amount)`,
      { replacements: { transactionId, accountNumber, amount }, type: sequelize.QueryTypes.SELECT }
    );
    
    if (!transaction) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    
    // Fetch customer account
    const [customerAccount] = await sequelize.query(
      `SELECT * FROM customer_accounts WHERE account_number = :accountNumber`,
      { replacements: { accountNumber }, type: sequelize.QueryTypes.SELECT }
    );
    
    // Fetch customer
    const [customer] = await sequelize.query(
      `SELECT * FROM customers WHERE CUST_ID = :customerId`,
      { replacements: { customerId }, type: sequelize.QueryTypes.SELECT }
    );
    
    // Run AML analysis
    const riskAnalysis = await AMLTransactionMonitor.analyzeTransaction(
      transaction,
      customerAccount,
      customer
    );
    
    // If high risk, create SAR
    if (riskAnalysis.requiresSuspiciousReport) {
      const sar = await AMLTransactionMonitor.createSuspiciousActivityReport(
        transaction,
        customerAccount,
        customer,
        riskAnalysis
      );
      
      return res.json({
        success: true,
        riskAnalysis,
        suspiciousActivityReport: sar,
        message: 'High risk transaction detected. SAR has been created.'
      });
    }
    
    // If requires approval, flag for review
    if (riskAnalysis.requiresApproval) {
      return res.json({
        success: true,
        riskAnalysis,
        message: 'Transaction flagged for managerial approval',
        requiresApproval: true
      });
    }
    
    return res.json({
      success: true,
      riskAnalysis,
      message: 'Transaction cleared AML check',
      requiresApproval: false
    });
  } catch (error) {
    logger.error('AML Transaction Analysis Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to analyze transaction',
      error: error.message
    });
  }
};

export const getCustomerRiskProfile = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    // Fetch all customer transactions
    const transactions = await sequelize.query(
      `SELECT at.* FROM audit_trails at
       JOIN customer_accounts ca ON ca.account_number = at.account_no
       WHERE ca.customer_id = :customerId
       ORDER BY at.timestamp DESC
       LIMIT 100`,
      { replacements: { customerId }, type: sequelize.QueryTypes.SELECT }
    );
    
    // Get AML record
    const [amlRecord] = await sequelize.query(
      `SELECT * FROM aml WHERE CUST_ID = :customerId`,
      { replacements: { customerId }, type: sequelize.QueryTypes.SELECT }
    );
    
    // Generate AI predictions
    const prediction = await AMLTransactionMonitor.predictCustomerRisk(customerId, transactions);
    
    // Generate AI insights
    const insights = AMLTransactionMonitor.generateAIInsights(customerId, transactions, {
      riskLevel: amlRecord?.CUSTOMER_RISK_RATING || 'LOW',
      riskIndicators: []
    });
    
    res.json({
      success: true,
      data: {
        customerId,
        amlRecord,
        transactionHistory: transactions,
        riskPrediction: prediction,
        aiInsights: insights
      }
    });
  } catch (error) {
    logger.error('Customer Risk Profile Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate customer risk profile',
      error: error.message
    });
  }
};

export const getSuspiciousActivityReports = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let whereClause = "event_type = 'SUSPICIOUS_ACTIVITY_REPORT'";
    if (status) {
      whereClause += ` AND status = '${status}'`;
    }
    
    const [reports] = await sequelize.query(
      `SELECT * FROM audit_trails 
       WHERE ${whereClause}
       ORDER BY timestamp DESC
       LIMIT :limit OFFSET :offset`,
      { replacements: { limit: parseInt(limit), offset }, type: sequelize.QueryTypes.SELECT }
    );
    
    const [countResult] = await sequelize.query(
      `SELECT COUNT(*) as total FROM audit_trails WHERE ${whereClause}`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    res.json({
      success: true,
      data: reports.map(r => ({
        ...r,
        details: JSON.parse(r.new_value || '{}')
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: countResult.total,
        pages: Math.ceil(countResult.total / limit)
      }
    });
  } catch (error) {
    logger.error('Fetch SARs Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch suspicious activity reports',
      error: error.message
    });
  }
};

export const updateSARStatus = async (req, res) => {
  try {
    const { sarId } = req.params;
    const { status, reviewerComments, reviewerId } = req.body;
    
    await sequelize.query(
      `UPDATE audit_trails 
       SET status = :status, 
           additional_info = JSON_SET(
             COALESCE(additional_info, '{}'),
             '$.reviewer_comments', :reviewerComments,
             '$.reviewed_by', :reviewerId,
             '$.reviewed_at', NOW()
           )
       WHERE event_id = :sarId`,
      { replacements: { sarId, status, reviewerComments, reviewerId } }
    );
    
    res.json({
      success: true,
      message: 'SAR status updated successfully'
    });
  } catch (error) {
    logger.error('Update SAR Status Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update SAR status',
      error: error.message
    });
  }
};

export const getSystemRiskMetrics = async (req, res) => {
  try {
    // Get high-risk customers
    const [highRiskCustomers] = await sequelize.query(
      `SELECT COUNT(*) as count FROM aml WHERE CUSTOMER_RISK_RATING = 'High'`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    // Get pending SARs
    const [pendingSARs] = await sequelize.query(
      `SELECT COUNT(*) as count FROM audit_trails 
       WHERE event_type = 'SUSPICIOUS_ACTIVITY_REPORT' AND status = 'PENDING_REVIEW'`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    // Get flagged transactions from last 24 hours
    const [flaggedTransactions] = await sequelize.query(
      `SELECT COUNT(*) as count FROM audit_trails 
       WHERE event_type = 'SUSPICIOUS_ACTIVITY_REPORT' 
         AND timestamp >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    // Get risk level distribution
    const [riskDistribution] = await sequelize.query(
      `SELECT CUSTOMER_RISK_RATING, COUNT(*) as count 
       FROM aml 
       GROUP BY CUSTOMER_RISK_RATING`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    res.json({
      success: true,
      data: {
        highRiskCustomers: highRiskCustomers.count,
        pendingSARs: pendingSARs.count,
        flaggedTransactionsLast24Hours: flaggedTransactions.count,
        riskDistribution,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('System Risk Metrics Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch system risk metrics',
      error: error.message
    });
  }
};