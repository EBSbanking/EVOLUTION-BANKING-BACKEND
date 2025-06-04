import express from 'express';
import WF_BusinessRoleQueueController from '../controllers/WF_BusinessRoleQueueController.js';

const router = express.Router();

// Business Role Queue routes
router.post('/business-role-queue', WF_BusinessRoleQueueController.createBusinessRoleQueue);
router.get('/business-role-queue', WF_BusinessRoleQueueController.getAllBusinessRoleQueues);
router.get('/business-role-queue/:id', WF_BusinessRoleQueueController.getBusinessRoleQueueById);
router.put('/business-role-queue/:id', WF_BusinessRoleQueueController.updateBusinessRoleQueue);
router.delete('/business-role-queue/:id', WF_BusinessRoleQueueController.deleteBusinessRoleQueue);

export default router;
