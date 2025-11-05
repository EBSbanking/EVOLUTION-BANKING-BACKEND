// routes/groupSavingsRoutes.js
import express from 'express';
import {
  createGroupSavings,
  addContribution,
  requestWithdrawal,
  processWithdrawalApproval,
  disburseWithdrawal,
  getGroupSavings,
  addBulkContributionsWithIndividualTransactions,
  getGroupContributions
} from '../controllers/GroupSavingsController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.post('/create', authenticate, createGroupSavings);
router.post('/contributions/add', authenticate, addContribution);
router.post('/:groupSavingsId/withdrawals/request', authenticate, requestWithdrawal);
router.put('/withdrawals/:withdrawalRequestId/approve', authenticate, processWithdrawalApproval);
router.put('/withdrawals/:withdrawalRequestId/disburse', authenticate, disburseWithdrawal);
router.get('/:groupSavingsId', authenticate, getGroupSavings);


router.post('/contributions/bulk-detailed', authenticate, addBulkContributionsWithIndividualTransactions);
router.get('/contributions/:accountNumber/history', authenticate, getGroupContributions);

export default router;