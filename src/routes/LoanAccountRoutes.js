// src/routes/LoanAccountRoutes.js
import express from 'express';
import LoanAccountController from '../controllers/LoanAccountController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// =========================
// APPLICATION & LOAN CREATION
// =========================

/**
 * @route POST /api/loans/apply
 * @description Apply for a new loan
 */
router.post('/apply', authenticate, LoanAccountController.applyForLoan);

/**
 * @route POST /api/loans
 * @description Create a new loan account (alternative to apply)
 */
router.post('/', authenticate, LoanAccountController.createLoanAccount);

// =========================
// LOAN APPROVAL & WORKFLOW
// =========================

/**
 * @route POST /api/loans/approve
 * @description Approve a loan application
 */
router.post('/approve', authenticate, LoanAccountController.approveLoanApplication);

/**
 * @route POST /api/loans/reject
 * @description Reject a loan application
 */
router.post('/reject', authenticate, LoanAccountController.rejectLoanApplication);

/**
 * @route POST /api/loans/disburse
 * @description Disburse approved loan
 */
router.post('/disburse', authenticate, LoanAccountController.disburseLoan);

/**
 * @route POST /api/loans/approve-disbursement
 * @description Approve loan disbursement
 */
router.post('/approve-disbursement', authenticate, LoanAccountController.approveLoanDisbursement);

/**
 * @route POST /api/loans/reject-disbursement
 * @description Reject loan disbursement
 */
router.post('/reject-disbursement', authenticate, LoanAccountController.rejectLoanDisbursement);

// =========================
// REPAYMENT OPERATIONS
// =========================

/**
 * @route POST /api/loans/repay
 * @description Make a loan repayment
 */
router.post('/repay', authenticate, LoanAccountController.repayLoan);

/**
 * @route POST /api/loans/:ACCT_NO/repayments
 * @description Record a repayment for specific loan
 */
router.post('/:ACCT_NO/repayments', authenticate, LoanAccountController.recordRepayment);

// =========================
// LOAN INFORMATION & QUERIES
// =========================

/**
 * @route GET /api/loans
 * @description Get all loans with pagination and filters
 */
router.get('/', authenticate, LoanAccountController.getAllLoans);

/**
 * @route GET /api/loans/search
 * @description Search loans by various criteria
 */
router.get('/search', authenticate, LoanAccountController.searchLoans);

/**
 * @route GET /api/loans/:ACCT_NO
 * @description Get loan account by account number
 */
router.get('/:ACCT_NO', authenticate, LoanAccountController.getLoanAccountByAcctNo);

/**
 * @route GET /api/loans/customer/:CUST_ID
 * @description Get all loans for a customer
 */
router.get('/customer/:CUST_ID', authenticate, LoanAccountController.getLoanAccountsByCustomerId);

/**
 * @route GET /api/loans/:ACCT_NO/transactions
 * @description Get transaction history for a loan
 */
router.get('/:ACCT_NO/transactions', authenticate, LoanAccountController.getLoanTransactions);

/**
 * @route GET /api/loans/:ACCT_NO/repayment-schedule
 * @description Get repayment schedule for a loan
 */
router.get('/:ACCT_NO/repayment-schedule', authenticate, LoanAccountController.getRepaymentSchedule);

/**
 * @route GET /api/loans/:ACCT_NO/interest
 * @description Get interest details for a loan
 */
router.get('/:ACCT_NO/interest', authenticate, LoanAccountController.getLoanInterestDetails);

// =========================
// CUSTOMER LOAN INFORMATION
// =========================

/**
 * @route GET /api/loans/customer/:CUST_ID/balances
 * @description Get loan balances for a customer
 */
router.get('/customer/:CUST_ID/balances', authenticate, LoanAccountController.getLoanBalanceForCustomer);

/**
 * @route GET /api/loans/customer/:CUST_ID/details
 * @description Get detailed loan information for a customer
 */
router.get('/customer/:CUST_ID/details', authenticate, LoanAccountController.getLoanDetailsForCustomer);

// =========================
// LOAN MANAGEMENT (UPDATE/DELETE)
// =========================

/**
 * @route PUT /api/loans/:ACCT_NO
 * @description Update loan account information
 */
router.put('/:ACCT_NO', authenticate, LoanAccountController.updateLoanAccount);

/**
 * @route DELETE /api/loans/:ACCT_NO
 * @description Delete a loan account
 */
router.delete('/:ACCT_NO', authenticate, LoanAccountController.deleteLoanAccount);

// =========================
// REPORTS & ANALYTICS
// =========================

/**
 * @route GET /api/loans/reports/summary
 * @description Get loan summary report
 */
router.get('/reports/summary', authenticate, LoanAccountController.getLoanSummaryReport);

/**
 * @route GET /api/loans/reports/detailed
 * @description Get detailed loan report
 */
router.get('/reports/detailed', authenticate, LoanAccountController.getDetailedLoanReport);

/**
 * @route GET /api/loans/reports/branch-wise
 * @description Get branch-wise loan report
 */
router.get('/reports/branch-wise', authenticate, LoanAccountController.getBranchWiseLoanReport);

/**
 * @route GET /api/loans/reports/product-wise
 * @description Get product-wise loan report
 */
router.get('/reports/product-wise', authenticate, LoanAccountController.getProductWiseLoanReport);

/**
 * @route GET /api/loans/reports/status-wise
 * @description Get status-wise loan report
 */
router.get('/reports/status-wise', authenticate, LoanAccountController.getStatusWiseLoanReport);

/**
 * @route GET /api/loans/reports/balance-analysis
 * @description Get loan balance analysis report
 */
router.get('/reports/balance-analysis', authenticate, LoanAccountController.getLoanBalanceAnalysisReport);

/**
 * @route GET /api/loans/reports/disbursement-analysis
 * @description Get disbursement analysis report
 */
router.get('/reports/disbursement-analysis', authenticate, LoanAccountController.getDisbursementAnalysisReport);

/**
 * @route GET /api/loans/reports/repayment-analysis
 * @description Get repayment analysis report
 */
router.get('/reports/repayment-analysis', authenticate, LoanAccountController.getRepaymentAnalysisReport);

// =========================
// DASHBOARD & ANALYTICS
// =========================

/**
 * @route GET /api/loans/dashboard/overview
 * @description Get loan dashboard overview
 */
router.get('/dashboard/overview', authenticate, LoanAccountController.getDashboardOverview);

/**
 * @route GET /api/loans/dashboard/portfolio-performance
 * @description Get portfolio performance metrics
 */
router.get('/dashboard/portfolio-performance', authenticate, LoanAccountController.getPortfolioPerformance);

/**
 * @route GET /api/loans/dashboard/risk-analysis
 * @description Get loan risk analysis
 */
router.get('/dashboard/risk-analysis', authenticate, LoanAccountController.getRiskAnalysis);

// =========================
// EXPORT ROUTES
// =========================

/**
 * @route GET /api/loans/export/summary
 * @description Export loan summary report
 */
router.get('/export/summary', authenticate, LoanAccountController.exportLoanSummary);

/**
 * @route GET /api/loans/export/detailed
 * @description Export detailed loan report
 */
router.get('/export/detailed', authenticate, LoanAccountController.exportDetailedReport);

// =========================
// UTILITY & HEALTH ROUTES
// =========================

/**
 * @route GET /api/loans/health
 * @description Health check for loan routes
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Loan routes are healthy',
    timestamp: new Date().toISOString()
  });
});

/**
 * @route GET /api/loans/test/auth
 * @description Test authentication middleware
 */
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

export default router;