import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

// Define enums
export const EXECUTION_STATUS = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED'
};

export const STANDING_ORDER_STATUS = {
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'EXPIRED'
};

class StandingOrderExecution extends Model {
  // Static method to find executions by standing order
  static async findByStandingOrderId(standingOrderId, options = {}) {
    const defaultOptions = {
      where: { standingOrderId },
      order: [['executionDate', 'DESC']]
    };
    
    return await this.findAll({ ...defaultOptions, ...options });
  }

  // Static method to find pending executions
  static async findPendingExecutions(date = null) {
    const whereClause = {
      status: EXECUTION_STATUS.PENDING
    };
    
    if (date) {
      whereClause.executionDate = {
        [DataTypes.Op.lte]: date
      };
    }
    
    return await this.findAll({
      where: whereClause,
      order: [['executionDate', 'ASC']]
    });
  }

  // Static method to find failed executions
  static async findFailedExecutions(startDate, endDate) {
    return await this.findAll({
      where: {
        status: EXECUTION_STATUS.FAILED,
        executionDate: {
          [DataTypes.Op.between]: [startDate, endDate]
        }
      },
      order: [['executionDate', 'DESC']]
    });
  }

  // Static method to get execution statistics
  static async getExecutionStats(standingOrderId = null, startDate = null, endDate = null) {
    const whereClause = {};
    
    if (standingOrderId) {
      whereClause.standingOrderId = standingOrderId;
    }
    
    if (startDate && endDate) {
      whereClause.executionDate = {
        [DataTypes.Op.between]: [startDate, endDate]
      };
    }
    
    const result = await this.findAll({
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount']
      ],
      where: whereClause,
      group: ['status'],
      raw: true
    });
    
    return result.reduce((stats, row) => {
      stats[row.status] = {
        count: parseInt(row.count),
        totalAmount: parseFloat(row.totalAmount) || 0
      };
      return stats;
    }, {});
  }

  // Instance method to mark as successful
  async markAsSuccess(notes = null) {
    this.status = EXECUTION_STATUS.SUCCESS;
    this.executionNotes = notes || this.executionNotes;
    this.failureReason = null;
    return await this.save();
  }

  // Instance method to mark as failed
  async markAsFailed(reason, notes = null) {
    this.status = EXECUTION_STATUS.FAILED;
    this.failureReason = reason;
    this.executionNotes = notes || this.executionNotes;
    return await this.save();
  }

  // Instance method to mark as skipped
  async markAsSkipped(reason, notes = null) {
    this.status = EXECUTION_STATUS.SKIPPED;
    this.failureReason = reason;
    this.executionNotes = notes || this.executionNotes;
    return await this.save();
  }

  // Instance method to check if execution is overdue
  get isOverdue() {
    if (this.status !== EXECUTION_STATUS.PENDING) return false;
    
    const now = new Date();
    return this.executionDate < now;
  }

  // Instance method to get days overdue
  get daysOverdue() {
    if (!this.isOverdue) return 0;
    
    const now = new Date();
    const diffTime = Math.abs(now - this.executionDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

StandingOrderExecution.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    comment: 'Auto-increment primary key'
  },
  standingOrderId: {
    type: DataTypes.INTEGER, // Or STRING depending on your StandingOrder model
    allowNull: false,
    comment: 'Reference to standing order'
  },
  executionDate: {
    type: DataTypes.DATE,
    allowNull: false,
    comment: 'Scheduled execution date'
  },
  amount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    comment: 'Execution amount',
    validate: {
      min: {
        args: [0.01],
        msg: 'Amount must be greater than 0'
      }
    }
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'NGN',
    comment: 'Currency code (ISO 4217)',
    validate: {
      len: {
        args: [3, 3],
        msg: 'Currency must be 3 characters'
      },
      isUppercase: {
        msg: 'Currency must be uppercase'
      }
    },
    set(value) {
      this.setDataValue('currency', value ? value.toUpperCase() : value);
    }
  },
  status: {
    type: DataTypes.ENUM(
      EXECUTION_STATUS.PENDING,
      EXECUTION_STATUS.SUCCESS,
      EXECUTION_STATUS.FAILED,
      EXECUTION_STATUS.SKIPPED
    ),
    defaultValue: EXECUTION_STATUS.PENDING,
    comment: 'Execution status'
  },
  failureReason: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Reason for failure'
  },
  standingOrderStatusAtExecution: {
    type: DataTypes.ENUM(
      STANDING_ORDER_STATUS.PENDING_APPROVAL,
      STANDING_ORDER_STATUS.APPROVED,
      STANDING_ORDER_STATUS.REJECTED,
      STANDING_ORDER_STATUS.CANCELLED,
      STANDING_ORDER_STATUS.EXPIRED
    ),
    allowNull: false,
    comment: 'Standing order status at execution time'
  },
  executionNotes: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Execution notes'
  }
}, {
  sequelize,
  modelName: 'StandingOrderExecution',
  tableName: 'STANDING_ORDER_EXECUTIONS',
  timestamps: true,
  createdAt: 'CREATED_AT',
  updatedAt: 'UPDATED_AT',
  comment: 'Standing order execution records',
  indexes: [
    {
      name: 'idx_standing_order_id',
      fields: ['standingOrderId']
    },
    {
      name: 'idx_execution_date',
      fields: ['executionDate']
    },
    {
      name: 'idx_status',
      fields: ['status']
    },
    {
      name: 'idx_created_at',
      fields: ['CREATED_AT']
    },
    {
      name: 'idx_composite_order_execution',
      fields: ['standingOrderId', 'executionDate'],
      order: [['executionDate', 'DESC']]
    },
    {
      name: 'idx_currency',
      fields: ['currency']
    },
    {
      name: 'idx_standing_order_status',
      fields: ['standingOrderStatusAtExecution']
    },
    {
      name: 'idx_execution_range',
      fields: ['executionDate', 'status']
    }
  ],
  hooks: {
    beforeValidate: (execution, options) => {
      // Ensure currency is uppercase
      if (execution.currency) {
        execution.currency = execution.currency.toUpperCase();
      }
      
      // Trim string fields
      if (execution.failureReason) {
        execution.failureReason = execution.failureReason.trim();
      }
      if (execution.executionNotes) {
        execution.executionNotes = execution.executionNotes.trim();
      }
    },
    
    beforeCreate: async (execution, options) => {
      try {
        // Fetch standing order status at execution time
        const StandingOrder = sequelize.models.StandingOrder;
        if (StandingOrder) {
          const standingOrder = await StandingOrder.findByPk(execution.standingOrderId);
          
          if (standingOrder) {
            execution.standingOrderStatusAtExecution = standingOrder.status;
            
            // Auto-skip if standing order is not approved or active
            if (standingOrder.status !== STANDING_ORDER_STATUS.APPROVED || 
                (standingOrder.isActive !== undefined && !standingOrder.isActive)) {
              execution.status = EXECUTION_STATUS.SKIPPED;
              execution.executionNotes = `Skipped: Standing order status is '${standingOrder.status}'`;
              
              logger.info(`Auto-skipped execution for standing order ${execution.standingOrderId}`, {
                status: standingOrder.status,
                executionDate: execution.executionDate
              });
            }
          } else {
            execution.status = EXECUTION_STATUS.FAILED;
            execution.failureReason = 'Standing order not found';
            execution.standingOrderStatusAtExecution = STANDING_ORDER_STATUS.CANCELLED;
            
            logger.warn(`Standing order not found for execution`, {
              standingOrderId: execution.standingOrderId
            });
          }
        }
      } catch (error) {
        execution.status = EXECUTION_STATUS.FAILED;
        execution.failureReason = `Error fetching standing order: ${error.message}`;
        execution.standingOrderStatusAtExecution = STANDING_ORDER_STATUS.CANCELLED;
        
        logger.error(`Error fetching standing order for execution`, {
          standingOrderId: execution.standingOrderId,
          error: error.message
        });
      }
    },
    
    afterCreate: (execution, options) => {
      logger.info(`Standing order execution created`, {
        id: execution.id,
        standingOrderId: execution.standingOrderId,
        executionDate: execution.executionDate,
        status: execution.status,
        amount: execution.amount
      });
    },
    
    afterUpdate: (execution, options) => {
      if (execution.changed('status')) {
        logger.info(`Standing order execution status changed`, {
          id: execution.id,
          oldStatus: execution.previous('status'),
          newStatus: execution.status,
          standingOrderId: execution.standingOrderId
        });
      }
    }
  }
});

export default StandingOrderExecution;