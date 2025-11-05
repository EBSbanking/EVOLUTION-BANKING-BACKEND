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

// IMPORT AUTHENTICATION MIDDLEWARE - TRY DIFFERENT PATHS
// Option 1: If authMiddleware is in the same directory
// import { authenticate } from './authMiddleware.js';

// Option 2: If authMiddleware is in ../middleware/ (most likely)
import { authenticate } from '../middlewares/authMiddleware.js';

// Option 3: If authMiddleware is in ../../middleware/
// import { authenticate } from '../../middleware/authMiddleware.js';

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
// DISBURSEMENT ROUTES (WITH AUTHENTICATION - FIXED)
// =========================
router.post('/disburse', authenticate, validateLoanDisbursement, LoanAccountController.disburseLoan);
router.post('/reject-disbursement', authenticate, LoanAccountController.rejectLoanDisbursement);
router.post('/approve-disbursement', authenticate, LoanAccountController.approveLoanDisbursement);

// =========================
// LOAN INFORMATION (WITH AUTHENTICATION)
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

export default router;