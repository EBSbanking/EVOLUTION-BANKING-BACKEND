// DepositAccountSummaryRoutes.js
import express from 'express';
import { 
  getAllDepositAccountSummaries,
  getDepositAccountSummaryByAcctNo,
  createDepositAccountSummary,
  updateDepositAccountSummary,
  deleteDepositAccountSummary,
  getTransactionHistoryByAcctId
} from '../controllers/depositAccountSummaryController.js';

const router = express.Router();

router.get('/deposit-summary', getAllDepositAccountSummaries);
router.get('/deposit-summary/:acctNo', getDepositAccountSummaryByAcctNo);
router.post('/deposit-summary', createDepositAccountSummary);
router.put('/deposit-summary/:acctNo', updateDepositAccountSummary);
router.delete('/deposit-summary/:acctNo', deleteDepositAccountSummary);

// Additional route for transaction history by deposit account ID
router.get('/deposit-transaction/:depositAcctId', getTransactionHistoryByAcctId);

export default router;
