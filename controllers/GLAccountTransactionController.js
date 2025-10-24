import mongoose from 'mongoose';
import Ledger from '../models/Ledger.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import GLAccount from '../models/GLAccount.js';
import GLTransactionQueue from '../models/GLTransactionQueue.js';
import Reconciliation from '../models/Reconciliation.js'; // Added Reconciliation import
import Branch from '../models/Branch.js'; // Added Branch import for validation
import auditLogger from '../utils/AuditLogger.js';  // Fixed: Default import for hybrid logger
import { queueGLTransaction } from '../utils/GLQueueUtils.js';
import { createRootSubfolder } from '../utils/subfolderUtils.js';

// Validate GL account number format: 6 groups of 1-3 digits separated by '-'
const isValidGLAcctNo = (glAcctNo) => {
  const regex = /^(\d{1,3}-){5}\d{1,3}$/;
  return regex.test(glAcctNo);
};

// Generate a unique 16–18 digit TransactionId
const generateTransactionId = async () => {
  let transactionId;
  let isUnique = false;
  const minDigits = 16;
  const maxDigits = 18;

  while (!isUnique) {
    const timestamp = Date.now().toString();
    const randomDigits = Math.floor(Math.random() * 100000000).toString().padStart(8, '0');
    transactionId = parseInt(timestamp + randomDigits);
    if (transactionId.toString().length < minDigits) {
      transactionId = parseInt(transactionId.toString().padEnd(minDigits, '0'));
    } else if (transactionId.toString().length > maxDigits) {
      transactionId = parseInt(transactionId.toString().slice(0, maxDigits));
    }
    const existing = await GLAccountTransaction.findOne({ TransactionId: transactionId });
    isUnique = !existing;
  }
  return transactionId;
};

// Controller: Create a single GL transaction
export const createGLAccountTransaction = async (req, res, session = null) => {
  const isExternalSession = !!session;
  if (!session) {
    session = await mongoose.startSession();
  }
  let transactionCompleted = false;

  try {
    const result = await session.withTransaction(async () => {
      const {
        GL_ACCT_NO,
        AMOUNT,
        TRANSACTION_TYPE,
        CREATED_BY,
        DRS_ALLOWED_FG,
        CRS_ALLOWED_FG,
        description,
        SUB_LEDGER_NO,
        SEG_NO,
        JOURNAL_ID,
        CHART_OF_ACCT_ID,
        ACCT_DESC,
        DELAY_GL_POSTING,
        source = 'manual',
        organizationName, // Added for Reconciliation and Branch validation
        branchName, // Added for Reconciliation and Branch validation
        EXTERNAL_REF // Added for Reconciliation
      } = req.body;

      // Validate required fields
      if (!GL_ACCT_NO || AMOUNT == null || !TRANSACTION_TYPE || !CREATED_BY || !organizationName || !branchName) {
        throw new Error('Missing required fields: GL_ACCT_NO, AMOUNT, TRANSACTION_TYPE, CREATED_BY, organizationName, branchName');
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

      if (typeof AMOUNT !== 'number' || AMOUNT <= 0) {
        throw new Error('AMOUNT must be a positive number');
      }

      const normalizedType = TRANSACTION_TYPE.toUpperCase();
      if (!['DEBIT', 'CREDIT'].includes(normalizedType)) {
        throw new Error('TRANSACTION_TYPE must be "Debit" or "Credit"');
      }

      // Log request data for debugging
      console.log('Transaction request:', { GL_ACCT_NO, AMOUNT, TRANSACTION_TYPE, JOURNAL_ID, source, organizationName, branchName });

      const glAccount = await GLAccount.findOne({ GL_ACCT_NO, organizationName, branchName }).session(session);
      if (!glAccount) {
        throw new Error(`GL Account ${GL_ACCT_NO} not found for organization ${organizationName} and branch ${branchName}`);
      }

      // Log glAccount and DELAY_GL_POSTING for debugging
      console.log('glAccount:', glAccount);
      console.log('Request DELAY_GL_POSTING:', DELAY_GL_POSTING);

      // Check for existing Ledger
      let ledger = await Ledger.findOne({ GL_ACCT_NO, organizationName, branchName }).session(session);
      let isNewLedger = false;

      if (!ledger) {
        console.log(`No ledger found for GL_ACCT_NO: ${GL_ACCT_NO}, creating new ledger`);
        const [PARENT_ID, BAL_CD, LEDGER_NO, SUB_LEDGER_NO_PART, BU_ID, SEG_NO_PART] = GL_ACCT_NO.split('-');
        const lastAcct = await Ledger.findOne().sort({ GL_ACCT_ID: -1 }).limit(1).session(session);
        const newGLAcctId = lastAcct ? String(parseInt(lastAcct.GL_ACCT_ID) + 1).padStart(7, '0') : '3111111';
        const postFg = glAccount?.POST_FG ? (glAccount.POST_FG === 'Y' ? true : false) : false;

        ledger = new Ledger({
          GL_ACCT_NO,
          GL_ACCT_ID: newGLAcctId,
          CREATED_BY,
          LEDGER_NO: LEDGER_NO || SUB_LEDGER_NO || '100',
          PARENT_ID: PARENT_ID || '1',
          BAL_CD: BAL_CD || glAccount?.BAL_CD || '01',
          SUB_LEDGER_NO: SUB_LEDGER_NO || SUB_LEDGER_NO_PART || '000',
          BU_ID: BU_ID || '001',
          SEG_NO: SEG_NO || SEG_NO_PART || '1',
          CHART_OF_ACCT_ID: CHART_OF_ACCT_ID || glAccount?.CHART_OF_ACCT_ID || '10001',
          ACCT_DESC: ACCT_DESC || glAccount?.ACCT_DESC || 'GL Account',
          GL_ACCT_CAT: glAccount?.GL_ACCT_CAT && ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].includes(glAccount.GL_ACCT_CAT.toUpperCase())
            ? glAccount.GL_ACCT_CAT.toUpperCase()
            : 'ASSET',
          GL_ACCT_STRUCT_ID: glAccount?.GL_ACCT_STRUCT_ID || '100',
          JOURNAL_ID: JOURNAL_ID || (await generateTransactionId()),
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
          console.log(`Created new ledger for GL_ACCT_NO: ${GL_ACCT_NO}`);
        } catch (error) {
          if (error.code === 11000 && error.keyPattern.GL_ACCT_NO) {
            console.log(`Duplicate ledger detected for GL_ACCT_NO: ${GL_ACCT_NO}, fetching existing ledger`);
            ledger = await Ledger.findOne({ GL_ACCT_NO, organizationName, branchName }).session(session);
            if (!ledger) {
              throw new Error(`Failed to find existing ledger for GL_ACCT_NO ${GL_ACCT_NO} after duplicate key error`);
            }
          } else {
            throw error; // Rethrow non-duplicate errors
          }
        }

        // Audit ledger creation via hybrid logger
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
      } else {
        console.log(`Ledger found for GL_ACCT_NO: ${GL_ACCT_NO}, proceeding with transaction`);
      }

      // CONTROL_ACCT_FG enforcement
      if (glAccount.CONTROL_ACCT_FG && source === 'manual') {
        throw new Error(`Manual transactions are not allowed on CONTROL account ${GL_ACCT_NO}`);
      }

      // Generate JOURNAL_ID if not provided
      const journalId = JOURNAL_ID || (await generateTransactionId());

      // Queue transaction if DELAY_GL_POSTING is true or inherited from glAccount
      if (DELAY_GL_POSTING === true || (DELAY_GL_POSTING === undefined && glAccount.DELAY_GL_POSTING === true)) {
        const queued = await queueGLTransaction(
          {
            GL_ACCT_NO,
            TRANSACTION_TYPE: normalizedType,
            AMOUNT,
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
          TRANSACTION_ID: queued.transaction.TransactionId,
          EXTERNAL_REF: EXTERNAL_REF || null,
          STATUS: 'Pending',
          AMOUNT,
          CURRENCY_CODE: 'NGN',
          organizationName,
          branchName,
          CREATED_AT: new Date()
        });
        await reconciliation.save({ session });

        // Audit queued transaction via hybrid logger
        auditLogger.info('Audit Event', {
          entity_type: 'QUEUE_GL_TRANSACTION',
          entity_id: queued.transaction?._id,
          user_id: CREATED_BY,
          action: 'CREATE',
          old_value: null,
          new_value: { ...queued.transaction, reconciliationId: reconciliation._id },
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

      // Immediate posting
      const transactionData = {
        GL_ACCT_NO,
        AMOUNT,
        TRANSACTION_TYPE: normalizedType,
        CREATED_BY,
        DRS_ALLOWED_FG: DRS_ALLOWED_FG ?? (normalizedType === 'DEBIT'),
        CRS_ALLOWED_FG: CRS_ALLOWED_FG ?? (normalizedType === 'CREDIT'),
        DESCRIPTION: description || `Transaction for ${GL_ACCT_NO}`,
        SUB_LEDGER_NO: SUB_LEDGER_NO || ledger.SUB_LEDGER_NO || '0000',
        SEG_NO: SEG_NO || ledger.SEG_NO || '1',
        TransactionId: await generateTransactionId(),
        JOURNAL_ID: journalId,
        source,
        organizationName,
        branchName
      };

      const processedTransaction = await postSingleGLTransaction(transactionData, req, session);

      // Create Reconciliation entry for immediate transaction
      const reconciliation = new Reconciliation({
        JOURNAL_ID: journalId,
        GL_ACCT_NO,
        TRANSACTION_ID: processedTransaction.TransactionId,
        EXTERNAL_REF: EXTERNAL_REF || null,
        STATUS: 'Pending',
        AMOUNT,
        CURRENCY_CODE: 'NGN',
        organizationName,
        branchName,
        CREATED_AT: new Date()
      });
      await reconciliation.save({ session });

      // Audit immediate transaction via hybrid logger
      auditLogger.info('Audit Event', {
        entity_type: 'GL_ACCOUNT_TRANSACTION',
        entity_id: processedTransaction._id,
        user_id: CREATED_BY,
        action: 'CREATE',
        old_value: null,
        new_value: { ...processedTransaction.toObject(), reconciliationId: reconciliation._id },
        ip_address: req?.headers['x-forwarded-for'] || req?.connection?.remoteAddress || 'UNKNOWN',
        event_type: 'GL_ACCOUNT_TRANSACTION',
        outcome: 'success',
        description: `Processed transaction for ${GL_ACCT_NO} with reconciliation in ${organizationName}/${branchName}`
      });

      return {
        message: 'Transaction processed successfully with reconciliation entry',
        transaction: processedTransaction,
        reconciliation,
        updatedBalance: (await Ledger.findOne({ GL_ACCT_NO, organizationName, branchName }, null, { session })).LEDGER_BALANCE
      };
    });

    transactionCompleted = true;
    await session.commitTransaction();
    return res.status(201).json(result);
  } catch (err) {
    if (session.inTransaction() && !transactionCompleted) {
      await session.abortTransaction();
    }
    console.error('❌ GL Transaction Error:', err.message, { transactionData: req.body });
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'GL_ACCOUNT_TRANSACTION',
      entity_id: null,
      user_id: req.body.CREATED_BY || 'system',
      action: 'create_gl_account_transaction',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'GL_ERROR',
      outcome: 'failure',
      error: err.message
    });
    return res.status(err.message.includes('required') || err.message.includes('Invalid') || err.message.includes('not found') ? 400 : 500).json({
      message: 'Transaction processing failed',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  } finally {
    if (!isExternalSession) {
      session.endSession();
    }
  }
};

// Helper to post a single GL transaction with CONTROL_ACCT_FG enforcement
const postSingleGLTransaction = async (entry, req, session) => {
  const {
    GL_ACCT_NO,
    AMOUNT,
    TRANSACTION_TYPE,
    CREATED_BY,
    DRS_ALLOWED_FG,
    CRS_ALLOWED_FG,
    DESCRIPTION,
    CREATE_DT,
    SUB_LEDGER_NO,
    SEG_NO,
    TransactionId,
    JOURNAL_ID,
    QueueTransactionId,
    source = 'system',
    organizationName,
    branchName
  } = entry;

  if (!GL_ACCT_NO || AMOUNT == null || !TRANSACTION_TYPE || !CREATED_BY || !JOURNAL_ID || !organizationName || !branchName) {
    throw new Error('Missing or invalid required fields');
  }

  if (!isValidGLAcctNo(GL_ACCT_NO)) {
    throw new Error('Invalid GL_ACCT_NO format');
  }

  const normalizedType = TRANSACTION_TYPE.toUpperCase() === 'DEBIT' ? 'DR' : TRANSACTION_TYPE.toUpperCase() === 'CREDIT' ? 'CR' : TRANSACTION_TYPE.toUpperCase();
  if (!['DR', 'CR'].includes(normalizedType)) {
    throw new Error('Invalid TRANSACTION_TYPE');
  }

  const ledger = await Ledger.findOne({ GL_ACCT_NO, organizationName, branchName }).session(session);
  if (!ledger) {
    throw new Error(`Ledger not found for GL_ACCT_NO ${GL_ACCT_NO} in ${organizationName}/${branchName}`);
  }

  const glAccount = await GLAccount.findOne({ GL_ACCT_NO, organizationName, branchName }).session(session);
  if (!glAccount) {
    throw new Error(`GL Account not found for GL_ACCT_NO ${GL_ACCT_NO} in ${organizationName}/${branchName}`);
  }

  if (glAccount.CONTROL_ACCT_FG && source === 'manual') {
    throw new Error(`Manual transactions are not allowed on CONTROL account ${GL_ACCT_NO}`);
  }

  let newBalance = ledger.LEDGER_BALANCE ?? 0;
  const amt = parseFloat(AMOUNT);
  const isSettlementGLAccount = GL_ACCT_NO === '01-002-100-115-102'; // settlementGLAccountNo

  if (normalizedType === 'DR') {
    if (!DRS_ALLOWED_FG) {
      throw new Error('Debit not allowed on this account');
    }
    if (ledger.GL_ACCT_CAT === 'ASSET' && newBalance < amt && !isSettlementGLAccount) {
      throw new Error('Insufficient funds for debit transaction');
    }
    newBalance -= amt;
  } else {
    if (!CRS_ALLOWED_FG) {
      throw new Error('Credit not allowed on this account');
    }
    newBalance += amt;
  }

  const newTxn = new GLAccountTransaction({
    GL_ACCT_NO,
    AMOUNT: amt,
    TRANSACTION_TYPE: normalizedType,
    DRS_ALLOWED_FG: DRS_ALLOWED_FG ? 'Y' : 'N',
    CRS_ALLOWED_FG: CRS_ALLOWED_FG ? 'Y' : 'N',
    CURRENCY_CODE: 'NGN',
    EXCHANGE_RATE: 1,
    CREATED_BY,
    CREATE_DT: CREATE_DT ? new Date(CREATE_DT) : new Date(),
    ROW_TS: new Date(),
    SYS_CREATE_TS: new Date(),
    REC_ST: 'A',
    VERSION_NO: 1,
    USER_ID: CREATED_BY,
    LEDGER_NO: ledger.LEDGER_NO,
    SUB_LEDGER_NO: ledger.SUB_LEDGER_NO || SUB_LEDGER_NO || '0000',
    SEG_NO: ledger.SEG_NO || SEG_NO || '1',
    BAL_CD: ledger.BAL_CD,
    ACCT_DESC: ledger.ACCT_DESC,
    GL_ACCT_CAT: ledger.GL_ACCT_CAT,
    GL_ACCT_ID: ledger.GL_ACCT_ID,
    GL_ACCT_STRUCT_ID: ledger.GL_ACCT_STRUCT_ID,
    CHART_OF_ACCT_ID: ledger.CHART_OF_ACCT_ID,
    BU_ID: ledger.BU_ID,
    POST_FG: 'Y',
    CONTROL_ACCT_FG: glAccount.CONTROL_ACCT_FG ? 'Y' : 'N',
    DESCRIPTION,
    TransactionId: TransactionId || (await generateTransactionId()),
    JOURNAL_ID: JOURNAL_ID || (await generateTransactionId()),
    QueueTransactionId,
    organizationName,
    branchName
  });

  await newTxn.save({ session });

  ledger.LEDGER_BALANCE = newBalance;
  await ledger.save({ session });

  await GLAccount.updateOne({ GL_ACCT_NO, organizationName, branchName }, { LEDGER_BALANCE: newBalance }, { session });

  const ip = req?.headers['x-forwarded-for'] || req?.connection?.remoteAddress || 'UNKNOWN';
  // Audit via hybrid logger
  auditLogger.info('Audit Event', {
    entity_type: 'GL_ACCOUNT_TRANSACTION',
    entity_id: newTxn._id,
    user_id: req?.user?.id || CREATED_BY,
    action: 'CREATE',
    old_value: null,
    new_value: newTxn.toObject(),
    ip_address: ip,
    event_type: 'GL_TRANSACTION',
    outcome: 'success',
    description: DESCRIPTION
  });

  try {
    await createRootSubfolder(newTxn._id, { GL_ACCT_NO, createdBy: CREATED_BY, description: DESCRIPTION });
  } catch (error) {
    console.error('Error creating subfolder:', error);
  }

  return newTxn;
};

// Create a double-entry GL transaction
export const createDoubleEntryTransaction = async (req, res) => {
  try {
    const { debitEntry, creditEntry } = req.body;
    if (!debitEntry || !creditEntry) {
      return res.status(400).json({ message: 'Missing debit or credit entry' });
    }
    if (parseFloat(debitEntry.AMOUNT) !== parseFloat(creditEntry.AMOUNT)) {
      return res.status(400).json({ message: 'Debit and credit amounts must match' });
    }
    if (!debitEntry.organizationName || !debitEntry.branchName || !creditEntry.organizationName || !creditEntry.branchName) {
      return res.status(400).json({ message: 'organizationName and branchName are required for both entries' });
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Validate branches
        const debitBranch = await Branch.findOne({
          organizationName: { $regex: `^${debitEntry.organizationName}$`, $options: 'i' },
          branchName: { $regex: `^${debitEntry.branchName}$`, $options: 'i' }
        }).session(session);
        const creditBranch = await Branch.findOne({
          organizationName: { $regex: `^${creditEntry.organizationName}$`, $options: 'i' },
          branchName: { $regex: `^${creditEntry.branchName}$`, $options: 'i' }
        }).session(session);
        if (!debitBranch) {
          throw new Error(`Debit branch ${debitEntry.branchName} does not exist for organization ${debitEntry.organizationName}`);
        }
        if (!creditBranch) {
          throw new Error(`Credit branch ${creditEntry.branchName} does not exist for organization ${creditEntry.organizationName}`);
        }

        const debitTxn = await postSingleGLTransaction(
          { ...debitEntry, TRANSACTION_TYPE: 'Debit', TransactionId: await generateTransactionId() },
          req,
          session
        );
        const creditTxn = await postSingleGLTransaction(
          { ...creditEntry, TRANSACTION_TYPE: 'Credit', TransactionId: await generateTransactionId() },
          req,
          session
        );

        // Create Reconciliation entries for both transactions
        const debitReconciliation = new Reconciliation({
          JOURNAL_ID: debitTxn.JOURNAL_ID,
          GL_ACCT_NO: debitTxn.GL_ACCT_NO,
          TRANSACTION_ID: debitTxn.TransactionId,
          EXTERNAL_REF: debitEntry.EXTERNAL_REF || null,
          STATUS: 'Pending',
          AMOUNT: debitTxn.AMOUNT,
          CURRENCY_CODE: 'NGN',
          organizationName: debitEntry.organizationName,
          branchName: debitEntry.branchName,
          CREATED_AT: new Date()
        });
        await debitReconciliation.save({ session });

        const creditReconciliation = new Reconciliation({
          JOURNAL_ID: creditTxn.JOURNAL_ID,
          GL_ACCT_NO: creditTxn.GL_ACCT_NO,
          TRANSACTION_ID: creditTxn.TransactionId,
          EXTERNAL_REF: creditEntry.EXTERNAL_REF || null,
          STATUS: 'Pending',
          AMOUNT: creditTxn.AMOUNT,
          CURRENCY_CODE: 'NGN',
          organizationName: creditEntry.organizationName,
          branchName: creditEntry.branchName,
          CREATED_AT: new Date()
        });
        await creditReconciliation.save({ session });

        // Audit double-entry via hybrid logger
        auditLogger.info('Audit Event', {
          entity_type: 'DOUBLE_ENTRY_TRANSACTION',
          entity_id: debitTxn._id,
          user_id: req?.user?.id || debitEntry.CREATED_BY,
          action: 'CREATE',
          old_value: null,
          new_value: { debit: debitTxn.toObject(), credit: creditTxn.toObject(), debitReconciliationId: debitReconciliation._id, creditReconciliationId: creditReconciliation._id },
          ip_address: req?.headers['x-forwarded-for'] || req?.connection?.remoteAddress || 'UNKNOWN',
          event_type: 'DOUBLE_ENTRY_TRANSACTION',
          outcome: 'success',
          description: `Created double-entry transaction for ${debitTxn.GL_ACCT_NO} and ${creditTxn.GL_ACCT_NO}`
        });

        return res.status(201).json({
          message: 'Double-entry transaction processed successfully with reconciliation entries',
          debitTransaction: debitTxn,
          creditTransaction: creditTxn,
          debitReconciliation,
          creditReconciliation
        });
      });
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error('❌ Double Entry Transaction Error:', err.message);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'DOUBLE_ENTRY_TRANSACTION',
      entity_id: null,
      user_id: req.body.debitEntry?.CREATED_BY || 'system',
      action: 'create_double_entry_transaction',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'DOUBLE_ENTRY_ERROR',
      outcome: 'failure',
      error: err.message
    });
    return res.status(err.message.includes('required') || err.message.includes('Invalid') || err.message.includes('not found') ? 400 : 500).json({
      message: 'Double-entry transaction failed',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Fetch all GL account transactions
export const getGLAccountTransactions = async (req, res) => {
  try {
    const { organizationName, branchName } = req.query;
    const userId = req.user_id || 'system';  // From middleware
    const ipAddress = req.ip_address || '0.0.0.0';
    
    const query = {};
    if (organizationName) query.organizationName = { $regex: `^${organizationName}$`, $options: 'i' };
    if (branchName) query.branchName = { $regex: `^${branchName}$`, $options: 'i' };

    const transactions = await GLAccountTransaction.find(query).lean();
    const reconciliations = await Reconciliation.find({
      TRANSACTION_ID: { $in: transactions.map(t => t.TransactionId) },
      organizationName: query.organizationName || { $exists: true },
      branchName: query.branchName || { $exists: true }
    }).lean();

    const reconciliationMap = reconciliations.reduce((map, rec) => {
      map[rec.TRANSACTION_ID] = rec;
      return map;
    }, {});

    const transactionsWithReconciliation = transactions.map(txn => ({
      ...txn,
      reconciliation: reconciliationMap[txn.TransactionId] || null
    }));

    // Self-audit the query (optional)
    auditLogger.info('Audit Event', {
      entity_type: 'gl_transactions_query',
      entity_id: null,
      user_id: userId,
      action: 'get_gl_account_transactions',
      old_value: null,
      new_value: { count: transactionsWithReconciliation.length, filters: { organizationName, branchName } },
      ip_address: ipAddress,
      event_type: 'QUERY_SUCCESS',
      outcome: 'success'
    });

    return res.status(200).json({
      message: 'GL Account Transactions retrieved successfully',
      data: transactionsWithReconciliation
    });
  } catch (err) {
    console.error('❌ Fetch GL Transactions Error:', err.message);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'gl_transactions_query',
      entity_id: null,
      user_id: req.user_id || 'system',
      action: 'get_gl_account_transactions',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'QUERY_ERROR',
      outcome: 'failure',
      error: err.message
    });
    return res.status(500).json({
      message: 'Failed to fetch GL transactions',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Fetch a GL account transaction by ID
export const getGLAccountTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user_id || 'system';  // From middleware
    const ipAddress = req.ip_address || '0.0.0.0';

    const transaction = await GLAccountTransaction.findById(id).lean();
    if (!transaction) {
      // Self-audit not-found (optional)
      auditLogger.info('Audit Event', {
        entity_type: 'gl_transaction_query',
        entity_id: id,
        user_id: userId,
        action: 'get_gl_account_transaction_by_id',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address: ipAddress,
        event_type: 'QUERY_NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ message: 'GL Account Transaction not found' });
    }

    const reconciliation = await Reconciliation.findOne({
      TRANSACTION_ID: transaction.TransactionId,
      organizationName: transaction.organizationName,
      branchName: transaction.branchName
    }).lean();

    // Self-audit success (optional)
    auditLogger.info('Audit Event', {
      entity_type: 'gl_transaction_query',
      entity_id: id,
      user_id: userId,
      action: 'get_gl_account_transaction_by_id',
      old_value: null,
      new_value: { event_id: transaction.event_id },
      ip_address: ipAddress,
      event_type: 'QUERY_SUCCESS',
      outcome: 'success'
    });

    return res.status(200).json({
      message: 'GL Account Transaction retrieved successfully',
      data: { ...transaction, reconciliation }
    });
  } catch (err) {
    console.error('❌ Fetch GL Transaction By ID Error:', err.message);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'gl_transaction_query',
      entity_id: req.params.id || null,
      user_id: req.user_id || 'system',
      action: 'get_gl_account_transaction_by_id',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'QUERY_ERROR',
      outcome: 'failure',
      error: err.message
    });
    return res.status(500).json({
      message: 'Failed to fetch GL transaction',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Fetch GL account transactions by account number
export const getGLAccountTransactionByAcctNo = async (req, res) => {
  try {
    const { glAcctNo, organizationName, branchName } = req.params;
    const userId = req.user_id || 'system';  // From middleware
    const ipAddress = req.ip_address || '0.0.0.0';

    if (!organizationName || !branchName) {
      return res.status(400).json({ message: 'organizationName and branchName are required' });
    }

    const transactions = await GLAccountTransaction.find({
      GL_ACCT_NO: glAcctNo,
      organizationName: { $regex: `^${organizationName}$`, $options: 'i' },
      branchName: { $regex: `^${branchName}$`, $options: 'i' }
    }).lean();

    if (!transactions || transactions.length === 0) {
      // Self-audit not-found (optional)
      auditLogger.info('Audit Event', {
        entity_type: 'gl_transaction_by_acct_query',
        entity_id: glAcctNo,
        user_id: userId,
        action: 'get_gl_account_transaction_by_acct_no',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address: ipAddress,
        event_type: 'QUERY_NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ message: 'No transactions found for GL Account' });
    }

    const reconciliations = await Reconciliation.find({
      TRANSACTION_ID: { $in: transactions.map(t => t.TransactionId) },
      organizationName: { $regex: `^${organizationName}$`, $options: 'i' },
      branchName: { $regex: `^${branchName}$`, $options: 'i' }
    }).lean();

    const reconciliationMap = reconciliations.reduce((map, rec) => {
      map[rec.TRANSACTION_ID] = rec;
      return map;
    }, {});

    const transactionsWithReconciliation = transactions.map(txn => ({
      ...txn,
      reconciliation: reconciliationMap[txn.TransactionId] || null
    }));

    // Self-audit success (optional)
    auditLogger.info('Audit Event', {
      entity_type: 'gl_transaction_by_acct_query',
      entity_id: glAcctNo,
      user_id: userId,
      action: 'get_gl_account_transaction_by_acct_no',
      old_value: null,
      new_value: { count: transactionsWithReconciliation.length },
      ip_address: ipAddress,
      event_type: 'QUERY_SUCCESS',
      outcome: 'success'
    });

    return res.status(200).json({
      message: 'GL Account transactions retrieved successfully',
      data: transactionsWithReconciliation
    });
  } catch (err) {
    console.error('❌ Fetch GL Transactions By Acct No Error:', err.message);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'gl_transaction_by_acct_query',
      entity_id: req.params.glAcctNo || null,
      user_id: req.user_id || 'system',
      action: 'get_gl_account_transaction_by_acct_no',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'QUERY_ERROR',
      outcome: 'failure',
      error: err.message
    });
    return res.status(500).json({
      message: 'Failed to fetch GL transactions',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Update a GL account transaction
export const updateGLAccountTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;
    const userId = req.user_id || 'system';  // From middleware
    const ipAddress = req.ip_address || '0.0.0.0';

    if (updatedData.GL_ACCT_NO && !isValidGLAcctNo(updatedData.GL_ACCT_NO)) {
      return res.status(400).json({
        message: 'Invalid GL_ACCT_NO format. It should be in the format xx-xx-xx-xx-xx-xx (e.g., 2-400-100-200-101-1)'
      });
    }

    const original = await GLAccountTransaction.findById(id);
    if (!original) {
      // Self-audit not-found (optional)
      auditLogger.info('Audit Event', {
        entity_type: 'gl_transaction_update',
        entity_id: id,
        user_id: userId,
        action: 'update_gl_account_transaction',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address: ipAddress,
        event_type: 'UPDATE_NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ message: 'GL Account Transaction not found' });
    }

    if (updatedData.organizationName || updatedData.branchName) {
      const branch = await Branch.findOne({
        organizationName: { $regex: `^${updatedData.organizationName || original.organizationName}$`, $options: 'i' },
        branchName: { $regex: `^${updatedData.branchName || original.branchName}$`, $options: 'i' }
      });
      if (!branch) {
        return res.status(400).json({
          message: `Branch ${updatedData.branchName || original.branchName} does not exist for organization ${updatedData.organizationName || original.organizationName}`
        });
      }
    }

    const updated = await GLAccountTransaction.findByIdAndUpdate(id, updatedData, { new: true });

    // Update Reconciliation entry if necessary
    if (updatedData.AMOUNT || updatedData.GL_ACCT_NO || updatedData.JOURNAL_ID) {
      await Reconciliation.updateOne(
        { TRANSACTION_ID: original.TransactionId, organizationName: original.organizationName, branchName: original.branchName },
        {
          JOURNAL_ID: updatedData.JOURNAL_ID || original.JOURNAL_ID,
          GL_ACCT_NO: updatedData.GL_ACCT_NO || original.GL_ACCT_NO,
          AMOUNT: updatedData.AMOUNT || original.AMOUNT
        }
      );
    }

    // Audit update via hybrid logger
    auditLogger.info('Audit Event', {
      entity_type: 'GL_ACCOUNT_TRANSACTION',
      entity_id: id,
      user_id: userId,
      action: 'UPDATE',
      old_value: original.toObject(),
      new_value: updated.toObject(),
      ip_address: ipAddress,
      event_type: 'GL_TRANSACTION_UPDATE',
      outcome: 'success'
    });

    return res.status(200).json({
      message: 'GL Account Transaction updated successfully',
      data: updated
    });
  } catch (err) {
    console.error('❌ Update GL Transaction Error:', err.message);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'GL_ACCOUNT_TRANSACTION',
      entity_id: req.params.id || null,
      user_id: req.user_id || 'system',
      action: 'update_gl_account_transaction',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'GL_ERROR',
      outcome: 'failure',
      error: err.message
    });
    return res.status(err.message.includes('Invalid') || err.message.includes('not found') ? 400 : 500).json({
      message: 'Failed to update GL transaction',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Fetch pending transactions
export const getPendingTransactions = async (req, res) => {
  try {
    console.log("📌 Fetching pending transactions...");
    const { organizationName, branchName } = req.query;
    const userId = req.user_id || 'system';  // From middleware
    const ipAddress = req.ip_address || '0.0.0.0';
    
    const query = { QUEUE_STATUS: 'Pending' };
    if (organizationName) query.organizationName = { $regex: `^${organizationName}$`, $options: 'i' };
    if (branchName) query.branchName = { $regex: `^${branchName}$`, $options: 'i' };

    const pendingTransactions = await GLTransactionQueue.find(query).lean();

    console.log('✅ Found transactions:', pendingTransactions.length);

    // Self-audit the query (optional)
    auditLogger.info('Audit Event', {
      entity_type: 'pending_gl_queue_query',
      entity_id: null,
      user_id: userId,
      action: 'get_pending_transactions',
      old_value: null,
      new_value: { count: pendingTransactions.length, filters: { organizationName, branchName } },
      ip_address: ipAddress,
      event_type: 'QUERY_SUCCESS',
      outcome: 'success'
    });

    return res.status(200).json({
      success: true,
      message: 'Pending transactions retrieved successfully',
      count: pendingTransactions.length,
      data: pendingTransactions
    });
  } catch (err) {
    console.error('❌ Fetch Pending Transactions Error:', err);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'pending_gl_queue_query',
      entity_id: null,
      user_id: req.user_id || 'system',
      action: 'get_pending_transactions',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'QUERY_ERROR',
      outcome: 'failure',
      error: err.message
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pending transactions',
      error: err.message
    });
  }
};

// Approve GL transaction
export const approveGLTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { approverId, organizationName, branchName } = req.body;
    const userId = req.user_id || 'system';  // From middleware
    const ipAddress = req.ip_address || '0.0.0.0';

    if (!transactionId || !approverId || !organizationName || !branchName) {
      return res.status(400).json({
        message: 'Missing transactionId (QueueTransactionId or JOURNAL_ID), approverId, organizationName, or branchName'
      });
    }

    // Validate branch
    const branch = await Branch.findOne({
      organizationName: { $regex: `^${organizationName}$`, $options: 'i' },
      branchName: { $regex: `^${branchName}$`, $options: 'i' }
    });
    if (!branch) {
      return res.status(400).json({
        message: `Branch ${branchName} does not exist for organization ${organizationName}`
      });
    }

    let transaction = null;

    // Try ObjectId
    if (mongoose.Types.ObjectId.isValid(transactionId)) {
      transaction = await GLTransactionQueue.findById(transactionId);
    }

    // Fallback: JOURNAL_ID
    if (!transaction) {
      transaction = await GLTransactionQueue.findOne({ JOURNAL_ID: transactionId, organizationName, branchName });
    }

    if (!transaction) {
      // Self-audit not-found (optional)
      auditLogger.info('Audit Event', {
        entity_type: 'gl_transaction_approval',
        entity_id: transactionId,
        user_id: userId,
        action: 'approve_gl_transaction',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address: ipAddress,
        event_type: 'APPROVAL_NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ message: 'Queued transaction not found' });
    }

    // Check approval status
    if (transaction.APPROVAL_STATUS !== 'Pending') {
      return res.status(400).json({
        message: `Transaction is already ${transaction.APPROVAL_STATUS}`
      });
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Step 1: Approve (business approval)
        transaction.APPROVAL_STATUS = 'Approved';
        transaction.APPROVED_BY = approverId;
        transaction.APPROVED_AT = new Date();
        await transaction.save({ session });

        // Step 2: Post the transaction
        const transactionIdNumber = await generateTransactionId();
        const transactionData = {
          GL_ACCT_NO: transaction.GL_ACCT_NO,
          AMOUNT: transaction.AMOUNT,
          TRANSACTION_TYPE: transaction.TRANSACTION_TYPE,
          CREATED_BY: transaction.CREATED_BY,
          DRS_ALLOWED_FG: transaction.TRANSACTION_TYPE === 'Debit',
          CRS_ALLOWED_FG: transaction.TRANSACTION_TYPE === 'Credit',
          description: `Approved transaction ${transaction.JOURNAL_ID}`,
          SUB_LEDGER_NO: transaction.SUB_LEDGER_NO || '0000',
          SEG_NO: transaction.SEG_NO || 1,
          TransactionId: transactionIdNumber,
          QueueTransactionId: transaction._id,
          organizationName,
          branchName
        };

        const processedTransaction = await postSingleGLTransaction(transactionData, req, session);

        // Step 3: Update or create Reconciliation entry
        let reconciliation = await Reconciliation.findOne({
          JOURNAL_ID: transaction.JOURNAL_ID,
          GL_ACCT_NO: transaction.GL_ACCT_NO,
          TRANSACTION_ID: transactionIdNumber,
          organizationName,
          branchName
        }).session(session);

        if (!reconciliation) {
          reconciliation = new Reconciliation({
            JOURNAL_ID: transaction.JOURNAL_ID,
            GL_ACCT_NO: transaction.GL_ACCT_NO,
            TRANSACTION_ID: transactionIdNumber,
            EXTERNAL_REF: transaction.EXTERNAL_REF || null,
            STATUS: 'Pending',
            AMOUNT: transaction.AMOUNT,
            CURRENCY_CODE: 'NGN',
            organizationName,
            branchName,
            CREATED_AT: new Date()
          });
        } else {
          reconciliation.STATUS = 'Pending';
          reconciliation.UPDATED_AT = new Date();
        }
        await reconciliation.save({ session });

        // Step 4: Update queue as processed
        transaction.QUEUE_STATUS = 'Processed';
        transaction.PROCESSED_AT = new Date();
        await transaction.save({ session });

        // Step 5: Audit log via hybrid logger
        auditLogger.info('Audit Event', {
          entity_type: 'GL_TRANSACTION_APPROVAL',
          entity_id: transaction._id,
          user_id: approverId,
          action: 'APPROVE',
          old_value: null,
          new_value: { ...transaction.toObject(), reconciliationId: reconciliation._id },
          ip_address: ipAddress,
          event_type: 'GL_TRANSACTION_APPROVAL',
          outcome: 'success',
          description: `Approved transaction ${transaction.JOURNAL_ID}, TransactionId: ${transactionIdNumber} in ${organizationName}/${branchName}`
        });

        // Step 6: Fetch updated balance
        const updatedBalance = (await Ledger.findOne({ GL_ACCT_NO: transaction.GL_ACCT_NO, organizationName, branchName }, null, { session })).LEDGER_BALANCE;

        return res.status(200).json({
          message: 'Transaction approved and processed successfully with reconciliation entry',
          transaction: processedTransaction,
          reconciliation,
          updatedBalance
        });
      });
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error('❌ Approve GL Transaction Error:', err.message);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'GL_TRANSACTION_APPROVAL',
      entity_id: req.params.transactionId || null,
      user_id: req.body.approverId || 'system',
      action: 'approve_gl_transaction',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'APPROVAL_ERROR',
      outcome: 'failure',
      error: err.message
    });
    return res.status(err.message.includes('Missing') || err.message.includes('not found') || err.message.includes('already') ? 400 : 500).json({
      message: 'Transaction approval failed',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Reject GL transaction
export const rejectGLTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { approverId, reason, organizationName, branchName } = req.body;
    const userId = req.user_id || 'system';  // From middleware
    const ipAddress = req.ip_address || '0.0.0.0';

    if (!transactionId || !approverId || !organizationName || !branchName) {
      return res.status(400).json({
        message: 'Missing transactionId (QueueTransactionId or JOURNAL_ID), approverId, organizationName, or branchName'
      });
    }

    // Validate branch
    const branch = await Branch.findOne({
      organizationName: { $regex: `^${organizationName}$`, $options: 'i' },
      branchName: { $regex: `^${branchName}$`, $options: 'i' }
    });
    if (!branch) {
      return res.status(400).json({
        message: `Branch ${branchName} does not exist for organization ${organizationName}`
      });
    }

    let transaction = null;

    // Try ObjectId
    if (mongoose.Types.ObjectId.isValid(transactionId)) {
      transaction = await GLTransactionQueue.findById(transactionId);
    }

    // Fallback: JOURNAL_ID
    if (!transaction) {
      transaction = await GLTransactionQueue.findOne({ JOURNAL_ID: transactionId, organizationName, branchName });
    }

    if (!transaction) {
      // Self-audit not-found (optional)
      auditLogger.info('Audit Event', {
        entity_type: 'gl_transaction_rejection',
        entity_id: transactionId,
        user_id: userId,
        action: 'reject_gl_transaction',
        old_value: null,
        new_value: { status: 'not_found' },
        ip_address: ipAddress,
        event_type: 'REJECTION_NOT_FOUND',
        outcome: 'failure'
      });
      return res.status(404).json({ message: 'Queued transaction not found' });
    }

    // Only pending transactions can be rejected
    if (transaction.APPROVAL_STATUS !== 'Pending') {
      return res.status(400).json({
        message: `Transaction is already ${transaction.APPROVAL_STATUS}`
      });
    }

    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // Step 1: Reject (business rejection)
        transaction.APPROVAL_STATUS = 'Rejected';
        transaction.REJECTED_BY = approverId;
        transaction.REJECTED_AT = new Date();
        transaction.REJECTION_REASON = reason || 'No reason provided';

        // Step 2: Mark queue as rejected
        transaction.QUEUE_STATUS = 'Rejected';
        await transaction.save({ session });

        // Step 3: Update Reconciliation entry to Discrepancy
        const reconciliation = await Reconciliation.findOne({
          JOURNAL_ID: transaction.JOURNAL_ID,
          GL_ACCT_NO: transaction.GL_ACCT_NO,
          organizationName,
          branchName
        }).session(session);

        if (reconciliation) {
          reconciliation.STATUS = 'Discrepancy';
          reconciliation.DISCREPANCY_REASON = reason || 'Transaction rejected';
          reconciliation.UPDATED_AT = new Date();
          await reconciliation.save({ session });
        }

        // Step 4: Audit log via hybrid logger
        auditLogger.info('Audit Event', {
          entity_type: 'GL_TRANSACTION_APPROVAL',
          entity_id: transaction._id,
          user_id: approverId,
          action: 'REJECT',
          old_value: null,
          new_value: { ...transaction.toObject(), reconciliationId: reconciliation?._id },
          ip_address: ipAddress,
          event_type: 'GL_TRANSACTION_APPROVAL',
          outcome: 'success',
          description: `Rejected transaction ${transaction.JOURNAL_ID} in ${organizationName}/${branchName}`,
          rejection_reason: reason
        });

        return res.status(200).json({
          message: 'Transaction rejected successfully',
          transaction,
          reconciliation
        });
      });
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error('❌ Reject GL Transaction Error:', err.message);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'GL_TRANSACTION_APPROVAL',
      entity_id: req.params.transactionId || null,
      user_id: req.body.approverId || 'system',
      action: 'reject_gl_transaction',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'REJECTION_ERROR',
      outcome: 'failure',
      error: err.message,
      reason: req.body.reason || null
    });
    return res.status(err.message.includes('Missing') || err.message.includes('not found') || err.message.includes('already') ? 400 : 500).json({
      message: 'Transaction rejection failed',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};

// Process End-of-Day GL Transactions
export const processEODGLTransactionsService = async (session = null) => {
  const localSession = session || await mongoose.startSession();
  let transactionCompleted = false;

  try {
    await localSession.withTransaction(async () => {
      const pendingTransactions = await GLTransactionQueue.find({ QUEUE_STATUS: 'Pending' }).session(localSession);

      if (!Array.isArray(pendingTransactions) || pendingTransactions.length === 0) {
        await localSession.commitTransaction();
        transactionCompleted = true;
        return { success: true, message: 'No pending GL transactions to process', processed: [] };
      }

      const processedTransactions = [];

      for (const txn of pendingTransactions) {
        if (!txn || !txn.QUEUE_STATUS) {
          console.error('⚠️ Invalid transaction object, skipping:', txn);
          continue;
        }

        console.log('Processing txn with QUEUE_STATUS:', txn.QUEUE_STATUS);

        const { GL_ACCT_NO, TRANSACTION_TYPE, AMOUNT, CREATED_BY, JOURNAL_ID, SUB_LEDGER_NO, SEG_NO, organizationName, branchName } = txn;

        // Validate branch
        const branch = await Branch.findOne({
          organizationName: { $regex: `^${organizationName}$`, $options: 'i' },
          branchName: { $regex: `^${branchName}$`, $options: 'i' }
        }).session(localSession);
        if (!branch) {
          console.warn(`⚠️ Branch ${branchName} not found for organization ${organizationName}, skipping txn ${txn._id}`);
          txn.QUEUE_STATUS = 'Failed';
          txn.PROCESSED_AT = new Date();
          await txn.save({ session: localSession });
          processedTransactions.push({ transactionId: txn._id, status: 'Failed', error: `Branch ${branchName} not found for organization ${organizationName}` });
          continue;
        }

        const glAccount = await GLAccount.findOne({ GL_ACCT_NO, organizationName, branchName }).session(localSession);
        if (!glAccount) {
          console.warn(`⚠️ GL Account ${GL_ACCT_NO} not found, skipping txn ${txn._id}`);
          txn.QUEUE_STATUS = 'Failed';
          txn.PROCESSED_AT = new Date();
          await txn.save({ session: localSession });
          processedTransactions.push({ transactionId: txn._id, status: 'Failed', error: `GL Account ${GL_ACCT_NO} not found` });
          continue;
        }
        if (!glAccount.DELAY_GL_POSTING) {
          console.warn(`⚠️ GL Account ${GL_ACCT_NO} does not have DELAY_GL_POSTING enabled, skipping txn ${txn._id}`);
          txn.QUEUE_STATUS = 'Failed';
          txn.PROCESSED_AT = new Date();
          await txn.save({ session: localSession });
          processedTransactions.push({ transactionId: txn._id, status: 'Failed', error: `DELAY_GL_POSTING not enabled` });
          continue;
        }

        // Generate a unique TransactionId
        const transactionIdNumber = await generateTransactionId();

        // Process the transaction
        const transactionData = {
          GL_ACCT_NO,
          AMOUNT,
          TRANSACTION_TYPE,
          CREATED_BY,
          DRS_ALLOWED_FG: TRANSACTION_TYPE === 'Debit',
          CRS_ALLOWED_FG: TRANSACTION_TYPE === 'Credit',
          description: `EOD processed transaction ${JOURNAL_ID}`,
          SUB_LEDGER_NO: SUB_LEDGER_NO || '0000',
          SEG_NO: SEG_NO || 1,
          TransactionId: transactionIdNumber,
          QueueTransactionId: txn._id,
          organizationName,
          branchName
        };

        const processedTransaction = await postSingleGLTransaction(transactionData, null, localSession);

        // Update or create Reconciliation entry
        let reconciliation = await Reconciliation.findOne({
          JOURNAL_ID: JOURNAL_ID,
          GL_ACCT_NO,
          TRANSACTION_ID: transactionIdNumber,
          organizationName,
          branchName
        }).session(localSession);

        if (!reconciliation) {
          reconciliation = new Reconciliation({
            JOURNAL_ID,
            GL_ACCT_NO,
            TRANSACTION_ID: transactionIdNumber,
            EXTERNAL_REF: txn.EXTERNAL_REF || null,
            STATUS: 'Pending',
            AMOUNT,
            CURRENCY_CODE: 'NGN',
            organizationName,
            branchName,
            CREATED_AT: new Date()
          });
        } else {
          reconciliation.STATUS = 'Pending';
          reconciliation.UPDATED_AT = new Date();
        }
        await reconciliation.save({ session: localSession });

        // Mark as processed
        txn.QUEUE_STATUS = 'Processed';
        txn.PROCESSED_AT = new Date();
        await txn.save({ session: localSession });

        processedTransactions.push({
          transactionId: txn._id,
          TransactionId: transactionIdNumber,
          GL_ACCT_NO,
          TRANSACTION_TYPE,
          AMOUNT,
          JOURNAL_ID,
          processedAt: txn.PROCESSED_AT,
          reconciliationId: reconciliation._id
        });
      }

      await localSession.commitTransaction();
      transactionCompleted = true;

      return { success: true, message: 'EOD GL transactions processed successfully', processed: processedTransactions };
    });
  } catch (error) {
    if (localSession.inTransaction() && !transactionCompleted) {
      await localSession.abortTransaction();
    }
    console.error('❌ Error in processEODGLTransactionsService:', error);
    return { success: false, error: error.message || 'Internal Server Error' };
  } finally {
    if (!session) localSession.endSession();
  }
};

// Fetch GL accounts
export const getGLAccounts = async (req, res) => {
  try {
    const { organizationName, branchName } = req.query;
    const userId = req.user_id || 'system';  // From middleware
    const ipAddress = req.ip_address || '0.0.0.0';
    
    const query = {};
    if (organizationName) query.organizationName = { $regex: `^${organizationName}$`, $options: 'i' };
    if (branchName) query.branchName = { $regex: `^${branchName}$`, $options: 'i' };

    const glAccounts = await GLAccount.find(query);
    
    // Self-audit the query (optional)
    auditLogger.info('Audit Event', {
      entity_type: 'gl_accounts_query',
      entity_id: null,
      user_id: userId,
      action: 'get_gl_accounts',
      old_value: null,
      new_value: { count: glAccounts.length, filters: { organizationName, branchName } },
      ip_address: ipAddress,
      event_type: 'QUERY_SUCCESS',
      outcome: 'success'
    });

    return res.status(200).json({
      message: 'GL Accounts retrieved successfully',
      data: glAccounts
    });
  } catch (err) {
    console.error('❌ Fetch GL Accounts Error:', err.message);
    // Audit failure (non-blocking)
    auditLogger.error('Audit Event', {
      entity_type: 'gl_accounts_query',
      entity_id: null,
      user_id: req.user_id || 'system',
      action: 'get_gl_accounts',
      old_value: null,
      new_value: null,
      ip_address: req.ip || 'unknown',
      event_type: 'QUERY_ERROR',
      outcome: 'failure',
      error: err.message
    });
    return res.status(500).json({
      message: 'Failed to fetch GL accounts',
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
};