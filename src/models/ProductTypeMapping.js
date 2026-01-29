// models/ProductTypeMapping.js - UPDATED VERSION
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class ProductTypeMapping extends Model {
  // Static method: Find mapping by PROD_ID
  static async findByProdId(prodId, options = {}) {
    return this.findOne({
      where: { PROD_ID: prodId },
      ...options
    });
  }

  // Static method: Find mappings by product type
  static async findByProductType(productType, options = {}) {
    const defaultOptions = {
      where: { productType: productType },
      order: [['productName', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Find mappings by account prefix
  static async findByAccountPrefix(prefix, options = {}) {
    const defaultOptions = {
      where: { accountPrefix: prefix },
      order: [['PROD_ID', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Get product type summary
  static async getProductTypeSummary() {
    const results = await this.findAll({
      attributes: [
        'productType',
        [sequelize.fn('COUNT', sequelize.col('PROD_ID')), 'count']
      ],
      group: ['productType'],
      order: [['productType', 'ASC']],
      raw: true
    });

    return results.map(result => ({
      productType: result.productType,
      count: parseInt(result.count) || 0
    }));
  }

  // Static method: Validate GL account number - UPDATED TO ACCEPT BOTH FORMATS
  static async validateGLAccount(glAccountNo) {
    if (!glAccountNo || glAccountNo === '') {
      return { isValid: true };
    }
    
    // Accept BOTH formats:
    // 1. With hyphens: xx-xx-xx-xx-xx-xx (like 01-10-21-10-00-001)
    // 2. Without hyphens: xxxxxxxxxxxx (like 011021100001)
    
    const hasHyphens = glAccountNo.includes('-');
    
    if (hasHyphens) {
      // Format with hyphens: xx-xx-xx-xx-xx-xx or xx-xx-xx-xx-xx-xxx
      const glAccountPattern = /^(\d{2}-){5}\d{2,3}$/;
      const isValidFormat = glAccountPattern.test(glAccountNo);
      
      if (!isValidFormat) {
        return {
          isValid: false,
          error: `Invalid GL account format: ${glAccountNo}. With hyphens format: xx-xx-xx-xx-xx-xx or xx-xx-xx-xx-xx-xxx`
        };
      }
    } else {
      // Format without hyphens: 12-13 digits
      const glAccountPattern = /^\d{12,13}$/;
      const isValidFormat = glAccountPattern.test(glAccountNo);
      
      if (!isValidFormat) {
        return {
          isValid: false,
          error: `Invalid GL account format: ${glAccountNo}. Without hyphens format: 12-13 digits`
        };
      }
    }
    
    // Optional: Check if GL account exists in database (if you have a GLAccount model)
    // const glAccount = await GLAccount.findOne({ where: { GL_ACCT_NO: glAccountNo } });
    // if (!glAccount) {
    //   return {
    //     isValid: false,
    //     error: `GL account not found: ${glAccountNo}`
    //   };
    // }
    
    return { isValid: true };
  }

  // Static method: Format GL account to hyphenated format
  static formatGLAccount(glAccountNo) {
    if (!glAccountNo) return null;
    
    // If already has hyphens, return as is
    if (glAccountNo.includes('-')) return glAccountNo;
    
    // Format without hyphens to hyphenated format
    const cleanAccount = glAccountNo.replace(/\D/g, ''); // Remove non-digits
    
    if (cleanAccount.length === 12) {
      return `${cleanAccount.substring(0, 2)}-${cleanAccount.substring(2, 4)}-${cleanAccount.substring(4, 6)}-${cleanAccount.substring(6, 8)}-${cleanAccount.substring(8, 10)}-${cleanAccount.substring(10, 12)}`;
    } else if (cleanAccount.length === 13) {
      return `${cleanAccount.substring(0, 2)}-${cleanAccount.substring(2, 4)}-${cleanAccount.substring(4, 6)}-${cleanAccount.substring(6, 8)}-${cleanAccount.substring(8, 10)}-${cleanAccount.substring(10, 13)}`;
    }
    
    // Return original if can't format
    return glAccountNo;
  }

  // Static method: Remove hyphens from GL account
  static normalizeGLAccount(glAccountNo) {
    if (!glAccountNo) return null;
    return glAccountNo.replace(/-/g, ''); // Remove all hyphens
  }

  // Static method: Create product type mapping with validation
  static async createMapping(mappingData, options = {}) {
    // Validate the mapping data
    const validation = await this.validateMapping(mappingData);
    
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }
    
    // Create the mapping
    return this.create(mappingData, options);
  }

  // Static method: Validate product type mapping - UPDATED WITH BETTER ERROR HANDLING
  static async validateMapping(mappingData) {
    const errors = [];
    
    // Validate PROD_ID
    if (!mappingData.PROD_ID || mappingData.PROD_ID <= 0) {
      errors.push('PROD_ID must be a positive number');
    }
    
    // Check for duplicate PROD_ID
    const existingMapping = await this.findOne({
      where: { PROD_ID: mappingData.PROD_ID }
    });
    
    if (existingMapping && existingMapping.id !== mappingData.id) {
      errors.push(`PROD_ID ${mappingData.PROD_ID} already exists`);
    }
    
    // Validate product type
    const validProductTypes = [
      'PERSONAL_LOAN', 'BUSINESS_LOAN', 'MORTGAGE_LOAN', 'AUTO_LOAN',
      'EDUCATION_LOAN', 'CONSUMER_LOAN', 'SME_LOAN', 'AGRICULTURAL_LOAN',
      'DAILY_LOAN', 'WEEKLY_LOAN', 'GROUP_LOAN', 'MONTHLY_LOAN',
      'GROUP_MONTHLY_LOAN', 'ASSET_LOAN', 'SOLAR_LOAN', 'RAPID_CASH_LOAN',
      'STAFF_SALARY_ADVANCE', 'STAFF_LOAN', 'INDIVIDUAL_LOAN', 'CORPORATE_LOAN',
      'OVERDRAFT', 'HOME_IMPROVEMENT_LOAN', 'SMALL_MEDIUM_ENTERPRISE_LOAN',
      'SCHOOL_IMPROVEMENT_LOAN', 'AGRICULTURE_LOAN',
      // Additional product types from your system
      'SAVINGS', 'TERM_DEPOSIT', 'GENERAL_LOAN', 'MORTGAGE', 'CREDIT_CARD',
      'LINE_OF_CREDIT', 'HOME_LOAN', 'STAFF_SALARY_ADVANCE'
    ];
    
    if (!mappingData.productType || !validProductTypes.includes(mappingData.productType.toUpperCase())) {
      errors.push(`Invalid product type: ${mappingData.productType || 'undefined'}. Must be one of: ${validProductTypes.join(', ')}`);
    }
    
    // Validate account prefix
    if (!mappingData.accountPrefix || mappingData.accountPrefix.length < 2) {
      errors.push('Account prefix must be at least 2 characters');
    }
    
    // Validate GL accounts based on product type
    if (mappingData.glAccounts) {
      // Check if it's a loan product
      const productType = mappingData.productType ? mappingData.productType.toUpperCase() : '';
      const isLoanProduct = productType && 
        (productType.includes('LOAN') || 
         productType === 'MORTGAGE' || 
         productType === 'OVERDRAFT' ||
         productType === 'CREDIT_CARD');
      
      if (isLoanProduct && !mappingData.glAccounts.loanGLAccount) {
        errors.push('loanGLAccount is required for loan products');
      }
      
      // Check if it's a deposit/savings product
      const isDepositProduct = productType && 
        (productType === 'SAVINGS' || 
         productType === 'TERM_DEPOSIT');
      
      if (isDepositProduct && !mappingData.glAccounts.principalBalanceGLAccountNo) {
        errors.push('principalBalanceGLAccountNo is required for deposit/savings products');
      }
      
      // Validate individual GL account formats
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
        'processingFeeGLCode', 'interestPayableGLAccountNo', 'withholdingTaxGLAccountNo',
        'suspenseGLAccountNo'
      ];
      
      for (const field of glFields) {
        const value = mappingData.glAccounts[field];
        if (value) {
          const validation = await this.validateGLAccount(value);
          if (!validation.isValid) {
            errors.push(`${field}: ${validation.error}`);
          }
        }
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Static method: Get GL accounts by product type
  static async getGLAccountsByProductType(productType) {
    const mapping = await this.findOne({
      where: { productType: productType }
    });
    
    if (!mapping) {
      throw new Error(`No mapping found for product type: ${productType}`);
    }
    
    return mapping.glAccounts;
  }

  // Instance method: Get product mapping details
  getProductMappingDetails() {
    return {
      id: this.id,
      PROD_ID: this.PROD_ID,
      productType: this.productType,
      productName: this.productName,
      PROD_DESC: this.PROD_DESC,
      PROD_CD: this.PROD_CD,
      accountPrefix: this.accountPrefix,
      glAccounts: this.glAccounts || {},
      metadata: {
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
      }
    };
  }

  // Instance method: Check if product is loan type
  isLoanProduct() {
    return this.productType && 
      (this.productType.toUpperCase().includes('LOAN') || 
       this.productType.toUpperCase() === 'MORTGAGE' || 
       this.productType.toUpperCase() === 'OVERDRAFT' ||
       this.productType.toUpperCase() === 'CREDIT_CARD');
  }

  // Instance method: Check if product is deposit type
  isDepositProduct() {
    return this.productType && 
      (this.productType.toUpperCase() === 'SAVINGS' || 
       this.productType.toUpperCase() === 'TERM_DEPOSIT');
  }

  // Instance method: Get required GL accounts for this product type
  getRequiredGLAccounts() {
    const requiredAccounts = [];
    
    if (this.isLoanProduct()) {
      requiredAccounts.push('loanGLAccount');
      requiredAccounts.push('interestIncomeGLAccountNo');
      requiredAccounts.push('interestReceivableGLAccountNo');
    }
    
    if (this.isDepositProduct()) {
      requiredAccounts.push('principalBalanceGLAccountNo');
      requiredAccounts.push('interestExpenseGLAccountNo');
    }
    
    // Common required accounts
    requiredAccounts.push('SETTLEMENT_GL_ACCT_NO');
    
    return requiredAccounts.filter(account => 
      this.glAccounts && this.glAccounts[account]
    );
  }

  // Instance method: Get missing required GL accounts
  getMissingGLAccounts() {
    const requiredAccounts = [];
    
    if (this.isLoanProduct()) {
      requiredAccounts.push('loanGLAccount');
    }
    
    if (this.isDepositProduct()) {
      requiredAccounts.push('principalBalanceGLAccountNo');
    }
    
    return requiredAccounts.filter(account => 
      !this.glAccounts || !this.glAccounts[account]
    );
  }

  // Instance method: Validate GL account for field
  async validateGLAccountField(fieldName) {
    if (!this.glAccounts || !this.glAccounts[fieldName]) {
      return { isValid: true };
    }
    
    return await ProductTypeMapping.validateGLAccount(this.glAccounts[fieldName]);
  }

  // Instance method: Update GL account
  updateGLAccount(fieldName, glAccountNo) {
    if (!this.glAccounts) {
      this.glAccounts = {};
    }
    
    this.glAccounts[fieldName] = glAccountNo;
    return this;
  }

  // Instance method: Remove GL account
  removeGLAccount(fieldName) {
    if (this.glAccounts && this.glAccounts[fieldName]) {
      delete this.glAccounts[fieldName];
    }
    return this;
  }

  // Instance method: Get GL account summary
  getGLAccountSummary() {
    if (!this.glAccounts) {
      return {
        totalAccounts: 0,
        byCategory: {},
        missingAccounts: this.getMissingGLAccounts()
      };
    }
    
    const categories = {
      loanAccounts: [
        'loanGLAccount', 'principalGLAccountNo', 'interestIncomeGLAccountNo',
        'interestReceivableGLAccountNo', 'interestPayableGLAccountNo'
      ],
      provisionAccounts: [
        'provisionReserveGLAccountNo', 'provisionExpenseGLAccountNo',
        'chargeOffGLAccountNo', 'recoveriesGLAccountNo'
      ],
      suspenseAccounts: [
        'suspenseGLAccountNo', 'loanSuspenseGLAccountNo', 'interestSuspenseGLAccountNo',
        'lateFeeSuspenseGLAccountNo', 'unappliedFundsGLAccountNo'
      ],
      depositAccounts: [
        'principalBalanceGLAccountNo', 'interestExpenseGLAccountNo',
        'depositChargeReceivableGLAccountNo'
      ],
      taxAccounts: [
        'withholdingTaxGLAccountNo'
      ],
      settlementAccounts: [
        'SETTLEMENT_GL_ACCT_NO'
      ]
    };
    
    const summary = {
      totalAccounts: 0,
      byCategory: {},
      missingAccounts: this.getMissingGLAccounts()
    };
    
    Object.entries(categories).forEach(([category, fields]) => {
      const accounts = {};
      let count = 0;
      
      fields.forEach(field => {
        if (this.glAccounts[field]) {
          accounts[field] = this.glAccounts[field];
          count++;
          summary.totalAccounts++;
        }
      });
      
      summary.byCategory[category] = {
        count: count,
        accounts: accounts
      };
    });
    
    return summary;
  }

  // Instance method: Validate the entire mapping
  async validate() {
    return await ProductTypeMapping.validateMapping(this.getProductMappingDetails());
  }

  // Instance method: Format all GL accounts to hyphenated format
  formatAllGLAccountsToHyphenated() {
    if (!this.glAccounts) return this;
    
    Object.keys(this.glAccounts).forEach(key => {
      if (this.glAccounts[key]) {
        this.glAccounts[key] = ProductTypeMapping.formatGLAccount(this.glAccounts[key]);
      }
    });
    
    return this;
  }

  // Instance method: Normalize all GL accounts (remove hyphens)
  normalizeAllGLAccounts() {
    if (!this.glAccounts) return this;
    
    Object.keys(this.glAccounts).forEach(key => {
      if (this.glAccounts[key]) {
        this.glAccounts[key] = ProductTypeMapping.normalizeGLAccount(this.glAccounts[key]);
      }
    });
    
    return this;
  }

  // Virtual getter: Product display name
  get productDisplay() {
    return `${this.PROD_ID} - ${this.productName} (${this.productType})`;
  }

  // Virtual getter: Has complete GL account setup?
  get hasCompleteGLSetup() {
    return this.getMissingGLAccounts().length === 0;
  }

  // Virtual getter: Is active product?
  get isActive() {
    // This could be expanded based on your business logic
    return true;
  }

  // Virtual getter: Loan product category
  get loanCategory() {
    if (!this.isLoanProduct()) return null;
    
    const productTypeUpper = this.productType.toUpperCase();
    
    if (productTypeUpper.includes('PERSONAL')) return 'personal';
    if (productTypeUpper.includes('BUSINESS')) return 'business';
    if (productTypeUpper.includes('MORTGAGE') || productTypeUpper.includes('HOME')) return 'mortgage';
    if (productTypeUpper.includes('AUTO')) return 'auto';
    if (productTypeUpper.includes('EDUCATION')) return 'education';
    if (productTypeUpper.includes('SME') || productTypeUpper.includes('SMALL_MEDIUM')) return 'sme';
    if (productTypeUpper.includes('AGRICULTURE')) return 'agriculture';
    if (productTypeUpper.includes('STAFF')) return 'staff';
    if (productTypeUpper.includes('CORPORATE')) return 'corporate';
    
    return 'other';
  }

  // Virtual getter: Account number pattern
  get accountNumberPattern() {
    return `${this.accountPrefix}XXXXXXX`; // Example pattern
  }

  // Virtual getter: Get GL account in hyphenated format
  getFormattedGLAccount(fieldName) {
    if (!this.glAccounts || !this.glAccounts[fieldName]) return null;
    return ProductTypeMapping.formatGLAccount(this.glAccounts[fieldName]);
  }

  // Virtual getter: Get GL account without hyphens
  getNormalizedGLAccount(fieldName) {
    if (!this.glAccounts || !this.glAccounts[fieldName]) return null;
    return ProductTypeMapping.normalizeGLAccount(this.glAccounts[fieldName]);
  }
}

ProductTypeMapping.init({
  // Primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Internal ID for database relationships'
  },

  PROD_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'Product identifier',
    validate: {
      isPositive(value) {
        if (value <= 0) {
          throw new Error('PROD_ID must be a positive number');
        }
      }
    }
  },

  productType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Product type',
    validate: {
      isIn: [[
        'PERSONAL_LOAN', 'BUSINESS_LOAN', 'MORTGAGE_LOAN', 'AUTO_LOAN',
        'EDUCATION_LOAN', 'CONSUMER_LOAN', 'SME_LOAN', 'AGRICULTURAL_LOAN',
        'DAILY_LOAN', 'WEEKLY_LOAN', 'GROUP_LOAN', 'MONTHLY_LOAN',
        'GROUP_MONTHLY_LOAN', 'ASSET_LOAN', 'SOLAR_LOAN', 'RAPID_CASH_LOAN',
        'STAFF_SALARY_ADVANCE', 'STAFF_LOAN', 'INDIVIDUAL_LOAN', 'CORPORATE_LOAN',
        'OVERDRAFT', 'HOME_IMPROVEMENT_LOAN', 'SMALL_MEDIUM_ENTERPRISE_LOAN',
        'SCHOOL_IMPROVEMENT_LOAN', 'AGRICULTURE_LOAN',
        // Additional product types
        'SAVINGS', 'TERM_DEPOSIT', 'GENERAL_LOAN', 'MORTGAGE', 'CREDIT_CARD',
        'LINE_OF_CREDIT', 'HOME_LOAN'
      ]]
    }
  },

  productName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Product name'
  },

  PROD_DESC: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Product description'
  },

  PROD_CD: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Product code'
  },

  accountPrefix: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Account number prefix',
    validate: {
      len: {
        args: [2, 10],
        msg: 'Account prefix must be between 2 and 10 characters'
      }
    }
  },

  // GL accounts stored as JSON object
  glAccounts: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
    comment: 'GL account mappings'
  },

  // Additional fields for LoanProduct integration
  LOAN_INTEREST_RATE_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reference to LoanInterestRate'
  },

  LOAN_PROUD_INT_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Business key for interest rate'
  },

  PRODUCT_SHORT_NAME: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Product short name'
  },

  productCode: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Product code (alternative to PROD_CD)'
  },

  // Sequelize timestamps
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },

  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'ProductTypeMapping',
  tableName: 'product_type_mapping',
  timestamps: true,
  hooks: {
    beforeValidate: (mapping) => {
      // Trim string fields
      if (mapping.productName) mapping.productName = mapping.productName.trim();
      if (mapping.PROD_DESC) mapping.PROD_DESC = mapping.PROD_DESC.trim();
      if (mapping.PROD_CD) mapping.PROD_CD = mapping.PROD_CD.trim();
      if (mapping.accountPrefix) mapping.accountPrefix = mapping.accountPrefix.trim();
      if (mapping.PRODUCT_SHORT_NAME) mapping.PRODUCT_SHORT_NAME = mapping.PRODUCT_SHORT_NAME.trim().toUpperCase();
      if (mapping.productCode) mapping.productCode = mapping.productCode.trim();
      
      // Ensure productType is uppercase
      if (mapping.productType) {
        mapping.productType = mapping.productType.toUpperCase();
      }
      
      // Ensure glAccounts is an object
      if (mapping.glAccounts && typeof mapping.glAccounts === 'string') {
        try {
          mapping.glAccounts = JSON.parse(mapping.glAccounts);
        } catch (error) {
          mapping.glAccounts = {};
        }
      }
      
      if (!mapping.glAccounts || typeof mapping.glAccounts !== 'object') {
        mapping.glAccounts = {};
      }
      
      // Clean GL account numbers (remove whitespace)
      Object.keys(mapping.glAccounts).forEach(key => {
        if (typeof mapping.glAccounts[key] === 'string') {
          mapping.glAccounts[key] = mapping.glAccounts[key].trim();
        }
      });
    },
    
    beforeCreate: async (mapping) => {
      // Validate the mapping
      const validation = await ProductTypeMapping.validateMapping(mapping);
      
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
      
      // Optionally format GL accounts to hyphenated format before saving
      // mapping.formatAllGLAccountsToHyphenated();
    },
    
    beforeUpdate: async (mapping) => {
      // Validate the mapping on update
      const validation = await ProductTypeMapping.validateMapping({
        ...mapping.getProductMappingDetails(),
        id: mapping.id
      });
      
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
    },
    
    afterFind: (results) => {
      // Format GL accounts after finding (optional)
      if (!results) return;
      
      if (Array.isArray(results)) {
        results.forEach(result => {
          if (result.glAccounts) {
            // Optionally format to hyphenated format when retrieving
            // result.formatAllGLAccountsToHyphenated();
          }
        });
      } else if (results.glAccounts) {
        // Optionally format to hyphenated format when retrieving
        // results.formatAllGLAccountsToHyphenated();
      }
    }
  },
  indexes: [
    // Primary indexes
    { fields: ['id'] },
    { fields: ['PROD_ID'], unique: true },
    
    // Product type indexes
    { fields: ['productType'] },
    { fields: ['productName'] },
    { fields: ['PRODUCT_SHORT_NAME'] },
    
    // Account prefix index
    { fields: ['accountPrefix'] },
    
    // Loan interest rate reference
    { fields: ['LOAN_INTEREST_RATE_ID'] },
    { fields: ['LOAN_PROUD_INT_ID'] },
    
    // Composite indexes for common queries
    { fields: ['PROD_ID', 'productType'] },
    { fields: ['productType', 'productName'] },
    { fields: ['accountPrefix', 'productType'] },
    { fields: ['PRODUCT_SHORT_NAME', 'productType'] }
  ],
  scopes: {
    byProdId: (prodId) => ({
      where: { PROD_ID: prodId }
    }),
    byProductType: (productType) => ({
      where: { productType: productType.toUpperCase() }
    }),
    byAccountPrefix: (prefix) => ({
      where: { accountPrefix: prefix }
    }),
    byProductShortName: (shortName) => ({
      where: { PRODUCT_SHORT_NAME: shortName.toUpperCase() }
    }),
    loanProducts: {
      where: {
        productType: {
          [Op.or]: [
            { [Op.iLike]: '%LOAN%' },
            { [Op.eq]: 'MORTGAGE' },
            { [Op.eq]: 'OVERDRAFT' },
            { [Op.eq]: 'CREDIT_CARD' }
          ]
        }
      }
    },
    depositProducts: {
      where: {
        productType: {
          [Op.or]: [
            { [Op.eq]: 'SAVINGS' },
            { [Op.eq]: 'TERM_DEPOSIT' }
          ]
        }
      }
    },
    personalLoans: {
      where: {
        productType: {
          [Op.or]: [
            { [Op.eq]: 'PERSONAL_LOAN' },
            { [Op.eq]: 'CONSUMER_LOAN' },
            { [Op.eq]: 'INDIVIDUAL_LOAN' }
          ]
        }
      }
    },
    businessLoans: {
      where: {
        productType: {
          [Op.or]: [
            { [Op.eq]: 'BUSINESS_LOAN' },
            { [Op.eq]: 'SME_LOAN' },
            { [Op.eq]: 'CORPORATE_LOAN' },
            { [Op.eq]: 'SMALL_MEDIUM_ENTERPRISE_LOAN' }
          ]
        }
      }
    },
    agriculturalLoans: {
      where: {
        productType: {
          [Op.or]: [
            { [Op.eq]: 'AGRICULTURAL_LOAN' },
            { [Op.eq]: 'AGRICULTURE_LOAN' }
          ]
        }
      }
    },
    withCompleteGLSetup: {
      where: {
        // Check for essential GL accounts
        [Op.and]: [
          { glAccounts: { [Op.ne]: null } },
          sequelize.where(
            sequelize.fn('jsonb_array_length', sequelize.fn('jsonb_object_keys', sequelize.col('glAccounts'))),
            { [Op.gte]: 3 }
          )
        ]
      }
    },
    activeProducts: {
      where: {
        // Assuming you have an isActive field or status field
        // Add your active status logic here
      }
    },
    sortedByName: {
      order: [['productName', 'ASC']]
    },
    sortedByProdId: {
      order: [['PROD_ID', 'ASC']]
    },
    withPagination: (page, pageSize) => ({
      offset: (page - 1) * pageSize,
      limit: pageSize
    })
  }
});

export default ProductTypeMapping;