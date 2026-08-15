// src/models/VaultPersonnel.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class VaultPersonnel extends Model {}

VaultPersonnel.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  vault_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'vaults',
      key: 'id'
    }
  },
  user_id: {
    type: DataTypes.STRING(24),
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('PRIMARY_APPROVER', 'SECONDARY_APPROVER', 'AUTHORIZED_PERSONNEL', 'VIEWER'),
    defaultValue: 'AUTHORIZED_PERSONNEL'
  },
  access_level: {
    type: DataTypes.ENUM('FULL', 'PARTIAL', 'VIEW_ONLY'),
    defaultValue: 'PARTIAL'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  authorized_by: {
    type: DataTypes.STRING(24),
    allowNull: true
  },
  authorized_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  revoked_by: {
    type: DataTypes.STRING(24),
    allowNull: true
  },
  revoked_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  expiry_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'VaultPersonnel',
  tableName: 'vault_personnel',
  timestamps: true,
  underscored: false,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default VaultPersonnel;
