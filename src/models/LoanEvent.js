// src/models/LoanEvent.js – final corrected version
import { DataTypes, Op } from 'sequelize';
import sequelize from '../../config/db.js';

const LoanEvent = sequelize.define('LoanEvent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
    field: 'id'
  },
  ACCT_NO: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'ACCT_NO'
  },
  LOAN_ACCOUNT_ID: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'LOAN_ACCOUNT_ID',
    references: { model: 'LoanAccounts', key: 'id' }
  },
  CUST_ID: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'CUST_ID'
  },
  eventType: {
    type: DataTypes.ENUM(
      'SERVICING_UPDATE', 'INSTALLMENT_PAID', 'INSTALLMENT_DUE', 'INSTALLMENT_OVERDUE',
      'LOAN_DISBURSEMENT', 'LOAN_CLOSURE', 'INTEREST_ACCRUAL', 'FEE_CHARGE',
      'STATUS_CHANGE', 'GUARANTOR_UPDATE', 'GROUP_COLLECTION'
    ),
    allowNull: false,
    field: 'eventType'
  },
  status: {
    type: DataTypes.ENUM('SERVICED', 'UNSERVICED', 'PROCESSED', 'FAILED', 'PENDING'),
    allowNull: false,
    field: 'status'
  },
  installmentNumber: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'installmentNumber'
  },
  dueDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'dueDate'
  },
  paymentDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'paymentDate'
  },
  amount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'amount'
  },
  principalAmount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'principalAmount'
  },
  interestAmount: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: false,
    defaultValue: 0.00,
    field: 'interestAmount'
  },
  transactionId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'transactionId',
    references: { model: 'Transactions', key: 'id' }
  },
  repaymentScheduleId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'repaymentScheduleId',
    references: { model: 'RepaymentSchedules', key: 'id' }
  },
  details: {
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {},
    field: 'details'
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'timestamp'
  },
  effectiveDate: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'effectiveDate'
  },
  createdBy: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'createdBy'
  },
  branchId: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'branchId'
  },
  errorMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'errorMessage'
  },
  retryCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'retryCount'
  },
  lastRetryAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'lastRetryAt'
  }
}, {
  tableName: 'loan_events',
  timestamps: true,
  createdAt: 'createdAt',      // matches column name in table
  updatedAt: 'updatedAt',      // matches column name in table
  underscored: false,          // ⬅️ prevents snake_case conversion
  getterMethods: {
    isSuccessful() {
      return this.status === 'PROCESSED' || this.status === 'SERVICED';
    },
    canRetry() {
      return this.status === 'FAILED' && this.retryCount < 3;
    }
  },
  indexes: [
    { fields: ['ACCT_NO'] },
    { fields: ['timestamp'] },
    { fields: ['ACCT_NO', 'eventType', 'timestamp'] },
    { fields: ['LOAN_ACCOUNT_ID', 'status'] },
    { fields: ['CUST_ID', 'timestamp'] },
    { fields: ['timestamp', 'status'] },
    { fields: ['eventType'] },
    { fields: ['status'] },
    { fields: ['branchId'] },
    { fields: ['createdBy'] },
    { fields: ['effectiveDate'] }
  ]
});

// Associations (unchanged)
LoanEvent.associate = (models) => {
  LoanEvent.belongsTo(models.LoanAccount, {
    foreignKey: 'LOAN_ACCOUNT_ID',
    as: 'loanAccount'
  });
  LoanEvent.belongsTo(models.Transaction, {
    foreignKey: 'transactionId',
    as: 'transaction'
  });
  LoanEvent.belongsTo(models.RepaymentSchedule, {
    foreignKey: 'repaymentScheduleId',
    as: 'repaymentSchedule'
  });
  LoanEvent.belongsTo(models.Customer, {
    foreignKey: 'CUST_ID',
    targetKey: 'CUST_ID',
    as: 'customer'
  });
  LoanEvent.belongsTo(models.User, {
    foreignKey: 'createdBy',
    as: 'creator'
  });
  LoanEvent.belongsTo(models.Branch, {
    foreignKey: 'branchId',
    as: 'branch'
  });
};

// Static methods (unchanged)
LoanEvent.findByAccountNumber = async function(accountNo, options = {}) {
  const where = { ACCT_NO: accountNo };
  if (options.eventType) where.eventType = options.eventType;
  if (options.status) where.status = options.status;
  return this.findAll({
    where,
    order: [['timestamp', 'DESC']],
    limit: options.limit || 100,
    include: options.include || []
  });
};

LoanEvent.findRecentEvents = async function(days = 7) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return this.findAll({
    where: { timestamp: { [Op.gte]: date } },
    order: [['timestamp', 'DESC']]
  });
};

LoanEvent.createServicingEvent = async function(data) {
  return this.create({
    ACCT_NO: data.ACCT_NO,
    LOAN_ACCOUNT_ID: data.LOAN_ACCOUNT_ID,
    CUST_ID: data.CUST_ID,
    eventType: data.eventType || 'SERVICING_UPDATE',
    status: data.status || 'PROCESSED',
    installmentNumber: data.installmentNumber,
    dueDate: data.dueDate,
    paymentDate: data.paymentDate,
    amount: data.amount || 0.00,
    principalAmount: data.principalAmount || 0.00,
    interestAmount: data.interestAmount || 0.00,
    transactionId: data.transactionId,
    repaymentScheduleId: data.repaymentScheduleId,
    details: data.details || {},
    createdBy: data.createdBy,
    branchId: data.branchId,
    timestamp: new Date(),
    effectiveDate: new Date()
  });
};

LoanEvent.prototype.markAsProcessed = async function() {
  this.status = 'PROCESSED';
  this.timestamp = new Date();
  return this.save();
};

LoanEvent.prototype.markAsFailed = async function(errorMessage) {
  this.status = 'FAILED';
  this.errorMessage = errorMessage;
  this.retryCount += 1;
  this.lastRetryAt = new Date();
  return this.save();
};

export default LoanEvent;