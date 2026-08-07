// src/models/StandingOrder.js
import { DataTypes, Model, Op } from 'sequelize';
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
  static associate(models) {
    this.belongsTo(models.Customer, { 
      foreignKey: 'customerAcctNo', 
      targetKey: 'CUST_ID', 
      as: 'customer' 
    });
    this.belongsTo(models.Account, { 
      foreignKey: 'customerAcctNo', 
      targetKey: 'account_number', 
      as: 'fromAccount' 
    });
    this.belongsTo(models.Account, { 
      foreignKey: 'beneficiaryAcctNo', 
      targetKey: 'account_number', 
      as: 'toAccount' 
    });
    this.belongsTo(models.User, { 
      foreignKey: 'approvedBy', 
      as: 'approver' 
    });
    this.belongsTo(models.User, { 
      foreignKey: 'rejectedBy', 
      as: 'rejector' 
    });
  }

  static async findByCustomer(customerAcctNo, options = {}) {
    const defaultOptions = {
      where: { customerAcctNo },
      order: [['CREATED_AT', 'DESC']]
    };
    return await this.findAll({ ...defaultOptions, ...options });
  }

  static async findByBeneficiary(beneficiaryAcctNo, options = {}) {
    const defaultOptions = {
      where: { beneficiaryAcctNo },
      order: [['CREATED_AT', 'DESC']]
    };
    return await this.findAll({ ...defaultOptions, ...options });
  }

  static async findPendingApprovals() {
    return await this.findAll({
      where: { status: STATUS.PENDING_APPROVAL },
      order: [['CREATED_AT', 'ASC']]
    });
  }

  static async findActiveOrders() {
    return await this.findAll({
      where: {
        status: STATUS.APPROVED,
        isActive: true,
        [Op.or]: [
          { endDate: null },
          { endDate: { [Op.gte]: new Date() } }
        ]
      },
      order: [['nextExecutionDate', 'ASC']]
    });
  }

  static async findOrdersDueForExecution(executionDate = new Date()) {
    return await this.findAll({
      where: {
        status: STATUS.APPROVED,
        isActive: true,
        nextExecutionDate: { [Op.lte]: executionDate },
        [Op.or]: [
          { endDate: null },
          { endDate: { [Op.gte]: executionDate } }
        ]
      },
      order: [['nextExecutionDate', 'ASC']]
    });
  }

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

  async approve(approvedBy, comments = null) {
    this.status = STATUS.APPROVED;
    this.isActive = true;
    this.approvedBy = approvedBy;
    this.approvedAt = new Date();
    this.comments = comments || this.comments;
    return await this.save();
  }

  async reject(rejectedBy, comments = null) {
    this.status = STATUS.REJECTED;
    this.isActive = false;
    this.rejectedBy = rejectedBy;
    this.rejectedAt = new Date();
    this.comments = comments || this.comments;
    return await this.save();
  }

  async cancel(comments = null) {
    this.status = STATUS.CANCELLED;
    this.isActive = false;
    this.comments = comments || this.comments;
    return await this.save();
  }

  async expire() {
    this.status = STATUS.EXPIRED;
    this.isActive = false;
    return await this.save();
  }

  async calculateNextExecutionDate() {
    if (this.status !== STATUS.APPROVED || !this.isActive) return null;
    const lastExecutionDate = this.nextExecutionDate || this.startDate;
    let nextDate = new Date(lastExecutionDate);
    switch (this.frequency) {
      case FREQUENCY.DAILY:
        nextDate.setDate(nextDate.getDate() + this.recurrence_interval);
        break;
      case FREQUENCY.WEEKLY:
        nextDate.setDate(nextDate.getDate() + (7 * this.recurrence_interval));
        if (this.dayOfWeek) {
          const targetDay = (this.dayOfWeek - nextDate.getDay() + 7) % 7;
          nextDate.setDate(nextDate.getDate() + targetDay);
        }
        break;
      case FREQUENCY.MONTHLY:
        if (this.dayOfMonth) {
          nextDate.setMonth(nextDate.getMonth() + this.recurrence_interval);
          const lastDayOfMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
          nextDate.setDate(Math.min(this.dayOfMonth, lastDayOfMonth));
        } else if (this.weekOfMonth && this.dayOfWeek) {
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
    if (this.endDate && nextDate > this.endDate) return null;
    return nextDate;
  }

  get isValid() {
    if (this.status !== STATUS.APPROVED || !this.isActive) return false;
    const now = new Date();
    if (now < this.startDate) return false;
    if (this.endDate && now > this.endDate) return false;
    return true;
  }
}

StandingOrder.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      comment: 'Auto-increment primary key'
    },
    customerAcctNo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'customer_acct_no',
      validate: { notEmpty: { msg: 'Customer account number cannot be empty' } }
    },
    beneficiaryAcctNo: {
      type: DataTypes.STRING(50),
      allowNull: false,
      field: 'beneficiary_acct_no',
      validate: { notEmpty: { msg: 'Beneficiary account number cannot be empty' } }
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      comment: 'Transfer amount',
      validate: { min: { args: [0.01], msg: 'Amount must be greater than 0' } }
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
    recurrence_interval: {
      type: DataTypes.INTEGER,
      field: 'recurrence_interval',
      defaultValue: 1,
      comment: 'Interval between executions',
      validate: { min: { args: [1], msg: 'Interval must be at least 1' } }
    },
    dayOfWeek: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'day_of_week',
      comment: 'Day of week (1=Monday, 7=Sunday)',
      validate: { min: 1, max: 7 }
    },
    dayOfMonth: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'day_of_month',
      comment: 'Day of month (1-31)',
      validate: { min: 1, max: 31 }
    },
    weekOfMonth: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'week_of_month',
      comment: 'Week of month (1-5, 5=last week)',
      validate: { min: 1, max: 5 }
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_date',
      comment: 'Start date for standing order'
    },
    endDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'end_date',
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
      field: 'is_active',
      comment: 'Whether standing order is active'
    },
    approvedBy: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'approved_by',
      comment: 'User who approved the standing order (username or ID)'
    },
    approvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'approved_at',
      comment: 'Approval timestamp'
    },
    rejectedBy: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'rejected_by',
      comment: 'User who rejected the standing order (username or ID)'
    },
    rejectedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'rejected_at',
      comment: 'Rejection timestamp'
    },
    comments: {
      type: DataTypes.STRING(500),
      allowNull: true,
      comment: 'Comments or notes'
    },
    branch_id: {
      type: DataTypes.STRING(10),
      allowNull: true,
      field: 'branch_id',
      comment: 'Business unit / branch that owns this standing order'
    },
    maxExecutions: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_executions',
      comment: 'Maximum number of executions',
      validate: { min: 1 }
    },
    nextExecutionDate: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'next_execution_date',
      comment: 'Next scheduled execution date'
    },
    // ✅ FIX: Explicitly define CREATED_AT and UPDATED_AT fields
    CREATED_AT: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'CREATED_AT',
      comment: 'Creation timestamp'
    },
    UPDATED_AT: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'UPDATED_AT',
      comment: 'Last update timestamp'
    }
  },
  {
    sequelize,
    modelName: 'StandingOrder',
    // ✅ FIX: Use lowercase table name to match actual database
    tableName: 'standing_orders',
    timestamps: true,
    // ✅ FIX: Map timestamps to the correct column names
    createdAt: 'CREATED_AT',
    updatedAt: 'UPDATED_AT',
    // ✅ FIX: Disable automatic camelCase conversion for timestamps
    underscored: false,
    comment: 'Standing orders for recurring transfers',
    hooks: {
      beforeValidate: (order) => {
        if (order.customerAcctNo && typeof order.customerAcctNo === 'string')
          order.customerAcctNo = order.customerAcctNo.trim();
        if (order.beneficiaryAcctNo && typeof order.beneficiaryAcctNo === 'string')
          order.beneficiaryAcctNo = order.beneficiaryAcctNo.trim();
        if (order.comments && typeof order.comments === 'string')
          order.comments = order.comments.trim();
        if (order.currency) order.currency = order.currency.toUpperCase();
      },
      beforeCreate: (order) => {
        if (order.frequency === FREQUENCY.MONTHLY) {
          if (!order.dayOfMonth && (!order.weekOfMonth || !order.dayOfWeek))
            throw new Error('Monthly orders require dayOfMonth or weekOfMonth + dayOfWeek');
          if (order.dayOfMonth && (order.weekOfMonth || order.dayOfWeek))
            throw new Error('Use either dayOfMonth (fixed) or weekOfMonth + dayOfWeek (relative)');
        }
        if (order.frequency === FREQUENCY.WEEKLY && !order.dayOfWeek)
          throw new Error('Weekly orders require dayOfWeek');
        if (!order.nextExecutionDate && order.startDate)
          order.nextExecutionDate = new Date(order.startDate);
        order.isActive = (order.status === STATUS.APPROVED);
        if (order.recurrence_interval < 1)
          throw new Error('Interval must be at least 1');
        
        // ✅ Ensure CREATED_AT is set
        if (!order.CREATED_AT) {
          order.CREATED_AT = new Date();
        }
      },
      beforeUpdate: (order) => {
        if (order.changed('status'))
          order.isActive = (order.status === STATUS.APPROVED);
        if (order.changed('status') && order.status !== STATUS.APPROVED) {
          order.approvedBy = null;
          order.approvedAt = null;
        }
        if (order.changed('status') && order.status !== STATUS.REJECTED) {
          order.rejectedBy = null;
          order.rejectedAt = null;
        }
        if (order.changed('status')) {
          const oldStatus = order.previous('status');
          const validTransitions = {
            [STATUS.PENDING_APPROVAL]: [STATUS.APPROVED, STATUS.REJECTED],
            [STATUS.APPROVED]: [STATUS.CANCELLED, STATUS.EXPIRED],
            [STATUS.REJECTED]: [STATUS.PENDING_APPROVAL],
            [STATUS.CANCELLED]: [],
            [STATUS.EXPIRED]: []
          };
          if (!validTransitions[oldStatus]?.includes(order.status))
            throw new Error(`Invalid status transition from ${oldStatus} to ${order.status}`);
        }
        const scheduleFields = ['frequency', 'recurrence_interval', 'dayOfWeek', 'dayOfMonth', 'weekOfMonth', 'startDate'];
        if (scheduleFields.some(field => order.changed(field)) && order.status === STATUS.APPROVED) {
          order.nextExecutionDate = order.startDate;
        }
        if (order.changed('recurrence_interval') && order.recurrence_interval < 1)
          throw new Error('Interval must be at least 1');
        
        // ✅ Ensure UPDATED_AT is set
        order.UPDATED_AT = new Date();
      },
      afterCreate: (order) => {
        logger.info(`Standing order created`, {
          id: order.id,
          customerAcctNo: order.customerAcctNo,
          beneficiaryAcctNo: order.beneficiaryAcctNo,
          amount: order.amount,
          status: order.status,
          branch_id: order.branch_id
        });
      },
      afterUpdate: (order) => {
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
  }
);

export default StandingOrder;