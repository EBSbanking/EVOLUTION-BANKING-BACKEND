import express from 'express';
import LoanAccountController from '../controllers/LoanAccountController.js';
import { generateLoanAccountNumberByProdId } from '../utils/generateLoanAccountId.js';
import { 
  applyLoanWithGuarantorWorkflow,
  getLoanApplicationDetails,
  approveLoanWithGuarantor,
  verifyGuarantor,
  getLoanRiskAssessment
} from '../controllers/LoanGuarantorController.js';
import LoanAccount from '../models/LoanAccount.js';

// IMPORT AUTHENTICATION MIDDLEWARE
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Middleware for validating loan rejection requests
const validateLoanRejection = (req, res, next) => {
  const requiredFields = ['workItemId', 'rejectedBy', 'APPL_ID', 'CUST_ID'];
  const missingFields = requiredFields.filter(field => !req.body[field]);

  if (missingFields.length) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missingFields.join(', ')}`,
      code: 'MISSING_FIELDS'
    });
  }

  next();
};

// Middleware for validating loan disbursement requests
const validateLoanDisbursement = (req, res, next) => {
  const requiredFields = ['APPL_ID', 'CUST_ID', 'ACCT_NO', 'fundingAcctNo', 'AMOUNT', 'PROD_ID'];
  const missingFields = requiredFields.filter(field => !req.body[field]);

  if (missingFields.length) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missingFields.join(', ')}`,
      code: 'MISSING_FIELDS'
    });
  }

  if (!req.body.MATURITY_DT && (!req.body.TERM_VALUE || !req.body.TERM_CD)) {
    return res.status(400).json({
      success: false,
      message: 'Either MATURITY_DT or both TERM_VALUE and TERM_CD must be provided',
      code: 'INVALID_TERM'
    });
  }

  next();
};

// Middleware for validating loan repayment requests
const validateLoanRepayment = (req, res, next) => {
  const requiredFields = ['ACCT_NO', 'REPAYMENT_AMOUNT'];
  const missingFields = requiredFields.filter(field => !req.body[field]);

  if (missingFields.length) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missingFields.join(', ')}`,
      code: 'MISSING_FIELDS'
    });
  }

  const { REPAYMENT_AMOUNT, REPAYMENT_DATE } = req.body;

  if (REPAYMENT_AMOUNT <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Repayment amount must be positive',
      code: 'INVALID_AMOUNT'
    });
  }

  if (REPAYMENT_DATE) {
    const repaymentDate = new Date(REPAYMENT_DATE);
    if (isNaN(repaymentDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid repayment date format',
        code: 'INVALID_DATE'
      });
    }
  }

  next();
};

// =========================
// CORE LOAN OPERATIONS (WITH AUTHENTICATION)
// =========================
router.post('/apply', authenticate, LoanAccountController.applyForLoan);
router.post('/apply-with-guarantor', authenticate, applyLoanWithGuarantorWorkflow);

// =========================
// ACCOUNT NUMBER GENERATION (WITH AUTHENTICATION)
// =========================
router.get('/generate-loan-account/:prodId', authenticate, async (req, res) => {
  try {
    const prodId = req.params.prodId;
    const accountNumber = await generateLoanAccountNumberByProdId(prodId);
    res.status(200).json({ success: true, accountNumber });
  } catch (err) {
    console.error('Error generating loan account number:', err);
    res.status(500).json({
      success: false,
      message: err.message || 'Failed to generate loan account number',
      code: 'ACCOUNT_GENERATION_ERROR'
    });
  }
});

// =========================
// APPROVAL WORKFLOW (WITH AUTHENTICATION)
// =========================
router.post('/approve', authenticate, LoanAccountController.approveLoanApplication);
router.post('/reject', authenticate, validateLoanRejection, LoanAccountController.rejectLoanApplication);
router.post('/approve-with-guarantor', authenticate, approveLoanWithGuarantor);

// =========================
// DISBURSEMENT ROUTES (WITH AUTHENTICATION)
// =========================
router.post('/disburse', authenticate, validateLoanDisbursement, LoanAccountController.disburseLoan);
router.post('/reject-disbursement', authenticate, LoanAccountController.rejectLoanDisbursement);
router.post('/approve-disbursement', authenticate, LoanAccountController.approveLoanDisbursement);

// =========================
// REPAYMENT ROUTES (WITH AUTHENTICATION)
// =========================
// Only add repayLoan route if it exists in the controller
if (LoanAccountController.repayLoan) {
  router.post('/repay', authenticate, validateLoanRepayment, LoanAccountController.repayLoan);
  router.post('/repay-legacy', authenticate, validateLoanRepayment, (req, res) => {
    req.body.IS_LEGACY_LOAN = true;
    LoanAccountController.repayLoan(req, res);
  });
} else {
  console.warn('repayLoan method not found in LoanAccountController - repayment routes disabled');
}

// =========================
// LOAN INFORMATION (WITH AUTHENTICATION) - ONLY EXISTING ROUTES
// =========================
router.get('/:ACCT_NO', authenticate, LoanAccountController.getLoanAccountByAcctNo);
router.get('/loan-account/:ACCT_NO', authenticate, LoanAccountController.getLoanAccountByAcctNo);
router.get('/by-customer/:custId', authenticate, LoanAccountController.getLoanAccountsByCustomerId);
router.get('/interest/:ACCT_NO', authenticate, LoanAccountController.getLoanInterestDetails);
router.get('/applications/:loanId', authenticate, getLoanApplicationDetails);
router.get('/applications/:loanId/risk-assessment', authenticate, getLoanRiskAssessment);

// =========================
// GUARANTOR ROUTES (WITH AUTHENTICATION)
// =========================
router.post('/guarantors/:guarantorId/verification', authenticate, verifyGuarantor);
router.get('/guarantors/:guarantorId', authenticate, getLoanApplicationDetails);

// =========================
// LOAN MANAGEMENT ROUTES (WITH AUTHENTICATION)
// =========================

/**
 * @route GET /api/loans
 * @description Get all loans with filtering and pagination
 * @query {string} [status] - Filter by status
 * @query {string} [branch] - Filter by branch
 * @query {string} [product] - Filter by product
 * @query {number} [page=1] - Page number
 * @query {number} [limit=20] - Items per page
 */
router.get('/', authenticate, LoanAccountController.getAllLoans);

/**
 * @route POST /api/loans
 * @description Create a new loan account
 * @body {Object} loanData - Loan account data
 */
router.post('/', authenticate, LoanAccountController.createLoanAccount);

/**
 * @route PUT /api/loans/:ACCT_NO
 * @description Update loan account
 * @param {string} ACCT_NO - Loan account number
 * @body {Object} updateData - Fields to update
 */
router.put('/:ACCT_NO', authenticate, LoanAccountController.updateLoanAccount);

/**
 * @route DELETE /api/loans/:ACCT_NO
 * @description Soft delete loan account
 * @param {string} ACCT_NO - Loan account number
 */
router.delete('/:ACCT_NO', authenticate, LoanAccountController.deleteLoanAccount);

/**
 * @route GET /api/loans/search
 * @description Search loans by various criteria
 * @query {string} [accountNumber] - Search by account number
 * @query {string} [customerName] - Search by customer name
 * @query {string} [customerId] - Search by customer ID
 * @query {string} [phone] - Search by phone number
 */
router.get('/search', authenticate, LoanAccountController.searchLoans);

/**
 * @route GET /api/loans/:ACCT_NO/repayment-schedule
 * @description Get repayment schedule for loan
 * @param {string} ACCT_NO - Loan account number
 */
router.get('/:ACCT_NO/repayment-schedule', authenticate, LoanAccountController.getRepaymentSchedule);

/**
 * @route GET /api/loans/:ACCT_NO/transactions
 * @description Get transaction history for loan
 * @param {string} ACCT_NO - Loan account number
 * @query {number} [page=1] - Page number
 * @query {number} [limit=50] - Items per page
 */
router.get('/:ACCT_NO/transactions', authenticate, LoanAccountController.getLoanTransactions);

/**
 * @route POST /api/loans/:ACCT_NO/disburse
 * @description Disburse loan amount
 * @param {string} ACCT_NO - Loan account number
 * @body {Object} disburseData - Disbursement details
 */
router.post('/:ACCT_NO/disburse', authenticate, LoanAccountController.disburseLoan);

/**
 * @route POST /api/loans/:ACCT_NO/repayments
 * @description Record loan repayment
 * @param {string} ACCT_NO - Loan account number
 * @body {Object} repaymentData - Repayment details
 */
router.post('/:ACCT_NO/repayments', authenticate, LoanAccountController.recordRepayment);

// =========================
// COMPREHENSIVE LOAN REPORTS ROUTES (WITH AUTHENTICATION)
// =========================

/**
 * @route GET /api/loans/reports/summary
 * @description Get comprehensive loan portfolio summary
 * @query {string} [branch] - Filter by branch ID
 * @query {string} [product] - Filter by product ID
 * @query {string} [status] - Filter by loan status
 * @query {string} [startDate] - Start date filter (YYYY-MM-DD)
 * @query {string} [endDate] - End date filter (YYYY-MM-DD)
 */
router.get('/reports/summary', authenticate, LoanAccountController.getLoanSummaryReport);

/**
 * @route GET /api/loans/reports/detailed
 * @description Get detailed loan report with pagination
 * @query {string} [branch] - Filter by branch ID
 * @query {string} [product] - Filter by product ID
 * @query {string} [status] - Filter by loan status
 * @query {string} [startDate] - Start date filter
 * @query {string} [endDate] - End date filter
 * @query {number} [page=1] - Page number
 * @query {number} [limit=50] - Items per page
 */
router.get('/reports/detailed', authenticate, LoanAccountController.getDetailedLoanReport);

/**
 * @route GET /api/loans/reports/branch-wise
 * @description Get branch-wise loan statistics
 * @query {string} [startDate] - Start date filter
 * @query {string} [endDate] - End date filter
 */
router.get('/reports/branch-wise', authenticate, LoanAccountController.getBranchWiseLoanReport);

/**
 * @route GET /api/loans/reports/product-wise
 * @description Get product-wise loan statistics
 * @query {string} [startDate] - Start date filter
 * @query {string} [endDate] - End date filter
 */
router.get('/reports/product-wise', authenticate, LoanAccountController.getProductWiseLoanReport);

/**
 * @route GET /api/loans/reports/status-wise
 * @description Get status-wise loan statistics
 * @query {string} [startDate] - Start date filter
 * @query {string} [endDate] - End date filter
 */
router.get('/reports/status-wise', authenticate, LoanAccountController.getStatusWiseLoanReport);

/**
 * @route GET /api/loans/reports/balance-analysis
 * @description Get loan balance analysis by ranges
 * @query {string} [branch] - Filter by branch ID
 * @query {string} [product] - Filter by product ID
 */
router.get('/reports/balance-analysis', authenticate, LoanAccountController.getLoanBalanceAnalysisReport);

/**
 * @route GET /api/loans/reports/disbursement-analysis
 * @description Get disbursement analysis report
 * @query {string} [branch] - Filter by branch ID
 * @query {string} [product] - Filter by product ID
 * @query {number} [months=12] - Number of months to analyze
 */
router.get('/reports/disbursement-analysis', authenticate, LoanAccountController.getDisbursementAnalysisReport);

/**
 * @route GET /api/loans/reports/repayment-analysis
 * @description Get repayment analysis report
 * @query {string} [branch] - Filter by branch ID
 * @query {string} [product] - Filter by product ID
 * @query {number} [months=6] - Number of months to analyze
 */
router.get('/reports/repayment-analysis', authenticate, LoanAccountController.getRepaymentAnalysisReport);

// =========================
// CUSTOMER LOAN INFORMATION ROUTES
// =========================

/**
 * @route GET /api/loans/customer/:CUST_ID/balances
 * @description Get loan balances for a specific customer
 * @param {string} CUST_ID - Customer ID
 */
router.get('/customer/:CUST_ID/balances', authenticate, LoanAccountController.getLoanBalanceForCustomer);

/**
 * @route GET /api/loans/customer/:CUST_ID/details
 * @description Get detailed loan information for a specific customer
 * @param {string} CUST_ID - Customer ID
 */
router.get('/customer/:CUST_ID/details', authenticate, LoanAccountController.getLoanDetailsForCustomer);

// =========================
// LEGACY REPORT ROUTES (FOR BACKWARD COMPATIBILITY)
// =========================

/**
 * @route GET /api/loans/loan-reports
 * @description Legacy comprehensive loan reports endpoint
 * @query {string} [reportType=summary] - Type of report
 * @query {string} [startDate] - Start date
 * @query {string} [endDate] - End date
 * @query {string} [branch] - Branch filter
 * @query {string} [productType] - Product type filter
 * @query {string} [loanStatus=Active] - Loan status filter
 * @query {number} [page=1] - Page number
 * @query {number} [limit=50] - Items per page
 */
router.get('/loan-reports', authenticate, async (req, res) => {
  try {
    const { 
      reportType = 'summary', 
      startDate, 
      endDate, 
      branch, 
      productType,
      loanStatus = 'Active',
      page = 1,
      limit = 50
    } = req.query;

    console.log('📊 Generating Loan Reports with params:', {
      reportType, startDate, endDate, branch, productType, loanStatus, page, limit
    });

    // Build base query for loan accounts
    let baseQuery = {};

    // Add status filter - map frontend status to your database status
    if (loanStatus && loanStatus !== 'all') {
      const statusMap = {
        'Active': 'ACTIVE',
        'Pending': 'PENDING', 
        'Approved': 'APPROVED',
        'Closed': 'CLOSED',
        'Paid': 'PAID'
      };
      baseQuery.LOAN_STATUS = statusMap[loanStatus] || loanStatus;
    }

    // Add branch filter
    if (branch) {
      baseQuery.BU_ID = String(branch).padStart(3, '0');
    }

    // Add product type filter
    if (productType && productType !== 'all') {
      baseQuery.PROD_ID = parseInt(productType);
    }

    // Add date range filter
    let dateFilter = {};
    if (startDate) {
      dateFilter.$gte = new Date(startDate);
    }
    if (endDate) {
      dateFilter.$lte = new Date(endDate);
    }
    if (startDate || endDate) {
      baseQuery.applicationDate = dateFilter;
    }

    console.log('🔍 Final query for loan reports:', JSON.stringify(baseQuery, null, 2));

    // Execute query based on report type
    switch (reportType) {
      case 'summary':
        return await LoanAccountController.getLoanSummaryReport({ query: baseQuery }, res);
      
      case 'detailed':
        return await LoanAccountController.getDetailedLoanReport({ 
          query: { ...req.query, ...baseQuery } 
        }, res);
      
      case 'branch-wise':
        return await LoanAccountController.getBranchWiseLoanReport({ query: baseQuery }, res);
      
      case 'product-wise':
        return await LoanAccountController.getProductWiseLoanReport({ query: baseQuery }, res);
      
      case 'status-wise':
        return await LoanAccountController.getStatusWiseLoanReport({ query: baseQuery }, res);
      
      case 'balance-analysis':
        return await LoanAccountController.getLoanBalanceAnalysisReport({ query: baseQuery }, res);
      
      default:
        return await LoanAccountController.getLoanSummaryReport({ query: baseQuery }, res);
    }
  } catch (error) {
    console.error('❌ Error generating loan reports:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating loan reports',
      error: error.message
    });
  }
});

// Additional endpoint for real-time loan dashboard metrics
router.get('/loan-dashboard-metrics', authenticate, async (req, res) => {
  try {
    const today = new Date();
    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Parallel execution for better performance
    const [
      totalLoans,
      activeLoans,
      totalDisbursed,
      totalOutstanding,
      newLoansThisMonth,
      branchStats,
      productStats
    ] = await Promise.all([
      // Total loans
      LoanAccount.countDocuments({}),
      
      // Active loans
      LoanAccount.countDocuments({ LOAN_STATUS: 'ACTIVE' }),
      
      // Total disbursed amount
      LoanAccount.aggregate([
        { $match: { DISBURSED_AMOUNT: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            total: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } }
          }
        }
      ]),
      
      // Total outstanding principal
      LoanAccount.aggregate([
        { $match: { OUTSTANDING_PRINCIPAL: { $gt: 0 } } },
        {
          $group: {
            _id: null,
            total: { $sum: { $toDouble: "$OUTSTANDING_PRINCIPAL" } }
          }
        }
      ]),
      
      // New loans this month
      LoanAccount.countDocuments({
        $or: [
          { START_DT: { $gte: thirtyDaysAgo } },
          { disbursementDate: { $gte: thirtyDaysAgo } }
        ]
      }),
      
      // Branch distribution
      LoanAccount.aggregate([
        {
          $group: {
            _id: {
              $ifNull: ["$branch", "$BU_ID"]
            },
            count: { $sum: 1 },
            totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } }
          }
        },
        { $sort: { totalDisbursed: -1 } },
        { $limit: 5 }
      ]),
      
      // Product distribution
      LoanAccount.aggregate([
        {
          $group: {
            _id: "$PROD_ID",
            count: { $sum: 1 },
            totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } }
          }
        },
        { $sort: { totalDisbursed: -1 } },
        { $limit: 5 }
      ])
    ]);

    const totalDisbursedValue = totalDisbursed[0]?.total || 0;
    const totalOutstandingValue = totalOutstanding[0]?.total || 0;

    return res.json({
      success: true,
      generatedAt: new Date(),
      metrics: {
        totalLoans,
        activeLoans,
        totalDisbursed: Math.round(totalDisbursedValue * 100) / 100,
        totalOutstanding: Math.round(totalOutstandingValue * 100) / 100,
        newLoansLast30Days: newLoansThisMonth,
        portfolioHealth: totalDisbursedValue > 0 ? 
          Math.round(((totalDisbursedValue - totalOutstandingValue) / totalDisbursedValue) * 100) : 0,
        averageLoanSize: totalLoans > 0 ? Math.round(totalDisbursedValue / totalLoans) : 0
      },
      distributions: {
        topBranches: branchStats.map(branch => ({
          branchId: branch._id,
          loanCount: branch.count,
          totalDisbursed: Math.round(branch.totalDisbursed * 100) / 100
        })),
        topProducts: productStats.map(product => ({
          productCode: product._id,
          loanCount: product.count,
          totalDisbursed: Math.round(product.totalDisbursed * 100) / 100
        }))
      },
      charts: {
        statusDistribution: {
          active: activeLoans,
          pending: await LoanAccount.countDocuments({ LOAN_STATUS: 'PENDING' }),
          approved: await LoanAccount.countDocuments({ LOAN_STATUS: 'APPROVED' }),
          closed: await LoanAccount.countDocuments({ LOAN_STATUS: { $in: ['CLOSED', 'PAID', 'SETTLED'] } })
        }
      }
    });
  } catch (error) {
    console.error('❌ Loan dashboard metrics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching loan dashboard metrics',
      error: error.message
    });
  }
});

// Portfolio Quality Report
router.get('/loan-portfolio-quality', authenticate, async (req, res) => {
  try {
    const { daysPastDue = 30 } = req.query;

    // Calculate portfolio quality metrics
    const portfolioMetrics = await LoanAccount.aggregate([
      {
        $facet: {
          // Current loans (0-30 days past due)
          current: [
            { $match: { LOAN_STATUS: 'ACTIVE' } },
            { $count: "count" }
          ],
          // Delinquent loans (31-90 days past due)
          delinquent: [
            { 
              $match: { 
                LOAN_STATUS: 'ACTIVE',
                // Add your delinquency logic here based on repayment schedule
              } 
            },
            { $count: "count" }
          ],
          // Non-performing loans (>90 days past due)
          nonPerforming: [
            { 
              $match: { 
                LOAN_STATUS: 'ACTIVE',
                // Add your NPL logic here
              } 
            },
            { $count: "count" }
          ],
          // Total portfolio
          totalPortfolio: [
            { $match: { LOAN_STATUS: 'ACTIVE' } },
            {
              $group: {
                _id: null,
                totalOutstanding: { $sum: { $toDouble: "$OUTSTANDING_PRINCIPAL" } },
                totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } },
                loanCount: { $sum: 1 }
              }
            }
          ]
        }
      }
    ]);

    const metrics = portfolioMetrics[0];
    const totalPortfolio = metrics.totalPortfolio[0] || { totalOutstanding: 0, totalDisbursed: 0, loanCount: 0 };

    return res.json({
      success: true,
      generatedAt: new Date(),
      data: {
        portfolioSummary: {
          totalOutstanding: Math.round(totalPortfolio.totalOutstanding * 100) / 100,
          totalDisbursed: Math.round(totalPortfolio.totalDisbursed * 100) / 100,
          totalLoans: totalPortfolio.loanCount
        },
        qualityMetrics: {
          currentLoans: metrics.current[0]?.count || 0,
          delinquentLoans: metrics.delinquent[0]?.count || 0,
          nonPerformingLoans: metrics.nonPerforming[0]?.count || 0
        },
        ratios: {
          delinquencyRate: totalPortfolio.loanCount > 0 ? 
            Math.round(((metrics.delinquent[0]?.count || 0) / totalPortfolio.loanCount) * 100) : 0,
          nplRatio: totalPortfolio.loanCount > 0 ? 
            Math.round(((metrics.nonPerforming[0]?.count || 0) / totalPortfolio.loanCount) * 100) : 0
        }
      }
    });
  } catch (error) {
    console.error('❌ Portfolio quality report error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating portfolio quality report',
      error: error.message
    });
  }
});

// Simple working endpoint to test
router.get('/loan-reports/simple-summary', authenticate, async (req, res) => {
  try {
    console.log('🔍 Getting simple loan summary...');
    
    const totalLoans = await LoanAccount.countDocuments();
    const activeLoans = await LoanAccount.countDocuments({ LOAN_STATUS: 'ACTIVE' });
    const pendingLoans = await LoanAccount.countDocuments({ LOAN_STATUS: 'PENDING' });
    
    const financials = await LoanAccount.aggregate([
      {
        $group: {
          _id: null,
          totalLimit: { $sum: { $toDouble: "$DISBURSEMENT_LIMIT" } },
          totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } },
          totalOutstanding: { $sum: { $toDouble: "$OUTSTANDING_PRINCIPAL" } }
        }
      }
    ]);

    const financialData = financials[0] || {
      totalLimit: 0,
      totalDisbursed: 0,
      totalOutstanding: 0
    };

    return res.json({
      success: true,
      message: 'Simple loan summary',
      data: {
        totalLoans,
        activeLoans,
        pendingLoans,
        totalDisbursementLimit: Math.round(financialData.totalLimit * 100) / 100,
        totalDisbursed: Math.round(financialData.totalDisbursed * 100) / 100,
        totalOutstanding: Math.round(financialData.totalOutstanding * 100) / 100
      }
    });
  } catch (error) {
    console.error('Simple summary error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error generating simple summary',
      error: error.message
    });
  }
});

// =========================
// TEST ENDPOINTS
// =========================
router.get('/test/auth', authenticate, (req, res) => {
  res.json({
    success: true,
    message: 'Authentication is working!',
    user: {
      id: req.authUser?.id,
      user_name: req.authUser?.user_name,
      role: req.authUser?.role,
      roleId: req.authUser?.roleId
    },
    timestamp: new Date().toISOString()
  });
});

// Health check (no auth required)
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Loan routes are healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;