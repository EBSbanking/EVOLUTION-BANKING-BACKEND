// routes/groupSavingsRoutes.js
import express from 'express';
import {
  createGroupSavings,
  addContribution,
  requestWithdrawal,
  processWithdrawalApproval,
  disburseWithdrawal,
 getGroupSavingsByGroupCode,
  addBulkContributionsWithIndividualTransactions,
  getGroupContributions,
  getGroupSavings
} from '../controllers/GroupSavingsController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// 🧩 Group Savings Management Routes
router.post('/create', authenticate, createGroupSavings); // Create new Group Savings
router.post('/contributions/add', authenticate, addContribution); // Add single contribution
router.post('/contributions/bulk-detailed', authenticate, addBulkContributionsWithIndividualTransactions); // Bulk contributions with individual transactions
router.get('/contributions/:accountNumber/history', authenticate, getGroupContributions); // Get contribution history for account

// 💳 Withdrawal Management Routes
router.post('/:groupSavingsId/withdrawals/request', authenticate, requestWithdrawal); // Request withdrawal
router.put('/withdrawals/:withdrawalRequestId/approve', authenticate, processWithdrawalApproval); // Approve withdrawal request
router.put('/withdrawals/:withdrawalRequestId/disburse', authenticate, disburseWithdrawal); // Disburse withdrawal

// 📊 Get Group Savings
router.get('/:groupCode/savings', authenticate, getGroupSavingsByGroupCode); // FIXED: Route for getGroupSavings by groupCode

router.get('/:groupCode/savings', authenticate, getGroupSavings); // FIXED: Route for getGroupSavings by groupCode



export default router;