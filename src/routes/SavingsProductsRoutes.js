// routes/products.js

import express from 'express';
import { 
  ProductsController, 
  getSavingsProduct, 
  searchSavingsProducts, 
  getProductByCriteria,
  getAllSavingsProducts, 
  updateSavingsProduct, 
  getProductsByBU,
  initialize  // Now this will work!
} from '../controllers/SavingsProductController.js';

const router = express.Router();

// Initialize products table on startup
router.use(async (req, res, next) => {
  try {
    await initialize();
    next();
  } catch (error) {
    console.error('Failed to initialize products:', error);
    next();
  }
});

// Base routes for savings products
router.route('/savings-products')
  .post(ProductsController.createProduct)               // POST /api/products/savings-products (create new product)
  .get(getAllSavingsProducts);       // GET /api/products/savings-products (get all products)

// Advanced search routes
router.get('/savings-products/search/advanced', searchSavingsProducts);   // GET /api/products/savings-products/search/advanced
router.get('/savings-products/search/by-criteria', getProductByCriteria); // GET /api/products/savings-products/search/by-criteria

// Routes with productCode parameter (now enhanced to search by productName too)
router.route('/savings-products/:productCode')
  .get(getSavingsProduct)            // GET /api/products/savings-products/:productCode?productName=...
  .put(updateSavingsProduct);        // PUT /api/products/savings-products/:productCode

// Business Unit specific routes
router.get('/savings-products/bu/:bu_id', getProductsByBU); // GET /api/products/savings-products/bu/:bu_id

export default router;