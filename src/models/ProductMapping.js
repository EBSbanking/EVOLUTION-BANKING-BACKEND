// models/ProductMapping.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class ProductMapping extends Model {
  // Static method: Find mapping by product code
  static async findByProductCode(productCode, options = {}) {
    return this.findOne({
      where: { productCode: productCode },
      ...options
    });
  }

  // Static method: Find mapping by PROD_ID
  static async findByProdId(prodId, options = {}) {
    return this.findOne({
      where: { PROD_ID: prodId },
      ...options
    });
  }

  // Static method: Find active product mappings
  static async findActiveMappings(options = {}) {
    const defaultOptions = {
      where: { isActive: true },
      order: [['name', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Find mappings by currency
  static async findByCurrency(currencyCode, options = {}) {
    const defaultOptions = {
      where: {
        isActive: true,
        allowedCurrencies: {
          [Op.contains]: [currencyCode]
        }
      },
      order: [['name', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Get product mapping summary
  static async getMappingSummary() {
    const results = await this.findAll({
      attributes: [
        'isActive',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [
          sequelize.fn('AVG', sequelize.col('processingFeeRate')),
          'averageFeeRate'
        ]
      ],
      group: ['isActive'],
      raw: true
    });

    const summary = {
      active: { count: 0, averageFeeRate: 0 },
      inactive: { count: 0, averageFeeRate: 0 },
      total: 0,
      byCurrency: {}
    };

    results.forEach(result => {
      const status = result.isActive ? 'active' : 'inactive';
      summary[status] = {
        count: parseInt(result.count) || 0,
        averageFeeRate: parseFloat(result.averageFeeRate) || 0
      };
      summary.total += parseInt(result.count) || 0;
    });

    // Get currency distribution (simplified - in practice you might want a separate query)
    const allMappings = await this.findAll({
      where: { isActive: true },
      attributes: ['allowedCurrencies']
    });

    const currencyCounts = {};
    allMappings.forEach(mapping => {
      if (mapping.allowedCurrencies && Array.isArray(mapping.allowedCurrencies)) {
        mapping.allowedCurrencies.forEach(currency => {
          currencyCounts[currency] = (currencyCounts[currency] || 0) + 1;
        });
      }
    });

    summary.byCurrency = currencyCounts;

    return summary;
  }

  // Static method: Validate product mapping
  static async validateMapping(productData) {
    const errors = [];
    
    // Check for duplicate productCode
    const existingByCode = await this.findOne({
      where: { productCode: productData.productCode }
    });
    
    if (existingByCode && existingByCode.id !== (productData.id || productData.PROD_ID)) {
      errors.push(`Product code ${productData.productCode} already exists`);
    }
    
    // Check for duplicate PROD_ID
    const existingById = await this.findOne({
      where: { PROD_ID: productData.PROD_ID }
    });
    
    if (existingById && existingById.id !== productData.id) {
      errors.push(`PROD_ID ${productData.PROD_ID} already exists`);
    }
    
    // Validate processing fee rate
    if (productData.processingFeeRate < 0) {
      errors.push('Processing fee rate cannot be negative');
    }
    
    if (productData.processingFeeRate > 100) {
      errors.push('Processing fee rate cannot exceed 100%');
    }
    
    // Validate currency codes (assuming 3-letter codes)
    if (productData.allowedCurrencies) {
      productData.allowedCurrencies.forEach(currency => {
        if (currency.length !== 3) {
          errors.push(`Currency code ${currency} must be 3 characters`);
        }
      });
    }
    
    // Validate fee structure
    if (productData.feeStructure) {
      productData.feeStructure.forEach((fee, index) => {
        if (fee.minAmount && fee.maxAmount && fee.minAmount > fee.maxAmount) {
          errors.push(`Fee structure ${index + 1}: minAmount cannot be greater than maxAmount`);
        }
        
        if (fee.feeRate && fee.feeRate < 0) {
          errors.push(`Fee structure ${index + 1}: feeRate cannot be negative`);
        }
        
        if (fee.feeAmount && fee.feeAmount < 0) {
          errors.push(`Fee structure ${index + 1}: feeAmount cannot be negative`);
        }
      });
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Static method: Calculate fee for amount
  static async calculateFee(prodId, amount, currency = null) {
    const mapping = await this.findByProdId(prodId);
    
    if (!mapping) {
      throw new Error('Product mapping not found');
    }
    
    if (!mapping.isActive) {
      throw new Error('Product mapping is not active');
    }
    
    // Check currency if specified
    if (currency && mapping.allowedCurrencies && !mapping.allowedCurrencies.includes(currency)) {
      throw new Error(`Currency ${currency} not allowed for this product`);
    }
    
    let feeAmount = 0;
    let feeRate = mapping.processingFeeRate || 0;
    let applicableFeeStructure = null;
    
    // Check if amount falls within fee structure tiers
    if (mapping.feeStructure && Array.isArray(mapping.feeStructure)) {
      for (const fee of mapping.feeStructure) {
        const minAmount = fee.minAmount || 0;
        const maxAmount = fee.maxAmount || Infinity;
        
        if (amount >= minAmount && amount <= maxAmount) {
          applicableFeeStructure = fee;
          
          if (fee.feeRate !== undefined) {
            feeRate = fee.feeRate;
            feeAmount = (amount * feeRate) / 100;
          } else if (fee.feeAmount !== undefined) {
            feeAmount = fee.feeAmount;
            feeRate = (feeAmount / amount) * 100;
          }
          break;
        }
      }
    }
    
    // If no fee structure matched, use default processing fee rate
    if (!applicableFeeStructure && mapping.processingFeeRate) {
      feeAmount = (amount * mapping.processingFeeRate) / 100;
    }
    
    return {
      productMappingId: mapping.id,
      productCode: mapping.productCode,
      prodId: mapping.PROD_ID,
      productName: mapping.name,
      amount: amount,
      currency: currency,
      feeAmount: feeAmount,
      feeRate: feeRate,
      totalAmount: amount + feeAmount,
      applicableFeeStructure: applicableFeeStructure,
      usesDefaultRate: !applicableFeeStructure && mapping.processingFeeRate > 0
    };
  }

  // Static method: Get products by fee rate range
  static async getByFeeRateRange(minRate, maxRate, options = {}) {
    const defaultOptions = {
      where: {
        isActive: true,
        processingFeeRate: {
          [Op.between]: [minRate, maxRate]
        }
      },
      order: [['processingFeeRate', 'ASC'], ['name', 'ASC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Instance method: Get product mapping details
  getProductMappingDetails() {
    return {
      id: this.id,
      productCode: this.productCode,
      prodId: this.PROD_ID,
      name: this.name,
      isActive: this.isActive,
      allowedCurrencies: this.allowedCurrencies || [],
      processingFeeRate: this.processingFeeRate,
      feeStructure: this.feeStructure || [],
      metadata: {
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
      }
    };
  }

  // Instance method: Check if currency is allowed
  isCurrencyAllowed(currencyCode) {
    if (!this.allowedCurrencies || !Array.isArray(this.allowedCurrencies)) {
      return false;
    }
    
    return this.allowedCurrencies.includes(currencyCode);
  }

  // Instance method: Add allowed currency
  addAllowedCurrency(currencyCode) {
    if (!this.allowedCurrencies || !Array.isArray(this.allowedCurrencies)) {
      this.allowedCurrencies = [];
    }
    
    if (!this.allowedCurrencies.includes(currencyCode)) {
      this.allowedCurrencies.push(currencyCode);
    }
    
    return this;
  }

  // Instance method: Remove allowed currency
  removeAllowedCurrency(currencyCode) {
    if (this.allowedCurrencies && Array.isArray(this.allowedCurrencies)) {
      this.allowedCurrencies = this.allowedCurrencies.filter(curr => curr !== currencyCode);
    }
    
    return this;
  }

  // Instance method: Add fee structure tier
  addFeeStructureTier(tierData) {
    if (!this.feeStructure || !Array.isArray(this.feeStructure)) {
      this.feeStructure = [];
    }
    
    const newTier = {
      tierId: this.feeStructure.length + 1,
      ...tierData
    };
    
    this.feeStructure.push(newTier);
    
    return this;
  }

  // Instance method: Remove fee structure tier
  removeFeeStructureTier(tierId) {
    if (this.feeStructure && Array.isArray(this.feeStructure)) {
      this.feeStructure = this.feeStructure.filter(tier => tier.tierId !== tierId);
      
      // Reassign tier IDs
      this.feeStructure.forEach((tier, index) => {
        tier.tierId = index + 1;
      });
    }
    
    return this;
  }

  // Instance method: Calculate fee for this product
  calculateFeeForAmount(amount) {
    return ProductMapping.calculateFee(this.PROD_ID, amount);
  }

  // Instance method: Get formatted fee structure
  getFormattedFeeStructure() {
    if (!this.feeStructure || !Array.isArray(this.feeStructure) || this.feeStructure.length === 0) {
      return {
        type: 'flat',
        rate: this.processingFeeRate || 0,
        description: `Flat ${this.processingFeeRate || 0}% fee`
      };
    }
    
    const tiers = this.feeStructure.map(tier => ({
      tierId: tier.tierId,
      range: tier.minAmount !== undefined && tier.maxAmount !== undefined 
        ? `${tier.minAmount} - ${tier.maxAmount}`
        : tier.minAmount !== undefined 
          ? `Above ${tier.minAmount}`
          : tier.maxAmount !== undefined
            ? `Up to ${tier.maxAmount}`
            : 'All amounts',
      feeType: tier.feeRate !== undefined ? 'percentage' : 'fixed',
      feeValue: tier.feeRate !== undefined ? tier.feeRate : tier.feeAmount,
      description: tier.feeRate !== undefined 
        ? `${tier.feeRate}% fee`
        : `Fixed ${tier.feeAmount} fee`
    }));
    
    return {
      type: 'tiered',
      tiers: tiers,
      defaultRate: this.processingFeeRate || 0
    };
  }

  // Instance method: Validate product mapping
  validate() {
    return ProductMapping.validateMapping(this.getProductMappingDetails());
  }

  // Virtual getter: Formatted product display
  get productDisplay() {
    return `${this.productCode} - ${this.name} (${this.PROD_ID})`;
  }

  // Virtual getter: Has tiered fee structure?
  get hasTieredFees() {
    return this.feeStructure && Array.isArray(this.feeStructure) && this.feeStructure.length > 0;
  }

  // Virtual getter: Supports multiple currencies?
  get supportsMultipleCurrencies() {
    return this.allowedCurrencies && Array.isArray(this.allowedCurrencies) && this.allowedCurrencies.length > 1;
  }

  // Virtual getter: Primary currency
  get primaryCurrency() {
    return this.allowedCurrencies && this.allowedCurrencies.length > 0 
      ? this.allowedCurrencies[0] 
      : null;
  }

  // Virtual getter: Is fee-based product?
  get isFeeBased() {
    return (this.processingFeeRate && this.processingFeeRate > 0) || 
           (this.feeStructure && this.feeStructure.length > 0);
  }

  // Virtual getter: Fee summary
  get feeSummary() {
    if (this.hasTieredFees) {
      const minFee = Math.min(...this.feeStructure.map(t => t.feeRate || (t.feeAmount ? 0 : 0)));
      const maxFee = Math.max(...this.feeStructure.map(t => t.feeRate || (t.feeAmount ? 100 : 0)));
      return {
        type: 'tiered',
        range: `${minFee}% - ${maxFee}%`,
        tiers: this.feeStructure.length
      };
    } else {
      return {
        type: 'flat',
        rate: this.processingFeeRate || 0
      };
    }
  }
}

ProductMapping.init({
  // Primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Internal ID for database relationships'
  },

  productCode: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Product code (external reference)'
  },

  PROD_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'Product identifier (internal reference)'
  },

  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Product name'
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Is product mapping active?'
  },

  allowedCurrencies: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Allowed currencies for this product'
  },

  processingFeeRate: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0,
    comment: 'Default processing fee rate (percentage)'
  },

  feeStructure: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: [],
    comment: 'Tiered fee structure'
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
  modelName: 'ProductMapping',
  tableName: 'product_mapping',
  timestamps: true,
  hooks: {
    beforeValidate: (product) => {
      // Trim string fields
      if (product.name) product.name = product.name.trim();
      
      // Ensure allowedCurrencies is an array
      if (product.allowedCurrencies && !Array.isArray(product.allowedCurrencies)) {
        // Try to parse if it's a JSON string
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
      
      // Ensure feeStructure is an array
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
      
      // Sort allowed currencies
      product.allowedCurrencies = [...new Set(product.allowedCurrencies)].sort();
      
      // Validate fee structure tiers
      if (Array.isArray(product.feeStructure)) {
        product.feeStructure = product.feeStructure.filter(tier => 
          tier && (tier.feeRate !== undefined || tier.feeAmount !== undefined)
        );
        
        // Assign tier IDs if not present
        product.feeStructure.forEach((tier, index) => {
          if (!tier.tierId) {
            tier.tierId = index + 1;
          }
        });
        
        // Sort by minAmount
        product.feeStructure.sort((a, b) => {
          const aMin = a.minAmount || 0;
          const bMin = b.minAmount || 0;
          return aMin - bMin;
        });
      }
    },
    
    beforeCreate: async (product) => {
      // Validate the product mapping
      const validation = await ProductMapping.validateMapping(product);
      
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
      
      // Set default processing fee rate if not provided
      if (product.processingFeeRate === undefined || product.processingFeeRate === null) {
        product.processingFeeRate = 0;
      }
    },
    
    beforeUpdate: async (product) => {
      // Validate the product mapping on update
      const validation = await ProductMapping.validateMapping({
        ...product.getProductMappingDetails(),
        id: product.id
      });
      
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
    }
  },
  indexes: [
    // Primary indexes
    { fields: ['id'] },
    { fields: ['PROD_ID'], unique: true },
    { fields: ['productCode'], unique: true },
    
    // Status indexes
    { fields: ['isActive'] },
    { fields: ['productCode', 'isActive'] },
    
    // Name indexes
    { fields: ['name'] },
    { fields: ['name', 'isActive'] },
    
    // Fee rate indexes
    { fields: ['processingFeeRate'] },
    { fields: ['processingFeeRate', 'isActive'] },
    
    // Composite indexes for common queries
    { fields: ['PROD_ID', 'isActive'] },
    { fields: ['productCode', 'PROD_ID'] },
    
    // Index for currency queries (using GIN index for JSON arrays if supported)
    // Note: This depends on your database support for JSON array indexing
    // { fields: ['allowedCurrencies'], using: 'gin' }
  ],
  scopes: {
    active: {
      where: { isActive: true }
    },
    inactive: {
      where: { isActive: false }
    },
    byProductCode: (productCode) => ({
      where: { productCode: productCode }
    }),
    byProdId: (prodId) => ({
      where: { PROD_ID: prodId }
    }),
    byName: (name) => ({
      where: {
        name: {
          [Op.iLike]: `%${name}%`
        }
      }
    }),
    byCurrency: (currency) => ({
      where: {
        allowedCurrencies: {
          [Op.contains]: [currency]
        }
      }
    }),
    withFeeStructure: {
      where: {
        [Op.or]: [
          { processingFeeRate: { [Op.gt]: 0 } },
          { feeStructure: { [Op.ne]: null } }
        ]
      }
    },
    freeProducts: {
      where: {
        processingFeeRate: 0,
        feeStructure: null
      }
    },
    feeBasedProducts: {
      where: {
        [Op.or]: [
          { processingFeeRate: { [Op.gt]: 0 } },
          { feeStructure: { [Op.ne]: null } }
        ]
      }
    },
    byFeeRateRange: (minRate, maxRate) => ({
      where: {
        processingFeeRate: {
          [Op.between]: [minRate, maxRate]
        }
      }
    }),
    sortedByName: {
      order: [['name', 'ASC']]
    },
    sortedByFeeRate: {
      order: [['processingFeeRate', 'ASC']]
    },
    sortedByProductCode: {
      order: [['productCode', 'ASC']]
    },
    withPagination: (page, pageSize) => ({
      offset: (page - 1) * pageSize,
      limit: pageSize
    })
  }
});

export default ProductMapping;
