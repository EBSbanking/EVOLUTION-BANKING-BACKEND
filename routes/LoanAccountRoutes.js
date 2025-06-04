import express from 'express';
import { 
    applyForLoan, 
    disburseLoan, 
    getLoanAccountByAcctNo, 
     
    
} from '../controllers/LoanAccountController.js';  // Adjust path as needed

const router = express.Router();


// Route for disbursing a loan
router.post('/disburse', disburseLoan);

// Route for applying for a loan
router.post('/apply', applyForLoan);

// Route for fetching a loan account by ACCT_NO
router.get('/loanAccount/:ACCT_NO', getLoanAccountByAcctNo);


export default router;
