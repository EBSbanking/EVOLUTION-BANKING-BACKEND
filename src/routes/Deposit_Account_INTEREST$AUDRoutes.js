import express from 'express';
import {
  getAllDepositAccountInterestAudits,
  getDepositAccountInterestAuditById,
  getDepositAccountInterestAuditsByAccountId,
  updateDepositAccountInterestAudit,
  deleteDepositAccountInterestAudit,
  calculateAndCreateAllInterest,
  triggerInterestCalculation,
  calculateAndPostDailyInterest
} from '../controllers/Deposit_Account_INTEREST$AUDController.js';

const router = express.Router();

// Routes for Deposit Account Interest Audit
router.get('/', getAllDepositAccountInterestAudits); // Fixed: removed the space after '/:'
router.get('/:id', getDepositAccountInterestAuditById); // Get by MongoDB ID
router.get('/account/:accountId', getDepositAccountInterestAuditsByAccountId); // Get by ACCT_ID
router.put('/:id', updateDepositAccountInterestAudit); // Update by MongoDB ID
router.delete('/:id', deleteDepositAccountInterestAudit); // Delete by MongoDB ID
router.post('/calculate-all-interest', calculateAndCreateAllInterest); // Calculate interest for all accounts
router.post('/calculate-daily-interest', triggerInterestCalculation); // Trigger daily interest calculation
router.post('/manual-daily-interest', calculateAndPostDailyInterest); // Manual daily interest calculation

export default router;