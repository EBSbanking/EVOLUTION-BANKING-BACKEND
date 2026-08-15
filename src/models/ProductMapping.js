// models/ProductMapping.js – Extended with TERM_DEPOSIT (Fixed Deposit) support
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class ProductMapping extends Model {
  // ===== Existing static methods (unchanged – only shown as placeholder) =====
  static async findByProductCode(productCode, options = {}) { /* ... */ }
  static async findByProdId(prodId, options = {}) { /* ... */ }
  static async findActiveMappings(options = {}) { /* ... */ }
  static async findByCurrency(currencyCode, options = {}) { /* ... */ }
  static async getMappingSummary() { /* ... */ }
  static async validateMapping(productData) { /* ... */ }
  static async calculateFee(prodId, amount, currency = null) { /* ... */ }
  static async getByFeeRateRange(minRate, maxRate, options = {}) { /* ... */ }

  // ===== New static helper: get GL mapping for a product =====
  static async getGLMapping(prodId, productType) {
    const mapping = await this.findOne({
      where: { PROD_ID: prodId, productType },
      attributes: [
        'glInterestAccrued',
        'glInterestIncome',
        'glInterestExpense',
        'glInterestPaid',
        'glInterestSuspense',
        'glInterestMatured',
        'glPenaltyIncome'
      ]
    });
    if (!mapping) {
      throw new Error(`No GL mapping found for product ${prodId} (${productType})`);
    }
    return mapping;
  }

  // ===== Existing instance methods (unchanged) =====
  getProductMappingDetails() { /* ... */ }
  isCurrencyAllowed(currencyCode) { /* ... */ }
  addAllowedCurrency(currencyCode) { /* ... */ }
  removeAllowedCurrency(currencyCode) { /* ... */ }
  addFeeStructureTier(tierData) { /* ... */ }
  removeFeeStructureTier(tierId) { /* ... */ }
  calculateFeeForAmount(amount) { /* ... */ }
  getFormattedFeeStructure() { /* ... */ }
  validate() { /* ... */ }

  // ===== New instance methods for GL mapping =====
  getGLMapping() {
    return {
      glInterestAccrued: this.glInterestAccrued,
      glInterestIncome: this.glInterestIncome,
      glInterestExpense: this.glInterestExpense,
      glInterestPaid: this.glInterestPaid,
      glInterestSuspense: this.glInterestSuspense,
      glInterestMatured: this.glInterestMatured,
      glPenaltyIncome: this.glPenaltyIncome,
    };
  }

  // Helpers for product type checks
  isLoan() {
    return this.productType === 'LOAN';
  }
  isSavings() {
    return this.productType === 'SAVINGS';
  }
  isTermDeposit() {
    return this.productType === 'TERM_DEPOSIT';
  }

  // Virtual: get required interest GL account based on product type
  get requiredInterestGL() {
    if (this.isLoan()) {
      return { debit: this.glInterestAccrued, credit: this.glInterestIncome };
    }
    if (this.isSavings() || this.isTermDeposit()) {
      // For term deposits, interest accrues as a liability (payable)
      return { debit: this.glInterestExpense, credit: this.glInterestAccrued };
    }
    return null;
  }
}

ProductMapping.init(
  {
    // ===== Existing fields =====
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: 'Internal ID for database relationships',
    },
    productCode: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Product code (external reference)',
    },
    PROD_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      unique: true,
      comment: 'Product identifier (internal reference)',
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Product name',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      comment: 'Is product mapping active?',
    },
    allowedCurrencies: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Allowed currencies for this product',
    },
    processingFeeRate: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0,
      comment: 'Default processing fee rate (percentage)',
    },
    feeStructure: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: [],
      comment: 'Tiered fee structure',
    },

    // ===== UPDATED: Product type (LOAN, SAVINGS, TERM_DEPOSIT) =====
    productType: {
      type: DataTypes.ENUM('LOAN', 'SAVINGS', 'TERM_DEPOSIT'),
      allowNull: false,
      defaultValue: 'LOAN',
      field: 'product_type',
      comment: 'Type of product: LOAN, SAVINGS, or TERM_DEPOSIT (Fixed Deposit)',
    },

    // ===== GL account mappings for interest =====
    // Balance sheet account: Interest Receivable (loan) / Interest Payable (savings & term deposit)
    glInterestAccrued: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'gl_interest_accrued',
      comment: 'GL account for accrued interest (receivable for loans, payable for savings/term deposit)',
    },
    // Income statement account: Interest Income (for loans only)
    glInterestIncome: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'gl_interest_income',
      comment: 'GL account for interest income (only for LOAN products)',
    },
    // Income statement account: Interest Expense (for savings and term deposits)
    glInterestExpense: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'gl_interest_expense',
      comment: 'GL account for interest expense (for SAVINGS and TERM_DEPOSIT products)',
    },
    // Cash account for when interest is actually paid
    glInterestPaid: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'gl_interest_paid',
      comment: 'GL cash account for interest payment',
    },
    // Suspense account for unsettled interest (optional)
    glInterestSuspense: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'gl_interest_suspense',
      comment: 'Suspense GL account for pending interest',
    },
    // GL account for matured interest (e.g., when term deposit matures and interest is transferred)
    glInterestMatured: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'gl_interest_matured',
      comment: 'GL account for matured interest (used for term deposits at maturity)',
    },
    // Penalty income account (for early withdrawal penalties)
    glPenaltyIncome: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'gl_penalty_income',
      comment: 'GL account for penalty income (early withdrawal fees)',
    },

    // ===== Timestamps =====
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'ProductMapping',
    tableName: 'product_mapping',
    timestamps: true,
    hooks: {
      beforeValidate: async (product) => {
        // Existing validation (trim, arrays, etc.) – keep as is
        if (product.name) product.name = product.name.trim();
        if (product.allowedCurrencies && !Array.isArray(product.allowedCurrencies)) {
          try {
            if (typeof product.allowedCurrencies === 'string') {
              product.allowedCurrencies = JSON.parse(product.allowedCurrencies);
            }
          } catch (error) {
            product.allowedCurrencies = [];
          }
        }
        if (!product.allowedCurrencies || !Array.isArray(product.allowedCurrencies)) {
          product.allowedCurrencies = [];
        }
        if (product.feeStructure && !Array.isArray(product.feeStructure)) {
          try {
            if (typeof product.feeStructure === 'string') {
              product.feeStructure = JSON.parse(product.feeStructure);
            }
          } catch (error) {
            product.feeStructure = [];
          }
        }
        if (!product.feeStructure || !Array.isArray(product.feeStructure)) {
          product.feeStructure = [];
        }
        product.allowedCurrencies = [...new Set(product.allowedCurrencies)].sort();
        if (Array.isArray(product.feeStructure)) {
          product.feeStructure = product.feeStructure.filter(tier => 
            tier && (tier.feeRate !== undefined || tier.feeAmount !== undefined)
          );
          product.feeStructure.forEach((tier, index) => {
            if (!tier.tierId) tier.tierId = index + 1;
          });
          product.feeStructure.sort((a, b) => (a.minAmount || 0) - (b.minAmount || 0));
        }

        // ===== UPDATED: Validate GL mapping based on product type =====
        if (product.productType === 'LOAN') {
          if (!product.glInterestAccrued) {
            throw new Error('LOAN product requires glInterestAccrued (interest receivable)');
          }
          if (!product.glInterestIncome) {
            throw new Error('LOAN product requires glInterestIncome (interest income GL)');
          }
        } else if (product.productType === 'SAVINGS') {
          if (!product.glInterestAccrued) {
            throw new Error('SAVINGS product requires glInterestAccrued (interest payable)');
          }
          if (!product.glInterestExpense) {
            throw new Error('SAVINGS product requires glInterestExpense (interest expense GL)');
          }
        } else if (product.productType === 'TERM_DEPOSIT') {
          if (!product.glInterestAccrued) {
            throw new Error('TERM_DEPOSIT product requires glInterestAccrued (interest payable)');
          }
          if (!product.glInterestExpense) {
            throw new Error('TERM_DEPOSIT product requires glInterestExpense (interest expense GL)');
          }
          // Optionally require glInterestMatured for maturity processing
          if (!product.glInterestMatured) {
            console.warn(`TERM_DEPOSIT product ${product.name} has no glInterestMatured set. Maturity handling may be incomplete.`);
          }
        }
      },
      beforeCreate: async (product) => {
        const validation = await ProductMapping.validateMapping(product);
        if (!validation.isValid) {
          throw new Error(validation.errors.join(', '));
        }
        if (product.processingFeeRate === undefined || product.processingFeeRate === null) {
          product.processingFeeRate = 0;
        }
      },
      beforeUpdate: async (product) => {
        const validation = await ProductMapping.validateMapping({
          ...product.getProductMappingDetails(),
          id: product.id,
        });
        if (!validation.isValid) {
          throw new Error(validation.errors.join(', '));
        }
      },
    },
    indexes: [
      // Existing indexes
      { fields: ['id'] },
      { fields: ['PROD_ID'], unique: true },
      { fields: ['productCode'], unique: true },
      { fields: ['isActive'] },
      { fields: ['productCode', 'isActive'] },
      { fields: ['name'] },
      { fields: ['name', 'isActive'] },
      { fields: ['processingFeeRate'] },
      { fields: ['processingFeeRate', 'isActive'] },
      { fields: ['PROD_ID', 'isActive'] },
      { fields: ['productCode', 'PROD_ID'] },
      // ===== Updated indexes for productType and GL fields =====
      { fields: ['productType'] },
      { fields: ['productType', 'isActive'] },
      { fields: ['glInterestAccrued'] },
      { fields: ['glInterestIncome'] },
      { fields: ['glInterestExpense'] },
      { fields: ['glInterestMatured'] },
    ],
    scopes: {
      active: { where: { isActive: true } },
      inactive: { where: { isActive: false } },
      byProductCode: (productCode) => ({ where: { productCode } }),
      byProdId: (prodId) => ({ where: { PROD_ID: prodId } }),
      byName: (name) => ({ where: { name: { [Op.iLike]: `%${name}%` } } }),
      byCurrency: (currency) => ({ where: { allowedCurrencies: { [Op.contains]: [currency] } } }),
      withFeeStructure: { where: { [Op.or]: [{ processingFeeRate: { [Op.gt]: 0 } }, { feeStructure: { [Op.ne]: null } }] } },
      freeProducts: { where: { processingFeeRate: 0, feeStructure: null } },
      feeBasedProducts: { where: { [Op.or]: [{ processingFeeRate: { [Op.gt]: 0 } }, { feeStructure: { [Op.ne]: null } }] } },
      byFeeRateRange: (minRate, maxRate) => ({ where: { processingFeeRate: { [Op.between]: [minRate, maxRate] } } }),
      sortedByName: { order: [['name', 'ASC']] },
      sortedByFeeRate: { order: [['processingFeeRate', 'ASC']] },
      sortedByProductCode: { order: [['productCode', 'ASC']] },
      withPagination: (page, pageSize) => ({ offset: (page - 1) * pageSize, limit: pageSize }),

      // ===== Updated scopes for product types =====
      loans: { where: { productType: 'LOAN' } },
      savings: { where: { productType: 'SAVINGS' } },
      termDeposits: { where: { productType: 'TERM_DEPOSIT' } },
    },
  }
);

export default ProductMapping;
