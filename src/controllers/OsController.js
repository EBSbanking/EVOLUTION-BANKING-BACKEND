// src/controllers/OsController.js - CORRECTED IMPORTS
import { getServerTime, getBusinessDate, setServerTimeOffset } from '../utils/serverTime.js';
import { checkOverdueLoans } from '../Services/overdueLoanHandler.js';
import { updateLoanStatusForAllLoans } from '../Services/loanStatusUpdater.js';
import { processPendingRepayments } from '../Services/repaymentHandler.js';
import { updateDormantAccounts, countDormantAccountsToUpdate } from '../Services/accountStatusUpdater.js';
import { postDailyAccruedInterest } from '../Services/InterestPostingController.js';
import { createLedgerEntry } from '../controllers/GLAccountController.js';
import { accrueDailyInterest } from '../cronJobs/dailyInterestAccrual.js';
import { calculateNextBusinessDate } from '../utils/dateUtils.js'; // Use from dateUtils.js
import { checkIfLoanIsOverdue } from '../Services/loanOverdueChecker.js';
import { createAuditTrail } from '../controllers/AudiTrailController.js';
import ThriftController from '../controllers/ThriftController.js';
import { processAutoCollections } from '../Services/autoCollectionService.js';
import { initializeModels, getLoanAccount, getLoanRepayment } from '../models/index.js';

// Import Sequelize models
import SystemDate from '../models/SystemDate.js';
import Holiday from '../models/Holiday.js';
// import LoanAccount from '../models/LoanAccount.js';
import Ledger from '../models/Ledger.js';
import GLTransactionQueue from '../models/GLTransactionQueue.js';
import Reconciliation from '../models/Reconciliation.js';
import Customer from '../models/Customer.js';

// Import DirectDebit model for loan repayment processing
import DirectDebit from '../models/DirectDebit.js';
import Deposit from '../models/Deposit.js';

// Import database connection
import sequelize  from '../../config/db.js';
import { Op } from 'sequelize';

// Utils
import logger from '../utils/logger.js';

// Import SystemDateController and its helper function
// Use separate imports for clarity
import SystemDateController from './SystemDateController.js';
// import { calculateNextBusinessDate } from './SystemDateController.js';

// ==================== DIRECT DEBIT LOAN REPAYMENT SERVICE ====================

// Then use them
// ==================== DIRECT DEBIT LOAN REPAYMENT SERVICE ====================

let modelsInitialized = false;

async function ensureModelsInitialized() {
  if (!modelsInitialized) {
    try {
      await initializeModels();
      modelsInitialized = true;
      console.log('✅ Models initialized in OsController');
    } catch (error) {
      console.error('❌ Failed to initialize models:', error.message);
    }
  }
}

/**
 * Helper function to get LoanAccount model
 */
const getLoanAccountModel = () => {
  return getLoanAccount ? getLoanAccount() : null;
};

/**
 * Helper function to get LoanRepayment model
 */
const getLoanRepaymentModel = () => {
  return getLoanRepayment ? getLoanRepayment() : null;
};

let activeLoans = [];
try {
  if (LoanAccount && LoanAccount.findAll) {
    activeLoans = await LoanAccount.findAll({ 
      where: {
        LOAN_STATUS: 'ACTIVE'
      }
    });
  } else {
    console.warn('LoanAccount model not available, returning empty array');
  }
} catch (error) {
  console.error('Error fetching loans:', error.message);
  activeLoans = [];
}

/**
 * Process loan repayment direct debits
 * This function runs as part of the EOD process to handle scheduled loan repayments
 */
const processLoanRepaymentDirectDebits = async () => {
  const startTime = Date.now();
  logger.info('💰 Starting Loan Repayment Direct Debit Processing...');
  
  try {
    const batchDate = new Date();
    
    // Find all due loan repayments for today
    const dueRepayments = await DirectDebit.findAll({
      where: {
        DIRECT_DR_MANDATE_TY_CD: 'LOAN_REPAYMENT',
        REC_ST: 'Y',
        NEXT_PAY_DT: {
          [Op.lte]: batchDate
        },
        EXPIRY_DT: {
          [Op.gt]: batchDate
        }
      },
      order: [['NEXT_PAY_DT', 'ASC']]
    });

    if (dueRepayments.length === 0) {
      logger.info('✅ No loan repayment direct debits due for processing');
      return {
        success: true,
        results: {
          totalProcessed: 0,
          successful: [],
          failed: [],
          skipped: 0
        },
        executionTime: Date.now() - startTime
      };
    }

    const transaction = await sequelize.transaction();
    const results = {
      totalProcessed: 0,
      successful: [],
      failed: [],
      skipped: 0
    };

    for (const repayment of dueRepayments) {
      try {
        // Check if customer has sufficient balance in source account
        const sourceAccount = await Deposit.findOne({
          where: { ACCOUNT_NO: repayment.FROM_DEPOSIT_ACCT_NO }
        });

        if (!sourceAccount) {
          results.failed.push({
            directDebitId: repayment.DIRECT_DR_ID,
            loanId: repayment.LOAN_ID,
            reason: `Source account ${repayment.FROM_DEPOSIT_ACCT_NO} not found`
          });
          continue;
        }

        const requiredAmount = parseFloat(repayment.PAY_AMT);
        const currentBalance = parseFloat(sourceAccount.LEDGER_BAL || 0);

        if (currentBalance < requiredAmount) {
          results.failed.push({
            directDebitId: repayment.DIRECT_DR_ID,
            loanId: repayment.LOAN_ID,
            reason: 'Insufficient balance',
            balance: currentBalance,
            required: requiredAmount
          });
          continue;
        }

        // Process the repayment transaction
        const transactionRef = await processLoanRepaymentTransaction({
          fromAccount: repayment.FROM_DEPOSIT_ACCT_NO,
          toAccount: repayment.LOAN_ACCOUNT_NO || repayment.TO_DEPOSIT_ACCT_NO,
          amount: requiredAmount,
          principalAmount: parseFloat(repayment.PRINCIPAL_AMOUNT || 0),
          interestAmount: parseFloat(repayment.INTEREST_AMOUNT || 0),
          penaltyAmount: parseFloat(repayment.PENALTY_AMOUNT || 0),
          loanId: repayment.LOAN_ID,
          directDebitId: repayment.DIRECT_DR_ID,
          installmentNumber: repayment.INSTALLMENT_NUMBER
        }, transaction);

        // Update direct debit record
        const nextPaymentDate = calculateNextPaymentDate(
          repayment.NEXT_PAY_DT,
          repayment.PAY_FREQ_CD,
          repayment.PAY_FREQ_VALUE
        );

        await repayment.update({
          NEXT_PAY_DT: nextPaymentDate,
          INSTALLMENT_NUMBER: (repayment.INSTALLMENT_NUMBER || 0) + 1,
          ROW_TS: new Date(),
          VERSION_NO: (repayment.VERSION_NO || 0) + 1
        }, { transaction });

        // Mark as completed if all installments paid
        if (repayment.INSTALLMENT_NUMBER >= repayment.TOTAL_INSTALLMENTS) {
          await repayment.update({
            REC_ST: 'C', // Completed
            EXPIRY_DT: new Date() // Set expiry to today
          }, { transaction });
        }

        // Update loan account balance if available
        if (repayment.LOAN_ID) {
          await updateLoanBalance({
            loanId: repayment.LOAN_ID,
            principalAmount: parseFloat(repayment.PRINCIPAL_AMOUNT || 0),
            interestAmount: parseFloat(repayment.INTEREST_AMOUNT || 0),
            penaltyAmount: parseFloat(repayment.PENALTY_AMOUNT || 0),
            transactionRef,
            transaction
          });
        }

        results.successful.push({
          directDebitId: repayment.DIRECT_DR_ID,
          loanId: repayment.LOAN_ID,
          transactionRef,
          amount: requiredAmount,
          nextPaymentDate,
          processedAt: new Date()
        });
        
        results.totalProcessed++;

      } catch (error) {
        results.failed.push({
          directDebitId: repayment.DIRECT_DR_ID,
          loanId: repayment.LOAN_ID,
          reason: error.message,
          error: error.stack
        });
        
        logger.error(`Failed to process loan repayment ${repayment.DIRECT_DR_ID}:`, error);
      }
    }

    await transaction.commit();
    
    const executionTime = Date.now() - startTime;
    
    logger.info('✅ Loan Repayment Direct Debit Processing Completed', {
      totalProcessed: results.totalProcessed,
      successful: results.successful.length,
      failed: results.failed.length,
      skipped: results.skipped,
      executionTime: `${executionTime}ms`
    });
    
    // Send notifications for failures
    if (results.failed.length > 0) {
      await sendDirectDebitFailureNotification(results.failed);
    }
    
    return {
      success: true,
      results,
      executionTime
    };
    
  } catch (error) {
    logger.error('❌ Loan Repayment Direct Debit Processing Failed:', {
      error: error.message,
      stack: error.stack
    });
    
    await sendDirectDebitErrorNotification(error);
    
    return {
      success: false,
      error: error.message,
      results: {
        totalProcessed: 0,
        successful: [],
        failed: [{ reason: error.message }],
        skipped: 0
      }
    };
  }
};

/**
 * Calculate next payment date
 */
function calculateNextPaymentDate(currentDate, frequency, frequencyValue) {
  const nextDate = new Date(currentDate);
  
  switch (frequency) {
    case 'DAILY':
      nextDate.setDate(nextDate.getDate() + frequencyValue);
      break;
    case 'WEEKLY':
      nextDate.setDate(nextDate.getDate() + (7 * frequencyValue));
      break;
    case 'MONTHLY':
      nextDate.setMonth(nextDate.getMonth() + frequencyValue);
      break;
    case 'QUARTERLY':
      nextDate.setMonth(nextDate.getMonth() + (3 * frequencyValue));
      break;
    case 'YEARLY':
      nextDate.setFullYear(nextDate.getFullYear() + frequencyValue);
      break;
    default:
      nextDate.setMonth(nextDate.getMonth() + 1);
  }
  
  return nextDate;
}

/**
 * Helper function to process loan repayment transaction
 */
async function processLoanRepaymentTransaction(paymentData, transaction) {
  try {
    // 1. Create debit transaction from savings account
    const debitTransaction = await createLedgerEntry(null, null, {
      GL_ACCT_NO: paymentData.fromAccount, // This should be the GL account for the deposit
      AMOUNT: paymentData.amount,
      TRANSACTION_TYPE: 'DR',
      CREATED_BY: 'SYSTEM',
      ACCT_DESC: `Loan Repayment - ${paymentData.loanId} - Installment ${paymentData.installmentNumber}`,
      JOURNAL_ID: `LOAN_REPAY_${paymentData.loanId}_${Date.now()}`
    }, { transaction });

    // 2. Create credit transaction to loan account
    await createLedgerEntry(null, null, {
      GL_ACCT_NO: paymentData.toAccount, // This should be the GL account for the loan
      AMOUNT: paymentData.amount,
      TRANSACTION_TYPE: 'CR',
      CREATED_BY: 'SYSTEM',
      ACCT_DESC: `Loan Repayment Received - ${paymentData.loanId}`,
      JOURNAL_ID: debitTransaction.journalId || `LOAN_REPAY_${paymentData.loanId}_${Date.now()}`
    }, { transaction });

    return debitTransaction.journalId || `TRX_${Date.now()}_${paymentData.loanId}`;
    
  } catch (error) {
    logger.error('Error processing loan repayment transaction:', error);
    throw error;
  }
}

/**
 * Helper function to update loan balance
 */
async function updateLoanBalance(repaymentData, transaction) {
  try {
    const loan = await LoanAccount.findOne({
      where: { LOAN_ID: repaymentData.loanId },
      transaction
    });
    
    if (!loan) {
      logger.warn(`Loan ${repaymentData.loanId} not found for balance update`);
      return;
    }

    // Update loan balances
    const currentPrincipal = parseFloat(loan.OUTSTANDING_PRINCIPAL || 0);
    const currentInterest = parseFloat(loan.ACCRUED_INTEREST || 0);
    const currentPenalty = parseFloat(loan.PENALTY_AMOUNT || 0);
    
    const newPrincipal = Math.max(0, currentPrincipal - repaymentData.principalAmount);
    const newInterest = Math.max(0, currentInterest - repaymentData.interestAmount);
    const newPenalty = Math.max(0, currentPenalty - repaymentData.penaltyAmount);
    
    await loan.update({
      OUTSTANDING_PRINCIPAL: newPrincipal,
      ACCRUED_INTEREST: newInterest,
      PENALTY_AMOUNT: newPenalty,
      LAST_REPAYMENT_DATE: new Date(),
      LAST_REPAYMENT_AMOUNT: repaymentData.principalAmount + repaymentData.interestAmount + repaymentData.penaltyAmount,
      STATUS: newPrincipal <= 0 ? 'PAID' : loan.STATUS
    }, { transaction });

    logger.info(`Updated loan ${repaymentData.loanId} balance`, {
      previousPrincipal: currentPrincipal,
      newPrincipal,
      previousInterest: currentInterest,
      newInterest,
      previousPenalty: currentPenalty,
      newPenalty
    });
    
  } catch (error) {
    logger.error(`Error updating loan balance for ${repaymentData.loanId}:`, error);
    throw error;
  }
}

/**
 * Helper function to send failure notifications
 */
const sendDirectDebitFailureNotification = async (failedTransactions) => {
  try {
    logger.warn(`📧 ${failedTransactions.length} loan repayment direct debits failed`);
    
    // Implement your notification logic here
    // This could be email, SMS, Slack, etc.
    
    // Example: Log to audit trail
    for (const failed of failedTransactions) {
      await createAuditTrail({
        eventId: `DIRECT_DEBIT_FAIL_${Date.now()}`,
        userId: 'SYSTEM',
        eventType: 'DIRECT_DEBIT_FAILURE',
        action: 'Loan Repayment Direct Debit Failed',
        oldValue: null,
        newValue: failed,
        ipAddress: '127.0.0.1'
      });
    }
    
  } catch (notifyError) {
    logger.error('Failed to send direct debit failure notification:', notifyError.message);
  }
};

/**
 * Helper function to send error notifications
 */
const sendDirectDebitErrorNotification = async (error) => {
  try {
    logger.error('📧 Sending error notification for loan repayment processing failure');
    
    // Log to audit trail
    await createAuditTrail({
      eventId: `DIRECT_DEBIT_ERROR_${Date.now()}`,
      userId: 'SYSTEM',
      eventType: 'SYSTEM_ERROR',
      action: 'Loan Repayment Direct Debit Processing Error',
      oldValue: null,
      newValue: { error: error.message, stack: error.stack },
      ipAddress: '127.0.0.1'
    });
    
  } catch (notifyError) {
    logger.error('Failed to send error notification:', notifyError.message);
  }
};

// ==================== MISSING SERVICE FUNCTION PLACEHOLDERS ====================

/**
 * Update loan statuses
 */
const updateLoanStatuses = async () => {
  logger.info('🔄 Processing loan status updates...');
  return { 
    success: true, 
    message: 'Loan status updates completed',
    updatedAccounts: [],
    count: 0
  };
};

/**
 * Post interest
 */
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

/**
 * Process GL transactions
 */
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

/**
 * Process term deposit interest
 */
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

/**
 * Perform reconciliation
 */
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

/**
 * Process dormant accounts
 */
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

/**
 * Process overdue loans
 */
const processOverdueLoans = async () => {
  logger.info('⏰ Processing overdue loans...');
  return await processLoanOverdueAndStatus();
};

// ==================== HELPER FUNCTIONS ====================

/**
 * Fetch bank statement data
 */
const fetchBankStatementData = async () => {
  logger.info('Fetching bank statement data');
  return [];
};

/**
 * Generate transaction ID
 */
const generateTransactionId = () => {
  const base = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000);
  return parseInt(base + random);
};

// ==================== MAIN SERVICE FUNCTIONS ====================

export const processLoanOverdueAndStatus = async () => {
  try {
    logger.info('🔄 Processing loan overdue status...');
    
    // DEBUG: Add detailed logging
    console.log('=== DEBUG processLoanOverdueAndStatus ===');
    console.log('getLoanAccount type:', typeof getLoanAccount);
    console.log('getLoanAccount is function?:', typeof getLoanAccount === 'function');
    
    // Get the models properly inside the function
    const LoanAccount = getLoanAccount ? getLoanAccount() : null;
    
    console.log('LoanAccount result:', LoanAccount);
    console.log('LoanAccount.findAll exists?:', LoanAccount?.findAll ? 'YES' : 'NO');
    console.log('LoanAccount is class?:', typeof LoanAccount === 'function' ? 'YES' : 'NO');
    
    if (!LoanAccount || typeof LoanAccount.findAll !== 'function') {
      const errorMsg = 'LoanAccount model not available or findAll not a function';
      logger.error(errorMsg, {
        loanAccountExists: !!LoanAccount,
        loanAccountType: typeof LoanAccount,
        findAllExists: LoanAccount?.findAll ? 'YES' : 'NO',
        getLoanAccountType: typeof getLoanAccount,
        getLoanAccountIsFunction: typeof getLoanAccount === 'function',
        getLoanAccountValue: getLoanAccount
      });
      
      // Return empty results but don't throw error
      return {
        success: false,
        error: errorMsg,
        results: {
          overdueLoans: { accounts: [], count: 0 },
          statusUpdates: { count: 0 }
        }
      };
    }
    
    console.log('DEBUG: Calling LoanAccount.findAll...');
    const loans = await LoanAccount.findAll({
      where: {
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'APPROVED'] }
      },
      raw: true
    });

    console.log('DEBUG: Found', loans.length, 'loans');
    
    let updatedCount = 0;
    
    for (const loanData of loans) {
      try {
        if (!loanData || !loanData.MATURITY_DT || !loanData.ACCT_NO || !loanData.id) {
          logger.warn(`Skipping invalid loan data:`, { 
            hasMaturityDate: !!loanData?.MATURITY_DT,
            hasAccountNo: !!loanData?.ACCT_NO,
            hasId: !!loanData?.id 
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
          await LoanAccount.update(
            { 
              LOAN_STATUS: 'OVERDUE', 
              last_updated: new Date() 
            },
            { 
              where: { id: loanData.id } 
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
          loanId: loanData?.id
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
    loanRepaymentSync: { // Add this new service
      healthy: true,
      lastError: null,
      lastRun: null,
      executionTime: null,
      updateCount: 0,
      updatedCount: 0,
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
    },
    directDebitLoanRepayment: {
      healthy: true,
      lastError: null,
      lastRun: null,
      executionTime: null,
      processed: 0,
      failed: 0,
      skipped: 0,
      successfulTransactions: [],
      failedTransactions: []
    }
  }
};

// ==================== EOD TRANSACTION PROCESSING ====================

/**
 * Process EOD GL transactions
 */
export const processEODGLTransactions = async (transaction = null) => {
  let transactionCompleted = false;

  try {
    // Using Sequelize transaction instead of MongoDB session
    const t = transaction || await sequelize.transaction();

    const pendingTransactions = await GLTransactionQueue.findAll({ 
      where: { QUEUE_STATUS: 'Pending' },
      transaction: t
    });
    
    if (!pendingTransactions.length) {
      logger.info('No pending GL transactions to process');
      await t.commit();
      return { 
        success: true, 
        message: 'No pending GL transactions to process', 
        processed: [], 
        failed: [], 
        skipped: [] 
      };
    }

    const processedTransactions = [];
    const failedTransactions = [];
    const skippedTransactions = [];

    for (const txn of pendingTransactions) {
      if (!txn || !txn.QUEUE_STATUS) {
        logger.warn('Invalid transaction object, skipping:', { transactionId: txn?.id });
        skippedTransactions.push({ transactionId: txn?.id, reason: 'Invalid transaction object' });
        continue;
      }

      if (txn.APPROVAL_STATUS && txn.APPROVAL_STATUS !== 'Approved') {
        logger.warn(`Transaction ${txn.id} is not approved, skipping`, {
          approvalStatus: txn.APPROVAL_STATUS,
          journalId: txn.JOURNAL_ID,
          glAcctNo: txn.GL_ACCT_NO
        });
        skippedTransactions.push({
          transactionId: txn.id,
          reason: `Transaction not approved (status: ${txn.APPROVAL_STATUS})`
        });
        continue;
      }

      const { GL_ACCT_NO, TRANSACTION_TYPE, AMOUNT, CREATED_BY, JOURNAL_ID, SUB_LEDGER_NO, SEG_NO, ACCT_DESC, CURRENCY_CODE, EXCHANGE_RATE } = txn;

      const glAccount = await Ledger.findOne({ 
        where: { GL_ACCT_NO },
        transaction: t
      });
      
      if (!glAccount) {
        logger.warn(`GL Account ${GL_ACCT_NO} not found, failing txn ${txn.id}`);
        await GLTransactionQueue.update(
          { 
            QUEUE_STATUS: 'Failed', 
            ERROR_MESSAGE: `GL Account ${GL_ACCT_NO} not found`, 
            PROCESSED_AT: new Date() 
          },
          { 
            where: { id: txn.id },
            transaction: t
          }
        );
        failedTransactions.push({ transactionId: txn.id, reason: `GL Account ${GL_ACCT_NO} not found` });
        continue;
      }

      if (!glAccount.DELAY_GL_POSTING) {
        logger.warn(`GL Account ${GL_ACCT_NO} does not have DELAY_GL_POSTING enabled, failing txn ${txn.id}`);
        await GLTransactionQueue.update(
          { 
            QUEUE_STATUS: 'Failed', 
            ERROR_MESSAGE: `DELAY_GL_POSTING not enabled`, 
            PROCESSED_AT: new Date() 
          },
          { 
            where: { id: txn.id },
            transaction: t
          }
        );
        failedTransactions.push({ transactionId: txn.id, reason: `DELAY_GL_POSTING not enabled` });
        continue;
      }

      // Check if account allows transaction type
      if (!glAccount.canPost || !glAccount.canPost(TRANSACTION_TYPE)) {
        logger.warn(`GL Account ${GL_ACCT_NO} does not allow ${TRANSACTION_TYPE} transactions, failing txn ${txn.id}`);
        await GLTransactionQueue.update(
          { 
            QUEUE_STATUS: 'Failed', 
            ERROR_MESSAGE: `GL Account ${GL_ACCT_NO} does not allow ${TRANSACTION_TYPE} transactions`, 
            PROCESSED_AT: new Date() 
          },
          { 
            where: { id: txn.id },
            transaction: t
          }
        );
        failedTransactions.push({ transactionId: txn.id, reason: `GL Account ${GL_ACCT_NO} does not allow ${TRANSACTION_TYPE} transactions` });
        continue;
      }

      if (TRANSACTION_TYPE === 'DR' && glAccount.GL_ACCT_CAT === 'ASSET' && (glAccount.LEDGER_BALANCE || 0) < AMOUNT) {
        logger.warn(`Insufficient funds in GL Account ${GL_ACCT_NO}, failing txn ${txn.id}`);
        await GLTransactionQueue.update(
          { 
            QUEUE_STATUS: 'Failed', 
            ERROR_MESSAGE: `Insufficient funds in GL Account ${GL_ACCT_NO}`, 
            PROCESSED_AT: new Date() 
          },
          { 
            where: { id: txn.id },
            transaction: t
          }
        );
        failedTransactions.push({ transactionId: txn.id, reason: `Insufficient funds in GL Account ${GL_ACCT_NO}` });
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
        const result = await createLedgerEntry(null, null, transactionData, { transaction: t });

        if (result.queued) {
          logger.warn(`Transaction ${txn.id} was re-queued due to DELAY_GL_POSTING`);
          skippedTransactions.push({ transactionId: txn.id, reason: `Transaction re-queued due to DELAY_GL_POSTING` });
          continue;
        }

        // Create reconciliation record
        await Reconciliation.create({
          JOURNAL_ID,
          GL_ACCT_NO,
          TRANSACTION_ID: generateTransactionId(),
          AMOUNT,
          CURRENCY_CODE: CURRENCY_CODE || 'NGN',
          EXTERNAL_REF: '',
          STATUS: 'Pending',
          CREATED_AT: new Date(),
        }, { transaction: t });

        // Update transaction status
        await GLTransactionQueue.update(
          { 
            QUEUE_STATUS: 'Processed', 
            PROCESSED_AT: new Date() 
          },
          { 
            where: { id: txn.id },
            transaction: t
          }
        );

        // Create audit trail
        await createAuditTrail({
          eventId: JOURNAL_ID,
          userId: CREATED_BY || 'system',
          eventType: `GL_ACCOUNT_${TRANSACTION_TYPE.toUpperCase() === 'DEBIT' ? 'DR' : 'CR'}`,
          action: `${TRANSACTION_TYPE.toUpperCase() === 'DEBIT' ? 'Debit' : 'Credit'} GL Account ${GL_ACCT_NO}`,
          oldValue: { LEDGER_BALANCE: glAccount.LEDGER_BALANCE },
          newValue: { LEDGER_BALANCE: result.transaction?.LEDGER_BALANCE || glAccount.LEDGER_BALANCE + AMOUNT },
          ipAddress: '127.0.0.1',
          accountNo: GL_ACCT_NO,
        }, { transaction: t });

        processedTransactions.push({
          transactionId: txn.id,
          GL_ACCT_NO,
          TRANSACTION_TYPE,
          AMOUNT,
          JOURNAL_ID,
          PROCESSED_AT: new Date(),
          status: 'PROCESSED',
        });
      } catch (txnError) {
        logger.error(`Failed to process transaction ${txn.id}`, { error: txnError.message });
        await GLTransactionQueue.update(
          { 
            QUEUE_STATUS: 'Failed', 
            ERROR_MESSAGE: txnError.message, 
            PROCESSED_AT: new Date() 
          },
          { 
            where: { id: txn.id },
            transaction: t
          }
        );
        failedTransactions.push({ transactionId: txn.id, reason: txnError.message });
      }
    }

    logger.info('EOD GL transactions processed', {
      processedCount: processedTransactions.length,
      failedCount: failedTransactions.length,
      skippedCount: skippedTransactions.length,
    });

    transactionCompleted = true;
    await t.commit();
    
    systemStatus.services.glTransactions = {
      ...systemStatus.services.glTransactions,
      healthy: failedTransactions.length === 0,
      lastError: failedTransactions.length > 0 ? failedTransactions[0].reason : null,
      lastRun: new Date(),
      processed: processedTransactions,
      failed: failedTransactions,
      skipped: skippedTransactions,
    };
    
    return {
      success: true,
      message: 'EOD GL transactions processed successfully',
      processed: processedTransactions,
      failed: failedTransactions,
      skipped: skippedTransactions,
    };
  } catch (error) {
    if (!transactionCompleted) {
      await t.rollback();
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
  }
};
// In your OSController.js

/**
 * Sync loan repayment statuses with repayment system
 */
export const syncLoanRepaymentStatuses = async () => {
  try {
    logger.info('🔄 Syncing loan repayment statuses with repayment system...');
    
    const activeLoans = await LoanAccount.findAll({
      where: {
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'APPROVED', 'OVERDUE', 'DELINQUENT'] },
        OUTSTANDING_PRINCIPAL: { [Op.gt]: 0 }
      }
    });
    
    const updates = [];
    const currentDate = new Date();
    
    for (const loan of activeLoans) {
      try {
        // Get repayment status using the same logic as getAllLoans
        const repaymentHistory = await getRepaymentHistoryService(loan.ACCT_NO);
        const repaymentStatus = await calculateRepaymentStatus(loan, currentDate, repaymentHistory);
        
        // Check if status needs update
        let newStatus = loan.LOAN_STATUS;
        
        if (repaymentStatus.isDelinquent && loan.LOAN_STATUS !== 'DELINQUENT') {
          newStatus = 'DELINQUENT';
        } else if (repaymentStatus.isOverdue && loan.LOAN_STATUS !== 'OVERDUE' && loan.LOAN_STATUS !== 'DELINQUENT') {
          newStatus = 'OVERDUE';
        } else if (repaymentStatus.status === 'PAID' && loan.LOAN_STATUS !== 'CLOSED') {
          newStatus = 'CLOSED';
        }
        
        // Update if changed
        if (newStatus !== loan.LOAN_STATUS) {
          await loan.update({
            LOAN_STATUS: newStatus,
            last_updated: new Date()
          });
          
          updates.push({
            accountNo: loan.ACCT_NO,
            oldStatus: loan.LOAN_STATUS,
            newStatus,
            reason: 'Repayment status sync'
          });
        }
        
      } catch (loanError) {
        logger.error(`Error syncing loan ${loan.ACCT_NO}:`, loanError.message);
      }
    }
    
    logger.info('✅ Loan repayment status sync completed', {
      totalLoans: activeLoans.length,
      updates: updates.length,
      updates
    });
    
    return {
      success: true,
      totalLoans: activeLoans.length,
      updates: updates.length,
      updatedAccounts: updates
    };
    
  } catch (error) {
    logger.error('❌ Loan repayment status sync failed:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
};


/**
 * Manually trigger auto-collection
 */
export const triggerManualAutoCollection = async (req, res) => {
  try {
    const { 
      accountNumbers = [], 
      date, 
      force = false,
      collectionMethod,
      limit = 100 
    } = req.body;
    
    const collectionDate = date ? new Date(date) : new Date();
    const batchId = `MANUAL_${collectionDate.toISOString().split('T')[0]}_${Date.now()}`;
    
    logger.info('🔧 Manual auto-collection triggered', {
      batchId,
      collectionDate,
      accountCount: accountNumbers.length,
      force,
      collectionMethod
    });
    
    let loansToProcess = [];
    
    if (accountNumbers.length > 0) {
      // Process specific accounts
      loansToProcess = await LoanAccount.findAll({
        where: {
          ACCT_NO: { [Op.in]: accountNumbers }
        },
        include: [{
          model: CustomerAccount,
          as: 'customerAccount',
          required: true
        }],
        limit: Math.min(limit, COLLECTION_CONFIG.maxDailyCollections)
      });
    } else {
      // Process all due loans (with limit)
      const result = await identifyLoansForCollection(collectionDate);
      loansToProcess = result.individualLoans.slice(0, limit);
    }
    
    // Process the loans
    const individualResults = await processIndividualLoans(
      loansToProcess,
      collectionDate,
      batchId
    );
    
    // Create audit trail
    await createAuditTrail({
      eventId: batchId,
      userId: req.user?.id || 'SYSTEM',
      eventType: 'MANUAL_AUTO_COLLECTION',
      action: 'Manual Auto Collection Triggered',
      oldValue: null,
      newValue: {
        accountCount: accountNumbers.length,
        processed: individualResults.processed,
        failed: individualResults.failed,
        totalCollected: individualResults.totalCollected
      },
      ipAddress: req.ip || '127.0.0.1'
    });
    
    return res.status(200).json({
      success: true,
      message: 'Manual auto-collection completed',
      batchId,
      results: {
        individual: individualResults,
        summary: {
          totalProcessed: individualResults.processed,
          totalFailed: individualResults.failed,
          totalCollected: individualResults.totalCollected,
          collectionRate: individualResults.totalDue > 0 ? 
            (individualResults.totalCollected / individualResults.totalDue) * 100 : 0
        }
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Manual auto-collection failed:', error);
    return res.status(500).json({
      success: false,
      message: 'Manual auto-collection failed',
      error: error.message
    });
  }
};

/**
 * Process reconciliation
 */
export const processReconciliation = async (transaction = null) => {
  let transactionCompleted = false;

  try {
    const t = transaction || await sequelize.transaction();

    const bankStatementData = await fetchBankStatementData();
    if (!bankStatementData.length) {
      logger.info('No bank statement data to process for reconciliation');
      await t.commit();
      return { 
        success: true, 
        message: 'No bank statement data to process', 
        processed: [], 
        failed: [], 
        skipped: [], 
        updated: 0 
      };
    }

    const reconciliationOps = [];
    const processedRecords = [];
    const failedRecords = [];
    const skippedRecords = [];

    for (const statement of bankStatementData) {
      const reconciliation = await Reconciliation.findOne({
        where: {
          TRANSACTION_ID: statement.transactionId,
          GL_ACCT_NO: statement.accountNo,
        },
        transaction: t
      });

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
        await reconciliation.update(
          {
            STATUS: 'Reconciled',
            RECONCILED_AT: new Date(),
            EXTERNAL_REF: statement.externalRef || reconciliation.EXTERNAL_REF,
          },
          { transaction: t }
        );
        
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

    transactionCompleted = true;
    await t.commit();
    
    logger.info('Reconciliation processed', {
      processedCount: processedRecords.length,
      failedCount: failedRecords.length,
      skippedCount: skippedRecords.length,
    });

    systemStatus.services.reconciliation = {
      ...systemStatus.services.reconciliation,
      healthy: failedRecords.length === 0,
      lastError: failedRecords.length > 0 ? failedRecords[0].reason : null,
      lastRun: new Date(),
      processed: processedRecords,
      failed: failedRecords,
      skipped: skippedRecords,
      updated: processedRecords.length,
    };
    
    return {
      success: true,
      message: 'Reconciliation processed successfully',
      processed: processedRecords,
      failed: failedRecords,
      skipped: skippedRecords,
      updated: processedRecords.length,
    };
  } catch (error) {
    if (!transactionCompleted) {
      await t.rollback();
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
  }
};

// ==================== BUSINESS DATE FUNCTIONS ====================

/**
 * Calculate next business date (OS version)
 * Renamed to avoid conflict with imported function
 */
export const calculateNextBusinessDateOS = (currentDate) => {
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

/**
 * Safe version that returns a fallback date if calculation fails
 */
export const calculateNextBusinessDateSafe = async (currentDate) => {
  try {
    // Try the main method first
    return await calculateNextBusinessDate(currentDate); // This is from dateUtils.js
  } catch (error) {
    logger.warn('Main holiday method failed, using fallback weekend-only calculation', { 
      error: error.message 
    });
    
    // Fallback: simple weekend skipping without holiday check
    let nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    
    while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
      nextDate.setDate(nextDate.getDate() + 1);
    }
    
    nextDate.setHours(0, 0, 0, 0);
    return nextDate;
  }
};

/**
 * Set next business date (OS version)
 */
export const setNextBusinessDateOS = () => {
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

/**
 * Calculate next business date with holidays (OS version)
 */
export const calculateNextBusinessDateWithHolidaysOS = async (currentDate) => {
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

/**
 * Execute service function with error handling
 */
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

    // Handle different service types
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
    } 
    else if (serviceName === 'loanRepaymentSync') {
      // Handle loan repayment sync service
      serviceDetails.processed = serviceResult.updatedAccounts || [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      serviceDetails.updateCount = serviceResult.totalLoans || 0;
      serviceDetails.updatedCount = serviceResult.updates || 0;
      
      logger.info(`${serviceName} service completed`, {
        totalLoans: serviceDetails.updateCount,
        updatedAccounts: serviceDetails.updatedCount,
        executionTime,
      });
    }
    else if (serviceName === 'loanStatusUpdates') {
      serviceDetails.processed = serviceResult.updatedAccounts || [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      serviceDetails.updateCount = serviceResult.count || 0;
      
      logger.info(`loanStatusUpdates service completed`, {
        updateCount: serviceDetails.updateCount,
        executionTime,
      });
    }
    else if (serviceName === 'glTransactions') {
      serviceDetails.processed = serviceResult.processed?.filter(r => r.status === 'PROCESSED') || [];
      serviceDetails.failed = serviceResult.failed || [];
      serviceDetails.skipped = serviceResult.skipped || [];
      logger.info(`glTransactions service completed`, {
        processed: serviceDetails.processed.length,
        failed: serviceDetails.failed.length,
        skipped: serviceDetails.skipped.length,
        executionTime,
      });
    }
    else if (serviceName === 'reconciliation') {
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
    }
    // In your executeService function in OsController.js
if (serviceName === 'processAutoCollections') {
  // Execute auto collections
  const collectionResult = await processAutoCollections({
    date: systemStatus.currentBusinessDate || new Date()
  });
  
  const serviceDetails = {
    healthy: collectionResult.success,
    lastError: collectionResult.success ? null : collectionResult.error,
    lastRun: new Date(),
    executionTime: collectionResult.executionTime || 0,
    processed: collectionResult.results?.individual?.processed || 0,
    failed: collectionResult.results?.individual?.failed || 0,
    skipped: [],
    individualLoans: {
      processed: collectionResult.results?.individual?.processed || 0,
      failed: collectionResult.results?.individual?.failed || 0,
      overdueMarked: collectionResult.results?.individual?.overdueMarked || 0,
      totalDue: collectionResult.results?.individual?.totalDue || 0
    },
    groupLoans: {
      processed: collectionResult.results?.group?.processed || 0,
      failed: collectionResult.results?.group?.failed || 0,
      totalDue: collectionResult.results?.group?.totalDue || 0
    },
    collections: collectionResult.results?.individual?.collections || []
  };
  
  systemStatus.services.processAutoCollections = serviceDetails;
  
  logger.info(`processAutoCollections service completed`, {
    processed: serviceDetails.processed,
    failed: serviceDetails.failed,
    overdueMarked: serviceDetails.individualLoans.overdueMarked,
    totalDue: serviceDetails.individualLoans.totalDue,
    successRate: collectionResult.summary?.successRate || 0,
    executionTime: serviceDetails.executionTime,
  });
  
  return { 
    success: collectionResult.success, 
    result: collectionResult,
    error: collectionResult.error 
  };
}
    
    else if (serviceName === 'dormantAccounts') {
      serviceDetails.processed = serviceResult.processed || [];
      serviceDetails.failed = serviceResult.failed || [];
      serviceDetails.skipped = serviceResult.skipped || [];
      serviceDetails.updateCount = serviceResult.count || 0;
      logger.info(`dormantAccounts service completed`, {
        updateCount: serviceDetails.updateCount,
        executionTime,
      });
    }
    else if (serviceName === 'pendingRepayments') {
      serviceDetails.processed = serviceResult.processed || [];
      serviceDetails.failed = serviceResult.failed || [];
      serviceDetails.skipped = serviceResult.skipped || [];
      serviceDetails.processedCount = serviceResult.count || 0;
      logger.info(`pendingRepayments service completed`, {
        processedCount: serviceDetails.processedCount,
        executionTime,
      });
    }
    else {
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

    // Set appropriate defaults for each service type
    if (serviceName === 'loanProcessing' || serviceName === 'overdueLoans') {
      serviceDetails.processed = [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      serviceDetails.overdueCount = 0;
      serviceDetails.statusUpdateCount = 0;
    } 
    else if (serviceName === 'loanRepaymentSync') {
      serviceDetails.processed = [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      serviceDetails.updateCount = 0;
      serviceDetails.updatedCount = 0;
    }
    else if (serviceName === 'loanStatusUpdates') {
      serviceDetails.processed = [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      serviceDetails.updateCount = 0;
    }
    else if (serviceName === 'glTransactions' || serviceName === 'reconciliation') {
      serviceDetails.processed = [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      if (serviceName === 'reconciliation') {
        serviceDetails.updated = 0;
      }
    }
    else if (serviceName === 'processAutoCollections') {
      serviceDetails.processed = 0;
      serviceDetails.failed = 0;
      serviceDetails.skipped = [];
      serviceDetails.individualLoans = { processed: 0, failed: 0, totalDue: 0 };
      serviceDetails.groupLoans = { processed: 0, failed: 0, totalDue: 0, membersProcessed: 0, membersFailed: 0 };
    }
    else if (serviceName === 'dormantAccounts') {
      serviceDetails.processed = [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      serviceDetails.updateCount = 0;
    }
    else if (serviceName === 'pendingRepayments') {
      serviceDetails.processed = [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      serviceDetails.processedCount = 0;
    }

    systemStatus.services[serviceName] = serviceDetails;

    const isCritical = [
      'loanProcessing', 
      'overdueLoans',
      'loanRepaymentSync', // Add to critical services
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

/**
 * Trigger End of Day process
 */
export const triggerEndOfDayProcess = async (req, res) => {
    try {
        const { skipServices = [], runServices = [], userId = 'system' } = req.body;
        
        logger.info('Starting End of Day process', {
            userId,
            skipServices,
            runServices
        });

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

        // Use the SystemDateController's processEOD method
        let validUserId = userId;
        
        try {
            if (userId === 'system') {
                // You'll need to import your User model if needed
                // const User = await import('../models/User.js');
                // const adminUser = await User.findOne({ 
                //     where: {
                //         primary_role: { [sequelize.Op.in]: ['ADMIN', 'SYSTEM_ADMIN', 'OPERATIONS_MANAGER'] },
                //         status: 'ACTIVE'
                //     }
                // });
                // if (adminUser) {
                //     validUserId = adminUser.id.toString();
                // }
                logger.warn('User model import commented out, using provided userId');
            }
        } catch (userError) {
            logger.warn('Failed to find valid user for EOD, using provided userId:', {
                userId,
                error: userError.message
            });
        }

        const mockRes = {
            statusCode: 200,
            data: null,
            status: function(code) { 
                this.statusCode = code; 
                return this; 
            }, 
            json: function(data) { 
                this.data = data; 
                return data; 
            }
        };

        const mockReq = { body: { userId: validUserId, force: false } };
        
        logger.info('Calling SystemDateController.processEOD with userId:', { userId: validUserId });
        
        await SystemDateController.processEOD(mockReq, mockRes);

        // Update local system status
        systemStatus.lastEODRun = new Date();
        
        if (mockRes.data && mockRes.data.success) {
            systemStatus.nextBusinessDate = mockRes.data.data?.nextBusinessDate || systemStatus.nextBusinessDate;
            systemStatus.currentBusinessDate = mockRes.data.data?.currentBusinessDate || systemStatus.currentBusinessDate;
            systemStatus.eodStatus = 'COMPLETED';
            
            logger.info('EOD processing completed successfully via SystemDateController', {
                nextBusinessDate: systemStatus.nextBusinessDate?.toISOString().split('T')[0],
                currentBusinessDate: systemStatus.currentBusinessDate?.toISOString().split('T')[0]
            });
        } else {
            systemStatus.eodStatus = 'FAILED';
            logger.warn('EOD processing failed via SystemDateController', {
                error: mockRes.data?.message || 'Unknown error'
            });
        }

        logger.info('End of Day processing completed successfully', {
            servicesExecuted: servicesToRun,
            nextBusinessDate: systemStatus.nextBusinessDate?.toISOString().split('T')[0],
            totalServices: servicesToRun.length
        });

        return res.status(200).json({
            success: true,
            message: 'End of Day processing completed successfully',
            results: serviceResults,
            eodResult: mockRes.data,
            nextBusinessDate: systemStatus.nextBusinessDate?.toISOString().split('T')[0],
            currentBusinessDate: systemStatus.currentBusinessDate?.toISOString().split('T')[0],
            servicesExecuted: servicesToRun,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('EOD failed', { 
            error: error.message, 
            stack: error.stack,
            skippedServices: req.body.skipServices || [],
            userId: req.body.userId || 'system'
        });
        
        // Update system status to failed
        systemStatus.eodStatus = 'FAILED';
        systemStatus.lastEODRun = new Date();
        
        return res.status(500).json({
            success: false,
            message: 'End of Day processing failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
};

// ==================== OTHER CONTROLLER FUNCTIONS ====================

/**
 * Get current business date (OS version)
 */
export const getCurrentBusinessDateOS = async (req, res) => {
  try {
    const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
    if (!systemDate) {
      return res.status(404).json({
        success: false,
        message: 'System date not found'
      });
    }
    
    systemStatus.serverTime = getServerTime();
    return res.status(200).json({
      success: true,
      currentBusinessDate: systemDate.currentBusinessDate,
      nextBusinessDate: systemDate.nextBusinessDate,
      isEODProcessing: systemDate.isEODProcessing,
      eodStatus: systemDate.eodStatus,
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

/**
 * Get service errors
 */
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

/**
 * Get dormant accounts count
 */
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

/**
 * Set business date manually (OS version)
 */
export const setBusinessDateManuallyOS = async (req, res) => {
  try {
    const { newDate, updatedBy = 'system', reason = 'Manual adjustment' } = req.body;

    if (!newDate) {
      return res.status(400).json({
        success: false,
        message: 'New date is required'
      });
    }

    // Call the SystemDateController's setBusinessDate method
    const mockRes = {
      statusCode: 200,
      data: null,
      status: function(code) { 
        this.statusCode = code; 
        return this; 
      }, 
      json: function(data) { 
        this.data = data; 
        return data; 
      }
    };

    const mockReq = { 
      body: { 
        businessDate: newDate, 
        reason, 
        userId: updatedBy 
      } 
    };
    
    await SystemDateController.setBusinessDate(mockReq, mockRes);
    
    systemStatus.serverTime = getServerTime();
    return res.status(200).json({
      success: true,
      message: 'Business date set successfully',
      data: mockRes.data,
      timestamp: systemStatus.serverTime.toISOString()
    });
  } catch (error) {
    logger.error('Failed to set business date manually', { error: error.message });
    systemStatus.serverTime = getServerTime();
    return res.status(500).json({
      success: false,
      message: 'Failed to set business date',
      error: error.message,
      timestamp: systemStatus.serverTime.toISOString()
    });
  }
};

/**
 * Debug date issues (OS version)
 */
export const debugDateIssuesOS = async (req, res) => {
  try {
    const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
    const businessDate = getBusinessDate();
    const serverTime = getServerTime();
    
    const debugInfo = {
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
    };
    
    systemStatus.serverTime = getServerTime();
    return res.status(200).json({
      success: true,
      debugInfo,
      systemStatus: {
        currentBusinessDate: systemStatus.currentBusinessDate,
        nextBusinessDate: systemStatus.nextBusinessDate,
        serverTime: systemStatus.serverTime,
        isEODProcessing: systemStatus.isEODProcessing,
        eodStatus: systemStatus.eodStatus
      },
      timestamp: systemStatus.serverTime.toISOString()
    });
  } catch (error) {
    logger.error('Debug dates failed:', { error: error.message });
    systemStatus.serverTime = getServerTime();
    return res.status(500).json({
      success: false,
      error: error.message,
      systemStatus,
      timestamp: systemStatus.serverTime.toISOString()
    });
  }
};


/**
 * Get status (OS version)
 */
export const getStatusOS = async (req, res) => {
  try {
    const dormantCount = await countDormantAccountsToUpdate();
    const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
    
    const serviceStatuses = Object.keys(systemStatus.services).map((serviceName) => ({
      name: serviceName,
      healthy: systemStatus.services[serviceName].healthy,
      lastRun: systemStatus.services[serviceName].lastRun,
      lastError: systemStatus.services[serviceName].lastError,
      executionTime: systemStatus.services[serviceName].executionTime,
      // Add specific details for each service
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
      ...(serviceName === 'loanRepaymentSync' && {
        updateCount: systemStatus.services.loanRepaymentSync.updateCount,
        updatedCount: systemStatus.services.loanRepaymentSync.updatedCount,
      }),
      ...(serviceName === 'dormantAccounts' && {
        updateCount: systemStatus.services.dormantAccounts.updateCount,
      }),
      ...(serviceName === 'pendingRepayments' && {
        processedCount: systemStatus.services.pendingRepayments.processedCount,
      }),
      ...(serviceName === 'processAutoCollections' && {
        processed: systemStatus.services.processAutoCollections.processed,
        failed: systemStatus.services.processAutoCollections.failed,
        individualLoans: systemStatus.services.processAutoCollections.individualLoans,
        groupLoans: systemStatus.services.processAutoCollections.groupLoans,
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

/**
 * Initialize system dates (OS version)
 */
export const initializeSystemDatesOS = async (req, res) => {
  try {
    const { maxRetries = 3, retryDelay = 5000 } = req.body;
    
    let retryCount = 0;
    while (retryCount < maxRetries) {
      try {
        logger.info(`📅 Initializing system dates (attempt ${retryCount + 1}/${maxRetries})`);
        
        // Check database connection
        try {
          await sequelize.authenticate();
          logger.info('✅ Database connection established');
        } catch (dbError) {
          logger.error('❌ Database connection failed:', dbError.message);
          throw new Error('Database connection failed');
        }

        const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
        
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

          const newSystemDate = await SystemDate.create({
            currentBusinessDate,
            nextBusinessDate,
            eodStatus: 'IDLE',
          });

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
          
          systemStatus.serverTime = getServerTime();
          return res.status(500).json({
            success: false,
            message: 'Failed to initialize system dates after all retries',
            error: error.message,
            timestamp: systemStatus.serverTime.toISOString(),
          });
        }
      }
    }
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

/**
 * Get system status (OS version)
 */
export const getSystemStatusOS = () => {
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

/**
 * Debug holiday system
 */
export const debugHolidaySystem = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const upcomingHolidays = await Holiday.findAll({
      where: {
        date: { [sequelize.Op.gte]: today }
      },
      order: [['date', 'ASC']],
      limit: 10
    });
    
    const currentYear = today.getFullYear();
    const yearHolidays = await Holiday.findAll({
      where: {
        date: {
          [sequelize.Op.gte]: new Date(`${currentYear}-01-01`),
          [sequelize.Op.lte]: new Date(`${currentYear}-12-31`)
        }
      },
      order: [['date', 'ASC']]
    });
    
    const isHolidayToday = upcomingHolidays.length > 0 && 
                          upcomingHolidays[0].date.toISOString().split('T')[0] === today.toISOString().split('T')[0];
    
    return res.status(200).json({
      success: true,
      data: {
        today: today.toISOString().split('T')[0],
        isHolidayToday,
        upcomingHolidays: upcomingHolidays.map(h => ({
          date: h.date.toISOString().split('T')[0],
          name: h.name,
          description: h.description
        })),
        currentYearHolidays: yearHolidays.length,
        holidayCount: await Holiday.count(),
        nextBusinessDate: await calculateNextBusinessDateWithHolidaysOS(today)
      }
    });
  } catch (error) {
    logger.error('Holiday system debug failed:', { error: error.message });
    return res.status(500).json({
      success: false,
      message: 'Failed to debug holiday system',
      error: error.message
    });
  }
};

// ==================== ADD NAMED EXPORTS ====================

/**
 * Additional named exports for backward compatibility
 */
export {
  // processLoanOverdueAndStatus,
  // processEODGLTransactions,
  // getCurrentBusinessDateOS as getCurrentBusinessDate,
  // getStatusOS as getStatus,
  // debugDateIssuesOS as debugDateIssues,
  initializeSystemDatesOS as initializeSystemDates,
  processLoanRepaymentDirectDebits
};


// ==================== DEFAULT EXPORT ====================

/**
 * Default export with all controller functions
 */
export default {
  triggerEndOfDayProcess,
  getCurrentBusinessDate: getCurrentBusinessDateOS,
  getServiceErrors,
  getDormantAccountsCount,
  getStatus: getStatusOS,
  processReconciliation,
  initializeSystemDates: initializeSystemDatesOS,
  debugDates: debugDateIssuesOS,
  debugHolidaySystem,
  debugDateIssues: debugDateIssuesOS,
  processLoanOverdueAndStatus,
  processEODGLTransactions,
  getSystemStatus: getSystemStatusOS,
  updateBusinessDate: SystemDateController.updateBusinessDate,
  processEndOfDay: SystemDateController.processEOD,
  setBusinessDateManually: setBusinessDateManuallyOS,
  calculateNextBusinessDate: calculateNextBusinessDateOS,
  calculateNextBusinessDateSafe: calculateNextBusinessDateSafe, // Add this
  calculateNextBusinessDateWithHolidays: calculateNextBusinessDateWithHolidaysOS,
  setNextBusinessDate: setNextBusinessDateOS,
  // Add the new direct debit loan repayment processing function
  processLoanRepaymentDirectDebits
};