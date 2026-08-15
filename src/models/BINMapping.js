// models/BINMapping.js
import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/db.js';

const BINMapping = sequelize.define('BINMapping', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  bin: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true
  },
  bank_bin: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  prepaid_bin: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  bank_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  bank_code: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  card_scheme: {
    type: DataTypes.ENUM('VERVE', 'VISA', 'MASTERCARD', 'AMEX', 'DISCOVER'),
    defaultValue: 'VERVE'
  },
  card_type: {
    type: DataTypes.ENUM('DEBIT', 'PREPAID', 'CREDIT', 'CHARGE'),
    defaultValue: 'DEBIT'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  is_prepaid: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  is_default: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  country: {
    type: DataTypes.STRING(10),
    defaultValue: 'NG'
  },
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'NGN'
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {}
  }
}, {
  tableName: 'bin_mappings',
  timestamps: true,
  underscored: false
});

export default BINMapping;