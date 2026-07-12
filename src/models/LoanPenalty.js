// src/models/LoanPenalty.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const LoanPenalty = sequelize.define('LoanPenalty', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  loan_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'loan_accounts',
      key: 'id'
    }
  },
  loan_account_no: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  customer_id: {
    type: DataTypes.STRING(255), // Match cust_id type in loan_accounts
    allowNull: true
  },
  penalty_type: {
    type: DataTypes.ENUM('LATE_PAYMENT', 'DEFAULT', 'ADMINISTRATIVE', 'OTHER'),
    defaultValue: 'LATE_PAYMENT'
  },
  amount: {
    type: DataTypes.DECIMAL(20, 2), // Match decimal precision
    allowNull: false,
    defaultValue: 0.00
  },
  amount_paid: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0.00
  },
  days_overdue: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  calculation_basis: {
    type: DataTypes.STRING(50),
    defaultValue: 'DAILY_RATE'
  },
  accrual_date: {
    type: DataTypes.DATEONLY,
    allowNull: false
  },
  due_date: {
    type: DataTypes.DATEONLY,
    allowNull: true
  },
  payment_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'PARTIALLY_PAID', 'PAID', 'WAIVED'),
    defaultValue: 'PENDING'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  penalty_rule_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'penalty_rules',
      key: 'id'
    }
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'loan_penalties',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false
});

export default LoanPenalty;