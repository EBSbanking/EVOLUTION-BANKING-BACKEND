
import GLAccount from '../models/GLAccount.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import PendingGLTransaction from '../models/PendingGLTransaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import { createAuditTrail } from './AudiTrailController.js';
import logger from '../utils/logger.js';
import auditLogger from '../utils/AuditLogger.js';
import Branch from '../models/Branch.js';
import Reconciliation from '../models/Reconciliation.js';
import { generateTransactionId } from '../utils/generateGLANumber.js';
import { queueGLTransaction } from '../utils//GLQueueUtils.js';

// Helper function to generate a unique journal ID
const generateJournalId = () => {
  return Math.floor(Math.random() * 1000000000).toString();
};

// Helper function to generate a unique event_id
const generateEventId = async (session = null) => {
  try {
    const lastAudit = await AuditTrail.findOne().sort({ event_id: -1 }).session(session).exec();
    return lastAudit && lastAudit.event_id ? lastAudit.event_id + 1 : 1;
  } catch (error) {
    logger.error('generateEventId error:', error.message);
    throw new Error(`Failed to generate event_id: ${error.message}`);
  }
};

export const createLedgerEntry = async (req, res, transactionData, options = {}) => {
  const session = options.session || await mongoose.startSession();
  let transactionCompleted = false;
  const isAPICall = !!req && !!res;

  try {
    await session.withTransaction(async () => {
      logger.debug('Request headers:', { headers: req?.headers });
      logger.debug('Raw request body:', { body: req?.body || transactionData });

      const inputData = transactionData || req?.body;
      if (!inputData || Object.keys(inputData).length === 0) {
        logger.error('Request body is empty or undefined', { headers: req?.headers });
        throw new Error('Request body is empty or undefined');
      }

      let {
        GL_ACCT_NO,
        AMOUNT,
        TRANSACTION_TYPE,
        ACCT_NO,
        ACCT_DESC,
        CREATED_BY,
        LEDGER_NO,
        BAL_CD,
        SUB_LEDGER_NO,
        branchCode,
        SEG_NO,
        JOURNAL_ID,
        GL_ACCT_CAT,
        CRS_ALLOWED_FG,
        DELAY_GL_POSTING,
        source = 'manual',
        organizationName,
        branchName,
        EXTERNAL_REF,
      } = inputData;

      // Validate required fields including organization and branch
      const initialRequiredFields = { 
        GL_ACCT_NO, 
        AMOUNT, 
        CREATED_BY, 
        SUB_LEDGER_NO, 
        SEG_NO, 
        ACCT_DESC, 
        organizationName, 
        branchName,
        branchCode 
      };
      const missingFields = Object.entries(initialRequiredFields)
        .filter(([_, value]) => value == null || value === '')
        .map(([key]) => key);
      if (missingFields.length > 0) {
        logger.error('Missing required fields', { missingFields, inputData });
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }

      // Validate organizationName and branchName with branchCode
      const branch = await Branch.findOne({
        organizationName,
        branchName,
        branchCode
      }).session(session);
      if (!branch) {
        throw new Error(`Branch ${branchName} with code ${branchCode} does not exist for organization ${organizationName}`);
      }

      logger.debug(`Raw AMOUNT: ${AMOUNT}, type: ${typeof AMOUNT}`);

      let parsedAmount;
      if (typeof AMOUNT === 'string') {
        const cleanedAmount = AMOUNT.trim().replace(/[^0-9.-]+/g, '');
        if (!/^-?\d*\.?\d*$/.test(cleanedAmount)) {
          logger.error('Invalid AMOUNT format after cleaning', { cleanedAmount, original: AMOUNT });
          throw new Error(`Invalid AMOUNT format: ${AMOUNT}`);
        }
        parsedAmount = parseFloat(cleanedAmount);
      } else if (typeof AMOUNT === 'number') {
        parsedAmount = parseFloat(AMOUNT);
      } else {
        logger.error('Invalid AMOUNT type', { type: typeof AMOUNT, AMOUNT });
        throw new Error(`Invalid AMOUNT type: ${typeof AMOUNT}`);
      }

      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        logger.error('AMOUNT is NaN or non-positive', { parsedAmount });
        throw new Error(`Invalid or non-positive amount: ${parsedAmount}`);
      }
      AMOUNT = parsedAmount;

      logger.debug(`Parsed AMOUNT: ${AMOUNT}`);

      TRANSACTION_TYPE = TRANSACTION_TYPE?.toUpperCase();
      if (TRANSACTION_TYPE === 'CREDIT') TRANSACTION_TYPE = 'CR';
      if (TRANSACTION_TYPE === 'DEBIT') TRANSACTION_TYPE = 'DR';
      if (!['DR', 'CR'].includes(TRANSACTION_TYPE)) {
        logger.error('Invalid transaction type', { TRANSACTION_TYPE });
        throw new Error('Invalid transaction type: must be DR, CR, Debit, or Credit');
      }

      JOURNAL_ID = JOURNAL_ID || generateJournalId();

      LEDGER_NO = LEDGER_NO ? String(LEDGER_NO).padStart(3, '0') : null;
      BAL_CD = BAL_CD ? String(BAL_CD).padStart(2, '0') : (TRANSACTION_TYPE === 'DR' ? '01' : '02');
      SUB_LEDGER_NO = String(SUB_LEDGER_NO).padStart(3, '0');
      SEG_NO = String(SEG_NO).padStart(3, '0');

      if (LEDGER_NO && !/^\d{3}$/.test(LEDGER_NO)) throw new Error('LEDGER_NO must be a 3-digit number');
      if (!/^\d{2,3}$/.test(BAL_CD)) throw new Error('BAL_CD must be a 2 or 3-digit number');
      if (!/^\d{3}$/.test(SUB_LEDGER_NO)) throw new Error('SUB_LEDGER_NO must be a 3-digit number');
      if (!/^\d{3}$/.test(branchCode)) throw new Error('branchCode must be a 3-digit number');
      if (!/^\d{1,3}$/.test(SEG_NO)) throw new Error('SEG_NO must be a 1 to 3-digit number');
      if (!/^\d{8,12}$/.test(JOURNAL_ID)) throw new Error('JOURNAL_ID must be an 8 to 12-digit number');

      let glAccount = await GLAccount.findOne({ 
        GL_ACCT_NO, 
        organizationName, 
        branchName,
        branchCode 
      }).session(session);
      
      if (!glAccount) {
        logger.info(`GL Account ${GL_ACCT_NO} not found, creating new GL account`);
        const inferredCategory = GL_ACCT_CAT || (TRANSACTION_TYPE === 'CR' ? 'LIABILITY' : 'ASSET');
        const drAllowed = TRANSACTION_TYPE === 'DR' || inferredCategory === 'ASSET' || inferredCategory === 'EXPENSE';
        const crAllowed = TRANSACTION_TYPE === 'CR' || inferredCategory === 'LIABILITY';

        glAccount = new GLAccount({
          GL_ACCT_NO,
          GL_ACCT_CAT: inferredCategory,
          DR_ALLOWED: drAllowed,
          CR_ALLOWED: crAllowed,
          LEDGER_BALANCE: 0,
          CREATED_BY,
          CREATED_DATE: new Date(),
          SUB_LEDGER_NO,
          SEG_NO,
          LEDGER_NO: LEDGER_NO || '100',
          DESCRIPTION: ACCT_DESC || `Auto-created GL account for ${inferredCategory} transactions`,
          DELAY_GL_POSTING: false,
          transactions: [],
          organizationName,
          branchName,
          branchCode,
        });

        try {
          await glAccount.save({ session });
          logger.info(`GL Account ${GL_ACCT_NO} created successfully`);
          await createAuditTrail({
            eventId: await generateEventId(session),
            userId: CREATED_BY,
            eventType: 'LEDGER_CREATION',
            action: `Create GL Account ${GL_ACCT_NO}`,
            oldValue: null,
            newValue: { GL_ACCT_NO, GL_ACCT_CAT: inferredCategory, branchCode },
            ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || '127.0.0.1',
            accountNo: GL_ACCT_NO,
          }, { session });
        } catch (error) {
          logger.error(`Failed to create GL Account ${GL_ACCT_NO}: ${error.message}`);
          throw new Error(`Failed to create GL Account ${GL_ACCT_NO}: ${error.message}`);
        }
      }

      if (CRS_ALLOWED_FG !== undefined) {
        glAccount.CR_ALLOWED = CRS_ALLOWED_FG;
        await glAccount.save({ session });
      }

      if (!glAccount.canPost(TRANSACTION_TYPE)) {
        throw new Error(`GL Account ${GL_ACCT_NO} does not allow ${TRANSACTION_TYPE} transactions`);
      }

      if (!LEDGER_NO) {
        LEDGER_NO = glAccount.LEDGER_NO || '100';
      }
      if (GL_ACCT_CAT && GL_ACCT_CAT.toUpperCase() !== glAccount.GL_ACCT_CAT.toUpperCase()) {
        throw new Error(`GL_ACCT_CAT ${GL_ACCT_CAT} does not match GL Account category ${glAccount.GL_ACCT_CAT}`);
      }
      GL_ACCT_CAT = glAccount.GL_ACCT_CAT;

      if (SEG_NO !== glAccount.SEG_NO) {
        logger.warn(`SEG_NO mismatch: Request SEG_NO=${SEG_NO}, GL Account SEG_NO=${glAccount.SEG_NO}`);
      }

      if (TRANSACTION_TYPE === 'DR' && glAccount.GL_ACCT_CAT === 'ASSET') {
        if ((glAccount.LEDGER_BALANCE || 0) < AMOUNT) {
          throw new Error(`Insufficient funds in GL Account ${GL_ACCT_NO} for debit transaction`);
        }
      }

      let customerAcct = null;
      if (ACCT_NO) {
        customerAcct = await CustomerAccount.findOne({ 
          ACCT_NO, 
          organizationName, 
          branchName,
          branchCode 
        }).session(session);
        if (!customerAcct) {
          throw new Error(`Customer account ${ACCT_NO} not found`);
        }
        if (TRANSACTION_TYPE === 'DR' && !customerAcct.DR_ALLOWED) {
          throw new Error(`Customer account ${ACCT_NO} does not allow debit transactions`);
        }
        if (TRANSACTION_TYPE === 'CR' && !customerAcct.CR_ALLOWED) {
          throw new Error(`Customer account ${ACCT_NO} does not allow credit transactions`);
        }
        if (TRANSACTION_TYPE === 'DR' && customerAcct.LEDGER_BAL < AMOUNT) {
          throw new Error(`Insufficient funds in customer account ${ACCT_NO}`);
        }
      }

      if (glAccount.DELAY_GL_POSTING) {
        const queued = await queueGLTransaction(
          {
            GL_ACCT_NO,
            TRANSACTION_TYPE,
            AMOUNT,
            CREATED_BY,
            JOURNAL_ID,
            SUB_LEDGER_NO,
            SEG_NO,
            ACCT_DESC,
            BAL_CD,
            GL_ACCT_CAT,
            organizationName,
            branchName,
            branchCode,
          },
          { session }
        );

        // Create Reconciliation entry for queued transaction
        const reconciliation = new Reconciliation({
          JOURNAL_ID,
          GL_ACCT_NO,
          TRANSACTION_ID: queued.transaction.JOURNAL_ID,
          EXTERNAL_REF: EXTERNAL_REF || null,
          STATUS: 'Pending',
          AMOUNT,
          CURRENCY_CODE: 'NGN',
          organizationName,
          branchName,
          branchCode,
          CREATED_AT: new Date()
        });
        await reconciliation.save({ session });

        await createAuditTrail({
          eventId: JOURNAL_ID,
          userId: CREATED_BY,
          eventType: 'QUEUE_GL_TRANSACTION',
          action: `Queue GL Transaction for ${GL_ACCT_NO}`,
          oldValue: null,
          newValue: { GL_ACCT_NO, STATUS: 'PENDING', branchCode },
          ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || '127.0.0.1',
          accountNo: GL_ACCT_NO,
        }, { session });

        logger.info(`Transaction queued for GL_ACCT_NO: ${GL_ACCT_NO}, JOURNAL_ID: ${JOURNAL_ID}, Branch: ${branchCode}`);

        await session.commitTransaction();
        transactionCompleted = true;
        if (isAPICall) {
          return res.status(201).json({
            message: 'Transaction queued successfully with reconciliation entry',
            transaction: queued.transaction,
            reconciliation
          });
        }
        return { queued: true, transaction: queued.transaction };
      }

      const newTransaction = new GLAccountTransaction({
        GL_ACCT_NO,
        JOURNAL_ID,
        TRANSACTION_ID: `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        DR_ACCT_NO: TRANSACTION_TYPE === 'DR' ? GL_ACCT_NO : null,
        CR_ACCT_NO: TRANSACTION_TYPE === 'CR' ? GL_ACCT_NO : null,
        AMOUNT,
        NARRATION: ACCT_DESC || `Transaction for ${GL_ACCT_NO}`,
        CREATED_BY,
        TRANSACTION_TYPE,
        CURRENCY_CODE: 'NGN',
        STATUS: 'POSTED',
        TransactionId: await generateTransactionId(),
        organizationName,
        branchName,
        branchCode,
      });

      await newTransaction.save({ session });

      const balanceUpdate = glAccount.GL_ACCT_CAT === 'LIABILITY'
        ? (TRANSACTION_TYPE === 'DR' ? -AMOUNT : AMOUNT)
        : (TRANSACTION_TYPE === 'DR' ? AMOUNT : -AMOUNT);
      const updatedGLAccount = await GLAccount.findOneAndUpdate(
        { GL_ACCT_NO, organizationName, branchName, branchCode },
        {
          $inc: { LEDGER_BALANCE: balanceUpdate },
          $push: { transactions: newTransaction._id },
          $set: { ROW_TS: new Date() },
        },
        { session, new: true }
      );

      if (customerAcct) {
        const customerBalanceUpdate = TRANSACTION_TYPE === 'DR' ? -AMOUNT : AMOUNT;
        customerAcct.LEDGER_BAL += customerBalanceUpdate;
        customerAcct.AVAILABLE_BALANCE += customerBalanceUpdate;
        customerAcct.CLEARED_BAL = customerAcct.CLEARED_BAL ? customerAcct.CLEARED_BAL + customerBalanceUpdate : customerAcct.LEDGER_BAL;
        customerAcct.lastActivityDate = new Date();
        await customerAcct.save({ session });
      }

      // Create Reconciliation entry
      const reconciliation = new Reconciliation({
        JOURNAL_ID,
        GL_ACCT_NO,
        TRANSACTION_ID: newTransaction.TransactionId,
        EXTERNAL_REF: EXTERNAL_REF || null,
        STATUS: 'Pending',
        AMOUNT,
        CURRENCY_CODE: 'NGN',
        organizationName,
        branchName,
        branchCode,
        CREATED_AT: new Date()
      });
      await reconciliation.save({ session });

      await createAuditTrail({
        eventId: JOURNAL_ID,
        userId: CREATED_BY,
        eventType: `GL_ACCOUNT_${TRANSACTION_TYPE}`,
        action: `${TRANSACTION_TYPE === 'DR' ? 'Debit' : 'Credit'} GL Account ${GL_ACCT_NO}`,
        oldValue: { LEDGER_BALANCE: glAccount.LEDGER_BALANCE, branchCode },
        newValue: { LEDGER_BALANCE: updatedGLAccount.LEDGER_BALANCE, branchCode },
        ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || '127.0.0.1',
        accountNo: GL_ACCT_NO,
      }, { session });

      logger.info(`Ledger transaction created: ${GL_ACCT_NO}, JOURNAL_ID: ${JOURNAL_ID}, Type: ${TRANSACTION_TYPE}, Amount: ${AMOUNT}, Branch: ${branchCode}`);
      
      await session.commitTransaction();
      transactionCompleted = true;
      if (isAPICall) {
        return res.status(201).json({
          message: 'Transaction processed successfully with reconciliation entry',
          transaction: newTransaction,
          reconciliation,
          updatedBalance: updatedGLAccount.LEDGER_BALANCE,
        });
      }
      return { queued: false, transaction: newTransaction };
    });
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    logger.error('Error creating ledger transaction:', { error: error.message, transactionData: transactionData || req?.body || {} });
    // Audit failure
    auditLogger.error('Audit Event', {
      entity_type: 'GL_ACCOUNT_TRANSACTION',
      entity_id: null,
      user_id: inputData?.CREATED_BY || 'system',
      action: 'create_ledger_entry',
      old_value: null,
      new_value: null,
      ip_address: req?.ip || 'unknown',
      event_type: 'GL_ERROR',
      outcome: 'failure',
      error: error.message
    });
    if (isAPICall) {
      return res.status(
        error.message.includes('Invalid') || error.message.includes('not found') || error.message.includes('Missing') || error.message.includes('Insufficient') ? 400 : 500
      ).json({
        message: 'Server error creating ledger transaction',
        error: error.message,
      });
    }
    throw error;
  } finally {
    if (!options.session) {
      session.endSession();
    }
  }
};

// Add these missing functions to your LedgerController.js

export const getLedgerEntries = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { glAccountNo, organizationName, branchName, branchCode } = req.query;
      const filter = {};
      if (glAccountNo) filter.GL_ACCT_NO = glAccountNo;
      if (organizationName) filter.organizationName = organizationName;
      if (branchName) filter.branchName = branchName;
      if (branchCode) filter.branchCode = branchCode;
      
      const entries = await GLAccountTransaction.find(filter).sort({ createdAt: -1 }).session(session);
      return res.status(200).json({
        success: true,
        data: entries,
      });
    });
  } catch (error) {
    logger.error('Error fetching ledger transactions:', { error: error.message });
    return res.status(500).json({ 
      success: false,
      message: 'Server error fetching ledger transactions',
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

export const getAllLedgers = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { organizationName, branchName, branchCode } = req.query;
      const filter = {};
      if (organizationName) filter.organizationName = organizationName;
      if (branchName) filter.branchName = branchName;
      if (branchCode) filter.branchCode = branchCode;
      
      const ledgers = await GLAccount.find(filter).session(session);
      return res.status(200).json({
        success: true,
        data: ledgers,
      });
    });
  } catch (error) {
    logger.error('Error fetching ledgers:', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching ledger entries',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

export const getLedgerByAcctNo = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { GL_ACCT_NO, organizationName, branchName, branchCode } = req.params;
      const filter = { GL_ACCT_NO };
      if (organizationName) filter.organizationName = organizationName;
      if (branchName) filter.branchName = branchName;
      if (branchCode) filter.branchCode = branchCode;
      
      const ledger = await GLAccount.findOne(filter).session(session);

      if (!ledger) {
        return res.status(404).json({ 
          success: false,
          message: 'Ledger entry not found' 
        });
      }

      return res.status(200).json({
        success: true,
        data: ledger,
      });
    });
  } catch (error) {
    logger.error('Error fetching ledger entry:', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching the ledger entry',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

export const updateLedgerByAcctNo = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { GL_ACCT_NO, organizationName, branchName, branchCode } = req.params;
      const updates = req.body;

      const validFields = ['TRANSACTION_TYPE', 'AMOUNT', 'LEDGER_BALANCE', 'ACCT_DESC', 'CHART_OF_ACCT_ID', 'LEDGER_NO', 'DR_ALLOWED', 'CR_ALLOWED', 'REC_ST'];
      const hasValidUpdate = validFields.some(field => updates.hasOwnProperty(field));
      if (!hasValidUpdate) {
        return res.status(400).json({ 
          success: false,
          message: 'At least one valid field is required to update the ledger entry' 
        });
      }

      const filter = { GL_ACCT_NO };
      if (organizationName) filter.organizationName = organizationName;
      if (branchName) filter.branchName = branchName;
      if (branchCode) filter.branchCode = branchCode;

      const ledger = await GLAccount.findOneAndUpdate(
        filter, 
        updates, 
        { session, new: true } 
      );

      if (!ledger) {
        return res.status(404).json({ 
          success: false,
          message: 'Ledger entry not found' 
        });
      }

      // Audit trail for ledger update
      await createAuditTrail({
        eventId: await generateEventId(session),
        userId: req.body.CREATED_BY || 'system',
        eventType: 'LEDGER_UPDATE',
        action: `Update GL Account ${GL_ACCT_NO}`,
        oldValue: null, // You might want to capture old values
        newValue: updates,
        ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || '127.0.0.1',
        accountNo: GL_ACCT_NO,
      }, { session });

      return res.status(200).json({
        success: true,
        message: 'Ledger entry updated successfully',
        data: ledger,
      });
    });
  } catch (error) {
    logger.error('Error updating ledger entry:', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating the ledger entry',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

export const updateLedgerBalanceById = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const ledgerId = req.params.id;
      const { LEDGER_BALANCE, CREATED_BY } = req.body;

      let safeBalance = Number(LEDGER_BALANCE);
      if (isNaN(safeBalance)) {
        return res.status(400).json({ 
          success: false,
          message: `Invalid LEDGER_BALANCE value: ${LEDGER_BALANCE}` 
        });
      }

      const updatedLedger = await GLAccount.findByIdAndUpdate(
        ledgerId, 
        { LEDGER_BALANCE: safeBalance }, 
        { session, new: true, runValidators: true } 
      );

      if (!updatedLedger) {
        return res.status(404).json({ 
          success: false,
          message: 'Ledger not found' 
        });
      }

      // Audit trail for balance update
      await createAuditTrail({
        eventId: await generateEventId(session),
        userId: CREATED_BY || 'system',
        eventType: 'LEDGER_BALANCE_UPDATE',
        action: `Update Balance for GL Account ${updatedLedger.GL_ACCT_NO}`,
        oldValue: { LEDGER_BALANCE: updatedLedger.LEDGER_BALANCE - safeBalance },
        newValue: { LEDGER_BALANCE: safeBalance },
        ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || '127.0.0.1',
        accountNo: updatedLedger.GL_ACCT_NO,
      }, { session });

      return res.status(200).json({
        success: true,
        message: 'Ledger updated successfully',
        data: updatedLedger,
      });
    });
  } catch (error) {
    logger.error('Error updating ledger:', { error: error.message });
    return res.status(500).json({ 
      success: false,
      message: 'Server error updating ledger', 
      error: error.message 
    });
  } finally {
    session.endSession();
  }
};

export const deleteLedgerByAcctNo = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { GL_ACCT_NO, organizationName, branchName, branchCode } = req.params;
      const filter = { GL_ACCT_NO };
      if (organizationName) filter.organizationName = organizationName;
      if (branchName) filter.branchName = branchName;
      if (branchCode) filter.branchCode = branchCode;

      const ledger = await GLAccount.findOneAndDelete(filter).session(session);

      if (!ledger) {
        return res.status(404).json({ 
          success: false,
          message: 'Ledger entry not found' 
        });
      }

      // Audit trail for deletion
      await createAuditTrail({
        eventId: await generateEventId(session),
        userId: req.body.CREATED_BY || 'system',
        eventType: 'LEDGER_DELETION',
        action: `Delete GL Account ${GL_ACCT_NO}`,
        oldValue: ledger.toObject(),
        newValue: null,
        ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || '127.0.0.1',
        accountNo: GL_ACCT_NO,
      }, { session });

      return res.status(200).json({ 
        success: true,
        message: 'Ledger entry deleted successfully' 
      });
    });
  } catch (error) {
    logger.error('Error deleting ledger entry:', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'An error occurred while deleting the ledger entry',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// Also add the approveGLTransaction function that was cut off
export const approveGLTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    await session.withTransaction(async () => {
      const { journalId } = req.params;
      const { APPROVED_BY, organizationName, branchName, branchCode } = req.body;

      const pendingTransaction = await PendingGLTransaction.findOne({ 
        JOURNAL_ID: journalId, 
        organizationName, 
        branchName,
        branchCode 
      }).session(session);
      
      if (!pendingTransaction) {
        throw new Error(`Pending transaction with JOURNAL_ID ${journalId} not found`);
      }
      if (pendingTransaction.STATUS !== 'PENDING') {
        throw new Error(`Transaction with JOURNAL_ID ${journalId} is not in PENDING status`);
      }

      const transactionData = {
        GL_ACCT_NO: pendingTransaction.GL_ACCT_NO,
        AMOUNT: pendingTransaction.AMOUNT,
        TRANSACTION_TYPE: pendingTransaction.TRANSACTION_TYPE,
        CREATED_BY: pendingTransaction.CREATED_BY,
        SUB_LEDGER_NO: pendingTransaction.SUB_LEDGER_NO,
        SEG_NO: pendingTransaction.SEG_NO,
        ACCT_DESC: pendingTransaction.ACCT_DESC,
        JOURNAL_ID: pendingTransaction.JOURNAL_ID,
        BAL_CD: pendingTransaction.BAL_CD,
        GL_ACCT_CAT: pendingTransaction.GL_ACCT_CAT,
        organizationName,
        branchName,
        branchCode,
      };

      const result = await createLedgerEntry(null, null, transactionData, { session });

      pendingTransaction.STATUS = 'APPROVED';
      pendingTransaction.APPROVED_BY = APPROVED_BY;
      pendingTransaction.APPROVED_DATE = new Date();
      await pendingTransaction.save({ session });

      await createAuditTrail({
        eventId: journalId,
        userId: APPROVED_BY,
        eventType: 'GL_TRANSACTION_APPROVED',
        action: `Approved GL Transaction for GL_ACCT_NO ${transactionData.GL_ACCT_NO}`,
        oldValue: { STATUS: 'PENDING' },
        newValue: { STATUS: 'APPROVED' },
        ipAddress: req?.ip || req.headers?.['x-forwarded-for'] || '127.0.0.1',
        accountNo: transactionData.GL_ACCT_NO,
      }, { session });

      logger.info(`Transaction approved: GL_ACCT_NO: ${transactionData.GL_ACCT_NO}, JOURNAL_ID: ${journalId}`);

      await session.commitTransaction();
      transactionCompleted = true;
      return res.status(200).json({
        message: 'Transaction approved and posted successfully',
        transaction: result.transaction,
      });
    });
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    logger.error('Error approving GL transaction:', { error: error.message, journalId });
    return res.status(
      error.message.includes('not found') || error.message.includes('Invalid') ? 400 : 500
    ).json({
      message: 'Server error approving GL transaction',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};