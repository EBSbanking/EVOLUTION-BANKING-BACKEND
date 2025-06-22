import express from 'express';
import {
  setTransactionPolicy,
  validateTransaction,
  getTransactionPolicies
} from '../controllers/transactionPolicyController.js';

const router = express.Router();

// @route   POST /api/policy/set
// @desc    Create or update a transaction policy
router.post('/set', setTransactionPolicy);

// @route   POST /api/policy/validate
// @desc    Validate a transaction based on role and amount
router.post('/validate', validateTransaction);

// @route   GET /api/policy
// @desc    Get all policies or filter by role (?role=ROLE_NAME)
router.get('/', getTransactionPolicies);

export default router;
