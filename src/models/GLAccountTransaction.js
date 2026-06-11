// models/GLAccountTransaction.js - Converted to Class + Direct Export
// Updated: TransactionId is now AUTO_INCREMENT PRIMARY KEY
import { DataTypes, Op, Model } from 'sequelize';
import sequelize from '../../config/db.js';

// Helper function to update a single GL account balance
async function updateLedgerBalance(accountNo, side, amount, operation = 'add', transaction) {
  if (!accountNo) return;

  const Ledger = sequelize.models.Ledger;
  if (!Ledger) {
    throw new Error('Ledger model not registered yet');
  }

  const ledger = await Ledger.findOne({
    where: { GL_ACCT_NO: accountNo },
    lock: transaction.LOCK.UPDATE,
    transaction
  });
  if (!ledger) {
    throw new Error(`GL Account ${accountNo} not found in Ledger`);
  }

  let delta = 0;
  const isDebit = side === 'DR';
  const category = ledger.GL_ACCT_CAT;

  if (isDebit) {
    if (category === 'ASSET' || category === 'EXPENSE') delta = amount;
    else if (category === 'LIABILITY' || category === 'EQUITY' || category === 'REVENUE') delta = -amount;
  } else {
    if (category === 'LIABILITY' || category === 'EQUITY' || category === 'REVENUE') delta = amount;
    else if (category === 'ASSET' || category === 'EXPENSE') delta = -amount;
  }

  if (operation === 'subtract') delta = -delta;

  if (delta !== 0) {
    await ledger.update({
      LEDGER_BALANCE: sequelize.literal(`LEDGER_BALANCE + ${delta}`),
      CURRENT_BALANCE: sequelize.literal(`CURRENT_BALANCE + ${delta}`),
      AVAILABLE_BALANCE: sequelize.literal(`AVAILABLE_BALANCE + ${delta}`),
      updated_at: new Date()
    }, { transaction });
  }
}

class GLAccountTransaction extends Model {
  // Generate a unique transaction ID (only for TRANSACTION_ID string field, not for auto-increment TransactionId)
  static generateTransactionId() {
    const base = Date.now().toString();
    const random = Math.floor(1000 + Math.random() * 9000);
    return parseInt(base + random);
  }

  isPosted() { return this.STATUS === 'POSTED'; }
  isPending() { return this.STATUS === 'PENDING'; }
  isReversed() { return this.STATUS === 'REVERSED'; }

  markAsPosted(updatedBy) {
    this.STATUS = 'POSTED';
    this.UPDATED_BY = updatedBy;
  }

  markAsPending(updatedBy) {
    this.STATUS = 'PENDING';
    this.UPDATED_BY = updatedBy;
  }

  reverse(reversalNarration, reversedBy) {
    this.STATUS = 'REVERSED';
    this.NARRATION = `${this.NARRATION} [REVERSED: ${reversalNarration}]`;
    this.UPDATED_BY = reversedBy;
    this.REVERSAL_DATE = new Date();
    this.REVERSED_BY = reversedBy;
  }

  getTransactionSummary() {
    return {
      transactionId: this.TransactionId,   // auto-increment numeric ID
      transactionRef: this.TRANSACTION_ID, // original string reference
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

  static async findByTransactionId(transactionId) {
    return await this.findOne({ where: { TransactionId: transactionId } });
  }

  static async findByJournalId(journalId) {
    return await this.findAll({
      where: { JOURNAL_ID: journalId },
      order: [['createdAt', 'DESC']]
    });
  }

  static async findByAccount(accountNo) {
    return await this.findAll({
      where: { [Op.or]: [{ DR_ACCT_NO: accountNo }, { CR_ACCT_NO: accountNo }] },
      order: [['createdAt', 'DESC']]
    });
  }

  static async findDebitTransactions(accountNo) {
    return await this.findAll({
      where: { DR_ACCT_NO: accountNo },
      order: [['createdAt', 'DESC']]
    });
  }

  static async findCreditTransactions(accountNo) {
    return await this.findAll({
      where: { CR_ACCT_NO: accountNo },
      order: [['createdAt', 'DESC']]
    });
  }

  static async findByDateRange(startDate, endDate, options = {}) {
    const where = { createdAt: { [Op.between]: [startDate, endDate] } };
    if (options.accountNo) {
      where[Op.or] = [{ DR_ACCT_NO: options.accountNo }, { CR_ACCT_NO: options.accountNo }];
    }
    if (options.status) where.STATUS = options.status;
    if (options.transactionType) where.TRANSACTION_TYPE = options.transactionType;
    return await this.findAll({ where, order: [['createdAt', 'DESC']] });
  }

  static async getAccountBalance(accountNo, asOfDate = new Date()) {
    const transactions = await this.findAll({
      where: {
        [Op.or]: [{ DR_ACCT_NO: accountNo }, { CR_ACCT_NO: accountNo }],
        createdAt: { [Op.lte]: asOfDate },
        STATUS: { [Op.ne]: 'REVERSED' }
      }
    });
    let balance = 0;
    transactions.forEach(tx => {
      if (tx.DR_ACCT_NO === accountNo) balance -= parseFloat(tx.AMOUNT);
      if (tx.CR_ACCT_NO === accountNo) balance += parseFloat(tx.AMOUNT);
    });
    return { accountNo, balance: parseFloat(balance.toFixed(2)), asOfDate, transactionCount: transactions.length };
  }

  static async getTransactionStatistics(startDate, endDate) {
    const stats = await this.findAll({
      where: { createdAt: { [Op.between]: [startDate, endDate] } },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalTransactions'],
        [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount'],
        [sequelize.fn('AVG', sequelize.col('AMOUNT')), 'averageAmount'],
        [sequelize.fn('MIN', sequelize.col('AMOUNT')), 'minAmount'],
        [sequelize.fn('MAX', sequelize.col('AMOUNT')), 'maxAmount'],
        'STATUS', 'TRANSACTION_TYPE'
      ],
      group: ['STATUS', 'TRANSACTION_TYPE'],
      raw: true
    });
    const totalStats = await this.findOne({
      where: { createdAt: { [Op.between]: [startDate, endDate] } },
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

  static async createDoubleEntryTransaction(transactionData) {
    const transaction = await sequelize.transaction();
    try {
      const { journalId, debitAccount, creditAccount, amount, narration, createdBy, transactionType, currencyCode = 'NGN' } = transactionData;
      if (!journalId || !debitAccount || !creditAccount || !amount || !narration || !createdBy)
        throw new Error('Missing required transaction fields');
      if (amount <= 0) throw new Error('Transaction amount must be greater than 0');

      // Generate a unique string reference (TRANSACTION_ID)
      const transactionId = `TXN${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

      // Do NOT set TransactionId - it will be auto-generated by the database
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
        STATUS: 'POSTED'
      }, { transaction });

      await transaction.commit();
      return glTransaction;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

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
          STATUS: tx.status || 'POSTED'
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

  static async findPendingTransactions() {
    return await this.findAll({ where: { STATUS: 'PENDING' }, order: [['createdAt', 'ASC']] });
  }

  static async getTransactionAudit(transactionId) {
    const transaction = await this.findByTransactionId(transactionId);
    if (!transaction) throw new Error('Transaction not found');
    return {
      transaction: transaction.getTransactionSummary(),
      auditTrail: [
        { action: 'CREATED', timestamp: transaction.createdAt, user: transaction.CREATED_BY, details: 'Transaction created' },
        ...(transaction.isReversed() ? [{ action: 'REVERSED', timestamp: transaction.REVERSAL_DATE, user: transaction.REVERSED_BY, details: 'Transaction reversed' }] : [])
      ]
    };
  }
}

GLAccountTransaction.init(
  {
    // ==================== AUTO-INCREMENT PRIMARY KEY ====================
    TransactionId: {
      type: DataTypes.BIGINT,        // matches BIGINT from ALTER TABLE
      autoIncrement: true,
      primaryKey: true,
      allowNull: false,
      comment: 'Auto-increment numeric transaction ID'
    },
    JOURNAL_ID: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Journal Identifier'
    },
    TRANSACTION_ID: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      comment: 'Transaction Identifier (string reference)'
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
      validate: { min: 0 },
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
  },
  {
    sequelize,
    modelName: 'GLAccountTransaction',
    tableName: 'gl_account_transactions',
    timestamps: true,
    underscored: false,    // timestamps are createdAt/updatedAt (camelCase)
    hooks: {
      beforeCreate: (transaction, options) => {
        // TransactionId is auto-increment, do not set it
        // Ensure TRANSACTION_ID is present (string reference)
        if (!transaction.TRANSACTION_ID) {
          transaction.TRANSACTION_ID = `TXN${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
        }
      },
      afterCreate: async (transaction, options) => {
        if (transaction.TRANSACTION_TYPE === 'LOAN_DISBURSEMENT') return;
        if (transaction.STATUS === 'POSTED') {
          const t = await sequelize.transaction();
          try {
            await updateLedgerBalance(transaction.DR_ACCT_NO, 'DR', transaction.AMOUNT, 'add', t);
            await updateLedgerBalance(transaction.CR_ACCT_NO, 'CR', transaction.AMOUNT, 'add', t);
            await t.commit();
          } catch (error) {
            await t.rollback();
            console.error('afterCreate ledger update failed:', error);
            throw error;
          }
        }
      },
      afterUpdate: async (transaction, options) => {
        if (transaction.changed('STATUS') && transaction.STATUS === 'POSTED') {
          const oldStatus = transaction.previous('STATUS');
          if (oldStatus !== 'POSTED') {
            const t = await sequelize.transaction();
            try {
              await updateLedgerBalance(transaction.DR_ACCT_NO, 'DR', transaction.AMOUNT, 'add', t);
              await updateLedgerBalance(transaction.CR_ACCT_NO, 'CR', transaction.AMOUNT, 'add', t);
              await t.commit();
            } catch (error) {
              await t.rollback();
              console.error('afterUpdate (to POSTED) ledger update failed:', error);
              throw error;
            }
          }
        }
        if (transaction.changed('STATUS') && transaction.STATUS === 'REVERSED') {
          const oldStatus = transaction.previous('STATUS');
          if (oldStatus === 'POSTED') {
            const t = await sequelize.transaction();
            try {
              await updateLedgerBalance(transaction.DR_ACCT_NO, 'DR', transaction.AMOUNT, 'subtract', t);
              await updateLedgerBalance(transaction.CR_ACCT_NO, 'CR', transaction.AMOUNT, 'subtract', t);
              await t.commit();
            } catch (error) {
              await t.rollback();
              console.error('afterUpdate (REVERSED) ledger update failed:', error);
              throw error;
            }
          }
        }
      },
      beforeUpdate: (transaction, options) => {
        if (options.userId) transaction.UPDATED_BY = options.userId;
      },
      beforeDestroy: (transaction, options) => {
        if (transaction.STATUS === 'POSTED') {
          throw new Error('Cannot delete posted transactions. Reverse them first.');
        }
      }
    }
  }
);

export default GLAccountTransaction;