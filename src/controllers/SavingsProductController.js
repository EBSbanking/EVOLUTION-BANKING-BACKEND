// controllers/SavingsProductController.js - UPDATED FOR CONSOLIDATED MODEL
import mongoose from 'mongoose';
import SavingsProduct from '../models/SavingsProduct.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';

export const createSavingsProduct = async (req, res) => {
  const {
    PROD_ID,
    productCode,
    productName,
    productDescription,
    productType,
    CRNCY_ID,
    BU_ID,
    rateInformation,
    settlementInformation,
    accrualInformation,
    chargesSetup,
    glAccounts,
    isGlobalProduct,
    accessibleBUs,
    visibility,
    // Legacy fields for compatibility
    PROD_CD,
    PROD_DESC,
    PRODUCT_TYPE,
    START_DT
  } = req.body;

  // ✅ VALIDATE REQUIRED FIELDS
  const requiredFields = {
    productCode,
    productName,
    productDescription,
    productType,
    CRNCY_ID,
    BU_ID
  };

  const missingFields = Object.entries(requiredFields)
    .filter(([_, value]) => value == null || value === '')
    .map(([key]) => key);
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missingFields.join(', ')}`,
    });
  }

  // ✅ HANDLE PROD_ID SAFELY
  let finalPROD_ID = PROD_ID;
  if (!finalPROD_ID || isNaN(finalPROD_ID)) {
    try {
      finalPROD_ID = await SavingsProduct.getNextProdId();
      console.log(`🔄 Generated PROD_ID: ${finalPROD_ID}`);
    } catch (error) {
      console.error('Error generating PROD_ID:', error);
      finalPROD_ID = Math.floor(1000 + Math.random() * 9000);
      console.log(`🔄 Using fallback PROD_ID: ${finalPROD_ID}`);
    }
  } else {
    finalPROD_ID = Number(finalPROD_ID);
    if (isNaN(finalPROD_ID) || finalPROD_ID <= 0) {
      return res.status(400).json({
        success: false,
        message: 'PROD_ID must be a valid positive number',
      });
    }
  }

  // ✅ VALIDATE GL ACCOUNTS
  if (glAccounts) {
    const requiredGLAccounts = ['principalBalance', 'interestIncome', 'interestPayable', 'withholdingTax'];
    const missingGLAccounts = requiredGLAccounts.filter(field => !glAccounts[field]);
    
    if (missingGLAccounts.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required GL accounts: ${missingGLAccounts.join(', ')}`,
      });
    }

    // Validate GL account format
    for (const [key, value] of Object.entries(glAccounts)) {
      if (value && !/^\d+$/.test(value)) {
        return res.status(400).json({
          success: false,
          message: `GL account ${key} must contain only digits`,
        });
      }
    }
  }

  // ✅ VALIDATE CHARGES SETUP
  if (chargesSetup && !Array.isArray(chargesSetup)) {
    return res.status(400).json({
      success: false,
      message: 'chargesSetup must be an array',
    });
  }

  if (chargesSetup) {
    for (const charge of chargesSetup) {
      if (!charge.name || charge.amount == null || !charge.glAccountCode || !charge.chargeType) {
        return res.status(400).json({
          success: false,
          message: 'Each charge must include name, amount, glAccountCode, and chargeType',
        });
      }
    }
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ✅ HANDLE BU_ID - CONVERT TO ARRAY AND VALIDATE
    let buIds = BU_ID;
    if (typeof BU_ID === 'string') {
      buIds = BU_ID.split(',').map(bu => bu.trim()).filter(bu => bu.length > 0);
    } else if (!Array.isArray(BU_ID)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'BU_ID must be a string or array of strings',
      });
    }

    // Remove duplicates and validate
    buIds = [...new Set(buIds)];
    const validBuPattern = /^(\d{3}|\*)$/; // Only allow exact 3-digit or wildcard
    const invalidBUs = buIds.filter(buId => !validBuPattern.test(buId));

    if (invalidBUs.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid BU_ID format(s): ${invalidBUs.join(', ')}. Must be 3-digit string or * for global`,
      });
    }

    // ✅ VALIDATE ENUM VALUES
    const validProductTypes = ['SAVINGS', 'TERM_DEPOSIT', 'CURRENT', 'FIXED_DEPOSIT'];
    if (!validProductTypes.includes(productType)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid productType. Must be one of ${validProductTypes.join(', ')}`,
      });
    }

    const validCurrencies = ['NGN', 'USD', 'EUR', 'GBP'];
    if (!validCurrencies.includes(CRNCY_ID)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid CRNCY_ID. Must be one of ${validCurrencies.join(', ')}`,
      });
    }

    // ✅ CHECK FOR DUPLICATES
    const existingProduct = await SavingsProduct.findOne({ 
      $or: [
        { productCode },
        { PROD_ID: finalPROD_ID }
      ]
    }).session(session);
    
    if (existingProduct) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Product with productCode ${productCode} or PROD_ID ${finalPROD_ID} already exists`,
      });
    }

    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();

    // ✅ DETERMINE PRODUCT SCOPE
    const hasGlobalWildcard = buIds.includes('*');
    const isGlobal = isGlobalProduct !== undefined ? isGlobalProduct : hasGlobalWildcard;

    // ✅ BUILD ACCESSIBLE BUs
    let finalAccessibleBUs = accessibleBUs;
    if (!finalAccessibleBUs) {
      if (hasGlobalWildcard) {
        finalAccessibleBUs = ['*'];
      } else {
        finalAccessibleBUs = buIds;
      }
    }

    // ✅ DETERMINE VISIBILITY
    let finalVisibility = visibility;
    if (!finalVisibility) {
      if (hasGlobalWildcard) {
        finalVisibility = 'GLOBAL';
      } else if (buIds.length > 1) {
        finalVisibility = 'SELECTED_BUS';
      } else {
        finalVisibility = 'SPECIFIC_BRANCHES';
      }
    }

    // ✅ VALIDATE VISIBILITY
    const validVisibilityValues = ['GLOBAL', 'SELECTED_BUS', 'SPECIFIC_BRANCHES'];
    if (finalVisibility && !validVisibilityValues.includes(finalVisibility)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid visibility value. Must be one of: ${validVisibilityValues.join(', ')}`,
      });
    }

    // ✅ BUILD PRODUCT DATA
    const productData = {
      PROD_ID: finalPROD_ID,
      productCode: productCode.toUpperCase(),
      productName,
      productDescription,
      productType,
      CRNCY_ID,
      BU_ID: buIds,
      START_DT: START_DT ? new Date(START_DT) : new Date(),
      isGlobalProduct: isGlobal,
      accessibleBUs: finalAccessibleBUs,
      visibility: finalVisibility,
      REC_ST: 'A',
      CREATED_BY: userId
    };

    // ✅ ADD RATE INFORMATION WITH DEFAULTS
    if (rateInformation) {
      productData.rateInformation = {
        rateType: rateInformation.rateType || 'FIXED',
        fixedRate: rateInformation.fixedRate 
          ? mongoose.Types.Decimal128.fromString(parseFloat(rateInformation.fixedRate).toFixed(4))
          : mongoose.Types.Decimal128.fromString('0.0000'),
        marginRate: rateInformation.marginRate 
          ? mongoose.Types.Decimal128.fromString(parseFloat(rateInformation.marginRate).toFixed(4))
          : undefined,
        effectiveRate: rateInformation.effectiveRate
          ? mongoose.Types.Decimal128.fromString(parseFloat(rateInformation.effectiveRate).toFixed(4))
          : mongoose.Types.Decimal128.fromString('0.0000'),
        effectiveDate: rateInformation.effectiveDate ? new Date(rateInformation.effectiveDate) : new Date(),
        rateStructure: rateInformation.rateStructure || 'FLAT'
      };
    } else {
      // Default rate information
      productData.rateInformation = {
        rateType: 'FIXED',
        fixedRate: mongoose.Types.Decimal128.fromString('0.5000'),
        effectiveRate: mongoose.Types.Decimal128.fromString('0.5000'),
        effectiveDate: new Date(),
        rateStructure: 'FLAT'
      };
    }

    // ✅ ADD INTEREST RATE (for first schema compatibility)
    productData.interestRate = productData.rateInformation.effectiveRate;

    // ✅ ADD SETTLEMENT INFORMATION WITH DEFAULTS
    if (settlementInformation) {
      productData.settlementInformation = {
        settlementFrequency: settlementInformation.settlementFrequency || 'MONTHLY',
        principalSettlementMethod: settlementInformation.principalSettlementMethod || 'ACCOUNT',
        interestSettlementMethod: settlementInformation.interestSettlementMethod || 'ACCOUNT',
        settlementGLAccountNo: settlementInformation.settlementGLAccountNo || '1-01-001-001-001-1',
        applicableAccountStatusOption: settlementInformation.applicableAccountStatusOption || 'ACTIVE_ONLY'
      };
    }

    // ✅ ADD ACCRUAL INFORMATION WITH DEFAULTS
    if (accrualInformation) {
      productData.accrualInformation = {
        accrualBasis: accrualInformation.accrualBasis || 'ACT/365',
        accrualStartDate: accrualInformation.accrualStartDate ? new Date(accrualInformation.accrualStartDate) : new Date(),
        accrualFrequency: accrualInformation.accrualFrequency || 'DAILY',
        accrualBalanceType: accrualInformation.accrualBalanceType || 'CURRENT_CLEARED',
        skipInterestForIncompletePeriod: accrualInformation.skipInterestForIncompletePeriod || false
      };
    }

    // ✅ ADD GL ACCOUNTS WITH DEFAULTS
    if (glAccounts) {
      productData.glAccounts = {
        principalBalance: glAccounts.principalBalance,
        interestIncome: glAccounts.interestIncome,
        interestPayable: glAccounts.interestPayable,
        withholdingTax: glAccounts.withholdingTax,
        interestReceivable: glAccounts.interestReceivable || '1001001005'
      };
    } else {
      // Default GL accounts
      productData.glAccounts = {
        principalBalance: '1001001001',
        interestIncome: '1001001002',
        interestPayable: '1001001003',
        withholdingTax: '1001001004',
        interestReceivable: '1001001005'
      };
    }

    // ✅ ADD CHARGES SETUP
    if (chargesSetup && chargesSetup.length > 0) {
      productData.chargesSetup = chargesSetup.map(charge => ({
        name: charge.name,
        chargeType: charge.chargeType,
        amount: mongoose.Types.Decimal128.fromString(parseFloat(charge.amount).toFixed(2)),
        glAccountCode: charge.glAccountCode,
        frequency: charge.frequency || 'ONE_TIME'
      }));
    }

    // ✅ ADD LEGACY FIELDS
    if (PROD_CD) productData.PROD_CD = PROD_CD;
    if (PROD_DESC) productData.PROD_DESC = PROD_DESC;
    if (PRODUCT_TYPE) productData.PRODUCT_TYPE = PRODUCT_TYPE;

    // ✅ CREATE SAVINGS PRODUCT
    const newSavingsProduct = new SavingsProduct(productData);
    const savedProduct = await newSavingsProduct.save({ session });

    // ✅ CREATE AUDIT TRAIL
    try {
      await AuditTrail.create([{
        event_id: Date.now(),
        user_id: userId,
        event_type: 'SAVINGS_PRODUCT_CREATE',
        action: 'Create Savings Product',
        old_value: null,
        new_value: savedProduct.toObject(),
        ip_address: ipAddress,
        timestamp: now,
        entity_type: 'SavingsProduct',
        entity_id: savedProduct._id,
        status: 'SUCCESS',
        description: `Created savings product ${productCode} with PROD_ID ${finalPROD_ID}`,
        metadata: {
          bu_patterns: buIds,
          is_global: isGlobal,
          visibility: finalVisibility
        }
      }], { session });
    } catch (auditError) {
      logger.error('Failed to create audit trail for savings product creation', {
        error: auditError.message,
        productCode,
        timestamp: now,
      });
    }

    await session.commitTransaction();

    // ✅ SUCCESS RESPONSE
    let successMessage;
    if (hasGlobalWildcard) {
      successMessage = 'Savings product created successfully for ALL business units (global)';
    } else {
      successMessage = `Savings product created successfully for ${buIds.length} business unit(s)`;
    }

    return res.status(201).json({
      success: true,
      message: successMessage,
      product: savedProduct,
      metadata: {
        PROD_ID: finalPROD_ID,
        total_bu_entries: buIds.length,
        is_global: isGlobal,
        visibility: finalVisibility
      }
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error creating savings product:', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date(),
    });

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error - Product with this code or ID already exists',
        error: error.keyValue,
      });
    }

    return res.status(error.name === 'ValidationError' ? 400 : 500).json({
      success: false,
      message: 'An error occurred while creating the savings product',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// ✅ GET SAVINGS PRODUCT BY PRODUCT CODE
export const getSavingsProduct = async (req, res) => {
  const { productCode } = req.params;

  try {
    const product = await SavingsProduct.findByProductCode(productCode);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Savings product with productCode ${productCode} not found`,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Savings product retrieved successfully',
      product,
    });
  } catch (error) {
    logger.error('Error retrieving savings product:', {
      error: error.message,
      stack: error.stack,
      productCode,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving the savings product',
      error: error.message,
    });
  }
};

// ✅ GET ALL SAVINGS PRODUCTS
export const getAllSavingsProducts = async (req, res) => {
  try {
    const { activeOnly = 'true' } = req.query;
    
    let query = {};
    if (activeOnly === 'true') {
      query = { REC_ST: { $in: ['A', 'ACTIVE'] } };
    }

    const products = await SavingsProduct.find(query).sort({ productCode: 1 });
    
    return res.status(200).json({
      success: true,
      message: 'Savings products retrieved successfully',
      data: products,
      count: products.length
    });
  } catch (error) {
    logger.error('Error retrieving all savings products:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving savings products',
      error: error.message,
    });
  }
};

// ✅ UPDATE SAVINGS PRODUCT
export const updateSavingsProduct = async (req, res) => {
  const { productCode } = req.params;
  const updateData = req.body;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // ✅ FIND EXISTING PRODUCT
    const existingProduct = await SavingsProduct.findOne({ productCode }).session(session);
    if (!existingProduct) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `Savings product with productCode ${productCode} not found`,
      });
    }

    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();

    // ✅ PREPARE UPDATE DATA
    const updateFields = { ...updateData };
    
    // Handle Decimal128 conversions for rate fields
    if (updateFields.rateInformation) {
      if (updateFields.rateInformation.fixedRate) {
        updateFields.rateInformation.fixedRate = mongoose.Types.Decimal128.fromString(
          parseFloat(updateFields.rateInformation.fixedRate).toFixed(4)
        );
      }
      if (updateFields.rateInformation.marginRate) {
        updateFields.rateInformation.marginRate = mongoose.Types.Decimal128.fromString(
          parseFloat(updateFields.rateInformation.marginRate).toFixed(4)
        );
      }
      if (updateFields.rateInformation.effectiveRate) {
        updateFields.rateInformation.effectiveRate = mongoose.Types.Decimal128.fromString(
          parseFloat(updateFields.rateInformation.effectiveRate).toFixed(4)
        );
        // Also update the top-level interestRate for compatibility
        updateFields.interestRate = updateFields.rateInformation.effectiveRate;
      }
    }

    // Handle charges setup amounts
    if (updateFields.chargesSetup && Array.isArray(updateFields.chargesSetup)) {
      updateFields.chargesSetup = updateFields.chargesSetup.map(charge => ({
        ...charge,
        amount: mongoose.Types.Decimal128.fromString(parseFloat(charge.amount).toFixed(2))
      }));
    }

    // ✅ UPDATE PRODUCT
    const updatedProduct = await SavingsProduct.findOneAndUpdate(
      { productCode },
      updateFields,
      { new: true, runValidators: true, session }
    );

    if (!updatedProduct) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `Savings product with productCode ${productCode} not found`,
      });
    }

    // ✅ CREATE AUDIT TRAIL
    try {
      await AuditTrail.create([{
        event_id: Date.now(),
        user_id: userId,
        event_type: 'SAVINGS_PRODUCT_UPDATE',
        action: 'Update Savings Product',
        old_value: existingProduct.toObject(),
        new_value: updatedProduct.toObject(),
        ip_address: ipAddress,
        timestamp: now,
        entity_type: 'SavingsProduct',
        entity_id: updatedProduct._id,
        status: 'SUCCESS',
        description: `Updated savings product ${productCode}`,
      }], { session });
    } catch (auditError) {
      logger.error('Failed to create audit trail for savings product update', {
        error: auditError.message,
        productCode,
        timestamp: now,
      });
    }

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: 'Savings product updated successfully',
      product: updatedProduct,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error updating savings product:', {
      error: error.message,
      stack: error.stack,
      productCode,
      updateData,
      timestamp: new Date(),
    });

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error',
        error: error.keyValue,
      });
    }

    return res.status(error.name === 'ValidationError' ? 400 : 500).json({
      success: false,
      message: 'An error occurred while updating the savings product',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// ✅ GET PRODUCTS BY BUSINESS UNIT
export const getProductsByBU = async (req, res) => {
  try {
    const { bu_id } = req.params;
    
    if (!/^\d{3}$/.test(bu_id)) {
      return res.status(400).json({
        success: false,
        message: 'BU_ID must be a 3-digit string',
      });
    }

    const products = await SavingsProduct.find({
      $or: [
        { isGlobalProduct: true },
        { accessibleBUs: '*' },
        { accessibleBUs: bu_id },
        { BU_ID: bu_id },
        { BU_ID: '*' }
      ],
      REC_ST: { $in: ['A', 'ACTIVE'] }
    });

    return res.status(200).json({
      success: true,
      message: `Products retrieved for BU ${bu_id}`,
      data: products,
      count: products.length
    });
  } catch (error) {
    logger.error('Error retrieving products by BU:', {
      error: error.message,
      stack: error.stack,
      bu_id: req.params.bu_id,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving products',
      error: error.message,
    });
  }
};

// ✅ DEACTIVATE SAVINGS PRODUCT
export const deactivateSavingsProduct = async (req, res) => {
  const { productCode } = req.params;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existingProduct = await SavingsProduct.findOne({ productCode }).session(session);
    if (!existingProduct) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `Savings product with productCode ${productCode} not found`,
      });
    }

    const updatedProduct = await SavingsProduct.findOneAndUpdate(
      { productCode },
      { REC_ST: 'I' },
      { new: true, session }
    );

    // ✅ CREATE AUDIT TRAIL
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    
    await AuditTrail.create([{
      event_id: Date.now(),
      user_id: userId,
      event_type: 'SAVINGS_PRODUCT_DEACTIVATE',
      action: 'Deactivate Savings Product',
      old_value: existingProduct.toObject(),
      new_value: updatedProduct.toObject(),
      ip_address: ipAddress,
      timestamp: new Date(),
      entity_type: 'SavingsProduct',
      entity_id: updatedProduct._id,
      status: 'SUCCESS',
      description: `Deactivated savings product ${productCode}`,
    }], { session });

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: 'Savings product deactivated successfully',
      product: updatedProduct,
    });
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error deactivating savings product:', {
      error: error.message,
      stack: error.stack,
      productCode,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while deactivating the savings product',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};