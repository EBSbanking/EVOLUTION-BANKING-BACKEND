// controllers/PendingGLTransactionController.js
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import PendingGLTransaction from '../models/PendingGLTransaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import logger from '../utils/logger.js';

/**
 * Process all pending GL transactions (credits/debits)
 * Updates customer account balances and marks transaction as PROCESSED.
 */
export const processPendingGLTransactions = async () => {
  const transaction = await sequelize.transaction();
  try {
    const pendingTxs = await PendingGLTransaction.findAll({
      where: { STATUS: 'PENDING' },
      order: [['created_at', 'ASC']],
      transaction
    });

    if (pendingTxs.length === 0) {
      await transaction.commit();
      logger.info('No pending GL transactions to process');
      return { success: true, processed: 0, failed: 0, results: [] };
    }

    const results = { processed: 0, failed: 0, details: [] };

    for (const tx of pendingTxs) {
      try {
        // Find customer account by GL_ACCT_NO (matches account_number)
        const account = await CustomerAccount.findOne({
          where: { account_number: tx.GL_ACCT_NO },
          lock: transaction.LOCK.UPDATE,
          transaction
        });

        if (!account) {
          throw new Error(`Customer account ${tx.GL_ACCT_NO} not found`);
        }

        const amount = parseFloat(tx.AMOUNT);
        const isCredit = tx.TRANSACTION_TYPE === 'CR';

        // Store previous balances
        const prevLedger = parseFloat(account.ledger_balance);
        const prevCleared = parseFloat(account.cleared_balance);
        const prevAvailable = parseFloat(account.available_balance);

        let newLedger, newCleared, newAvailable;
        if (isCredit) {
          newLedger = prevLedger + amount;
          newCleared = prevCleared + amount;
          newAvailable = prevAvailable + amount;
        } else {
          // Debit – check sufficient balance
          if (prevAvailable < amount) {
            throw new Error(`Insufficient balance: ${prevAvailable} < ${amount}`);
          }
          newLedger = prevLedger - amount;
          newCleared = prevCleared - amount;
          newAvailable = prevAvailable - amount;
        }

        // Update customer account balances
        await account.update({
          ledger_balance: newLedger,
          cleared_balance: newCleared,
          available_balance: newAvailable,
          last_transaction_date: new Date()
        }, { transaction });

        // Update transaction with balance details and status
        await tx.update({
          STATUS: 'PROCESSED',
          processedAt: new Date(),
          PREVIOUS_BALANCE: prevLedger,
          PREVIOUS_LEDGER_BALANCE: prevLedger,
          PREVIOUS_CLEARED_BALANCE: prevCleared,
          PREVIOUS_AVAILABLE_BALANCE: prevAvailable,
          BALANCE_AFTER: newLedger,
          LEDGER_BALANCE_AFTER: newLedger,
          CLEARED_BALANCE_AFTER: newCleared,
          AVAILABLE_BALANCE_AFTER: newAvailable,
          BALANCE_IMPACT: {
            previous: { current: prevLedger, ledger: prevLedger, cleared: prevCleared, available: prevAvailable },
            after: { current: newLedger, ledger: newLedger, cleared: newCleared, available: newAvailable },
            change: { current: newLedger - prevLedger, ledger: newLedger - prevLedger, cleared: newCleared - prevCleared, available: newAvailable - prevAvailable },
            transaction_type: tx.TRANSACTION_TYPE,
            source: 'EOD_PROCESSING'
          }
        }, { transaction });

        results.processed++;
        results.details.push({
          id: tx.id,
          glAcctNo: tx.GL_ACCT_NO,
          amount,
          type: tx.TRANSACTION_TYPE,
          newBalance: newAvailable
        });

        logger.info(`Processed GL transaction ${tx.id}`, {
          account: tx.GL_ACCT_NO,
          amount,
          type: tx.TRANSACTION_TYPE,
          newBalance: newAvailable
        });

      } catch (txError) {
        // Mark transaction as failed
        await tx.update({
          STATUS: 'FAILED',
          errorMessage: txError.message,
          processedAt: new Date()
        }, { transaction });

        results.failed++;
        results.details.push({
          id: tx.id,
          error: txError.message
        });

        logger.error(`Failed to process GL transaction ${tx.id}:`, txError.message);
      }
    }

    await transaction.commit();
    logger.info(`Pending GL transactions processed: ${results.processed} succeeded, ${results.failed} failed`);
    return { success: true, ...results };

  } catch (error) {
    await transaction.rollback();
    logger.error('Error processing pending GL transactions:', error);
    return { success: false, error: error.message, processed: 0, failed: 0 };
  }
};

export default { processPendingGLTransactions };