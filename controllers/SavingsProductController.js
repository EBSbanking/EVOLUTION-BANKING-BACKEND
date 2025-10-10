import mongoose from 'mongoose';
import SavingsProduct from '../models/SavingsProduct.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';

export const createSavingsProduct = async (req, res) => {
  const {
    productCode,
    productName,
    productType,
    CRNCY_ID,
    BU_ID,
    rateInformation,
    settlementInformation,
    accrualInformation,
    chargesSetup,
    principalBalanceGLAccountNo,
    interestGLAccountNo,
    interestPayableGLAccountNo,
    withholdingTaxGLAccountNo,
  } = req.body;

  // Validate required fields
  const requiredFields = {
    productCode,
    productName,
    productType,
    CRNCY_ID,
    BU_ID,
    rateInformation,
    settlementInformation,
    accrualInformation,
    chargesSetup,
    principalBalanceGLAccountNo,
    interestGLAccountNo,
    interestPayableGLAccountNo,
  };

  const missingFields = Object.entries(requiredFields)
    .filter(([_, value]) => value == null)
    .map(([key]) => key);
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missingFields.join(', ')}`,
    });
  }

  // Validate subdocument fields
  if (!rateInformation.rateType || !rateInformation.effectiveRate || !rateInformation.effectiveDate) {
    return res.status(400).json({
      success: false,
      message: 'rateInformation must include rateType, effectiveRate, and effectiveDate',
    });
  }
  if (rateInformation.rateType === 'FIXED' && rateInformation.fixedRate == null) {
    return res.status(400).json({
      success: false,
      message: 'fixedRate is required for FIXED rateType',
    });
  }
  if (rateInformation.rateType === 'FLOATING' && rateInformation.marginRate == null) {
    return res.status(400).json({
      success: false,
      message: 'marginRate is required for FLOATING rateType',
    });
  }
  if (!settlementInformation.settlementFrequency ||
      !settlementInformation.principalSettlementMethod ||
      !settlementInformation.interestSettlementMethod ||
      !settlementInformation.settlementGLAccountNo) {
    return res.status(400).json({
      success: false,
      message: 'settlementInformation must include settlementFrequency, principalSettlementMethod, interestSettlementMethod, and settlementGLAccountNo',
    });
  }
  if (!accrualInformation.accrualBasis || !accrualInformation.accrualStartDate || !accrualInformation.accrualFrequency) {
    return res.status(400).json({
      success: false,
      message: 'accrualInformation must include accrualBasis, accrualStartDate, and accrualFrequency',
    });
  }
  if (!chargesSetup.chargeType || !chargesSetup.chargeAmount || !chargesSetup.chargeGLAccountNo) {
    return res.status(400).json({
      success: false,
      message: 'chargesSetup must include chargeType, chargeAmount, and chargeGLAccountNo',
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Validate GL accounts
    const glAccountsToValidate = [
      { account: principalBalanceGLAccountNo, transactionType: 'CR', category: 'LIABILITY' },
      { account: interestGLAccountNo, transactionType: 'DR', category: 'EXPENSE' },
      { account: interestPayableGLAccountNo, transactionType: 'CR', category: 'LIABILITY' },
      { account: settlementInformation.settlementGLAccountNo, transactionType: 'DR', category: 'ASSET' },
      { account: settlementInformation.settlementGLAccountNo, transactionType: 'CR', category: 'ASSET' },
      { account: chargesSetup.chargeGLAccountNo, transactionType: 'CR', category: 'LIABILITY' },
      ...(rateInformation.fixedRate && parseFloat(rateInformation.fixedRate.toString()) > 0
        ? [{ account: withholdingTaxGLAccountNo, transactionType: 'CR', category: 'LIABILITY' }]
        : []),
    ];

    for (const { account, transactionType, category } of glAccountsToValidate) {
      await validateGLAccount(account, transactionType, category, session);
    }

    // Validate BU_ID format
    if (!/^\d{3}$/.test(BU_ID)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'BU_ID must be a 3-digit string',
      });
    }

    // Validate productType and CRNCY_ID
    const validProductTypes = ['SAVINGS', 'TERM_DEPOSIT'];
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

    // Check for duplicate productCode
    const existingProduct = await SavingsProduct.findOne({ productCode }).session(session);
    if (existingProduct) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Product with productCode ${productCode} already exists`,
      });
    }

    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();

    // Create new savings product
    const newSavingsProduct = new SavingsProduct({
      productCode,
      productName,
      productType,
      CRNCY_ID,
      BU_ID,
      rateInformation: {
        rateType: rateInformation.rateType,
        fixedRate: rateInformation.fixedRate
          ? mongoose.Types.Decimal128.fromString(parseFloat(rateInformation.fixedRate).toFixed(2))
          : undefined,
        marginRate: rateInformation.marginRate
          ? mongoose.Types.Decimal128.fromString(parseFloat(rateInformation.marginRate).toFixed(2))
          : undefined,
        effectiveRate: mongoose.Types.Decimal128.fromString(parseFloat(rateInformation.effectiveRate).toFixed(2)),
        effectiveDate: new Date(rateInformation.effectiveDate),
      },
      settlementInformation: {
        settlementFrequency: settlementInformation.settlementFrequency,
        principalSettlementMethod: settlementInformation.principalSettlementMethod,
        interestSettlementMethod: settlementInformation.interestSettlementMethod,
        settlementGLAccountNo: settlementInformation.settlementGLAccountNo,
      },
      accrualInformation: {
        accrualBasis: accrualInformation.accrualBasis,
        accrualStartDate: new Date(accrualInformation.accrualStartDate),
        accrualFrequency: accrualInformation.accrualFrequency,
      },
      chargesSetup: {
        chargeType: chargesSetup.chargeType,
        chargeAmount: mongoose.Types.Decimal128.fromString(parseFloat(chargesSetup.chargeAmount).toFixed(2)),
        chargeGLAccountNo: chargesSetup.chargeGLAccountNo,
      },
      principalBalanceGLAccountNo,
      interestGLAccountNo,
      interestPayableGLAccountNo,
      withholdingTaxGLAccountNo,
    });

    const savedProduct = await newSavingsProduct.save({ session });

    // Create audit trail
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
        description: `Created savings product with productCode ${productCode}`,
      }], { session });
    } catch (auditError) {
      logger.error('Failed to create audit trail for savings product creation', {
        error: auditError.message,
        productCode,
        timestamp: now,
      });
    }

    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      message: 'Savings product created successfully',
      product: savedProduct,
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
        message: 'Duplicate key error',
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

// GET Savings Product by productCode
export const getSavingsProduct = async (req, res) => {
  const { productCode } = req.params;

  try {
    const product = await SavingsProduct.findOne({ productCode });
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

// GET All Savings Products
export const getAllSavingsProducts = async (req, res) => {
  try {
    const products = await SavingsProduct.find().sort({ productCode: 1 });
    
    return res.status(200).json({
      success: true,
      message: 'All savings products retrieved successfully',
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
      message: 'An error occurred while retrieving all savings products',
      error: error.message,
    });
  }
};

// UPDATE Savings Product by productCode
export const updateSavingsProduct = async (req, res) => {
  const { productCode } = req.params;
  const {
    productName,
    productType,
    CRNCY_ID,
    BU_ID,
    rateInformation,
    settlementInformation,
    accrualInformation,
    chargesSetup,
    principalBalanceGLAccountNo,
    interestGLAccountNo,
    interestPayableGLAccountNo,
    withholdingTaxGLAccountNo,
  } = req.body;

  // Validate required fields
  const requiredFields = {
    productName,
    productType,
    CRNCY_ID,
    BU_ID,
    rateInformation,
    settlementInformation,
    accrualInformation,
    chargesSetup,
    principalBalanceGLAccountNo,
    interestGLAccountNo,
    interestPayableGLAccountNo,
  };

  const missingFields = Object.entries(requiredFields)
    .filter(([_, value]) => value == null)
    .map(([key]) => key);
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: `Missing required fields: ${missingFields.join(', ')}`,
    });
  }

  // Validate subdocument fields
  if (!rateInformation.rateType || !rateInformation.effectiveRate || !rateInformation.effectiveDate) {
    return res.status(400).json({
      success: false,
      message: 'rateInformation must include rateType, effectiveRate, and effectiveDate',
    });
  }
  if (rateInformation.rateType === 'FIXED' && rateInformation.fixedRate == null) {
    return res.status(400).json({
      success: false,
      message: 'fixedRate is required for FIXED rateType',
    });
  }
  if (rateInformation.rateType === 'FLOATING' && rateInformation.marginRate == null) {
    return res.status(400).json({
      success: false,
      message: 'marginRate is required for FLOATING rateType',
    });
  }
  if (
    !settlementInformation.settlementFrequency ||
    !settlementInformation.principalSettlementMethod ||
    !settlementInformation.interestSettlementMethod ||
    !settlementInformation.settlementGLAccountNo
  ) {
    return res.status(400).json({
      success: false,
      message: 'settlementInformation must include settlementFrequency, principalSettlementMethod, interestSettlementMethod, and settlementGLAccountNo',
    });
  }
  if (
    !accrualInformation.accrualBasis ||
    !accrualInformation.accrualStartDate ||
    !accrualInformation.accrualFrequency
  ) {
    return res.status(400).json({
      success: false,
      message: 'accrualInformation must include accrualBasis, accrualStartDate, and accrualFrequency',
    });
  }
  if (!chargesSetup.chargeType || !chargesSetup.chargeAmount || !chargesSetup.chargeGLAccountNo) {
    return res.status(400).json({
      success: false,
      message: 'chargesSetup must include chargeType, chargeAmount, and chargeGLAccountNo',
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find existing product
    const existingProduct = await SavingsProduct.findOne({ productCode }).session(session);
    if (!existingProduct) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `Savings product with productCode ${productCode} not found`,
      });
    }

    // Validate GL accounts
    const glAccountsToValidate = [
      { account: principalBalanceGLAccountNo, transactionType: 'CR', category: 'LIABILITY' },
      { account: interestGLAccountNo, transactionType: 'DR', category: 'EXPENSE' },
      { account: interestPayableGLAccountNo, transactionType: 'CR', category: 'LIABILITY' },
      { account: settlementInformation.settlementGLAccountNo, transactionType: 'DR', category: 'ASSET' },
      { account: settlementInformation.settlementGLAccountNo, transactionType: 'CR', category: 'ASSET' },
      { account: chargesSetup.chargeGLAccountNo, transactionType: 'CR', category: 'LIABILITY' },
      ...(rateInformation.fixedRate && parseFloat(rateInformation.fixedRate.toString()) > 0
        ? [{ account: withholdingTaxGLAccountNo, transactionType: 'CR', category: 'LIABILITY' }]
        : []),
    ];

    for (const { account, transactionType, category } of glAccountsToValidate) {
      await validateGLAccount(account, transactionType, category, session);
    }

    // Validate BU_ID format
    if (!/^\d{3}$/.test(BU_ID)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'BU_ID must be a 3-digit string',
      });
    }

    // Validate productType and CRNCY_ID
    const validProductTypes = ['SAVINGS', 'TERM_DEPOSIT'];
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

    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();

    // Update savings product
    const updatedProduct = await SavingsProduct.findOneAndUpdate(
      { productCode },
      {
        productName,
        productType,
        CRNCY_ID,
        BU_ID,
        rateInformation: {
          rateType: rateInformation.rateType,
          fixedRate: rateInformation.fixedRate
            ? mongoose.Types.Decimal128.fromString(parseFloat(rateInformation.fixedRate).toFixed(2))
            : undefined,
          marginRate: rateInformation.marginRate
            ? mongoose.Types.Decimal128.fromString(parseFloat(rateInformation.marginRate).toFixed(2))
            : undefined,
          effectiveRate: mongoose.Types.Decimal128.fromString(parseFloat(rateInformation.effectiveRate).toFixed(2)),
          effectiveDate: new Date(rateInformation.effectiveDate),
        },
        settlementInformation: {
          settlementFrequency: settlementInformation.settlementFrequency,
          principalSettlementMethod: settlementInformation.principalSettlementMethod,
          interestSettlementMethod: settlementInformation.interestSettlementMethod,
          settlementGLAccountNo: settlementInformation.settlementGLAccountNo,
        },
        accrualInformation: {
          accrualBasis: accrualInformation.accrualBasis,
          accrualStartDate: new Date(accrualInformation.accrualStartDate),
          accrualFrequency: accrualInformation.accrualFrequency,
        },
        chargesSetup: {
          chargeType: chargesSetup.chargeType,
          chargeAmount: mongoose.Types.Decimal128.fromString(parseFloat(chargesSetup.chargeAmount).toFixed(2)),
          chargeGLAccountNo: chargesSetup.chargeGLAccountNo,
        },
        principalBalanceGLAccountNo,
        interestGLAccountNo,
        interestPayableGLAccountNo,
        withholdingTaxGLAccountNo,
        updatedAt: now,
      },
      { new: true, runValidators: true, session }
    );

    if (!updatedProduct) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `Savings product with productCode ${productCode} not found`,
      });
    }

    // Create audit trail
    try {
      await AuditTrail.create(
        [
          {
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
            description: `Updated savings product with productCode ${productCode}`,
          },
        ],
        { session }
      );
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
      body: req.body,
      productCode,
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