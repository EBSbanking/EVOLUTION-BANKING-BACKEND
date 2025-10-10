import express from 'express';
import { createSavingsProduct, getSavingsProduct, getAllSavingsProducts, updateSavingsProduct } from '../controllers/SavingsProductController.js';

const router = express.Router();

// Get all savings products
router.get('/savings-products', getAllSavingsProducts);

// Create a new savings product
router.post('/savings-products', createSavingsProduct);

// Get a savings product by productCode
router.get('/savings-products/:productCode', getSavingsProduct);

// Update a savings product by productCode
router.put('/savings-products/:productCode', updateSavingsProduct);

export default router;