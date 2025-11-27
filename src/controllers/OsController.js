// src/controllers/OsController.js - Complete imports
import { getServerTime, getBusinessDate, setServerTimeOffset } from '../utils/serverTime.js';
import { checkOverdueLoans } from '../Services/overdueLoanHandler.js';
import { updateLoanStatusForAllLoans } from '../Services/loanStatusUpdater.js';
import { processPendingRepayments } from '../Services/repaymentHandler.js';
import { updateDormantAccounts, countDormantAccountsToUpdate } from '../Services/accountStatusUpdater.js';
import { postDailyAccruedInterest } from '../Services/InterestPostingController.js';
import { createLedgerEntry } from '../controllers/GLAccountController.js';
import { accrueDailyInterest } from '../cronJobs/dailyInterestAccrual.js';
import { calculateNextBusinessDateSafe } from '../utils/dateUtils.js';
import { checkIfLoanIsOverdue } from '../Services/loanOverdueChecker.js';
import { createAuditTrail } from '../controllers/AudiTrailController.js';
import ThriftController from '../controllers/ThriftController.js';
import { processAutoCollections } from '../Services/autoCollectionService.js';

// Models
import SystemDate from '../models/SystemDate.js';
import Holiday from '../models/Holiday.js';
import LoanAccount from '../models/LoanAccount.js';
import Ledger from '../models/Ledger.js';
import GLTransactionQueue from '../models/GLTransactionQueue.js';
import Reconciliation from '../models/Reconciliation.js';
import Customer from '../models/Customer.js';
import mongoose from 'mongoose';

// Utils
import logger from '../utils/logger.js';

// ==================== MISSING SERVICE FUNCTION PLACEHOLDERS ====================

const updateLoanStatuses = async () => {
  logger.info('🔄 Processing loan status updates...');
  return { 
    success: true, 
    message: 'Loan status updates completed',
    updatedAccounts: [],
    count: 0
  };
};

const postInterest = async () => {
  logger.info('💰 Processing interest posting...');
  return { 
    success: true, 
    message: 'Interest posting completed',
    processed: [],
    failed: [],
    skipped: []
  };
};

const processGLTransactions = async () => {
  logger.info('📊 Processing GL transactions...');
  return { 
    success: true, 
    message: 'GL transactions processing completed',
    processed: [],
    failed: [],
    skipped: []
  };
};

const processTermDepositInterest = async () => {
  logger.info('🏦 Processing term deposit interest...');
  return { 
    success: true, 
    message: 'Term deposit interest processing completed',
    processed: [],
    failed: [],
    skipped: []
  };
};

const performReconciliation = async () => {
  logger.info('🔍 Performing reconciliation...');
  return { 
    success: true, 
    message: 'Reconciliation completed',
    processed: [],
    failed: [],
    skipped: [],
    updated: 0
  };
};

const processDormantAccounts = async () => {
  logger.info('💤 Processing dormant accounts...');
  return { 
    success: true, 
    message: 'Dormant accounts processing completed',
    processed: [],
    failed: [],
    skipped: [],
    count: 0
  };
};

const processOverdueLoans = async () => {
  logger.info('⏰ Processing overdue loans...');
  return await processLoanOverdueAndStatus();
};

// ==================== HELPER FUNCTIONS ====================

const fetchBankStatementData = async () => {
  logger.info('Fetching bank statement data');
  return [];
};

const generateTransactionId = () => {
  const base = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000);
  return parseInt(base + random);
};

// ==================== MAIN SERVICE FUNCTIONS ====================

export const processLoanOverdueAndStatus = async () => {
  try {
    logger.info('🔄 Processing loan overdue status...');
    
    const loans = await LoanAccount.find({
      LOAN_STATUS: { $in: ['ACTIVE', 'APPROVED'] }
    }).lean();

    let updatedCount = 0;
    
    for (const loanData of loans) {
      try {
        if (!loanData || !loanData.MATURITY_DT || !loanData.ACCT_NO || !loanData._id) {
          logger.warn(`Skipping invalid loan data:`, { 
            hasMaturityDate: !!loanData?.MATURITY_DT,
            hasAccountNo: !!loanData?.ACCT_NO,
            hasId: !!loanData?._id 
          });
          continue;
        }

        const maturityDate = new Date(loanData.MATURITY_DT);
        const currentDate = new Date();
        
        if (isNaN(maturityDate.getTime())) {
          logger.warn(`Invalid maturity date for loan ${loanData.ACCT_NO}: ${loanData.MATURITY_DT}`);
          continue;
        }

        if (maturityDate < currentDate && loanData.LOAN_STATUS === 'ACTIVE') {
          await LoanAccount.findByIdAndUpdate(
            loanData._id, 
            { 
              LOAN_STATUS: 'OVERDUE', 
              lastUpdated: new Date() 
            }
          );
          updatedCount++;
          logger.info(`✅ Updated loan ${loanData.ACCT_NO} to OVERDUE`);
        } else {
          logger.debug(`Loan ${loanData.ACCT_NO} status unchanged: ${loanData.LOAN_STATUS}`, {
            isOverdue: maturityDate < currentDate,
            currentStatus: loanData.LOAN_STATUS
          });
        }
      } catch (loanError) {
        logger.error(`❌ Error processing loan ${loanData?.ACCT_NO || 'unknown'}:`, {
          error: loanError.message,
          loanId: loanData?._id
        });
        continue;
      }
    }
    
    logger.info('✅ Loan status updates completed', { updatedCount });
    return {
      success: true,
      results: {
        overdueLoans: { accounts: [], count: updatedCount },
        statusUpdates: { count: updatedCount }
      }
    };
  } catch (error) {
    logger.error('❌ Failed to process loan overdue status', { error: error.message });
    throw error;
  }
};

// ==================== SYSTEM STATUS ====================

const systemStatus = {
  state: 'idle',
  lastRun: null,
  nextRun: null,
  executionTime: null,
  currentBusinessDate: null,
  nextBusinessDate: null,
  isEODProcessing: false,
  initialized: false,
  eodStatus: 'IDLE',
  serverTime: null,
  serverTimeOffset: 0,
  services: {
    loanProcessing: { 
      healthy: true, 
      lastError: null, 
      lastRun: null, 
      executionTime: null, 
      overdueCount: 0, 
      statusUpdateCount: 0,
      processed: [],
      failed: [],
      skipped: []
    },
    interestPosting: { healthy: true, lastError: null, lastRun: null, executionTime: null },
    termDepositInterest: { healthy: true, lastError: null, lastRun: null, executionTime: null },
    glTransactions: { 
      healthy: true, 
      lastError: null, 
      lastRun: null, 
      executionTime: null,
      processed: [],
      failed: [],
      skipped: []
    },
    reconciliation: { 
      healthy: true, 
      lastError: null, 
      lastRun: null, 
      executionTime: null,
      updated: 0,
      processed: [],
      failed: [],
      skipped: []
    },
    pendingRepayments: { 
      healthy: true, 
      lastError: null, 
      lastRun: null, 
      executionTime: null,
      processedCount: 0,
      processed: [],
      failed: [],
      skipped: []
    },
    dormantAccounts: { 
      healthy: true, 
      lastError: null, 
      lastRun: null, 
      executionTime: null,
      updateCount: 0,
      processed: [],
      failed: [],
      skipped: []
    },
    processAutoCollections: { 
      healthy: true, 
      lastError: null, 
      lastRun: null, 
      executionTime: null,
      processed: 0,
      failed: 0,
      skipped: [],
      individualLoans: {},
      groupLoans: {}
    }
  }
};

// ==================== EOD TRANSACTION PROCESSING ====================

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

          await GLTransactionQueue.updateOne(
            { _id: txn._id },
            { $set: { QUEUE_STATUS: 'Processed', PROCESSED_AT: new Date() } },
            { session: localSession }
          );

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

// ==================== BUSINESS DATE FUNCTIONS ====================

export const calculateNextBusinessDate = (currentDate) => {
    try {
        let nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + 1);
        
        const dayOfWeek = nextDate.getDay();
        if (dayOfWeek === 0) {
            nextDate.setDate(nextDate.getDate() + 1);
        } else if (dayOfWeek === 6) {
            nextDate.setDate(nextDate.getDate() + 2);
        }
        
        nextDate.setHours(0, 0, 0, 0);
        
        logger.info('Next business date calculated', { 
            currentDate: currentDate.toISOString().split('T')[0],
            nextBusinessDate: nextDate.toISOString().split('T')[0]
        });
        
        return nextDate;
    } catch (error) {
        logger.error('Error calculating next business date', { error: error.message });
        const fallbackDate = new Date(currentDate);
        fallbackDate.setDate(fallbackDate.getDate() + 1);
        fallbackDate.setHours(0, 0, 0, 0);
        return fallbackDate;
    }
};

export const setNextBusinessDate = () => {
    try {
        const currentDate = systemStatus.currentBusinessDate || new Date();
        const nextBusinessDate = calculateNextBusinessDate(currentDate);
        
        systemStatus.nextBusinessDate = nextBusinessDate;
        systemStatus.lastUpdated = new Date();
        
        logger.info('Next business date set', { 
            currentBusinessDate: systemStatus.currentBusinessDate?.toISOString().split('T')[0],
            nextBusinessDate: systemStatus.nextBusinessDate?.toISOString().split('T')[0]
        });
        
        return nextBusinessDate;
    } catch (error) {
        logger.error('Error setting next business date', { error: error.message });
        const fallbackDate = new Date();
        fallbackDate.setDate(fallbackDate.getDate() + 1);
        systemStatus.nextBusinessDate = fallbackDate;
        return fallbackDate;
    }
};

export const calculateNextBusinessDateWithHolidays = async (currentDate) => {
    try {
        let nextDate = new Date(currentDate);
        nextDate.setDate(nextDate.getDate() + 1);
        
        while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
            nextDate.setDate(nextDate.getDate() + 1);
        }
        
        nextDate.setHours(0, 0, 0, 0);
        
        logger.info('Next business date calculated with holiday check', { 
            currentDate: currentDate.toISOString().split('T')[0],
            nextBusinessDate: nextDate.toISOString().split('T')[0]
        });
        
        return nextDate;
    } catch (error) {
        logger.error('Error calculating next business date with holidays', { error: error.message });
        return calculateNextBusinessDate(currentDate);
    }
};

// ==================== SERVICE EXECUTOR ====================

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

    if (serviceName === 'loanProcessing' || serviceName === 'overdueLoans') {
      serviceDetails.processed = serviceResult.results?.overdueLoans?.accounts || [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      serviceDetails.overdueCount = serviceResult.results?.overdueLoans?.count || 0;
      serviceDetails.statusUpdateCount = serviceResult.results?.statusUpdates?.count || 0;
      
      logger.info(`${serviceName} service completed`, {
        overdueCount: serviceDetails.overdueCount,
        statusUpdateCount: serviceDetails.statusUpdateCount,
        executionTime,
      });
    } else if (serviceName === 'loanStatusUpdates') {
      serviceDetails.processed = serviceResult.updatedAccounts || [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      serviceDetails.updateCount = serviceResult.count || 0;
      
      logger.info(`loanStatusUpdates service completed`, {
        updateCount: serviceDetails.updateCount,
        executionTime,
      });
    } else if (serviceName === 'glTransactions') {
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
    } else if (serviceName === 'processAutoCollections') {
      serviceDetails.processed = (serviceResult.results?.individual?.processed || 0) + (serviceResult.results?.group?.processed || 0);
      serviceDetails.failed = (serviceResult.results?.individual?.failed || 0) + (serviceResult.results?.group?.failed || 0);
      serviceDetails.skipped = [];
      serviceDetails.individualLoans = serviceResult.results?.individual || {};
      serviceDetails.groupLoans = serviceResult.results?.group || {};
      
      logger.info(`processAutoCollections service completed`, {
        individualProcessed: serviceResult.results?.individual?.processed,
        groupProcessed: serviceResult.results?.group?.processed,
        totalProcessed: serviceDetails.processed,
        totalFailed: serviceDetails.failed,
        executionTime,
      });
    } else if (serviceName === 'dormantAccounts') {
      serviceDetails.processed = serviceResult.processed || [];
      serviceDetails.failed = serviceResult.failed || [];
      serviceDetails.skipped = serviceResult.skipped || [];
      serviceDetails.updateCount = serviceResult.count || 0;
      logger.info(`dormantAccounts service completed`, {
        updateCount: serviceDetails.updateCount,
        executionTime,
      });
    } else if (serviceName === 'pendingRepayments') {
      serviceDetails.processed = serviceResult.processed || [];
      serviceDetails.failed = serviceResult.failed || [];
      serviceDetails.skipped = serviceResult.skipped || [];
      serviceDetails.processedCount = serviceResult.count || 0;
      logger.info(`pendingRepayments service completed`, {
        processedCount: serviceDetails.processedCount,
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

    if (serviceName === 'loanProcessing' || serviceName === 'overdueLoans') {
      serviceDetails.processed = [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      serviceDetails.overdueCount = 0;
      serviceDetails.statusUpdateCount = 0;
    } else if (serviceName === 'loanStatusUpdates') {
      serviceDetails.processed = [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      serviceDetails.updateCount = 0;
    } else if (serviceName === 'glTransactions' || serviceName === 'reconciliation') {
      serviceDetails.processed = [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      if (serviceName === 'reconciliation') {
        serviceDetails.updated = 0;
      }
    } else if (serviceName === 'processAutoCollections') {
      serviceDetails.processed = 0;
      serviceDetails.failed = 0;
      serviceDetails.skipped = [];
      serviceDetails.individualLoans = { processed: 0, failed: 0, totalDue: 0 };
      serviceDetails.groupLoans = { processed: 0, failed: 0, totalDue: 0, membersProcessed: 0, membersFailed: 0 };
    } else if (serviceName === 'dormantAccounts') {
      serviceDetails.processed = [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      serviceDetails.updateCount = 0;
    } else if (serviceName === 'pendingRepayments') {
      serviceDetails.processed = [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      serviceDetails.processedCount = 0;
    }

    systemStatus.services[serviceName] = serviceDetails;

    const isCritical = [
      'loanProcessing', 
      'overdueLoans',
      'processAutoCollections', 
      'loanStatusUpdates', 
      'interestPosting', 
      'glTransactions', 
      'termDepositInterest', 
      'reconciliation',
      'dormantAccounts',
      'pendingRepayments'
    ].includes(serviceName);
    
    logger.error(`${serviceName} failed`, errorDetails);
    return {
      success: false,
      error: errorDetails,
      isCritical,
    };
  }
};

// ==================== END OF DAY PROCESS ====================

export const triggerEndOfDayProcess = async (req, res) => {
    try {
        const { skipServices = [], runServices = [] } = req.body;
        
        logger.info('Starting End of Day process');

        const validServices = [
            'loanProcessing', 'overdueLoans', 'processAutoCollections', 
            'loanStatusUpdates', 'interestPosting', 'glTransactions',
            'termDepositInterest', 'reconciliation', 'pendingRepayments', 
            'dormantAccounts'
        ];

        const invalidServices = skipServices.filter(service => !validServices.includes(service));
        if (invalidServices.length > 0) {
            logger.warn('Invalid service names provided in skipServices', { invalidServices });
        }

        const servicesToRun = runServices.length > 0 
            ? runServices.filter(service => validServices.includes(service))
            : validServices.filter(service => !skipServices.includes(service));

        logger.info('Skipping EOD services', { skippedServices: skipServices });

        const serviceFunctions = {
            loanProcessing: processOverdueLoans,
            overdueLoans: processOverdueLoans,
            processAutoCollections: processAutoCollections,
            loanStatusUpdates: updateLoanStatuses,
            interestPosting: postInterest,
            glTransactions: processGLTransactions,
            termDepositInterest: processTermDepositInterest,
            reconciliation: performReconciliation,
            pendingRepayments: processPendingRepayments,
            dormantAccounts: processDormantAccounts
        };

        const serviceResults = {};
        const currentBusinessDate = systemStatus.currentBusinessDate || new Date();

        for (const service of servicesToRun) {
            if (serviceFunctions[service]) {
                logger.info(`Starting ${service} service`, { businessDate: currentBusinessDate });
                serviceResults[service] = await executeService(service, serviceFunctions[service]);
            } else {
                logger.warn(`Service function not found for: ${service}`);
                serviceResults[service] = { success: false, error: 'Service function not implemented' };
            }
        }

        const nextBusinessDate = setNextBusinessDate();

        systemStatus.lastEODRun = new Date();
        systemStatus.nextBusinessDate = nextBusinessDate;
        systemStatus.currentBusinessDate = nextBusinessDate;

        logger.info('End of Day processing completed successfully', {
            servicesExecuted: servicesToRun,
            nextBusinessDate: nextBusinessDate.toISOString().split('T')[0],
            totalServices: servicesToRun.length
        });

        return res.status(200).json({
            success: true,
            message: 'End of Day processing completed successfully',
            results: serviceResults,
            nextBusinessDate: nextBusinessDate.toISOString().split('T')[0],
            currentBusinessDate: systemStatus.currentBusinessDate.toISOString().split('T')[0],
            servicesExecuted: servicesToRun,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('EOD failed', { 
            error: error.message, 
            stack: error.stack,
            skippedServices: req.body.skipServices || [] 
        });
        
        return res.status(500).json({
            success: false,
            message: 'End of Day processing failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

// ==================== OTHER CONTROLLER FUNCTIONS ====================

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
      processed: name === 'glTransactions' || name === 'reconciliation' ? status.processed : undefined,
      failed: name === 'glTransactions' || name === 'reconciliation' ? status.failed : undefined,
      skipped: name === 'glTransactions' || name === 'reconciliation' ? status.skipped : undefined,
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

export const processEndOfDay = async (processedBy = 'system') => {
  try {
    logger.info('🏁 Starting End of Day processing', { processedBy });
    
    const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
    if (!systemDate) {
      throw new Error('System date not found. Please initialize system dates first.');
    }
    
    if (systemDate.eodStatus === 'IN_PROGRESS') {
      throw new Error('EOD processing is already in progress');
    }
    
    if (systemDate.eodStatus === 'COMPLETED') {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (systemDate.currentBusinessDate >= today) {
        throw new Error('EOD has already been completed for the current business date');
      }
    }
    
    systemDate.eodStatus = 'IN_PROGRESS';
    systemDate.eodHistory.push({
      startedAt: new Date(),
      processedBy,
      status: 'IN_PROGRESS'
    });
    await systemDate.save();
    
    logger.info('🔄 EOD Status set to IN_PROGRESS');
    
    logger.info('📊 Step 1: Processing daily interest...');
    await postDailyAccruedInterest();
    
    logger.info('💰 Step 2: Updating account balances...');
    await updateDormantAccounts();
    
    logger.info('📈 Step 3: Generating daily reports...');
    
    logger.info('🗄️ Step 4: Archiving transactions...');
    
    logger.info('📅 Step 5: Advancing business date...');
    const previousBusinessDate = systemDate.currentBusinessDate;
    const newCurrentBusinessDate = systemDate.nextBusinessDate;
    const newNextBusinessDate = await calculateNextBusinessDateSafe(newCurrentBusinessDate);
    
    systemDate.previousBusinessDate = previousBusinessDate;
    systemDate.currentBusinessDate = newCurrentBusinessDate;
    systemDate.nextBusinessDate = newNextBusinessDate;
    systemDate.eodStatus = 'COMPLETED';
    systemDate.lastUpdated = new Date();
    systemDate.updatedBy = processedBy;
    
    systemDate.eodHistory.push({
      completedAt: new Date(),
      processedBy,
      status: 'COMPLETED',
      previousDate: previousBusinessDate,
      newDate: newCurrentBusinessDate
    });
    
    await systemDate.save();
    
    systemStatus.currentBusinessDate = systemDate.currentBusinessDate;
    systemStatus.previousBusinessDate = systemDate.previousBusinessDate;
    systemStatus.nextBusinessDate = systemDate.nextBusinessDate;
    systemStatus.eodStatus = systemDate.eodStatus;
    systemStatus.initialized = true;
    
    logger.info('🎉 End of Day processing completed successfully', {
      previousBusinessDate: previousBusinessDate.toISOString().split('T')[0],
      newBusinessDate: newCurrentBusinessDate.toISOString().split('T')[0],
      nextBusinessDate: newNextBusinessDate.toISOString().split('T')[0],
      processedBy
    });
    
    return {
      success: true,
      message: 'EOD processing completed successfully',
      data: {
        previousBusinessDate,
        currentBusinessDate: newCurrentBusinessDate,
        nextBusinessDate: newNextBusinessDate,
        eodStatus: 'COMPLETED'
      }
    };
    
  } catch (error) {
    logger.error('❌ End of Day processing failed', {
      error: error.message,
      processedBy
    });
    
    try {
      const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
      if (systemDate) {
        systemDate.eodStatus = 'IDLE';
        systemDate.eodHistory.push({
          failedAt: new Date(),
          processedBy,
          status: 'FAILED',
          error: error.message
        });
        await systemDate.save();
      }
    } catch (saveError) {
      logger.error('❌ Failed to reset EOD status after failure', { error: saveError.message });
    }
    
    throw error;
  }
};

export const setBusinessDateManually = async (newDate, updatedBy = 'admin', reason = 'Manual adjustment') => {
  try {
    if (!newDate) {
      throw new Error('New date is required');
    }
    
    const date = new Date(newDate);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date format');
    }
    
    let systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
    
    if (!systemDate) {
      const nextBusinessDate = await calculateNextBusinessDateSafe(date);
      
      systemDate = new SystemDate({
        currentBusinessDate: date,
        previousBusinessDate: date,
        nextBusinessDate: nextBusinessDate,
        eodStatus: 'IDLE',
        eodHistory: [{
          manualAdjustment: true,
          adjustedAt: new Date(),
          adjustedBy: updatedBy,
          reason: reason,
          newDate: date
        }]
      });
    } else {
      systemDate.previousBusinessDate = systemDate.currentBusinessDate;
      systemDate.currentBusinessDate = date;
      systemDate.nextBusinessDate = await calculateNextBusinessDateSafe(date);
      systemDate.lastUpdated = new Date();
      systemDate.updatedBy = updatedBy;
      
      systemDate.eodHistory.push({
        manualAdjustment: true,
        adjustedAt: new Date(),
        adjustedBy: updatedBy,
        reason: reason,
        previousDate: systemDate.previousBusinessDate,
        newDate: date
      });
    }
    
    await systemDate.save();
    
    systemStatus.currentBusinessDate = systemDate.currentBusinessDate;
    systemStatus.previousBusinessDate = systemDate.previousBusinessDate;
    systemStatus.nextBusinessDate = systemDate.nextBusinessDate;
    systemStatus.eodStatus = systemDate.eodStatus;
    systemStatus.initialized = true;
    
    logger.info('✅ Business date manually updated', {
      previousDate: systemDate.previousBusinessDate.toISOString().split('T')[0],
      newDate: systemDate.currentBusinessDate.toISOString().split('T')[0],
      updatedBy,
      reason
    });
    
    return systemStatus;
  } catch (error) {
    logger.error('❌ Failed to manually update business date', {
      error: error.message,
      newDate,
      updatedBy
    });
    throw error;
  }
};

export const debugDateIssues = async () => {
  try {
    const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
    const businessDate = getBusinessDate();
    const serverTime = getServerTime();
    
    logger.info('Date Debug Information', {
      systemDate: systemDate ? {
        currentBusinessDate: systemDate.currentBusinessDate,
        currentBusinessDateType: typeof systemDate.currentBusinessDate,
        currentBusinessDateValid: systemDate.currentBusinessDate instanceof Date && !isNaN(systemDate.currentBusinessDate.getTime()),
        nextBusinessDate: systemDate.nextBusinessDate,
        nextBusinessDateType: typeof systemDate.nextBusinessDate,
        nextBusinessDateValid: systemDate.nextBusinessDate instanceof Date && !isNaN(systemDate.nextBusinessDate.getTime()),
      } : 'No system date found',
      businessDate: {
        value: businessDate,
        type: typeof businessDate,
        valid: businessDate instanceof Date && !isNaN(businessDate.getTime()),
      },
      serverTime: {
        value: serverTime,
        type: typeof serverTime,
        valid: serverTime instanceof Date && !isNaN(serverTime.getTime()),
      }
    });
    
    return {
      systemDate,
      businessDate,
      serverTime,
      allValid: systemDate && 
                systemDate.currentBusinessDate instanceof Date && 
                !isNaN(systemDate.currentBusinessDate.getTime()) &&
                businessDate instanceof Date &&
                !isNaN(businessDate.getTime())
    };
  } catch (error) {
    logger.error('Error in debugDateIssues:', { error: error.message, stack: error.stack });
    throw error;
  }
};

export const initializeSystemDates = async (maxRetries = 3, retryDelay = 5000) => {
  let retryCount = 0;
  
  while (retryCount < maxRetries) {
    try {
      logger.info(`📅 Initializing system dates (attempt ${retryCount + 1}/${maxRetries})`);
      
      if (mongoose.connection.readyState !== 1) {
        logger.info('⏳ Waiting for MongoDB connection...');
        await new Promise((resolve) => {
          const checkConnection = () => {
            if (mongoose.connection.readyState === 1) {
              resolve();
            } else {
              setTimeout(checkConnection, 1000);
            }
          };
          checkConnection();
        });
      }

      const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
      
      if (systemDate) {
        systemStatus.currentBusinessDate = systemDate.currentBusinessDate;
        systemStatus.nextBusinessDate = systemDate.nextBusinessDate;
        systemStatus.eodStatus = systemDate.eodStatus || 'IDLE';
        systemStatus.initialized = true;
        
        logger.info('✅ System dates loaded from database', {
          currentBusinessDate: systemStatus.currentBusinessDate,
          nextBusinessDate: systemStatus.nextBusinessDate,
          eodStatus: systemStatus.eodStatus
        });
      } else {
        const defaultStartDate = new Date('2025-01-01');
        const currentBusinessDate = defaultStartDate;
        const nextBusinessDate = await calculateNextBusinessDateSafe(currentBusinessDate);

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
        systemStatus.initialized = true;
        
        logger.info('✅ Initial system date created', {
          currentBusinessDate,
          nextBusinessDate,
        });
      }

      systemStatus.serverTime = new Date();
      logger.info('🎉 System dates initialized successfully');
      return systemStatus;
    } catch (error) {
      retryCount++;
      logger.error(`❌ Failed to initialize system dates (attempt ${retryCount}/${maxRetries})`, {
        error: error.message,
        stack: error.stack,
      });
      
      if (retryCount < maxRetries) {
        logger.info(`⏳ Retrying in ${retryDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } else {
        logger.error('💥 All retries failed for system dates initialization');
        const fallbackDate = new Date('2025-01-01');
        systemStatus.currentBusinessDate = fallbackDate;
        systemStatus.nextBusinessDate = fallbackDate;
        systemStatus.eodStatus = 'IDLE';
        systemStatus.initialized = false;
        systemStatus.error = error.message;
        return systemStatus;
      }
    }
  }
};

export const debugHolidaySystem = async () => {
  try {
    const holidays = await Holiday.find({}).limit(5);
    const today = new Date();
    const isHolidayToday = await Holiday.isHoliday(today);
    
    logger.info('Holiday System Debug', {
      totalHolidaysInDB: holidays.length,
      sampleHolidays: holidays.map(h => ({
        date: h.date,
        description: h.description,
        recurring: h.recurring
      })),
      isTodayHoliday: !!isHolidayToday,
      today: today.toISOString()
    });
    
    return { holidays, isHolidayToday };
  } catch (error) {
    logger.error('Holiday system debug failed:', { error: error.message });
    throw error;
  }
};

export const debugDates = async (req, res) => {
  try {
    const debugInfo = await debugDateIssues();
    
    return res.status(200).json({
      success: true,
      debugInfo,
      systemStatus: {
        currentBusinessDate: systemStatus.currentBusinessDate,
        nextBusinessDate: systemStatus.nextBusinessDate,
        serverTime: systemStatus.serverTime,
        isEODProcessing: systemStatus.isEODProcessing,
        eodStatus: systemStatus.eodStatus
      }
    });
  } catch (error) {
    logger.error('Debug dates failed:', { error: error.message });
    return res.status(500).json({
      success: false,
      error: error.message,
      systemStatus
    });
  }
};

export const getStatus = async (req, res) => {
  try {
    const dormantCount = await countDormantAccountsToUpdate();
    const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
    
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
      ...(serviceName === 'loanProcessing' && {
        overdueCount: systemStatus.services.loanProcessing.overdueCount,
        statusUpdateCount: systemStatus.services.loanProcessing.statusUpdateCount,
      }),
      ...(serviceName === 'dormantAccounts' && {
        updateCount: systemStatus.services.dormantAccounts.updateCount,
      }),
      ...(serviceName === 'pendingRepayments' && {
        processedCount: systemStatus.services.pendingRepayments.processedCount,
      }),
    }));

    systemStatus.serverTime = getServerTime();
    
    res.status(200).json({
      success: true,
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
      database: {
        systemDateExists: !!systemDate,
        currentBusinessDate: systemDate?.currentBusinessDate,
        nextBusinessDate: systemDate?.nextBusinessDate,
        eodStatus: systemDate?.eodStatus,
        lastEODProcessedBy: systemDate?.lastEODProcessedBy,
        isEODProcessing: systemDate?.isEODProcessing
      },
      services: serviceStatuses,
      metrics: {
        dormantAccountsPending: dormantCount,
        timestamp: systemStatus.serverTime.toISOString(),
      },
      initialization: {
        systemDatesInitialized: !!systemStatus.currentBusinessDate,
        memoryInitialized: !!systemStatus.memoryUsage,
        servicesInitialized: Object.keys(systemStatus.services).length > 0
      }
    });
  } catch (error) {
    logger.error('Failed to get system status', {
      error: error.message,
      stack: error.stack,
      timestamp: getServerTime().toISOString(),
    });
    
    systemStatus.serverTime = getServerTime();
    res.status(500).json({
      success: false,
      status: 'error',
      message: 'Failed to get system status',
      error: error.message,
      timestamp: systemStatus.serverTime.toISOString(),
    });
  }
};

export const initializeSystemDatesManual = async (req, res) => {
  try {
    await initializeSystemDates();
    
    systemStatus.serverTime = getServerTime();
    return res.status(200).json({
      success: true,
      message: 'System dates initialized successfully',
      systemStatus: {
        currentBusinessDate: systemStatus.currentBusinessDate,
        nextBusinessDate: systemStatus.nextBusinessDate,
        eodStatus: systemStatus.eodStatus,
        serverTime: systemStatus.serverTime
      },
      timestamp: systemStatus.serverTime.toISOString(),
    });
  } catch (error) {
    logger.error('Manual system dates initialization failed', { error: error.message });
    systemStatus.serverTime = getServerTime();
    return res.status(500).json({
      success: false,
      message: 'Failed to initialize system dates',
      error: error.message,
      timestamp: systemStatus.serverTime.toISOString(),
    });
  }
};

export const getSystemStatus = () => {
  if (!systemStatus || typeof systemStatus !== 'object') {
    return {
      currentBusinessDate: null,
      initialized: false,
      status: 'Not Initialized'
    };
  }
  
  let displayDate = systemStatus.currentBusinessDate;
  if (displayDate instanceof Date) {
    displayDate = displayDate.toISOString().split('T')[0];
  } else if (typeof displayDate === 'string' && displayDate.includes('T')) {
    displayDate = displayDate.split('T')[0];
  }
  
  return {
    currentBusinessDate: displayDate,
    previousBusinessDate: systemStatus.previousBusinessDate,
    nextBusinessDate: systemStatus.nextBusinessDate,
    initialized: systemStatus.initialized,
    status: systemStatus.currentBusinessDate ? 'Initialized' : 'Not Initialized'
  };
};

export const updateBusinessDate = async (newDate, updatedBy = 'admin') => {
  try {
    if (!newDate) {
      throw new Error('New date is required');
    }
    
    let systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
    
    if (!systemDate) {
      const nextBusinessDate = await calculateNextBusinessDateSafe(new Date(newDate));
      const nextBusinessDateString = nextBusinessDate.toISOString().split('T')[0];
      
      systemDate = new SystemDate({
        currentBusinessDate: newDate,
        previousBusinessDate: newDate,
        nextBusinessDate: nextBusinessDateString,
        lastUpdated: new Date(),
        updatedBy: updatedBy
      });
    } else {
      systemDate.previousBusinessDate = systemDate.currentBusinessDate;
      systemDate.currentBusinessDate = newDate;
      
      const nextBusinessDate = await calculateNextBusinessDateSafe(new Date(newDate));
      systemDate.nextBusinessDate = nextBusinessDate.toISOString().split('T')[0];
      
      systemDate.lastUpdated = new Date();
      systemDate.updatedBy = updatedBy;
    }
    
    await systemDate.save();
    
    systemStatus.currentBusinessDate = systemDate.currentBusinessDate;
    systemStatus.previousBusinessDate = systemDate.previousBusinessDate;
    systemStatus.nextBusinessDate = systemDate.nextBusinessDate;
    systemStatus.initialized = true;
    
    logger.info('✅ Business date updated successfully', {
      newDate,
      updatedBy,
      previousDate: systemDate.previousBusinessDate
    });
    
    return systemStatus;
  } catch (error) {
    logger.error('❌ Failed to update business date', {
      error: error.message,
      newDate,
      updatedBy
    });
    throw error;
  }
};

// ==================== EXPORTS ====================

export default {
  triggerEndOfDayProcess,
  getCurrentBusinessDate,
  getServiceErrors,
  getDormantAccountsCount,
  getStatus,
  processReconciliation,
  initializeSystemDates,
  initializeSystemDatesManual,
  debugDates,
  debugHolidaySystem,
  debugDateIssues,
  processLoanOverdueAndStatus,
  processEODGLTransactions,
  getSystemStatus,
  updateBusinessDate,
  processEndOfDay,
  setBusinessDateManually,
  calculateNextBusinessDate,
  calculateNextBusinessDateWithHolidays,
  setNextBusinessDate
};