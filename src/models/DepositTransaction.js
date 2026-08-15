// models/DepositTransaction.js – FULLY UPDATED with all columns including Server Date & System Time
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

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
        [sequelize.fn('SUM', sequelize.col('emtl_amount')), 'totalEMTL'],
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
      totalEMTLAmount: 0,
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
      const totalEMTL = parseFloat(result.totalEMTL) || 0;
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
      summary.totalEMTLAmount += totalEMTL;
      summary.approvedCount += parseInt(result.approvedCount) || 0;
      summary.pendingCount += parseInt(result.pendingCount) || 0;
    });

    return summary;
  }

  // Get transactions with EMTL summary
  static async getEMTLSummary(startDate, endDate, options = {}) {
    const whereClause = {
      emtl_applicable: true,
      emtl_amount: { [Op.gt]: 0 },
      transaction_date: {
        [Op.between]: [startDate, endDate]
      }
    };

    if (options.branchId) {
      whereClause.branch_id = options.branchId;
    }

    if (options.accountNumber) {
      whereClause.account_number = options.accountNumber;
    }

    const results = await this.findAll({
      where: whereClause,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('emtl_amount')), 'totalEMTL'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalTransferAmount'],
        [sequelize.fn('AVG', sequelize.col('emtl_amount')), 'avgEMTL']
      ],
      raw: true
    });

    const summary = results[0] || {};
    return {
      totalTransactions: parseInt(summary.count) || 0,
      totalEMTL: parseFloat(summary.totalEMTL) || 0,
      totalTransferAmount: parseFloat(summary.totalTransferAmount) || 0,
      averageEMTL: parseFloat(summary.avgEMTL) || 0,
      startDate,
      endDate
    };
  }

  // Get EMTL collections by status
  static async getEMTLByStatus(status, options = {}) {
    const whereClause = {
      emtl_applicable: true,
      emtl_amount: { [Op.gt]: 0 }
    };

    if (status) {
      whereClause.emtl_remittance_status = status;
    }

    const defaultOptions = {
      where: whereClause,
      order: [['transaction_date', 'DESC']],
      limit: options.limit || 100
    };

    return this.findAll({ ...defaultOptions, ...options });
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
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
        [sequelize.fn('SUM', sequelize.col('emtl_amount')), 'totalEMTL']
      ],
      group: ['transaction_type'],
      raw: true
    });

    const stats = {
      totalTransactions: 0,
      totalAmount: 0,
      totalEMTL: 0,
      byType: {}
    };

    results.forEach(result => {
      const count = parseInt(result.count) || 0;
      const totalAmount = parseFloat(result.totalAmount) || 0;
      const totalEMTL = parseFloat(result.totalEMTL) || 0;
      
      stats.byType[result.transaction_type] = {
        count: count,
        totalAmount: totalAmount,
        totalEMTL: totalEMTL
      };
      
      stats.totalTransactions += count;
      stats.totalAmount += totalAmount;
      stats.totalEMTL += totalEMTL;
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
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
        [sequelize.fn('SUM', sequelize.col('emtl_amount')), 'totalEMTL']
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
      totalAmount: parseFloat(result.totalAmount) || 0,
      totalEMTL: parseFloat(result.totalEMTL) || 0
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
      emtlAmount: this.formattedEMTL,
      totalDebit: this.formattedTotalDebit,
      emtlApplicable: this.emtl_applicable,
      emtlReason: this.emtl_reason,
      emtlGlAccount: this.emtl_gl_account,
      emtlBeneficiary: this.emtl_beneficiary,
      emtlRemittanceStatus: this.emtl_remittance_status,
      emtlRemittanceBatchId: this.emtl_remittance_batch_id,
      emtlRemittedDate: this.emtl_remitted_date,
      emtlRemittanceReference: this.emtl_remittance_reference,
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
      amlIndicators: this.aml_indicators ? JSON.parse(this.aml_indicators) : [],
      // ? NEW FIELDS
      serverProcessingDate: this.server_processing_date,
      systemTime: this.system_time,
      systemUserId: this.system_user_id
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

  // Check if transaction has EMTL
  get hasEMTL() {
    return this.emtl_applicable === true && parseFloat(this.emtl_amount || 0) > 0;
  }

  // Check if EMTL has been remitted
  get isEMTLRemitted() {
    return this.emtl_remittance_status === 'REMITTED';
  }

  // Check if EMTL is pending remittance
  get isEMTLPending() {
    return this.emtl_remittance_status === 'PENDING' || this.emtl_remittance_status === 'PENDING_REMITTANCE';
  }

  // Check if EMTL remittance failed
  get isEMTLFailed() {
    return this.emtl_remittance_status === 'FAILED';
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

  // Formatted EMTL amount
  get formattedEMTL() {
    return parseFloat(this.emtl_amount || 0).toLocaleString('en-NG', {
      style: 'currency',
      currency: this.currency || 'NGN',
      minimumFractionDigits: 2
    });
  }

  // Formatted total debit
  get formattedTotalDebit() {
    return parseFloat(this.total_debit || 0).toLocaleString('en-NG', {
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

  // Get EMTL percentage of total
  get emtlPercentage() {
    const total = parseFloat(this.total_debit || 0);
    const emtl = parseFloat(this.emtl_amount || 0);
    if (total === 0) return 0;
    return (emtl / total) * 100;
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
  // ==================== EMTL FIELDS ====================
  emtl_amount: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0,
    validate: { min: 0 }
  },
  total_debit: {
    type: DataTypes.DECIMAL(20, 2),
    defaultValue: 0,
    validate: { min: 0 }
  },
  emtl_applicable: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  emtl_reason: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  emtl_gl_account: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  emtl_beneficiary: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  emtl_remittance_status: {
    type: DataTypes.STRING(50),
    defaultValue: 'PENDING',
    validate: {
      isIn: [['PENDING', 'PENDING_REMITTANCE', 'REMITTED', 'FAILED']]
    }
  },
  emtl_remittance_batch_id: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  emtl_remitted_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  emtl_remittance_reference: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  // ==================== END EMTL FIELDS ====================
  currency: {
    type: DataTypes.STRING(10),
    defaultValue: 'NGN'
  },
  status: {
    type: DataTypes.STRING(50),
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
    type: DataTypes.STRING(50),
    defaultValue: 'PENDING',
    validate: {
      isIn: [['PENDING', 'APPROVED', 'REJECTED']]
    }
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
  transaction_date: {
    type: DataTypes.DATE,
    allowNull: true
  },
  branch_id: {
    type: DataTypes.STRING(50),
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
  depositor_name: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  
  // ==================== ? NEW FIELDS - Server Date & System Time ====================
  server_processing_date: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Server business date when transaction was processed'
  },
  system_time: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'User local computer time when transaction was posted'
  },
  system_user_id: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'User ID who posted the transaction'
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
      // Set EMTL defaults
      if (transaction.emtl_amount === undefined || transaction.emtl_amount === null) {
        transaction.emtl_amount = 0;
      }
      if (transaction.total_debit === undefined || transaction.total_debit === null) {
        transaction.total_debit = transaction.amount || 0;
      }
      if (transaction.emtl_applicable === undefined || transaction.emtl_applicable === null) {
        transaction.emtl_applicable = false;
      }
      if (!transaction.emtl_remittance_status) {
        transaction.emtl_remittance_status = 'PENDING';
      }
      // Set timestamps
      if (!transaction.created_at) transaction.created_at = new Date();
      if (!transaction.updated_at) transaction.updated_at = new Date();
      
      // ? If server_processing_date is not set, use transaction_date
      if (!transaction.server_processing_date) {
        transaction.server_processing_date = transaction.transaction_date || new Date();
      }
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
      
      // Handle EMTL remittance status changes
      if (transaction.changed('emtl_remittance_status')) {
        if (transaction.emtl_remittance_status === 'REMITTED') {
          transaction.emtl_remitted_date = now;
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
    { fields: ['transaction_type'], name: 'idx_deposit_transaction_type' },
    { fields: ['created_by', 'transaction_date'], name: 'idx_deposit_user_date' },
    // ==================== EMTL INDEXES ====================
    { fields: ['emtl_applicable'], name: 'idx_deposit_emtl_applicable' },
    { fields: ['emtl_amount'], name: 'idx_deposit_emtl_amount' },
    { fields: ['emtl_remittance_status'], name: 'idx_deposit_emtl_remittance_status' },
    { fields: ['emtl_gl_account'], name: 'idx_deposit_emtl_gl_account' },
    { fields: ['emtl_applicable', 'emtl_remittance_status'], name: 'idx_deposit_emtl_applicable_status' },
    { fields: ['emtl_remittance_status', 'transaction_date'], name: 'idx_deposit_emtl_status_date' },
    { fields: ['emtl_remittance_batch_id'], name: 'idx_deposit_emtl_batch_id' },
    { fields: ['emtl_remitted_date'], name: 'idx_deposit_emtl_remitted_date' },
    // ==================== ? NEW INDEXES ====================
    { fields: ['server_processing_date'], name: 'idx_deposit_server_processing_date' },
    { fields: ['system_time'], name: 'idx_deposit_system_time' },
    { fields: ['system_user_id'], name: 'idx_deposit_system_user_id' }
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
    // ==================== EMTL SCOPES ====================
    withEMTL: { where: { emtl_applicable: true, emtl_amount: { [Op.gt]: 0 } } },
    emtlPending: { where: { emtl_remittance_status: 'PENDING' } },
    emtlPendingRemittance: { where: { emtl_remittance_status: 'PENDING_REMITTANCE' } },
    emtlRemitted: { where: { emtl_remittance_status: 'REMITTED' } },
    emtlFailed: { where: { emtl_remittance_status: 'FAILED' } },
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
    sortedByDateDesc: { order: [['transaction_date', 'DESC']] },
    // ==================== ? NEW SCOPES ====================
    byServerProcessingDate: (date) => ({ 
      where: { 
        server_processing_date: { 
          [Op.between]: [
            new Date(date).setHours(0, 0, 0, 0),
            new Date(date).setHours(23, 59, 59, 999)
          ]
        } 
      } 
    }),
    bySystemUser: (userId) => ({ where: { system_user_id: userId } })
  }
});

// ==================== SYNC TABLE FUNCTION ====================
DepositTransaction.ensureTable = async function() {
  try {
    // Check if table exists
    const [result] = await sequelize.query(
      `SELECT COUNT(*) as count FROM information_schema.tables 
       WHERE table_schema = DATABASE() AND table_name = 'deposit_transactions'`
    );
    
    if (result[0].count === 0) {
      console.log('?? Creating deposit_transactions table...');
      await this.sync({ force: false });
      console.log('? deposit_transactions table created');
    } else {
      // Get existing columns
      const [columns] = await sequelize.query(`SHOW COLUMNS FROM deposit_transactions`);
      const columnNames = columns.map(col => col.Field);
      
      // Define all required columns with their types - ? INCLUDING NEW FIELDS
      const requiredColumns = {
        // EMTL columns
        'emtl_amount': 'DECIMAL(20,2) DEFAULT 0.00',
        'total_debit': 'DECIMAL(20,2) DEFAULT 0.00',
        'emtl_applicable': 'BOOLEAN DEFAULT FALSE',
        'emtl_reason': 'TEXT NULL',
        'emtl_gl_account': 'VARCHAR(50) NULL',
        'emtl_beneficiary': 'VARCHAR(100) NULL',
        'emtl_remittance_status': "VARCHAR(50) DEFAULT 'PENDING'",
        'emtl_remittance_batch_id': 'VARCHAR(100) NULL',
        'emtl_remitted_date': 'DATETIME NULL',
        'emtl_remittance_reference': 'VARCHAR(100) NULL',
        
        // Approval columns
        'requires_approval': 'BOOLEAN DEFAULT FALSE',
        'approval_status': "VARCHAR(50) DEFAULT 'PENDING'",
        'approved_by_role': 'VARCHAR(100) NULL',
        'approved_by': 'VARCHAR(100) NULL',
        'approved_at': 'DATETIME NULL',
        'rejected_by': 'VARCHAR(100) NULL',
        'rejected_at': 'DATETIME NULL',
        'rejection_reason': 'TEXT NULL',
        
        // AML columns
        'aml_risk_level': "VARCHAR(20) DEFAULT 'LOW'",
        'aml_risk_score': 'INT DEFAULT 10',
        'aml_indicators': 'TEXT NULL',
        
        // Other columns
        'total_debit': 'DECIMAL(20,2) DEFAULT 0.00',
        'transaction_ref_no': 'VARCHAR(100) NULL',
        'description': 'TEXT NULL',
        'depositor_name': 'VARCHAR(255) NULL',
        
        // ? NEW FIELDS - Server Date & System Time
        'server_processing_date': 'DATETIME NULL',
        'system_time': 'DATETIME NULL',
        'system_user_id': 'VARCHAR(100) NULL'
      };
      
      // Find missing columns
      const missingColumns = [];
      for (const [col, type] of Object.entries(requiredColumns)) {
        if (!columnNames.includes(col)) {
          missingColumns.push({ col, type });
        }
      }
      
      // Add missing columns
      if (missingColumns.length > 0) {
        console.log(`?? Adding ${missingColumns.length} missing columns to deposit_transactions...`);
        
        for (const { col, type } of missingColumns) {
          try {
            await sequelize.query(`ALTER TABLE deposit_transactions ADD COLUMN ${col} ${type}`);
            console.log(`? Added column: ${col}`);
          } catch (err) {
            console.warn(`?? Could not add column ${col}:`, err.message);
          }
        }
        console.log('? All missing columns added successfully');
      } else {
        console.log('? All columns already exist');
      }
    }
    
    return true;
  } catch (error) {
    console.error('? Error ensuring deposit_transactions table:', error.message);
    return false;
  }
};

export default DepositTransaction;
