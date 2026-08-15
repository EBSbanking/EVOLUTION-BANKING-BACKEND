// models/RateIndex.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class RateIndex extends Model {
  // Static method: Find rate by INDEX_RATE_ID
  static async findByRateId(rateId, options = {}) {
    return this.findOne({
      where: { INDEX_RATE_ID: rateId },
      ...options
    });
  }

  // Static method: Find rate by INDEX_CD
  static async findByRateCode(rateCode, options = {}) {
    return this.findOne({
      where: { INDEX_CD: rateCode.toUpperCase() },
      ...options
    });
  }

  // Static method: Get default rate
  static async getDefaultRate(options = {}) {
    return this.findOne({
      where: { 
        IS_DEFAULT: true,
        STATUS: 'ACTIVE',
        IS_ACTIVE: true
      },
      ...options
    });
  }

  // Static method: Get active rates by currency
  static async getActiveRatesByCurrency(currency, options = {}) {
    const defaultOptions = {
      where: { 
        CRNCY_ID: currency.toUpperCase(),
        STATUS: 'ACTIVE',
        IS_ACTIVE: true,
        EFFECTIVE_DT: {
          [Op.lte]: new Date()
        }
      },
      order: [['EFFECTIVE_DT', 'DESC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Get current rates (effective and not expired)
  static async getCurrentRates(options = {}) {
    const now = new Date();
    const defaultOptions = {
      where: {
        STATUS: 'ACTIVE',
        IS_ACTIVE: true,
        EFFECTIVE_DT: {
          [Op.lte]: now
        },
        [Op.or]: [
          { EXPIRY_DT: null },
          { EXPIRY_DT: { [Op.gte]: now } }
        ]
      },
      order: [['CRNCY_ID', 'ASC'], ['EFFECTIVE_DT', 'DESC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Get rates by type
  static async getRatesByType(rateType, options = {}) {
    const defaultOptions = {
      where: { 
        RATE_TYPE: rateType.toUpperCase(),
        STATUS: 'ACTIVE',
        IS_ACTIVE: true
      },
      order: [['EFFECTIVE_DT', 'DESC']]
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Get rate history for a rate code
  static async getRateHistory(rateCode, options = {}) {
    const defaultOptions = {
      where: { INDEX_CD: rateCode.toUpperCase() },
      order: [['EFFECTIVE_DT', 'DESC']],
      limit: options.limit || 100
    };
    
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Static method: Set default rate
  static async setDefaultRate(rateId) {
    const transaction = await sequelize.transaction();
    
    try {
      // First, unset all other defaults
      await this.update(
        { IS_DEFAULT: false },
        {
          where: { IS_DEFAULT: true },
          transaction
        }
      );
      
      // Then set the new default
      const rate = await this.findByPk(rateId);
      if (!rate) {
        throw new Error('Rate not found');
      }
      
      await rate.update({ IS_DEFAULT: true }, { transaction });
      
      await transaction.commit();
      return rate;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // Static method: Create new rate with validation
  static async createRate(rateData, createdBy = 'SYSTEM') {
    const transaction = await sequelize.transaction();
    
    try {
      // Validate required fields
      if (!rateData.INDEX_RATE_ID) {
        throw new Error('INDEX_RATE_ID is required');
      }
      
      if (!rateData.INDEX_CD) {
        throw new Error('INDEX_CD is required');
      }
      
      if (rateData.INDEX_RATE === undefined || rateData.INDEX_RATE === null) {
        throw new Error('INDEX_RATE is required');
      }
      
      if (!rateData.INDEX_NM) {
        throw new Error('INDEX_NM is required');
      }
      
      // Check for duplicate INDEX_RATE_ID
      const existingById = await this.findOne({
        where: { INDEX_RATE_ID: rateData.INDEX_RATE_ID }
      });
      
      if (existingById) {
        throw new Error(`INDEX_RATE_ID ${rateData.INDEX_RATE_ID} already exists`);
      }
      
      // Check for duplicate INDEX_CD
      const existingByCode = await this.findOne({
        where: { INDEX_CD: rateData.INDEX_CD.toUpperCase() }
      });
      
      if (existingByCode) {
        throw new Error(`INDEX_CD ${rateData.INDEX_CD} already exists`);
      }
      
      // Set default values
      const rateToCreate = {
        ...rateData,
        INDEX_CD: rateData.INDEX_CD.toUpperCase(),
        CRNCY_ID: rateData.CRNCY_ID ? rateData.CRNCY_ID.toUpperCase() : 'NGN',
        RATE_TYPE: rateData.RATE_TYPE ? rateData.RATE_TYPE.toUpperCase() : 'FIXED',
        STATUS: rateData.STATUS ? rateData.STATUS.toUpperCase() : 'ACTIVE',
        CREATED_BY: createdBy,
        UPDATED_BY: createdBy,
        CREATED_AT: new Date(),
        UPDATED_AT: new Date()
      };
      
      // If this is set as default, unset other defaults
      if (rateToCreate.IS_DEFAULT === true) {
        await this.update(
          { IS_DEFAULT: false },
          {
            where: { IS_DEFAULT: true },
            transaction
          }
        );
      }
      
      const rate = await this.create(rateToCreate, { transaction });
      await transaction.commit();
      return rate;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // Static method: Get rate summary
  static async getRateSummary() {
    const results = await this.findAll({
      attributes: [
        'CRNCY_ID',
        'RATE_TYPE',
        'STATUS',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('AVG', sequelize.col('INDEX_RATE')), 'averageRate'],
        [sequelize.fn('MAX', sequelize.col('INDEX_RATE')), 'maxRate'],
        [sequelize.fn('MIN', sequelize.col('INDEX_RATE')), 'minRate']
      ],
      group: ['CRNCY_ID', 'RATE_TYPE', 'STATUS'],
      order: [['CRNCY_ID', 'ASC'], ['RATE_TYPE', 'ASC']],
      raw: true
    });

    const summary = {
      byCurrency: {},
      byRateType: {},
      totals: {
        totalRates: 0,
        activeRates: 0,
        defaultRates: 0
      }
    };

    results.forEach(result => {
      const currency = result.CRNCY_ID;
      const rateType = result.RATE_TYPE;
      const status = result.STATUS;
      
      // Group by currency
      if (!summary.byCurrency[currency]) {
        summary.byCurrency[currency] = {
          total: 0,
          active: 0,
          byRateType: {}
        };
      }
      
      summary.byCurrency[currency].total += parseInt(result.count) || 0;
      if (status === 'ACTIVE') {
        summary.byCurrency[currency].active += parseInt(result.count) || 0;
      }
      
      if (!summary.byCurrency[currency].byRateType[rateType]) {
        summary.byCurrency[currency].byRateType[rateType] = {
          count: 0,
          averageRate: 0,
          maxRate: 0,
          minRate: 0
        };
      }
      
      summary.byCurrency[currency].byRateType[rateType] = {
        count: parseInt(result.count) || 0,
        averageRate: parseFloat(result.averageRate) || 0,
        maxRate: parseFloat(result.maxRate) || 0,
        minRate: parseFloat(result.minRate) || 0
      };
      
      // Group by rate type
      if (!summary.byRateType[rateType]) {
        summary.byRateType[rateType] = {
          total: 0,
          active: 0,
          byCurrency: {}
        };
      }
      
      summary.byRateType[rateType].total += parseInt(result.count) || 0;
      if (status === 'ACTIVE') {
        summary.byRateType[rateType].active += parseInt(result.count) || 0;
      }
      
      // Update totals
      summary.totals.totalRates += parseInt(result.count) || 0;
      if (status === 'ACTIVE') {
        summary.totals.activeRates += parseInt(result.count) || 0;
      }
    });

    // Get default rates count
    const defaultRates = await this.count({
      where: { IS_DEFAULT: true }
    });
    
    summary.totals.defaultRates = defaultRates;

    return summary;
  }

  // Instance method: Get rate details
  getRateDetails() {
    return {
      rateId: this.id,
      indexRateId: this.INDEX_RATE_ID,
      rateCode: this.INDEX_CD,
      rateName: this.INDEX_NM,
      rateValue: this.INDEX_RATE,
      rateType: this.RATE_TYPE,
      currency: this.CRNCY_ID,
      precision: this.RATE_PRECISION,
      effectiveDate: this.EFFECTIVE_DT,
      expiryDate: this.EXPIRY_DT,
      dayCountConvention: this.DAY_COUNT_CONVENTION,
      isDefault: this.IS_DEFAULT,
      status: this.STATUS,
      description: this.DESCRIPTION,
      source: this.SOURCE,
      validityPeriod: this.VALIDITY_PERIOD,
      notes: this.NOTES,
      version: this.VERSION,
      isActive: this.IS_ACTIVE,
      metadata: {
        createdBy: this.CREATED_BY,
        updatedBy: this.UPDATED_BY,
        createdAt: this.CREATED_AT,
        updatedAt: this.UPDATED_AT
      }
    };
  }

  // Instance method: Check if rate is current
  isCurrent() {
    const now = new Date();
    return this.STATUS === 'ACTIVE' && 
           this.IS_ACTIVE === true &&
           this.EFFECTIVE_DT <= now &&
           (!this.EXPIRY_DT || this.EXPIRY_DT >= now);
  }

  // Instance method: Check if rate is expired
  isExpired() {
    if (!this.EXPIRY_DT) return false;
    return new Date() > this.EXPIRY_DT;
  }

  // Instance method: Check if rate is effective
  isEffective() {
    return this.EFFECTIVE_DT <= new Date();
  }

  // Instance method: Calculate days until expiry
  daysUntilExpiry() {
    if (!this.EXPIRY_DT) return null;
    
    const now = new Date();
    const expiry = new Date(this.EXPIRY_DT);
    const diffTime = expiry - now;
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  // Instance method: Calculate days since effective
  daysSinceEffective() {
    const now = new Date();
    const effective = new Date(this.EFFECTIVE_DT);
    const diffTime = now - effective;
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  // Instance method: Validate rate
  validateRate() {
    const errors = [];
    
    if (this.INDEX_RATE < 0) {
      errors.push('Rate cannot be negative');
    }
    
    if (this.INDEX_RATE > 1000) {
      errors.push('Rate cannot exceed 1000%');
    }
    
    if (this.RATE_PRECISION < 2 || this.RATE_PRECISION > 8) {
      errors.push('Precision must be between 2 and 8');
    }
    
    if (this.EXPIRY_DT && this.EXPIRY_DT <= this.EFFECTIVE_DT) {
      errors.push('Expiry date must be after effective date');
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  // Instance method: Get formatted rate
  getFormattedRate(precision = null) {
    const ratePrecision = precision || this.RATE_PRECISION || 2;
    const formattedRate = this.INDEX_RATE.toFixed(ratePrecision);
    return `${formattedRate}%`;
  }

  // Instance method: Get annualized rate (based on day count convention)
  getAnnualizedRate() {
    return this.INDEX_RATE;
  }

  // Instance method: Get monthly rate
  getMonthlyRate() {
    return this.INDEX_RATE / 12;
  }

  // Instance method: Get daily rate
  getDailyRate() {
    return this.INDEX_RATE / 365;
  }

  // Virtual getter: Display name
  get displayName() {
    return `${this.INDEX_NM} (${this.INDEX_CD})`;
  }

  // Virtual getter: Formatted effective date
  get formattedEffectiveDate() {
    return this.EFFECTIVE_DT.toLocaleDateString();
  }

  // Virtual getter: Formatted expiry date
  get formattedExpiryDate() {
    return this.EXPIRY_DT ? this.EXPIRY_DT.toLocaleDateString() : 'No expiry';
  }

  // Virtual getter: Is active rate?
  get isActiveRate() {
    return this.STATUS === 'ACTIVE' && this.IS_ACTIVE === true;
  }

  // Virtual getter: Rate category (based on value)
  get rateCategory() {
    const rate = this.INDEX_RATE;
    
    if (rate === 0) return 'ZERO';
    if (rate < 1) return 'VERY_LOW';
    if (rate < 5) return 'LOW';
    if (rate < 10) return 'MEDIUM';
    if (rate < 20) return 'HIGH';
    return 'VERY_HIGH';
  }

  // Virtual getter: Is prime rate?
  get isPrimeRate() {
    return this.RATE_TYPE === 'PRIME';
  }

  // Virtual getter: Is variable rate?
  get isVariableRate() {
    return this.RATE_TYPE === 'VARIABLE';
  }

  // Virtual getter: Is fixed rate?
  get isFixedRate() {
    return this.RATE_TYPE === 'FIXED';
  }
}

RateIndex.init({
  // Primary key
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Internal ID for database relationships'
  },

  INDEX_RATE_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'Rate index identifier'
  },

  INDEX_CD: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true,
    comment: 'Rate code'
  },

  INDEX_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Annual interest rate (percentage)',
    validate: {
      min: {
        args: [0],
        msg: 'Rate cannot be negative'
      },
      max: {
        args: [1000],
        msg: 'Rate cannot exceed 1000%'
      }
    }
  },

  INDEX_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'Rate name'
  },

  RATE_TYPE: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'FIXED',
    validate: {
      isIn: [['FIXED', 'VARIABLE', 'PRIME', 'INTERBANK', 'TREASURY_BILL', 'OTHER']]
    },
    comment: 'Rate type'
  },

  CRNCY_ID: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'NGN',
    comment: 'Currency code'
  },

  RATE_PRECISION: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 4,
    field: 'RATE_PRECISION',
    validate: {
      min: {
        args: [2],
        msg: 'Precision must be at least 2'
      },
      max: {
        args: [8],
        msg: 'Precision cannot exceed 8'
      }
    },
    comment: 'Rate precision (decimal places)'
  },

  EFFECTIVE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Effective date'
  },

  DAY_COUNT_CONVENTION: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'ACTUAL/360',
    validate: {
      isIn: [['ACTUAL/360', 'ACTUAL/365', '30/360', 'BUSINESS/252', 'ACTUAL/ACTUAL']]
    },
    comment: 'Day count convention'
  },

  IS_DEFAULT: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Is default rate?'
  },

  STATUS: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'ACTIVE',
    validate: {
      isIn: [['ACTIVE', 'INACTIVE', 'PENDING', 'ARCHIVED', 'DRAFT']]
    },
    comment: 'Rate status'
  },

  DESCRIPTION: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Rate description'
  },

  CREATED_BY: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'SYSTEM',
    comment: 'Created by user'
  },

  UPDATED_BY: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'SYSTEM',
    comment: 'Updated by user'
  },

  CREATED_AT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Creation timestamp'
  },

  UPDATED_AT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Update timestamp'
  },

  EXPIRY_DT: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Expiry date'
  },

  SOURCE: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'MANUAL',
    validate: {
      isIn: [['CENTRAL_BANK', 'INTERBANK', 'MARKET', 'MANUAL', 'SYSTEM']]
    },
    comment: 'Rate source'
  },

  VALIDITY_PERIOD: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Validity period in days'
  },

  NOTES: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Additional notes'
  },

  VERSION: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: '1.0',
    comment: 'Rate version'
  },

  IS_ACTIVE: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    comment: 'Is rate active?'
  },

  // Sequelize timestamps (mapped to existing fields)
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'UPDATED_AT',
    defaultValue: DataTypes.NOW
  },

  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'CREATED_AT',
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'RateIndex',
  tableName: 'rate_index',
  timestamps: true,
  hooks: {
    beforeValidate: (rate) => {
      // Trim and uppercase string fields
      if (rate.INDEX_CD) rate.INDEX_CD = rate.INDEX_CD.trim().toUpperCase();
      if (rate.INDEX_NM) rate.INDEX_NM = rate.INDEX_NM.trim();
      if (rate.CRNCY_ID) rate.CRNCY_ID = rate.CRNCY_ID.trim().toUpperCase();
      if (rate.RATE_TYPE) rate.RATE_TYPE = rate.RATE_TYPE.trim().toUpperCase();
      if (rate.STATUS) rate.STATUS = rate.STATUS.trim().toUpperCase();
      if (rate.SOURCE) rate.SOURCE = rate.SOURCE.trim().toUpperCase();
      if (rate.DESCRIPTION) rate.DESCRIPTION = rate.DESCRIPTION.trim();
      if (rate.NOTES) rate.NOTES = rate.NOTES.trim();
      if (rate.CREATED_BY) rate.CREATED_BY = rate.CREATED_BY.trim();
      if (rate.UPDATED_BY) rate.UPDATED_BY = rate.UPDATED_BY.trim();
    },
    
    beforeCreate: async (rate) => {
      // Validate that INDEX_RATE_ID is unique
      const existingById = await RateIndex.findOne({
        where: { INDEX_RATE_ID: rate.INDEX_RATE_ID }
      });
      
      if (existingById) {
        throw new Error(`INDEX_RATE_ID ${rate.INDEX_RATE_ID} already exists`);
      }
      
      // Validate that INDEX_CD is unique
      const existingByCode = await RateIndex.findOne({
        where: { INDEX_CD: rate.INDEX_CD }
      });
      
      if (existingByCode) {
        throw new Error(`INDEX_CD ${rate.INDEX_CD} already exists`);
      }
      
      // Validate expiry date
      if (rate.EXPIRY_DT && rate.EXPIRY_DT <= rate.EFFECTIVE_DT) {
        throw new Error('Expiry date must be after effective date');
      }
      
      // Set timestamps
      const now = new Date();
      if (!rate.CREATED_AT) rate.CREATED_AT = now;
      if (!rate.UPDATED_AT) rate.UPDATED_AT = now;
    },
    
    beforeUpdate: async (rate) => {
      // Update timestamp
      rate.UPDATED_AT = new Date();
      
      // If setting as default, unset other defaults
      if (rate.IS_DEFAULT === true && rate.changed('IS_DEFAULT')) {
        await RateIndex.update(
          { IS_DEFAULT: false },
          {
            where: {
              IS_DEFAULT: true,
              id: { [Op.ne]: rate.id }
            }
          }
        );
      }
      
      // Validate expiry date
      if (rate.changed('EXPIRY_DT') || rate.changed('EFFECTIVE_DT')) {
        const expiry = rate.EXPIRY_DT;
        const effective = rate.EFFECTIVE_DT;
        
        if (expiry && expiry <= effective) {
          throw new Error('Expiry date must be after effective date');
        }
      }
    }
  },
  
  scopes: {
    active: {
      where: { STATUS: 'ACTIVE', IS_ACTIVE: true }
    },
    current: {
      where: {
        STATUS: 'ACTIVE',
        IS_ACTIVE: true,
        EFFECTIVE_DT: {
          [Op.lte]: new Date()
        },
        [Op.or]: [
          { EXPIRY_DT: null },
          { EXPIRY_DT: { [Op.gte]: new Date() } }
        ]
      }
    },
    expired: {
      where: {
        EXPIRY_DT: {
          [Op.lt]: new Date()
        }
      }
    },
    default: {
      where: { IS_DEFAULT: true }
    },
    byCurrency: (currency) => ({
      where: { CRNCY_ID: currency.toUpperCase() }
    }),
    byRateType: (rateType) => ({
      where: { RATE_TYPE: rateType.toUpperCase() }
    }),
    bySource: (source) => ({
      where: { SOURCE: source.toUpperCase() }
    }),
    fixedRates: {
      where: { RATE_TYPE: 'FIXED' }
    },
    variableRates: {
      where: { RATE_TYPE: 'VARIABLE' }
    },
    primeRates: {
      where: { RATE_TYPE: 'PRIME' }
    },
    effectiveDateRange: (startDate, endDate) => ({
      where: {
        EFFECTIVE_DT: {
          [Op.between]: [startDate, endDate]
        }
      }
    }),
    highRates: {
      where: { INDEX_RATE: { [Op.gte]: 10 } }
    },
    lowRates: {
      where: { INDEX_RATE: { [Op.lt]: 5 } }
    },
    sortedByRate: {
      order: [['INDEX_RATE', 'DESC']]
    },
    sortedByEffectiveDate: {
      order: [['EFFECTIVE_DT', 'DESC']]
    },
    sortedByCurrency: {
      order: [['CRNCY_ID', 'ASC'], ['EFFECTIVE_DT', 'DESC']]
    },
    withPagination: (page, pageSize) => ({
      offset: (page - 1) * pageSize,
      limit: pageSize
    })
  }
});

export default RateIndex;
