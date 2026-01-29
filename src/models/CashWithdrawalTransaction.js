// models/CashWithdrawalTransaction.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class CashWithdrawalTransaction extends Model {}

CashWithdrawalTransaction.init(
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
      allowNull: false,
    },
    CUST_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Customer ID is required',
        },
        isInt: {
          msg: 'Customer ID must be an integer',
        },
        min: {
          args: [1],
          msg: 'Customer ID must be a positive number',
        },
      },
    },
    ACCT_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Account ID (reference to Account table)',
      validate: {
        notNull: {
          msg: 'Account ID is required',
        },
        isInt: {
          msg: 'Account ID must be an integer',
        },
      },
    },
    ACCT_NO: {
      type: DataTypes.STRING(50),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Account number is required',
        },
        notEmpty: {
          msg: 'Account number cannot be empty',
        },
        len: {
          args: [1, 50],
          msg: 'Account number must be between 1 and 50 characters',
        },
      },
    },
    ACCT_NM: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'ACCT_NM',
      validate: {
        notNull: {
          msg: 'Account name is required',
        },
        notEmpty: {
          msg: 'Account name cannot be empty',
        },
        len: {
          args: [1, 255],
          msg: 'Account name must be between 1 and 255 characters',
        },
      },
    },
    amount: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Amount is required',
        },
        min: {
          args: [0.01],
          msg: 'Amount must be a positive number',
        },
      },
      comment: 'Withdrawal amount',
    },
    TOTAL_CHARGES: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      defaultValue: 0.00,
      validate: {
        min: {
          args: [0],
          msg: 'Total charges cannot be negative',
        },
      },
    },
    VALUE_DATE: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      validate: {
        notNull: {
          msg: 'Value date is required',
        },
        isDate: {
          msg: 'Value date must be a valid date',
        },
      },
    },
    WITHDRAWER_NAME: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Withdrawer name is required',
        },
        notEmpty: {
          msg: 'Withdrawer name cannot be empty',
        },
        len: {
          args: [1, 255],
          msg: 'Withdrawer name must be between 1 and 255 characters',
        },
      },
    },
    BUSINESS_UNIT: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Business unit is required',
        },
        notEmpty: {
          msg: 'Business unit cannot be empty',
        },
        len: {
          args: [1, 100],
          msg: 'Business unit must be between 1 and 100 characters',
        },
      },
    },
    DESCRIPTION: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    SOURCE_OF_FUNDS: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Source of funds is required',
        },
        notEmpty: {
          msg: 'Source of funds cannot be empty',
        },
        len: {
          args: [1, 100],
          msg: 'Source of funds must be between 1 and 100 characters',
        },
      },
    },
    CURRENCY_COUNT: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      comment: 'JSON object storing denomination counts',
    },
    TOTAL_CURRENCY_COUNT: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: {
          args: [0],
          msg: 'Total currency count cannot be negative',
        },
      },
    },
    TRANSACTION_REF_NO: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
      validate: {
        notNull: {
          msg: 'Transaction reference number is required',
        },
        notEmpty: {
          msg: 'Transaction reference number cannot be empty',
        },
        len: {
          args: [1, 50],
          msg: 'Transaction reference number must be between 1 and 50 characters',
        },
      },
    },
    BALANCE_BEFORE_TRANSACTION: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Balance before transaction is required',
        },
        min: {
          args: [0],
          msg: 'Balance before transaction cannot be negative',
        },
      },
    },
    BALANCE_AFTER_TRANSACTION: {
      type: DataTypes.DECIMAL(15, 2),
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Balance after transaction is required',
        },
        min: {
          args: [0],
          msg: 'Balance after transaction cannot be negative',
        },
        customValidation(value) {
          if (this.amount && this.BALANCE_BEFORE_TRANSACTION) {
            const expected = this.BALANCE_BEFORE_TRANSACTION - this.amount - (this.TOTAL_CHARGES || 0);
            if (Math.abs(value - expected) > 0.01) {
              throw new Error(`Balance after transaction (${value}) doesn't match calculation (${expected})`);
            }
          }
        },
      },
    },
    WORK_ITEM_ID: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        notNull: {
          msg: 'Work item ID is required',
        },
        isInt: {
          msg: 'Work item ID must be an integer',
        },
        min: {
          args: [1],
          msg: 'Work item ID must be a positive number',
        },
      },
    },
    transactionStatus: {
      type: DataTypes.ENUM(
        'Pending Authorization',
        'Authorized',
        'Rejected',
        'Processing',
        'Completed',
        'Failed',
        'Cancelled'
      ),
      allowNull: false,
      defaultValue: 'Pending Authorization',
      validate: {
        notNull: {
          msg: 'Transaction status is required',
        },
        isIn: {
          args: [
            [
              'Pending Authorization',
              'Authorized',
              'Rejected',
              'Processing',
              'Completed',
              'Failed',
              'Cancelled',
            ],
          ],
          msg: 'Invalid transaction status',
        },
      },
    },
    
    // Virtual fields for computed properties
    net_amount: {
      type: DataTypes.VIRTUAL,
      get() {
        return this.amount + (this.TOTAL_CHARGES || 0);
      },
    },
    formatted_amount: {
      type: DataTypes.VIRTUAL,
      get() {
        return new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
        }).format(this.amount);
      },
    },
    transaction_summary: {
      type: DataTypes.VIRTUAL,
      get() {
        return {
          transaction_ref: this.TRANSACTION_REF_NO,
          account: this.ACCT_NO,
          account_name: this.ACCT_NM,
          amount: this.amount,
          status: this.transactionStatus,
          date: this.VALUE_DATE,
          business_unit: this.BUSINESS_UNIT,
        };
      },
    },
  },
  {
    sequelize,
    modelName: 'CashWithdrawalTransaction',
    tableName: 'cash_withdrawal_transactions',
    timestamps: true,
    underscored: false,
    hooks: {
      beforeValidate: (transaction) => {
        // Trim string fields
        const stringFields = [
          'ACCT_NO',
          'ACCT_NM',
          'WITHDRAWER_NAME',
          'BUSINESS_UNIT',
          'DESCRIPTION',
          'SOURCE_OF_FUNDS',
          'TRANSACTION_REF_NO',
        ];
        
        stringFields.forEach((field) => {
          if (transaction[field]) {
            transaction[field] = transaction[field].toString().trim();
          }
        });
        
        // Ensure TRANSACTION_REF_NO is uppercase
        if (transaction.TRANSACTION_REF_NO) {
          transaction.TRANSACTION_REF_NO = transaction.TRANSACTION_REF_NO.toUpperCase();
        }
        
        // Calculate BALANCE_AFTER_TRANSACTION if not provided
        if (!transaction.BALANCE_AFTER_TRANSACTION && transaction.amount && transaction.BALANCE_BEFORE_TRANSACTION) {
          transaction.BALANCE_AFTER_TRANSACTION = 
            transaction.BALANCE_BEFORE_TRANSACTION - 
            transaction.amount - 
            (transaction.TOTAL_CHARGES || 0);
        }
      },
      beforeCreate: (transaction) => {
        // Generate transaction reference if not provided
        if (!transaction.TRANSACTION_REF_NO) {
          const timestamp = Date.now();
          const random = Math.floor(Math.random() * 1000);
          transaction.TRANSACTION_REF_NO = `CWT${timestamp}${random}`;
        }
        
        // Set default VALUE_DATE to now if not provided
        if (!transaction.VALUE_DATE) {
          transaction.VALUE_DATE = new Date();
        }
      },
      beforeUpdate: (transaction) => {
        // Update BALANCE_AFTER_TRANSACTION if related fields change
        if (
          transaction.changed('amount') ||
          transaction.changed('BALANCE_BEFORE_TRANSACTION') ||
          transaction.changed('TOTAL_CHARGES')
        ) {
          transaction.BALANCE_AFTER_TRANSACTION = 
            transaction.BALANCE_BEFORE_TRANSACTION - 
            transaction.amount - 
            (transaction.TOTAL_CHARGES || 0);
        }
      },
    },
    indexes: [
      {
        unique: true,
        fields: ['TRANSACTION_REF_NO'],
        name: 'unique_transaction_ref',
      },
      {
        fields: ['CUST_ID'],
        name: 'idx_cust_id',
      },
      {
        fields: ['ACCT_NO'],
        name: 'idx_acct_no',
      },
      {
        fields: ['ACCT_ID'],
        name: 'idx_acct_id',
      },
      {
        fields: ['transactionStatus'],
        name: 'idx_transaction_status',
      },
      {
        fields: ['VALUE_DATE'],
        name: 'idx_value_date',
      },
      {
        fields: ['BUSINESS_UNIT'],
        name: 'idx_business_unit',
      },
      {
        fields: ['WORK_ITEM_ID'],
        name: 'idx_work_item_id',
      },
      {
        fields: ['createdAt'],
        name: 'idx_created_at',
      },
      {
        fields: ['CUST_ID', 'transactionStatus'],
        name: 'idx_cust_status',
      },
      {
        fields: ['ACCT_NO', 'VALUE_DATE'],
        name: 'idx_acct_date',
      },
    ],
  }
);

// === INSTANCE METHODS ===
CashWithdrawalTransaction.prototype.isPending = function () {
  return this.transactionStatus === 'Pending Authorization';
};

CashWithdrawalTransaction.prototype.isAuthorized = function () {
  return this.transactionStatus === 'Authorized';
};

CashWithdrawalTransaction.prototype.isCompleted = function () {
  return this.transactionStatus === 'Completed';
};

CashWithdrawalTransaction.prototype.canBeProcessed = function () {
  return ['Authorized', 'Processing'].includes(this.transactionStatus);
};

CashWithdrawalTransaction.prototype.getTransactionDetails = function () {
  return {
    id: this.id,
    transaction_ref: this.TRANSACTION_REF_NO,
    customer_id: this.CUST_ID,
    account_number: this.ACCT_NO,
    account_name: this.ACCT_NM,
    amount: this.amount,
    total_charges: this.TOTAL_CHARGES,
    net_amount: this.net_amount,
    value_date: this.VALUE_DATE,
    withdrawer_name: this.WITHDRAWER_NAME,
    business_unit: this.BUSINESS_UNIT,
    source_of_funds: this.SOURCE_OF_FUNDS,
    status: this.transactionStatus,
    description: this.DESCRIPTION,
    work_item_id: this.WORK_ITEM_ID,
    balance_before: this.BALANCE_BEFORE_TRANSACTION,
    balance_after: this.BALANCE_AFTER_TRANSACTION,
    currency_count: this.CURRENCY_COUNT,
    total_currency_count: this.TOTAL_CURRENCY_COUNT,
    created_at: this.createdAt,
    updated_at: this.updatedAt,
  };
};

// === STATIC METHODS ===
CashWithdrawalTransaction.findByTransactionRef = async function (transactionRef) {
  return await this.findOne({
    where: { TRANSACTION_REF_NO: transactionRef.toUpperCase() },
  });
};

CashWithdrawalTransaction.findByCustomerId = async function (customerId, options = {}) {
  const { 
    status = null, 
    startDate = null, 
    endDate = null,
    limit = 50,
    offset = 0 
  } = options;
  
  const whereClause = { CUST_ID: customerId };
  
  if (status) {
    whereClause.transactionStatus = status;
  }
  
  if (startDate || endDate) {
    whereClause.VALUE_DATE = {};
    if (startDate) whereClause.VALUE_DATE[Op.gte] = startDate;
    if (endDate) whereClause.VALUE_DATE[Op.lte] = endDate;
  }
  
  return await this.findAll({
    where: whereClause,
    limit,
    offset,
    order: [['VALUE_DATE', 'DESC']],
  });
};

CashWithdrawalTransaction.findByAccountNumber = async function (accountNumber, options = {}) {
  const { 
    status = null, 
    startDate = null, 
    endDate = null,
    limit = 50 
  } = options;
  
  const whereClause = { ACCT_NO: accountNumber };
  
  if (status) {
    whereClause.transactionStatus = status;
  }
  
  if (startDate || endDate) {
    whereClause.VALUE_DATE = {};
    if (startDate) whereClause.VALUE_DATE[Op.gte] = startDate;
    if (endDate) whereClause.VALUE_DATE[Op.lte] = endDate;
  }
  
  return await this.findAll({
    where: whereClause,
    limit,
    order: [['VALUE_DATE', 'DESC']],
  });
};

CashWithdrawalTransaction.findByBusinessUnit = async function (businessUnit, options = {}) {
  const { 
    status = null, 
    startDate = null, 
    endDate = null,
    limit = 100 
  } = options;
  
  const whereClause = { BUSINESS_UNIT: businessUnit };
  
  if (status) {
    whereClause.transactionStatus = status;
  }
  
  if (startDate || endDate) {
    whereClause.VALUE_DATE = {};
    if (startDate) whereClause.VALUE_DATE[Op.gte] = startDate;
    if (endDate) whereClause.VALUE_DATE[Op.lte] = endDate;
  }
  
  return await this.findAll({
    where: whereClause,
    limit,
    order: [['VALUE_DATE', 'DESC']],
  });
};

CashWithdrawalTransaction.updateTransactionStatus = async function (transactionRef, newStatus, updatedBy = null) {
  const validStatuses = [
    'Pending Authorization',
    'Authorized',
    'Rejected',
    'Processing',
    'Completed',
    'Failed',
    'Cancelled',
  ];
  
  if (!validStatuses.includes(newStatus)) {
    throw new Error(`Invalid status: ${newStatus}`);
  }
  
  const [affectedRows] = await this.update(
    {
      transactionStatus: newStatus,
      ...(updatedBy && { updatedBy }),
    },
    {
      where: { TRANSACTION_REF_NO: transactionRef.toUpperCase() },
    }
  );
  
  return affectedRows;
};

CashWithdrawalTransaction.createWithdrawal = async function (transactionData, transaction = null) {
  const {
    CUST_ID,
    ACCT_ID,
    ACCT_NO,
    ACCT_NM,
    amount,
    TOTAL_CHARGES = 0,
    VALUE_DATE = new Date(),
    WITHDRAWER_NAME,
    BUSINESS_UNIT,
    DESCRIPTION = '',
    SOURCE_OF_FUNDS,
    CURRENCY_COUNT = {},
    TOTAL_CURRENCY_COUNT = 0,
    TRANSACTION_REF_NO = null,
    BALANCE_BEFORE_TRANSACTION,
    BALANCE_AFTER_TRANSACTION = null,
    WORK_ITEM_ID,
    transactionStatus = 'Pending Authorization',
  } = transactionData;
  
  // Validate required fields
  if (!CUST_ID || !ACCT_ID || !ACCT_NO || !ACCT_NM || !amount || !WITHDRAWER_NAME || 
      !BUSINESS_UNIT || !SOURCE_OF_FUNDS || !BALANCE_BEFORE_TRANSACTION || !WORK_ITEM_ID) {
    throw new Error('Missing required fields');
  }
  
  if (amount <= 0) {
    throw new Error('Amount must be a positive number');
  }
  
  // Calculate balance after transaction if not provided
  const calculatedBalanceAfter = BALANCE_BEFORE_TRANSACTION - amount - TOTAL_CHARGES;
  if (calculatedBalanceAfter < 0) {
    throw new Error('Insufficient funds for withdrawal');
  }
  
  const finalBalanceAfter = BALANCE_AFTER_TRANSACTION || calculatedBalanceAfter;
  
  // Generate transaction reference if not provided
  const finalTransactionRef = TRANSACTION_REF_NO || `CWT${Date.now()}${Math.floor(Math.random() * 1000)}`;
  
  return await this.create(
    {
      CUST_ID,
      ACCT_ID,
      ACCT_NO,
      ACCT_NM,
      amount,
      TOTAL_CHARGES,
      VALUE_DATE,
      WITHDRAWER_NAME,
      BUSINESS_UNIT,
      DESCRIPTION,
      SOURCE_OF_FUNDS,
      CURRENCY_COUNT,
      TOTAL_CURRENCY_COUNT,
      TRANSACTION_REF_NO: finalTransactionRef,
      BALANCE_BEFORE_TRANSACTION,
      BALANCE_AFTER_TRANSACTION: finalBalanceAfter,
      WORK_ITEM_ID,
      transactionStatus,
    },
    { transaction }
  );
};

CashWithdrawalTransaction.getTransactionSummary = async function (businessUnit = null, startDate = null, endDate = null) {
  const whereClause = {};
  
  if (businessUnit) {
    whereClause.BUSINESS_UNIT = businessUnit;
  }
  
  if (startDate || endDate) {
    whereClause.VALUE_DATE = {};
    if (startDate) whereClause.VALUE_DATE[Op.gte] = startDate;
    if (endDate) whereClause.VALUE_DATE[Op.lte] = endDate;
  }
  
  const result = await this.findAll({
    where: whereClause,
    attributes: [
      'transactionStatus',
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.fn('SUM', sequelize.col('amount')), 'total_amount'],
      [sequelize.fn('SUM', sequelize.col('TOTAL_CHARGES')), 'total_charges'],
    ],
    group: ['transactionStatus'],
    raw: true,
  });
  
  const total = await this.count({ where: whereClause });
  const totalAmount = await this.sum('amount', { where: whereClause }) || 0;
  const totalCharges = await this.sum('TOTAL_CHARGES', { where: whereClause }) || 0;
  
  return {
    summary: result,
    totals: {
      total_transactions: total,
      total_amount: totalAmount,
      total_charges: totalCharges,
      net_amount: totalAmount + totalCharges,
    },
  };
};

// === QUERY SCOPES ===
CashWithdrawalTransaction.addScope('pending', {
  where: { transactionStatus: 'Pending Authorization' },
});

CashWithdrawalTransaction.addScope('authorized', {
  where: { transactionStatus: 'Authorized' },
});

CashWithdrawalTransaction.addScope('completed', {
  where: { transactionStatus: 'Completed' },
});

CashWithdrawalTransaction.addScope('byDateRange', (startDate, endDate) => ({
  where: {
    VALUE_DATE: {
      [Op.between]: [startDate, endDate],
    },
  },
}));

export default CashWithdrawalTransaction;
