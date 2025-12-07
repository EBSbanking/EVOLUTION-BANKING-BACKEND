// src/controllers/LoanProductController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import LoanProduct from '../models/LoanProduct.js';
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

const LoanProductController = {
  // CREATE LOAN PRODUCT
// CREATE LOAN PRODUCT
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
      
      // Default GL Accounts
      defaultGLAccounts = {},
      
      // Branch-specific GL Accounts
      branchGLAccounts = [],
      
      // Loan Terms
      minTerm,
      maxTerm,
      minAmount,
      maxAmount,
      interestRate,
      
      // Fee Structure
      feeStructure = [],
      processingFeeRate = 0,
      processingFeeGLCode,
      lateFeePerDay = 0,
      maxLateFee = 0,
      
      // Rate Information
      rateInformation = {},
      
      // Accrual Information
      accrualInformation = {},
      
      // Charges Setup
      chargesSetup = [],
      
      // Product Type Specific
      PRODUCT_SHORT_NAME,
      MIN_RATE_PER_MONTH,
      MAX_RATE_PER_MONTH,
      TOTAL_INTEREST_RATE,
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

    if (!defaultGLAccounts || !defaultGLAccounts.loanGLAccount) {
      throw new Error('Default loan GL account is required');
    }

    if (minTerm == null || maxTerm == null || minAmount == null || maxAmount == null || interestRate == null) {
      throw new Error('minTerm, maxTerm, minAmount, maxAmount, and interestRate are required');
    }

    // Check for duplicate PROD_ID or PRODUCT_SHORT_NAME
    const existingProduct = await LoanProduct.findOne({
      $or: [
        { PROD_ID: PROD_ID || Number(productCode) },
        { PRODUCT_SHORT_NAME: PRODUCT_SHORT_NAME?.toUpperCase() }
      ]
    }).session(session);
    
    if (existingProduct) {
      throw new Error('Product with this PROD_ID or PRODUCT_SHORT_NAME already exists');
    }

    // Explicit rate processing: Assume interestRate and TOTAL_INTEREST_RATE are annual; MIN/MAX_RATE_PER_MONTH are monthly
    const monthlyInterestRate = parseFloat(interestRate) / 12;
    const monthlyMinRate = parseFloat(MIN_RATE_PER_MONTH) || monthlyInterestRate;
    const monthlyMaxRate = parseFloat(MAX_RATE_PER_MONTH) || monthlyInterestRate;
    const totalInterestRate = parseFloat(TOTAL_INTEREST_RATE) || (monthlyInterestRate * 12);

    // Validate default monthly is in range (monthly basis)
    if (monthlyInterestRate < monthlyMinRate || monthlyInterestRate > monthlyMaxRate) {
      throw new Error(
        `Default monthly rate (${monthlyInterestRate.toFixed(2)}%) must be between min (${monthlyMinRate.toFixed(2)}%) and max (${monthlyMaxRate.toFixed(2)}%)`
      );
    }

    // Log for debugging
    console.log(
      `Rate processing: Annual interestRate=${interestRate}%, Monthly=${monthlyInterestRate.toFixed(2)}%, Total annual=${totalInterestRate.toFixed(2)}%`
    );

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

    // VALIDATE BRANCH GL ACCOUNTS
    const processedBranchGLAccounts = [];
    
    if (branchGLAccounts && Array.isArray(branchGLAccounts)) {
      for (const branchAccount of branchGLAccounts) {
        if (!branchAccount.branchCode || !branchAccount.branchName) {
          throw new Error('Each branch GL account must have branchCode and branchName');
        }
        
        if (branchAccount.branchCode === '*') {
          for (const branch of allActiveBranches) {
            processedBranchGLAccounts.push({
              ...branchAccount,
              branchCode: branch.branchCode,
              branchName: branch.branchName
            });
          }
        } else {
          if (isGlobal) {
            const branchExists = await Branch.findOne({ 
              branchCode: branchAccount.branchCode,
              status: 'ACTIVE'
            }).session(session);
            
            if (!branchExists) {
              throw new Error(`Branch with code ${branchAccount.branchCode} does not exist or is not active`);
            }
            
            processedBranchGLAccounts.push({
              ...branchAccount,
              branchName: branchExists.branchName || branchAccount.branchName
            });
          } else {
            if (!accessibleBranches.includes(branchAccount.branchCode)) {
              throw new Error(`Branch with code ${branchAccount.branchCode} is not in the product's accessible branches`);
            }
            
            const branch = allActiveBranches.find(b => b.branchCode === branchAccount.branchCode);
            processedBranchGLAccounts.push({
              ...branchAccount,
              branchName: branch ? branch.branchName : branchAccount.branchName
            });
          }
        }
      }
    }

    // Explicit handling for rateInformation fields: Assume absoluteRate, fixedRate, effectiveRate are annual → /12; minimumRate, maximumRate are monthly
    const absRate = rateInformation.absoluteRate ? parseFloat(rateInformation.absoluteRate) / 12 : monthlyInterestRate;
    const fixedRate = rateInformation.fixedRate ? parseFloat(rateInformation.fixedRate) / 12 : monthlyInterestRate;
    const effRate = rateInformation.effectiveRate ? parseFloat(rateInformation.effectiveRate) / 12 : monthlyInterestRate;
    const minRateInfo = rateInformation.minimumRate ? parseFloat(rateInformation.minimumRate) : monthlyMinRate;
    const maxRateInfo = rateInformation.maximumRate ? parseFloat(rateInformation.maximumRate) : monthlyMaxRate;

    // CREATE LOAN PRODUCT
    const loanProduct = new LoanProduct({
      name,
      productCode,
      PROD_CD: productCode,
      PROD_ID: PROD_ID || Number(productCode),
      PRODUCT_SHORT_NAME: PRODUCT_SHORT_NAME?.toUpperCase(),
      PRODUCT_TYPE,
      description,
      CRNCY_ID,
      
      // Business Unit Configuration
      BU_ID: validatedBranchCodes,
      isGlobalProduct: isGlobal,
      accessibleBUs: accessibleBranches,
      visibility: isGlobal ? 'GLOBAL' : 'SELECTED_BUS',
      
      // Loan Terms
      minTerm: Number(minTerm),
      maxTerm: Number(maxTerm),
      minAmount: toDecimal(minAmount, 'minAmount'),
      maxAmount: toDecimal(maxAmount, 'maxAmount'),
      interestRate: toDecimal(monthlyInterestRate, 'interestRate'),  // Monthly
      TERM_CD,
      PAYMENT_FREQUENCY: PAYMENT_FREQUENCY || REPAYMENT_FREQUENCY,
      
      // Product Type Specific
      MIN_RATE_PER_MONTH: toDecimal(monthlyMinRate, 'MIN_RATE_PER_MONTH'),  // Monthly
      MAX_RATE_PER_MONTH: toDecimal(monthlyMaxRate, 'MAX_RATE_PER_MONTH'),  // Monthly
      DEFAULT_RATE_PER_MONTH: toDecimal(monthlyInterestRate, 'DEFAULT_RATE_PER_MONTH'),  // Monthly
      TOTAL_INTEREST_RATE: toDecimal(totalInterestRate, 'TOTAL_INTEREST_RATE'),  // Annual
      MIN_LOAN_TERM_MONTHS: Number(MIN_LOAN_TERM_MONTHS) || minTerm,
      MAX_LOAN_TERM_MONTHS: Number(MAX_LOAN_TERM_MONTHS) || maxTerm,
      MIN_DURATION_DAYS: Number(MIN_DURATION_DAYS) || 1,
      MIN_DURATION_WEEKS: Number(MIN_DURATION_WEEKS) || 0,
      MIN_DURATION_MONTHS: Number(MIN_DURATION_MONTHS) || 1,
      TIME: Number(TIME) || 12,
      RATE_TY: RATE_TY || 'FIXED',
      INT_TY: INT_TY || 'SIMPLE',
      CAPITALIZE_INT_FG: CAPITALIZE_INT_FG !== undefined ? CAPITALIZE_INT_FG : false,
      AMORTIZED: AMORTIZED !== undefined ? AMORTIZED : true,
      
      // GL Accounts Configuration
      defaultGLAccounts: {
        loanGLAccount: defaultGLAccounts.loanGLAccount,
        interestGLAccountNo: defaultGLAccounts.interestGLAccountNo,
        interestPayableGLAccountNo: defaultGLAccounts.interestPayableGLAccountNo,
        withholdingTaxGLAccountNo: defaultGLAccounts.withholdingTaxGLAccountNo,
        suspenseGLAccountNo: defaultGLAccounts.suspenseGLAccountNo,
        principalGLAccountNo: defaultGLAccounts.principalGLAccountNo,
        chargeOffGLAccountNo: defaultGLAccounts.chargeOffGLAccountNo,
        loanChargeReceivableGLAccountNo: defaultGLAccounts.loanChargeReceivableGLAccountNo,
        contingentGLAccountNo: defaultGLAccounts.contingentGLAccountNo,
        delinquentGLAccountNo: defaultGLAccounts.delinquentGLAccountNo,
        interestIncomeGLAccountNo: defaultGLAccounts.interestIncomeGLAccountNo,
        interestReceivableGLAccountNo: defaultGLAccounts.interestReceivableGLAccountNo,
        interestSuspenseGLAccountNo: defaultGLAccounts.interestSuspenseGLAccountNo,
        lateFeeSuspenseGLAccountNo: defaultGLAccounts.lateFeeSuspenseGLAccountNo,
        maturityGLAccountNo: defaultGLAccounts.maturityGLAccountNo,
        nonAccrualGLAccountNo: defaultGLAccounts.nonAccrualGLAccountNo,
        nonAccrualInterestOffsetGLAccountNo: defaultGLAccounts.nonAccrualInterestOffsetGLAccountNo,
        nonAccrualInterestReceivableGLAccountNo: defaultGLAccounts.nonAccrualInterestReceivableGLAccountNo,
        provisionReserveGLAccountNo: defaultGLAccounts.provisionReserveGLAccountNo,
        provisionExpenseGLAccountNo: defaultGLAccounts.provisionExpenseGLAccountNo,
        recoveriesGLAccountNo: defaultGLAccounts.recoveriesGLAccountNo,
        repaymentControlGLAccountNo: defaultGLAccounts.repaymentControlGLAccountNo,
        loanSuspenseGLAccountNo: defaultGLAccounts.loanSuspenseGLAccountNo,
        unappliedFundsGLAccountNo: defaultGLAccounts.unappliedFundsGLAccountNo,
        unclearedBalanceGLAccountNo: defaultGLAccounts.unclearedBalanceGLAccountNo,
        unearnedInterestGLAccountNo: defaultGLAccounts.unearnedInterestGLAccountNo,
        interestCreditGLAccountNo: defaultGLAccounts.interestCreditGLAccountNo,
        interestDebitGLAccountNo: defaultGLAccounts.interestDebitGLAccountNo,
        processingFeeGLCode: defaultGLAccounts.processingFeeGLCode
      },
      
      // Branch-specific GL Accounts
      branchGLAccounts: processedBranchGLAccounts.map(branch => ({
        branchCode: branch.branchCode,
        branchName: branch.branchName,
        loanGLAccount: branch.loanGLAccount,
        interestGLAccountNo: branch.interestGLAccountNo,
        interestPayableGLAccountNo: branch.interestPayableGLAccountNo,
        withholdingTaxGLAccountNo: branch.withholdingTaxGLAccountNo,
        suspenseGLAccountNo: branch.suspenseGLAccountNo,
        principalGLAccountNo: branch.principalGLAccountNo,
        chargeOffGLAccountNo: branch.chargeOffGLAccountNo,
        loanChargeReceivableGLAccountNo: branch.loanChargeReceivableGLAccountNo,
        contingentGLAccountNo: branch.contingentGLAccountNo,
        delinquentGLAccountNo: branch.delinquentGLAccountNo,
        interestIncomeGLAccountNo: branch.interestIncomeGLAccountNo,
        interestReceivableGLAccountNo: branch.interestReceivableGLAccountNo,
        interestSuspenseGLAccountNo: branch.interestSuspenseGLAccountNo,
        lateFeeSuspenseGLAccountNo: branch.lateFeeSuspenseGLAccountNo,
        maturityGLAccountNo: branch.maturityGLAccountNo,
        nonAccrualGLAccountNo: branch.nonAccrualGLAccountNo,
        nonAccrualInterestOffsetGLAccountNo: branch.nonAccrualInterestOffsetGLAccountNo,
        nonAccrualInterestReceivableGLAccountNo: branch.nonAccrualInterestReceivableGLAccountNo,
        provisionReserveGLAccountNo: branch.provisionReserveGLAccountNo,
        provisionExpenseGLAccountNo: branch.provisionExpenseGLAccountNo,
        recoveriesGLAccountNo: branch.recoveriesGLAccountNo,
        repaymentControlGLAccountNo: branch.repaymentControlGLAccountNo,
        loanSuspenseGLAccountNo: branch.loanSuspenseGLAccountNo,
        unappliedFundsGLAccountNo: branch.unappliedFundsGLAccountNo,
        unclearedBalanceGLAccountNo: branch.unclearedBalanceGLAccountNo,
        unearnedInterestGLAccountNo: branch.unearnedInterestGLAccountNo,
        interestCreditGLAccountNo: branch.interestCreditGLAccountNo,
        interestDebitGLAccountNo: branch.interestDebitGLAccountNo,
        processingFeeGLCode: branch.processingFeeGLCode,
        isActive: branch.isActive !== undefined ? branch.isActive : true
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
      
      // Rate Information
      rateInformation: {
        rateType: rateInformation.rateType || RATE_TY || 'FIXED',
        rateStructure: rateInformation.rateStructure || 'FLAT',
        indexRate: rateInformation.indexRate,
        absoluteRate: toDecimal(absRate, 'absoluteRate'),  // Monthly
        fixedRate: toDecimal(fixedRate, 'fixedRate'),  // Monthly
        margin: toDecimal(rateInformation.margin, 'margin'),
        minimumRate: toDecimal(minRateInfo, 'minimumRate'),  // Monthly
        maximumRate: toDecimal(maxRateInfo, 'maximumRate'),  // Monthly
        effectiveRate: toDecimal(effRate, 'effectiveRate'),  // Monthly
        currentEffectiveDate: rateInformation.currentEffectiveDate || new Date().toISOString().split('T')[0],
        newEffectiveDate: rateInformation.newEffectiveDate,
        rateChangeFrequency: rateInformation.rateChangeFrequency || '1 YEAR',
        maximumNumberOfChanges: rateInformation.maximumNumberOfChanges || 99
      },
      
      // Accrual Information
      accrualInformation: {
        accrualFrequency: accrualInformation.accrualFrequency || '1 DAY',
        accrualBasis: accrualInformation.accrualBasis || 'ACTUAL_DAYS/ACTUAL_DAYS',
        accrualBalanceType: accrualInformation.accrualBalanceType || 'CURRENT_CLEARED',
        marginBalanceType: accrualInformation.marginBalanceType || 'CURRENT_CLEARED',
        skipInterestForIncompletePeriod: accrualInformation.skipInterestForIncompletePeriod || false
      },
      
      // Charges Setup
      chargesSetup: (chargesSetup || []).map(charge => ({
        chargeType: charge.chargeType || 'FLAT',
        name: charge.name,
        amount: toDecimal(charge.amount, 'charge amount'),
        glAccountCode: charge.glAccountCode
      })),
      
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
        createdAt: new Date(),
        createdByUser: createdBy,
        rateConversion: {
          originalAnnualRate: parseFloat(interestRate),
          convertedMonthlyRate: monthlyInterestRate,
          totalAnnualRate: totalInterestRate,
          conversionApplied: true  // Always applied for interestRate
        }
      }
    });

    await loanProduct.save({ session });

    // ==============================================
    // PRODUCT TYPE MAPPING - ENHANCED VERSION
    // ==============================================
    const productTypeMappingData = {
      PROD_ID: loanProduct.PROD_ID,
      PRODUCT_TYPE: loanProduct.PRODUCT_TYPE, // Make sure this is always included
      productName: name,
      accountPrefix: '10',
      BU_ID: validatedBranchCodes,
      isGlobalProduct: isGlobal,
      visibility: loanProduct.visibility,
      PRODUCT_SHORT_NAME: PRODUCT_SHORT_NAME?.toUpperCase(), // Add this
      productCode: productCode, // Add this
      description: description, // Add description
      glAccounts: {
        loanGLAccount: defaultGLAccounts.loanGLAccount,
        principalGLAccountNo: defaultGLAccounts.principalGLAccountNo,
        interestGLAccountNo: defaultGLAccounts.interestGLAccountNo,
        interestIncomeGLAccountNo: defaultGLAccounts.interestIncomeGLAccountNo,
        processingFeeGLCode: defaultGLAccounts.processingFeeGLCode,
        // Include all GL accounts for completeness
        interestPayableGLAccountNo: defaultGLAccounts.interestPayableGLAccountNo,
        withholdingTaxGLAccountNo: defaultGLAccounts.withholdingTaxGLAccountNo,
        suspenseGLAccountNo: defaultGLAccounts.suspenseGLAccountNo,
        chargeOffGLAccountNo: defaultGLAccounts.chargeOffGLAccountNo,
        loanChargeReceivableGLAccountNo: defaultGLAccounts.loanChargeReceivableGLAccountNo,
        contingentGLAccountNo: defaultGLAccounts.contingentGLAccountNo,
        delinquentGLAccountNo: defaultGLAccounts.delinquentGLAccountNo,
        interestReceivableGLAccountNo: defaultGLAccounts.interestReceivableGLAccountNo,
        interestSuspenseGLAccountNo: defaultGLAccounts.interestSuspenseGLAccountNo,
        lateFeeSuspenseGLAccountNo: defaultGLAccounts.lateFeeSuspenseGLAccountNo,
        maturityGLAccountNo: defaultGLAccounts.maturityGLAccountNo,
        nonAccrualGLAccountNo: defaultGLAccounts.nonAccrualGLAccountNo,
        nonAccrualInterestOffsetGLAccountNo: defaultGLAccounts.nonAccrualInterestOffsetGLAccountNo,
        nonAccrualInterestReceivableGLAccountNo: defaultGLAccounts.nonAccrualInterestReceivableGLAccountNo,
        provisionReserveGLAccountNo: defaultGLAccounts.provisionReserveGLAccountNo,
        provisionExpenseGLAccountNo: defaultGLAccounts.provisionExpenseGLAccountNo,
        recoveriesGLAccountNo: defaultGLAccounts.recoveriesGLAccountNo,
        repaymentControlGLAccountNo: defaultGLAccounts.repaymentControlGLAccountNo,
        loanSuspenseGLAccountNo: defaultGLAccounts.loanSuspenseGLAccountNo,
        unappliedFundsGLAccountNo: defaultGLAccounts.unappliedFundsGLAccountNo,
        unclearedBalanceGLAccountNo: defaultGLAccounts.unclearedBalanceGLAccountNo,
        unearnedInterestGLAccountNo: defaultGLAccounts.unearnedInterestGLAccountNo,
        interestCreditGLAccountNo: defaultGLAccounts.interestCreditGLAccountNo,
        interestDebitGLAccountNo: defaultGLAccounts.interestDebitGLAccountNo
      },
      // Include product terms for reference
      productTerms: {
        minTerm: Number(minTerm),
        maxTerm: Number(maxTerm),
        minAmount: parseFloat(minAmount),
        maxAmount: parseFloat(maxAmount),
        interestRate: monthlyInterestRate,
        TOTAL_INTEREST_RATE: totalInterestRate,
        MIN_RATE_PER_MONTH: monthlyMinRate,
        MAX_RATE_PER_MONTH: monthlyMaxRate
      },
      metadata: {
        isWildcard: hasWildcard,
        totalBranches: allActiveBranches.length,
        createdFrom: 'LoanProductController.createProduct',
        createdAt: new Date(),
        source: 'loan_product_creation'
      },
      // Add status and active flags
      STATUS: 'ACTIVE',
      isActive: true,
      createdBy,
      USER_ID,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Log the data before saving for debugging
    console.log('Creating ProductTypeMapping with:', JSON.stringify({
      PROD_ID: productTypeMappingData.PROD_ID,
      PRODUCT_TYPE: productTypeMappingData.PRODUCT_TYPE,
      productName: productTypeMappingData.productName,
      PRODUCT_SHORT_NAME: productTypeMappingData.PRODUCT_SHORT_NAME,
      BU_ID: productTypeMappingData.BU_ID
    }, null, 2));

    await new ProductTypeMapping(productTypeMappingData).save({ session });
    console.log(`✅ ProductTypeMapping created successfully for PROD_ID: ${productTypeMappingData.PROD_ID}, PRODUCT_TYPE: ${productTypeMappingData.PRODUCT_TYPE}`);

    // ==============================================
    // AUDIT TRAIL
    // ==============================================
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
        BU_ID: validatedBranchCodes,
        isGlobalProduct: isGlobal,
        minTerm,
        maxTerm,
        interestRate: monthlyInterestRate,
        annualInterestRate: totalInterestRate,
        branchGLAccountsCount: loanProduct.branchGLAccounts?.length || 0,
        PRODUCT_SHORT_NAME,
        DEFAULT_RATE_PER_MONTH: monthlyInterestRate,
        totalBranches: allActiveBranches.length,
        hasWildcard,
        rateConversion: 'Annual to Monthly',
        // Include ProductTypeMapping details
        productTypeMappingCreated: true,
        productTypeMapping_PROD_ID: productTypeMappingData.PROD_ID,
        productTypeMapping_PRODUCT_TYPE: productTypeMappingData.PRODUCT_TYPE
      },
      ip_address: getClientIp(req),
      entity_id: loanProduct._id.toString(),
      entity_type: 'LoanProduct',
      status: 'SUCCESS',
      description: `Created loan product: ${name} (${productCode}) for ${isGlobal ? 'ALL branches' : `${accessibleBranches.length} branches`}. ProductTypeMapping created with PROD_ID: ${productTypeMappingData.PROD_ID}`,
      timestamp: new Date()
    };

    await new AuditTrail(auditTrailData).save({ session });

    await session.commitTransaction();
    console.log(`✅ Transaction committed successfully for product creation: ${name} (${productCode})`);

    res.status(201).json({
      success: true,
      message: `Loan product created successfully for ${isGlobal ? 'all branches' : `${accessibleBranches.length} branches`}`,
      data: {
        PROD_ID: loanProduct.PROD_ID,
        productCode,
        name,
        PRODUCT_TYPE,
        PRODUCT_SHORT_NAME,
        BU_ID: accessibleBranches,
        isGlobalProduct: isGlobal,
        totalBranches: allActiveBranches.length,
        branchGLAccountsCount: loanProduct.branchGLAccounts?.length || 0,
        minTerm: loanProduct.minTerm,
        maxTerm: loanProduct.maxTerm,
        interestRate: parseFloat(loanProduct.interestRate.toString()),  // Monthly
        DEFAULT_RATE_PER_MONTH: parseFloat(loanProduct.DEFAULT_RATE_PER_MONTH.toString()),  // Monthly
        TOTAL_INTEREST_RATE: parseFloat(loanProduct.TOTAL_INTEREST_RATE.toString()),  // Annual
        annualInterestRate: totalInterestRate,
        createdBy,
        createdAt: new Date().toISOString(),
        // Include ProductTypeMapping confirmation
        productTypeMappingCreated: true,
        productTypeMapping_PROD_ID: productTypeMappingData.PROD_ID
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

  // GET ALL LOAN PRODUCTS
  getAllLoanProducts: asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 10,
      search,
      productType,
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
      lean: true
    };

    const products = await LoanProduct.paginate(query, options);

    // Get branch details for each product
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
        
        return {
          PROD_ID: product.PROD_ID,
          PRODUCT_NAME: product.name,
          PRODUCT_SHORT_NAME: product.PRODUCT_SHORT_NAME,
          PRODUCT_TYPE: product.PRODUCT_TYPE,
          MIN_RATE_PER_MONTH: parseFloat(product.MIN_RATE_PER_MONTH.toString()),
          MAX_RATE_PER_MONTH: parseFloat(product.MAX_RATE_PER_MONTH.toString()),
          DEFAULT_RATE_PER_MONTH: parseFloat(product.DEFAULT_RATE_PER_MONTH.toString()),
          TOTAL_INTEREST_RATE: parseFloat(product.TOTAL_INTEREST_RATE.toString()),
          MIN_LOAN_AMOUNT: parseFloat(product.minAmount.toString()),
          MAX_LOAN_AMOUNT: parseFloat(product.maxAmount.toString()),
          MIN_DURATION: product.getMinDurationDisplay ? product.getMinDurationDisplay() : 'N/A',
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

  // GET SINGLE LOAN PRODUCT
 // GET SINGLE LOAN PRODUCT - FIXED VERSION
getLoanProduct: asyncHandler(async (req, res) => {
  const { id, shortName } = req.params;
  let product;

  console.log(`🔍 getLoanProduct called with:`, { id, shortName });

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
    // Find by PRODUCT_SHORT_NAME
    product = await LoanProduct.findOne({ 
      PRODUCT_SHORT_NAME: shortName.toUpperCase()
      // Removed STATUS filter for debugging
    });
    
    if (!product) {
      console.log(`❌ No product found with shortName: ${shortName}`);
    }
  } else {
    // Parse the ID to determine what type it is
    const parsedId = parseProductId(id);
    console.log(`📊 Parsed ID: ${JSON.stringify(parsedId)}`);
    
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
    
    console.log(`🔎 Querying with: ${JSON.stringify(query)}`);
    product = await LoanProduct.findOne(query);
    
    if (!product) {
      console.log(`❌ No product found with query:`, query);
      
      // Debug: Show all products
      const allProducts = await LoanProduct.find({}, 'PROD_ID productCode name STATUS isActive').limit(5);
      console.log('📋 Available products:', allProducts.map(p => ({
        PROD_ID: p.PROD_ID,
        productCode: p.productCode,
        name: p.name,
        STATUS: p.STATUS,
        isActive: p.isActive
      })));
    }
  }

  if (!product) {
    return res.status(404).json({ 
      success: false, 
      message: 'Loan product not found' 
    });
  }

  console.log(`✅ Found product: ${product.name} (${product.PROD_ID})`, {
    STATUS: product.STATUS,
    isActive: product.isActive
  });

  // Get branch details for the product
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
          organizationName: branch.organizationName,
          address: branch.address,
          phone: branch.phone,
          email: branch.email,
          branchManager: branch.branch_manager,
          status: branch.status
        });
      }
    }
  }

  res.json({ 
    success: true, 
    data: {
      PROD_ID: product.PROD_ID,
      PRODUCT_NAME: product.name,
      PRODUCT_SHORT_NAME: product.PRODUCT_SHORT_NAME,
      PRODUCT_TYPE: product.PRODUCT_TYPE,
      MIN_RATE_PER_MONTH: parseFloat(product.MIN_RATE_PER_MONTH.toString()),
      MAX_RATE_PER_MONTH: parseFloat(product.MAX_RATE_PER_MONTH.toString()),
      DEFAULT_RATE_PER_MONTH: parseFloat(product.DEFAULT_RATE_PER_MONTH.toString()),
      TOTAL_INTEREST_RATE: parseFloat(product.TOTAL_INTEREST_RATE.toString()),
      MIN_LOAN_AMOUNT: parseFloat(product.minAmount.toString()),
      MAX_LOAN_AMOUNT: parseFloat(product.maxAmount.toString()),
      MIN_DURATION_DAYS: product.MIN_DURATION_DAYS,
      MIN_DURATION_WEEKS: product.MIN_DURATION_WEEKS,
      MIN_DURATION_MONTHS: product.MIN_DURATION_MONTHS,
      MIN_DURATION_DISPLAY: product.getMinDurationDisplay ? product.getMinDurationDisplay() : 'N/A',
      RATE_TY: product.RATE_TY,
      INT_TY: product.INT_TY,
      AMORTIZED: product.AMORTIZED,
      STATUS: product.STATUS,
      isActive: product.isActive,
      BRANCHES: branchDetails,
      isGlobalProduct: product.isGlobalProduct,
      CREATED_AT: product.createdAt,
      UPDATED_AT: product.updatedAt,
      // Add BU_ID for debugging
      BU_ID: product.BU_ID
    } 
  });
}),

  // UPDATE LOAN PRODUCT
// UPDATE LOAN PRODUCT - FIXED VERSION
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
      isActive: product.isActive,
      interestRate: parseFloat(product.interestRate.toString()),
      minAmount: parseFloat(product.minAmount.toString()),
      maxAmount: parseFloat(product.maxAmount.toString()),
      DEFAULT_RATE_PER_MONTH: parseFloat(product.DEFAULT_RATE_PER_MONTH.toString()),
      BU_ID: product.BU_ID,
      STATUS: product.STATUS
    };

    // Explicit rate processing for updates: Only if relevant fields are provided
    if (updateData.interestRate !== undefined) {
      const monthlyInterestRate = parseFloat(updateData.interestRate) / 12;
      updateData.interestRate = toDecimal(monthlyInterestRate, 'interestRate');  // Monthly
      updateData.DEFAULT_RATE_PER_MONTH = toDecimal(monthlyInterestRate, 'DEFAULT_RATE_PER_MONTH');  // Monthly

      // Re-validate range if min/max provided
      if (updateData.MIN_RATE_PER_MONTH !== undefined || updateData.MAX_RATE_PER_MONTH !== undefined) {
        const monthlyMinRate = parseFloat(updateData.MIN_RATE_PER_MONTH) || monthlyInterestRate;
        const monthlyMaxRate = parseFloat(updateData.MAX_RATE_PER_MONTH) || monthlyInterestRate;
        updateData.MIN_RATE_PER_MONTH = toDecimal(monthlyMinRate, 'MIN_RATE_PER_MONTH');
        updateData.MAX_RATE_PER_MONTH = toDecimal(monthlyMaxRate, 'MAX_RATE_PER_MONTH');

        if (monthlyInterestRate < monthlyMinRate || monthlyInterestRate > monthlyMaxRate) {
          throw new Error(
            `Default monthly rate (${monthlyInterestRate.toFixed(2)}%) must be between min (${monthlyMinRate.toFixed(2)}%) and max (${monthlyMaxRate.toFixed(2)}%)`
          );
        }
      }

      // Handle TOTAL_INTEREST_RATE if provided
      if (updateData.TOTAL_INTEREST_RATE !== undefined) {
        const totalInterestRate = parseFloat(updateData.TOTAL_INTEREST_RATE);
        updateData.TOTAL_INTEREST_RATE = toDecimal(totalInterestRate, 'TOTAL_INTEREST_RATE');  // Annual
      } else {
        updateData.TOTAL_INTEREST_RATE = toDecimal(monthlyInterestRate * 12, 'TOTAL_INTEREST_RATE');  // Annual
      }
    }

    // Handle BU_ID (branch codes) update with validation
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

    // Handle decimal conversions for update (excluding rates, handled above)
    const decimalFields = [
      'minAmount', 'maxAmount', 'processingFeeRate', 
      'lateFeePerDay', 'maxLateFee'
    ];

    decimalFields.forEach(field => {
      if (updateData[field] !== undefined) {
        updateData[field] = toDecimal(updateData[field], field);
      }
    });

    // Handle rateInformation decimal fields
    if (updateData.rateInformation) {
      const rateDecimalFields = [
        'absoluteRate', 'fixedRate', 'margin', 'minimumRate', 
        'maximumRate', 'effectiveRate'
      ];
      
      const convertIfLikelyAnnual = (val) => {
        const num = parseFloat(val);
        if (num > 30) return num / 12;
        return num;
      };

      rateDecimalFields.forEach(field => {
        if (updateData.rateInformation[field] !== undefined) {
          let processedVal;
          if (['absoluteRate', 'fixedRate', 'effectiveRate'].includes(field)) {
            processedVal = convertIfLikelyAnnual(updateData.rateInformation[field]);
          } else {
            processedVal = parseFloat(updateData.rateInformation[field]);
          }
          updateData.rateInformation[field] = toDecimal(processedVal, `rateInformation.${field}`);
        }
      });
    }

    // Handle fee structure updates
    if (updateData.feeStructure && Array.isArray(updateData.feeStructure)) {
      updateData.feeStructure = updateData.feeStructure.map(fee => ({
        ...fee,
        amount: toDecimal(fee.amount, 'fee amount')
      }));
    }

    // Handle charges setup updates
    if (updateData.chargesSetup && Array.isArray(updateData.chargesSetup)) {
      updateData.chargesSetup = updateData.chargesSetup.map(charge => ({
        ...charge,
        amount: toDecimal(charge.amount, 'charge amount')
      }));
    }

    const updatedProduct = await LoanProduct.findOneAndUpdate(
      query, 
      updateData, 
      { new: true, runValidators: true, session }
    );

    // Update ProductTypeMapping if BU_ID changed
    if (updateData.BU_ID) {
      await ProductTypeMapping.findOneAndUpdate(
        { PROD_ID: product.PROD_ID },
        { 
          BU_ID: updateData.BU_ID,
          isGlobalProduct: updateData.isGlobalProduct,
          visibility: updateData.visibility
        },
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
        isActive: updatedProduct.isActive,
        interestRate: parseFloat(updatedProduct.interestRate.toString()),
        minAmount: parseFloat(updatedProduct.minAmount.toString()),
        maxAmount: parseFloat(updatedProduct.maxAmount.toString()),
        DEFAULT_RATE_PER_MONTH: parseFloat(updatedProduct.DEFAULT_RATE_PER_MONTH.toString()),
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

// DELETE LOAN PRODUCT (Soft Delete) - FIXED VERSION
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

  // DELETE LOAN PRODUCT (Soft Delete)
  deleteLoanProduct: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;

      const product = await LoanProduct.findById(id).session(session);
      if (!product) {
        return res.status(404).json({ 
          success: false, 
          message: 'Loan product not found' 
        });
      }

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
        old_value: {
          name: product.name,
          productCode: product.productCode,
          PRODUCT_TYPE: product.PRODUCT_TYPE,
          BU_ID: product.BU_ID,
          STATUS: 'ACTIVE'
        },
        new_value: {
          name: product.name,
          productCode: product.productCode,
          STATUS: 'INACTIVE'
        },
        ip_address: getClientIp(req),
        entity_id: id,
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

  // GET LOAN PRODUCTS BY BRANCH
  getProductsByBranch: asyncHandler(async (req, res) => {
    const { branchCode } = req.params;
    const { 
      page = 1, 
      limit = 10,
      productType,
      search 
    } = req.query;

    // Validate branch exists
    const branch = await Branch.findOne({ 
      branchCode,
      status: 'ACTIVE' 
    });
    
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: `Branch with code ${branchCode} not found or inactive`
      });
    }

    const query = {
      STATUS: 'ACTIVE',
      $or: [
        { BU_ID: branchCode },
        { BU_ID: '*' }
      ]
    };

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { productCode: { $regex: search, $options: 'i' } },
        { PRODUCT_SHORT_NAME: { $regex: search, $options: 'i' } }
      ];
    }

    // Product type filter
    if (productType) {
      query.PRODUCT_TYPE = productType;
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      lean: true
    };

    const products = await LoanProduct.paginate(query, options);

    res.json({
      success: true,
      data: {
        branch: {
          code: branch.branchCode,
          name: branch.branchName,
          type: branch.branchType,
          organization: branch.organizationName
        },
        products: products.docs.map(product => ({
          PROD_ID: product.PROD_ID,
          PRODUCT_NAME: product.name,
          PRODUCT_SHORT_NAME: product.PRODUCT_SHORT_NAME,
          PRODUCT_TYPE: product.PRODUCT_TYPE,
          DEFAULT_RATE_PER_MONTH: parseFloat(product.DEFAULT_RATE_PER_MONTH.toString()),
          MIN_LOAN_AMOUNT: parseFloat(product.minAmount.toString()),
          MAX_LOAN_AMOUNT: parseFloat(product.maxAmount.toString()),
          MIN_TERM: product.minTerm,
          MAX_TERM: product.maxTerm,
          isGlobal: product.BU_ID.includes('*'),
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

  // GET GL ACCOUNT FOR BRANCH
getBranchGLAccount: asyncHandler(async (req, res) => {
  const { productId, branchCode, accountType } = req.params;

  if (!productId || !branchCode || !accountType) {
    return res.status(400).json({
      success: false,
      message: 'productId, branchCode, and accountType are required'
    });
  }

  console.log(`🔍 getBranchGLAccount called with:`, {
    productId,
    branchCode,
    accountType,
    productIdType: typeof productId
  });

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

  // Parse product ID
  const parsedId = parseProductId(productId);
  console.log(`📊 Parsed product ID: ${JSON.stringify(parsedId)}`);

  // Validate branch exists
  const branch = await Branch.findOne({ 
    branchCode: String(branchCode),
    status: 'ACTIVE' 
  });
  
  if (!branch) {
    console.log(`❌ Branch not found: ${branchCode}`);
    return res.status(404).json({
      success: false,
      message: `Branch with code ${branchCode} not found or inactive`
    });
  }

  console.log(`✅ Branch found: ${branch.branchName} (${branch.branchCode})`);

  // Build query based on parsed ID type
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

  // First, find the product without status filter to debug
  const productWithoutFilter = await LoanProduct.findOne(query);
  
  if (!productWithoutFilter) {
    console.log(`❌ No product found with query:`, query);
    
    // Try to find by any means for debugging
    const allProducts = await LoanProduct.find({}, 'PROD_ID productCode name STATUS isActive BU_ID').limit(5);
    console.log('📋 Available products:', allProducts.map(p => ({
      PROD_ID: p.PROD_ID,
      productCode: p.productCode,
      name: p.name,
      STATUS: p.STATUS,
      isActive: p.isActive,
      BU_ID: p.BU_ID
    })));
    
    return res.status(404).json({
      success: false,
      message: 'Loan product not found',
      debug: {
        query,
        parsedId,
        availableProducts: allProducts.map(p => p.PROD_ID)
      }
    });
  }

  console.log(`✅ Product found: ${productWithoutFilter.name} (${productWithoutFilter.PROD_ID})`, {
    STATUS: productWithoutFilter.STATUS,
    isActive: productWithoutFilter.isActive,
    BU_ID: productWithoutFilter.BU_ID,
    branchGLAccountsCount: productWithoutFilter.branchGLAccounts?.length || 0
  });

  // Now check if product is active
  if (productWithoutFilter.STATUS !== 'ACTIVE' || !productWithoutFilter.isActive) {
    return res.status(400).json({
      success: false,
      message: `Loan product is not active. Status: ${productWithoutFilter.STATUS}`,
      productStatus: productWithoutFilter.STATUS,
      productIsActive: productWithoutFilter.isActive
    });
  }

  // Check if branch has access to this product
  const hasAccess = productWithoutFilter.BU_ID.includes(branchCode) || 
                   productWithoutFilter.BU_ID.includes('*');
  
  if (!hasAccess) {
    console.log(`❌ Branch ${branchCode} not in product's BU_ID:`, productWithoutFilter.BU_ID);
    return res.status(403).json({
      success: false,
      message: `Branch ${branchCode} does not have access to this product`,
      productBU_ID: productWithoutFilter.BU_ID,
      requestedBranch: branchCode
    });
  }

  console.log(`✅ Branch ${branchCode} has access to product`);

  // Find branch-specific GL accounts
  let branchGLAccounts = null;
  if (productWithoutFilter.branchGLAccounts && Array.isArray(productWithoutFilter.branchGLAccounts)) {
    branchGLAccounts = productWithoutFilter.branchGLAccounts.find(
      account => account.branchCode === branchCode
    );
    console.log(`📊 Branch-specific GL accounts: ${branchGLAccounts ? 'Found' : 'Not found'}`);
  }

  // Get the GL account - try branch-specific first, then default
  let glAccount = null;
  if (branchGLAccounts && branchGLAccounts[accountType]) {
    glAccount = branchGLAccounts[accountType];
  } else if (productWithoutFilter.defaultGLAccounts && productWithoutFilter.defaultGLAccounts[accountType]) {
    glAccount = productWithoutFilter.defaultGLAccounts[accountType];
  }

  if (!glAccount) {
    return res.status(404).json({
      success: false,
      message: `GL account of type '${accountType}' not found for branch '${branchCode}'`,
      availableAccountTypes: Object.keys(productWithoutFilter.defaultGLAccounts || {})
    });
  }

  console.log(`✅ Found GL account: ${glAccount} for account type: ${accountType}`);

  res.json({
    success: true,
    data: {
      productId: productWithoutFilter.PROD_ID,
      productName: productWithoutFilter.name,
      branchCode,
      branchName: branch.branchName,
      accountType,
      glAccount,
      source: branchGLAccounts && branchGLAccounts[accountType] ? 'branch' : 'default',
      productStatus: productWithoutFilter.STATUS,
      hasBranchAccess: hasAccess
    }
  });
}),

  // UPDATE BRANCH GL ACCOUNTS
  updateBranchGLAccounts: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { branchCode, branchName, ...glAccounts } = req.body;

    if (!branchCode || !branchName) {
      return res.status(400).json({
        success: false,
        message: 'branchCode and branchName are required'
      });
    }

    // Validate branch exists
    const branch = await Branch.findOne({ 
      branchCode,
      status: 'ACTIVE' 
    });
    
    if (!branch) {
      return res.status(404).json({
        success: false,
        message: `Branch with code ${branchCode} not found or inactive`
      });
    }

    const product = await LoanProduct.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Loan product not found'
      });
    }

    // Check if branch is in product's BU_ID
    if (!product.BU_ID.includes(branchCode) && !product.BU_ID.includes('*')) {
      return res.status(400).json({
        success: false,
        message: `Branch ${branchCode} is not associated with this product`
      });
    }

    await product.updateBranchGLAccounts(branchCode, branch.branchName, glAccounts);

    res.json({
      success: true,
      message: 'Branch GL accounts updated successfully',
      data: product
    });
  }),

  // ADD BRANCH TO LOAN PRODUCT
  addBranchToProduct: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;
      const { branchCode } = req.body;

      if (!branchCode) {
        throw new Error('branchCode is required');
      }

      const product = await LoanProduct.findById(id).session(session);
      if (!product) {
        return res.status(404).json({ 
          success: false, 
          message: 'Loan product not found' 
        });
      }

      // Check if product is global
      if (product.isGlobalProduct) {
        return res.status(400).json({
          success: false,
          message: 'Cannot add branch to a global product'
        });
      }

      // Validate branch exists
      const branch = await Branch.findOne({ 
        branchCode,
        status: 'ACTIVE' 
      }).session(session);
      
      if (!branch) {
        throw new Error(`Branch with code ${branchCode} not found or inactive`);
      }

      // Check if branch already exists
      if (product.BU_ID.includes(branchCode)) {
        throw new Error(`Branch ${branchCode} is already associated with this product`);
      }

      // Add branch to product
      product.BU_ID.push(branchCode);
      product.accessibleBUs.push(branchCode);
      await product.save({ session });

      // Update ProductTypeMapping
      await ProductTypeMapping.findOneAndUpdate(
        { PROD_ID: product.PROD_ID },
        { 
          $addToSet: { BU_ID: branchCode }
        },
        { session }
      );

      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        event_type: 'UPDATE',
        action: 'ADD_BRANCH_TO_PRODUCT',
        old_value: {
          BU_ID: product.BU_ID.filter(code => code !== branchCode)
        },
        new_value: {
          BU_ID: product.BU_ID,
          branchAdded: branchCode
        },
        ip_address: getClientIp(req),
        entity_id: id,
        entity_type: 'LoanProduct',
        status: 'SUCCESS',
        description: `Added branch ${branchCode} (${branch.branchName}) to product: ${product.name}`,
        timestamp: new Date()
      };

      await new AuditTrail(auditTrailData).save({ session });

      await session.commitTransaction();

      res.json({ 
        success: true, 
        message: `Branch ${branchCode} added to product successfully`,
        data: {
          productId: product.PROD_ID,
          productName: product.name,
          branchCode,
          branchName: branch.branchName,
          updatedBranches: product.BU_ID
        }
      });

    } catch (error) {
      await session.abortTransaction();
      logger.error('Add branch to product failed:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to add branch to product'
      });
    } finally {
      session.endSession();
    }
  }),

  // REMOVE BRANCH FROM LOAN PRODUCT
  removeBranchFromProduct: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id, branchCode } = req.params;

      const product = await LoanProduct.findById(id).session(session);
      if (!product) {
        return res.status(404).json({ 
          success: false, 
          message: 'Loan product not found' 
        });
      }

      // Check if branch exists in product
      if (!product.BU_ID.includes(branchCode)) {
        throw new Error(`Branch ${branchCode} is not associated with this product`);
      }

      // Remove branch from product
      product.BU_ID = product.BU_ID.filter(code => code !== branchCode);
      product.accessibleBUs = product.accessibleBUs.filter(code => code !== branchCode);
      
      // Update product type if no branches left
      if (product.BU_ID.length === 0) {
        product.STATUS = 'INACTIVE';
        product.isActive = false;
      }
      
      await product.save({ session });

      // Update ProductTypeMapping
      await ProductTypeMapping.findOneAndUpdate(
        { PROD_ID: product.PROD_ID },
        { 
          $pull: { 
            BU_ID: branchCode,
            accessibleBUs: branchCode
          }
        },
        { session }
      );

      // AUDIT TRAIL
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        event_type: 'UPDATE',
        action: 'REMOVE_BRANCH_FROM_PRODUCT',
        old_value: {
          BU_ID: [...product.BU_ID, branchCode]
        },
        new_value: {
          BU_ID: product.BU_ID,
          branchRemoved: branchCode
        },
        ip_address: getClientIp(req),
        entity_id: id,
        entity_type: 'LoanProduct',
        status: 'SUCCESS',
        description: `Removed branch ${branchCode} from product: ${product.name}`,
        timestamp: new Date()
      };

      await new AuditTrail(auditTrailData).save({ session });

      await session.commitTransaction();

      res.json({ 
        success: true, 
        message: `Branch ${branchCode} removed from product successfully`,
        data: {
          productId: product.PROD_ID,
          productName: product.name,
          branchCode,
          updatedBranches: product.BU_ID,
          status: product.STATUS
        }
      });

    } catch (error) {
      await session.abortTransaction();
      logger.error('Remove branch from product failed:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to remove branch from product'
      });
    } finally {
      session.endSession();
    }
  }),

  // Backward compatibility endpoints (from desired)
  calculateLoanRepaymentEndpoint: asyncHandler(async (req, res) => {
    return LoanProductController.calculateEMIEndpoint(req, res);
  }),

  createInterestRate: asyncHandler(async (req, res) => {
    return LoanProductController.createProduct(req, res);
  }),

  getAllInterestRates: asyncHandler(async (req, res) => {
    return LoanProductController.getAllLoanProducts(req, res);
  }),

  getInterestRate: asyncHandler(async (req, res) => {
    const { PROD_ID } = req.params;
    return LoanProductController.getLoanProduct(req, res); // Pass PROD_ID as id
  }),

  updateInterestRate: asyncHandler(async (req, res) => {
    return LoanProductController.updateLoanProduct(req, res);
  })
};

// Add this function inside LoanProductController object or outside and export it

const calculateLoanRepayment = (principal, annualRate, tenureMonths, paymentFrequency = 'MONTHLY') => {
  const monthlyRate = annualRate / 12 / 100;
  const numPayments = tenureMonths;

  if (monthlyRate === 0) {
    return {
      monthlyInstallment: principal / numPayments,
      totalPayable: principal,
      totalInterest: 0
    };
  }

  const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, numPayments) /
              (Math.pow(1 + monthlyRate, numPayments) - 1);

  const totalPayable = emi * numPayments;
  const totalInterest = totalPayable - principal;

  return {
    monthlyInstallment: parseFloat(emi.toFixed(2)),
    totalPayable: parseFloat(totalPayable.toFixed(2)),
    totalInterest: parseFloat(totalInterest.toFixed(2)),
    annualRate,
    tenureMonths
  };
};

// Then export it
export { calculateLoanRepayment };
export { LoanProductController };

// Export the main controller
export default LoanProductController;
