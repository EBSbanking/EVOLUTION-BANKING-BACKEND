// src/controllers/LoanProductController.js
import asyncHandler from 'express-async-handler';
import mongoose from 'mongoose';
import LoanProduct from '../models/LoanProduct.js';
import ProductTypeMapping from '../models/ProductTypeMapping.js';
import AuditTrail from '../models/AuditTrail.js';
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

// Helper function to generate unique event ID as NUMBER (not string)
const generateEventId = () => {
  return Date.now() + Math.floor(Math.random() * 1000);
};

export const LoanProductController = {
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
        
        // Additional Fields
        createdBy = req.user?.id || 'SYSTEM',
        allowedCurrencies = ['NGN'],
        isActive = true
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

      // BU_ID PROCESSING
      let buIds = Array.isArray(BU_ID) ? BU_ID.map(String) : 
                 typeof BU_ID === 'string' ? BU_ID.split(',').map(String) : 
                 BU_ID != null ? [String(BU_ID)] : [];
      
      buIds = buIds.map(id => id.trim()).filter(Boolean);
      buIds = [...new Set(buIds)];

      if (buIds.length === 0) throw new Error('BU_ID is required');

      const validPattern = /^(\d{3}|\*|\d{1,2}\*|\*\d{1,2}|\d\*\d)$/;
      if (!buIds.every(id => validPattern.test(id))) {
        throw new Error('Invalid BU_ID format. Must be 3-digit number or valid pattern (*, 10*, *01, 1*1)');
      }

      const isGlobal = buIds.includes('*');

      // VALIDATE BRANCH GL ACCOUNTS
      if (branchGLAccounts && Array.isArray(branchGLAccounts)) {
        for (const branchAccount of branchGLAccounts) {
          if (!branchAccount.branchCode || !branchAccount.branchName) {
            throw new Error('Each branch GL account must have branchCode and branchName');
          }
        }
      }

      // CREATE LOAN PRODUCT WITH NEW SCHEMA
      const loanProduct = new LoanProduct({
        // Basic Information
        name,
        productCode,
        PROD_CD: productCode,
        PROD_ID: PROD_ID || Number(productCode),
        PRODUCT_TYPE,
        description,
        CRNCY_ID,
        
        // Business Unit Configuration
        BU_ID: buIds,
        isGlobalProduct: isGlobal,
        accessibleBUs: isGlobal ? ['*'] : buIds,
        visibility: isGlobal ? 'GLOBAL' : 'SELECTED_BUS',
        
        // Loan Terms
        minTerm: Number(minTerm),
        maxTerm: Number(maxTerm),
        minAmount: toDecimal(minAmount, 'minAmount'),
        maxAmount: toDecimal(maxAmount, 'maxAmount'),
        interestRate: toDecimal(interestRate, 'interestRate'),
        TERM_CD,
        PAYMENT_FREQUENCY,
        
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
        branchGLAccounts: (branchGLAccounts || []).map(branch => ({
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
          rateType: rateInformation.rateType || 'FIXED',
          rateStructure: rateInformation.rateStructure || 'FLAT',
          indexRate: rateInformation.indexRate,
          absoluteRate: toDecimal(rateInformation.absoluteRate, 'absoluteRate'),
          fixedRate: toDecimal(rateInformation.fixedRate || interestRate, 'fixedRate'),
          margin: toDecimal(rateInformation.margin, 'margin'),
          minimumRate: toDecimal(rateInformation.minimumRate, 'minimumRate'),
          maximumRate: toDecimal(rateInformation.maximumRate, 'maximumRate'),
          effectiveRate: toDecimal(rateInformation.effectiveRate || interestRate, 'effectiveRate'),
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
        allowedCurrencies,
        isActive
      });

      await loanProduct.save({ session });

      // PRODUCT TYPE MAPPING
      await new ProductTypeMapping({
        PROD_ID: loanProduct.PROD_ID,
        PRODUCT_TYPE: loanProduct.PRODUCT_TYPE,
        productName: name,
        accountPrefix: '10',  // Fixed account prefix
        BU_ID: buIds,
        isGlobalProduct: isGlobal,
        visibility: loanProduct.visibility,
        glAccounts: {
          loanGLAccount: defaultGLAccounts.loanGLAccount,
          principalGLAccountNo: defaultGLAccounts.principalGLAccountNo,
          interestGLAccountNo: defaultGLAccounts.interestGLAccountNo,
          interestIncomeGLAccountNo: defaultGLAccounts.interestIncomeGLAccountNo,
          processingFeeGLCode: defaultGLAccounts.processingFeeGLCode
        }
      }).save({ session });

      // AUDIT TRAIL - FIXED WITH NUMBER event_id and required action field
      const auditTrailData = {
        event_id: generateEventId(), // Now returns a Number
        user_id: createdBy,
        event_type: 'CREATE',
        action: 'CREATE_LOAN_PRODUCT', // Required field
        old_value: null,
        new_value: {
          productCode,
          name,
          PRODUCT_TYPE,
          BU_ID: buIds,
          minTerm,
          maxTerm,
          interestRate: parseFloat(interestRate),
          isGlobalProduct: isGlobal,
          branchGLAccountsCount: loanProduct.branchGLAccounts?.length || 0
        },
        ip_address: getClientIp(req),
        entity_id: loanProduct._id.toString(),
        entity_type: 'LoanProduct',
        status: 'SUCCESS',
        description: `Created loan product: ${name} (${productCode})`,
        timestamp: new Date()
      };

      await new AuditTrail(auditTrailData).save({ session });

      await session.commitTransaction();

      res.status(201).json({
        success: true,
        message: 'Loan product created successfully with branch-specific GL accounts',
        data: {
          PROD_ID: loanProduct.PROD_ID,
          productCode,
          name,
          PRODUCT_TYPE,
          BU_ID: buIds,
          branchGLAccountsCount: loanProduct.branchGLAccounts?.length || 0,
          minTerm: loanProduct.minTerm,
          maxTerm: loanProduct.maxTerm,
          interestRate: parseFloat(loanProduct.interestRate.toString())
        }
      });

    } catch (error) {
      await session.abortTransaction();
      logger.error('Product creation failed:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create loan product'
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
      buId
    } = req.query;

    const query = {};

    // Search filter
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { productCode: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
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

    // Business Unit filter
    if (buId) {
      query.BU_ID = { $in: [buId, '*'] };
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      lean: true
    };

    const products = await LoanProduct.find(query)
      .limit(options.limit)
      .skip((options.page - 1) * options.limit)
      .sort(options.sort)
      .lean();

    const total = await LoanProduct.countDocuments(query);

    res.json({
      success: true,
      data: products,
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages: Math.ceil(total / options.limit)
      }
    });
  }),

  // GET SINGLE LOAN PRODUCT
  getLoanProduct: asyncHandler(async (req, res) => {
    const { id } = req.params;
    let product;

    if (mongoose.Types.ObjectId.isValid(id)) {
      product = await LoanProduct.findById(id);
    } else {
      product = await LoanProduct.findOne({ 
        $or: [
          { productCode: id }, 
          { PROD_ID: Number(id) || 0 }
        ] 
      });
    }

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Loan product not found' 
      });
    }

    res.json({ 
      success: true, 
      data: product 
    });
  }),

  // UPDATE LOAN PRODUCT
  updateLoanProduct: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;
      const updateData = req.body;

      const product = await LoanProduct.findById(id);
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
        maxAmount: parseFloat(product.maxAmount.toString())
      };

      // Handle decimal conversions for update
      const decimalFields = [
        'minAmount', 'maxAmount', 'interestRate', 'processingFeeRate', 
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
        
        rateDecimalFields.forEach(field => {
          if (updateData.rateInformation[field] !== undefined) {
            updateData.rateInformation[field] = toDecimal(
              updateData.rateInformation[field], 
              `rateInformation.${field}`
            );
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

      const updatedProduct = await LoanProduct.findByIdAndUpdate(
        id, 
        updateData, 
        { new: true, runValidators: true, session }
      );

      // AUDIT TRAIL - FIXED
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        event_type: 'UPDATE',
        action: 'UPDATE_LOAN_PRODUCT', // Required field
        old_value: oldValues,
        new_value: {
          name: updatedProduct.name,
          productCode: updatedProduct.productCode,
          isActive: updatedProduct.isActive,
          interestRate: parseFloat(updatedProduct.interestRate.toString()),
          minAmount: parseFloat(updatedProduct.minAmount.toString()),
          maxAmount: parseFloat(updatedProduct.maxAmount.toString()),
          updatedFields: Object.keys(updateData)
        },
        ip_address: getClientIp(req),
        entity_id: id,
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

  // DELETE LOAN PRODUCT
  deleteLoanProduct: asyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;

      const product = await LoanProduct.findById(id);
      if (!product) {
        return res.status(404).json({ 
          success: false, 
          message: 'Loan product not found' 
        });
      }

      await LoanProduct.findByIdAndDelete(id, { session });

      // AUDIT TRAIL - FIXED
      const auditTrailData = {
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        event_type: 'DELETE',
        action: 'DELETE_LOAN_PRODUCT', // Required field
        old_value: {
          name: product.name,
          productCode: product.productCode,
          PRODUCT_TYPE: product.PRODUCT_TYPE,
          BU_ID: product.BU_ID
        },
        new_value: null,
        ip_address: getClientIp(req),
        entity_id: id,
        entity_type: 'LoanProduct',
        status: 'SUCCESS',
        description: `Deleted loan product: ${product.name} (${product.productCode})`,
        timestamp: new Date()
      };

      await new AuditTrail(auditTrailData).save({ session });

      await session.commitTransaction();

      res.json({ 
        success: true, 
        message: 'Loan product deleted successfully' 
      });

    } catch (error) {
      await session.abortTransaction();
      logger.error('Product deletion failed:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to delete loan product'
      });
    } finally {
      session.endSession();
    }
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

    const product = await LoanProduct.findOne({ 
      $or: [
        { _id: productId },
        { productCode: productId },
        { PROD_ID: Number(productId) || 0 }
      ] 
    });

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Loan product not found'
      });
    }

    const glAccount = product.getGLAccountForBranch(branchCode, accountType);

    if (!glAccount) {
      return res.status(404).json({
        success: false,
        message: `GL account of type '${accountType}' not found for branch '${branchCode}'`
      });
    }

    res.json({
      success: true,
      data: {
        productId: product.PROD_ID,
        productName: product.name,
        branchCode,
        accountType,
        glAccount,
        source: glAccount === product.defaultGLAccounts?.[accountType] ? 'default' : 'branch'
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

    const product = await LoanProduct.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Loan product not found'
      });
    }

    await product.updateBranchGLAccounts(branchCode, branchName, glAccounts);

    res.json({
      success: true,
      message: 'Branch GL accounts updated successfully',
      data: product
    });
  })
};