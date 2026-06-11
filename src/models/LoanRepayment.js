// src/models/LoanRepayment.js - Converted to Class + Direct Export
import { DataTypes, Op, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class LoanRepayment extends Model {
  // ======================
  // STATIC METHODS
  // ======================

  static async findByLoanAccount(loanAccountId, options = {}) {
    const { limit, offset, startDate, endDate } = options;
    const where = { loan_account_id: loanAccountId };
    if (startDate && endDate) {
      where.repayment_date = { [Op.between]: [startDate, endDate] };
    }
    return await this.findAll({ where, order: [['repayment_date', 'DESC']], limit, offset });
  }

  static async findByLoanAccountNumber(loanAccountNumber, options = {}) {
    const { limit, offset } = options;
    return await this.findAll({
      where: { loan_account_number: loanAccountNumber },
      order: [['repayment_date', 'DESC']],
      limit,
      offset
    });
  }

  static async findByCustomerId(customerId, options = {}) {
    const { limit, offset } = options;
    return await this.findAll({
      where: { customer_id: customerId },
      order: [['repayment_date', 'DESC']],
      limit,
      offset
    });
  }

  static async getTotalRepaidForLoan(loanAccountId) {
    const result = await this.sum('total_amount', {
      where: { loan_account_id: loanAccountId, status: 'COMPLETED' }
    });
    return parseFloat(result) || 0;
  }

  static async getPrincipalRepaidForLoan(loanAccountId) {
    const result = await this.sum('principal_amount', {
      where: { loan_account_id: loanAccountId, status: 'COMPLETED' }
    });
    return parseFloat(result) || 0;
  }

  static async getInterestRepaidForLoan(loanAccountId) {
    const result = await this.sum('interest_amount', {
      where: { loan_account_id: loanAccountId, status: 'COMPLETED' }
    });
    return parseFloat(result) || 0;
  }

  static async getRepaymentSummary(loanAccountId) {
    const repayments = await this.findAll({
      where: { loan_account_id: loanAccountId, status: 'COMPLETED' },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('principal_amount')), 'total_principal'],
        [sequelize.fn('SUM', sequelize.col('interest_amount')), 'total_interest'],
        [sequelize.fn('SUM', sequelize.col('penalty_amount')), 'total_penalty'],
        [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_amount'],
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
    const where = { repayment_date: { [Op.between]: [startDate, endDate] } };
    if (options.loanAccountId) where.loan_account_id = options.loanAccountId;
    if (options.customerId) where.customer_id = options.customerId;
    if (options.status) where.status = options.status;
    return await this.findAll({ where, order: [['repayment_date', 'DESC']] });
  }

  static async getDailySummary(date) {
    const startDate = new Date(date); startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(date); endDate.setHours(23, 59, 59, 999);
    const result = await this.findAll({
      where: { repayment_date: { [Op.between]: [startDate, endDate] }, status: 'COMPLETED' },
      attributes: [
        [sequelize.fn('SUM', sequelize.col('total_amount')), 'total_collected'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'transaction_count'],
        [sequelize.fn('SUM', sequelize.col('principal_amount')), 'total_principal'],
        [sequelize.fn('SUM', sequelize.col('interest_amount')), 'total_interest'],
        [sequelize.fn('SUM', sequelize.col('penalty_amount')), 'total_penalty']
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
      where: { repayment_date: { [Op.between]: [startDate, endDate] }, status: 'COMPLETED' },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('repayment_date')), 'repayment_day'],
        [sequelize.fn('SUM', sequelize.col('total_amount')), 'daily_total'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'daily_count']
      ],
      group: [sequelize.fn('DATE', sequelize.col('repayment_date'))],
      order: [[sequelize.fn('DATE', sequelize.col('repayment_date')), 'ASC']],
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
        foreignKey: 'loan_account_id',
        as: 'loanAccount',
        targetKey: 'id'
      });
      models.LoanAccount.hasMany(LoanRepayment, {
        foreignKey: 'loan_account_id',
        as: 'repayments'
      });
      console.log('✅ LoanRepayment ↔ LoanAccount association set up');
    }
    
    if (models.Customer) {
      LoanRepayment.belongsTo(models.Customer, {
        foreignKey: 'customer_id',
        as: 'customer',
        targetKey: 'CUST_ID'
      });
      console.log('✅ LoanRepayment ↔ Customer association set up');
    }
    
    // ✅ NEW: Association with Collection (if the model exists)
    if (models.Collection) {
      LoanRepayment.belongsTo(models.Collection, {
        foreignKey: 'collection_id',
        as: 'collection',
        targetKey: 'id'
      });
      models.Collection.hasMany(LoanRepayment, {
        foreignKey: 'collection_id',
        as: 'loanRepayments'
      });
      console.log('✅ LoanRepayment ↔ Collection association set up');
    } else {
      console.log('⚠️ Collection model not found – skipping association for loan_repayments.collection_id');
    }
  }
}

// Initialize the model
LoanRepayment.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    loan_account_number: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'loan_account_number'
    },
    loan_account_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'loan_account_id',
      references: { model: 'loan_accounts', key: 'id' }
    },
    customer_id: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'customer_id'
    },
    principal_amount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      field: 'principal_amount'
    },
    interest_amount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      field: 'interest_amount'
    },
    total_amount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: false,
      field: 'total_amount'
    },
    repayment_date: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'repayment_date'
    },
    transaction_reference: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'transaction_reference'
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'COMPLETED', 'FAILED', 'REVERSED'),
      defaultValue: 'PENDING',
      field: 'status'
    },
    customer_name: {
      type: DataTypes.STRING(200),
      allowNull: true,
      field: 'customer_name'
    },
    collection_id: {
      type: DataTypes.BIGINT,        // Must match database column type
      allowNull: true,               // ✅ Allows NULL – manual repayments have no collection
      field: 'collection_id'
    },
    installment_number: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'installment_number'
    },
    penalty_amount: {
      type: DataTypes.DECIMAL(20, 2),
      allowNull: true,
      defaultValue: 0.00,
      field: 'penalty_amount'
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
      { fields: ['loan_account_id'] },
      { fields: ['loan_account_number'] },
      { fields: ['customer_id'] },
      { fields: ['repayment_date'] },
      { fields: ['status'] },
      { unique: true, fields: ['transaction_reference'] },
      { fields: ['loan_account_id', 'repayment_date'] },
      { fields: ['customer_id', 'status'] }
    ],
    hooks: {
      beforeCreate: async (repayment) => {
        if (!repayment.transaction_reference) {
          const timestamp = Date.now();
          const random = Math.floor(Math.random() * 10000);
          repayment.transaction_reference = `REPAY-${timestamp}-${random}`;
        }
      },
      afterCreate: async (repayment) => {
        try {
          const { LoanAccount } = sequelize.models;
          if (LoanAccount && repayment.status === 'COMPLETED') {
            const loanAccount = await LoanAccount.findByPk(repayment.loan_account_id);
            if (loanAccount) {
              const newOutstanding = Math.max(0,
                (parseFloat(loanAccount.OUTSTANDING_PRINCIPAL) || 0) -
                (parseFloat(repayment.principal_amount) || 0)
              );
              await loanAccount.update({
                OUTSTANDING_PRINCIPAL: newOutstanding,
                LAST_REPAYMENT_DATE: repayment.repayment_date,
                LAST_REPAYMENT_AMOUNT: repayment.total_amount
              });
            }
          }
        } catch (error) {
          console.error('Error updating loan account balance:', error.message);
        }
      }
    }
  }
);

export default LoanRepayment;