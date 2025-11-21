// routes/loanCollectionRoutes.js
import express from 'express';
import { 
  getUniversalCollectionSheet, 
  getGroupRepaymentCollectionSheet 
} from '../controllers/LoanAccountSummaryController.js';
import LoanAccount from '../models/LoanAccount.js';


// Add asyncHandler definition at the top
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

const router = express.Router();

/**
 * @route GET /api/collections/universal
 * @description Get universal collection sheet for groups, individuals, customers, or branches
 * @query {string} [groupId] - Group loan ID for group collection sheet
 * @query {string} [loanId] - Loan account number for individual collection sheet
 * @query {string} [customerId] - Customer ID for customer collection sheet
 * @query {string} [branchId] - Branch ID for branch collection sheet
 * @returns {Object} Collection sheet with disbursement information
 */
router.get('/universal', getUniversalCollectionSheet);

/**
 * @route GET /api/collections/group/:groupId
 * @description Get collection sheet for a specific group loan
 * @param {string} groupId - Group loan ID
 * @returns {Object} Group loan collection sheet
 */
router.get('/group/:groupId', (req, res) => {
  req.query.groupId = req.params.groupId;
  return getUniversalCollectionSheet(req, res);
});

/**
 * @route GET /api/collections/group-repayment/:groupId
 * @description Get comprehensive repayment collection sheet for a group loan
 * @param {string} groupId - Group loan ID
 * @query {boolean} [includeHistory] - Include payment history (true/false)
 * @query {string} [startDate] - Start date for history filter (YYYY-MM-DD)
 * @query {string} [endDate] - End date for history filter (YYYY-MM-DD)
 * @returns {Object} Group repayment collection sheet with detailed member status
 */
router.get('/group-repayment/:groupId', getGroupRepaymentCollectionSheet);

/**
 * @route GET /api/collections/loan/:loanId
 * @description Get collection sheet for a specific loan account
 * @param {string} loanId - Loan account number
 * @returns {Object} Individual loan collection sheet
 */
router.get('/loan/:loanId', (req, res) => {
  req.query.loanId = req.params.loanId;
  return getUniversalCollectionSheet(req, res);
});

/**
 * @route GET /api/collections/customer/:customerId
 * @description Get collection sheet for a specific customer
 * @param {string} customerId - Customer ID
 * @returns {Object} Customer loans collection sheet
 */
router.get('/customer/:customerId', (req, res) => {
  req.query.customerId = req.params.customerId;
  return getUniversalCollectionSheet(req, res);
});

/**
 * @route GET /api/collections/branch/:branchId
 * @description Get collection sheet for a specific branch
 * @param {string} branchId - Branch ID
 * @returns {Object} Branch loans collection sheet
 */
router.get('/branch/:branchId', (req, res) => {
  req.query.branchId = req.params.branchId;
  return getUniversalCollectionSheet(req, res);
});

/**
 * @route GET /api/collections/overdue
 * @description Get collection sheet for all overdue loans
 * @query {string} [branchId] - Optional branch filter
 * @query {string} [productType] - Optional product type filter
 * @returns {Object} Overdue loans collection sheet
 */
router.get('/overdue', asyncHandler(async (req, res) => {
  const { branchId, productType } = req.query;
  
  try {
    // Find all overdue loan accounts
    const query = { 
      LOAN_STATUS: 'OVERDUE'
    };
    
    if (branchId) {
      query.BU_ID = branchId;
    }
    
    if (productType) {
      query.PRODUCT_TYPE = productType;
    }
    
    const overdueLoans = await LoanAccount.find(query)
      .populate('CUST_ID')
      .populate('groupLoan')
      .sort({ NEXT_PAYMENT_DATE: 1 });

    if (overdueLoans.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No overdue loans found'
      });
    }

    // Create collection sheet structure
    const collectionSheet = {
      type: 'OVERDUE',
      info: {
        totalOverdueLoans: overdueLoans.length,
        branchFilter: branchId || 'All Branches',
        productFilter: productType || 'All Products',
        generatedAt: new Date()
      },
      summary: {
        totalMembers: 0,
        totalOutstanding: 0,
        totalInstallmentAmount: 0,
        activeMembers: 0,
        overdueMembers: 0,
        totalLoanAmount: 0,
        totalRepaid: 0,
        totalDisbursed: 0,
        totalFeesCollected: 0,
        totalUpfrontInterest: 0,
        netDisbursement: 0
      },
      members: []
    };

    // Process overdue loans - You'll need to export this function from your controller
    await processLoanAccounts(overdueLoans, collectionSheet);

    // Final calculations
    collectionSheet.summary.averageInstallment = collectionSheet.members.length > 0 ?
      collectionSheet.summary.totalInstallmentAmount / collectionSheet.members.length : 0;

    collectionSheet.summary.collectionRate = collectionSheet.summary.totalLoanAmount > 0 ?
      ((collectionSheet.summary.totalRepaid) / collectionSheet.summary.totalLoanAmount * 100) : 0;

    collectionSheet.summary.disbursementRate = collectionSheet.summary.totalLoanAmount > 0 ?
      ((collectionSheet.summary.totalDisbursed) / collectionSheet.summary.totalLoanAmount * 100) : 0;

    res.status(200).json({
      success: true,
      message: 'Overdue loans collection sheet generated successfully',
      data: collectionSheet,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('💥 ERROR generating overdue collection sheet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate overdue collection sheet',
      error: error.message
    });
  }
}));

/**
 * @route GET /api/collections/upcoming
 * @description Get collection sheet for loans with upcoming payments
 * @query {number} [days=7] - Number of days to look ahead (default: 7)
 * @query {string} [branchId] - Optional branch filter
 * @returns {Object} Upcoming payments collection sheet
 */
router.get('/upcoming', asyncHandler(async (req, res) => {
  const { days = 7, branchId } = req.query;
  const daysAhead = parseInt(days);
  
  try {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysAhead);

    // Find loans with upcoming payments
    const query = {
      LOAN_STATUS: 'ACTIVE',
      NEXT_PAYMENT_DATE: {
        $gte: startDate,
        $lte: endDate
      }
    };
    
    if (branchId) {
      query.BU_ID = branchId;
    }
    
    const upcomingLoans = await LoanAccount.find(query)
      .populate('CUST_ID')
      .populate('groupLoan')
      .sort({ NEXT_PAYMENT_DATE: 1 });

    if (upcomingLoans.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No loans with payments due in the next ${daysAhead} days`
      });
    }

    // Create collection sheet structure
    const collectionSheet = {
      type: 'UPCOMING',
      info: {
        daysAhead: daysAhead,
        startDate: startDate,
        endDate: endDate,
        totalUpcomingLoans: upcomingLoans.length,
        branchFilter: branchId || 'All Branches',
        generatedAt: new Date()
      },
      summary: {
        totalMembers: 0,
        totalOutstanding: 0,
        totalInstallmentAmount: 0,
        activeMembers: 0,
        overdueMembers: 0,
        totalLoanAmount: 0,
        totalRepaid: 0,
        totalDisbursed: 0,
        totalFeesCollected: 0,
        totalUpfrontInterest: 0,
        netDisbursement: 0,
        totalUpcomingPayments: 0
      },
      members: []
    };

    // Process upcoming loans
    await processLoanAccounts(upcomingLoans, collectionSheet);

    // Calculate upcoming payments total
    collectionSheet.summary.totalUpcomingPayments = upcomingLoans.reduce((sum, loan) => {
      return sum + parseFloat(loan.installmentAmount?.toString() || '0');
    }, 0);

    res.status(200).json({
      success: true,
      message: `Upcoming payments collection sheet generated successfully for next ${daysAhead} days`,
      data: collectionSheet,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('💥 ERROR generating upcoming collection sheet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate upcoming collection sheet',
      error: error.message
    });
  }
}));

/**
 * @route GET /api/collections/product/:productType
 * @description Get collection sheet for loans by product type
 * @param {string} productType - Product type (BUSINESS TERM LOAN, INDIVIDUAL LOAN, etc.)
 * @query {string} [branchId] - Optional branch filter
 * @returns {Object} Product-specific collection sheet
 */
router.get('/product/:productType', asyncHandler(async (req, res) => {
  const { productType } = req.params;
  const { branchId } = req.query;
  
  try {
    const query = {
      PRODUCT_TYPE: productType.toUpperCase(),
      LOAN_STATUS: { $in: ['ACTIVE', 'OVERDUE'] }
    };
    
    if (branchId) {
      query.BU_ID = branchId;
    }
    
    const productLoans = await LoanAccount.find(query)
      .populate('CUST_ID')
      .populate('groupLoan')
      .sort({ ACCT_NO: 1 });

    if (productLoans.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No active loans found for product type: ${productType}`
      });
    }

    // Create collection sheet structure
    const collectionSheet = {
      type: 'PRODUCT',
      info: {
        productType: productType,
        totalLoans: productLoans.length,
        branchFilter: branchId || 'All Branches',
        generatedAt: new Date()
      },
      summary: {
        totalMembers: 0,
        totalOutstanding: 0,
        totalInstallmentAmount: 0,
        activeMembers: 0,
        overdueMembers: 0,
        totalLoanAmount: 0,
        totalRepaid: 0,
        totalDisbursed: 0,
        totalFeesCollected: 0,
        totalUpfrontInterest: 0,
        netDisbursement: 0
      },
      members: []
    };

    // Process product loans
    await processLoanAccounts(productLoans, collectionSheet);

    // Final calculations
    collectionSheet.summary.averageInstallment = collectionSheet.members.length > 0 ?
      collectionSheet.summary.totalInstallmentAmount / collectionSheet.members.length : 0;

    collectionSheet.summary.collectionRate = collectionSheet.summary.totalLoanAmount > 0 ?
      ((collectionSheet.summary.totalRepaid) / collectionSheet.summary.totalLoanAmount * 100) : 0;

    collectionSheet.summary.disbursementRate = collectionSheet.summary.totalLoanAmount > 0 ?
      ((collectionSheet.summary.totalDisbursed) / collectionSheet.summary.totalLoanAmount * 100) : 0;

    res.status(200).json({
      success: true,
      message: `Product collection sheet for ${productType} generated successfully`,
      data: collectionSheet,
      generatedAt: new Date()
    });

  } catch (error) {
    console.error('💥 ERROR generating product collection sheet:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate product collection sheet',
      error: error.message
    });
  }
}));

/**
 * @route GET /api/collections/dashboard
 * @description Get collection dashboard with summary statistics
 * @query {string} [branchId] - Optional branch filter
 * @returns {Object} Collection dashboard with key metrics
 */
router.get('/dashboard', asyncHandler(async (req, res) => {
  const { branchId } = req.query;
  
  try {
    const query = branchId ? { BU_ID: branchId } : {};
    
    // Get various loan counts
    const totalLoans = await LoanAccount.countDocuments({
      ...query,
      LOAN_STATUS: { $in: ['ACTIVE', 'OVERDUE'] }
    });
    
    const activeLoans = await LoanAccount.countDocuments({
      ...query,
      LOAN_STATUS: 'ACTIVE'
    });
    
    const overdueLoans = await LoanAccount.countDocuments({
      ...query,
      LOAN_STATUS: 'OVERDUE'
    });
    
    const groupLoans = await LoanAccount.countDocuments({
      ...query,
      groupLoan: { $exists: true, $ne: null },
      LOAN_STATUS: { $in: ['ACTIVE', 'OVERDUE'] }
    });

    // Get financial totals
    const financialStats = await LoanAccount.aggregate([
      { $match: { ...query, LOAN_STATUS: { $in: ['ACTIVE', 'OVERDUE'] } } },
      {
        $group: {
          _id: null,
          totalOutstanding: { $sum: '$OUTSTANDING_PRINCIPAL' },
          totalDisbursed: { $sum: '$ACTUAL_DISBURSEMENT' },
          totalRepaid: { $sum: '$TOTAL_REPAID_AMOUNT' },
          totalLoanAmount: { $sum: '$DISBURSEMENT_LIMIT' }
        }
      }
    ]);

    const stats = financialStats[0] || {
      totalOutstanding: 0,
      totalDisbursed: 0,
      totalRepaid: 0,
      totalLoanAmount: 0
    };

    // Get overdue breakdown
    const overdueBreakdown = await LoanAccount.aggregate([
      { $match: { ...query, LOAN_STATUS: 'OVERDUE' } },
      {
        $group: {
          _id: '$PRODUCT_TYPE',
          count: { $sum: 1 },
          totalOutstanding: { $sum: '$OUTSTANDING_PRINCIPAL' }
        }
      },
      { $sort: { totalOutstanding: -1 } }
    ]);

    // Get upcoming payments (next 7 days)
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const upcomingPayments = await LoanAccount.aggregate([
      {
        $match: {
          ...query,
          LOAN_STATUS: 'ACTIVE',
          NEXT_PAYMENT_DATE: { $lte: nextWeek, $gte: new Date() }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$installmentAmount' },
          count: { $sum: 1 }
        }
      }
    ]);

    const upcoming = upcomingPayments[0] || { totalAmount: 0, count: 0 };

    const dashboard = {
      summary: {
        totalLoans,
        activeLoans,
        overdueLoans,
        groupLoans,
        collectionRate: stats.totalLoanAmount > 0 ? 
          (parseFloat(stats.totalRepaid.toString()) / parseFloat(stats.totalLoanAmount.toString())) * 100 : 0,
        disbursementRate: stats.totalLoanAmount > 0 ?
          (parseFloat(stats.totalDisbursed.toString()) / parseFloat(stats.totalLoanAmount.toString())) * 100 : 0
      },
      financials: {
        totalOutstanding: parseFloat(stats.totalOutstanding?.toString() || '0'),
        totalDisbursed: parseFloat(stats.totalDisbursed?.toString() || '0'),
        totalRepaid: parseFloat(stats.totalRepaid?.toString() || '0'),
        totalLoanAmount: parseFloat(stats.totalLoanAmount?.toString() || '0')
      },
      upcoming: {
        loansDue: upcoming.count,
        totalAmount: parseFloat(upcoming.totalAmount?.toString() || '0'),
        timeframe: 'Next 7 days'
      },
      overdueBreakdown,
      branchFilter: branchId || 'All Branches',
      generatedAt: new Date()
    };

    res.status(200).json({
      success: true,
      message: 'Collection dashboard generated successfully',
      data: dashboard
    });

  } catch (error) {
    console.error('💥 ERROR generating collection dashboard:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate collection dashboard',
      error: error.message
    });
  }
}));

export default router;