
import { logger } from '../utils/logger.js'; // Assuming logger is available
import Branch from '../models/Branch.js';
import GLAccount from '../models/GLAccount.js';
import Ledger from '../models/Ledger.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import Reconciliation from '../models/Reconciliation.js';
import GLTransactionQueue from '../models/GLTransactionQueue.js'; // If queueing is used
import { generateTransactionId, validateGLAccountFormat } from '../utils/generateGLANumber.js'; // Fixed import
import { createRootSubfolder } from '../utils/subfolderUtils.js';
import auditLogger from '../utils/AuditLogger.js';

// Add the missing isValidGLAcctNo function here
/**
 * Validate GL_ACCT_NO format (wrapper for validateGLAccountFormat that returns boolean)
 * @param {string} glAcctNo - GL Account Number to validate
 * @returns {boolean} - True if valid, false otherwise
 */
const isValidGLAcctNo = (glAcctNo) => {
  try {
    validateGLAccountFormat(glAcctNo);
    return true;
  } catch (error) {
    console.error('GL Account Number validation failed:', {
      glAcctNo,
      error: error.message,
    });
    return false;
  }
};

// Helper function to generate a unique journal ID
const generateJournalId = () => {
  return Math.floor(Math.random() * 1000000000).toString();
};

// Helper function to generate a unique ledger number
const generateLedgerNo = () => {
  return Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
};

// Queue GL Transaction using the new GLTransactionQueue model (if needed)
export const queueGLTransaction = async (transactionData, options = {}) => {
  const { session } = options;
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
    CREATED_AT = new Date(),
    organizationName,
    branchName,
  } = transactionData;

  if (!GL_ACCT_NO || !AMOUNT || !TRANSACTION_TYPE || !CREATED_BY || !JOURNAL_ID || !organizationName || !branchName) {
    throw new Error('Missing required fields for queuing GL transaction');
  }

  const queuedTransaction = new GLTransactionQueue({
    GL_ACCT_NO,
    TRANSACTION_TYPE,
    AMOUNT,
    CREATED_BY,
    JOURNAL_ID,
    SUB_LEDGER_NO: SUB_LEDGER_NO || '0000',
    SEG_NO: SEG_NO || 1,
    ACCT_DESC,
    CURRENCY_CODE,
    EXCHANGE_RATE,
    APPROVAL_STATUS,
    organizationName,
    branchName,
    CREATED_AT,
  });

  await queuedTransaction.save({ session });

  return {
    queued: true,
    transaction: queuedTransaction,
  };
};

export const createGLTransaction = async (req, res, transactionData, options = {}) => {
  const session = options.session || await mongoose.startSession();
  const isAPICall = !!req && !!res;
  const isExternalSession = !!options.session;
  let transactionCompleted = false;

  try {
    const result = await session.withTransaction(async () => {
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
      } = transactionData;

      // Validate required fields
      if (!GL_ACCT_NO || !AMOUNT || !TRANSACTION_TYPE || !CREATED_BY || !BAL_CD || !SUB_LEDGER_NO || !SEG_NO || !GL_ACCT_CAT || !organizationName || !branchName) {
        const missingFields = [
          !GL_ACCT_NO && 'GL_ACCT_NO',
          !AMOUNT && 'AMOUNT',
          !TRANSACTION_TYPE && 'TRANSACTION_TYPE',
          !CREATED_BY && 'CREATED_BY',
          !BAL_CD && 'BAL_CD',
          !SUB_LEDGER_NO && 'SUB_LEDGER_NO',
          !SEG_NO && 'SEG_NO',
          !GL_ACCT_CAT && 'GL_ACCT_CAT',
          !organizationName && 'organizationName',
          !branchName && 'branchName',
        ].filter(Boolean);
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // Validate organizationName and branchName
      const branch = await Branch.findOne({
        organizationName: { $regex: `^${organizationName}$`, $options: 'i' },
        branchName: { $regex: `^${branchName}$`, $options: 'i' }
      }).session(session);
      if (!branch) {
        throw new Error(`Branch ${branchName} does not exist for organization ${organizationName}`);
      }

      if (!isValidGLAcctNo(GL_ACCT_NO)) {
        throw new Error('Invalid GL_ACCT_NO format. It should be in the format xx-xx-xx-xx-xx-xx (e.g., 2-400-100-200-101-1)');
      }

      // Validate amount
      const amount = parseFloat(AMOUNT);
      if (isNaN(amount) || amount <= 0) {
        throw new Error('Invalid transaction amount');
      }

      // Validate transaction type
      const normalizedType = TRANSACTION_TYPE.toUpperCase();
      if (!['CR', 'DR'].includes(normalizedType)) {
        throw new Error('Invalid transaction type');
      }

      // Validate BAL_CD
      const balCdNumber = Number(BAL_CD);
      if (isNaN(balCdNumber)) {
        throw new Error(`Invalid BAL_CD: ${BAL_CD}. Must be a number.`);
      }

      // Validate GL account
      const glAccount = await GLAccount.findOne({ GL_ACCT_NO, organizationName, branchName }).session(session);
      if (!glAccount || !glAccount.CHART_OF_ACCT_ID) {
        throw new Error(`Invalid GL account: ${GL_ACCT_NO}`);
      }

      // Check for existing Ledger
      let ledger = await Ledger.findOne({ GL_ACCT_NO, organizationName, branchName }).session(session);
      let isNewLedger = false;

      if (!ledger) {
        const [PARENT_ID, /* BAL_CD from split */, LEDGER_NO, SUB_LEDGER_NO_PART, /* BU_ID from split */, SEG_NO_PART] = GL_ACCT_NO.split('-');
        const lastAcct = await Ledger.findOne().sort({ GL_ACCT_ID: -1 }).limit(1).session(session);
        const newGLAcctId = lastAcct ? String(parseInt(lastAcct.GL_ACCT_ID) + 1).padStart(7, '0') : '3111111';
        const postFg = glAccount?.POST_FG ? (glAccount.POST_FG === 'Y' ? true : false) : false;

        ledger = new Ledger({
          GL_ACCT_NO,
          GL_ACCT_ID: newGLAcctId,
          CREATED_BY,
          LEDGER_NO: LEDGER_NO || SUB_LEDGER_NO || '100',
          PARENT_ID: PARENT_ID || '1',
          BAL_CD: balCdNumber || glAccount?.BAL_CD || '01',
          SUB_LEDGER_NO: Number(SUB_LEDGER_NO) || Number(SUB_LEDGER_NO_PART) || '000',
          BU_ID: branch.branchCode, // Updated: Use branch.branchCode for BU_ID
          SEG_NO: Number(SEG_NO) || Number(SEG_NO_PART) || '1',
          CHART_OF_ACCT_ID: glAccount.CHART_OF_ACCT_ID,
          ACCT_DESC: description || glAccount?.ACCT_DESC || 'GL Account',
          GL_ACCT_CAT: GL_ACCT_CAT || glAccount.GL_ACCT_CAT.toUpperCase(),
          JOURNAL_ID: JOURNAL_ID || generateJournalId(),
          TRANSACTION_TYPE: normalizedType,
          CR_ALLOWED: CRS_ALLOWED_FG ?? glAccount?.CR_ALLOWED ?? true,
          DR_ALLOWED: DRS_ALLOWED_FG ?? glAccount?.DR_ALLOWED ?? true,
          REC_ST: 'Active',
          POST_FG: postFg,
          CONTROL_ACCT_FG: glAccount?.CONTROL_ACCT_FG || false,
          SUSPENSE_ACCT_FG: glAccount?.SUSPENSE_ACCT_FG || false,
          ALLOW_BAL_SWING_FG: glAccount?.ALLOW_BAL_SWING_FG || false,
          DELAY_GL_POSTING: DELAY_GL_POSTING ?? glAccount?.DELAY_GL_POSTING ?? false,
          LEDGER_BALANCE: 0,
          transactions: [],
          organizationName,
          branchName
        });

        try {
          await ledger.save({ session });
          isNewLedger = true;
          logger.info(`Created new ledger for GL_ACCT_NO: ${GL_ACCT_NO}`);
        } catch (error) {
          if (error.code === 11000 && error.keyPattern.GL_ACCT_NO) {
            ledger = await Ledger.findOne({ GL_ACCT_NO, organizationName, branchName }).session(session);
            if (!ledger) {
              throw new Error(`Failed to find existing ledger for GL_ACCT_NO ${GL_ACCT_NO} after duplicate key error`);
            }
          } else {
            throw error;
          }
        }

        // Audit ledger creation
        auditLogger.info('Audit Event', {
          entity_type: 'LEDGER_CREATION',
          entity_id: ledger._id,
          user_id: CREATED_BY,
          action: 'CREATE',
          old_value: null,
          new_value: ledger.toObject(),
          ip_address: req?.headers['x-forwarded-for'] || req?.connection?.remoteAddress || 'UNKNOWN',
          event_type: 'LEDGER_CREATION',
          outcome: 'success',
          description: `Created Ledger for GL_ACCT_NO ${GL_ACCT_NO} in ${organizationName}/${branchName}`
        });
      }

      // CONTROL_ACCT_FG enforcement
      if (glAccount.CONTROL_ACCT_FG && source === 'manual') {
        throw new Error(`Manual transactions are not allowed on CONTROL account ${GL_ACCT_NO}`);
      }

      // Generate JOURNAL_ID if not provided
      const journalId = JOURNAL_ID || generateJournalId();

      // Queue transaction if DELAY_GL_POSTING is true or inherited from glAccount
      if (DELAY_GL_POSTING === true || (DELAY_GL_POSTING === undefined && glAccount.DELAY_GL_POSTING === true)) {
        const queued = await queueGLTransaction(
          {
            GL_ACCT_NO,
            TRANSACTION_TYPE: normalizedType,
            AMOUNT: amount,
            CREATED_BY,
            JOURNAL_ID: journalId,
            SUB_LEDGER_NO: SUB_LEDGER_NO || ledger.SUB_LEDGER_NO || '0000',
            SEG_NO: SEG_NO || ledger.SEG_NO || '1',
            ACCT_DESC: description || `Queued transaction for ${GL_ACCT_NO}`,
            CURRENCY_CODE: 'NGN',
            EXCHANGE_RATE: 1,
            APPROVAL_STATUS: 'Pending',
            CREATED_AT: new Date(),
            organizationName,
            branchName
          },
          { session }
        );

        // Create Reconciliation entry for queued transaction
        const reconciliation = new Reconciliation({
          JOURNAL_ID: journalId,
          GL_ACCT_NO,
          TRANSACTION_ID: queued.transaction.JOURNAL_ID, // Fallback
          EXTERNAL_REF: EXTERNAL_REF || null,
          STATUS: 'Pending',
          AMOUNT: amount,
          CURRENCY_CODE: 'NGN',
          organizationName,
          branchName,
          CREATED_AT: new Date()
        });
        await reconciliation.save({ session });

        // Audit queued transaction
        auditLogger.info('Audit Event', {
          entity_type: 'QUEUE_GL_TRANSACTION',
          entity_id: queued.transaction._id,
          user_id: CREATED_BY,
          action: 'CREATE',
          old_value: null,
          new_value: { ...queued.transaction.toObject(), reconciliationId: reconciliation._id },
          ip_address: req?.headers['x-forwarded-for'] || req?.connection?.remoteAddress || 'UNKNOWN',
          event_type: 'QUEUE_GL_TRANSACTION',
          outcome: 'success',
          description: `Queued transaction for ${GL_ACCT_NO} with reconciliation in ${organizationName}/${branchName}`
        });

        return {
          message: 'Transaction queued successfully with reconciliation entry',
          transaction: queued.transaction,
          reconciliation
        };
      }

      // Calculate ledger balance update
      let ledgerBalance = ledger.LEDGER_BALANCE || 0;
      const isSettlementGLAccount = GL_ACCT_NO === '01-002-100-115-102'; // settlementGLAccountNo
      if (normalizedType === 'CR') {
        if (!CRS_ALLOWED_FG) {
          throw new Error('Credit not allowed on this account');
        }
        ledgerBalance += amount;
      } else {
        if (!DRS_ALLOWED_FG) {
          throw new Error('Debit not allowed on this account');
        }
        ledgerBalance -= amount;
        if (ledgerBalance < 0 && !glAccount.ALLOW_BAL_SWING_FG && !isSettlementGLAccount) {
          throw new Error('Insufficient funds');
        }
      }

      // Create GL Account Transaction entry
      const transactionEntry = new GLAccountTransaction({
        GL_ACCT_NO, // Added as per request
        JOURNAL_ID: journalId,
        TRANSACTION_ID: `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        DR_ACCT_NO: normalizedType === 'DR' ? GL_ACCT_NO : null, // Adapt for single entry; adjust if double-entry needed
        CR_ACCT_NO: normalizedType === 'CR' ? GL_ACCT_NO : null,
        AMOUNT: amount,
        NARRATION: description || `Transaction for ${GL_ACCT_NO}`,
        CREATED_BY,
        TRANSACTION_TYPE: normalizedType,
        CURRENCY_CODE: 'NGN',
        STATUS: 'POSTED',
        TransactionId: await generateTransactionId(),
      });

      await transactionEntry.save({ session });

      // Update Ledger balance
      ledger.LEDGER_BALANCE = ledgerBalance;
      await ledger.save({ session });

      // Update GLAccount balance
      await GLAccount.updateOne(
        { GL_ACCT_NO, organizationName, branchName },
        { $set: { LEDGER_BALANCE: ledgerBalance } },
        { session }
      );

      // Create Reconciliation entry for immediate transaction
      const reconciliation = new Reconciliation({
        JOURNAL_ID: journalId,
        GL_ACCT_NO,
        TRANSACTION_ID: transactionEntry.TransactionId,
        EXTERNAL_REF: EXTERNAL_REF || null,
        STATUS: 'Pending',
        AMOUNT: amount,
        CURRENCY_CODE: 'NGN',
        organizationName,
        branchName,
        CREATED_AT: new Date()
      });
      await reconciliation.save({ session });

      // Audit immediate transaction
      auditLogger.info('Audit Event', {
        entity_type: 'GL_ACCOUNT_TRANSACTION',
        entity_id: transactionEntry._id,
        user_id: CREATED_BY,
        action: 'CREATE',
        old_value: null,
        new_value: { ...transactionEntry.toObject(), reconciliationId: reconciliation._id },
        ip_address: req?.headers['x-forwarded-for'] || req?.connection?.remoteAddress || 'UNKNOWN',
        event_type: 'GL_ACCOUNT_TRANSACTION',
        outcome: 'success',
        description: `Processed transaction for ${GL_ACCT_NO} with reconciliation in ${organizationName}/${branchName}`
      });

      try {
        await createRootSubfolder(transactionEntry._id, { GL_ACCT_NO, createdBy: CREATED_BY, description });
      } catch (error) {
        console.error('Error creating subfolder:', error);
      }

      if (isAPICall) {
        return res.status(201).json({
          message: 'GL Transaction created successfully with reconciliation entry',
          transaction: transactionEntry,
          reconciliation,
          updatedBalance: ledgerBalance,
        });
      }

      return transactionEntry;
    });

    transactionCompleted = true;
    if (!isExternalSession) {
      await session.commitTransaction();
    }
    return result;
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    console.error('Error creating GL transaction:', {
      message: error.message,
      stack: error.stack,
      transactionData,
    });
    // Audit failure
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
      error: error.message
    });
    if (isAPICall) {
      return res.status(error.message.includes('Missing') || error.message.includes('Invalid') || error.message.includes('not found') ? 400 : 500).json({
        message: 'Transaction processing failed',
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
    throw error;
  } finally {
    if (!isExternalSession) {
      session.endSession();
    }
  }
};