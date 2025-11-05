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
} from '../controllers/DepositController.js';

// import decryptPayload from '../middlewares/decryptPayload.js'; // 👈 Import middleware

const router = express.Router();

// Route for creating a deposit transaction (with decryption middleware)
router.post('/create',  createDeposit);

// Route for fetching all deposits
router.get('/', getAllDeposits);

// Route for fetching a deposit by account number (ACCT_NO)
router.get('/acct/:acct_no', getDepositByAcctNo);

// Route for updating a deposit by account number (ACCT_NO)
router.put('/acct/:acct_no', updateDepositByAcctNo);

// Route for deleting a deposit by account number (ACCT_NO)
router.delete('/acct/:acct_no', deleteDepositByAcctNo);

// Generate account details
router.get('/generate-deposit-account', generateDepositAccountDetails);

// Get by customer ID
router.get('/by-cust-id/:cust_id', getDepositByCustId);

export default router;
