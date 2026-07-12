// controllers/productsController.js - COMPLETE UPDATED VERSION
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import SavingsProduct from '../models/SavingsProduct.js';
import AuditTrail from '../models/AuditTrail.js';
import { logger } from '../utils/logger.js';

// ==================== MAIN CONTROLLER OBJECT ====================
export const ProductsController = {
  // ==================== CREATE GL ACCOUNTS FOR PRODUCT ====================
  createGLAccountsForProduct: async function(product, transaction) {
    try {
      const glAccountsToCreate = [];
      const glAccountMap = {
        principalBalanceGLAccountNo: {
          id: `GL_PRINCIPAL_${product.productCode || product.PROD_CD}`,
          desc: `Principal Balance - ${product.productName || product.PROD_DESC}`,
          category: 'LIABILITY',
          type: 'TERM_DEPOSITS'
        },
        interestGLAccountNo: {
          id: `GL_INTEREST_${product.productCode || product.PROD_CD}`,
          desc: `Interest - ${product.productName || product.PROD_DESC}`,
          category: 'EXPENSE',
          type: 'INTEREST_EXPENSE_ON_DEPOSITS'
        },
        interestPayableGLAccountNo: {
          id: `GL_INTEREST_PAYABLE_${product.productCode || product.PROD_CD}`,
          desc: `Interest Payable - ${product.productName || product.PROD_DESC}`,
          category: 'LIABILITY',
          type: 'INTEREST_PAYABLE_ON_DEPOSITS'
        },
        withholdingTaxGLAccountNo: {
          id: `GL_WITHHOLDING_TAX_${product.productCode || product.PROD_CD}`,
          desc: `Withholding Tax - ${product.productName || product.PROD_DESC}`,
          category: 'LIABILITY',
          type: 'WITHHOLDING_TAX_PAYABLE'
        },
        interestIncomeGLAccountNo: {
          id: `GL_INTEREST_INCOME_${product.productCode || product.PROD_CD}`,
          desc: `Interest Income - ${product.productName || product.PROD_DESC}`,
          category: 'REVENUE',
          type: 'INTEREST_INCOME_ON_DEPOSITS'
        },
        interestExpenseGLAccountNo: {
          id: `GL_INTEREST_EXPENSE_${product.productCode || product.PROD_CD}`,
          desc: `Interest Expense - ${product.productName || product.PROD_DESC}`,
          category: 'EXPENSE',
          type: 'INTEREST_EXPENSE_ON_DEPOSITS'
        },
        interestReceivableGLAccountNo: {
          id: `GL_INTEREST_RECEIVABLE_${product.productCode || product.PROD_CD}`,
          desc: `Interest Receivable - ${product.productName || product.PROD_DESC}`,
          category: 'ASSET',
          type: 'INTEREST_RECEIVABLE'
        },
        depositChargeReceivableGLAccountNo: {
          id: `GL_CHARGE_RECEIVABLE_${product.productCode || product.PROD_CD}`,
          desc: `Charge Receivable - ${product.productName || product.PROD_DESC}`,
          category: 'ASSET',
          type: 'LOAN_ACCOUNT_CHARGE_RECEIVABLE'
        },
        settlementGLAccountNo: {
          id: `GL_SETTLEMENT_${product.productCode || product.PROD_CD}`,
          desc: `Settlement - ${product.productName || product.PROD_DESC}`,
          category: 'ASSET',
          type: 'SETTLEMENT_GL_ACCT_NO'
        }
      };

      const userId = product.CREATED_BY || 'SYSTEM';

      // Build GL accounts from product data
      for (const [field, mapping] of Object.entries(glAccountMap)) {
        const glAccountNo = product[field] || product[field.replace('GLAccountNo', '')];
        
        // Skip if empty or placeholder
        if (!glAccountNo || glAccountNo === '0000000000' || glAccountNo === '0') {
          continue;
        }

        glAccountsToCreate.push({
          GL_ACCT_NO: glAccountNo,
          GL_ACCT_ID: mapping.id,
          ACCT_DESC: mapping.desc,
          GL_ACCT_CAT: mapping.category,
          accountType: mapping.type,
          organizationCode: 1,
          branchCode: '100',
          CR_ALLOWED: 1,
          DR_ALLOWED: 1,
          REC_ST: 'Active',
          CREATED_BY: userId,
          CREATED_AT: new Date(),
          UPDATED_AT: new Date()
        });
      }

      // Insert all GL accounts
      let createdCount = 0;
      for (const glAccount of glAccountsToCreate) {
        try {
          // Check if GL account already exists
          const [existing] = await sequelize.query(
            `SELECT GL_ACCT_NO FROM gl_accounts WHERE GL_ACCT_NO = ?`,
            { replacements: [glAccount.GL_ACCT_NO], transaction }
          );

          if (!existing || existing.length === 0) {
            await sequelize.query(
              `INSERT INTO gl_accounts SET ?`,
              { replacements: [glAccount], transaction }
            );
            console.log(`✅ Created GL account: ${glAccount.GL_ACCT_NO} - ${glAccount.ACCT_DESC}`);
            createdCount++;
          } else {
            console.log(`ℹ️ GL account already exists: ${glAccount.GL_ACCT_NO}`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to create GL account ${glAccount.GL_ACCT_NO}:`, error.message);
        }
      }

      console.log(`✅ Created ${createdCount} new GL accounts for product ${product.productCode || product.PROD_CD}`);
      return createdCount;

    } catch (error) {
      console.error('❌ Error creating GL accounts for product:', error);
      throw error;
    }
  },

  // ==================== CREATE PRODUCT ====================
  createProduct: async (req, res) => {
    const transaction = await sequelize.transaction();

    try {
      // ==================== STEP 1: ENSURE TABLE EXISTS ====================
      console.log('🔧 Checking/creating savings_products table...');
      try {
        await SavingsProduct.createTableIfNotExists();
        console.log('✅ Table check/creation completed');
      } catch (tableError) {
        console.error('❌ Table creation failed:', tableError.message);
        await ProductsController.createTableManually();
      }

      // ==================== STEP 2: PROCESS REQUEST BODY ====================
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
        // Legacy/alternative field names
        PROD_CD,
        PROD_DESC,
        PRODUCT_TYPE,
        START_DT,
        // Other fields
        PROD_CAT_TY,
        PROD_DESIGN_ID,
        MIN_AGE_YEAR,
        STMNT_FREQ_CD,
        STMNT_FREQ_VALUE,
        ACCT_CYCLE_CD,
        ACCT_CYCLE_VALUE,
        ACCT_AUTH_BUS_PROD_ID,
        REC_ST,
        CREATED_BY,
        VERSION_NO,
        USER_ID
      } = req.body;

      console.log('📥 Request body received:', JSON.stringify(req.body, null, 2));

      // ==================== STEP 3: VALIDATE AND NORMALIZE FIELDS ====================
      
      // Use legacy field names if new ones aren't provided
      const finalProductCode = productCode || PROD_CD;
      const finalProductName = productName || req.body.productName;
      const finalProductDescription = productDescription || PROD_DESC || finalProductName;
      const finalProductType = productType || PRODUCT_TYPE || PROD_CAT_TY || 'SAVINGS';
      const finalCurrency = CRNCY_ID || 'NGN';

      // Validate required fields
      if (!finalProductCode || !finalProductName) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'productCode (or PROD_CD) and productName are required fields'
        });
      }

      // Check for duplicate product code
      const existingProduct = await SavingsProduct.findOne({
        where: { 
          [Op.or]: [
            { productCode: finalProductCode },
            { PROD_CD: finalProductCode }
          ]
        },
        transaction
      });

      if (existingProduct) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Product with code ${finalProductCode} already exists`,
          existingId: existingProduct.id
        });
      }

      // ==================== STEP 4: HANDLE BU_ID ====================
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
        buIdString = '001'; // Default
      }

      // Validate BU_ID pattern
      const buIds = buIdString.split(',').map(bu => bu.trim()).filter(bu => bu.length > 0);
      const validBuPattern = /^(\d{3}|\*)$/;
      const invalidBUs = buIds.filter(buId => !validBuPattern.test(buId));

      if (invalidBUs.length > 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Invalid BU_ID format(s): ${invalidBUs.join(', ')}. Must be 3-digit string or * for global`
        });
      }

      // ==================== STEP 5: DETERMINE PRODUCT SCOPE ====================
      const hasGlobalWildcard = buIds.includes('*');
      const isGlobal = isGlobalProduct !== undefined ? isGlobalProduct : hasGlobalWildcard;
      
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

      // ==================== STEP 6: BUILD PRODUCT DATA ====================
      const userId = req.user?.id || req.headers['x-user-id'] || CREATED_BY || 'system';
      const now = new Date();

      const productData = {
        // Core identifiers
        PROD_ID: PROD_ID ? Number(PROD_ID) : Math.floor(Date.now() / 1000),
        PROD_CD: finalProductCode.toString(),
        PROD_DESC: finalProductDescription,
        PRODUCT_TYPE: finalProductType,
        
        // Product info
        productCode: finalProductCode.toString(),
        productName: finalProductName,
        productDescription: finalProductDescription,
        productType: finalProductType,
        CRNCY_ID: finalCurrency,
        BU_ID: buIdString,
        
        // Dates and status
        START_DT: START_DT ? new Date(START_DT) : new Date(),
        REC_ST: REC_ST || 'A',
        CREATED_BY: userId,
        USER_ID: USER_ID || userId,
        VERSION_NO: VERSION_NO || 1,
        
        // Product scope
        isGlobalProduct: isGlobal,
        accessibleBUs: finalAccessibleBUs,
        visibility: finalVisibility,
        
        // Optional fields
        PROD_CAT_TY: PROD_CAT_TY || finalProductType,
        PROD_DESIGN_ID: PROD_DESIGN_ID ? Number(PROD_DESIGN_ID) : null,
        MIN_AGE_YEAR: MIN_AGE_YEAR ? Number(MIN_AGE_YEAR) : null,
        STMNT_FREQ_CD: STMNT_FREQ_CD,
        STMNT_FREQ_VALUE: STMNT_FREQ_VALUE ? Number(STMNT_FREQ_VALUE) : null,
        ACCT_CYCLE_CD: ACCT_CYCLE_CD,
        ACCT_CYCLE_VALUE: ACCT_CYCLE_VALUE ? Number(ACCT_CYCLE_VALUE) : null,
        ACCT_AUTH_BUS_PROD_ID: ACCT_AUTH_BUS_PROD_ID ? Number(ACCT_AUTH_BUS_PROD_ID) : null
      };

      // ==================== STEP 7: ADD GL ACCOUNTS ====================
      const glDefaults = {
        principalBalanceGLAccountNo: '01001101101001',
        interestIncomeGLAccountNo: '01001301304001',
        interestPayableGLAccountNo: '01001101116001',
        interestReceivableGLAccountNo: '01001101116001',
        interestExpenseGLAccountNo: '01001301304001',
        withholdingTaxGLAccountNo: '01001501601001',
        depositChargeReceivableGLAccountNo: '01001101101001',
        settlementGLAccountNo: '01001999137001',
        interestGLAccountNo: '01001101101001'
      };

      // Use provided GL accounts or defaults
      if (glAccounts && typeof glAccounts === 'object') {
        Object.entries(glDefaults).forEach(([key, defaultValue]) => {
          const providedValue = glAccounts[key.replace('GLAccountNo', '')] || glAccounts[key];
          productData[key] = providedValue || defaultValue;
        });
      } else {
        Object.entries(glDefaults).forEach(([key, defaultValue]) => {
          productData[key] = defaultValue;
        });
      }

      // ==================== STEP 8: ADD RATE INFORMATION ====================
      if (rateInformation && typeof rateInformation === 'object') {
        productData.rateInformation = JSON.stringify({
          rateType: rateInformation.rateType || 'FIXED',
          fixedRate: parseFloat(rateInformation.fixedRate || 0).toFixed(6),
          marginRate: rateInformation.marginRate ? parseFloat(rateInformation.marginRate).toFixed(6) : undefined,
          effectiveRate: parseFloat(rateInformation.effectiveRate || 0).toFixed(6),
          effectiveDate: rateInformation.effectiveDate ? new Date(rateInformation.effectiveDate).toISOString() : new Date().toISOString(),
          rateStructure: rateInformation.rateStructure || 'FLAT',
          minimumRate: rateInformation.minimumRate ? parseFloat(rateInformation.minimumRate).toFixed(6) : null,
          maximumRate: rateInformation.maximumRate ? parseFloat(rateInformation.maximumRate).toFixed(6) : null
        });
      } else {
        productData.rateInformation = JSON.stringify({
          rateType: 'FIXED',
          fixedRate: '0.000000',
          effectiveRate: '0.000000',
          effectiveDate: new Date().toISOString(),
          rateStructure: 'FLAT'
        });
      }

      // ==================== STEP 9: ADD SETTLEMENT INFORMATION ====================
      if (settlementInformation && typeof settlementInformation === 'object') {
        productData.settlementInformation = JSON.stringify({
          settlementFrequency: settlementInformation.settlementFrequency || 'MONTHLY',
          principalSettlementMethod: settlementInformation.principalSettlementMethod || 'ACCOUNT',
          interestSettlementMethod: settlementInformation.interestSettlementMethod || 'ACCOUNT',
          settlementGLAccountNo: settlementInformation.settlementGLAccountNo || '01001999137001',
          applicableAccountStatusOption: settlementInformation.applicableAccountStatusOption || 'ACTIVE_ONLY'
        });
      } else {
        productData.settlementInformation = JSON.stringify({
          settlementFrequency: 'MONTHLY',
          principalSettlementMethod: 'ACCOUNT',
          interestSettlementMethod: 'ACCOUNT',
          settlementGLAccountNo: '01001999137001',
          applicableAccountStatusOption: 'ACTIVE_ONLY'
        });
      }

      // ==================== STEP 10: ADD ACCRUAL INFORMATION ====================
      if (accrualInformation && typeof accrualInformation === 'object') {
        productData.accrualInformation = JSON.stringify({
          accrualBasis: accrualInformation.accrualBasis || 'ACT/365',
          accrualStartDate: accrualInformation.accrualStartDate 
            ? new Date(accrualInformation.accrualStartDate).toISOString() 
            : new Date().toISOString(),
          accrualFrequency: accrualInformation.accrualFrequency || 'DAILY',
          accrualBalanceType: accrualInformation.accrualBalanceType || 'CURRENT_CLEARED',
          skipInterestForIncompletePeriod: accrualInformation.skipInterestForIncompletePeriod || false
        });
      } else {
        productData.accrualInformation = JSON.stringify({
          accrualBasis: 'ACT/365',
          accrualStartDate: new Date().toISOString(),
          accrualFrequency: 'DAILY',
          accrualBalanceType: 'CURRENT_CLEARED',
          skipInterestForIncompletePeriod: false
        });
      }

      // ==================== STEP 11: ADD CHARGES SETUP ====================
      if (chargesSetup && Array.isArray(chargesSetup)) {
        const validatedCharges = chargesSetup.map(charge => {
          if (!charge.name || charge.amount == null || !charge.glAccountCode || !charge.chargeType) {
            throw new Error('Each charge must include name, amount, glAccountCode, and chargeType');
          }
          
          return {
            name: charge.name,
            chargeType: charge.chargeType,
            amount: parseFloat(charge.amount).toFixed(2),
            glAccountCode: charge.glAccountCode,
            frequency: charge.frequency || 'ONE_TIME'
          };
        });
        
        productData.chargesSetup = JSON.stringify(validatedCharges);
      }

      console.log('📦 Final product data:', JSON.stringify(productData, null, 2));

      // ==================== STEP 12: CREATE PRODUCT ====================
      const newProduct = await SavingsProduct.create(productData, { transaction });

      console.log('✅ Product created successfully:', {
        id: newProduct.id,
        PROD_ID: newProduct.PROD_ID,
        productCode: newProduct.productCode
      });

      // ==================== STEP 13: CREATE GL ACCOUNTS ====================
      console.log('🔧 Creating GL accounts for product...');
      try {
        const glCount = await ProductsController.createGLAccountsForProduct(newProduct, transaction);
        console.log(`✅ Created ${glCount} GL accounts for product ${newProduct.productCode}`);
      } catch (glError) {
        console.warn('⚠️ GL account creation warning:', glError.message);
        // Don't fail the product creation if GL accounts fail
      }

      // ==================== STEP 14: CREATE AUDIT TRAIL ====================
      try {
        const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
        
        await AuditTrail.create({
          event_id: Date.now(),
          user_id: userId,
          event_type: 'PRODUCT_CREATE',
          action: 'Create Product',
          old_value: null,
          new_value: JSON.stringify(newProduct.toJSON()),
          ip_address: ipAddress,
          timestamp: now,
          entity_type: 'Product',
          entity_id: newProduct.id,
          status: 'SUCCESS',
          description: `Created product ${productData.productCode} with PROD_ID ${newProduct.PROD_ID}`,
          metadata: JSON.stringify({
            bu_patterns: buIds,
            is_global: isGlobal,
            visibility: finalVisibility,
            product_type: finalProductType
          })
        }, { transaction });
      } catch (auditError) {
        logger.error('Failed to create audit trail', {
          error: auditError.message,
          productCode: productData.productCode,
          timestamp: now
        });
      }

      // ==================== STEP 15: COMMIT TRANSACTION ====================
      await transaction.commit();

      // ==================== STEP 16: SEND RESPONSE ====================
      let successMessage;
      if (hasGlobalWildcard) {
        successMessage = 'Product created successfully for ALL business units (global)';
      } else {
        successMessage = `Product created successfully for ${buIds.length} business unit(s)`;
      }

      return res.status(201).json({
        success: true,
        message: successMessage,
        data: {
          id: newProduct.id,
          PROD_ID: newProduct.PROD_ID,
          productCode: newProduct.productCode,
          productName: newProduct.productName,
          productType: newProduct.productType,
          BU_ID: newProduct.BU_ID,
          isGlobalProduct: newProduct.isGlobalProduct,
          visibility: newProduct.visibility,
          created: true,
          glAccountsCreated: true
        },
        metadata: {
          total_bu_entries: buIds.length,
          is_global: isGlobal,
          visibility: finalVisibility
        }
      });

    } catch (error) {
      console.error('❌ Error creating product:', error);
      console.error('Stack:', error.stack);
      
      await transaction.rollback();

      // Handle table doesn't exist error
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

      if (error.message.includes('Each charge must include')) {
        return res.status(400).json({
          success: false,
          message: error.message
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

  // ==================== CREATE TABLE MANUALLY ====================
  createTableManually: async function() {
    try {
      console.log('🛠️ Creating savings_products table manually...');
      
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS savings_products (
          id BIGINT AUTO_INCREMENT PRIMARY KEY,
          
          -- Legacy system fields
          PROD_ID INT NOT NULL UNIQUE,
          PROD_CD VARCHAR(50) NOT NULL,
          PROD_DESC VARCHAR(255) NOT NULL,
          PRODUCT_TYPE VARCHAR(50) NOT NULL DEFAULT 'SAVINGS',
          
          -- New system fields
          product_code VARCHAR(50) NOT NULL UNIQUE,
          product_name VARCHAR(100) NOT NULL,
          product_description TEXT,
          product_type VARCHAR(50) NOT NULL DEFAULT 'SAVINGS',
          crncy_id VARCHAR(10) DEFAULT 'NGN',
          bu_id VARCHAR(50),
          
          -- GL Accounts
          principal_balance_gl_account_no VARCHAR(50) DEFAULT '01001101101001',
          interest_gl_account_no VARCHAR(50) DEFAULT '01001101101001',
          interest_payable_gl_account_no VARCHAR(50) DEFAULT '01001101116001',
          withholding_tax_gl_account_no VARCHAR(50) DEFAULT '01001501601001',
          interest_income_gl_account_no VARCHAR(50) DEFAULT '01001301304001',
          interest_receivable_gl_account_no VARCHAR(50) DEFAULT '01001101116001',
          interest_expense_gl_account_no VARCHAR(50) DEFAULT '01001301304001',
          deposit_charge_receivable_gl_account_no VARCHAR(50) DEFAULT '01001101101001',
          settlement_gl_account_no VARCHAR(50) DEFAULT '01001999137001',
          
          -- Rate fields
          rate_type VARCHAR(50) DEFAULT 'FIXED',
          fixed_rate DECIMAL(10,4) DEFAULT 0.0,
          effective_rate DECIMAL(10,4) DEFAULT 0.0,
          effective_date DATETIME DEFAULT CURRENT_TIMESTAMP,
          
          -- Settlement fields
          settlement_frequency VARCHAR(50) DEFAULT 'MONTHLY',
          principal_settlement_method VARCHAR(50) DEFAULT 'ACCOUNT',
          interest_settlement_method VARCHAR(50) DEFAULT 'ACCOUNT',
          
          -- Accrual fields
          accrual_frequency VARCHAR(50) DEFAULT 'DAILY',
          accrual_basis VARCHAR(50) DEFAULT 'ACTUAL_DAYS/ACTUAL_DAYS',
          
          -- JSON fields
          rate_information JSON,
          settlement_information JSON,
          accrual_information JSON,
          charges_setup JSON,
          metadata JSON,
          
          -- Business Unit fields
          start_dt DATETIME DEFAULT CURRENT_TIMESTAMP,
          rec_st VARCHAR(20) DEFAULT 'A',
          is_global_product BOOLEAN DEFAULT FALSE,
          accessible_bus VARCHAR(500),
          visibility VARCHAR(50) DEFAULT 'SPECIFIC_BRANCHES',
          
          -- Other legacy fields
          prod_cat_ty VARCHAR(50),
          prod_design_id INT,
          min_age_year INT,
          stmnt_freq_cd VARCHAR(50),
          stmnt_freq_value INT,
          acct_cycle_cd VARCHAR(50),
          acct_cycle_value INT,
          acct_auth_bus_prod_id INT,
          version_no INT DEFAULT 1,
          created_by VARCHAR(100) DEFAULT 'system',
          user_id VARCHAR(100),
          
          -- Timestamps
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          -- Indexes
          INDEX idx_prod_id (PROD_ID),
          INDEX idx_product_code (product_code),
          INDEX idx_rec_st (rec_st),
          INDEX idx_product_type (product_type),
          INDEX idx_bu_id (bu_id),
          INDEX idx_is_global (is_global_product)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
      `);
      
      console.log('✅ Table created manually with snake_case columns');
      return true;
    } catch (error) {
      console.error('❌ Manual table creation failed:', error.message);
      throw error;
    }
  },
  
  // ==================== INITIALIZE ====================
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

// ==================== EXPORTED FUNCTIONS ====================

// ✅ GET SAVINGS PRODUCT BY PRODUCT CODE OR PRODUCT NAME
export const getSavingsProduct = async (req, res) => {
  const { productCode } = req.params;
  const { productName, search } = req.query;

  try {
    let product;
    let searchType = 'productCode';
    
    // If productName query parameter is provided, search by product name
    if (productName) {
      console.log(`🔍 Searching for product by name: ${productName}`);
      searchType = 'productName';
      
      // Use Sequelize's findOne with case-insensitive search
      product = await SavingsProduct.findOne({
        where: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('productName')),
          sequelize.fn('LOWER', productName)
        )
      });
    }
    // If generic search parameter is provided, try both productCode and productName
    else if (search) {
      console.log(`🔍 Searching for product: ${search}`);
      searchType = 'productCodeOrName';
      
      // Search by either productCode or productName (case-insensitive)
      product = await SavingsProduct.findOne({
        where: {
          [Op.or]: [
            sequelize.where(
              sequelize.fn('LOWER', sequelize.col('productCode')),
              sequelize.fn('LOWER', search)
            ),
            sequelize.where(
              sequelize.fn('LOWER', sequelize.col('productName')),
              sequelize.fn('LOWER', search)
            ),
            // Also check legacy PROD_CD field
            sequelize.where(
              sequelize.fn('LOWER', sequelize.col('PROD_CD')),
              sequelize.fn('LOWER', search)
            )
          ]
        }
      });
    }
    // Default: search by productCode from params
    else {
      console.log(`🔍 Searching for product by code: ${productCode}`);
      product = await SavingsProduct.findOne({
        where: {
          [Op.or]: [
            { productCode },
            { PROD_CD: productCode }
          ]
        }
      });
    }

    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Savings product ${searchType === 'productName' ? 'with name "' + (productName || search) + '"' : 'with productCode "' + (productCode || search) + '"'} not found`,
        searchCriteria: {
          type: searchType,
          value: productName || search || productCode
        }
      });
    }

    // Log successful retrieval
    console.log(`✅ Product found: ${product.productCode} - ${product.productName}`);

    return res.status(200).json({
      success: true,
      message: `Savings product retrieved successfully by ${searchType}`,
      product,
      searchInfo: {
        type: searchType,
        criteria: productName || search || productCode,
        matchedField: product.productCode === (productName || search || productCode) ? 'productCode' : 'productName'
      }
    });
  } catch (error) {
    logger.error('Error retrieving savings product:', {
      error: error.message,
      stack: error.stack,
      productCode,
      productName,
      search: req.query.search,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving the savings product',
      error: error.message,
    });
  }
};

// ✅ SEARCH SAVINGS PRODUCTS (ADVANCED SEARCH)
export const searchSavingsProducts = async (req, res) => {
  try {
    const {
      q, // General search term
      productCode,
      productName,
      productType,
      CRNCY_ID,
      BU_ID,
      REC_ST,
      isGlobalProduct,
      visibility,
      page = 1,
      limit = 10,
      sortBy = 'created_at',
      sortOrder = 'DESC'
    } = req.query;

    // Build where conditions
    const whereConditions = {};

    // General search across multiple fields
    if (q) {
      whereConditions[Op.or] = [
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('productCode')),
          { [Op.like]: `%${q.toLowerCase()}%` }
        ),
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('productName')),
          { [Op.like]: `%${q.toLowerCase()}%` }
        ),
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('productDescription')),
          { [Op.like]: `%${q.toLowerCase()}%` }
        ),
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('PROD_CD')),
          { [Op.like]: `%${q.toLowerCase()}%` }
        ),
        sequelize.where(
          sequelize.fn('LOWER', sequelize.col('PROD_DESC')),
          { [Op.like]: `%${q.toLowerCase()}%` }
        )
      ];
    }

    // Specific field searches
    if (productCode) {
      whereConditions.productCode = { [Op.like]: `%${productCode}%` };
    }
    
    if (productName) {
      whereConditions.productName = { [Op.like]: `%${productName}%` };
    }
    
    if (productType) {
      whereConditions.productType = productType;
    }
    
    if (CRNCY_ID) {
      whereConditions.CRNCY_ID = CRNCY_ID;
    }
    
    if (BU_ID) {
      // Handle BU_ID search - check if BU_ID contains the search value
      whereConditions.BU_ID = { [Op.like]: `%${BU_ID}%` };
    }
    
    if (REC_ST) {
      whereConditions.REC_ST = REC_ST;
    }
    
    if (isGlobalProduct !== undefined) {
      whereConditions.isGlobalProduct = isGlobalProduct === 'true';
    }
    
    if (visibility) {
      whereConditions.visibility = visibility;
    }

    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const parsedLimit = parseInt(limit);

    // Execute query with pagination
    const { count, rows: products } = await SavingsProduct.findAndCountAll({
      where: Object.keys(whereConditions).length > 0 ? whereConditions : undefined,
      order: [[sortBy, sortOrder.toUpperCase()]],
      limit: parsedLimit,
      offset: offset,
      distinct: true
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(count / parsedLimit);
    const currentPage = parseInt(page);

    console.log(`🔍 Found ${count} products matching search criteria`);

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
      },
      searchCriteria: {
        generalSearch: q,
        productCode,
        productName,
        productType,
        BU_ID,
        totalResults: count
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

// ✅ GET PRODUCT BY MULTIPLE CRITERIA (FLEXIBLE)
export const getProductByCriteria = async (req, res) => {
  try {
    const criteria = {};
    const { PROD_ID, productCode, productName, PROD_CD } = req.query;

    // Build criteria based on provided parameters
    if (PROD_ID) criteria.PROD_ID = PROD_ID;
    if (productCode) criteria.productCode = productCode;
    if (productName) {
      // Case-insensitive product name search
      criteria.productName = sequelize.where(
        sequelize.fn('LOWER', sequelize.col('productName')),
        sequelize.fn('LOWER', productName)
      );
    }
    if (PROD_CD) criteria.PROD_CD = PROD_CD;

    // If no criteria provided, return error
    if (Object.keys(criteria).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one search criteria: PROD_ID, productCode, productName, or PROD_CD'
      });
    }

    const product = await SavingsProduct.findOne({
      where: criteria
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found with the given criteria',
        searchCriteria: criteria
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Product retrieved successfully',
      product,
      matchedCriteria: Object.keys(criteria)
    });

  } catch (error) {
    logger.error('Error getting product by criteria:', {
      error: error.message,
      stack: error.stack,
      query: req.query,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving the product',
      error: error.message,
    });
  }
};

// ✅ GET ALL SAVINGS PRODUCTS
export const getAllSavingsProducts = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const where = { REC_ST: 'Active' };

    const { count, rows } = await SavingsProduct.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
      order: [['created_at', 'DESC']]   // ← use snake_case column name
    });

    return res.status(200).json({
      success: true,
      message: 'Savings products retrieved successfully',
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / limit),
        hasNextPage: page * limit < count,
        hasPrevPage: page > 1
      },
      filters: { REC_ST: 'Active' }
    });
  } catch (error) {
    logger.error('Error fetching savings products:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ✅ UPDATE SAVINGS PRODUCT
export const updateSavingsProduct = async (req, res) => {
  const { productCode } = req.params;
  const updateData = req.body;

  const transaction = await sequelize.transaction();
  
  try {
    // ✅ FIND EXISTING PRODUCT
    const existingProduct = await SavingsProduct.findOne({ 
      where: { productCode },
      transaction
    });
    
    if (!existingProduct) {
      await transaction.rollback();
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
    
    // Handle Decimal conversions for rate fields
    if (updateFields.rateInformation) {
      const rateInfo = updateFields.rateInformation;
      
      if (rateInfo.fixedRate) {
        rateInfo.fixedRate = parseFloat(rateInfo.fixedRate).toFixed(6);
      }
      if (rateInfo.marginRate) {
        rateInfo.marginRate = parseFloat(rateInfo.marginRate).toFixed(6);
      }
      if (rateInfo.effectiveRate) {
        rateInfo.effectiveRate = parseFloat(rateInfo.effectiveRate).toFixed(6);
      }
      if (rateInfo.minimumRate) {
        rateInfo.minimumRate = parseFloat(rateInfo.minimumRate).toFixed(6);
      }
      if (rateInfo.maximumRate) {
        rateInfo.maximumRate = parseFloat(rateInfo.maximumRate).toFixed(6);
      }
    }

    // Handle BU_ID updates
    if (updateFields.BU_ID) {
      let buIds = updateFields.BU_ID;
      if (typeof buIds === 'string') {
        buIds = buIds.split(',').map(bu => bu.trim()).filter(bu => bu.length > 0);
      }
      
      // Remove duplicates and validate
      buIds = [...new Set(buIds)];
      const validBuPattern = /^(\d{3}|\*)$/;
      const invalidBUs = buIds.filter(buId => !validBuPattern.test(buId));

      if (invalidBUs.length > 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Invalid BU_ID format(s): ${invalidBUs.join(', ')}. Must be 3-digit string or * for global`,
        });
      }

      updateFields.BU_ID = buIds.join(',');
      
      // Update accessibleBUs if not explicitly provided
      if (!updateFields.accessibleBUs) {
        const hasGlobalWildcard = buIds.includes('*');
        updateFields.accessibleBUs = hasGlobalWildcard ? '*' : buIds.join(',');
      }
    }

    // Handle charges setup amounts
    if (updateFields.chargesSetup && Array.isArray(updateFields.chargesSetup)) {
      // Validate charges setup
      for (const charge of updateFields.chargesSetup) {
        if (!charge.name || charge.amount == null || !charge.glAccountCode || !charge.chargeType) {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: 'Each charge must include name, amount, glAccountCode, and chargeType',
          });
        }
      }
      
      updateFields.chargesSetup = JSON.stringify(updateFields.chargesSetup.map(charge => ({
        name: charge.name,
        chargeType: charge.chargeType,
        amount: parseFloat(charge.amount).toFixed(2),
        glAccountCode: charge.glAccountCode,
        frequency: charge.frequency || 'ONE_TIME'
      })));
    }

    // Handle individual GL account updates
    if (updateData.glAccounts && typeof updateData.glAccounts === 'object') {
      // Extract individual GL account fields from glAccounts object
      const glAccountFields = [
        'principalBalanceGLAccountNo',
        'interestIncomeGLAccountNo',
        'interestPayableGLAccountNo',
        'withholdingTaxGLAccountNo',
        'interestReceivableGLAccountNo',
        'interestExpenseGLAccountNo',
        'depositChargeReceivableGLAccountNo',
        'delinquentBalanceGLAccountNo',
        'dormantBalanceGLAccountNo',
        'earmarkedBalanceGLAccountNo',
        'escheatedBalanceGLAccountNo',
        'interestChequesGLAccountNo',
        'interestSuspenseGLAccountNo',
        'maturedBalanceGLAccountNo',
        'maturityChequesGLAccountNo',
        'nonAccrualBalanceGLAccountNo',
        'overdrawnBalanceGLAccountNo',
        'preDormantBalanceGLAccountNo',
        'provisionReserveGLAccountNo',
        'provisionExpenseGLAccountNo',
        'rejectedCreditSuspenseGLAccountNo',
        'rejectedDebitSuspenseGLAccountNo',
        'reservedBalanceGLAccountNo',
        'unclearedBalanceGLAccountNo',
        'writeOffBalanceGLAccountNo',
        'recoveriesGLAccountNo',
        'interestCreditGLAccountNo',
        'interestDebitGLAccountNo'
      ];

      // Map glAccounts object fields to individual fields
      glAccountFields.forEach(field => {
        const fieldName = field.replace('GLAccountNo', '');
        const camelCaseField = fieldName.charAt(0).toLowerCase() + fieldName.slice(1);
        
        if (updateData.glAccounts[camelCaseField] !== undefined) {
          updateFields[field] = updateData.glAccounts[camelCaseField];
        }
      });
      
      // Remove the glAccounts object to avoid conflicts
      delete updateFields.glAccounts;
    }

    // ✅ UPDATE PRODUCT
    await existingProduct.update(updateFields, { transaction });

    // Refresh to get updated product
    const updatedProduct = await SavingsProduct.findByPk(existingProduct.id, { transaction });

    // ✅ CREATE AUDIT TRAIL
    try {
      await AuditTrail.create({
        event_id: Date.now(),
        user_id: userId,
        event_type: 'SAVINGS_PRODUCT_UPDATE',
        action: 'Update Savings Product',
        old_value: JSON.stringify(existingProduct.toJSON()),
        new_value: JSON.stringify(updatedProduct.toJSON()),
        ip_address: ipAddress,
        timestamp: now,
        entity_type: 'SavingsProduct',
        entity_id: updatedProduct.id,
        status: 'SUCCESS',
        description: `Updated savings product ${productCode}`,
      }, { transaction });
    } catch (auditError) {
      logger.error('Failed to create audit trail for savings product update', {
        error: auditError.message,
        productCode,
        timestamp: now,
      });
    }

    await transaction.commit();

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
      updateData: req.body,
      timestamp: new Date(),
    });

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Duplicate key error',
        error: error.errors.map(err => err.message),
      });
    }

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
    const { page = 1, limit = 10, includeGlobal = 'true' } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const parsedLimit = parseInt(limit);
    
    if (!/^(\d{3}|\*)$/.test(bu_id)) {
      return res.status(400).json({
        success: false,
        message: 'BU_ID must be a 3-digit string or * for global',
      });
    }

    // Build search conditions
    const whereConditions = {
      REC_ST: 'A'
    };
    
    if (bu_id === '*') {
      // Get all global products
      whereConditions[Op.or] = [
        { isGlobalProduct: true },
        { accessibleBUs: { [Op.like]: '%*%' } },
        { visibility: 'GLOBAL' }
      ];
    } else {
      // Get products for specific BU
      const orConditions = [
        { BU_ID: { [Op.like]: `%${bu_id}%` } },
        { accessibleBUs: { [Op.like]: `%${bu_id}%` } }
      ];
      
      if (includeGlobal === 'true') {
        orConditions.push(
          { isGlobalProduct: true },
          { accessibleBUs: { [Op.like]: '%*%' } },
          { visibility: 'GLOBAL' }
        );
      }
      
      whereConditions[Op.or] = orConditions;
    }
    
    const { count, rows: products } = await SavingsProduct.findAndCountAll({
      where: whereConditions,
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
      },
      metadata: {
        bu_id,
        includeGlobal: includeGlobal === 'true',
        count: products.length
      }
    });
  } catch (error) {
    logger.error('Error getting products by BU:', {
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

  const transaction = await sequelize.transaction();
  
  try {
    const existingProduct = await SavingsProduct.findOne({ 
      where: { productCode },
      transaction
    });
    
    if (!existingProduct) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Savings product with productCode ${productCode} not found`,
      });
    }

    await existingProduct.update({ REC_ST: 'I' }, { transaction });

    // ✅ CREATE AUDIT TRAIL
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();
    
    try {
      await AuditTrail.create({
        event_id: Date.now(),
        user_id: userId,
        event_type: 'SAVINGS_PRODUCT_DEACTIVATE',
        action: 'Deactivate Savings Product',
        old_value: JSON.stringify(existingProduct.toJSON()),
        new_value: JSON.stringify({ ...existingProduct.toJSON(), REC_ST: 'I' }),
        ip_address: ipAddress,
        timestamp: now,
        entity_type: 'SavingsProduct',
        entity_id: existingProduct.id,
        status: 'SUCCESS',
        description: `Deactivated savings product ${productCode}`,
      }, { transaction });
    } catch (auditError) {
      logger.error('Failed to create audit trail for product deactivation', {
        error: auditError.message,
        productCode,
        timestamp: now,
      });
    }

    await transaction.commit();

    // Get updated product
    const updatedProduct = await SavingsProduct.findByPk(existingProduct.id);

    return res.status(200).json({
      success: true,
      message: 'Savings product deactivated successfully',
      product: updatedProduct,
    });
  } catch (error) {
    await transaction.rollback();
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
  }
};

// ✅ REACTIVATE SAVINGS PRODUCT
export const reactivateSavingsProduct = async (req, res) => {
  const { productCode } = req.params;

  const transaction = await sequelize.transaction();
  
  try {
    const existingProduct = await SavingsProduct.findOne({ 
      where: { productCode },
      transaction
    });
    
    if (!existingProduct) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Savings product with productCode ${productCode} not found`,
      });
    }

    await existingProduct.update({ REC_ST: 'A' }, { transaction });

    // ✅ CREATE AUDIT TRAIL
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();
    
    try {
      await AuditTrail.create({
        event_id: Date.now(),
        user_id: userId,
        event_type: 'SAVINGS_PRODUCT_REACTIVATE',
        action: 'Reactivate Savings Product',
        old_value: JSON.stringify(existingProduct.toJSON()),
        new_value: JSON.stringify({ ...existingProduct.toJSON(), REC_ST: 'A' }),
        ip_address: ipAddress,
        timestamp: now,
        entity_type: 'SavingsProduct',
        entity_id: existingProduct.id,
        status: 'SUCCESS',
        description: `Reactivated savings product ${productCode}`,
      }, { transaction });
    } catch (auditError) {
      logger.error('Failed to create audit trail for product reactivation', {
        error: auditError.message,
        productCode,
        timestamp: now,
      });
    }

    await transaction.commit();

    // Get updated product
    const updatedProduct = await SavingsProduct.findByPk(existingProduct.id);

    return res.status(200).json({
      success: true,
      message: 'Savings product reactivated successfully',
      product: updatedProduct,
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error reactivating savings product:', {
      error: error.message,
      stack: error.stack,
      productCode,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while reactivating the savings product',
      error: error.message,
    });
  }
};

// ✅ GET SAVINGS PRODUCT BY ID
export const getSavingsProductById = async (req, res) => {
  const { id } = req.params;

  try {
    const product = await SavingsProduct.findByPk(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: `Savings product with ID ${id} not found`,
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Savings product retrieved successfully',
      product,
    });
  } catch (error) {
    logger.error('Error retrieving savings product by ID:', {
      error: error.message,
      stack: error.stack,
      id,
      timestamp: new Date(),
    });

    return res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving the savings product',
      error: error.message,
    });
  }
};

// ✅ DELETE SAVINGS PRODUCT
export const deleteSavingsProduct = async (req, res) => {
  const { productCode } = req.params;

  const transaction = await sequelize.transaction();
  
  try {
    const existingProduct = await SavingsProduct.findOne({ 
      where: { productCode },
      transaction
    });
    
    if (!existingProduct) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Savings product with productCode ${productCode} not found`,
      });
    }

    // Check if product can be deleted (not in use)
    // You might want to add additional checks here
    
    // ✅ CREATE AUDIT TRAIL BEFORE DELETION
    const userId = req.user?.id || req.headers['x-user-id'] || 'system';
    const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = new Date();
    
    try {
      await AuditTrail.create({
        event_id: Date.now(),
        user_id: userId,
        event_type: 'SAVINGS_PRODUCT_DELETE',
        action: 'Delete Savings Product',
        old_value: JSON.stringify(existingProduct.toJSON()),
        new_value: null,
        ip_address: ipAddress,
        timestamp: now,
        entity_type: 'SavingsProduct',
        entity_id: existingProduct.id,
        status: 'SUCCESS',
        description: `Deleted savings product ${productCode}`,
      }, { transaction });
    } catch (auditError) {
      logger.error('Failed to create audit trail for product deletion', {
        error: auditError.message,
        productCode,
        timestamp: now,
      });
    }

    // Delete the product
    await existingProduct.destroy({ transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Savings product deleted successfully',
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error deleting savings product:', {
      error: error.message,
      stack: error.stack,
      productCode,
      timestamp: new Date(),
    });

    // Handle foreign key constraint errors
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete product as it is being used by other records',
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting the savings product',
      error: error.message,
    });
  }
};

// ==================== INITIALIZATION FUNCTION ====================
export const initialize = async function() {
  try {
    console.log('🚀 Initializing Products Module...');
    await SavingsProduct.createTableIfNotExists();
    console.log('✅ Products Module initialized successfully');
    return true;
  } catch (error) {
    console.error('❌ Products Module initialization failed:', error);
    return false;
  }
};

// ==================== DEFAULT EXPORT ====================
export default {
  ProductsController,
  initialize,
  getSavingsProduct,
  searchSavingsProducts,
  getProductByCriteria,
  getAllSavingsProducts,
  updateSavingsProduct,
  getProductsByBU,
  deactivateSavingsProduct,
  reactivateSavingsProduct,
  getSavingsProductById,
  deleteSavingsProduct
};