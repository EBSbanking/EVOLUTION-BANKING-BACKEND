// src/services/autoCollectionService.js
import { Op } from 'sequelize';
import { 
  getLoanAccount, 
  getCustomerAccount, 
  getLoanRepayment,
  getDirectDebit,
  getDeposit,
  ensureModelsInitialized 
} from '../utils/modelHelper.js';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';
import { handleLoanRepayment } from '../controllers/LoanRepaymentController.js';
import { createAuditTrail } from '../controllers/AudiTrailController.js';

/**
 * Main function to process auto-collections for due loans
 * Runs during End-of-Day (EOD) processing
 */
export const processAutoCollections = async (options = {}) => {
  // Initialize models at the start
  await ensureModelsInitialized();
  
  // Get models
  const LoanAccount = await getLoanAccount();
  const CustomerAccount = await getCustomerAccount();
  const DirectDebit = await getDirectDebit();
  const Deposit = await getDeposit();
  
  const startTime = Date.now();
  const collectionDate = options.date || new Date();
  const batchId = `AUTO_COLLECT_${collectionDate.toISOString().split('T')[0]}_${Date.now()}`;
  
  logger.info('💰 Starting auto-collection processing...', { 
    batchId, 
    collectionDate: collectionDate.toISOString()
  });

  let transaction;

  try {
    transaction = await sequelize.transaction();

    const results = {
      individual: {
        processed: 0,
        overdueMarked: 0,
        failed: 0,
        totalDue: 0,
        collections: []
      },
      group: {
        processed: 0,
        overdueMarked: 0,
        failed: 0,
        totalDue: 0,
        membersProcessed: 0,
        membersFailed: 0,
        collections: []
      },
    };

    // ==================== PROCESS INDIVIDUAL LOANS ====================
    const dueIndividualLoans = await LoanAccount.findAll({
      where: {
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DISBURSED', 'APPROVED'] },
        OUTSTANDING_PRINCIPAL: { [Op.gt]: 0 },
        [Op.or]: [
          { NEXT_PAYMENT_DATE: { [Op.lte]: collectionDate } },
          { NEXT_PAYMENT_DATE: null },
        ]
      },
      include: [
        {
          model: CustomerAccount,
          as: 'customerAccount',
          required: true
        }
      ],
      transaction,
      limit: 1000 // Prevent overwhelming the system
    });

    results.individual.totalDue = dueIndividualLoans.length;
    logger.info(`📊 Found ${dueIndividualLoans.length} individual loans due for collection`);

    for (const loan of dueIndividualLoans) {
      try {
        const collectionResult = await processIndividualLoanCollection(loan, collectionDate, batchId, transaction);

        if (collectionResult.success) {
          results.individual.processed++;
          results.individual.collections.push({
            loanId: loan.id,
            accountNo: loan.ACCT_NO,
            status: 'SUCCESS',
            amount: collectionResult.amount,
            method: collectionResult.method,
            timestamp: new Date()
          });
        } else if (collectionResult.markedOverdue) {
          results.individual.overdueMarked++;
          results.individual.failed++;
          results.individual.collections.push({
            loanId: loan.id,
            accountNo: loan.ACCT_NO,
            status: 'OVERDUE_MARKED',
            reason: collectionResult.reason,
            timestamp: new Date()
          });
        } else {
          results.individual.failed++;
          results.individual.collections.push({
            loanId: loan.id,
            accountNo: loan.ACCT_NO,
            status: 'FAILED',
            reason: collectionResult.reason,
            timestamp: new Date()
          });
        }
      } catch (error) {
        logger.error(`❌ Error processing individual loan ${loan.ACCT_NO || loan.id}`, { error: error.message });
        results.individual.failed++;
        results.individual.collections.push({
          loanId: loan.id,
          accountNo: loan.ACCT_NO,
          status: 'ERROR',
          error: error.message,
          timestamp: new Date()
        });
      }
    }

    // ==================== GROUP LOANS (Placeholder) ====================
    logger.info('ℹ️ Group loan auto-collection not implemented yet');

    await transaction.commit();

    const executionTime = Date.now() - startTime;
    
    // Calculate total collected amount
    const totalCollected = results.individual.collections.reduce((sum, coll) => 
      sum + (coll.amount || 0), 0
    );
    
    logger.info('✅ Auto-collection processing completed successfully', { 
      results,
      totalCollected,
      executionTime: `${executionTime}ms`,
      batchId
    });

    // Create audit trail for successful processing
    await createAuditTrail({
      EVENT_TYPE: 'AUTO_COLLECTION_COMPLETED',
      USER_ID: 'SYSTEM',
      ACTION: 'Auto Collection Batch Processed',
      NEW_VALUE: JSON.stringify({
        batchId,
        collectionDate: collectionDate.toISOString(),
        executionTime,
        totalCollected,
        processedCount: results.individual.processed,
        failedCount: results.individual.failed,
        overdueMarkedCount: results.individual.overdueMarked,
        results: {
          individual: {
            processed: results.individual.processed,
            failed: results.individual.failed,
            overdueMarked: results.individual.overdueMarked,
            totalDue: results.individual.totalDue,
            totalCollected: results.individual.collections.reduce((sum, coll) => 
              sum + (coll.amount || 0), 0
            )
          }
        }
      }),
      OLD_VALUE: null,
      IP_ADDRESS: '127.0.0.1',
      ENTITY_ID: batchId,
      ENTITY_TYPE: 'auto_collection_batch',
      status: 'SUCCESS'
    });

    return {
      success: true,
      batchId,
      executionTime,
      totalCollected,
      results: {
        individual: {
          processed: results.individual.processed,
          failed: results.individual.failed,
          overdueMarked: results.individual.overdueMarked,
          totalDue: results.individual.totalDue,
          collections: results.individual.collections
        },
        group: {
          processed: results.group.processed,
          failed: results.group.failed,
          totalDue: results.group.totalDue,
          membersProcessed: results.group.membersProcessed,
          membersFailed: results.group.membersFailed,
          collections: results.group.collections
        }
      },
      summary: {
        totalProcessed: results.individual.processed,
        totalOverdueMarked: results.individual.overdueMarked,
        totalFailed: results.individual.failed,
        totalDueLoans: results.individual.totalDue,
        totalCollectedAmount: totalCollected,
        successRate: results.individual.totalDue > 0 ? 
          (results.individual.processed / results.individual.totalDue) * 100 : 0
      }
    };
  } catch (error) {
    if (transaction) await transaction.rollback();

    logger.error('❌ Auto-collection processing failed', { 
      batchId,
      error: error.message,
      stack: error.stack 
    });

    // Create audit trail for failed processing
    await createAuditTrail({
      EVENT_TYPE: 'AUTO_COLLECTION_PROCESSING',
      USER_ID: 'system',
      ACTION: 'process_auto_collections',
      NEW_VALUE: JSON.stringify({
        batchId,
        collectionDate: collectionDate.toISOString(),
        totalCollected: 0,
        processedCount: 0,
        failedCount: 0,
        error: error.message
      }),
      OLD_VALUE: null,
      IP_ADDRESS: '127.0.0.1',
      ENTITY_ID: batchId,
      ENTITY_TYPE: 'auto_collection_batch',
      status: 'FAILED'
    });

    return {
      success: false,
      batchId,
      error: error.message,
      results: {
        individual: { 
          processed: 0, 
          overdueMarked: 0, 
          failed: 0, 
          totalDue: 0,
          collections: []
        },
        group: { 
          processed: 0, 
          overdueMarked: 0, 
          failed: 0, 
          totalDue: 0, 
          membersProcessed: 0, 
          membersFailed: 0,
          collections: []
        }
      }
    };
  }
};

/**
 * Process collection for a single individual loan
 */
const processIndividualLoanCollection = async (loan, currentDate, batchId, transaction) => {
  try {
    // Skip if manual payment was already recorded after due date
    if (await checkManualPayment(loan, currentDate)) {
      logger.info(`✅ Manual payment detected for loan ${loan.ACCT_NO || loan.id} – skipping auto-collection`);
      return { success: true, skipped: true };
    }

    const dueAmount = await calculateDueAmount(loan);

    if (dueAmount <= 0) {
      logger.info(`💰 No due amount for loan ${loan.ACCT_NO || loan.id} – skipping`);
      return { success: true, skipped: true };
    }

    // Try different collection methods in priority order
    const collectionResult = await attemptAutoCollection(loan, dueAmount, currentDate, batchId, transaction);

    if (collectionResult.success) {
      logger.info(`✅ Auto-collection successful for loan ${loan.ACCT_NO || loan.id}`, {
        amount: collectionResult.amount,
        method: collectionResult.method,
        customerAccount: collectionResult.customerAccount,
      });
      return { 
        success: true, 
        amount: collectionResult.amount,
        method: collectionResult.method
      };
    }

    // Failed → mark as overdue
    await markLoanAsOverdue(loan, currentDate, collectionResult.reason, transaction);
    logger.warn(`⚠️ Auto-collection failed – loan marked overdue: ${loan.ACCT_NO || loan.id}`, {
      reason: collectionResult.reason,
      dueAmount,
    });

    return { success: false, markedOverdue: true, reason: collectionResult.reason };
  } catch (error) {
    logger.error(`❌ Unexpected error processing loan ${loan.ACCT_NO || loan.id}`, { error: error.message });
    return { success: false, error: error.message };
  }
};

/**
 * Try different collection methods
 */
const attemptAutoCollection = async (loan, dueAmount, currentDate, batchId, transaction) => {
  // Method 1: Check for direct debit mandate
  const directDebitResult = await attemptDirectDebitCollection(loan, dueAmount, currentDate, batchId, transaction);
  if (directDebitResult.success) {
    return directDebitResult;
  }

  // Method 2: Check customer account balance for auto-debit
  const autoDebitResult = await attemptAutoDebitFromCustomerAccount(loan, dueAmount, currentDate, batchId, transaction);
  if (autoDebitResult.success) {
    return autoDebitResult;
  }

  // All methods failed
  return {
    success: false,
    reason: directDebitResult.reason || autoDebitResult.reason || 'No collection method available'
  };
};

/**
 * Attempt direct debit collection
 */
const attemptDirectDebitCollection = async (loan, dueAmount, currentDate, batchId, transaction) => {
  try {
    // Check for valid direct debit mandate
    const directDebit = await DirectDebit.findOne({
      where: {
        LOAN_ACCOUNT_NO: loan.ACCT_NO,
        REC_ST: 'Y',
        EXPIRY_DT: { [Op.gt]: currentDate }
      },
      transaction
    });
    
    if (!directDebit) {
      return { success: false, reason: 'No valid direct debit mandate found' };
    }

    // Check source account balance
    const sourceAccount = await Deposit.findOne({
      where: { ACCOUNT_NO: directDebit.FROM_DEPOSIT_ACCT_NO },
      transaction
    });
    
    if (!sourceAccount) {
      return { success: false, reason: 'Source account not found' };
    }
    
    const sourceBalance = parseFloat(sourceAccount.LEDGER_BAL || 0);
    if (sourceBalance < dueAmount) {
      return { 
        success: false, 
        reason: `Insufficient balance in source account. Available: ${sourceBalance}, Required: ${dueAmount}` 
      };
    }

    // Process the repayment
    const repaymentResult = await handleLoanRepayment({
      ACCT_NO: loan.ACCT_NO,
      amount: dueAmount,
      date: currentDate.toISOString(),
      customerAccountNo: directDebit.FROM_DEPOSIT_ACCT_NO,
      paymentMethod: 'DIRECT_DEBIT',
      reference: `DD-${batchId}-${loan.ACCT_NO}`,
      description: `Auto-collection via Direct Debit (Batch: ${batchId})`,
      createdBy: 'AUTO_COLLECTION_SYSTEM'
    });

    if (!repaymentResult.success) {
      return { success: false, reason: repaymentResult.error || 'Direct debit repayment failed' };
    }

    // Update direct debit record
    await directDebit.update({
      LAST_DEBIT_DATE: currentDate,
      LAST_DEBIT_AMOUNT: dueAmount,
      TOTAL_DEBITED: (parseFloat(directDebit.TOTAL_DEBITED || 0) + dueAmount),
      ROW_TS: new Date()
    }, { transaction });

    return {
      success: true,
      amount: dueAmount,
      method: 'DIRECT_DEBIT',
      customerAccount: directDebit.FROM_DEPOSIT_ACCT_NO,
      transactionId: repaymentResult.data?.repaymentId
    };
    
  } catch (error) {
    logger.error(`Direct debit collection failed for ${loan.ACCT_NO}:`, error);
    return { success: false, reason: error.message };
  }
};

/**
 * Attempt auto-debit from customer account
 */
const attemptAutoDebitFromCustomerAccount = async (loan, dueAmount, currentDate, batchId, transaction) => {
  if (!loan.customerAccount) {
    return { success: false, reason: 'No linked active customer account' };
  }

  const customerAccount = loan.customerAccount;
  const availableBalance = parseFloat(customerAccount.AVAILABLE_BALANCE || customerAccount.available_balance || 0);

  if (availableBalance < dueAmount) {
    return { 
      success: false, 
      reason: `Insufficient balance. Available: ${availableBalance}, Required: ${dueAmount}` 
    };
  }

  // Process repayment from customer's account
  const repaymentResult = await handleLoanRepayment({
    ACCT_NO: loan.ACCT_NO,
    amount: dueAmount,
    date: currentDate.toISOString(),
    customerAccountNo: customerAccount.account_number,
    paymentMethod: 'AUTO_DEBIT',
    reference: `AUTO-${batchId}-${loan.ACCT_NO}`,
    description: `Auto-collection from customer account (Batch: ${batchId})`,
    createdBy: 'AUTO_COLLECTION_SYSTEM'
  });

  if (!repaymentResult.success) {
    return { success: false, reason: repaymentResult.error || 'Auto-debit repayment failed' };
  }

  return {
    success: true,
    amount: dueAmount,
    method: 'AUTO_DEBIT',
    customerAccount: customerAccount.account_number,
    transactionId: repaymentResult.data?.repaymentId
  };
};

/**
 * Check if manual payment was made
 */
const checkManualPayment = async (loan, currentDate) => {
  if (loan.LAST_REPAYMENT_DATE) {
    const lastRepayment = new Date(loan.LAST_REPAYMENT_DATE);
    const dueDate = loan.NEXT_PAYMENT_DATE ? new Date(loan.NEXT_PAYMENT_DATE) : currentDate;
    return lastRepayment > dueDate;
  }
  return false;
};

/**
 * Calculate due amount for a loan
 */
const calculateDueAmount = async (loan) => {
  // Check for installment amount using NEXT_PAYMENT_DATE
  if (loan.INSTALLMENT_AMOUNT && loan.NEXT_PAYMENT_DATE) {
    const nextRepaymentDate = new Date(loan.NEXT_PAYMENT_DATE);
    if (nextRepaymentDate <= new Date()) {
      return parseFloat(loan.INSTALLMENT_AMOUNT);
    }
  }
  
  // Calculate based on outstanding amounts
  const principal = parseFloat(loan.OUTSTANDING_PRINCIPAL || 0);
  const interest = parseFloat(loan.ACCRUED_INTEREST || 0);
  const penalty = parseFloat(loan.PENALTY_AMOUNT || 0);
  
  // For overdue loans, add penalty
  if (loan.LOAN_STATUS === 'OVERDUE' || loan.LOAN_STATUS === 'DELINQUENT') {
    const lateFee = Math.min((principal * 0.05), 5000);
    return Math.min(principal + interest + penalty + lateFee, principal * 1.1);
  }
  
  // For active loans, minimum payment
  if (loan.LOAN_STATUS === 'ACTIVE' || loan.LOAN_STATUS === 'APPROVED') {
    return Math.min(
      (principal * 0.1),
      100000,
      principal + interest + penalty
    );
  }
  
  return 0;
};

/**
 * Mark loan as overdue
 */
const markLoanAsOverdue = async (loan, currentDate, reason, transaction) => {
  const dueDate = loan.NEXT_PAYMENT_DATE ? new Date(loan.NEXT_PAYMENT_DATE) : currentDate;
  const overdueDays = Math.max(0, Math.ceil((currentDate - dueDate) / (1000 * 60 * 60 * 24)));

  await loan.update(
    {
      LOAN_STATUS: 'OVERDUE',
      updatedAt: currentDate,
    },
    { transaction }
  );

  logger.info(`📝 Loan marked OVERDUE: ${loan.ACCT_NO || loan.id}`, { overdueDays, reason });
};

/**
 * Batch processing with retry logic
 */
export const processBatchAutoCollections = async (batchSize = 100, maxRetries = 3) => {
  try {
    await ensureModelsInitialized();
    const LoanAccount = await getLoanAccount();
    const CustomerAccount = await getCustomerAccount();
    
    const results = {
      totalProcessed: 0,
      successful: 0,
      failed: 0,
      retried: 0,
      errors: [],
    };

    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const transaction = await sequelize.transaction();

      try {
        const dueLoans = await LoanAccount.findAll({
          where: {
            LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DISBURSED', 'APPROVED'] },
            OUTSTANDING_PRINCIPAL: { [Op.gt]: 0 },
            [Op.or]: [
              { NEXT_PAYMENT_DATE: { [Op.lte]: new Date() } },
              { NEXT_PAYMENT_DATE: null },
            ]
          },
          include: [{ 
            model: CustomerAccount, 
            as: 'customerAccount', 
            required: true 
          }],
          limit: batchSize,
          offset,
          order: [['NEXT_PAYMENT_DATE', 'ASC']],
          transaction,
        });

        if (dueLoans.length === 0) {
          hasMore = false;
          await transaction.commit();
          continue;
        }

        for (const loan of dueLoans) {
          let attempts = 0;
          let processed = false;
          const batchId = `BATCH_${Date.now()}`;

          while (attempts < maxRetries && !processed) {
            try {
              const res = await processIndividualLoanCollection(loan, new Date(), batchId, transaction);
              if (res.success) {
                results.successful++;
                processed = true;
              } else {
                attempts++;
                if (attempts < maxRetries) {
                  results.retried++;
                  await new Promise((r) => setTimeout(r, 1000 * attempts));
                } else {
                  results.failed++;
                  processed = true;
                }
              }
            } catch (err) {
              attempts++;
              results.errors.push({
                loanId: loan.id,
                accountNo: loan.ACCT_NO || loan.id,
                error: err.message,
              });

              if (attempts >= maxRetries) {
                results.failed++;
                processed = true;
              } else {
                results.retried++;
                await new Promise((r) => setTimeout(r, 1000 * attempts));
              }
            }
          }
          results.totalProcessed++;
        }

        await transaction.commit();
        offset += batchSize;
        logger.info(`Batch processed – offset: ${offset}, successful: ${results.successful}, failed: ${results.failed}`);
      } catch (err) {
        await transaction.rollback();
        logger.error(`Batch failed at offset ${offset}`, { error: err.message });
        throw err;
      }
    }

    return results;
  } catch (error) {
    logger.error('Error in processBatchAutoCollections:', error);
    throw error;
  }
};

/**
 * Retrieve auto-collection statistics within a date range
 */
export const getAutoCollectionStats = async (startDate, endDate) => {
  try {
    await ensureModelsInitialized();
    const LoanRepayment = await getLoanRepayment();
    
    const stats = await LoanRepayment.findAll({
      where: {
        paymentMethod: {
          [Op.in]: ['AUTO_DEBIT', 'DIRECT_DEBIT']
        },
        repaymentDate: {  // Make sure this column name matches your model
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        'paymentMethod',
        [sequelize.fn('DATE', sequelize.col('repaymentDate')), 'collectionDate'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('amount')), 'totalAmount'],
      ],
      group: ['paymentMethod', sequelize.fn('DATE', sequelize.col('repaymentDate'))],
      order: [[sequelize.fn('DATE', sequelize.col('repaymentDate')), 'DESC']],
    });

    const totalTransactions = stats.reduce((sum, row) => sum + parseInt(row.get('count') || 0), 0);
    const totalAmount = stats.reduce((sum, row) => sum + parseFloat(row.get('totalAmount') || 0), 0);

    return {
      success: true,
      stats: {
        byMethod: stats,
        totalTransactions,
        totalAmount,
        period: {
          startDate,
          endDate
        }
      },
    };
  } catch (error) {
    logger.error('Failed to retrieve auto-collection stats', { error: error.message });
    return { success: false, error: error.message };
  }
};

// For backward compatibility with existing code
export const getCollectionStatistics = getAutoCollectionStats;

export default {
  processAutoCollections,
  processBatchAutoCollections,
  getAutoCollectionStats,
  getCollectionStatistics
};