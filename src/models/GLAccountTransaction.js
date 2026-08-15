// models/GLAccountTransaction.js - COMPLETE FIXED VERSION
import { DataTypes, Op, Model } from 'sequelize';
import sequelize from '../../config/db.js';
import Ledger from './Ledger.js';
import logger from '../utils/logger.js';

class GLAccountTransaction extends Model {
  // ============================================================
  // INSTANCE METHODS
  // ============================================================

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

  // ============================================================
  // LEDGER BALANCE UPDATE METHODS
  // ============================================================

  /**
   * Direct method to update ledger balance
   * @param {string} glAccountNo - GL Account Number
   * @param {number} amount - Amount to update
   * @param {boolean} isCredit - True if credit, false if debit
   * @param {Object} options - Sequelize options
   * @returns {Promise<Object>} Updated ledger or null
   */
  static async updateLedgerBalanceDirect(glAccountNo, amount, isCredit, options = {}) {
    try {
      if (!glAccountNo) {
        logger.warn('?? No GL account provided for balance update');
        return null;
      }

      // Find the ledger account
      const ledger = await Ledger.findOne({
        where: { GL_ACCT_NO: glAccountNo },
        ...options
      });

      if (!ledger) {
        logger.warn(`?? Ledger account not found: ${glAccountNo}`);
        return null;
      }

      // Check if posting is allowed
      if (!ledger.POST_ALLOW) {
        logger.warn(`?? Posting not allowed for account ${glAccountNo}`);
        return null;
      }

      if (ledger.REC_ST !== 'Active') {
        logger.warn(`?? Account ${glAccountNo} is not active (Status: ${ledger.REC_ST})`);
        return null;
      }

      // Calculate the new balance based on account category
      let newBalance = parseFloat(ledger.LEDGER_BALANCE) || 0;
      const amountNum = parseFloat(amount) || 0;

      if (amountNum <= 0) {
        logger.warn(`?? Invalid amount: ${amount}`);
        return null;
      }

      // Determine if this is a debit or credit based on account category
      const isDebit = isCredit === false;
      
      // For ASSET and EXPENSE accounts: Debit increases, Credit decreases
      // For LIABILITY, EQUITY, REVENUE accounts: Credit increases, Debit decreases
      const isAssetExpense = ['ASSET', 'EXPENSE', 'CONTROL', 'SUSPENSE', 'TAX'].includes(ledger.GL_ACCT_CAT);
      
      if (isDebit) {
        newBalance = isAssetExpense ? newBalance + amountNum : newBalance - amountNum;
      } else { // Credit
        newBalance = isAssetExpense ? newBalance - amountNum : newBalance + amountNum;
      }

      // Round to 2 decimal places
      newBalance = parseFloat(newBalance.toFixed(2));

      // Check for negative balance
      if (newBalance < 0 && !ledger.ALLOW_BAL_SWING_FG) {
        logger.warn(`?? Negative balance (${newBalance}) not allowed for account ${glAccountNo}`);
        return null;
      }

      // Update all balance fields
      ledger.LEDGER_BALANCE = newBalance;
      ledger.CURRENT_BALANCE = newBalance;
      ledger.AVAILABLE_BALANCE = newBalance;
      ledger.ROW_TS = new Date();

      await ledger.save(options);
      
      logger.info(`? Updated ledger ${glAccountNo}: ${isDebit ? 'DEBIT' : 'CREDIT'} ${amountNum}, New Balance: ${newBalance}`);
      
      return ledger;
    } catch (error) {
      logger.error(`? Failed to update ledger ${glAccountNo}:`, error.message);
      // Don't throw - just log the error and return null
      return null;
    }
  }

  // ============================================================
  // TRANSACTION PROCESSING METHODS
  // ============================================================

  /**
   * Process double entry with direct balance updates
   * @param {Object} transactionData - Transaction data
   * @param {Object} options - Sequelize options
   * @returns {Promise<Object>} Created transaction
   */
  static async processDoubleEntry(transactionData, options = {}) {
    const transaction = options.transaction || await sequelize.transaction();
    let transactionCommitted = false;
    
    try {
      const {
        journalId,
        debitAccount,
        creditAccount,
        amount,
        narration,
        createdBy,
        transactionType,
        currencyCode = 'NGN',
        status = 'POSTED',
        branchCode,
        organizationCode,
        buId,
      } = transactionData;

      // Validate required fields
      if (!journalId || !debitAccount || !creditAccount || !amount || !narration || !createdBy) {
        throw new Error('Missing required transaction fields');
      }
      if (amount <= 0) throw new Error('Transaction amount must be greater than 0');

      const amountNum = parseFloat(amount);
      const transactionId = `TXN${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
      const txnIdNum = await this.generateTransactionId();

      // Create the transaction record
      const glTransaction = await this.create({
        JOURNAL_ID: journalId,
        TRANSACTION_ID: transactionId,
        DR_ACCT_NO: debitAccount,
        CR_ACCT_NO: creditAccount,
        AMOUNT: amountNum,
        NARRATION: narration,
        CREATED_BY: createdBy,
        TRANSACTION_TYPE: transactionType || 'GENERAL',
        CURRENCY_CODE: currencyCode,
        STATUS: status,
        TransactionId: txnIdNum,
        BU_ID: buId || branchCode || '001',
        organizationCode: organizationCode || '1',
        branchCode: branchCode || '001',
      }, { transaction });

      // ? Update ledger balances directly
      if (status === 'POSTED') {
        // Debit the debit account (decrease if liability, increase if asset)
        await this.updateLedgerBalanceDirect(
          debitAccount,
          amountNum,
          false, // isCredit = false (this is a debit)
          { transaction }
        );

        // Credit the credit account (increase if liability, decrease if asset)
        await this.updateLedgerBalanceDirect(
          creditAccount,
          amountNum,
          true, // isCredit = true (this is a credit)
          { transaction }
        );
      }

      transactionCommitted = true;
      if (!options.transaction) {
        await transaction.commit();
      }

      logger.info(`? GL Transaction processed: ${transactionId} - ${debitAccount} DR ${amountNum}, ${creditAccount} CR ${amountNum}`);
      
      return glTransaction;
    } catch (error) {
      if (!options.transaction && !transactionCommitted) {
        await transaction.rollback();
      }
      logger.error('? GL Transaction failed:', error.message);
      throw error;
    }
  }

  /**
   * Process single entry (one side only)
   * @param {Object} transactionData - Transaction data
   * @param {Object} options - Sequelize options
   * @returns {Promise<Object>} Created transaction
   */
  static async processSingleEntry(transactionData, options = {}) {
    const transaction = options.transaction || await sequelize.transaction();
    let transactionCommitted = false;
    
    try {
      const {
        journalId,
        glAccountNo,
        amount,
        transactionType, // 'DR' or 'CR'
        narration,
        createdBy,
        currencyCode = 'NGN',
        status = 'POSTED',
        branchCode,
        organizationCode,
        buId,
      } = transactionData;

      // Validate required fields
      if (!journalId || !glAccountNo || !amount || !narration || !createdBy) {
        throw new Error('Missing required transaction fields');
      }
      if (amount <= 0) throw new Error('Transaction amount must be greater than 0');

      const amountNum = parseFloat(amount);
      const transactionId = `TXN${Date.now()}${Math.floor(1000 + Math.random() * 9000)}`;
      const txnIdNum = await this.generateTransactionId();

      const isDebit = transactionType.toUpperCase() === 'DR';

      // Create the transaction record
      const glTransaction = await this.create({
        JOURNAL_ID: journalId,
        TRANSACTION_ID: transactionId,
        DR_ACCT_NO: isDebit ? glAccountNo : null,
        CR_ACCT_NO: !isDebit ? glAccountNo : null,
        AMOUNT: amountNum,
        NARRATION: narration,
        CREATED_BY: createdBy,
        TRANSACTION_TYPE: transactionType.toUpperCase(),
        CURRENCY_CODE: currencyCode,
        STATUS: status,
        TransactionId: txnIdNum,
        BU_ID: buId || branchCode || '001',
        organizationCode: organizationCode || '1',
        branchCode: branchCode || '001',
      }, { transaction });

      // ? Update ledger balance directly
      if (status === 'POSTED') {
        await this.updateLedgerBalanceDirect(
          glAccountNo,
          amountNum,
          !isDebit, // isCredit = true for CR, false for DR
          { transaction }
        );
      }

      transactionCommitted = true;
      if (!options.transaction) {
        await transaction.commit();
      }

      logger.info(`? Single GL Transaction processed: ${transactionId} - ${glAccountNo} ${transactionType} ${amountNum}`);
      
      return glTransaction;
    } catch (error) {
      if (!options.transaction && !transactionCommitted) {
        await transaction.rollback();
      }
      logger.error('? Single GL Transaction failed:', error.message);
      throw error;
    }
  }

  /**
   * Reverse a transaction
   * @param {number} transactionId - Transaction ID to reverse
   * @param {string} reversedBy - User reversing the transaction
   * @param {string} reversalReason - Reason for reversal
   * @param {Object} options - Sequelize options
   * @returns {Promise<Object>} Reversed transaction
   */
  static async reverseTransaction(transactionId, reversedBy, reversalReason, options = {}) {
    const transaction = options.transaction || await sequelize.transaction();
    let transactionCommitted = false;
    
    try {
      const existing = await this.findByPk(transactionId, { transaction });
      
      if (!existing) {
        throw new Error(`Transaction with ID ${transactionId} not found`);
      }
      
      if (existing.STATUS === 'REVERSED') {
        throw new Error(`Transaction ${existing.TRANSACTION_ID} is already reversed`);
      }
      
      if (existing.STATUS !== 'POSTED') {
        throw new Error(`Only POSTED transactions can be reversed. Current status: ${existing.STATUS}`);
      }

      // Reverse the transaction
      existing.STATUS = 'REVERSED';
      existing.REVERSAL_DATE = new Date();
      existing.REVERSED_BY = reversedBy;
      existing.REVERSAL_REASON = reversalReason || 'No reason provided';
      existing.UPDATED_BY = reversedBy;
      
      await existing.save({ transaction });

      // ? Reverse ledger balances
      const amountNum = parseFloat(existing.AMOUNT);
      
      // Reverse DR (credit it back)
      if (existing.DR_ACCT_NO) {
        await this.updateLedgerBalanceDirect(
          existing.DR_ACCT_NO,
          amountNum,
          true, // isCredit = true (reverse the debit)
          { transaction }
        );
      }
      
      // Reverse CR (debit it back)
      if (existing.CR_ACCT_NO) {
        await this.updateLedgerBalanceDirect(
          existing.CR_ACCT_NO,
          amountNum,
          false, // isCredit = false (reverse the credit)
          { transaction }
        );
      }

      transactionCommitted = true;
      if (!options.transaction) {
        await transaction.commit();
      }

      logger.info(`? Transaction ${existing.TRANSACTION_ID} reversed successfully`);
      
      return existing;
    } catch (error) {
      if (!options.transaction && !transactionCommitted) {
        await transaction.rollback();
      }
      logger.error('? Transaction reversal failed:', error.message);
      throw error;
    }
  }

  // ============================================================
  // QUERY METHODS
  // ============================================================

  /**
   * Find by transaction ID (string reference)
   */
  static async findByTransactionId(transactionId, options = {}) {
    return await this.findOne({
      where: { TRANSACTION_ID: transactionId },
      ...options
    });
  }

  /**
   * Find by journal ID
   */
  static async findByJournalId(journalId, options = {}) {
    return await this.findAll({
      where: { JOURNAL_ID: journalId },
      order: [['createdAt', 'DESC']],
      ...options
    });
  }

  /**
   * Find by account number (DR or CR)
   */
  static async findByAccount(accountNo, options = {}) {
    return await this.findAll({
      where: {
        [Op.or]: [
          { DR_ACCT_NO: accountNo },
          { CR_ACCT_NO: accountNo }
        ]
      },
      order: [['createdAt', 'DESC']],
      ...options
    });
  }

  /**
   * Find debit transactions for an account
   */
  static async findDebitTransactions(accountNo, options = {}) {
    return await this.findAll({
      where: { DR_ACCT_NO: accountNo },
      order: [['createdAt', 'DESC']],
      ...options
    });
  }

  /**
   * Find credit transactions for an account
   */
  static async findCreditTransactions(accountNo, options = {}) {
    return await this.findAll({
      where: { CR_ACCT_NO: accountNo },
      order: [['createdAt', 'DESC']],
      ...options
    });
  }

  /**
   * Find by date range
   */
  static async findByDateRange(startDate, endDate, options = {}) {
    const where = {
      createdAt: { [Op.between]: [startDate, endDate] }
    };
    if (options.accountNo) {
      where[Op.or] = [
        { DR_ACCT_NO: options.accountNo },
        { CR_ACCT_NO: options.accountNo }
      ];
    }
    if (options.status) where.STATUS = options.status;
    if (options.transactionType) where.TRANSACTION_TYPE = options.transactionType;
    
    return await this.findAll({
      where,
      order: [['createdAt', 'DESC']],
      ...options
    });
  }

  /**
   * Get account balance as of a date
   */
  static async getAccountBalance(accountNo, asOfDate = new Date()) {
    const transactions = await this.findAll({
      where: {
        [Op.or]: [
          { DR_ACCT_NO: accountNo },
          { CR_ACCT_NO: accountNo }
        ],
        createdAt: { [Op.lte]: asOfDate },
        STATUS: { [Op.ne]: 'REVERSED' }
      }
    });
    
    let balance = 0;
    transactions.forEach(tx => {
      if (tx.DR_ACCT_NO === accountNo) balance -= parseFloat(tx.AMOUNT);
      if (tx.CR_ACCT_NO === accountNo) balance += parseFloat(tx.AMOUNT);
    });
    
    return {
      accountNo,
      balance: parseFloat(balance.toFixed(2)),
      asOfDate,
      transactionCount: transactions.length
    };
  }

  /**
   * Get transaction statistics for a period
   */
  static async getTransactionStatistics(startDate, endDate) {
    const stats = await this.findAll({
      where: {
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('TransactionId')), 'totalTransactions'],
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
        createdAt: { [Op.between]: [startDate, endDate] }
      },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('TransactionId')), 'totalCount'],
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

  /**
   * Find pending transactions
   */
  static async findPendingTransactions() {
    return await this.findAll({
      where: { STATUS: 'PENDING' },
      order: [['createdAt', 'ASC']]
    });
  }

  /**
   * Get transaction audit trail
   */
  static async getTransactionAudit(transactionId) {
    const transaction = await this.findByTransactionId(transactionId);
    if (!transaction) throw new Error('Transaction not found');
    
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
          details: `Transaction reversed: ${transaction.REVERSAL_REASON || 'No reason provided'}`
        }] : [])
      ]
    };
  }
}

// ============================================================
// MODEL INITIALIZATION
// ============================================================

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
      allowNull: true,
      comment: 'Debit Account Number'
    },
    CR_ACCT_NO: {
      type: DataTypes.STRING(50),
      allowNull: true,
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
    },
    // Branch and organization fields
    BU_ID: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Business Unit ID'
    },
    organizationCode: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Organization Code'
    },
    branchCode: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Branch Code'
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
        if (!transaction.BU_ID && options.branchCode) {
          transaction.BU_ID = options.branchCode;
        }
        if (!transaction.organizationCode && options.organizationCode) {
          transaction.organizationCode = options.organizationCode;
        }
        if (!transaction.branchCode && options.branchCode) {
          transaction.branchCode = options.branchCode;
        }
        // Ensure either DR or CR is set
        if (!transaction.DR_ACCT_NO && !transaction.CR_ACCT_NO) {
          throw new Error('Either DR_ACCT_NO or CR_ACCT_NO must be set');
        }
      },
      // afterCreate with direct balance update
      afterCreate: async (transaction, options) => {
        // Skip if not POSTED
        if (transaction.STATUS !== 'POSTED') return;
        
        // Skip if transaction type is LOAN_DISBURSEMENT (handled elsewhere)
        if (transaction.TRANSACTION_TYPE === 'LOAN_DISBURSEMENT') return;
        
        try {
          const amountNum = parseFloat(transaction.AMOUNT);
          
          // Update DR account if exists
          if (transaction.DR_ACCT_NO) {
            await GLAccountTransaction.updateLedgerBalanceDirect(
              transaction.DR_ACCT_NO,
              amountNum,
              false, // isCredit = false (debit)
              { transaction: options.transaction }
            );
          }
          
          // Update CR account if exists
          if (transaction.CR_ACCT_NO) {
            await GLAccountTransaction.updateLedgerBalanceDirect(
              transaction.CR_ACCT_NO,
              amountNum,
              true, // isCredit = true (credit)
              { transaction: options.transaction }
            );
          }
          
          logger.info(`? Ledger balances updated for transaction ${transaction.TRANSACTION_ID}`);
        } catch (error) {
          logger.error('? afterCreate ledger update failed:', error.message);
          // Don't throw - allow transaction to complete even if balance update fails
        }
      },
      // afterUpdate for status changes
      afterUpdate: async (transaction, options) => {
        try {
          const changed = transaction.changed();
          const oldStatus = transaction.previous('STATUS');
          
          // If status changed to POSTED
          if (changed && changed.includes('STATUS') && transaction.STATUS === 'POSTED' && oldStatus !== 'POSTED') {
            const amountNum = parseFloat(transaction.AMOUNT);
            
            if (transaction.DR_ACCT_NO) {
              await GLAccountTransaction.updateLedgerBalanceDirect(
                transaction.DR_ACCT_NO,
                amountNum,
                false,
                { transaction: options.transaction }
              );
            }
            
            if (transaction.CR_ACCT_NO) {
              await GLAccountTransaction.updateLedgerBalanceDirect(
                transaction.CR_ACCT_NO,
                amountNum,
                true,
                { transaction: options.transaction }
              );
            }
            logger.info(`? Ledger balances posted for transaction ${transaction.TRANSACTION_ID}`);
          }
          
          // If status changed to REVERSED (reverse the transaction)
          if (changed && changed.includes('STATUS') && transaction.STATUS === 'REVERSED' && oldStatus === 'POSTED') {
            const amountNum = parseFloat(transaction.AMOUNT);
            
            // Reverse DR (credit it back)
            if (transaction.DR_ACCT_NO) {
              await GLAccountTransaction.updateLedgerBalanceDirect(
                transaction.DR_ACCT_NO,
                amountNum,
                true, // Reverse the debit (credit)
                { transaction: options.transaction }
              );
            }
            
            // Reverse CR (debit it back)
            if (transaction.CR_ACCT_NO) {
              await GLAccountTransaction.updateLedgerBalanceDirect(
                transaction.CR_ACCT_NO,
                amountNum,
                false, // Reverse the credit (debit)
                { transaction: options.transaction }
              );
            }
            logger.info(`? Ledger balances reversed for transaction ${transaction.TRANSACTION_ID}`);
          }
        } catch (error) {
          logger.error('? afterUpdate ledger update failed:', error.message);
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
