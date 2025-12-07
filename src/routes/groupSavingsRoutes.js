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
  syncGroupSavingsBalance,
  getGroupSavingsBalanceByAccountNumber,
  getGroupSavingsBalanceByGroupCode,
  searchGroupSavingsByGroupName,
  searchGroupSavings
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

// 💰 BALANCE QUERIES
router.get('/balance/account/:accountNumber', authenticate, getGroupSavingsBalanceByAccountNumber);
router.get('/balance/group/:groupCode', authenticate, getGroupSavingsBalanceByGroupCode);
router.get('/balance/group/:groupCode/:savingsType', authenticate, getGroupSavingsBalanceByGroupCode);

// 🔍 SEARCH ROUTES
router.get('/search', authenticate, searchGroupSavings);
router.get('/search/name/:groupName', authenticate, searchGroupSavingsByGroupName);

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


// Routes configuration
router.get('/balance/search', searchGroupSavings); // Universal search with query params
router.get('/balance/account/:accountNumber', getGroupSavingsBalanceByAccountNumber);
router.get('/balance/group/:groupCode/:savingsType?', getGroupSavingsBalanceByGroupCode);
router.get('/search/name/:groupName', searchGroupSavingsByGroupName);

// Keep original routes for backward compatibility

router.get('/group/:groupCode', getGroupSavingsByGroupCode); // Get detailed info by group code
router.get('/group/:groupCode/all', getGroupSavingsByGroup); // Get all savings for a group


export default router;