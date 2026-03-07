// models/PendingGLTransaction.js - Updated with balance tracking fields and proper field mappings
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class PendingGLTransaction extends Model {}

PendingGLTransaction.init({
  JOURNAL_ID: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'JOURNAL_ID'  // Explicitly map to uppercase column name
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
  debitAccount: {
    type: DataTypes.INTEGER,
    field: 'debitAccount',
    references: {
      model: 'GLAccounts',
      key: 'id',
    },
  },
  creditAccount: {
    type: DataTypes.INTEGER,
    field: 'creditAccount',
    references: {
      model: 'GLAccounts',
      key: 'id',
    },
  },
  
  // ==================== BALANCE TRACKING FIELDS ====================
  
  /**
   * Current balance after transaction (same as ledger_balance in CustomerAccount)
   * Represents the total book balance after this transaction
   */
  BALANCE_AFTER: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Current total balance after this transaction (book balance)',
    field: 'BALANCE_AFTER'
  },
  
  /**
   * Ledger balance after transaction
   * Official book balance including all posted transactions
   */
  LEDGER_BALANCE_AFTER: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Ledger balance after this transaction (official book balance)',
    field: 'LEDGER_BALANCE_AFTER'
  },
  
  /**
   * Cleared balance after transaction
   * Balance of fully settled/cleared funds
   */
  CLEARED_BALANCE_AFTER: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Cleared balance after this transaction (settled funds)',
    field: 'CLEARED_BALANCE_AFTER'
  },
  
  /**
   * Available balance after transaction
   * Funds available for withdrawal/use
   */
  AVAILABLE_BALANCE_AFTER: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Available balance after this transaction (withdrawable funds)',
    field: 'AVAILABLE_BALANCE_AFTER'
  },
  
  /**
   * Previous current balance before this transaction
   */
  PREVIOUS_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Previous current balance before this transaction',
    field: 'PREVIOUS_BALANCE'
  },
  
  /**
   * Previous ledger balance before this transaction
   */
  PREVIOUS_LEDGER_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Previous ledger balance before this transaction',
    field: 'PREVIOUS_LEDGER_BALANCE'
  },
  
  /**
   * Previous cleared balance before this transaction
   */
  PREVIOUS_CLEARED_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Previous cleared balance before this transaction',
    field: 'PREVIOUS_CLEARED_BALANCE'
  },
  
  /**
   * Previous available balance before this transaction
   */
  PREVIOUS_AVAILABLE_BALANCE: {
    type: DataTypes.DECIMAL(20, 2),
    allowNull: true,
    comment: 'Previous available balance before this transaction',
    field: 'PREVIOUS_AVAILABLE_BALANCE'
  },
  
  /**
   * INWD_FUNDS_XFER_ID reference (for inward transfers)
   * Links this GL transaction to the original inward funds transfer
   */
  INWD_FUNDS_XFER_ID: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'Reference to inward_funds_transfers table',
    field: 'INWD_FUNDS_XFER_ID'
  },
  
  /**
   * NIP Session ID (for NIP transactions)
   */
  NIP_SESSION_ID: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'NIP session identifier for the transaction',
    field: 'NIP_SESSION_ID'
  },
  
  /**
   * Transfer Reference
   */
  XFER_REF: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Transfer reference from original transaction',
    field: 'XFER_REF'
  },
  
  /**
   * Naration/Description
   */
  NARRATION: {
    type: DataTypes.STRING(4000),
    allowNull: true,
    comment: 'Transaction description/narration',
    field: 'NARRATION'
  },
  
  /**
   * Whether this is a reversal transaction
   */
  IS_REVERSAL: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    comment: 'Indicates if this is a reversal transaction',
    field: 'IS_REVERSAL'
  },
  
  /**
   * Reference to original transaction if this is a reversal
   */
  ORIGINAL_TRANSACTION_ID: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Original transaction ID if this is a reversal',
    field: 'ORIGINAL_TRANSACTION_ID'
  },
  
  /**
   * Balance impact summary (JSON for audit)
   */
  BALANCE_IMPACT: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: 'JSON summary of balance changes',
    field: 'BALANCE_IMPACT'
  }
  
}, {
  sequelize,
  modelName: 'PendingGLTransaction',
  tableName: 'pending_gl_transactions',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: false,  // Important: Set to false to prevent automatic underscore conversion
  
  indexes: [
    {
      unique: true,
      fields: ['TRANSACTION_ID'],
    },
    {
      fields: ['JOURNAL_ID'],
    },
    {
      fields: ['STATUS'],
    },
    {
      fields: ['GL_ACCT_NO'],
    },
    {
      fields: ['TRANSACTION_DATE'],
    },
    {
      fields: ['debitAccount'],
    },
    {
      fields: ['creditAccount'],
    },
    {
      fields: ['INWD_FUNDS_XFER_ID'],
      name: 'idx_inwd_funds_xfer_id'
    },
    {
      fields: ['NIP_SESSION_ID'],
      name: 'idx_nip_session_id'
    },
    {
      fields: ['XFER_REF'],
      name: 'idx_xfer_ref'
    },
    {
      fields: ['IS_REVERSAL'],
      name: 'idx_is_reversal'
    },
    {
      fields: ['BALANCE_AFTER', 'LEDGER_BALANCE_AFTER'],
      name: 'idx_balance_tracking'
    }
  ],
  
  // Add hooks for validation and logging
  hooks: {
    beforeCreate: (transaction) => {
      // Ensure TRANSACTION_ID is set
      if (!transaction.TRANSACTION_ID) {
        transaction.TRANSACTION_ID = `GL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      }
      
      // Set processedAt if status is PROCESSED
      if (transaction.STATUS === 'PROCESSED' && !transaction.processedAt) {
        transaction.processedAt = new Date();
      }
      
      // Validate that DR/CR transactions have appropriate balance changes
      if (transaction.TRANSACTION_TYPE === 'DR' && transaction.AMOUNT > 0) {
        // Debit should decrease balance (handled in application logic)
      }
      
      if (transaction.TRANSACTION_TYPE === 'CR' && transaction.AMOUNT > 0) {
        // Credit should increase balance (handled in application logic)
      }
    },
    
    beforeUpdate: (transaction) => {
      // Set processedAt when status changes to PROCESSED
      if (transaction.changed('STATUS') && 
          transaction.STATUS === 'PROCESSED' && 
          !transaction.processedAt) {
        transaction.processedAt = new Date();
      }
      
      // Set APPROVED_DATE when status changes to APPROVED
      if (transaction.changed('STATUS') && 
          transaction.STATUS === 'APPROVED' && 
          !transaction.APPROVED_DATE) {
        transaction.APPROVED_DATE = new Date();
      }
    },
    
    afterCreate: (transaction) => {
      // Log transaction creation for audit
      console.log(`GL Transaction created: ${transaction.TRANSACTION_ID}`, {
        type: transaction.TRANSACTION_TYPE,
        amount: transaction.AMOUNT,
        account: transaction.GL_ACCT_NO,
        status: transaction.STATUS
      });
    }
  }
});

// ==================== INSTANCE METHODS ====================

/**
 * Get balance change summary
 */
PendingGLTransaction.prototype.getBalanceChange = function() {
  const previous = {
    current: this.PREVIOUS_BALANCE,
    ledger: this.PREVIOUS_LEDGER_BALANCE,
    cleared: this.PREVIOUS_CLEARED_BALANCE,
    available: this.PREVIOUS_AVAILABLE_BALANCE
  };
  
  const after = {
    current: this.BALANCE_AFTER,
    ledger: this.LEDGER_BALANCE_AFTER,
    cleared: this.CLEARED_BALANCE_AFTER,
    available: this.AVAILABLE_BALANCE_AFTER
  };
  
  const changes = {};
  
  Object.keys(previous).forEach(key => {
    if (previous[key] !== null && after[key] !== null) {
      changes[key] = after[key] - previous[key];
    }
  });
  
  return {
    previous,
    after,
    changes,
    amount: this.AMOUNT,
    type: this.TRANSACTION_TYPE
  };
};

/**
 * Check if this transaction had sufficient balance before execution
 */
PendingGLTransaction.prototype.hadSufficientBalance = function() {
  if (this.TRANSACTION_TYPE === 'DR' && this.PREVIOUS_AVAILABLE_BALANCE !== null) {
    return this.PREVIOUS_AVAILABLE_BALANCE >= this.AMOUNT;
  }
  return true; // Credits don't need balance check
};

/**
 * Get formatted balance impact for display
 */
PendingGLTransaction.prototype.getFormattedBalanceImpact = function() {
  const balanceChange = this.getBalanceChange();
  
  return {
    transactionId: this.TRANSACTION_ID,
    type: this.TRANSACTION_TYPE,
    amount: this.AMOUNT,
    accountNumber: this.GL_ACCT_NO,
    status: this.STATUS,
    balanceImpact: {
      previous: {
        current: balanceChange.previous.current?.toFixed(2) || 'N/A',
        ledger: balanceChange.previous.ledger?.toFixed(2) || 'N/A',
        cleared: balanceChange.previous.cleared?.toFixed(2) || 'N/A',
        available: balanceChange.previous.available?.toFixed(2) || 'N/A'
      },
      after: {
        current: balanceChange.after.current?.toFixed(2) || 'N/A',
        ledger: balanceChange.after.ledger?.toFixed(2) || 'N/A',
        cleared: balanceChange.after.cleared?.toFixed(2) || 'N/A',
        available: balanceChange.after.available?.toFixed(2) || 'N/A'
      },
      netChange: {
        current: balanceChange.changes.current?.toFixed(2) || 'N/A',
        ledger: balanceChange.changes.ledger?.toFixed(2) || 'N/A',
        cleared: balanceChange.changes.cleared?.toFixed(2) || 'N/A',
        available: balanceChange.changes.available?.toFixed(2) || 'N/A'
      }
    }
  };
};

// ==================== STATIC METHODS ====================

/**
 * Find transactions by inward funds transfer ID
 */
PendingGLTransaction.findByInwardTransferId = async function(inwdFundsXferId) {
  return await this.findAll({
    where: { INWD_FUNDS_XFER_ID: inwdFundsXferId },
    order: [['created_at', 'ASC']]
  });
};

/**
 * Find transactions by NIP session ID
 */
PendingGLTransaction.findByNipSessionId = async function(nipSessionId) {
  return await this.findAll({
    where: { NIP_SESSION_ID: nipSessionId },
    order: [['created_at', 'ASC']]
  });
};

/**
 * Find transactions by reference
 */
PendingGLTransaction.findByReference = async function(xferRef) {
  return await this.findAll({
    where: { XFER_REF: xferRef },
    order: [['created_at', 'ASC']]
  });
};

/**
 * Get account balance history
 */
PendingGLTransaction.getAccountBalanceHistory = async function(glAccountNo, limit = 100) {
  return await this.findAll({
    where: { GL_ACCT_NO: glAccountNo },
    order: [['TRANSACTION_DATE', 'DESC'], ['created_at', 'DESC']],
    limit
  });
};

/**
 * Get today's transactions summary
 */
PendingGLTransaction.getTodaySummary = async function() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const transactions = await this.findAll({
    where: {
      TRANSACTION_DATE: {
        [DataTypes.Op.between]: [today, tomorrow]
      }
    }
  });
  
  const summary = {
    total: transactions.length,
    byType: {
      DR: transactions.filter(t => t.TRANSACTION_TYPE === 'DR').length,
      CR: transactions.filter(t => t.TRANSACTION_TYPE === 'CR').length
    },
    byStatus: {
      PENDING: transactions.filter(t => t.STATUS === 'PENDING').length,
      PROCESSED: transactions.filter(t => t.STATUS === 'PROCESSED').length,
      FAILED: transactions.filter(t => t.STATUS === 'FAILED').length,
      APPROVED: transactions.filter(t => t.STATUS === 'APPROVED').length
    },
    totalAmount: {
      DR: transactions
        .filter(t => t.TRANSACTION_TYPE === 'DR')
        .reduce((sum, t) => sum + parseFloat(t.AMOUNT), 0),
      CR: transactions
        .filter(t => t.TRANSACTION_TYPE === 'CR')
        .reduce((sum, t) => sum + parseFloat(t.AMOUNT), 0)
    }
  };
  
  return summary;
};

/**
 * Bulk create transactions with balance tracking
 */
PendingGLTransaction.bulkCreateWithBalances = async function(transactions, options = {}) {
  // Validate all transactions before creating
  for (const tx of transactions) {
    if (!tx.TRANSACTION_ID) {
      tx.TRANSACTION_ID = `GL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
  }
  
  return await this.bulkCreate(transactions, options);
};

// ==================== ASSOCIATIONS ====================

// Define associations
PendingGLTransaction.associate = (models) => {
  PendingGLTransaction.belongsTo(models.GLAccount, {
    foreignKey: 'debitAccount',
    as: 'debitGLAccount',
  });
  
  PendingGLTransaction.belongsTo(models.GLAccount, {
    foreignKey: 'creditAccount',
    as: 'creditGLAccount',
  });
  
  // Association with InwardFundsTransfer
  if (models.InwardFundsTransfer) {
    PendingGLTransaction.belongsTo(models.InwardFundsTransfer, {
      foreignKey: 'INWD_FUNDS_XFER_ID',
      as: 'inwardFundsTransfer',
      targetKey: 'INWD_FUNDS_XFER_ID'
    });
  }
};

export default PendingGLTransaction;