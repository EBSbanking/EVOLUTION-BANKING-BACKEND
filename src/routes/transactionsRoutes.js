import express from 'express';
import { 
  createTransaction, 
  getAllTransactions, 
  getTransactionByAcctNo, 
  deleteTransaction,
  approveTransaction,
  createBulkTransactions
} from '../controllers/TransactionController.js';

const router = express.Router();

// Routes for transactions
router.post('/create', createTransaction);
router.get('/all', getAllTransactions);
router.post('/approved', approveTransaction);
router.get('/acct/:ACCT_NO', getTransactionByAcctNo);  // Fetch by Account Number
router.delete('/delete/:id', deleteTransaction);
router.post('/bulk-posting', createBulkTransactions );

export default router;
