// routes/transactionPolicyRoutes.js
import express from 'express';
import {
  setTransactionPolicy,
  updatePolicy,
  validateTransaction,
  getTransactionPolicies,
  getPolicyById,
  deactivatePolicy,
  getPolicyStats,
  initializePolicyTables
} from '../controllers/TransactionPolicyController.js';

const router = express.Router();

// Initialize tables (development only)
router.post('/initialize-tables', initializePolicyTables);

// CRUD operations
router.post('/policies', setTransactionPolicy);
router.get('/policies', getTransactionPolicies);
router.get('/policies/:id', getPolicyById);
router.put('/policies/:id', updatePolicy);
router.delete('/policies/:id', deactivatePolicy); // Actually deactivates, not deletes

// Validation
router.post('/validate', validateTransaction);

// Statistics
router.get('/stats', getPolicyStats);

export default router;