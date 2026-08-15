// models/DrawerReassignment.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class DrawerReassignment extends Model {
  // Method to check if reassignment is currently effective
  isEffective() {
    const now = new Date();
    return this.STATUS === 'COMPLETED' && 
           this.EFFECTIVE_FROM <= now && 
           (!this.EFFECTIVE_TO || this.EFFECTIVE_TO > now);
  }

  // Method to approve reassignment
  approve(approvedBy) {
    this.STATUS = 'APPROVED';
    this.APPROVED_BY = approvedBy;
    this.APPROVAL_DATE = new Date();
    this.VERSION_NO += 1;
  }

  // Method to complete reassignment
  complete() {
    this.STATUS = 'COMPLETED';
    this.VERSION_NO += 1;
  }

  // Method to reject reassignment
  reject(remarks = '') {
    this.STATUS = 'REJECTED';
    if (remarks) this.REMARKS = remarks;
    this.VERSION_NO += 1;
  }

  // Method to cancel reassignment
  cancel(remarks = '') {
    this.STATUS = 'CANCELLED';
    if (remarks) this.REMARKS = remarks;
    this.VERSION_NO += 1;
    this.EFFECTIVE_TO = new Date();
  }

  // Method to verify balance transfer
  verifyTransfer(verifiedBy) {
    this.TRANSFER_VERIFIED = true;
    this.VERIFIED_BY = verifiedBy;
    this.VERSION_NO += 1;
  }

  // Method to get reassignment duration in hours
  getReassignmentDuration() {
    if (this.EFFECTIVE_FROM && this.EFFECTIVE_TO) {
      const durationMs = new Date(this.EFFECTIVE_TO) - new Date(this.EFFECTIVE_FROM);
      return Math.floor(durationMs / (1000 * 60 * 60)); // Convert to hours
    }
    return null;
  }

  // Static method to find active reassignments for a drawer
  static async findActiveByDrawer(drawerId) {
    return await this.findAll({
      where: {
        DRAWER_ID: drawerId,
        STATUS: 'COMPLETED',
        REC_ST: 'A',
        EFFECTIVE_TO: null
      },
      order: [['CREATE_DT', 'DESC']]
    });
  }

  // Static method to find current assignment for a drawer
  static async getCurrentAssignment(drawerId) {
    return await this.findOne({
      where: {
        DRAWER_ID: drawerId,
        STATUS: 'COMPLETED',
        REC_ST: 'A',
        EFFECTIVE_TO: null
      },
      order: [['EFFECTIVE_FROM', 'DESC']]
    });
  }

  // Static method to find reassignment history for a user
  static async findByUser(userId, options = {}) {
    const where = {
      [Op.or]: [
        { CURRENT_ASSIGNEE_ID: userId },
        { NEW_ASSIGNEE_ID: userId }
      ],
      REC_ST: 'A'
    };
    
    if (options.status) where.STATUS = options.status;
    if (options.reassignmentType) where.REASSIGNMENT_TYPE = options.reassignmentType;
    
    return await this.findAll({
      where,
      order: [['CREATE_DT', 'DESC']]
    });
  }

  // Static method to find pending reassignments
  static async findPendingReassignments(buId = null) {
    const where = {
      STATUS: 'PENDING',
      REC_ST: 'A'
    };
    
    if (buId) where.BU_ID = buId;
    
    return await this.findAll({
      where,
      order: [['CREATE_DT', 'ASC']]
    });
  }

  // Static method to find reassignments by date range
  static async findByDateRange(startDate, endDate, buId = null) {
    const where = {
      CREATE_DT: {
        [Op.between]: [startDate, endDate]
      },
      REC_ST: 'A'
    };
    
    if (buId) where.BU_ID = buId;
    
    return await this.findAll({
      where,
      order: [['CREATE_DT', 'DESC']]
    });
  }

  // Static method to get user reassignment statistics
  static async getUserReassignmentStats(userId, startDate, endDate) {
    const reassignments = await this.findAll({
      where: {
        [Op.or]: [
          { CURRENT_ASSIGNEE_ID: userId },
          { NEW_ASSIGNEE_ID: userId }
        ],
        REC_ST: 'A',
        CREATE_DT: {
          [Op.between]: [startDate, endDate]
        }
      }
    });

    return {
      totalReassignments: reassignments.length,
      asCurrentAssignee: reassignments.filter(r => r.CURRENT_ASSIGNEE_ID === userId).length,
      asNewAssignee: reassignments.filter(r => r.NEW_ASSIGNEE_ID === userId).length,
      completed: reassignments.filter(r => r.STATUS === 'COMPLETED').length,
      pending: reassignments.filter(r => r.STATUS === 'PENDING').length,
      rejected: reassignments.filter(r => r.STATUS === 'REJECTED').length
    };
  }

  // Static method to find by DRAWER_REASSIGNMENT_ID
  static async findByReassignmentId(reassignmentId) {
    return await this.findOne({
      where: {
        DRAWER_REASSIGNMENT_ID: reassignmentId,
        REC_ST: 'A'
      }
    });
  }

  // Static method to check if a user has active assignments
  static async hasActiveAssignments(userId) {
    const activeAssignments = await this.count({
      where: {
        [Op.or]: [
          { CURRENT_ASSIGNEE_ID: userId },
          { NEW_ASSIGNEE_ID: userId }
        ],
        STATUS: 'COMPLETED',
        REC_ST: 'A',
        EFFECTIVE_TO: null
      }
    });
    
    return activeAssignments > 0;
  }

  // Static method to get drawer reassignment history
  static async getDrawerHistory(drawerId, limit = 10) {
    return await this.findAll({
      where: {
        DRAWER_ID: drawerId,
        REC_ST: 'A'
      },
      order: [['CREATE_DT', 'DESC']],
      limit: limit
    });
  }

  // Static method to create a new reassignment
  static async createReassignment(data, userId, ipAddress = null, sessionId = null) {
    const reassignment = await this.create({
      ...data,
      USER_ID: userId,
      CREATED_BY: userId,
      IP_ADDRESS: ipAddress,
      SESSION_ID: sessionId,
      ROW_TS: new Date(),
      CREATE_DT: new Date(),
      SYS_CREATE_TS: new Date(),
      EFFECTIVE_FROM: data.EFFECTIVE_FROM || new Date(),
      VERSION_NO: 1,
      REC_ST: 'A'
    });

    return reassignment;
  }
}

DrawerReassignment.init({
  // Primary Identification
// In models/DrawerReassignment.js
DRAWER_REASSIGNMENT_ID: {
  type: DataTypes.STRING(50), // Keep as STRING
  primaryKey: true,
  // REMOVE THIS LINE: autoIncrement: true, // VARCHAR can't auto-increment
  allowNull: false,
  unique: true,
  comment: 'Unique identifier for reassignment record'
},
  
  // Drawer Reference
  DRAWER_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'drawers',
      key: 'DRAWER_ID'
    },
    comment: 'Reference to the drawer being reassigned'
  },
  DRAWER_NO: {
    type: DataTypes.STRING(20),
    allowNull: true,
    comment: 'Drawer number for quick reference'
  },
  
  // Business Context
  BU_ID: {
    type: DataTypes.STRING(50), // Changed from INTEGER to STRING for IDs like '101'
    allowNull: false,
    comment: 'Business Unit ID'
  },
  
  // Assignment Details - CHANGED THESE FROM INTEGER TO STRING
  CURRENT_ASSIGNEE_ID: {
    type: DataTypes.STRING(50), // Changed from INTEGER to STRING for IDs like 'PCO04'
    allowNull: false,
    comment: 'Current assignee user ID'
  },
  CURRENT_ASSIGNEE_NAME: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Current assignee full name'
  },
  NEW_ASSIGNEE_ID: {
    type: DataTypes.STRING(50), // Changed from INTEGER to STRING for IDs like 'PCO04'
    allowNull: false,
    comment: 'New assignee user ID'
  },
  NEW_ASSIGNEE_NAME: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'New assignee full name'
  },
  
  // Reassignment Context
  REASSIGNMENT_TYPE: {
    type: DataTypes.ENUM('REGULAR', 'TEMPORARY', 'EMERGENCY', 'SHIFT_CHANGE', 'LOAD_BALANCE'),
    allowNull: false,
    defaultValue: 'REGULAR',
    comment: 'Type of reassignment'
  },
  RSN_ID: {
    type: DataTypes.STRING(50), // Changed from INTEGER to STRING
    allowNull: true,
    comment: 'Reason ID for categorization'
  },
  REASON_CODE: {
    type: DataTypes.ENUM('SHIFT_CHANGE', 'BREAK_COVERAGE', 'ABSENCE', 'TERMINATION', 'SECURITY', 'OPERATIONAL'),
    allowNull: false,
    defaultValue: 'OPERATIONAL',
    comment: 'Reason code for reassignment'
  },
  REMARKS: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Additional notes or comments'
  },
  
  // Status and Workflow
  STATUS: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'),
    allowNull: false,
    defaultValue: 'PENDING',
    comment: 'Current status of reassignment'
  },
  APPROVED_BY: {
    type: DataTypes.STRING(50), // Changed from STRING(24) to STRING(50)
    allowNull: true,
    comment: 'User ID who approved the reassignment'
  },
  APPROVAL_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date when reassignment was approved'
  },
  
  // Financial Context (for open drawer reassignments)
  DRAWER_STATUS_AT_REASSIGNMENT: {
    type: DataTypes.ENUM('OPEN', 'CLOSED'),
    allowNull: false,
    defaultValue: 'OPEN',
    comment: 'Status of drawer at time of reassignment'
  },
  BALANCE_AT_REASSIGNMENT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    defaultValue: 0.00,
    comment: 'Drawer balance at time of reassignment'
  },
  TRANSFER_VERIFIED: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether cash transfer was verified'
  },
  VERIFIED_BY: {
    type: DataTypes.STRING(50), // Changed from STRING(24) to STRING(50)
    allowNull: true,
    comment: 'User ID who verified the cash transfer'
  },
  
  // Audit Fields
  REC_ST: {
    type: DataTypes.CHAR(1),
    allowNull: false,
    defaultValue: 'A',
    validate: {
      isIn: [['A', 'I', 'C']] // Active, Inactive, Closed
    },
    comment: 'Record status: A=Active, I=Inactive, C=Cancelled'
  },
  VERSION_NO: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    comment: 'Version number for optimistic locking'
  },
  ROW_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Row timestamp'
  },
  USER_ID: {
    type: DataTypes.STRING(50), // Changed from STRING(24) to STRING(50)
    allowNull: false,
    comment: 'User ID who initiated the reassignment'
  },
  CREATE_DT: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Creation date'
  },
  SYS_CREATE_TS: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'System creation timestamp'
  },
  CREATED_BY: {
    type: DataTypes.STRING(50), // Changed from STRING(24) to STRING(50)
    allowNull: false,
    comment: 'User ID who created the record'
  },
  
  // Effective Dates
  EFFECTIVE_FROM: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    comment: 'Date from which reassignment is effective'
  },
  EFFECTIVE_TO: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date until which reassignment is effective (null for indefinite)'
  },
  
  // Additional Audit Info
  IP_ADDRESS: {
    type: DataTypes.STRING(45),
    allowNull: true,
    comment: 'IP address of user who created the record'
  },
  SESSION_ID: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Session ID for tracking'
  },

  // Sequelize timestamps
  createdAt: {
    type: DataTypes.DATE,
    field: 'createdAt',
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    field: 'updatedAt',
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'DrawerReassignment',
  tableName: 'drawer_reassignments',
  timestamps: true,
  underscored: false,
  paranoid: false,
  hooks: {
    beforeSave: async (reassignment, options) => {
      if (reassignment.changed()) {
        reassignment.VERSION_NO += 1;
        reassignment.ROW_TS = new Date();
        reassignment.updatedAt = new Date();
      }
    },
    afterFind: (results) => {
      if (!results) return;
      
      const processResult = (result) => {
        if (result && result.dataValues) {
          // Convert BALANCE_AT_REASSIGNMENT to number if it exists
          if (result.BALANCE_AT_REASSIGNMENT !== null && result.BALANCE_AT_REASSIGNMENT !== undefined) {
            result.dataValues.BALANCE_AT_REASSIGNMENT = parseFloat(result.BALANCE_AT_REASSIGNMENT);
          }
        }
      };
      
      if (Array.isArray(results)) {
        results.forEach(processResult);
      } else {
        processResult(results);
      }
    }
  },
  indexes: [
    {
      name: 'idx_drawer_reassignments_drawer_create',
      fields: ['DRAWER_ID', 'CREATE_DT']
    },
    {
      name: 'idx_drawer_reassignments_current_assignee',
      fields: ['CURRENT_ASSIGNEE_ID', 'CREATE_DT']
    },
    {
      name: 'idx_drawer_reassignments_new_assignee',
      fields: ['NEW_ASSIGNEE_ID', 'CREATE_DT']
    },
    {
      name: 'idx_drawer_reassignments_bu_status',
      fields: ['BU_ID', 'STATUS']
    },
    {
      name: 'idx_drawer_reassignments_type_create',
      fields: ['REASSIGNMENT_TYPE', 'CREATE_DT']
    },
    {
      name: 'idx_drawer_reassignments_effective_dates',
      fields: ['EFFECTIVE_FROM', 'EFFECTIVE_TO']
    },
    {
      name: 'idx_drawer_reassignments_status',
      fields: ['STATUS']
    },
    {
      name: 'idx_drawer_reassignments_drawer_status',
      fields: ['DRAWER_ID', 'STATUS', 'EFFECTIVE_TO']
    },
    {
      name: 'idx_drawer_reassignments_reassignment_id',
      fields: ['DRAWER_REASSIGNMENT_ID'],
      unique: true
    }
  ],
  comment: 'Tracks drawer reassignments between users'
});

export default DrawerReassignment;
