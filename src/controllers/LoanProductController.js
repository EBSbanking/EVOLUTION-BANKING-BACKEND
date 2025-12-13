// src/controllers/LoanProductController.js - UPDATED WITH LOAN INTEREST RATE REFERENCE ARCHITECTURE
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import LoanProduct from '../models/LoanProduct.js';
import LoanInterestRate from '../models/LoanInterestRate.js'; // Master interest rate model
import ProductTypeMapping from '../models/ProductTypeMapping.js';
import AuditTrail from '../models/AuditTrail.js';
import Branch from '../models/Branch.js';
import logger from '../utils/logger.js';

// Safe Decimal128 converter
const toDecimal = (val, field) => {
  if (val === undefined || val === null || val === '') {
    return mongoose.Types.Decimal128.fromString('0.00');
  }
  const num = parseFloat(val);
  if (isNaN(num) || num < 0) throw new Error(`${field} must be a positive number`);
  return mongoose.Types.Decimal128.fromString(num.toFixed(2));
};

// Helper function to get client IP address
const getClientIp = (req) => {
  return req.ip ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
         '127.0.0.1';
};

// Helper function to generate unique event ID
const generateEventId = () => {
  return Date.now() + Math.floor(Math.random() * 1000);
};

// Helper function to validate branch codes
const validateBranchCodes = async (branchCodes, session) => {
  const validCodes = [];
  const invalidCodes = [];
 
  for (const code of branchCodes) {
    // Skip wildcard
    if (code === '*') {
      validCodes.push(code);
      continue;
    }
   
    // Check if branch exists in database
    const branch = await Branch.findOne({
      branchCode: code,
      status: 'ACTIVE'
    }, null, { session });
   
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
      return Math.ceil(value / 30); // Approximation
    case 'WEEKS':
      return Math.ceil(value / 4); // Approximation
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

export const LoanProductController = {
  // CREATE LOAN PRODUCT - WITH LOAN INTEREST RATE REFERENCE
  createProduct: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const {
        name,
        productCode,
        BU_ID = [],
        PROD_ID,
        PRODUCT_TYPE = 'GENERAL_LOAN',
        description = '',
        CRNCY_ID = 'NGN',
        PAYMENT_FREQUENCY = 'MONTHLY',
        TERM_CD = 'M',
       
        // Loan Interest Rate Reference - REQUIRED
        LOAN_INTEREST_RATE_ID,
       
        // Flexible Term Fields
        MIN_LOAN_TERM_VALUE,
        MAX_LOAN_TERM_VALUE,
        LOAN_TERM_TYPE = 'MONTHS',
       
        // Product Configuration
        defaultGLAccounts = {},
        branchGLAccounts = [],
        minAmount,
        maxAmount,
       
        // Fee Structure
        feeStructure = [],
        processingFeeRate = 0,
        processingFeeGLCode,
        lateFeePerDay = 0,
        maxLateFee = 0,
       
        // Product Type Specific
        PRODUCT_SHORT_NAME,
       
        // Backward compatibility
        MIN_LOAN_TERM_MONTHS,
        MAX_LOAN_TERM_MONTHS,
        MIN_DURATION_DAYS,
        MIN_DURATION_WEEKS,
        MIN_DURATION_MONTHS,
        RATE_TY,
        INT_TY,
        CAPITALIZE_INT_FG,
        AMORTIZED,
        REPAYMENT_FREQUENCY,
        TIME,
       
        // Additional Fields
        createdBy = req.user?.id || 'SYSTEM',
        allowedCurrencies = ['NGN'],
        isActive = true,
        STATUS = 'ACTIVE',
        USER_ID = req.user?.id || 'SYSTEM'
      } = req.body;
      // REQUIRED FIELDS VALIDATION
      if (!name || !productCode || !PRODUCT_TYPE) {
        throw new Error('name, productCode, and PRODUCT_TYPE are required');
      }
      // LOAN INTEREST RATE REFERENCE IS REQUIRED
      if (!LOAN_INTEREST_RATE_ID) {
        throw new Error('LOAN_INTEREST_RATE_ID is required - must reference a valid LoanInterestRate');
      }
      // Validate that referenced interest rate exists
      const interestRate = await LoanInterestRate.findById(LOAN_INTEREST_RATE_ID).session(session);
      if (!interestRate) {
        throw new Error(`Loan interest rate with ID ${LOAN_INTEREST_RATE_ID} not found`);
      }
      if (!defaultGLAccounts || !defaultGLAccounts.loanGLAccount) {
        throw new Error('Default loan GL account is required');
      }
      // Validate term fields
      let minTermValue, maxTermValue, termType;
     
      if (MIN_LOAN_TERM_VALUE && MAX_LOAN_TERM_VALUE && LOAN_TERM_TYPE) {
        minTermValue = parseInt(MIN_LOAN_TERM_VALUE);
        maxTermValue = parseInt(MAX_LOAN_TERM_VALUE);
        termType = LOAN_TERM_TYPE.toUpperCase();
      } else if (MIN_LOAN_TERM_MONTHS && MAX_LOAN_TERM_MONTHS) {
        minTermValue = parseInt(MIN_LOAN_TERM_MONTHS);
        maxTermValue = parseInt(MAX_LOAN_TERM_MONTHS);
        termType = 'MONTHS';
      } else if (req.body.minTerm && req.body.maxTerm) {
        minTermValue = parseInt(req.body.minTerm);
        maxTermValue = parseInt(req.body.maxTerm);
        termType = 'MONTHS';
      } else {
        // Use interest rate term values if not provided
        minTermValue = interestRate.MIN_TERM_VALUE || 1;
        maxTermValue = interestRate.MAX_TERM_VALUE || 60;
        termType = interestRate.TERM_TYPE || 'MONTHS';
      }
      // Validate term type
      const validTermTypes = ['DAYS', 'WEEKS', 'MONTHS', 'QUARTERS', 'YEARS'];
      if (!validTermTypes.includes(termType)) {
        throw new Error(`Invalid LOAN_TERM_TYPE. Must be one of: ${validTermTypes.join(', ')}`);
      }
      // Validate min < max term
      if (minTermValue >= maxTermValue) {
        throw new Error('MIN_LOAN_TERM_VALUE must be less than MAX_LOAN_TERM_VALUE');
      }
      if (!minAmount || !maxAmount) {
        throw new Error('minAmount and maxAmount are required');
      }
      // Check for duplicate PROD_ID or PRODUCT_SHORT_NAME
      const existingProduct = await LoanProduct.findOne({
        $or: [
          { PROD_ID: PROD_ID || Number(productCode) },
          { PRODUCT_SHORT_NAME: PRODUCT_SHORT_NAME?.toUpperCase() },
          { productCode }
        ]
      }).session(session);
     
      if (existingProduct) {
        throw new Error('Product with this PROD_ID, PRODUCT_SHORT_NAME, or productCode already exists');
      }
      // Convert term to months for backward compatibility
      const minTermMonths = convertTermToMonths(minTermValue, termType);
      const maxTermMonths = convertTermToMonths(maxTermValue, termType);
      // BU_ID (Branch Code) PROCESSING
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
        allActiveBranches = await Branch.find({ status: 'ACTIVE' }).session(session);
        const allBranchCodes = allActiveBranches.map(b => b.branchCode);
       
        isGlobal = true;
        accessibleBranches = ['*'];
        validatedBranchCodes = ['*', ...allBranchCodes];
       
        const otherCodes = branchCodes.filter(code => code !== '*');
        if (otherCodes.length > 0) {
          console.warn(`Additional branch codes ignored when wildcard (*) is present: ${otherCodes.join(', ')}`);
        }
      } else {
        const validPattern = /^\d{3}$/;
        const invalidFormatCodes = branchCodes.filter(code => !validPattern.test(code));
       
        if (invalidFormatCodes.length > 0) {
          throw new Error(`Invalid BU_ID format: ${invalidFormatCodes.join(', ')}. Must be 3-digit branch codes.`);
        }
       
        const { validCodes, invalidCodes } = await validateBranchCodes(branchCodes, session);
       
        if (invalidCodes.length > 0) {
          throw new Error(`Branch codes do not exist or are not active: ${invalidCodes.join(', ')}`);
        }
       
        isGlobal = false;
        accessibleBranches = validCodes;
        validatedBranchCodes = validCodes;
        allActiveBranches = await Branch.find({
          branchCode: { $in: validCodes },
          status: 'ACTIVE'
        }).session(session);
      }
      // CREATE LOAN PRODUCT WITH REFERENCE TO LOAN INTEREST RATE
      const loanProduct = new LoanProduct({
        // Product Identification
        name,
        productCode,
        PROD_CD: productCode,
        PROD_ID: PROD_ID || Number(productCode),
        PRODUCT_SHORT_NAME: PRODUCT_SHORT_NAME?.toUpperCase(),
        PRODUCT_TYPE,
        description,
        CRNCY_ID,
       
        // Loan Interest Rate Reference (MOST IMPORTANT)
        LOAN_INTEREST_RATE_ID, // Reference to master interest rate
       
        // Flexible Term Fields
        MIN_LOAN_TERM_VALUE: minTermValue,
        MAX_LOAN_TERM_VALUE: maxTermValue,
        LOAN_TERM_TYPE: termType,
       
        // Business Unit Configuration
        BU_ID: validatedBranchCodes,
        isGlobalProduct: isGlobal,
        accessibleBUs: accessibleBranches,
        visibility: isGlobal ? 'GLOBAL' : 'SELECTED_BUS',
       
        // Loan Terms
        minTerm: minTermValue,
        maxTerm: maxTermValue,
        minAmount: toDecimal(minAmount, 'minAmount'),
        maxAmount: toDecimal(maxAmount, 'maxAmount'),
        TERM_CD,
        PAYMENT_FREQUENCY: PAYMENT_FREQUENCY || REPAYMENT_FREQUENCY,
       
        // Backward compatibility fields
        MIN_LOAN_TERM_MONTHS: minTermMonths,
        MAX_LOAN_TERM_MONTHS: maxTermMonths,
        MIN_DURATION_DAYS: termType === 'DAYS' ? minTermValue : (MIN_DURATION_DAYS || 1),
        MIN_DURATION_WEEKS: termType === 'WEEKS' ? minTermValue : (MIN_DURATION_WEEKS || 0),
        MIN_DURATION_MONTHS: termType === 'MONTHS' ? minTermValue : (MIN_DURATION_MONTHS || 1),
       
        TIME: Number(TIME) || 12,
        RATE_TY: RATE_TY || interestRate.RATE_TYPE || 'FIXED',
        INT_TY: INT_TY || interestRate.INTEREST_TYPE || 'SIMPLE',
        CAPITALIZE_INT_FG: CAPITALIZE_INT_FG !== undefined ? CAPITALIZE_INT_FG : false,
        AMORTIZED: AMORTIZED !== undefined ? AMORTIZED : true,
       
        // GL Accounts Configuration
        defaultGLAccounts: {
          loanGLAccount: defaultGLAccounts.loanGLAccount,
          interestGLAccountNo: defaultGLAccounts.interestGLAccountNo,
          // ... (all other GL accounts)
        },
       
        // Branch-specific GL Accounts
        branchGLAccounts: (branchGLAccounts || []).map(branch => ({
          branchCode: branch.branchCode,
          branchName: branch.branchName,
          // ... (all other branch GL accounts)
        })),
       
        // Fee Structure
        feeStructure: (feeStructure || []).map(fee => ({
          feeType: fee.feeType || 'PROCESSING',
          name: fee.name,
          amount: toDecimal(fee.amount, 'fee amount'),
          isPercentage: fee.isPercentage || false,
          glAccountCode: fee.glAccountCode,
          appliesTo: fee.appliesTo || 'DISBURSEMENT',
          isActive: fee.isActive !== undefined ? fee.isActive : true
        })),
       
        processingFeeRate: toDecimal(processingFeeRate, 'processingFeeRate'),
        processingFeeGLCode,
        lateFeePerDay: toDecimal(lateFeePerDay, 'lateFeePerDay'),
        maxLateFee: toDecimal(maxLateFee, 'maxLateFee'),
       
        // Additional Fields
        createdBy,
        USER_ID,
        allowedCurrencies,
        isActive,
        STATUS,
       
        // Metadata for tracking
        metadata: {
          isWildcardProduct: hasWildcard,
          totalBranches: allActiveBranches.length,
          termConfiguration: {
            termType,
            minValue: minTermValue,
            maxValue: maxTermValue,
            minMonths: minTermMonths,
            maxMonths: maxTermMonths,
            termConversionApplied: true
          },
          interestRateConfiguration: {
            masterInterestRateId: LOAN_INTEREST_RATE_ID,
            rateSource: 'LoanInterestRate Master',
            syncWithMaster: true
          }
        }
      });
      await loanProduct.save({ session });
      // Return with populated interest rate
      const populatedProduct = await LoanProduct.findById(loanProduct._id)
        .populate('LOAN_INTEREST_RATE_ID')
        .session(session);
      // PRODUCT TYPE MAPPING
      const productTypeMappingData = {
        PROD_ID: loanProduct.PROD_ID,
        PRODUCT_TYPE: loanProduct.PRODUCT_TYPE,
        productName: name,
        accountPrefix: '10',
        BU_ID: validatedBranchCodes,
        isGlobalProduct: isGlobal,
        visibility: loanProduct.visibility,
        PRODUCT_SHORT_NAME: PRODUCT_SHORT_NAME?.toUpperCase(),
        productCode: productCode,
        description: description,
        // Include interest rate reference
        LOAN_INTEREST_RATE_ID,
        glAccounts: {
          loanGLAccount: defaultGLAccounts.loanGLAccount,
          principalGLAccountNo: defaultGLAccounts.principalGLAccountNo,
          // ... (all GL accounts)
        },
        productTerms: {
          minTerm: minTermValue,
          maxTerm: maxTermValue,
          minAmount: parseFloat(minAmount),
          maxAmount: parseFloat(maxAmount),
          LOAN_TERM_TYPE: termType
        },
        metadata: {
          isWildcard: hasWildcard,
          totalBranches: allActiveBranches.length,
          createdFrom: 'LoanProductController.createProduct',
          interestRateSource: 'LoanInterestRate Master'
        },
        STATUS: 'ACTIVE',
        isActive: true,
        createdBy,
        USER_ID,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      await new ProductTypeMapping(productTypeMappingData).save({ session });
      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: createdBy,
        event_type: 'CREATE',
        action: 'CREATE_LOAN_PRODUCT',
        old_value: null,
        new_value: {
          productCode,
          name,
          PRODUCT_TYPE,
          PRODUCT_SHORT_NAME,
          LOAN_INTEREST_RATE_ID,
          BU_ID: validatedBranchCodes,
          isGlobalProduct: isGlobal,
          termConfiguration: {
            termType,
            minValue: minTermValue,
            maxValue: maxTermValue,
            minMonths: minTermMonths,
            maxMonths: maxTermMonths
          },
          interestRateReference: {
            id: LOAN_INTEREST_RATE_ID,
            name: interestRate.name,
            rateType: interestRate.RATE_TYPE
          },
          branchGLAccountsCount: loanProduct.branchGLAccounts?.length || 0,
          totalBranches: allActiveBranches.length,
          hasWildcard
        },
        ip_address: getClientIp(req),
        entity_id: loanProduct._id.toString(),
        entity_type: 'LoanProduct',
        status: 'SUCCESS',
        description: `Created loan product: ${name} (${productCode}) referencing LoanInterestRate: ${interestRate.name}`,
        timestamp: new Date()
      };
      await new AuditTrail(auditTrailData).save({ session });
      await session.commitTransaction();
      res.status(201).json({
        success: true,
        message: `Loan product created successfully for ${isGlobal ? 'all branches' : `${accessibleBranches.length} branches`}`,
        data: {
          PROD_ID: loanProduct.PROD_ID,
          productCode,
          name,
          PRODUCT_TYPE,
          PRODUCT_SHORT_NAME,
          termInfo: {
            minValue: minTermValue,
            maxValue: maxTermValue,
            type: termType,
            minMonths: minTermMonths,
            maxMonths: maxTermMonths,
            formattedRange: `${minTermValue}-${maxTermValue} ${termType}`
          },
          interestRate: {
            hasMasterReference: true,
            masterInterestRateId: LOAN_INTEREST_RATE_ID,
            masterDetails: {
              name: interestRate.name,
              rateType: interestRate.RATE_TYPE,
              minRate: parseFloat(interestRate.MIN_RATE_PER_MONTH?.toString() || '0'),
              maxRate: parseFloat(interestRate.MAX_RATE_PER_MONTH?.toString() || '0'),
              defaultRate: parseFloat(interestRate.DEFAULT_RATE_PER_MONTH?.toString() || '0'),
              calculationMethod: interestRate.CALCULATION_METHOD
            }
          },
          BU_ID: accessibleBranches,
          isGlobalProduct: isGlobal,
          totalBranches: allActiveBranches.length,
          createdBy,
          createdAt: new Date().toISOString()
        }
      });
    } catch (error) {
      await session.abortTransaction();
      console.error('❌ Product creation failed:', error.message);
      logger.error('Product creation failed:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create loan product',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    } finally {
      session.endSession();
    }
  }),

  // NEW: CALCULATE LOAN REPAYMENT BASED ON INTEREST RATE REFERENCE
  calculateLoanRepayment: asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const {
      principal,
      termValue,
      termType,
      useDefaultRate = true,
      customRate,
      repaymentFrequency = 'MONTHLY'
    } = req.body;
    if (!principal || !termValue || !termType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: principal, termValue, termType'
      });
    }
    // Find product with populated interest rate
    const product = await LoanProduct.findOne({
      PROD_ID: productId,
      STATUS: 'ACTIVE'
    }).populate('LOAN_INTEREST_RATE_ID');
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Active loan product not found'
      });
    }
    if (!product.LOAN_INTEREST_RATE_ID) {
      return res.status(400).json({
        success: false,
        message: 'Product does not have a valid interest rate reference'
      });
    }
    // Get the interest rate to use
    let interestRate;
    if (useDefaultRate) {
      interestRate = parseFloat(product.LOAN_INTEREST_RATE_ID.DEFAULT_RATE_PER_MONTH?.toString() || '0');
    } else if (customRate) {
      interestRate = parseFloat(customRate);
     
      // Validate custom rate is within allowed range
      const minRate = parseFloat(product.LOAN_INTEREST_RATE_ID.MIN_RATE_PER_MONTH?.toString() || '0');
      const maxRate = parseFloat(product.LOAN_INTEREST_RATE_ID.MAX_RATE_PER_MONTH?.toString() || '100');
     
      if (interestRate < minRate || interestRate > maxRate) {
        return res.status(400).json({
          success: false,
          message: `Custom rate ${interestRate}% is outside allowed range (${minRate}% - ${maxRate}%)`
        });
      }
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either useDefaultRate must be true or customRate must be provided'
      });
    }
    const principalNum = parseFloat(principal);
    const termValueNum = parseInt(termValue);
    const termTypeUpper = termType.toUpperCase();
    // Convert term to months based on term type
    let termInMonths;
    switch(termTypeUpper) {
      case 'DAYS':
        termInMonths = Math.ceil(termValueNum / 30);
        break;
      case 'WEEKS':
        termInMonths = Math.ceil(termValueNum / 4);
        break;
      case 'MONTHS':
        termInMonths = termValueNum;
        break;
      case 'QUARTERS':
        termInMonths = termValueNum * 3;
        break;
      case 'YEARS':
        termInMonths = termValueNum * 12;
        break;
      default:
        termInMonths = termValueNum;
    }
    // Calculate based on interest type from LoanInterestRate
    const interestType = product.LOAN_INTEREST_RATE_ID.INTEREST_TYPE || 'SIMPLE';
    const calculationMethod = product.LOAN_INTEREST_RATE_ID.CALCULATION_METHOD || 'FLAT';
    const isAmortized = product.AMORTIZED !== false;
    const rateType = product.LOAN_INTEREST_RATE_ID.RATE_TYPE || 'FIXED';
    let totalInterest, monthlyPayment, totalPayment;
    const monthlyRate = interestRate / 100; // Convert percentage to decimal
    if (!isAmortized) {
      // Interest only payments
      totalInterest = principalNum * monthlyRate * termInMonths;
      monthlyPayment = totalInterest / termInMonths;
      totalPayment = principalNum + totalInterest;
    } else if (interestType.toUpperCase() === 'SIMPLE') {
      // Simple amortized
      totalInterest = principalNum * monthlyRate * termInMonths;
      totalPayment = principalNum + totalInterest;
      monthlyPayment = totalPayment / termInMonths;
    } else if (interestType.toUpperCase() === 'COMPOUND') {
      // Compound amortized
      if (monthlyRate === 0) {
        monthlyPayment = principalNum / termInMonths;
      } else {
        const rateFactor = Math.pow(1 + monthlyRate, termInMonths);
        monthlyPayment = principalNum * (monthlyRate * rateFactor) / (rateFactor - 1);
      }
      totalPayment = monthlyPayment * termInMonths;
      totalInterest = totalPayment - principalNum;
    } else {
      // Default to simple amortized
      totalInterest = principalNum * monthlyRate * termInMonths;
      totalPayment = principalNum + totalInterest;
      monthlyPayment = totalPayment / termInMonths;
    }
    // Calculate payment schedule
    const paymentSchedule = [];
    let remainingBalance = principalNum;
    let totalInterestPaid = 0;
    for (let i = 1; i <= termInMonths; i++) {
      let interestPayment, principalPayment, totalPaymentThisMonth;
     
      if (isAmortized && interestType.toUpperCase() === 'COMPOUND') {
        // Amortization schedule for compound
        interestPayment = remainingBalance * monthlyRate;
        principalPayment = monthlyPayment - interestPayment;
        totalPaymentThisMonth = monthlyPayment;
      } else {
        // Equal payments for simple or non-amortized
        if (isAmortized) {
          interestPayment = totalInterest / termInMonths;
          principalPayment = principalNum / termInMonths;
          totalPaymentThisMonth = monthlyPayment;
        } else {
          interestPayment = totalInterest / termInMonths;
          principalPayment = 0;
          totalPaymentThisMonth = monthlyPayment;
        }
      }
     
      remainingBalance -= principalPayment;
      totalInterestPaid += interestPayment;
     
      paymentSchedule.push({
        installment: i,
        paymentDate: new Date(Date.now() + i * 30 * 24 * 60 * 60 * 1000), // Approximate
        principalPayment: parseFloat(principalPayment.toFixed(2)),
        interestPayment: parseFloat(interestPayment.toFixed(2)),
        totalPayment: parseFloat(totalPaymentThisMonth.toFixed(2)),
        remainingBalance: parseFloat(Math.max(0, remainingBalance).toFixed(2)),
        cumulativeInterest: parseFloat(totalInterestPaid.toFixed(2))
      });
    }
    res.json({
      success: true,
      data: {
        principal: principalNum,
        termValue: termValueNum,
        termType: termTypeUpper,
        termInMonths,
        interestType,
        calculationMethod,
        rateType,
        interestRate: parseFloat(interestRate.toFixed(4)),
        monthlyRate: parseFloat((monthlyRate * 100).toFixed(4)),
        totalInterest: parseFloat(totalInterest.toFixed(2)),
        totalPayment: parseFloat(totalPayment.toFixed(2)),
        monthlyPayment: parseFloat(monthlyPayment.toFixed(2)),
        paymentSchedule
      }
    });
  }),

  // AND KEEP YOUR SEPARATE validateLoanApplication method:
  validateLoanApplication: asyncHandler(async (req, res) => {
    const { productId, amount, termValue, termType, requestedRate } = req.body;
    if (!productId || !amount || !termValue || !termType) {
        return res.status(400).json({
            success: false,
            message: 'Missing required fields: productId, amount, termValue, termType'
        });
    }
    // Find product with populated interest rate
    const product = await LoanProduct.findOne({
        PROD_ID: productId,
        STATUS: 'ACTIVE'
    }).populate('LOAN_INTEREST_RATE_ID');
    if (!product) {
        return res.status(404).json({
            success: false,
            message: 'Product not found'
        });
    }
    // Validate using product's own method if available
    let validation;
    if (product.validateLoanApplication) {
        validation = await product.validateLoanApplication(amount, termValue, termType);
    } else {
        // Fallback validation
        validation = {
            isValid: true,
            errors: []
        };
        // Validate amount
        const amountNum = parseFloat(amount);
        const minAmount = parseFloat(product.minAmount?.toString() || '0');
        const maxAmount = parseFloat(product.maxAmount?.toString() || '999999999');
       
        if (amountNum < minAmount) {
            validation.isValid = false;
            validation.errors.push(`Loan amount (${amountNum}) is below minimum (${minAmount})`);
        }
        if (amountNum > maxAmount) {
            validation.isValid = false;
            validation.errors.push(`Loan amount (${amountNum}) exceeds maximum (${maxAmount})`);
        }
        // Validate term
        const termValueNum = parseInt(termValue);
        const productTermType = product.LOAN_TERM_TYPE || 'MONTHS';
       
        if (termType.toUpperCase() !== productTermType) {
            validation.isValid = false;
            validation.errors.push(`Term type (${termType}) does not match product term type (${productTermType})`);
        } else {
            const minTerm = product.MIN_LOAN_TERM_VALUE || product.minTerm || 1;
            const maxTerm = product.MAX_LOAN_TERM_VALUE || product.maxTerm || 60;
           
            if (termValueNum < minTerm) {
                validation.isValid = false;
                validation.errors.push(`Term value (${termValueNum}) is below minimum (${minTerm})`);
            }
            if (termValueNum > maxTerm) {
                validation.isValid = false;
                validation.errors.push(`Term value (${termValueNum}) exceeds maximum (${maxTerm})`);
            }
        }
        // Validate rate if requested
        if (requestedRate && product.LOAN_INTEREST_RATE_ID) {
            const requestedRateNum = parseFloat(requestedRate);
            const minRate = parseFloat(product.LOAN_INTEREST_RATE_ID.MIN_RATE_PER_MONTH?.toString() || '0');
            const maxRate = parseFloat(product.LOAN_INTEREST_RATE_ID.MAX_RATE_PER_MONTH?.toString() || '100');
           
            if (requestedRateNum < minRate) {
                validation.isValid = false;
                validation.errors.push(`Requested rate (${requestedRate}%) is below minimum (${minRate}%)`);
            }
            if (requestedRateNum > maxRate) {
                validation.isValid = false;
                validation.errors.push(`Requested rate (${requestedRate}%) exceeds maximum (${maxRate}%)`);
            }
        }
    }
    res.json({
        success: true,
        data: {
            product: {
                id: product.PROD_ID,
                name: product.name,
                minAmount: parseFloat(product.minAmount.toString()),
                maxAmount: parseFloat(product.maxAmount.toString()),
                minTerm: product.minTerm,
                maxTerm: product.maxTerm,
                LOAN_TERM_TYPE: product.LOAN_TERM_TYPE
            },
            interestRate: product.LOAN_INTEREST_RATE_ID ? {
                id: product.LOAN_INTEREST_RATE_ID._id,
                name: product.LOAN_INTEREST_RATE_ID.name,
                minRate: parseFloat(product.LOAN_INTEREST_RATE_ID.MIN_RATE_PER_MONTH.toString()),
                maxRate: parseFloat(product.LOAN_INTEREST_RATE_ID.MAX_RATE_PER_MONTH.toString()),
                defaultRate: parseFloat(product.LOAN_INTEREST_RATE_ID.DEFAULT_RATE_PER_MONTH.toString()),
                rateType: product.LOAN_INTEREST_RATE_ID.RATE_TYPE,
                calculationMethod: product.LOAN_INTEREST_RATE_ID.CALCULATION_METHOD
            } : null,
            validation
        }
    });
  }),

  // NEW: CALCULATE INTEREST FOR SPECIFIC PERIOD
  calculateInterestForPeriod: asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const {
      principal,
      startDate,
      endDate,
      useDefaultRate = true,
      customRate
    } = req.body;
    if (!principal || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: principal, startDate, endDate'
      });
    }
    // Find product with populated interest rate
    const product = await LoanProduct.findOne({
      PROD_ID: productId,
      STATUS: 'ACTIVE'
    }).populate('LOAN_INTEREST_RATE_ID');
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Active loan product not found'
      });
    }
    if (!product.LOAN_INTEREST_RATE_ID) {
      return res.status(400).json({
        success: false,
        message: 'Product does not have a valid interest rate reference'
      });
    }
    // Get the interest rate to use
    let interestRate;
    if (useDefaultRate) {
      interestRate = parseFloat(product.LOAN_INTEREST_RATE_ID.DEFAULT_RATE_PER_MONTH?.toString() || '0');
    } else if (customRate) {
      interestRate = parseFloat(customRate);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Either useDefaultRate must be true or customRate must be provided'
      });
    }
    const principalNum = parseFloat(principal);
    const start = new Date(startDate);
    const end = new Date(endDate);
   
    // Calculate number of days between dates
    const timeDiff = end.getTime() - start.getTime();
    const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
    const monthsDiff = daysDiff / 30.44; // Average days in month
    // Calculate interest based on interest type
    const interestType = product.LOAN_INTEREST_RATE_ID.INTEREST_TYPE || 'SIMPLE';
    const monthlyRate = interestRate / 100;
   
    let interestAmount;
   
    if (interestType.toUpperCase() === 'SIMPLE') {
      // Simple interest: Principal × Rate × Time
      interestAmount = principalNum * monthlyRate * monthsDiff;
    } else if (interestType.toUpperCase() === 'COMPOUND') {
      // Compound interest: Principal × (1 + Rate)^Time - Principal
      interestAmount = principalNum * (Math.pow(1 + monthlyRate, monthsDiff) - 1);
    } else {
      // Default to simple interest
      interestAmount = principalNum * monthlyRate * monthsDiff;
    }
    res.json({
      success: true,
      message: 'Interest calculated successfully',
      data: {
        product: {
          id: product.PROD_ID,
          name: product.name,
          interestRateId: product.LOAN_INTEREST_RATE_ID._id
        },
        period: {
          startDate: start.toISOString().split('T')[0],
          endDate: end.toISOString().split('T')[0],
          days: daysDiff,
          months: parseFloat(monthsDiff.toFixed(2))
        },
        calculation: {
          principal: principalNum,
          interestRate: interestRate,
          interestType: interestType,
          interestAmount: parseFloat(interestAmount.toFixed(2)),
          totalAmount: parseFloat((principalNum + interestAmount).toFixed(2)),
          dailyInterest: parseFloat((interestAmount / daysDiff).toFixed(2)),
          monthlyInterest: parseFloat((interestAmount / monthsDiff).toFixed(2))
        }
      }
    });
  }),

  // NEW: COMPARE INTEREST RATES FOR PRODUCT
  compareInterestRates: asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const { principal, termValue, termType, ratesToCompare = [] } = req.body;
    if (!principal || !termValue || !termType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: principal, termValue, termType'
      });
    }
    // Find product with populated interest rate
    const product = await LoanProduct.findOne({
      PROD_ID: productId,
      STATUS: 'ACTIVE'
    }).populate('LOAN_INTEREST_RATE_ID');
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Active loan product not found'
      });
    }
    if (!product.LOAN_INTEREST_RATE_ID) {
      return res.status(400).json({
        success: false,
        message: 'Product does not have a valid interest rate reference'
      });
    }
    const principalNum = parseFloat(principal);
    const termValueNum = parseInt(termValue);
   
    // Convert term to months
    const termInMonths = convertTermToMonths(termValueNum, termType);
   
    // Get product's default rate
    const defaultRate = parseFloat(product.LOAN_INTEREST_RATE_ID.DEFAULT_RATE_PER_MONTH?.toString() || '0');
    const minRate = parseFloat(product.LOAN_INTEREST_RATE_ID.MIN_RATE_PER_MONTH?.toString() || '0');
    const maxRate = parseFloat(product.LOAN_INTEREST_RATE_ID.MAX_RATE_PER_MONTH?.toString() || '0');
   
    // Prepare rates to compare (include min, default, max, and any custom rates)
    const rates = [
      {
        name: 'Minimum Rate',
        rate: minRate,
        type: 'MINIMUM'
      },
      {
        name: 'Default Rate',
        rate: defaultRate,
        type: 'DEFAULT'
      },
      {
        name: 'Maximum Rate',
        rate: maxRate,
        type: 'MAXIMUM'
      },
      ...ratesToCompare.map((rate, index) => ({
        name: `Custom Rate ${index + 1}`,
        rate: parseFloat(rate),
        type: 'CUSTOM'
      }))
    ];
    // Calculate for each rate
    const comparisons = rates.map(rateInfo => {
      const monthlyRate = rateInfo.rate / 100;
      const totalInterest = principalNum * monthlyRate * termInMonths;
      const totalPayment = principalNum + totalInterest;
      const monthlyPayment = totalPayment / termInMonths;
     
      return {
        rateName: rateInfo.name,
        rateValue: rateInfo.rate,
        rateType: rateInfo.type,
        calculations: {
          totalInterest: parseFloat(totalInterest.toFixed(2)),
          totalPayment: parseFloat(totalPayment.toFixed(2)),
          monthlyPayment: parseFloat(monthlyPayment.toFixed(2)),
          interestPercentage: parseFloat((totalInterest / principalNum * 100).toFixed(2))
        },
        comparison: {
          vsMin: rateInfo.rate - minRate,
          vsDefault: rateInfo.rate - defaultRate,
          vsMax: rateInfo.rate - maxRate
        }
      };
    });
    res.json({
      success: true,
      message: 'Interest rates compared successfully',
      data: {
        product: {
          id: product.PROD_ID,
          name: product.name,
          interestRateName: product.LOAN_INTEREST_RATE_ID.name
        },
        loanDetails: {
          principal: principalNum,
          term: {
            value: termValueNum,
            type: termType,
            inMonths: termInMonths
          }
        },
        rateRange: {
          min: minRate,
          default: defaultRate,
          max: maxRate,
          spread: maxRate - minRate
        },
        comparisons: comparisons,
        summary: {
          bestRate: Math.min(...rates.map(r => r.rate)),
          worstRate: Math.max(...rates.map(r => r.rate)),
          averageRate: rates.reduce((sum, r) => sum + r.rate, 0) / rates.length,
          recommendedRate: defaultRate
        }
      }
    });
  }),

  // NEW: SIMULATE INTEREST RATE CHANGES
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
      PROD_ID: productId,
      STATUS: 'ACTIVE'
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
   
    // Validate new rate is within product's allowed range if product has interest rate reference
    if (product.LOAN_INTEREST_RATE_ID) {
      const populatedProduct = await LoanProduct.findById(product._id).populate('LOAN_INTEREST_RATE_ID');
      const minRate = parseFloat(populatedProduct.LOAN_INTEREST_RATE_ID.MIN_RATE_PER_MONTH?.toString() || '0');
      const maxRate = parseFloat(populatedProduct.LOAN_INTEREST_RATE_ID.MAX_RATE_PER_MONTH?.toString() || '100');
     
      if (newRateNum < minRate || newRateNum > maxRate) {
        return res.status(400).json({
          success: false,
          message: `New rate ${newRateNum}% is outside product's allowed range (${minRate}% - ${maxRate}%)`
        });
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
     
      return { type: 'productCode', value: id };
    };
    if (shortName) {
      // Find by PRODUCT_SHORT_NAME with populated interest rate
      product = await LoanProduct.findOne({
        PRODUCT_SHORT_NAME: shortName.toUpperCase(),
        STATUS: 'ACTIVE'
      }).populate('LOAN_INTEREST_RATE_ID');
    } else {
      // Parse the ID to determine what type it is
      const parsedId = parseProductId(id);
      let query;
      switch (parsedId.type) {
        case 'PROD_ID':
          query = { PROD_ID: parsedId.value, STATUS: 'ACTIVE' };
          break;
        case '_id':
          query = { _id: parsedId.value, STATUS: 'ACTIVE' };
          break;
        case 'productCode':
          query = { productCode: parsedId.value, STATUS: 'ACTIVE' };
          break;
      }
     
      product = await LoanProduct.findOne(query).populate('LOAN_INTEREST_RATE_ID');
    }
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Active loan product not found'
      });
    }
    // Get branch details
    const branchDetails = [];
    for (const branchCode of product.BU_ID) {
      if (branchCode === '*') {
        branchDetails.push({
          branchCode: '*',
          branchName: 'All Branches',
          branchType: 'GLOBAL'
        });
      } else {
        const branch = await Branch.findOne({ branchCode });
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
    // Calculate term information
    const termInfo = {
      type: product.LOAN_TERM_TYPE || 'MONTHS',
      minValue: product.MIN_LOAN_TERM_VALUE || product.minTerm || 1,
      maxValue: product.MAX_LOAN_TERM_VALUE || product.maxTerm || 60,
      formattedRange: `${product.MIN_LOAN_TERM_VALUE || product.minTerm || 1}-${product.MAX_LOAN_TERM_VALUE || product.maxTerm || 60} ${product.LOAN_TERM_TYPE || 'MONTHS'}`,
      minMonths: product.MIN_LOAN_TERM_MONTHS || convertTermToMonths(product.MIN_LOAN_TERM_VALUE || product.minTerm, product.LOAN_TERM_TYPE || 'MONTHS'),
      maxMonths: product.MAX_LOAN_TERM_MONTHS || convertTermToMonths(product.MAX_LOAN_TERM_VALUE || product.maxTerm, product.LOAN_TERM_TYPE || 'MONTHS')
    };
    // Combine product and interest rate data
    const responseData = {
      ...product.toObject(),
      branchDetails,
      termInfo,
      interestDetails: product.LOAN_INTEREST_RATE_ID ? {
        id: product.LOAN_INTEREST_RATE_ID._id,
        name: product.LOAN_INTEREST_RATE_ID.name,
        description: product.LOAN_INTEREST_RATE_ID.description,
        RATE_TYPE: product.LOAN_INTEREST_RATE_ID.RATE_TYPE,
        INTEREST_TYPE: product.LOAN_INTEREST_RATE_ID.INTEREST_TYPE,
        CALCULATION_METHOD: product.LOAN_INTEREST_RATE_ID.CALCULATION_METHOD,
        MIN_RATE_PER_MONTH: parseFloat(product.LOAN_INTEREST_RATE_ID.MIN_RATE_PER_MONTH?.toString() || '0'),
        MAX_RATE_PER_MONTH: parseFloat(product.LOAN_INTEREST_RATE_ID.MAX_RATE_PER_MONTH?.toString() || '0'),
        DEFAULT_RATE_PER_MONTH: parseFloat(product.LOAN_INTEREST_RATE_ID.DEFAULT_RATE_PER_MONTH?.toString() || '0'),
        TOTAL_INTEREST_RATE: parseFloat(product.LOAN_INTEREST_RATE_ID.TOTAL_INTEREST_RATE?.toString() || '0'),
        MIN_TERM_VALUE: product.LOAN_INTEREST_RATE_ID.MIN_TERM_VALUE,
        MAX_TERM_VALUE: product.LOAN_INTEREST_RATE_ID.MAX_TERM_VALUE,
        TERM_TYPE: product.LOAN_INTEREST_RATE_ID.TERM_TYPE
      } : null
    };
    res.json({
      success: true,
      data: responseData
    });
  }),

  // UPDATE LOAN PRODUCT
  updateLoanProduct: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
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
     
      let query;
      switch (parsedId.type) {
        case 'PROD_ID':
          query = { PROD_ID: parsedId.value };
          break;
        case '_id':
          query = { _id: parsedId.value };
          break;
        case 'productCode':
          query = { productCode: parsedId.value };
          break;
      }
      const product = await LoanProduct.findOne(query).session(session);
      if (!product) {
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
        isActive: product.isActive,
        minAmount: parseFloat(product.minAmount.toString()),
        maxAmount: parseFloat(product.maxAmount.toString()),
        MIN_LOAN_TERM_VALUE: product.MIN_LOAN_TERM_VALUE,
        MAX_LOAN_TERM_VALUE: product.MAX_LOAN_TERM_VALUE,
        LOAN_TERM_TYPE: product.LOAN_TERM_TYPE,
        BU_ID: product.BU_ID,
        STATUS: product.STATUS
      };
      // If updating LOAN_INTEREST_RATE_ID, validate the new reference
      if (updateData.LOAN_INTEREST_RATE_ID) {
        const newInterestRate = await LoanInterestRate.findById(updateData.LOAN_INTEREST_RATE_ID).session(session);
        if (!newInterestRate) {
          throw new Error(`Loan interest rate with ID ${updateData.LOAN_INTEREST_RATE_ID} not found`);
        }
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
       
        // Set backward compatibility fields
        updateData.minTerm = minTerm;
        updateData.maxTerm = maxTerm;
      }
      // Handle BU_ID updates
      if (updateData.BU_ID) {
        let branchCodes = Array.isArray(updateData.BU_ID) ? updateData.BU_ID.map(String) :
                         typeof updateData.BU_ID === 'string' ? updateData.BU_ID.split(',').map(String) :
                         [String(updateData.BU_ID)];
       
        branchCodes = branchCodes.map(code => code.trim()).filter(Boolean);
        branchCodes = [...new Set(branchCodes)];
        // Validate branch codes
        const { validCodes, invalidCodes } = await validateBranchCodes(branchCodes, session);
       
        if (invalidCodes.length > 0) {
          throw new Error(`Invalid branch codes: ${invalidCodes.join(', ')}. Please use valid 3-digit branch codes.`);
        }
        updateData.BU_ID = branchCodes;
        updateData.isGlobalProduct = branchCodes.includes('*');
        updateData.accessibleBUs = branchCodes.includes('*') ? ['*'] : validCodes;
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
      const updatedProduct = await LoanProduct.findOneAndUpdate(
        query,
        updateData,
        { new: true, runValidators: true, session }
      ).populate('LOAN_INTEREST_RATE_ID');
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
       
        await ProductTypeMapping.findOneAndUpdate(
          { PROD_ID: product.PROD_ID },
          mappingUpdate,
          { session }
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
          isActive: updatedProduct.isActive,
          minAmount: parseFloat(updatedProduct.minAmount.toString()),
          maxAmount: parseFloat(updatedProduct.maxAmount.toString()),
          MIN_LOAN_TERM_VALUE: updatedProduct.MIN_LOAN_TERM_VALUE,
          MAX_LOAN_TERM_VALUE: updatedProduct.MAX_LOAN_TERM_VALUE,
          LOAN_TERM_TYPE: updatedProduct.LOAN_TERM_TYPE,
          BU_ID: updatedProduct.BU_ID,
          STATUS: updatedProduct.STATUS,
          updatedFields: Object.keys(updateData)
        },
        ip_address: getClientIp(req),
        entity_id: updatedProduct._id,
        entity_type: 'LoanProduct',
        status: 'SUCCESS',
        description: `Updated loan product: ${updatedProduct.name}`,
        timestamp: new Date()
      };
      await new AuditTrail(auditTrailData).save({ session });
      await session.commitTransaction();
      res.json({
        success: true,
        message: 'Loan product updated successfully',
        data: updatedProduct
      });
    } catch (error) {
      await session.abortTransaction();
      logger.error('Product update failed:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to update loan product'
      });
    } finally {
      session.endSession();
    }
  }),

  // DELETE LOAN PRODUCT (Soft Delete)
  deleteLoanProduct: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
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
     
      let query;
      switch (parsedId.type) {
        case 'PROD_ID':
          query = { PROD_ID: parsedId.value };
          break;
        case '_id':
          query = { _id: parsedId.value };
          break;
        case 'productCode':
          query = { productCode: parsedId.value };
          break;
      }
      const product = await LoanProduct.findOne(query).session(session);
      if (!product) {
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
        BU_ID: product.BU_ID,
        STATUS: 'ACTIVE'
      };
      // Soft delete - update status to INACTIVE
      product.STATUS = 'INACTIVE';
      product.isActive = false;
      await product.save({ session });
      // Also update ProductTypeMapping
      await ProductTypeMapping.findOneAndUpdate(
        { PROD_ID: product.PROD_ID },
        {
          STATUS: 'INACTIVE',
          isActive: false
        },
        { session }
      );
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
        entity_id: product._id,
        entity_type: 'LoanProduct',
        status: 'SUCCESS',
        description: `Deactivated loan product: ${product.name} (${product.productCode})`,
        timestamp: new Date()
      };
      await new AuditTrail(auditTrailData).save({ session });
      await session.commitTransaction();
      res.json({
        success: true,
        message: 'Loan product deactivated successfully'
      });
    } catch (error) {
      await session.abortTransaction();
      logger.error('Product deletion failed:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to deactivate loan product'
      });
    } finally {
      session.endSession();
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
    const query = { STATUS: status };
    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { productCode: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { PRODUCT_SHORT_NAME: { $regex: search, $options: 'i' } }
      ];
    }
    // Product type filter
    if (productType) {
      query.PRODUCT_TYPE = productType;
    }
    // Term type filter
    if (termType) {
      query.LOAN_TERM_TYPE = termType.toUpperCase();
    }
    // Active status filter
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    // Business Unit (branch code) filter
    if (buId) {
      const branch = await Branch.findOne({
        branchCode: buId,
        status: 'ACTIVE'
      });
     
      if (!branch) {
        return res.status(400).json({
          success: false,
          message: `Branch with code ${buId} not found or inactive`
        });
      }
     
      query.BU_ID = { $in: [buId, '*'] };
    }
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: 'LOAN_INTEREST_RATE_ID',
      lean: true
    };
    const products = await LoanProduct.paginate(query, options);
    // Enhance products with branch details
    const enhancedProducts = await Promise.all(
      products.docs.map(async (product) => {
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
            const branch = await Branch.findOne({ branchCode });
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
       
        // Calculate term information
        const termInfo = {
          type: product.LOAN_TERM_TYPE || 'MONTHS',
          minValue: product.MIN_LOAN_TERM_VALUE || product.minTerm || 1,
          maxValue: product.MAX_LOAN_TERM_VALUE || product.maxTerm || 60,
          formattedRange: `${product.MIN_LOAN_TERM_VALUE || product.minTerm || 1}-${product.MAX_LOAN_TERM_VALUE || product.maxTerm || 60} ${product.LOAN_TERM_TYPE || 'MONTHS'}`,
          minMonths: product.MIN_LOAN_TERM_MONTHS || convertTermToMonths(product.MIN_LOAN_TERM_VALUE || product.minTerm, product.LOAN_TERM_TYPE || 'MONTHS'),
          maxMonths: product.MAX_LOAN_TERM_MONTHS || convertTermToMonths(product.MAX_LOAN_TERM_VALUE || product.maxTerm, product.LOAN_TERM_TYPE || 'MONTHS')
        };
       
        return {
          PROD_ID: product.PROD_ID,
          PRODUCT_NAME: product.name,
          PRODUCT_SHORT_NAME: product.PRODUCT_SHORT_NAME,
          PRODUCT_TYPE: product.PRODUCT_TYPE,
          MIN_LOAN_AMOUNT: parseFloat(product.minAmount?.toString() || '0'),
          MAX_LOAN_AMOUNT: parseFloat(product.maxAmount?.toString() || '0'),
          // Term Information
          LOAN_TERM_TYPE: termInfo.type,
          MIN_LOAN_TERM_VALUE: termInfo.minValue,
          MAX_LOAN_TERM_VALUE: termInfo.maxValue,
          TERM_RANGE: termInfo.formattedRange,
          // Interest Rate Information
          HAS_INTEREST_RATE_REFERENCE: !!product.LOAN_INTEREST_RATE_ID,
          INTEREST_RATE: product.LOAN_INTEREST_RATE_ID ? {
            id: product.LOAN_INTEREST_RATE_ID._id,
            name: product.LOAN_INTEREST_RATE_ID.name,
            rateType: product.LOAN_INTEREST_RATE_ID.RATE_TYPE,
            minRate: parseFloat(product.LOAN_INTEREST_RATE_ID.MIN_RATE_PER_MONTH?.toString() || '0'),
            maxRate: parseFloat(product.LOAN_INTEREST_RATE_ID.MAX_RATE_PER_MONTH?.toString() || '0'),
            defaultRate: parseFloat(product.LOAN_INTEREST_RATE_ID.DEFAULT_RATE_PER_MONTH?.toString() || '0')
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
        page: options.page,
        limit: options.limit,
        total: products.total,
        pages: products.pages
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
    const interestRate = await LoanInterestRate.findById(interestRateId);
    if (!interestRate) {
      return res.status(404).json({
        success: false,
        message: 'Loan interest rate not found'
      });
    }
    const query = {
      STATUS: status,
      LOAN_INTEREST_RATE_ID: interestRateId
    };
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      lean: true
    };
    const products = await LoanProduct.paginate(query, options);
    res.json({
      success: true,
      message: `Products using interest rate: ${interestRate.name}`,
      data: {
        interestRate: {
          id: interestRate._id,
          name: interestRate.name,
          rateType: interestRate.RATE_TYPE,
          minRate: parseFloat(interestRate.MIN_RATE_PER_MONTH?.toString() || '0'),
          maxRate: parseFloat(interestRate.MAX_RATE_PER_MONTH?.toString() || '0'),
          defaultRate: parseFloat(interestRate.DEFAULT_RATE_PER_MONTH?.toString() || '0')
        },
        products: products.docs.map(product => ({
          PROD_ID: product.PROD_ID,
          PRODUCT_NAME: product.name,
          PRODUCT_SHORT_NAME: product.PRODUCT_SHORT_NAME,
          PRODUCT_TYPE: product.PRODUCT_TYPE,
          MIN_LOAN_AMOUNT: parseFloat(product.minAmount?.toString() || '0'),
          MAX_LOAN_AMOUNT: parseFloat(product.maxAmount?.toString() || '0'),
          LOAN_TERM_TYPE: product.LOAN_TERM_TYPE,
          MIN_LOAN_TERM_VALUE: product.MIN_LOAN_TERM_VALUE,
          MAX_LOAN_TERM_VALUE: product.MAX_LOAN_TERM_VALUE,
          isGlobalProduct: product.isGlobalProduct,
          BU_ID: product.BU_ID,
          createdAt: product.createdAt
        })),
        pagination: {
          page: options.page,
          limit: options.limit,
          total: products.total,
          pages: products.pages
        }
      }
    });
  }),

  // CHANGE INTEREST RATE FOR PRODUCT
  changeProductInterestRate: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const { productId } = req.params;
      const { newInterestRateId, reason, effectiveDate } = req.body;
      if (!newInterestRateId || !reason) {
        throw new Error('newInterestRateId and reason are required');
      }
      // Validate new interest rate exists
      const newInterestRate = await LoanInterestRate.findById(newInterestRateId).session(session);
      if (!newInterestRate) {
        throw new Error(`Loan interest rate with ID ${newInterestRateId} not found`);
      }
      // Find product
      const product = await LoanProduct.findOne({ PROD_ID: productId }).session(session);
      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Loan product not found'
        });
      }
      // Store old interest rate
      const oldInterestRateId = product.LOAN_INTEREST_RATE_ID;
      const oldInterestRate = await LoanInterestRate.findById(oldInterestRateId).session(session);
      // Update product with new interest rate
      product.LOAN_INTEREST_RATE_ID = newInterestRateId;
      await product.save({ session });
      // Update ProductTypeMapping
      await ProductTypeMapping.findOneAndUpdate(
        { PROD_ID: product.PROD_ID },
        {
          LOAN_INTEREST_RATE_ID: newInterestRateId,
          updatedAt: new Date()
        },
        { session }
      );
      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        event_type: 'UPDATE',
        action: 'CHANGE_PRODUCT_INTEREST_RATE',
        old_value: {
          LOAN_INTEREST_RATE_ID: oldInterestRateId,
          interestRateName: oldInterestRate?.name,
          interestRateType: oldInterestRate?.RATE_TYPE,
          minRate: oldInterestRate ? parseFloat(oldInterestRate.MIN_RATE_PER_MONTH?.toString() || '0') : null,
          maxRate: oldInterestRate ? parseFloat(oldInterestRate.MAX_RATE_PER_MONTH?.toString() || '0') : null,
          defaultRate: oldInterestRate ? parseFloat(oldInterestRate.DEFAULT_RATE_PER_MONTH?.toString() || '0') : null
        },
        new_value: {
          LOAN_INTEREST_RATE_ID: newInterestRateId,
          interestRateName: newInterestRate.name,
          interestRateType: newInterestRate.RATE_TYPE,
          minRate: parseFloat(newInterestRate.MIN_RATE_PER_MONTH?.toString() || '0'),
          maxRate: parseFloat(newInterestRate.MAX_RATE_PER_MONTH?.toString() || '0'),
          defaultRate: parseFloat(newInterestRate.DEFAULT_RATE_PER_MONTH?.toString() || '0'),
          reason,
          effectiveDate: effectiveDate || new Date().toISOString()
        },
        ip_address: getClientIp(req),
        entity_id: product._id,
        entity_type: 'LoanProduct',
        status: 'SUCCESS',
        description: `Changed interest rate for product: ${product.name} from ${oldInterestRate?.name || 'N/A'} to ${newInterestRate.name}`,
        timestamp: new Date()
      };
      await new AuditTrail(auditTrailData).save({ session });
      await session.commitTransaction();
      res.json({
        success: true,
        message: 'Product interest rate changed successfully',
        data: {
          productId: product.PROD_ID,
          productName: product.name,
          oldInterestRate: oldInterestRate ? {
            id: oldInterestRate._id,
            name: oldInterestRate.name,
            rateType: oldInterestRate.RATE_TYPE
          } : null,
          newInterestRate: {
            id: newInterestRate._id,
            name: newInterestRate.name,
            rateType: newInterestRate.RATE_TYPE,
            minRate: parseFloat(newInterestRate.MIN_RATE_PER_MONTH?.toString() || '0'),
            maxRate: parseFloat(newInterestRate.MAX_RATE_PER_MONTH?.toString() || '0'),
            defaultRate: parseFloat(newInterestRate.DEFAULT_RATE_PER_MONTH?.toString() || '0')
          },
          changeReason: reason,
          effectiveDate: effectiveDate || new Date().toISOString(),
          changedBy: req.user?.id || 'SYSTEM',
          changedAt: new Date()
        }
      });
    } catch (error) {
      await session.abortTransaction();
      logger.error('Change product interest rate failed:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to change product interest rate'
      });
    } finally {
      session.endSession();
    }
  })
};

// Extract methods as named exports
export const calculateLoanRepayment = LoanProductController.calculateLoanRepayment;
export const validateLoanApplication = LoanProductController.validateLoanApplication;
export const calculateInterestForPeriod = LoanProductController.calculateInterestForPeriod;
export const compareInterestRates = LoanProductController.compareInterestRates;
export const simulateRateChange = LoanProductController.simulateRateChange;
export const getProduct = LoanProductController.getProduct;
export const getAllLoanProducts = LoanProductController.getAllLoanProducts;
export const getProductsByInterestRate = LoanProductController.getProductsByInterestRate;

// Default export remains
export default LoanProductController;