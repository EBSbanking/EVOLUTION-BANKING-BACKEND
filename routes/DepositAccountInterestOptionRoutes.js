import express from 'express';
import {
  createDepositAccountInterestOption,
  getDepositAccountInterestOptions,
} from '../controllers/DepositAccountInterestOptionController.js';

const router = express.Router();

// Routes for Deposit Account Interest Options
router.post('/', createDepositAccountInterestOption);
router.get('/', getDepositAccountInterestOptions);

export default router;
