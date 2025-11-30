// src/routes/LoanProductRoutes.js
import express from 'express';
import { LoanProductController } from '../controllers/LoanProductController.js';

const router = express.Router();

// Main CRUD routes
router.post('/products', LoanProductController.createProduct);
router.get('/products', LoanProductController.getAllLoanProducts);
router.get('/products/:id', LoanProductController.getLoanProduct);
router.put('/products/:id', LoanProductController.updateLoanProduct);
router.delete('/products/:id', LoanProductController.deleteLoanProduct);

// Branch GL Accounts specific routes
router.get(
  '/products/:productId/branches/:branchCode/gl-accounts/:accountType',
  LoanProductController.getBranchGLAccount
);

router.put(
  '/products/:id/branch-gl-accounts',
  LoanProductController.updateBranchGLAccounts
);

// Bulk operations
router.post('/products/bulk', LoanProductController.createProduct); // For future bulk creation
router.put('/products/:id/bulk-branch-accounts', LoanProductController.updateBranchGLAccounts); // For bulk branch updates

export default router;