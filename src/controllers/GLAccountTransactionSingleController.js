// controllers/GLAccountTransactionController.js - SEQUELIZE VERSION
import { Op } from 'sequelize';
import sequelize from '../../config/db.js';
import { logger } from '../utils/logger.js';
import Branch from '../models/Branch.js';
import GLAccount from '../models/GLAccount.js';
import Ledger from '../models/Ledger.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import Reconciliation from '../models/Reconciliation.js';
import GLTransactionQueue from '../models/GLTransactionQueue.js';
import { generateTransactionId, validateGLAccountFormat } from '../utils/generateGLANumber.js';
import { createRootSubfolder } from '../utils/subfolderUtils.js';
import auditLogger from '../utils/AuditLogger.js';

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Validate GL_ACCT_NO format
 */
const isValidGLAcctNo = (glAcctNo) => {
  try {
    validateGLAccountFormat(glAcctNo);
    return true;
  } catch (error) {
    logger.error('GL Account Number validation failed:', {
      glAcctNo,
      error: error.message,
    });
    return false;
  }
};

/**
 * Generate a unique journal ID
 */
const generateJournalId = () => {
  return `JRN${Date.now()}${Math.floor(Math.random() * 10000)}`;
};

/**
 * Generate a unique transaction ID
 */
const generateTransactionId = async () => {
  const lastTxn = await GLAccountTransaction.findOne({
    order: [['TransactionId', 'DESC']],
    attributes: ['TransactionId'],
  });
  const lastId = lastTxn ? lastTxn.TransactionId : 0;
  return lastId + 1;
};

/**
 * Queue GL Transaction using GLTransactionQueue model
 */
export const queueGLTransaction = async (transactionData, options = {}) => {
  const { transaction } = options;
  const {
    GL_ACCT_NO,
    TRANSACTION_TYPE,
    AMOUNT,
    CREATED_BY,
    JOURNAL_ID,
    SUB_LEDGER_NO,
    SEG_NO,
    ACCT_DESC,
    CURRENCY_CODE = 'NGN',
    EXCHANGE_RATE = 1,
    APPROVAL_STATUS = 'Pending',
    organizationName,
    branchName,
    DR_ACCT_NO,
    CR_ACCT_NO,
    NARRATION,
  } = transactionData;

  if (!GL_ACCT_NO || !AMOUNT || !TRANSACTION_TYPE || !CREATED_BY || !JOURNAL_ID || !organizationName || !branchName) {
    throw new Error('Missing required fields for queuing GL transaction');
  }

  const queuedTransaction = await GLTransactionQueue.create({
    GL_ACCT_NO,
    TRANSACTION_TYPE: TRANSACTION_TYPE.toUpperCase(),
    AMOUNT: parseFloat(AMOUNT),
    CREATED_BY,
    JOURNAL_ID,
    SUB_LEDGER_NO: SUB_LEDGER_NO || '0000',
    SEG_NO: SEG_NO || 1,
    ACCT_DESC: ACCT_DESC || NARRATION || `Queued transaction for ${GL_ACCT_NO}`,
    CURRENCY_CODE,
    EXCHANGE_RATE,
    APPROVAL_STATUS,
    QUEUE_STATUS: 'Pending',
    organizationName,
    branchName,
    DR_ACCT_NO: DR_ACCT_NO || (TRANSACTION_TYPE === 'DR' ? GL_ACCT_NO : null),
    CR_ACCT_NO: CR_ACCT_NO || (TRANSACTION_TYPE === 'CR' ? GL_ACCT_NO : null),
    NARRATION: NARRATION || ACCT_DESC || `Queued transaction for ${GL_ACCT_NO}`,
    CREATED_AT: new Date(),
  }, { transaction });

  logger.info(`✅ Transaction queued: ${JOURNAL_ID} for ${GL_ACCT_NO}`);

  return {
    queued: true,
    transaction: queuedTransaction,
  };
};

// ============================================================
// CREATE GL TRANSACTION - SEQUELIZE VERSION
// ============================================================
export const createGLTransaction = async (req, res, transactionData, options = {}) => {
  const isAPICall = !!req && !!res;
  const isExternalTransaction = !!options.transaction;
  
  // Use provided transaction or create a new one
  let t = options.transaction || await sequelize.transaction();
  let transactionCommitted = false;

  try {
    const result = await (async () => {
      const {
        GL_ACCT_NO,
        AMOUNT,
        TRANSACTION_TYPE,
        CREATED_BY,
        SUB_LEDGER_NO,
        SEG_NO,
        description,
        JOURNAL_ID,
        DRS_ALLOWED_FG,
        CRS_ALLOWED_FG,
        BAL_CD,
        GL_ACCT_CAT,
        DELAY_GL_POSTING,
        source = 'manual',
        organizationName,
        branchName,
        EXTERNAL_REF,
        DR_ACCT_NO,
        CR_ACCT_NO,
        NARRATION,
        CURRENCY_CODE = 'NGN',
      } = transactionData;

      // ✅ Validate required fields
      const requiredFields = [
        { key: 'GL_ACCT_NO', value: GL_ACCT_NO },
        { key: 'AMOUNT', value: AMOUNT },
        { key: 'TRANSACTION_TYPE', value: TRANSACTION_TYPE },
        { key: 'CREATED_BY', value: CREATED_BY },
        { key: 'BAL_CD', value: BAL_CD },
        { key: 'SUB_LEDGER_NO', value: SUB_LEDGER_NO },
        { key: 'SEG_NO', value: SEG_NO },
        { key: 'GL_ACCT_CAT', value: GL_ACCT_CAT },
        { key: 'organizationName', value: organizationName },
        { key: 'branchName', value: branchName },
      ];
      
      const missingFields = requiredFields
        .filter(field => !field.value && field.value !== 0)
        .map(field => field.key);
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // ✅ Validate organization and branch
      const branch = await Branch.findOne({
        where: {
          organizationName: { [Op.iLike]: organizationName },
          branchName: { [Op.iLike]: branchName },
        },
        transaction: t,
      });
      
      if (!branch) {
        throw new Error(`Branch ${branchName} does not exist for organization ${organizationName}`);
      }

      // ✅ Validate GL account format
      if (!isValidGLAcctNo(GL_ACCT_NO)) {
        throw new Error('Invalid GL_ACCT_NO format. It should be in the format xx-xx-xx-xx-xx-xx');
      }

      // ✅ Validate amount
      const amount = parseFloat(AMOUNT);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Invalid transaction amount');
      }

      // ✅ Validate transaction type
      const normalizedType = TRANSACTION_TYPE.toUpperCase();
      if (!['CR', 'DR'].includes(normalizedType)) {
        throw new Error('Invalid transaction type. Must be CR or DR');
      }

      // ✅ Validate BAL_CD
      const balCdNumber = parseInt(BAL_CD);
      if (isNaN(balCdNumber)) {
        throw new Error(`Invalid BAL_CD: ${BAL_CD}. Must be a number.`);
      }

      // ✅ Find or create GL Account
      let glAccount = await GLAccount.findOne({
        where: { 
          GL_ACCT_NO: GL_ACCT_NO,
          organizationName: organizationName,
          branchName: branchName,
        },
        transaction: t,
      });

      if (!glAccount) {
        throw new Error(`GL Account not found: ${GL_ACCT_NO}`);
      }

      // ✅ Find or create Ledger
      let ledger = await Ledger.findOne({
        where: {
          GL_ACCT_NO: GL_ACCT_NO,
          organizationName: organizationName,
          branchName: branchName,
        },
        transaction: t,
      });

      let isNewLedger = false;

      if (!ledger) {
        // ✅ Create new ledger
        const glAcctParts = GL_ACCT_NO.split('-');
        const [PARENT_ID, , LEDGER_NO_PART, SUB_LEDGER_NO_PART, , SEG_NO_PART] = glAcctParts;
        
        const lastAcct = await Ledger.findOne({
          order: [['GL_ACCT_ID', 'DESC']],
          transaction: t,
        });
        
        const newGLAcctId = lastAcct 
          ? String(parseInt(lastAcct.GL_ACCT_ID) + 1).padStart(7, '0') 
          : '3111111';

        ledger = await Ledger.create({
          GL_ACCT_NO: GL_ACCT_NO,
          GL_ACCT_ID: newGLAcctId,
          CREATED_BY: CREATED_BY,
          LEDGER_NO: LEDGER_NO_PART || SUB_LEDGER_NO || '100',
          PARENT_ID: PARENT_ID || '1',
          BAL_CD: balCdNumber || glAccount?.BAL_CD || '01',
          SUB_LEDGER_NO: Number(SUB_LEDGER_NO) || Number(SUB_LEDGER_NO_PART) || 0,
          BU_ID: branch.branchCode || branch.branch_code || '001',
          SEG_NO: Number(SEG_NO) || Number(SEG_NO_PART) || 1,
          CHART_OF_ACCT_ID: glAccount.CHART_OF_ACCT_ID || '10001',
          ACCT_DESC: description || glAccount?.ACCT_DESC || 'GL Account',
          GL_ACCT_CAT: GL_ACCT_CAT || glAccount.GL_ACCT_CAT,
          JOURNAL_ID: JOURNAL_ID || generateJournalId(),
          TRANSACTION_TYPE: normalizedType,
          CR_ALLOWED: CRS_ALLOWED_FG ?? glAccount?.CR_ALLOWED ?? true,
          DR_ALLOWED: DRS_ALLOWED_FG ?? glAccount?.DR_ALLOWED ?? true,
          REC_ST: 'Active',
          POST_FG: glAccount?.POST_FG || false,
          POST_ALLOW: true,
          CONTROL_ACCT_FG: glAccount?.CONTROL_ACCT_FG || false,
          SUSPENSE_ACCT_FG: glAccount?.SUSPENSE_ACCT_FG || false,
          ALLOW_BAL_SWING_FG: glAccount?.ALLOW_BAL_SWING_FG || false,
          DELAY_GL_POSTING: DELAY_GL_POSTING ?? glAccount?.DELAY_GL_POSTING ?? false,
          LEDGER_BALANCE: 0,
          CURRENT_BALANCE: 0,
          AVAILABLE_BALANCE: 0,
          organizationName: organizationName,
          branchName: branchName,
          organizationCode: branch.organizationCode || '1',
          branchCode: branch.branchCode || branch.branch_code || '001',
        }, { transaction: t });

        isNewLedger = true;
        logger.info(`✅ Created new ledger for GL_ACCT_NO: ${GL_ACCT_NO}`);
      }

      // ✅ CONTROL_ACCT_FG enforcement
      if (glAccount.CONTROL_ACCT_FG && source === 'manual') {
        throw new Error(`Manual transactions are not allowed on CONTROL account ${GL_ACCT_NO}`);
      }

      // ✅ Generate JOURNAL_ID if not provided
      const journalId = JOURNAL_ID || generateJournalId();

      // ✅ Check if DELAY_GL_POSTING is enabled
      const shouldDelayPosting = DELAY_GL_POSTING === true || 
        (DELAY_GL_POSTING === undefined && glAccount.DELAY_GL_POSTING === true);

      if (shouldDelayPosting) {
        // ✅ Queue the transaction
        const queued = await queueGLTransaction(
          {
            GL_ACCT_NO,
            DR_ACCT_NO: normalizedType === 'DR' ? GL_ACCT_NO : null,
            CR_ACCT_NO: normalizedType === 'CR' ? GL_ACCT_NO : null,
            TRANSACTION_TYPE: normalizedType,
            AMOUNT: amount,
            CREATED_BY,
            JOURNAL_ID: journalId,
            SUB_LEDGER_NO: SUB_LEDGER_NO || ledger.SUB_LEDGER_NO || '0000',
            SEG_NO: SEG_NO || ledger.SEG_NO || 1,
            ACCT_DESC: description || NARRATION || `Queued transaction for ${GL_ACCT_NO}`,
            NARRATION: NARRATION || description || `Queued transaction for ${GL_ACCT_NO}`,
            CURRENCY_CODE: CURRENCY_CODE || 'NGN',
            EXCHANGE_RATE: 1,
            APPROVAL_STATUS: 'Pending',
            organizationName,
            branchName,
          },
          { transaction: t }
        );

        // ✅ Create Reconciliation entry for queued transaction
        const reconciliation = await Reconciliation.create({
          JOURNAL_ID: journalId,
          GL_ACCT_NO: GL_ACCT_NO,
          TRANSACTION_ID: queued.transaction.JOURNAL_ID || journalId,
          EXTERNAL_REF: EXTERNAL_REF || null,
          STATUS: 'Pending',
          AMOUNT: amount,
          CURRENCY_CODE: 'NGN',
          organizationName: organizationName,
          branchName: branchName,
          CREATED_AT: new Date(),
        }, { transaction: t });

        logger.info(`✅ Transaction queued: ${journalId} for ${GL_ACCT_NO}`);

        if (isAPICall) {
          return res.status(202).json({
            success: true,
            message: 'Transaction queued successfully with reconciliation entry',
            data: {
              transaction: queued.transaction,
              reconciliation: reconciliation,
              isQueued: true,
            }
          });
        }

        return {
          message: 'Transaction queued successfully with reconciliation entry',
          transaction: queued.transaction,
          reconciliation: reconciliation,
          isQueued: true,
        };
      }

      // ✅ Process immediate transaction - Update Ledger Balance
      let ledgerBalance = parseFloat(ledger.LEDGER_BALANCE) || 0;
      const isSettlementGLAccount = GL_ACCT_NO === '01-002-100-115-102';

      if (normalizedType === 'CR') {
        if (!CRS_ALLOWED_FG && glAccount.CR_ALLOWED === false) {
          throw new Error('Credit not allowed on this account');
        }
        ledgerBalance += amount;
      } else { // DR
        if (!DRS_ALLOWED_FG && glAccount.DR_ALLOWED === false) {
          throw new Error('Debit not allowed on this account');
        }
        ledgerBalance -= amount;
        if (ledgerBalance < 0 && !glAccount.ALLOW_BAL_SWING_FG && !isSettlementGLAccount) {
          throw new Error('Insufficient funds');
        }
      }

      // ✅ Create GL Account Transaction entry
      const txnIdNum = await generateTransactionId();
      
      const transactionEntry = await GLAccountTransaction.create({
        JOURNAL_ID: journalId,
        TRANSACTION_ID: `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        DR_ACCT_NO: normalizedType === 'DR' ? GL_ACCT_NO : null,
        CR_ACCT_NO: normalizedType === 'CR' ? GL_ACCT_NO : null,
        AMOUNT: amount,
        NARRATION: NARRATION || description || `Transaction for ${GL_ACCT_NO}`,
        CREATED_BY: CREATED_BY,
        TRANSACTION_TYPE: normalizedType,
        CURRENCY_CODE: CURRENCY_CODE || 'NGN',
        STATUS: 'POSTED',
        TransactionId: txnIdNum,
        BU_ID: branch.branchCode || branch.branch_code || '001',
        organizationCode: branch.organizationCode || '1',
        branchCode: branch.branchCode || branch.branch_code || '001',
      }, { transaction: t });

      // ✅ Update Ledger balance using the model's method
      await Ledger.updateBalanceForTransaction(
        GL_ACCT_NO,
        amount,
        normalizedType === 'CR', // isCredit = true for CR, false for DR
        { transaction: t }
      );

      // ✅ Create Reconciliation entry for immediate transaction
      const reconciliation = await Reconciliation.create({
        JOURNAL_ID: journalId,
        GL_ACCT_NO: GL_ACCT_NO,
        TRANSACTION_ID: transactionEntry.TransactionId,
        EXTERNAL_REF: EXTERNAL_REF || null,
        STATUS: 'Pending',
        AMOUNT: amount,
        CURRENCY_CODE: 'NGN',
        organizationName: organizationName,
        branchName: branchName,
        CREATED_AT: new Date(),
      }, { transaction: t });

      // ✅ Create subfolder (if needed)
      try {
        await createRootSubfolder(transactionEntry.id, { 
          GL_ACCT_NO, 
          createdBy: CREATED_BY, 
          description: description || NARRATION 
        });
      } catch (error) {
        logger.warn('Error creating subfolder:', error.message);
      }

      logger.info(`✅ GL Transaction created: ${journalId} for ${GL_ACCT_NO}, New Balance: ${ledgerBalance}`);

      // ✅ Audit log
      auditLogger.info('Audit Event', {
        entity_type: 'GL_ACCOUNT_TRANSACTION',
        entity_id: transactionEntry.id,
        user_id: CREATED_BY,
        action: 'CREATE',
        old_value: null,
        new_value: {
          ...transactionEntry.toJSON(),
          reconciliationId: reconciliation.id,
          newBalance: ledgerBalance,
        },
        ip_address: req?.ip || req?.headers?.['x-forwarded-for'] || 'UNKNOWN',
        event_type: 'GL_ACCOUNT_TRANSACTION',
        outcome: 'success',
        description: `Processed transaction for ${GL_ACCT_NO} in ${organizationName}/${branchName}`,
      });

      if (isAPICall) {
        return res.status(201).json({
          success: true,
          message: 'GL Transaction created successfully with reconciliation entry',
          data: {
            transaction: transactionEntry,
            reconciliation: reconciliation,
            updatedBalance: ledgerBalance,
          }
        });
      }

      return {
        transaction: transactionEntry,
        reconciliation: reconciliation,
        updatedBalance: ledgerBalance,
        isQueued: false,
      };
    });

    // ✅ If we created the transaction, commit it
    if (!isExternalTransaction) {
      await t.commit();
      transactionCommitted = true;
    }

    return result;

  } catch (error) {
    // ✅ Rollback if we created the transaction and it hasn't been committed
    if (!isExternalTransaction && !transactionCommitted) {
      await t.rollback();
    }
    
    logger.error('Error creating GL transaction:', {
      message: error.message,
      stack: error.stack,
      transactionData,
    });

    // ✅ Audit failure
    auditLogger.error('Audit Event', {
      entity_type: 'GL_ACCOUNT_TRANSACTION',
      entity_id: null,
      user_id: transactionData?.CREATED_BY || 'system',
      action: 'create_gl_transaction',
      old_value: null,
      new_value: null,
      ip_address: req?.ip || 'unknown',
      event_type: 'GL_ERROR',
      outcome: 'failure',
      error: error.message,
    });

    if (isAPICall) {
      const status = error.message.includes('Missing') || 
                     error.message.includes('Invalid') || 
                     error.message.includes('not found') ? 400 : 500;
      return res.status(status).json({
        success: false,
        message: 'Transaction processing failed',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    }
    
    throw error;
  }
};

// ============================================================
// DEFAULT EXPORT
// ============================================================
export default {
  createGLTransaction,
  queueGLTransaction,
};