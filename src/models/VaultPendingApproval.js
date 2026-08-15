// src/models/VaultPendingApproval.js - Class-based
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class VaultPendingApproval extends Model {}

VaultPendingApproval.init({
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
  approval_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  request_type: {
    type: DataTypes.ENUM('ACCESS', 'TRANSFER', 'MAINTENANCE', 'SECURITY_CHANGE', 'PERSONNEL_CHANGE'),
    allowNull: false
  },
  requested_by: {
    type: DataTypes.STRING(24),
    allowNull: false
  },
  requested_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  approved_by: {
    type: DataTypes.STRING(24),
    allowNull: true
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'),
    defaultValue: 'PENDING'
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  request_details: {
    type: DataTypes.JSON,
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
  modelName: 'VaultPendingApproval',
  tableName: 'vault_pending_approvals',
  timestamps: true,
  underscored: false,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default VaultPendingApproval;
