// routes/transactionPolicyRoutes.js
import express from 'express';
import {
  validateTransaction,
  validateTransactionSimple,
  getAllPolicies,
  getPolicyByRole,
  addOrUpdatePolicy, // Ensure this matches the exported name in the controller
} from '../controllers/transactionPolicyController.js';

const router = express.Router();

// Route to add or update a transaction policy for a role
router.post('/policy', addOrUpdatePolicy);

// Route to get all policies
router.get('/policies', getAllPolicies);

// Route to get a specific policy by role
router.get('/policy/:role', getPolicyByRole);

// Route to validate a transaction
router.post('/validate', validateTransaction);

// Route to validate a transaction (simple version)
router.post('/validate/simple', validateTransactionSimple);

export default router;
