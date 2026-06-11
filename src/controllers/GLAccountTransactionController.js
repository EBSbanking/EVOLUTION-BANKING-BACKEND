// controllers/GLAccountTransactionController.js - Sequelize version
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import GLAccount from '../models/GLAccount.js';
import GLTransactionQueue from '../models/GLTransactionQueue.js';
import Reconciliation from '../models/Reconciliation.js';
import Branch from '../models/Branch.js';
import { logger } from '../utils/logger.js';
import auditLogger from '../utils/AuditLogger.js';
import { addAuditTrail } from './AudiTrailController.js';

// Helper to generate a unique TransactionId (numeric)
const generateTransactionId = async () => {
  const lastTxn = await GLAccountTransaction.findOne({
    order: [['TransactionId', 'DESC']],
    attributes: ['TransactionId'],
  });
  const lastId = lastTxn ? lastTxn.TransactionId : 0;
  return lastId + 1;
};

// Helper to post a single GL transaction (used in approval flow)
const postSingleGLTransaction = async (data, req, transaction) => {
  // This function should create a GLAccountTransaction record
  // The model hooks will automatically update Ledger balances.
  const newTxn = await GLAccountTransaction.create({
    JOURNAL_ID: data.JOURNAL_ID,
    DR_ACCT_NO: data.TRANSACTION_TYPE === 'Debit' ? data.GL_ACCT_NO : null,
    CR_ACCT_NO: data.TRANSACTION_TYPE === 'Credit' ? data.GL_ACCT_NO : null,
    AMOUNT: data.AMOUNT,
    NARRATION: data.description || `Approved transaction ${data.JOURNAL_ID}`,
    CREATED_BY: data.CREATED_BY,
    TRANSACTION_TYPE: data.TRANSACTION_TYPE,
    CURRENCY_CODE: 'NGN',
    STATUS: 'POSTED',
    TransactionId: data.TransactionId,
  }, { transaction });
  return newTxn;
};

// ==================== GET ALL TRANSACTIONS ====================
export const getAllGLAccountTransactions = async (req, res) => {
  try {
    const {
      journalId, transactionId, drAcctNo, crAcctNo, status, createdBy,
      startDate, endDate, page = 1, limit = 50,
    } = req.query;

    const where = {};
    if (journalId) where.JOURNAL_ID = journalId;
    if (transactionId) where.TRANSACTION_ID = transactionId;
    if (drAcctNo) where.DR_ACCT_NO = drAcctNo;
    if (crAcctNo) where.CR_ACCT_NO = crAcctNo;
    if (status) where.STATUS = status;
    if (createdBy) where.CREATED_BY = createdBy;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);
    const { count, rows: transactions } = await GLAccountTransaction.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      offset,
      limit: parseInt(limit),
    });

    logger.info('Fetched GL account transactions', { count, filter: where, page, limit });

    return res.status(200).json({
      success: true,
      message: 'GL account transactions fetched successfully',
      data: {
        transactions,
        pagination: {
          current: parseInt(page),
          pages: Math.ceil(count / limit),
          total: count,
        },
      },
    });
  } catch (error) {
    logger.error('Error fetching GL account transactions', { error: error.message, stack: error.stack, query: req.query });
    return res.status(500).json({
      success: false,
      message: 'Error fetching GL account transactions',
      error: error.message,
    });
  }
};

// ==================== CREATE GL ACCOUNT TRANSACTION ====================
export const createGLAccountTransaction = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const {
      JOURNAL_ID,
      DR_ACCT_NO,
      CR_ACCT_NO,
      AMOUNT,
      NARRATION,
      CREATED_BY,
      TRANSACTION_TYPE,
      CURRENCY_CODE = 'NGN',
      STATUS = 'POSTED',
      organizationName,
      branchName,
    } = req.body;

    // Validate required fields
    const required = { JOURNAL_ID, DR_ACCT_NO, CR_ACCT_NO, AMOUNT, NARRATION, CREATED_BY, organizationName, branchName };
    const missing = Object.entries(required).filter(([_, v]) => !v).map(([k]) => k);
    if (missing.length) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
    if (AMOUNT <= 0) throw new Error('Amount must be greater than 0');

    // Verify GL accounts exist (optional)
    const drAccount = await GLAccount.findOne({ where: { GL_ACCT_NO: DR_ACCT_NO } });
    const crAccount = await GLAccount.findOne({ where: { GL_ACCT_NO: CR_ACCT_NO } });
    if (!drAccount || !crAccount) throw new Error('One or both GL accounts not found');

    // Generate unique TRANSACTION_ID if not provided
    const TRANSACTION_ID = req.body.TRANSACTION_ID || `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const existing = await GLAccountTransaction.findOne({ where: { TRANSACTION_ID } });
    if (existing) throw new Error(`Transaction ID ${TRANSACTION_ID} already exists`);

    const newTransaction = await GLAccountTransaction.create({
      JOURNAL_ID,
      TRANSACTION_ID,
      DR_ACCT_NO,
      CR_ACCT_NO,
      AMOUNT,
      NARRATION,
      CREATED_BY,
      TRANSACTION_TYPE: TRANSACTION_TYPE || 'GENERAL',
      CURRENCY_CODE,
      STATUS,
      TransactionId: await generateTransactionId(),
    }, { transaction });

    // Audit trail (using Sequelize transaction)
    await addAuditTrail({
      event_type: 'CREATE_GL_ACCOUNT_TRANSACTION',
      user_id: CREATED_BY,
      action: 'CREATE',
      new_value: {
        JOURNAL_ID, TRANSACTION_ID, DR_ACCT_NO, CR_ACCT_NO, AMOUNT, NARRATION,
        TRANSACTION_TYPE: newTransaction.TRANSACTION_TYPE, STATUS: newTransaction.STATUS,
        organizationName, branchName,
      },
      old_value: null,
      ip_address: req.ip || '0.0.0.0',
      entity_id: newTransaction.id,
      entity_type: 'GLAccountTransaction',
      status: 'SUCCESS',
      description: `Created GL account transaction ${TRANSACTION_ID}`,
      reference_no: `TXN-${newTransaction.id}`,
      account_no: `${DR_ACCT_NO}/${CR_ACCT_NO}`,
    }, { transaction });

    await transaction.commit();
    return res.status(201).json({
      success: true,
      message: 'GL account transaction created successfully',
      data: newTransaction,
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error creating GL account transaction', { error: error.message, body: req.body });
    const status = error.message.includes('Missing') || error.message.includes('Invalid') || error.message.includes('Duplicate') ? 400 : 500;
    return res.status(status).json({
      success: false,
      message: 'Error creating GL account transaction',
      error: error.message,
      code: error.message.includes('Missing') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
    });
  }
};

// ==================== GET PENDING TRANSACTIONS (from queue) ====================
export const getPendingTransactions = async (req, res) => {
  try {
    const { organizationName, branchName } = req.query;
    const where = { QUEUE_STATUS: 'Pending' };
    if (organizationName) where.organizationName = { [Op.iLike]: organizationName };
    if (branchName) where.branchName = { [Op.iLike]: branchName };

    const pendingTransactions = await GLTransactionQueue.findAll({ where, raw: true });

    auditLogger.info('Audit Event', {
      entity_type: 'pending_gl_queue_query',
      user_id: req.user_id || 'system',
      action: 'get_pending_transactions',
      new_value: { count: pendingTransactions.length, filters: { organizationName, branchName } },
      ip_address: req.ip_address || '0.0.0.0',
      event_type: 'QUERY_SUCCESS',
      outcome: 'success',
    });

    return res.status(200).json({
      success: true,
      message: 'Pending transactions retrieved successfully',
      count: pendingTransactions.length,
      data: pendingTransactions,
    });
  } catch (err) {
    logger.error('Fetch Pending Transactions Error:', err);
    auditLogger.error('Audit Event', {
      entity_type: 'pending_gl_queue_query',
      user_id: req.user_id || 'system',
      action: 'get_pending_transactions',
      ip_address: req.ip || 'unknown',
      event_type: 'QUERY_ERROR',
      outcome: 'failure',
      error: err.message,
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pending transactions',
      error: err.message,
    });
  }
};

// ==================== APPROVE GL TRANSACTION (from queue) ====================
export const approveGLTransaction = async (req, res) => {
  const dbTransaction = await sequelize.transaction();
  try {
    const { transactionId } = req.params;
    const { approverId, organizationName, branchName } = req.body;

    if (!transactionId || !approverId || !organizationName || !branchName) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    // Validate branch
    const branch = await Branch.findOne({
      where: {
        organizationName: { [Op.iLike]: organizationName },
        branchName: { [Op.iLike]: branchName },
      },
    });
    if (!branch) {
      return res.status(400).json({ message: `Branch ${branchName} not found for organization ${organizationName}` });
    }

    // Find queued transaction (by ID or JOURNAL_ID)
    let transaction = null;
    if (/^\d+$/.test(transactionId)) {
      transaction = await GLTransactionQueue.findByPk(transactionId);
    }
    if (!transaction) {
      transaction = await GLTransactionQueue.findOne({ where: { JOURNAL_ID: transactionId, organizationName, branchName } });
    }
    if (!transaction) {
      auditLogger.info('Audit Event', {
        entity_type: 'gl_transaction_approval',
        entity_id: transactionId,
        user_id: req.user_id || 'system',
        action: 'approve_gl_transaction',
        new_value: { status: 'not_found' },
        ip_address: req.ip_address || '0.0.0.0',
        event_type: 'APPROVAL_NOT_FOUND',
        outcome: 'failure',
      });
      return res.status(404).json({ message: 'Queued transaction not found' });
    }
    if (transaction.APPROVAL_STATUS !== 'Pending') {
      return res.status(400).json({ message: `Transaction is already ${transaction.APPROVAL_STATUS}` });
    }

    // Approve and post
    transaction.APPROVAL_STATUS = 'Approved';
    transaction.APPROVED_BY = approverId;
    transaction.APPROVED_AT = new Date();
    await transaction.save({ transaction: dbTransaction });

    const txnIdNum = await generateTransactionId();
    const processedTxn = await postSingleGLTransaction({
      JOURNAL_ID: transaction.JOURNAL_ID,
      GL_ACCT_NO: transaction.GL_ACCT_NO,
      AMOUNT: transaction.AMOUNT,
      TRANSACTION_TYPE: transaction.TRANSACTION_TYPE,
      CREATED_BY: transaction.CREATED_BY,
      description: `Approved transaction ${transaction.JOURNAL_ID}`,
      SUB_LEDGER_NO: transaction.SUB_LEDGER_NO || '0000',
      SEG_NO: transaction.SEG_NO || 1,
      TransactionId: txnIdNum,
    }, req, dbTransaction);

    // Update reconciliation
    let reconciliation = await Reconciliation.findOne({
      where: {
        JOURNAL_ID: transaction.JOURNAL_ID,
        GL_ACCT_NO: transaction.GL_ACCT_NO,
        TRANSACTION_ID: txnIdNum,
        organizationName,
        branchName,
      },
      transaction: dbTransaction,
    });
    if (!reconciliation) {
      reconciliation = await Reconciliation.create({
        JOURNAL_ID: transaction.JOURNAL_ID,
        GL_ACCT_NO: transaction.GL_ACCT_NO,
        TRANSACTION_ID: txnIdNum,
        EXTERNAL_REF: transaction.EXTERNAL_REF || null,
        STATUS: 'Pending',
        AMOUNT: transaction.AMOUNT,
        CURRENCY_CODE: 'NGN',
        organizationName,
        branchName,
        CREATED_AT: new Date(),
      }, { transaction: dbTransaction });
    } else {
      reconciliation.STATUS = 'Pending';
      reconciliation.UPDATED_AT = new Date();
      await reconciliation.save({ transaction: dbTransaction });
    }

    transaction.QUEUE_STATUS = 'Processed';
    transaction.PROCESSED_AT = new Date();
    await transaction.save({ transaction: dbTransaction });

    auditLogger.info('Audit Event', {
      entity_type: 'GL_TRANSACTION_APPROVAL',
      entity_id: transaction.id,
      user_id: approverId,
      action: 'APPROVE',
      new_value: { transactionId: transaction.id, reconciliationId: reconciliation.id },
      ip_address: req.ip_address || '0.0.0.0',
      event_type: 'GL_TRANSACTION_APPROVAL',
      outcome: 'success',
      description: `Approved transaction ${transaction.JOURNAL_ID} in ${organizationName}/${branchName}`,
    });

    const updatedBalance = (await GLAccount.findOne({ where: { GL_ACCT_NO: transaction.GL_ACCT_NO } }))?.LEDGER_BALANCE;

    await dbTransaction.commit();
    return res.status(200).json({
      message: 'Transaction approved and processed successfully',
      transaction: processedTxn,
      reconciliation,
      updatedBalance,
    });
  } catch (err) {
    await dbTransaction.rollback();
    logger.error('Approve GL Transaction Error:', err);
    auditLogger.error('Audit Event', {
      entity_type: 'GL_TRANSACTION_APPROVAL',
      entity_id: req.params.transactionId || null,
      user_id: req.body.approverId || 'system',
      action: 'approve_gl_transaction',
      ip_address: req.ip || 'unknown',
      event_type: 'APPROVAL_ERROR',
      outcome: 'failure',
      error: err.message,
    });
    const status = err.message.includes('Missing') || err.message.includes('not found') || err.message.includes('already') ? 400 : 500;
    return res.status(status).json({
      message: 'Transaction approval failed',
      error: err.message,
    });
  }
};

// ==================== REJECT GL TRANSACTION ====================
export const rejectGLTransaction = async (req, res) => {
  const dbTransaction = await sequelize.transaction();
  try {
    const { transactionId } = req.params;
    const { approverId, reason, organizationName, branchName } = req.body;

    if (!transactionId || !approverId || !organizationName || !branchName) {
      return res.status(400).json({ message: 'Missing required parameters' });
    }

    const branch = await Branch.findOne({
      where: {
        organizationName: { [Op.iLike]: organizationName },
        branchName: { [Op.iLike]: branchName },
      },
    });
    if (!branch) {
      return res.status(400).json({ message: `Branch ${branchName} not found for organization ${organizationName}` });
    }

    let transaction = null;
    if (/^\d+$/.test(transactionId)) {
      transaction = await GLTransactionQueue.findByPk(transactionId);
    }
    if (!transaction) {
      transaction = await GLTransactionQueue.findOne({ where: { JOURNAL_ID: transactionId, organizationName, branchName } });
    }
    if (!transaction) {
      auditLogger.info('Audit Event', {
        entity_type: 'gl_transaction_rejection',
        entity_id: transactionId,
        user_id: req.user_id || 'system',
        action: 'reject_gl_transaction',
        new_value: { status: 'not_found' },
        ip_address: req.ip_address || '0.0.0.0',
        event_type: 'REJECTION_NOT_FOUND',
        outcome: 'failure',
      });
      return res.status(404).json({ message: 'Queued transaction not found' });
    }
    if (transaction.APPROVAL_STATUS !== 'Pending') {
      return res.status(400).json({ message: `Transaction is already ${transaction.APPROVAL_STATUS}` });
    }

    transaction.APPROVAL_STATUS = 'Rejected';
    transaction.REJECTED_BY = approverId;
    transaction.REJECTED_AT = new Date();
    transaction.REJECTION_REASON = reason || 'No reason provided';
    transaction.QUEUE_STATUS = 'Rejected';
    await transaction.save({ transaction: dbTransaction });

    const reconciliation = await Reconciliation.findOne({
      where: {
        JOURNAL_ID: transaction.JOURNAL_ID,
        GL_ACCT_NO: transaction.GL_ACCT_NO,
        organizationName,
        branchName,
      },
      transaction: dbTransaction,
    });
    if (reconciliation) {
      reconciliation.STATUS = 'Discrepancy';
      reconciliation.DISCREPANCY_REASON = reason || 'Transaction rejected';
      reconciliation.UPDATED_AT = new Date();
      await reconciliation.save({ transaction: dbTransaction });
    }

    auditLogger.info('Audit Event', {
      entity_type: 'GL_TRANSACTION_APPROVAL',
      entity_id: transaction.id,
      user_id: approverId,
      action: 'REJECT',
      new_value: { transactionId: transaction.id, reconciliationId: reconciliation?.id },
      ip_address: req.ip_address || '0.0.0.0',
      event_type: 'GL_TRANSACTION_APPROVAL',
      outcome: 'success',
      description: `Rejected transaction ${transaction.JOURNAL_ID} in ${organizationName}/${branchName}`,
      rejection_reason: reason,
    });

    await dbTransaction.commit();
    return res.status(200).json({
      message: 'Transaction rejected successfully',
      transaction,
      reconciliation,
    });
  } catch (err) {
    await dbTransaction.rollback();
    logger.error('Reject GL Transaction Error:', err);
    auditLogger.error('Audit Event', {
      entity_type: 'GL_TRANSACTION_APPROVAL',
      entity_id: req.params.transactionId || null,
      user_id: req.body.approverId || 'system',
      action: 'reject_gl_transaction',
      ip_address: req.ip || 'unknown',
      event_type: 'REJECTION_ERROR',
      outcome: 'failure',
      error: err.message,
    });
    const status = err.message.includes('Missing') || err.message.includes('not found') || err.message.includes('already') ? 400 : 500;
    return res.status(status).json({
      message: 'Transaction rejection failed',
      error: err.message,
    });
  }
};

// ==================== PROCESS END‑OF‑DAY GL TRANSACTIONS ====================
export const processEODGLTransactionsService = async (externalTransaction = null) => {
  const useOwnTransaction = !externalTransaction;
  const t = externalTransaction || await sequelize.transaction();
  try {
    const pendingTransactions = await GLTransactionQueue.findAll({
      where: { QUEUE_STATUS: 'Pending' },
      transaction: t,
    });

    if (pendingTransactions.length === 0) {
      if (useOwnTransaction) await t.commit();
      return { success: true, message: 'No pending GL transactions to process', processed: [] };
    }

    const processed = [];
    for (const txn of pendingTransactions) {
      const { GL_ACCT_NO, TRANSACTION_TYPE, AMOUNT, CREATED_BY, JOURNAL_ID, SUB_LEDGER_NO, SEG_NO, organizationName, branchName } = txn;

      const branch = await Branch.findOne({
        where: { organizationName: { [Op.iLike]: organizationName }, branchName: { [Op.iLike]: branchName } },
        transaction: t,
      });
      if (!branch) {
        txn.QUEUE_STATUS = 'Failed';
        txn.PROCESSED_AT = new Date();
        await txn.save({ transaction: t });
        processed.push({ transactionId: txn.id, status: 'Failed', error: `Branch not found` });
        continue;
      }

      const glAccount = await GLAccount.findOne({ where: { GL_ACCT_NO, organizationName, branchName }, transaction: t });
      if (!glAccount || !glAccount.DELAY_GL_POSTING) {
        txn.QUEUE_STATUS = 'Failed';
        txn.PROCESSED_AT = new Date();
        await txn.save({ transaction: t });
        processed.push({ transactionId: txn.id, status: 'Failed', error: `GL Account not found or DELAY_GL_POSTING not enabled` });
        continue;
      }

      const txnIdNum = await generateTransactionId();
      const processedTxn = await postSingleGLTransaction({
        JOURNAL_ID,
        GL_ACCT_NO,
        AMOUNT,
        TRANSACTION_TYPE,
        CREATED_BY,
        description: `EOD processed transaction ${JOURNAL_ID}`,
        SUB_LEDGER_NO: SUB_LEDGER_NO || '0000',
        SEG_NO: SEG_NO || 1,
        TransactionId: txnIdNum,
      }, null, t);

      let reconciliation = await Reconciliation.findOne({
        where: { JOURNAL_ID, GL_ACCT_NO, TRANSACTION_ID: txnIdNum, organizationName, branchName },
        transaction: t,
      });
      if (!reconciliation) {
        reconciliation = await Reconciliation.create({
          JOURNAL_ID,
          GL_ACCT_NO,
          TRANSACTION_ID: txnIdNum,
          EXTERNAL_REF: txn.EXTERNAL_REF || null,
          STATUS: 'Pending',
          AMOUNT,
          CURRENCY_CODE: 'NGN',
          organizationName,
          branchName,
          CREATED_AT: new Date(),
        }, { transaction: t });
      } else {
        reconciliation.STATUS = 'Pending';
        reconciliation.UPDATED_AT = new Date();
        await reconciliation.save({ transaction: t });
      }

      txn.QUEUE_STATUS = 'Processed';
      txn.PROCESSED_AT = new Date();
      await txn.save({ transaction: t });

      processed.push({
        transactionId: txn.id,
        TransactionId: txnIdNum,
        GL_ACCT_NO,
        TRANSACTION_TYPE,
        AMOUNT,
        JOURNAL_ID,
        processedAt: txn.PROCESSED_AT,
        reconciliationId: reconciliation.id,
      });
    }

    if (useOwnTransaction) await t.commit();
    return { success: true, message: 'EOD GL transactions processed successfully', processed };
  } catch (error) {
    if (useOwnTransaction && t) await t.rollback();
    logger.error('Error in processEODGLTransactionsService:', error);
    return { success: false, error: error.message || 'Internal Server Error' };
  }
};

// ==================== CREATE DOUBLE‑ENTRY TRANSACTION ====================
export const createDoubleEntryTransaction = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { debitEntry, creditEntry } = req.body;
    if (!debitEntry || !creditEntry) throw new Error('Missing debit or credit entry');
    if (parseFloat(debitEntry.AMOUNT) !== parseFloat(creditEntry.AMOUNT)) throw new Error('Debit and credit amounts must match');
    if (!debitEntry.organizationName || !debitEntry.branchName || !creditEntry.organizationName || !creditEntry.branchName) {
      throw new Error('organizationName and branchName are required for both entries');
    }

    const debitBranch = await Branch.findOne({
      where: {
        organizationName: { [Op.iLike]: debitEntry.organizationName },
        branchName: { [Op.iLike]: debitEntry.branchName },
      },
      transaction,
    });
    const creditBranch = await Branch.findOne({
      where: {
        organizationName: { [Op.iLike]: creditEntry.organizationName },
        branchName: { [Op.iLike]: creditEntry.branchName },
      },
      transaction,
    });
    if (!debitBranch) throw new Error(`Debit branch ${debitEntry.branchName} not found`);
    if (!creditBranch) throw new Error(`Credit branch ${creditEntry.branchName} not found`);

    const txnId1 = await generateTransactionId();
    const txnId2 = await generateTransactionId();

    const debitTxn = await GLAccountTransaction.create({
      JOURNAL_ID: debitEntry.JOURNAL_ID,
      DR_ACCT_NO: debitEntry.GL_ACCT_NO,
      CR_ACCT_NO: null,
      AMOUNT: debitEntry.AMOUNT,
      NARRATION: debitEntry.NARRATION,
      CREATED_BY: debitEntry.CREATED_BY,
      TRANSACTION_TYPE: 'Debit',
      STATUS: 'POSTED',
      TransactionId: txnId1,
    }, { transaction });

    const creditTxn = await GLAccountTransaction.create({
      JOURNAL_ID: creditEntry.JOURNAL_ID,
      DR_ACCT_NO: null,
      CR_ACCT_NO: creditEntry.GL_ACCT_NO,
      AMOUNT: creditEntry.AMOUNT,
      NARRATION: creditEntry.NARRATION,
      CREATED_BY: creditEntry.CREATED_BY,
      TRANSACTION_TYPE: 'Credit',
      STATUS: 'POSTED',
      TransactionId: txnId2,
    }, { transaction });

    const debitReconciliation = await Reconciliation.create({
      JOURNAL_ID: debitTxn.JOURNAL_ID,
      GL_ACCT_NO: debitTxn.DR_ACCT_NO,
      TRANSACTION_ID: txnId1,
      EXTERNAL_REF: debitEntry.EXTERNAL_REF || null,
      STATUS: 'Pending',
      AMOUNT: debitEntry.AMOUNT,
      CURRENCY_CODE: 'NGN',
      organizationName: debitEntry.organizationName,
      branchName: debitEntry.branchName,
      CREATED_AT: new Date(),
    }, { transaction });

    const creditReconciliation = await Reconciliation.create({
      JOURNAL_ID: creditTxn.JOURNAL_ID,
      GL_ACCT_NO: creditTxn.CR_ACCT_NO,
      TRANSACTION_ID: txnId2,
      EXTERNAL_REF: creditEntry.EXTERNAL_REF || null,
      STATUS: 'Pending',
      AMOUNT: creditEntry.AMOUNT,
      CURRENCY_CODE: 'NGN',
      organizationName: creditEntry.organizationName,
      branchName: creditEntry.branchName,
      CREATED_AT: new Date(),
    }, { transaction });

    auditLogger.info('Audit Event', {
      entity_type: 'DOUBLE_ENTRY_TRANSACTION',
      entity_id: debitTxn.id,
      user_id: debitEntry.CREATED_BY,
      action: 'CREATE',
      new_value: { debitTransactionId: debitTxn.id, creditTransactionId: creditTxn.id },
      ip_address: req.ip || 'UNKNOWN',
      event_type: 'DOUBLE_ENTRY_TRANSACTION',
      outcome: 'success',
      description: `Created double-entry transaction for ${debitTxn.DR_ACCT_NO} and ${creditTxn.CR_ACCT_NO}`,
    });

    await transaction.commit();
    return res.status(201).json({
      message: 'Double-entry transaction processed successfully',
      debitTransaction: debitTxn,
      creditTransaction: creditTxn,
      debitReconciliation,
      creditReconciliation,
    });
  } catch (err) {
    await transaction.rollback();
    logger.error('Double Entry Transaction Error:', err);
    auditLogger.error('Audit Event', {
      entity_type: 'DOUBLE_ENTRY_TRANSACTION',
      user_id: req.body.debitEntry?.CREATED_BY || 'system',
      action: 'create_double_entry_transaction',
      ip_address: req.ip || 'unknown',
      event_type: 'DOUBLE_ENTRY_ERROR',
      outcome: 'failure',
      error: err.message,
    });
    const status = err.message.includes('required') || err.message.includes('Invalid') || err.message.includes('not found') ? 400 : 500;
    return res.status(status).json({
      message: 'Double-entry transaction failed',
      error: err.message,
    });
  }
};

// ==================== GET BY ACCOUNT NUMBER ====================
export const getGLAccountTransactionByAcctNo = async (req, res) => {
  try {
    const { glAcctNo, organizationName, branchName } = req.params;
    if (!organizationName || !branchName) {
      return res.status(400).json({ message: 'organizationName and branchName are required' });
    }

    const transactions = await GLAccountTransaction.findAll({
      where: {
        [Op.or]: [{ DR_ACCT_NO: glAcctNo }, { CR_ACCT_NO: glAcctNo }],
      },
      order: [['createdAt', 'DESC']],
    });

    if (transactions.length === 0) {
      auditLogger.info('Audit Event', {
        entity_type: 'gl_transaction_by_acct_query',
        entity_id: glAcctNo,
        user_id: req.user_id || 'system',
        action: 'get_gl_account_transaction_by_acct_no',
        new_value: { status: 'not_found' },
        ip_address: req.ip_address || '0.0.0.0',
        event_type: 'QUERY_NOT_FOUND',
        outcome: 'failure',
      });
      return res.status(404).json({ message: 'No transactions found for GL Account' });
    }

    const transactionIds = transactions.map(t => t.TransactionId);
    const reconciliations = await Reconciliation.findAll({
      where: { TRANSACTION_ID: transactionIds, organizationName, branchName },
    });
    const reconciliationMap = Object.fromEntries(reconciliations.map(r => [r.TRANSACTION_ID, r]));

    const result = transactions.map(t => ({
      ...t.toJSON(),
      reconciliation: reconciliationMap[t.TransactionId] || null,
    }));

    auditLogger.info('Audit Event', {
      entity_type: 'gl_transaction_by_acct_query',
      entity_id: glAcctNo,
      user_id: req.user_id || 'system',
      action: 'get_gl_account_transaction_by_acct_no',
      new_value: { count: result.length },
      ip_address: req.ip_address || '0.0.0.0',
      event_type: 'QUERY_SUCCESS',
      outcome: 'success',
    });

    return res.status(200).json({
      message: 'GL Account transactions retrieved successfully',
      data: result,
    });
  } catch (err) {
    logger.error('Fetch GL Transactions By Acct No Error:', err);
    auditLogger.error('Audit Event', {
      entity_type: 'gl_transaction_by_acct_query',
      entity_id: req.params.glAcctNo || null,
      user_id: req.user_id || 'system',
      action: 'get_gl_account_transaction_by_acct_no',
      ip_address: req.ip || 'unknown',
      event_type: 'QUERY_ERROR',
      outcome: 'failure',
      error: err.message,
    });
    return res.status(500).json({
      message: 'Failed to fetch GL transactions',
      error: err.message,
    });
  }
};

// ==================== GET BY ID ====================
export const getGLAccountTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await GLAccountTransaction.findByPk(id);
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: `GL account transaction with ID ${id} not found`,
      });
    }
    return res.status(200).json({
      success: true,
      message: 'GL account transaction fetched successfully',
      data: transaction,
    });
  } catch (error) {
    logger.error('Error fetching GL account transaction by ID', { error: error.message, id: req.params.id });
    return res.status(500).json({
      success: false,
      message: 'Error fetching GL account transaction',
      error: error.message,
    });
  }
};

// ==================== UPDATE ====================
export const updateGLAccountTransaction = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const {
      JOURNAL_ID, DR_ACCT_NO, CR_ACCT_NO, AMOUNT, NARRATION, UPDATED_BY,
      TRANSACTION_TYPE, CURRENCY_CODE, STATUS, organizationName, branchName,
    } = req.body;

    const existing = await GLAccountTransaction.findByPk(id);
    if (!existing) throw new Error(`Transaction with ID ${id} not found`);

    if (req.body.TRANSACTION_ID && req.body.TRANSACTION_ID !== existing.TRANSACTION_ID) {
      throw new Error('TRANSACTION_ID cannot be updated');
    }

    if (JOURNAL_ID !== undefined) existing.JOURNAL_ID = JOURNAL_ID;
    if (DR_ACCT_NO !== undefined) existing.DR_ACCT_NO = DR_ACCT_NO;
    if (CR_ACCT_NO !== undefined) existing.CR_ACCT_NO = CR_ACCT_NO;
    if (AMOUNT !== undefined) {
      if (AMOUNT <= 0) throw new Error('Amount must be greater than 0');
      existing.AMOUNT = AMOUNT;
    }
    if (NARRATION !== undefined) existing.NARRATION = NARRATION;
    if (TRANSACTION_TYPE !== undefined) existing.TRANSACTION_TYPE = TRANSACTION_TYPE;
    if (CURRENCY_CODE !== undefined) existing.CURRENCY_CODE = CURRENCY_CODE;
    if (STATUS !== undefined) {
      if (!['POSTED', 'PENDING', 'REVERSED'].includes(STATUS)) throw new Error('Invalid STATUS value');
      existing.STATUS = STATUS;
    }
    if (organizationName !== undefined) existing.organizationName = organizationName;
    if (branchName !== undefined) existing.branchName = branchName;
    existing.UPDATED_BY = UPDATED_BY;
    existing.updatedAt = new Date();

    await existing.save({ transaction });

    await addAuditTrail({
      EVENT_TYPE: 'UPDATE_GL_ACCOUNT_TRANSACTION',
      USER_ID: UPDATED_BY,
      ACTION: 'UPDATE',
      NEW_VALUE: {
        JOURNAL_ID, DR_ACCT_NO, CR_ACCT_NO, AMOUNT, NARRATION,
        TRANSACTION_TYPE, STATUS, organizationName, branchName,
      },
      OLD_VALUE: { STATUS: req.body.STATUS !== undefined ? existing.STATUS : null },
      IP_ADDRESS: req.ip || '0.0.0.0',
      ENTITY_ID: id,
      ENTITY_TYPE: 'GLAccountTransaction',
      STATUS: 'SUCCESS',
      DESCRIPTION: `Updated GL account transaction ${existing.TRANSACTION_ID}`,
      REFERENCE_NO: `TXN-${id}`,
      ACCOUNT_NO: `${existing.DR_ACCT_NO}/${existing.CR_ACCT_NO}`,
    }, { transaction });

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: 'GL account transaction updated successfully',
      data: existing,
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error updating GL account transaction', { error: error.message, body: req.body });
    const status = error.message.includes('not found') || error.message.includes('Invalid') ? 400 : 500;
    return res.status(status).json({
      success: false,
      message: 'Error updating GL account transaction',
      error: error.message,
    });
  }
};

// ==================== DELETE ====================
export const deleteGLAccountTransaction = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { DELETED_BY } = req.body;
    const existing = await GLAccountTransaction.findByPk(id);
    if (!existing) throw new Error(`Transaction with ID ${id} not found`);
    if (existing.STATUS === 'POSTED') {
      throw new Error(`Cannot delete posted transaction ${existing.TRANSACTION_ID}; use reverse instead`);
    }

    await existing.destroy({ transaction });

    await addAuditTrail({
      EVENT_TYPE: 'DELETE_GL_ACCOUNT_TRANSACTION',
      USER_ID: DELETED_BY,
      ACTION: 'DELETE',
      OLD_VALUE: {
        JOURNAL_ID: existing.JOURNAL_ID,
        TRANSACTION_ID: existing.TRANSACTION_ID,
        DR_ACCT_NO: existing.DR_ACCT_NO,
        CR_ACCT_NO: existing.CR_ACCT_NO,
        AMOUNT: existing.AMOUNT,
        STATUS: existing.STATUS,
        organizationName: existing.organizationName,
        branchName: existing.branchName,
      },
      IP_ADDRESS: req.ip || '0.0.0.0',
      ENTITY_ID: id,
      ENTITY_TYPE: 'GLAccountTransaction',
      STATUS: 'SUCCESS',
      DESCRIPTION: `Deleted GL account transaction ${existing.TRANSACTION_ID}`,
      REFERENCE_NO: `TXN-${id}`,
      ACCOUNT_NO: `${existing.DR_ACCT_NO}/${existing.CR_ACCT_NO}`,
    }, { transaction });

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: 'GL account transaction deleted successfully',
      data: existing,
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error deleting GL account transaction', { error: error.message, params: req.params });
    const status = error.message.includes('not found') || error.message.includes('Cannot delete') ? 400 : 500;
    return res.status(status).json({
      success: false,
      message: 'Error deleting GL account transaction',
      error: error.message,
    });
  }
};

// ==================== GET GL ACCOUNT BY ACCT NO ====================
export const getGLAccountByAcctNo = async (req, res) => {
  try {
    const { glAcctNo, organizationName, branchName } = req.params;
    const account = await GLAccount.findOne({
      where: { GL_ACCT_NO: glAcctNo, organizationName, branchName },
    });
    if (!account) {
      return res.status(404).json({
        success: false,
        message: `GL account with number ${glAcctNo} not found`,
      });
    }
    return res.status(200).json({
      success: true,
      message: 'GL account fetched successfully',
      data: account,
    });
  } catch (error) {
    logger.error('Error fetching GL account by account number', { error: error.message, params: req.params });
    return res.status(500).json({
      success: false,
      message: 'Error fetching GL account',
      error: error.message,
    });
  }
};

// ==================== GET GL ACCOUNT TRANSACTIONS (alias) ====================
export const getGLAccountTransactions = getAllGLAccountTransactions;

// ==================== DEFAULT EXPORT ====================
export default {
  getGLAccountTransactions,
  deleteGLAccountTransaction,
  updateGLAccountTransaction,
  getGLAccountTransactionById,
  getGLAccountTransactionByAcctNo,
  createDoubleEntryTransaction,
  processEODGLTransactionsService,
  rejectGLTransaction,
  approveGLTransaction,
  getPendingTransactions,
  getAllGLAccountTransactions,
  getGLAccountByAcctNo,
};