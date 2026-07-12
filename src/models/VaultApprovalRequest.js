// src/models/VaultApprovalRequest.js - Class-based
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class VaultApprovalRequest extends Model {}

VaultApprovalRequest.init({
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
  }
}, {
  sequelize,
  modelName: 'VaultApprovalRequest',
  tableName: 'vault_approval_requests',
  timestamps: true,
  underscored: false,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default VaultApprovalRequest;