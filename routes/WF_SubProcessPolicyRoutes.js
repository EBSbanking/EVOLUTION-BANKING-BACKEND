import express from 'express';
import WFSubProcessPolicyController from '../controllers/WFSubProcessPolicyController.js';

const router = express.Router();

// Route to create a new sub-process policy
router.post('/sub-process-policy', WFSubProcessPolicyController.createPolicy);

// Route to fetch all sub-process policies
router.get('/sub-process-policy', WFSubProcessPolicyController.getAllPolicies);

// Route to fetch a specific sub-process policy by ID
router.get('/sub-process-policy/:id', WFSubProcessPolicyController.getPolicyById);

// Route to update a specific sub-process policy by ID
router.put('/sub-process-policy/:id', WFSubProcessPolicyController.updatePolicy);

// Route to delete a specific sub-process policy by ID
router.delete('/sub-process-policy/:id', WFSubProcessPolicyController.deletePolicy);

export default router;
