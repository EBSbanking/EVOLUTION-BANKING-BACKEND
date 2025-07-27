import express from 'express';
import LoanFeeController from '../controllers/LoanFeeController.js';

const router = express.Router();

// Create a new loan fee
router.post('/', LoanFeeController.createFee);

// Get all fees for a specific loan product
router.get('/product/:productId', LoanFeeController.getFeesByProduct);

// Update an existing loan fee
router.put('/:feeId', LoanFeeController.updateFee);

// Toggle fee active status
router.patch('/:feeId/toggle-status', LoanFeeController.toggleFeeStatus);

// Calculate fees for a specific loan amount
router.get('/product/:productId/calculate/:amount', LoanFeeController.calculateFeesForAmount);

// GET processing fee for a product and amount
router.get('/products/:productId/amount/:amount/processing-fee', 
  LoanFeeController.getProcessingFee
);

export default router;