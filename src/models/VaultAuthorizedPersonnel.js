// src/models/VaultAuthorizedPersonnel.js - Class-based
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class VaultAuthorizedPersonnel extends Model {}

VaultAuthorizedPersonnel.init({
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
  user_name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  user_role: {
    type: DataTypes.ENUM('VAULT_MANAGER', 'SUPERVISOR', 'TELLER', 'CASH_OFFICER', 'AUDITOR', 'BRANCH_MANAGER', 'HEAD_TELLER', 'BRANCH_OFFICER_SUPERVISOR'),
    allowNull: false
  },
  access_level: {
    type: DataTypes.ENUM('FULL', 'LIMITED', 'VIEW_ONLY', 'EMERGENCY'),
    defaultValue: 'LIMITED'
  },
  authorization_start: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  authorization_end: {
    type: DataTypes.DATE,
    allowNull: true
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  authorized_by: {
    type: DataTypes.STRING(24),
    allowNull: false
  },
  authorization_notes: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'VaultAuthorizedPersonnel',
  tableName: 'vault_authorized_personnel',
  timestamps: true,
  underscored: false,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { unique: true, fields: ['vault_id', 'user_id', 'is_active'] },
    { fields: ['vault_id'] },
    { fields: ['user_id'] },
    { fields: ['is_active'] }
  ]
});

export default VaultAuthorizedPersonnel;
