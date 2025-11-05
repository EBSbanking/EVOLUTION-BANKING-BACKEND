import express from 'express';
import {
  setTransactionPolicy,
  updatePolicy,
  validateTransaction,
  getTransactionPolicies
} from '../controllers/TransactionPolicyController.js';

const router = express.Router();

/**
 * @route   POST /api/policy/set
 * @desc    Create or update policy for a role (Supervisor or Manager only)
 */
router.post('/policy/set', setTransactionPolicy);

/**
 * @route   PUT /api/policy/:id
 * @desc    Update an existing policy by POLICY_ID
 */
router.put('/policy/:id', updatePolicy);

/**
 * @route   POST /api/policy/validate
 * @desc    Validate a transaction against the set policy
 */
router.post('/policy/validate', validateTransaction);

/**
 * @route   GET /api/policies?role=TELLER
 * @desc    Get all policies or filter by role
 */
router.get('/policies', getTransactionPolicies);

export default router;
