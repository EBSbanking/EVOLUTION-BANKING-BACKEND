// routes/outwardTransferRoutes.js
import express from 'express';
import { outwardTransferController } from '../controllers/outwardTransferController.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

// ────────────── Initiate ──────────────
// POST /api/outward/transfer – requires authentication
router.post('/transfer', authenticate, outwardTransferController.initiateTransfer);

// ────────────── Approval / Rejection ──────────────
// POST /api/outward/transfer/:reference/approve
router.post('/transfer/:reference/approve', authenticate, outwardTransferController.approveTransfer);

// POST /api/outward/transfer/:reference/reject
router.post('/transfer/:reference/reject', authenticate, outwardTransferController.rejectTransfer);

// ────────────── Status & List ──────────────
// GET /api/outward/transfer/:reference – get single transfer
router.get('/transfer/:reference', authenticate, outwardTransferController.getTransferStatus);

// GET /api/outward/transfers/pending – list pending transfers (awaiting approval)
router.get('/transfers/pending', authenticate, outwardTransferController.getPendingTransfers);

// ────────────── Webhook (public) ──────────────
// POST /api/outward/webhook/paystack – no authentication (must be public)
router.post('/webhook/paystack', outwardTransferController.handlePaystackWebhook);

export default router;