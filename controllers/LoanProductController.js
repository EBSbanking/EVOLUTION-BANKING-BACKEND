// controllers/LoanProductController.js
import mongoose from 'mongoose';
import LoanProduct from '../models/LoanProduct.js';
import ProductTypeMapping from '../models/ProductTypeMapping.js';
import { getPrefixForProductType } from '../utils/generateLoanAccountId.js';

export const createLoanProduct = async (req, res) => {
  try {
    // Validate required fields
    if (!req.body.name || !req.body.PROD_ID || !req.body.productCode) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: name, PROD_ID, and productCode are required'
      });
    }

    // Clone and prepare data
    const productData = { ...req.body };

    // Process fee structure
    if (productData.feeStructure) {
      productData.feeStructure = productData.feeStructure.map(fee => {
        const amount = fee.amount !== undefined
          ? new mongoose.Types.Decimal128(fee.amount.toString())
          : new mongoose.Types.Decimal128('0');

        return {
          ...fee,
          feeType: fee.feeType?.toUpperCase().replace(/\s+/g, '_') || 'OTHER',
          amount,
          name: fee.name || fee.feeType || 'Unnamed Fee'
        };
      });

      // Validate GL account codes
      for (const fee of productData.feeStructure) {
        if (!fee.glAccountCode) {
          return res.status(400).json({
            success: false,
            message: `GL account code is required for fee: ${fee.name || fee.feeType}`
          });
        }
      }
    }

    // Convert processing fee rate
    if (productData.processingFeeRate !== undefined) {
      productData.processingFeeRate = new mongoose.Types.Decimal128(
        productData.processingFeeRate.toString()
      );

      if (parseFloat(productData.processingFeeRate.toString()) > 0 && !productData.processingFeeGLCode) {
        return res.status(400).json({
          success: false,
          message: 'Processing fee GL account code is required when processing fee is applied'
        });
      }
    }

    // Set PROD_ID from productCode if not explicitly present
    productData.PROD_ID = productData.PROD_ID || productData.productCode;

    // Create and save the loan product
    const loanProduct = new LoanProduct(productData);
    await loanProduct.save();

    // Determine PRODUCT_TYPE based on the product name and product code
    const { PROD_ID, name, productCode } = loanProduct;
    let PRODUCT_TYPE = 'GENERAL_LOAN'; // Default fallback

    // First check by product code (301 in your case)
    switch (String(productCode)) {
      case '300':
        PRODUCT_TYPE = 'BUSINESS_TERM_LOAN';
        break;
      case '301':
        PRODUCT_TYPE = 'INDIVIDUAL_LOAN'; // Changed from SME_LOAN to INDIVIDUAL_LOAN
        break;
      case '302':
        PRODUCT_TYPE = 'CONSUMER_LOAN';
        break;
      default:
        // If product code doesn't match, try name matching
        if (/business\s*term\s*loan/i.test(name)) {
          PRODUCT_TYPE = 'BUSINESS_TERM_LOAN';
        } else if (/individual\s*loan/i.test(name) || /term\s*deposit/i.test(name)) {
          PRODUCT_TYPE = 'INDIVIDUAL_LOAN';
        } else if (/sme\s*loan/i.test(name)) {
          PRODUCT_TYPE = 'SME_LOAN';
        } else if (/consumer\s*loan/i.test(name)) {
          PRODUCT_TYPE = 'CONSUMER_LOAN';
        }
    }

    // Get the account prefix
    const accountPrefix = getPrefixForProductType(PRODUCT_TYPE);

    // Save the product type mapping
    await ProductTypeMapping.findOneAndUpdate(
      { PROD_ID },
      { 
        PROD_ID,
        PRODUCT_TYPE,
        productName: name,
        accountPrefix
      },
      { upsert: true, new: true }
    );

    // Send successful response
    res.status(201).json({
      success: true,
      message: 'Loan product created successfully',
      data: {
        ...loanProduct.toObject({ getters: true, virtuals: true }),
        productType: PRODUCT_TYPE,
        accountPrefix
      }
    });
  } catch (error) {
    console.error('Create Loan Product Error:', error);

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    if (error.name === 'MongoError' && error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Product with this PROD_ID or productCode already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Error creating loan product',
      error: error.message
    });
  }
};


// Get all loan products
export const getAllLoanProducts = async (req, res) => {
  try {
    const products = await LoanProduct.find();
    res.status(200).json({ success: true, data: products });
  } catch (error) {
    console.error('Fetch All Loan Products Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching loan products', 
      error: error.message 
    });
  }
};

// Get single loan product
export const getLoanProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = mongoose.Types.ObjectId.isValid(id)
      ? await LoanProduct.findById(id)
      : await LoanProduct.findOne({ 
          $or: [
            { productCode: id },
            { PROD_ID: id }
          ]
        });

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Loan product not found' 
      });
    }

    res.status(200).json({ success: true, data: product });
  } catch (error) {
    console.error('Fetch Loan Product Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching loan product', 
      error: error.message 
    });
  }
};

// Update loan product
export const updateLoanProduct = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate GL codes if updating fee structure
    if (req.body.feeStructure) {
      for (const fee of req.body.feeStructure) {
        if (!fee.glAccountCode) {
          return res.status(400).json({ 
            success: false, 
            message: `GL account code is required for fee type: ${fee.feeType}` 
          });
        }
      }
    }

    const updated = await LoanProduct.findByIdAndUpdate(
      id,
      {
        ...req.body,
        updatedAt: new Date()
      }, 
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ 
        success: false, 
        message: 'Loan product not found' 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Loan product updated', 
      data: updated 
    });
  } catch (error) {
    console.error('Update Loan Product Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating loan product', 
      error: error.message 
    });
  }
};

// Delete loan product
export const deleteLoanProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await LoanProduct.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ 
        success: false, 
        message: 'Loan product not found' 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Loan product deleted' 
    });
  } catch (error) {
    console.error('Delete Loan Product Error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting loan product', 
      error: error.message 
    });
  }
};