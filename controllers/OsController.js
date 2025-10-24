import { getServerTime, getBusinessDate, setServerTimeOffset } from '../utils/serverTime.js';
import { checkOverdueLoans } from '../Services/overdueLoanHandler.js';
import { updateLoanStatusForAllLoans } from '../Services/loanStatusUpdater.js';
import { processPendingRepayments } from '../Services/repaymentHandler.js';
import { updateDormantAccounts, countDormantAccountsToUpdate } from '../Services/accountStatusUpdater.js';
import { postDailyAccruedInterest } from '../Services/InterestPostingController.js';
import { createLedgerEntry } from '../controllers/GLAccountController.js';
import { accrueDailyInterest } from '../cronjobs/dailyInterestAccrual.js';
import SystemDate from '../models/SystemDate.js';
import Holiday from '../models/Holiday.js';
import mongoose from 'mongoose';
import Ledger from '../models/Ledger.js';
import GLTransactionQueue from '../models/GLTransactionQueue.js';
import Reconciliation from '../models/Reconciliation.js';
import { createAuditTrail } from '../controllers/AudiTrailController.js';
import logger from '../utils/logger.js';
import { calculateNextBusinessDate } from '../utils/dateUtils.js';
import Thrift from '../models/Thrift.js';
import Customer from '../models/Customer.js';
import ThriftController from '../controllers/ThriftController.js'; // Import ThriftController for collection processing

// Placeholder for fetching bank statement data
const fetchBankStatementData = async () => {
  logger.info('Fetching bank statement data');
  return [];
};

// Helper for generating 16–18 digit TransactionId
const generateTransactionId = () => {
  const base = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000);
  return parseInt(base + random);
};

// Process Overdue Thrift Collections
export const processOverdueThriftCollections = async (session = null) => {
  const localSession = session || await mongoose.startSession();
  let transactionCompleted = false;

  try {
    const result = await localSession.withTransaction(async () => {
      // Fetch all active thrift accounts
      const thriftAccounts = await Thrift.find({ status: 'active' }).session(localSession);
      if (!thriftAccounts.length) {
        logger.info('No active thrift accounts to process for overdue collections');
        return { success: true, message: 'No active thrift accounts to process', processed: [], failed: [], skipped: [] };
      }

      const processedCollections = [];
      const failedCollections = [];
      const skippedCollections = [];

      const today = getBusinessDate(); // Use business date

      for (const account of thriftAccounts) {
        try {
          const customer = await Customer.findOne({ CUST_ID: account.CUST_ID }).session(localSession);
          if (!customer) {
            logger.warn(`Customer not found for thrift account ${account.ACCT_NO}`);
            skippedCollections.push({ ACCT_NO: account.ACCT_NO, reason: 'Customer not found' });
            continue;
          }

          // Determine if collection is overdue based on type and lastCollectionDate
          let isOverdue = false;
          let expectedAmount = 0; // Default or from account settings

          if (account.COLLECTION_TYPE === 'DAILY') {
            isOverdue = !account.lastCollectionDate || account.lastCollectionDate < today;
            expectedAmount = 500; // Default daily amount - adjust as needed
          } else if (account.COLLECTION_TYPE === 'WEEKLY') {
            const lastCollection = account.lastCollectionDate || new Date(0);
            const daysSinceLast = (today - lastCollection) / (1000 * 60 * 60 * 24);
            isOverdue = daysSinceLast >= 7;
            expectedAmount = 2000; // Default weekly amount
          } else if (account.COLLECTION_TYPE === 'MONTHLY') {
            const lastCollectionMonth = account.lastCollectionDate ? account.lastCollectionDate.getMonth() : -1;
            const currentMonth = today.getMonth();
            isOverdue = lastCollectionMonth < currentMonth;
            expectedAmount = await ThriftController.calculateExpectedMonthlyAmount(account.ACCT_NO);
          }

          if (!isOverdue || customer.accountBalance < expectedAmount) {
            logger.info(`Thrift account ${account.ACCT_NO} not overdue or insufficient balance, skipping`);
            skippedCollections.push({ ACCT_NO: account.ACCT_NO, reason: 'Not overdue or insufficient balance' });
            continue;
          }

          // Process the overdue collection based on type
          let collectionResponse;
          const collectionData = { CUST_ID: account.CUST_ID, ACCT_NO: account.ACCT_NO, amount: expectedAmount };

          if (account.COLLECTION_TYPE === 'DAILY') {
            collectionResponse = await ThriftController.processDailyCollection({ body: collectionData }, { locals: { session: localSession } });
          } else if (account.COLLECTION_TYPE === 'WEEKLY') {
            collectionResponse = await ThriftController.processWeeklyCollection({ body: collectionData }, { locals: { session: localSession } });
          } else if (account.COLLECTION_TYPE === 'MONTHLY') {
            collectionResponse = await ThriftController.processMonthlyCollection({ body: collectionData }, { locals: { session: localSession } });
          }

          if (collectionResponse && collectionResponse.data && collectionResponse.data.success !== false) {
            processedCollections.push({
              ACCT_NO: account.ACCT_NO,
              CUST_ID: account.CUST_ID,
              amount: expectedAmount,
              type: account.COLLECTION_TYPE,
              status: 'PROCESSED'
            });
            logger.info(`Overdue collection processed for account ${account.ACCT_NO}`);
          } else {
            failedCollections.push({ ACCT_NO: account.ACCT_NO, reason: collectionResponse?.data?.message || 'Processing failed' });
          }
        } catch (accountError) {
          logger.error(`Error processing overdue collection for account ${account.ACCT_NO}:`, accountError);
          failedCollections.push({ ACCT_NO: account.ACCT_NO, reason: accountError.message });
        }
      }

      logger.info('Overdue thrift collections processed', {
        processedCount: processedCollections.length,
        failedCount: failedCollections.length,
        skippedCount: skippedCollections.length,
      });

      return {
        success: true,
        message: 'Overdue thrift collections processed successfully',
        processed: processedCollections,
        failed: failedCollections,
        skipped: skippedCollections,
      };
    });

    transactionCompleted = true;
    await localSession.commitTransaction();
    systemStatus.services.overdueThriftCollections = {
      healthy: result.failed.length === 0,
      lastError: result.failed.length > 0 ? result.failed[0].reason : null,
      lastRun: new Date(),
      executionTime: null, // Set in executeService
      processed: result.processed,
      failed: result.failed,
      skipped: result.skipped,
    };
    return result;
  } catch (error) {
    if (localSession.inTransaction() && !transactionCompleted) {
      await localSession.abortTransaction();
    }
    logger.error('Error in processOverdueThriftCollections:', { error: error.message, stack: error.stack });
    systemStatus.services.overdueThriftCollections = {
      healthy: false,
      lastError: error.message,
      lastRun: new Date(),
      executionTime: null,
      processed: [],
      failed: [{ reason: error.message }],
      skipped: [],
    };
    return {
      success: false,
      message: `Overdue thrift collections processing failed: ${error.message}`,
      processed: [],
      failed: [{ reason: error.message }],
      skipped: [],
    };
  } finally {
    if (!session) localSession.endSession();
  }
};

const systemStatus = {
  state: 'idle',
  lastRun: null,
  nextRun: null,
  executionTime: null,
  currentBusinessDate: null,
  nextBusinessDate: null,
  isEODProcessing: false,
  eodStatus: 'IDLE',
  serverTime: null,
  serverTimeOffset: 0,
  services: {
    overdueLoans: { healthy: true, lastError: null, lastRun: null, executionTime: null },
    loanStatusUpdates: { healthy: true, lastError: null, lastRun: null, executionTime: null },
    pendingRepayments: { healthy: true, lastError: null, lastRun: null, executionTime: null },
    dormantAccounts: { healthy: true, lastError: null, lastRun: null, executionTime: null },
    interestPosting: { healthy: true, lastError: null, lastRun: null, executionTime: null },
    glTransactions: { healthy: true, lastError: null, lastRun: null, executionTime: null, processed: [], failed: [], skipped: [] },
    termDepositInterest: { healthy: true, lastError: null, lastRun: null, executionTime: null },
    reconciliation: { healthy: true, lastError: null, lastRun: null, executionTime: null, updated: 0, processed: [], failed: [], skipped: [] },
    overdueThriftCollections: { healthy: true, lastError: null, lastRun: null, executionTime: null, processed: [], failed: [], skipped: [] }, // New service status
  },
};

// Initialize System Dates
const initializeSystemDates = async () => {
  try {
    logger.info('Initializing system dates');
    const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });

    const today = new Date(getServerTime().setHours(0, 0, 0, 0));
    if (systemDate) {
      systemStatus.currentBusinessDate = systemDate.currentBusinessDate;
      systemStatus.nextBusinessDate = systemDate.nextBusinessDate;
      systemStatus.eodStatus = systemDate.eodStatus || 'IDLE';
      if (systemDate.currentBusinessDate < today || systemDate.currentBusinessDate > today) {
        logger.warn('Business date is outdated or incorrect, updating', {
          storedDate: systemDate.currentBusinessDate,
          serverDate: today,
        });
        systemDate.currentBusinessDate = today;
        systemDate.nextBusinessDate = await calculateNextBusinessDate(today);
        await systemDate.save();
        systemStatus.currentBusinessDate = systemDate.currentBusinessDate;
        systemStatus.nextBusinessDate = systemDate.nextBusinessDate;
      }
      logger.info('System dates loaded from database', {
        currentBusinessDate: systemStatus.currentBusinessDate,
        nextBusinessDate: systemStatus.nextBusinessDate,
      });
    } else {
      const currentBusinessDate = today;
      const nextBusinessDate = await calculateNextBusinessDate(currentBusinessDate);

      const newSystemDate = new SystemDate({
        currentBusinessDate,
        nextBusinessDate,
        eodStatus: 'IDLE',
        eodHistory: [],
      });

      await newSystemDate.save();
      systemStatus.currentBusinessDate = currentBusinessDate;
      systemStatus.nextBusinessDate = nextBusinessDate;
      systemStatus.eodStatus = 'IDLE';
      logger.info('System dates initialized and saved', {
        currentBusinessDate,
        nextBusinessDate,
      });
    }

    systemStatus.serverTime = getServerTime();
  } catch (error) {
    logger.error('Failed to initialize system dates', {
      error: error.message,
      stack: error.stack,
    });
    throw error;
  }
};

// EOD GL Transaction Processing
export const processEODGLTransactions = async (session = null) => {
  const localSession = session || await mongoose.startSession();
  let transactionCompleted = false;

  try {
    const result = await localSession.withTransaction(async () => {
      const pendingTransactions = await GLTransactionQueue.find({ QUEUE_STATUS: 'Pending' }).session(localSession);
      if (!pendingTransactions.length) {
        logger.info('No pending GL transactions to process');
        return { success: true, message: 'No pending GL transactions to process', processed: [], failed: [], skipped: [] };
      }

      const processedTransactions = [];
      const failedTransactions = [];
      const skippedTransactions = [];

      for (const txn of pendingTransactions) {
        if (!txn || !txn.QUEUE_STATUS) {
          logger.warn('Invalid transaction object, skipping:', { transactionId: txn?._id });
          skippedTransactions.push({ transactionId: txn?._id, reason: 'Invalid transaction object' });
          continue;
        }

        if (txn.APPROVAL_STATUS && txn.APPROVAL_STATUS !== 'Approved') {
          logger.warn(`Transaction ${txn._id} is not approved, skipping`, {
            approvalStatus: txn.APPROVAL_STATUS,
            journalId: txn.JOURNAL_ID,
            glAcctNo: txn.GL_ACCT_NO
          });
          skippedTransactions.push({
            transactionId: txn._id,
            reason: `Transaction not approved (status: ${txn.APPROVAL_STATUS})`
          });
          continue;
        }

        const { GL_ACCT_NO, TRANSACTION_TYPE, AMOUNT, CREATED_BY, JOURNAL_ID, SUB_LEDGER_NO, SEG_NO, ACCT_DESC, CURRENCY_CODE, EXCHANGE_RATE } = txn;

        const glAccount = await Ledger.findOne({ GL_ACCT_NO }).session(localSession);
        if (!glAccount) {
          logger.warn(`GL Account ${GL_ACCT_NO} not found, failing txn ${txn._id}`);
          await GLTransactionQueue.updateOne(
            { _id: txn._id },
            { $set: { QUEUE_STATUS: 'Failed', ERROR_MESSAGE: `GL Account ${GL_ACCT_NO} not found`, PROCESSED_AT: new Date() } },
            { session: localSession }
          );
          failedTransactions.push({ transactionId: txn._id, reason: `GL Account ${GL_ACCT_NO} not found` });
          continue;
        }

        if (!glAccount.DELAY_GL_POSTING) {
          logger.warn(`GL Account ${GL_ACCT_NO} does not have DELAY_GL_POSTING enabled, failing txn ${txn._id}`);
          await GLTransactionQueue.updateOne(
            { _id: txn._id },
            { $set: { QUEUE_STATUS: 'Failed', ERROR_MESSAGE: `DELAY_GL_POSTING not enabled`, PROCESSED_AT: new Date() } },
            { session: localSession }
          );
          failedTransactions.push({ transactionId: txn._id, reason: `DELAY_GL_POSTING not enabled` });
          continue;
        }

        if (!glAccount.canPost(TRANSACTION_TYPE)) {
          logger.warn(`GL Account ${GL_ACCT_NO} does not allow ${TRANSACTION_TYPE} transactions, failing txn ${txn._id}`);
          await GLTransactionQueue.updateOne(
            { _id: txn._id },
            { $set: { QUEUE_STATUS: 'Failed', ERROR_MESSAGE: `GL Account ${GL_ACCT_NO} does not allow ${TRANSACTION_TYPE} transactions`, PROCESSED_AT: new Date() } },
            { session: localSession }
          );
          failedTransactions.push({ transactionId: txn._id, reason: `GL Account ${GL_ACCT_NO} does not allow ${TRANSACTION_TYPE} transactions` });
          continue;
        }

        if (TRANSACTION_TYPE === 'DR' && glAccount.GL_ACCT_CAT === 'ASSET' && (glAccount.LEDGER_BALANCE || 0) < AMOUNT) {
          logger.warn(`Insufficient funds in GL Account ${GL_ACCT_NO}, failing txn ${txn._id}`);
          await GLTransactionQueue.updateOne(
            { _id: txn._id },
            { $set: { QUEUE_STATUS: 'Failed', ERROR_MESSAGE: `Insufficient funds in GL Account ${GL_ACCT_NO}`, PROCESSED_AT: new Date() } },
            { session: localSession }
          );
          failedTransactions.push({ transactionId: txn._id, reason: `Insufficient funds in GL Account ${GL_ACCT_NO}` });
          continue;
        }

        const transactionData = {
          GL_ACCT_NO,
          AMOUNT,
          TRANSACTION_TYPE: TRANSACTION_TYPE.toUpperCase() === 'DEBIT' ? 'DR' : 'CR',
          CREATED_BY,
          SUB_LEDGER_NO: SUB_LEDGER_NO || '000',
          SEG_NO: SEG_NO || '001',
          ACCT_DESC: ACCT_DESC || `EOD processed transaction ${JOURNAL_ID}`,
          JOURNAL_ID,
          BAL_CD: glAccount.BAL_CD || '01',
          GL_ACCT_CAT: glAccount.GL_ACCT_CAT,
          CURRENCY_CODE: CURRENCY_CODE || 'NGN',
          EXCHANGE_RATE: EXCHANGE_RATE || 1,
        };

        try {
          const result = await createLedgerEntry(null, null, transactionData, { session: localSession });

          if (result.queued) {
            logger.warn(`Transaction ${txn._id} was re-queued due to DELAY_GL_POSTING`);
            skippedTransactions.push({ transactionId: txn._id, reason: `Transaction re-queued due to DELAY_GL_POSTING` });
            continue;
          }

          // Create Reconciliation record
          const reconciliation = new Reconciliation({
            JOURNAL_ID,
            GL_ACCT_NO,
            TRANSACTION_ID: generateTransactionId(),
            AMOUNT,
            CURRENCY_CODE: CURRENCY_CODE || 'NGN',
            EXTERNAL_REF: '',
            STATUS: 'Pending',
            CREATED_AT: new Date(),
          });
          await reconciliation.save({ session: localSession });

          // Update GLTransactionQueue status
          await GLTransactionQueue.updateOne(
            { _id: txn._id },
            { $set: { QUEUE_STATUS: 'Processed', PROCESSED_AT: new Date() } },
            { session: localSession }
          );

          // Create audit trail
          await createAuditTrail({
            eventId: JOURNAL_ID,
            userId: CREATED_BY || 'system',
            eventType: `GL_ACCOUNT_${TRANSACTION_TYPE.toUpperCase() === 'DEBIT' ? 'DR' : 'CR'}`,
            action: `${TRANSACTION_TYPE.toUpperCase() === 'DEBIT' ? 'Debit' : 'Credit'} GL Account ${GL_ACCT_NO}`,
            oldValue: { LEDGER_BALANCE: glAccount.LEDGER_BALANCE },
            newValue: { LEDGER_BALANCE: result.transaction.LEDGER_BALANCE },
            ipAddress: '127.0.0.1',
            accountNo: GL_ACCT_NO,
          }, { session: localSession });

          processedTransactions.push({
            transactionId: txn._id,
            GL_ACCT_NO,
            TRANSACTION_TYPE,
            AMOUNT,
            JOURNAL_ID,
            PROCESSED_AT: new Date(),
            status: 'PROCESSED',
          });
        } catch (txnError) {
          logger.error(`Failed to process transaction ${txn._id}`, { error: txnError.message });
          await GLTransactionQueue.updateOne(
            { _id: txn._id },
            { $set: { QUEUE_STATUS: 'Failed', ERROR_MESSAGE: txnError.message, PROCESSED_AT: new Date() } },
            { session: localSession }
          );
          failedTransactions.push({ transactionId: txn._id, reason: txnError.message });
        }
      }

      logger.info('EOD GL transactions processed', {
        processedCount: processedTransactions.length,
        failedCount: failedTransactions.length,
        skippedCount: skippedTransactions.length,
      });

      return {
        success: true,
        message: 'EOD GL transactions processed successfully',
        processed: processedTransactions,
        failed: failedTransactions,
        skipped: skippedTransactions,
      };
    });

    transactionCompleted = true;
    await localSession.commitTransaction();
    systemStatus.services.glTransactions = {
      ...systemStatus.services.glTransactions,
      healthy: result.failed.length === 0,
      lastError: result.failed.length > 0 ? result.failed[0].reason : null,
      lastRun: new Date(),
      processed: result.processed,
      failed: result.failed,
      skipped: result.skipped,
    };
    return result;
  } catch (error) {
    if (localSession.inTransaction() && !transactionCompleted) {
      await localSession.abortTransaction();
    }
    logger.error('Error in processEODGLTransactions:', { error: error.message, stack: error.stack });
    systemStatus.services.glTransactions = {
      ...systemStatus.services.glTransactions,
      healthy: false,
      lastError: error.message,
      lastRun: new Date(),
      processed: [],
      failed: [{ reason: error.message }],
      skipped: [],
    };
    return {
      success: false,
      message: `EOD GL transaction processing failed: ${error.message}`,
      processed: [],
      failed: [{ reason: error.message }],
      skipped: [],
    };
  } finally {
    if (!session) localSession.endSession();
  }
};

// Reconciliation Processing
export const processReconciliation = async (session = null) => {
  const localSession = session || await mongoose.startSession();
  let transactionCompleted = false;

  try {
    const result = await localSession.withTransaction(async () => {
      const bankStatementData = await fetchBankStatementData();
      if (!bankStatementData.length) {
        logger.info('No bank statement data to process for reconciliation');
        return { success: true, message: 'No bank statement data to process', processed: [], failed: [], skipped: [], updated: 0 };
      }

      const reconciliationOps = [];
      const processedRecords = [];
      const failedRecords = [];
      const skippedRecords = [];

      for (const statement of bankStatementData) {
        const reconciliation = await Reconciliation.findOne({
          TRANSACTION_ID: statement.transactionId,
          GL_ACCT_NO: statement.accountNo,
        }).session(localSession);

        if (!reconciliation) {
          logger.warn(`No reconciliation record found for transaction ${statement.transactionId}`, {
            accountNo: statement.accountNo,
          });
          skippedRecords.push({
            transactionId: statement.transactionId,
            status: 'SKIPPED',
            reason: 'No matching reconciliation record',
          });
          continue;
        }

        if (statement.amount === reconciliation.AMOUNT && statement.currency === reconciliation.CURRENCY_CODE) {
          reconciliationOps.push({
            updateOne: {
              filter: { _id: reconciliation._id },
              update: {
                $set: {
                  STATUS: 'Reconciled',
                  RECONCILED_AT: new Date(),
                  EXTERNAL_REF: statement.externalRef || reconciliation.EXTERNAL_REF,
                },
              },
            },
          });
          processedRecords.push({
            transactionId: statement.transactionId,
            status: 'RECONCILED',
            reconciledAt: new Date(),
          });
        } else {
          failedRecords.push({
            transactionId: statement.transactionId,
            status: 'FAILED',
            reason: 'Amount or currency mismatch',
          });
        }
      }

      if (reconciliationOps.length) {
        await Reconciliation.bulkWrite(reconciliationOps, { session: localSession });
      }

      logger.info('Reconciliation processed', {
        processedCount: processedRecords.length,
        failedCount: failedRecords.length,
        skippedCount: skippedRecords.length,
      });

      return {
        success: true,
        message: 'Reconciliation processed successfully',
        processed: processedRecords,
        failed: failedRecords,
        skipped: skippedRecords,
        updated: reconciliationOps.length,
      };
    });

    transactionCompleted = true;
    await localSession.commitTransaction();
    systemStatus.services.reconciliation = {
      ...systemStatus.services.reconciliation,
      healthy: result.failed.length === 0,
      lastError: result.failed.length > 0 ? result.failed[0].reason : null,
      lastRun: new Date(),
      processed: result.processed,
      failed: result.failed,
      skipped: result.skipped,
      updated: result.updated,
    };
    return result;
  } catch (error) {
    if (localSession.inTransaction() && !transactionCompleted) {
      await localSession.abortTransaction();
    }
    logger.error('Error in processReconciliation:', { error: error.message, stack: error.stack });
    systemStatus.services.reconciliation = {
      ...systemStatus.services.reconciliation,
      healthy: false,
      lastError: error.message,
      lastRun: new Date(),
      processed: [],
      failed: [{ reason: error.message }],
      skipped: [],
      updated: 0,
    };
    return {
      success: false,
      message: `Reconciliation processing failed: ${error.message}`,
      processed: [],
      failed: [{ reason: error.message }],
      skipped: [],
      updated: 0,
    };
  } finally {
    if (!session) localSession.endSession();
  }
};

// EOD Services List
const eodServices = [
  { name: 'interestPosting', fn: postDailyAccruedInterest },
  { name: 'termDepositInterest', fn: accrueDailyInterest },
  { name: 'glTransactions', fn: processEODGLTransactions },
  { name: 'reconciliation', fn: processReconciliation },
  { name: 'loanStatusUpdates', fn: updateLoanStatusForAllLoans },
  { name: 'overdueLoans', fn: checkOverdueLoans },
  { name: 'pendingRepayments', fn: processPendingRepayments },
  { name: 'dormantAccounts', fn: updateDormantAccounts },
  { name: 'overdueThriftCollections', fn: processOverdueThriftCollections }, // New service for thrift overdue collections
];

// Service Executor
const executeService = async (serviceName, serviceFn) => {
  const startTime = Date.now();
  try {
    logger.info(`Starting ${serviceName} service`, {
      timestamp: getServerTime().toISOString(),
      businessDate: systemStatus.currentBusinessDate,
    });

    const result = await serviceFn();
    const serviceResult = result || { success: true, message: `${serviceName} completed successfully` };

    const executionTime = Date.now() - startTime;
    const serviceDetails = {
      healthy: true,
      lastError: null,
      lastRun: new Date(),
      executionTime,
    };

    if (serviceName === 'glTransactions') {
      serviceDetails.processed = serviceResult.processed?.filter(r => r.status === 'PROCESSED') || [];
      serviceDetails.failed = serviceResult.failed || [];
      serviceDetails.skipped = serviceResult.skipped || [];
      logger.info(`glTransactions service completed`, {
        processed: serviceDetails.processed.length,
        failed: serviceDetails.failed.length,
        skipped: serviceDetails.skipped.length,
        executionTime,
      });
    } else if (serviceName === 'reconciliation') {
      serviceDetails.updated = serviceResult.updated || 0;
      serviceDetails.processed = serviceResult.processed?.filter(r => r.status === 'RECONCILED') || [];
      serviceDetails.failed = serviceResult.failed || [];
      serviceDetails.skipped = serviceResult.skipped || [];
      logger.info(`reconciliation service completed`, {
        updated: serviceDetails.updated,
        reconciled: serviceDetails.processed.length,
        discrepancies: serviceDetails.failed.length,
        skipped: serviceDetails.skipped.length,
        executionTime,
      });
    } else if (serviceName === 'overdueThriftCollections') {
      serviceDetails.processed = serviceResult.processed || [];
      serviceDetails.failed = serviceResult.failed || [];
      serviceDetails.skipped = serviceResult.skipped || [];
      logger.info(`overdueThriftCollections service completed`, {
        processed: serviceDetails.processed.length,
        failed: serviceDetails.failed.length,
        skipped: serviceDetails.skipped.length,
        executionTime,
      });
    } else {
      logger.info(`${serviceName} completed in ${executionTime}ms`, { executionTime });
    }

    systemStatus.services[serviceName] = serviceDetails;
    return { success: true, result: serviceResult };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    const errorDetails = {
      message: error.message || `Service ${serviceName} failed unexpectedly`,
      stack: error.stack,
      timestamp: getServerTime().toISOString(),
    };

    const serviceDetails = {
      healthy: false,
      lastError: errorDetails,
      lastRun: new Date(),
      executionTime,
    };

    if (serviceName === 'glTransactions' || serviceName === 'reconciliation' || serviceName === 'overdueThriftCollections') {
      serviceDetails.processed = [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      if (serviceName === 'reconciliation') {
        serviceDetails.updated = 0;
      }
    }

    systemStatus.services[serviceName] = serviceDetails;

    const isCritical = ['loanStatusUpdates', 'interestPosting', 'glTransactions', 'termDepositInterest', 'reconciliation', 'overdueThriftCollections'].includes(serviceName);
    logger.error(`${serviceName} failed`, errorDetails);
    return {
      success: false,
      error: errorDetails,
      isCritical,
    };
  }
};

// API Controllers
export const triggerEndOfDayProcess = async (req, res) => {
  if (systemStatus.state === 'running') {
    return res.status(429).json({
      success: false,
      message: 'EOD process is already running',
      timestamp: getServerTime().toISOString(),
    });
  }

  const executionStart = Date.now();
  systemStatus.state = 'running';
  systemStatus.isEODProcessing = true;
  systemStatus.eodStatus = 'IN_PROGRESS';
  systemStatus.lastRun = getServerTime();

  const results = {};
  const skippedServices = [];

  try {
    logger.info('Starting End of Day process');

    const skipServices = Array.isArray(req.body.skipServices) ? req.body.skipServices : [];
    const validServiceNames = eodServices.map(service => service.name);
    const invalidServices = skipServices.filter(name => !validServiceNames.includes(name));
    if (invalidServices.length > 0) {
      logger.warn('Invalid service names provided in skipServices', { invalidServices });
    }

    const servicesToRun = eodServices.filter(service => !skipServices.includes(service.name));
    const skippedServiceNames = eodServices
      .filter(service => skipServices.includes(service.name))
      .map(service => service.name);
    if (skippedServiceNames.length > 0) {
      logger.info('Skipping EOD services', { skippedServices: skippedServiceNames });
      skippedServices.push(...skippedServiceNames);
    }

    for (const service of servicesToRun) {
      results[service.name] = await executeService(service.name, service.fn);
    }

    const hasCriticalErrors = Object.values(results).some(
      (result) => !result.success && result.isCritical
    );

    const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
    if (!systemDate) throw new Error('System date not found');

    const nextBusinessDate = await calculateNextBusinessDate(systemStatus.currentBusinessDate);

    systemDate.currentBusinessDate = nextBusinessDate;
    systemDate.nextBusinessDate = await calculateNextBusinessDate(nextBusinessDate);
    systemDate.eodStatus = hasCriticalErrors ? 'FAILED' : 'COMPLETED';
    systemDate.eodHistory.push({
      processedAt: getServerTime(),
      processedBy: req.user ? req.user._id : null,
      status: hasCriticalErrors ? 'FAILED' : 'COMPLETED',
      skippedServices,
    });

    await systemDate.save();

    systemStatus.currentBusinessDate = systemDate.currentBusinessDate;
    systemStatus.nextBusinessDate = systemDate.nextBusinessDate;
    systemStatus.state = hasCriticalErrors ? 'error' : 'completed';
    systemStatus.eodStatus = hasCriticalErrors ? 'FAILED' : 'COMPLETED';
    systemStatus.isEODProcessing = false;
    systemStatus.executionTime = Date.now() - executionStart;
    systemStatus.serverTime = getServerTime();

    if (hasCriticalErrors) {
      logger.warn('EOD completed with critical errors', { results, skippedServices });
      return res.status(207).json({
        success: false,
        message: 'EOD failed due to critical service errors',
        results,
        skippedServices,
        systemStatus,
      });
    }

    logger.info('EOD completed successfully', {
      processedTransactions: results.glTransactions?.result?.processed?.length || 0,
      reconciledRecords: results.reconciliation?.result?.processed?.length || 0,
      thriftCollectionsProcessed: results.overdueThriftCollections?.result?.processed?.length || 0,
      skippedServices,
    });
    return res.status(200).json({
      success: true,
      message: 'EOD completed',
      results,
      skippedServices,
      systemStatus,
    });
  } catch (error) {
    systemStatus.state = 'error';
    systemStatus.eodStatus = 'FAILED';
    systemStatus.isEODProcessing = false;
    systemStatus.executionTime = Date.now() - executionStart;
    systemStatus.serverTime = getServerTime();

    logger.error('EOD failed', { error: error.message, stack: error.stack, skippedServices });
    return res.status(500).json({
      success: false,
      message: 'EOD failed',
      error: error.message,
      skippedServices,
      systemStatus,
    });
  }
};

// Other API controllers
export const getCurrentBusinessDate = async (req, res) => {
  try {
    const businessDate = await getBusinessDate();
    
    systemStatus.serverTime = getServerTime();
    return res.status(200).json({
      success: true,
      currentBusinessDate: businessDate.toISOString(),
      nextBusinessDate: systemStatus.nextBusinessDate,
      isEODProcessing: systemStatus.isEODProcessing,
      eodStatus: systemStatus.eodStatus,
      timestamp: systemStatus.serverTime.toISOString(),
    });
  } catch (error) {
    logger.error('Failed to get current business date', {
      error: error.message,
      stack: error.stack,
    });
    
    systemStatus.serverTime = getServerTime();
    return res.status(500).json({
      success: false,
      error: 'Failed to retrieve business date information',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      timestamp: systemStatus.serverTime.toISOString(),
    });
  }
};

export const getServiceErrors = async (req, res) => {
  systemStatus.serverTime = getServerTime();
  const errors = Object.entries(systemStatus.services)
    .filter(([_, status]) => !status.healthy)
    .map(([name, status]) => ({
      service: name,
      lastError: status.lastError,
      lastRun: status.lastRun,
      processed: name === 'glTransactions' || name === 'reconciliation' || name === 'overdueThriftCollections' ? status.processed : undefined,
      failed: name === 'glTransactions' || name === 'reconciliation' || name === 'overdueThriftCollections' ? status.failed : undefined,
      skipped: name === 'glTransactions' || name == 'reconciliation' || name === 'overdueThriftCollections' ? status.skipped : undefined,
      updated: name === 'reconciliation' ? status.updated : undefined,
    }));

  res.status(200).json({
    errors,
    count: errors.length,
    timestamp: systemStatus.serverTime.toISOString(),
  });
};

export const getDormantAccountsCount = async (req, res) => {
  try {
    const count = await countDormantAccountsToUpdate();
    systemStatus.serverTime = getServerTime();
    return res.status(200).json({
      success: true,
      count,
      timestamp: systemStatus.serverTime.toISOString(),
    });
  } catch (error) {
    logger.error('Dormant count fetch failed', { error: error.message });
    systemStatus.serverTime = getServerTime();
    return res.status(500).json({
      success: false,
      message: 'Failed to count dormant accounts',
      error: error.message,
      timestamp: systemStatus.serverTime.toISOString(),
    });
  }
};

export const getStatus = async (req, res) => {
  try {
    const dormantCount = await countDormantAccountsToUpdate();
    
    const serviceStatuses = Object.keys(systemStatus.services).map((serviceName) => ({
      name: serviceName,
      healthy: systemStatus.services[serviceName].healthy,
      lastRun: systemStatus.services[serviceName].lastRun,
      lastError: systemStatus.services[serviceName].lastError,
      executionTime: systemStatus.services[serviceName].executionTime,
      ...(serviceName === 'glTransactions' && {
        processed: systemStatus.services.glTransactions.processed,
        failed: systemStatus.services.glTransactions.failed,
        skipped: systemStatus.services.glTransactions.skipped,
      }),
      ...(serviceName === 'reconciliation' && {
        processed: systemStatus.services.reconciliation.processed,
        failed: systemStatus.services.reconciliation.failed,
        skipped: systemStatus.services.reconciliation.skipped,
        updated: systemStatus.services.reconciliation.updated,
      }),
    }));

    systemStatus.serverTime = getServerTime();
    res.status(200).json({
      system: {
        state: systemStatus.state,
        lastRun: systemStatus.lastRun,
        nextRun: systemStatus.nextRun,
        currentBusinessDate: systemStatus.currentBusinessDate,
        nextBusinessDate: systemStatus.nextBusinessDate,
        isEODProcessing: systemStatus.isEODProcessing,
        eodStatus: systemStatus.eodStatus,
        serverTime: systemStatus.serverTime,
        serverTimeOffset: systemStatus.serverTimeOffset,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      },
      services: serviceStatuses,
      metrics: {
        dormantAccountsPending: dormantCount,
        timestamp: systemStatus.serverTime.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Failed to get system status', {
      error: error.message,
      stack: error.stack,
      timestamp: getServerTime().toISOString(),
    });
    
    systemStatus.serverTime = getServerTime();
    res.status(500).json({
      status: 'error',
      message: 'Failed to get system status',
      error: error.message,
      timestamp: systemStatus.serverTime.toISOString(),
    });
  }
};

// Initialize system dates when the module loads
initializeSystemDates();

export default {
  triggerEndOfDayProcess,
  getCurrentBusinessDate,
  getServiceErrors,
  getDormantAccountsCount,
  getStatus,
  processReconciliation,
};
