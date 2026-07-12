// models/DepositAccountInterest_Tier.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DepositAccountInterest_Tier extends Model {
  // Static method: Find tiers by product type
  static async findByProductType(productType) {
    return this.findAll({
      where: { product_type: productType, is_active: true },
      order: [['min_balance', 'ASC']]
    });
  }

  // Static method: Find applicable tier for amount
  static async findApplicableTier(productType, amount) {
    const tiers = await this.findAll({
      where: {
        product_type: productType,
        is_active: true,
        min_balance: { [Op.lte]: amount },
        [Op.or]: [
          { max_balance: { [Op.gte]: amount } },
          { max_balance: null }
        ]
      },
      order: [['min_balance', 'DESC']],
      limit: 1
    });
    
    return tiers.length > 0 ? tiers[0] : null;
  }

  // Static method: Calculate interest for amount
  static async calculateInterest(productType, amount) {
    const tier = await this.findApplicableTier(productType, amount);
    
    if (!tier) {
      return {
        applicable: false,
        interestAmount: 0,
        interestRate: 0,
        tier: null,
        message: 'No applicable interest tier found for this amount'
      };
    }
    
    const interestAmount = (amount * parseFloat(tier.interest_rate)) / 100;
    
    return {
      applicable: true,
      interestAmount,
      interestRate: tier.interest_rate,
      tier: tier.getTierInfo(),
      minBalance: tier.min_balance,
      maxBalance: tier.max_balance,
      tierName: tier.tier_name,
      productType: tier.product_type
    };
  }

  // Static method: Get tier summary by product type
  static async getTierSummary(productType) {
    const tiers = await this.findAll({
      where: { product_type: productType },
      order: [['min_balance', 'ASC']]
    });
    
    const summary = tiers.map(tier => tier.getTierInfo());
    
    const totalTiers = tiers.length;
    const activeTiers = tiers.filter(t => t.is_active).length;
    const lowestTier = tiers.length > 0 ? parseFloat(tiers[0].min_balance) : 0;
    const highestTier = tiers.length > 0 ? parseFloat(tiers[tiers.length - 1].max_balance) : null;
    
    return {
      productType,
      totalTiers,
      activeTiers,
      inactiveTiers: totalTiers - activeTiers,
      amountRange: `${lowestTier.toLocaleString()} - ${highestTier ? highestTier.toLocaleString() : 'Unlimited'}`,
      tiers: summary
    };
  }

  // Instance method: Get tier information
  getTierInfo() {
    return {
      id: this.id,
      tierName: this.tier_name,
      minBalance: this.min_balance,
      maxBalance: this.max_balance,
      interestRate: this.interest_rate,
      productType: this.product_type,
      currency: this.currency,
      isActive: this.is_active,
      createdBy: this.created_by,
      updatedBy: this.updated_by,
      createdAt: this.created_at,
      updatedAt: this.updated_at
    };
  }

  // Instance method: Check if tier is active
  isActive() {
    return this.is_active === true;
  }

  // Instance method: Check if amount falls within tier
  isAmountInTier(amount) {
    const minBalance = parseFloat(this.min_balance) || 0;
    const maxBalance = this.max_balance ? parseFloat(this.max_balance) : Infinity;
    return amount >= minBalance && amount <= maxBalance;
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
    
    const interestAmount = (amount * parseFloat(this.interest_rate)) / 100;
    
    return {
      applicable: true,
      interestAmount,
      interestRate: this.interest_rate,
      tierId: this.id,
      tierName: this.tier_name,
      minBalance: this.min_balance,
      maxBalance: this.max_balance
    };
  }

  // Virtual getter: Tier range description
  get tierRange() {
    const min = this.min_balance ? parseFloat(this.min_balance).toLocaleString() : '0';
    const max = this.max_balance ? parseFloat(this.max_balance).toLocaleString() : '∞';
    return `${min} - ${max}`;
  }

  // Virtual getter: Formatted interest rate
  get formattedInterestRate() {
    return `${parseFloat(this.interest_rate)}%`;
  }
}

DepositAccountInterest_Tier.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  
  tier_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  
  min_balance: {
    type: DataTypes.DECIMAL(20, 4),
    allowNull: false,
    defaultValue: 0
  },
  
  max_balance: {
    type: DataTypes.DECIMAL(20, 4),
    allowNull: true
  },
  
  interest_rate: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false
  },
  
  product_type: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  
  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'NGN'
  },
  
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  
  created_by: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  
  updated_by: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'DepositAccountInterest_Tier',
  tableName: 'deposit_account_interest_tier',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    beforeValidate: (tier) => {
      if (!tier.min_balance && tier.min_balance !== 0) {
        tier.min_balance = 0;
      }
      
      if (tier.product_type) {
        tier.product_type = tier.product_type.toUpperCase();
      }
      
      if (tier.currency) {
        tier.currency = tier.currency.toUpperCase();
      }
    },
    
    beforeCreate: (tier) => {
      const minBalance = parseFloat(tier.min_balance) || 0;
      const maxBalance = tier.max_balance ? parseFloat(tier.max_balance) : null;
      
      if (maxBalance !== null && minBalance > maxBalance) {
        throw new Error('min_balance cannot be greater than max_balance');
      }
      
      if (!tier.currency) {
        tier.currency = 'NGN';
      }
    },
    
    beforeUpdate: (tier) => {
      if (tier.changed('min_balance') || tier.changed('max_balance')) {
        const minBalance = parseFloat(tier.min_balance) || 0;
        const maxBalance = tier.max_balance ? parseFloat(tier.max_balance) : null;
        
        if (maxBalance !== null && minBalance > maxBalance) {
          throw new Error('min_balance cannot be greater than max_balance');
        }
      }
    }
  },
  
  scopes: {
    active: {
      where: { is_active: true }
    },
    inactive: {
      where: { is_active: false }
    },
    byProductType: (productType) => ({
      where: { product_type: productType }
    }),
    byCurrency: (currency) => ({
      where: { currency: currency }
    }),
    forAmount: (amount) => ({
      where: {
        [Op.and]: [
          { min_balance: { [Op.lte]: amount } },
          { [Op.or]: [
            { max_balance: { [Op.gte]: amount } },
            { max_balance: null }
          ]}
        ]
      }
    }),
    sortedByMinBalance: {
      order: [['min_balance', 'ASC']]
    },
    lowestTier: {
      where: { min_balance: 0 },
      order: [['min_balance', 'ASC']],
      limit: 1
    }
  }
});

export default DepositAccountInterest_Tier;