// models/CardApprovalRequest.js - UPDATED for MariaDB with workflowConfigId

import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

// ✅ Define the model directly
const CardApprovalRequest = sequelize.define('CardApprovalRequest', {
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
  customerId: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'customer_id'
  },
  accountNumber: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'account_number'
  },
  accountId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'account_id'
  },
  cardData: {
    type: DataTypes.JSON, // ✅ Changed from JSONB to JSON
    allowNull: false,
    field: 'card_data',
    comment: 'Stores all card details for approval'
  },
  feeDetails: {
    type: DataTypes.JSON, // ✅ Changed from JSONB to JSON
    allowNull: true,
    field: 'fee_details'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'),
    defaultValue: 'PENDING'
  },
  requestedBy: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'requested_by'
  },
  requestedByRoleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'requested_by_role_id'
  },
  branchCode: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'branch_code'
  },
  organizationName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'organization_name'
  },
  branchName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'branch_name'
  },
  requestDate: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'request_date'
  },
  approvedBy: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'approved_by'
  },
  approvedByRoleId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'approved_by_role_id'
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'approved_at'
  },
  rejectedBy: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'rejected_by'
  },
  rejectedByRoleId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'rejected_by_role_id'
  },
  rejectedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'rejected_at'
  },
  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'rejection_reason'
  },
  approvalLevel: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    field: 'approval_level',
    comment: '0 - Pending, 1 - Channel Manager, 2 - Head Teller, 3 - Head of Banking'
  },
  isReissuance: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_reissuance'
  },
  existingCardId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'existing_card_id'
  },
  // In CardApprovalRequest.js - Update workflowConfigId type
workflowConfigId: {
  type: DataTypes.UUID,  // ✅ Changed from INTEGER to UUID
  allowNull: true,
  field: 'workflow_config_id',
  comment: 'Reference to the approval workflow configuration used'
},
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'ip_address'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at',
    defaultValue: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  },
  approvalHistory: {
    type: DataTypes.JSON, // ✅ Changed from JSONB to JSON
    defaultValue: [],
    allowNull: true,
    field: 'approval_history'
  },
  rec_st: {
    type: DataTypes.CHAR(1),
    defaultValue: 'A',
    field: 'rec_st'
  }
}, {
  timestamps: true,
  tableName: 'card_approval_requests',
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
});

// ✅ Associations
CardApprovalRequest.associate = (models) => {
  CardApprovalRequest.belongsTo(models.Customer, {
    foreignKey: 'customerId',
    targetKey: 'CUST_ID',
    as: 'customer'
  });
  
  CardApprovalRequest.belongsTo(models.CustomerAccount, {
    foreignKey: 'accountId',
    as: 'account'
  });
  
  CardApprovalRequest.belongsTo(models.User, {
    foreignKey: 'requestedBy',
    as: 'requester'
  });
  
  CardApprovalRequest.belongsTo(models.Role, {
    foreignKey: 'requestedByRoleId',
    as: 'requesterRole'
  });
  
  CardApprovalRequest.belongsTo(models.User, {
    foreignKey: 'approvedBy',
    as: 'approver'
  });
  
  CardApprovalRequest.belongsTo(models.Role, {
    foreignKey: 'approvedByRoleId',
    as: 'approverRole'
  });
  
  CardApprovalRequest.belongsTo(models.DebitCard, {
    foreignKey: 'existingCardId',
    as: 'existingCard'
  });
  
  // ✅ ADDED: Association to ApprovalWorkflowConfig
  CardApprovalRequest.belongsTo(models.ApprovalWorkflowConfig, {
    foreignKey: 'workflowConfigId',
    as: 'workflowConfig'
  });
};

// ✅ Export the model directly
export default CardApprovalRequest;
