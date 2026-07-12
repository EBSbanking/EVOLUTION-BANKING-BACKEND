// src/models/VaultApprovalRequiredRole.js - Class-based
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class VaultApprovalRequiredRole extends Model {}

VaultApprovalRequiredRole.init({
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  approval_id: {
    type: DataTypes.STRING(100),
    allowNull: false,
    references: {
      model: 'vault_pending_approvals',
      key: 'approval_id'
    }
  },
  required_role: {
    type: DataTypes.STRING(50),
    allowNull: false
  },
  approval_order: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  min_approvers_required: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
  is_mandatory: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
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
  modelName: 'VaultApprovalRequiredRole',
  tableName: 'vault_approval_required_roles',
  timestamps: true,
  underscored: false,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

export default VaultApprovalRequiredRole;