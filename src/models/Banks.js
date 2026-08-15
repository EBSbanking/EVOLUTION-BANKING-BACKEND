// models/Banks.js
import { DataTypes, Model, Op } from 'sequelize';
import { sequelize } from '../../config/db.js';

class Bank extends Model {
  // Virtual getter for display name
  get displayName() {
    return `${this.name} (${this.code})`;
  }
}

Bank.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  code: {
    type: DataTypes.STRING(20),
    allowNull: false,
    unique: true
  },
  long_code: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  country: {
    type: DataTypes.STRING(50),
    defaultValue: 'NG'
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'NGN'
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED'),
    defaultValue: 'ACTIVE'
  },
  slug: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  type: {
    type: DataTypes.STRING(20),
    defaultValue: 'nuban'
  },
  gateway: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  pay_with_bank: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  supports_transfer: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  available_for_direct_debit: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  prembly_id: {
    type: DataTypes.INTEGER,
    allowNull: true
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
  sequelize,
  modelName: 'Bank',
  tableName: 'banks',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true,
  
});

export default Bank;
