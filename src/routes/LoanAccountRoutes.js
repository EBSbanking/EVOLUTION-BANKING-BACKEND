// src/routes/LoanAccountRoutes.js
import express from 'express';
import LoanAccountController from '../controllers/LoanAccountController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js'; // Added authorize

const router = express.Router();

// DEBUG: Check controller exports
console.log('=== DEBUG: LoanAccountController ===');
console.log('Type:', typeof LoanAccountController);
if (LoanAccountController && typeof LoanAccountController === 'object') {
  const methods = Object.keys(LoanAccountController);
  console.log('Available methods:', methods);

  // Check for key methods
  const keyMethods = {
    getPendingLoans: methods.includes('getPendingLoans'),
    getLoanAccountByAcctNo: methods.includes('getLoanAccountByAcctNo'),
    getLoanAccountsByCustomerId: methods.includes('getLoanAccountsByCustomerId'),
    getAllLoans: methods.includes('getAllLoans'),
    applyForLoan: methods.includes('applyForLoan'),
    approveAndDisburseLoan: methods.includes('approveAndDisburseLoan'),
    rejectDisbursement: methods.includes('rejectDisbursement'),
    generateLoanContract: methods.includes('generateLoanContract'),
    getRepaymentStatusOverview: methods.includes('getRepaymentStatusOverview'),
  };

  console.log('Key methods available:', keyMethods);
}

// =========================
// PENDING LOAN ENDPOINTS - MUST COME BEFORE DYNAMIC ROUTES!
// =========================

/**
 * @route   GET /api/loans/pending
 * @desc    Get all loans with PENDING status
 * @access  Private
 */
if (LoanAccountController?.getPendingLoans) {
  router.get('/pending', authenticate, LoanAccountController.getPendingLoans);
} else {
  console.error('WARNING: getPendingLoans not available in controller');
  router.get('/pending', authenticate, (req, res) => {
    try {
      const pendingLoans = [
        {
          id: 68,
          account_number: "10027133358",
          account_name: "Dera Tinah",
          customer_id: "0000000008",
          amount: 500000.00,
          interest_rate: 96.0000,
          status: "PENDING",
          application_date: "2026-02-07T17:38:12.000Z",
          term: "3 MONTHLY",
          days_since_application: 0,
        },
      ];

      res.status(200).json({
        success: true,
        message: 'Found 1 pending loan (mock data - implement getPendingLoans)',
        data: {
          loans: pendingLoans,
          count: pendingLoans.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      res.status(501).json({
        success: false,
        message: 'getPendingLoans not implemented',
      });
    }
  });
}

/**
 * @route   GET /api/loans/pending/simple
 * @desc    Get simple list of pending loans (without pagination)
 * @access  Private
 */
if (LoanAccountController?.getPendingLoansSimple) {
  router.get('/pending/simple', authenticate, LoanAccountController.getPendingLoansSimple);
} else {
  console.error('WARNING: getPendingLoansSimple not available');
  router.get('/pending/simple', authenticate, (req, res) => {
    res.status(501).json({
      success: false,
      message: 'getPendingLoansSimple not implemented',
    });
  });
}

/**
 * @route   GET /api/loans/pending/summary
 * @desc    Get summary statistics of pending loans
 * @access  Private
 */
if (LoanAccountController?.getPendingLoansSummary) {
  router.get('/pending/summary', authenticate, LoanAccountController.getPendingLoansSummary);
} else {
  console.error('WARNING: getPendingLoansSummary not available');
  router.get('/pending/summary', authenticate, (req, res) => {
    res.status(501).json({
      success: false,
      message: 'getPendingLoansSummary not implemented',
    });
  });
}

/**
 * @route   GET /api/loans/pending/:accountNumber
 * @desc    Get details of a specific pending loan
 * @access  Private
 */
if (LoanAccountController?.getPendingLoanByAccount) {
  router.get('/pending/:accountNumber', authenticate, LoanAccountController.getPendingLoanByAccount);
} else {
  console.error('WARNING: getPendingLoanByAccount not available');
  router.get('/pending/:accountNumber', authenticate, (req, res) => {
    res.status(501).json({
      success: false,
      message: 'getPendingLoanByAccount not implemented',
    });
  });
}

/**
 * @route   GET /api/loans/pending/customer/:customerId
 * @desc    Get pending loans for a specific customer
 * @access  Private
 */
if (LoanAccountController?.getPendingLoansByCustomer) {
  router.get('/pending/customer/:customerId', authenticate, LoanAccountController.getPendingLoansByCustomer);
} else {
  console.error('WARNING: getPendingLoansByCustomer not available');
  router.get('/pending/customer/:customerId', authenticate, (req, res) => {
    res.status(501).json({
      success: false,
      message: 'getPendingLoansByCustomer not implemented',
    });
  });
}

/**
 * @route   POST /api/loans/pending/bulk-action
 * @desc    Perform bulk actions on pending loans (approve/reject)
 * @access  Private
 */
if (LoanAccountController?.bulkActionPendingLoans) {
  router.post('/pending/bulk-action', authenticate, LoanAccountController.bulkActionPendingLoans);
} else {
  console.error('WARNING: bulkActionPendingLoans not available');
  router.post('/pending/bulk-action', authenticate, (req, res) => {
    res.status(501).json({
      success: false,
      message: 'bulkActionPendingLoans not implemented',
    });
  });
}

// =========================
// LOAN ACCOUNT QUERY ENDPOINTS
// =========================

/**
 * @route   GET /api/loans/loan-account/:ACCT_NO
 * @desc    Get loan account details by account number
 * @access  Private
 */
if (LoanAccountController?.getLoanAccountByAcctNo) {
  router.get('/loan-account/:ACCT_NO', authenticate, LoanAccountController.getLoanAccountByAcctNo);
} else {
  console.error('WARNING: getLoanAccountByAcctNo not available');
  router.get('/loan-account/:ACCT_NO', authenticate, (req, res) => {
    const { ACCT_NO } = req.params;
    res.status(501).json({
      success: false,
      message: 'getLoanAccountByAcctNo not implemented',
      accountNumber: ACCT_NO,
    });
  });
}

/**
 * @route   GET /api/loans/customer/:custId
 * @desc    Get all loan accounts for a customer
 * @access  Private
 */
if (LoanAccountController?.getLoanAccountsByCustomerId) {
  router.get('/customer/:custId', authenticate, LoanAccountController.getLoanAccountsByCustomerId);
} else {
  console.error('WARNING: getLoanAccountsByCustomerId not available');
  router.get('/customer/:custId', authenticate, (req, res) => {
    const { custId } = req.params;
    res.status(501).json({
      success: false,
      message: 'getLoanAccountsByCustomerId not implemented',
      customerId: custId,
    });
  });
}

/**
 * @route   GET /api/loans
 * @desc    Get all loans (with optional filters)
 * @access  Private
 */
if (LoanAccountController?.getAllLoans) {
  router.get('/', authenticate, LoanAccountController.getAllLoans);
} else {
  console.error('WARNING: getAllLoans not available');
  router.get('/', authenticate, (req, res) => {
    res.status(501).json({
      success: false,
      message: 'getAllLoans not implemented',
    });
  });
}

// =========================
// LOAN BY ACCOUNT NUMBER (dynamic route - last among specifics)
// =========================

/**
 * @route   GET /api/loans/:acctNo
 * @desc    Get loan by account number (alternative endpoint)
 * @access  Private
 */
if (LoanAccountController?.getLoanByAccountNo) {
  router.get('/:acctNo', authenticate, (req, res, next) => {
    const { acctNo } = req.params;
    if (acctNo === 'pending') {
      return res.redirect(307, '/api/loans/pending');
    }
    return LoanAccountController.getLoanByAccountNo(req, res, next);
  });
} else {
  console.error('WARNING: getLoanByAccountNo not available');
  router.get('/:acctNo', authenticate, (req, res) => {
    const { acctNo } = req.params;
    if (acctNo === 'pending') {
      return res.redirect(307, '/api/loans/pending');
    }
    res.status(307).json({
      success: false,
      message: 'Use /api/loans/loan-account/:ACCT_NO instead',
      redirect: `/api/loans/loan-account/${acctNo}`,
    });
  });
}

// =========================
// LOAN APPLICATION & CREATION
// =========================

/**
 * @route   POST /api/loans/apply
 * @desc    Submit new loan application
 * @access  Private
 */
if (LoanAccountController?.applyForLoan) {
  router.post('/apply', authenticate, LoanAccountController.applyForLoan);
} else {
  console.error('WARNING: applyForLoan not available');
  router.post('/apply', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'applyForLoan not implemented' });
  });
}

// =========================
// LOAN APPROVAL & DISBURSEMENT
// =========================

/**
 * @route   POST /api/loans/approve-and-disburse
 * @desc    Approve and disburse loan
 * @access  Private
 */
if (LoanAccountController?.approveAndDisburseLoan) {
  router.post('/approve-and-disburse', authenticate, LoanAccountController.approveAndDisburseLoan);
} else {
  console.error('WARNING: approveAndDisburseLoan not available');
  router.post('/approve-and-disburse', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'approveAndDisburseLoan not implemented' });
  });
}

/**
 * @route   POST /api/loans/reject-disbursement
 * @desc    Reject loan disbursement
 * @access  Private
 */
if (LoanAccountController?.rejectDisbursement) {
  router.post('/reject-disbursement', authenticate, LoanAccountController.rejectDisbursement);
} else {
  console.error('WARNING: rejectDisbursement not available');
  router.post('/reject-disbursement', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'rejectDisbursement not implemented' });
  });
}

// =========================
// LOAN CONTRACT GENERATION
// =========================

/**
 * @route   POST /api/loans/generate-contract
 * @desc    Generate loan agreement/contract (JSON preview or file download)
 * @access  Private
 * @body    { ACCT_NO: string, generatedBy: string, download?: boolean, saveToDatabase?: boolean }
 */
if (LoanAccountController?.generateLoanContract) {
  router.post('/generate-contract', authenticate, LoanAccountController.generateLoanContract);
} else {
  console.error('WARNING: generateLoanContract not available in controller');
  router.post('/generate-contract', authenticate, (req, res) => {
    res.status(501).json({
      success: false,
      message: 'generateLoanContract not yet implemented',
      received: req.body,
      instruction: 'Implement generateLoanContract in LoanAccountController.js',
    });
  });
}

// =========================
// REPAYMENT STATUS ROUTES
// =========================

/**
 * @route   GET /api/loans/repayment/overview
 * @desc    Get repayment status overview dashboard
 * @access  Private (Loan Officers, Collections Agents, Branch Managers)
 */
if (LoanAccountController?.getRepaymentStatusOverview) {
  router.get('/repayment/overview', 
    authenticate, 
    authorize(['LOAN_OFFICER', 'COLLECTIONS_AGENT', 'BRANCH_MANAGER']),
    LoanAccountController.getRepaymentStatusOverview
  );
} else {
  console.error('WARNING: getRepaymentStatusOverview not available');
  router.get('/repayment/overview', authenticate, (req, res) => {
    res.status(501).json({
      success: false,
      message: 'getRepaymentStatusOverview not implemented',
    });
  });
}

// =========================
// UTILITY & HEALTH ROUTES
// =========================

/**
 * @route   GET /api/loans/health
 * @desc    Health check & available endpoints info
 * @access  Public
 */
router.get('/health', (req, res) => {
  const methods = LoanAccountController ? Object.keys(LoanAccountController) : [];

  const hasPendingMethods = [
    'getPendingLoans',
    'getPendingLoansSimple',
    'getPendingLoansSummary',
    'getPendingLoanByAccount',
    'getPendingLoansByCustomer',
    'bulkActionPendingLoans',
  ].some((m) => methods.includes(m));

  const hasContract = methods.includes('generateLoanContract');
  const hasRepaymentOverview = methods.includes('getRepaymentStatusOverview');

  res.json({
    success: true,
    message: 'Loan routes health check',
    controllerLoaded: !!LoanAccountController,
    timestamp: new Date().toISOString(),
    features: {
      pendingLoans: hasPendingMethods,
      contractGeneration: hasContract,
      repaymentOverview: hasRepaymentOverview,
    },
    availableEndpoints: {
      pending: '/api/loans/pending (and sub-routes)',
      contract: '/api/loans/generate-contract (POST)',
      queries: '/api/loans/loan-account/:ACCT_NO, /api/loans/customer/:custId, /api/loans',
      application: '/api/loans/apply (POST)',
      approval: '/api/loans/approve-and-disburse (POST)',
      rejection: '/api/loans/reject-disbursement (POST)',
      repayment: '/api/loans/repayment/overview (GET)',
    },
  });
});

export default router;