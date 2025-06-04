import express from 'express';
import { createDepositTransaction, getTransactionsByAcctNo, getTransactionRefNosByAcctNo } from '../controllers/DepositTransactionController.js';

const router = express.Router();

// Route for creating a transaction (formerly a deposit)
router.post('/create', createDepositTransaction);

// Route for fetching transactions by account number
router.get('/:acctNo', getTransactionsByAcctNo);

// Route for fetching transaction reference numbers by account number
router.get('/:acctNo/refs', getTransactionRefNosByAcctNo);  // Updated route to fetch transaction reference numbers

export default router;
