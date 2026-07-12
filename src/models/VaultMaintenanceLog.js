// src/models/VaultMaintenanceLog.js - Class-based
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class VaultMaintenanceLog extends Model {}

VaultMaintenanceLog.init({
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
  maintenance_type: {
    type: DataTypes.ENUM('ROUTINE', 'EMERGENCY', 'UPGRADE', 'REPAIR', 'INSPECTION'),
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
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  cost: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true
  },
  next_maintenance_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'),
    defaultValue: 'PENDING'
  }
}, {
  sequelize,
  modelName: 'VaultMaintenanceLog',
  tableName: 'vault_maintenance_logs',
  timestamps: true,
  underscored: false,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default VaultMaintenanceLog;