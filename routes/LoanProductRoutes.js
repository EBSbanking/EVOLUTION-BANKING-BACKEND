import express from 'express';
import {
  ProductsController,
  getAllLoanProducts,
  getLoanProduct,
  updateLoanProduct,
  deleteLoanProduct
} from '../controllers/LoanProductController.js';

const router = express.Router();

// Use the createProduct method from the ProductsController object
router.post('/products', ProductsController.createProduct);
router.get('/products', getAllLoanProducts);
router.get('/:id', getLoanProduct);
router.put('/:id', updateLoanProduct);
router.delete('/:id', deleteLoanProduct);

export default router;