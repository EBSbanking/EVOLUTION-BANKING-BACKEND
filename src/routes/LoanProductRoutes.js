// src/routes/LoanProductRoutes.js
import express from 'express';
import LoanProductController from '../controllers/LoanProductController.js';
import LoanProduct from '../models/LoanProduct.js';

const router = express.Router();

// ==================== STATIC ROUTES (MUST COME FIRST) ====================
// Create & list products via /products (used by frontend)
router.post('/products', LoanProductController.createProduct);
router.get('/products', LoanProductController.getAllLoanProducts);

// Optional: keep root routes for backward compatibility (if needed)
router.post('/', LoanProductController.createProduct);
router.get('/', LoanProductController.getAllLoanProducts);

// ==================== DYNAMIC ROUTES (WITH :id) ====================
router.get('/:id', LoanProductController.getProduct);
router.post('/:id', LoanProductController.updateLoanProduct);
router.delete('/:id', LoanProductController.deleteLoanProduct);

// ==================== INTEREST RATE RELATED ====================
router.get('/interest-rate/:interestRateId', LoanProductController.getProductsByInterestRate);
router.put('/:productId/interest-rate', LoanProductController.changeProductInterestRate);

// ==================== CALCULATION ROUTES ====================
router.post('/:productId/calculate-repayment', LoanProductController.calculateLoanRepayment);
router.post('/validate', LoanProductController.validateLoanApplication);
router.post('/:productId/calculate-interest-period', LoanProductController.calculateInterestForPeriod);
router.post('/:productId/compare-rates', LoanProductController.compareInterestRates);
router.post('/:productId/simulate-rate-change', LoanProductController.simulateRateChange);

// ==================== UTILITY ROUTES ====================
router.get('/check-product-ids', async (req, res) => {
  try {
    const existingProducts = await LoanProduct.findAll({
      attributes: ['PROD_ID', 'name', 'productCode'],
      order: [['PROD_ID', 'ASC']]
    });
    const prodIds = existingProducts.map(p => p.PROD_ID).filter(id => id != null);
    res.json({
      count: existingProducts.length,
      products: existingProducts,
      maxProdId: prodIds.length ? Math.max(...prodIds) : 0,
      availableIds: Array.from({ length: 100 }, (_, i) => i + 1)
        .filter(id => !prodIds.includes(id))
        .slice(0, 20)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;