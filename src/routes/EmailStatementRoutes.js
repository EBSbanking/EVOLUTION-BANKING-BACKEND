// routes/EmailStatementRoutes.js
import express from 'express';
import { 
  processEmailStatements,
  getCustomersDueForStatement,
  isCustomerDueForStatement,
  generateCustomerStatement,
  sendStatementEmail,
  getStatementPeriod
} from '../utils/emailStatementService.js';
import sequelize from '../../config/db.js';
import verifyToken from '../middlewares/verifyToken.js';
import { checkPermission } from '../middlewares/rolePermissionMiddleware.js';
import PERMISSIONS from '../constants/permissions.js';
import logger from '../utils/logger.js';

const router = express.Router();

// ============================================
// EMAIL STATEMENT ROUTES
// ============================================

/**
 * Get customers due for statement
 * GET /api/email-statements/customers-due
 * Query params: date (YYYY-MM-DD)
 */
router.get('/customers-due', verifyToken, checkPermission(PERMISSIONS.REPORT.VIEW), async (req, res) => {
  try {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const customers = await getCustomersDueForStatement(date);
    
    res.json({
      success: true,
      count: customers.length,
      data: customers.map(c => ({
        id: c.CUST_ID,
        name: c.CUST_NM || `${c.FIRST_NAME} ${c.LAST_NAME}`,
        email: c.EMAIL_ADDRESS,
        phone: c.PHONE_NO,
        frequency: c.STMNT_FREQ_CD,
        frequencyValue: c.STMNT_FREQ_VALUE,
        accountNumber: c.account_number,
        accountName: c.account_name,
        alertDelivery: c.ALERT_DELIVERY_METHOD,
        dueDate: c.dueDate,
        period: c.statementPeriod,
      })),
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting customers due:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Check if a specific customer is due for statement
 * GET /api/email-statements/customer/:customerId/due
 * Query params: date (YYYY-MM-DD)
 */
router.get('/customer/:customerId/due', verifyToken, checkPermission(PERMISSIONS.CUSTOMER.VIEW), async (req, res) => {
  try {
    const { customerId } = req.params;
    const date = req.query.date ? new Date(req.query.date) : new Date();
    
    // Get customer
    const [customer] = await sequelize.query(
      `SELECT 
        c.id,
        c.CUST_ID,
        c.CUST_NO,
        c.CUST_NM,
        c.FIRST_NAME,
        c.LAST_NAME,
        c.EMAIL_ADDRESS,
        c.PHONE_NO,
        c.STMNT_FREQ_CD,
        c.STMNT_FREQ_VALUE,
        c.ALERT_DELIVERY_METHOD,
        c.BU_ID,
        c.CREATED_BY,
        c.CREATE_DT,
        c.created_at,
        c.updated_at,
        ca.account_number,
        ca.account_name,
        ca.available_balance,
        ca.ledger_balance
      FROM customers c
      LEFT JOIN customer_accounts ca ON ca.CUST_ID = c.CUST_ID
      WHERE c.CUST_ID = :customerId
      LIMIT 1`,
      {
        replacements: { customerId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: `Customer ${customerId} not found`,
        timestamp: new Date().toISOString()
      });
    }

    const isDue = await isCustomerDueForStatement(customer, date);
    const period = isDue ? getStatementPeriod(customer, date) : null;
    const lastStatementDate = await getLastStatementDate(customerId);
    
    res.json({
      success: true,
      data: {
        customer: {
          id: customer.CUST_ID,
          name: customer.CUST_NM || `${customer.FIRST_NAME} ${customer.LAST_NAME}`,
          email: customer.EMAIL_ADDRESS,
          phone: customer.PHONE_NO,
          frequency: customer.STMNT_FREQ_CD,
          frequencyValue: customer.STMNT_FREQ_VALUE,
          alertDelivery: customer.ALERT_DELIVERY_METHOD,
          accountNumber: customer.account_number,
          accountName: customer.account_name,
          ledgerBalance: customer.ledger_balance,
          availableBalance: customer.available_balance,
        },
        isDue: isDue,
        period: period,
        lastStatementDate: lastStatementDate,
        nextDueDate: isDue ? period?.endDate : null,
        checkedDate: date.toISOString().split('T')[0],
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error checking customer ${req.params.customerId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Generate a customer statement
 * GET /api/email-statements/customer/:customerId/statement
 * Query params: startDate (YYYY-MM-DD), endDate (YYYY-MM-DD)
 */
router.get('/customer/:customerId/statement', verifyToken, checkPermission(PERMISSIONS.REPORT.VIEW), async (req, res) => {
  try {
    const { customerId } = req.params;
    const startDate = req.query.startDate ? new Date(req.query.startDate) : new Date(Date.now() - 30*24*60*60*1000);
    const endDate = req.query.endDate ? new Date(req.query.endDate) : new Date();
    
    // Get customer
    const [customer] = await sequelize.query(
      `SELECT 
        c.id,
        c.CUST_ID,
        c.CUST_NO,
        c.CUST_NM,
        c.FIRST_NAME,
        c.LAST_NAME,
        c.EMAIL_ADDRESS,
        c.PHONE_NO,
        c.STMNT_FREQ_CD,
        c.STMNT_FREQ_VALUE,
        c.ALERT_DELIVERY_METHOD,
        c.BU_ID,
        c.CREATED_BY,
        c.CREATE_DT,
        c.created_at,
        c.updated_at,
        ca.account_number,
        ca.account_name,
        ca.available_balance,
        ca.ledger_balance
      FROM customers c
      LEFT JOIN customer_accounts ca ON ca.CUST_ID = c.CUST_ID
      WHERE c.CUST_ID = :customerId
      LIMIT 1`,
      {
        replacements: { customerId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: `Customer ${customerId} not found`,
        timestamp: new Date().toISOString()
      });
    }

    const period = {
      startDate: startDate,
      endDate: endDate,
      startDateFormatted: startDate.toISOString().split('T')[0],
      endDateFormatted: endDate.toISOString().split('T')[0],
      frequency: customer.STMNT_FREQ_CD || 'MONTHLY',
      frequencyValue: parseInt(customer.STMNT_FREQ_VALUE) || 1,
    };

    const statement = await generateCustomerStatement(customer, period);
    
    if (!statement) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate statement',
        timestamp: new Date().toISOString()
      });
    }

    // Get account summary
    const [accountSummary] = await sequelize.query(
      `SELECT 
        ledger_balance,
        available_balance,
        cleared_balance,
        dr_turnover,
        cr_turnover,
        last_activity_date
      FROM deposit_account_summary 
      WHERE acct_no = :accountNumber
      LIMIT 1`,
      {
        replacements: { accountNumber: customer.account_number },
        type: sequelize.QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      data: {
        customer: statement.customer,
        period: statement.period,
        summary: {
          ...statement.summary,
          accountSummary: accountSummary || null
        },
        transactions: statement.transactions,
        generatedAt: statement.generatedAt,
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error generating statement for ${req.params.customerId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Send a test email statement to a customer
 * POST /api/email-statements/send-test
 * Body: { customerId, dryRun, sendEmail, asOfDate, testEmail }
 */
router.post('/send-test', verifyToken, checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS), async (req, res) => {
  try {
    const { 
      customerId, 
      dryRun = true, 
      sendEmail = false, 
      asOfDate = new Date(),
      testEmail = null,
      startDate = null,
      endDate = null
    } = req.body;
    
    const date = new Date(asOfDate);
    
    // Get customer
    const [customer] = await sequelize.query(
      `SELECT 
        c.id,
        c.CUST_ID,
        c.CUST_NO,
        c.CUST_NM,
        c.FIRST_NAME,
        c.LAST_NAME,
        c.EMAIL_ADDRESS,
        c.PHONE_NO,
        c.STMNT_FREQ_CD,
        c.STMNT_FREQ_VALUE,
        c.ALERT_DELIVERY_METHOD,
        c.BU_ID,
        c.CREATED_BY,
        c.CREATE_DT,
        c.created_at,
        c.updated_at,
        ca.account_number,
        ca.account_name,
        ca.available_balance,
        ca.ledger_balance
      FROM customers c
      LEFT JOIN customer_accounts ca ON ca.CUST_ID = c.CUST_ID
      WHERE c.CUST_ID = :customerId
      LIMIT 1`,
      {
        replacements: { customerId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: `Customer ${customerId} not found`,
        timestamp: new Date().toISOString()
      });
    }

    // Check if due
    const isDue = await isCustomerDueForStatement(customer, date);
    
    // Get period
    let period;
    if (startDate && endDate) {
      period = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        startDateFormatted: new Date(startDate).toISOString().split('T')[0],
        endDateFormatted: new Date(endDate).toISOString().split('T')[0],
        frequency: customer.STMNT_FREQ_CD || 'MONTHLY',
        frequencyValue: parseInt(customer.STMNT_FREQ_VALUE) || 1,
      };
    } else if (isDue) {
      period = getStatementPeriod(customer, date);
    } else {
      period = {
        startDate: new Date(Date.now() - 30*24*60*60*1000),
        endDate: new Date(),
        startDateFormatted: new Date(Date.now() - 30*24*60*60*1000).toISOString().split('T')[0],
        endDateFormatted: new Date().toISOString().split('T')[0],
        frequency: customer.STMNT_FREQ_CD || 'MONTHLY',
        frequencyValue: parseInt(customer.STMNT_FREQ_VALUE) || 1,
      };
    }

    // Generate statement
    const statementData = await generateCustomerStatement(customer, period);
    
    if (!statementData) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate statement',
        timestamp: new Date().toISOString()
      });
    }

    // Override email for testing
    const originalEmail = statementData.customer.email;
    if (testEmail) {
      statementData.customer.email = testEmail;
    }

    let emailResult = null;
    
    if (!dryRun && sendEmail) {
      emailResult = await sendStatementEmail(statementData);
    }

    // Get last statement date
    const lastStatementDate = await getLastStatementDate(customerId);

    res.json({
      success: true,
      data: {
        customer: {
          id: customer.CUST_ID,
          name: customer.CUST_NM || `${customer.FIRST_NAME} ${customer.LAST_NAME}`,
          email: statementData.customer.email,
          originalEmail: originalEmail,
          frequency: customer.STMNT_FREQ_CD,
          frequencyValue: customer.STMNT_FREQ_VALUE,
        },
        isDue: isDue,
        period: period,
        lastStatementDate: lastStatementDate,
        statement: {
          summary: statementData.summary,
          transactionCount: statementData.transactions?.length || 0,
          sampleTransactions: statementData.transactions?.slice(0, 5) || [],
          fullTransactions: statementData.transactions || [],
        },
        email: {
          sent: emailResult?.success || false,
          dryRun: dryRun,
          messageId: emailResult?.messageId || null,
          error: emailResult?.error || null,
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Process all email statements (Admin only)
 * POST /api/email-statements/process
 * Body: { dryRun, sendEmail, asOfDate, batchSize }
 */
router.post('/process', verifyToken, checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS), async (req, res) => {
  try {
    const { 
      dryRun = true, 
      sendEmail = false, 
      asOfDate = new Date(),
      batchSize = 100
    } = req.body;
    
    const date = new Date(asOfDate);
    
    const result = await processEmailStatements({
      asOfDate: date,
      dryRun: dryRun,
      batchSize: batchSize,
      sendEmail: sendEmail && !dryRun,
    });

    res.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error processing email statements:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get customer statements history
 * GET /api/email-statements/customer/:customerId/history
 * Query params: limit (default 10), offset (default 0)
 */
router.get('/customer/:customerId/history', verifyToken, checkPermission(PERMISSIONS.CUSTOMER.VIEW), async (req, res) => {
  try {
    const { customerId } = req.params;
    const limit = parseInt(req.query.limit) || 10;
    const offset = parseInt(req.query.offset) || 0;
    
    // Get count
    const [countResult] = await sequelize.query(
      `SELECT COUNT(*) as total 
       FROM customer_statements 
       WHERE customer_id = :customerId`,
      {
        replacements: { customerId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    const [history] = await sequelize.query(
      `SELECT 
        id,
        customer_id,
        customer_no,
        customer_name,
        email,
        account_number,
        statement_type,
        period_start,
        period_end,
        frequency,
        frequency_value,
        transaction_count,
        opening_balance,
        closing_balance,
        total_credits,
        total_debits,
        total_emtl,
        message_id,
        sent_at,
        status,
        error_message,
        created_at
      FROM customer_statements
      WHERE customer_id = :customerId
      ORDER BY sent_at DESC
      LIMIT :limit OFFSET :offset`,
      {
        replacements: { customerId, limit, offset },
        type: sequelize.QueryTypes.SELECT
      }
    );
    
    res.json({
      success: true,
      count: history.length,
      total: parseInt(countResult?.total || 0),
      limit: limit,
      offset: offset,
      data: history,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error getting statement history for ${req.params.customerId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Get statement statistics
 * GET /api/email-statements/stats
 * Query params: startDate, endDate
 */
router.get('/stats', verifyToken, checkPermission(PERMISSIONS.REPORT.VIEW), async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    let dateFilter = '';
    const replacements = {};
    
    if (startDate) {
      dateFilter += ' AND sent_at >= :startDate';
      replacements.startDate = new Date(startDate);
    }
    
    if (endDate) {
      dateFilter += ' AND sent_at <= :endDate';
      replacements.endDate = new Date(endDate);
    }

    const [stats] = await sequelize.query(
      `SELECT 
        COUNT(*) as total_statements,
        COUNT(DISTINCT customer_id) as unique_customers,
        SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) as sent_count,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed_count,
        AVG(transaction_count) as avg_transactions,
        SUM(total_credits) as total_credits,
        SUM(total_debits) as total_debits,
        SUM(total_emtl) as total_emtl,
        SUM(opening_balance) as total_opening_balance,
        SUM(closing_balance) as total_closing_balance
      FROM customer_statements
      WHERE 1=1 ${dateFilter}`,
      {
        replacements,
        type: sequelize.QueryTypes.SELECT
      }
    );

    // Get frequency breakdown
    const [frequencyBreakdown] = await sequelize.query(
      `SELECT 
        frequency,
        COUNT(*) as count,
        SUM(transaction_count) as total_transactions
      FROM customer_statements
      WHERE 1=1 ${dateFilter}
      GROUP BY frequency
      ORDER BY count DESC`,
      {
        replacements,
        type: sequelize.QueryTypes.SELECT
      }
    );

    // Get daily trend
    const [dailyTrend] = await sequelize.query(
      `SELECT 
        DATE(sent_at) as date,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'SENT' THEN 1 ELSE 0 END) as sent,
        SUM(CASE WHEN status = 'FAILED' THEN 1 ELSE 0 END) as failed
      FROM customer_statements
      WHERE 1=1 ${dateFilter}
      GROUP BY DATE(sent_at)
      ORDER BY date DESC
      LIMIT 30`,
      {
        replacements,
        type: sequelize.QueryTypes.SELECT
      }
    );

    res.json({
      success: true,
      data: {
        summary: stats[0] || {},
        frequencyBreakdown: frequencyBreakdown || [],
        dailyTrend: dailyTrend || [],
        filters: {
          startDate: startDate || null,
          endDate: endDate || null,
        }
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error getting statement statistics:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * Resend a failed statement
 * POST /api/email-statements/resend/:statementId
 */
router.post('/resend/:statementId', verifyToken, checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS), async (req, res) => {
  try {
    const { statementId } = req.params;
    
    // Get the failed statement
    const [statement] = await sequelize.query(
      `SELECT * FROM customer_statements WHERE id = :statementId AND status = 'FAILED'`,
      {
        replacements: { statementId },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!statement) {
      return res.status(404).json({
        success: false,
        message: 'Failed statement not found or already sent',
        timestamp: new Date().toISOString()
      });
    }

    // Get customer
    const [customer] = await sequelize.query(
      `SELECT 
        c.id,
        c.CUST_ID,
        c.CUST_NO,
        c.CUST_NM,
        c.FIRST_NAME,
        c.LAST_NAME,
        c.EMAIL_ADDRESS,
        c.PHONE_NO,
        c.STMNT_FREQ_CD,
        c.STMNT_FREQ_VALUE,
        c.ALERT_DELIVERY_METHOD,
        c.BU_ID,
        c.CREATED_BY,
        c.CREATE_DT,
        c.created_at,
        c.updated_at,
        ca.account_number,
        ca.account_name,
        ca.available_balance,
        ca.ledger_balance
      FROM customers c
      LEFT JOIN customer_accounts ca ON ca.CUST_ID = c.CUST_ID
      WHERE c.CUST_ID = :customerId
      LIMIT 1`,
      {
        replacements: { customerId: statement.customer_id },
        type: sequelize.QueryTypes.SELECT
      }
    );

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: 'Customer not found',
        timestamp: new Date().toISOString()
      });
    }

    // Regenerate period
    const period = {
      startDate: statement.period_start,
      endDate: statement.period_end,
      startDateFormatted: new Date(statement.period_start).toISOString().split('T')[0],
      endDateFormatted: new Date(statement.period_end).toISOString().split('T')[0],
      frequency: statement.frequency,
      frequencyValue: statement.frequency_value,
    };

    // Generate statement
    const statementData = await generateCustomerStatement(customer, period);
    
    if (!statementData) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate statement',
        timestamp: new Date().toISOString()
      });
    }

    // Send email
    const emailResult = await sendStatementEmail(statementData);
    
    // Update statement record
    await sequelize.query(
      `UPDATE customer_statements 
       SET status = :status,
           message_id = :messageId,
           error_message = :errorMessage,
           updated_at = NOW()
       WHERE id = :statementId`,
      {
        replacements: {
          status: emailResult.success ? 'SENT' : 'FAILED',
          messageId: emailResult.messageId || null,
          errorMessage: emailResult.error || null,
          statementId: statementId,
        },
        type: sequelize.QueryTypes.UPDATE
      }
    );

    res.json({
      success: emailResult.success,
      data: {
        statementId: statementId,
        customerId: statement.customer_id,
        email: statementData.customer.email,
        messageId: emailResult.messageId,
        error: emailResult.error,
        status: emailResult.success ? 'SENT' : 'FAILED',
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Error resending statement ${req.params.statementId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ============================================
// HELPER FUNCTION
// ============================================

/**
 * Get the last statement date for a customer
 */
async function getLastStatementDate(customerId) {
  try {
    const [result] = await sequelize.query(
      `SELECT sent_at 
       FROM customer_statements 
       WHERE customer_id = :customerId 
       AND status = 'SENT'
       ORDER BY sent_at DESC 
       LIMIT 1`,
      {
        replacements: { customerId },
        type: sequelize.QueryTypes.SELECT
      }
    );
    return result?.sent_at || null;
  } catch (error) {
    logger.error('Error getting last statement date:', error);
    return null;
  }
}

export default router;