// models/GLAccountTransaction.js
import { DataTypes, Model, Op } from 'sequelize';
import sequelize from '../../config/db.js';

class GLAccountTransaction extends Model {
  // Generate a unique transaction ID
  static generateTransactionId() {
    const base = Date.now().toString();
    const random = Math.floor(1000 + Math.random() * 9000);
    return parseInt(base + random);
  }

  // Method to check if transaction is posted
  isPosted() {
    return this.STATUS === 'POSTED';
  }

  // Method to check if transaction is pending
  isPending() {
    return this.STATUS === 'PENDING';
  }

  // Method to check if transaction is reversed
  isReversed() {
    return this.STATUS === 'REVERSED';
  }

  // Method to mark transaction as posted
  markAsPosted(updatedBy) {
    this.STATUS = 'POSTED';
    this.UPDATED_BY = updatedBy;
  }

  // Method to mark transaction as pending
  markAsPending(updatedBy) {
    this.STATUS = 'PENDING';
    this.UPDATED_BY = updatedBy;
  }

  // Method to reverse transaction
  reverse(reversalNarration, reversedBy) {
    this.STATUS = 'REVERSED';
    this.NARRATION = `${this.NARRATION} [REVERSED: ${reversalNarration}]`;
    this.UPDATED_BY = reversedBy;
    this.REVERSAL_DATE = new Date();
    this.REVERSED_BY = reversedBy;
  }

  // Method to get transaction summary
  getTransactionSummary() {
    return {
      transactionId: this.TRANSACTION_ID,
      journalId: this.JOURNAL_ID,
      amount: this.AMOUNT,
      currency: this.CURRENCY_CODE,
      debitAccount: this.DR_ACCT_NO,
      creditAccount: this.CR_ACCT_NO,
      narration: this.NARRATION,
      status: this.STATUS,
      transactionType: this.TRANSACTION_TYPE,
      createdBy: this.CREATED_BY,
      createdAt: this.createdAt,
      isReversed: this.isReversed()
    };
  }

  // Static method to find by transaction ID
  static async findByTransactionId(transactionId) {
    return await this.findOne({
      where: { TRANSACTION_ID: transactionId }
    });
  }

  // Static method to find by journal ID
  static async findByJournalId(journalId) {
    return await this.findAll({
      where: { JOURNAL_ID: journalId },
      order: [['createdAt', 'DESC']]
    });
  }

  // Static method to find transactions by account number (debit or credit)
  static async findByAccount(accountNo) {
    return await this.findAll({
      where: {
        [Op.or]: [
          { DR_ACCT_NO: accountNo },
          { CR_ACCT_NO: accountNo }
        ]
      },
      order: [['createdAt', 'DESC']]
    });
  }

  // Static method to find debit transactions for an account
  static async findDebitTransactions(accountNo) {
    return await this.findAll({
      where: { DR_ACCT_NO: accountNo },
      order: [['createdAt', 'DESC']]
    });
  }

  // Static method to find credit transactions for an account
  static async findCreditTransactions(accountNo) {
    return await this.findAll({
      where: { CR_ACCT_NO: accountNo },
      order: [['createdAt', 'DESC']]
    });
  }

  // Static method to find transactions by date range
  static async findByDateRange(startDate, endDate, options = {}) {
    const where = {
      createdAt: {
        [Op.between]: [startDate, endDate]
      }
    };

    if (options.accountNo) {
      where[Op.or] = [
        { DR_ACCT_NO: options.accountNo },
        { CR_ACCT_NO: options.accountNo }
      ];
    }

    if (options.status) {
      where.STATUS = options.status;
    }

    if (options.transactionType) {
      where.TRANSACTION_TYPE = options.transactionType;
    }

    return await this.findAll({
      where,
      order: [['createdAt', 'DESC']]
    });
  }

  // Static method to get account balance
  static async getAccountBalance(accountNo, asOfDate = new Date()) {
    const transactions = await this.findAll({
      where: {
        [Op.or]: [
          { DR_ACCT_NO: accountNo },
          { CR_ACCT_NO: accountNo }
        ],
        createdAt: {
          [Op.lte]: asOfDate
        },
        STATUS: {
          [Op.ne]: 'REVERSED'
        }
      }
    });

    let balance = 0;
    transactions.forEach(transaction => {
      if (transaction.DR_ACCT_NO === accountNo) {
        balance -= parseFloat(transaction.AMOUNT);
      }
      if (transaction.CR_ACCT_NO === accountNo) {
        balance += parseFloat(transaction.AMOUNT);
      }
    });

    return {
      accountNo,
      balance: parseFloat(balance.toFixed(2)),
      asOfDate,
      transactionCount: transactions.length
    };
  }

  // Static method to get transaction statistics
  static async getTransactionStatistics(startDate, endDate) {
    const stats = await this.findAll({
      where: {
        createdAt: {
          [Op.between]: [startDate, endDate]
        }
      },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalTransactions'],
        [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount'],
        [sequelize.fn('AVG', sequelize.col('AMOUNT')), 'averageAmount'],
        [sequelize.fn('MIN', sequelize.col('AMOUNT')), 'minAmount'],
        [sequelize.fn('MAX', sequelize.col('AMOUNT')), 'maxAmount'],
        'STATUS',
        'TRANSACTION_TYPE'
      ],
      group: ['STATUS', 'TRANSACTION_TYPE'],
      raw: true
    });

    const totalStats = await this.findOne({
      where: {
        createdAt: {
          [Op.between]: [startDate, endDate]
        }
      },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalCount'],
        [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalSum']
      ],
      raw: true
    });

    return {
      period: { startDate, endDate },
      totals: {
        totalTransactions: parseInt(totalStats?.totalCount) || 0,
        totalAmount: parseFloat(totalStats?.totalSum) || 0
      },
      breakdown: stats.map(stat => ({
        status: stat.STATUS,
        transactionType: stat.TRANSACTION_TYPE,
        count: parseInt(stat.totalTransactions) || 0,
        totalAmount: parseFloat(stat.totalAmount) || 0,
        averageAmount: parseFloat(stat.averageAmount) || 0,
        minAmount: parseFloat(stat.minAmount) || 0,
        maxAmount: parseFloat(stat.maxAmount) || 0
      }))
    };
  }

  // Static method to create a double-entry transaction
  static async createDoubleEntryTransaction(transactionData) {
    const transaction = await sequelize.transaction();
    
    try {
      const { 
        journalId, 
        debitAccount, 
        creditAccount, 
        amount, 
        narration, 
        createdBy, 
        transactionType, 
        currencyCode = 'NGN' 
      } = transactionData;

      // Validate required fields
      if (!journalId || !debitAccount || !creditAccount || !amount || !narration || !createdBy) {
        throw new Error('Missing required transaction fields');
      }

      if (amount <= 0) {
        throw new Error('Transaction amount must be greater than 0');
      }

      // Generate transaction ID
      const transactionId = `TXN${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

      // Create the transaction
      const glTransaction = await this.create({
        JOURNAL_ID: journalId,
        TRANSACTION_ID: transactionId,
        DR_ACCT_NO: debitAccount,
        CR_ACCT_NO: creditAccount,
        AMOUNT: parseFloat(amount),
        NARRATION: narration,
        CREATED_BY: createdBy,
        TRANSACTION_TYPE: transactionType,
        CURRENCY_CODE: currencyCode,
        STATUS: 'POSTED',
        TransactionId: this.generateTransactionId()
      }, { transaction });

      await transaction.commit();
      return glTransaction;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // Static method to batch create transactions
  static async batchCreateTransactions(transactions, createdBy) {
    const transaction = await sequelize.transaction();
    
    try {
      const created = [];
      
      for (const tx of transactions) {
        const transactionId = `TXN${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
        
        const glTransaction = await this.create({
          JOURNAL_ID: tx.journalId,
          TRANSACTION_ID: transactionId,
          DR_ACCT_NO: tx.debitAccount,
          CR_ACCT_NO: tx.creditAccount,
          AMOUNT: parseFloat(tx.amount),
          NARRATION: tx.narration,
          CREATED_BY: createdBy,
          TRANSACTION_TYPE: tx.transactionType,
          CURRENCY_CODE: tx.currencyCode || 'NGN',
          STATUS: tx.status || 'POSTED',
          TransactionId: this.generateTransactionId()
        }, { transaction });
        
        created.push(glTransaction);
      }

      await transaction.commit();
      return created;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // Static method to find pending transactions
  static async findPendingTransactions() {
    return await this.findAll({
      where: { STATUS: 'PENDING' },
      order: [['createdAt', 'ASC']]
    });
  }

  // Static method to get transaction audit trail
  static async getTransactionAudit(transactionId) {
    const transaction = await this.findByTransactionId(transactionId);
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    // In a real implementation, you might join with an audit trail table
    // For now, return the transaction with its version history
    return {
      transaction: transaction.getTransactionSummary(),
      auditTrail: [
        {
          action: 'CREATED',
          timestamp: transaction.createdAt,
          user: transaction.CREATED_BY,
          details: 'Transaction created'
        },
        ...(transaction.isReversed() ? [{
          action: 'REVERSED',
          timestamp: transaction.REVERSAL_DATE,
          user: transaction.REVERSED_BY,
          details: 'Transaction reversed'
        }] : [])
      ]
    };
  }
}

GLAccountTransaction.init({
  JOURNAL_ID: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Journal Identifier'
  },
  TRANSACTION_ID: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    comment: 'Transaction Identifier'
  },
  DR_ACCT_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Debit Account Number'
  },
  CR_ACCT_NO: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'Credit Account Number'
  },
  AMOUNT: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    validate: {
      min: 0
    },
    comment: 'Transaction Amount'
  },
  NARRATION: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Transaction Narration'
  },
  CREATED_BY: {
    type: DataTypes.STRING(50),
    allowNull: false,
    comment: 'User who created the transaction'
  },
  UPDATED_BY: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'User who last updated the transaction'
  },
  TRANSACTION_TYPE: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'Type of transaction (e.g., PAYMENT, TRANSFER, ADJUSTMENT)'
  },
  CURRENCY_CODE: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'NGN',
    comment: 'Currency Code (ISO 4217)'
  },
  STATUS: {
    type: DataTypes.ENUM('POSTED', 'PENDING', 'REVERSED'),
    allowNull: false,
    defaultValue: 'POSTED',
    comment: 'Transaction Status'
  },
  TransactionId: {
    type: DataTypes.BIGINT,
    allowNull: false,
    unique: true,
    defaultValue: () => GLAccountTransaction.generateTransactionId(),
    comment: 'Numeric Transaction ID'
  },
  REVERSAL_DATE: {
    type: DataTypes.DATE,
    allowNull: true,
    comment: 'Date when transaction was reversed'
  },
  REVERSED_BY: {
    type: DataTypes.STRING(50),
    allowNull: true,
    comment: 'User who reversed the transaction'
  },
  REVERSAL_REASON: {
    type: DataTypes.STRING(500),
    allowNull: true,
    comment: 'Reason for reversal'
  }
}, {
  sequelize,
  modelName: 'GLAccountTransaction',
  tableName: 'gl_account_transactions',
  timestamps: true, // Adds createdAt and updatedAt
  underscored: false,
  hooks: {
    beforeCreate: (transaction, options) => {
      // Ensure TransactionId is generated if not provided
      if (!transaction.TransactionId) {
        transaction.TransactionId = GLAccountTransaction.generateTransactionId();
      }
    },
    beforeUpdate: (transaction, options) => {
      // Update UPDATED_BY if available in options
      if (options.userId) {
        transaction.UPDATED_BY = options.userId;
      }
    },
    beforeDestroy: (transaction, options) => {
      // Prevent deletion of posted transactions
      if (transaction.STATUS === 'POSTED') {
        throw new Error('Cannot delete posted transactions. Reverse them first.');
      }
    }
  },
  indexes: [
    {
      name: 'idx_gl_transactions_transaction_id',
      fields: ['TRANSACTION_ID'],
      unique: true
    },
    {
      name: 'idx_gl_transactions_journal_id',
      fields: ['JOURNAL_ID']
    },
    {
      name: 'idx_gl_transactions_debit_account',
      fields: ['DR_ACCT_NO']
    },
    {
      name: 'idx_gl_transactions_credit_account',
      fields: ['CR_ACCT_NO']
    },
    {
      name: 'idx_gl_transactions_status',
      fields: ['STATUS']
    },
    {
      name: 'idx_gl_transactions_created_at',
      fields: ['createdAt']
    },
    {
      name: 'idx_gl_transactions_transaction_id_num',
      fields: ['TransactionId'],
      unique: true
    },
    {
      name: 'idx_gl_transactions_accounts_composite',
      fields: ['DR_ACCT_NO', 'CR_ACCT_NO']
    },
    {
      name: 'idx_gl_transactions_type_status',
      fields: ['TRANSACTION_TYPE', 'STATUS']
    }
  ]
});

export default GLAccountTransaction;
