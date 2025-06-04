import express from 'express'; // Use import instead of require
import { getEventIdByWorkItemId, getTransactionByEventOrQueueId, getTransactionDetails } from '../controllers/eventController.js'; // Update imports to ES module style

const router = express.Router();

router.get("/getEventIdByWorkItemId", getEventIdByWorkItemId);
router.get("/getFormDataByEventId", getTransactionByEventOrQueueId);
router.get("/getTransactionDetails", getTransactionDetails); // New route for transactions

export default router;  // Use export default to export the router
