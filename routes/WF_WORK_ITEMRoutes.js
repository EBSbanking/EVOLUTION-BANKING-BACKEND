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

// ✅ 🔥 NEW: Get all pending work items across all ITEM_TYPEs (enriched)
router.get('/work-items/pending/all', WF_WORK_ITEMController.getAllWorkItems); // alias to your enriched version

// ✅ Get work item history (Approved items)
router.get('/work-items/history', WF_WORK_ITEMController.getWorkItemHistory);

// ✅ Get a specific work item by ID
router.get('/work-items/:WORK_ITEM_ID', WF_WORK_ITEMController.getWorkItemById);

// ✅ Delete a work item by WORK_ITEM_ID
router.delete('/work-items/:WORK_ITEM_ID', WF_WORK_ITEMController.deleteWorkItem);

// POST route to complete a work item (approve or reject)
router.post('/workflow/complete', async (req, res) => {
  const { workItemId, status, userId } = req.body;

  if (!workItemId || !status || !userId) {
    return res.status(400).json({
      message: 'Missing required fields: workItemId, status, userId'
    });
  }

  const result = await WF_WORK_ITEMController.completeWorkItem(workItemId, status, userId);
  
  if (!result.success) {
    return res.status(500).json({ message: result.message });
  }

  return res.status(200).json({ message: `Work item ${status} successfully.` });
});


// ✅ Update work item status after external approval
router.put('/work-items/update-status', async (req, res) => {
  const { itemType, itemId, approvedBy, custId } = req.body;

  if (!itemType || !itemId || !approvedBy || !custId) {
    return res.status(400).json({ message: 'Missing required parameters: itemType, itemId, approvedBy, custId' });
  }

  // ✅ Fix: Correct order of parameters (custId comes second)
  const result = await WF_WORK_ITEMController.updateWorkItemStatusOnApproval(itemType, custId, approvedBy);

  if (result?.success) {
    return res.status(200).json({ message: 'Work item status updated to Approved' });
  } else {
    return res.status(500).json({ message: 'Failed to update work item status', error: result?.error });
  }
});

export default router;