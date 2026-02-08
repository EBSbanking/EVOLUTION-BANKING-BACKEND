// models/Approval.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class Approval extends Model {}

Approval.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  request_id: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  entity_type: {
    type: DataTypes.STRING,
    allowNull: false
  },
  entity_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  action_type: {
    type: DataTypes.ENUM('ACTIVATE_ACCOUNT', 'DEACTIVATE_ACCOUNT'),
    allowNull: false
  },
  current_status: {
    type: DataTypes.STRING,
    allowNull: false
  },
  requested_status: {
    type: DataTypes.STRING,
    allowNull: false
  },
  request_data: {
    type: DataTypes.JSON, // CHANGED: JSONB → JSON for MariaDB
    allowNull: false
  },
  request_notes: {
    type: DataTypes.TEXT
  },
  initiator_id: {
    type: DataTypes.STRING,
    allowNull: false
  },
  initiator_role: {
    type: DataTypes.STRING,
    allowNull: false
  },
  first_approver_id: {
    type: DataTypes.STRING
  },
  first_approver_role: {
    type: DataTypes.STRING
  },
  first_approval_status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
    defaultValue: 'PENDING'
  },
  first_approval_notes: {
    type: DataTypes.TEXT
  },
  first_approval_date: {
    type: DataTypes.DATE
  },
  second_approver_id: {
    type: DataTypes.STRING
  },
  second_approver_role: {
    type: DataTypes.STRING
  },
  second_approval_status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
    defaultValue: 'PENDING'
  },
  second_approval_notes: {
    type: DataTypes.TEXT
  },
  second_approval_date: {
    type: DataTypes.DATE
  },
  overall_status: {
  type: DataTypes.ENUM('PENDING', 'PENDING_FIRST', 'PENDING_SECOND', 'APPROVED', 'REJECTED', 'CANCELLED'),
  defaultValue: 'PENDING' // Changed default to 'PENDING'
},
  expiry_date: {
    type: DataTypes.DATE,
    allowNull: false
  },
  executed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  execution_date: {
    type: DataTypes.DATE
  },
  executed_by: {
    type: DataTypes.STRING
  },
  // Additional fields for better tracking
  cancellation_reason: {
    type: DataTypes.TEXT
  },
  cancelled_at: {
    type: DataTypes.DATE
  },
  cancelled_by: {
    type: DataTypes.STRING
  },
  initiator_details: {
    type: DataTypes.JSON, // CHANGED: JSONB → JSON for MariaDB
    defaultValue: null
  },
  metadata: {
    type: DataTypes.JSON, // CHANGED: JSONB → JSON for MariaDB
    defaultValue: null
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
  modelName: 'Approval',
  tableName: 'approval_requests',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    {
      name: 'idx_request_id',
      fields: ['request_id'],
      unique: true
    },
    {
      name: 'idx_entity',
      fields: ['entity_type', 'entity_id']
    },
    {
      name: 'idx_status',
      fields: ['overall_status']
    },
    {
      name: 'idx_expiry',
      fields: ['expiry_date']
    },
    {
      name: 'idx_initiator',
      fields: ['initiator_id']
    },
    {
      name: 'idx_first_approver',
      fields: ['first_approver_id']
    },
    {
      name: 'idx_second_approver',
      fields: ['second_approver_id']
    }
  ],
  hooks: {
    beforeCreate: (approval) => {
      approval.created_at = new Date();
      approval.updated_at = new Date();
    },
    beforeUpdate: (approval) => {
      approval.updated_at = new Date();
    }
  }
});

export default Approval;