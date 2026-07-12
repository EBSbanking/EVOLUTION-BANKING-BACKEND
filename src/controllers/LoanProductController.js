// src/controllers/LoanProductController.js - FULL GL WILDCARD SUPPORT + PROVISION GL ACCOUNTS
import asyncHandler from 'express-async-handler';
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

// Import models
let LoanProduct, LoanInterestRate, ProductTypeMapping, AuditTrail, Branch, GLAccount;

try {
  LoanProduct = (await import('../models/LoanProduct.js')).default;
  LoanInterestRate = (await import('../models/LoanInterestRate.js')).default;
  ProductTypeMapping = (await import('../models/ProductTypeMapping.js')).default;
  AuditTrail = (await import('../models/AuditTrail.js')).default;
  Branch = (await import('../models/Branch.js')).default;
  GLAccount = (await import('../models/GLAccount.js')).default;
} catch (error) {
  console.log('❌ Individual model imports failed, trying index import...');
  const Models = await import('../models/index.js');
  LoanProduct = Models.LoanProduct;
  LoanInterestRate = Models.LoanInterestRate;
  ProductTypeMapping = Models.ProductTypeMapping;
  AuditTrail = Models.AuditTrail;
  Branch = Models.Branch;
  GLAccount = Models.GLAccount;
}

// ==================== HELPER FUNCTIONS ====================
const getClientIp = (req) => req.ip || req.connection.remoteAddress || req.socket.remoteAddress || '127.0.0.1';
const generateEventId = () => Math.min(Date.now() % 1000000 * 10000 + Math.floor(Math.random() * 10000), 2147483647);

const convertTermToMonths = (value, termType) => {
  switch(termType?.toUpperCase()) {
    case 'DAYS': return Math.ceil(value / 30.44);
    case 'WEEKS': return Math.ceil(value / 4.345);
    case 'MONTHS': return value;
    case 'QUARTERS': return value * 3;
    case 'YEARS': return value * 12;
    default: return value;
  }
};

// ---------- GL ACCOUNT WILDCARD SUPPORT ----------
// Check if a GL account string contains a wildcard pattern
const isPattern = (accountString) => /(\*{3}|#{3}|XXX)/.test(accountString);

// Resolve a pattern to a concrete GL account number for a given branch
export function resolveGLAccountForBranch(pattern, branchCode) {
  if (!pattern) return '';
  const branchPadded = branchCode.toString().padStart(3, '0');
  return pattern.replace(/\*{3}/g, branchPadded)
                .replace(/#{3}/g, branchPadded)
                .replace(/XXX/g, branchPadded);
}

// Validate a GL account (real account number) exists in the GLAccount table
async function validateRealGLAccount(glAccountNo, transaction) {
  if (!glAccountNo) return true;
  if (isPattern(glAccountNo)) return true; // patterns are always valid for storage
  
  const exists = await GLAccount.findOne({
    where: { accountNumber: glAccountNo },
    transaction
  });
  if (!exists) {
    throw new Error(`GL account ${glAccountNo} not found in the system`);
  }
  return true;
}

// Validate all GL accounts in an object (e.g., defaultGLAccounts)
async function validateGLAccountsObject(glAccountsObj, transaction) {
  for (const [key, value] of Object.entries(glAccountsObj)) {
    if (value) {
      await validateRealGLAccount(value, transaction);
    }
  }
}

// Validate branch codes
const validateBranchCodes = async (branchCodes, transaction) => {
  const validPattern = /^\d{3}$/;
  const validCodes = [];
  const invalidCodes = [];
  for (const code of branchCodes) {
    if (code === '*') {
      validCodes.push(code);
      continue;
    }
    if (!validPattern.test(code)) {
      invalidCodes.push(code);
      continue;
    }
    const branch = await Branch.findOne({ where: { branchCode: code, status: 'ACTIVE' }, transaction });
    if (branch) validCodes.push(code);
    else invalidCodes.push(code);
  }
  return { validCodes, invalidCodes };
};

// ==================== CONTROLLER ====================
export const LoanProductController = {
  // ---------- CREATE PRODUCT ----------
  createProduct: asyncHandler(async (req, res) => {
    console.log('🚀 Starting product creation...');
    if (!LoanProduct || !LoanInterestRate || !ProductTypeMapping || !AuditTrail || !Branch || !GLAccount) {
      return res.status(500).json({ success: false, message: 'Models not loaded' });
    }

    const {
      name, productCode, BU_ID = [], PROD_ID, PRODUCT_TYPE = 'BUSINESS_LOAN',
      description = '', PRODUCT_SHORT_NAME, createdBy = req.user?.id || 'SYSTEM',
      defaultGLAccounts = {}, minAmount, maxAmount, productCategory = 'BUSINESS_LOAN',
      account_prefix = 'BL'
    } = req.body;

    // Duplicate checks
    const existingLoanProduct = await LoanProduct.findOne({
      where: {
        [Op.or]: [
          { prod_id: PROD_ID || Number(productCode) },
          { product_code: productCode },
          { product_short_name: PRODUCT_SHORT_NAME?.toUpperCase() }
        ]
      }
    });
    if (existingLoanProduct) return res.status(400).json({ success: false, message: `Product already exists: ${existingLoanProduct.product_code}` });

    const existingMapping = await ProductTypeMapping.findOne({ where: { prod_id: PROD_ID || Number(productCode) } });
    if (existingMapping) return res.status(400).json({ success: false, message: `prod_id ${PROD_ID} already exists in ProductTypeMapping` });

    const transaction = await sequelize.transaction();
    try {
      const {
        CRNCY_ID = 'NGN', PAYMENT_FREQUENCY = 'MONTHLY', TERM_CD = 'M',
        LOAN_INTEREST_RATE_ID, LOAN_PROUD_INT_ID, interestRateConfig = {},
        MIN_RATE_PER_MONTH, MAX_RATE_PER_MONTH, DEFAULT_RATE_PER_MONTH,
        RATE_TY = 'FIXED', INT_TY = 'SIMPLE', CALCULATION_METHOD = 'FLAT',
        minTerm, maxTerm, MIN_LOAN_TERM_VALUE, MAX_LOAN_TERM_VALUE,
        LOAN_TERM_TYPE = 'MONTHS', MIN_LOAN_TERM_MONTHS, MAX_LOAN_TERM_MONTHS,
        ACCRUAL_BASIS = 'ACTUAL/360', ACCRUAL_FREQUENCY = 'DAILY',
        branchGLAccounts = [], feeStructure = [], processingFeeRate = 0,
        processingFeeGLCode, lateFeePerDay = 0, maxLateFee = 0,
        allowedCurrencies = ['NGN'], isActive = true, STATUS = 'ACTIVE',
        USER_ID = req.user?.id || 'SYSTEM', allowMultipleDisbursement = false
      } = req.body;

      if (!name || !productCode || !PRODUCT_TYPE) throw new Error('Missing required fields');
      if (!defaultGLAccounts?.loanGLAccount) throw new Error('Default loan GL account required');
      if (!minAmount || !maxAmount) throw new Error('minAmount and maxAmount required');

      // ---------- TERM FIELDS ----------
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
        throw new Error('Term fields (MIN_LOAN_TERM_VALUE, MAX_LOAN_TERM_VALUE, LOAN_TERM_TYPE) are required');
      }
      if (minTermValue >= maxTermValue) throw new Error('MIN_LOAN_TERM_VALUE must be less than MAX_LOAN_TERM_VALUE');

      // ---------- INTEREST RATE HANDLING ----------
      let interestRateRecord, loanInterestRateId, loanProudIntId;

      if (LOAN_INTEREST_RATE_ID) {
        interestRateRecord = await LoanInterestRate.findOne({
          where: { [Op.or]: [{ id: LOAN_INTEREST_RATE_ID }, { loan_proud_int_id: LOAN_INTEREST_RATE_ID }, { code: LOAN_INTEREST_RATE_ID.toString() }] },
          transaction
        });
        if (!interestRateRecord) throw new Error(`Interest rate ID ${LOAN_INTEREST_RATE_ID} not found`);
        loanInterestRateId = interestRateRecord.id;
        loanProudIntId = LOAN_PROUD_INT_ID || interestRateRecord.loan_proud_int_id;
      } 
      else if (MIN_RATE_PER_MONTH !== undefined || DEFAULT_RATE_PER_MONTH !== undefined || interestRateConfig) {
        if (!MIN_RATE_PER_MONTH && !interestRateConfig?.MIN_RATE_PER_MONTH) {
          throw new Error('MIN_RATE_PER_MONTH is required when creating a new interest rate');
        }
        if (!DEFAULT_RATE_PER_MONTH && !interestRateConfig?.DEFAULT_RATE_PER_MONTH) {
          throw new Error('DEFAULT_RATE_PER_MONTH is required when creating a new interest rate');
        }

        const nameRate = interestRateConfig?.name || `${name} Interest Rate`;
        const codeRate = interestRateConfig?.code || `RATE_${productCode}`;
        const minRate = MIN_RATE_PER_MONTH ?? interestRateConfig?.MIN_RATE_PER_MONTH;
        const maxRate = MAX_RATE_PER_MONTH ?? interestRateConfig?.MAX_RATE_PER_MONTH ?? minRate;
        const defaultRate = DEFAULT_RATE_PER_MONTH ?? interestRateConfig?.DEFAULT_RATE_PER_MONTH;
        const annualRate = defaultRate * 12;
        const totalInterestRate = defaultRate * maxTermValue;

        const newRateData = {
          name: nameRate,
          code: codeRate,
          description: interestRateConfig?.description || `Interest rate for ${name}`,
          rate_type: RATE_TY,
          interest_type: INT_TY,
          calculation_method: CALCULATION_METHOD,
          min_rate_per_month: minRate,
          max_rate_per_month: maxRate,
          default_rate_per_month: defaultRate,
          annual_percentage_rate: annualRate,
          total_interest_rate: totalInterestRate,
          status: 'ACTIVE',
          is_active: true,
          created_by: createdBy,
          user_id: USER_ID,
          metadata: { createdWithProduct: true, productCode, productName: name }
        };
        if (ACCRUAL_BASIS) newRateData.accrual_basis = ACCRUAL_BASIS;
        if (ACCRUAL_FREQUENCY) newRateData.accrual_frequency = ACCRUAL_FREQUENCY;
        if (termType) newRateData.term_type = termType;
        if (minTermValue !== undefined) newRateData.min_term_value = minTermValue;
        if (maxTermValue !== undefined) newRateData.max_term_value = maxTermValue;

        interestRateRecord = await LoanInterestRate.create(newRateData, { transaction });
        loanInterestRateId = interestRateRecord.id;
        loanProudIntId = interestRateRecord.loan_proud_int_id;
      } 
      else {
        throw new Error('Either LOAN_INTEREST_RATE_ID or interest rate parameters (MIN_RATE_PER_MONTH, DEFAULT_RATE_PER_MONTH) must be provided');
      }

      // ---------- BRANCH CODES ----------
      let branchCodes = Array.isArray(BU_ID) ? BU_ID.map(String) : (typeof BU_ID === 'string' ? BU_ID.split(',').map(String) : []);
      branchCodes = [...new Set(branchCodes.filter(c => c.trim()))];
      if (branchCodes.length === 0) throw new Error('BU_ID (branch codes) is required');
      const hasWildcard = branchCodes.includes('*');
      let validatedBranchCodes = [], allActiveBranches = [];
      if (hasWildcard) {
        const branches = await sequelize.query(`SELECT * FROM branches WHERE status = 'ACTIVE'`, { transaction, type: sequelize.QueryTypes.SELECT });
        allActiveBranches = branches;
        validatedBranchCodes = ['*'];
      } else {
        const validPattern = /^\d{3}$/;
        const invalidFormat = branchCodes.filter(c => !validPattern.test(c));
        if (invalidFormat.length) throw new Error(`Invalid BU_ID format: ${invalidFormat.join(', ')}`);
        for (const code of branchCodes) {
          const branch = await sequelize.query(`SELECT * FROM branches WHERE (branchCode = ? OR branch_code = ? OR code = ?) AND status = 'ACTIVE' LIMIT 1`,
            { replacements: [code, code, code], transaction, type: sequelize.QueryTypes.SELECT });
          if (branch?.length) validatedBranchCodes.push(code);
          else throw new Error(`Branch code ${code} not found or inactive`);
        }
        const branches = await sequelize.query(`SELECT * FROM branches WHERE (branchCode IN (?) OR branch_code IN (?) OR code IN (?)) AND status = 'ACTIVE'`,
          { replacements: [validatedBranchCodes, validatedBranchCodes, validatedBranchCodes], transaction, type: sequelize.QueryTypes.SELECT });
        allActiveBranches = branches;
      }

      // ==================== GL ACCOUNTS WITH PROVISION SUPPORT ====================
      const formattedDefaultGLAccounts = {
        loanGLAccount: defaultGLAccounts.loanGLAccount,
        interestGLAccountNo: defaultGLAccounts.interestGLAccountNo || defaultGLAccounts.loanGLAccount,
        interestPayableGLAccountNo: defaultGLAccounts.interestPayableGLAccountNo || defaultGLAccounts.loanGLAccount,
        withholdingTaxGLAccountNo: defaultGLAccounts.withholdingTaxGLAccountNo || defaultGLAccounts.loanGLAccount,
        suspenseGLAccountNo: defaultGLAccounts.suspenseGLAccountNo || defaultGLAccounts.loanGLAccount,
        principalGLAccountNo: defaultGLAccounts.principalGLAccountNo || defaultGLAccounts.loanGLAccount,
        processingFeeGLCode: defaultGLAccounts.processingFeeGLCode || defaultGLAccounts.loanGLAccount,
        // ✅ PROVISION GL ACCOUNTS
        provisionGLAccount: defaultGLAccounts.provisionGLAccount || '',
        provisionExpenseGLAccount: defaultGLAccounts.provisionExpenseGLAccount || ''
      };

      console.log('📦 Provision GL Account:', formattedDefaultGLAccounts.provisionGLAccount);
      console.log('📦 Provision Expense GL Account:', formattedDefaultGLAccounts.provisionExpenseGLAccount);

      // Validate GL accounts (allow patterns, check real accounts)
      await validateGLAccountsObject(formattedDefaultGLAccounts, transaction);

      if (!hasWildcard && Object.values(formattedDefaultGLAccounts).some(v => isPattern(v))) {
        console.warn('Pattern GL account used for non‑global product – will only resolve if product becomes global.');
      }

      // Create loan product
      const loanProduct = await LoanProduct.create({
        prod_id: PROD_ID || Number(productCode),
        product_code: productCode,
        name,
        product_short_name: PRODUCT_SHORT_NAME?.toUpperCase(),
        product_type: PRODUCT_TYPE.toUpperCase(),
        description,
        crncy_id: CRNCY_ID,
        loan_interest_rate_id: loanInterestRateId,
        loan_proud_int_id: loanProudIntId,
        min_loan_term_value: minTermValue,
        max_loan_term_value: maxTermValue,
        loan_term_type: termType,
        bu_id: hasWildcard ? '*' : validatedBranchCodes.join(','),
        is_global_product: hasWildcard,
        visibility: hasWildcard ? 'GLOBAL' : 'SELECTED_BUS',
        min_amount: parseFloat(minAmount),
        max_amount: parseFloat(maxAmount),
        term_cd: TERM_CD,
        payment_frequency: PAYMENT_FREQUENCY,
        repayment_type: PAYMENT_FREQUENCY,
        product_category: productCategory || PRODUCT_TYPE,
        allowed_currencies: allowedCurrencies,
        default_gl_accounts: formattedDefaultGLAccounts,
        branch_gl_accounts: branchGLAccounts.map(b => ({ 
          ...b, 
          loanGLAccount: b.loanGLAccount || defaultGLAccounts.loanGLAccount,
          provisionGLAccount: b.provisionGLAccount || defaultGLAccounts.provisionGLAccount || '',
          provisionExpenseGLAccount: b.provisionExpenseGLAccount || defaultGLAccounts.provisionExpenseGLAccount || ''
        })),
        fee_structure: feeStructure.map(f => ({ ...f, amount: parseFloat(f.amount || 0) })),
        processing_fee_rate: parseFloat(processingFeeRate || 0),
        processing_fee_gl_code: processingFeeGLCode || defaultGLAccounts.loanGLAccount,
        late_fee_per_day: parseFloat(lateFeePerDay || 0),
        max_late_fee: parseFloat(maxLateFee || 0),
        allow_multiple_disbursement: allowMultipleDisbursement === true,
        status: STATUS,
        is_active: isActive,
        created_by: createdBy,
        user_id: USER_ID,
        metadata: {
          isWildcardProduct: hasWildcard,
          totalBranches: allActiveBranches.length,
          termConfiguration: { termType, minValue: minTermValue, maxValue: maxTermValue },
          interestRateConfiguration: {
            masterInterestRateId: loanInterestRateId,
            loanProudIntId: loanProudIntId,
            rateSource: LOAN_INTEREST_RATE_ID ? 'Existing' : 'Auto-created'
          }
        }
      }, { transaction });

      // ==================== CREATE ProductTypeMapping ====================
      const productTypeMappingData = {
        prod_id: loanProduct.prod_id,
        product_type: PRODUCT_TYPE.toUpperCase(),
        product_name: name,
        product_description: description || '',
        product_code: productCode,
        account_prefix: account_prefix.trim(),
        gl_accounts: formattedDefaultGLAccounts,
        loan_interest_rate_id: loanInterestRateId,
        loan_proud_int_id: loanProudIntId,
        product_short_name: (PRODUCT_SHORT_NAME || productCode).toUpperCase(),
        created_at: new Date(),
        updated_at: new Date()
      };
      let productMapping;
      try {
        productMapping = await ProductTypeMapping.create(productTypeMappingData, { transaction });
      } catch (err) {
        const sql = `INSERT INTO ProductTypeMapping 
          (prod_id, product_type, product_name, product_description, product_code, account_prefix, gl_accounts, loan_interest_rate_id, loan_proud_int_id, product_short_name, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        await sequelize.query(sql, {
          replacements: [
            loanProduct.prod_id, productTypeMappingData.product_type, name, description,
            productCode, account_prefix, JSON.stringify(formattedDefaultGLAccounts),
            loanInterestRateId, loanProudIntId, productTypeMappingData.product_short_name,
            new Date(), new Date()
          ],
          transaction
        });
        const [res] = await sequelize.query(`SELECT id FROM ProductTypeMapping WHERE prod_id = ?`, {
          replacements: [loanProduct.prod_id], transaction, type: sequelize.QueryTypes.SELECT
        });
        productMapping = { id: res?.id };
      }

      // Audit trail
      try {
        await AuditTrail.create({
          event_id: generateEventId(),
          user_id: createdBy,
          event_type: 'CREATE',
          action: 'CREATE_LOAN_PRODUCT',
          old_value: null,
          new_value: JSON.stringify({ 
            productCode, 
            name, 
            PRODUCT_TYPE, 
            loanInterestRateId, 
            loanProudIntId, 
            validatedBranchCodes, 
            allowMultipleDisbursement, 
            hasProvisionGL: !!formattedDefaultGLAccounts.provisionGLAccount,
            defaultGLAccountsPatterns: Object.values(formattedDefaultGLAccounts).some(v => isPattern(v)) 
          }),
          ip_address: getClientIp(req),
          entity_id: loanProduct.id,
          entity_type: 'LoanProduct',
          status: 'SUCCESS',
          description: `Created loan product: ${name} (${productCode})${hasWildcard ? ' (global product)' : ''}`,
          timestamp: new Date()
        }, { transaction });
      } catch (auditError) { console.error('Audit failed', auditError.message); }

      await transaction.commit();
      res.status(201).json({
        success: true,
        message: `Loan product created successfully for ${hasWildcard ? 'all branches' : `${validatedBranchCodes.length} branches`}`,
        data: {
          prod_id: loanProduct.prod_id,
          product_code: productCode,
          name,
          product_type: PRODUCT_TYPE.toUpperCase(),
          allow_multiple_disbursement: allowMultipleDisbursement,
          termInfo: { minValue: minTermValue, maxValue: maxTermValue, type: termType },
          amountRange: { minAmount: parseFloat(minAmount), maxAmount: parseFloat(maxAmount), currency: CRNCY_ID },
          interestRate: {
            id: interestRateRecord.id,
            name: interestRateRecord.name,
            minRatePerMonth: parseFloat(interestRateRecord.min_rate_per_month || '0'),
            maxRatePerMonth: parseFloat(interestRateRecord.max_rate_per_month || '0'),
            defaultRatePerMonth: parseFloat(interestRateRecord.default_rate_per_month || '0'),
            rateType: interestRateRecord.rate_type,
            interestType: interestRateRecord.interest_type,
            loanProudIntId: interestRateRecord.loan_proud_int_id
          },
          branchConfiguration: { BU_ID: validatedBranchCodes, isGlobalProduct: hasWildcard, totalBranches: allActiveBranches.length },
          productMapping: { id: productMapping.id, product_type: productTypeMappingData.product_type, account_prefix }
        }
      });
    } catch (error) {
      if (transaction && !transaction.finished) await transaction.rollback();
      console.error('Creation error:', error);
      res.status(400).json({ success: false, message: error.message });
    }
  }),

  // ---------- GET PRODUCT ----------
  getProduct: asyncHandler(async (req, res) => {
    const { id } = req.params;
    let product;
    const numeric = parseInt(id, 10);
    if (!isNaN(numeric)) {
      product = await LoanProduct.findOne({ where: { prod_id: numeric, status: 'ACTIVE' } });
    } else {
      product = await LoanProduct.findOne({ where: { product_code: id, status: 'ACTIVE' } });
    }
    if (!product) return res.status(404).json({ success: false, message: 'Active loan product not found' });

    const interestRate = product.loan_interest_rate_id ? await LoanInterestRate.findByPk(product.loan_interest_rate_id) : null;
    
    let branchCodes = [];
    if (product.bu_id) {
      if (Array.isArray(product.bu_id)) {
        branchCodes = product.bu_id.filter(code => code && code.trim());
      } else if (typeof product.bu_id === 'string') {
        branchCodes = product.bu_id.split(',').filter(code => code && code.trim());
      }
    }
    
    const branchDetails = await Promise.all(branchCodes.map(async code => {
      if (code === '*') return { branchCode: '*', branchName: 'All Branches', branchType: 'GLOBAL' };
      const branch = await Branch.findOne({ where: { branchCode: code } });
      return branch ? { branchCode: branch.branchCode, branchName: branch.branchName, branchType: branch.branchType } : { branchCode: code, branchName: `Unknown (${code})`, branchType: 'UNKNOWN' };
    }));

    res.json({
      success: true,
      data: {
        ...product.toJSON(),
        branchDetails,
        interestRate: interestRate ? {
          id: interestRate.id, name: interestRate.name, rate_type: interestRate.rate_type,
          interest_type: interestRate.interest_type, calculation_method: interestRate.calculation_method,
          min_rate_per_month: parseFloat(interestRate.min_rate_per_month || '0'),
          max_rate_per_month: parseFloat(interestRate.max_rate_per_month || '0'),
          default_rate_per_month: parseFloat(interestRate.default_rate_per_month || '0'),
          loan_proud_int_id: interestRate.loan_proud_int_id
        } : null
      }
    });
  }),

  // ---------- GET ALL LOAN PRODUCTS ----------
  getAllLoanProducts: asyncHandler(async (req, res) => {
    const { page = 1, limit = 10, search, productType, termType, isActive, buId, status = 'ACTIVE' } = req.query;
    const where = { status };
    if (search) where[Op.or] = [
      { name: { [Op.like]: `%${search}%` } },
      { product_code: { [Op.like]: `%${search}%` } },
      { description: { [Op.like]: `%${search}%` } },
      { product_short_name: { [Op.like]: `%${search}%` } }
    ];
    if (productType) where.product_type = productType;
    if (termType) where.loan_term_type = termType.toUpperCase();
    if (isActive !== undefined) where.is_active = isActive === 'true';
    if (buId) where[Op.or] = [
      { bu_id: { [Op.like]: `%${buId}%` } },
      { bu_id: { [Op.like]: '%*%' } }
    ];
    const pageNum = parseInt(page), limitNum = parseInt(limit), offset = (pageNum - 1) * limitNum;
    const { count, rows } = await LoanProduct.findAndCountAll({ where, limit: limitNum, offset, order: [['created_at', 'DESC']] });
    
    const enhanced = await Promise.all(rows.map(async (product) => {
      const interestRate = product.loan_interest_rate_id ? await LoanInterestRate.findByPk(product.loan_interest_rate_id) : null;
      
      let branchCodes = [];
      if (product.bu_id) {
        if (Array.isArray(product.bu_id)) {
          branchCodes = product.bu_id.filter(code => code && code.trim());
        } else if (typeof product.bu_id === 'string') {
          branchCodes = product.bu_id.split(',').filter(code => code && code.trim());
        }
      }
      
      const branchDetails = await Promise.all(branchCodes.map(async code => {
        if (code === '*') return { branchCode: '*', branchName: 'All Branches', branchType: 'GLOBAL' };
        const branch = await Branch.findOne({ where: { branchCode: code } });
        return branch ? { branchCode: branch.branchCode, branchName: branch.branchName, branchType: branch.branchType } : { branchCode: code, branchName: `Unknown (${code})`, branchType: 'UNKNOWN' };
      }));
      
      return {
        prod_id: product.prod_id, product_name: product.name, product_short_name: product.product_short_name,
        product_type: product.product_type, min_loan_amount: parseFloat(product.min_amount || '0'),
        max_loan_amount: parseFloat(product.max_amount || '0'), loan_term_type: product.loan_term_type,
        min_loan_term_value: product.min_loan_term_value, max_loan_term_value: product.max_loan_term_value,
        term_range: `${product.min_loan_term_value || 1}-${product.max_loan_term_value || 60} ${product.loan_term_type || 'MONTHS'}`,
        has_interest_rate_reference: !!interestRate,
        interest_rate: interestRate ? {
          id: interestRate.id, name: interestRate.name, rate_type: interestRate.rate_type,
          min_rate: parseFloat(interestRate.min_rate_per_month || '0'),
          max_rate: parseFloat(interestRate.max_rate_per_month || '0'),
          default_rate: parseFloat(interestRate.default_rate_per_month || '0'),
          loan_proud_int_id: interestRate.loan_proud_int_id
        } : null,
        status: product.status, branches: branchDetails, is_global_product: product.is_global_product,
        created_at: product.created_at, updated_at: product.updated_at
      };
    }));
    
    res.json({ success: true, data: enhanced, pagination: { page: pageNum, limit: limitNum, total: count, pages: Math.ceil(count / limitNum) } });
  }),

// ---------- UPDATE LOAN PRODUCT - FIXED WITH PROPER ProductTypeMapping ----------
updateLoanProduct: asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    
    // ✅ Parse the ID properly
    let prodIdFromParam;
    if (id) {
      prodIdFromParam = parseInt(id, 10);
    }
    
    if (isNaN(prodIdFromParam) || prodIdFromParam === undefined) {
      if (updateData.prod_id) {
        prodIdFromParam = parseInt(updateData.prod_id, 10);
      } else if (updateData.PROD_ID) {
        prodIdFromParam = parseInt(updateData.PROD_ID, 10);
      } else {
        throw new Error('Invalid product ID: No valid prod_id found in request');
      }
    }
    
    if (isNaN(prodIdFromParam) || prodIdFromParam <= 0) {
      throw new Error(`Invalid product ID: ${id} is not a valid number`);
    }
    
    console.log(`🔍 Updating product with prod_id: ${prodIdFromParam}`);
    
    const whereClause = { prod_id: prodIdFromParam };

    const product = await LoanProduct.findOne({ where: whereClause, transaction });
    if (!product) {
      await transaction.rollback();
      return res.status(404).json({ success: false, message: `Loan product with prod_id ${prodIdFromParam} not found` });
    }

    // Sanitize allowed fields
    const allowedFields = [
      'name', 'description', 'product_short_name', 'product_type',
      'min_amount', 'max_amount', 'min_loan_term_value', 'max_loan_term_value',
      'loan_term_type', 'bu_id', 'is_global_product', 'visibility',
      'status', 'is_active', 'allow_multiple_disbursement',
      'loan_interest_rate_id', 'loan_proud_int_id', 'metadata',
      'default_gl_accounts', 'branch_gl_accounts', 'fee_structure',
      'processing_fee_rate', 'late_fee_per_day', 'max_late_fee'
    ];
    const sanitized = {};
    Object.keys(updateData).forEach(field => {
      if (allowedFields.includes(field)) sanitized[field] = updateData[field];
    });

    // Handle interest rate change
    if (sanitized.loan_interest_rate_id) {
      const rate = await LoanInterestRate.findByPk(sanitized.loan_interest_rate_id, { transaction });
      if (rate) sanitized.loan_proud_int_id = rate.loan_proud_int_id;
    }

    // BU_ID update
    if (sanitized.bu_id) {
      const branches = Array.isArray(sanitized.bu_id) ? sanitized.bu_id : [sanitized.bu_id];
      const unique = [...new Set(branches.map(String).filter(Boolean))];
      const { validCodes, invalidCodes } = await validateBranchCodes(unique, transaction);
      if (invalidCodes.length) throw new Error(`Invalid branch codes: ${invalidCodes.join(', ')}`);
      sanitized.bu_id = validCodes.join(',');
      sanitized.is_global_product = validCodes.includes('*');
      sanitized.visibility = validCodes.includes('*') ? 'GLOBAL' : 'SELECTED_BUS';
    }

    // Term handling
    if (sanitized.loan_term_type || sanitized.min_loan_term_value || sanitized.max_loan_term_value) {
      sanitized.loan_term_type = sanitized.loan_term_type || product.loan_term_type || 'MONTHS';
      sanitized.min_loan_term_value = sanitized.min_loan_term_value || product.min_loan_term_value || 1;
      sanitized.max_loan_term_value = sanitized.max_loan_term_value || product.max_loan_term_value || 60;
    }

    // ==================== GL ACCOUNT UPDATE WITH PROVISION SUPPORT ====================
    if (sanitized.default_gl_accounts && typeof sanitized.default_gl_accounts === 'object') {
      const glAccounts = sanitized.default_gl_accounts;
      
      if (updateData.provisionGLAccount !== undefined) {
        glAccounts.provisionGLAccount = updateData.provisionGLAccount;
      }
      if (updateData.provisionExpenseGLAccount !== undefined) {
        glAccounts.provisionExpenseGLAccount = updateData.provisionExpenseGLAccount;
      }
      
      if (updateData.defaultGLAccounts) {
        if (updateData.defaultGLAccounts.provisionGLAccount) {
          glAccounts.provisionGLAccount = updateData.defaultGLAccounts.provisionGLAccount;
        }
        if (updateData.defaultGLAccounts.provisionExpenseGLAccount) {
          glAccounts.provisionExpenseGLAccount = updateData.defaultGLAccounts.provisionExpenseGLAccount;
        }
      }
      
      console.log('📦 Updating default GL accounts with provision:', {
        provisionGLAccount: glAccounts.provisionGLAccount,
        provisionExpenseGLAccount: glAccounts.provisionExpenseGLAccount
      });
      
      await validateGLAccountsObject(glAccounts, transaction);
      sanitized.default_gl_accounts = glAccounts;
    } else if (updateData.defaultGLAccounts) {
      const existingGL = typeof product.default_gl_accounts === 'string' 
        ? JSON.parse(product.default_gl_accounts) 
        : (product.default_gl_accounts || {});
      
      const mergedGL = {
        ...existingGL,
        ...updateData.defaultGLAccounts,
        provisionGLAccount: updateData.defaultGLAccounts.provisionGLAccount || existingGL.provisionGLAccount || '',
        provisionExpenseGLAccount: updateData.defaultGLAccounts.provisionExpenseGLAccount || existingGL.provisionExpenseGLAccount || ''
      };
      
      console.log('📦 Merged GL accounts with provision:', {
        provisionGLAccount: mergedGL.provisionGLAccount,
        provisionExpenseGLAccount: mergedGL.provisionExpenseGLAccount
      });
      
      await validateGLAccountsObject(mergedGL, transaction);
      sanitized.default_gl_accounts = mergedGL;
    }

    if (updateData.branchGLAccounts && Array.isArray(updateData.branchGLAccounts)) {
      const existingBranchGL = typeof product.branch_gl_accounts === 'string' 
        ? JSON.parse(product.branch_gl_accounts) 
        : (product.branch_gl_accounts || []);
      
      const mergedBranchGL = updateData.branchGLAccounts.map((newAcc, index) => {
        const existing = existingBranchGL[index] || {};
        return {
          ...newAcc,
          provisionGLAccount: newAcc.provisionGLAccount || existing.provisionGLAccount || '',
          provisionExpenseGLAccount: newAcc.provisionExpenseGLAccount || existing.provisionExpenseGLAccount || ''
        };
      });
      
      sanitized.branch_gl_accounts = mergedBranchGL;
    }

    if (Object.keys(sanitized).length) {
      await LoanProduct.update(sanitized, { where: whereClause, transaction });
    }

    const updatedProduct = await LoanProduct.findOne({ where: whereClause, transaction });

    // ✅ FIX: Update ProductTypeMapping - check column name first
    try {
      // First, check if ProductTypeMapping has a prod_id column
      const mappingColumns = await sequelize.query(
        `SHOW COLUMNS FROM ProductTypeMapping`,
        { transaction, type: sequelize.QueryTypes.SELECT }
      );
      
      console.log('📋 ProductTypeMapping columns:', mappingColumns.map(c => c.Field).join(', '));
      
      // Determine the correct column name
      let prodIdColumn = 'prod_id';
      const hasProdId = mappingColumns.some(c => c.Field === 'prod_id');
      const hasPROD_ID = mappingColumns.some(c => c.Field === 'PROD_ID');
      
      if (hasPROD_ID && !hasProdId) {
        prodIdColumn = 'PROD_ID';
      } else if (hasProdId) {
        prodIdColumn = 'prod_id';
      } else {
        console.warn('⚠️ ProductTypeMapping does not have prod_id or PROD_ID column, skipping update');
        // Skip ProductTypeMapping update if column doesn't exist
      }
      
      const mappingUpdate = {};
      if (updateData.product_short_name !== undefined) mappingUpdate.product_short_name = updateData.product_short_name;
      if (updateData.loan_interest_rate_id !== undefined) mappingUpdate.loan_interest_rate_id = updateData.loan_interest_rate_id;
      
      if (sanitized.default_gl_accounts) {
        mappingUpdate.gl_accounts = sanitized.default_gl_accounts;
      } else if (updateData.defaultGLAccounts) {
        mappingUpdate.gl_accounts = updateData.defaultGLAccounts;
      } else if (updateData.default_gl_accounts) {
        mappingUpdate.gl_accounts = updateData.default_gl_accounts;
      }
      
      if (Object.keys(mappingUpdate).length && prodIdColumn) {
        console.log(`📝 Updating ProductTypeMapping for ${prodIdColumn}: ${prodIdFromParam}`);
        await ProductTypeMapping.update(mappingUpdate, { 
          where: { [prodIdColumn]: prodIdFromParam }, 
          transaction 
        });
      }
    } catch (mappingError) {
      console.error('❌ Error updating ProductTypeMapping:', mappingError.message);
      // Don't fail the whole update if ProductTypeMapping fails
      // Just log the error and continue
    }

    // Audit trail
    try {
      const newGL = typeof updatedProduct.default_gl_accounts === 'string' 
        ? JSON.parse(updatedProduct.default_gl_accounts) 
        : updatedProduct.default_gl_accounts;
      
      await AuditTrail.create({
        event_id: generateEventId(),
        user_id: req.user?.id || 'SYSTEM',
        event_type: 'UPDATE',
        action: 'UPDATE_LOAN_PRODUCT',
        old_value: JSON.stringify({ 
          name: product.name, 
          default_gl_accounts: product.default_gl_accounts,
          hasProvisionGL: product.default_gl_accounts?.provisionGLAccount ? true : false
        }),
        new_value: JSON.stringify({ 
          name: updatedProduct.name, 
          default_gl_accounts: updatedProduct.default_gl_accounts,
          hasProvisionGL: newGL?.provisionGLAccount ? true : false
        }),
        ip_address: getClientIp(req),
        entity_id: updatedProduct.id,
        entity_type: 'LoanProduct',
        status: 'SUCCESS',
        description: `Updated loan product: ${updatedProduct.name} (${updatedProduct.product_code})`,
        timestamp: new Date()
      }, { transaction });
    } catch (auditError) { console.error('Audit failed', auditError.message); }

    await transaction.commit();
    res.json({ success: true, message: 'Loan product updated successfully', data: updatedProduct.toJSON() });
  } catch (error) {
    await transaction.rollback();
    console.error('Update error:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to update loan product' });
  }
}),

  // ---------- DELETE (SOFT DELETE) ----------
  deleteLoanProduct: asyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { id } = req.params;
      const prodId = parseInt(id, 10);
      if (isNaN(prodId)) throw new Error('Invalid product ID');
      const product = await LoanProduct.findOne({ where: { prod_id: prodId }, transaction });
      if (!product) {
        await transaction.rollback();
        return res.status(404).json({ success: false, message: 'Loan product not found' });
      }
      const oldValues = {
        name: product.name, product_code: product.product_code, product_type: product.product_type,
        loan_interest_rate_id: product.loan_interest_rate_id, loan_proud_int_id: product.loan_proud_int_id,
        bu_id: product.bu_id, status: product.status
      };
      await LoanProduct.update({ status: 'INACTIVE', is_active: false }, { where: { prod_id: prodId }, transaction });
      await ProductTypeMapping.update({ is_active: false }, { where: { prod_id: prodId }, transaction });
      await AuditTrail.create({
        event_id: generateEventId(), user_id: req.user?.id || 'SYSTEM', event_type: 'DELETE', action: 'DEACTIVATE_LOAN_PRODUCT',
        old_value: oldValues, new_value: { name: product.name, product_code: product.product_code, status: 'INACTIVE' },
        ip_address: getClientIp(req), entity_id: product.id, entity_type: 'LoanProduct', status: 'SUCCESS',
        description: `Deactivated loan product: ${product.name} (${product.product_code})`, timestamp: new Date()
      }, { transaction });
      await transaction.commit();
      res.json({ success: true, message: 'Loan product deactivated successfully' });
    } catch (error) {
      await transaction.rollback();
      logger.error('Product deletion failed:', error);
      res.status(400).json({ success: false, message: error.message || 'Failed to deactivate loan product' });
    }
  }),

  // ---------- CALCULATE LOAN REPAYMENT ----------
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
    
    const product = await LoanProduct.findOne({
      where: {
        [Op.or]: [
          { prod_id: productId },
          { product_code: productId }
        ],
        status: 'ACTIVE'
      }
    });
    if (!product) {
      return res.status(404).json({ success: false, message: 'Active loan product not found' });
    }
    
    try {
      if (typeof product.calculateLoanRepayment === 'function') {
        const calculation = await product.calculateLoanRepayment({
          principal: parseFloat(principal),
          termValue: parseInt(termValue),
          termType: termType,
          useDefaultRate,
          customRate: customRate ? parseFloat(customRate) : null,
          generateSchedule,
          startDate
        });
        res.json({ success: true, message: 'Loan repayment calculated successfully', data: calculation });
      } else {
        const termInMonths = convertTermToMonths(termValue, termType);
        const interestRate = await product.getInterestRate();
        let ratePerMonth = useDefaultRate ? parseFloat(interestRate.default_rate_per_month || '0') : (customRate ? parseFloat(customRate) : parseFloat(interestRate.default_rate_per_month || '0'));
        const monthlyRate = ratePerMonth / 100;
        const totalInterest = principal * monthlyRate * termInMonths;
        const monthlyPayment = (principal + totalInterest) / termInMonths;
        res.json({
          success: true,
          message: 'Loan repayment calculated successfully (fallback)',
          data: {
            principal: parseFloat(principal.toFixed(2)),
            term: { value: termValue, type: termType, inMonths: termInMonths },
            interestRate: { monthlyRate: ratePerMonth, annualRate: ratePerMonth * 12 },
            monthlyPayment: parseFloat(monthlyPayment.toFixed(2)),
            totalInterest: parseFloat(totalInterest.toFixed(2)),
            totalPayment: parseFloat((principal + totalInterest).toFixed(2))
          }
        });
      }
    } catch (error) {
      res.status(400).json({ success: false, message: error.message || 'Failed to calculate loan repayment' });
    }
  }),

  // ---------- VALIDATE LOAN APPLICATION ----------
  validateLoanApplication: asyncHandler(async (req, res) => {
    const { productId, amount, termValue, termType, requestedRate } = req.body;
    if (!productId || !amount || !termValue || !termType) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const product = await LoanProduct.findOne({
      where: { [Op.or]: [{ prod_id: productId }, { product_code: productId }], status: 'ACTIVE' }
    });
    if (!product) return res.status(404).json({ success: false, message: 'Active loan product not found' });
    
    try {
      if (typeof product.validateLoanApplication === 'function') {
        const validation = await product.validateLoanApplication(parseFloat(amount), parseInt(termValue), termType, requestedRate ? parseFloat(requestedRate) : null);
        res.json({ success: true, message: validation.isValid ? 'Loan application is valid' : 'Validation failed', data: { product: { id: product.prod_id, name: product.name }, validation } });
      } else {
        const minAmount = parseFloat(product.min_amount || '0');
        const maxAmount = parseFloat(product.max_amount || '0');
        const minTerm = product.min_loan_term_value || 1;
        const maxTerm = product.max_loan_term_value || 60;
        const termInMonths = convertTermToMonths(termValue, termType);
        const isValid = (amount >= minAmount && amount <= maxAmount && termInMonths >= minTerm && termInMonths <= maxTerm);
        res.json({ success: true, data: { isValid, errors: isValid ? [] : ['Amount or term out of range'] } });
      }
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }),

  // ---------- CALCULATE INTEREST FOR PERIOD ----------
  calculateInterestForPeriod: asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const { principal, startDate, endDate, useDefaultRate = true, customRate = null } = req.body;
    if (!principal || !startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const product = await LoanProduct.findOne({
      where: { [Op.or]: [{ prod_id: productId }, { product_code: productId }], status: 'ACTIVE' }
    });
    if (!product) return res.status(404).json({ success: false, message: 'Active loan product not found' });
    
    try {
      if (typeof product.calculateInterestForPeriod === 'function') {
        const calc = await product.calculateInterestForPeriod({ principal: parseFloat(principal), startDate, endDate, useDefaultRate, customRate: customRate ? parseFloat(customRate) : null });
        res.json({ success: true, message: 'Interest calculated', data: calc });
      } else {
        const start = new Date(startDate), end = new Date(endDate);
        const daysDiff = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24));
        const interestRate = await product.getInterestRate();
        let ratePerMonth = useDefaultRate ? parseFloat(interestRate.default_rate_per_month || '0') : (customRate ? parseFloat(customRate) : parseFloat(interestRate.default_rate_per_month || '0'));
        const dailyRate = ratePerMonth / 30 / 100;
        const interest = principal * dailyRate * daysDiff;
        res.json({ success: true, data: { principal, startDate, endDate, days: daysDiff, interestAmount: parseFloat(interest.toFixed(2)) } });
      }
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }),

  // ---------- COMPARE INTEREST RATES ----------
  compareInterestRates: asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const { principal, termValue, termType, ratesToCompare = [] } = req.body;
    if (!principal || !termValue || !termType) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const product = await LoanProduct.findOne({
      where: { [Op.or]: [{ prod_id: productId }, { product_code: productId }], status: 'ACTIVE' }
    });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    const interestRate = await product.getInterestRate();
    const termInMonths = convertTermToMonths(termValue, termType);
    const rates = [
      { name: 'Minimum Rate', rate: parseFloat(interestRate.min_rate_per_month || '0'), type: 'MINIMUM' },
      { name: 'Default Rate', rate: parseFloat(interestRate.default_rate_per_month || '0'), type: 'DEFAULT' },
      { name: 'Maximum Rate', rate: parseFloat(interestRate.max_rate_per_month || '0'), type: 'MAXIMUM' },
      ...ratesToCompare.map((r, i) => ({ name: `Custom ${i+1}`, rate: parseFloat(r), type: 'CUSTOM' }))
    ];
    const comparisons = rates.map(r => {
      const monthlyRate = r.rate / 100;
      const totalInterest = principal * monthlyRate * termInMonths;
      const monthlyPayment = (principal + totalInterest) / termInMonths;
      return { ...r, principal, termInMonths, monthlyPayment: parseFloat(monthlyPayment.toFixed(2)), totalInterest: parseFloat(totalInterest.toFixed(2)), totalPayment: parseFloat((principal + totalInterest).toFixed(2)) };
    });
    res.json({ success: true, data: { product: { id: product.prod_id, name: product.name }, comparisons } });
  }),

  // ---------- SIMULATE RATE CHANGE ----------
  simulateRateChange: asyncHandler(async (req, res) => {
    const { productId } = req.params;
    const { principal, currentTerm, remainingTerm, currentRate, newRate, changeDate } = req.body;
    if (!principal || !currentTerm || !remainingTerm || !currentRate || !newRate) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }
    const product = await LoanProduct.findOne({
      where: { [Op.or]: [{ prod_id: productId }, { product_code: productId }], status: 'ACTIVE' }
    });
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    const principalNum = parseFloat(principal);
    const currentRateNum = parseFloat(currentRate);
    const newRateNum = parseFloat(newRate);
    const currentMonthlyRate = currentRateNum / 100;
    const currentTotalInterest = principalNum * currentMonthlyRate * currentTerm;
    const currentMonthlyPayment = (principalNum + currentTotalInterest) / currentTerm;
    const paidTerm = currentTerm - remainingTerm;
    const paidInterest = principalNum * currentMonthlyRate * paidTerm;
    const paidPrincipal = (currentMonthlyPayment * paidTerm) - paidInterest;
    const remainingPrincipal = principalNum - paidPrincipal;
    const newMonthlyRate = newRateNum / 100;
    const newRemainingInterest = remainingPrincipal * newMonthlyRate * remainingTerm;
    const newMonthlyPayment = (remainingPrincipal + newRemainingInterest) / remainingTerm;
    const monthlyPaymentChange = newMonthlyPayment - currentMonthlyPayment;
    res.json({ success: true, data: { currentMonthlyPayment, newMonthlyPayment, monthlyPaymentChange, remainingPrincipal, newRemainingInterest } });
  }),

  // ---------- CHANGE INTEREST RATE FOR PRODUCT ----------
  changeProductInterestRate: asyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { productId } = req.params;
      const { newInterestRateId, reason, effectiveDate } = req.body;
      if (!newInterestRateId || !reason) throw new Error('newInterestRateId and reason are required');
      const newRate = await LoanInterestRate.findByPk(newInterestRateId, { transaction });
      if (!newRate) throw new Error(`Interest rate ID ${newInterestRateId} not found`);
      const product = await LoanProduct.findOne({ where: { prod_id: productId }, transaction });
      if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
      const oldRateId = product.loan_interest_rate_id;
      const oldRate = await LoanInterestRate.findByPk(oldRateId, { transaction });
      await LoanProduct.update({ loan_interest_rate_id: newInterestRateId, loan_proud_int_id: newRate.loan_proud_int_id }, { where: { prod_id: productId }, transaction });
      await ProductTypeMapping.update({ loan_interest_rate_id: newInterestRateId }, { where: { prod_id: product.prod_id }, transaction });
      await AuditTrail.create({
        event_id: generateEventId(), user_id: req.user?.id || 'SYSTEM', event_type: 'UPDATE', action: 'CHANGE_PRODUCT_INTEREST_RATE',
        old_value: { loan_interest_rate_id: oldRateId, loan_proud_int_id: product.loan_proud_int_id, name: oldRate?.name },
        new_value: { loan_interest_rate_id: newInterestRateId, loan_proud_int_id: newRate.loan_proud_int_id, name: newRate.name, reason, effectiveDate },
        ip_address: getClientIp(req), entity_id: product.id, entity_type: 'LoanProduct', status: 'SUCCESS',
        description: `Changed interest rate for product ${product.name} from ${oldRate?.name || 'N/A'} to ${newRate.name}`,
        timestamp: new Date()
      }, { transaction });
      await transaction.commit();
      res.json({ success: true, message: 'Interest rate changed successfully' });
    } catch (error) {
      await transaction.rollback();
      res.status(400).json({ success: false, message: error.message });
    }
  }),

  // ---------- GET PRODUCTS BY INTEREST RATE ID ----------
  getProductsByInterestRate: asyncHandler(async (req, res) => {
    const { interestRateId } = req.params;
    const { page = 1, limit = 10, status = 'ACTIVE' } = req.query;

    const interestRate = await LoanInterestRate.findByPk(interestRateId);
    if (!interestRate) {
      return res.status(404).json({ success: false, message: 'Loan interest rate not found' });
    }

    const where = { status: status, loan_interest_rate_id: interestRateId };
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const { count, rows: products } = await LoanProduct.findAndCountAll({
      where,
      limit: limitNum,
      offset,
      order: [['created_at', 'DESC']]
    });

    res.json({
      success: true,
      message: `Products using interest rate: ${interestRate.name}`,
      data: {
        interestRate: {
          id: interestRate.id,
          name: interestRate.name,
          rate_type: interestRate.rate_type,
          min_rate_per_month: parseFloat(interestRate.min_rate_per_month || '0'),
          max_rate_per_month: parseFloat(interestRate.max_rate_per_month || '0'),
          default_rate_per_month: parseFloat(interestRate.default_rate_per_month || '0'),
          loan_proud_int_id: interestRate.loan_proud_int_id
        },
        products: products.map(product => ({
          prod_id: product.prod_id,
          name: product.name,
          product_code: product.product_code,
          product_type: product.product_type,
          min_loan_amount: parseFloat(product.min_amount || '0'),
          max_loan_amount: parseFloat(product.max_amount || '0'),
          loan_term_type: product.loan_term_type,
          min_loan_term_value: product.min_loan_term_value,
          max_loan_term_value: product.max_loan_term_value,
          is_global_product: product.is_global_product,
          bu_id: product.bu_id,
          status: product.status,
          created_at: product.created_at
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

  // ---------- GET PRODUCTS BY LOAN_PROUD_INT_ID ----------
  getProductsByLoanProudIntId: asyncHandler(async (req, res) => {
    const { loanProudIntId } = req.params;
    const { page = 1, limit = 10, status = 'ACTIVE' } = req.query;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    const { count, rows: products } = await LoanProduct.findAndCountAll({
      where: {
        loan_proud_int_id: loanProudIntId,
        status: status,
        is_active: true
      },
      limit: limitNum,
      offset,
      order: [['name', 'ASC']]
    });

    const enhancedProducts = await Promise.all(
      products.map(async (product) => {
        const interestRate = product.loan_interest_rate_id
          ? await LoanInterestRate.findByPk(product.loan_interest_rate_id)
          : null;

        return {
          prod_id: product.prod_id,
          name: product.name,
          product_code: product.product_code,
          product_type: product.product_type,
          loan_interest_rate_id: product.loan_interest_rate_id,
          loan_proud_int_id: product.loan_proud_int_id,
          min_amount: parseFloat(product.min_amount || '0'),
          max_amount: parseFloat(product.max_amount || '0'),
          is_global_product: product.is_global_product,
          status: product.status,
          interest_rate: interestRate ? {
            id: interestRate.id,
            name: interestRate.name,
            rate_type: interestRate.rate_type
          } : null
        };
      })
    );

    res.json({
      success: true,
      message: `Products with LOAN_PROUD_INT_ID: ${loanProudIntId}`,
      data: {
        loan_proud_int_id: loanProudIntId,
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

  // ---------- TEST CREATE SIMPLE ----------
  testCreateSimple: asyncHandler(async (req, res) => {
    const transaction = await sequelize.transaction();
    try {
      const { name = 'Test Loan Product', productCode = 'TEST001' } = req.body;
      const testInterestRate = await LoanInterestRate.create({
        name: 'Test Interest Rate', code: 'TEST_RATE_001', description: 'Test',
        rate_type: 'FIXED', interest_type: 'SIMPLE', calculation_method: 'FLAT',
        min_rate_per_month: 5.0, max_rate_per_month: 5.0, default_rate_per_month: 5.0,
        status: 'ACTIVE', created_by: 'test'
      }, { transaction });
      const loanProduct = await LoanProduct.create({
        name, product_code: productCode, prod_id: Math.floor(Math.random() * 10000),
        loan_interest_rate_id: testInterestRate.id, loan_proud_int_id: testInterestRate.loan_proud_int_id,
        min_amount: 100000, max_amount: 5000000, min_loan_term_value: 1, max_loan_term_value: 12,
        loan_term_type: 'MONTHS', bu_id: '001', is_global_product: false, status: 'ACTIVE', created_by: 'test'
      }, { transaction });
      await transaction.commit();
      res.json({ success: true, message: 'Test product created', data: loanProduct });
    } catch (error) {
      await transaction.rollback();
      res.status(400).json({ success: false, message: error.message });
    }
  })
};

// ==================== EXPORTS ====================
export const calculateLoanRepayment = LoanProductController.calculateLoanRepayment;
export const validateLoanApplication = LoanProductController.validateLoanApplication;
export const calculateInterestForPeriod = LoanProductController.calculateInterestForPeriod;
export const compareInterestRates = LoanProductController.compareInterestRates;
export const simulateRateChange = LoanProductController.simulateRateChange;
export const getProduct = LoanProductController.getProduct;
export const getAllLoanProducts = LoanProductController.getAllLoanProducts;
export const getProductsByInterestRate = LoanProductController.getProductsByInterestRate;
export const getProductsByLoanProudIntId = LoanProductController.getProductsByLoanProudIntId;

export default LoanProductController;