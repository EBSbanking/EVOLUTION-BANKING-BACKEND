// src/routes/DisbursementReportRoutes.js - MySQL VERSION
import express from 'express';
import { getPool } from '../../config/db.js'; // MySQL connection pool

const router = express.Router();

// Helper function to safely convert values to number
const toNumber = (value) => {
  if (!value && value !== 0) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  return 0;
};

// Helper function to build date range query
const buildDateRangeQuery = (startDate, endDate, field = 'createdAt') => {
  if (!startDate && !endDate) return '';
  
  let query = '';
  if (startDate) {
    query += `AND ${field} >= '${new Date(startDate).toISOString().slice(0, 19).replace('T', ' ')}' `;
  }
  if (endDate) {
    query += `AND ${field} <= '${new Date(endDate).toISOString().slice(0, 19).replace('T', ' ')}' `;
  }
  
  return query;
};

// Get all loan disbursements
router.get('/disbursements', async (req, res) => {
  const pool = getPool();
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    const {
      page = 1,
      limit = 10,
      status,
      startDate,
      endDate,
      search,
      branchId,
      productId,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Build WHERE clause
    let whereClause = 'WHERE 1=1 ';
    const params = [];

    if (status && status !== 'ALL') {
      whereClause += 'AND STATUS = ? ';
      params.push(status);
    }

    // Date range filter
    const dateRangeQuery = buildDateRangeQuery(startDate, endDate);
    whereClause += dateRangeQuery;

    // Filter by branch
    if (branchId) {
      whereClause += 'AND BU_ID = ? ';
      params.push(branchId);
    }

    // Filter by product
    if (productId) {
      whereClause += 'AND PROD_ID = ? ';
      params.push(productId);
    }

    // Search functionality
    if (search) {
      whereClause += `AND (
        ACCT_NO LIKE ? OR 
        ACCT_NM LIKE ? OR 
        CUST_ID LIKE ? OR 
        APPL_ID LIKE ? OR 
        Borrower_street LIKE ? OR 
        Borrower_city LIKE ?
      ) `;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    // Count total records
    const [countResult] = await connection.query(
      `SELECT COUNT(*) as total FROM LoanDisbursement ${whereClause}`,
      params
    );
    const total = countResult[0].total;

    // Build ORDER BY clause
    const orderByClause = `ORDER BY ${sortBy} ${sortOrder.toUpperCase()} `;

    // Fetch disbursements with pagination
    const [disbursements] = await connection.query(
      `SELECT * FROM LoanDisbursement ${whereClause} ${orderByClause} LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    // Format decimal values
    const formattedDisbursements = disbursements.map(disb => ({
      ...disb,
      AMOUNT: toNumber(disb.AMOUNT),
      INTEREST_RATE: toNumber(disb.INTEREST_RATE),
      EMI_AMOUNT: toNumber(disb.EMI_AMOUNT),
      TOTAL_INTEREST: toNumber(disb.TOTAL_INTEREST),
      TOTAL_REPAYMENT: toNumber(disb.TOTAL_REPAYMENT),
      NET_DISBURSEMENT_AMOUNT: toNumber(disb.NET_DISBURSEMENT_AMOUNT),
      FEES_AMOUNT: toNumber(disb.FEES_AMOUNT),
      UPFRONT_INTEREST_AMOUNT: toNumber(disb.UPFRONT_INTEREST_AMOUNT)
    }));

    // Calculate summary statistics
    const [summaryResult] = await connection.query(
      `SELECT 
        SUM(AMOUNT) as totalAmount,
        COUNT(*) as totalDisbursements,
        AVG(AMOUNT) as avgLoanAmount,
        SUM(TOTAL_INTEREST) as totalInterest,
        SUM(NET_DISBURSEMENT_AMOUNT) as totalNetDisbursement
       FROM LoanDisbursement ${whereClause}`,
      params
    );

    // Status distribution
    const [statusDistribution] = await connection.query(
      `SELECT 
        STATUS as _id,
        COUNT(*) as count,
        SUM(AMOUNT) as amount
       FROM LoanDisbursement ${whereClause}
       GROUP BY STATUS`,
      params
    );

    // Product-wise distribution
    const [productDistribution] = await connection.query(
      `SELECT 
        PROD_ID as _id,
        COUNT(*) as count,
        SUM(AMOUNT) as amount
       FROM LoanDisbursement ${whereClause}
       GROUP BY PROD_ID`,
      params
    );

    res.status(200).json({
      success: true,
      data: {
        disbursements: formattedDisbursements,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(total / parseInt(limit))
        },
        summary: summaryResult[0] || {
          totalAmount: 0,
          totalDisbursements: 0,
          avgLoanAmount: 0,
          totalInterest: 0,
          totalNetDisbursement: 0
        },
        analytics: {
          statusDistribution,
          productDistribution
        }
      }
    });

  } catch (error) {
    console.error('Error fetching loan disbursements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch loan disbursements',
      error: error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

// Get single loan disbursement by ID
router.get('/disbursements/:id', async (req, res) => {
  const pool = getPool();
  let connection;
  
  try {
    connection = await pool.getConnection();
    const { id } = req.params;

    // Get disbursement
    const [disbursementRows] = await connection.query(
      'SELECT * FROM LoanDisbursement WHERE id = ?',
      [id]
    );

    if (disbursementRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Loan disbursement not found'
      });
    }

    const disbursement = disbursementRows[0];

    // Format Decimal values
    const formattedDisbursement = {
      ...disbursement,
      AMOUNT: toNumber(disbursement.AMOUNT),
      INTEREST_RATE: toNumber(disbursement.INTEREST_RATE),
      EMI_AMOUNT: toNumber(disbursement.EMI_AMOUNT),
      TOTAL_INTEREST: toNumber(disbursement.TOTAL_INTEREST),
      TOTAL_REPAYMENT: toNumber(disbursement.TOTAL_REPAYMENT),
      NET_DISBURSEMENT_AMOUNT: toNumber(disbursement.NET_DISBURSEMENT_AMOUNT),
      FEES_AMOUNT: toNumber(disbursement.FEES_AMOUNT),
      UPFRONT_INTEREST_AMOUNT: toNumber(disbursement.UPFRONT_INTEREST_AMOUNT)
    };

    // Get related data
    const [customerRows] = await connection.query(
      'SELECT * FROM Customer WHERE CUST_ID = ?',
      [disbursement.CUST_ID]
    );

    const [guarantorRows] = await connection.query(
      'SELECT * FROM Guarantor WHERE id = ?',
      [disbursement.GUARANTOR_ID]
    );

    const [repaymentRows] = await connection.query(
      'SELECT * FROM RepaymentSchedule WHERE id = ?',
      [disbursement.REPAYMENT_SCHEDULE_ID]
    );

    const customer = customerRows[0] || null;
    const guarantorDetails = guarantorRows[0] || null;
    const repaymentSchedule = repaymentRows[0] || null;

    // Format repayment schedule if exists
    const formattedRepaymentSchedule = repaymentSchedule ? {
      ...repaymentSchedule,
      PRINCIPAL_AMOUNT: toNumber(repaymentSchedule.PRINCIPAL_AMOUNT),
      INTEREST_RATE: toNumber(repaymentSchedule.INTEREST_RATE),
      EMI_AMOUNT: toNumber(repaymentSchedule.EMI_AMOUNT),
      TOTAL_INTEREST: toNumber(repaymentSchedule.TOTAL_INTEREST),
      TOTAL_REPAYMENT: toNumber(repaymentSchedule.TOTAL_REPAYMENT)
    } : null;

    res.status(200).json({
      success: true,
      data: {
        disbursement: formattedDisbursement,
        customer,
        guarantorDetails,
        repaymentSchedule: formattedRepaymentSchedule
      }
    });

  } catch (error) {
    console.error('Error fetching loan disbursement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch loan disbursement',
      error: error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

// Get disbursement statistics
router.get('/disbursements/statistics', async (req, res) => {
  const pool = getPool();
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    const { startDate, endDate, branchId } = req.query;

    // Build WHERE clause
    let whereClause = 'WHERE 1=1 ';
    const params = [];

    // Date range filter
    const dateRangeQuery = buildDateRangeQuery(startDate, endDate);
    whereClause += dateRangeQuery;

    // Branch filter
    if (branchId) {
      whereClause += 'AND BU_ID = ? ';
      params.push(branchId);
    }

    // Execute multiple queries for statistics
    const [dailyStats] = await connection.query(`
      SELECT 
        DATE(createdAt) as _id,
        COUNT(*) as count,
        SUM(AMOUNT) as amount
      FROM LoanDisbursement 
      WHERE createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      ${whereClause}
      GROUP BY DATE(createdAt)
      ORDER BY _id ASC
    `, params);

    const [monthlyStats] = await connection.query(`
      SELECT 
        DATE_FORMAT(createdAt, '%Y-%m') as _id,
        COUNT(*) as count,
        SUM(AMOUNT) as amount
      FROM LoanDisbursement 
      ${whereClause}
      GROUP BY DATE_FORMAT(createdAt, '%Y-%m')
      ORDER BY _id ASC
    `, params);

    const [statusSummary] = await connection.query(`
      SELECT 
        STATUS as _id,
        COUNT(*) as count,
        SUM(AMOUNT) as amount
      FROM LoanDisbursement 
      ${whereClause}
      GROUP BY STATUS
    `, params);

    const [productSummary] = await connection.query(`
      SELECT 
        PROD_ID as _id,
        COUNT(*) as count,
        SUM(AMOUNT) as amount
      FROM LoanDisbursement 
      ${whereClause}
      GROUP BY PROD_ID
      ORDER BY amount DESC
    `, params);

    const [branchSummary] = await connection.query(`
      SELECT 
        BU_ID as _id,
        COUNT(*) as count,
        SUM(AMOUNT) as amount
      FROM LoanDisbursement 
      ${whereClause}
      GROUP BY BU_ID
      ORDER BY amount DESC
    `, params);

    const [overallSummary] = await connection.query(`
      SELECT 
        COUNT(*) as totalDisbursements,
        SUM(AMOUNT) as totalAmount,
        SUM(TOTAL_INTEREST) as totalInterest,
        SUM(NET_DISBURSEMENT_AMOUNT) as totalNetDisbursed,
        AVG(AMOUNT) as avgLoanAmount,
        AVG(INTEREST_RATE) as avgInterestRate
      FROM LoanDisbursement 
      ${whereClause}
    `, params);

    res.status(200).json({
      success: true,
      data: {
        dailyStats,
        monthlyStats,
        statusSummary,
        productSummary,
        branchSummary,
        overallSummary: overallSummary[0] || {}
      }
    });

  } catch (error) {
    console.error('Error fetching disbursement statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch disbursement statistics',
      error: error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

// Export disbursements to CSV/Excel
router.get('/disbursements/export', async (req, res) => {
  const pool = getPool();
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    const { format = 'csv', ...filters } = req.query;

    // Build WHERE clause from filters
    let whereClause = 'WHERE 1=1 ';
    const params = [];
    
    if (filters.status && filters.status !== 'ALL') {
      whereClause += 'AND STATUS = ? ';
      params.push(filters.status);
    }
    
    // Date range filter
    const dateRangeQuery = buildDateRangeQuery(filters.startDate, filters.endDate);
    whereClause += dateRangeQuery;
    
    if (filters.branchId) {
      whereClause += 'AND BU_ID = ? ';
      params.push(filters.branchId);
    }
    
    if (filters.productId) {
      whereClause += 'AND PROD_ID = ? ';
      params.push(filters.productId);
    }

    // Fetch disbursements
    const [disbursements] = await connection.query(
      `SELECT * FROM LoanDisbursement ${whereClause} ORDER BY createdAt DESC`,
      params
    );

    // Transform data for export
    const exportData = disbursements.map(disb => ({
      'Disbursement ID': disb.id,
      'Account Number': disb.ACCT_NO,
      'Account Name': disb.ACCT_NM,
      'Customer ID': disb.CUST_ID,
      'Application ID': disb.APPL_ID,
      'Loan Amount': toNumber(disb.AMOUNT),
      'Interest Rate (%)': toNumber(disb.INTEREST_RATE),
      'Total Interest': toNumber(disb.TOTAL_INTEREST),
      'Total Repayment': toNumber(disb.TOTAL_REPAYMENT),
      'EMI Amount': toNumber(disb.EMI_AMOUNT),
      'Term Value': disb.TERM_VALUE,
      'Term Code': disb.TERM_CD,
      'Product ID': disb.PROD_ID,
      'Product Type': disb.PRODUCT_TYPE,
      'Branch ID': disb.BU_ID,
      'Status': disb.STATUS,
      'Disbursement Date': disb.DISBURSEMENT_DATE,
      'Created At': disb.createdAt,
      'Created By': disb.CREATED_BY,
      'Repayment Source Account': disb.REPAY_SRC_ACCT_NO,
      'Primary Officer': disb.PRIMARY_OFFICER_ID,
      'Transaction ID': disb.TRANSACTION_ID,
      'Currency': disb.CRNCY_ID,
      'Calculation Method': disb.CALCULATION_METHOD,
      'Payment Frequency': disb.PAYMENT_FREQUENCY,
      'Start Date': disb.START_DT,
      'Maturity Date': disb.MATURITY_DT,
      'Net Disbursement': toNumber(disb.NET_DISBURSEMENT_AMOUNT),
      'Borrower Address': `${disb.Borrower_street || ''}, ${disb.Borrower_city || ''}, ${disb.Borrower_state || ''}`
    }));

    if (format === 'csv') {
      // Convert to CSV
      if (exportData.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No data to export'
        });
      }

      const headers = Object.keys(exportData[0] || {});
      const csv = [
        headers.join(','),
        ...exportData.map(row => 
          headers.map(header => {
            const value = row[header];
            if (value === null || value === undefined) return '';
            if (typeof value === 'string') return `"${value.replace(/"/g, '""')}"`;
            if (value instanceof Date) return value.toISOString();
            return String(value);
          }).join(',')
        )
      ].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=loan_disbursements_${Date.now()}.csv`);
      return res.send(csv);
    } else {
      // For Excel, you would use a library like exceljs
      res.status(200).json({
        success: true,
        data: exportData,
        format: 'json'
      });
    }

  } catch (error) {
    console.error('Error exporting disbursements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to export disbursements',
      error: error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

// Update disbursement status
router.put('/disbursements/:id/status', async (req, res) => {
  const pool = getPool();
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    const { id } = req.params;
    const { status, notes, updatedBy } = req.body;

    const validStatuses = ['PENDING', 'APPROVED', 'DISBURSED', 'REJECTED', 'CANCELLED'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status value'
      });
    }

    // Check if disbursement exists
    const [existingRows] = await connection.query(
      'SELECT * FROM LoanDisbursement WHERE id = ?',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Loan disbursement not found'
      });
    }

    const disbursement = existingRows[0];

    // Update disbursement status
    const [updateResult] = await connection.query(
      `UPDATE LoanDisbursement 
       SET STATUS = ?, updatedAt = NOW() 
       WHERE id = ?`,
      [status, id]
    );

    // Add to status history if table exists
    try {
      await connection.query(
        `INSERT INTO StatusHistory 
         (record_id, status, changed_by, changed_at, notes, module) 
         VALUES (?, ?, ?, NOW(), ?, 'LoanDisbursement')`,
        [id, status, updatedBy || 'SYSTEM', notes || '']
      );
    } catch (error) {
      console.log('StatusHistory table might not exist:', error.message);
    }

    // If status is DISBURSED, update related LoanAccount
    if (status === 'DISBURSED' && disbursement.LOAN_ACCOUNT_ID) {
      await connection.query(
        `UPDATE LoanAccount 
         SET LOAN_STATUS = 'ACTIVE', 
             DISBURSEMENT_DATE = NOW(), 
             DISBURSED_AMOUNT = ? 
         WHERE id = ?`,
        [disbursement.AMOUNT, disbursement.LOAN_ACCOUNT_ID]
      );
    }

    res.status(200).json({
      success: true,
      message: 'Disbursement status updated successfully',
      data: { id, status, updatedAt: new Date() }
    });

  } catch (error) {
    console.error('Error updating disbursement status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update disbursement status',
      error: error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

// Get disbursement dashboard data
router.get('/dashboard', async (req, res) => {
  const pool = getPool();
  let connection;
  
  try {
    connection = await pool.getConnection();
    
    const { branchId } = req.query;
    const whereClause = branchId ? 'WHERE BU_ID = ? ' : 'WHERE 1=1 ';
    const params = branchId ? [branchId] : [];

    // Execute multiple queries for dashboard data
    const [todayStats] = await connection.query(`
      SELECT 
        COUNT(*) as count,
        SUM(AMOUNT) as amount
      FROM LoanDisbursement 
      ${whereClause}
      AND DATE(createdAt) = CURDATE()
    `, params);

    const [monthlyTrend] = await connection.query(`
      SELECT 
        DATE(createdAt) as _id,
        COUNT(*) as count,
        SUM(AMOUNT) as amount
      FROM LoanDisbursement 
      ${whereClause}
      AND createdAt >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY DATE(createdAt)
      ORDER BY _id ASC
      LIMIT 30
    `, params);

    const [statusDistribution] = await connection.query(`
      SELECT 
        STATUS as _id,
        COUNT(*) as count,
        SUM(AMOUNT) as amount
      FROM LoanDisbursement 
      ${whereClause}
      GROUP BY STATUS
    `, params);

    const [topProducts] = await connection.query(`
      SELECT 
        PROD_ID as _id,
        COUNT(*) as count,
        SUM(AMOUNT) as amount
      FROM LoanDisbursement 
      ${whereClause}
      GROUP BY PROD_ID
      ORDER BY amount DESC
      LIMIT 5
    `, params);

    const [recentDisbursements] = await connection.query(`
      SELECT * FROM LoanDisbursement 
      ${whereClause}
      ORDER BY createdAt DESC 
      LIMIT 10
    `, params);

    // Format recent disbursements
    const formattedRecentDisbursements = recentDisbursements.map(disb => ({
      ...disb,
      AMOUNT: toNumber(disb.AMOUNT),
      INTEREST_RATE: toNumber(disb.INTEREST_RATE),
      EMI_AMOUNT: toNumber(disb.EMI_AMOUNT)
    }));

    res.status(200).json({
      success: true,
      data: {
        today: todayStats[0] || { count: 0, amount: 0 },
        monthlyTrend,
        statusDistribution,
        topProducts,
        recentDisbursements: formattedRecentDisbursements
      }
    });

  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch dashboard data',
      error: error.message
    });
  } finally {
    if (connection) connection.release();
  }
});

export default router;