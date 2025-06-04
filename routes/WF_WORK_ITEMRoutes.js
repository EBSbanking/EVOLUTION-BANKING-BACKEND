import express from 'express';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';


const router = express.Router();

// Route to submit a new transaction (created by Credit Officer)
router.post('/transactions/submit', WF_WORK_ITEMController.submitTransaction);

// Route to get pending transactions for authorization based on BU_ID
// router.get('/transactions/authorization', WF_WORK_ITEMController.getTransactionsForAuthorization);

// Route to approve a transaction (Branch Manager approval)
router.put('/workflow/approve/:WORK_ITEM_ID', WF_WORK_ITEMController.approveWorkflow);
// Route to get all work items (for general listing)
router.get('/work-items', WF_WORK_ITEMController.getAllWorkItems);

// Route to update a work item by ID
router.put('/work-items/:id', WF_WORK_ITEMController. moveToCorrectTable);

// Route to delete a work item by ID
router.delete('/work-items/:id', WF_WORK_ITEMController.deleteWorkItem);

router.get('/work-item/:workItemId', WF_WORK_ITEMController.getWorkItemById);

router.get('/work-item/:workItemId', WF_WORK_ITEMController.calculateAge);

export default router;
