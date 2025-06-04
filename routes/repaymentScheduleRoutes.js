// repaymentScheduleRoutes.js
import express from 'express';
import { getRepaymentSchedule } from '../controllers/repaymentScheduleController.js';

const router = express.Router();

// Route to get repayment schedule by ACCT_NO
router.get('/repayment-schedule/:ACCT_NO', getRepaymentSchedule);

export default router;
