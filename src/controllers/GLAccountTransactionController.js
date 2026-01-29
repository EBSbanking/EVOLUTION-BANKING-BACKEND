
import { logger } from '../utils/logger.js';
import { addAuditTrail } from '../controllers/AudiTrailController.js'; // Assuming this path based on previous code
import GLAccountTransaction from '../models/GLAccountTransaction.js'; // Import the model (adjust path as needed)
import GLAccount from '../models/GLAccount.js';

// Controller: Get all GL Account Transactions
export const getAllGLAccountTransactions = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { journalId, transactionId, drAcctNo, crAcctNo, status, createdBy, startDate, endDate } = req.query;

      // Build filter
      const filter = {};
      if (journalId) filter.JOURNAL_ID = journalId;
      if (transactionId) filter.TRANSACTION_ID = transactionId;
      if (drAcctNo) filter.DR_ACCT_NO = drAcctNo;
      if (crAcctNo) filter.CR_ACCT_NO = crAcctNo;
      if (status) filter.STATUS = status;
      if (createdBy) filter.CREATED_BY = createdBy;
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      // Fetch transactions with pagination support
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;

      const [transactions, total] = await Promise.all([
        GLAccountTransaction.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .session(session),
        GLAccountTransaction.countDocuments(filter).session(session),
      ]);

      logger.info('Fetched GL account transactions', { count: transactions.length, filter, page, limit });

      return res.status(200).json({
        success: true,
        message: 'GL account transactions fetched successfully',
        data: {
          transactions,
          pagination: {
            current: page,
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    });
  } catch (error) {
    logger.error('Error fetching GL account transactions', {
      error: error.message,
      stack: error.stack,
      query: req.query,
      timestamp: new Date(),
    });
    return res.status(500).json({
      success: false,
      message: 'Error fetching GL account transactions',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};


// Controller: Create GL Account Transaction
export const createGLAccountTransaction = async (req, res) => {
  logger.info('createGLAccountTransaction hit with body:', { body: req.body });
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const {
        JOURNAL_ID,
        DR_ACCT_NO,
        CR_ACCT_NO,
        AMOUNT,
        NARRATION,
        CREATED_BY,
        TRANSACTION_TYPE,
        CURRENCY_CODE,
        STATUS,
        organizationName,
        branchName,
      } = req.body;
      // Required fields check, including organizationName and branchName
      const criticalFields = {
        JOURNAL_ID,
        DR_ACCT_NO,
        CR_ACCT_NO,
        AMOUNT,
        NARRATION,
        CREATED_BY,
        organizationName,
        branchName,
      };
      const missingFields = Object.entries(criticalFields)
        .filter(([_, value]) => value === null || value === undefined || value === '')
        .map(([key]) => key);
      if (missingFields.length > 0) {
        logger.error('Missing required fields', { missingFields });
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
      }
      // Validate AMOUNT > 0
      if (AMOUNT <= 0) {
        throw new Error('Amount must be greater than 0');
      }
      // Generate TRANSACTION_ID if not provided
      const TRANSACTION_ID = req.body.TRANSACTION_ID || `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      // Check for duplicate TRANSACTION_ID
      const existingTransaction = await GLAccountTransaction.findOne({ TRANSACTION_ID }).session(session);
      if (existingTransaction) {
        logger.error('Duplicate TRANSACTION_ID found', { TRANSACTION_ID });
        throw new Error(`Transaction ID ${TRANSACTION_ID} already exists`);
      }
      // Create new transaction
      const newTransaction = new GLAccountTransaction({
        JOURNAL_ID,
        TRANSACTION_ID,
        DR_ACCT_NO,
        CR_ACCT_NO,
        AMOUNT,
        NARRATION,
        CREATED_BY,
        TRANSACTION_TYPE: TRANSACTION_TYPE || 'GENERAL',
        CURRENCY_CODE: CURRENCY_CODE || 'NGN',
        STATUS: STATUS || 'POSTED',
        organizationName,
        branchName,
      });
      await newTransaction.save({ session });
      logger.info('Created new GL account transaction', { TRANSACTION_ID });
      // Fetch and update DR and CR accounts' balances
      const drAccount = await GLAccount.findOne({ GL_ACCT_NO: DR_ACCT_NO }).session(session);
      const crAccount = await GLAccount.findOne({ GL_ACCT_NO: CR_ACCT_NO }).session(session);
      if (!drAccount || !crAccount) {
        throw new Error('One or both GL accounts not found');
      }
      // Store previous balances for balanceImpact
      const drPreviousLedger = drAccount.LEDGER_BALANCE || 0;
      const drPreviousAvailable = drAccount.AVAILABLE_BALANCE || 0;
      const crPreviousLedger = crAccount.LEDGER_BALANCE || 0;
      const crPreviousAvailable = crAccount.AVAILABLE_BALANCE || 0;

      // Update balances: For DR (debit) to asset/expense: +AMOUNT; For CR (credit) to liability/revenue: +AMOUNT
      // Note: In full double-entry, adjust sign based on normal balance, but keeping + for both as per original logic
      drAccount.CURRENT_BALANCE = (drAccount.CURRENT_BALANCE || 0) + AMOUNT;
      drAccount.LEDGER_BALANCE = (drAccount.LEDGER_BALANCE || 0) + AMOUNT;
      drAccount.AVAILABLE_BALANCE = (drAccount.AVAILABLE_BALANCE || 0) + AMOUNT;
      await drAccount.save({ session });
      logger.info(`Updated DR account balance for ${DR_ACCT_NO}: +${AMOUNT}`);

      crAccount.CURRENT_BALANCE = (crAccount.CURRENT_BALANCE || 0) + AMOUNT;
      crAccount.LEDGER_BALANCE = (crAccount.LEDGER_BALANCE || 0) + AMOUNT;
      crAccount.AVAILABLE_BALANCE = (crAccount.AVAILABLE_BALANCE || 0) + AMOUNT;
      await crAccount.save({ session });
      logger.info(`Updated CR account balance for ${CR_ACCT_NO}: +${AMOUNT}`);

      // Create embedded transaction objects
      const now = new Date();
      const embeddedTransaction = (account, isDebit) => ({
        JOURNAL_ID,
        TRANSACTION_ID,
        TYPE: isDebit ? 'DEBIT' : 'CREDIT',
        AMOUNT,
        NARRATION,
        CREATED_BY,
        CREATED_AT: now,
        branchCode: account.branchCode,
        organizationCode: account.organizationCode,
        systemSource: account.systemSource || 'NEW_SYSTEM',
        legacyReference: null, // Or populate if needed
        balanceImpact: {
          previousLedgerBalance: isDebit ? drPreviousLedger : crPreviousLedger,
          newLedgerBalance: isDebit ? drAccount.LEDGER_BALANCE : crAccount.LEDGER_BALANCE,
          previousAvailableBalance: isDebit ? drPreviousAvailable : crPreviousAvailable,
          newAvailableBalance: isDebit ? drAccount.AVAILABLE_BALANCE : crAccount.AVAILABLE_BALANCE
        }
      });

      // Add to transactions array
      if (drAccount.transactions && Array.isArray(drAccount.transactions)) {
        drAccount.transactions.push(embeddedTransaction(drAccount, true));
        await drAccount.save({ session });
        logger.info(`Added DEBIT transaction to DR account ${DR_ACCT_NO}`);
      }
      if (crAccount.transactions && Array.isArray(crAccount.transactions)) {
        crAccount.transactions.push(embeddedTransaction(crAccount, false));
        await crAccount.save({ session });
        logger.info(`Added CREDIT transaction to CR account ${CR_ACCT_NO}`);
      }
      // Audit trail (updated to use lowercase keys to match addAuditTrail expectations)
      await addAuditTrail({
        event_type: 'CREATE_GL_ACCOUNT_TRANSACTION',
        user_id: CREATED_BY,
        action: 'CREATE',
        new_value: {
          JOURNAL_ID,
          TRANSACTION_ID,
          DR_ACCT_NO,
          CR_ACCT_NO,
          AMOUNT,
          NARRATION,
          TRANSACTION_TYPE: newTransaction.TRANSACTION_TYPE,
          STATUS: newTransaction.STATUS,
          organizationName,
          branchName,
        },
        old_value: null,
        ip_address: req.ip || '0.0.0.0',
        entity_id: newTransaction._id,
        entity_type: 'GLAccountTransaction',
        status: 'SUCCESS',
        description: `Created GL account transaction ${TRANSACTION_ID}`,
        reference_no: `TXN-${newTransaction._id}`,
        account_no: `${DR_ACCT_NO}/${CR_ACCT_NO}`,
        additional_info: {},
        session,
      });
      result = {
        success: true,
        message: 'GL account transaction created successfully',
        data: newTransaction,
      };
    });
    return res.status(201).json(result);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error creating GL account transaction', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      timestamp: new Date(),
    });
    return res.status(400).json({
      success: false,
      message: 'Error creating GL account transaction',
      error: error.message,
      code: error.message.includes('Missing') || error.message.includes('Invalid') || error.message.includes('Duplicate') || error.message.includes('not found') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
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


// Controller: Get GL Account Transaction by ID
export const getGLAccountTransactionById = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      const transaction = await GLAccountTransaction.findById(id).session(session);
      if (!transaction) {
        return res.status(404).json({
          success: false,
          message: `GL account transaction with ID ${id} not found`,
        });
      }

      logger.info('Fetched GL account transaction by ID', { id });

      return res.status(200).json({
        success: true,
        message: 'GL account transaction fetched successfully',
        data: transaction,
      });
    });
  } catch (error) {
    logger.error('Error fetching GL account transaction by ID', {
      error: error.message,
      stack: error.stack,
      id: req.params.id,
      timestamp: new Date(),
    });
    return res.status(500).json({
      success: false,
      message: 'Error fetching GL account transaction',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};


// Controller: Update GL Account Transaction
export const updateGLAccountTransaction = async (req, res) => {
  logger.info('updateGLAccountTransaction hit with body:', { body: req.body, params: req.params });
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      const {
        JOURNAL_ID,
        DR_ACCT_NO,
        CR_ACCT_NO,
        AMOUNT,
        NARRATION,
        UPDATED_BY,
        TRANSACTION_TYPE,
        CURRENCY_CODE,
        STATUS,
        organizationName,
        branchName,
      } = req.body;

      // Find existing transaction
      const existingTransaction = await GLAccountTransaction.findById(id).session(session);
      if (!existingTransaction) {
        throw new Error(`GL account transaction with ID ${id} not found`);
      }

      // Prevent updating immutable fields like TRANSACTION_ID if needed
      if (req.body.TRANSACTION_ID && req.body.TRANSACTION_ID !== existingTransaction.TRANSACTION_ID) {
        throw new Error('TRANSACTION_ID cannot be updated');
      }

      // Update fields if provided
      if (JOURNAL_ID !== undefined) existingTransaction.JOURNAL_ID = JOURNAL_ID;
      if (DR_ACCT_NO !== undefined) existingTransaction.DR_ACCT_NO = DR_ACCT_NO;
      if (CR_ACCT_NO !== undefined) existingTransaction.CR_ACCT_NO = CR_ACCT_NO;
      if (AMOUNT !== undefined) {
        if (AMOUNT <= 0) throw new Error('Amount must be greater than 0');
        existingTransaction.AMOUNT = AMOUNT;
      }
      if (NARRATION !== undefined) existingTransaction.NARRATION = NARRATION;
      if (TRANSACTION_TYPE !== undefined) existingTransaction.TRANSACTION_TYPE = TRANSACTION_TYPE;
      if (CURRENCY_CODE !== undefined) existingTransaction.CURRENCY_CODE = CURRENCY_CODE;
      if (STATUS !== undefined) {
        if (!['POSTED', 'PENDING', 'REVERSED'].includes(STATUS)) {
          throw new Error('Invalid STATUS value');
        }
        existingTransaction.STATUS = STATUS;
      }
      if (organizationName !== undefined) existingTransaction.organizationName = organizationName;
      if (branchName !== undefined) existingTransaction.branchName = branchName;

      existingTransaction.UPDATED_BY = UPDATED_BY;
      existingTransaction.updatedAt = new Date();

      await existingTransaction.save({ session });
      logger.info('Updated GL account transaction', { id });

      // Audit trail
      await addAuditTrail({
        EVENT_TYPE: 'UPDATE_GL_ACCOUNT_TRANSACTION',
        USER_ID: UPDATED_BY,
        ACTION: 'UPDATE',
        NEW_VALUE: {
          JOURNAL_ID: existingTransaction.JOURNAL_ID,
          DR_ACCT_NO: existingTransaction.DR_ACCT_NO,
          CR_ACCT_NO: existingTransaction.CR_ACCT_NO,
          AMOUNT: existingTransaction.AMOUNT,
          NARRATION: existingTransaction.NARRATION,
          TRANSACTION_TYPE: existingTransaction.TRANSACTION_TYPE,
          STATUS: existingTransaction.STATUS,
          organizationName: existingTransaction.organizationName,
          branchName: existingTransaction.branchName,
        },
        OLD_VALUE: {
          // Track changes - simplified; expand as needed
          STATUS: req.body.STATUS !== undefined ? existingTransaction.STATUS : null,
          AMOUNT: req.body.AMOUNT !== undefined ? existingTransaction.AMOUNT : null,
        },
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: id,
        ENTITY_TYPE: 'GLAccountTransaction',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Updated GL account transaction ${existingTransaction.TRANSACTION_ID}`,
        REFERENCE_NO: `TXN-${id}`,
        ACCOUNT_NO: `${existingTransaction.DR_ACCT_NO}/${existingTransaction.CR_ACCT_NO}`,
        ADDITIONAL_INFO: {},
        session,
      });

      result = {
        success: true,
        message: 'GL account transaction updated successfully',
        data: existingTransaction,
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error updating GL account transaction', {
      error: error.message,
      stack: error.stack,
      body: req.body,
      params: req.params,
      timestamp: new Date(),
    });
    return res.status(400).json({
      success: false,
      message: 'Error updating GL account transaction',
      error: error.message,
      code: error.message.includes('not found') || error.message.includes('Invalid') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
  }
};

// Controller: Delete GL Account Transaction
export const deleteGLAccountTransaction = async (req, res) => {
  logger.info('deleteGLAccountTransaction hit with params:', { params: req.params });
  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      const { id } = req.params;
      const { DELETED_BY } = req.body;

      // Find existing transaction
      const existingTransaction = await GLAccountTransaction.findById(id).session(session);
      if (!existingTransaction) {
        throw new Error(`GL account transaction with ID ${id} not found`);
      }

      // Optionally, check if can be deleted (e.g., STATUS !== 'POSTED')
      if (existingTransaction.STATUS === 'POSTED') {
        throw new Error(`Cannot delete posted transaction ${existingTransaction.TRANSACTION_ID}; use reverse instead`);
      }

      // Hard delete
      await GLAccountTransaction.findByIdAndDelete(id).session(session);

      logger.info('Deleted GL account transaction', { id });

      // Audit trail
      await addAuditTrail({
        EVENT_TYPE: 'DELETE_GL_ACCOUNT_TRANSACTION',
        USER_ID: DELETED_BY,
        ACTION: 'DELETE',
        NEW_VALUE: null,
        OLD_VALUE: {
          JOURNAL_ID: existingTransaction.JOURNAL_ID,
          TRANSACTION_ID: existingTransaction.TRANSACTION_ID,
          DR_ACCT_NO: existingTransaction.DR_ACCT_NO,
          CR_ACCT_NO: existingTransaction.CR_ACCT_NO,
          AMOUNT: existingTransaction.AMOUNT,
          STATUS: existingTransaction.STATUS,
          organizationName: existingTransaction.organizationName,
          branchName: existingTransaction.branchName,
        },
        IP_ADDRESS: req.ip || '0.0.0.0',
        ENTITY_ID: id,
        ENTITY_TYPE: 'GLAccountTransaction',
        STATUS: 'SUCCESS',
        DESCRIPTION: `Deleted GL account transaction ${existingTransaction.TRANSACTION_ID}`,
        REFERENCE_NO: `TXN-${id}`,
        ACCOUNT_NO: `${existingTransaction.DR_ACCT_NO}/${existingTransaction.CR_ACCT_NO}`,
        ADDITIONAL_INFO: {},
        session,
      });

      result = {
        success: true,
        message: 'GL account transaction deleted successfully',
        data: existingTransaction,
      };
    });

    return res.status(200).json(result);
  } catch (error) {
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    logger.error('Error deleting GL account transaction', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      body: req.body,
      timestamp: new Date(),
    });
    return res.status(400).json({
      success: false,
      message: 'Error deleting GL account transaction',
      error: error.message,
      code: error.message.includes('not found') || error.message.includes('Cannot delete') ? 'BAD_REQUEST' : 'INTERNAL_SERVER_ERROR',
    });
  } finally {
    session.endSession();
  }
};

// Controller: Get GL Account Transactions (renamed/updated from getAllGLAccountTransactions for flexibility)
export const getGLAccountTransactions = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { journalId, transactionId, drAcctNo, crAcctNo, status, createdBy, startDate, endDate, organizationName, branchName, glAcctNo } = req.query;

      // Build filter with organizationName, branchName, and glAcctNo support
      const filter = {};
      if (organizationName) filter.organizationName = organizationName;
      if (branchName) filter.branchName = branchName;
      if (glAcctNo) filter.GL_ACCT_NO = glAcctNo;
      if (journalId) filter.JOURNAL_ID = journalId;
      if (transactionId) filter.TRANSACTION_ID = transactionId;
      if (drAcctNo) filter.DR_ACCT_NO = drAcctNo;
      if (crAcctNo) filter.CR_ACCT_NO = crAcctNo;
      if (status) filter.STATUS = status;
      if (createdBy) filter.CREATED_BY = createdBy;
      if (startDate || endDate) {
        filter.createdAt = {};
        if (startDate) filter.createdAt.$gte = new Date(startDate);
        if (endDate) filter.createdAt.$lte = new Date(endDate);
      }

      // Fetch transactions with pagination support
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 50;
      const skip = (page - 1) * limit;

      const [transactions, total] = await Promise.all([
        GLAccountTransaction.find(filter)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .session(session),
        GLAccountTransaction.countDocuments(filter).session(session),
      ]);

      logger.info('Fetched GL account transactions', { count: transactions.length, filter, page, limit });

      return res.status(200).json({
        success: true,
        message: 'GL account transactions fetched successfully',
        data: {
          transactions,
          pagination: {
            current: page,
            pages: Math.ceil(total / limit),
            total,
          },
        },
      });
    });
  } catch (error) {
    logger.error('Error fetching GL account transactions', {
      error: error.message,
      stack: error.stack,
      query: req.query,
      timestamp: new Date(),
    });
    return res.status(500).json({
      success: false,
      message: 'Error fetching GL account transactions',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

export const getGLAccountByAcctNo = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const { glAcctNo, organizationName, branchName } = req.params;
      const account = await GLAccount.findOne({ GL_ACCT_NO: glAcctNo, organizationName, branchName }).session(session);
      if (!account) {
        return res.status(404).json({
          success: false,
          message: `GL account with number ${glAcctNo} not found`,
        });
      }

      logger.info('Fetched GL account by account number', { glAcctNo, organizationName, branchName });

      return res.status(200).json({
        success: true,
        message: 'GL account fetched successfully',
        data: account,
      });
    });
  } catch (error) {
    logger.error('Error fetching GL account by account number', {
      error: error.message,
      stack: error.stack,
      params: req.params,
      timestamp: new Date(),
    });
    return res.status(500).json({
      success: false,
      message: 'Error fetching GL account',
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

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
  getGLAccountByAcctNo
}