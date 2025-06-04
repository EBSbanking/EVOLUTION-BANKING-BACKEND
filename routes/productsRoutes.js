import express from 'express';
import ProductsController from '../controllers/ProductsController.js';

const router = express.Router();

// Route to create a new product
router.post('/products', ProductsController.createProduct);

// Route to get all products
router.get('/products', ProductsController.getAllProducts);

// Route to get a product by ID
router.get('/products/:id', ProductsController.getProductById);

// Route to update a product by ID
router.put('/products/:id', ProductsController.updateProduct);

// Route to delete a product by ID
router.delete('/products/:id', ProductsController.deleteProduct);

export default router;
