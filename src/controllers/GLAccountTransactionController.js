// controllers/GLAccountTransactionController.js - FIXED with ledger balance updates
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import GLAccount from '../models/GLAccount.js';
import Ledger from '../models/Ledger.js'; // ✅ Import Ledger for balance updates
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

// ✅ FIXED: Helper to post a single GL transaction with BOTH sides
const postSingleGLTransaction = async (data, req, transaction) => {
  try {
    // Determine if it's a debit or credit transaction
    const isDebit = data.TRANSACTION_TYPE === 'Debit' || data.TRANSACTION_TYPE === 'DR';
    const isCredit = data.TRANSACTION_TYPE === 'Credit' || data.TRANSACTION_TYPE === 'CR';
    
    // ✅ Create the transaction with BOTH DR and CR accounts
    const newTxn = await GLAccountTransaction.create({
      JOURNAL_ID: data.JOURNAL_ID,
      DR_ACCT_NO: isDebit ? data.GL_ACCT_NO : null,
      CR_ACCT_NO: isCredit ? data.GL_ACCT_NO : null,
      AMOUNT: data.AMOUNT,
      NARRATION: data.description || `Approved transaction ${data.JOURNAL_ID}`,
      CREATED_BY: data.CREATED_BY,
      TRANSACTION_TYPE: data.TRANSACTION_TYPE,
      CURRENCY_CODE: 'NGN',
      STATUS: 'POSTED',
      TransactionId: data.TransactionId,
      BU_ID: data.SEG_NO || '001',
      organizationCode: data.organizationCode || '1',
      branchCode: data.branchCode || '001',
    }, { transaction });

    // ✅ AFTER creating, we need to update the ledger balance
    // The afterCreate hook should handle this, but we'll also do it explicitly
    if (newTxn.STATUS === 'POSTED') {
      const amountNum = parseFloat(newTxn.AMOUNT);
      
      // Update DR account if exists
      if (newTxn.DR_ACCT_NO) {
        await Ledger.updateBalanceForTransaction(
          newTxn.DR_ACCT_NO,
          amountNum,
          false, // isCredit = false (this is a DEBIT)
          { transaction }
        );
        logger.info(`✅ Updated DR ledger ${newTxn.DR_ACCT_NO} with ${amountNum}`);
      }
      
      // Update CR account if exists
      if (newTxn.CR_ACCT_NO) {
        await Ledger.updateBalanceForTransaction(
          newTxn.CR_ACCT_NO,
          amountNum,
          true, // isCredit = true (this is a CREDIT)
          { transaction }
        );
        logger.info(`✅ Updated CR ledger ${newTxn.CR_ACCT_NO} with ${amountNum}`);
      }
    }

    return newTxn;
  } catch (error) {
    logger.error('❌ Error in postSingleGLTransaction:', error.message);
    throw error;
  }
};

// ✅ NEW: Helper to post a full double-entry transaction
const postDoubleEntryTransaction = async (data, req, transaction) => {
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
      SEG_NO = '001',
      organizationCode = '1',
      branchCode = '001',
    } = data;

    // Validate
    if (!DR_ACCT_NO || !CR_ACCT_NO) {
      throw new Error('Both DR_ACCT_NO and CR_ACCT_NO are required for double-entry');
    }
    if (!AMOUNT || AMOUNT <= 0) {
      throw new Error('Amount must be greater than 0');
    }

    // Generate transaction IDs
    const txnId1 = await generateTransactionId();
    const txnId2 = await generateTransactionId();

    // Create DEBIT transaction
    const debitTxn = await GLAccountTransaction.create({
      JOURNAL_ID: JOURNAL_ID,
      DR_ACCT_NO: DR_ACCT_NO,
      CR_ACCT_NO: null,
      AMOUNT: AMOUNT,
      NARRATION: `DR: ${NARRATION}`,
      CREATED_BY: CREATED_BY,
      TRANSACTION_TYPE: 'DR',
      CURRENCY_CODE: CURRENCY_CODE,
      STATUS: 'POSTED',
      TransactionId: txnId1,
      BU_ID: SEG_NO,
      organizationCode: organizationCode,
      branchCode: branchCode,
    }, { transaction });

    // Create CREDIT transaction
    const creditTxn = await GLAccountTransaction.create({
      JOURNAL_ID: JOURNAL_ID,
      DR_ACCT_NO: null,
      CR_ACCT_NO: CR_ACCT_NO,
      AMOUNT: AMOUNT,
      NARRATION: `CR: ${NARRATION}`,
      CREATED_BY: CREATED_BY,
      TRANSACTION_TYPE: 'CR',
      CURRENCY_CODE: CURRENCY_CODE,
      STATUS: 'POSTED',
      TransactionId: txnId2,
      BU_ID: SEG_NO,
      organizationCode: organizationCode,
      branchCode: branchCode,
    }, { transaction });

    // ✅ Update ledger balances
    const amountNum = parseFloat(AMOUNT);
    
    // Update DR account (debit)
    await Ledger.updateBalanceForTransaction(
      DR_ACCT_NO,
      amountNum,
      false, // isCredit = false (DEBIT)
      { transaction }
    );
    
    // Update CR account (credit)
    await Ledger.updateBalanceForTransaction(
      CR_ACCT_NO,
      amountNum,
      true, // isCredit = true (CREDIT)
      { transaction }
    );

    logger.info(`✅ Double-entry posted: ${DR_ACCT_NO} DR ${amountNum}, ${CR_ACCT_NO} CR ${amountNum}`);

    return {
      debitTransaction: debitTxn,
      creditTransaction: creditTxn,
    };
  } catch (error) {
    logger.error('❌ Error in postDoubleEntryTransaction:', error.message);
    throw error;
  }
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
  let transactionCommitted = false;
  
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
      SEG_NO = '001',
      organizationCode = '1',
      branchCode = '001',
    } = req.body;

    // Validate required fields
    const required = { JOURNAL_ID, DR_ACCT_NO, CR_ACCT_NO, AMOUNT, NARRATION, CREATED_BY, organizationName, branchName };
    const missing = Object.entries(required).filter(([_, v]) => !v).map(([k]) => k);
    if (missing.length) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
    if (AMOUNT <= 0) throw new Error('Amount must be greater than 0');

    // Verify GL accounts exist
    const drAccount = await GLAccount.findOne({ where: { GL_ACCT_NO: DR_ACCT_NO } });
    const crAccount = await GLAccount.findOne({ where: { GL_ACCT_NO: CR_ACCT_NO } });
    if (!drAccount || !crAccount) throw new Error('One or both GL accounts not found');

    // Generate unique TRANSACTION_ID if not provided
    const TRANSACTION_ID = req.body.TRANSACTION_ID || `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const existing = await GLAccountTransaction.findOne({ where: { TRANSACTION_ID } });
    if (existing) throw new Error(`Transaction ID ${TRANSACTION_ID} already exists`);

    // ✅ Create the transaction - the afterCreate hook will update balances
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
      BU_ID: SEG_NO,
      organizationCode: organizationCode,
      branchCode: branchCode,
    }, { transaction });

    // ✅ The afterCreate hook should have updated balances, but let's verify
    // If for some reason the hook didn't fire, update manually
    if (STATUS === 'POSTED') {
      const amountNum = parseFloat(AMOUNT);
      
      // Update DR account
      await Ledger.updateBalanceForTransaction(
        DR_ACCT_NO,
        amountNum,
        false, // DEBIT
        { transaction }
      );
      
      // Update CR account
      await Ledger.updateBalanceForTransaction(
        CR_ACCT_NO,
        amountNum,
        true, // CREDIT
        { transaction }
      );
    }

    // Audit trail
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

    transactionCommitted = true;
    await transaction.commit();
    
    // Fetch updated balances
    const updatedDrBalance = await Ledger.findOne({ where: { GL_ACCT_NO: DR_ACCT_NO } });
    const updatedCrBalance = await Ledger.findOne({ where: { GL_ACCT_NO: CR_ACCT_NO } });

    return res.status(201).json({
      success: true,
      message: 'GL account transaction created successfully',
      data: {
        transaction: newTransaction,
        balances: {
          debitAccount: {
            accountNo: DR_ACCT_NO,
            balance: updatedDrBalance?.LEDGER_BALANCE || 0
          },
          creditAccount: {
            accountNo: CR_ACCT_NO,
            balance: updatedCrBalance?.LEDGER_BALANCE || 0
          }
        }
      },
    });
  } catch (error) {
    if (!transactionCommitted) {
      await transaction.rollback();
    }
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

// ==================== APPROVE GL TRANSACTION ====================
export const approveGLTransaction = async (req, res) => {
  const dbTransaction = await sequelize.transaction();
  try {
    const { transactionId } = req.params;
    const { approverId, organizationName, branchName } = req.body;

    if (!transactionId || !approverId || !organizationName || !branchName) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing required parameters' 
      });
    }

    // Validate branch
    const Branch = (await import('../models/Branch.js')).default;
    const branch = await Branch.findOne({
      where: {
        organizationName: { [Op.iLike]: organizationName },
        branchName: { [Op.iLike]: branchName },
      },
      transaction: dbTransaction,
    });
    
    if (!branch) {
      return res.status(400).json({ 
        success: false,
        message: `Branch ${branchName} not found for organization ${organizationName}` 
      });
    }

    // Find queued transaction
    const GLTransactionQueue = (await import('../models/GLTransactionQueue.js')).default;
    let transaction = null;
    
    if (/^\d+$/.test(transactionId)) {
      transaction = await GLTransactionQueue.findByPk(transactionId);
    }
    if (!transaction) {
      transaction = await GLTransactionQueue.findOne({ 
        where: { 
          JOURNAL_ID: transactionId, 
          organizationName, 
          branchName 
        } 
      });
    }
    
    if (!transaction) {
      return res.status(404).json({ 
        success: false,
        message: 'Queued transaction not found' 
      });
    }
    
    if (transaction.APPROVAL_STATUS !== 'Pending') {
      return res.status(400).json({ 
        success: false,
        message: `Transaction is already ${transaction.APPROVAL_STATUS}` 
      });
    }

    // Approve and post
    transaction.APPROVAL_STATUS = 'Approved';
    transaction.APPROVED_BY = approverId;
    transaction.APPROVED_AT = new Date();
    await transaction.save({ transaction: dbTransaction });

    // Create the actual transaction
    const GLAccountTransaction = (await import('../models/GLAccountTransaction.js')).default;
    const txnIdNum = await GLAccountTransaction.generateTransactionId();
    
    const processedTxn = await GLAccountTransaction.create({
      JOURNAL_ID: transaction.JOURNAL_ID,
      TRANSACTION_ID: `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      DR_ACCT_NO: transaction.TRANSACTION_TYPE === 'DR' ? transaction.GL_ACCT_NO : null,
      CR_ACCT_NO: transaction.TRANSACTION_TYPE === 'CR' ? transaction.GL_ACCT_NO : null,
      AMOUNT: transaction.AMOUNT,
      NARRATION: transaction.NARRATION || `Approved transaction ${transaction.JOURNAL_ID}`,
      CREATED_BY: transaction.CREATED_BY || approverId,
      TRANSACTION_TYPE: transaction.TRANSACTION_TYPE,
      CURRENCY_CODE: 'NGN',
      STATUS: 'POSTED',
      TransactionId: txnIdNum,
      BU_ID: branch.branchCode || '001',
      organizationCode: branch.organizationCode || '1',
      branchCode: branch.branchCode || '001',
    }, { transaction: dbTransaction });

    // Update reconciliation
    const Reconciliation = (await import('../models/Reconciliation.js')).default;
    let reconciliation = await Reconciliation.findOne({
      where: {
        JOURNAL_ID: transaction.JOURNAL_ID,
        GL_ACCT_NO: transaction.GL_ACCT_NO,
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

    // Get updated balance
    const Ledger = (await import('../models/Ledger.js')).default;
    const updatedBalance = (await Ledger.findOne({ 
      where: { GL_ACCT_NO: transaction.GL_ACCT_NO } 
    }))?.LEDGER_BALANCE;

    // Log audit
    const auditLogger = (await import('../utils/AuditLogger.js')).default;
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

    await dbTransaction.commit();
    return res.status(200).json({
      success: true,
      message: 'Transaction approved and processed successfully',
      data: {
        transaction: processedTxn,
        reconciliation,
        updatedBalance,
      },
    });
    
  } catch (err) {
    await dbTransaction.rollback();
    console.error('Approve GL Transaction Error:', err);
    const status = err.message.includes('Missing') || 
                   err.message.includes('not found') || 
                   err.message.includes('already') ? 400 : 500;
    return res.status(status).json({
      success: false,
      message: 'Transaction approval failed',
      error: err.message,
    });
  }
};


// Add this function to GLAccountTransactionController.js

// ==================== REJECT GL TRANSACTION ====================
export const rejectGLTransaction = async (req, res) => {
  const dbTransaction = await sequelize.transaction();
  try {
    const { transactionId } = req.params;
    const { approverId, reason, organizationName, branchName } = req.body;

    if (!transactionId || !approverId || !organizationName || !branchName) {
      return res.status(400).json({ 
        success: false,
        message: 'Missing required parameters' 
      });
    }

    // Validate branch
    const Branch = (await import('../models/Branch.js')).default;
    const branch = await Branch.findOne({
      where: {
        organizationName: { [Op.iLike]: organizationName },
        branchName: { [Op.iLike]: branchName },
      },
      transaction: dbTransaction,
    });
    
    if (!branch) {
      return res.status(400).json({ 
        success: false,
        message: `Branch ${branchName} not found for organization ${organizationName}` 
      });
    }

    // Find queued transaction
    const GLTransactionQueue = (await import('../models/GLTransactionQueue.js')).default;
    let transaction = null;
    
    if (/^\d+$/.test(transactionId)) {
      transaction = await GLTransactionQueue.findByPk(transactionId);
    }
    if (!transaction) {
      transaction = await GLTransactionQueue.findOne({ 
        where: { 
          JOURNAL_ID: transactionId, 
          organizationName, 
          branchName 
        } 
      });
    }
    
    if (!transaction) {
      return res.status(404).json({ 
        success: false,
        message: 'Queued transaction not found' 
      });
    }
    
    if (transaction.APPROVAL_STATUS !== 'Pending') {
      return res.status(400).json({ 
        success: false,
        message: `Transaction is already ${transaction.APPROVAL_STATUS}` 
      });
    }

    // Update transaction status to Rejected
    transaction.APPROVAL_STATUS = 'Rejected';
    transaction.REJECTED_BY = approverId;
    transaction.REJECTED_AT = new Date();
    transaction.REJECTION_REASON = reason || 'No reason provided';
    transaction.QUEUE_STATUS = 'Rejected';
    await transaction.save({ transaction: dbTransaction });

    // Update reconciliation if exists
    const Reconciliation = (await import('../models/Reconciliation.js')).default;
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

    // Log audit
    const auditLogger = (await import('../utils/AuditLogger.js')).default;
    auditLogger.info('Audit Event', {
      entity_type: 'GL_TRANSACTION_APPROVAL',
      entity_id: transaction.id,
      user_id: approverId,
      action: 'REJECT',
      new_value: { 
        transactionId: transaction.id, 
        reconciliationId: reconciliation?.id 
      },
      ip_address: req.ip_address || '0.0.0.0',
      event_type: 'GL_TRANSACTION_APPROVAL',
      outcome: 'success',
      description: `Rejected transaction ${transaction.JOURNAL_ID} in ${organizationName}/${branchName}`,
      rejection_reason: reason,
    });

    await dbTransaction.commit();
    return res.status(200).json({
      success: true,
      message: 'Transaction rejected successfully',
      data: {
        transaction,
        reconciliation
      }
    });
    
  } catch (err) {
    await dbTransaction.rollback();
    console.error('Reject GL Transaction Error:', err);
    const status = err.message.includes('Missing') || 
                   err.message.includes('not found') || 
                   err.message.includes('already') ? 400 : 500;
    return res.status(status).json({
      success: false,
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
      const { DR_ACCT_NO, CR_ACCT_NO, AMOUNT, CREATED_BY, JOURNAL_ID, organizationName, branchName } = txn;

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

      // ✅ Use double-entry posting with ledger updates
      const txnResult = await postDoubleEntryTransaction({
        JOURNAL_ID: JOURNAL_ID,
        DR_ACCT_NO: DR_ACCT_NO,
        CR_ACCT_NO: CR_ACCT_NO,
        AMOUNT: AMOUNT,
        NARRATION: `EOD processed: ${JOURNAL_ID}`,
        CREATED_BY: CREATED_BY || 'EOD_SYSTEM',
        TRANSACTION_TYPE: txn.TRANSACTION_TYPE || 'GENERAL',
        SEG_NO: txn.SEG_NO || '001',
        organizationCode: txn.organizationCode || '1',
        branchCode: txn.branchCode || '001',
      }, null, t);

      let reconciliation = await Reconciliation.findOne({
        where: { JOURNAL_ID, organizationName, branchName },
        transaction: t,
      });
      if (!reconciliation) {
        reconciliation = await Reconciliation.create({
          JOURNAL_ID,
          GL_ACCT_NO: DR_ACCT_NO,
          TRANSACTION_ID: txnResult.debitTransaction.TransactionId,
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
        JOURNAL_ID,
        AMOUNT,
        DR_ACCT_NO,
        CR_ACCT_NO,
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
  let transactionCommitted = false;
  
  try {
    const { debitEntry, creditEntry } = req.body;
    if (!debitEntry || !creditEntry) throw new Error('Missing debit or credit entry');
    if (parseFloat(debitEntry.AMOUNT) !== parseFloat(creditEntry.AMOUNT)) {
      throw new Error('Debit and credit amounts must match');
    }
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

    // ✅ Use double-entry posting with ledger updates
    const result = await postDoubleEntryTransaction({
      JOURNAL_ID: debitEntry.JOURNAL_ID || creditEntry.JOURNAL_ID,
      DR_ACCT_NO: debitEntry.GL_ACCT_NO,
      CR_ACCT_NO: creditEntry.GL_ACCT_NO,
      AMOUNT: debitEntry.AMOUNT,
      NARRATION: debitEntry.NARRATION || creditEntry.NARRATION || 'Double-entry transaction',
      CREATED_BY: debitEntry.CREATED_BY || creditEntry.CREATED_BY,
      TRANSACTION_TYPE: 'DOUBLE_ENTRY',
      SEG_NO: debitEntry.SEG_NO || '001',
      organizationCode: debitEntry.organizationCode || '1',
      branchCode: debitEntry.branchCode || '001',
    }, req, transaction);

    // Create reconciliations
    const debitReconciliation = await Reconciliation.create({
      JOURNAL_ID: debitEntry.JOURNAL_ID,
      GL_ACCT_NO: debitEntry.GL_ACCT_NO,
      TRANSACTION_ID: result.debitTransaction.TransactionId,
      EXTERNAL_REF: debitEntry.EXTERNAL_REF || null,
      STATUS: 'Pending',
      AMOUNT: debitEntry.AMOUNT,
      CURRENCY_CODE: 'NGN',
      organizationName: debitEntry.organizationName,
      branchName: debitEntry.branchName,
      CREATED_AT: new Date(),
    }, { transaction });

    const creditReconciliation = await Reconciliation.create({
      JOURNAL_ID: creditEntry.JOURNAL_ID,
      GL_ACCT_NO: creditEntry.GL_ACCT_NO,
      TRANSACTION_ID: result.creditTransaction.TransactionId,
      EXTERNAL_REF: creditEntry.EXTERNAL_REF || null,
      STATUS: 'Pending',
      AMOUNT: creditEntry.AMOUNT,
      CURRENCY_CODE: 'NGN',
      organizationName: creditEntry.organizationName,
      branchName: creditEntry.branchName,
      CREATED_AT: new Date(),
    }, { transaction });

    // ✅ Fetch updated balances
    const updatedDrBalance = await Ledger.findOne({ 
      where: { GL_ACCT_NO: debitEntry.GL_ACCT_NO } 
    });
    const updatedCrBalance = await Ledger.findOne({ 
      where: { GL_ACCT_NO: creditEntry.GL_ACCT_NO } 
    });

    auditLogger.info('Audit Event', {
      entity_type: 'DOUBLE_ENTRY_TRANSACTION',
      entity_id: result.debitTransaction.id,
      user_id: debitEntry.CREATED_BY,
      action: 'CREATE',
      new_value: { debitTransactionId: result.debitTransaction.id, creditTransactionId: result.creditTransaction.id },
      ip_address: req.ip || 'UNKNOWN',
      event_type: 'DOUBLE_ENTRY_TRANSACTION',
      outcome: 'success',
    });

    transactionCommitted = true;
    await transaction.commit();
    
    return res.status(201).json({
      success: true,
      message: 'Double-entry transaction processed successfully',
      data: {
        debitTransaction: result.debitTransaction,
        creditTransaction: result.creditTransaction,
        debitReconciliation,
        creditReconciliation,
        updatedBalances: {
          debitAccount: {
            accountNo: debitEntry.GL_ACCT_NO,
            balance: updatedDrBalance?.LEDGER_BALANCE || 0
          },
          creditAccount: {
            accountNo: creditEntry.GL_ACCT_NO,
            balance: updatedCrBalance?.LEDGER_BALANCE || 0
          }
        }
      },
    });
  } catch (err) {
    if (!transactionCommitted) {
      await transaction.rollback();
    }
    logger.error('Double Entry Transaction Error:', err);
    const status = err.message.includes('required') || err.message.includes('Invalid') || err.message.includes('not found') ? 400 : 500;
    return res.status(status).json({
      success: false,
      message: 'Double-entry transaction failed',
      error: err.message,
    });
  }
};

// ==================== GET PENDING TRANSACTIONS ====================
export const getPendingTransactions = async (req, res) => {
  try {
    const { organizationName, branchName } = req.query;
    const where = { QUEUE_STATUS: 'Pending' };
    
    if (organizationName) where.organizationName = { [Op.iLike]: organizationName };
    if (branchName) where.branchName = { [Op.iLike]: branchName };

    const GLTransactionQueue = (await import('../models/GLTransactionQueue.js')).default;
    const pendingTransactions = await GLTransactionQueue.findAll({ 
      where, 
      raw: true 
    });

    const auditLogger = (await import('../utils/AuditLogger.js')).default;
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
    console.error('Fetch Pending Transactions Error:', err);
    const auditLogger = (await import('../utils/AuditLogger.js')).default;
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
  let transactionCommitted = false;
  
  try {
    const { id } = req.params;
    const {
      JOURNAL_ID, DR_ACCT_NO, CR_ACCT_NO, AMOUNT, NARRATION, UPDATED_BY,
      TRANSACTION_TYPE, CURRENCY_CODE, STATUS, organizationName, branchName,
      SEG_NO, organizationCode, branchCode,
    } = req.body;

    const existing = await GLAccountTransaction.findByPk(id);
    if (!existing) throw new Error(`Transaction with ID ${id} not found`);

    // ✅ Track changes for balance updates
    let balanceChanged = false;
    let oldDrAcctNo = existing.DR_ACCT_NO;
    let oldCrAcctNo = existing.CR_ACCT_NO;
    let oldAmount = parseFloat(existing.AMOUNT);
    let newDrAcctNo = existing.DR_ACCT_NO;
    let newCrAcctNo = existing.CR_ACCT_NO;
    let newAmount = oldAmount;

    // ✅ Check if TRANSACTION_ID is being changed (not allowed)
    if (req.body.TRANSACTION_ID && req.body.TRANSACTION_ID !== existing.TRANSACTION_ID) {
      throw new Error('TRANSACTION_ID cannot be updated');
    }

    // ✅ Only allow updates if transaction is not POSTED (or handle carefully)
    const isPosted = existing.STATUS === 'POSTED';
    
    // Update fields
    if (JOURNAL_ID !== undefined) existing.JOURNAL_ID = JOURNAL_ID;
    
    if (DR_ACCT_NO !== undefined) {
      if (isPosted && DR_ACCT_NO !== existing.DR_ACCT_NO) {
        // If posted, we need to reverse old and apply new
        balanceChanged = true;
        oldDrAcctNo = existing.DR_ACCT_NO;
        newDrAcctNo = DR_ACCT_NO;
      }
      existing.DR_ACCT_NO = DR_ACCT_NO;
    }
    
    if (CR_ACCT_NO !== undefined) {
      if (isPosted && CR_ACCT_NO !== existing.CR_ACCT_NO) {
        balanceChanged = true;
        oldCrAcctNo = existing.CR_ACCT_NO;
        newCrAcctNo = CR_ACCT_NO;
      }
      existing.CR_ACCT_NO = CR_ACCT_NO;
    }
    
    if (AMOUNT !== undefined) {
      if (AMOUNT <= 0) throw new Error('Amount must be greater than 0');
      if (isPosted && parseFloat(AMOUNT) !== oldAmount) {
        balanceChanged = true;
        newAmount = parseFloat(AMOUNT);
      }
      existing.AMOUNT = AMOUNT;
    }
    
    if (NARRATION !== undefined) existing.NARRATION = NARRATION;
    if (TRANSACTION_TYPE !== undefined) existing.TRANSACTION_TYPE = TRANSACTION_TYPE;
    if (CURRENCY_CODE !== undefined) existing.CURRENCY_CODE = CURRENCY_CODE;
    if (organizationName !== undefined) existing.organizationName = organizationName;
    if (branchName !== undefined) existing.branchName = branchName;
    if (SEG_NO !== undefined) existing.BU_ID = SEG_NO;
    if (organizationCode !== undefined) existing.organizationCode = organizationCode;
    if (branchCode !== undefined) existing.branchCode = branchCode;
    
    // ✅ Handle STATUS change carefully
    const oldStatus = existing.STATUS;
    if (STATUS !== undefined) {
      if (!['POSTED', 'PENDING', 'REVERSED'].includes(STATUS)) {
        throw new Error('Invalid STATUS value');
      }
      existing.STATUS = STATUS;
    }
    
    existing.UPDATED_BY = UPDATED_BY;
    existing.updatedAt = new Date();

    // ✅ If transaction is POSTED and balances changed, update ledgers
    if (isPosted && balanceChanged) {
      const amountDiff = newAmount - oldAmount;
      
      // === Handle DR Account changes ===
      if (newDrAcctNo !== oldDrAcctNo) {
        // Reverse old DR account (credit it back)
        await Ledger.updateBalanceForTransaction(
          oldDrAcctNo,
          oldAmount,
          true, // isCredit = true (reverse the debit)
          { transaction }
        );
        logger.info(`✅ Reversed DR from ${oldDrAcctNo}: ${oldAmount}`);
        
        // Apply to new DR account (debit it)
        await Ledger.updateBalanceForTransaction(
          newDrAcctNo,
          newAmount,
          false, // isCredit = false (debit)
          { transaction }
        );
        logger.info(`✅ Applied DR to ${newDrAcctNo}: ${newAmount}`);
      }
      
      // === Handle CR Account changes ===
      if (newCrAcctNo !== oldCrAcctNo) {
        // Reverse old CR account (debit it back)
        await Ledger.updateBalanceForTransaction(
          oldCrAcctNo,
          oldAmount,
          false, // isCredit = false (reverse the credit)
          { transaction }
        );
        logger.info(`✅ Reversed CR from ${oldCrAcctNo}: ${oldAmount}`);
        
        // Apply to new CR account (credit it)
        await Ledger.updateBalanceForTransaction(
          newCrAcctNo,
          newAmount,
          true, // isCredit = true (credit)
          { transaction }
        );
        logger.info(`✅ Applied CR to ${newCrAcctNo}: ${newAmount}`);
      }
      
      // === Handle Amount change (accounts same) ===
      if (amountDiff !== 0 && newDrAcctNo === oldDrAcctNo && newCrAcctNo === oldCrAcctNo) {
        // Adjust DR account
        await Ledger.updateBalanceForTransaction(
          newDrAcctNo,
          Math.abs(amountDiff),
          amountDiff < 0, // If negative, reverse (credit), if positive, debit
          { transaction }
        );
        
        // Adjust CR account
        await Ledger.updateBalanceForTransaction(
          newCrAcctNo,
          Math.abs(amountDiff),
          amountDiff > 0, // If positive, credit more, if negative, reverse (debit)
          { transaction }
        );
        logger.info(`✅ Adjusted amounts: ${amountDiff}`);
      }
    }
    
    // ✅ If status changed from PENDING to POSTED, post to ledgers
    if (oldStatus !== 'POSTED' && existing.STATUS === 'POSTED') {
      const amountNum = parseFloat(existing.AMOUNT);
      
      if (existing.DR_ACCT_NO) {
        await Ledger.updateBalanceForTransaction(
          existing.DR_ACCT_NO,
          amountNum,
          false, // isCredit = false (debit)
          { transaction }
        );
      }
      
      if (existing.CR_ACCT_NO) {
        await Ledger.updateBalanceForTransaction(
          existing.CR_ACCT_NO,
          amountNum,
          true, // isCredit = true (credit)
          { transaction }
        );
      }
      logger.info(`✅ Posted transaction ${existing.TRANSACTION_ID} to ledgers`);
    }
    
    // ✅ If status changed from POSTED to REVERSED, reverse the transaction
    if (oldStatus === 'POSTED' && existing.STATUS === 'REVERSED') {
      const amountNum = parseFloat(existing.AMOUNT);
      
      // Reverse DR (credit it back)
      if (existing.DR_ACCT_NO) {
        await Ledger.updateBalanceForTransaction(
          existing.DR_ACCT_NO,
          amountNum,
          true, // isCredit = true (reverse the debit)
          { transaction }
        );
      }
      
      // Reverse CR (debit it back)
      if (existing.CR_ACCT_NO) {
        await Ledger.updateBalanceForTransaction(
          existing.CR_ACCT_NO,
          amountNum,
          false, // isCredit = false (reverse the credit)
          { transaction }
        );
      }
      logger.info(`✅ Reversed transaction ${existing.TRANSACTION_ID} from ledgers`);
    }

    await existing.save({ transaction });

    // Audit trail
    await addAuditTrail({
      EVENT_TYPE: 'UPDATE_GL_ACCOUNT_TRANSACTION',
      USER_ID: UPDATED_BY,
      ACTION: 'UPDATE',
      NEW_VALUE: {
        JOURNAL_ID, DR_ACCT_NO, CR_ACCT_NO, AMOUNT, NARRATION,
        TRANSACTION_TYPE, STATUS, organizationName, branchName,
      },
      OLD_VALUE: { 
        STATUS: oldStatus,
        DR_ACCT_NO: oldDrAcctNo,
        CR_ACCT_NO: oldCrAcctNo,
        AMOUNT: oldAmount,
      },
      IP_ADDRESS: req.ip || '0.0.0.0',
      ENTITY_ID: id,
      ENTITY_TYPE: 'GLAccountTransaction',
      STATUS: 'SUCCESS',
      DESCRIPTION: `Updated GL account transaction ${existing.TRANSACTION_ID}`,
      REFERENCE_NO: `TXN-${id}`,
      ACCOUNT_NO: `${existing.DR_ACCT_NO}/${existing.CR_ACCT_NO}`,
    }, { transaction });

    // ✅ Fetch updated balances for response
    let drBalance = null;
    let crBalance = null;
    
    if (existing.DR_ACCT_NO) {
      const drLedger = await Ledger.findOne({ 
        where: { GL_ACCT_NO: existing.DR_ACCT_NO } 
      });
      drBalance = drLedger?.LEDGER_BALANCE || 0;
    }
    
    if (existing.CR_ACCT_NO) {
      const crLedger = await Ledger.findOne({ 
        where: { GL_ACCT_NO: existing.CR_ACCT_NO } 
      });
      crBalance = crLedger?.LEDGER_BALANCE || 0;
    }

    transactionCommitted = true;
    await transaction.commit();
    
    return res.status(200).json({
      success: true,
      message: 'GL account transaction updated successfully',
      data: {
        transaction: existing,
        updatedBalances: {
          debitAccount: {
            accountNo: existing.DR_ACCT_NO,
            balance: drBalance
          },
          creditAccount: {
            accountNo: existing.CR_ACCT_NO,
            balance: crBalance
          }
        },
        changesApplied: {
          balanceChanged: balanceChanged,
          statusChanged: oldStatus !== existing.STATUS,
          oldStatus: oldStatus,
          newStatus: existing.STATUS
        }
      },
    });
    
  } catch (error) {
    if (!transactionCommitted) {
      await transaction.rollback();
    }
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