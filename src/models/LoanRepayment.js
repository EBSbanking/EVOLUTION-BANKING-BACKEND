// models/LoanRepayment.js - FIXED (removed afterCreate hook)
import { DataTypes, Op, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class LoanRepayment extends Model {
  // ======================
  // STATIC METHODS
  // ======================

  static async findByLoanAccount(loanAccountId, options = {}) {
    const { limit, offset, startDate, endDate } = options;
    const where = { loanAccountId: loanAccountId };
    if (startDate && endDate) {
      where.repaymentDate = { [Op.between]: [startDate, endDate] };
    }
    return await this.findAll({ 
      where, 
      order: [['repaymentDate', 'DESC']],
      limit, 
      offset 
    });
  }

  static async findByLoanAccountNumber(loanAccountNumber, options = {}) {
    const { limit, offset } = options;
    return await this.findAll({
      where: { loanAccountNumber: loanAccountNumber },
      order: [['repaymentDate', 'DESC']],
      limit,
      offset
    });
  }

  static async findByCustomerId(customerId, options = {}) {
    const { limit, offset } = options;
    return await this.findAll({
      where: { customerId: customerId },
      order: [['repaymentDate', 'DESC']],
      limit,
      offset
    });
  }

  static async getTotalRepaidForLoan(loanAccountId) {
    const result = await this.sum('totalAmount', {
      where: { loanAccountId: loanAccountId, status: 'COMPLETED' }
    });
    return parseFloat(result) || 0;
  }

  static async getPrincipalRepaidForLoan(loanAccountId) {
    const result = await this.sum('principalAmount', {
      where: { loanAccountId: loanAccountId, status: 'COMPLETED' }
    });
    return parseFloat(result) || 0;
  }

  static async getInterestRepaidForLoan(loanAccountId) {
    const result = await this.sum('interestAmount', {
      where: { loanAccountId: loanAccountId, status: 'COMPLETED' }
    });
    return parseFloat(result) || 0;
  }

  static async getRepaymentSummary(loanAccountId) {
    const repayments = await this.findAll({
      where: { loanAccountId: loanAccountId, status: 'COMPLETED' },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('principalAmount')), 'total_principal'],
        [sequelize.fn('SUM', sequelize.col('interestAmount')), 'total_interest'],
        [sequelize.fn('SUM', sequelize.col('penaltyAmount')), 'total_penalty'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'total_amount'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'payment_count']
      ],
      raw: true
    });
    return {
      total_principal: parseFloat(repayments[0]?.total_principal) || 0,
      total_interest: parseFloat(repayments[0]?.total_interest) || 0,
      total_penalty: parseFloat(repayments[0]?.total_penalty) || 0,
      total_amount: parseFloat(repayments[0]?.total_amount) || 0,
      payment_count: parseInt(repayments[0]?.payment_count) || 0
    };
  }

  static async findByDateRange(startDate, endDate, options = {}) {
    const where = { repaymentDate: { [Op.between]: [startDate, endDate] } };
    if (options.loanAccountId) where.loanAccountId = options.loanAccountId;
    if (options.customerId) where.customerId = options.customerId;
    if (options.status) where.status = options.status;
    return await this.findAll({ 
      where, 
      order: [['repaymentDate', 'DESC']] 
    });
  }

  static async getDailySummary(date) {
    const startDate = new Date(date); 
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date); 
    endDate.setHours(23, 59, 59, 999);
    const result = await this.findAll({
      where: { 
        repaymentDate: { [Op.between]: [startDate, endDate] }, 
        status: 'COMPLETED' 
      },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'total_collected'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'transaction_count'],
        [sequelize.fn('SUM', sequelize.col('principalAmount')), 'total_principal'],
        [sequelize.fn('SUM', sequelize.col('interestAmount')), 'total_interest'],
        [sequelize.fn('SUM', sequelize.col('penaltyAmount')), 'total_penalty']
      ],
      raw: true
    });
    return {
      date: startDate,
      total_collected: parseFloat(result[0]?.total_collected) || 0,
      transaction_count: parseInt(result[0]?.transaction_count) || 0,
      total_principal: parseFloat(result[0]?.total_principal) || 0,
      total_interest: parseFloat(result[0]?.total_interest) || 0,
      total_penalty: parseFloat(result[0]?.total_penalty) || 0
    };
  }

  static async getMonthlySummary(year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    return await this.getDailySummaryRange(startDate, endDate);
  }

  static async getDailySummaryRange(startDate, endDate) {
    const result = await this.findAll({
      where: { 
        repaymentDate: { [Op.between]: [startDate, endDate] }, 
        status: 'COMPLETED' 
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('repaymentDate')), 'repayment_day'],
        [sequelize.fn('SUM', sequelize.col('totalAmount')), 'daily_total'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'daily_count']
      ],
      group: [sequelize.fn('DATE', sequelize.col('repaymentDate'))],
      order: [[sequelize.fn('DATE', sequelize.col('repaymentDate')), 'ASC']],
      raw: true
    });
    return result.map(day => ({
      date: day.repayment_day,
      total_collected: parseFloat(day.daily_total) || 0,
      transaction_count: parseInt(day.daily_count) || 0
    }));
  }

  // ======================
  // ASSOCIATION SETUP
  // ======================
  static setupAssociations(models) {
    if (models.LoanAccount) {
      LoanRepayment.belongsTo(models.LoanAccount, {
        foreignKey: 'loanAccountId',
        as: 'loanAccount',
        targetKey: 'id'
      });
      models.LoanAccount.hasMany(LoanRepayment, {
        foreignKey: 'loanAccountId',
        as: 'repayments'
      });
      console.log('? LoanRepayment ? LoanAccount association set up');
    }
    
    if (models.Customer) {
      LoanRepayment.belongsTo(models.Customer, {
        foreignKey: 'customerId',
        as: 'customer',
        targetKey: 'CUST_ID'
      });
      console.log('? LoanRepayment ? Customer association set up');
    }
    
    if (models.Collection) {
      LoanRepayment.belongsTo(models.Collection, {
        foreignKey: 'collectionId',
        as: 'collection',
        targetKey: 'id'
      });
      models.Collection.hasMany(LoanRepayment, {
        foreignKey: 'collectionId',
        as: 'loanRepayments'
      });
      console.log('? LoanRepayment ? Collection association set up');
    } else {
      console.log('?? Collection model not found – skipping association for loan_repayments.collectionId');
    }
  }

  // ======================
  // INSTANCE METHODS
  // ======================
  
  isOverdue() {
    if (this.status === 'COMPLETED') return false;
    return new Date(this.repaymentDate) < new Date();
  }

  getDaysOverdue() {
    if (!this.isOverdue()) return 0;
    const diff = new Date() - new Date(this.repaymentDate);
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  canProcess() {
    return this.status === 'PENDING' || this.status === 'SCHEDULED';
  }

  async markAsProcessed(transaction = null) {
    this.status = 'COMPLETED';
    await this.save({ transaction });
  }

  async markAsFailed(reason, transaction = null) {
    this.status = 'FAILED';
    await this.save({ transaction });
  }
}

// ======================
// MODEL INITIALIZATION
// ======================
LoanRepayment.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      field: 'id'
    },
    collectionId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'collectionId',
      references: { model: 'collections', key: 'id' }
    },
    loanAccountId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'loanAccountId',
      references: { model: 'loan_accounts', key: 'id' }
    },
    loanAccountNumber: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'loanAccountNumber'
    },
    customerId: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'customerId'
    },
    customerName: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'customerName'
    },
    principalAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      field: 'principalAmount'
    },
    interestAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      field: 'interestAmount'
    },
    penaltyAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      field: 'penaltyAmount'
    },
    totalAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      field: 'totalAmount'
    },
    installmentNumber: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'installmentNumber'
    },
    repaymentDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'repaymentDate'
    },
    transactionReference: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'transactionReference'
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'SCHEDULED', 'COMPLETED', 'FAILED', 'REVERSED'),
      defaultValue: 'PENDING',
      field: 'status'
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    },
    updated_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'updated_at'
    }
  },
  {
    sequelize,
    modelName: 'LoanRepayment',
    tableName: 'loan_repayments',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
      { fields: ['loanAccountId'] },
      { fields: ['customerId'] },
      { fields: ['repaymentDate'] },
      { fields: ['status'] },
      { unique: true, fields: ['transactionReference'] },
      { fields: ['loanAccountId', 'repaymentDate'] },
      { fields: ['customerId', 'status'] },
      { fields: ['status', 'repaymentDate'] }
    ],
    hooks: {
      beforeCreate: async (repayment) => {
        if (!repayment.transactionReference) {
          const timestamp = Date.now();
          const random = Math.floor(Math.random() * 10000);
          repayment.transactionReference = `REPAY-${timestamp}-${random}`;
        }
        
        // Auto-fill loanAccountNumber if not provided
        if (!repayment.loanAccountNumber && repayment.loanAccountId) {
          try {
            const { LoanAccount } = sequelize.models;
            if (LoanAccount) {
              const loanAccount = await LoanAccount.findByPk(repayment.loanAccountId);
              if (loanAccount) {
                repayment.loanAccountNumber = loanAccount.ACCT_NO || 
                                              loanAccount.acct_no || 
                                              loanAccount.account_number || 
                                              null;
              }
            }
          } catch (error) {
            console.error('Error fetching loan account for loanAccountNumber:', error.message);
          }
        }
        
        // Ensure totalAmount is set
        if (!repayment.totalAmount || repayment.totalAmount === 0) {
          repayment.totalAmount = (parseFloat(repayment.principalAmount) || 0) + 
                                  (parseFloat(repayment.interestAmount) || 0) +
                                  (parseFloat(repayment.penaltyAmount) || 0);
        }
      }
      // ? REMOVED afterCreate hook - causes lock timeout
    }
  }
);

export default LoanRepayment;
