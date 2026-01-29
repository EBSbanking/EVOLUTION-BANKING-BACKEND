// models/DepositAccountInterest_Tier.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DepositAccountInterest_Tier extends Model {
  // Static method: Find tiers by deposit interest ID
  static async findByDepositInterestId(depositInterestId) {
    return this.findAll({
      where: { DEPOSIT_ACCT_INT_ID: depositInterestId },
      order: [['FROM_AMT', 'ASC']]
    });
  }

  // Static method: Find tiers by product ID
  static async findByProductId(productId) {
    return this.findAll({
      where: { PROD_ID: productId },
      order: [['FROM_AMT', 'ASC']]
    });
  }

  // Static method: Find applicable tier for amount
  static async findApplicableTier(depositInterestId, amount) {
    const tiers = await this.findAll({
      where: {
        DEPOSIT_ACCT_INT_ID: depositInterestId,
        REC_ST: 'A',
        [Op.and]: [
          { FROM_AMT: { [Op.lte]: amount } },
          { TO_AMT: { [Op.gte]: amount } }
        ]
      },
      order: [['FROM_AMT', 'ASC']]
    });
    
    return tiers.length > 0 ? tiers[0] : null;
  }

  // Static method: Calculate interest for amount
  static async calculateInterest(depositInterestId, amount) {
    const tier = await this.findApplicableTier(depositInterestId, amount);
    
    if (!tier) {
      return {
        applicable: false,
        interestAmount: 0,
        marginRate: 0,
        tier: null,
        message: 'No applicable interest tier found for this amount'
      };
    }
    
    const interestAmount = (amount * parseFloat(tier.MARGIN_RATE)) / 100;
    
    return {
      applicable: true,
      interestAmount,
      marginRate: tier.MARGIN_RATE,
      tier: tier.getTierInfo(),
      fromAmount: tier.FROM_AMT,
      toAmount: tier.TO_AMT,
      marginType: tier.MARGIN_TY_CD,
      penaltyMarginRate: tier.PENAL_MARGIN_RATE,
      penaltyMarginType: tier.PENAL_MARGIN_TY_CD
    };
  }

  // Static method: Get tier summary by deposit interest
  static async getTierSummary(depositInterestId) {
    const tiers = await this.findAll({
      where: { DEPOSIT_ACCT_INT_ID: depositInterestId },
      order: [['FROM_AMT', 'ASC']]
    });
    
    const summary = tiers.map(tier => tier.getTierInfo());
    
    // Calculate tier coverage
    const totalTiers = tiers.length;
    const activeTiers = tiers.filter(t => t.REC_ST === 'A').length;
    const lowestTier = tiers.length > 0 ? parseFloat(tiers[0].FROM_AMT) : 0;
    const highestTier = tiers.length > 0 ? parseFloat(tiers[tiers.length - 1].TO_AMT) : 0;
    
    return {
      depositInterestId,
      totalTiers,
      activeTiers,
      inactiveTiers: totalTiers - activeTiers,
      amountRange: `${lowestTier.toLocaleString()} - ${highestTier.toLocaleString()}`,
      tiers: summary
    };
  }

  // Instance method: Get tier information
  getTierInfo() {
    return {
      tierId: this.DEPOSIT_ACCT_INT_TIER_ID,
      depositInterestId: this.DEPOSIT_ACCT_INT_ID,
      productId: this.PROD_ID,
      fromAmount: this.FROM_AMT,
      toAmount: this.TO_AMT,
      marginRate: this.MARGIN_RATE,
      marginType: this.MARGIN_TY_CD,
      penaltyMarginRate: this.PENAL_MARGIN_RATE,
      penaltyMarginType: this.PENAL_MARGIN_TY_CD,
      status: this.REC_ST,
      version: this.VERSION_NO,
      createdBy: this.CREATED_BY,
      createdDate: this.CREATE_DT,
      lastUpdated: this.ROW_TS
    };
  }

  // Instance method: Check if tier is active
  isActive() {
    return this.REC_ST === 'A';
  }

  // Instance method: Check if amount falls within tier
  isAmountInTier(amount) {
    const fromAmount = this.FROM_AMT || 0;
    const toAmount = this.TO_AMT;
    
    return amount >= fromAmount && amount <= toAmount;
  }

  // Instance method: Calculate interest for this tier
  calculateInterestForAmount(amount) {
    if (!this.isAmountInTier(amount)) {
      return {
        applicable: false,
        interestAmount: 0,
        message: 'Amount does not fall within this tier range'
      };
    }
    
    const interestAmount = (amount * parseFloat(this.MARGIN_RATE)) / 100;
    
    return {
      applicable: true,
      interestAmount,
      marginRate: this.MARGIN_RATE,
      tierId: this.DEPOSIT_ACCT_INT_TIER_ID,
      fromAmount: this.FROM_AMT,
      toAmount: this.TO_AMT,
      marginType: this.MARGIN_TY_CD
    };
  }

  // Virtual getter: Tier range description
  get tierRange() {
    const from = this.FROM_AMT ? parseFloat(this.FROM_AMT).toLocaleString() : '0';
    const to = parseFloat(this.TO_AMT).toLocaleString();
    return `${from} - ${to}`;
  }

  // Virtual getter: Formatted margin rate
  get formattedMarginRate() {
    return `${parseFloat(this.MARGIN_RATE)}%`;
  }
}

DepositAccountInterest_Tier.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  DEPOSIT_ACCT_INT_TIER_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    unique: true,
    comment: 'Deposit account interest tier identifier'
  },
  
  DEPOSIT_ACCT_INT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Deposit account interest identifier'
  },
  
  PROD_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Product identifier'
  },
  
  MARGIN_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: false,
    comment: 'Margin rate'
  },
  
  FROM_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    defaultValue: 0.00,
    comment: 'From amount (inclusive)'
  },
  
  TO_AMT: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    comment: 'To amount (inclusive)'
  },
  
  REC_ST: {
    type: DataTypes.STRING(1),
    allowNull: false,
    defaultValue: 'A',
    validate: {
      isIn: [['A', 'I']] // A=Active, I=Inactive
    },
    comment: 'Record status'
  },
  
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'Version number'
  },
  
  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Row timestamp'
  },
  
  USER_ID: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'User identifier'
  },
  
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Create date'
  },
  
  CREATED_BY: {
    type: DataTypes.STRING(24),
    allowNull: false,
    comment: 'Created by user'
  },
  
  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'System create timestamp'
  },
  
  MARGIN_TY_CD: {
    type: DataTypes.STRING(10),
    allowNull: false,
    comment: 'Margin type code'
  },
  
  PENAL_MARGIN_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    allowNull: true,
    comment: 'Penalty margin rate'
  },
  
  PENAL_MARGIN_TY_CD: {
    type: DataTypes.STRING(10),
    allowNull: true,
    comment: 'Penalty margin type code'
  },
  
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
  modelName: 'DepositAccountInterest_Tier',
  tableName: 'deposit_account_interest_tier',
  timestamps: true,
  hooks: {
    beforeValidate: (tier) => {
      // Ensure FROM_AMT is 0 if null/undefined
      if (!tier.FROM_AMT && tier.FROM_AMT !== 0) {
        tier.FROM_AMT = 0.00;
      }
      
      // Ensure uppercase for status
      if (tier.REC_ST) {
        tier.REC_ST = tier.REC_ST.toUpperCase();
      }
    },
    
    beforeCreate: (tier) => {
      // Validate tier range
      const fromAmount = tier.FROM_AMT || 0;
      const toAmount = tier.TO_AMT;
      
      if (fromAmount > toAmount) {
        throw new Error('FROM_AMT cannot be greater than TO_AMT');
      }
      
      // Set timestamps
      const now = new Date();
      if (!tier.CREATE_DT) tier.CREATE_DT = now;
      if (!tier.SYS_CREATE_TS) tier.SYS_CREATE_TS = now;
      if (!tier.ROW_TS) tier.ROW_TS = now;
      
      // Ensure FROM_AMT is set (default to 0)
      if (!tier.FROM_AMT && tier.FROM_AMT !== 0) {
        tier.FROM_AMT = 0.00;
      }
    },
    
    beforeUpdate: (tier) => {
      // Update row timestamp on every update
      tier.ROW_TS = new Date();
      
      // Validate tier range if updating amounts
      if (tier.changed('FROM_AMT') || tier.changed('TO_AMT')) {
        const fromAmount = tier.FROM_AMT || 0;
        const toAmount = tier.TO_AMT;
        
        if (fromAmount > toAmount) {
          throw new Error('FROM_AMT cannot be greater than TO_AMT');
        }
      }
      
      // Increment version number on update
      if (tier.changed() && !tier.changed('VERSION_NO')) {
        tier.VERSION_NO = (tier.VERSION_NO || 0) + 1;
      }
    },
    
    beforeSave: (tier) => {
      // Validate that FROM_AMT is less than or equal to TO_AMT
      if (parseFloat(tier.FROM_AMT) > parseFloat(tier.TO_AMT)) {
        throw new Error('FROM_AMT must be less than or equal to TO_AMT');
      }
    }
  },
  indexes: [
    // Primary indexes
    { fields: ['DEPOSIT_ACCT_INT_TIER_ID'], unique: true },
    { fields: ['DEPOSIT_ACCT_INT_ID'] },
    { fields: ['PROD_ID'] },
    { fields: ['REC_ST'] },
    
    // Composite indexes for common queries
    { fields: ['DEPOSIT_ACCT_INT_ID', 'REC_ST'] },
    { fields: ['PROD_ID', 'REC_ST'] },
    { fields: ['DEPOSIT_ACCT_INT_ID', 'FROM_AMT', 'TO_AMT'] },
    { fields: ['DEPOSIT_ACCT_INT_ID', 'FROM_AMT'] },
    { fields: ['DEPOSIT_ACCT_INT_ID', 'TO_AMT'] },
    
    // Range query optimization
    { fields: ['FROM_AMT', 'TO_AMT', 'DEPOSIT_ACCT_INT_ID'] }
  ],
  scopes: {
    active: {
      where: { REC_ST: 'A' }
    },
    inactive: {
      where: { REC_ST: 'I' }
    },
    byDepositInterest: (depositInterestId) => ({
      where: { DEPOSIT_ACCT_INT_ID: depositInterestId }
    }),
    byProduct: (productId) => ({
      where: { PROD_ID: productId }
    }),
    byAmountRange: (minAmount, maxAmount) => ({
      where: {
        [Op.or]: [
          {
            [Op.and]: [
              { FROM_AMT: { [Op.lte]: maxAmount } },
              { TO_AMT: { [Op.gte]: minAmount } }
            ]
          },
          {
            [Op.and]: [
              { FROM_AMT: { [Op.lte]: maxAmount } },
              { TO_AMT: { [Op.gte]: minAmount } }
            ]
          }
        ]
      }
    }),
    forAmount: (amount) => ({
      where: {
        [Op.and]: [
          { FROM_AMT: { [Op.lte]: amount } },
          { TO_AMT: { [Op.gte]: amount } }
        ]
      }
    }),
    lowestTier: {
      where: { FROM_AMT: 0 },
      order: [['FROM_AMT', 'ASC']],
      limit: 1
    },
    sortedByAmount: {
      order: [['FROM_AMT', 'ASC']]
    },
    recent: {
      order: [['ROW_TS', 'DESC']],
      limit: 50
    }
  }
});

export default DepositAccountInterest_Tier;
