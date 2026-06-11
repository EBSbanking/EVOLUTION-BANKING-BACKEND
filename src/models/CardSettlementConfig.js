import { DataTypes } from 'sequelize';
import { sequelize } from '../../config/db.js';

const CardSettlementConfig = sequelize.define('CardSettlementConfig', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  // Settlement account details (no foreign key)
  account_number: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: '9999999999'
  },
  account_name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    defaultValue: 'Card Settlement Account'
  },
  available_balance: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  ledger_balance: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  cleared_balance: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'NGN'
  },
  updated_by: {
    type: DataTypes.STRING(255),
    allowNull: true
  }
}, {
  modelName: 'CardSettlementConfig',
  tableName: 'cardSettlementConfig',
  timestamps: true
});

export default CardSettlementConfig;