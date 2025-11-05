// repaymentScheduleRoutes.js
import express from 'express';
import { getRepaymentSchedule, recordPayment } from '../controllers/repaymentScheduleController.js';

const router = express.Router();

// Route to get repayment schedule by ACCT_NO
router.get('/repayment-schedule/:ACCT_NO', getRepaymentSchedule);

router.post('/repayments/:ACCT_NO/pay', recordPayment);

export default router;
