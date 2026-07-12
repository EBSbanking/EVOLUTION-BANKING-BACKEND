// routes/PendingGLTransactionRoutes.js - Without authentication
import express from 'express';
import { 
  getAllPendingTransactions,
  getPendingTransactionById,
  getPendingTransactionsByStatus,
  getPendingTransactionsSummary,
  retryFailedTransaction,
  bulkRetryFailedTransactions,
  processPendingGLTransactions
} from '../controllers/PendingGLTransactionController.js';

const router = express.Router();

// Public routes (no authentication)
router.post('/process', processPendingGLTransactions);
router.get('/', getAllPendingTransactions);
router.get('/summary', getPendingTransactionsSummary);
router.get('/status/:status', getPendingTransactionsByStatus);
router.get('/:id', getPendingTransactionById);
router.post('/:id/retry', retryFailedTransaction);
router.post('/bulk-retry', bulkRetryFailedTransactions);

export default router;