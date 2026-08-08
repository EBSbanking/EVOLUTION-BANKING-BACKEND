// models/CardCounter.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class CardCounter extends Model {}

CardCounter.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  bin: {
    type: DataTypes.STRING(6),
    allowNull: false,
    unique: true,
    comment: '6‑digit Bank Identification Number'
  },
  last_sequence: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    comment: 'Last used sequence number for this BIN'
  }
}, {
  sequelize,
  modelName: 'CardCounter',
  tableName: 'card_counter',
  timestamps: true,
  createdAt: false,        // we don’t need created_at
  updatedAt: 'updated_at',
  underscored: false
});

export default CardCounter;