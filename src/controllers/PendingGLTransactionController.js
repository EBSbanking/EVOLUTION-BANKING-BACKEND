// controllers/PendingGLTransactionController.js
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import PendingGLTransaction from '../models/PendingGLTransaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import logger from '../utils/logger.js';

/**
 * Get all pending GL transactions with optional filters
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
export const getAllPendingTransactions = async (req, res) => {
  try {
    const {
      status = 'PENDING',
      transactionType,
      glAcctNo,
      fromDate,
      toDate,
      page = 1,
      limit = 50
    } = req.query;

    const where = {};
    
    if (status) {
      where.STATUS = status.toUpperCase();
    }
    
    if (transactionType) {
      where.TRANSACTION_TYPE = transactionType.toUpperCase();
    }
    
    if (glAcctNo) {
      where.GL_ACCT_NO = glAcctNo;
    }
    
    if (fromDate || toDate) {
      where.created_at = {};
      if (fromDate) {
        where.created_at[Op.gte] = new Date(fromDate);
      }
      if (toDate) {
        where.created_at[Op.lte] = new Date(toDate);
      }
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows } = await PendingGLTransaction.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: offset
    });

    const totalPages = Math.ceil(count / limit);

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      },
      summary: {
        totalPending: rows.filter(t => t.STATUS === 'PENDING').length,
        totalProcessed: rows.filter(t => t.STATUS === 'PROCESSED').length,
        totalFailed: rows.filter(t => t.STATUS === 'FAILED').length,
        totalCredits: rows.filter(t => t.TRANSACTION_TYPE === 'CR').length,
        totalDebits: rows.filter(t => t.TRANSACTION_TYPE === 'DR').length
      }
    });

  } catch (error) {
    logger.error('Error fetching pending GL transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending GL transactions',
      error: error.message
    });
  }
};

/**
 * Get pending GL transaction by ID
 */
export const getPendingTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    
    const transaction = await PendingGLTransaction.findByPk(id);
    
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: 'Pending GL transaction not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: transaction
    });
    
  } catch (error) {
    logger.error('Error fetching pending GL transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending GL transaction',
      error: error.message
    });
  }
};

/**
 * Get pending GL transactions by status
 */
export const getPendingTransactionsByStatus = async (req, res) => {
  try {
    const { status } = req.params;
    const validStatuses = ['PENDING', 'PROCESSED', 'FAILED'];
    
    if (!validStatuses.includes(status.toUpperCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(', ')}`
      });
    }
    
    const transactions = await PendingGLTransaction.findAll({
      where: { STATUS: status.toUpperCase() },
      order: [['created_at', 'DESC']]
    });
    
    res.status(200).json({
      success: true,
      data: transactions,
      count: transactions.length
    });
    
  } catch (error) {
    logger.error('Error fetching pending GL transactions by status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending GL transactions',
      error: error.message
    });
  }
};

/**
 * Get pending GL transactions summary/statistics
 */
export const getPendingTransactionsSummary = async (req, res) => {
  try {
    const stats = await PendingGLTransaction.findAll({
      attributes: [
        'STATUS',
        'TRANSACTION_TYPE',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount']
      ],
      group: ['STATUS', 'TRANSACTION_TYPE']
    });
    
    const totalStats = await PendingGLTransaction.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalTransactions'],
        [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'totalAmount']
      ]
    });
    
    res.status(200).json({
      success: true,
      data: {
        byStatusAndType: stats,
        totals: totalStats[0] || { totalTransactions: 0, totalAmount: 0 }
      }
    });
    
  } catch (error) {
    logger.error('Error fetching pending GL transactions summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch summary',
      error: error.message
    });
  }
};

/**
 * Retry a failed GL transaction
 */
export const retryFailedTransaction = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;
    
    const pendingTx = await PendingGLTransaction.findByPk(id, { transaction });
    
    if (!pendingTx) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Pending GL transaction not found'
      });
    }
    
    if (pendingTx.STATUS !== 'FAILED') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot retry transaction with status: ${pendingTx.STATUS}`
      });
    }
    
    await pendingTx.update({
      STATUS: 'PENDING',
      errorMessage: null,
      processedAt: null
    }, { transaction });
    
    await transaction.commit();
    
    res.status(200).json({
      success: true,
      message: 'Transaction reset to PENDING status successfully',
      data: pendingTx
    });
    
  } catch (error) {
    await transaction.rollback();
    logger.error('Error retrying failed transaction:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retry transaction',
      error: error.message
    });
  }
};

/**
 * Bulk retry failed transactions
 */
export const bulkRetryFailedTransactions = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { ids } = req.body;
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of transaction IDs'
      });
    }
    
    const [updatedCount] = await PendingGLTransaction.update(
      {
        STATUS: 'PENDING',
        errorMessage: null,
        processedAt: null
      },
      {
        where: {
          id: { [Op.in]: ids },
          STATUS: 'FAILED'
        },
        transaction
      }
    );
    
    await transaction.commit();
    
    res.status(200).json({
      success: true,
      message: `${updatedCount} transaction(s) reset to PENDING status`,
      updatedCount
    });
    
  } catch (error) {
    await transaction.rollback();
    logger.error('Error bulk retrying failed transactions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk retry transactions',
      error: error.message
    });
  }
};

/**
 * Process all pending GL transactions (credits/debits)
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

        const prevLedger = parseFloat(account.ledger_balance);
        const prevCleared = parseFloat(account.cleared_balance);
        const prevAvailable = parseFloat(account.available_balance);

        let newLedger, newCleared, newAvailable;
        if (isCredit) {
          newLedger = prevLedger + amount;
          newCleared = prevCleared + amount;
          newAvailable = prevAvailable + amount;
        } else {
          if (prevAvailable < amount) {
            throw new Error(`Insufficient balance: ${prevAvailable} < ${amount}`);
          }
          newLedger = prevLedger - amount;
          newCleared = prevCleared - amount;
          newAvailable = prevAvailable - amount;
        }

        await account.update({
          ledger_balance: newLedger,
          cleared_balance: newCleared,
          available_balance: newAvailable,
          last_transaction_date: new Date()
        }, { transaction });

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

// ✅ ALL FUNCTIONS EXPORTED
export default { 
  getAllPendingTransactions,
  getPendingTransactionById,
  getPendingTransactionsByStatus,
  getPendingTransactionsSummary,
  retryFailedTransaction,
  bulkRetryFailedTransactions,
  processPendingGLTransactions 
};