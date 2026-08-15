// src/models/PaymentReference.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const PaymentReference = sequelize.define('PaymentReference', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  reference_number: {
    type: DataTypes.STRING(30),
    allowNull: false,
    unique: true,
    field: 'reference_number',
    comment: 'Unique reference number (INV-2024-001)'
  },
  customer_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'customer_id',
    references: {
      model: 'customers',
      key: 'id'
    }
  },
  customer_account: {
    type: DataTypes.STRING(20),
    allowNull: false,
    field: 'customer_account',
    comment: 'Customer\'s Evolution account number'
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'amount'
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'description'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'PAID', 'EXPIRED', 'CANCELLED'),
    defaultValue: 'PENDING',
    field: 'status'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at'
  },
  paid_at: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'paid_at'
  },
  external_transaction_ref: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'external_transaction_ref',
    comment: 'Reference from external bank (First Bank)'
  },
  matched_by: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'matched_by',
    comment: 'Who or what matched this reference'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'payment_references',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default PaymentReference;
