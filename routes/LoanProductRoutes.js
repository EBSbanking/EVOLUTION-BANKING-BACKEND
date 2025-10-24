import express from 'express';
import {
  ProductsController,
  getAllLoanProducts,
  getLoanProduct,
  updateLoanProduct,
  deleteLoanProduct,
  getProductsByBU
} from '../controllers/LoanProductController.js';

const router = express.Router();

// Product creation and bulk operations
router.post('/products', ProductsController.createProduct);
router.get('/products', getAllLoanProducts);

// Business Unit specific routes
router.get('/products/business-unit/:bu_id', getProductsByBU);

// Single product operations
router.get('/products/:id', getLoanProduct);
router.put('/products/:id', updateLoanProduct);
router.delete('/products/:id', deleteLoanProduct);

export default router;