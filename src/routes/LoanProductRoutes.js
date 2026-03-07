// src/routes/LoanProductRoutes.js
import express from 'express';
import LoanProductController from '../controllers/LoanProductController.js';

const router = express.Router();

// ==================== CRUD OPERATIONS ====================

// CREATE LOAN PRODUCT
router.post('/', LoanProductController.createProduct);

// ✅ IMPORTANT: GET ALL LOAN PRODUCTS - This must come BEFORE /:id
// This handles: /api/loan-product/ (with optional query params)
// Supports filters: page, limit, search, productType, termType, isActive, buId, status
router.get('/', LoanProductController.getAllLoanProducts);

// ✅ GET PRODUCT BY ID - This comes AFTER the root route
// Supports: PROD_ID, _id, productCode, or shortName as URL parameter
// Example: /api/loan-product/123, /api/loan-product/BTL300, etc.
router.get('/:id', LoanProductController.getProduct);

// UPDATE LOAN PRODUCT BY ID (supports: PROD_ID, _id, productCode)
router.put('/:id', LoanProductController.updateLoanProduct);

// DELETE LOAN PRODUCT (Soft Delete) BY ID (supports: PROD_ID, _id, productCode)
router.delete('/:id', LoanProductController.deleteLoanProduct);

// ==================== INTEREST RATE RELATED ====================

// GET PRODUCTS BY INTEREST RATE ID
// Example: /api/loan-product/interest-rate/1291
router.get('/interest-rate/:interestRateId', LoanProductController.getProductsByInterestRate);

// CHANGE PRODUCT'S INTEREST RATE
// Example: /api/loan-product/123/interest-rate
router.put('/:productId/interest-rate', LoanProductController.changeProductInterestRate);

// ==================== CALCULATION ROUTES ====================

// CALCULATE LOAN REPAYMENT FOR SPECIFIC PRODUCT
// Example: /api/loan-product/123/calculate-repayment
router.post('/:productId/calculate-repayment', LoanProductController.calculateLoanRepayment);

// VALIDATE LOAN APPLICATION
// Example: /api/loan-product/validate
router.post('/validate', LoanProductController.validateLoanApplication);

// CALCULATE INTEREST FOR SPECIFIC PERIOD
// Example: /api/loan-product/123/calculate-interest-period
router.post('/:productId/calculate-interest-period', LoanProductController.calculateInterestForPeriod);

// COMPARE INTEREST RATES FOR PRODUCT
// Example: /api/loan-product/123/compare-rates
router.post('/:productId/compare-rates', LoanProductController.compareInterestRates);

// SIMULATE INTEREST RATE CHANGES
// Example: /api/loan-product/123/simulate-rate-change
router.post('/:productId/simulate-rate-change', LoanProductController.simulateRateChange);

// ==================== UTILITY ROUTES ====================

// CHECK EXISTING PRODUCT IDs (for debugging/development)
// Example: /api/loan-product/check-product-ids
router.get('/check-product-ids', async (req, res) => {
  try {
    // Note: You'll need to import ProductTypeMapping at the top of this file
    // or use the appropriate model
    const existingProducts = await LoanProduct.findAll({
      attributes: ['PROD_ID', 'name', 'productCode'],
      order: [['PROD_ID', 'ASC']]
    });
    
    const prodIds = existingProducts.map(p => p.PROD_ID).filter(id => id);
    
    res.json({
      count: existingProducts.length,
      products: existingProducts,
      maxProdId: prodIds.length > 0 ? Math.max(...prodIds) : 0,
      availableIds: Array.from({ length: 100 }, (_, i) => i + 1)
        .filter(id => !prodIds.includes(id))
        .slice(0, 20) // Get first 20 available IDs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;