import express from 'express';
import {
    createLoanAccountDetails,
    getLoanAccountDetails,
    updateLoanAccountDetails,
    getLoanAccountBalance,
    getLoanAccountTerms,
    getLoanAccountStatus,
    getCustomerLoanAccounts,
    generateLoanAccountStatement
} from '../controllers/LoanAccountDetailsController.js';

const router = express.Router();

// Create a new loan account
router.post('/', createLoanAccountDetails);

// Get loan account details by account number
router.get('/:ACCT_NO', getLoanAccountDetails);

// Update loan account details
router.put('/:ACCT_NO', updateLoanAccountDetails);

// Get loan account balance information
router.get('/:ACCT_NO/balance', getLoanAccountBalance);

// Get loan account terms
router.get('/:ACCT_NO/terms', getLoanAccountTerms);

// Get loan account status
router.get('/:ACCT_NO/status', getLoanAccountStatus);

// Get all loan accounts for a customer
router.get('/customer/:CUST_ID', getCustomerLoanAccounts);

// Generate loan account statement
router.get('/:ACCT_NO/statement', generateLoanAccountStatement);

export default router;