// models/LoanRepaymentTransaction.js - COMPLETELY CLEAN (normal names, no ugly fields)
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

class LoanRepaymentTransaction extends Model {}

LoanRepaymentTransaction.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    accountId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    accountNumber: {
      type: DataTypes.STRING(50),
      allowNull: false,
      trim: true
    },
    customerId: {
      type: DataTypes.STRING(50),
      allowNull: false,
      trim: true
    },
    transactionDate: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    transactionType: {
      type: DataTypes.ENUM('REPAYMENT', 'INTEREST', 'PENALTY'),
      allowNull: false,
      defaultValue: 'REPAYMENT'
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: { min: 0 }
    },
    principalAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: { min: 0 }
    },
    interestAmount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: { min: 0 }
    },
    paymentMethod: {
      type: DataTypes.ENUM('CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY'),
      allowNull: false,
      defaultValue: 'CASH'
    },
    transactionReference: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      trim: true
    },
    repaymentType: {
      type: DataTypes.ENUM('INTEREST_FIRST', 'PRINCIPAL_FIRST', 'REPAYMENT', 'FULL_PAYMENT', 'PARTIAL_PAYMENT', 'LOAN'),
      defaultValue: 'REPAYMENT'
    },
    isInstallment: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    createdBy: {
      type: DataTypes.STRING(100),
      allowNull: false,
      trim: true
    },
    status: {
      type: DataTypes.ENUM('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'),
      defaultValue: 'COMPLETED'
    },
    receiptNo: {
      type: DataTypes.STRING(50),
      trim: true
    },
    branchCode: {
      type: DataTypes.STRING(10),
      defaultValue: '001'
    },
    productCode: {
      type: DataTypes.STRING(20),
      defaultValue: 'DEFAULT'
    },
    notes: {
      type: DataTypes.TEXT,
      trim: true
    },
    approvedBy: {
      type: DataTypes.STRING(100),
      trim: true
    },
    approvalDate: {
      type: DataTypes.DATE
    },
    reversalTransactionId: {
      type: DataTypes.INTEGER
    },
    isReversed: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    reversalDate: {
      type: DataTypes.DATE
    },
    reversalReason: {
      type: DataTypes.TEXT,
      trim: true
    },
    glPosted: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    glPostingDate: {
      type: DataTypes.DATE
    },
    glTransactionId: {
      type: DataTypes.STRING(100),
      trim: true
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW
    }
  },
  {
    sequelize,
    modelName: 'LoanRepaymentTransaction',
    tableName: 'loan_repayment_transactions',   // rename your table if needed
    timestamps: true,
    indexes: [
      { name: 'idx_acct_no_tx_date', fields: ['accountNumber', 'transactionDate'] },
      { name: 'idx_customer_id_tx_date', fields: ['customerId', 'transactionDate'] },
      { name: 'idx_transaction_reference', fields: ['transactionReference'], unique: true },
      { name: 'idx_transaction_date', fields: ['transactionDate'] },
      { name: 'idx_account_id', fields: ['accountId'] },
      { name: 'idx_status', fields: ['status'] },
      { name: 'idx_branch_code', fields: ['branchCode'] },
      { name: 'idx_product_code', fields: ['productCode'] },
      { name: 'idx_transaction_type', fields: ['transactionType'] },
      { name: 'idx_payment_method', fields: ['paymentMethod'] },
      { name: 'idx_receipt_no', fields: ['receiptNo'] },
      { name: 'idx_created_by', fields: ['createdBy'] }
    ],
    hooks: {
      beforeCreate: async (transaction) => {
        if (!transaction.transactionReference || transaction.transactionReference.trim() === '') {
          const timestamp = Date.now();
          const random = Math.random().toString(36).substr(2, 9).toUpperCase();
          transaction.transactionReference = `TXN-${timestamp}-${random}`;
        }
        if (!transaction.receiptNo && transaction.status === 'COMPLETED') {
          const date = new Date();
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
          transaction.receiptNo = `RCPT-${year}${month}${day}-${randomNum}`;
        }
        const total = (parseFloat(transaction.principalAmount) || 0) + 
                      (parseFloat(transaction.interestAmount) || 0);
        const txAmount = parseFloat(transaction.amount) || 0;
        if (Math.abs(total - txAmount) > 0.01) {
          throw new Error(`Transaction amount (${txAmount}) does not match principal + interest (${total})`);
        }
      },
      beforeUpdate: async (transaction) => {
        if (transaction.status === 'COMPLETED' && transaction.changed('amount')) {
          throw new Error('Cannot modify amount of a completed transaction');
        }
        if (transaction.changed('status') && transaction.status === 'CANCELLED' && 
            transaction.previous('status') === 'COMPLETED') {
          transaction.isReversed = true;
          transaction.reversalDate = new Date();
        }
        if (transaction.changed('status') && transaction.status === 'COMPLETED' && 
            transaction.approvedBy && !transaction.approvalDate) {
          transaction.approvalDate = new Date();
        }
      }
    },
    getterMethods: {
      totalAmount() {
        const principal = parseFloat(this.principalAmount) || 0;
        const interest = parseFloat(this.interestAmount) || 0;
        return (principal + interest).toFixed(2);
      },
      transactionDateFormatted() {
        return this.transactionDate.toISOString().split('T')[0];
      },
      isFullyPaid() {
        const amount = parseFloat(this.amount) || 0;
        const principal = parseFloat(this.principalAmount) || 0;
        const interest = parseFloat(this.interestAmount) || 0;
        return Math.abs(amount - (principal + interest)) < 0.01;
      }
    }
  }
);

// ======================
// INSTANCE METHODS
// ======================

LoanRepaymentTransaction.prototype.formatForResponse = function() {
  const response = {
    id: this.id,
    accountId: this.accountId,
    accountNumber: this.accountNumber,
    customerId: this.customerId,
    transactionDate: this.transactionDate,
    transactionDateFormatted: this.transactionDateFormatted,
    transactionType: this.transactionType,
    amount: parseFloat(this.amount),
    principalAmount: parseFloat(this.principalAmount),
    interestAmount: parseFloat(this.interestAmount),
    totalAmount: parseFloat(this.totalAmount),
    paymentMethod: this.paymentMethod,
    transactionReference: this.transactionReference,
    repaymentType: this.repaymentType,
    isInstallment: this.isInstallment,
    createdBy: this.createdBy,
    status: this.status,
    receiptNo: this.receiptNo,
    branchCode: this.branchCode,
    productCode: this.productCode,
    notes: this.notes,
    approvedBy: this.approvedBy,
    approvalDate: this.approvalDate,
    isReversed: this.isReversed,
    reversalDate: this.reversalDate,
    reversalReason: this.reversalReason,
    glPosted: this.glPosted,
    glPostingDate: this.glPostingDate,
    glTransactionId: this.glTransactionId,
    isFullyPaid: this.isFullyPaid,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt
  };
  if (this.LoanAccount) {
    response.loanAccount = {
      id: this.LoanAccount.id,
      accountNumber: this.LoanAccount.accountNumber,
      accountName: this.LoanAccount.accountName,
      customerName: this.LoanAccount.customerName,
      productCode: this.LoanAccount.productCode,
      branchCode: this.LoanAccount.branchCode
    };
  }
  return response;
};

LoanRepaymentTransaction.prototype.markAsReversed = async function(reversalReason, reversedBy, transaction = null) {
  await this.update({
    isReversed: true,
    reversalDate: new Date(),
    reversalReason: reversalReason,
    status: 'CANCELLED'
  }, { transaction });
  return this;
};

// ======================
// CLASS METHODS
// ======================

LoanRepaymentTransaction.findByAccountNumber = function(accountNo, options = {}) {
  const { startDate, endDate, status, limit = 50, offset = 0 } = options;
  const where = { accountNumber: accountNo };
  if (startDate || endDate) {
    where.transactionDate = {};
    if (startDate) where.transactionDate[Op.gte] = new Date(startDate);
    if (endDate) where.transactionDate[Op.lte] = new Date(endDate);
  }
  if (status) where.status = status;
  return this.findAll({
    where,
    include: [{
      model: sequelize.models.LoanAccount,
      as: 'LoanAccount',
      attributes: ['id', 'accountNumber', 'accountName', 'customerName', 'productCode', 'branchCode']
    }],
    order: [['transactionDate', 'DESC']],
    limit,
    offset
  });
};

LoanRepaymentTransaction.findByCustomerId = function(customerId, options = {}) {
  const { startDate, endDate, status, limit = 50, offset = 0 } = options;
  const where = { customerId };
  if (startDate || endDate) {
    where.transactionDate = {};
    if (startDate) where.transactionDate[Op.gte] = new Date(startDate);
    if (endDate) where.transactionDate[Op.lte] = new Date(endDate);
  }
  if (status) where.status = status;
  return this.findAll({
    where,
    include: [{
      model: sequelize.models.LoanAccount,
      as: 'LoanAccount',
      attributes: ['id', 'accountNumber', 'accountName', 'customerName', 'productCode', 'branchCode']
    }],
    order: [['transactionDate', 'DESC']],
    limit,
    offset
  });
};

LoanRepaymentTransaction.getAccountSummary = async function(accountNo) {
  const result = await this.findAll({
    where: {
      accountNumber: accountNo,
      status: 'COMPLETED'
    },
    attributes: [
      [sequelize.fn('SUM', sequelize.col('amount')), 'total_paid'],
      [sequelize.fn('SUM', sequelize.col('principalAmount')), 'total_principal_paid'],
      [sequelize.fn('SUM', sequelize.col('interestAmount')), 'total_interest_paid'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'transaction_count'],
      [sequelize.fn('MAX', sequelize.col('transactionDate')), 'last_payment_date']
    ],
    raw: true
  });
  const summary = result[0] || {};
  return {
    totalPaid: parseFloat(summary.total_paid) || 0,
    totalPrincipalPaid: parseFloat(summary.total_principal_paid) || 0,
    totalInterestPaid: parseFloat(summary.total_interest_paid) || 0,
    transactionCount: parseInt(summary.transaction_count) || 0,
    lastPaymentDate: summary.last_payment_date
  };
};

LoanRepaymentTransaction.getDailySummary = async function(date) {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(date);
  endDate.setHours(23, 59, 59, 999);
  const result = await this.findAll({
    where: {
      transactionDate: { [Op.between]: [startDate, endDate] },
      status: 'COMPLETED'
    },
    attributes: [
      'branchCode',
      'paymentMethod',
      [sequelize.fn('COUNT', sequelize.col('id')), 'transaction_count'],
      [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
      [sequelize.fn('SUM', sequelize.col('principalAmount')), 'total_principal'],
      [sequelize.fn('SUM', sequelize.col('interestAmount')), 'total_interest']
    ],
    group: ['branchCode', 'paymentMethod'],
    order: [['branchCode', 'ASC'], ['paymentMethod', 'ASC']],
    raw: true
  });
  return result.map(row => ({
    branchCode: row.branchCode,
    paymentMethod: row.paymentMethod,
    transactionCount: parseInt(row.transaction_count) || 0,
    totalAmount: parseFloat(row.total_amount) || 0,
    totalPrincipal: parseFloat(row.total_principal) || 0,
    totalInterest: parseFloat(row.total_interest) || 0
  }));
};

LoanRepaymentTransaction.createReversal = async function(transactionId, reversalData, transaction = null) {
  const original = await this.findByPk(transactionId, { transaction });
  if (!original) throw new Error('Original transaction not found');
  if (original.isReversed) throw new Error('Transaction is already reversed');

  const reversal = await this.create({
    accountId: original.accountId,
    accountNumber: original.accountNumber,
    customerId: original.customerId,
    transactionDate: new Date(),
    transactionType: original.transactionType,
    amount: -original.amount,
    principalAmount: -original.principalAmount,
    interestAmount: -original.interestAmount,
    paymentMethod: original.paymentMethod,
    transactionReference: `REV-${original.transactionReference}-${Date.now()}`,
    repaymentType: original.repaymentType,
    isInstallment: original.isInstallment,
    createdBy: reversalData.createdBy || 'SYSTEM',
    status: 'COMPLETED',
    notes: `Reversal of ${original.transactionReference}: ${reversalData.reason}`,
    reversalTransactionId: original.id,
    branchCode: original.branchCode,
    productCode: original.productCode
  }, { transaction });

  await original.markAsReversed(reversalData.reason, reversalData.createdBy, transaction);
  return reversal;
};

// ======================
// ASSOCIATIONS SETUP
// ======================

export function setupLoanRepaymentTransactionAssociations() {
  const { LoanAccount } = sequelize.models;
  LoanRepaymentTransaction.belongsTo(LoanAccount, {
    foreignKey: 'accountId',
    as: 'LoanAccount',
    onDelete: 'RESTRICT',
    onUpdate: 'CASCADE'
  });
  LoanAccount.hasMany(LoanRepaymentTransaction, {
    foreignKey: 'accountId',
    as: 'Transactions'
  });
  LoanRepaymentTransaction.belongsTo(LoanRepaymentTransaction, {
    foreignKey: 'reversalTransactionId',
    as: 'OriginalTransaction',
    onDelete: 'SET NULL',
    onUpdate: 'CASCADE'
  });
  LoanRepaymentTransaction.hasMany(LoanRepaymentTransaction, {
    foreignKey: 'reversalTransactionId',
    as: 'ReversalTransactions'
  });
}

export default LoanRepaymentTransaction;