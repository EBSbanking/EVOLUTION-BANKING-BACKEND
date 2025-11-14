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

///////////// LOAN REPORT ///////////////////////////
// Comprehensive Loan Reports for Frontend
// In your loan routes file (where you have your loan endpoints)
router.get('/loan-reports', async (req, res) => {
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
        return await getLoanSummaryReport(res, baseQuery);
      
      case 'detailed':
        return await getDetailedLoanReport(res, baseQuery, parseInt(page), parseInt(limit));
      
      case 'branch-wise':
        return await getBranchWiseLoanReport(res, baseQuery);
      
      case 'product-wise':
        return await getProductWiseLoanReport(res, baseQuery);
      
      case 'status-wise':
        return await getStatusWiseLoanReport(res, baseQuery);
      
      case 'balance-analysis':
        return await getLoanBalanceAnalysisReport(res, baseQuery);
      
      default:
        return await getLoanSummaryReport(res, baseQuery);
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


// 1. Loan Summary Report - UPDATED FOR YOUR DATA STRUCTURE
async function getLoanSummaryReport(res, query) {
  try {
    const totalLoans = await LoanAccount.countDocuments(query);
    
    const activeLoans = await LoanAccount.countDocuments({
      ...query,
      LOAN_STATUS: 'ACTIVE'
    });

    const pendingLoans = await LoanAccount.countDocuments({
      ...query,
      LOAN_STATUS: 'PENDING'
    });

    const approvedLoans = await LoanAccount.countDocuments({
      ...query,
      LOAN_STATUS: 'APPROVED'
    });

    const closedLoans = await LoanAccount.countDocuments({
      ...query,
      LOAN_STATUS: { $in: ['CLOSED', 'PAID', 'SETTLED'] }
    });

    // Balance aggregates - UPDATED FOR YOUR FIELD NAMES
    const balanceStats = await LoanAccount.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } },
          totalOutstanding: { $sum: { $toDouble: "$OUTSTANDING_PRINCIPAL" } },
          totalCurrentBalance: { $sum: { $toDouble: "$CURRENT_BALANCE" } },
          totalLimit: { $sum: { $toDouble: "$DISBURSEMENT_LIMIT" } },
          avgLoanSize: { $avg: { $toDouble: "$DISBURSEMENT_LIMIT" } },
          maxLoanSize: { $max: { $toDouble: "$DISBURSEMENT_LIMIT" } },
          totalLoans: { $sum: 1 }
        }
      }
    ]);

    // Recent loans (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentLoans = await LoanAccount.countDocuments({
      ...query,
      applicationDate: { $gte: thirtyDaysAgo }
    });

    const balanceData = balanceStats[0] || {
      totalDisbursed: 0,
      totalOutstanding: 0,
      totalCurrentBalance: 0,
      totalLimit: 0,
      avgLoanSize: 0,
      maxLoanSize: 0,
      totalLoans: 0
    };

    // Calculate portfolio metrics
    const portfolioHealth = balanceData.totalDisbursed > 0 ? 
      Math.round(((balanceData.totalDisbursed - balanceData.totalOutstanding) / balanceData.totalDisbursed) * 100) : 0;

    return res.json({
      success: true,
      reportType: 'summary',
      generatedAt: new Date(),
      data: {
        overview: {
          totalLoans: totalLoans,
          activeLoans,
          pendingLoans,
          approvedLoans,
          closedLoans,
          recentLoansLast30Days: recentLoans
        },
        financialSummary: {
          totalDisbursementLimit: Math.round(balanceData.totalLimit * 100) / 100,
          totalDisbursed: Math.round(balanceData.totalDisbursed * 100) / 100,
          totalOutstanding: Math.round(balanceData.totalOutstanding * 100) / 100,
          totalCurrentBalance: Math.round(balanceData.totalCurrentBalance * 100) / 100,
          averageLoanSize: Math.round(balanceData.avgLoanSize * 100) / 100,
          maximumLoanSize: Math.round(balanceData.maxLoanSize * 100) / 100,
          portfolioHealth: portfolioHealth
        },
        percentages: {
          activePercentage: totalLoans > 0 ? Math.round((activeLoans / totalLoans) * 100) : 0,
          pendingPercentage: totalLoans > 0 ? Math.round((pendingLoans / totalLoans) * 100) : 0,
          approvedPercentage: totalLoans > 0 ? Math.round((approvedLoans / totalLoans) * 100) : 0,
          closedPercentage: totalLoans > 0 ? Math.round((closedLoans / totalLoans) * 100) : 0
        }
      }
    });
  } catch (error) {
    throw new Error(`Loan summary report error: ${error.message}`);
  }
}

// 2. Detailed Loan Report with Pagination
async function getDetailedLoanReport(res, query, page, limit) {
  try {
    const skip = (page - 1) * limit;

    const loans = await LoanAccount.find(query)
      .select('ACCT_NO ACCT_NM CUST_ID LOAN_STATUS DISBURSED_AMOUNT OUTSTANDING_PRINCIPAL CURRENT_BALANCE INTEREST_RATE START_DT MATURITY_DT PRODUCT_TYPE PROD_ID branch BU_ID CREATED_BY disbursementDate')
      .sort({ START_DT: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const totalCount = await LoanAccount.countDocuments(query);

    // Transform data for frontend consistency
    const transformedLoans = loans.map(loan => ({
      id: loan._id,
      accountNumber: loan.ACCT_NO,
      customerId: loan.CUST_ID,
      accountName: loan.ACCT_NM,
      status: loan.LOAN_STATUS,
      financials: {
        disbursedAmount: loan.DISBURSED_AMOUNT ? parseFloat(loan.DISBURSED_AMOUNT.toString()) : 0,
        outstandingPrincipal: loan.OUTSTANDING_PRINCIPAL ? parseFloat(loan.OUTSTANDING_PRINCIPAL.toString()) : 0,
        currentBalance: loan.CURRENT_BALANCE ? parseFloat(loan.CURRENT_BALANCE.toString()) : 0,
        interestRate: loan.INTEREST_RATE ? parseFloat(loan.INTEREST_RATE.toString()) : 0
      },
      branch: loan.branch || loan.BU_ID,
      product: loan.PROD_ID,
      productType: loan.PRODUCT_TYPE,
      dates: {
        startDate: loan.START_DT,
        maturityDate: loan.MATURITY_DT,
        disbursementDate: loan.disbursementDate
      },
      createdBy: loan.CREATED_BY
    }));

    return res.json({
      success: true,
      reportType: 'detailed',
      generatedAt: new Date(),
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount / limit),
        totalItems: totalCount,
        itemsPerPage: limit
      },
      data: transformedLoans
    });
  } catch (error) {
    throw new Error(`Detailed loan report error: ${error.message}`);
  }
}

// 3. Branch-wise Loan Report
async function getBranchWiseLoanReport(res, query) {
  try {
    const branchStats = await LoanAccount.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            $ifNull: ["$branch", "$BU_ID"]
          },
          totalLoans: { $sum: 1 },
          activeLoans: {
            $sum: { $cond: [{ $eq: ["$LOAN_STATUS", "ACTIVE"] }, 1, 0] }
          },
          totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } },
          totalOutstanding: { $sum: { $toDouble: "$OUTSTANDING_PRINCIPAL" } },
          averageLoanSize: { $avg: { $toDouble: "$DISBURSED_AMOUNT" } }
        }
      },
      { $sort: { totalDisbursed: -1 } }
    ]);

    const transformedStats = branchStats.map(branch => ({
      branchId: branch._id,
      totalLoans: branch.totalLoans,
      activeLoans: branch.activeLoans,
      inactiveLoans: branch.totalLoans - branch.activeLoans,
      totalDisbursed: Math.round(branch.totalDisbursed * 100) / 100,
      totalOutstanding: Math.round(branch.totalOutstanding * 100) / 100,
      averageLoanSize: Math.round(branch.averageLoanSize * 100) / 100
    }));

    return res.json({
      success: true,
      reportType: 'branch-wise',
      generatedAt: new Date(),
      data: transformedStats
    });
  } catch (error) {
    throw new Error(`Branch-wise loan report error: ${error.message}`);
  }
}

// 4. Product-wise Loan Report
async function getProductWiseLoanReport(res, query) {
  try {
    const productStats = await LoanAccount.aggregate([
      { $match: query },
      {
        $group: {
          _id: {
            $ifNull: ["$PROD_ID", "$PRODUCT_TYPE"]
          },
          totalLoans: { $sum: 1 },
          activeLoans: {
            $sum: { $cond: [{ $eq: ["$LOAN_STATUS", "ACTIVE"] }, 1, 0] }
          },
          totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } },
          totalOutstanding: { $sum: { $toDouble: "$OUTSTANDING_PRINCIPAL" } },
          averageLoanSize: { $avg: { $toDouble: "$DISBURSED_AMOUNT" } },
          averageInterestRate: { $avg: { $toDouble: "$INTEREST_RATE" } }
        }
      },
      { $sort: { totalDisbursed: -1 } }
    ]);

    const transformedStats = productStats.map(product => ({
      productCode: product._id,
      totalLoans: product.totalLoans,
      activeLoans: product.activeLoans,
      totalDisbursed: Math.round(product.totalDisbursed * 100) / 100,
      totalOutstanding: Math.round(product.totalOutstanding * 100) / 100,
      averageLoanSize: Math.round(product.averageLoanSize * 100) / 100,
      averageInterestRate: Math.round(product.averageInterestRate * 100) / 100
    }));

    return res.json({
      success: true,
      reportType: 'product-wise',
      generatedAt: new Date(),
      data: transformedStats
    });
  } catch (error) {
    throw new Error(`Product-wise loan report error: ${error.message}`);
  }
}

// 5. Status-wise Loan Report
async function getStatusWiseLoanReport(res, query) {
  try {
    const statusStats = await LoanAccount.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$LOAN_STATUS",
          totalLoans: { $sum: 1 },
          totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } },
          totalOutstanding: { $sum: { $toDouble: "$OUTSTANDING_PRINCIPAL" } },
          averageLoanSize: { $avg: { $toDouble: "$DISBURSED_AMOUNT" } }
        }
      },
      { $sort: { totalLoans: -1 } }
    ]);

    const transformedStats = statusStats.map(status => ({
      status: status._id || 'Unknown',
      totalLoans: status.totalLoans,
      totalDisbursed: Math.round(status.totalDisbursed * 100) / 100,
      totalOutstanding: Math.round(status.totalOutstanding * 100) / 100,
      averageLoanSize: Math.round(status.averageLoanSize * 100) / 100
    }));

    return res.json({
      success: true,
      reportType: 'status-wise',
      generatedAt: new Date(),
      data: transformedStats
    });
  } catch (error) {
    throw new Error(`Status-wise loan report error: ${error.message}`);
  }
}

// 6. Loan Balance Analysis Report
async function getLoanBalanceAnalysisReport(res, query) {
  try {
    const balanceRanges = [
      { range: '0-50,000', min: 0, max: 50000 },
      { range: '50,001-100,000', min: 50001, max: 100000 },
      { range: '100,001-500,000', min: 100001, max: 500000 },
      { range: '500,001-1,000,000', min: 500001, max: 1000000 },
      { range: '1,000,001-5,000,000', min: 1000001, max: 5000000 },
      { range: '5,000,001+', min: 5000001, max: Number.MAX_SAFE_INTEGER }
    ];

    const balanceAnalysis = [];

    for (const range of balanceRanges) {
      const count = await LoanAccount.countDocuments({
        ...query,
        DISBURSED_AMOUNT: {
          $gte: range.min,
          $lte: range.max
        }
      });

      balanceAnalysis.push({
        range: range.range,
        loanCount: count,
        percentage: 0 // Will calculate after we have total
      });
    }

    // Calculate percentages
    const totalLoans = balanceAnalysis.reduce((sum, item) => sum + item.loanCount, 0);
    balanceAnalysis.forEach(item => {
      item.percentage = totalLoans > 0 ? Math.round((item.loanCount / totalLoans) * 100) : 0;
    });

    // Top loans by disbursed amount
    const topLoans = await LoanAccount.find(query)
      .select('ACCT_NO ACCT_NM DISBURSED_AMOUNT OUTSTANDING_PRINCIPAL LOAN_STATUS')
      .sort({ DISBURSED_AMOUNT: -1 })
      .limit(10)
      .lean();

    const transformedTopLoans = topLoans.map(loan => ({
      accountNumber: loan.ACCT_NO,
      accountName: loan.ACCT_NM,
      disbursedAmount: loan.DISBURSED_AMOUNT ? parseFloat(loan.DISBURSED_AMOUNT.toString()) : 0,
      outstandingPrincipal: loan.OUTSTANDING_PRINCIPAL ? parseFloat(loan.OUTSTANDING_PRINCIPAL.toString()) : 0,
      status: loan.LOAN_STATUS
    }));

    return res.json({
      success: true,
      reportType: 'balance-analysis',
      generatedAt: new Date(),
      data: {
        balanceDistribution: balanceAnalysis,
        topLoansByAmount: transformedTopLoans,
        summary: {
          totalLoansAnalyzed: totalLoans,
          ranges: balanceRanges.length
        }
      }
    });
  } catch (error) {
    throw new Error(`Loan balance analysis report error: ${error.message}`);
  }
}

// 7. Disbursement Analysis Report
async function getDisbursementAnalysisReport(res, query) {
  try {
    const monthlyDisbursements = await LoanAccount.aggregate([
      { $match: { ...query, DISBURSED_AMOUNT: { $gt: 0 } } },
      {
        $group: {
          _id: {
            year: { $year: "$disbursementDate" },
            month: { $month: "$disbursementDate" }
          },
          totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } },
          loanCount: { $sum: 1 },
          averageDisbursement: { $avg: { $toDouble: "$DISBURSED_AMOUNT" } }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
      { $limit: 12 } // Last 12 months
    ]);

    const transformedDisbursements = monthlyDisbursements.map(month => ({
      period: `${month._id.year}-${String(month._id.month).padStart(2, '0')}`,
      totalDisbursed: Math.round(month.totalDisbursed * 100) / 100,
      loanCount: month.loanCount,
      averageDisbursement: Math.round(month.averageDisbursement * 100) / 100
    }));

    // Product-wise disbursement
    const productDisbursements = await LoanAccount.aggregate([
      { $match: { ...query, DISBURSED_AMOUNT: { $gt: 0 } } },
      {
        $group: {
          _id: "$PROD_ID",
          totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } },
          loanCount: { $sum: 1 }
        }
      },
      { $sort: { totalDisbursed: -1 } }
    ]);

    return res.json({
      success: true,
      reportType: 'disbursement-analysis',
      generatedAt: new Date(),
      data: {
        monthlyTrend: transformedDisbursements,
        productBreakdown: productDisbursements.map(product => ({
          productCode: product._id,
          totalDisbursed: Math.round(product.totalDisbursed * 100) / 100,
          loanCount: product.loanCount
        }))
      }
    });
  } catch (error) {
    throw new Error(`Disbursement analysis report error: ${error.message}`);
  }
}

// 8. Repayment Analysis Report
async function getRepaymentAnalysisReport(res, query) {
  try {
    // Get repayment data from LoanRepayment collection
    const repaymentStats = await LoanRepayment.aggregate([
      {
        $lookup: {
          from: "loanaccounts",
          localField: "LOAN_ACCOUNT_ID",
          foreignField: "_id",
          as: "loanAccount"
        }
      },
      { $unwind: "$loanAccount" },
      { $match: query },
      {
        $group: {
          _id: null,
          totalRepayments: { $sum: { $toDouble: "$amount" } },
          totalInterestPaid: { $sum: { $toDouble: "$interestPaid" } },
          totalPrincipalPaid: { $sum: { $toDouble: "$principalPaid" } },
          repaymentCount: { $sum: 1 },
          uniqueLoans: { $addToSet: "$LOAN_ACCOUNT_ID" }
        }
      }
    ]);

    const stats = repaymentStats[0] || {
      totalRepayments: 0,
      totalInterestPaid: 0,
      totalPrincipalPaid: 0,
      repaymentCount: 0,
      uniqueLoans: []
    };

    // Monthly repayment trend
    const monthlyRepayments = await LoanRepayment.aggregate([
      {
        $lookup: {
          from: "loanaccounts",
          localField: "LOAN_ACCOUNT_ID",
          foreignField: "_id",
          as: "loanAccount"
        }
      },
      { $unwind: "$loanAccount" },
      { $match: query },
      {
        $group: {
          _id: {
            year: { $year: "$date" },
            month: { $month: "$date" }
          },
          totalRepaid: { $sum: { $toDouble: "$amount" } },
          repaymentCount: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
      { $limit: 6 } // Last 6 months
    ]);

    const transformedRepayments = monthlyRepayments.map(month => ({
      period: `${month._id.year}-${String(month._id.month).padStart(2, '0')}`,
      totalRepaid: Math.round(month.totalRepaid * 100) / 100,
      repaymentCount: month.repaymentCount
    }));

    return res.json({
      success: true,
      reportType: 'repayment-analysis',
      generatedAt: new Date(),
      data: {
        summary: {
          totalRepayments: Math.round(stats.totalRepayments * 100) / 100,
          totalInterestPaid: Math.round(stats.totalInterestPaid * 100) / 100,
          totalPrincipalPaid: Math.round(stats.totalPrincipalPaid * 100) / 100,
          repaymentCount: stats.repaymentCount,
          uniqueLoansWithRepayments: stats.uniqueLoans.length
        },
        monthlyTrend: transformedRepayments,
        composition: {
          interestPercentage: stats.totalRepayments > 0 ? 
            Math.round((stats.totalInterestPaid / stats.totalRepayments) * 100) : 0,
          principalPercentage: stats.totalRepayments > 0 ? 
            Math.round((stats.totalPrincipalPaid / stats.totalRepayments) * 100) : 0
        }
      }
    });
  } catch (error) {
    throw new Error(`Repayment analysis report error: ${error.message}`);
  }
}

// Additional endpoint for real-time loan dashboard metrics
router.get('/loan-dashboard-metrics', async (req, res) => {
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
router.get('/loan-portfolio-quality', async (req, res) => {
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
router.get('/loan-reports/simple-summary', async (req, res) => {
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
////////////////////////////////////////////////////////////////////////

export default router;