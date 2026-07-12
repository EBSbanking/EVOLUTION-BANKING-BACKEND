// routes/groupSavingsRoutes.js - Updated with correct order
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
  searchGroupSavings,
  getAllGroupSavings,
  getAllGroupSavingsSimple
} from '../controllers/GroupSavingsController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ============================================
// 🏦 GROUP SAVINGS ACCOUNT MANAGEMENT
// ============================================

router.post('/create', authenticate, createGroupSavings);
router.get('/account/:accountNumber', authenticate, getAccountByNumber);
router.get('/id/:groupSavingsId', authenticate, getGroupSavingsById);
router.get('/account-number/:accountNumber/details', authenticate, getGroupSavingsByAccountNumber);
router.put('/:groupSavingsId/update', authenticate, updateGroupSavings);

// ============================================
// 🔍 GROUP-SPECIFIC QUERIES (ORDER MATTERS!)
// ============================================

// ✅ GET savings by group code – this is the one your frontend calls
//    Example: /api/group-savings/DEFAULT_GROUP/savings
router.get('/:groupCode/savings', authenticate, (req, res, next) => {
  console.log('🔍 Route /:groupCode/savings hit with groupCode:', req.params.groupCode);
  next();
}, getGroupSavingsByGroupCode);

// Get all savings accounts for a group (returns list)
router.get('/group/:groupCode/all', authenticate, getGroupSavingsByGroup);

// Get member savings for a group (alternative)
router.get('/:groupCode/member-savings', authenticate, getGroupSavings);

// ============================================
// 💰 BALANCE QUERIES
// ============================================

router.get('/balance/account/:accountNumber', authenticate, getGroupSavingsBalanceByAccountNumber);
router.get('/balance/group/:groupCode/:savingsType?', authenticate, getGroupSavingsBalanceByGroupCode);

// ============================================
// 🔍 SEARCH ROUTES
// ============================================

router.get('/search', authenticate, searchGroupSavings);
router.get('/search/name/:groupName', authenticate, searchGroupSavingsByGroupName);

// ============================================
// 💰 CONTRIBUTION MANAGEMENT
// ============================================

router.post('/contributions/add', authenticate, addContribution);
router.post('/contributions/bulk-detailed', authenticate, addBulkContributionsWithIndividualTransactions);
router.get('/contributions/:accountNumber/history', authenticate, getGroupContributions);

// ============================================
// 💳 WITHDRAWAL MANAGEMENT
// ============================================

router.post('/withdrawals/request/:accountNumber', authenticate, requestWithdrawal);
router.put('/withdrawals/:withdrawalRequestId/approve', authenticate, processWithdrawalApproval);
router.put('/withdrawals/:withdrawalRequestId/disburse', authenticate, disburseWithdrawal);

// ============================================
// 🔄 SYNC & UTILITY
// ============================================

router.post('/:groupSavingsId/sync-balance', authenticate, syncGroupSavingsBalance);

// ============================================
// 📋 LIST ALL SAVINGS ACCOUNTS
// ============================================

router.get('/all', authenticate, getAllGroupSavings);
router.get('/all/simple', authenticate, getAllGroupSavingsSimple);

export default router;