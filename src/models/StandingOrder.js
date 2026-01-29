import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

// Define enums
export const FREQUENCY = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly'
};

export const STATUS = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED'
};

export const CURRENCY = {
  NGN: 'NGN'
};

export const DAYS_OF_WEEK = {
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
  SUNDAY: 7
};

class StandingOrder extends Model {
  // Static method to find by customer account
  static async findByCustomer(customerAcctNo, options = {}) {
    const defaultOptions = {
      where: { customerAcctNo },
      order: [['CREATED_AT', 'DESC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find by beneficiary account
  static async findByBeneficiary(beneficiaryAcctNo, options = {}) {
    const defaultOptions = {
      where: { beneficiaryAcctNo },
      order: [['CREATED_AT', 'DESC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find pending approvals
  static async findPendingApprovals() {
    return await this.findAll({
      where: { 
        status: STATUS.PENDING_APPROVAL 
      },
      order: [['CREATED_AT', 'ASC']]
    });
  }

  // Static method to find active standing orders
  static async findActiveOrders() {
    return await this.findAll({
      where: { 
        status: STATUS.APPROVED,
        isActive: true,
        [DataTypes.Op.or]: [
          { endDate: null },
          { endDate: { [DataTypes.Op.gte]: new Date() } }
        ]
      },
      order: [['nextExecutionDate', 'ASC']]
    });
  }

  // Static method to find orders due for execution
  static async findOrdersDueForExecution(executionDate = new Date()) {
    return await this.findAll({
      where: {
        status: STATUS.APPROVED,
        isActive: true,
        nextExecutionDate: {
          [DataTypes.Op.lte]: executionDate
        },
        [DataTypes.Op.or]: [
          { endDate: null },
          { endDate: { [DataTypes.Op.gte]: executionDate } }
        ]
      },
      order: [['nextExecutionDate', 'ASC']]
    });
  }

  // Static method to get statistics
  static async getStatistics(customerAcctNo = null) {
    const whereClause = customerAcctNo ? { customerAcctNo } : {};
    
    const result = await this.findAll({
      attributes: [
        'status',
        'frequency',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
        [sequelize.fn('AVG', sequelize.col('amount')), 'averageAmount']
      ],
      where: whereClause,
      group: ['status', 'frequency'],
      raw: true
    });
    
    return result.map(row => ({
      status: row.status,
      frequency: row.frequency,
      count: parseInt(row.count),
      totalAmount: parseFloat(row.totalAmount) || 0,
      averageAmount: parseFloat(row.averageAmount) || 0
    }));
  }

  // Instance method to approve standing order
  async approve(approvedBy, comments = null) {
    this.status = STATUS.APPROVED;
    this.isActive = true;
    this.approvedBy = approvedBy;
    this.approvedAt = new Date();
    this.comments = comments || this.comments;
    
    return await this.save();
  }

  // Instance method to reject standing order
  async reject(rejectedBy, comments = null) {
    this.status = STATUS.REJECTED;
    this.isActive = false;
    this.rejectedBy = rejectedBy;
    this.rejectedAt = new Date();
    this.comments = comments || this.comments;
    
    return await this.save();
  }

  // Instance method to cancel standing order
  async cancel(comments = null) {
    this.status = STATUS.CANCELLED;
    this.isActive = false;
    this.comments = comments || this.comments;
    
    return await this.save();
  }

  // Instance method to expire standing order
  async expire() {
    this.status = STATUS.EXPIRED;
    this.isActive = false;
    
    return await this.save();
  }

  // Instance method to calculate next execution date
  async calculateNextExecutionDate() {
    if (this.status !== STATUS.APPROVED || !this.isActive) {
      return null;
    }
    
    const currentDate = new Date();
    const lastExecutionDate = this.nextExecutionDate || this.startDate;
    let nextDate = new Date(lastExecutionDate);
    
    switch (this.frequency) {
      case FREQUENCY.DAILY:
        nextDate.setDate(nextDate.getDate() + this.recurrence_interval);
        break;
        
      case FREQUENCY.WEEKLY:
        nextDate.setDate(nextDate.getDate() + (7 * this.recurrence_interval));
        // Adjust to specific day of week if needed
        if (this.dayOfWeek) {
          const targetDay = (this.dayOfWeek - nextDate.getDay() + 7) % 7;
          nextDate.setDate(nextDate.getDate() + targetDay);
        }
        break;
        
      case FREQUENCY.MONTHLY:
        if (this.dayOfMonth) {
          // Fixed day of month
          nextDate.setMonth(nextDate.getMonth() + this.recurrence_interval);
          const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
          nextDate.setDate(Math.min(this.dayOfMonth, lastDayOfMonth));
        } else if (this.weekOfMonth && this.dayOfWeek) {
          // Relative week of month
          nextDate.setMonth(nextDate.getMonth() + this.recurrence_interval);
          nextDate.setDate(1);
          const firstDay = nextDate.getDay();
          let targetDate = 1 + ((this.dayOfWeek - firstDay + 7) % 7);
          targetDate += (this.weekOfMonth - 1) * 7;
          const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
          nextDate.setDate(Math.min(targetDate, lastDayOfMonth));
        }
        break;
        
      case FREQUENCY.YEARLY:
        nextDate.setFullYear(nextDate.getFullYear() + this.recurrence_interval);
        break;
    }
    
    // Check if next date exceeds end date
    if (this.endDate && nextDate > this.endDate) {
      return null;
    }
    
    // Check max executions
    if (this.maxExecutions) {
      // This would require counting past executions
      // Implementation depends on your execution tracking
    }
    
    return nextDate;
  }

  // Instance method to check if standing order is valid
  get isValid() {
    if (this.status !== STATUS.APPROVED || !this.isActive) {
      return false;
    }
    
    const now = new Date();
    if (now < this.startDate) {
      return false;
    }
    
    if (this.endDate && now > this.endDate) {
      return false;
    }
    
    return true;
  }
}

StandingOrder.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Auto-increment primary key'
  },
  customerAcctNo: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Customer account number',
    validate: {
      notEmpty: {
        msg: 'Customer account number cannot be empty'
      }
    }
  },
  beneficiaryAcctNo: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Beneficiary account number',
    validate: {
      notEmpty: {
        msg: 'Beneficiary account number cannot be empty'
      }
    }
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: 'Transfer amount',
    validate: {
      min: {
        args: [0.01],
        msg: 'Amount must be greater than 0'
      }
    }
  },
  currency: {
    type: DataTypes.ENUM(Object.values(CURRENCY)),
    allowNull: false,
    defaultValue: CURRENCY.NGN,
    comment: 'Currency'
  },
  frequency: {
    type: DataTypes.ENUM(Object.values(FREQUENCY)),
    allowNull: false,
    comment: 'Execution frequency'
  },
  recurrence_interval: {  // CHANGED: from 'interval' to 'recurrence_interval'
    type: DataTypes.INTEGER,
    field: 'recurrence_interval',  // Explicitly map to database column
    defaultValue: 1,
    comment: 'Interval between executions',
    validate: {
      min: {
        args: [1],
        msg: 'Interval must be at least 1'
      }
    }
  },
  dayOfWeek: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Day of week (1=Monday, 7=Sunday)',
    validate: {
      min: {
        args: [1],
        msg: 'Day of week must be between 1 and 7'
      },
      max: {
        args: [7],
        msg: 'Day of week must be between 1 and 7'
      }
    }
  },
  dayOfMonth: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Day of month (1-31)',
    validate: {
      min: {
        args: [1],
        msg: 'Day of month must be between 1 and 31'
      },
      max: {
        args: [31],
        msg: 'Day of month must be between 1 and 31'
      }
    }
  },
  weekOfMonth: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Week of month (1-5, 5=last week)',
    validate: {
      min: {
        args: [1],
        msg: 'Week of month must be between 1 and 5'
      },
      max: {
        args: [5],
        msg: 'Week of month must be between 1 and 5'
      }
    }
  },
  startDate: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Start date for standing order'
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'End date for standing order (null for indefinite)'
  },
  status: {
    type: DataTypes.ENUM(Object.values(STATUS)),
    defaultValue: STATUS.PENDING_APPROVAL,
    comment: 'Standing order status'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Whether standing order is active'
  },
  approvedBy: {
    type: DataTypes.INTEGER, // Or STRING depending on User model
    allowNull: true,
    comment: 'User who approved the standing order'
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Approval timestamp'
  },
  rejectedBy: {
    type: DataTypes.INTEGER, // Or STRING depending on User model
    allowNull: true,
    comment: 'User who rejected the standing order'
  },
  rejectedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Rejection timestamp'
  },
  comments: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Comments or notes'
  },
  maxExecutions: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Maximum number of executions',
    validate: {
      min: {
        args: [1],
        msg: 'Maximum executions must be at least 1'
      }
    }
  },
  nextExecutionDate: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Next scheduled execution date'
  }
}, {
  sequelize,
  modelName: 'StandingOrder',
  tableName: 'STANDING_ORDERS',
  timestamps: true,
  createdAt: 'CREATED_AT',
  updatedAt: 'UPDATED_AT',
  comment: 'Standing orders for recurring transfers',
  indexes: [
    {
      name: 'idx_customer_acct',
      fields: ['customerAcctNo']
    },
    {
      name: 'idx_beneficiary_acct',
      fields: ['beneficiaryAcctNo']
    },
    {
      name: 'idx_customer_frequency',
      fields: ['customerAcctNo', 'frequency']
    },
    {
      name: 'idx_next_execution_date',
      fields: ['nextExecutionDate']
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_is_active',
      fields: ['isActive']
    },
    {
      name: 'idx_start_date',
      fields: ['startDate']
    },
    {
      name: 'idx_end_date',
      fields: ['endDate']
    },
    {
      name: 'idx_created_at',
      fields: ['CREATED_AT']
    },
    {
      name: 'idx_frequency_status',
      fields: ['frequency', 'status']
    }
    // Note: Removed conditional indexes as MySQL doesn't support them directly
  ],
  hooks: {
    beforeValidate: (order, options) => {
      // Trim string fields
      if (order.customerAcctNo) order.customerAcctNo = order.customerAcctNo.trim();
      if (order.beneficiaryAcctNo) order.beneficiaryAcctNo = order.beneficiaryAcctNo.trim();
      if (order.comments) order.comments = order.comments.trim();
      
      // Ensure currency is uppercase
      if (order.currency) {
        order.currency = order.currency.toUpperCase();
      }
    },
    
    beforeCreate: (order, options) => {
      // Validate monthly frequency logic
      if (order.frequency === FREQUENCY.MONTHLY) {
        if (!order.dayOfMonth && (!order.weekOfMonth || !order.dayOfWeek)) {
          throw new Error('Monthly orders require dayOfMonth or weekOfMonth + dayOfWeek');
        }
        if (order.dayOfMonth && (order.weekOfMonth || order.dayOfWeek)) {
          throw new Error('Use either dayOfMonth (fixed) or weekOfMonth + dayOfWeek (relative)');
        }
      }
      
      // Validate weekly frequency requires dayOfWeek
      if (order.frequency === FREQUENCY.WEEKLY && !order.dayOfWeek) {
        throw new Error('Weekly orders require dayOfWeek');
      }
      
      // Set initial nextExecutionDate to startDate
      if (!order.nextExecutionDate && order.startDate) {
        order.nextExecutionDate = new Date(order.startDate);
      }
      
      // Sync isActive with status
      if (order.status === STATUS.APPROVED) {
        order.isActive = true;
      } else {
        order.isActive = false;
      }
      
      // Validate recurrence_interval
      if (order.recurrence_interval < 1) {
        throw new Error('Interval must be at least 1');
      }
    },
    
    beforeUpdate: (order, options) => {
      // Sync isActive with status
      if (order.changed('status')) {
        order.isActive = (order.status === STATUS.APPROVED);
      }
      
      // Clear approval/rejection fields when status changes
      if (order.changed('status') && order.status !== STATUS.APPROVED) {
        order.approvedBy = null;
        order.approvedAt = null;
      }
      if (order.changed('status') && order.status !== STATUS.REJECTED) {
        order.rejectedBy = null;
        order.rejectedAt = null;
      }
      
      // Validate status transitions
      if (order.changed('status')) {
        const oldStatus = order.previous('status');
        const validTransitions = {
          [STATUS.PENDING_APPROVAL]: [STATUS.APPROVED, STATUS.REJECTED],
          [STATUS.APPROVED]: [STATUS.CANCELLED, STATUS.EXPIRED],
          [STATUS.REJECTED]: [STATUS.PENDING_APPROVAL],
          [STATUS.CANCELLED]: [],
          [STATUS.EXPIRED]: []
        };
        
        if (!validTransitions[oldStatus]?.includes(order.status)) {
          throw new Error(`Invalid status transition from ${oldStatus} to ${order.status}`);
        }
      }
      
      // Recalculate nextExecutionDate if schedule changes
      const scheduleFields = ['frequency', 'recurrence_interval', 'dayOfWeek', 'dayOfMonth', 'weekOfMonth', 'startDate'];
      const scheduleChanged = scheduleFields.some(field => order.changed(field));
      
      if (scheduleChanged && order.status === STATUS.APPROVED) {
        // Recalculate next execution date
        // This is simplified - you might want to call calculateNextExecutionDate()
        order.nextExecutionDate = order.startDate;
      }
      
      // Validate recurrence_interval
      if (order.changed('recurrence_interval') && order.recurrence_interval < 1) {
        throw new Error('Interval must be at least 1');
      }
    },
    
    afterCreate: (order, options) => {
      logger.info(`Standing order created`, {
        id: order.id,
        customerAcctNo: order.customerAcctNo,
        beneficiaryAcctNo: order.beneficiaryAcctNo,
        amount: order.amount,
        status: order.status
      });
    },
    
    afterUpdate: (order, options) => {
      if (order.changed('status')) {
        logger.info(`Standing order status changed`, {
          id: order.id,
          oldStatus: order.previous('status'),
          newStatus: order.status,
          customerAcctNo: order.customerAcctNo
        });
      }
    }
  }
});

export default StandingOrder;