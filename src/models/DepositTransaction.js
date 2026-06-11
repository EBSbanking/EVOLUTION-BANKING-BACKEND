// models/DepositTransaction.js – corrected with explicit timestamp defaults
import { DataTypes, Model, Op } from 'sequelize';
import { sequelize } from '../../config/db.js';

class DepositTransaction extends Model {
  // ==================== STATIC METHODS ====================
  
  // Get transactions by account number
  static async findByAccountNumber(accountNumber, options = {}) {
    const defaultOptions = {
      where: { account_number: accountNumber },
      order: [['transaction_date', 'DESC']],
      limit: options.limit || 50
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Get transactions by customer ID
  static async findByCustomerId(customerId, options = {}) {
    const defaultOptions = {
      where: { customer_id: customerId },
      order: [['transaction_date', 'DESC']],
      limit: options.limit || 50
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Get transactions by branch ID
  static async findByBranchId(branchId, options = {}) {
    const defaultOptions = {
      where: { branch_id: branchId },
      order: [['transaction_date', 'DESC']],
      limit: options.limit || 50
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Get transactions by reference number
  static async findByReferenceNumber(refNo, options = {}) {
    return this.findOne({
      where: { transaction_ref_no: refNo },
      ...options
    });
  }

  // Get pending transactions
  static async getPendingTransactions(options = {}) {
    const defaultOptions = {
      where: { status: 'PENDING' },
      order: [['transaction_date', 'ASC']],
      limit: options.limit || 100
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Get transactions by AML risk level
  static async findByAMLRiskLevel(riskLevel, options = {}) {
    const defaultOptions = {
      where: { aml_risk_level: riskLevel },
      order: [['transaction_date', 'DESC']],
      limit: options.limit || 100
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Get high-risk transactions
  static async getHighRiskTransactions(options = {}) {
    const defaultOptions = {
      where: { 
        aml_risk_level: { [Op.in]: ['HIGH', 'CRITICAL'] }
      },
      order: [['transaction_date', 'DESC']],
      limit: options.limit || 100
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Approve transaction
  static async approveTransaction(transactionId, approvedBy) {
    const transaction = await this.findByPk(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    if (transaction.status !== 'PENDING') {
      throw new Error(`Transaction is already ${transaction.status}`);
    }
    
    return transaction.update({
      status: 'COMPLETED',
      approved_by: approvedBy,
      approved_at: new Date(),
      updated_at: new Date()
    });
  }

  // Reject transaction
  static async rejectTransaction(transactionId, rejectedBy, reason = '') {
    const transaction = await this.findByPk(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    if (transaction.status !== 'PENDING') {
      throw new Error(`Transaction is already ${transaction.status}`);
    }
    
    return transaction.update({
      status: 'REJECTED',
      rejected_by: rejectedBy,
      rejected_at: new Date(),
      rejection_reason: reason,
      updated_at: new Date()
    });
  }

  // Get daily summary by branch
  static async getDailySummary(branchId, date) {
    const startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date);
    endDate.setDate(endDate.getDate() + 1);

    const whereClause = {
      branch_id: branchId,
      transaction_date: {
        [Op.between]: [startDate, endDate]
      },
      status: 'COMPLETED'
    };

    const results = await this.findAll({
      where: whereClause,
      attributes: [
        'transaction_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount']
      ],
      group: ['transaction_type'],
      raw: true
    });

    const stats = {
      totalTransactions: 0,
      totalAmount: 0,
      byType: {}
    };

    results.forEach(result => {
      const count = parseInt(result.count) || 0;
      const totalAmount = parseFloat(result.totalAmount) || 0;
      
      stats.byType[result.transaction_type] = {
        count: count,
        totalAmount: totalAmount
      };
      
      stats.totalTransactions += count;
      stats.totalAmount += totalAmount;
    });

    return stats;
  }

  // Get branch statistics for date range
  static async getBranchStats(branchId, startDate, endDate) {
    const whereClause = {
      branch_id: branchId,
      transaction_date: {
        [Op.between]: [startDate, endDate]
      },
      status: 'COMPLETED'
    };

    const results = await this.findAll({
      where: whereClause,
      attributes: [
        [sequelize.fn('DATE', sequelize.col('transaction_date')), 'date'],
        'transaction_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount']
      ],
      group: [
        sequelize.fn('DATE', sequelize.col('transaction_date')),
        'transaction_type'
      ],
      order: [
        [sequelize.fn('DATE', sequelize.col('transaction_date')), 'DESC'],
        ['transaction_type', 'ASC']
      ],
      raw: true
    });

    return results.map(result => ({
      date: result.date,
      transactionType: result.transaction_type,
      count: parseInt(result.count) || 0,
      totalAmount: parseFloat(result.totalAmount) || 0
    }));
  }

  // ==================== INSTANCE METHODS ====================
  
  // Get formatted transaction
  getFormattedTransaction() {
    return {
      id: this.id,
      customerId: this.customer_id,
      accountNumber: this.account_number,
      transactionType: this.transaction_type,
      amount: this.formattedAmount,
      currency: this.currency,
      status: this.status,
      createdBy: this.created_by,
      transactionDate: this.transaction_date,
      branchId: this.branch_id,
      referenceNumber: this.transaction_ref_no,
      description: this.description,
      createdAt: this.created_at,
      updatedAt: this.updated_at,
      approvedBy: this.approved_by,
      approvedAt: this.approved_at,
      amlRiskLevel: this.aml_risk_level,
      amlRiskScore: this.aml_risk_score,
      amlIndicators: this.aml_indicators ? JSON.parse(this.aml_indicators) : []
    };
  }

  // Check if transaction is valid
  isValid() {
    return (
      this.amount > 0 &&
      this.account_number &&
      this.transaction_type &&
      this.status === 'PENDING'
    );
  }

  // Check if transaction is high risk
  get isHighRisk() {
    return this.aml_risk_level === 'HIGH' || this.aml_risk_level === 'CRITICAL';
  }

  // Check if transaction is medium risk
  get isMediumRisk() {
    return this.aml_risk_level === 'MEDIUM';
  }

  // Check if transaction is low risk
  get isLowRisk() {
    return this.aml_risk_level === 'LOW';
  }

  // ==================== VIRTUAL GETTERS ====================
  
  // Formatted amount
  get formattedAmount() {
    return parseFloat(this.amount).toLocaleString('en-NG', {
      style: 'currency',
      currency: this.currency || 'NGN',
      minimumFractionDigits: 2
    });
  }

  // Is completed?
  get isCompleted() {
    return this.status === 'COMPLETED';
  }

  // Is pending?
  get isPending() {
    return this.status === 'PENDING';
  }

  // Is rejected?
  get isRejected() {
    return this.status === 'REJECTED';
  }

  // Transaction age in hours
  get transactionAge() {
    const now = new Date();
    const transactionTime = new Date(this.transaction_date || this.created_at);
    const diffHours = Math.abs(now - transactionTime) / (1000 * 60 * 60);
    return Math.floor(diffHours);
  }
}

// ==================== MODEL INITIALIZATION ====================

DepositTransaction.init({
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  customer_id: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  account_number: {
    type: DataTypes.STRING(20),
    allowNull: true
  },
  transaction_type: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    validate: { min: 0 }
  },
  currency: {
    type: DataTypes.STRING(3),
    defaultValue: 'NGN'
  },
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'PENDING',
    validate: {
      isIn: [['PENDING', 'COMPLETED', 'REJECTED', 'FAILED']]
    }
  },
  // ==================== AML FIELDS ====================
  aml_risk_level: {
    type: DataTypes.STRING(20),
    allowNull: true,
    validate: {
      isIn: [['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']]
    }
  },
  aml_risk_score: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 0, max: 100 }
  },
  aml_indicators: {
    type: DataTypes.TEXT,
    allowNull: true,
    get() {
      const rawValue = this.getDataValue('aml_indicators');
      if (!rawValue) return [];
      try {
        return JSON.parse(rawValue);
      } catch {
        return [];
      }
    },
    set(value) {
      if (Array.isArray(value)) {
        this.setDataValue('aml_indicators', JSON.stringify(value));
      } else if (typeof value === 'string') {
        this.setDataValue('aml_indicators', value);
      } else {
        this.setDataValue('aml_indicators', '[]');
      }
    }
  },
  created_by: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  approved_by: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  approved_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  rejected_by: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  rejected_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  rejection_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  transaction_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  branch_id: {
    type: DataTypes.STRING(10),
    allowNull: true
  },
  transaction_ref_no: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: true
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // ✅ Explicit timestamp definitions with defaults (matches ALTER TABLE)
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'DepositTransaction',
  tableName: 'deposit_transactions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false,
  hooks: {
    beforeCreate: (transaction) => {
      if (!transaction.transaction_date) {
        transaction.transaction_date = new Date();
      }
      if (!transaction.status) {
        transaction.status = 'PENDING';
      }
      if (!transaction.currency) {
        transaction.currency = 'NGN';
      }
      if (!transaction.transaction_ref_no) {
        transaction.transaction_ref_no = `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      }
      if (!transaction.aml_risk_level) {
        transaction.aml_risk_level = 'LOW';
      }
      if (transaction.aml_risk_score === undefined || transaction.aml_risk_score === null) {
        transaction.aml_risk_score = 10;
      }
      if (!transaction.aml_indicators) {
        transaction.aml_indicators = '[]';
      }
      // Timestamps will be set automatically by Sequelize, but we ensure they exist
      if (!transaction.created_at) transaction.created_at = new Date();
      if (!transaction.updated_at) transaction.updated_at = new Date();
    },
    beforeUpdate: (transaction) => {
      if (transaction.changed('status')) {
        const now = new Date();
        if (transaction.status === 'COMPLETED' && !transaction.approved_at) {
          transaction.approved_at = now;
        } else if (transaction.status === 'REJECTED' && !transaction.rejected_at) {
          transaction.rejected_at = now;
        }
      }
      transaction.updated_at = new Date();
    }
  },
  indexes: [
    { fields: ['account_number'], name: 'idx_deposit_account_number' },
    { fields: ['customer_id'], name: 'idx_deposit_customer_id' },
    { fields: ['branch_id'], name: 'idx_deposit_branch_id' },
    { fields: ['status'], name: 'idx_deposit_status' },
    { fields: ['transaction_date'], name: 'idx_deposit_transaction_date' },
    { fields: ['transaction_ref_no'], name: 'idx_deposit_ref_no', unique: true },
    { fields: ['branch_id', 'transaction_date'], name: 'idx_deposit_branch_date' },
    { fields: ['status', 'transaction_date'], name: 'idx_deposit_status_date' },
    { fields: ['aml_risk_level'], name: 'idx_deposit_aml_risk_level' }
  ],
  scopes: {
    pending: { where: { status: 'PENDING' } },
    completed: { where: { status: 'COMPLETED' } },
    rejected: { where: { status: 'REJECTED' } },
    lowRisk: { where: { aml_risk_level: 'LOW' } },
    mediumRisk: { where: { aml_risk_level: 'MEDIUM' } },
    highRisk: { where: { aml_risk_level: 'HIGH' } },
    criticalRisk: { where: { aml_risk_level: 'CRITICAL' } },
    byBranch: (branchId) => ({ where: { branch_id: branchId } }),
    byAccount: (accountNumber) => ({ where: { account_number: accountNumber } }),
    byCustomer: (customerId) => ({ where: { customer_id: customerId } }),
    byDateRange: (startDate, endDate) => ({
      where: {
        transaction_date: { [Op.between]: [startDate, endDate] }
      }
    }),
    today: {
      where: {
        transaction_date: { [Op.gte]: new Date().setHours(0, 0, 0, 0) }
      }
    },
    sortedByDateDesc: { order: [['transaction_date', 'DESC']] }
  }
});

export default DepositTransaction;