// src/routes/LoanProductRoutes.js
import express from 'express';
import LoanProductController from '../controllers/LoanProductController.js';

const router = express.Router();

// ==================== CRUD OPERATIONS ====================

// CREATE LOAN PRODUCT
router.post('/', LoanProductController.createProduct);

// GET ALL LOAN PRODUCTS (with filters: page, limit, search, productType, termType, isActive, buId, status)
router.get('/', LoanProductController.getAllLoanProducts);

// GET PRODUCT BY ID (supports: PROD_ID, _id, productCode, or shortName query param)
router.get('/:id', LoanProductController.getProduct);

// UPDATE LOAN PRODUCT BY ID (supports: PROD_ID, _id, productCode)
router.put('/:id', LoanProductController.updateLoanProduct);

// DELETE LOAN PRODUCT (Soft Delete) BY ID (supports: PROD_ID, _id, productCode)
router.delete('/:id', LoanProductController.deleteLoanProduct);

// ==================== INTEREST RATE RELATED ====================

// GET PRODUCTS BY INTEREST RATE ID
router.get('/interest-rate/:interestRateId', LoanProductController.getProductsByInterestRate);

// CHANGE PRODUCT'S INTEREST RATE
router.put('/:productId/interest-rate', LoanProductController.changeProductInterestRate);

// ==================== CALCULATION ROUTES ====================

// CALCULATE LOAN REPAYMENT FOR SPECIFIC PRODUCT
router.post('/:productId/calculate-repayment', LoanProductController.calculateLoanRepayment);

// VALIDATE LOAN APPLICATION
router.post('/validate', LoanProductController.validateLoanApplication);

// CALCULATE INTEREST FOR SPECIFIC PERIOD
router.post('/:productId/calculate-interest-period', LoanProductController.calculateInterestForPeriod);

// COMPARE INTEREST RATES FOR PRODUCT
router.post('/:productId/compare-rates', LoanProductController.compareInterestRates);

// SIMULATE INTEREST RATE CHANGES
router.post('/:productId/simulate-rate-change', LoanProductController.simulateRateChange);

// Add this to your backend API to check existing products
router.get('/check-product-ids', async (req, res) => {
  try {
    const existingProducts = await ProductTypeMapping.find({}, 'PROD_ID PRODUCT_NAME')
      .sort({ PROD_ID: 1 });
    
    res.json({
      count: existingProducts.length,
      products: existingProducts,
      maxProdId: existingProducts.length > 0 ? Math.max(...existingProducts.map(p => p.PROD_ID)) : 0,
      availableIds: Array.from({ length: 100 }, (_, i) => i + 1)
        .filter(id => !existingProducts.some(p => p.PROD_ID === id))
        .slice(0, 20) // Get first 20 available IDs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;