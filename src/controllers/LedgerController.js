import mongoose from 'mongoose';
import GLAccount from '../models/GLAccount.js';
import GLTransaction from '../models/GLAccountTransaction.js';
import PendingGLTransaction from '../models/PendingGLTransaction.js';
import CustomerAccount from '../models/CustomerAccount.js';
import { createAuditTrail } from './AudiTrailController.js';
import logger from '../utils/logger.js';

// Helper function to validate GL account number format
const validateGLAccountFormat = (glAccountNo) => {
  const pattern = /^1-\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3}-\d{1,3}$/;
  return pattern.test(glAccountNo);
};

// Helper function to generate a unique journal ID
const generateJournalId = () => {
  return Math.floor(100000000 + Math.random() * 900000000).toString();
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
        BU_ID,
        SEG_NO,
        JOURNAL_ID,
        GL_ACCT_CAT,
        CRS_ALLOWED_FG,
      } = inputData;

      const initialRequiredFields = { GL_ACCT_NO, AMOUNT, CREATED_BY, SUB_LEDGER_NO, SEG_NO, ACCT_DESC };
      const missingFields = Object.entries(initialRequiredFields)
        .filter(([_, value]) => value == null || value === '')
        .map(([key]) => key);
      if (missingFields.length > 0) {
        logger.error('Missing required fields', { missingFields, inputData });
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
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
      BU_ID = BU_ID ? String(BU_ID).padStart(3, '0') : '001';
      SEG_NO = String(SEG_NO).padStart(3, '0');

      if (LEDGER_NO && !/^\d{3}$/.test(LEDGER_NO)) throw new Error('LEDGER_NO must be a 3-digit number');
      if (!/^\d{2,3}$/.test(BAL_CD)) throw new Error('BAL_CD must be a 2 or 3-digit number');
      if (!/^\d{3}$/.test(SUB_LEDGER_NO)) throw new Error('SUB_LEDGER_NO must be a 3-digit number');
      if (!/^\d{3}$/.test(BU_ID)) throw new Error('BU_ID must be a 3-digit number');
      if (!/^\d{1,3}$/.test(SEG_NO)) throw new Error('SEG_NO must be a 1 to 3-digit number');
      if (!validateGLAccountFormat(GL_ACCT_NO)) {
        throw new Error('GL_ACCT_NO must match format: 1-XX-XXX-XXX-XXX-X or 1-XXX-XXX-XXX-XXX-X');
      }
      if (!/^\d{8,12}$/.test(JOURNAL_ID)) throw new Error('JOURNAL_ID must be an 8 to 12-digit number');

      let glAccount = await GLAccount.findOne({ GL_ACCT_NO }).session(session);
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
            newValue: { GL_ACCT_NO, GL_ACCT_CAT: inferredCategory },
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
        customerAcct = await CustomerAccount.findOne({ ACCT_NO }).session(session);
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
        const pendingTransaction = new PendingGLTransaction({
          GL_ACCT_NO,
          TRANSACTION_TYPE,
          AMOUNT,
          TRANSACTION_DATE: new Date(),
          CREATED_BY,
          JOURNAL_ID,
          SUB_LEDGER_NO,
          SEG_NO,
          ACCT_DESC,
          BAL_CD,
          GL_ACCT_CAT,
          STATUS: 'PENDING',
        });
        await pendingTransaction.save({ session });
        logger.info(`Transaction queued for GL_ACCT_NO: ${GL_ACCT_NO}, JOURNAL_ID: ${JOURNAL_ID}`);

        await session.commitTransaction();
        transactionCompleted = true;
        if (res) {
          return res.status(201).json({
            message: 'Transaction queued successfully',
            transaction: pendingTransaction.toObject(),
          });
        }
        return { queued: true, transaction: pendingTransaction.toObject() };
      }

      const newTransaction = new GLTransaction({
        GL_ACCT_NO,
        AMOUNT,
        TRANSACTION_TYPE,
        CREATED_BY,
        SUB_LEDGER_NO,
        SEG_NO,
        description: ACCT_DESC,
        JOURNAL_ID,
        BAL_CD,
        GL_ACCT_CAT,
        timestamp: new Date(),
      });

      await newTransaction.save({ session });

      const balanceUpdate = glAccount.GL_ACCT_CAT === 'LIABILITY'
        ? (TRANSACTION_TYPE === 'DR' ? -AMOUNT : AMOUNT)
        : (TRANSACTION_TYPE === 'DR' ? AMOUNT : -AMOUNT);
      const updatedGLAccount = await GLAccount.findOneAndUpdate(
        { GL_ACCT_NO },
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

      await createAuditTrail({
        eventId: JOURNAL_ID,
        userId: CREATED_BY,
        eventType: `GL_ACCOUNT_${TRANSACTION_TYPE}`,
        action: `${TRANSACTION_TYPE === 'DR' ? 'Debit' : 'Credit'} GL Account ${GL_ACCT_NO}`,
        oldValue: { LEDGER_BALANCE: glAccount.LEDGER_BALANCE },
        newValue: { LEDGER_BALANCE: updatedGLAccount.LEDGER_BALANCE },
        ipAddress: req?.ip || req.headers?.['x-forwarded-for'] || '127.0.0.1',
        accountNo: GL_ACCT_NO,
      }, { session });

      logger.info(`Ledger transaction created: ${GL_ACCT_NO}, JOURNAL_ID: ${JOURNAL_ID}, Type: ${TRANSACTION_TYPE}, Amount: ${AMOUNT}`);
      
      await session.commitTransaction();
      transactionCompleted = true;
      if (res) {
        const savedTransaction = await GLTransaction.findOne({ JOURNAL_ID }).session(session);
        return res.status(201).json(savedTransaction);
      }
      return { queued: false, transaction: updatedGLAccount };
    });
  } catch (error) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    logger.error('Error creating ledger transaction:', { error: error.message, transactionData: transactionData || req?.body || {} });
    if (res) {
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

export const queueGLTransaction = async ({ GL_ACCT_NO, TRANSACTION_TYPE, AMOUNT, CREATED_BY, JOURNAL_ID, SUB_LEDGER_NO, SEG_NO, ACCT_DESC, BAL_CD, GL_ACCT_CAT }, options = {}) => {
  const session = options.session || null;

  try {
    let glAccount = await GLAccount.findOne({ GL_ACCT_NO }).session(session);
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
        SUB_LEDGER_NO: SUB_LEDGER_NO || '000',
        SEG_NO: SEG_NO || '1',
        LEDGER_NO: '100',
        DESCRIPTION: ACCT_DESC || `Auto-created GL account for ${inferredCategory} transactions`,
        DELAY_GL_POSTING: false,
        transactions: [],
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
          newValue: { GL_ACCT_NO, GL_ACCT_CAT: inferredCategory },
          ipAddress: '127.0.0.1',
          accountNo: GL_ACCT_NO,
        }, { session });
      } catch (error) {
        logger.error(`Failed to create GL Account ${GL_ACCT_NO}: ${error.message}`);
        throw new Error(`Failed to create GL Account ${GL_ACCT_NO}: ${error.message}`);
      }
    }

    let normalizedType = TRANSACTION_TYPE.toUpperCase();
    if (normalizedType === 'DEBIT') normalizedType = 'DR';
    if (normalizedType === 'CREDIT') normalizedType = 'CR';
    if (!['DR', 'CR'].includes(normalizedType)) {
      throw new Error('TRANSACTION_TYPE must be DR, CR, DEBIT, or CREDIT');
    }

    if (typeof AMOUNT !== 'number' || AMOUNT <= 0) {
      throw new Error('AMOUNT must be a positive number');
    }

    if (!glAccount.canPost(normalizedType)) {
      throw new Error(`GL Account ${GL_ACCT_NO} does not allow ${normalizedType} transactions`);
    }

    BAL_CD = BAL_CD || glAccount.BAL_CD || (normalizedType === 'DR' ? '01' : '02');
    GL_ACCT_CAT = GL_ACCT_CAT || glAccount.GL_ACCT_CAT;
    SUB_LEDGER_NO = SUB_LEDGER_NO || '000';
    SEG_NO = SEG_NO || '1';
    JOURNAL_ID = JOURNAL_ID || generateJournalId();
    ACCT_DESC = ACCT_DESC || `GL Transaction for ${GL_ACCT_NO}`;

    const transactionData = {
      GL_ACCT_NO,
      AMOUNT,
      TRANSACTION_TYPE: normalizedType,
      CREATED_BY,
      SUB_LEDGER_NO,
      SEG_NO,
      ACCT_DESC,
      JOURNAL_ID,
      BAL_CD,
      GL_ACCT_CAT,
    };

    if (glAccount.DELAY_GL_POSTING) {
      const pendingTransaction = new PendingGLTransaction({
        ...transactionData,
        TRANSACTION_DATE: new Date(),
        STATUS: 'PENDING',
      });
      await pendingTransaction.save({ session });
      logger.info(`Transaction queued for GL_ACCT_NO: ${GL_ACCT_NO}, JOURNAL_ID: ${JOURNAL_ID}`);
      return { queued: true, transaction: pendingTransaction.toObject() };
    }

    const result = await createLedgerEntry(null, null, transactionData, { session });

    logger.info(`Immediate posting for GL_ACCT_NO: ${GL_ACCT_NO}, Type: ${normalizedType}, Amount: ${AMOUNT}`);
    return { queued: false, transaction: result.transaction };
  } catch (error) {
    logger.error('Error queuing GL transaction:', { error: error.message, GL_ACCT_NO, JOURNAL_ID });
    throw error;
  }
};

export const approveGLTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionCompleted = false;

  try {
    await session.withTransaction(async () => {
      const { journalId } = req.params;
      const { APPROVED_BY } = req.body;

      const pendingTransaction = await PendingGLTransaction.findOne({ JOURNAL_ID: journalId }).session(session);
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

export const getLedgerEntries = async (req, res) => {
  try {
    const { glAccountNo } = req.query;
    const filter = glAccountNo ? { GL_ACCT_NO: glAccountNo } : {};
    const entries = await GLTransaction.find(filter).sort({ timestamp: -1 });
    return res.status(200).json(entries);
  } catch (error) {
    logger.error('Error fetching ledger transactions:', { error: error.message });
    return res.status(500).json({ message: 'Server error fetching ledger transactions' });
  }
};

export const getAllLedgers = async (req, res) => {
  try {
    const ledgers = await Ledger.find();
    return res.status(200).json(ledgers);
  } catch (error) {
    console.error('Error fetching ledgers:', error.message);
    return res.status(500).json({
      message: 'An error occurred while fetching ledger entries',
      error: error.message,
    });
  }
};

export const getLedgerByAcctNo = async (req, res) => {
  try {
    const { GL_ACCT_NO } = req.params;
    const ledger = await Ledger.findOne({ GL_ACCT_NO });

    if (!ledger) {
      return res.status(404).json({ message: 'Ledger entry not found' });
    }

    return res.status(200).json(ledger);
  } catch (error) {
    console.error('Error fetching ledger entry:', error.message);
    return res.status(500).json({
      message: 'An error occurred while fetching the ledger entry',
      error: error.message,
    });
  }
};

export const updateLedgerByAcctNo = async (req, res) => {
  try {
    const { GL_ACCT_NO } = req.params;
    const updates = req.body;

    const validFields = ['TRANSACTION_TYPE', 'AMOUNT', 'LEDGER_BALANCE', 'ACCT_DESC', 'CHART_OF_ACCT_ID', 'LEDGER_NO'];
    const hasValidUpdate = validFields.some(field => updates.hasOwnProperty(field));
    if (!hasValidUpdate) {
      return res.status(400).json({ message: 'At least one valid field is required to update the ledger entry' });
    }

    const ledger = await Ledger.findOneAndUpdate({ GL_ACCT_NO }, updates, { new: true });

    if (!ledger) {
      return res.status(404).json({ message: 'Ledger entry not found' });
    }

    return res.status(200).json({
      message: 'Ledger entry updated successfully',
      ledger,
    });
  } catch (error) {
    logger.error('Error updating ledger entry:', { error: error.message });
    return res.status(500).json({
      message: 'An error occurred while updating the ledger entry',
      error: error.message,
    });
  }
};

export const deleteLedgerByAcctNo = async (req, res) => {
  try {
    const { GL_ACCT_NO } = req.params;

    const ledger = await Ledger.findOneAndDelete({ GL_ACCT_NO });

    if (!ledger) {
      return res.status(404).json({ message: 'Ledger entry not found' });
    }

    return res.status(200).json({ message: 'Ledger entry deleted successfully' });
  } catch (error) {
    logger.error('Error deleting ledger entry:', { error: error.message });
    return res.status(500).json({
      message: 'An error occurred while deleting the ledger entry',
      error: error.message,
    });
  }
};

export const updateLedgerBalanceById = async (req, res) => {
  try {
    const ledgerId = req.params.id;
    const { LEDGER_BALANCE } = req.body;

    let safeBalance = Number(LEDGER_BALANCE);
    if (isNaN(safeBalance)) {
      return res.status(400).json({ message: `Invalid LEDGER_BALANCE value: ${LEDGER_BALANCE}` });
    }

    const updatedLedger = await Ledger.findByIdAndUpdate(ledgerId, { LEDGER_BALANCE: safeBalance }, { new: true, runValidators: true });

    if (!updatedLedger) {
      return res.status(404).json({ message: 'Ledger not found' });
    }

    return res.status(200).json({
      message: 'Ledger updated successfully',
      ledger: updatedLedger,
    });
  } catch (error) {
    logger.error('Error updating ledger:', { error: error.message });
    return res.status(500).json({ message: 'Server error updating ledger', error: error.message });
  }
};