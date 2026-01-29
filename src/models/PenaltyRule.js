// models/PenaltyRule.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class PenaltyRule extends Model {}

PenaltyRule.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  rule_name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: 'Penalty rule name'
  },
  rule_type: {
    type: DataTypes.ENUM('LATE_PAYMENT', 'EARLY_REPAYMENT', 'DEFAULT_FEE', 'SERVICE_CHARGE'),
    defaultValue: 'LATE_PAYMENT',
    comment: 'Type of penalty rule'
  },
  calculation_method: {
    type: DataTypes.ENUM('PERCENTAGE', 'FIXED', 'TIERED', 'DAILY_RATE'),
    defaultValue: 'PERCENTAGE',
    comment: 'Calculation method'
  },
  rate_value: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true,
    comment: 'Percentage rate (e.g., 0.05 for 5%)'
  },
  fixed_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    comment: 'Fixed amount if applicable'
  },
  min_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    comment: 'Minimum penalty amount'
  },
  max_amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    comment: 'Maximum penalty amount'
  },
  grace_period_days: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Grace period in days before penalty applies'
  },
  effective_from: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    comment: 'Rule effective from date'
  },
  effective_to: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Rule effective to date'
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'DRAFT'),
    defaultValue: 'ACTIVE',
    comment: 'Rule status'
  },
  applicable_to: {
    type: DataTypes.JSON,
    defaultValue: {},
    comment: 'JSON config for loan types, customer tiers, etc.'
  },
  tier_config: {
    type: DataTypes.JSON,
    defaultValue: [],
    comment: 'Tiered rates configuration'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Rule description'
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'User who created the rule'
  }
}, {
  sequelize,
  modelName: 'PenaltyRule',
  tableName: 'penalty_rules',
  timestamps: true,
  indexes: [
    {
      name: 'idx_rule_type',
      fields: ['rule_type']
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_effective_date',
      fields: ['effective_from', 'effective_to']
    }
  ]
});

// Static methods
PenaltyRule.findActiveRule = async function(ruleType, loanData = {}) {
  const now = new Date();
  
  return await this.findOne({
    where: {
      rule_type: ruleType,
      status: 'ACTIVE',
      effective_from: { [Op.lte]: now },
      [Op.or]: [
        { effective_to: null },
        { effective_to: { [Op.gte]: now } }
      ]
    },
    order: [['effective_from', 'DESC']]
  });
};

PenaltyRule.calculatePenalty = async function(ruleType, amount, daysOverdue, loanData = {}) {
  const rule = await this.findActiveRule(ruleType, loanData);
  
  if (!rule) {
    return 0; // No penalty rule found
  }
  
  // Check grace period
  if (daysOverdue <= rule.grace_period_days) {
    return 0;
  }
  
  let penaltyAmount = 0;
  
  switch (rule.calculation_method) {
    case 'PERCENTAGE':
      penaltyAmount = amount * (rule.rate_value || 0);
      break;
      
    case 'FIXED':
      penaltyAmount = rule.fixed_amount || 0;
      break;
      
    case 'DAILY_RATE':
      const effectiveDays = daysOverdue - rule.grace_period_days;
      penaltyAmount = amount * (rule.rate_value || 0) * effectiveDays;
      break;
      
    case 'TIERED':
      if (rule.tier_config && Array.isArray(rule.tier_config)) {
        for (const tier of rule.tier_config) {
          if (daysOverdue >= tier.min_days && (!tier.max_days || daysOverdue <= tier.max_days)) {
            if (tier.calculation === 'PERCENTAGE') {
              penaltyAmount = amount * (tier.rate || 0);
            } else if (tier.calculation === 'FIXED') {
              penaltyAmount = tier.amount || 0;
            }
            break;
          }
        }
      }
      break;
  }
  
  // Apply min/max limits
  if (rule.min_amount && penaltyAmount < rule.min_amount) {
    penaltyAmount = rule.min_amount;
  }
  
  if (rule.max_amount && penaltyAmount > rule.max_amount) {
    penaltyAmount = rule.max_amount;
  }
  
  return penaltyAmount;
};

export default PenaltyRule;
