// services/transactionHistory.js
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import Transaction from '../models/Transaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import DepositAccountApplication from '../models/DepositAccountApplication.js';
import AccountApplication from '../models/AccountApplication.js';

/**
 * Service to handle transaction history recording and balance updates.
 * Supports CustomerAccount, DepositAccountApplication, and AccountApplication.
 */
export class TransactionHistoryService {
  /**
   * Record a transaction and update the corresponding account balance.
   * @param {Object} params - Transaction parameters
   * @param {string} params.accountNumber - Account number
   * @param {string} params.accountId - Account ID (internal)
   * @param {number} params.buId - Business unit ID
   * @param {string} params.customerId - Customer ID
   * @param {string} params.accountName - Account name
   * @param {number} params.amount - Transaction amount
   * @param {'CREDIT'|'DEBIT'} params.direction - Credit or Debit
   * @param {string} params.transactionType - Type (e.g., 'CARD_PURCHASE', 'DEPOSIT')
   * @param {string} params.reference - Unique reference
   * @param {string} params.description - Narration
   * @param {string} params.createdBy - User/system identifier
   * @param {string} params.currency - Currency code (default 'NGN')
   * @param {Object} params.metadata - Additional data (JSON)
   * @param {Object} [params.existingTransaction] - Optional Sequelize transaction
   * @returns {Promise<Object>} Created transaction record
   */
  static async recordTransaction({
    accountNumber,
    accountId,
    buId,
    customerId,
    accountName,
    amount,
    direction,
    transactionType,
    reference,
    description,
    createdBy,
    currency = 'NGN',
    metadata = {},
    existingTransaction = null
  }) {
    let transaction = existingTransaction;
    let shouldCommit = false;

    try {
      if (!transaction) {
        transaction = await sequelize.transaction();
        shouldCommit = true;
      }

      // 1. Create the transaction record (uses Transaction model hooks)
      const transactionRecord = await Transaction.create({
        ACCT_NO: accountNumber,
        ACCT_ID: accountId,
        BU_ID: buId,
        CUST_ID: customerId,
        ACCT_NM: accountName,
        AMOUNT: amount,
        transactionDirection: direction,
        TRANSACTION_TYPE: transactionType,
        REFERENCE: reference,
        description: description,
        createdBy: createdBy,
        currency: currency,
        status: 'COMPLETED',
        metadata: metadata,
        TRANSACTIONDATE: new Date()
      }, { transaction });

      // 2. Update the account balance (one of the three models)
      await this._updateAccountBalance(accountNumber, amount, direction, transaction);

      if (shouldCommit) {
        await transaction.commit();
      }

      return transactionRecord;

    } catch (error) {
      if (shouldCommit && transaction) {
        await transaction.rollback();
      }
      throw error;
    }
  }

  /**
   * Update balance of CustomerAccount, DepositAccountApplication, or AccountApplication.
   * @private
   */
  static async _updateAccountBalance(accountNumber, amount, direction, transaction) {
    let accountInstance = null;
    let accountModel = null;

    // 1. Try CustomerAccount
    accountInstance = await CustomerAccount.findOne({
      where: { [Op.or]: [{ account_number: accountNumber }, { ACCT_NO: accountNumber }] },
      transaction,
      lock: true
    });
    if (accountInstance) {
      accountModel = 'CustomerAccount';
    } else {
      // 2. Try DepositAccountApplication
      accountInstance = await DepositAccountApplication.findOne({
        where: { ACCT_NO: accountNumber },
        transaction,
        lock: true
      });
      if (accountInstance) {
        accountModel = 'DepositAccountApplication';
      } else {
        // 3. Try AccountApplication
        accountInstance = await AccountApplication.findOne({
          where: { ACCT_NO: accountNumber },
          transaction,
          lock: true
        });
        if (accountInstance) {
          accountModel = 'AccountApplication';
        }
      }
    }

    if (!accountInstance) {
      throw new Error(`Account ${accountNumber} not found in CustomerAccount, DepositAccountApplication, or AccountApplication`);
    }

    const isDebit = direction === 'DEBIT';
    const amountNum = parseFloat(amount);

    // Get current balances (handling field name variations)
    let ledgerBalance, availableBalance, clearedBalance;

    if (accountModel === 'CustomerAccount') {
      ledgerBalance = parseFloat(accountInstance.ledger_balance ?? accountInstance.LEDGER_BAL ?? 0);
      availableBalance = parseFloat(accountInstance.available_balance ?? accountInstance.AVAILABLE_BALANCE ?? 0);
      clearedBalance = parseFloat(accountInstance.cleared_balance ?? accountInstance.CLEARED_BAL ?? 0);
    } else { // DepositAccountApplication or AccountApplication
      ledgerBalance = parseFloat(accountInstance.LEDGER_BAL ?? 0);
      availableBalance = parseFloat(accountInstance.AVAILABLE_BALANCE ?? 0);
      clearedBalance = parseFloat(accountInstance.CLEARED_BAL ?? 0);
    }

    // Compute new balances
    if (isDebit) {
      if (availableBalance < amountNum) {
        throw new Error(`Insufficient balance: available ${availableBalance}, required ${amountNum}`);
      }
      ledgerBalance -= amountNum;
      availableBalance -= amountNum;
      clearedBalance += amountNum;   // Adjust based on your business logic
    } else {
      ledgerBalance += amountNum;
      availableBalance += amountNum;
      clearedBalance += amountNum;
    }

    // Build update object
    const updateData = { lastActivityDate: new Date(), updatedAt: new Date() };
    if (accountModel === 'CustomerAccount') {
      updateData.ledger_balance = ledgerBalance;
      updateData.available_balance = availableBalance;
      updateData.cleared_balance = clearedBalance;
      updateData.LEDGER_BAL = ledgerBalance;
      updateData.AVAILABLE_BALANCE = availableBalance;
      updateData.CLEARED_BAL = clearedBalance;
      await accountInstance.update(updateData, { transaction });
    } else {
      // DepositAccountApplication or AccountApplication
      updateData.LEDGER_BAL = ledgerBalance;
      updateData.AVAILABLE_BALANCE = availableBalance;
      updateData.CLEARED_BAL = clearedBalance;
      await accountInstance.update(updateData, { transaction });
    }
  }

  /**
   * Get transaction history for a specific account.
   * @param {string} accountNumber - Account number
   * @param {Object} options - Optional filters
   * @param {Date} [options.startDate] - Start date
   * @param {Date} [options.endDate] - End date
   * @param {string} [options.transactionType] - Filter by type
   * @param {string} [options.status] - Filter by status
   * @param {number} [options.limit] - Max records
   * @param {number} [options.offset] - Pagination offset
   * @returns {Promise<Array>} List of transactions
   */
  static async getAccountTransactions(accountNumber, options = {}) {
    const where = { ACCT_NO: accountNumber };
    if (options.startDate && options.endDate) {
      where.TRANSACTIONDATE = { [Op.between]: [options.startDate, options.endDate] };
    }
    if (options.transactionType) where.TRANSACTION_TYPE = options.transactionType;
    if (options.status) where.status = options.status;

    return await Transaction.findAll({
      where,
      order: [['TRANSACTIONDATE', 'DESC']],
      limit: options.limit || 100,
      offset: options.offset || 0
    });
  }

  /**
   * Get transaction by reference.
   */
  static async getByReference(reference) {
    return await Transaction.findOne({ where: { REFERENCE: reference } });
  }

  /**
   * Reverse a transaction (create reversal record and update balances).
   * @param {number|string} transactionId - ID or reference of original transaction
   * @param {string} reversedBy - User reversing
   * @param {string} reason - Reversal reason
   * @param {Object} existingTransaction - Optional Sequelize transaction
   */
  static async reverseTransaction(transactionId, reversedBy, reason, existingTransaction = null) {
    let transaction = existingTransaction;
    let shouldCommit = false;

    try {
      if (!transaction) {
        transaction = await sequelize.transaction();
        shouldCommit = true;
      }

      // Find original transaction
      const original = await Transaction.findOne({
        where: { [Op.or]: [{ id: transactionId }, { REFERENCE: transactionId }] },
        transaction
      });
      if (!original) throw new Error('Original transaction not found');
      if (original.status !== 'COMPLETED') throw new Error('Only completed transactions can be reversed');

      // Create reversal record (opposite direction)
      const reversalDirection = original.transactionDirection === 'CREDIT' ? 'DEBIT' : 'CREDIT';
      const reversalRef = `REV-${original.REFERENCE}`;

      const reversal = await Transaction.create({
        ACCT_NO: original.ACCT_NO,
        ACCT_ID: original.ACCT_ID,
        BU_ID: original.BU_ID,
        CUST_ID: original.CUST_ID,
        ACCT_NM: original.ACCT_NM,
        AMOUNT: original.AMOUNT,
        transactionDirection: reversalDirection,
        TRANSACTION_TYPE: 'REVERSAL',
        REFERENCE: reversalRef,
        description: `Reversal of ${original.REFERENCE}: ${reason}`,
        createdBy: reversedBy,
        currency: original.currency,
        status: 'COMPLETED',
        metadata: {
          original_transaction_id: original.id,
          original_reference: original.REFERENCE,
          reversal_reason: reason,
          reversed_by: reversedBy,
          reversed_at: new Date()
        },
        TRANSACTIONDATE: new Date()
      }, { transaction });

      // Update original status
      await original.update({
        status: 'REVERSED',
        metadata: {
          ...original.metadata,
          reversed_by: reversedBy,
          reversed_at: new Date(),
          reversal_reason: reason,
          reversal_transaction_id: reversal.id
        }
      }, { transaction });

      // Update account balance (reverse the effect)
      await this._updateAccountBalance(
        original.ACCT_NO,
        original.AMOUNT,
        reversalDirection,
        transaction
      );

      if (shouldCommit) await transaction.commit();
      return reversal;

    } catch (error) {
      if (shouldCommit && transaction) await transaction.rollback();
      throw error;
    }
  }
}

// Convenience exports
export const recordTransaction = TransactionHistoryService.recordTransaction.bind(TransactionHistoryService);
export const getAccountTransactions = TransactionHistoryService.getAccountTransactions.bind(TransactionHistoryService);
export const reverseTransaction = TransactionHistoryService.reverseTransaction.bind(TransactionHistoryService);
export default TransactionHistoryService;