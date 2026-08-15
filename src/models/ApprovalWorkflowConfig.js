// models/ApprovalWorkflowConfig.js - FIXED for UUID
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const ApprovalWorkflowConfig = sequelize.define('ApprovalWorkflowConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  requestType: {
    type: DataTypes.ENUM('ISSUE', 'REISSUE', 'BLOCK', 'UNBLOCK', 'CANCEL'),
    allowNull: false,
    field: 'request_type'
  },
  minAmount: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    field: 'min_amount'
  },
  maxAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'max_amount'
  },
  approvalLevels: {
    type: DataTypes.JSON,
    allowNull: false,
    field: 'approval_levels',
    defaultValue: [
      { 
        level: 1, 
        roleId: 37, 
        role: 'CHANNEL_MANAGER', 
        name: 'Channel Manager' 
      },
      { 
        level: 2, 
        roleId: 30, 
        role: 'HEAD_TELLER', 
        name: 'Head Teller' 
      },
      { 
        level: 3, 
        roleId: 2, 
        role: 'HEAD_BANKING', 
        name: 'Head Banking Services' 
      }
    ]
  },
  requiresAll: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'requires_all'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  branchCode: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'branch_code'
  },
  organizationName: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'organization_name'
  },
  autoApproveThreshold: {
    type: DataTypes.DECIMAL(15, 2),
    defaultValue: 0,
    field: 'auto_approve_threshold'
  },
  requiresMultiBranchApproval: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'requires_multi_branch_approval'
  },
  escalationLevels: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'escalation_levels',
    defaultValue: [
      { 
        level: 1, 
        delayHours: 24, 
        roleId: 19,
        role: 'BRANCH_MANAGER', 
        name: 'Branch Manager' 
      },
      { 
        level: 2, 
        delayHours: 48, 
        roleId: 21,
        role: 'CHIEF_OPERATION_OFFICER', 
        name: 'Chief Operation Officer' 
      }
    ]
  },
  createdBy: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'created_by'
  },
  updatedBy: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'updated_by'
  },
  rec_st: {
    type: DataTypes.CHAR(1),
    defaultValue: 'A',
    field: 'rec_st'
  }
}, {
  timestamps: true,
  tableName: 'approval_workflow_configs',
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// ✅ Associations
ApprovalWorkflowConfig.associate = (models) => {
  ApprovalWorkflowConfig.hasMany(models.CardApprovalRequest, {
    foreignKey: 'workflowConfigId',
    as: 'approvalRequests'
  });
};

// ✅ Static method to get config by request type
ApprovalWorkflowConfig.getConfigForRequest = async function(requestType, amount = 0, branchCode = null) {
  const where = {
    requestType: requestType,
    isActive: true
  };
  
  if (branchCode) {
    where.branchCode = branchCode;
  }
  
  const config = await this.findOne({
    where: where,
    order: [['min_amount', 'DESC']]
  });
  
  return config;
};

// ✅ Export the model directly
export default ApprovalWorkflowConfig;
