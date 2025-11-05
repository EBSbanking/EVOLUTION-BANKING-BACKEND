import mongoose from 'mongoose';
import Product from '../models/SavingsProducts.js';
import LoanProduct from '../models/LoanProduct.js';
import SavingsProduct from '../models/SavingsProduct.js';
import ProductTypeMapping from '../models/ProductTypeMapping.js';
import GLAccount from '../models/GLAccount.js';
import AuditTrail from '../models/AuditTrail.js';
import logger from '../utils/logger.js';
import { getPrefixForProductType } from '../utils/generateLoanAccountId.js';

export const ProductsController = {

  // Create a new product with appropriate GL accounts and mapping
  createProduct: async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Step 1: Extract fields (general + type-specific)
      const {
        name,
        productCode,
        productType: providedProductType,
        BU_ID,
        // General fields
        PROD_ID,
        PROD_CD,
        PROD_DESC,
        VERSION_NO,
        PROD_CAT_TY,
        PROD_DESIGN_ID,
        MIN_AGE_YEAR,
        USER_ID,
        STMNT_FREQ_CD,
        STMNT_FREQ_VALUE,
        ACCT_CYCLE_CD,
        ACCT_CYCLE_VALUE,
        ACCT_AUTH_BUS_PROD_ID,
        // Savings-specific
        productName,
        productDescription,
        CRNCY_ID,
        rateInformation,
        settlementInformation,
        accrualInformation,
        glAccounts,
        chargesSetup,
        additionalGLAccounts,
        customFields,
        metadata,
        // Loan-specific
        description,
        feeStructure,
        processingFeeRate,
        loanGLAccount,
        PAYMENT_FREQUENCY,
        TERM_CD,
        // Loan-specific GL fields
        glAccountNo,
        interestGLAccountNo,
        interestPayableGLAccountNo,
        withholdingTaxGLAccountNo,
        suspenseGLAccountNo,
        principalGLAccountNo,
        processingFeeGLCode,
        // Multi-BU
        isGlobalProduct,
        accessibleBUs,
        visibility
      } = req.body;

      // Validate core required fields
      const requiredCoreFields = { name, productCode, BU_ID };
      const missingCoreFields = Object.entries(requiredCoreFields)
        .filter(([_, value]) => value == null)
        .map(([key]) => key);
      if (missingCoreFields.length > 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Missing required core fields: ${missingCoreFields.join(', ')}`,
        });
      }

      // Step 2: Validate and process BU_ID (mirroring working code)
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
      buIds = [...new Set(buIds)];

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

      // Determine scope
      const hasGlobalWildcard = buIds.includes('*');
      const hasWildcardPatterns = buIds.some(buId => buId.includes('*') && buId !== '*');
      const hasSpecificBUs = buIds.some(buId => !buId.includes('*'));
      const isGlobal = isGlobalProduct !== undefined ? isGlobalProduct : hasGlobalWildcard;

      let finalAccessibleBUs = accessibleBUs;
      if (!finalAccessibleBUs) {
        if (hasGlobalWildcard) {
          finalAccessibleBUs = ['*'];
        } else {
          finalAccessibleBUs = buIds;
        }
      }

      let finalVisibility = visibility;
      if (!finalVisibility) {
        if (hasGlobalWildcard) {
          finalVisibility = 'GLOBAL';
        } else if (hasWildcardPatterns || buIds.length > 1) {
          finalVisibility = 'SELECTED_BUS';
        } else {
          finalVisibility = 'SPECIFIC_BRANCHES';
        }
      }

      const validVisibilityValues = ['GLOBAL', 'SELECTED_BUS', 'SPECIFIC_BRANCHES'];
      if (finalVisibility && !validVisibilityValues.includes(finalVisibility)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Invalid visibility value. Must be one of: ${validVisibilityValues.join(', ')}`,
        });
      }

      // Step 3: Determine PRODUCT_TYPE
      let PRODUCT_TYPE = providedProductType;
      if (!PRODUCT_TYPE) {
        switch (String(productCode)) {
          case '200':
            PRODUCT_TYPE = 'SAVINGS';
            break;
          case '201':
            PRODUCT_TYPE = 'TERM_DEPOSIT';
            break;
          case '300':
            PRODUCT_TYPE = 'BUSINESS TERM LOAN';
            break;
          case '301':
            PRODUCT_TYPE = 'INDIVIDUAL LOAN';
            break;
          // Add more as needed
          default:
            const lowerName = (name || '').toLowerCase();
            if (/savings?/i.test(lowerName)) PRODUCT_TYPE = 'SAVINGS';
            else if (/term\s*deposit/i.test(lowerName)) PRODUCT_TYPE = 'TERM_DEPOSIT';
            else if (/loan/i.test(lowerName)) PRODUCT_TYPE = 'INDIVIDUAL LOAN';
            else PRODUCT_TYPE = 'GENERAL';
        }
      }

      console.log('Detected PRODUCT_TYPE:', PRODUCT_TYPE);

      // Step 4: Type-specific validation and field population (mirroring working savings validation)
      let productData = { 
        ...req.body,
        BU_ID: buIds,
        isGlobalProduct: isGlobal,
        accessibleBUs: finalAccessibleBUs,
        visibility: finalVisibility,
        PRODUCT_TYPE  // Ensure it's set
      };

      if (PRODUCT_TYPE === 'SAVINGS' || PRODUCT_TYPE === 'TERM_DEPOSIT') {
        // Savings-specific validation (from working code)
        const savingsRequired = { 
          productName: productName || name, 
          productDescription: productDescription || description, 
          CRNCY_ID 
        };
        const missingSavingsFields = Object.entries(savingsRequired)
          .filter(([_, value]) => value == null)
          .map(([key]) => key);
        if (missingSavingsFields.length > 0) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Missing required savings fields: ${missingSavingsFields.join(', ')}`,
          });
        }

        // Validate glAccounts sub-fields
        if (!glAccounts?.principalBalance || !glAccounts?.interestIncome || 
            !glAccounts?.interestPayable || !glAccounts?.withholdingTax) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: 'glAccounts must include principalBalance, interestIncome, interestPayable, and withholdingTax',
          });
        }

        // Validate chargesSetup as array
        if (chargesSetup && !Array.isArray(chargesSetup)) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: 'chargesSetup must be an array',
          });
        }

        // Validate each charge
        if (chargesSetup) {
          for (const charge of chargesSetup) {
            if (!charge.name || !charge.amount || !charge.glAccountCode || !charge.chargeType) {
              await session.abortTransaction();
              return res.status(400).json({
                success: false,
                message: 'Each charge must include name, amount, glAccountCode, and chargeType',
              });
            }
          }
        }

        // Populate savings fields
        productData = {
          ...productData,
          productName: productData.productName || name,
          productDescription: productData.productDescription || description,
          rateInformation: {
            rateType: rateInformation?.rateType || 'FIXED',
            fixedRate: rateInformation?.fixedRate
              ? mongoose.Types.Decimal128.fromString(parseFloat(rateInformation.fixedRate).toFixed(2))
              : undefined,
            marginRate: rateInformation?.marginRate
              ? mongoose.Types.Decimal128.fromString(parseFloat(rateInformation.marginRate).toFixed(2))
              : undefined,
            effectiveRate: mongoose.Types.Decimal128.fromString(parseFloat(rateInformation?.effectiveRate || 0).toFixed(2)),
            effectiveDate: new Date(rateInformation?.effectiveDate || new Date()),
          },
          settlementInformation: {
            settlementFrequency: settlementInformation?.settlementFrequency || 'MONTHLY',
            principalSettlementMethod: settlementInformation?.principalSettlementMethod || 'CASH',
            interestSettlementMethod: settlementInformation?.interestSettlementMethod || 'CASH',
            settlementGLAccountNo: settlementInformation?.settlementGLAccountNo || 'DEFAULT_GL',
          },
          accrualInformation: {
            accrualBasis: accrualInformation?.accrualBasis || 'ACTUAL_DAYS/ACTUAL_DAYS',
            accrualStartDate: new Date(accrualInformation?.accrualStartDate || new Date()),
            accrualFrequency: accrualInformation?.accrualFrequency || 'DAILY',
          },
          glAccounts: {
            principalBalance: glAccounts.principalBalance,
            interestIncome: glAccounts.interestIncome,
            interestPayable: glAccounts.interestPayable,
            withholdingTax: glAccounts.withholdingTax,
          },
        };

        // Process chargesSetup
        if (chargesSetup && chargesSetup.length > 0) {
          productData.chargesSetup = chargesSetup.map(charge => ({
            name: charge.name,
            amount: mongoose.Types.Decimal128.fromString(parseFloat(charge.amount).toFixed(2)),
            glAccountCode: charge.glAccountCode,
            chargeType: charge.chargeType,
            // Optional
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

      } else if (PRODUCT_TYPE.includes('LOAN') || PRODUCT_TYPE === 'MORTGAGE' || PRODUCT_TYPE === 'CREDIT CARD') {
        // Loan-specific validation (mirroring savings style) - with defaults
        const loanRequired = { 
          loanGLAccount: loanGLAccount || glAccountNo || 'DEFAULT_LOAN_GL', 
          PAYMENT_FREQUENCY: PAYMENT_FREQUENCY || 'MONTHLY', 
          TERM_CD: TERM_CD || 'M'
        };
        const missingLoanFields = Object.entries(loanRequired)
          .filter(([_, value]) => value == null)
          .map(([key]) => key);
        if (missingLoanFields.length > 0) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: `Missing required loan fields: ${missingLoanFields.join(', ')}`,
          });
        }

        // Validate feeStructure as array if provided
        if (feeStructure && !Array.isArray(feeStructure)) {
          await session.abortTransaction();
          return res.status(400).json({
            success: false,
            message: 'feeStructure must be an array',
          });
        }

        // Validate each fee
        if (feeStructure) {
          for (const fee of feeStructure) {
            if (!fee.name || !fee.amount || !fee.feeType) {
              await session.abortTransaction();
              return res.status(400).json({
                success: false,
                message: 'Each fee must include name, amount, and feeType',
              });
            }
          }
        }

        // Populate loan fields - include GL fields from body
        const effectiveLoanGLAccount = loanGLAccount || glAccountNo || 'DEFAULT_LOAN_GL';
        productData = {
          ...productData,
          description: description || 'Loan product description',
          loanGLAccount: effectiveLoanGLAccount,
          PAYMENT_FREQUENCY: PAYMENT_FREQUENCY || 'MONTHLY',
          TERM_CD: TERM_CD || 'M',
          feeStructure: feeStructure ? feeStructure.map(fee => ({
            name: fee.name,
            amount: mongoose.Types.Decimal128.fromString(parseFloat(fee.amount).toFixed(2)),
            feeType: fee.feeType.toUpperCase().replace(/\s+/g, '_'),
            // Optional
            glAccountCode: fee.glAccountCode,
            status: fee.status || 'ACTIVE'
          })) : undefined,
          processingFeeRate: processingFeeRate 
            ? mongoose.Types.Decimal128.fromString(parseFloat(processingFeeRate).toFixed(2))
            : undefined,
          // Map additional GL fields
          glAccountNo: glAccountNo || effectiveLoanGLAccount,
          interestGLAccountNo: interestGLAccountNo,
          interestPayableGLAccountNo: interestPayableGLAccountNo || interestGLAccountNo || effectiveLoanGLAccount,
          withholdingTaxGLAccountNo: withholdingTaxGLAccountNo,
          suspenseGLAccountNo: suspenseGLAccountNo || effectiveLoanGLAccount,
          principalGLAccountNo: principalGLAccountNo || effectiveLoanGLAccount,
          processingFeeGLCode: processingFeeGLCode,
        };
      }

      // Add optional fields
      if (PROD_ID) productData.PROD_ID = PROD_ID;
      if (PROD_CD) productData.PROD_CD = PROD_CD;
      if (PROD_DESC) productData.PROD_DESC = PROD_DESC;
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

      // Add additionalGLAccounts, customFields, metadata as Maps if provided
      if (additionalGLAccounts) {
        productData.additionalGLAccounts = new Map(Object.entries(additionalGLAccounts));
      }
      if (customFields) {
        productData.customFields = new Map(Object.entries(customFields));
      }
      if (metadata) {
        productData.metadata = new Map(Object.entries(metadata));
      }

      // Step 5: Check for duplicates
      const existingProduct = await Product.findOne({ 
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

      // Step 6: Save to appropriate model
      let specificProduct;
      let baseProduct;

      if (PRODUCT_TYPE === 'SAVINGS' || PRODUCT_TYPE === 'TERM_DEPOSIT') {
        console.log('Creating Savings Product');
        specificProduct = new SavingsProduct(productData);
        await specificProduct.save({ session });
        baseProduct = specificProduct;
      } else if (PRODUCT_TYPE.includes('LOAN') || PRODUCT_TYPE === 'MORTGAGE' || PRODUCT_TYPE === 'CREDIT CARD') {
        console.log('Creating Loan Product');
        specificProduct = new LoanProduct(productData);
        await specificProduct.save({ session });
        baseProduct = specificProduct;
      } else {
        console.log('Creating General Product');
        baseProduct = new Product(productData);
        await baseProduct.save({ session });
        specificProduct = baseProduct;
      }

      // Step 7: Save product-type mapping
      const accountPrefix = getPrefixForProductType(PRODUCT_TYPE);
      let mappingData = {
        PROD_ID: PROD_ID || productCode,
        PRODUCT_TYPE,
        productName: name,
        accountPrefix,
        glAccounts: productData.glAccounts || {},
        BU_ID: buIds,
        isGlobalProduct: isGlobal,
        visibility: finalVisibility
      };

      // ADD: Type-specific fields for mapping - ensure glAccounts has loan-specific keys
      if (PRODUCT_TYPE === 'SAVINGS' || PRODUCT_TYPE === 'TERM_DEPOSIT') {
        // Already has glAccounts from savings block
      } else if (PRODUCT_TYPE.includes('LOAN') || PRODUCT_TYPE === 'MORTGAGE' || PRODUCT_TYPE === 'CREDIT CARD') {
        mappingData.loanGLAccount = productData.loanGLAccount;  // For direct field if needed
        // Populate glAccounts object with loan GL fields
        mappingData.glAccounts = {
          ...(mappingData.glAccounts || {}),
          loanGLAccount: productData.loanGLAccount,
          interestGLAccountNo: productData.interestGLAccountNo,
          interestPayableGLAccountNo: productData.interestPayableGLAccountNo,
          withholdingTaxGLAccountNo: productData.withholdingTaxGLAccountNo,
          suspenseGLAccountNo: productData.suspenseGLAccountNo,
          principalGLAccountNo: productData.principalGLAccountNo,
          processingFeeGLCode: productData.processingFeeGLCode,
          // Add more as needed from productData
        };
        console.log('Populated glAccounts for loan mapping:', mappingData.glAccounts);
      }

      const productTypeMapping = new ProductTypeMapping(mappingData);
      await productTypeMapping.save({ session });

      // Step 8: Create audit trail (mirroring working code)
      const userId = req.user?.id || req.headers['x-user-id'] || 'system';
      const ipAddress = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      const now = new Date();
      try {
        await AuditTrail.create([{
          event_id: Date.now(),
          user_id: userId,
          event_type: `${PRODUCT_TYPE}_PRODUCT_CREATE`,
          action: 'Create Product',
          old_value: null,
          new_value: baseProduct.toObject(),
          ip_address: ipAddress,
          timestamp: now,
          entity_type: 'Product',
          entity_id: baseProduct._id,
          status: 'SUCCESS',
          description: `Created ${PRODUCT_TYPE} product with productCode ${productCode} for ${buIds.length} business unit(s) or patterns`,
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
        logger.error('Failed to create audit trail for product creation', {
          error: auditError.message,
          productCode,
          timestamp: now,
        });
      }

      await session.commitTransaction();

      // Step 9: Success response with BU details
      let successMessage;
      const specificBUs = buIds.filter(buId => !buId.includes('*'));
      const patternBUs = buIds.filter(buId => buId.includes('*') && buId !== '*');
      
      if (hasGlobalWildcard) {
        successMessage = `${PRODUCT_TYPE} product created successfully for ALL business units (global)`;
      } else if (patternBUs.length > 0 && specificBUs.length > 0) {
        successMessage = `${PRODUCT_TYPE} product created successfully for ${specificBUs.length} specific BU(s) and ${patternBUs.length} pattern(s)`;
      } else if (patternBUs.length > 0) {
        successMessage = `${PRODUCT_TYPE} product created successfully with ${patternBUs.length} pattern(s)`;
      } else {
        successMessage = `${PRODUCT_TYPE} product created successfully for ${specificBUs.length} specific business unit(s)`;
      }

      return res.status(201).json({
        success: true,
        message: successMessage,
        data: {
          baseProduct: baseProduct.toObject({ getters: true, virtuals: true }),
          specificProduct: specificProduct.toObject({ getters: true, virtuals: true }),
          productType: PRODUCT_TYPE,
          accountPrefix,
          metadata: {
            total_bu_entries: buIds.length,
            specific_bus: specificBUs,
            pattern_bus: patternBUs,
            has_global_wildcard: hasGlobalWildcard,
            is_global: isGlobal,
            visibility: finalVisibility
          }
        }
      });

    } catch (error) {
      await session.abortTransaction();
      console.error('Create Product Error:', error);

      if (error.message.includes('required for loan products')) {
        return res.status(400).json({
          success: false,
          message: error.message,
          field: 'loanGLAccount',
          hint: 'Ensure loanGLAccount is provided for loan products and passed to ProductTypeMapping.'
        });
      }

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

      logger.error('Error creating product:', {
        error: error.message,
        stack: error.stack,
        body: req.body,
        timestamp: new Date(),
      });

      return res.status(500).json({
        success: false,
        message: 'An error occurred while creating the product',
        error: error.message,
      });
    } finally {
      session.endSession();
    }
  }
};


export const getProductsByBU = async (req, res) => {
  try {
    const { bu_id } = req.params;
    
    if (!bu_id || (typeof bu_id !== 'string')) {
      return res.status(400).json({
        success: false,
        message: 'BU_ID is required and must be a string',
      });
    }

    // Function to check if a pattern matches a BU ID
    const matchesPattern = (pattern, targetBu) => {
      if (pattern === '*') return true;
      if (pattern === targetBu) return true;
      
      // Convert pattern to regex
      const regexPattern = pattern.replace(/\*/g, '.*');
      const regex = new RegExp(`^${regexPattern}$`);
      return regex.test(targetBu);
    };

    // Get all active products from both collections
    const [allSavingsProducts, allLoanProducts] = await Promise.all([
      SavingsProduct.find({
        $or: [{ REC_ST: 'A' }, { REC_ST: { $exists: false } }, { REC_ST: null }],
        isActive: { $ne: false }
      }),
      LoanProduct.find({
        $or: [{ REC_ST: 'A' }, { REC_ST: { $exists: false } }, { REC_ST: null }, { isActive: true }],
        isActive: { $ne: false }
      })
    ]);

    // Filter products that match the BU_ID
    const filterProductsByBU = (products) => {
      return products.filter(product => {
        const buIds = product.BU_ID || [];
        const accessibleBUs = product.accessibleBUs || [];
        
        // Check direct matches
        if (buIds.includes(bu_id) || accessibleBUs.includes(bu_id)) {
          return true;
        }
        
        // Check global products
        if (product.isGlobalProduct || buIds.includes('*') || accessibleBUs.includes('*')) {
          return true;
        }
        
        // Check pattern matches in BU_ID
        const buIdPatternMatch = buIds.some(pattern => 
          pattern.includes('*') && matchesPattern(pattern, bu_id)
        );
        
        // Check pattern matches in accessibleBUs
        const accessiblePatternMatch = accessibleBUs.some(pattern => 
          pattern.includes('*') && matchesPattern(pattern, bu_id)
        );
        
        return buIdPatternMatch || accessiblePatternMatch;
      });
    };

    const savingsProducts = filterProductsByBU(allSavingsProducts);
    const loanProducts = filterProductsByBU(allLoanProducts);
    const allProducts = [...savingsProducts, ...loanProducts];

    return res.status(200).json({
      success: true,
      message: `Products retrieved for BU ${bu_id}`,
      data: {
        products: allProducts,
        summary: {
          total: allProducts.length,
          savings: savingsProducts.length,
          loans: loanProducts.length
        },
        bu_id: bu_id
      },
      count: allProducts.length
    });

  } catch (error) {
    console.error('Error fetching products by BU:', {
      error: error.message,
      bu_id: req.params.bu_id,
      timestamp: new Date().toISOString()
    });

    return res.status(500).json({
      success: false,
      message: 'Error retrieving products for business unit',
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