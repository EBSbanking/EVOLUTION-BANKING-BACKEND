// models/ProductTypeMapping.js - CLEAN COMPLETE VERSION (normal column names, all methods)
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class ProductTypeMapping extends Model {
  // ---------- Static Methods ----------
  static async findByProdId(prodId, options = {}) {
    return this.findOne({ where: { prod_id: prodId }, ...options });
  }

  static async findByProductType(productType, options = {}) {
    return this.findAll({
      where: { product_type: productType },
      order: [['product_name', 'ASC']],
      ...options,
    });
  }

  static async findByAccountPrefix(prefix, options = {}) {
    return this.findAll({
      where: { account_prefix: prefix },
      order: [['prod_id', 'ASC']],
      ...options,
    });
  }

  static async getProductTypeSummary() {
    const results = await this.findAll({
      attributes: ['product_type', [sequelize.fn('COUNT', sequelize.col('prod_id')), 'count']],
      group: ['product_type'],
      order: [['product_type', 'ASC']],
      raw: true,
    });
    return results.map((r) => ({ productType: r.product_type, count: parseInt(r.count) || 0 }));
  }

  static validateGLAccount(glAccountNo) {
    if (!glAccountNo || glAccountNo === '') return { isValid: true };
    const hasHyphens = glAccountNo.includes('-');
    if (hasHyphens) {
      const glAccountPattern = /^(\d{2}-){5}\d{2,3}$/;
      if (!glAccountPattern.test(glAccountNo)) {
        return {
          isValid: false,
          error: `Invalid GL account format: ${glAccountNo}. Expected xx-xx-xx-xx-xx-xx or xx-xx-xx-xx-xx-xxx`,
        };
      }
    } else {
      const glAccountPattern = /^\d{12,13}$/;
      if (!glAccountPattern.test(glAccountNo)) {
        return {
          isValid: false,
          error: `Invalid GL account format: ${glAccountNo}. Expected 12-13 digits without hyphens.`,
        };
      }
    }
    return { isValid: true };
  }

  static formatGLAccount(glAccountNo) {
    if (!glAccountNo) return null;
    if (glAccountNo.includes('-')) return glAccountNo;
    const clean = glAccountNo.replace(/\D/g, '');
    if (clean.length === 12)
      return `${clean.substring(0, 2)}-${clean.substring(2, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}-${clean.substring(8, 10)}-${clean.substring(10, 12)}`;
    if (clean.length === 13)
      return `${clean.substring(0, 2)}-${clean.substring(2, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}-${clean.substring(8, 10)}-${clean.substring(10, 13)}`;
    return glAccountNo;
  }

  static normalizeGLAccount(glAccountNo) {
    if (!glAccountNo) return null;
    return glAccountNo.replace(/-/g, '');
  }

  static async createMapping(mappingData, options = {}) {
    const validation = await this.validateMapping(mappingData);
    if (!validation.isValid) throw new Error(validation.errors.join(', '));
    return this.create(mappingData, options);
  }

  static async validateMapping(mappingData) {
    const errors = [];
    if (!mappingData.prod_id || mappingData.prod_id <= 0) errors.push('prod_id must be a positive number');
    const existing = await this.findOne({ where: { prod_id: mappingData.prod_id } });
    if (existing && existing.id !== mappingData.id) errors.push(`prod_id ${mappingData.prod_id} already exists`);

    const validProductTypes = [
      'PERSONAL_LOAN', 'BUSINESS_LOAN', 'MORTGAGE_LOAN', 'AUTO_LOAN', 'EDUCATION_LOAN',
      'CONSUMER_LOAN', 'SME_LOAN', 'AGRICULTURAL_LOAN', 'DAILY_LOAN', 'WEEKLY_LOAN',
      'GROUP_LOAN', 'MONTHLY_LOAN', 'GROUP_MONTHLY_LOAN', 'ASSET_LOAN', 'SOLAR_LOAN',
      'RAPID_CASH_LOAN', 'STAFF_SALARY_ADVANCE', 'STAFF_LOAN', 'INDIVIDUAL_LOAN',
      'CORPORATE_LOAN', 'OVERDRAFT', 'HOME_IMPROVEMENT_LOAN', 'SMALL_MEDIUM_ENTERPRISE_LOAN',
      'SCHOOL_IMPROVEMENT_LOAN', 'AGRICULTURE_LOAN', 'SAVINGS', 'TERM_DEPOSIT',
      'GENERAL_LOAN', 'MORTGAGE', 'CREDIT_CARD', 'LINE_OF_CREDIT', 'HOME_LOAN',
    ];
    if (!mappingData.product_type || !validProductTypes.includes(mappingData.product_type.toUpperCase())) {
      errors.push(`Invalid product_type: ${mappingData.product_type}. Must be one of: ${validProductTypes.join(', ')}`);
    }

    if (!mappingData.account_prefix || mappingData.account_prefix.length < 2)
      errors.push('account_prefix must be at least 2 characters');

    if (mappingData.gl_accounts) {
      const productType = mappingData.product_type?.toUpperCase() || '';
      const isLoan = productType.includes('LOAN') || ['MORTGAGE', 'OVERDRAFT', 'CREDIT_CARD'].includes(productType);
      if (isLoan && !mappingData.gl_accounts.loanGLAccount)
        errors.push('loanGLAccount is required for loan products');

      const isDeposit = productType === 'SAVINGS' || productType === 'TERM_DEPOSIT';
      if (isDeposit && !mappingData.gl_accounts.principalBalanceGLAccountNo)
        errors.push('principalBalanceGLAccountNo is required for deposit products');

      const glFields = [
        'loanGLAccount', 'interestGLAccountNo', 'interestPayableGLAccountNo',
        'withholdingTaxGLAccountNo', 'suspenseGLAccountNo', 'principalGLAccountNo',
        'chargeOffGLAccountNo', 'loanChargeReceivableGLAccountNo', 'contingentGLAccountNo',
        'delinquentGLAccountNo', 'interestIncomeGLAccountNo', 'interestReceivableGLAccountNo',
        'interestSuspenseGLAccountNo', 'lateFeeSuspenseGLAccountNo', 'maturityGLAccountNo',
        'nonAccrualGLAccountNo', 'nonAccrualInterestOffsetGLAccountNo', 'nonAccrualInterestReceivableGLAccountNo',
        'provisionReserveGLAccountNo', 'provisionExpenseGLAccountNo', 'recoveriesGLAccountNo',
        'repaymentControlGLAccountNo', 'loanSuspenseGLAccountNo', 'unappliedFundsGLAccountNo',
        'unclearedBalanceGLAccountNo', 'unearnedInterestGLAccountNo', 'interestCreditGLAccountNo',
        'interestDebitGLAccountNo', 'principalBalanceGLAccountNo', 'interestExpenseGLAccountNo',
        'depositChargeReceivableGLAccountNo', 'SETTLEMENT_GL_ACCT_NO',
        'processingFeeGLCode',
      ];
      for (const field of glFields) {
        const val = mappingData.gl_accounts[field];
        if (val) {
          const v = await this.validateGLAccount(val);
          if (!v.isValid) errors.push(`${field}: ${v.error}`);
        }
      }
    }
    return { isValid: errors.length === 0, errors };
  }

  static async getGLAccountsByProductType(productType) {
    const mapping = await this.findOne({ where: { product_type: productType } });
    if (!mapping) throw new Error(`No mapping found for product type: ${productType}`);
    return mapping.gl_accounts;
  }

  // ---------- Instance Methods ----------
  getProductMappingDetails() {
    return {
      id: this.id,
      prod_id: this.prod_id,
      product_type: this.product_type,
      product_name: this.product_name,
      product_description: this.product_description,
      product_code: this.product_code,
      account_prefix: this.account_prefix,
      gl_accounts: this.gl_accounts || {},
      loan_interest_rate_id: this.loan_interest_rate_id,
      loan_proud_int_id: this.loan_proud_int_id,
      product_short_name: this.product_short_name,
      created_at: this.created_at,
      updated_at: this.updated_at,
    };
  }

  isLoanProduct() {
    const t = this.product_type?.toUpperCase() || '';
    return t.includes('LOAN') || ['MORTGAGE', 'OVERDRAFT', 'CREDIT_CARD'].includes(t);
  }

  isDepositProduct() {
    const t = this.product_type?.toUpperCase() || '';
    return t === 'SAVINGS' || t === 'TERM_DEPOSIT';
  }

  getRequiredGLAccounts() {
    const required = [];
    if (this.isLoanProduct()) required.push('loanGLAccount', 'interestIncomeGLAccountNo', 'interestReceivableGLAccountNo');
    if (this.isDepositProduct()) required.push('principalBalanceGLAccountNo', 'interestExpenseGLAccountNo');
    required.push('SETTLEMENT_GL_ACCT_NO');
    return required.filter((acc) => this.gl_accounts && this.gl_accounts[acc]);
  }

  getMissingGLAccounts() {
    const required = [];
    if (this.isLoanProduct()) required.push('loanGLAccount');
    if (this.isDepositProduct()) required.push('principalBalanceGLAccountNo');
    return required.filter((acc) => !this.gl_accounts || !this.gl_accounts[acc]);
  }

  async validateGLAccountField(fieldName) {
    if (!this.gl_accounts || !this.gl_accounts[fieldName]) return { isValid: true };
    return ProductTypeMapping.validateGLAccount(this.gl_accounts[fieldName]);
  }

  updateGLAccount(fieldName, glAccountNo) {
    if (!this.gl_accounts) this.gl_accounts = {};
    this.gl_accounts[fieldName] = glAccountNo;
    return this;
  }

  removeGLAccount(fieldName) {
    if (this.gl_accounts && this.gl_accounts[fieldName]) delete this.gl_accounts[fieldName];
    return this;
  }

  getGLAccountSummary() {
    if (!this.gl_accounts) {
      return { totalAccounts: 0, byCategory: {}, missingAccounts: this.getMissingGLAccounts() };
    }
    const categories = {
      loanAccounts: ['loanGLAccount', 'principalGLAccountNo', 'interestIncomeGLAccountNo', 'interestReceivableGLAccountNo', 'interestPayableGLAccountNo'],
      provisionAccounts: ['provisionReserveGLAccountNo', 'provisionExpenseGLAccountNo', 'chargeOffGLAccountNo', 'recoveriesGLAccountNo'],
      suspenseAccounts: ['suspenseGLAccountNo', 'loanSuspenseGLAccountNo', 'interestSuspenseGLAccountNo', 'lateFeeSuspenseGLAccountNo', 'unappliedFundsGLAccountNo'],
      depositAccounts: ['principalBalanceGLAccountNo', 'interestExpenseGLAccountNo', 'depositChargeReceivableGLAccountNo'],
      taxAccounts: ['withholdingTaxGLAccountNo'],
      settlementAccounts: ['SETTLEMENT_GL_ACCT_NO'],
    };
    const summary = { totalAccounts: 0, byCategory: {}, missingAccounts: this.getMissingGLAccounts() };
    Object.entries(categories).forEach(([cat, fields]) => {
      const accounts = {};
      let count = 0;
      fields.forEach((f) => {
        if (this.gl_accounts[f]) {
          accounts[f] = this.gl_accounts[f];
          count++;
          summary.totalAccounts++;
        }
      });
      summary.byCategory[cat] = { count, accounts };
    });
    return summary;
  }

  async validate() {
    return ProductTypeMapping.validateMapping(this.getProductMappingDetails());
  }

  formatAllGLAccountsToHyphenated() {
    if (!this.gl_accounts) return this;
    Object.keys(this.gl_accounts).forEach((k) => {
      if (this.gl_accounts[k]) this.gl_accounts[k] = ProductTypeMapping.formatGLAccount(this.gl_accounts[k]);
    });
    return this;
  }

  normalizeAllGLAccounts() {
    if (!this.gl_accounts) return this;
    Object.keys(this.gl_accounts).forEach((k) => {
      if (this.gl_accounts[k]) this.gl_accounts[k] = ProductTypeMapping.normalizeGLAccount(this.gl_accounts[k]);
    });
    return this;
  }

  get productDisplay() {
    return `${this.prod_id} - ${this.product_name} (${this.product_type})`;
  }

  get hasCompleteGLSetup() {
    return this.getMissingGLAccounts().length === 0;
  }

  get isActive() {
    return true; // adjust if you have an active flag
  }

  get loanCategory() {
    if (!this.isLoanProduct()) return null;
    const t = this.product_type.toUpperCase();
    if (t.includes('PERSONAL')) return 'personal';
    if (t.includes('BUSINESS')) return 'business';
    if (t.includes('MORTGAGE') || t.includes('HOME')) return 'mortgage';
    if (t.includes('AUTO')) return 'auto';
    if (t.includes('EDUCATION')) return 'education';
    if (t.includes('SME') || t.includes('SMALL_MEDIUM')) return 'sme';
    if (t.includes('AGRICULTURE')) return 'agriculture';
    if (t.includes('STAFF')) return 'staff';
    if (t.includes('CORPORATE')) return 'corporate';
    return 'other';
  }

  get accountNumberPattern() {
    return `${this.account_prefix}XXXXXXX`;
  }

  getFormattedGLAccount(fieldName) {
    if (!this.gl_accounts || !this.gl_accounts[fieldName]) return null;
    return ProductTypeMapping.formatGLAccount(this.gl_accounts[fieldName]);
  }

  getNormalizedGLAccount(fieldName) {
    if (!this.gl_accounts || !this.gl_accounts[fieldName]) return null;
    return ProductTypeMapping.normalizeGLAccount(this.gl_accounts[fieldName]);
  }
}

// ---------- Model Initialization ----------
ProductTypeMapping.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: 'Internal ID',
    },
    prod_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      field: 'prod_id',
      comment: 'Product identifier',
    },
    product_type: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'product_type',
      comment: 'Product type (e.g., BUSINESS_LOAN, SAVINGS)',
    },
    product_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'product_name',
      comment: 'Product name',
    },
    product_description: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'product_description',
      comment: 'Product description',
    },
    product_code: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'product_code',
      comment: 'Product code',
    },
    account_prefix: {
      type: DataTypes.STRING(10),
      allowNull: false,
      field: 'account_prefix',
      comment: 'Account number prefix',
    },
    gl_accounts: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      field: 'gl_accounts',
      comment: 'GL account mappings',
    },
    loan_interest_rate_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'loan_interest_rate_id',
      comment: 'Reference to LoanInterestRate',
    },
    loan_proud_int_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'loan_proud_int_id',
      comment: 'Business key for interest rate',
    },
    product_short_name: {
      type: DataTypes.STRING(20),
      allowNull: true,
      field: 'product_short_name',
      comment: 'Product short name',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    modelName: 'ProductTypeMapping',
    tableName: 'ProductTypeMapping',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    
    hooks: {
      beforeValidate: (mapping) => {
        if (mapping.product_name) mapping.product_name = mapping.product_name.trim();
        if (mapping.product_description) mapping.product_description = mapping.product_description.trim();
        if (mapping.product_code) mapping.product_code = mapping.product_code.trim();
        if (mapping.account_prefix) mapping.account_prefix = mapping.account_prefix.trim();
        if (mapping.product_short_name) mapping.product_short_name = mapping.product_short_name.trim().toUpperCase();
        if (mapping.product_type) mapping.product_type = mapping.product_type.toUpperCase();
        if (mapping.gl_accounts && typeof mapping.gl_accounts === 'string') {
          try {
            mapping.gl_accounts = JSON.parse(mapping.gl_accounts);
          } catch {
            mapping.gl_accounts = {};
          }
        }
        if (!mapping.gl_accounts || typeof mapping.gl_accounts !== 'object') mapping.gl_accounts = {};
        Object.keys(mapping.gl_accounts).forEach((key) => {
          if (typeof mapping.gl_accounts[key] === 'string') mapping.gl_accounts[key] = mapping.gl_accounts[key].trim();
        });
      },
      beforeCreate: async (mapping) => {
        const validation = await ProductTypeMapping.validateMapping(mapping);
        if (!validation.isValid) throw new Error(validation.errors.join(', '));
      },
      beforeUpdate: async (mapping) => {
        const validation = await ProductTypeMapping.validateMapping({
          ...mapping.getProductMappingDetails(),
          id: mapping.id,
        });
        if (!validation.isValid) throw new Error(validation.errors.join(', '));
      },
    },
    scopes: {
      byProdId: (id) => ({ where: { prod_id: id } }),
      byProductType: (type) => ({ where: { product_type: type.toUpperCase() } }),
      byAccountPrefix: (prefix) => ({ where: { account_prefix: prefix } }),
      byProductShortName: (shortName) => ({ where: { product_short_name: shortName.toUpperCase() } }),
      loanProducts: {
        where: {
          product_type: { [Op.or]: [{ [Op.like]: '%LOAN%' }, { [Op.eq]: 'MORTGAGE' }, { [Op.eq]: 'OVERDRAFT' }, { [Op.eq]: 'CREDIT_CARD' }] },
        },
      },
      depositProducts: { where: { product_type: { [Op.or]: [{ [Op.eq]: 'SAVINGS' }, { [Op.eq]: 'TERM_DEPOSIT' }] } } },
      personalLoans: { where: { product_type: { [Op.or]: ['PERSONAL_LOAN', 'CONSUMER_LOAN', 'INDIVIDUAL_LOAN'] } } },
      businessLoans: { where: { product_type: { [Op.or]: ['BUSINESS_LOAN', 'SME_LOAN', 'CORPORATE_LOAN', 'SMALL_MEDIUM_ENTERPRISE_LOAN'] } } },
      agriculturalLoans: { where: { product_type: { [Op.or]: ['AGRICULTURAL_LOAN', 'AGRICULTURE_LOAN'] } } },
      withCompleteGLSetup: {
        where: {
          [Op.and]: [{ gl_accounts: { [Op.ne]: null } }, sequelize.where(sequelize.fn('JSON_LENGTH', sequelize.col('gl_accounts')), { [Op.gte]: 3 })],
        },
      },
      sortedByName: { order: [['product_name', 'ASC']] },
      sortedByProdId: { order: [['prod_id', 'ASC']] },
      withPagination: (page, size) => ({ offset: (page - 1) * size, limit: size }),
    },
  }
);

export default ProductTypeMapping;