// src/routes/LoanProductRoutes.js
import express from 'express';
import { LoanProductController } from '../controllers/LoanProductController.js';

const router = express.Router();

router.post('/products', LoanProductController.createProduct);
router.get('/products', LoanProductController.getAllLoanProducts);
router.get('/products/:id', LoanProductController.getLoanProduct);
router.put('/products/:id', LoanProductController.updateLoanProduct);
router.delete('/products/:id', LoanProductController.deleteLoanProduct);

export default router;