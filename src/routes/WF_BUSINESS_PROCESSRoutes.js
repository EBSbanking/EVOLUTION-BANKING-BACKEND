import express from 'express';
import WF_BUSINESS_PROCESSController from '../controllers/WF_BUSINESS_PROCESSController.js';

const router = express.Router();

// Workflow routes
router.post('/workflow', WF_BUSINESS_PROCESSController.createWorkflow);
router.post('/workflow/apply', WF_BUSINESS_PROCESSController.applyWorkflow);
router.get('/workflow', WF_BUSINESS_PROCESSController.getAllWorkflows);
router.get('/workflow/:id', WF_BUSINESS_PROCESSController.getWorkflowById);
router.put('/workflow/:id', WF_BUSINESS_PROCESSController.updateWorkflow);
router.delete('/workflow/:id', WF_BUSINESS_PROCESSController.deleteWorkflow);

export default router;
