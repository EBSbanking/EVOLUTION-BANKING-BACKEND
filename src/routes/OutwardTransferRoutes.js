// routes/outwardTransferRoutes.js

import express from 'express';
import {
  initiateTransfer,
  approveTransfer,
  rejectTransfer,
  getTransferStatus,
  getPendingTransfers,
  getTransferDetails,
  getTransferStats,
  handlePaystackWebhook,
  getBanks,
  verifyBeneficiary
} from '../controllers/outwardTransferController.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

// Public webhook endpoint (no auth)
router.post('/webhook/paystack', handlePaystackWebhook);

// Protected routes
router.get('/transfers/banks', authenticate, getBanks);
router.post('/transfers/beneficiaries/verify', authenticate, verifyBeneficiary);

router.post('/transfer', authenticate, initiateTransfer);
router.get('/transfer/:reference', authenticate, getTransferStatus);
router.get('/transfer/:reference/details', authenticate, getTransferDetails);
router.post('/transfer/:reference/approve', authenticate, approveTransfer);
router.post('/transfer/:reference/reject', authenticate, rejectTransfer);
router.get('/transfers/pending', authenticate, getPendingTransfers);
router.get('/transfers/stats', authenticate, getTransferStats);

export default router;