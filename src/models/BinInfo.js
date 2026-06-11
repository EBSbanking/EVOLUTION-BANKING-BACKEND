// models/BinInfo.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class BinInfo extends Model {}

BinInfo.init({
  bin: {
    type: DataTypes.STRING(6),
    primaryKey: true,
    allowNull: false,
    unique: true,
    comment: '6‑digit Bank Identification Number'
  },
  bank_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Issuing bank name'
  },
  country: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Country name'
  },
  network: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Card network (VERVE, MASTERCARD, VISA, etc.)'
  },
  card_type: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Card type (Standard, Gold, Platinum, etc.)'
  }
}, {
  sequelize,
  modelName: 'BinInfo',
  tableName: 'BinInfo',
  timestamps: false, // because the table doesn't have created_at/updated_at
  underscored: false
});

export default BinInfo;