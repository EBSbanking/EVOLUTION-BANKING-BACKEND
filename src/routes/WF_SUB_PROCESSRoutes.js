import express from 'express';
import WF_SUB_PROCESSController from '../controllers/WF_SUB_PROCESSController.js';

const router = express.Router();

// Subprocess routes
router.post('/subprocess', WF_SUB_PROCESSController.createSubProcess);
router.get('/subprocess', WF_SUB_PROCESSController.getAllSubProcesses);
router.get('/subprocess/:id', WF_SUB_PROCESSController.getSubProcessById);
router.put('/subprocess/:id', WF_SUB_PROCESSController.updateSubProcess);
router.delete('/subprocess/:id', WF_SUB_PROCESSController.deleteSubProcess);

export default router;
