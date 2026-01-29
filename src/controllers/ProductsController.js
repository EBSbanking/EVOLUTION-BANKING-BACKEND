// controllers/productsController.js - COMPLETE UPDATED VERSION
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SavingsProduct from '../models/SavingsProduct.js';
import AuditTrail from '../models/AuditTrail.js';
import { logger } from '../utils/logger.js';

export const ProductsController = {
createProduct: async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    // ==================== STEP 1: CREATE TABLE IF NOT EXISTS ====================
    console.log('🔧 Checking/creating savings_products table...');
    try {
      await SavingsProduct.createTableIfNotExists();
      console.log('✅ Table check/creation completed');
    } catch (tableError) {
      console.error('❌ Table creation failed:', tableError.message);
      await ProductsController.createTableManually();
    }

    // ==================== STEP 2: EXTRACT AND VALIDATE FIELDS ====================
    const { 
      PROD_ID, 
      productName, 
      PROD_DESC, 
      PROD_CD, 
      PRODUCT_TYPE, 
      productCode, 
      BU_ID,
      productDescription,
      CRNCY_ID,
      START_DT,
      CREATED_BY,
      USER_ID,
      VERSION_NO,
      REC_ST,
      // New fields for global products
      isGlobalProduct,
      accessibleBUs,
      visibility,
      // GL Accounts
      principalBalanceGLAccountNo,
      interestGLAccountNo,
      interestPayableGLAccountNo,
      withholdingTaxGLAccountNo,
      interestExpenseGLAccountNo,
      depositChargeReceivableGLAccountNo,
      // Rate fields
      rateType,
      fixedRate,
      effectiveRate,
      effectiveDate,
      // Settlement fields
      settlementFrequency,
      principalSettlementMethod,
      interestSettlementMethod,
      // Accrual fields
      accrualFrequency,
      accrualBasis,
      // JSON fields
      rateInformation,
      settlementInformation,
      accrualInformation,
      chargesSetup,
      metadata,
      // Other fields
      PROD_CAT_TY,
      PROD_DESIGN_ID,
      MIN_AGE_YEAR,
      STMNT_FREQ_CD,
      STMNT_FREQ_VALUE,
      ACCT_CYCLE_CD,
      ACCT_CYCLE_VALUE,
      ACCT_AUTH_BUS_PROD_ID
    } = req.body;

    console.log('📋 Creating product with PROD_ID:', PROD_ID, 'productCode:', productCode);

    // Validate required fields
    if (!PROD_ID) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'PROD_ID is a required field'
      });
    }

    // Determine product code
    const finalProductCode = productCode || PROD_CD;
    if (!finalProductCode) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Either productCode or PROD_CD is required'
      });
    }

    // Determine product name
    const finalProductName = productName || PROD_DESC;
    if (!finalProductName) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Either productName or PROD_DESC is required'
      });
    }

    // Determine product type - use PRODUCT_TYPE only (not productType)
    const finalProductType = PRODUCT_TYPE || PROD_CAT_TY || 'SAVINGS';

    // ==================== STEP 3: HANDLE BU_ID (BRANCH CODES) ====================
    let buIdString;
    if (BU_ID) {
      if (Array.isArray(BU_ID)) {
        buIdString = BU_ID.join(',');
      } else if (typeof BU_ID === 'string') {
        buIdString = BU_ID;
      } else {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'BU_ID must be a string or array of strings'
        });
      }
    } else {
      buIdString = '*'; // Default to global (all branches)
    }

    // Validate BU_ID pattern - allow wildcard * and 3-digit branch codes
    const buIds = buIdString.split(',').map(bu => bu.trim()).filter(bu => bu.length > 0);
    const validBuPattern = /^(\d{3}|\*)$/;
    const invalidBUs = buIds.filter(buId => !validBuPattern.test(buId));

    if (invalidBUs.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Invalid BU_ID format(s): ${invalidBUs.join(', ')}. Must be 3-digit branch code or * for all branches`
      });
    }

    // ==================== STEP 4: DETERMINE PRODUCT SCOPE ====================
    const hasGlobalWildcard = buIds.includes('*');
    const isGlobal = isGlobalProduct !== undefined ? isGlobalProduct : hasGlobalWildcard;
    
    // Determine accessible BUs
    let finalAccessibleBUs = accessibleBUs;
    if (!finalAccessibleBUs) {
      if (Array.isArray(accessibleBUs)) {
        finalAccessibleBUs = accessibleBUs.join(',');
      } else if (accessibleBUs) {
        finalAccessibleBUs = accessibleBUs;
      } else {
        finalAccessibleBUs = hasGlobalWildcard ? '*' : buIdString;
      }
    }

    // Determine visibility
    let finalVisibility = visibility;
    if (!finalVisibility) {
      if (hasGlobalWildcard) {
        finalVisibility = 'GLOBAL';
      } else if (buIds.length > 1) {
        finalVisibility = 'MULTIPLE_BRANCHES';
      } else {
        finalVisibility = 'SPECIFIC_BRANCH';
      }
    }

    // Validate visibility value
    const validVisibilityValues = ['GLOBAL', 'MULTIPLE_BRANCHES', 'SPECIFIC_BRANCH'];
    if (finalVisibility && !validVisibilityValues.includes(finalVisibility)) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Invalid visibility. Must be one of: ${validVisibilityValues.join(', ')}`
      });
    }

    // ==================== STEP 5: CHECK FOR DUPLICATES ====================
    console.log('🔍 Checking for duplicate product...');
    const existingProduct = await SavingsProduct.findOne({
      where: { 
        [Op.or]: [
          { PROD_ID: Number(PROD_ID) },
          { productCode: finalProductCode }
        ]
      },
      transaction
    });

    if (existingProduct) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Product already exists with ${existingProduct.PROD_ID === Number(PROD_ID) ? 'PROD_ID ' + PROD_ID : 'productCode ' + finalProductCode}`,
        existingProduct: {
          id: existingProduct.id,
          PROD_ID: existingProduct.PROD_ID,
          productCode: existingProduct.productCode,
          productName: existingProduct.productName
        }
      });
    }

    // ==================== STEP 6: BUILD PRODUCT DATA ====================
    const userId = CREATED_BY || 'system';
    const productData = {
      // Core identifiers
      PROD_ID: Number(PROD_ID),
      PROD_CD: finalProductCode.toString(),
      PROD_DESC: PROD_DESC || finalProductName,
      PRODUCT_TYPE: finalProductType,
      
      // Product info
      productCode: finalProductCode.toString(),
      productName: finalProductName,
      productDescription: productDescription || PROD_DESC || finalProductName,
      
      // Currency and Business Unit
      CRNCY_ID: CRNCY_ID || 'NGN',
      BU_ID: buIdString,
      
      // Product scope and visibility
      isGlobalProduct: isGlobal,
      accessibleBUs: finalAccessibleBUs,
      visibility: finalVisibility,
      
      // Dates and status
      START_DT: START_DT ? new Date(START_DT) : new Date(),
      REC_ST: REC_ST || 'Active',
      CREATED_BY: userId,
      USER_ID: USER_ID || userId,
      VERSION_NO: VERSION_NO || 1,
      
      // GL Accounts
      principalBalanceGLAccountNo: principalBalanceGLAccountNo || '0000000000',
      interestGLAccountNo: interestGLAccountNo || '0000000000',
      interestPayableGLAccountNo: interestPayableGLAccountNo || '0000000000',
      withholdingTaxGLAccountNo: withholdingTaxGLAccountNo || '0000000000',
      interestExpenseGLAccountNo: interestExpenseGLAccountNo,
      depositChargeReceivableGLAccountNo: depositChargeReceivableGLAccountNo,
      
      // Rate fields
      rateType: rateType || 'FIXED',
      fixedRate: fixedRate ? parseFloat(fixedRate) : 0.0,
      effectiveRate: effectiveRate ? parseFloat(effectiveRate) : 0.0,
      effectiveDate: effectiveDate ? new Date(effectiveDate) : new Date(),
      
      // Settlement fields
      settlementFrequency: settlementFrequency || 'MONTHLY',
      principalSettlementMethod: principalSettlementMethod || 'ACCOUNT',
      interestSettlementMethod: interestSettlementMethod || 'ACCOUNT',
      
      // Accrual fields
      accrualFrequency: accrualFrequency || 'DAILY',
      accrualBasis: accrualBasis || 'ACTUAL_DAYS/ACTUAL_DAYS',
      
      // Other fields
      PROD_CAT_TY: PROD_CAT_TY || finalProductType,
      PROD_DESIGN_ID: PROD_DESIGN_ID ? Number(PROD_DESIGN_ID) : null,
      MIN_AGE_YEAR: MIN_AGE_YEAR ? Number(MIN_AGE_YEAR) : null,
      STMNT_FREQ_CD: STMNT_FREQ_CD,
      STMNT_FREQ_VALUE: STMNT_FREQ_VALUE ? Number(STMNT_FREQ_VALUE) : null,
      ACCT_CYCLE_CD: ACCT_CYCLE_CD,
      ACCT_CYCLE_VALUE: ACCT_CYCLE_VALUE ? Number(ACCT_CYCLE_VALUE) : null,
      ACCT_AUTH_BUS_PROD_ID: ACCT_AUTH_BUS_PROD_ID ? Number(ACCT_AUTH_BUS_PROD_ID) : null
    };

    // Add JSON fields if provided
    if (rateInformation) {
      productData.rateInformation = typeof rateInformation === 'string' 
        ? rateInformation 
        : JSON.stringify(rateInformation);
    }
    
    if (settlementInformation) {
      productData.settlementInformation = typeof settlementInformation === 'string'
        ? settlementInformation
        : JSON.stringify(settlementInformation);
    }
    
    if (accrualInformation) {
      productData.accrualInformation = typeof accrualInformation === 'string'
        ? accrualInformation
        : JSON.stringify(accrualInformation);
    }
    
    if (chargesSetup) {
      productData.chargesSetup = typeof chargesSetup === 'string'
        ? chargesSetup
        : JSON.stringify(Array.isArray(chargesSetup) ? chargesSetup : [chargesSetup]);
    }
    
    if (metadata) {
      productData.metadata = typeof metadata === 'string'
        ? metadata
        : JSON.stringify(metadata);
    }

    console.log('📝 Product data prepared:', {
      PROD_ID: productData.PROD_ID,
      productCode: productData.productCode,
      productName: productData.productName,
      PRODUCT_TYPE: productData.PRODUCT_TYPE,
      BU_ID: productData.BU_ID,
      isGlobalProduct: productData.isGlobalProduct,
      visibility: productData.visibility
    });

    // ==================== STEP 7: CREATE PRODUCT ====================
    console.log('💾 Creating product in database...');
    const savingsProduct = await SavingsProduct.create(productData, { transaction });

    console.log(`✅ Product created with ID: ${savingsProduct.id}`);

    // ==================== STEP 8: CREATE AUDIT TRAIL ====================
    try {
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      
      await AuditTrail.create({
        event_id: Date.now(),
        user_id: userId,
        event_type: 'PRODUCT_CREATE',
        action: 'Create Product',
        old_value: null,
        new_value: JSON.stringify(savingsProduct.toJSON()),
        ip_address: ipAddress,
        timestamp: new Date(),
        entity_type: 'SavingsProduct',
        entity_id: savingsProduct.id,
        status: 'SUCCESS',
        description: `Created product ${productData.productCode} with PROD_ID ${productData.PROD_ID}`,
        metadata: JSON.stringify({
          product_type: finalProductType,
          bu_id: productData.BU_ID,
          is_global: isGlobal,
          visibility: finalVisibility,
          branch_count: hasGlobalWildcard ? 'ALL' : buIds.length
        })
      }, { transaction });
    } catch (auditError) {
      logger.error('Failed to create audit trail', {
        error: auditError.message,
        productCode: productData.productCode,
        timestamp: new Date()
      });
      // Don't fail the transaction if audit fails
    }

    // ==================== STEP 9: COMMIT TRANSACTION ====================
    await transaction.commit();
    console.log('🎉 Transaction committed successfully!');

    // ==================== STEP 10: RETURN SUCCESS RESPONSE ====================
    let successMessage;
    if (hasGlobalWildcard) {
      successMessage = 'Product created successfully for ALL branches (global)';
    } else if (buIds.length > 1) {
      successMessage = `Product created successfully for ${buIds.length} branches`;
    } else {
      successMessage = `Product created successfully for branch ${buIdString}`;
    }

    return res.status(201).json({
      success: true,
      message: successMessage,
      data: {
        id: savingsProduct.id,
        PROD_ID: savingsProduct.PROD_ID,
        productCode: savingsProduct.productCode,
        productName: savingsProduct.productName,
        PRODUCT_TYPE: savingsProduct.PRODUCT_TYPE,
        CRNCY_ID: savingsProduct.CRNCY_ID,
        BU_ID: savingsProduct.BU_ID,
        isGlobalProduct: savingsProduct.isGlobalProduct,
        visibility: savingsProduct.visibility,
        REC_ST: savingsProduct.REC_ST,
        created: true
      },
      metadata: {
        total_branches: hasGlobalWildcard ? 'ALL' : buIds.length,
        is_global: isGlobal,
        visibility: finalVisibility,
        branch_codes: hasGlobalWildcard ? '*' : buIds
      }
    });

  } catch (error) {
    console.error('❌ Error creating product:', error);
    console.error('Stack:', error.stack);
    
    await transaction.rollback();
    
    // Special handling for table doesn't exist error
    if (error.message.includes("doesn't exist") || error.message.includes("Table not found")) {
      console.log('🛠️ Attempting emergency table creation...');
      try {
        await ProductsController.createTableManually();
        return res.status(503).json({
          success: false,
          message: 'Table was missing and has been created. Please try again.',
          error: 'Table was created, please retry the request'
        });
      } catch (tableError) {
        console.error('❌ Emergency table creation failed:', tableError);
      }
    }
    
    // Handle specific error types
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error - Product with this code or ID already exists',
        error: error.errors.map(err => err.message)
      });
    }

    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.errors.map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }))
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to create product',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
},

  // ==================== HELPER FUNCTIONS ====================
  
 createTableManually: async function() {
  try {
    console.log('🛠️ Creating savings_products table manually...');
    
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS savings_products (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        PROD_ID INT NOT NULL UNIQUE,
        PROD_CD VARCHAR(50) NOT NULL,
        PROD_DESC VARCHAR(255) NOT NULL,
        PRODUCT_TYPE VARCHAR(50) NOT NULL DEFAULT 'SAVINGS',
        productCode VARCHAR(50) NOT NULL UNIQUE,
        productName VARCHAR(100) NOT NULL,
        productDescription TEXT,
        
        -- Branch configuration
        BU_ID VARCHAR(50),
        isGlobalProduct BOOLEAN DEFAULT FALSE,
        accessibleBUs VARCHAR(500),
        visibility VARCHAR(50) DEFAULT 'SPECIFIC_BRANCH',
        
        principalBalanceGLAccountNo VARCHAR(50) NOT NULL DEFAULT '0000000000',
        interestGLAccountNo VARCHAR(50) NOT NULL DEFAULT '0000000000',
        interestPayableGLAccountNo VARCHAR(50) NOT NULL DEFAULT '0000000000',
        withholdingTaxGLAccountNo VARCHAR(50) NOT NULL DEFAULT '0000000000',
        interestExpenseGLAccountNo VARCHAR(50),
        depositChargeReceivableGLAccountNo VARCHAR(50),
        rateType VARCHAR(50) DEFAULT 'FIXED',
        fixedRate DECIMAL(10,4) DEFAULT 0.0,
        effectiveRate DECIMAL(10,4) DEFAULT 0.0,
        effectiveDate DATETIME DEFAULT CURRENT_TIMESTAMP,
        settlementFrequency VARCHAR(50) DEFAULT 'MONTHLY',
        principalSettlementMethod VARCHAR(50) DEFAULT 'ACCOUNT',
        interestSettlementMethod VARCHAR(50) DEFAULT 'ACCOUNT',
        accrualFrequency VARCHAR(50) DEFAULT 'DAILY',
        accrualBasis VARCHAR(50) DEFAULT 'ACTUAL_DAYS/ACTUAL_DAYS',
        rateInformation LONGTEXT,
        settlementInformation LONGTEXT,
        accrualInformation LONGTEXT,
        chargesSetup LONGTEXT,
        metadata LONGTEXT,
        CRNCY_ID VARCHAR(10) DEFAULT 'NGN',
        START_DT DATETIME DEFAULT CURRENT_TIMESTAMP,
        REC_ST VARCHAR(20) DEFAULT 'Active',
        PROD_CAT_TY VARCHAR(50),
        PROD_DESIGN_ID INT,
        MIN_AGE_YEAR INT,
        STMNT_FREQ_CD VARCHAR(50),
        STMNT_FREQ_VALUE INT,
        ACCT_CYCLE_CD VARCHAR(50),
        ACCT_CYCLE_VALUE INT,
        ACCT_AUTH_BUS_PROD_ID INT,
        VERSION_NO INT DEFAULT 1,
        CREATED_BY VARCHAR(100) DEFAULT 'system',
        USER_ID VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        delinquent_balance_gl_account_no VARCHAR(50),
        dormant_balance_gl_account_no VARCHAR(50),
        earmarked_balance_gl_account_no VARCHAR(50),
        escheated_balance_gl_account_no VARCHAR(50),
        interest_cheques_gl_account_no VARCHAR(50),
        interest_income_gl_account_no VARCHAR(50),
        interest_receivable_gl_account_no VARCHAR(50),
        interest_suspense_gl_account_no VARCHAR(50),
        matured_balance_gl_account_no VARCHAR(50),
        maturity_cheques_gl_account_no VARCHAR(50),
        non_accrual_balance_gl_account_no VARCHAR(50),
        overdrawn_balance_gl_account_no VARCHAR(50),
        pre_dormant_balance_gl_account_no VARCHAR(50),
        provision_reserve_gl_account_no VARCHAR(50),
        provision_expense_gl_account_no VARCHAR(50),
        rejected_credit_suspense_gl_account_no VARCHAR(50),
        rejected_debit_suspense_gl_account_no VARCHAR(50),
        reserved_balance_gl_account_no VARCHAR(50),
        uncleared_balance_gl_account_no VARCHAR(50),
        write_off_balance_gl_account_no VARCHAR(50),
        INDEX idx_prod_id (PROD_ID),
        INDEX idx_product_code (productCode),
        INDEX idx_rec_st (REC_ST),
        INDEX idx_product_type (PRODUCT_TYPE),
        INDEX idx_bu_id (BU_ID),
        INDEX idx_is_global (isGlobalProduct),
        INDEX idx_visibility (visibility)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    console.log('✅ Table created manually with global product support');
    return true;
  } catch (error) {
    console.error('❌ Manual table creation failed:', error.message);
    throw error;
  }
},
  
  // Initialize table on app startup
  initialize: async function() {
    try {
      console.log('🚀 Initializing ProductsController...');
      await SavingsProduct.createTableIfNotExists();
      console.log('✅ ProductsController initialized successfully');
      return true;
    } catch (error) {
      console.error('❌ ProductsController initialization failed:', error);
      return false;
    }
  }
};

// ==================== OTHER EXPORTED FUNCTIONS ====================

// ✅ GET SAVINGS PRODUCT BY PRODUCT CODE
export const getSavingsProduct = async (req, res) => {
  const { productCode } = req.params;

  try {
    const product = await SavingsProduct.findOne({
      where: {
        [Op.or]: [
          { productCode },
          { PROD_CD: productCode }
        ]
      }
    });
    
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

// ✅ SEARCH SAVINGS PRODUCTS
export const searchSavingsProducts = async (req, res) => {
  try {
    const {
      q,
      productCode,
      productName,
      productType,
      CRNCY_ID,
      BU_ID,
      REC_ST,
      page = 1,
      limit = 10
    } = req.query;

    // Build where conditions
    const whereConditions = {};

    if (q) {
      whereConditions[Op.or] = [
        { productCode: { [Op.like]: `%${q}%` } },
        { productName: { [Op.like]: `%${q}%` } },
        { PROD_CD: { [Op.like]: `%${q}%` } },
        { PROD_DESC: { [Op.like]: `%${q}%` } }
      ];
    }

    if (productCode) whereConditions.productCode = { [Op.like]: `%${productCode}%` };
    if (productName) whereConditions.productName = { [Op.like]: `%${productName}%` };
    if (productType) whereConditions.PRODUCT_TYPE = productType;
    if (CRNCY_ID) whereConditions.CRNCY_ID = CRNCY_ID;
    if (BU_ID) whereConditions.BU_ID = { [Op.like]: `%${BU_ID}%` };
    if (REC_ST) whereConditions.REC_ST = REC_ST;

    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const parsedLimit = parseInt(limit);

    // Execute query
    const { count, rows: products } = await SavingsProduct.findAndCountAll({
      where: Object.keys(whereConditions).length > 0 ? whereConditions : undefined,
      order: [['created_at', 'DESC']],
      limit: parsedLimit,
      offset: offset,
      distinct: true
    });

    const totalPages = Math.ceil(count / parsedLimit);
    const currentPage = parseInt(page);

    return res.status(200).json({
      success: true,
      message: 'Products retrieved successfully',
      data: products,
      pagination: {
        total: count,
        totalPages,
        currentPage,
        pageSize: parsedLimit,
        hasNextPage: currentPage < totalPages,
        hasPrevPage: currentPage > 1
      }
    });

  } catch (error) {
    logger.error('Error searching savings products:', {
      error: error.message,
      stack: error.stack,
      query: req.query,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while searching for savings products',
      error: error.message,
    });
  }
};

// ✅ GET ALL SAVINGS PRODUCTS
export const getAllSavingsProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10, REC_ST = 'Active' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const parsedLimit = parseInt(limit);
    
    const { count, rows: products } = await SavingsProduct.findAndCountAll({
      where: { REC_ST },
      limit: parsedLimit,
      offset: offset,
      order: [['productCode', 'ASC']]
    });
    
    const totalPages = Math.ceil(count / parsedLimit);
    
    return res.status(200).json({
      success: true,
      message: 'Savings products retrieved successfully',
      data: products,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parsedLimit,
        totalPages,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
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

  const transaction = await sequelize.transaction();
  
  try {
    // Find existing product
    const existingProduct = await SavingsProduct.findOne({ 
      where: {
        [Op.or]: [
          { productCode },
          { PROD_CD: productCode }
        ]
      },
      transaction
    });
    
    if (!existingProduct) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Savings product with productCode ${productCode} not found`,
      });
    }

    // Update the product
    await existingProduct.update(updateData, { transaction });

    // Create audit trail
    try {
      const userId = req.user?.id || req.headers['x-user-id'] || 'system';
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      
      await AuditTrail.create({
        event_id: Date.now(),
        user_id: userId,
        event_type: 'SAVINGS_PRODUCT_UPDATE',
        action: 'Update Savings Product',
        old_value: JSON.stringify(existingProduct.toJSON()),
        new_value: JSON.stringify(existingProduct.toJSON()),
        ip_address: ipAddress,
        timestamp: new Date(),
        entity_type: 'SavingsProduct',
        entity_id: existingProduct.id,
        status: 'SUCCESS',
        description: `Updated savings product ${productCode}`,
      }, { transaction });
    } catch (auditError) {
      logger.error('Failed to create audit trail for update', {
        error: auditError.message,
        productCode,
        timestamp: new Date(),
      });
    }

    await transaction.commit();

    // Get updated product
    const updatedProduct = await SavingsProduct.findByPk(existingProduct.id);

    return res.status(200).json({
      success: true,
      message: 'Savings product updated successfully',
      product: updatedProduct,
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error updating savings product:', {
      error: error.message,
      stack: error.stack,
      productCode,
      timestamp: new Date(),
    });

    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.errors.map(err => err.message),
      });
    }

    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating the savings product',
      error: error.message,
    });
  }
};

// ✅ GET PRODUCTS BY BUSINESS UNIT
export const getProductsByBU = async (req, res) => {
  try {
    const { bu_id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const parsedLimit = parseInt(limit);
    
    if (!/^\d{3}$/.test(bu_id)) {
      return res.status(400).json({
        success: false,
        message: 'BU_ID must be a 3-digit string',
      });
    }

    const { count, rows: products } = await SavingsProduct.findAndCountAll({
      where: {
        BU_ID: { [Op.like]: `%${bu_id}%` },
        REC_ST: 'Active'
      },
      limit: parsedLimit,
      offset: offset,
      order: [['productCode', 'ASC']]
    });
    
    const totalPages = Math.ceil(count / parsedLimit);
    
    return res.status(200).json({
      success: true,
      message: `Products retrieved for BU ${bu_id}`,
      data: products,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parsedLimit,
        totalPages,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
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

// Export all functions
export default {
  ProductsController,
  initialize: ProductsController.initialize,
  getSavingsProduct,
  searchSavingsProducts,
  getAllSavingsProducts,
  updateSavingsProduct,
  getProductsByBU
};