// src/models/VaultAuditLog.js - Class-based
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class VaultAuditLog extends Model {}

VaultAuditLog.init({
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
  action: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  performed_by: {
    type: DataTypes.STRING(24),
    allowNull: false
  },
  performed_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  details: {
    type: DataTypes.JSON,
    allowNull: true
  },
  ip_address: {
    type: DataTypes.STRING(45),
    allowNull: true
  },
  status: {
    type: DataTypes.STRING(20),
    allowNull: true
  }
}, {
  sequelize,
  modelName: 'VaultAuditLog',
  tableName: 'vault_audit_logs',
  timestamps: true,
  underscored: false,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default VaultAuditLog;
