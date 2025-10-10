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

// CORE LOAN OPERATIONS
router.post('/apply', LoanAccountController.applyForLoan);
router.post('/apply-with-guarantor', applyLoanWithGuarantorWorkflow);

// ACCOUNT NUMBER GENERATION
router.get('/generate-loan-account/:prodId', async (req, res) => {
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

// APPROVAL WORKFLOW
router.post('/approve', LoanAccountController.approveLoanApplication);
router.post('/reject', validateLoanRejection, LoanAccountController.rejectLoanApplication);
router.post('/approve-with-guarantor', approveLoanWithGuarantor);

// DISBURSEMENT ROUTES
router.post('/disburse', validateLoanDisbursement, LoanAccountController.disburseLoan);
router.post('/reject-disbursement', LoanAccountController.rejectLoanDisbursement);
router.post('/approve-disbursement', LoanAccountController.approveLoanDisbursement);

// LOAN INFORMATION
router.get('/:ACCT_NO', LoanAccountController.getLoanAccountByAcctNo);
router.get('/loan-account/:ACCT_NO', LoanAccountController.getLoanAccountByAcctNo);
router.get('/by-customer/:custId', LoanAccountController.getLoanAccountsByCustomerId); // Updated route
router.get('/interest/:ACCT_NO', LoanAccountController.getLoanInterestDetails);
router.get('/applications/:loanId', getLoanApplicationDetails);
router.get('/applications/:loanId/risk-assessment', getLoanRiskAssessment);

// GUARANTOR ROUTES
router.post('/guarantors/:guarantorId/verification', verifyGuarantor);
router.get('/guarantors/:guarantorId', getLoanApplicationDetails);

export default router;