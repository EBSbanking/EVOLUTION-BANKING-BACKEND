// models/LoanRepayment.js - UPDATED VERSION
import { Model, DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

class LoanRepayment extends Model {}

LoanRepayment.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  loan_account_number: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'loan_account_number'
  },
  loan_account_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'loan_account_id'
  },
  customer_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'customer_id'
  },
  principal_amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    field: 'principal_amount'
  },
  interest_amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    field: 'interest_amount'
  },
  total_amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    field: 'total_amount'
  },
  repayment_date: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'repayment_date'
  },
  transaction_reference: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'transaction_reference'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED'),
    defaultValue: 'COMPLETED',
    field: 'status'
  },
  customer_name: {
    type: DataTypes.STRING(200),
    allowNull: true,
    field: 'customer_name'
  },
  collection_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'collection_id'
  },
  installment_number: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'installment_number'
  },
  penalty_amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    defaultValue: 0.00,
    field: 'penalty_amount'
  },
  createdAt: {
    type: DataTypes.DATE,
    field: 'created_at',
    allowNull: true
  },
  updatedAt: {
    type: DataTypes.DATE,
    field: 'updated_at',
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'LoanRepayment',
  tableName: 'loan_repayments',
  timestamps: true,
  underscored: false,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default LoanRepayment;