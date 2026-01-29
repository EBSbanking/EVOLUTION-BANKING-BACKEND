// models/WF_BusinessRoleQueue.js
import { DataTypes } from 'sequelize';

/**
 * MySQL/Sequelize WF_BusinessRoleQueue Model
 * Manages role-based queue assignments for workflow processes
 */
export default function createWfBusinessRoleQueueModel(sequelize) {
  const WF_BusinessRoleQueue = sequelize.define('WF_BusinessRoleQueue', {
    // Primary identifier
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: 'Primary key'
    },
    
    // Business Role Queue ID (unique business identifier)
    BUS_ROLE_QUEUE_ID: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      comment: 'Business Role Queue Identifier',
      validate: {
        notNull: {
          msg: 'Business Role Queue ID is required'
        },
        notEmpty: {
          msg: 'Business Role Queue ID cannot be empty'
        },
        len: {
          args: [1, 100],
          msg: 'Business Role Queue ID must be between 1 and 100 characters'
        }
      }
    },
    
    // Role ID
    ROLE_ID: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Role Identifier (e.g., Manager, Approver, Reviewer)',
      validate: {
        notNull: {
          msg: 'Role ID is required'
        },
        notEmpty: {
          msg: 'Role ID cannot be empty'
        }
      },
      index: true
    },
    
    // Queue ID
    QUEUE_ID: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Queue Identifier',
      validate: {
        notNull: {
          msg: 'Queue ID is required'
        },
        notEmpty: {
          msg: 'Queue ID cannot be empty'
        }
      },
      index: true
    },
    
    // Record Status
    REC_ST: {
      type: DataTypes.ENUM('Active', 'Inactive', 'Suspended', 'Archived'),
      allowNull: false,
      defaultValue: 'Active',
      comment: 'Record Status',
      validate: {
        notNull: {
          msg: 'Record Status is required'
        },
        isIn: {
          args: [['Active', 'Inactive', 'Suspended', 'Archived']],
          msg: 'Invalid Record Status'
        }
      }
    },
    
    // Version
    VERSION: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: '1.0',
      comment: 'Version of the queue assignment',
      validate: {
        notNull: {
          msg: 'Version is required'
        },
        notEmpty: {
          msg: 'Version cannot be empty'
        }
      }
    },
    
    // Row Timestamp
    ROW_TS: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Row Timestamp - last update time'
    },
    
    // User ID
    USER_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'User ID associated with this assignment',
      validate: {
        notNull: {
          msg: 'User ID is required'
        },
        notEmpty: {
          msg: 'User ID cannot be empty'
        }
      },
      index: true
    },
    
    // Create Date
    CREATE_DT: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'Creation date'
    },
    
    // Created By
    CREATED_BY: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'User who created the record',
      validate: {
        notNull: {
          msg: 'Created By is required'
        },
        notEmpty: {
          msg: 'Created By cannot be empty'
        }
      }
    },
    
    // System Create Timestamp
    SYS_CREATE_TS: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'System Created Timestamp'
    },
    
    // Item Access Right
    ITEM_ACCESS_RIGHT: {
      type: DataTypes.ENUM('Read', 'Write', 'Approve', 'Reject', 'Review', 'Full', 'Limited'),
      allowNull: true,
      defaultValue: 'Read',
      comment: 'Access rights for items in the queue'
    },
    
    // Additional fields for enhanced functionality
    PRIORITY: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 1,
      comment: 'Priority level (1=lowest, 5=highest)',
      validate: {
        min: {
          args: [1],
          msg: 'Priority must be at least 1'
        },
        max: {
          args: [5],
          msg: 'Priority must be at most 5'
        }
      }
    },
    
    MAX_ITEMS: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Maximum number of items this role can handle in queue'
    },
    
    AUTO_ASSIGN: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Auto-assign items from queue to this role?'
    },
    
    ASSIGNMENT_ORDER: {
      type: DataTypes.ENUM('FIFO', 'PRIORITY', 'ROUND_ROBIN', 'LOAD_BALANCE'),
      allowNull: true,
      defaultValue: 'FIFO',
      comment: 'Method for assigning items from queue'
    },
    
    // Time constraints
    PROCESSING_TIME_LIMIT: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Maximum processing time in hours'
    },
    
    SLA_HOURS: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Service Level Agreement in hours'
    },
    
    // Queue configuration
    QUEUE_TYPE: {
      type: DataTypes.ENUM('WORKFLOW', 'NOTIFICATION', 'APPROVAL', 'REVIEW', 'GENERAL'),
      allowNull: false,
      defaultValue: 'WORKFLOW',
      comment: 'Type of queue'
    },
    
    BUSINESS_UNIT: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Business unit associated with this assignment'
    },
    
    DEPARTMENT: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Department associated with this assignment'
    },
    
    // Audit fields
    LAST_MODIFIED_BY: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'User who last modified the record'
    },
    
    LAST_MODIFIED_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last modification timestamp'
    },
    
    AUDIT_ACTION: {
      type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE', 'ACTIVATE', 'DEACTIVATE'),
      allowNull: true,
      comment: 'Audit action performed'
    },
    
    AUDIT_USER: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'User who performed the audit action'
    },
    
    // Expiry
    EXPIRY_DT: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Expiry date for this assignment'
    },
    
    IS_DEFAULT_ASSIGNMENT: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Is this the default assignment for this role-queue combination?'
    },
    
    // Notes
    NOTES: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Additional notes or comments'
    }

  }, {
    tableName: 'wf_business_role_queue',
    timestamps: true,
    createdAt: 'SYS_CREATE_TS',
    updatedAt: 'LAST_MODIFIED_DT',
    underscored: false,
    
    // Hooks
    hooks: {
      beforeCreate: async (roleQueue) => {
        // Auto-generate BUS_ROLE_QUEUE_ID if not provided
        if (!roleQueue.BUS_ROLE_QUEUE_ID) {
          const timestamp = Date.now();
          const random = Math.random().toString(36).substring(2, 8);
          roleQueue.BUS_ROLE_QUEUE_ID = `BRQ-${timestamp}-${random}`;
        }
        
        // Set audit fields on creation
        roleQueue.AUDIT_ACTION = 'CREATE';
        roleQueue.AUDIT_USER = roleQueue.CREATED_BY;
        
        // Set CREATE_DT to current date if not provided
        if (!roleQueue.CREATE_DT) {
          roleQueue.CREATE_DT = new Date();
        }
        
        // Update ROW_TS
        roleQueue.ROW_TS = new Date();
      },
      
      beforeUpdate: async (roleQueue) => {
        // Set audit fields on update
        roleQueue.AUDIT_ACTION = 'UPDATE';
        roleQueue.AUDIT_USER = roleQueue.LAST_MODIFIED_BY || 'SYSTEM';
        
        // Update ROW_TS on any modification
        roleQueue.ROW_TS = new Date();
        
        // Check if assignment is expired
        if (roleQueue.EXPIRY_DT && new Date() > roleQueue.EXPIRY_DT) {
          roleQueue.REC_ST = 'Inactive';
        }
      },
      
      beforeDestroy: async (roleQueue) => {
        // Instead of hard delete, consider soft delete
        // roleQueue.REC_ST = 'Archived';
        // await roleQueue.save({ hooks: false });
        // throw new Error('Soft delete implemented - use deactivation instead');
        
        // Set audit fields on delete
        roleQueue.AUDIT_ACTION = 'DELETE';
        roleQueue.AUDIT_USER = roleQueue.LAST_MODIFIED_BY || 'SYSTEM';
      }
    },
    
    // Default scope
    defaultScope: {
      where: {
        REC_ST: {
          [Op.ne]: 'Archived' // Exclude archived records by default
        }
      }
    },
    
    // Scopes
    scopes: {
      active: {
        where: {
          REC_ST: 'Active'
        }
      },
      byRole: (roleId) => ({
        where: { ROLE_ID: roleId }
      }),
      byQueue: (queueId) => ({
        where: { QUEUE_ID: queueId }
      }),
      byUser: (userId) => ({
        where: { USER_ID: userId }
      }),
      byBusinessUnit: (businessUnit) => ({
        where: { BUSINESS_UNIT: businessUnit }
      }),
      byQueueType: (queueType) => ({
        where: { QUEUE_TYPE: queueType }
      }),
      withWriteAccess: {
        where: {
          ITEM_ACCESS_RIGHT: {
            [Op.in]: ['Write', 'Approve', 'Reject', 'Full']
          }
        }
      },
      defaultAssignments: {
        where: {
          IS_DEFAULT_ASSIGNMENT: true
        }
      },
      autoAssignEnabled: {
        where: {
          AUTO_ASSIGN: true
        }
      },
      highPriority: {
        where: {
          PRIORITY: {
            [Op.gte]: 4
          }
        }
      },
      expired: {
        where: {
          EXPIRY_DT: {
            [Op.lt]: new Date()
          }
        }
      },
      activeAndNotExpired: {
        where: {
          REC_ST: 'Active',
          [Op.or]: [
            { EXPIRY_DT: null },
            { EXPIRY_DT: { [Op.gt]: new Date() } }
          ]
        }
      }
    },
    
    // Indexes
    indexes: [
      // Basic indexes
      {
        unique: true,
        fields: ['BUS_ROLE_QUEUE_ID']
      },
      {
        fields: ['ROLE_ID']
      },
      {
        fields: ['QUEUE_ID']
      },
      {
        fields: ['USER_ID']
      },
      {
        fields: ['REC_ST']
      },
      {
        fields: ['CREATED_BY']
      },
      {
        fields: ['SYS_CREATE_TS']
      },
      {
        fields: ['ITEM_ACCESS_RIGHT']
      },
      {
        fields: ['QUEUE_TYPE']
      },
      {
        fields: ['BUSINESS_UNIT']
      },
      {
        fields: ['DEPARTMENT']
      },
      {
        fields: ['IS_DEFAULT_ASSIGNMENT']
      },
      {
        fields: ['AUTO_ASSIGN']
      },
      {
        fields: ['EXPIRY_DT']
      },
      
      // Compound indexes for common queries
      {
        fields: ['ROLE_ID', 'QUEUE_ID'],
        unique: false
      },
      {
        fields: ['ROLE_ID', 'REC_ST']
      },
      {
        fields: ['QUEUE_ID', 'REC_ST']
      },
      {
        fields: ['USER_ID', 'REC_ST']
      },
      {
        fields: ['QUEUE_TYPE', 'REC_ST']
      },
      {
        fields: ['BUSINESS_UNIT', 'ROLE_ID']
      },
      {
        fields: ['PRIORITY', 'REC_ST']
      },
      {
        fields: ['ITEM_ACCESS_RIGHT', 'QUEUE_ID']
      },
      {
        fields: ['SYS_CREATE_TS', 'REC_ST']
      }
    ]
  });

  // Instance Methods
  WF_BusinessRoleQueue.prototype.activate = function(activatedBy) {
    this.REC_ST = 'Active';
    this.LAST_MODIFIED_BY = activatedBy;
    this.LAST_MODIFIED_DT = new Date();
    this.AUDIT_ACTION = 'ACTIVATE';
    this.AUDIT_USER = activatedBy;
    this.ROW_TS = new Date();
    
    return this.save();
  };

  WF_BusinessRoleQueue.prototype.deactivate = function(deactivatedBy, reason = null) {
    this.REC_ST = 'Inactive';
    this.LAST_MODIFIED_BY = deactivatedBy;
    this.LAST_MODIFIED_DT = new Date();
    this.AUDIT_ACTION = 'DEACTIVATE';
    this.AUDIT_USER = deactivatedBy;
    this.ROW_TS = new Date();
    
    if (reason) {
      this.NOTES = this.NOTES 
        ? `${this.NOTES}\nDeactivated: ${reason}` 
        : `Deactivated: ${reason}`;
    }
    
    return this.save();
  };

  WF_BusinessRoleQueue.prototype.setAsDefault = function(updatedBy) {
    this.IS_DEFAULT_ASSIGNMENT = true;
    this.LAST_MODIFIED_BY = updatedBy;
    this.LAST_MODIFIED_DT = new Date();
    this.AUDIT_ACTION = 'UPDATE';
    this.AUDIT_USER = updatedBy;
    this.ROW_TS = new Date();
    
    return this.save();
  };

  WF_BusinessRoleQueue.prototype.removeDefault = function(updatedBy) {
    this.IS_DEFAULT_ASSIGNMENT = false;
    this.LAST_MODIFIED_BY = updatedBy;
    this.LAST_MODIFIED_DT = new Date();
    this.AUDIT_ACTION = 'UPDATE';
    this.AUDIT_USER = updatedBy;
    this.ROW_TS = new Date();
    
    return this.save();
  };

  WF_BusinessRoleQueue.prototype.enableAutoAssign = function(updatedBy) {
    this.AUTO_ASSIGN = true;
    this.LAST_MODIFIED_BY = updatedBy;
    this.LAST_MODIFIED_DT = new Date();
    this.AUDIT_ACTION = 'UPDATE';
    this.AUDIT_USER = updatedBy;
    this.ROW_TS = new Date();
    
    return this.save();
  };

  WF_BusinessRoleQueue.prototype.disableAutoAssign = function(updatedBy) {
    this.AUTO_ASSIGN = false;
    this.LAST_MODIFIED_BY = updatedBy;
    this.LAST_MODIFIED_DT = new Date();
    this.AUDIT_ACTION = 'UPDATE';
    this.AUDIT_USER = updatedBy;
    this.ROW_TS = new Date();
    
    return this.save();
  };

  WF_BusinessRoleQueue.prototype.updateAccessRight = function(newAccessRight, updatedBy) {
    this.ITEM_ACCESS_RIGHT = newAccessRight;
    this.LAST_MODIFIED_BY = updatedBy;
    this.LAST_MODIFIED_DT = new Date();
    this.AUDIT_ACTION = 'UPDATE';
    this.AUDIT_USER = updatedBy;
    this.ROW_TS = new Date();
    
    return this.save();
  };

  WF_BusinessRoleQueue.prototype.setExpiry = function(expiryDate, updatedBy) {
    this.EXPIRY_DT = expiryDate;
    this.LAST_MODIFIED_BY = updatedBy;
    this.LAST_MODIFIED_DT = new Date();
    this.AUDIT_ACTION = 'UPDATE';
    this.AUDIT_USER = updatedBy;
    this.ROW_TS = new Date();
    
    return this.save();
  };

  WF_BusinessRoleQueue.prototype.getAssignmentInfo = function() {
    return {
      assignmentId: this.BUS_ROLE_QUEUE_ID,
      roleId: this.ROLE_ID,
      queueId: this.QUEUE_ID,
      status: this.REC_ST,
      accessRight: this.ITEM_ACCESS_RIGHT,
      userId: this.USER_ID,
      businessUnit: this.BUSINESS_UNIT,
      department: this.DEPARTMENT,
      queueType: this.QUEUE_TYPE,
      priority: this.PRIORITY,
      autoAssign: this.AUTO_ASSIGN,
      isDefault: this.IS_DEFAULT_ASSIGNMENT,
      expiryDate: this.EXPIRY_DT,
      createdBy: this.CREATED_BY,
      createdAt: this.SYS_CREATE_TS,
      lastModified: this.LAST_MODIFIED_DT
    };
  };

  // Static Methods
  WF_BusinessRoleQueue.findByRoleAndQueue = function(roleId, queueId, includeInactive = false) {
    const where = {
      ROLE_ID: roleId,
      QUEUE_ID: queueId
    };
    
    if (!includeInactive) {
      where.REC_ST = 'Active';
    }
    
    return this.findOne({
      where,
      order: [['PRIORITY', 'DESC'], ['SYS_CREATE_TS', 'DESC']]
    });
  };

  WF_BusinessRoleQueue.findAllByRole = function(roleId, options = {}) {
    const where = { ROLE_ID: roleId };
    
    if (options.onlyActive) {
      where.REC_ST = 'Active';
    }
    
    if (options.queueType) {
      where.QUEUE_TYPE = options.queueType;
    }
    
    if (options.businessUnit) {
      where.BUSINESS_UNIT = options.businessUnit;
    }
    
    return this.findAll({
      where,
      order: [
        ['IS_DEFAULT_ASSIGNMENT', 'DESC'],
        ['PRIORITY', 'DESC'],
        ['QUEUE_ID', 'ASC']
      ]
    });
  };

  WF_BusinessRoleQueue.findAllByQueue = function(queueId, options = {}) {
    const where = { QUEUE_ID: queueId };
    
    if (options.onlyActive) {
      where.REC_ST = 'Active';
    }
    
    if (options.accessRight) {
      where.ITEM_ACCESS_RIGHT = options.accessRight;
    }
    
    return this.findAll({
      where,
      order: [
        ['PRIORITY', 'DESC'],
        ['ROLE_ID', 'ASC']
      ]
    });
  };

  WF_BusinessRoleQueue.findAssignmentsForUser = function(userId, options = {}) {
    const where = { USER_ID: userId };
    
    if (options.onlyActive) {
      where.REC_ST = 'Active';
    }
    
    if (options.queueType) {
      where.QUEUE_TYPE = options.queueType;
    }
    
    return this.findAll({
      where,
      order: [
        ['PRIORITY', 'DESC'],
        ['QUEUE_ID', 'ASC']
      ]
    });
  };

  WF_BusinessRoleQueue.getDefaultAssignment = function(roleId, queueId) {
    return this.findOne({
      where: {
        ROLE_ID: roleId,
        QUEUE_ID: queueId,
        IS_DEFAULT_ASSIGNMENT: true,
        REC_ST: 'Active'
      }
    });
  };

  WF_BusinessRoleQueue.getAutoAssignableAssignments = function(queueId) {
    return this.findAll({
      where: {
        QUEUE_ID: queueId,
        REC_ST: 'Active',
        AUTO_ASSIGN: true,
        [Op.or]: [
          { EXPIRY_DT: null },
          { EXPIRY_DT: { [Op.gt]: new Date() } }
        ]
      },
      order: [
        ['PRIORITY', 'DESC'],
        ['SYS_CREATE_TS', 'ASC']
      ]
    });
  };

  WF_BusinessRoleQueue.searchAssignments = function(searchTerm, options = {}) {
    const where = {
      [Op.or]: [
        { ROLE_ID: { [Op.like]: `%${searchTerm}%` } },
        { QUEUE_ID: { [Op.like]: `%${searchTerm}%` } },
        { USER_ID: { [Op.like]: `%${searchTerm}%` } },
        { BUSINESS_UNIT: { [Op.like]: `%${searchTerm}%` } },
        { DEPARTMENT: { [Op.like]: `%${searchTerm}%` } }
      ]
    };
    
    if (options.onlyActive) {
      where.REC_ST = 'Active';
    }
    
    if (options.queueType) {
      where.QUEUE_TYPE = options.queueType;
    }
    
    return this.findAll({
      where,
      order: [['SYS_CREATE_TS', 'DESC']],
      limit: options.limit || 50
    });
  };

  // Define associations
  WF_BusinessRoleQueue.associate = function(models) {
    // Association with User (created by)
    WF_BusinessRoleQueue.belongsTo(models.User, {
      foreignKey: 'CREATED_BY',
      targetKey: 'user_name',
      as: 'creator'
    });
    
    // Association with User (assigned user)
    WF_BusinessRoleQueue.belongsTo(models.User, {
      foreignKey: 'USER_ID',
      targetKey: 'user_name',
      as: 'assignedUser'
    });
    
    // Association with User (last modified by)
    WF_BusinessRoleQueue.belongsTo(models.User, {
      foreignKey: 'LAST_MODIFIED_BY',
      targetKey: 'user_name',
      as: 'lastModifier'
    });
    
    // Association with Role model (if exists)
    // WF_BusinessRoleQueue.belongsTo(models.Role, {
    //   foreignKey: 'ROLE_ID',
    //   targetKey: 'role_code',
    //   as: 'role'
    // });
    
    // Association with Queue model (if exists)
    // WF_BusinessRoleQueue.belongsTo(models.Queue, {
    //   foreignKey: 'QUEUE_ID',
    //   targetKey: 'queue_code',
    //   as: 'queue'
    // });
  };

  return WF_BusinessRoleQueue;
}
