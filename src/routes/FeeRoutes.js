// routes/feeRoutes.js
import express from 'express';
import { transferFeeHandlers } from '../controllers/TransferFeeController.js';


const router = express.Router();

// Public endpoints
router.post('/calculate', transferFeeHandlers.calculateFees);

// Protected admin endpoints
router.post('/', authenticate,  transferFeeHandlers.createFee);
router.get('/', authenticate, transferFeeHandlers.getAllFees);
router.get('/:id', authenticate,  transferFeeHandlers.getFeeById);
router.put('/:id', authenticate,  transferFeeHandlers.updateFee);
router.delete('/:id', authenticate,  transferFeeHandlers.deleteFee);
router.post('/bulk-import', authenticate,  transferFeeHandlers.bulkImportFees);

export default router;