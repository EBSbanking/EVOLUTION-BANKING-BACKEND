import express from 'express';
import WFQueueController from '../controllers/WF_QUEUEController.js';

const router = express.Router();

router.post('/queue', WFQueueController.createQueueItem);
router.get('/queue', WFQueueController.getAllQueueItems);
router.get('/queue/:id', WFQueueController.getQueueItemById);
router.put('/queue/:id', WFQueueController.updateQueueItem);
router.delete('/queue/:id', WFQueueController.deleteQueueItem);

export default router;
