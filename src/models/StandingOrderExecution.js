import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';

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
  static associate(models) {
    this.belongsTo(models.StandingOrder, {
      foreignKey: 'standingOrderId',
      as: 'standingOrder'
    });
  }

  static async findByStandingOrderId(standingOrderId, options = {}) {
    return await this.findAll({
      where: { standingOrderId },
      order: [['executionDate', 'DESC']],
      ...options
    });
  }

  static async findPendingExecutions(date = null) {
    const whereClause = { status: EXECUTION_STATUS.PENDING };
    if (date) whereClause.executionDate = { [DataTypes.Op.lte]: date };
    return await this.findAll({
      where: whereClause,
      order: [['executionDate', 'ASC']]
    });
  }

  static async findFailedExecutions(startDate, endDate) {
    return await this.findAll({
      where: {
        status: EXECUTION_STATUS.FAILED,
        executionDate: { [DataTypes.Op.between]: [startDate, endDate] }
      },
      order: [['executionDate', 'DESC']]
    });
  }

  static async getExecutionStats(standingOrderId = null, startDate = null, endDate = null) {
    const whereClause = {};
    if (standingOrderId) whereClause.standingOrderId = standingOrderId;
    if (startDate && endDate) whereClause.executionDate = { [DataTypes.Op.between]: [startDate, endDate] };
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
      stats[row.status] = { count: parseInt(row.count), totalAmount: parseFloat(row.totalAmount) || 0 };
      return stats;
    }, {});
  }

  async markAsSuccess(notes = null) {
    this.status = EXECUTION_STATUS.SUCCESS;
    this.executionNotes = notes || this.executionNotes;
    this.failureReason = null;
    return await this.save();
  }

  async markAsFailed(reason, notes = null) {
    this.status = EXECUTION_STATUS.FAILED;
    this.failureReason = reason;
    this.executionNotes = notes || this.executionNotes;
    return await this.save();
  }

  async markAsSkipped(reason, notes = null) {
    this.status = EXECUTION_STATUS.SKIPPED;
    this.failureReason = reason;
    this.executionNotes = notes || this.executionNotes;
    return await this.save();
  }

  get isOverdue() {
    if (this.status !== EXECUTION_STATUS.PENDING) return false;
    return this.executionDate < new Date();
  }

  get daysOverdue() {
    if (!this.isOverdue) return 0;
    const diffTime = Math.abs(new Date() - this.executionDate);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
}

StandingOrderExecution.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    standingOrderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'standing_order_id',
      references: { model: 'standing_orders', key: 'id' },
      comment: 'Reference to standing order'
    },
    executionDate: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'execution_date',
      comment: 'Scheduled execution date'
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      field: 'amount',
      validate: { min: { args: [0.01], msg: 'Amount must be greater than 0' } }
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'NGN',
      field: 'currency',
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
      field: 'status',
      comment: 'Execution status'
    },
    failureReason: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'failure_reason',
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
      field: 'standing_order_status_at_execution',
      comment: 'Standing order status at execution time'
    },
    executionNotes: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'execution_notes',
      comment: 'Execution notes'
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at',
      comment: 'Timestamp when execution was processed'
    },
    createdAt: {
      type: DataTypes.DATE,
      field: 'created_at',
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      field: 'updated_at',
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    modelName: 'StandingOrderExecution',
    tableName: 'standing_order_executions',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    indexes: [
      { name: 'idx_standing_order_id', fields: ['standing_order_id'] },
      { name: 'idx_execution_date', fields: ['execution_date'] },
      { name: 'idx_status', fields: ['status'] },
      { name: 'idx_composite_order_execution', fields: ['standing_order_id', 'execution_date'] },
      { name: 'idx_processed_at', fields: ['processed_at'] }
    ],
    hooks: {
      beforeValidate: (execution) => {
        if (execution.currency) execution.currency = execution.currency.toUpperCase();
        if (execution.failureReason) execution.failureReason = execution.failureReason.trim();
        if (execution.executionNotes) execution.executionNotes = execution.executionNotes.trim();
      },
      beforeCreate: async (execution) => {
        try {
          const StandingOrder = sequelize.models.StandingOrder;
          if (StandingOrder) {
            const standingOrder = await StandingOrder.findByPk(execution.standingOrderId);
            if (standingOrder) {
              execution.standingOrderStatusAtExecution = standingOrder.status;
              if (standingOrder.status !== STANDING_ORDER_STATUS.APPROVED ||
                  (standingOrder.isActive !== undefined && !standingOrder.isActive)) {
                execution.status = EXECUTION_STATUS.SKIPPED;
                execution.executionNotes = `Skipped: Standing order status is '${standingOrder.status}'`;
                logger.info(`Auto-skipped execution for standing order ${execution.standingOrderId}`);
              }
            } else {
              execution.status = EXECUTION_STATUS.FAILED;
              execution.failureReason = 'Standing order not found';
              execution.standingOrderStatusAtExecution = STANDING_ORDER_STATUS.CANCELLED;
              logger.warn(`Standing order not found for execution ${execution.standingOrderId}`);
            }
          }
        } catch (error) {
          execution.status = EXECUTION_STATUS.FAILED;
          execution.failureReason = `Error fetching standing order: ${error.message}`;
          execution.standingOrderStatusAtExecution = STANDING_ORDER_STATUS.CANCELLED;
          logger.error(`Error in beforeCreate for execution ${execution.standingOrderId}:`, error);
        }
      },
      beforeUpdate: async (execution) => {
        // Set processed_at when status changes to SUCCESS, FAILED, or SKIPPED
        if (execution.changed('status') && 
            [EXECUTION_STATUS.SUCCESS, EXECUTION_STATUS.FAILED, EXECUTION_STATUS.SKIPPED].includes(execution.status)) {
          execution.processedAt = new Date();
        }
      },
      afterCreate: (execution) => {
        logger.info(`Standing order execution created`, {
          id: execution.id,
          standingOrderId: execution.standingOrderId,
          executionDate: execution.executionDate,
          status: execution.status,
          amount: execution.amount
        });
      },
      afterUpdate: (execution) => {
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
  }
);

export default StandingOrderExecution;
