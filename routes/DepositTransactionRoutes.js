// controllers/DepositTransactionController.js
import express from 'express';
import {
  createDepositTransaction,
  approveDepositTransaction,
  rejectDepositTransaction,
  getPendingApprovalsByCustId,
  getTransactionRefNosByAcctNo,
  getTransactionsByAcctNo
} from '../controllers/DepositTransactionController.js';

// import decryptPayload from '../middlewares/decryptPayload.js'; // 👈 Import middleware


const router = express.Router();

// 🏦 Create deposit transaction
router.post('/create', createDepositTransaction);

// ✅ Approve deposit transaction
// ✅ Correct: avoid repeating /deposit-transaction in the route path
router.post('/approve', approveDepositTransaction);

router.post('/reject', rejectDepositTransaction);


// 📋 Get pending approvals for a customer
router.get('/pending-approvals/:custId', getPendingApprovalsByCustId);

// 🔗 Get TRANSACTION_REF_NO by Account Number
router.get('/account/:acctNo/refs', getTransactionRefNosByAcctNo);

// 📄 Get all transactions by Account Number
router.get('/account/:acctNo/transactions', getTransactionsByAcctNo);

export default router;
