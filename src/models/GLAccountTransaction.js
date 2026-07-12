// models/GLAccountTransaction.js - FIXED (no FOR UPDATE lock)
import { DataTypes, Op, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import { updateLedgerBalance } from '../utils/ledgerHelper.js';

class GLAccountTransaction extends Model {
  // Generate a unique transaction ID
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
      transactionId: this.TransactionId,
      transactionRef: this.TRANSACTION_ID,
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

      const transactionId = `TXN${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;

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
    TransactionId: {
      type: DataTypes.BIGINT,
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
      comment: 'Type of transaction'
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
    underscored: false,
    hooks: {
      beforeCreate: (transaction, options) => {
        if (!transaction.TRANSACTION_ID) {
          transaction.TRANSACTION_ID = `TXN${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
        }
      },
      // ✅ FIXED: afterCreate with branch support
      afterCreate: async (transaction, options) => {
        // Skip loan disbursement transactions
        if (transaction.TRANSACTION_TYPE === 'LOAN_DISBURSEMENT') return;
        if (transaction.STATUS !== 'POSTED') return;
        
        try {
          // ✅ Get branchCode from the transaction record or options
          const branchCode = transaction.BU_ID || options.branchCode || '001';
          const organizationCode = transaction.organizationCode || options.organizationCode || '1';
          const createdBy = transaction.CREATED_BY || options.createdBy || 'SYSTEM';
          
          const t = options.transaction || await sequelize.transaction();
          try {
            // ✅ Use the updated helper with branch support
            await updateLedgerBalance(
              transaction.DR_ACCT_NO, 
              transaction.AMOUNT, 
              t, 
              false, // isCredit = false for debit
              branchCode,
              organizationCode,
              createdBy
            );
            await updateLedgerBalance(
              transaction.CR_ACCT_NO, 
              transaction.AMOUNT, 
              t, 
              true, // isCredit = true for credit
              branchCode,
              organizationCode,
              createdBy
            );
            if (!options.transaction) await t.commit();
          } catch (error) {
            if (!options.transaction) await t.rollback();
            console.error('afterCreate ledger update failed:', error.message);
          }
        } catch (error) {
          console.error('afterCreate error:', error.message);
        }
      },
      afterUpdate: async (transaction, options) => {
        try {
          // ✅ Get branchCode from the transaction record or options
          const branchCode = transaction.BU_ID || options.branchCode || '001';
          const organizationCode = transaction.organizationCode || options.organizationCode || '1';
          const createdBy = transaction.CREATED_BY || options.createdBy || 'SYSTEM';
          
          if (transaction.changed('STATUS') && transaction.STATUS === 'POSTED') {
            const oldStatus = transaction.previous('STATUS');
            if (oldStatus !== 'POSTED') {
              const t = options.transaction || await sequelize.transaction();
              try {
                await updateLedgerBalance(
                  transaction.DR_ACCT_NO, 
                  transaction.AMOUNT, 
                  t, 
                  false, 
                  branchCode,
                  organizationCode,
                  createdBy
                );
                await updateLedgerBalance(
                  transaction.CR_ACCT_NO, 
                  transaction.AMOUNT, 
                  t, 
                  true, 
                  branchCode,
                  organizationCode,
                  createdBy
                );
                if (!options.transaction) await t.commit();
              } catch (error) {
                if (!options.transaction) await t.rollback();
                console.error('afterUpdate (to POSTED) ledger update failed:', error.message);
              }
            }
          }
          if (transaction.changed('STATUS') && transaction.STATUS === 'REVERSED') {
            const oldStatus = transaction.previous('STATUS');
            if (oldStatus === 'POSTED') {
              const t = options.transaction || await sequelize.transaction();
              try {
                await updateLedgerBalance(
                  transaction.DR_ACCT_NO, 
                  transaction.AMOUNT, 
                  t, 
                  true, 
                  branchCode,
                  organizationCode,
                  createdBy
                );
                await updateLedgerBalance(
                  transaction.CR_ACCT_NO, 
                  transaction.AMOUNT, 
                  t, 
                  false, 
                  branchCode,
                  organizationCode,
                  createdBy
                );
                if (!options.transaction) await t.commit();
              } catch (error) {
                if (!options.transaction) await t.rollback();
                console.error('afterUpdate (REVERSED) ledger update failed:', error.message);
              }
            }
          }
        } catch (error) {
          console.error('afterUpdate error:', error.message);
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