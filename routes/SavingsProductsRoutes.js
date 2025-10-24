import express from 'express';
import { 
  createSavingsProduct, 
  getSavingsProduct, 
  getAllSavingsProducts, 
  updateSavingsProduct, 
  getProductsByBU 
} from '../controllers/SavingsProductController.js';

const router = express.Router();

// Base routes for savings products
router.route('/savings-products')
  .get(getAllSavingsProducts)        // GET /api/products/savings-products
  .post(createSavingsProduct);       // POST /api/products/savings-products

// Routes with productCode
router.route('/savings-products/:productCode')
  .get(getSavingsProduct)            // GET /api/products/savings-products/:productCode
  .put(updateSavingsProduct);        // PUT /api/products/savings-products/:productCode

// Business Unit specific routes
router.get('/savings-products/bu/:bu_id', getProductsByBU); // GET /api/products/savings-products/bu/:bu_id

export default router;