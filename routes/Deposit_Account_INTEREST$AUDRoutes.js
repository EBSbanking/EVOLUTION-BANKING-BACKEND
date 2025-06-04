import express from 'express';
import {
  getAllDepositAccountInterestAudits,
  getDepositAccountInterestAuditById,
  updateDepositAccountInterestAudit,
  deleteDepositAccountInterestAudit,
  calculateAndCreateAllInterest,
  
} from '../controllers/Deposit_Account_INTEREST$AUDController.js';

const router = express.Router();

// Routes for Deposit Account Interest Audit
// router.post('/', createDepositAccountInterestAudit); // Removed as it's commented out
router.get('/: ', getAllDepositAccountInterestAudits);
router.get('/:ACCT_ID', getDepositAccountInterestAuditById);
router.put('/:ACCT_ID', updateDepositAccountInterestAudit);
router.delete('/:id', deleteDepositAccountInterestAudit);
router.post('/calculate-all-interest', calculateAndCreateAllInterest);

export default router;
