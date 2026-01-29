// models/WFWorkItem.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/sequelize.js';

export const STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  COMPLETED: 'COMPLETED'
};

export const PRIORITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

const WFWorkItem = sequelize.define('WFWorkItem', {
  WORK_ITEM_ID: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'WORK_ITEM_ID'
  },
  BUS_PROC_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'BUS_PROC_ID',
    comment: 'Business Process ID'
  },
  ITEM_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'ITEM_ID',
    comment: 'Entity ID'
  },
  ITEM_CLASS_NM: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'ITEM_CLASS_NM',
    comment: 'Entity Type'
  },
  SUB_PROC_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'SUB_PROC_ID',
    comment: 'Sub Process ID / Current Step'
  },
  TARGET_USER_ROLE_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'TARGET_USER_ROLE_ID',
    comment: 'Assigned To Role/User'
  },
  DEADLINE_TM: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'DEADLINE_TM',
    defaultValue: DataTypes.NOW,
    comment: 'Due Date'
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'),
    allowNull: false,
    defaultValue: 'PENDING',
    field: 'STATUS',
    comment: 'Work Item Status'
  },
  WAIT_ST: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED'),
    allowNull: false,
    defaultValue: 'PENDING',
    field: 'WAIT_ST',
    comment: 'Wait Status'
  },
  USER_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'USER_ID',
    comment: 'Created By'
  },
  priority: {
    type: DataTypes.ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'),
    allowNull: false,
    defaultValue: 'MEDIUM',
    field: 'PRIORITY',
    comment: 'Priority Level'
  },
  ITEM_VALUE: {
    type: DataTypes.JSON,
    allowNull: true,
    defaultValue: {},
    field: 'ITEM_VALUE',
    comment: 'Metadata / Item Value'
  },
  QUEUE_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'QUEUE_ID',
    comment: 'Queue ID'
  },
  ITEM_DESC: {
    type: DataTypes.STRING(500),
    allowNull: false,
    field: 'ITEM_DESC',
    comment: 'Item Description'
  },
  CUST_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'CUST_ID',
    comment: 'Customer ID'
  },
  REC_ST: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'Active',
    field: 'REC_ST',
    comment: 'Record Status'
  },
  VERSION: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    field: 'VERSION',
    comment: 'Version Number'
  },
  BU_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'BU_ID',
    comment: 'Business Unit ID'
  },
  ITEM_TYPE: {
    type: DataTypes.STRING(50),
    allowNull: false,
    field: 'ITEM_TYPE',
    comment: 'Item Type'
  },
  ITEM_REF_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'ITEM_REF_NO',
    comment: 'Item Reference Number'
  },
  ESCALATION_TM: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'ESCALATION_TM',
    comment: 'Escalation Time in minutes'
  },
  ITEM_BU_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'ITEM_BU_ID',
    comment: 'Item Business Unit ID'
  },
  EVENT_ID: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'EVENT_ID',
    comment: 'Event ID'
  },
  JOURNAL_ID: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'JOURNAL_ID',
    comment: 'Journal ID'
  },
  TRANSACTION_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'TRANSACTION_ID',
    comment: 'Transaction ID'
  },
  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'ROW_TS',
    comment: 'Row Timestamp'
  },
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'CREATE_DT',
    comment: 'Create Date'
  },
  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'SYS_CREATE_TS',
    comment: 'System Create Timestamp'
  },
  lastUpdatedBy: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'LAST_UPDATED_BY',
    comment: 'Last Updated By User'
  },
  comments: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'COMMENTS',
    comment: 'Work Item Comments'
  },
  isEscalated: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'IS_ESCALATED',
    comment: 'Is Work Item Escalated'
  },
  escalationLevel: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'ESCALATION_LEVEL',
    comment: 'Escalation Level'
  },
  parentWorkItemId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'PARENT_WORK_ITEM_ID',
    comment: 'Parent Work Item ID'
  },
  slaBreach: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'SLA_BREACH',
    comment: 'SLA Breach Flag'
  },
  slaResponseTime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'SLA_RESPONSE_TIME',
    comment: 'SLA Response Time in minutes'
  },
  slaResolutionTime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'SLA_RESOLUTION_TIME',
    comment: 'SLA Resolution Time in minutes'
  },
  actualResponseTime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'ACTUAL_RESPONSE_TIME',
    comment: 'Actual Response Time in minutes'
  },
  actualResolutionTime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'ACTUAL_RESOLUTION_TIME',
    comment: 'Actual Resolution Time in minutes'
  }
}, {
  tableName: 'wf_work_items',
  timestamps: true,
  createdAt: 'CREATED_AT',
  updatedAt: 'UPDATED_AT',
  hooks: {
    beforeCreate: (workItem) => {
      // Sync status and WAIT_ST
      if (workItem.WAIT_ST && !workItem.status) {
        workItem.status = workItem.WAIT_ST;
      }
      if (workItem.status && !workItem.WAIT_ST) {
        workItem.WAIT_ST = workItem.status;
      }
      
      // Set default due date if not provided (7 days from now)
      if (!workItem.DEADLINE_TM) {
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 7);
        workItem.DEADLINE_TM = dueDate;
      }
    },
    beforeUpdate: (workItem) => {
      // Keep status and WAIT_ST in sync
      if (workItem.changed('WAIT_ST') && workItem.WAIT_ST) {
        workItem.status = workItem.WAIT_ST;
      }
      if (workItem.changed('status') && workItem.status) {
        workItem.WAIT_ST = workItem.status;
      }
      
      // Update lastUpdatedBy if user is available
      if (workItem._context?.user?.id) {
        workItem.lastUpdatedBy = workItem._context.user.id;
      }
    },
    afterCreate: (workItem) => {
      // Calculate SLA times if needed
      if (workItem.slaResponseTime) {
        // You could set up a timer or job here
      }
    }
  },
  indexes: [
    {
      name: 'idx_work_item_id',
      fields: ['WORK_ITEM_ID']
    },
    {
      name: 'idx_bus_proc_id',
      fields: ['BUS_PROC_ID']
    },
    {
      name: 'idx_item_id',
      fields: ['ITEM_ID']
    },
    {
      name: 'idx_cust_id',
      fields: ['CUST_ID']
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_priority',
      fields: ['priority']
    },
    {
      name: 'idx_target_user_role',
      fields: ['TARGET_USER_ROLE_ID']
    },
    {
      name: 'idx_deadline',
      fields: ['DEADLINE_TM']
    },
    {
      name: 'idx_queue_id',
      fields: ['QUEUE_ID']
    },
    {
      name: 'idx_created_by',
      fields: ['USER_ID']
    },
    {
      name: 'idx_record_status',
      fields: ['REC_ST']
    },
    // Composite indexes for common queries
    {
      name: 'idx_status_priority',
      fields: ['status', 'priority']
    },
    {
      name: 'idx_cust_status',
      fields: ['CUST_ID', 'status']
    },
    {
      name: 'idx_user_status',
      fields: ['TARGET_USER_ROLE_ID', 'status']
    },
    {
      name: 'idx_item_ref',
      fields: ['ITEM_REF_NO', 'ITEM_TYPE']
    }
  ]
});

// Static Methods
WFWorkItem.findByStatus = async function(status, options = {}) {
  const defaults = {
    where: { status },
    order: [['priority', 'DESC'], ['DEADLINE_TM', 'ASC']]
  };
  return await this.findAll({ ...defaults, ...options });
};

WFWorkItem.findByUserRole = async function(userRole, options = {}) {
  const defaults = {
    where: { 
      TARGET_USER_ROLE_ID: userRole,
      status: 'PENDING'
    },
    order: [['priority', 'DESC'], ['DEADLINE_TM', 'ASC']]
  };
  return await this.findAll({ ...defaults, ...options });
};

WFWorkItem.findByCustomer = async function(customerId, options = {}) {
  const defaults = {
    where: { CUST_ID: customerId },
    order: [['CREATED_AT', 'DESC']]
  };
  return await this.findAll({ ...defaults, ...options });
};

WFWorkItem.findOverdue = async function() {
  const now = new Date();
  return await this.findAll({
    where: {
      DEADLINE_TM: { [Op.lt]: now },
      status: 'PENDING'
    },
    order: [['DEADLINE_TM', 'ASC']]
  });
};

WFWorkItem.findHighPriority = async function() {
  return await this.findAll({
    where: {
      priority: { [Op.in]: ['HIGH', 'CRITICAL'] },
      status: 'PENDING'
    },
    order: [['priority', 'DESC'], ['DEADLINE_TM', 'ASC']]
  });
};

WFWorkItem.countByStatus = async function() {
  const result = await this.findAll({
    attributes: [
      'status',
      [sequelize.fn('COUNT', sequelize.col('WORK_ITEM_ID')), 'count']
    ],
    group: ['status'],
    raw: true
  });
  
  return result.reduce((acc, item) => {
    acc[item.status] = item.count;
    return acc;
  }, {});
};

WFWorkItem.paginate = async function(page = 1, limit = 10, filters = {}) {
  const offset = (page - 1) * limit;
  
  const { count, rows } = await this.findAndCountAll({
    where: filters,
    limit,
    offset,
    order: [['CREATED_AT', 'DESC']]
  });
  
  return {
    items: rows,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(count / limit),
      totalItems: count,
      hasNextPage: page < Math.ceil(count / limit),
      hasPrevPage: page > 1
    }
  };
};

// Instance Methods
WFWorkItem.prototype.assignTo = async function(userRole) {
  return await this.update({
    TARGET_USER_ROLE_ID: userRole,
    lastUpdatedBy: this._context?.user?.id
  });
};

WFWorkItem.prototype.complete = async function(comments = '') {
  return await this.update({
    status: 'COMPLETED',
    WAIT_ST: 'COMPLETED',
    REC_ST: 'Completed',
    comments: this.comments ? `${this.comments}\n${comments}` : comments,
    actualResolutionTime: this.calculateResolutionTime()
  });
};

WFWorkItem.prototype.approve = async function(comments = '') {
  return await this.update({
    status: 'APPROVED',
    WAIT_ST: 'APPROVED',
    REC_ST: 'Approved',
    comments: this.comments ? `${this.comments}\n${comments}` : comments
  });
};

WFWorkItem.prototype.reject = async function(comments = '') {
  return await this.update({
    status: 'REJECTED',
    WAIT_ST: 'REJECTED',
    REC_ST: 'Rejected',
    comments: this.comments ? `${this.comments}\n${comments}` : comments
  });
};

WFWorkItem.prototype.escalate = async function(level = 1) {
  return await this.update({
    isEscalated: true,
    escalationLevel: level,
    priority: level > 2 ? 'CRITICAL' : 'HIGH',
    comments: this.comments ? `${this.comments}\nEscalated to level ${level}` : `Escalated to level ${level}`
  });
};

WFWorkItem.prototype.calculateResolutionTime = function() {
  if (!this.CREATE_DT) return null;
  
  const createDate = new Date(this.CREATE_DT);
  const now = new Date();
  const diffMs = now - createDate;
  return Math.floor(diffMs / (1000 * 60)); // Return minutes
};

WFWorkItem.prototype.isOverdue = function() {
  if (!this.DEADLINE_TM) return false;
  
  const deadline = new Date(this.DEADLINE_TM);
  const now = new Date();
  return now > deadline && this.status === 'PENDING';
};

WFWorkItem.prototype.daysUntilDue = function() {
  if (!this.DEADLINE_TM) return null;
  
  const deadline = new Date(this.DEADLINE_TM);
  const now = new Date();
  const diffMs = deadline - now;
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

export default WFWorkItem;
