// routes/groupSavingsRoutes.js - Updated
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
  getGroupSavings,
  getAccountByNumber,
  getGroupSavingsById,
  getGroupSavingsByAccountNumber,
  updateGroupSavings,
  getGroupSavingsByGroup,
  syncGroupSavingsBalance
} from '../controllers/GroupSavingsController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// 🏦 GROUP SAVINGS ACCOUNT MANAGEMENT ROUTES
router.post('/create', authenticate, createGroupSavings);
router.get('/account/:accountNumber', authenticate, getAccountByNumber);
router.get('/id/:groupSavingsId', authenticate, getGroupSavingsById);
router.get('/account-number/:accountNumber/details', authenticate, getGroupSavingsByAccountNumber);
router.put('/:groupSavingsId/update', authenticate, updateGroupSavings);

// Group-based queries
router.get('/group/:groupCode/all', authenticate, getGroupSavingsByGroup);
router.get('/:groupCode/savings', authenticate, getGroupSavingsByGroupCode);
router.get('/:groupCode/member-savings', authenticate, getGroupSavings);

// 💰 CONTRIBUTION MANAGEMENT ROUTES
router.post('/contributions/add', authenticate, addContribution);
router.post('/contributions/bulk-detailed', authenticate, addBulkContributionsWithIndividualTransactions);
router.get('/contributions/:accountNumber/history', authenticate, getGroupContributions);

// 💳 WITHDRAWAL MANAGEMENT ROUTES
router.post('/withdrawals/request/:accountNumber', authenticate, requestWithdrawal);
router.put('/withdrawals/:withdrawalRequestId/approve', authenticate, processWithdrawalApproval);
router.put('/withdrawals/:withdrawalRequestId/disburse', authenticate, disburseWithdrawal);

// 🔄 SYNC ROUTES
router.post('/:groupSavingsId/sync-balance', authenticate, syncGroupSavingsBalance);

export default router;