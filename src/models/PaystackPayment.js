// src/models/PaystackTransaction.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const PaystackTransaction = sequelize.define('PaystackTransaction', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  transaction_reference: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  paystack_reference: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
  paystack_access_code: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  email: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(10),
    allowNull: false,
    defaultValue: 'NGN'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED', 'EXPIRED'),
    defaultValue: 'PENDING'
  },
  gateway_response: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  channel: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  fees: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true
  },
  paid_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  transaction_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  authorization_url: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  callback_url: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  customer_account: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  customer_code: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSON,
    allowNull: true
  },
  paystack_data: {
    type: DataTypes.JSON,
    allowNull: true
  },
  refund_data: {
    type: DataTypes.JSON,
    allowNull: true
  },
  refund_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  refund_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  failure_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  initiated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  webhook_processed_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'paystack_transactions',
  timestamps: true
});

export default PaystackTransaction;
