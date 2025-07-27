import express from 'express';
import {
  createLoanProduct,
  getAllLoanProducts,
  getLoanProduct,
  updateLoanProduct,
  deleteLoanProduct
} from '../controllers/LoanProductController.js';

const router = express.Router();

router.post('/products', createLoanProduct);
router.get('/products', getAllLoanProducts);
router.get('/:id', getLoanProduct);
router.put('/:id', updateLoanProduct);
router.delete('/:id', deleteLoanProduct);

export default router;
