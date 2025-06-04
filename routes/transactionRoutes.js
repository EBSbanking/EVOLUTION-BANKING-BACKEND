import express from 'express';
import { 
  createTransaction, 
  getAllTransactions, 
  getTransactionByAcctNo, 
  deleteTransaction 
} from '../controllers/TransactionController.js';

const router = express.Router();

// Routes for transactions
router.post('/create', createTransaction);
router.get('/all', getAllTransactions);
router.get('/acct/:ACCT_NO', getTransactionByAcctNo);  // Fetch by Account Number
router.delete('/delete/:id', deleteTransaction);

export default router;
