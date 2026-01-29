// src/routes/LoanAccountRoutes.js
import express from 'express';
import LoanAccountController from '../controllers/LoanAccountController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// DEBUG: Check controller exports
console.log('=== DEBUG: LoanAccountController ===');
console.log('Type:', typeof LoanAccountController);
if (LoanAccountController && typeof LoanAccountController === 'object') {
  const methods = Object.keys(LoanAccountController);
  console.log('Available methods:', methods);
  
  // Check for key methods including new repayment methods
  const keyMethods = {
    'getLoanAccountByAcctNo': methods.includes('getLoanAccountByAcctNo'),
    'getLoanAccountsByCustomerId': methods.includes('getLoanAccountsByCustomerId'),
    'getAllLoans': methods.includes('getAllLoans'),
    'approveAndDisburseLoan': methods.includes('approveAndDisburseLoan'),
    'rejectDisbursement': methods.includes('rejectDisbursement'),
    'applyForLoan': methods.includes('applyForLoan'),
    'rejectLoanApplication': methods.includes('rejectLoanApplication'),
    'recordRepayment': methods.includes('recordRepayment'),
    'processSchedulePayment': methods.includes('processSchedulePayment'),
    'recordManualRepayment': methods.includes('recordManualRepayment')
  };
  
  console.log('Key methods available:', keyMethods);
}

// =========================
// LOAN ACCOUNT QUERY ENDPOINTS
// =========================

/**
 * @route GET /api/loans/loan-account/:ACCT_NO
 * @description Get loan account by account number
 * @access Private (Authenticated users)
 */
if (LoanAccountController && LoanAccountController.getLoanAccountByAcctNo) {
  router.get('/loan-account/:ACCT_NO', authenticate, LoanAccountController.getLoanAccountByAcctNo);
} else {
  console.error('WARNING: getLoanAccountByAcctNo not available in controller');
  router.get('/loan-account/:ACCT_NO', authenticate, (req, res) => {
    const { ACCT_NO } = req.params;
    res.status(501).json({
      success: false,
      message: 'getLoanAccountByAcctNo not implemented',
      accountNumber: ACCT_NO,
      help: 'This endpoint returns loan account details by account number'
    });
  });
}

/**
 * @route GET /api/loans/customer/:custId
 * @description Get all loan accounts for a customer
 * @access Private (Authenticated users)
 */
if (LoanAccountController && LoanAccountController.getLoanAccountsByCustomerId) {
  router.get('/customer/:custId', authenticate, LoanAccountController.getLoanAccountsByCustomerId);
} else {
  console.error('WARNING: getLoanAccountsByCustomerId not available in controller');
  router.get('/customer/:custId', authenticate, (req, res) => {
    const { custId } = req.params;
    res.status(501).json({
      success: false,
      message: 'getLoanAccountsByCustomerId not implemented',
      customerId: custId,
      help: 'This endpoint returns all loan accounts for a customer'
    });
  });
}

/**
 * @route GET /api/loans/:acctNo
 * @description Alternative endpoint to get loan by account number
 * @access Private (Authenticated users)
 */
if (LoanAccountController && LoanAccountController.getLoanByAccountNo) {
  router.get('/:acctNo', authenticate, LoanAccountController.getLoanByAccountNo);
} else {
  console.error('WARNING: getLoanByAccountNo not available in controller');
  router.get('/:acctNo', authenticate, (req, res) => {
    const { acctNo } = req.params;
    res.status(307).json({
      success: false,
      message: 'Endpoint moved',
      redirect: `/api/loans/loan-account/${acctNo}`,
      note: 'Use GET /api/loans/loan-account/:ACCT_NO instead'
    });
  });
}

/**
 * @route GET /api/loans
 * @description Get all loans with optional filters
 * @access Private (Authenticated users)
 */
if (LoanAccountController && LoanAccountController.getAllLoans) {
  router.get('/', authenticate, LoanAccountController.getAllLoans);
} else {
  console.error('WARNING: getAllLoans not available in controller');
  router.get('/', authenticate, (req, res) => {
    res.status(501).json({
      success: false,
      message: 'getAllLoans not implemented',
      help: 'This endpoint returns all loans with optional filtering'
    });
  });
}

// =========================
// LOAN APPLICATION & CREATION
// =========================

/**
 * @route POST /api/loans/apply
 * @description Apply for a new loan
 * @access Private (Authenticated users)
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
 * @route POST /api/loans
 * @description Create a new loan account (alternative to apply)
 * @access Private (Authenticated users)
 */
if (LoanAccountController && LoanAccountController.createLoanAccount) {
  router.post('/', authenticate, LoanAccountController.createLoanAccount);
} else {
  console.error('WARNING: createLoanAccount not available in controller');
  router.post('/', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'createLoanAccount not implemented' });
  });
}

// =========================
// LOAN APPROVAL & DISBURSEMENT
// =========================

/**
 * @route POST /api/loans/approve-and-disburse
 * @description Approve and auto-disburse loan in one step
 * @access Private (Authenticated users)
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
 * @route POST /api/loans/approve
 * @description Approve a loan application (with auto-disbursement) - legacy
 * @access Private (Authenticated users)
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
 * @route POST /api/loans/execute-disbursement
 * @description Execute a pending disbursement
 * @access Private (Authenticated users)
 */
if (LoanAccountController && LoanAccountController.executeDisbursement) {
  router.post('/execute-disbursement', authenticate, LoanAccountController.executeDisbursement);
} else {
  console.error('WARNING: executeDisbursement not available in controller');
  router.post('/execute-disbursement', authenticate, (req, res) => {
    res.status(501).json({ 
      success: false, 
      message: 'executeDisbursement not implemented' 
    });
  });
}

/**
 * @route POST /api/loans/disburse
 * @description Direct disbursement (for backward compatibility)
 * @access Private (Authenticated users)
 */
if (LoanAccountController && LoanAccountController.disburseLoan) {
  router.post('/disburse', authenticate, LoanAccountController.disburseLoan);
} else {
  console.error('WARNING: disburseLoan not available in controller');
  router.post('/disburse', authenticate, (req, res) => {
    res.status(501).json({ success: false, message: 'disburseLoan not implemented' });
  });
}

// =========================
// LOAN REJECTION ENDPOINTS
// =========================

/**
 * @route POST /api/loans/reject
 * @description Reject a loan application (general rejection - for backward compatibility)
 * @access Private (Authenticated users)
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

/**
 * @route POST /api/loans/reject-disbursement
 * @description Reject a loan disbursement request
 * @access Private (Authenticated users)
 */
if (LoanAccountController && LoanAccountController.rejectDisbursement) {
  router.post('/reject-disbursement', authenticate, LoanAccountController.rejectDisbursement);
} else {
  console.error('WARNING: rejectDisbursement not available in controller');
  router.post('/reject-disbursement', authenticate, (req, res) => {
    res.status(501).json({ 
      success: false, 
      message: 'rejectDisbursement not implemented' 
    });
  });
}

// =========================
// LOAN REPAYMENT & SERVICING ENDPOINTS
// =========================

/**
 * @route POST /api/loans/:acctNo/repayment
 * @description Record a loan repayment (legacy endpoint)
 * @access Private (Authenticated users)
 */
if (LoanAccountController && LoanAccountController.recordRepayment) {
  router.post('/:acctNo/repayment', authenticate, LoanAccountController.recordRepayment);
} else {
  console.error('WARNING: recordRepayment not available in controller');
  router.post('/:acctNo/repayment', authenticate, (req, res) => {
    const { acctNo } = req.params;
    res.status(501).json({
      success: false,
      message: 'recordRepayment not implemented',
      accountNumber: acctNo,
      help: 'This endpoint records loan repayments'
    });
  });
}

/**
 * @route POST /api/loans/:ACCT_NO/payment/schedule
 * @description Process loan repayment against schedule
 * @access Private (Authenticated users)
 * 
 * @param {String} ACCT_NO - Loan account number
 * @body {Number} amount - Payment amount
 * @body {String} customerAccountNo - Customer's account number for debit
 * @body {String} [paymentMethod=CASH] - Payment method (CASH, BANK_TRANSFER, CHEQUE, MOBILE_MONEY)
 * @body {String} [referenceNumber] - Transaction reference number
 * @body {String} [description] - Payment description
 * @body {Date} [paymentDate] - Payment date (defaults to now)
 * @body {String} [createdBy=SYSTEM] - User who created the payment
 * @body {String} [branchCode=001] - Branch code
 * @body {String} [productCode=DEFAULT] - Product code
 * @body {String} [receiptNo] - Receipt number
 * 
 * @returns {Object} Payment processing result with breakdown
 * 
 * @example
 * POST /api/loans/10017345077/payment/schedule
 * {
 *   "amount": 10000.00,
 *   "customerAccountNo": "10012345678",
 *   "paymentMethod": "BANK_TRANSFER",
 *   "referenceNumber": "TXN-123456",
 *   "description": "Monthly loan repayment",
 *   "paymentDate": "2024-01-15"
 * }
 */
if (LoanAccountController && LoanAccountController.processSchedulePayment) {
  router.post('/:ACCT_NO/payment/schedule', authenticate, LoanAccountController.processSchedulePayment);
} else {
  console.error('WARNING: processSchedulePayment not available in controller');
  router.post('/:ACCT_NO/payment/schedule', authenticate, (req, res) => {
    const { ACCT_NO } = req.params;
    res.status(501).json({
      success: false,
      message: 'processSchedulePayment not implemented',
      accountNumber: ACCT_NO,
      help: 'This endpoint processes loan repayments against the schedule'
    });
  });
}

/**
 * @route POST /api/loans/:ACCT_NO/payment/manual
 * @description Record manual loan repayment
 * @access Private (Authenticated users)
 * 
 * @param {String} ACCT_NO - Loan account number
 * @body {Number} amount - Payment amount
 * @body {Number} [principalPaid] - Principal amount paid
 * @body {Number} [interestPaid] - Interest amount paid
 * @body {Date} [date] - Payment date (defaults to now)
 * @body {String} [paymentMethod=MANUAL] - Payment method
 * @body {String} [referenceNumber] - Transaction reference
 * @body {String} [description] - Payment description
 * @body {Boolean} [updateOutstanding=true] - Whether to update outstanding balance
 * @body {String} [receiptNo] - Receipt number
 * @body {String} [branchCode=001] - Branch code
 * @body {String} [productCode=DEFAULT] - Product code
 * 
 * @returns {Object} Created repayment records
 * 
 * @example
 * POST /api/loans/10017345077/payment/manual
 * {
 *   "amount": 5000.00,
 *   "principalPaid": 4000.00,
 *   "interestPaid": 1000.00,
 *   "paymentMethod": "CASH",
 *   "referenceNumber": "CASH-123",
 *   "description": "Cash payment at branch"
 * }
 */
if (LoanAccountController && LoanAccountController.recordManualRepayment) {
  router.post('/:ACCT_NO/payment/manual', authenticate, LoanAccountController.recordManualRepayment);
} else {
  console.error('WARNING: recordManualRepayment not available in controller');
  router.post('/:ACCT_NO/payment/manual', authenticate, (req, res) => {
    const { ACCT_NO } = req.params;
    res.status(501).json({
      success: false,
      message: 'recordManualRepayment not implemented',
      accountNumber: ACCT_NO,
      help: 'This endpoint records manual loan repayments'
    });
  });
}

/**
 * @route GET /api/loans/:acctNo/repayment-schedule
 * @description Get loan repayment schedule
 * @access Private (Authenticated users)
 */
if (LoanAccountController && LoanAccountController.getRepaymentSchedule) {
  router.get('/:acctNo/repayment-schedule', authenticate, LoanAccountController.getRepaymentSchedule);
} else {
  console.error('WARNING: getRepaymentSchedule not available in controller');
  router.get('/:acctNo/repayment-schedule', authenticate, (req, res) => {
    const { acctNo } = req.params;
    res.status(501).json({
      success: false,
      message: 'getRepaymentSchedule not implemented',
      accountNumber: acctNo
    });
  });
}

/**
 * @route GET /api/loans/:acctNo/repayment-history
 * @description Get loan repayment history
 * @access Private (Authenticated users)
 */
if (LoanAccountController && LoanAccountController.getRepaymentHistory) {
  router.get('/:acctNo/repayment-history', authenticate, LoanAccountController.getRepaymentHistory);
} else {
  console.error('WARNING: getRepaymentHistory not available in controller');
  router.get('/:acctNo/repayment-history', authenticate, (req, res) => {
    const { acctNo } = req.params;
    res.status(501).json({
      success: false,
      message: 'getRepaymentHistory not implemented',
      accountNumber: acctNo
    });
  });
}

/**
 * @route GET /api/loans/:acctNo/transactions
 * @description Get loan repayment transactions
 * @access Private (Authenticated users)
 */
if (LoanAccountController && LoanAccountController.getLoanTransactions) {
  router.get('/:acctNo/transactions', authenticate, LoanAccountController.getLoanTransactions);
} else {
  console.error('WARNING: getLoanTransactions not available in controller');
  router.get('/:acctNo/transactions', authenticate, (req, res) => {
    const { acctNo } = req.params;
    res.status(501).json({
      success: false,
      message: 'getLoanTransactions not implemented',
      accountNumber: acctNo,
      help: 'This endpoint returns loan repayment transactions from loan_repayment_transactions table'
    });
  });
}

// =========================
// LOAN MANAGEMENT & UPDATES
// =========================

/**
 * @route PUT /api/loans/:acctNo/status
 * @description Update loan status
 * @access Private (Authenticated users)
 */
if (LoanAccountController && LoanAccountController.updateLoanStatus) {
  router.put('/:acctNo/status', authenticate, LoanAccountController.updateLoanStatus);
} else {
  console.error('WARNING: updateLoanStatus not available in controller');
  router.put('/:acctNo/status', authenticate, (req, res) => {
    const { acctNo } = req.params;
    res.status(501).json({
      success: false,
      message: 'updateLoanStatus not implemented',
      accountNumber: acctNo
    });
  });
}

/**
 * @route PUT /api/loans/:acctNo
 * @description Update loan account details
 * @access Private (Authenticated users)
 */
if (LoanAccountController && LoanAccountController.updateLoanAccount) {
  router.put('/:acctNo', authenticate, LoanAccountController.updateLoanAccount);
} else {
  console.error('WARNING: updateLoanAccount not available in controller');
  router.put('/:acctNo', authenticate, (req, res) => {
    const { acctNo } = req.params;
    res.status(501).json({
      success: false,
      message: 'updateLoanAccount not implemented',
      accountNumber: acctNo
    });
  });
}

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
    timestamp: new Date().toISOString(),
    endpoints: {
      'Get loan by account': '/api/loans/loan-account/:ACCT_NO',
      'Get loans by customer': '/api/loans/customer/:custId',
      'Get all loans': '/api/loans',
      'Apply for loan': '/api/loans/apply',
      'Approve and disburse': '/api/loans/approve-and-disburse',
      'Reject disbursement': '/api/loans/reject-disbursement',
      'Process schedule payment': '/api/loans/:ACCT_NO/payment/schedule',
      'Record manual payment': '/api/loans/:ACCT_NO/payment/manual',
      'Get repayment schedule': '/api/loans/:acctNo/repayment-schedule',
      'Get repayment history': '/api/loans/:acctNo/repayment-history',
      'Get transactions': '/api/loans/:acctNo/transactions'
    }
  });
});

/**
 * @route GET /api/loans/test-endpoints
 * @description Test endpoint availability
 */
router.get('/test-endpoints', (req, res) => {
  res.json({
    success: true,
    endpoints: [
      // GET Endpoints
      { method: 'GET', path: '/api/loans/loan-account/:ACCT_NO', description: 'Get loan account by number' },
      { method: 'GET', path: '/api/loans/customer/:custId', description: 'Get loans by customer ID' },
      { method: 'GET', path: '/api/loans', description: 'Get all loans with filters' },
      { method: 'GET', path: '/api/loans/:acctNo/repayment-schedule', description: 'Get repayment schedule' },
      { method: 'GET', path: '/api/loans/:acctNo/repayment-history', description: 'Get repayment history' },
      { method: 'GET', path: '/api/loans/:acctNo/transactions', description: 'Get loan transactions' },
      { method: 'GET', path: '/api/loans/health', description: 'Health check' },
      { method: 'GET', path: '/api/loans/test-endpoints', description: 'List all endpoints' },
      
      // POST Endpoints
      { method: 'POST', path: '/api/loans/apply', description: 'Apply for a new loan' },
      { method: 'POST', path: '/api/loans/approve-and-disburse', description: 'Approve and disburse loan' },
      { method: 'POST', path: '/api/loans/reject-disbursement', description: 'Reject loan disbursement' },
      { method: 'POST', path: '/api/loans/reject', description: 'Reject loan application' },
      { method: 'POST', path: '/api/loans/disburse', description: 'Direct disbursement' },
      { method: 'POST', path: '/api/loans/execute-disbursement', description: 'Execute pending disbursement' },
      { method: 'POST', path: '/api/loans/:acctNo/repayment', description: 'Record loan repayment (legacy)' },
      { method: 'POST', path: '/api/loans/:ACCT_NO/payment/schedule', description: 'Process schedule payment' },
      { method: 'POST', path: '/api/loans/:ACCT_NO/payment/manual', description: 'Record manual payment' },
      
      // PUT Endpoints
      { method: 'PUT', path: '/api/loans/:acctNo/status', description: 'Update loan status' },
      { method: 'PUT', path: '/api/loans/:acctNo', description: 'Update loan account details' }
    ],
    note: 'All endpoints require authentication via JWT token',
    totalEndpoints: 21
  });
});

// =========================
// DEBUG & DIAGNOSTIC ROUTES (should be last)
// =========================

/**
 * Debug route to see all incoming GET requests
 */
router.get('*', (req, res) => {
  console.log('📨 DEBUG: Incoming GET request to loans routes');
  console.log('Path:', req.path);
  console.log('Original URL:', req.originalUrl);
  console.log('Params:', req.params);
  console.log('Query:', req.query);
  
  res.json({
    message: 'Debug: You hit the loans route',
    path: req.path,
    originalUrl: req.originalUrl,
    params: req.params,
    query: req.query,
    availableEndpoints: {
      'GET /api/loans/loan-account/:ACCT_NO': 'Get loan by account number',
      'GET /api/loans/customer/:custId': 'Get loans by customer ID',
      'GET /api/loans/:acctNo': 'Get loan by account number (alt)',
      'GET /api/loans': 'Get all loans',
      'GET /api/loans/health': 'Health check',
      'POST /api/loans/apply': 'Apply for loan',
      'POST /api/loans/approve-and-disburse': 'Approve and disburse',
      'POST /api/loans/reject-disbursement': 'Reject disbursement',
      'POST /api/loans/:ACCT_NO/payment/schedule': 'Process schedule payment',
      'POST /api/loans/:ACCT_NO/payment/manual': 'Record manual payment'
    }
  });
});

/**
 * Debug route for POST requests
 */
router.post('*', (req, res) => {
  console.log('📨 DEBUG: Incoming POST request to loans routes');
  console.log('Path:', req.path);
  console.log('Body:', req.body);
  
  res.json({
    message: 'Debug: POST request received',
    path: req.path,
    body: req.body,
    availableEndpoints: {
      'POST /api/loans/apply': 'Apply for loan',
      'POST /api/loans/approve-and-disburse': 'Approve and disburse',
      'POST /api/loans/reject-disbursement': 'Reject disbursement',
      'POST /api/loans/reject': 'Reject loan application',
      'POST /api/loans/:ACCT_NO/payment/schedule': 'Process schedule payment',
      'POST /api/loans/:ACCT_NO/payment/manual': 'Record manual payment'
    }
  });
});

export default router;