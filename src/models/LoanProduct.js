// models/LoanProduct.js - CLEAN VERSION with GL account wildcard resolution
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

// ==================== HELPER FUNCTIONS ====================
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

/**
 * Resolve a GL account pattern containing wildcards into a concrete account number for a specific branch.
 * Supported wildcards:
 *   - ***  (three asterisks) ? replaced by branch code padded to 3 digits
 *   - ###  (three hashes)    ? replaced by branch code padded to 3 digits
 *   - XXX  (three Xs)        ? replaced by branch code padded to 3 digits
 * Example: pattern "01***010000001" with branchCode "100" ? "01100010000001"
 */
const resolveGLAccountForBranch = (pattern, branchCode) => {
  if (!pattern) return '';
  const branchPadded = branchCode.toString().padStart(3, '0');
  return pattern.replace(/\*{3}/g, branchPadded)
                .replace(/#{3}/g, branchPadded)
                .replace(/XXX/g, branchPadded);
};

// ==================== INTEREST CALCULATION CLASS ====================
class LoanProductInterestCalculator {
  // ?? IMPORTANT: Paste all your existing interest calculation methods here:
  // - calculateFlatRate()
  // - generateAmortizationSchedule()
  // - validateLoanParameters()
  // - calculateInterestForPeriod()
  // etc.
  // They are omitted for brevity – copy them from your current file.
}

// ==================== LOAN PRODUCT MODEL ====================
const LoanProduct = sequelize.define('LoanProduct', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  prod_id: { type: DataTypes.INTEGER, allowNull: false, unique: true, validate: { isNumeric: true, min: 1 } },
  product_code: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  name: { type: DataTypes.STRING(255), allowNull: false },
  product_short_name: { type: DataTypes.STRING(100), allowNull: false, uppercase: true },
  description: { type: DataTypes.TEXT },
  product_type: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'GENERAL_LOAN' },
  
  // Foreign keys (temporarily without references)
  loan_interest_rate_id: { type: DataTypes.INTEGER, allowNull: false },
  loan_proud_int_id: { type: DataTypes.INTEGER, allowNull: true, comment: 'Business key to link with LoanInterestRate' },
  
  min_amount: { type: DataTypes.DECIMAL(15,2), allowNull: false, defaultValue: 0.00 },
  max_amount: { type: DataTypes.DECIMAL(15,2), allowNull: false, defaultValue: 0.00 },
  min_loan_term_value: { type: DataTypes.INTEGER, defaultValue: 1, validate: { min: 1 } },
  max_loan_term_value: { type: DataTypes.INTEGER, defaultValue: 60, validate: { min: 1 } },
  loan_term_type: { type: DataTypes.ENUM('DAYS','WEEKS','MONTHS','QUARTERS','YEARS'), defaultValue: 'MONTHS' },
  
  bu_id: { type: DataTypes.TEXT, allowNull: false, get() { const v = this.getDataValue('bu_id'); return v ? v.split(',') : []; }, set(v) { this.setDataValue('bu_id', Array.isArray(v) ? v.join(',') : v); } },
  is_global_product: { type: DataTypes.BOOLEAN, defaultValue: false },
  visibility: { type: DataTypes.ENUM('GLOBAL','SELECTED_BUS','SPECIFIC_BRANCHES'), defaultValue: 'SELECTED_BUS' },
  
  repayment_type: { type: DataTypes.ENUM('DAILY','WEEKLY','MONTHLY','BULLET','CUSTOM'), allowNull: false, defaultValue: 'MONTHLY' },
  payment_frequency: { type: DataTypes.ENUM('DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY'), allowNull: false, defaultValue: 'MONTHLY' },
  term_cd: { type: DataTypes.ENUM('D','W','M','Q','Y'), allowNull: false },
  crncy_id: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'NGN' },
  allowed_currencies: { type: DataTypes.TEXT, defaultValue: 'NGN', get() { const v = this.getDataValue('allowed_currencies'); return v ? v.split(',') : ['NGN']; }, set(v) { this.setDataValue('allowed_currencies', Array.isArray(v) ? v.join(',') : v); } },
  
  calculation_method_override: { type: DataTypes.ENUM('FLAT','REDUCING_BALANCE','RULE_OF_78'), allowNull: true },
  interest_type_override: { type: DataTypes.ENUM('SIMPLE','COMPOUND'), allowNull: true },
  default_gl_accounts: { type: DataTypes.JSON, defaultValue: {} },
  branch_gl_accounts: { type: DataTypes.JSON, defaultValue: [] },
  fee_structure: { type: DataTypes.JSON, defaultValue: [] },
  processing_fee_rate: { type: DataTypes.DECIMAL(5,2), defaultValue: 0.00 },
  processing_fee_gl_code: { type: DataTypes.STRING(50), defaultValue: '' },
  late_fee_per_day: { type: DataTypes.DECIMAL(10,2), defaultValue: 0.00 },
  max_late_fee: { type: DataTypes.DECIMAL(10,2), defaultValue: null },
  
  product_category: { type: DataTypes.STRING(50), allowNull: true },
  product_sub_category: { type: DataTypes.STRING(50), allowNull: true },
  risk_level: { type: DataTypes.ENUM('LOW','MEDIUM','HIGH','VERY_HIGH'), defaultValue: 'MEDIUM' },
  collateral_required: { type: DataTypes.BOOLEAN, defaultValue: false },
  allow_multiple_disbursement: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  eligibility_criteria: { type: DataTypes.JSON, defaultValue: {} },
  
  effective_dt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  expiry_dt: { type: DataTypes.DATE, defaultValue: null },
  version: { type: DataTypes.INTEGER, defaultValue: 1 },
  status: { type: DataTypes.ENUM('ACTIVE','INACTIVE','PENDING','DRAFT','ARCHIVED'), defaultValue: 'DRAFT' },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  created_by: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'SYSTEM' },
  user_id: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'SYSTEM' },
  last_modified_by: { type: DataTypes.STRING(100), defaultValue: '' },
  metadata: { type: DataTypes.JSON, defaultValue: { 
    interestRateIntegration: { 
      usesLoanProudIntId: false, 
      syncStatus: 'PENDING', 
      lastSyncAt: null 
    }, 
    productClassification: { 
      systemDefined: false, 
      customType: false, 
      tags: [] 
    } 
  } }
}, {
  tableName: 'loan_products',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  
  hooks: {
    beforeCreate: async (product) => { 
      await product.validateAndSyncInterestRate(); 
    },
    beforeUpdate: async (product) => {
      if (product.changed('loan_proud_int_id')) await product.validateAndSyncInterestRate();
      if (product.changed('loan_interest_rate_id')) await product.syncLoanProudIntId();
    },
    beforeSave: async (product) => {
      if (!product.prod_id && product.product_code) {
        const numericCode = parseInt(product.product_code.replace(/\D/g, ''), 10);
        product.prod_id = numericCode || Math.floor(Date.now() / 1000) % 1000000;
      }
      if (!product.term_cd) {
        const map = { DAYS: 'D', WEEKS: 'W', MONTHS: 'M', QUARTERS: 'Q', YEARS: 'Y' };
        product.term_cd = map[product.loan_term_type] || 'M';
      }
      if (!product.payment_frequency) {
        const freqMap = { DAYS: 'DAILY', WEEKS: 'WEEKLY', MONTHS: 'MONTHLY', QUARTERS: 'MONTHLY', YEARS: 'MONTHLY' };
        product.payment_frequency = freqMap[product.loan_term_type] || 'MONTHLY';
      }
      if (product.is_global_product) {
        product.bu_id = '*';
        product.visibility = 'GLOBAL';
      }
      if (product.product_type) {
        product.product_type = product.product_type.trim().toUpperCase().replace(/\s+/g, '_');
      }

      // ========== FIX: Ensure metadata structure exists ==========
      if (!product.metadata || typeof product.metadata !== 'object') {
        product.metadata = {
          interestRateIntegration: { 
            usesLoanProudIntId: false, 
            syncStatus: 'PENDING', 
            lastSyncAt: null 
          },
          productClassification: { 
            systemDefined: false, 
            customType: false, 
            tags: [] 
          }
        };
      } else {
        // Ensure productClassification exists
        if (!product.metadata.productClassification) {
          product.metadata.productClassification = { 
            systemDefined: false, 
            customType: false, 
            tags: [] 
          };
        }
        // Ensure nested objects exist (optional but safe)
        if (!product.metadata.interestRateIntegration) {
          product.metadata.interestRateIntegration = { 
            usesLoanProudIntId: false, 
            syncStatus: 'PENDING', 
            lastSyncAt: null 
          };
        }
      }

      const predefinedTypes = [
        'BUSINESS_TERM_LOAN', 'INDIVIDUAL_LOAN', 'CONSUMER_LOAN', 'MORTGAGE',
        'AUTO_LOAN', 'PERSONAL_LOAN', 'EDUCATION_LOAN', 'CREDIT_CARD',
        'LINE_OF_CREDIT', 'SME_LOAN', 'GENERAL_LOAN', 'GROUP_LOAN',
        'MICRO_LOAN', 'AGRI_LOAN', 'HOUSING_LOAN', 'VEHICLE_LOAN'
      ];
      product.metadata.productClassification.systemDefined = predefinedTypes.includes(product.product_type);
      product.metadata.productClassification.customType = !predefinedTypes.includes(product.product_type);
    }
  },
  getterMethods: {
    termRange() { 
      return `${this.min_loan_term_value} - ${this.max_loan_term_value} ${this.loan_term_type}`; 
    },
    // ? FIXED: accessibleBUs handles both array and string
    accessibleBUs() { 
      if (this.is_global_product) return ['*'];
      if (!this.bu_id) return [];
      // bu_id is already an array from the custom getter, so use it directly
      if (Array.isArray(this.bu_id)) return this.bu_id.filter(bu => bu && bu.trim());
      // Fallback: if it's a string, split it
      if (typeof this.bu_id === 'string') return this.bu_id.split(',').filter(bu => bu.trim());
      return [];
    },
    interestRateConfig() {
      return {
        hasLoanProudIntId: !!this.loan_proud_int_id,
        loanProudIntId: this.loan_proud_int_id,
        loanInterestRateId: this.loan_interest_rate_id,
        calculationMethod: this.calculation_method_override || null,
        interestType: this.interest_type_override || null
      };
    },
    productClassification() {
      return {
        type: this.product_type,
        category: this.product_category,
        subCategory: this.product_sub_category,
        riskLevel: this.risk_level,
        collateralRequired: this.collateral_required,
        isCustomType: this.metadata?.productClassification?.customType || false,
        isSystemDefined: this.metadata?.productClassification?.systemDefined || false,
        tags: this.metadata?.productClassification?.tags || []
      };
    }
  }
});

// ==================== INSTANCE METHODS ====================
LoanProduct.prototype.validateAndSyncInterestRate = async function() {
  const { LoanInterestRate } = sequelize.models;
  if (this.loan_proud_int_id) {
    const interestRate = await LoanInterestRate.findOne({ where: { LOAN_PROUD_INT_ID: this.loan_proud_int_id } });
    if (!interestRate) throw new Error(`No LoanInterestRate found with LOAN_PROUD_INT_ID: ${this.loan_proud_int_id}`);
    this.loan_interest_rate_id = interestRate.id;
    if (!this.metadata) this.metadata = {};
    if (!this.metadata.interestRateIntegration) this.metadata.interestRateIntegration = {};
    this.metadata.interestRateIntegration.usesLoanProudIntId = true;
    this.metadata.interestRateIntegration.syncStatus = 'SYNCED';
    this.metadata.interestRateIntegration.lastSyncAt = new Date();
    this.metadata.interestRateIntegration.matchedInterestRate = {
      id: interestRate.id, 
      name: interestRate.name, 
      code: interestRate.code, 
      loanProudIntId: interestRate.LOAN_PROUD_INT_ID
    };
  }
  return true;
};

LoanProduct.prototype.syncLoanProudIntId = async function() {
  const { LoanInterestRate } = sequelize.models;
  if (this.loan_interest_rate_id) {
    const interestRate = await LoanInterestRate.findByPk(this.loan_interest_rate_id);
    if (interestRate && interestRate.LOAN_PROUD_INT_ID) {
      this.loan_proud_int_id = interestRate.LOAN_PROUD_INT_ID;
      if (!this.metadata) this.metadata = {};
      if (!this.metadata.interestRateIntegration) this.metadata.interestRateIntegration = {};
      this.metadata.interestRateIntegration.usesLoanProudIntId = true;
      this.metadata.interestRateIntegration.syncStatus = 'SYNCED';
      this.metadata.interestRateIntegration.lastSyncAt = new Date();
      this.metadata.interestRateIntegration.matchedInterestRate = {
        id: interestRate.id, 
        name: interestRate.name, 
        code: interestRate.code, 
        loanProudIntId: interestRate.LOAN_PROUD_INT_ID
      };
    }
  }
  return this.loan_proud_int_id;
};

LoanProduct.prototype.getInterestRate = async function(options = {}) {
  const { forceRefresh = false } = options;
  const { LoanInterestRate } = sequelize.models;
  if (this.loan_proud_int_id && (!this.loan_interest_rate_id || forceRefresh)) {
    await this.validateAndSyncInterestRate();
  }
  const interestRate = await LoanInterestRate.findByPk(this.loan_interest_rate_id);
  if (!interestRate) throw new Error(`LoanInterestRate with ID ${this.loan_interest_rate_id} not found`);
  return interestRate;
};

LoanProduct.prototype.calculateLoanRepayment = async function({ 
  principal, 
  termValue, 
  termType = null, 
  useDefaultRate = true, 
  customRate = null, 
  generateSchedule = true, 
  startDate = null 
}) {
  const interestRate = await this.getInterestRate();
  const actualTermType = termType || this.loan_term_type;
  const termMonths = convertTermToMonths(termValue, actualTermType);
  let ratePerMonth;
  if (useDefaultRate) ratePerMonth = parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0');
  else if (customRate !== null) {
    ratePerMonth = parseFloat(customRate);
    const minRate = parseFloat(interestRate.MIN_RATE_PER_MONTH || '0');
    const maxRate = parseFloat(interestRate.MAX_RATE_PER_MONTH || '100');
    if (ratePerMonth < minRate || ratePerMonth > maxRate) {
      throw new Error(`Custom rate ${ratePerMonth}% outside range (${minRate}% - ${maxRate}%)`);
    }
  } else {
    ratePerMonth = parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0');
  }
  const calculationMethod = this.calculation_method_override || interestRate.CALCULATION_METHOD || 'FLAT';
  const interestType = this.interest_type_override || interestRate.INTEREST_TYPE || 'SIMPLE';
  const isAmortized = this.repayment_type !== 'BULLET';
  const calculation = LoanProductInterestCalculator.calculateFlatRate(
    principal, ratePerMonth, termMonths, interestType, isAmortized, calculationMethod, this.payment_frequency
  );
  let paymentSchedule = [];
  if (generateSchedule) {
    paymentSchedule = LoanProductInterestCalculator.generateAmortizationSchedule(
      principal, calculation.monthlyPayment, ratePerMonth / 100, termMonths, interestType, isAmortized, startDate
    );
  }
  return {
    ...calculation, 
    paymentSchedule,
    interestRateDetails: {
      id: interestRate.id, 
      name: interestRate.name, 
      code: interestRate.code, 
      loanProudIntId: interestRate.LOAN_PROUD_INT_ID,
      rateType: interestRate.RATE_TYPE, 
      interestType: interestRate.INTEREST_TYPE, 
      calculationMethod: interestRate.CALCULATION_METHOD,
      minRate: parseFloat(interestRate.MIN_RATE_PER_MONTH || '0'), 
      maxRate: parseFloat(interestRate.MAX_RATE_PER_MONTH || '0'),
      defaultRate: parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0')
    },
    productDetails: { 
      id: this.id, 
      prod_id: this.prod_id, 
      name: this.name, 
      productCode: this.product_code, 
      loanProudIntId: this.loan_proud_int_id, 
      productType: this.product_type, 
      productCategory: this.product_category 
    }
  };
};

LoanProduct.prototype.validateLoanApplication = async function(amount, termValue, termType = null, requestedRate = null) {
  const interestRate = await this.getInterestRate();
  const actualTermType = termType || this.loan_term_type;
  const constraints = {
    minAmount: this.min_amount, 
    maxAmount: this.max_amount,
    MIN_LOAN_TERM_VALUE: this.min_loan_term_value, 
    MAX_LOAN_TERM_VALUE: this.max_loan_term_value,
    LOAN_TERM_TYPE: this.loan_term_type,
    rateRange: {
      min: parseFloat(interestRate.MIN_RATE_PER_MONTH || '0'),
      max: parseFloat(interestRate.MAX_RATE_PER_MONTH || '0'),
      default: parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0')
    }
  };
  const validation = LoanProductInterestCalculator.validateLoanParameters(constraints, amount, termValue, actualTermType, requestedRate);
  return {
    ...validation,
    product: { 
      id: this.id, 
      prod_id: this.prod_id, 
      name: this.name, 
      productCode: this.product_code, 
      productType: this.product_type 
    },
    interestRate: { 
      id: interestRate.id, 
      name: interestRate.name, 
      code: interestRate.code, 
      loanProudIntId: interestRate.LOAN_PROUD_INT_ID 
    }
  };
};

LoanProduct.prototype.calculateInterestForPeriod = async function({ 
  principal, 
  startDate, 
  endDate, 
  useDefaultRate = true, 
  customRate = null 
}) {
  const interestRate = await this.getInterestRate();
  let ratePerMonth;
  if (useDefaultRate) ratePerMonth = parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0');
  else if (customRate !== null) ratePerMonth = parseFloat(customRate);
  else ratePerMonth = parseFloat(interestRate.DEFAULT_RATE_PER_MONTH || '0');
  const interestType = this.interest_type_override || interestRate.INTEREST_TYPE || 'SIMPLE';
  return LoanProductInterestCalculator.calculateInterestForPeriod(principal, ratePerMonth, startDate, endDate, interestType);
};

LoanProduct.prototype.addTags = function(tags) {
  if (!Array.isArray(tags)) tags = [tags];
  if (!this.metadata) this.metadata = {};
  if (!this.metadata.productClassification) this.metadata.productClassification = { tags: [] };
  const existingTags = this.metadata.productClassification.tags || [];
  const newTags = tags.filter(tag => !existingTags.includes(tag));
  this.metadata.productClassification.tags = [...existingTags, ...newTags];
  return this.metadata.productClassification.tags;
};

// ==================== NEW: GL ACCOUNT RESOLUTION METHOD ====================
/**
 * Get the effective GL account for a specific branch and account type.
 * Priority:
 *   1. Branch-specific override in branch_gl_accounts.
 *   2. If product is global and default_gl_accounts contains a wildcard pattern, resolve it.
 *   3. Fallback to plain default GL account.
 *
 * @param {string|number} branchCode - The branch code (e.g., "100").
 * @param {string} accountType - The type of GL account (e.g., "loanGLAccount", "interestGLAccountNo").
 * @returns {Promise<string>} The resolved GL account number.
 */
LoanProduct.prototype.getGLAccountForBranch = async function(branchCode, accountType) {
  // 1. Check branch-specific override (stored in branch_gl_accounts JSON)
  const branchOverrides = this.branch_gl_accounts || [];
  const branchOverride = branchOverrides.find(b => b.branchCode === branchCode);
  if (branchOverride && branchOverride[accountType]) {
    return branchOverride[accountType];
  }

  // 2. If product is global and defaultGLAccounts contains a pattern, resolve it
  const defaultAccounts = this.default_gl_accounts || {};
  const patternOrAccount = defaultAccounts[accountType];
  if (this.is_global_product && patternOrAccount && this._isPattern(patternOrAccount)) {
    return resolveGLAccountForBranch(patternOrAccount, branchCode);
  }

  // 3. Fallback to plain default GL account
  return patternOrAccount || '';
};

/**
 * Check if a string contains any wildcard pattern (***, ###, XXX).
 * @private
 */
LoanProduct.prototype._isPattern = function(accountString) {
  return /(\*{3}|#{3}|XXX)/.test(accountString);
};

// ==================== STATIC METHODS ====================
LoanProduct.findByLoanProudIntId = async function(loanProudIntId, options = {}) {
  const { includeInterestRate = true } = options;
  const query = { where: { loan_proud_int_id: loanProudIntId } };
  if (includeInterestRate) {
    query.include = [{ model: sequelize.models.LoanInterestRate, as: 'LoanInterestRate', required: true }];
  }
  return this.findOne(query);
};

LoanProduct.findByInterestRateLoanProudIntId = async function(loanProudIntId, options = {}) {
  const { status = 'ACTIVE', limit, offset } = options;
  return this.findAll({
    where: { 
      status, 
      is_active: true 
    },
    include: [{ 
      model: sequelize.models.LoanInterestRate, 
      as: 'LoanInterestRate', 
      where: { LOAN_PROUD_INT_ID: loanProudIntId }, 
      required: true 
    }],
    order: [['name', 'ASC']], 
    limit, 
    offset
  });
};

LoanProduct.findByProductType = async function(productType, options = {}) {
  const { status = 'ACTIVE', limit, offset, includeInterestRate = true } = options;
  const query = {
    where: { 
      product_type: productType.toUpperCase(), 
      status, 
      is_active: true 
    },
    order: [['name', 'ASC']], 
    limit, 
    offset
  };
  if (includeInterestRate) {
    query.include = [{ 
      model: sequelize.models.LoanInterestRate, 
      as: 'LoanInterestRate', 
      required: true 
    }];
  }
  return this.findAll(query);
};

LoanProduct.getProductTypes = async function() {
  const result = await this.findAll({ 
    attributes: [[sequelize.fn('DISTINCT', sequelize.col('product_type')), 'product_type']], 
    order: [['product_type', 'ASC']] 
  });
  return result.map(item => item.dataValues.product_type);
};

LoanProduct.findActiveProductsWithInterestRates = function(options = {}) {
  const { limit, offset } = options;
  return this.findAll({
    where: { 
      status: 'ACTIVE', 
      is_active: true 
    },
    include: [{ 
      model: sequelize.models.LoanInterestRate, 
      as: 'LoanInterestRate', 
      required: true 
    }],
    order: [['name', 'ASC']], 
    limit, 
    offset
  });
};

LoanProduct.findByCategory = async function(category, options = {}) {
  const { status = 'ACTIVE', limit, offset, includeInterestRate = true } = options;
  const query = {
    where: { 
      product_category: category, 
      status, 
      is_active: true 
    },
    order: [['name', 'ASC']], 
    limit, 
    offset
  };
  if (includeInterestRate) {
    query.include = [{ 
      model: sequelize.models.LoanInterestRate, 
      as: 'LoanInterestRate', 
      required: true 
    }];
  }
  return this.findAll(query);
};

// ==================== ASSOCIATIONS (DISABLED FOR INITIAL SYNC) ====================
export function setupLoanProductAssociations() {
  // ? Temporarily disabled – uncomment after tables exist
  /*
  const { LoanInterestRate } = sequelize.models;
  LoanProduct.belongsTo(LoanInterestRate, { 
    foreignKey: 'loan_interest_rate_id', 
    as: 'LoanInterestRate', 
    onDelete: 'RESTRICT', 
    onUpdate: 'CASCADE' 
  });
  LoanProduct.belongsTo(LoanInterestRate, { 
    foreignKey: 'loan_proud_int_id', 
    targetKey: 'LOAN_PROUD_INT_ID', 
    as: 'LoanInterestRateByProudId', 
    onDelete: 'RESTRICT', 
    onUpdate: 'CASCADE' 
  });
  LoanInterestRate.hasMany(LoanProduct, { 
    foreignKey: 'loan_interest_rate_id', 
    as: 'LoanProducts' 
  });
  LoanInterestRate.hasMany(LoanProduct, { 
    foreignKey: 'loan_proud_int_id', 
    targetKey: 'LOAN_PROUD_INT_ID', 
    as: 'LoanProductsByProudId' 
  });
  */
}

export function initAssociations() {
  setupLoanProductAssociations();
}
initAssociations();

export default LoanProduct;
