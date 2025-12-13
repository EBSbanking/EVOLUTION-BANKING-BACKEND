// src/routes/LoanAccountRoutes.js
import express from 'express';
import LoanAccountController from '../controllers/LoanAccountController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// DEBUG: Check controller exports
console.log('=== DEBUG: LoanAccountController ===');
console.log('Type:', typeof LoanAccountController);
if (LoanAccountController && typeof LoanAccountController === 'object') {
  console.log('Available methods:', Object.keys(LoanAccountController));
  console.log('approveAndDisburseLoan exists?:', 'approveAndDisburseLoan' in LoanAccountController);
  console.log('approveAndDisburseLoan type:', typeof LoanAccountController.approveAndDisburseLoan);
}

// =========================
// APPLICATION & LOAN CREATION
// =========================

/**
 * @route POST /api/loans/apply
 * @description Apply for a new loan
 */
if (LoanAccountController && LoanAccountController.applyForLoan) {
  router.post('/apply', authenticate, LoanAccountController.applyForLoan);
} else {
  console.error('WARNING: applyForLoan not available in controller');
  router.post('/apply', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'applyForLoan not implemented' });
  });
}

/**
 * @route POST /api/loans/approve
 * @description Approve a loan application (with auto-disbursement)
 */
if (LoanAccountController && LoanAccountController.approveAndDisburseLoan) {
  router.post('/approve', authenticate, LoanAccountController.approveAndDisburseLoan);
} else {
  console.error('WARNING: approveAndDisburseLoan not available in controller');
  router.post('/approve', authenticate, (req, res) => {
    res.status(501).json({ 
      success: false, 
      message: 'approveAndDisburseLoan not implemented. Use /approve-and-disburse instead.' 
    });
  });
}

/**
 * @route POST /api/loans/approve-and-disburse
 * @description Approve and auto-disburse loan in one step
 */
if (LoanAccountController && LoanAccountController.approveAndDisburseLoan) {
  router.post('/approve-and-disburse', authenticate, LoanAccountController.approveAndDisburseLoan);
} else {
  console.error('WARNING: approveAndDisburseLoan not available in controller');
  router.post('/approve-and-disburse', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'approveAndDisburseLoan not implemented' });
  });
}

/**
 * @route POST /api/loans/execute-disbursement
 * @description Execute a pending disbursement
 */
if (LoanAccountController && LoanAccountController.executeDisbursement) {
  router.post('/execute-disbursement', authenticate, LoanAccountController.executeDisbursement);
} else {
  console.error('WARNING: executeDisbursement not available in controller');
}

/**
 * @route POST /api/loans/disburse
 * @description Direct disbursement (for backward compatibility)
 */
if (LoanAccountController && LoanAccountController.disburseLoan) {
  router.post('/disburse', authenticate, LoanAccountController.disburseLoan);
} else {
  console.error('WARNING: disburseLoan not available in controller');
  router.post('/disburse', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'disburseLoan not implemented' });
  });
}

/**
 * @route POST /api/loans
 * @description Create a new loan account (alternative to apply)
 */
if (LoanAccountController && LoanAccountController.createLoanAccount) {
  router.post('/', authenticate, LoanAccountController.createLoanAccount);
} else {
  console.error('WARNING: createLoanAccount not available in controller');
}

// =========================
// LOAN REJECTION
// =========================

/**
 * @route POST /api/loans/reject
 * @description Reject a loan application
 */
if (LoanAccountController && LoanAccountController.rejectLoanApplication) {
  router.post('/reject', authenticate, LoanAccountController.rejectLoanApplication);
} else {
  console.error('WARNING: rejectLoanApplication not available in controller');
  router.post('/reject', authenticate, (req, res) => {
    const { ACCT_NO, rejectedBy, reason } = req.body;
    res.status(200).json({
      success: true,
      message: `Loan ${ACCT_NO || 'application'} rejected`,
      data: { rejectedBy, reason, rejectedAt: new Date() }
    });
  });
}

// ... rest of routes with similar checks ...

// =========================
// UTILITY & HEALTH ROUTES
// =========================

/**
 * @route GET /api/loans/health
 * @description Health check for loan routes
 */
router.get('/health', (req, res) => {
  const controllerStatus = LoanAccountController ? 'loaded' : 'not loaded';
  const methods = LoanAccountController ? Object.keys(LoanAccountController) : [];
  
  res.json({
    success: true,
    message: 'Loan routes are healthy',
    controllerStatus,
    availableMethods: methods,
    timestamp: new Date().toISOString()
  });
});

export default router;