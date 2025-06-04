// routes/DepositRoutes.js
import express from 'express';
import { 
    generateDepositAccountDetails, 
    createDeposit,
    getAllDeposits,
    getDepositByAcctNo,
    updateDepositByAcctNo,
    deleteDepositByAcctNo,
    getDepositByCustId
} from '../controllers/DepositController.js'; // Import the controller methods

const router = express.Router();

// Route for creating a deposit transaction
router.post('/create', createDeposit);

// Route for fetching all deposits
router.get('/create', getAllDeposits);

// Route for fetching a deposit by account number (ACCT_NO)
router.get('/:acct_no', getDepositByAcctNo);

// Route for updating a deposit by account number (ACCT_NO)
router.put('/:acct_no', updateDepositByAcctNo);

// Route for deleting a deposit by account number (ACCT_NO)
router.delete('/:acct_no', deleteDepositByAcctNo);

// Correct the generate account details route to use GET
router.get('/generate-deposit-account', generateDepositAccountDetails);

router.get('/by-cust-id/:cust_id', getDepositByCustId);


export default router;  // Default export
