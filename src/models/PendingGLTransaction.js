// models/PendingGLTransaction.js - Corrected (removed missing columns)
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class PendingGLTransaction extends Model {}

PendingGLTransaction.init({
  JOURNAL_ID: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'JOURNAL_ID'
  },
  TRANSACTION_ID: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    field: 'TRANSACTION_ID'
  },
  GL_ACCT_NO: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'GL_ACCT_NO'
  },
  TRANSACTION_TYPE: {
    type: DataTypes.ENUM('DR', 'CR'),
    allowNull: false,
    field: 'TRANSACTION_TYPE'
  },
  AMOUNT: {
    type: DataTypes.DECIMAL(20, 8),
    allowNull: false,
    validate: { min: 0 },
    field: 'AMOUNT'
  },
  CREATED_BY: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'CREATED_BY'
  },
  SUB_LEDGER_NO: {
    type: DataTypes.STRING(10),
    defaultValue: '000',
    field: 'SUB_LEDGER_NO'
  },
  SEG_NO: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    field: 'SEG_NO'
  },
  ACCT_DESC: {
    type: DataTypes.STRING,
    field: 'ACCT_DESC'
  },
  BAL_CD: {
    type: DataTypes.STRING(10),
    defaultValue: '01',
    field: 'BAL_CD'
  },
  GL_ACCT_CAT: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'GL_ACCT_CAT'
  },
  CURRENCY_CODE: {
    type: DataTypes.STRING(10),
    defaultValue: 'NGN',
    field: 'CURRENCY_CODE'
  },
  EXCHANGE_RATE: {
    type: DataTypes.DECIMAL(10, 6),
    defaultValue: 1,
    field: 'EXCHANGE_RATE'
  },
  REFERENCE_ID: {
    type: DataTypes.STRING,
    field: 'REFERENCE_ID'
  },
  NARRATION: {
    type: DataTypes.STRING(4000),
    field: 'NARRATION'
  },
  STATUS: {
    type: DataTypes.ENUM('PENDING', 'PROCESSED', 'FAILED', 'APPROVED'),
    defaultValue: 'PENDING',
    field: 'STATUS'
  },
  errorMessage: {
    type: DataTypes.STRING(4000),
    field: 'errorMessage'
  },
  processedAt: {
    type: DataTypes.DATE,
    field: 'processedAt'
  },
  APPROVED_BY: {
    type: DataTypes.STRING,
    field: 'APPROVED_BY'
  },
  APPROVED_DATE: {
    type: DataTypes.DATE,
    field: 'APPROVED_DATE'
  },
  TRANSACTION_DATE: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    field: 'TRANSACTION_DATE'
  },

  // ==================== BALANCE TRACKING FIELDS ====================
  BALANCE_AFTER: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'BALANCE_AFTER'
  },
  LEDGER_BALANCE_AFTER: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'LEDGER_BALANCE_AFTER'
  },
  CLEARED_BALANCE_AFTER: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'CLEARED_BALANCE_AFTER'
  },
  AVAILABLE_BALANCE_AFTER: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'AVAILABLE_BALANCE_AFTER'
  },
  PREVIOUS_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'PREVIOUS_BALANCE'
  },
  PREVIOUS_LEDGER_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'PREVIOUS_LEDGER_BALANCE'
  },
  PREVIOUS_CLEARED_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'PREVIOUS_CLEARED_BALANCE'
  },
  PREVIOUS_AVAILABLE_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    field: 'PREVIOUS_AVAILABLE_BALANCE'
  },
  INWD_FUNDS_XFER_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'INWD_FUNDS_XFER_ID'
  },
  NIP_SESSION_ID: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'NIP_SESSION_ID'
  },
  XFER_REF: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'XFER_REF'
  },
  IS_REVERSAL: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'IS_REVERSAL'
  },
  ORIGINAL_TRANSACTION_ID: {
    type: DataTypes.STRING,
    allowNull: true,
    field: 'ORIGINAL_TRANSACTION_ID'
  },
  BALANCE_IMPACT: {
    type: DataTypes.JSON,
    allowNull: true,
    field: 'BALANCE_IMPACT'
  }

}, {
  sequelize,
  modelName: 'PendingGLTransaction',
  tableName: 'pending_gl_transactions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false,

  indexes: [
    { unique: true, fields: ['TRANSACTION_ID'] },
    { fields: ['JOURNAL_ID'] },
    { fields: ['STATUS'] },
    { fields: ['GL_ACCT_NO'] },
    { fields: ['TRANSACTION_DATE'] },
    { fields: ['INWD_FUNDS_XFER_ID'] },
    { fields: ['NIP_SESSION_ID'] },
    { fields: ['XFER_REF'] },
    { fields: ['IS_REVERSAL'] },
    { fields: ['BALANCE_AFTER', 'LEDGER_BALANCE_AFTER'] }
  ],

  hooks: {
    beforeCreate: (transaction) => {
      if (!transaction.TRANSACTION_ID) {
        transaction.TRANSACTION_ID = `GL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      if (transaction.STATUS === 'PROCESSED' && !transaction.processedAt) {
        transaction.processedAt = new Date();
      }
    },
    beforeUpdate: (transaction) => {
      if (transaction.changed('STATUS') && transaction.STATUS === 'PROCESSED' && !transaction.processedAt) {
        transaction.processedAt = new Date();
      }
      if (transaction.changed('STATUS') && transaction.STATUS === 'APPROVED' && !transaction.APPROVED_DATE) {
        transaction.APPROVED_DATE = new Date();
      }
    }
  }
});

// Instance methods (optional)
PendingGLTransaction.prototype.getBalanceChange = function() {
  return {
    previous: {
      current: this.PREVIOUS_BALANCE,
      ledger: this.PREVIOUS_LEDGER_BALANCE,
      cleared: this.PREVIOUS_CLEARED_BALANCE,
      available: this.PREVIOUS_AVAILABLE_BALANCE
    },
    after: {
      current: this.BALANCE_AFTER,
      ledger: this.LEDGER_BALANCE_AFTER,
      cleared: this.CLEARED_BALANCE_AFTER,
      available: this.AVAILABLE_BALANCE_AFTER
    }
  };
};

// Static methods
PendingGLTransaction.findByInwardTransferId = async function(inwdFundsXferId) {
  return this.findAll({ where: { INWD_FUNDS_XFER_ID: inwdFundsXferId }, order: [['created_at', 'ASC']] });
};

PendingGLTransaction.findByNipSessionId = async function(nipSessionId) {
  return this.findAll({ where: { NIP_SESSION_ID: nipSessionId }, order: [['created_at', 'ASC']] });
};

PendingGLTransaction.findByReference = async function(xferRef) {
  return this.findAll({ where: { XFER_REF: xferRef }, order: [['created_at', 'ASC']] });
};

export default PendingGLTransaction;
