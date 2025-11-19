// src/controllers/LoanProductController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import LoanProduct from '../models/LoanProduct.js';
import ProductTypeMapping from '../models/ProductTypeMapping.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';

// Safe Decimal128 converter
const toDecimal = (val, field) => {
  const num = parseFloat(val);
  if (isNaN(num) || num < 0) throw new Error(`${field} must be a positive number`);
  return mongoose.Types.Decimal128.fromString(num.toFixed(2));
};

export const LoanProductController = {
  createProduct: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const {
        name,
        productCode,
        BU_ID = [],
        PROD_ID,
        description = '',
        PAYMENT_FREQUENCY = 'WEEKLY',
        TERM_CD = 'W',
        loanGLAccount,
        principalGLAccountNo,
        interestGLAccountNo,
        SETTLEMENT_GL_ACCT_NO,
        minTerm,
        maxTerm,
        minAmount,
        maxAmount,
        interestRate,
        createdBy = req.user?.id || 'SYSTEM'
      } = req.body;

      // REQUIRED FIELDS
      if (!name || !productCode || !loanGLAccount) {
        throw new Error('name, productCode, and loanGLAccount are required');
      }
      if (minTerm == null || maxTerm == null || minAmount == null || maxAmount == null || interestRate == null) {
        throw new Error('minTerm, maxTerm, minAmount, maxAmount, and interestRate are required');
      }

      // BU_ID → array of strings
      let buIds = Array.isArray(BU_ID) ? BU_ID.map(String) : typeof BU_ID === 'string' ? BU_ID.split(',').map(String) : BU_ID != null ? [String(BU_ID)] : [];
      buIds = buIds.map(id => id.trim()).filter(Boolean);
      buIds = [...new Set(buIds)];

      if (buIds.length === 0) throw new Error('BU_ID is required');

      const validPattern = /^(\d{3}|\*|\d{1,2}\*|\*\d{1,2}|\d\*\d)$/;
      if (!buIds.every(id => validPattern.test(id))) {
        throw new Error('Invalid BU_ID format');
      }

      const isGlobal = buIds.includes('*');

      // CREATE LOAN PRODUCT
      const loanProduct = new LoanProduct({
        name,
        productCode,
        PROD_CD: productCode,
        PROD_ID: PROD_ID || Number(productCode),
        PRODUCT_TYPE: 'GROUP_LOAN',
        BU_ID: buIds,
        isGlobalProduct: isGlobal,
        accessibleBUs: isGlobal ? ['*'] : buIds,
        visibility: isGlobal ? 'GLOBAL' : 'SELECTED_BUS',
        description,
        loanGLAccount,
        principalGLAccountNo,
        interestGLAccountNo,
        SETTLEMENT_GL_ACCT_NO,
        PAYMENT_FREQUENCY,
        TERM_CD,
        minTerm: Number(minTerm),
        maxTerm: Number(maxTerm),
        minAmount: toDecimal(minAmount, 'minAmount'),
        maxAmount: toDecimal(maxAmount, 'maxAmount'),
        interestRate: toDecimal(interestRate, 'interestRate'),
        createdBy,
        allowedCurrencies: ['NGN'],
        isActive: true,
        accrualInformation: { accrualMethod: 'DAILY', accrualBasis: 'ACTUAL/365' }
      });

      await loanProduct.save({ session });

      // PRODUCT TYPE MAPPING — FIXED: accountPrefix = '10' (2+ chars)
      await new ProductTypeMapping({
        PROD_ID: loanProduct.PROD_ID,
        PRODUCT_TYPE: 'GROUP_LOAN',
        productName: name,
        accountPrefix: '10',  // ← FIXED: Was '1', now '10' → passes validation
        BU_ID: buIds,
        isGlobalProduct: isGlobal,
        visibility: loanProduct.visibility,
        glAccounts: {
          loanGLAccount,
          principalGLAccountNo,
          interestGLAccountNo,
          SETTLEMENT_GL_ACCT_NO
        }
      }).save({ session });

      await session.commitTransaction();

      res.status(201).json({
        success: true,
        message: 'GROUP_LOAN product created successfully',
        data: {
          PROD_ID: loanProduct.PROD_ID,
          productCode,
          BU_ID: buIds,
          accountPrefix: '10',
          minTerm: loanProduct.minTerm,
          maxTerm: loanProduct.maxTerm,
          interestRate: parseFloat(loanProduct.interestRate.toString())
        }
      });

    } catch (error) {
      await session.abortTransaction();
      logger.error('Product creation failed:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create loan product'
      });
    } finally {
      session.endSession();
    }
  }),

  // Other methods (getAll, getOne, update, delete) remain the same...
  getAllLoanProducts: asyncHandler(async (req, res) => {
    const products = await LoanProduct.find().lean();
    res.json({ success: true, count: products.length, data: products });
  }),
  
  getLoanProduct: asyncHandler(async (req, res) => {
    const { id } = req.params;
    let product;

    if (mongoose.Types.ObjectId.isValid(id)) {
      product = await LoanProduct.findById(id);
    } else {
      product = await LoanProduct.findOne({ $or: [{ productCode: id }, { PROD_ID: Number(id) || 0 }] });
    }

    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, data: product });
  }),

  updateLoanProduct: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const product = await LoanProduct.findByIdAndUpdate(id, req.body, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product updated', data: product });
  }),

  deleteLoanProduct: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const product = await LoanProduct.findByIdAndDelete(id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product deleted' });
  })
};