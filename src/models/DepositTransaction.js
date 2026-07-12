// models/DepositTransaction.js – UPDATED with withdrawal support and better transaction tracking
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
      where: { 
        status: 'PENDING',
        approval_status: 'PENDING'
      },
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

  // Get transactions requiring approval
  static async getTransactionsRequiringApproval(options = {}) {
    const defaultOptions = {
      where: { 
        requires_approval: true,
        approval_status: 'PENDING'
      },
      order: [['transaction_date', 'ASC']],
      limit: options.limit || 100
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Get transactions by created_by (user)
  static async findByCreatedBy(userId, options = {}) {
    const defaultOptions = {
      where: { created_by: userId },
      order: [['transaction_date', 'DESC']],
      limit: options.limit || 100
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Get deposits only
  static async findDeposits(options = {}) {
    const defaultOptions = {
      where: { 
        transaction_type: { [Op.in]: ['DEPOSIT', 'CR'] }
      },
      order: [['transaction_date', 'DESC']],
      limit: options.limit || 100
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Get withdrawals only
  static async findWithdrawals(options = {}) {
    const defaultOptions = {
      where: { 
        transaction_type: { [Op.in]: ['WITHDRAWAL', 'DR'] }
      },
      order: [['transaction_date', 'DESC']],
      limit: options.limit || 100
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Get daily transactions for a teller
  static async findTellerDailyTransactions(userId, startDate, endDate, options = {}) {
    const defaultOptions = {
      where: {
        created_by: userId,
        transaction_date: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['transaction_date', 'DESC']],
      limit: options.limit || 200
    };
    return this.findAll({ ...defaultOptions, ...options });
  }

  // Get transaction summary for a user
  static async getUserSummary(userId, startDate, endDate) {
    const results = await this.findAll({
      where: {
        created_by: userId,
        transaction_date: {
          [Op.between]: [startDate, endDate]
        }
      },
      attributes: [
        'transaction_type',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN status = "COMPLETED" OR approval_status = "APPROVED" THEN 1 ELSE 0 END')), 'approvedCount'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN status = "PENDING_APPROVAL" OR approval_status = "PENDING" THEN 1 ELSE 0 END')), 'pendingCount']
      ],
      group: ['transaction_type'],
      raw: true
    });

    const summary = {
      totalTransactions: 0,
      totalDepositAmount: 0,
      totalWithdrawalAmount: 0,
      totalAmount: 0,
      depositCount: 0,
      withdrawalCount: 0,
      approvedCount: 0,
      pendingCount: 0,
      rejectedCount: 0
    };

    results.forEach(result => {
      const count = parseInt(result.count) || 0;
      const totalAmount = parseFloat(result.totalAmount) || 0;
      const isDeposit = result.transaction_type === 'DEPOSIT' || result.transaction_type === 'CR';
      
      if (isDeposit) {
        summary.depositCount += count;
        summary.totalDepositAmount += totalAmount;
      } else {
        summary.withdrawalCount += count;
        summary.totalWithdrawalAmount += totalAmount;
      }
      
      summary.totalTransactions += count;
      summary.totalAmount += totalAmount;
      summary.approvedCount += parseInt(result.approvedCount) || 0;
      summary.pendingCount += parseInt(result.pendingCount) || 0;
    });

    return summary;
  }

  // Approve transaction
  static async approveTransaction(transactionId, approvedBy, approvedByRole = null) {
    const transaction = await this.findByPk(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    if (transaction.status === 'COMPLETED' || transaction.approval_status === 'APPROVED') {
      throw new Error('Transaction is already approved');
    }
    
    if (transaction.status === 'REJECTED' || transaction.approval_status === 'REJECTED') {
      throw new Error('Transaction has been rejected');
    }
    
    const updateData = {
      status: 'COMPLETED',
      approval_status: 'APPROVED',
      approved_by: approvedBy,
      approved_at: new Date(),
      updated_at: new Date()
    };
    
    if (approvedByRole) {
      updateData.approved_by_role = approvedByRole;
    }
    
    return transaction.update(updateData);
  }

  // Reject transaction
  static async rejectTransaction(transactionId, rejectedBy, reason = '') {
    const transaction = await this.findByPk(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    if (transaction.status === 'REJECTED' || transaction.approval_status === 'REJECTED') {
      throw new Error('Transaction is already rejected');
    }
    
    return transaction.update({
      status: 'REJECTED',
      approval_status: 'REJECTED',
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
      requiresApproval: this.requires_approval,
      approvedByRole: this.approved_by_role,
      approvalStatus: this.approval_status,
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
      (this.status === 'PENDING' || this.approval_status === 'PENDING')
    );
  }

  // Check if transaction requires approval
  get requiresApproval() {
    return this.requires_approval === true || this.requires_approval === 1;
  }

  // Check if transaction is approved
  get isApproved() {
    return this.approval_status === 'APPROVED';
  }

  // Check if transaction is pending approval
  get isPendingApproval() {
    return this.approval_status === 'PENDING';
  }

  // Check if transaction is rejected
  get isRejected() {
    return this.approval_status === 'REJECTED';
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

  // Check if transaction is a deposit
  get isDeposit() {
    return this.transaction_type === 'DEPOSIT' || this.transaction_type === 'CR';
  }

  // Check if transaction is a withdrawal
  get isWithdrawal() {
    return this.transaction_type === 'WITHDRAWAL' || this.transaction_type === 'DR';
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
  // ==================== APPROVAL FIELDS ====================
  requires_approval: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  approved_by_role: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  approval_status: {
    type: DataTypes.STRING(20),
    defaultValue: 'PENDING',
    validate: {
      isIn: [['PENDING', 'APPROVED', 'REJECTED']]
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
  // ==================== TIMESTAMPS ====================
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
      if (!transaction.approval_status) {
        transaction.approval_status = 'PENDING';
      }
      if (transaction.requires_approval === undefined || transaction.requires_approval === null) {
        transaction.requires_approval = false;
      }
      // Set timestamps
      if (!transaction.created_at) transaction.created_at = new Date();
      if (!transaction.updated_at) transaction.updated_at = new Date();
    },
    beforeUpdate: (transaction) => {
      const now = new Date();
      
      // Handle status changes
      if (transaction.changed('status')) {
        if (transaction.status === 'COMPLETED' && !transaction.approved_at) {
          transaction.approved_at = now;
        } else if (transaction.status === 'REJECTED' && !transaction.rejected_at) {
          transaction.rejected_at = now;
        }
      }
      
      // Handle approval status changes
      if (transaction.changed('approval_status')) {
        if (transaction.approval_status === 'APPROVED' && !transaction.approved_at) {
          transaction.approved_at = now;
        } else if (transaction.approval_status === 'REJECTED' && !transaction.rejected_at) {
          transaction.rejected_at = now;
        }
      }
      
      transaction.updated_at = now;
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
    { fields: ['aml_risk_level'], name: 'idx_deposit_aml_risk_level' },
    { fields: ['requires_approval', 'approval_status'], name: 'idx_deposit_approval' },
    { fields: ['approval_status'], name: 'idx_deposit_approval_status' },
    { fields: ['approved_by_role'], name: 'idx_deposit_approved_by_role' },
    { fields: ['created_by'], name: 'idx_deposit_created_by' },
    // ✅ New index for transaction type queries
    { fields: ['transaction_type'], name: 'idx_deposit_transaction_type' },
    // ✅ New composite index for user + date queries
    { fields: ['created_by', 'transaction_date'], name: 'idx_deposit_user_date' }
  ],
  scopes: {
    pending: { where: { status: 'PENDING' } },
    completed: { where: { status: 'COMPLETED' } },
    rejected: { where: { status: 'REJECTED' } },
    pendingApproval: { where: { approval_status: 'PENDING' } },
    approved: { where: { approval_status: 'APPROVED' } },
    requiresApproval: { where: { requires_approval: true } },
    deposits: { where: { transaction_type: { [Op.in]: ['DEPOSIT', 'CR'] } } },
    withdrawals: { where: { transaction_type: { [Op.in]: ['WITHDRAWAL', 'DR'] } } },
    lowRisk: { where: { aml_risk_level: 'LOW' } },
    mediumRisk: { where: { aml_risk_level: 'MEDIUM' } },
    highRisk: { where: { aml_risk_level: 'HIGH' } },
    criticalRisk: { where: { aml_risk_level: 'CRITICAL' } },
    byBranch: (branchId) => ({ where: { branch_id: branchId } }),
    byAccount: (accountNumber) => ({ where: { account_number: accountNumber } }),
    byCustomer: (customerId) => ({ where: { customer_id: customerId } }),
    byCreator: (userId) => ({ where: { created_by: userId } }),
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