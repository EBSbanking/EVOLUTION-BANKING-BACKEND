// src/models/PenaltyRule.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const PenaltyRule = sequelize.define('PenaltyRule', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  product_type: {
    type: DataTypes.STRING(50),
    defaultValue: 'DEFAULT'
  },
  calculation_method: {
    type: DataTypes.ENUM('PERCENTAGE_OF_PRINCIPAL', 'FLAT_RATE', 'PERCENTAGE_OF_AMOUNT_DUE', 'SLIDING_SCALE'),
    defaultValue: 'PERCENTAGE_OF_PRINCIPAL'
  },
  rate: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 1.00
  },
  flat_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  min_amount: {
    type: DataTypes.DECIMAL(10, 2),
    defaultValue: 0.00
  },
  max_amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true
  },
  sliding_rates: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: null
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  is_default: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_global: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
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
  tableName: 'penalty_rules',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false
});

export default PenaltyRule;
