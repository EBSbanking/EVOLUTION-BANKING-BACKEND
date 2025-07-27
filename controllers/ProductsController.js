import Product from '../models/Products.js';
import LoanProduct from '../models/LoanProduct.js';
import ProductTypeMapping from '../models/ProductTypeMapping.js';

const ProductsController = {

  // Create a new product and loan product with mapping
 createProduct: async (req, res) => {
  try {
    // Step 1: Save base product
    const newProduct = new Product(req.body);
    await newProduct.save();

    // Step 2: Save to LoanProduct if applicable
    let loanProduct = await LoanProduct.findOne({ productCode: req.body.productCode });

    if (!loanProduct) {
      loanProduct = await LoanProduct.create(req.body);
    }

    // Step 3: Determine PRODUCT_TYPE from name
    const { PROD_ID, name } = loanProduct;
    let PRODUCT_TYPE = null;

    if (/individual/i.test(name)) PRODUCT_TYPE = 'INDIVIDUAL_LOAN';
    else if (/term\s*deposit/i.test(name)) PRODUCT_TYPE = 'TERM_DEPOSIT';
    else if (/savings?/i.test(name)) PRODUCT_TYPE = 'SAVINGS';

    // Step 4: Save product-type mapping
    if (PRODUCT_TYPE) {
      await ProductTypeMapping.findOneAndUpdate(
        { PROD_ID },
        { PRODUCT_TYPE },
        { upsert: true, new: true }
      );
    }

    return res.status(201).json({
      message: 'Product and loan product created successfully',
      data: { baseProduct: newProduct, loanProduct }
    });

  } catch (error) {
    console.error('Create Product Error:', error);
    return res.status(500).json({
      message: 'Error creating product and loan product',
      error: error.message
    });
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
      const product = await Product.findOne({ PROD_ID: req.params.id });
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
        { PROD_ID: req.params.id },
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
      const deletedProduct = await Product.findOneAndDelete({ PROD_ID: req.params.id });
      if (!deletedProduct) {
        return res.status(404).json({ message: 'Product not found' });
      }

      // Optionally delete from LoanProduct and mapping
      await LoanProduct.deleteOne({ PROD_ID: req.params.id });
      await ProductTypeMapping.deleteOne({ PROD_ID: req.params.id });

      res.status(200).json({ message: 'Product and related data deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: 'Error deleting product', error: error.message });
    }
  },
};

export default ProductsController;
