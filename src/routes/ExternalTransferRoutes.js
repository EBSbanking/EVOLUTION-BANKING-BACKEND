// src/routes/ExternalTransferRoutes.js
import express from 'express';
import ExternalTransferController from '../controllers/ExternalTransferController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = express.Router();

// Webhook endpoint for external banks (no auth - called by First Bank, UBA, etc.)
// This now delegates to ExternalTransferController which uses InwardTransferService
router.post('/webhook', ExternalTransferController.processExternalTransfer);

// Generate payment reference for customer (requires auth)
router.post('/generate-reference', authenticate, ExternalTransferController.generatePaymentReference);

// Manual matching (requires auth)
router.post('/match/:pending_id', authenticate, ExternalTransferController.matchPendingTransfer);

// Get pending transfers (requires auth)
router.get('/pending', authenticate, ExternalTransferController.getPendingTransfers);

// Get transfer by reference (requires auth)
router.get('/reference/:reference', authenticate, ExternalTransferController.getTransferByReference);

// Get customer transfer history (requires auth)
router.get('/customer/:customer_id/history', authenticate, ExternalTransferController.getCustomerTransferHistory);

// Get transfer statistics (requires auth)
router.get('/statistics', authenticate, ExternalTransferController.getTransferStats);

export default router;