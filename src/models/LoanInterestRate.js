import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const LoanInterestRate = sequelize.define('LoanInterestRate', {
  loan_proud_int_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: "Legacy product interest ID"
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  code: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  rate_type: {
    type: DataTypes.ENUM('FIXED', 'VARIABLE', 'TIERED', 'PROMOTIONAL', 'INTRODUCTORY'),
    allowNull: false,
    defaultValue: 'FIXED'
  },
  interest_type: {
    type: DataTypes.ENUM('SIMPLE', 'COMPOUND'),
    allowNull: false,
    defaultValue: 'SIMPLE'
  },
  calculation_method: {
    type: DataTypes.ENUM('FLAT', 'REDUCING_BALANCE', 'RULE_OF_78'),
    allowNull: false,
    defaultValue: 'FLAT'
  },
  min_rate_per_month: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0.0
  },
  max_rate_per_month: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 100.0
  },
  default_rate_per_month: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 1.0
  },
  annual_percentage_rate: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true
  },
  total_interest_rate: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: true
  },
  index_rate_id: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  margin_rate: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0
  },
  spread_rate: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0
  },
  min_term_value: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  max_term_value: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 60
  },
  min_term_months: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  max_term_months: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  term_type: {
    type: DataTypes.ENUM('DAYS', 'WEEKS', 'MONTHS', 'QUARTERS', 'YEARS'),
    allowNull: false,
    defaultValue: 'MONTHS'
  },
  accrual_basis: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'ACTUAL/360'
  },
  accrual_frequency: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'DAILY'
  },
  min_loan_amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  max_loan_amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 1000000000.00
  },
  capitalize_interest: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  compounding_frequency: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'MONTHLY'
  },
  amortized: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  repayment_frequency: {
    type: DataTypes.STRING(50),
    allowNull: true,
    defaultValue: 'MONTHLY'
  },
  rate_change_allowed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  rate_change_notice_days: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 30
  },
  max_rate_changes: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  origination_fee_rate: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0
  },
  processing_fee_fixed: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  late_payment_penalty_rate: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0
  },
  early_repayment_penalty_rate: {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0
  },
  tiered_rates: {
    type: DataTypes.JSON,
    allowNull: true
  },
  effective_date: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  expiry_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'DRAFT', 'PENDING', 'EXPIRED', 'DELETED'),
    allowNull: false,
    defaultValue: 'DRAFT'
  },
  created_by: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  updated_by: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  last_updated_by: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  version: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: '1.0'
  },
  tags: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: []
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  is_flat_rate: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  }
}, {
  tableName: 'loan_interest_rates',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
  hooks: {
    beforeCreate: (rate) => {
      if (!rate.min_term_months && rate.min_term_value && rate.term_type) {
        rate.min_term_months = convertTermToMonths(rate.min_term_value, rate.term_type);
      }
      if (!rate.max_term_months && rate.max_term_value && rate.term_type) {
        rate.max_term_months = convertTermToMonths(rate.max_term_value, rate.term_type);
      }
      rate.is_flat_rate = (rate.calculation_method === 'FLAT' && rate.interest_type === 'SIMPLE');
      rate.is_active = (rate.status === 'ACTIVE');
    },
    beforeUpdate: (rate) => {
      rate.is_active = (rate.status === 'ACTIVE');
      rate.is_flat_rate = (rate.calculation_method === 'FLAT' && rate.interest_type === 'SIMPLE');
    }
  }
});

// Helper function (keep it)
function convertTermToMonths(value, termType) {
  const numValue = parseInt(value);
  switch(termType?.toUpperCase()) {
    case 'DAYS': return Math.ceil(numValue / 30.44);
    case 'WEEKS': return Math.ceil(numValue / 4.345);
    case 'MONTHS': return numValue;
    case 'QUARTERS': return numValue * 3;
    case 'YEARS': return numValue * 12;
    default: return numValue;
  }
}

export default LoanInterestRate;