import Product from '../models/Products.js';
import AutoReclassifyInformation from '../models/AutoReclassifyInformation.js';

// Controller for handling Product operations
const ProductsController = {
  
  // Create a new product
  createProduct: async (req, res) => {
    try {
      const newProduct = new Product(req.body);
      await newProduct.save();
      res.status(201).json({ message: 'Product created successfully', data: newProduct });
    } catch (error) {
      res.status(500).json({ message: 'Error creating product', error: error.message });
    }
  },

  // Get all products
  getAllProducts: async (req, res) => {
    try {
      const products = await Product.find();
      res.status(200).json({ data: products });
    } catch (error) {
      res.status(500).json({ message: 'Error fetching products', error: error.message });
    }
  },

 

  // Get a product by PROD_ID
  getProductById: async (req, res) => {
    try {
      const product = await Product.findOne({ PROD_ID: req.params.id }); // Searching by PROD_ID
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      res.status(200).json({ data: product });
    } catch (error) {
      res.status(500).json({ message: 'Error fetching product', error: error.message });
    }
  },

  // Update a product by PROD_ID
  updateProduct: async (req, res) => {
    try {
      const updatedProduct = await Product.findOneAndUpdate(
        { PROD_ID: req.params.id }, // Searching by PROD_ID
        req.body,
        { new: true, runValidators: true }
      );
      if (!updatedProduct) {
        return res.status(404).json({ message: 'Product not found' });
      }
      res.status(200).json({ message: 'Product updated successfully', data: updatedProduct });
    } catch (error) {
      res.status(500).json({ message: 'Error updating product', error: error.message });
    }
  },

  // Delete a product by PROD_ID
  deleteProduct: async (req, res) => {
    try {
      const deletedProduct = await Product.findOneAndDelete({ PROD_ID: req.params.id }); // Searching by PROD_ID
      if (!deletedProduct) {
        return res.status(404).json({ message: 'Product not found' });
      }
      res.status(200).json({ message: 'Product deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error deleting product', error: error.message });
    }
  },
};


export default ProductsController;
