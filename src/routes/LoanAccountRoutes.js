// src/routes/LoanAccountRoutes.js
import express from 'express';
import LoanAccountController from '../controllers/LoanAccountController.js';  // ✅ FIXED: default import
import { authenticate, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Helper to safely check if a method exists in the controller
const hasMethod = (method) => {
  return LoanAccountController && typeof LoanAccountController[method] === 'function';
};

// =========================
// PENDING LOAN ENDPOINTS
// =========================

if (hasMethod('getPendingLoans')) {
  router.get('/pending', authenticate, LoanAccountController.getPendingLoans);
} else {
  router.get('/pending', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'getPendingLoans not implemented' });
  });
}

if (hasMethod('getPendingLoansSimple')) {
  router.get('/pending/simple', authenticate, LoanAccountController.getPendingLoansSimple);
} else {
  router.get('/pending/simple', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'getPendingLoansSimple not implemented' });
  });
}

if (hasMethod('getPendingLoansSummary')) {
  router.get('/pending/summary', authenticate, LoanAccountController.getPendingLoansSummary);
} else {
  router.get('/pending/summary', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'getPendingLoansSummary not implemented' });
  });
}

if (hasMethod('getPendingLoanByAccount')) {
  router.get('/pending/:accountNumber', authenticate, LoanAccountController.getPendingLoanByAccount);
} else {
  router.get('/pending/:accountNumber', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'getPendingLoanByAccount not implemented' });
  });
}

if (hasMethod('getPendingLoansByCustomer')) {
  router.get('/pending/customer/:customerId', authenticate, LoanAccountController.getPendingLoansByCustomer);
} else {
  router.get('/pending/customer/:customerId', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'getPendingLoansByCustomer not implemented' });
  });
}

if (hasMethod('bulkActionPendingLoans')) {
  router.post('/pending/bulk-action', authenticate, LoanAccountController.bulkActionPendingLoans);
} else {
  router.post('/pending/bulk-action', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'bulkActionPendingLoans not implemented' });
  });
}

// =========================
// LOAN ACCOUNT QUERY ENDPOINTS
// =========================

if (hasMethod('getLoanAccountByAcctNo')) {
  router.get('/loan-account/:ACCT_NO', authenticate, LoanAccountController.getLoanAccountByAcctNo);
} else {
  router.get('/loan-account/:ACCT_NO', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'getLoanAccountByAcctNo not implemented' });
  });
}

if (hasMethod('getLoanAccountsByCustomerId')) {
  router.get('/customer/:custId', authenticate, LoanAccountController.getLoanAccountsByCustomerId);
} else {
  router.get('/customer/:custId', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'getLoanAccountsByCustomerId not implemented' });
  });
}

// =========================
// LOAN BALANCE FOR CUSTOMER
// =========================
// Summary endpoint (fast, no repayment schedules)
if (hasMethod('getLoanBalanceForCustomer')) {
  router.get('/balance/:CUST_ID', authenticate, LoanAccountController.getLoanBalanceForCustomer);
} else {
  router.get('/balance/:CUST_ID', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'getLoanBalanceForCustomer not implemented' });
  });
}

// Detailed endpoint (with repayment schedules)
if (hasMethod('getLoanBalanceForCustomerDetailed')) {
  router.get('/balance/:CUST_ID/detailed', authenticate, LoanAccountController.getLoanBalanceForCustomerDetailed);
} else {
  router.get('/balance/:CUST_ID/detailed', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'getLoanBalanceForCustomerDetailed not implemented' });
  });
}

if (hasMethod('getAllLoans')) {
  router.get('/', authenticate, LoanAccountController.getAllLoans);
} else {
  router.get('/', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'getAllLoans not implemented' });
  });
}

// =========================
// LOANS DISBURSED BY USER (NEW)
// =========================

if (hasMethod('getLoansDisbursedByUser')) {
  router.get('/disbursed-by-user/:userId', authenticate, LoanAccountController.getLoansDisbursedByUser);
} else {
  router.get('/disbursed-by-user/:userId', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'getLoansDisbursedByUser not implemented' });
  });
}

// Stats endpoint for loans disbursed by user
if (hasMethod('getLoansDisbursedByUserStats')) {
  router.get('/disbursed-by-user/:userId/stats', authenticate, LoanAccountController.getLoansDisbursedByUserStats);
} else {
  router.get('/disbursed-by-user/:userId/stats', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'getLoansDisbursedByUserStats not implemented' });
  });
}

// =========================
// LOAN REJECTION ENDPOINT (NEW)
// =========================

if (hasMethod('rejectLoanApplication')) {
 router.post('/reject', 
  authenticate, 
  authorize(['LOAN_OFFICER', 'BRANCH_MANAGER', 'UNDERWRITER', 'Branch Manager']),
  LoanAccountController.rejectLoanApplication
);
} else {
  router.post('/reject', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'rejectLoanApplication not implemented' });
  });
}

// =========================
// LOAN BY ACCOUNT NUMBER (catch‑all after specific routes)
// =========================

if (hasMethod('getLoanByAccountNo')) {
  router.get('/:acctNo', authenticate, (req, res, next) => {
    const { acctNo } = req.params;
    if (acctNo === 'pending') {
      return res.redirect(307, '/api/loans/pending');
    }
    if (acctNo === 'balance') {
      return res.redirect(307, '/api/loans/balance');
    }
    if (acctNo === 'disbursed-by-user') {
      return res.redirect(307, '/api/loans/disbursed-by-user');
    }
    return LoanAccountController.getLoanByAccountNo(req, res, next);
  });
} else {
  router.get('/:acctNo', authenticate, (req, res) => {
    const { acctNo } = req.params;
    if (acctNo === 'pending') {
      return res.redirect(307, '/api/loans/pending');
    }
    if (acctNo === 'balance') {
      return res.redirect(307, '/api/loans/balance');
    }
    if (acctNo === 'disbursed-by-user') {
      return res.redirect(307, '/api/loans/disbursed-by-user');
    }
    res.status(501).json({ success: false, message: 'getLoanByAccountNo not implemented' });
  });
}

// =========================
// LOAN APPLICATION & CREATION
// =========================

if (hasMethod('applyForLoan')) {
  router.post('/apply', authenticate, LoanAccountController.applyForLoan);
} else {
  router.post('/apply', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'applyForLoan not implemented' });
  });
}

// =========================
// LOAN APPROVAL & DISBURSEMENT
// =========================

if (hasMethod('approveAndDisburseLoan')) {
  router.post('/approve-and-disburse', authenticate, LoanAccountController.approveAndDisburseLoan);
} else {
  router.post('/approve-and-disburse', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'approveAndDisburseLoan not implemented' });
  });
}

if (hasMethod('rejectDisbursement')) {
  router.post('/reject-disbursement', authenticate, LoanAccountController.rejectDisbursement);
} else {
  router.post('/reject-disbursement', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'rejectDisbursement not implemented' });
  });
}

// =========================
// LOAN CONTRACT GENERATION
// =========================

if (hasMethod('generateLoanContract')) {
  router.post('/generate-contract', authenticate, LoanAccountController.generateLoanContract);
} else {
  router.post('/generate-contract', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'generateLoanContract not implemented' });
  });
}

// =========================
// REPAYMENT STATUS ROUTES
// =========================

if (hasMethod('getRepaymentStatusOverview')) {
  router.get('/repayment/overview', 
    authenticate, 
    authorize(['LOAN_OFFICER', 'COLLECTIONS_AGENT', 'BRANCH_MANAGER']),
    LoanAccountController.getRepaymentStatusOverview
  );
} else {
  router.get('/repayment/overview', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'getRepaymentStatusOverview not implemented' });
  });
}

// =========================
// HEALTH CHECK
// =========================
router.get('/health', (req, res) => {
  const methods = LoanAccountController ? Object.keys(LoanAccountController) : [];
  res.json({
    success: true,
    message: 'Loan routes health check',
    controllerLoaded: !!LoanAccountController,
    availableEndpoints: methods,
    timestamp: new Date().toISOString()
  });
});

export default router;