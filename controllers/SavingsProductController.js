import mongoose from 'mongoose';
import SavingsProduct from '../models/SavingsProduct.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';

export const createSavingsProduct = async (req, res) => {
  const {
    PROD_ID,
    PROD_CD,
    PROD_DESC,
    PRODUCT_TYPE,
    productCode,
    productName,
    productDescription,
    productType,
    CRNCY_ID,
    BU_ID, // Can be string, array, or mixed with wildcards
    START_DT,
    rateInformation,
    settlementInformation,
    accrualInformation,
    chargesSetup,
    glAccounts,
    additionalGLAccounts,
    customFields,
    metadata,
    // Multi-BU fields
    isGlobalProduct,
    accessibleBUs,
    visibility,
    // Other optional fields
    VERSION_NO,
    PROD_CAT_TY,
    PROD_DESIGN_ID,
    MIN_AGE_YEAR,
    USER_ID,
    STMNT_FREQ_CD,
    STMNT_FREQ_VALUE,
    ACCT_CYCLE_CD,
    ACCT_CYCLE_VALUE,
    ACCT_AUTH_BUS_PROD_ID
  } = req.body;

  // Validate required fields based on schema
  const requiredFields = {
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
    glAccounts
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

  // Validate glAccounts sub-fields
  if (!glAccounts.principalBalance || !glAccounts.interestIncome || 
      !glAccounts.interestPayable || !glAccounts.withholdingTax) {
    return res.status(400).json({
      success: false,
      message: 'glAccounts must include principalBalance, interestIncome, interestPayable, and withholdingTax',
    });
  }

  // Validate chargesSetup as array (if provided)
  if (chargesSetup && !Array.isArray(chargesSetup)) {
    return res.status(400).json({
      success: false,
      message: 'chargesSetup must be an array',
    });
  }

  // Validate each charge in the array (if provided)
  if (chargesSetup) {
    for (const charge of chargesSetup) {
      if (!charge.name || !charge.amount || !charge.glAccountCode || !charge.chargeType) {
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
    // Handle BU_ID - convert to array and normalize
    let buIds = BU_ID;
    if (typeof BU_ID === 'string') {
      // Handle comma-separated values or single value
      buIds = BU_ID.split(',').map(bu => bu.trim()).filter(bu => bu.length > 0);
    } else if (!Array.isArray(BU_ID)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'BU_ID must be a string or array of strings',
      });
    }

    // Remove duplicates and validate each BU_ID
    buIds = [...new Set(buIds)];

    // NEW: Validate BU_ID format for all items (3-digit numbers or wildcard patterns)
    const validBuPattern = /^(\d{3}|\*|\d{1,2}\*|\*\d{1,2}|\d\*\d)$/;
    const invalidBUs = buIds.filter(buId => !validBuPattern.test(buId));

    if (invalidBUs.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid BU_ID format(s): ${invalidBUs.join(', ')}. Must be 3-digit string or valid wildcard pattern (*, 10*, *01, 1*1)`,
        examples: {
          single_bu: '"101" or ["101"]',
          multiple_bus: '["101", "102", "103"]',
          patterns: '["10*", "*01", "1*1"]',
          global: '["*"]'
        }
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

    // Check for duplicate productCode or PROD_ID across all BUs
    const existingProduct = await SavingsProduct.findOne({ 
      $or: [
        { productCode },
        { PROD_ID }
      ]
    }).session(session);
    
    if (existingProduct) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Product with productCode ${productCode} or PROD_ID ${PROD_ID} already exists`,
      });
    }

    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();

    // Determine product scope based on BU_ID patterns
    const hasGlobalWildcard = buIds.includes('*');
    const hasWildcardPatterns = buIds.some(buId => buId.includes('*') && buId !== '*');
    const hasSpecificBUs = buIds.some(buId => !buId.includes('*'));
    
    // Set global product flag
    const isGlobal = isGlobalProduct !== undefined ? isGlobalProduct : hasGlobalWildcard;

    // Build accessibleBUs - use provided value or derive from BU_ID
    let finalAccessibleBUs = accessibleBUs;
    if (!finalAccessibleBUs) {
      if (hasGlobalWildcard) {
        finalAccessibleBUs = ['*']; // Global wildcard
      } else {
        finalAccessibleBUs = buIds; // Use all specified patterns and BUs
      }
    }

    // CORRECTED: Determine visibility - Use the correct enum values from your schema
    let finalVisibility = visibility;
    if (!finalVisibility) {
      if (hasGlobalWildcard) {
        finalVisibility = 'GLOBAL'; // CORRECTED: Matches your schema enum
      } else if (hasWildcardPatterns || buIds.length > 1) {
        finalVisibility = 'SELECTED_BUS'; // CORRECTED: Matches your schema enum
      } else {
        finalVisibility = 'SPECIFIC_BRANCHES'; // CORRECTED: Matches your schema enum
      }
    }

    // CORRECTED: Validate visibility enum value - Use the correct values from your schema
    const validVisibilityValues = ['GLOBAL', 'SELECTED_BUS', 'SPECIFIC_BRANCHES'];
    if (finalVisibility && !validVisibilityValues.includes(finalVisibility)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid visibility value. Must be one of: ${validVisibilityValues.join(', ')}`,
      });
    }

    // Build the product data dynamically
    const productData = {
      PROD_ID,
      PROD_CD,
      PROD_DESC,
      PRODUCT_TYPE,
      productCode,
      productName,
      productDescription,
      productType,
      CRNCY_ID,
      BU_ID: buIds, // Array of BU IDs or patterns
      START_DT: START_DT ? new Date(START_DT) : new Date(),
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
      glAccounts: {
        principalBalance: glAccounts.principalBalance,
        interestIncome: glAccounts.interestIncome,
        interestPayable: glAccounts.interestPayable,
        withholdingTax: glAccounts.withholdingTax,
      },
      // Multi-BU fields
      isGlobalProduct: isGlobal,
      accessibleBUs: finalAccessibleBUs,
      visibility: finalVisibility // CORRECTED: Now uses proper enum values
    };

    // Add optional fields if provided
    if (VERSION_NO) productData.VERSION_NO = VERSION_NO;
    if (PROD_CAT_TY) productData.PROD_CAT_TY = PROD_CAT_TY;
    if (PROD_DESIGN_ID) productData.PROD_DESIGN_ID = PROD_DESIGN_ID;
    if (MIN_AGE_YEAR) productData.MIN_AGE_YEAR = MIN_AGE_YEAR;
    if (USER_ID) productData.USER_ID = USER_ID;
    if (STMNT_FREQ_CD) productData.STMNT_FREQ_CD = STMNT_FREQ_CD;
    if (STMNT_FREQ_VALUE) productData.STMNT_FREQ_VALUE = STMNT_FREQ_VALUE;
    if (ACCT_CYCLE_CD) productData.ACCT_CYCLE_CD = ACCT_CYCLE_CD;
    if (ACCT_CYCLE_VALUE) productData.ACCT_CYCLE_VALUE = ACCT_CYCLE_VALUE;
    if (ACCT_AUTH_BUS_PROD_ID) productData.ACCT_AUTH_BUS_PROD_ID = ACCT_AUTH_BUS_PROD_ID;

    // Add chargesSetup if provided
    if (chargesSetup && chargesSetup.length > 0) {
      productData.chargesSetup = chargesSetup.map(charge => ({
        // Required fields
        name: charge.name,
        amount: mongoose.Types.Decimal128.fromString(parseFloat(charge.amount).toFixed(2)),
        glAccountCode: charge.glAccountCode,
        chargeType: charge.chargeType,
        
        // Optional fields
        CHRG_ID: charge.CHRG_ID,
        CHRG_CD: charge.CHRG_CD,
        chargeGLAccountNo: charge.chargeGLAccountNo,
        chargeName: charge.chargeName,
        status: charge.status,
        TIER_TY: charge.TIER_TY,
        BAL_ACTION_CD: charge.BAL_ACTION_CD,
        VERSION_NO: charge.VERSION_NO,
        USER_ID: charge.USER_ID,
        CREATED_BY: charge.CREATED_BY
      }));
    }

    // Add additionalGLAccounts if provided
    if (additionalGLAccounts) {
      productData.additionalGLAccounts = new Map(Object.entries(additionalGLAccounts));
    }

    // Add customFields if provided
    if (customFields) {
      productData.customFields = new Map(Object.entries(customFields));
    }

    // Add metadata if provided
    if (metadata) {
      productData.metadata = new Map(Object.entries(metadata));
    }

    // Create new savings product
    const newSavingsProduct = new SavingsProduct(productData);
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
        description: `Created savings product with productCode ${productCode} for ${buIds.length} business unit(s) or patterns`,
        metadata: {
          bu_patterns: buIds,
          is_global: isGlobal,
          visibility: finalVisibility,
          specific_bus: buIds.filter(buId => !buId.includes('*')),
          pattern_bus: buIds.filter(buId => buId.includes('*') && buId !== '*'),
          has_global_wildcard: hasGlobalWildcard
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

    // Generate appropriate success message based on BU patterns
    let successMessage;
    const specificBUs = buIds.filter(buId => !buId.includes('*'));
    const patternBUs = buIds.filter(buId => buId.includes('*') && buId !== '*');
    
    if (hasGlobalWildcard) {
      successMessage = 'Savings product created successfully for ALL business units (global)';
    } else if (patternBUs.length > 0 && specificBUs.length > 0) {
      successMessage = `Savings product created successfully for ${specificBUs.length} specific BU(s) and ${patternBUs.length} pattern(s)`;
    } else if (patternBUs.length > 0) {
      successMessage = `Savings product created successfully with ${patternBUs.length} pattern(s)`;
    } else {
      successMessage = `Savings product created successfully for ${specificBUs.length} specific business unit(s)`;
    }

    return res.status(201).json({
      success: true,
      message: successMessage,
      product: savedProduct,
      metadata: {
        total_bu_entries: buIds.length,
        specific_bus: specificBUs,
        pattern_bus: patternBUs,
        has_global_wildcard: hasGlobalWildcard,
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


// Enhanced query logic for pattern matching
export const getProductsByBU = async (req, res) => {
  try {
    const { bu_id } = req.params;
    
    if (!/^\d{3}$/.test(bu_id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid BU_ID format',
      });
    }

    // Build query conditions for pattern matching
    const conditions = [
      { isGlobalProduct: true },
      { accessibleBUs: '*' }, // Exact wildcard
      { accessibleBUs: bu_id }, // Exact match
      { BU_ID: bu_id },
      { BU_ID: '*' }
    ];

    // Add pattern matching conditions
    const patterns = [
      `${bu_id.substring(0, 2)}*`, // First 2 digits + wildcard (101 -> 10*)
      `*${bu_id.substring(1, 3)}`, // Wildcard + last 2 digits (101 -> *01)
      `${bu_id.charAt(0)}*${bu_id.charAt(2)}` // First char + wildcard + last char (101 -> 1*1)
    ];

    patterns.forEach(pattern => {
      conditions.push({ accessibleBUs: pattern });
      conditions.push({ BU_ID: pattern });
    });

    const products = await SavingsProduct.find({
      $or: conditions,
      REC_ST: 'A'
    });

    return res.status(200).json({
      success: true,
      message: `Products retrieved for BU ${bu_id}`,
      data: products,
      count: products.length
    });
  } catch (error) {
    // ... error handling
  }
};

// GET Savings Product by productCode - CORRECT
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

// GET All Savings Products - CORRECT
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

// UPDATE Savings Product by productCode - FIXED VERSION
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

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find existing product first
    const existingProduct = await SavingsProduct.findOne({ productCode }).session(session);
    if (!existingProduct) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `Savings product with productCode ${productCode} not found`,
      });
    }

    // For updates, only validate fields that are actually provided
    // Don't require all fields to be present for updates

    // Validate provided subdocument fields
    if (rateInformation) {
      if (!rateInformation.rateType || !rateInformation.effectiveRate || !rateInformation.effectiveDate) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'rateInformation must include rateType, effectiveRate, and effectiveDate',
        });
      }
      if (rateInformation.rateType === 'FIXED' && rateInformation.fixedRate == null) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'fixedRate is required for FIXED rateType',
        });
      }
      if (rateInformation.rateType === 'FLOATING' && rateInformation.marginRate == null) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'marginRate is required for FLOATING rateType',
        });
      }
    }

    if (settlementInformation) {
      if (
        !settlementInformation.settlementFrequency ||
        !settlementInformation.principalSettlementMethod ||
        !settlementInformation.interestSettlementMethod ||
        !settlementInformation.settlementGLAccountNo
      ) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'settlementInformation must include settlementFrequency, principalSettlementMethod, interestSettlementMethod, and settlementGLAccountNo',
        });
      }
    }

    if (accrualInformation) {
      if (
        !accrualInformation.accrualBasis ||
        !accrualInformation.accrualStartDate ||
        !accrualInformation.accrualFrequency
      ) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'accrualInformation must include accrualBasis, accrualStartDate, and accrualFrequency',
        });
      }
    }

    if (chargesSetup) {
      if (!chargesSetup.chargeType || !chargesSetup.chargeAmount || !chargesSetup.chargeGLAccountNo) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'chargesSetup must include chargeType, chargeAmount, and chargeGLAccountNo',
        });
      }
    }

    // REMOVED: GL Account validation since validateGLAccount function doesn't exist
    // Add basic GL account format validation instead
    const glAccountRegex = /^\d{2}-\d{3}-\d{3}-\d{3}-\d{3}-\d{3}$/;
    
    const glAccountsToValidate = [
      principalBalanceGLAccountNo,
      interestGLAccountNo,
      interestPayableGLAccountNo,
      settlementInformation?.settlementGLAccountNo,
      chargesSetup?.chargeGLAccountNo,
      withholdingTaxGLAccountNo,
    ].filter(account => account); // Only validate provided accounts

    for (const account of glAccountsToValidate) {
      if (account && !glAccountRegex.test(account)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Invalid GL account format: ${account}. Expected format: XX-XXX-XXX-XXX-XXX-XXX`,
        });
      }
    }

    // Validate BU_ID format if provided
    if (BU_ID && !/^\d{3}$/.test(BU_ID)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'BU_ID must be a 3-digit string',
      });
    }

    // Validate productType if provided
    if (productType) {
      const validProductTypes = ['SAVINGS', 'TERM_DEPOSIT'];
      if (!validProductTypes.includes(productType)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Invalid productType. Must be one of ${validProductTypes.join(', ')}`,
        });
      }
    }

    // Validate CRNCY_ID if provided
    if (CRNCY_ID) {
      const validCurrencies = ['NGN', 'USD', 'EUR', 'GBP'];
      if (!validCurrencies.includes(CRNCY_ID)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Invalid CRNCY_ID. Must be one of ${validCurrencies.join(', ')}`,
        });
      }
    }

    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();

    // Build update object with only provided fields
    const updateData = {
      updatedAt: now,
    };

    // Only add fields that are provided
    if (productName) updateData.productName = productName;
    if (productType) updateData.productType = productType;
    if (CRNCY_ID) updateData.CRNCY_ID = CRNCY_ID;
    if (BU_ID) updateData.BU_ID = BU_ID;
    if (principalBalanceGLAccountNo) updateData.principalBalanceGLAccountNo = principalBalanceGLAccountNo;
    if (interestGLAccountNo) updateData.interestGLAccountNo = interestGLAccountNo;
    if (interestPayableGLAccountNo) updateData.interestPayableGLAccountNo = interestPayableGLAccountNo;
    if (withholdingTaxGLAccountNo) updateData.withholdingTaxGLAccountNo = withholdingTaxGLAccountNo;

    // Handle nested objects
    if (rateInformation) {
      updateData.rateInformation = {
        rateType: rateInformation.rateType,
        fixedRate: rateInformation.fixedRate
          ? mongoose.Types.Decimal128.fromString(parseFloat(rateInformation.fixedRate).toFixed(2))
          : undefined,
        marginRate: rateInformation.marginRate
          ? mongoose.Types.Decimal128.fromString(parseFloat(rateInformation.marginRate).toFixed(2))
          : undefined,
        effectiveRate: mongoose.Types.Decimal128.fromString(parseFloat(rateInformation.effectiveRate).toFixed(2)),
        effectiveDate: new Date(rateInformation.effectiveDate),
      };
    }

    if (settlementInformation) {
      updateData.settlementInformation = {
        settlementFrequency: settlementInformation.settlementFrequency,
        principalSettlementMethod: settlementInformation.principalSettlementMethod,
        interestSettlementMethod: settlementInformation.interestSettlementMethod,
        settlementGLAccountNo: settlementInformation.settlementGLAccountNo,
      };
    }

    if (accrualInformation) {
      updateData.accrualInformation = {
        accrualBasis: accrualInformation.accrualBasis,
        accrualStartDate: new Date(accrualInformation.accrualStartDate),
        accrualFrequency: accrualInformation.accrualFrequency,
      };
    }

    if (chargesSetup) {
      updateData.chargesSetup = {
        chargeType: chargesSetup.chargeType,
        chargeAmount: mongoose.Types.Decimal128.fromString(parseFloat(chargesSetup.chargeAmount).toFixed(2)),
        chargeGLAccountNo: chargesSetup.chargeGLAccountNo,
      };
    }

    // Update savings product
    const updatedProduct = await SavingsProduct.findOneAndUpdate(
      { productCode },
      updateData,
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