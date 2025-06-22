import express from 'express';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';

const router = express.Router();

// ✅ Create a new work item
router.post('/work-items', WF_WORK_ITEMController.submitTransaction);

// ✅ Get paginated & filtered work items (includes decoding)
router.get('/work-items', WF_WORK_ITEMController.getWorkItems);

// ✅ Get filtered/paginated work items (with decoding and status flags)
router.get('/work-items/filter', WF_WORK_ITEMController.getWorkItems);


// ✅ Get all active (Pending/Rejected) work items
router.get('/work-items/all', WF_WORK_ITEMController.getAllWorkItems);

// ✅ Get work item history (Approved items)
router.get('/work-items/history', WF_WORK_ITEMController.getWorkItemHistory);

// ✅ Get a specific work item by ID
router.get('/work-items/:WORK_ITEM_ID', WF_WORK_ITEMController.getWorkItemById);

// ✅ Delete a work item by WORK_ITEM_ID
router.delete('/work-items/:WORK_ITEM_ID', WF_WORK_ITEMController.deleteWorkItem);

// ✅ Update work item status after external approval
router.put('/work-items/update-status', async (req, res) => {
  const { itemType, itemId, approvedBy } = req.body;

  if (!itemType || !itemId || !approvedBy) {
    return res.status(400).json({ message: 'Missing required parameters: itemType, itemId, approvedBy' });
  }

  const result = await WF_WORK_ITEMController.updateWorkItemStatusOnApproval(itemType, itemId, approvedBy);

  if (result) {
    return res.status(200).json({ message: 'Work item status updated to Approved' });
  } else {
    return res.status(500).json({ message: 'Failed to update work item status' });
  }
});

export default router;
