import express from 'express';
import {
  createGLAccountTransaction,
  createDoubleEntryTransaction,
  createSingleGLTransaction,
  getGLAccountTransactions,
  getGLAccountTransactionById,
  getGLAccountTransactionByAcctNo,
  updateGLAccountTransaction
} from '../controllers/glAccountTransactionController.js';


const router = express.Router();

// Create a single GL account transaction (manually triggered)
router.post('/create', createGLAccountTransaction);

// Create a single GL transaction (minimal version)
router.post('/single', createSingleGLTransaction);

// Create a double-entry transaction
router.post('/double-entry', createDoubleEntryTransaction);

// Get all GL account transactions
router.get('/', getGLAccountTransactions);

// Get a GL account transaction by ID
router.get('/:id', getGLAccountTransactionById);

// Get a GL account transaction by GL account number
router.get('/account/:glAcctNo', getGLAccountTransactionByAcctNo);

// Update a GL account transaction by ID
router.put('/:id', updateGLAccountTransaction);

export default router;
