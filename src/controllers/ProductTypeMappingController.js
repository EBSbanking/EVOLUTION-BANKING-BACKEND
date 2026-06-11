import ProductTypeMapping from '../models/ProductTypeMapping.js';
import GLAccount from '../models/GLAccount.js';
import SavingsProduct from '../models/SavingsProduct.js';
import LoanProduct from '../models/LoanProduct.js';
import { generateLoanAccountNumberByProdId } from '../utils/generateLoanAccountId.js';

/**
 * =========================
 * Internal utility functions
 * =========================
 */

/**
 * Internal function to get product type mapping by PROD_ID
 * Use this in services instead of API handler
 */
export const getProductTypeByProdIdInternal = async (prodId) => {
  const mapping = await ProductTypeMapping.findOne({ PROD_ID: prodId });
  if (!mapping) {
    throw new Error(`No mapping found for PROD_ID ${prodId}`);
  }
  return mapping;
};

// Helper function to get account prefix based on product type
const getPrefixForProductType = (productType) => {
  const prefixMap = {
    'BUSINESS_TERM_LOAN': 'BTL',
    'INDIVIDUAL_LOAN': 'IL',
    'CONSUMER_LOAN': 'CL',
    'MORTGAGE': 'MTG',
    'AUTO_LOAN': 'AL',
    'PERSONAL_LOAN': 'PL',
    'EDUCATION_LOAN': 'EL',
    'CREDIT_CARD': 'CC',
    'LINE_OF_CREDIT': 'LOC',
    'SME_LOAN': 'SME',
    'GENERAL_LOAN': 'GL',
    'GROUP_LOAN': 'GLN',
    'MONTHLY_LOAN': 'MOL',
    'ASSET_LOAN': 'ASL',
    'RAPID_CASH_LOAN': 'RCL',
    'STAFF_LOAN': 'STL',
    'STAFF_SALARY_ADVANCE': 'SSA',
    'GROUP_MONTHLY_LOAN': 'GML',
    'SOLAR_LOAN': 'SOL',
    'DAILY_LOAN': 'DLN'
  };
  
  return prefixMap[productType] || 'DF';
};

/**
 * =========================
 * API Handlers
 * =========================
 */

/**
 * Create or update a product type mapping and generate loan account number
 */
export const createOrUpdateMapping = async (req, res) => {
  try {
    console.log('📥 Incoming request body:', JSON.stringify(req.body, null, 2));
    
    const { PROD_ID, PRODUCT_TYPE, productName, PROD_DESC, PROD_CD, glAccounts } = req.body;
    
    console.log('📥 PROD_ID received:', PROD_ID, 'Type:', typeof PROD_ID);

    // ✅ IMPROVED PROD_ID VALIDATION & PARSING
    let finalProdId;
    
    if (!PROD_ID) {
      // Generate a new PROD_ID using the model's static method
      try {
        finalProdId = await SavingsProduct.getNextProdId();
        console.log(`🔄 Generated new PROD_ID: ${finalProdId}`);
      } catch (genError) {
        console.error('Error generating PROD_ID:', genError);
        // Fallback to random generation
        finalProdId = Math.floor(1000 + Math.random() * 9000);
        console.log(`🔄 Using fallback PROD_ID: ${finalProdId}`);
      }
    } else {
      // Parse existing PROD_ID safely
      const parsedProdId = parseInt(String(PROD_ID).trim());
      if (isNaN(parsedProdId)) {
        return res.status(400).json({
          success: false,
          message: `PROD_ID must be a valid number. Received: ${PROD_ID}`
        });
      }
      finalProdId = Math.max(parsedProdId, 1000); // Ensure minimum 1000
      console.log(`✅ Using provided PROD_ID: ${finalProdId} (parsed from: ${PROD_ID})`);
    }

    // Validate other required fields
    if (!PRODUCT_TYPE || !productName || !PROD_DESC || !PROD_CD) {
      return res.status(400).json({
        success: false,
        message: 'PRODUCT_TYPE, productName, PROD_DESC, and PROD_CD are required'
      });
    }

    // Determine final product type based on PROD_CD and PROD_DESC
    let finalProductType = PRODUCT_TYPE;
    let finalPROD_CD = PROD_CD;
    let finalPROD_DESC = PROD_DESC;

    // If PRODUCT_TYPE not provided or needs determination, use PROD_CD and PROD_DESC
    if (!finalProductType || finalProductType === 'UNKNOWN') {
      switch (String(finalPROD_CD)) {
        case '200': finalProductType = 'SAVINGS'; break;
        case '201': finalProductType = 'TERM_DEPOSIT'; break;
        case '300': finalProductType = 'BUSINESS_TERM_LOAN'; break;
        case '301': finalProductType = 'INDIVIDUAL_LOAN'; break;
        case '302': finalProductType = 'CONSUMER_LOAN'; break;
        case '303': finalProductType = 'MORTGAGE'; break;
        case '304': finalProductType = 'AUTO_LOAN'; break;
        case '305': finalProductType = 'PERSONAL_LOAN'; break;
        case '306': finalProductType = 'EDUCATION_LOAN'; break;
        case '307': finalProductType = 'CREDIT_CARD'; break;
        case '308': finalProductType = 'LINE_OF_CREDIT'; break;
        case '309': finalProductType = 'SME_LOAN'; break;
        case '310': finalProductType = 'GROUP_LOAN'; break;
        case '311': finalProductType = 'MONTHLY_LOAN'; break;
        case '312': finalProductType = 'ASSET_LOAN'; break;
        case '313': finalProductType = 'RAPID_CASH_LOAN'; break;
        case '314': finalProductType = 'STAFF_LOAN'; break;
        case '315': finalProductType = 'STAFF_SALARY_ADVANCE'; break;
        case '316': finalProductType = 'GROUP_MONTHLY_LOAN'; break;
        case '317': finalProductType = 'SOLAR_LOAN'; break;
        case '318': finalProductType = 'DAILY_LOAN'; break;
        case '319': finalProductType = 'GENERAL_LOAN'; break;
        default:
          const lowerDesc = finalPROD_DESC.toLowerCase();
          if (/individual\s*loan/i.test(lowerDesc)) finalProductType = 'INDIVIDUAL_LOAN';
          else if (/term\s*deposit/i.test(lowerDesc)) finalProductType = 'TERM_DEPOSIT';
          else if (/savings?/i.test(lowerDesc)) finalProductType = 'SAVINGS';
          else if (/business\s*term\s*loan/i.test(lowerDesc)) finalProductType = 'BUSINESS_TERM_LOAN';
          else if (/consumer\s*loan/i.test(lowerDesc)) finalProductType = 'CONSUMER_LOAN';
          else if (/mortgage/i.test(lowerDesc)) finalProductType = 'MORTGAGE';
          else if (/auto\s*loan/i.test(lowerDesc)) finalProductType = 'AUTO_LOAN';
          else if (/personal\s*loan/i.test(lowerDesc)) finalProductType = 'PERSONAL_LOAN';
          else if (/education\s*loan/i.test(lowerDesc)) finalProductType = 'EDUCATION_LOAN';
          else if (/credit\s*card/i.test(lowerDesc)) finalProductType = 'CREDIT_CARD';
          else if (/line\s*of\s*credit/i.test(lowerDesc)) finalProductType = 'LINE_OF_CREDIT';
          else if (/sme\s*loan/i.test(lowerDesc)) finalProductType = 'SME_LOAN';
          else if (/group\s*loan/i.test(lowerDesc)) finalProductType = 'GROUP_LOAN';
          else if (/monthly/i.test(lowerDesc)) finalProductType = 'MONTHLY_LOAN';
          else if (/asset\s*loan/i.test(lowerDesc)) finalProductType = 'ASSET_LOAN';
          else if (/rapid\s*cash\s*loan/i.test(lowerDesc)) finalProductType = 'RAPID_CASH_LOAN';
          else if (/staff\s*loan/i.test(lowerDesc)) finalProductType = 'STAFF_LOAN';
          else if (/staff\s*salary\s*advance/i.test(lowerDesc)) finalProductType = 'STAFF_SALARY_ADVANCE';
          else if (/group\s*monthly\s*loan/i.test(lowerDesc)) finalProductType = 'GROUP_MONTHLY_LOAN';
          else if (/solar\s*loan/i.test(lowerDesc)) finalProductType = 'SOLAR_LOAN';
          else if (/daily\s*loan/i.test(lowerDesc)) finalProductType = 'DAILY_LOAN';
          else finalProductType = 'GENERAL_LOAN';
      }
    }

    // Validate PRODUCT_TYPE against schema enum
    const validProductTypes = [
      'BUSINESS_TERM_LOAN',
      'INDIVIDUAL_LOAN',
      'CONSUMER_LOAN',
      'MORTGAGE',
      'AUTO_LOAN',
      'PERSONAL_LOAN',
      'EDUCATION_LOAN',
      'CREDIT_CARD',
      'LINE_OF_CREDIT',
      'SME_LOAN',
      'GENERAL_LOAN',
      'GROUP_LOAN',
      'MONTHLY_LOAN',
      'ASSET_LOAN',
      'RAPID_CASH_LOAN',
      'STAFF_LOAN',
      'STAFF_SALARY_ADVANCE',
      'GROUP_MONTHLY_LOAN',
      'SOLAR_LOAN',
      'DAILY_LOAN'
    ];

    if (!validProductTypes.includes(finalProductType)) {
      // Handle special cases
      if (finalProductType === 'SAVINGS' || finalProductType === 'TERM_DEPOSIT') {
        return res.status(400).json({
          success: false,
          message: `Invalid PRODUCT_TYPE: ${finalProductType}. Deposit products (SAVINGS, TERM_DEPOSIT) are not valid loan products.`
        });
      }
      
      return res.status(400).json({
        success: false,
        message: `Invalid PRODUCT_TYPE: ${finalProductType}. Must be one of: ${validProductTypes.join(', ')}`
      });
    }

    // ======================
    // NEW: Build updated GL accounts with interest accrual fields
    // ======================
    const updatedGLAccounts = {
      ...(glAccounts || {}),
      // Interest accrual GL fields (from request body)
      gl_interest_accrued: req.body.gl_interest_accrued,
      gl_interest_income: req.body.gl_interest_income,
      gl_interest_expense: req.body.gl_interest_expense,
      gl_interest_matured: req.body.gl_interest_matured,
      gl_penalty_income: req.body.gl_penalty_income,
    };

    // ======================
    // NEW: Validate required GL accounts based on product type
    // ======================
    if (finalProductType === 'LOAN') {
      if (!updatedGLAccounts.gl_interest_accrued || !updatedGLAccounts.gl_interest_income) {
        return res.status(400).json({
          success: false,
          message: 'LOAN product requires gl_interest_accrued (interest receivable) and gl_interest_income (interest income)'
        });
      }
    } else if (finalProductType === 'SAVINGS' || finalProductType === 'TERM_DEPOSIT') {
      if (!updatedGLAccounts.gl_interest_accrued || !updatedGLAccounts.gl_interest_expense) {
        return res.status(400).json({
          success: false,
          message: `${finalProductType} product requires gl_interest_accrued (interest payable) and gl_interest_expense (interest expense)`
        });
      }
    }

    // Existing GL accounts list (kept for backwards compatibility)
    const glFields = [
      'loanGLAccount',
      'interestGLAccountNo',
      'interestPayableGLAccountNo',
      'withholdingTaxGLAccountNo',
      'suspenseGLAccountNo',
      'principalGLAccountNo',
      'chargeOffGLAccountNo',
      'loanChargeReceivableGLAccountNo',
      'contingentGLAccountNo',
      'delinquentGLAccountNo',
      'interestIncomeGLAccountNo',
      'interestReceivableGLAccountNo',
      'interestSuspenseGLAccountNo',
      'lateFeeSuspenseGLAccountNo',
      'maturityGLAccountNo',
      'nonAccrualGLAccountNo',
      'nonAccrualInterestOffsetGLAccountNo',
      'nonAccrualInterestReceivableGLAccountNo',
      'provisionReserveGLAccountNo',
      'provisionExpenseGLAccountNo',
      'recoveriesGLAccountNo',
      'repaymentControlGLAccountNo',
      'loanSuspenseGLAccountNo',
      'unappliedFundsGLAccountNo',
      'unclearedBalanceGLAccountNo',
      'unearnedInterestGLAccountNo',
      'interestCreditGLAccountNo',
      'interestDebitGLAccountNo',
      'SETTLEMENT_GL_ACCT_NO',
      // Savings/Deposit specific accounts
      'principalBalanceGLAccountNo',
      'depositChargeReceivableGLAccountNo',
      'dormantBalanceGLAccountNo',
      'earmarkedBalanceGLAccountNo',
      'escheatedBalanceGLAccountNo',
      'interestChequesGLAccountNo',
      'interestExpenseGLAccountNo',
      'maturedBalanceGLAccountNo',
      'maturityChequesGLAccountNo',
      'nonAccrualBalanceGLAccountNo',
      'overdrawnBalanceGLAccountNo',
      'preDormantBalanceGLAccountNo',
      'rejectedCreditSuspenseGLAccountNo',
      'rejectedDebitSuspenseGLAccountNo',
      'reservedBalanceGLAccountNo',
      'writeOffBalanceGLAccountNo'
    ];

    // Validate GL accounts based on product type (existing logic)
    if (finalProductType.includes('LOAN') || finalProductType === 'MORTGAGE' || finalProductType === 'CREDIT_CARD') {
      // Require loanGLAccount for loan products
      if (!updatedGLAccounts.loanGLAccount) {
        return res.status(400).json({
          success: false,
          message: 'loanGLAccount is required for loan products'
        });
      }
      
      // Require SETTLEMENT_GL_ACCT_NO with fallback to default
      if (!updatedGLAccounts.SETTLEMENT_GL_ACCT_NO) {
        const defaultGLAccount = await GLAccount.findOne({ GL_ACCT_CAT: 'SETTLEMENT' });
        if (!defaultGLAccount) {
          return res.status(400).json({
            success: false,
            message: 'SETTLEMENT_GL_ACCT_NO is required for loan products and no default account found'
          });
        }
        updatedGLAccounts.SETTLEMENT_GL_ACCT_NO = defaultGLAccount.GL_ACCT_NO;
        console.warn(`SETTLEMENT_GL_ACCT_NO not provided for PROD_ID ${finalProdId}. Using default: ${defaultGLAccount.GL_ACCT_NO}`);
      }
      
      // Set principalGLAccountNo to loanGLAccount if not provided
      if (!updatedGLAccounts.principalGLAccountNo) {
        updatedGLAccounts.principalGLAccountNo = updatedGLAccounts.loanGLAccount;
        console.log(`principalGLAccountNo not provided for PROD_ID ${finalProdId}. Using loanGLAccount value: ${updatedGLAccounts.loanGLAccount}`);
      }

      // Set fallbacks for other GL accounts to prevent undefined values
      if (!updatedGLAccounts.interestPayableGLAccountNo) {
        updatedGLAccounts.interestPayableGLAccountNo = updatedGLAccounts.interestGLAccountNo || updatedGLAccounts.loanGLAccount;
        console.log(`interestPayableGLAccountNo not provided for PROD_ID ${finalProdId}. Using interestGLAccountNo or loanGLAccount value: ${updatedGLAccounts.interestPayableGLAccountNo}`);
      }
      if (!updatedGLAccounts.withholdingTaxGLAccountNo) {
        // Attempt to find a default tax account; fallback to loan if not found
        let defaultTaxAccount = await GLAccount.findOne({ GL_ACCT_CAT: 'WITHHOLDING_TAX' });
        if (!defaultTaxAccount) {
          defaultTaxAccount = await GLAccount.findOne({ GL_ACCT_CAT: 'TAX' });
        }
        if (defaultTaxAccount) {
          updatedGLAccounts.withholdingTaxGLAccountNo = defaultTaxAccount.GL_ACCT_NO;
        } else {
          updatedGLAccounts.withholdingTaxGLAccountNo = updatedGLAccounts.loanGLAccount;
          console.warn(`No default tax account found for withholdingTaxGLAccountNo. Using loanGLAccount: ${updatedGLAccounts.loanGLAccount}`);
        }
        console.log(`withholdingTaxGLAccountNo set for PROD_ID ${finalProdId}: ${updatedGLAccounts.withholdingTaxGLAccountNo}`);
      }
      
    } else if (finalProductType === 'SAVINGS' || finalProductType === 'TERM_DEPOSIT') {
      // Require principalBalanceGLAccountNo for savings/deposit products
      if (!updatedGLAccounts.principalBalanceGLAccountNo) {
        return res.status(400).json({
          success: false,
          message: 'principalBalanceGLAccountNo is required for savings/deposit products'
        });
      }

      // Add fallbacks for savings GL accounts if needed
      if (!updatedGLAccounts.interestPayableGLAccountNo) {
        updatedGLAccounts.interestPayableGLAccountNo = updatedGLAccounts.principalBalanceGLAccountNo;
        console.log(`interestPayableGLAccountNo not provided. Using principalBalanceGLAccountNo for savings.`);
      }
      // Add more fallbacks as required
    }

    // Validate all provided GL accounts exist in the database
    for (const [field, accountNumber] of Object.entries(updatedGLAccounts)) {
      if (accountNumber) {
        const glAccount = await GLAccount.findOne({ GL_ACCT_NO: accountNumber });
        if (!glAccount) {
          return res.status(400).json({
            success: false,
            message: `Invalid GL account number: ${accountNumber} for ${field}. Account not found in database.`
          });
        }
        console.log(`GL account validated for ${field}: ${accountNumber} (Category: ${glAccount.GL_ACCT_CAT})`);
      }
    }

    // Get account prefix
    const accountPrefix = getPrefixForProductType(finalProductType);
    console.log(`Generated account prefix for ${finalProductType}: ${accountPrefix}`);

    // ✅ SAFE PARSING FOR NUMERIC FIELDS
    const parsedProductCode = parseInt(String(finalPROD_CD).trim());
    const finalProductCode = isNaN(parsedProductCode) ? 200 : parsedProductCode;

    // Prepare mapping data
    const mappingData = {
      productCode: finalProductCode,
      PROD_ID: finalProdId,
      name: productName,
      isActive: true,
      allowedCurrencies: [req.body.CRNCY_ID || 'NGN'],
      processingFeeRate: parseFloat(req.body.processingFeeRate) || 0,
      feeStructure: req.body.feeStructure || [],
      PRODUCT_TYPE: finalProductType,
      accountPrefix,
      glAccounts: updatedGLAccounts,
      PROD_CD: finalPROD_CD,
      PROD_DESC: finalPROD_DESC
    };

    // Save or update product type mapping
    const updatedMapping = await ProductTypeMapping.findOneAndUpdate(
      { PROD_ID: finalProdId },
      mappingData,
      { upsert: true, new: true, runValidators: true }
    );

    console.log(`Product type mapping saved/updated for PROD_ID: ${finalProdId}`, {
      PRODUCT_TYPE: finalProductType,
      accountPrefix,
      glAccountCount: Object.keys(updatedGLAccounts).length
    });

    // Create or update specific product based on type
    const productData = {
      PROD_ID: finalProdId,
      PROD_CD: finalPROD_CD,
      PROD_DESC: finalPROD_DESC,
      PRODUCT_TYPE: finalProductType,
      productName: productName,
      ...req.body.productData
    };

    let specificProduct = null;

    // Handle Savings Products (SAVINGS, TERM_DEPOSIT)
    if (finalProductType === 'SAVINGS' || finalProductType === 'TERM_DEPOSIT') {
      const savingsProductData = {
        ...productData,
        productCode: String(finalProductCode),
        productType: finalProductType,
        CRNCY_ID: req.body.CRNCY_ID || 'NGN',
        START_DT: req.body.START_DT ? new Date(req.body.START_DT) : new Date(),
        REC_ST: req.body.REC_ST || 'A',
        CREATED_BY: req.body.CREATED_BY || 'system',
        BU_ID: req.body.BU_ID || '001',
        principalBalanceGLAccountNo: updatedGLAccounts.principalBalanceGLAccountNo,
        interestGLAccountNo: updatedGLAccounts.interestGLAccountNo,
        interestPayableGLAccountNo: updatedGLAccounts.interestPayableGLAccountNo,
        withholdingTaxGLAccountNo: updatedGLAccounts.withholdingTaxGLAccountNo,
        depositChargeReceivableGLAccountNo: updatedGLAccounts.depositChargeReceivableGLAccountNo,
        interestExpenseGLAccountNo: updatedGLAccounts.interestExpenseGLAccountNo,
        interestIncomeGLAccountNo: updatedGLAccounts.interestIncomeGLAccountNo
      };

      specificProduct = await SavingsProduct.findOneAndUpdate(
        { PROD_ID: finalProdId },
        savingsProductData,
        { upsert: true, new: true, runValidators: true }
      );
      console.log(`Savings product saved/updated for PROD_ID: ${finalProdId}`);

    } 
    // Handle Loan Products
    else if (finalProductType.includes('LOAN') || finalProductType === 'MORTGAGE' || finalProductType === 'CREDIT_CARD') {
      const loanProductData = {
        ...productData,
        productCode: String(finalProductCode),
        name: productName,
        description: PROD_DESC,
        CRNCY_ID: req.body.CRNCY_ID || 'NGN',
        loanGLAccount: updatedGLAccounts.loanGLAccount,
        interestGLAccountNo: updatedGLAccounts.interestGLAccountNo,
        interestPayableGLAccountNo: updatedGLAccounts.interestPayableGLAccountNo,
        withholdingTaxGLAccountNo: updatedGLAccounts.withholdingTaxGLAccountNo,
        principalGLAccountNo: updatedGLAccounts.principalGLAccountNo,
        minAmount: parseFloat(req.body.minAmount) || 0.00,
        maxAmount: parseFloat(req.body.maxAmount) || 0.00,
        minTerm: parseInt(req.body.minTerm) || 1,
        maxTerm: parseInt(req.body.maxTerm) || 12,
        TERM_CD: req.body.TERM_CD || 'M',
        PAYMENT_FREQUENCY: req.body.PAYMENT_FREQUENCY || 'MONTHLY',
        interestRate: parseFloat(req.body.interestRate) || 0.00,
        gracePeriod: parseInt(req.body.gracePeriod) || 0,
        lateFeeRate: parseFloat(req.body.lateFeeRate) || 0.00,
        prepaymentPenalty: parseFloat(req.body.prepaymentPenalty) || 0.00,
        isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : true,
        createdBy: req.body.CREATED_BY || 'system',
        startDate: req.body.START_DT ? new Date(req.body.START_DT) : new Date()
      };

      specificProduct = await LoanProduct.findOneAndUpdate(
        { PROD_ID: finalProdId },
        loanProductData,
        { upsert: true, new: true, runValidators: true }
      );
      console.log(`Loan product saved/updated for PROD_ID: ${finalProdId}`);
    }

    // Generate loan account number (if applicable)
    let generatedAccountNumber = null;
    if (finalProductType.includes('LOAN') || finalProductType === 'MORTGAGE' || finalProductType === 'CREDIT_CARD') {
      try {
        generatedAccountNumber = await generateLoanAccountNumberByProdId(finalProdId);
        console.log(`Generated loan account number for PROD_ID ${finalProdId}: ${generatedAccountNumber}`);
      } catch (accountError) {
        console.warn('Account number generation failed:', accountError.message);
      }
    }

    // Serialize documents safely
    const serializedMapping = updatedMapping.toObject({ getters: false });
    const serializedSpecificProduct = specificProduct ? specificProduct.toObject({ getters: false }) : null;

    return res.status(200).json({
      success: true,
      message: 'Product type mapping and specific product created/updated successfully',
      data: {
        mapping: {
          PROD_ID: serializedMapping.PROD_ID,
          PRODUCT_TYPE: serializedMapping.PRODUCT_TYPE,
          productName: serializedMapping.productName || serializedMapping.name,
          accountPrefix: serializedMapping.accountPrefix,
          PROD_CD: serializedMapping.PROD_CD || serializedMapping.productCode,
          PROD_DESC: serializedMapping.PROD_DESC,
          glAccounts: serializedMapping.glAccounts,
          createdAt: serializedMapping.createdAt,
          updatedAt: serializedMapping.updatedAt
        },
        specificProduct: serializedSpecificProduct,
        generatedAccountNumber,
        validation: {
          providedGLAccounts: Object.keys(updatedGLAccounts),
          totalGLAccountsValidated: Object.keys(updatedGLAccounts).length,
          productType: finalProductType,
          accountPrefix,
          determinedFrom: {
            originalProductType: PRODUCT_TYPE,
            finalProductType: finalProductType,
            usedPROD_CD: finalPROD_CD,
            usedPROD_DESC: finalPROD_DESC
          }
        }
      }
    });
  } catch (error) {
    console.error('Error creating/updating product type mapping:', error);
    
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }
    
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: `Product mapping with PROD_ID ${req.body.PROD_ID} already exists`
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Failed to create or update product type mapping',
      error: error.message || 'Unexpected error'
    });
  }
};

/**
 * Get product type mapping by PROD_ID
 */
export const getMappingByProdId = async (req, res) => {
  try {
    const { prodId } = req.params;

    if (!prodId) {
      return res.status(400).json({
        success: false,
        message: 'PROD_ID parameter is required'
      });
    }

    const parsedProdId = parseInt(String(prodId).trim());
    if (isNaN(parsedProdId)) {
      return res.status(400).json({
        success: false,
        message: `PROD_ID must be a valid number. Received: ${prodId}`
      });
    }

    const mapping = await ProductTypeMapping.findOne({ PROD_ID: parsedProdId });
    
    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: `No product type mapping found for PROD_ID: ${parsedProdId}`
      });
    }

    return res.status(200).json({
      success: true,
      data: mapping
    });
  } catch (error) {
    console.error('Error fetching product type mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch product type mapping',
      error: error.message
    });
  }
};

/**
 * Get all product type mappings
 */
export const getAllMappings = async (req, res) => {
  try {
    const mappings = await ProductTypeMapping.find().sort({ PROD_ID: 1 });
    
    return res.status(200).json({
      success: true,
      data: mappings,
      count: mappings.length
    });
  } catch (error) {
    console.error('Error fetching all product type mappings:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch product type mappings',
      error: error.message
    });
  }
};

/**
 * Get product type mapping by PROD_ID (API-style)
 */
export const getProductTypeByProdId = async (req, res) => {
  try {
    const { PROD_ID } = req.params;
    
    const parsedProdId = parseInt(String(PROD_ID).trim());
    if (isNaN(parsedProdId)) {
      return res.status(400).json({
        success: false,
        message: `PROD_ID must be a valid number. Received: ${PROD_ID}`
      });
    }

    const mapping = await ProductTypeMapping.findOne({ PROD_ID: parsedProdId }).lean();

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: `No mapping found for PROD_ID ${parsedProdId}`
      });
    }

    return res.status(200).json({
      success: true,
      data: mapping
    });
  } catch (error) {
    console.error('Error fetching mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch mapping',
      error: error.message
    });
  }
};

/**
 * Delete mapping by PROD_ID
 */
export const deleteMapping = async (req, res) => {
  try {
    const { PROD_ID } = req.params;
    
    const parsedProdId = parseInt(String(PROD_ID).trim());
    if (isNaN(parsedProdId)) {
      return res.status(400).json({
        success: false,
        message: `PROD_ID must be a valid number. Received: ${PROD_ID}`
      });
    }

    const result = await ProductTypeMapping.deleteOne({ PROD_ID: parsedProdId });

    if (result.deletedCount === 0) {
      return res.status(404).json({
        success: false,
        message: `No mapping found for PROD_ID ${parsedProdId}`
      });
    }

    return res.status(200).json({
      success: true,
      message: `Mapping for PROD_ID ${parsedProdId} deleted`
    });
  } catch (error) {
    console.error('Error deleting mapping:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete mapping',
      error: error.message
    });
  }
};

/**
 * Get only the PRODUCT_TYPE by PROD_ID
 */
export const getProductTypeOnly = async (req, res) => {
  try {
    const { PROD_ID } = req.params;
    
    const parsedProdId = parseInt(String(PROD_ID).trim());
    if (isNaN(parsedProdId)) {
      return res.status(400).json({
        success: false,
        message: `PROD_ID must be a valid number. Received: ${PROD_ID}`
      });
    }

    const mapping = await ProductTypeMapping.findOne(
      { PROD_ID: parsedProdId },
      { PRODUCT_TYPE: 1, _id: 0 }
    ).lean();

    if (!mapping) {
      return res.status(404).json({
        success: false,
        message: `No mapping found for PROD_ID ${parsedProdId}`
      });
    }

    return res.status(200).json({
      success: true,
      productType: mapping.PRODUCT_TYPE
    });
  } catch (error) {
    console.error('Error fetching product type only:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch product type',
      error: error.message
    });
  }
};