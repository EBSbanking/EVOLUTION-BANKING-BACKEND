// src/controllers/LoanProductController.js - UPDATED FOR GL ACCOUNT FORMAT
import asyncHandler from 'express-async-handler';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

// Try to import models individually first, fallback to index
let LoanProduct, LoanInterestRate, ProductTypeMapping, AuditTrail, Branch;

try {
  // Try individual imports first
  LoanProduct = (await import('../models/LoanProduct.js')).default;
  LoanInterestRate = (await import('../models/LoanInterestRate.js')).default;
  ProductTypeMapping = (await import('../models/ProductTypeMapping.js')).default;
  AuditTrail = (await import('../models/AuditTrail.js')).default;
  Branch = (await import('../models/Branch.js')).default;
} catch (error) {
  console.log('❌ Individual model imports failed, trying index import...');
  try {
    // Fallback to index import
    const Models = await import('../models/index.js');
    LoanProduct = Models.LoanProduct;
    LoanInterestRate = Models.LoanInterestRate;
    ProductTypeMapping = Models.ProductTypeMapping;
    AuditTrail = Models.AuditTrail;
    Branch = Models.Branch;
  } catch (indexError) {
    console.error('❌ Both individual and index imports failed:', indexError.message);
  }
}

// Helper function to format GL account for ProductTypeMapping validation
// This adds hyphens temporarily for validation, but you can remove this if you modify the model
const formatGLAccountForValidation = (glAccount) => {
  if (!glAccount) return null;
  
  // If already has hyphens, return as is
  if (glAccount.includes('-')) return glAccount;
  
  // If it's a 13-digit number, format as xx-xx-xx-xx-xx-xxx
  if (glAccount.length === 13 && /^\d+$/.test(glAccount)) {
    return `${glAccount.substring(0, 2)}-${glAccount.substring(2, 4)}-${glAccount.substring(4, 6)}-${glAccount.substring(6, 8)}-${glAccount.substring(8, 10)}-${glAccount.substring(10, 13)}`;
  }
  
  // If it's a 12-digit number, format as xx-xx-xx-xx-xx-xx
  if (glAccount.length === 12 && /^\d+$/.test(glAccount)) {
    return `${glAccount.substring(0, 2)}-${glAccount.substring(2, 4)}-${glAccount.substring(4, 6)}-${glAccount.substring(6, 8)}-${glAccount.substring(8, 10)}-${glAccount.substring(10, 12)}`;
  }
  
  // Return as is if can't format
  return glAccount;
};

// Keep original format for LoanProduct
const keepOriginalGLFormat = (glAccount) => {
  if (!glAccount) return null;
  return glAccount.replace(/-/g, ''); // Remove any hyphens
};

// Safe Decimal converter
const toDecimal = (val, field) => {
  if (val === undefined || val === null || val === '') {
    return '0.00';
  }
  const num = parseFloat(val);
  if (isNaN(num) || num < 0) throw new Error(`${field} must be a positive number`);
  return num.toFixed(2);
};

// Helper function to get client IP address
const getClientIp = (req) => {
  return req.ip ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         '127.0.0.1';
};

// In your LoanProductController.js, update the generateEventId function:

const generateEventId = () => {
  // Generate a number that's definitely within MySQL INT range
  const maxInt = 2147483647;
  const timestamp = Date.now() % 1000000; // Last 6 digits of timestamp
  const random = Math.floor(Math.random() * 10000);
  const eventId = timestamp * 10000 + random;
  
  // Double-check it's within range
  return Math.min(eventId, maxInt - 1);
};


// Helper function to validate branch codes
const validateBranchCodes = async (branchCodes, transaction) => {
  const validCodes = [];
  const invalidCodes = [];
 
  for (const code of branchCodes) {
    // Skip wildcard
    if (code === '*') {
      validCodes.push(code);
      continue;
    }
   
    const branch = await Branch.findOne({
      where: {
        branchCode: code,
        status: 'ACTIVE'
      },
      transaction
    });
   
    if (branch) {
      validCodes.push(code);
    } else {
      invalidCodes.push(code);
    }
  }
 
  return { validCodes, invalidCodes };
};

// Helper function to convert term to months
const convertTermToMonths = (value, termType) => {
  switch(termType?.toUpperCase()) {
    case 'DAYS':
      return Math.ceil(value / 30.44); // Average days in month
    case 'WEEKS':
      return Math.ceil(value / 4.345); // Average weeks in month
    case 'MONTHS':
      return value;
    case 'QUARTERS':
      return value * 3;
    case 'YEARS':
      return value * 12;
    default:
      return value;
  }
};

// Validate product type
const validateProductType = (productType) => {
  const validTypes = [
    'PERSONAL_LOAN',
    'BUSINESS_LOAN',
    'SME_LOAN',
    'AGRI_LOAN',
    'EDUCATION_LOAN',
    'HOME_LOAN',
    'CAR_LOAN',
    'MICROFINANCE_LOAN',
    'GENERAL_LOAN',
    'SALARY_ADVANCE',
    'PAYDAY_LOAN'
  ];
  
  if (!validTypes.includes(productType?.toUpperCase())) {
    throw new Error(`Invalid product type: ${productType}. Must be one of: ${validTypes.join(', ')}`);
  }
};

export const LoanProductController = {
  // CREATE LOAN PRODUCT - FLEXIBLE INTEREST RATE HANDLING
 createProduct: asyncHandler(async (req, res) => {
    console.log('🚀 Starting product creation process...');
    
    // Check if models are loaded
    if (!LoanProduct || !LoanInterestRate || !ProductTypeMapping || !AuditTrail || !Branch) {
      return res.status(500).json({
        success: false,
        message: 'Database models not loaded.',
        error: {
          LoanProduct: !!LoanProduct,
          LoanInterestRate: !!LoanInterestRate,
          ProductTypeMapping: !!ProductTypeMapping,
          AuditTrail: !!AuditTrail,
          Branch: !!Branch
        }
      });
    }

    // CRITICAL FIX: Pre-transaction duplicate checks
    const {
        name,
        productCode,
        BU_ID = [],
        PROD_ID,
        PRODUCT_TYPE = 'BUSINESS_LOAN',
        description = '',
        PRODUCT_SHORT_NAME,
        createdBy = req.user?.id || 'SYSTEM',
        defaultGLAccounts = {},
        minAmount,
        maxAmount,
        productCategory = 'BUSINESS_LOAN',
        account_prefix = 'BL'
    } = req.body;

    console.log('🔍 Performing pre-transaction duplicate checks...');
    
    // Check loan_products table - USE MODEL FIELD NAMES
    const existingLoanProduct = await LoanProduct.findOne({
        where: {
            [Op.or]: [
                { PROD_ID: PROD_ID || Number(productCode) }, // Model field: PROD_ID
                { productCode: productCode }, // Model field: productCode
                { PRODUCT_SHORT_NAME: PRODUCT_SHORT_NAME?.toUpperCase() } // Model field: PRODUCT_SHORT_NAME
            ]
        }
    });

    if (existingLoanProduct) {
        return res.status(400).json({
            success: false,
            message: `Product already exists in loan_products with: ${existingLoanProduct.productCode}`
        });
    }

    // Check product_type_mapping table
    const existingMapping = await ProductTypeMapping.findOne({
        where: { p_r_o_d__i_d: PROD_ID || Number(productCode) } // Fixed: use p_r_o_d__i_d
    });

    if (existingMapping) {
        console.warn(`⚠️ Found orphaned record in product_type_mapping with PROD_ID: ${PROD_ID}`);
        return res.status(400).json({
            success: false,
            message: `PROD_ID ${PROD_ID} already exists in product_type_mapping table. Clean up first.`
        });
    }

    // Now start the transaction
    const transaction = await sequelize.transaction();
    console.log('✅ Transaction started');
    
    try {
      const {
        CRNCY_ID = 'NGN',
        PAYMENT_FREQUENCY = 'MONTHLY',
        TERM_CD = 'M',
        LOAN_INTEREST_RATE_ID,
        LOAN_PROUD_INT_ID,
        interestRateConfig = {},
        interestRate,
        MIN_RATE_PER_MONTH,
        MAX_RATE_PER_MONTH,
        DEFAULT_RATE_PER_MONTH,
        TOTAL_INTEREST_RATE,
        RATE_TY = 'FIXED',
        INT_TY = 'SIMPLE',
        CALCULATION_METHOD = 'FLAT',
        minTerm,
        maxTerm,
        MIN_LOAN_TERM_VALUE,
        MAX_LOAN_TERM_VALUE,
        LOAN_TERM_TYPE = 'MONTHS',
        MIN_LOAN_TERM_MONTHS,
        MAX_LOAN_TERM_MONTHS,
        branchGLAccounts = [],
        feeStructure = [],
        processingFeeRate = 0,
        processingFeeGLCode,
        lateFeePerDay = 0,
        maxLateFee = 0,
        MIN_DURATION_MONTHS,
        MIN_DURATION_DAYS,
        MIN_DURATION_WEEKS,
        CAPITALIZE_INT_FG,
        AMORTIZED,
        REPAYMENT_FREQUENCY,
        TIME,
        allowedCurrencies = ['NGN'],
        isActive = true,
        STATUS = 'ACTIVE',
        USER_ID = req.user?.id || 'SYSTEM'
      } = req.body;
      
      // REQUIRED FIELDS VALIDATION
      if (!name || !productCode || !PRODUCT_TYPE) {
        throw new Error('name, productCode, and PRODUCT_TYPE are required');
      }
      
      if (!defaultGLAccounts || !defaultGLAccounts.loanGLAccount) {
        throw new Error('Default loan GL account is required in defaultGLAccounts.loanGLAccount');
      }
      
      if (!minAmount || !maxAmount) {
        throw new Error('minAmount and maxAmount are required');
      }
      
      // STEP 1: HANDLE INTEREST RATE
      let interestRateRecord;
      let loanInterestRateId;
      let loanProudIntId;
      
      if (LOAN_INTEREST_RATE_ID) {
        interestRateRecord = await LoanInterestRate.findByPk(LOAN_INTEREST_RATE_ID, { transaction });
        if (!interestRateRecord) {
          throw new Error(`Loan interest rate with ID ${LOAN_INTEREST_RATE_ID} not found`);
        }
        loanInterestRateId = LOAN_INTEREST_RATE_ID;
        loanProudIntId = LOAN_PROUD_INT_ID || interestRateRecord.LOAN_PROUD_INT_ID;
      } else if (MIN_RATE_PER_MONTH || DEFAULT_RATE_PER_MONTH || interestRateConfig) {
        const interestRateName = interestRateConfig?.name || `${name} Interest Rate`;
        const interestRateCode = interestRateConfig?.code || `RATE_${productCode}`;
        
        const minRatePerMonth = MIN_RATE_PER_MONTH || interestRateConfig?.MIN_RATE_PER_MONTH || 
                               (interestRate ? interestRate / 12 : 6.20);
        const maxRatePerMonth = MAX_RATE_PER_MONTH || interestRateConfig?.MAX_RATE_PER_MONTH || minRatePerMonth;
        const defaultRatePerMonth = DEFAULT_RATE_PER_MONTH || interestRateConfig?.DEFAULT_RATE_PER_MONTH || minRatePerMonth;
        
        interestRateRecord = await LoanInterestRate.create({
          name: interestRateName,
          code: interestRateCode,
          description: interestRateConfig?.description || `Interest rate for ${name}`,
          RATE_TYPE: RATE_TY || interestRateConfig?.RATE_TYPE || 'FIXED',
          INTEREST_TYPE: INT_TY || interestRateConfig?.INTEREST_TYPE || 'SIMPLE',
          CALCULATION_METHOD: CALCULATION_METHOD || interestRateConfig?.CALCULATION_METHOD || 'FLAT',
          MIN_RATE_PER_MONTH: minRatePerMonth,
          MAX_RATE_PER_MONTH: maxRatePerMonth,
          DEFAULT_RATE_PER_MONTH: defaultRatePerMonth,
          MIN_RATE_PER_YEAR: minRatePerMonth * 12,
          MAX_RATE_PER_YEAR: maxRatePerMonth * 12,
          DEFAULT_RATE_PER_YEAR: defaultRatePerMonth * 12,
          TOTAL_INTEREST_RATE: TOTAL_INTEREST_RATE || interestRateConfig?.TOTAL_INTEREST_RATE || (defaultRatePerMonth * 12),
          metadata: {
            createdWithProduct: true,
            productCode: productCode,
            productName: name,
            ...interestRateConfig?.metadata
          },
          STATUS: 'ACTIVE',
          isActive: true,
          createdBy: createdBy,
          USER_ID: USER_ID
        }, { transaction });
        
        loanInterestRateId = interestRateRecord.id;
        loanProudIntId = interestRateRecord.LOAN_PROUD_INT_ID;
      } else {
        throw new Error('Either LOAN_INTEREST_RATE_ID or interest rate parameters are required');
      }
      
      // STEP 2: PROCESS TERM FIELDS
      let minTermValue, maxTermValue, termType;
      
      if (MIN_LOAN_TERM_VALUE && MAX_LOAN_TERM_VALUE && LOAN_TERM_TYPE) {
        minTermValue = parseInt(MIN_LOAN_TERM_VALUE);
        maxTermValue = parseInt(MAX_LOAN_TERM_VALUE);
        termType = LOAN_TERM_TYPE.toUpperCase();
      } else if (minTerm && maxTerm) {
        minTermValue = parseInt(minTerm);
        maxTermValue = parseInt(maxTerm);
        termType = LOAN_TERM_TYPE || 'MONTHS';
      } else if (MIN_LOAN_TERM_MONTHS && MAX_LOAN_TERM_MONTHS) {
        minTermValue = parseInt(MIN_LOAN_TERM_MONTHS);
        maxTermValue = parseInt(MAX_LOAN_TERM_MONTHS);
        termType = 'MONTHS';
      } else {
        minTermValue = interestRateRecord.MIN_TERM_VALUE || 1;
        maxTermValue = interestRateRecord.MAX_TERM_VALUE || 60;
        termType = interestRateRecord.TERM_TYPE || 'MONTHS';
      }
      
      // Validate term type
      const validTermTypes = ['DAYS', 'WEEKS', 'MONTHS', 'QUARTERS', 'YEARS'];
      if (!validTermTypes.includes(termType.toUpperCase())) {
        throw new Error(`Invalid LOAN_TERM_TYPE. Must be one of: ${validTermTypes.join(', ')}`);
      }
      
      if (minTermValue >= maxTermValue) {
        throw new Error('MIN_LOAN_TERM_VALUE must be less than MAX_LOAN_TERM_VALUE');
      }
      
      // STEP 3: PROCESS BU_ID (BRANCH CODES)
      let branchCodes = Array.isArray(BU_ID) ? BU_ID.map(String) :
                       typeof BU_ID === 'string' ? BU_ID.split(',').map(String) :
                       BU_ID != null ? [String(BU_ID)] : [];
      
      branchCodes = branchCodes.map(code => code.trim()).filter(Boolean);
      branchCodes = [...new Set(branchCodes)];
      
      if (branchCodes.length === 0) throw new Error('BU_ID (branch codes) is required');
      
      const hasWildcard = branchCodes.includes('*');
      let isGlobal = false;
      let accessibleBranches = [];
      let validatedBranchCodes = [];
      let allActiveBranches = [];
      
      if (hasWildcard) {
        allActiveBranches = await Branch.findAll({ 
          where: { status: 'ACTIVE' },
          transaction 
        });
        const allBranchCodes = allActiveBranches.map(b => b.branchCode);
        
        isGlobal = true;
        accessibleBranches = ['*'];
        validatedBranchCodes = ['*', ...allBranchCodes];
      } else {
        const validPattern = /^\d{3}$/;
        const invalidFormatCodes = branchCodes.filter(code => !validPattern.test(code));
        
        if (invalidFormatCodes.length > 0) {
          throw new Error(`Invalid BU_ID format: ${invalidFormatCodes.join(', ')}. Must be 3-digit branch codes.`);
        }
        
        const { validCodes, invalidCodes } = await validateBranchCodes(branchCodes, transaction);
        
        if (invalidCodes.length > 0) {
          throw new Error(`Branch codes do not exist or are not active: ${invalidCodes.join(', ')}`);
        }
        
        isGlobal = false;
        accessibleBranches = validCodes;
        validatedBranchCodes = validCodes;
        allActiveBranches = await Branch.findAll({
          where: {
            branchCode: { [Op.in]: validCodes },
            status: 'ACTIVE'
          },
          transaction
        });
      }
      
      // Prepare GL accounts
      const formattedDefaultGLAccounts = {
        loanGLAccount: defaultGLAccounts.loanGLAccount,
        interestGLAccountNo: defaultGLAccounts.interestGLAccountNo || defaultGLAccounts.loanGLAccount,
        interestPayableGLAccountNo: defaultGLAccounts.interestPayableGLAccountNo || defaultGLAccounts.loanGLAccount,
        withholdingTaxGLAccountNo: defaultGLAccounts.withholdingTaxGLAccountNo || defaultGLAccounts.loanGLAccount,
        suspenseGLAccountNo: defaultGLAccounts.suspenseGLAccountNo || defaultGLAccounts.loanGLAccount,
        principalGLAccountNo: defaultGLAccounts.principalGLAccountNo || defaultGLAccounts.loanGLAccount,
        processingFeeGLCode: defaultGLAccounts.processingFeeGLCode || defaultGLAccounts.loanGLAccount,
        ...defaultGLAccounts
      };
      
      // STEP 4: CREATE LOAN PRODUCT - USE MODEL FIELD NAMES
      console.log(`📝 Creating loan product with PROD_ID: ${PROD_ID || Number(productCode)}`);
      
      const loanProduct = await LoanProduct.create({
        // ✅ USE MODEL FIELD NAMES (from your LoanProduct.js)
        // Product Identification
        name,
        productCode, // Model field: productCode
        PROD_ID: PROD_ID || Number(productCode), // Model field: PROD_ID
        PRODUCT_SHORT_NAME: PRODUCT_SHORT_NAME?.toUpperCase(), // Model field: PRODUCT_SHORT_NAME
        PRODUCT_TYPE: PRODUCT_TYPE.toUpperCase(), // Model field: PRODUCT_TYPE
        description,
        CRNCY_ID,
        
        // Loan Interest Rate Reference
        LOAN_INTEREST_RATE_ID: loanInterestRateId, // Model field: LOAN_INTEREST_RATE_ID
        LOAN_PROUD_INT_ID: loanProudIntId, // Model field: LOAN_PROUD_INT_ID
        
        // Flexible Term Fields
        MIN_LOAN_TERM_VALUE: minTermValue, // Model field: MIN_LOAN_TERM_VALUE
        MAX_LOAN_TERM_VALUE: maxTermValue, // Model field: MAX_LOAN_TERM_VALUE
        LOAN_TERM_TYPE: termType, // Model field: LOAN_TERM_TYPE
        
        // Business Unit Configuration
        BU_ID: hasWildcard ? '*' : validatedBranchCodes.join(','), // Model field: BU_ID (as comma-separated string)
        isGlobalProduct: isGlobal, // Model field: isGlobalProduct
        visibility: isGlobal ? 'GLOBAL' : 'SELECTED_BUS',
        
        // Loan Terms
        minAmount: parseFloat(minAmount), // Model field: minAmount
        maxAmount: parseFloat(maxAmount), // Model field: maxAmount
        TERM_CD, // Model field: TERM_CD (MUST BE PROVIDED)
        PAYMENT_FREQUENCY: PAYMENT_FREQUENCY || REPAYMENT_FREQUENCY, // Model field: PAYMENT_FREQUENCY
        REPAYMENT_TYPE: PAYMENT_FREQUENCY || REPAYMENT_FREQUENCY, // Model field: REPAYMENT_TYPE
        
        // Product Category
        productCategory: productCategory || PRODUCT_TYPE,
        
        // Backward compatibility
        allowedCurrencies: ['NGN'],
        
        // GL Accounts
        defaultGLAccounts: formattedDefaultGLAccounts,
        
        // Branch GL Accounts
        branchGLAccounts: (branchGLAccounts || []).map(branch => ({
          branchCode: branch.branchCode,
          branchName: branch.branchName,
          loanGLAccount: branch.loanGLAccount || defaultGLAccounts.loanGLAccount,
          interestGLAccountNo: branch.interestGLAccountNo || defaultGLAccounts.loanGLAccount,
          interestPayableGLAccountNo: branch.interestPayableGLAccountNo || defaultGLAccounts.loanGLAccount,
          principalGLAccountNo: branch.principalGLAccountNo || defaultGLAccounts.loanGLAccount,
          ...branch
        })),
        
        // Fee Structure
        feeStructure: (feeStructure || []).map(fee => ({
          feeType: fee.feeType || 'PROCESSING',
          name: fee.name,
          amount: parseFloat(fee.amount || 0),
          isPercentage: fee.isPercentage || false,
          glAccountCode: fee.glAccountCode || defaultGLAccounts.loanGLAccount,
          appliesTo: fee.appliesTo || 'DISBURSEMENT',
          isActive: fee.isActive !== undefined ? fee.isActive : true,
          ...fee
        })),
        
        processingFeeRate: parseFloat(processingFeeRate || 0),
        processingFeeGLCode: processingFeeGLCode || defaultGLAccounts.loanGLAccount,
        lateFeePerDay: parseFloat(lateFeePerDay || 0),
        maxLateFee: parseFloat(maxLateFee || 0),
        
        // Additional Fields
        createdBy,
        USER_ID,
        isActive,
        STATUS,
        
        // Metadata for tracking
        metadata: {
          isWildcardProduct: hasWildcard,
          totalBranches: allActiveBranches.length,
          termConfiguration: {
            termType,
            minValue: minTermValue,
            maxValue: maxTermValue
          },
          interestRateConfiguration: {
            masterInterestRateId: loanInterestRateId,
            loanProudIntId: loanProudIntId,
            rateSource: LOAN_INTEREST_RATE_ID ? 'Existing LoanInterestRate' : 'Auto-created with product',
            createdWithProduct: !LOAN_INTEREST_RATE_ID
          }
        }
      }, { 
        transaction
      });

      console.log(`✅ LoanProduct created successfully with ID: ${loanProduct.id}`);

      // STEP 5: CREATE PRODUCT TYPE MAPPING - CORRECTED VERSION
      console.log(`📝 Creating product_type_mapping for PROD_ID: ${loanProduct.PROD_ID}`);

      // Use exact field names that match your model/table
      const productTypeMappingData = {
          p_r_o_d__i_d: loanProduct.PROD_ID, // Note: double underscores
          product_type: (PRODUCT_TYPE || 'BUSINESS_LOAN').toUpperCase().trim(),
          product_name: name,
          p_r_o_d__d_e_s_c: description || '',
          p_r_o_d__c_d: productCode,
          account_prefix: (account_prefix || 'BL').trim(),
          gl_accounts: JSON.stringify({
              loanGLAccount: defaultGLAccounts.loanGLAccount,
              principalGLAccountNo: defaultGLAccounts.principalGLAccountNo || defaultGLAccounts.loanGLAccount,
              interestGLAccountNo: defaultGLAccounts.interestGLAccountNo || defaultGLAccounts.loanGLAccount,
              ...defaultGLAccounts
          }),
          l_o_a_n__i_n_t_e_r_e_s_t__r_a_t_e__i_d: loanInterestRateId,
          l_o_a_n__p_r_o_u_d__i_n_t__i_d: loanProudIntId,
          p_r_o_d_u_c_t__s_h_o_r_t__n_a_m_e: (PRODUCT_SHORT_NAME || productCode).toUpperCase(),
          product_code: productCode,
          created_at: new Date(),
          updated_at: new Date()
      };

      // LOG FINAL DATA
      console.log('📦 Final ProductTypeMapping data:', JSON.stringify(productTypeMappingData, null, 2));

      // Validate critical fields
      const validationErrors = [];

      // Check product_type
      if (!productTypeMappingData.product_type) {
          validationErrors.push('product_type is required');
      } else if (!/^[A-Z_]+$/.test(productTypeMappingData.product_type)) {
          validationErrors.push('product_type must be uppercase with underscores (e.g., BUSINESS_LOAN)');
      }

      // Check account_prefix
      if (!productTypeMappingData.account_prefix) {
          validationErrors.push('account_prefix is required');
      } else if (productTypeMappingData.account_prefix.length < 2) {
          validationErrors.push('account_prefix must be at least 2 characters');
      }

      // Check p_r_o_d__i_d
      if (!productTypeMappingData.p_r_o_d__i_d) {
          validationErrors.push('PROD_ID is required');
      }

      if (validationErrors.length > 0) {
          throw new Error(`ProductTypeMapping validation failed: ${validationErrors.join(', ')}`);
      }

      // Try to create using the model
      let productMapping;
      try {
          productMapping = await ProductTypeMapping.create(productTypeMappingData, { 
              transaction 
          });
          console.log('✅ ProductTypeMapping created successfully with ID:', productMapping.id);
      } catch (modelError) {
          console.error('❌ Model creation failed:', modelError.message);
          
          // If model fails, try direct SQL as fallback
          console.log('🔄 Trying direct SQL insertion...');
          
          // Prepare SQL values - handle potential NULL values
          const replacements = [
              productTypeMappingData.p_r_o_d__i_d,
              productTypeMappingData.product_type,
              productTypeMappingData.product_name,
              productTypeMappingData.p_r_o_d__d_e_s_c || '',
              productTypeMappingData.p_r_o_d__c_d || productCode,
              productTypeMappingData.account_prefix,
              productTypeMappingData.gl_accounts,
              productTypeMappingData.l_o_a_n__i_n_t_e_r_e_s_t__r_a_t_e__i_d,
              productTypeMappingData.l_o_a_n__p_r_o_u_d__i_n_t__i_d,
              productTypeMappingData.p_r_o_d_u_c_t__s_h_o_r_t__n_a_m_e || productCode,
              productTypeMappingData.product_code || productCode,
              productTypeMappingData.created_at,
              productTypeMappingData.updated_at
          ];
          
          await sequelize.query(
              `INSERT INTO product_type_mapping (
                  p_r_o_d__i_d, product_type, product_name, p_r_o_d__d_e_s_c, 
                  p_r_o_d__c_d, account_prefix, gl_accounts, 
                  l_o_a_n__i_n_t_e_r_e_s_t__r_a_t_e__i_d, l_o_a_n__p_r_o_u_d__i_n_t__i_d,
                  p_r_o_d_u_c_t__s_h_o_r_t__n_a_m_e, product_code, created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              {
                  replacements: replacements,
                  transaction
              }
          );
          
          // Verify the record was created
          const [results] = await sequelize.query(
              `SELECT id FROM product_type_mapping WHERE p_r_o_d__i_d = ?`,
              {
                  replacements: [productTypeMappingData.p_r_o_d__i_d],
                  transaction,
                  type: sequelize.QueryTypes.SELECT
              }
          );
          
          if (results && results.id) {
              console.log('✅ ProductTypeMapping created via direct SQL with ID:', results.id);
              productMapping = { id: results.id };
          } else {
              throw new Error('Failed to verify ProductTypeMapping creation');
          }
      }

      // STEP 6: AUDIT TRAIL
      console.log('📝 Creating audit trail entry');
      
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: createdBy,
        event_type: 'CREATE',
        action: 'CREATE_LOAN_PRODUCT',
        old_value: null,
        new_value: JSON.stringify({
          productCode,
          name,
          PRODUCT_TYPE: PRODUCT_TYPE.toUpperCase(),
          PRODUCT_SHORT_NAME: PRODUCT_SHORT_NAME?.toUpperCase(),
          LOAN_INTEREST_RATE_ID: loanInterestRateId,
          LOAN_PROUD_INT_ID: loanProudIntId,
          BU_ID: validatedBranchCodes,
          isGlobalProduct: isGlobal,
          termConfiguration: {
            termType,
            minValue: minTermValue,
            maxValue: maxTermValue
          },
          interestRateReference: {
            id: interestRateRecord.id,
            name: interestRateRecord.name,
            rateType: interestRateRecord.RATE_TYPE,
            minRate: parseFloat(interestRateRecord.MIN_RATE_PER_MONTH || '0'),
            maxRate: parseFloat(interestRateRecord.MAX_RATE_PER_MONTH || '0'),
            defaultRate: parseFloat(interestRateRecord.DEFAULT_RATE_PER_MONTH || '0'),
            loanProudIntId: interestRateRecord.LOAN_PROUD_INT_ID
          },
          interestRateSource: LOAN_INTEREST_RATE_ID ? 'Existing' : 'Auto-created',
          totalBranches: allActiveBranches.length,
          hasWildcard,
          productMappingId: productMapping.id
        }),
        ip_address: getClientIp(req),
        entity_id: loanProduct.id,
        entity_type: 'LoanProduct',
        status: 'SUCCESS',
        description: `Created loan product: ${name} (${productCode})`,
        timestamp: new Date()
      };
      
      await AuditTrail.create(auditTrailData, { transaction });

      // STEP 7: COMMIT TRANSACTION
      console.log('💾 Committing transaction...');
      await transaction.commit();
      console.log('🎉 Transaction COMMITTED successfully!');

      // STEP 8: SEND RESPONSE
      res.status(201).json({
        success: true,
        message: `Loan product created successfully for ${isGlobal ? 'all branches' : `${accessibleBranches.length} branches`}`,
        data: {
          PROD_ID: loanProduct.PROD_ID,
          productCode,
          name,
          PRODUCT_TYPE: PRODUCT_TYPE.toUpperCase(),
          PRODUCT_SHORT_NAME: PRODUCT_SHORT_NAME?.toUpperCase(),
          termInfo: {
            minValue: minTermValue,
            maxValue: maxTermValue,
            type: termType,
            formattedRange: `${minTermValue}-${maxTermValue} ${termType}`
          },
          amountRange: {
            minAmount: parseFloat(minAmount),
            maxAmount: parseFloat(maxAmount),
            currency: CRNCY_ID
          },
          interestRate: {
            id: interestRateRecord.id,
            name: interestRateRecord.name,
            minRatePerMonth: parseFloat(interestRateRecord.MIN_RATE_PER_MONTH || '0'),
            maxRatePerMonth: parseFloat(interestRateRecord.MAX_RATE_PER_MONTH || '0'),
            defaultRatePerMonth: parseFloat(interestRateRecord.DEFAULT_RATE_PER_MONTH || '0'),
            rateType: interestRateRecord.RATE_TYPE,
            interestType: interestRateRecord.INTEREST_TYPE,
            loanProudIntId: interestRateRecord.LOAN_PROUD_INT_ID,
            source: LOAN_INTEREST_RATE_ID ? 'Existing' : 'Auto-created'
          },
          branchConfiguration: {
            BU_ID: accessibleBranches,
            isGlobalProduct: isGlobal,
            totalBranches: allActiveBranches.length,
            hasWildcard
          },
          productMapping: {
            id: productMapping.id,
            product_type: productTypeMappingData.product_type,
            account_prefix: productTypeMappingData.account_prefix
          },
          createdBy,
          createdAt: new Date().toISOString()
        }
      });
      
      console.log('📤 Response sent to client');

    } catch (error) {
      console.error('❌ Product creation failed:', error.message);
      console.error('Error stack:', error.stack);
      
      if (transaction && !transaction.finished) {
        await transaction.rollback();
        console.log('↩️ Transaction ROLLED BACK due to error');
      }
      
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create loan product',
        errorDetails: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        debug: {
          receivedProductType: PRODUCT_TYPE,
          receivedAccountPrefix: account_prefix
        }
      });
    }
  }),

  // Test product creation without associations
  testCreateSimple: asyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();
    
    try {
      const {
        name = 'Test Loan Product',
        productCode = 'TEST001'
      } = req.body;
      
      // Create a test interest rate first
      const testInterestRate = await LoanInterestRate.create({
        name: 'Test Interest Rate',
        code: 'TEST_RATE_001',
        description: 'Test interest rate',
        RATE_TYPE: 'FIXED',
        INTEREST_TYPE: 'SIMPLE',
        CALCULATION_METHOD: 'FLAT',
        MIN_RATE_PER_MONTH: 5.0,
        MAX_RATE_PER_MONTH: 5.0,
        DEFAULT_RATE_PER_MONTH: 5.0,
        STATUS: 'ACTIVE',
        createdBy: 'test'
      }, { transaction });
      
      // Create simple product
      const loanProduct = await LoanProduct.create({
        name,
        productCode,
        PROD_ID: Math.floor(Math.random() * 10000),
        LOAN_INTEREST_RATE_ID: testInterestRate.id,
        LOAN_PROUD_INT_ID: testInterestRate.LOAN_PROUD_INT_ID,
        minAmount: 100000,
        maxAmount: 5000000,
        MIN_LOAN_TERM_VALUE: 1,
        MAX_LOAN_TERM_VALUE: 12,
        LOAN_TERM_TYPE: 'MONTHS',
        BU_ID: ['001'],
        isGlobalProduct: false,
        STATUS: 'ACTIVE',
        createdBy: 'test'
      }, { transaction });
      
      await transaction.commit();
      
      res.json({
        success: true,
        message: 'Test product created successfully',
        data: loanProduct
      });
      
    } catch (error) {
      await transaction.rollback();
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }),

  // CALCULATE LOAN REPAYMENT - USING MODEL METHOD
  calculateLoanRepayment: asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const {
      principal,
      termValue,
      termType,
      useDefaultRate = true,
      customRate = null,
      generateSchedule = true,
      startDate = null
    } = req.body;
    
    if (!principal || !termValue || !termType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: principal, termValue, termType'
      });
    }
    
    // Find product
    const product = await LoanProduct.findOne({
      where: {
        [Op.or]: [
          { PROD_ID: productId },
          { productCode: productId },
          { id: productId }
        ],
        STATUS: 'ACTIVE'
      }
    });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Active loan product not found'
      });
    }
    
    try {
      // Check if the model has the calculateLoanRepayment method
      if (typeof product.calculateLoanRepayment === 'function') {
        // Use the model's calculateLoanRepayment method
        const calculation = await product.calculateLoanRepayment({
          principal: parseFloat(principal),
          termValue: parseInt(termValue),
          termType: termType,
          useDefaultRate,
          customRate: customRate ? parseFloat(customRate) : null,
          generateSchedule,
          startDate
        });
        
        res.json({
          success: true,
          message: 'Loan repayment calculated successfully',
          data: calculation
        });
      } else {
        // Fallback to manual calculation if model method doesn't exist
        const calculation = await this._manualCalculateLoanRepayment(
          product, 
          parseFloat(principal), 
          parseInt(termValue), 
          termType, 
          useDefaultRate, 
          customRate, 
          generateSchedule, 
          startDate
        );
        
        res.json({
          success: true,
          message: 'Loan repayment calculated successfully (using fallback method)',
          data: calculation
        });
      }
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to calculate loan repayment'
      });
    }
  }),

  // VALIDATE LOAN APPLICATION - USING MODEL METHOD
  validateLoanApplication: asyncHandler(async (req, res) => {
    const { productId, amount, termValue, termType, requestedRate } = req.body;
    
    if (!productId || !amount || !termValue || !termType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: productId, amount, termValue, termType'
      });
    }
    
    // Find product
    const product = await LoanProduct.findOne({
      where: {
        [Op.or]: [
          { PROD_ID: productId },
          { productCode: productId },
          { id: productId }
        ],
        STATUS: 'ACTIVE'
      }
    });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Active loan product not found'
      });
    }
    
    try {
      // Check if the model has the validateLoanApplication method
      if (typeof product.validateLoanApplication === 'function') {
        // Use the model's validateLoanApplication method
        const validation = await product.validateLoanApplication(
          parseFloat(amount),
          parseInt(termValue),
          termType,
          requestedRate ? parseFloat(requestedRate) : null
        );
        
        res.json({
          success: true,
          message: validation.isValid ? 'Loan application is valid' : 'Loan application validation failed',
          data: {
            product: {
              id: product.PROD_ID,
              name: product.name,
              productCode: product.productCode,
              productType: product.PRODUCT_TYPE
            },
            validation
          }
        });
      } else {
        // Fallback to manual validation
        const validation = this._manualValidateLoanApplication(
          product,
          parseFloat(amount),
          parseInt(termValue),
          termType,
          requestedRate
        );
        
        res.json({
          success: true,
          message: validation.isValid ? 'Loan application is valid' : 'Loan application validation failed',
          data: {
            product: {
              id: product.PROD_ID,
              name: product.name,
              productCode: product.productCode,
              productType: product.PRODUCT_TYPE
            },
            validation
          }
        });
      }
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to validate loan application'
      });
    }
  }),

  // CALCULATE INTEREST FOR PERIOD - USING MODEL METHOD
  calculateInterestForPeriod: asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const {
      principal,
      startDate,
      endDate,
      useDefaultRate = true,
      customRate = null
    } = req.body;
    
    if (!principal || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: principal, startDate, endDate'
      });
    }
    
    // Find product
    const product = await LoanProduct.findOne({
      where: {
        [Op.or]: [
          { PROD_ID: productId },
          { productCode: productId },
          { id: productId }
        ],
        STATUS: 'ACTIVE'
      }
    });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Active loan product not found'
      });
    }
    
    try {
      // Check if the model has the calculateInterestForPeriod method
      if (typeof product.calculateInterestForPeriod === 'function') {
        // Use the model's calculateInterestForPeriod method
        const calculation = await product.calculateInterestForPeriod({
          principal: parseFloat(principal),
          startDate,
          endDate,
          useDefaultRate,
          customRate: customRate ? parseFloat(customRate) : null
        });
        
        res.json({
          success: true,
          message: 'Interest calculated successfully',
          data: {
            product: {
              id: product.PROD_ID,
              name: product.name
            },
            calculation
          }
        });
      } else {
        // Fallback to manual calculation
        const calculation = this._manualCalculateInterestForPeriod(
          product,
          parseFloat(principal),
          startDate,
          endDate,
          useDefaultRate,
          customRate
        );
        
        res.json({
          success: true,
          message: 'Interest calculated successfully (using fallback method)',
          data: {
            product: {
              id: product.PROD_ID,
              name: product.name
            },
            calculation
          }
        });
      }
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to calculate interest'
      });
    }
  }),

  // COMPARE INTEREST RATES - USING STATIC MODEL METHOD
  compareInterestRates: asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const { principal, termValue, termType, ratesToCompare = [] } = req.body;
    
    if (!principal || !termValue || !termType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: principal, termValue, termType'
      });
    }
    
    // Find product with interest rate
    const product = await LoanProduct.findOne({
      where: {
        [Op.or]: [
          { PROD_ID: productId },
          { productCode: productId },
          { id: productId }
        ],
        STATUS: 'ACTIVE'
      }
    });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Active loan product not found'
      });
    }
    
    // Get interest rate details
    const interestRate = product.LOAN_INTEREST_RATE_ID ? 
      await LoanInterestRate.findByPk(product.LOAN_INTEREST_RATE_ID) : null;
    
    if (!interestRate) {
      return res.status(400).json({
        success: false,
        message: 'Product does not have a valid interest rate reference'
      });
    }
    
    // Convert term to months
    const termInMonths = convertTermToMonths(parseInt(termValue), termType);
    
    // Prepare rates to compare
    const rates = [
      {
        name: 'Minimum Rate',
        rate: parseFloat(interestRate.MIN_RATE_PER_MONTH || '0'),
        type: 'MINIMUM'
      },
      {
        name: 'Default Rate',
        rate: parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0'),
        type: 'DEFAULT'
      },
      {
        name: 'Maximum Rate',
        rate: parseFloat(interestRate.MAX_RATE_PER_MONTH || '0'),
        type: 'MAXIMUM'
      },
      ...ratesToCompare.map((rate, index) => ({
        name: `Custom Rate ${index + 1}`,
        rate: parseFloat(rate),
        type: 'CUSTOM'
      }))
    ];
    
    // Manual comparison calculation
    const comparisons = rates.map(rate => {
      const monthlyRate = rate.rate / 100;
      const totalInterest = parseFloat(principal) * monthlyRate * termInMonths;
      const monthlyPayment = (parseFloat(principal) + totalInterest) / termInMonths;
      
      return {
        ...rate,
        principal: parseFloat(principal),
        termInMonths,
        monthlyPayment: parseFloat(monthlyPayment.toFixed(2)),
        totalInterest: parseFloat(totalInterest.toFixed(2)),
        totalPayment: parseFloat((parseFloat(principal) + totalInterest).toFixed(2)),
        interestToPrincipalRatio: parseFloat((totalInterest / parseFloat(principal) * 100).toFixed(2))
      };
    });
    
    res.json({
      success: true,
      message: 'Interest rates compared successfully',
      data: {
        product: {
          id: product.PROD_ID,
          name: product.name,
          interestRateName: interestRate.name
        },
        loanDetails: {
          principal: parseFloat(principal),
          term: {
            value: parseInt(termValue),
            type: termType,
            inMonths: termInMonths
          }
        },
        rateRange: {
          min: parseFloat(interestRate.MIN_RATE_PER_MONTH || '0'),
          default: parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0'),
          max: parseFloat(interestRate.MAX_RATE_PER_MONTH || '0'),
          spread: parseFloat(interestRate.MAX_RATE_PER_MONTH || '0') - parseFloat(interestRate.MIN_RATE_PER_MONTH || '0')
        },
        comparisons: comparisons,
        summary: {
          bestRate: Math.min(...rates.map(r => r.rate)),
          worstRate: Math.max(...rates.map(r => r.rate)),
          averageRate: rates.reduce((sum, r) => sum + r.rate, 0) / rates.length,
          recommendedRate: parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0')
        }
      }
    });
  }),

  // SIMULATE RATE CHANGE - USING MODEL METHODS
  simulateRateChange: asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const {
      principal,
      currentTerm,
      remainingTerm,
      currentRate,
      newRate,
      changeDate
    } = req.body;
    
    if (!principal || !currentTerm || !remainingTerm || !currentRate || !newRate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: principal, currentTerm, remainingTerm, currentRate, newRate'
      });
    }
    
    // Find product
    const product = await LoanProduct.findOne({
      where: {
        [Op.or]: [
          { PROD_ID: productId },
          { productCode: productId },
          { id: productId }
        ],
        STATUS: 'ACTIVE'
      }
    });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Active loan product not found'
      });
    }
    
    const principalNum = parseFloat(principal);
    const currentTermNum = parseInt(currentTerm);
    const remainingTermNum = parseInt(remainingTerm);
    const currentRateNum = parseFloat(currentRate);
    const newRateNum = parseFloat(newRate);
   
    // Validate new rate is within product's allowed range if we have interest rate reference
    if (product.LOAN_INTEREST_RATE_ID) {
      const interestRate = await LoanInterestRate.findByPk(product.LOAN_INTEREST_RATE_ID);
      if (interestRate) {
        const minRate = parseFloat(interestRate.MIN_RATE_PER_MONTH || '0');
        const maxRate = parseFloat(interestRate.MAX_RATE_PER_MONTH || '100');
       
        if (newRateNum < minRate || newRateNum > maxRate) {
          return res.status(400).json({
            success: false,
            message: `New rate ${newRateNum}% is outside product's allowed range (${minRate}% - ${maxRate}%)`
          });
        }
      }
    }
    
    // Calculate current scenario
    const currentMonthlyRate = currentRateNum / 100;
    const currentTotalInterest = principalNum * currentMonthlyRate * currentTermNum;
    const currentMonthlyPayment = (principalNum + currentTotalInterest) / currentTermNum;
   
    // Calculate paid portion
    const paidTerm = currentTermNum - remainingTermNum;
    const paidInterest = principalNum * currentMonthlyRate * paidTerm;
    const paidPrincipal = (currentMonthlyPayment * paidTerm) - paidInterest;
    const remainingPrincipal = principalNum - paidPrincipal;
   
    // Calculate new scenario
    const newMonthlyRate = newRateNum / 100;
    const newRemainingInterest = remainingPrincipal * newMonthlyRate * remainingTermNum;
    const newMonthlyPayment = (remainingPrincipal + newRemainingInterest) / remainingTermNum;
   
    // Calculate impact
    const monthlyPaymentChange = newMonthlyPayment - currentMonthlyPayment;
    const totalInterestChange = (paidInterest + newRemainingInterest) - currentTotalInterest;
    const percentChange = ((newRateNum - currentRateNum) / currentRateNum) * 100;
    
    res.json({
      success: true,
      message: 'Rate change simulation completed',
      data: {
        product: {
          id: product.PROD_ID,
          name: product.name
        },
        currentScenario: {
          originalPrincipal: principalNum,
          originalTerm: currentTermNum,
          originalRate: currentRateNum,
          originalMonthlyPayment: parseFloat(currentMonthlyPayment.toFixed(2)),
          originalTotalInterest: parseFloat(currentTotalInterest.toFixed(2)),
          originalTotalPayment: parseFloat((principalNum + currentTotalInterest).toFixed(2))
        },
        progress: {
          monthsPaid: paidTerm,
          monthsRemaining: remainingTermNum,
          percentComplete: parseFloat(((paidTerm / currentTermNum) * 100).toFixed(2)),
          principalPaid: parseFloat(paidPrincipal.toFixed(2)),
          principalRemaining: parseFloat(remainingPrincipal.toFixed(2)),
          interestPaid: parseFloat(paidInterest.toFixed(2))
        },
        newScenario: {
          newRate: newRateNum,
          changeDate: changeDate || new Date().toISOString().split('T')[0],
          newMonthlyPayment: parseFloat(newMonthlyPayment.toFixed(2)),
          newRemainingInterest: parseFloat(newRemainingInterest.toFixed(2)),
          newTotalPayment: parseFloat((remainingPrincipal + newRemainingInterest).toFixed(2))
        },
        impact: {
          monthlyPaymentChange: parseFloat(monthlyPaymentChange.toFixed(2)),
          percentMonthlyChange: parseFloat(((monthlyPaymentChange / currentMonthlyPayment) * 100).toFixed(2)),
          totalInterestChange: parseFloat(totalInterestChange.toFixed(2)),
          percentInterestChange: parseFloat(((totalInterestChange / currentTotalInterest) * 100).toFixed(2)),
          rateChangePercentage: parseFloat(percentChange.toFixed(2)),
          breakEvenPoint: monthlyPaymentChange > 0 ?
            `Payment increases by $${Math.abs(monthlyPaymentChange).toFixed(2)} per month` :
            `Payment decreases by $${Math.abs(monthlyPaymentChange).toFixed(2)} per month`
        },
        recommendation: monthlyPaymentChange > 0 ?
          'Rate increase will raise monthly payments' :
          'Rate decrease will lower monthly payments'
      }
    });
  }),

  // GET PRODUCT WITH INTEREST RATE DETAILS
getProduct: asyncHandler(async (req, res) => {
    const { id, shortName } = req.params;
    let product;
    
    // Helper function to parse product ID
    const parseProductId = (id) => {
      const parsedId = parseInt(id, 10);
      if (!isNaN(parsedId)) {
        return { type: 'PROD_ID', value: parsedId };
      }
     
      if (/^[0-9a-fA-F]{24}$/.test(id)) {
        return { type: '_id', value: id };
      }
     
      return { type: 'product_code', value: id }; // Changed from 'productCode'
    };
    
    if (shortName) {
      // Find by PRODUCT_SHORT_NAME (use correct field name)
      product = await LoanProduct.findOne({
        where: {
          p_r_o_d_u_c_t__s_h_o_r_t__n_a_m_e: shortName.toUpperCase(), // Changed field name
          s_t_a_t_u_s: 'ACTIVE' // Changed from STATUS
        }
      });
    } else {
      // Parse the ID to determine what type it is
      const parsedId = parseProductId(id);
      let whereClause;
      
      switch (parsedId.type) {
        case 'PROD_ID':
          whereClause = { p_r_o_d__i_d: parsedId.value, s_t_a_t_u_s: 'ACTIVE' }; // Changed field names
          break;
        case '_id':
          whereClause = { id: parsedId.value, s_t_a_t_u_s: 'ACTIVE' }; // Changed from STATUS
          break;
        case 'product_code':
          whereClause = { product_code: parsedId.value, s_t_a_t_u_s: 'ACTIVE' }; // Changed field names
          break;
      }
     
      product = await LoanProduct.findOne({
        where: whereClause
      });
    }
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Active loan product not found'
      });
    }
    
    // Get interest rate details - use correct field name
    const interestRate = product.l_o_a_n__i_n_t_e_r_e_s_t__r_a_t_e__i_d ? 
      await LoanInterestRate.findByPk(product.l_o_a_n__i_n_t_e_r_e_s_t__r_a_t_e__i_d) : null;
    
    // Get branch details
    const branchDetails = [];
    for (const branchCode of product.b_u__i_d) { // Changed from BU_ID
      if (branchCode === '*') {
        branchDetails.push({
          branchCode: '*',
          branchName: 'All Branches',
          branchType: 'GLOBAL'
        });
      } else {
        const branch = await Branch.findOne({ where: { branchCode } });
        if (branch) {
          branchDetails.push({
            branchCode: branch.branchCode,
            branchName: branch.branchName,
            branchType: branch.branchType,
            organizationName: branch.organizationName
          });
        }
      }
    }
    
    // Combine product and interest rate data
    const responseData = {
      ...product.toJSON(),
      branchDetails,
      interestRate: interestRate ? {
        id: interestRate.id,
        name: interestRate.name,
        description: interestRate.description,
        RATE_TYPE: interestRate.RATE_TYPE,
        INTEREST_TYPE: interestRate.INTEREST_TYPE,
        CALCULATION_METHOD: interestRate.CALCULATION_METHOD,
        MIN_RATE_PER_MONTH: parseFloat(interestRate.MIN_RATE_PER_MONTH || '0'),
        MAX_RATE_PER_MONTH: parseFloat(interestRate.MAX_RATE_PER_MONTH || '0'),
        DEFAULT_RATE_PER_MONTH: parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0'),
        LOAN_PROUD_INT_ID: interestRate.LOAN_PROUD_INT_ID
      } : null
    };
    
    res.json({
      success: true,
      data: responseData
    });
  }),

  // UPDATE LOAN PRODUCT
  updateLoanProduct: asyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      // Helper function to parse product ID
      const parseProductId = (id) => {
        const parsedId = parseInt(id, 10);
        if (!isNaN(parsedId)) {
          return { type: 'PROD_ID', value: parsedId };
        }
        if (/^[0-9a-fA-F]{24}$/.test(id)) {
          return { type: '_id', value: id };
        }
        return { type: 'productCode', value: id };
      };
      
      const parsedId = parseProductId(id);
     
      let whereClause;
      switch (parsedId.type) {
        case 'PROD_ID':
          whereClause = { PROD_ID: parsedId.value };
          break;
        case '_id':
          whereClause = { id: parsedId.value };
          break;
        case 'productCode':
          whereClause = { productCode: parsedId.value };
          break;
      }
      
      const product = await LoanProduct.findOne({
        where: whereClause,
        transaction
      });
      
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Loan product not found'
        });
      }
      
      // Store old values for audit trail
      const oldValues = {
        name: product.name,
        productCode: product.productCode,
        LOAN_INTEREST_RATE_ID: product.LOAN_INTEREST_RATE_ID,
        LOAN_PROUD_INT_ID: product.LOAN_PROUD_INT_ID,
        isActive: product.isActive,
        minAmount: parseFloat(product.minAmount),
        maxAmount: parseFloat(product.maxAmount),
        MIN_LOAN_TERM_VALUE: product.MIN_LOAN_TERM_VALUE,
        MAX_LOAN_TERM_VALUE: product.MAX_LOAN_TERM_VALUE,
        LOAN_TERM_TYPE: product.LOAN_TERM_TYPE,
        BU_ID: product.BU_ID,
        STATUS: product.STATUS
      };
      
      // If updating LOAN_INTEREST_RATE_ID, validate the new reference
      if (updateData.LOAN_INTEREST_RATE_ID) {
        const newInterestRate = await LoanInterestRate.findByPk(updateData.LOAN_INTEREST_RATE_ID, { transaction });
        if (!newInterestRate) {
          throw new Error(`Loan interest rate with ID ${updateData.LOAN_INTEREST_RATE_ID} not found`);
        }
        // Also update LOAN_PROUD_INT_ID to keep them in sync
        updateData.LOAN_PROUD_INT_ID = newInterestRate.LOAN_PROUD_INT_ID;
      }
      
      // Handle term updates
      if (updateData.LOAN_TERM_TYPE || updateData.MIN_LOAN_TERM_VALUE || updateData.MAX_LOAN_TERM_VALUE) {
        const termType = updateData.LOAN_TERM_TYPE || product.LOAN_TERM_TYPE || 'MONTHS';
        const minTerm = updateData.MIN_LOAN_TERM_VALUE || product.MIN_LOAN_TERM_VALUE || product.minTerm || 1;
        const maxTerm = updateData.MAX_LOAN_TERM_VALUE || product.MAX_LOAN_TERM_VALUE || product.maxTerm || 60;
       
        // Convert to months for backward compatibility
        const minMonths = convertTermToMonths(minTerm, termType);
        const maxMonths = convertTermToMonths(maxTerm, termType);
       
        updateData.MIN_LOAN_TERM_MONTHS = minMonths;
        updateData.MAX_LOAN_TERM_MONTHS = maxMonths;
      }
      
      // Handle BU_ID updates
      if (updateData.BU_ID) {
        let branchCodes = Array.isArray(updateData.BU_ID) ? updateData.BU_ID.map(String) :
                         typeof updateData.BU_ID === 'string' ? updateData.BU_ID.split(',').map(String) :
                         [String(updateData.BU_ID)];
       
        branchCodes = branchCodes.map(code => code.trim()).filter(Boolean);
        branchCodes = [...new Set(branchCodes)];
        
        // Validate branch codes
        const { validCodes, invalidCodes } = await validateBranchCodes(branchCodes, transaction);
       
        if (invalidCodes.length > 0) {
          throw new Error(`Invalid branch codes: ${invalidCodes.join(', ')}. Please use valid 3-digit branch codes.`);
        }
        
        updateData.BU_ID = branchCodes;
        updateData.isGlobalProduct = branchCodes.includes('*');
        updateData.visibility = branchCodes.includes('*') ? 'GLOBAL' : 'SELECTED_BUS';
      }
      
      // Handle decimal conversions
      const decimalFields = [
        'minAmount', 'maxAmount', 'processingFeeRate',
        'lateFeePerDay', 'maxLateFee'
      ];
      decimalFields.forEach(field => {
        if (updateData[field] !== undefined) {
          updateData[field] = toDecimal(updateData[field], field);
        }
      });
      
      // Handle fee structure updates
      if (updateData.feeStructure && Array.isArray(updateData.feeStructure)) {
        updateData.feeStructure = updateData.feeStructure.map(fee => ({
          ...fee,
          amount: toDecimal(fee.amount, 'fee amount')
        }));
      }
      
      // Update product
      await LoanProduct.update(updateData, {
        where: whereClause,
        transaction
      });
      
      const updatedProduct = await LoanProduct.findOne({
        where: whereClause,
        transaction
      });
      
      // Update ProductTypeMapping if needed
      if (updateData.BU_ID || updateData.PRODUCT_SHORT_NAME || updateData.LOAN_INTEREST_RATE_ID) {
        const mappingUpdate = {};
       
        if (updateData.BU_ID) {
          mappingUpdate.BU_ID = updateData.BU_ID;
          mappingUpdate.isGlobalProduct = updateData.isGlobalProduct;
          mappingUpdate.visibility = updateData.visibility;
        }
       
        if (updateData.PRODUCT_SHORT_NAME) {
          mappingUpdate.PRODUCT_SHORT_NAME = updateData.PRODUCT_SHORT_NAME;
        }
       
        if (updateData.LOAN_INTEREST_RATE_ID) {
          mappingUpdate.LOAN_INTEREST_RATE_ID = updateData.LOAN_INTEREST_RATE_ID;
        }
       
        await ProductTypeMapping.update(
          mappingUpdate,
          {
            where: { PROD_ID: product.PROD_ID },
            transaction
          }
        );
      }
      
      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        event_type: 'UPDATE',
        action: 'UPDATE_LOAN_PRODUCT',
        old_value: oldValues,
        new_value: {
          name: updatedProduct.name,
          productCode: updatedProduct.productCode,
          LOAN_INTEREST_RATE_ID: updatedProduct.LOAN_INTEREST_RATE_ID,
          LOAN_PROUD_INT_ID: updatedProduct.LOAN_PROUD_INT_ID,
          isActive: updatedProduct.isActive,
          minAmount: parseFloat(updatedProduct.minAmount),
          maxAmount: parseFloat(updatedProduct.maxAmount),
          MIN_LOAN_TERM_VALUE: updatedProduct.MIN_LOAN_TERM_VALUE,
          MAX_LOAN_TERM_VALUE: updatedProduct.MAX_LOAN_TERM_VALUE,
          LOAN_TERM_TYPE: updatedProduct.LOAN_TERM_TYPE,
          BU_ID: updatedProduct.BU_ID,
          STATUS: updatedProduct.STATUS,
          updatedFields: Object.keys(updateData)
        },
        ip_address: getClientIp(req),
        entity_id: updatedProduct.id,
        entity_type: 'LoanProduct',
        status: 'SUCCESS',
        description: `Updated loan product: ${updatedProduct.name}`,
        timestamp: new Date()
      };
      
      await AuditTrail.create(auditTrailData, { transaction });
      
      await transaction.commit();
      
      res.json({
        success: true,
        message: 'Loan product updated successfully',
        data: updatedProduct.toJSON()
      });
    } catch (error) {
      await transaction.rollback();
      logger.error('Product update failed:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update loan product'
      });
    }
  }),

  // DELETE LOAN PRODUCT (Soft Delete)
  deleteLoanProduct: asyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      
      // Helper function to parse product ID
      const parseProductId = (id) => {
        const parsedId = parseInt(id, 10);
        if (!isNaN(parsedId)) {
          return { type: 'PROD_ID', value: parsedId };
        }
        if (/^[0-9a-fA-F]{24}$/.test(id)) {
          return { type: '_id', value: id };
        }
        return { type: 'productCode', value: id };
      };
      
      const parsedId = parseProductId(id);
     
      let whereClause;
      switch (parsedId.type) {
        case 'PROD_ID':
          whereClause = { PROD_ID: parsedId.value };
          break;
        case '_id':
          whereClause = { id: parsedId.value };
          break;
        case 'productCode':
          whereClause = { productCode: parsedId.value };
          break;
      }
      
      const product = await LoanProduct.findOne({
        where: whereClause,
        transaction
      });
      
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: 'Loan product not found'
        });
      }
      
      // Store old values for audit trail
      const oldValues = {
        name: product.name,
        productCode: product.productCode,
        PRODUCT_TYPE: product.PRODUCT_TYPE,
        LOAN_INTEREST_RATE_ID: product.LOAN_INTEREST_RATE_ID,
        LOAN_PROUD_INT_ID: product.LOAN_PROUD_INT_ID,
        BU_ID: product.BU_ID,
        STATUS: 'ACTIVE'
      };
      
      // Soft delete - update status to INACTIVE
      await LoanProduct.update({
        STATUS: 'INACTIVE',
        isActive: false
      }, {
        where: whereClause,
        transaction
      });
      
      // Also update ProductTypeMapping
      await ProductTypeMapping.update({
        STATUS: 'INACTIVE',
        isActive: false
      }, {
        where: { PROD_ID: product.PROD_ID },
        transaction
      });
      
      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        event_type: 'DELETE',
        action: 'DEACTIVATE_LOAN_PRODUCT',
        old_value: oldValues,
        new_value: {
          name: product.name,
          productCode: product.productCode,
          STATUS: 'INACTIVE'
        },
        ip_address: getClientIp(req),
        entity_id: product.id,
        entity_type: 'LoanProduct',
        status: 'SUCCESS',
        description: `Deactivated loan product: ${product.name} (${product.productCode})`,
        timestamp: new Date()
      };
      
      await AuditTrail.create(auditTrailData, { transaction });
      
      await transaction.commit();
      
      res.json({
        success: true,
        message: 'Loan product deactivated successfully'
      });
    } catch (error) {
      await transaction.rollback();
      logger.error('Product deletion failed:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to deactivate loan product'
      });
    }
  }),

  // GET ALL LOAN PRODUCTS WITH INTEREST RATE INFO
  getAllLoanProducts: asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 10,
      search,
      productType,
      termType,
      isActive,
      buId,
      status = 'ACTIVE'
    } = req.query;
    
    const where = { STATUS: status };
    
    // Search filter
    if (search) {
      where[Op.or] = [
        { name: { [Op.like]: `%${search}%` } },
        { productCode: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } },
        { PRODUCT_SHORT_NAME: { [Op.like]: `%${search}%` } }
      ];
    }
    
    // Product type filter
    if (productType) {
      where.PRODUCT_TYPE = productType;
    }
    
    // Term type filter
    if (termType) {
      where.LOAN_TERM_TYPE = termType.toUpperCase();
    }
    
    // Active status filter
    if (isActive !== undefined) {
      where.isActive = isActive === 'true';
    }
    
    // Business Unit (branch code) filter
    if (buId) {
      const branch = await Branch.findOne({
        where: {
          branchCode: buId,
          status: 'ACTIVE'
        }
      });
     
      if (!branch) {
        return res.status(400).json({
          success: false,
          message: `Branch with code ${buId} not found or inactive`
        });
      }
     
      where[Op.or] = [
        { BU_ID: { [Op.contains]: [buId] } },
        { BU_ID: { [Op.contains]: ['*'] } }
      ];
    }
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    const { count, rows: products } = await LoanProduct.findAndCountAll({
      where,
      limit: limitNum,
      offset,
      order: [['createdAt', 'DESC']]
    });
    
    // Enhance products with branch details and interest rate info
    const enhancedProducts = await Promise.all(
      products.map(async (product) => {
        // Get interest rate details
        const interestRate = product.LOAN_INTEREST_RATE_ID ? 
          await LoanInterestRate.findByPk(product.LOAN_INTEREST_RATE_ID) : null;
        
        const branchDetails = [];
       
        // Get branch information for each branch code
        for (const branchCode of product.BU_ID) {
          if (branchCode === '*') {
            branchDetails.push({
              branchCode: '*',
              branchName: 'All Branches',
              branchType: 'GLOBAL'
            });
          } else {
            const branch = await Branch.findOne({ where: { branchCode } });
            if (branch) {
              branchDetails.push({
                branchCode: branch.branchCode,
                branchName: branch.branchName,
                branchType: branch.branchType,
                organizationName: branch.organizationName
              });
            }
          }
        }
       
        return {
          PROD_ID: product.PROD_ID,
          PRODUCT_NAME: product.name,
          PRODUCT_SHORT_NAME: product.PRODUCT_SHORT_NAME,
          PRODUCT_TYPE: product.PRODUCT_TYPE,
          MIN_LOAN_AMOUNT: parseFloat(product.minAmount || '0'),
          MAX_LOAN_AMOUNT: parseFloat(product.maxAmount || '0'),
          // Term Information
          LOAN_TERM_TYPE: product.LOAN_TERM_TYPE,
          MIN_LOAN_TERM_VALUE: product.MIN_LOAN_TERM_VALUE,
          MAX_LOAN_TERM_VALUE: product.MAX_LOAN_TERM_VALUE,
          TERM_RANGE: `${product.MIN_LOAN_TERM_VALUE || 1}-${product.MAX_LOAN_TERM_VALUE || 60} ${product.LOAN_TERM_TYPE || 'MONTHS'}`,
          // Interest Rate Information
          HAS_INTEREST_RATE_REFERENCE: !!interestRate,
          INTEREST_RATE: interestRate ? {
            id: interestRate.id,
            name: interestRate.name,
            rateType: interestRate.RATE_TYPE,
            minRate: parseFloat(interestRate.MIN_RATE_PER_MONTH || '0'),
            maxRate: parseFloat(interestRate.MAX_RATE_PER_MONTH || '0'),
            defaultRate: parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0'),
            loanProudIntId: interestRate.LOAN_PROUD_INT_ID
          } : null,
          STATUS: product.STATUS,
          BRANCHES: branchDetails,
          isGlobalProduct: product.isGlobalProduct,
          createdAt: product.createdAt,
          updatedAt: product.updatedAt
        };
      })
    );
    
    res.json({
      success: true,
      data: enhancedProducts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: count,
        pages: Math.ceil(count / limitNum)
      }
    });
  }),

  // GET PRODUCTS BY INTEREST RATE
  getProductsByInterestRate: asyncHandler(async (req, res) => {
    const { interestRateId } = req.params;
    const {
      page = 1,
      limit = 10,
      status = 'ACTIVE'
    } = req.query;
    
    // Validate interest rate exists
    const interestRate = await LoanInterestRate.findByPk(interestRateId);
    if (!interestRate) {
      return res.status(404).json({
        success: false,
        message: 'Loan interest rate not found'
      });
    }
    
    const where = {
      STATUS: status,
      LOAN_INTEREST_RATE_ID: interestRateId
    };
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    const { count, rows: products } = await LoanProduct.findAndCountAll({
      where,
      limit: limitNum,
      offset,
      order: [['createdAt', 'DESC']]
    });
    
    res.json({
      success: true,
      message: `Products using interest rate: ${interestRate.name}`,
      data: {
        interestRate: {
          id: interestRate.id,
          name: interestRate.name,
          rateType: interestRate.RATE_TYPE,
          minRate: parseFloat(interestRate.MIN_RATE_PER_MONTH || '0'),
          maxRate: parseFloat(interestRate.MAX_RATE_PER_MONTH || '0'),
          defaultRate: parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0'),
          loanProudIntId: interestRate.LOAN_PROUD_INT_ID
        },
        products: products.map(product => ({
          PROD_ID: product.PROD_ID,
          PRODUCT_NAME: product.name,
          PRODUCT_SHORT_NAME: product.PRODUCT_SHORT_NAME,
          PRODUCT_TYPE: product.PRODUCT_TYPE,
          MIN_LOAN_AMOUNT: parseFloat(product.minAmount || '0'),
          MAX_LOAN_AMOUNT: parseFloat(product.maxAmount || '0'),
          LOAN_TERM_TYPE: product.LOAN_TERM_TYPE,
          MIN_LOAN_TERM_VALUE: product.MIN_LOAN_TERM_VALUE,
          MAX_LOAN_TERM_VALUE: product.MAX_LOAN_TERM_VALUE,
          isGlobalProduct: product.isGlobalProduct,
          BU_ID: product.BU_ID,
          createdAt: product.createdAt
        })),
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count,
          pages: Math.ceil(count / limitNum)
        }
      }
    });
  }),

  // CHANGE INTEREST RATE FOR PRODUCT
  changeProductInterestRate: asyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { productId } = req.params;
      const { newInterestRateId, reason, effectiveDate } = req.body;
      
      if (!newInterestRateId || !reason) {
        throw new Error('newInterestRateId and reason are required');
      }
      
      // Validate new interest rate exists
      const newInterestRate = await LoanInterestRate.findByPk(newInterestRateId, { transaction });
      if (!newInterestRate) {
        throw new Error(`Loan interest rate with ID ${newInterestRateId} not found`);
      }
      
      // Find product
      const product = await LoanProduct.findOne({ 
        where: { PROD_ID: productId },
        transaction 
      });
      
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Loan product not found'
        });
      }
      
      // Store old interest rate
      const oldInterestRateId = product.LOAN_INTEREST_RATE_ID;
      const oldInterestRate = await LoanInterestRate.findByPk(oldInterestRateId, { transaction });
      
      // Update product with new interest rate
      await LoanProduct.update({
        LOAN_INTEREST_RATE_ID: newInterestRateId,
        LOAN_PROUD_INT_ID: newInterestRate.LOAN_PROUD_INT_ID // Update the business key too
      }, {
        where: { PROD_ID: productId },
        transaction
      });
      
      // Update ProductTypeMapping
      await ProductTypeMapping.update({
        LOAN_INTEREST_RATE_ID: newInterestRateId,
        updatedAt: new Date()
      }, {
        where: { PROD_ID: product.PROD_ID },
        transaction
      });
      
      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        event_type: 'UPDATE',
        action: 'CHANGE_PRODUCT_INTEREST_RATE',
        old_value: {
          LOAN_INTEREST_RATE_ID: oldInterestRateId,
          LOAN_PROUD_INT_ID: product.LOAN_PROUD_INT_ID,
          interestRateName: oldInterestRate?.name,
          interestRateType: oldInterestRate?.RATE_TYPE,
          minRate: oldInterestRate ? parseFloat(oldInterestRate.MIN_RATE_PER_MONTH || '0') : null,
          maxRate: oldInterestRate ? parseFloat(oldInterestRate.MAX_RATE_PER_MONTH || '0') : null,
          defaultRate: oldInterestRate ? parseFloat(oldInterestRate.DEFAULT_RATE_PER_MONTH || '0') : null
        },
        new_value: {
          LOAN_INTEREST_RATE_ID: newInterestRateId,
          LOAN_PROUD_INT_ID: newInterestRate.LOAN_PROUD_INT_ID,
          interestRateName: newInterestRate.name,
          interestRateType: newInterestRate.RATE_TYPE,
          minRate: parseFloat(newInterestRate.MIN_RATE_PER_MONTH || '0'),
          maxRate: parseFloat(newInterestRate.MAX_RATE_PER_MONTH || '0'),
          defaultRate: parseFloat(newInterestRate.DEFAULT_RATE_PER_MONTH || '0'),
          reason,
          effectiveDate: effectiveDate || new Date().toISOString()
        },
        ip_address: getClientIp(req),
        entity_id: product.id,
        entity_type: 'LoanProduct',
        status: 'SUCCESS',
        description: `Changed interest rate for product: ${product.name} from ${oldInterestRate?.name || 'N/A'} to ${newInterestRate.name}`,
        timestamp: new Date()
      };
      
      await AuditTrail.create(auditTrailData, { transaction });
      
      await transaction.commit();
      
      res.json({
        success: true,
        message: 'Product interest rate changed successfully',
        data: {
          productId: product.PROD_ID,
          productName: product.name,
          oldInterestRate: oldInterestRate ? {
            id: oldInterestRate.id,
            name: oldInterestRate.name,
            rateType: oldInterestRate.RATE_TYPE,
            loanProudIntId: product.LOAN_PROUD_INT_ID
          } : null,
          newInterestRate: {
            id: newInterestRate.id,
            name: newInterestRate.name,
            rateType: newInterestRate.RATE_TYPE,
            minRate: parseFloat(newInterestRate.MIN_RATE_PER_MONTH || '0'),
            maxRate: parseFloat(newInterestRate.MAX_RATE_PER_MONTH || '0'),
            defaultRate: parseFloat(newInterestRate.DEFAULT_RATE_PER_MONTH || '0'),
            loanProudIntId: newInterestRate.LOAN_PROUD_INT_ID
          },
          changeReason: reason,
          effectiveDate: effectiveDate || new Date().toISOString(),
          changedBy: req.user?.id || 'SYSTEM',
          changedAt: new Date()
        }
      });
    } catch (error) {
      await transaction.rollback();
      logger.error('Change product interest rate failed:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to change product interest rate'
      });
    }
  }),

  // NEW: FIND PRODUCTS BY LOAN_PROUD_INT_ID
  getProductsByLoanProudIntId: asyncHandler(async (req, res) => {
    const { loanProudIntId } = req.params;
    const {
      page = 1,
      limit = 10,
      status = 'ACTIVE'
    } = req.query;
    
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;
    
    const { count, rows: products } = await LoanProduct.findAndCountAll({
      where: {
        LOAN_PROUD_INT_ID: loanProudIntId,
        STATUS: status,
        isActive: true
      },
      limit: limitNum,
      offset,
      order: [['name', 'ASC']]
    });
    
    // Get interest rate details for each product
    const enhancedProducts = await Promise.all(
      products.map(async (product) => {
        const interestRate = product.LOAN_INTEREST_RATE_ID ? 
          await LoanInterestRate.findByPk(product.LOAN_INTEREST_RATE_ID) : null;
        
        return {
          PROD_ID: product.PROD_ID,
          name: product.name,
          productCode: product.productCode,
          PRODUCT_TYPE: product.PRODUCT_TYPE,
          LOAN_INTEREST_RATE_ID: product.LOAN_INTEREST_RATE_ID,
          minAmount: parseFloat(product.minAmount || '0'),
          maxAmount: parseFloat(product.maxAmount || '0'),
          isGlobalProduct: product.isGlobalProduct,
          STATUS: product.STATUS,
          interestRate: interestRate ? {
            id: interestRate.id,
            name: interestRate.name,
            rateType: interestRate.RATE_TYPE
          } : null
        };
      })
    );
    
    res.json({
      success: true,
      message: `Products with LOAN_PROUD_INT_ID: ${loanProudIntId}`,
      data: {
        loanProudIntId,
        products: enhancedProducts,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total: count,
          pages: Math.ceil(count / limitNum)
        }
      }
    });
  }),

  // ============================
  // HELPER METHODS (Fallback implementations)
  // ============================
  
  // Manual calculation fallback method
  _manualCalculateLoanRepayment: async (product, principal, termValue, termType, useDefaultRate, customRate, generateSchedule, startDate) => {
    // Convert term to months
    const termInMonths = convertTermToMonths(termValue, termType);
    
    // Get interest rate
    let interestRate = null;
    if (product.LOAN_INTEREST_RATE_ID) {
      const interestRateRecord = await LoanInterestRate.findByPk(product.LOAN_INTEREST_RATE_ID);
      if (interestRateRecord) {
        interestRate = useDefaultRate ? 
          parseFloat(interestRateRecord.DEFAULT_RATE_PER_MONTH || '0') : 
          (customRate || parseFloat(interestRateRecord.DEFAULT_RATE_PER_MONTH || '0'));
      }
    }
    
    if (!interestRate) {
      throw new Error('No valid interest rate found for this product');
    }
    
    const monthlyRate = interestRate / 100;
    const totalInterest = principal * monthlyRate * termInMonths;
    const monthlyPayment = (principal + totalInterest) / termInMonths;
    
    const result = {
      principal: parseFloat(principal.toFixed(2)),
      term: {
        value: termValue,
        type: termType,
        inMonths: termInMonths
      },
      interestRate: {
        monthlyRate: interestRate,
        annualRate: interestRate * 12,
        source: customRate ? 'CUSTOM' : (useDefaultRate ? 'DEFAULT' : 'PRODUCT')
      },
      monthlyPayment: parseFloat(monthlyPayment.toFixed(2)),
      totalInterest: parseFloat(totalInterest.toFixed(2)),
      totalPayment: parseFloat((principal + totalInterest).toFixed(2)),
      interestToPrincipalRatio: parseFloat((totalInterest / principal * 100).toFixed(2))
    };
    
    // Generate amortization schedule if requested
    if (generateSchedule) {
      const schedule = [];
      let remainingPrincipal = principal;
      const paymentDate = startDate ? new Date(startDate) : new Date();
      
      for (let i = 1; i <= termInMonths; i++) {
        const interestForMonth = remainingPrincipal * monthlyRate;
        const principalForMonth = monthlyPayment - interestForMonth;
        remainingPrincipal -= principalForMonth;
        
        schedule.push({
          paymentNumber: i,
          paymentDate: new Date(paymentDate.getFullYear(), paymentDate.getMonth() + i, paymentDate.getDate()).toISOString().split('T')[0],
          paymentAmount: parseFloat(monthlyPayment.toFixed(2)),
          principal: parseFloat(principalForMonth.toFixed(2)),
          interest: parseFloat(interestForMonth.toFixed(2)),
          remainingPrincipal: parseFloat(Math.max(remainingPrincipal, 0).toFixed(2)),
          cumulativeInterest: parseFloat((interestForMonth * i).toFixed(2))
        });
      }
      
      result.amortizationSchedule = schedule;
    }
    
    return result;
  },
  
  // Manual validation fallback method
  _manualValidateLoanApplication: (product, amount, termValue, termType, requestedRate) => {
    const validation = {
      isValid: true,
      errors: [],
      warnings: [],
      validationDetails: {}
    };
    
    // Convert term to months for comparison
    const termInMonths = convertTermToMonths(termValue, termType);
    
    // Validate amount range
    const minAmount = parseFloat(product.minAmount || '0');
    const maxAmount = parseFloat(product.maxAmount || '0');
    
    if (amount < minAmount || amount > maxAmount) {
      validation.isValid = false;
      validation.errors.push(`Amount ${amount} is outside the allowed range (${minAmount} - ${maxAmount})`);
    }
    
    // Validate term range
    const minTerm = product.MIN_LOAN_TERM_VALUE || product.minTerm || 1;
    const maxTerm = product.MAX_LOAN_TERM_VALUE || product.maxTerm || 60;
    
    if (termInMonths < minTerm || termInMonths > maxTerm) {
      validation.isValid = false;
      validation.errors.push(`Term ${termValue} ${termType} (${termInMonths} months) is outside the allowed range (${minTerm} - ${maxTerm} months)`);
    }
    
    // Validate requested rate if provided
    if (requestedRate !== undefined && requestedRate !== null) {
      // Check if product has interest rate reference
      if (product.LOAN_INTEREST_RATE_ID) {
        // In real implementation, we would fetch the interest rate here
        // For now, we'll add a placeholder
        validation.warnings.push('Rate validation requires database lookup (not implemented in fallback)');
      }
    }
    
    // Check product status
    if (product.STATUS !== 'ACTIVE' || !product.isActive) {
      validation.isValid = false;
      validation.errors.push('Product is not active');
    }
    
    // Check if term type is supported
    const validTermTypes = ['DAYS', 'WEEKS', 'MONTHS', 'QUARTERS', 'YEARS'];
    if (!validTermTypes.includes(termType.toUpperCase())) {
      validation.isValid = false;
      validation.errors.push(`Invalid term type: ${termType}. Must be one of: ${validTermTypes.join(', ')}`);
    }
    
    validation.validationDetails = {
      amountValid: amount >= minAmount && amount <= maxAmount,
      termValid: termInMonths >= minTerm && termInMonths <= maxTerm,
      termTypeValid: validTermTypes.includes(termType.toUpperCase()),
      productActive: product.STATUS === 'ACTIVE' && product.isActive,
      amountRange: { min: minAmount, max: maxAmount, requested: amount },
      termRange: { 
        min: minTerm, 
        max: maxTerm, 
        requested: termInMonths,
        requestedDisplay: `${termValue} ${termType}`
      }
    };
    
    return validation;
  },
  
  // Manual interest calculation fallback method
  _manualCalculateInterestForPeriod: async (product, principal, startDate, endDate, useDefaultRate, customRate) => {
    // Parse dates
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Calculate days between dates
    const timeDiff = Math.abs(end.getTime() - start.getTime());
    const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    
    // Get interest rate
    let interestRate = null;
    if (product.LOAN_INTEREST_RATE_ID) {
      const interestRateRecord = await LoanInterestRate.findByPk(product.LOAN_INTEREST_RATE_ID);
      if (interestRateRecord) {
        interestRate = useDefaultRate ? 
          parseFloat(interestRateRecord.DEFAULT_RATE_PER_MONTH || '0') : 
          (customRate || parseFloat(interestRateRecord.DEFAULT_RATE_PER_MONTH || '0'));
      }
    }
    
    if (!interestRate) {
      throw new Error('No valid interest rate found for this product');
    }
    
    // Convert monthly rate to daily rate (assuming 30 days per month for simplicity)
    const dailyRate = interestRate / 30 / 100;
    const interest = principal * dailyRate * daysDiff;
    
    return {
      principal: parseFloat(principal.toFixed(2)),
      startDate: startDate,
      endDate: endDate,
      periodInDays: daysDiff,
      interestRate: {
        monthlyRate: interestRate,
        dailyRate: parseFloat((interestRate / 30).toFixed(4)),
        source: customRate ? 'CUSTOM' : (useDefaultRate ? 'DEFAULT' : 'PRODUCT')
      },
      interestAmount: parseFloat(interest.toFixed(2)),
      interestPercentage: parseFloat((interest / principal * 100).toFixed(4)),
      totalAmount: parseFloat((principal + interest).toFixed(2)),
      calculationMethod: 'SIMPLE_INTEREST_DAILY',
      assumptions: {
        daysPerMonth: 30,
        interestCalculation: 'Simple interest calculated on daily basis'
      }
    };
  }
};

// Extract methods as named exports for backward compatibility
export const calculateLoanRepayment = LoanProductController.calculateLoanRepayment;
export const validateLoanApplication = LoanProductController.validateLoanApplication;
export const calculateInterestForPeriod = LoanProductController.calculateInterestForPeriod;
export const compareInterestRates = LoanProductController.compareInterestRates;
export const simulateRateChange = LoanProductController.simulateRateChange;
export const getProduct = LoanProductController.getProduct;
export const getAllLoanProducts = LoanProductController.getAllLoanProducts;
export const getProductsByInterestRate = LoanProductController.getProductsByInterestRate;
export const getProductsByLoanProudIntId = LoanProductController.getProductsByLoanProudIntId;

// Default export remains
export default LoanProductController;