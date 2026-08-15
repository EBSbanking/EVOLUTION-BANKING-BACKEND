// Services/autoCollectionService.js - COMPLETE FIXED VERSION
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import { 
  getLoanAccount, 
  getCustomerAccount, 
  getLoanRepayment, 
  initializeModels,
  getPenaltyRule,
  getLoanPenalty
} from '../models/index.js';
import logger from '../utils/logger.js';
import { handleLoanRepayment } from '../controllers/LoanRepaymentController.js';

// ================================================================
// ✅ HELPER: Safely format dates
// ================================================================
const safeFormatDate = (date) => {
  if (!date) return null;
  if (date instanceof Date) {
    return date.toISOString().split('T')[0];
  }
  if (typeof date === 'string') {
    try {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    } catch (e) {
      // Ignore
    }
    return date;
  }
  if (typeof date === 'number') {
    try {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        return d.toISOString().split('T')[0];
      }
    } catch (e) {
      // Ignore
    }
    return String(date);
  }
  return null;
};

// ================================================================
// ✅ HELPER: Ensure date is a valid Date object
// ================================================================
const ensureDate = (date) => {
  if (!date) return new Date();
  if (date instanceof Date) {
    if (isNaN(date.getTime())) return new Date();
    return date;
  }
  if (typeof date === 'string') {
    const d = new Date(date);
    if (!isNaN(d.getTime())) return d;
    return new Date();
  }
  if (typeof date === 'number') {
    const d = new Date(date);
    if (!isNaN(d.getTime())) return d;
    return new Date();
  }
  return new Date();
};

// ----------------------------------------------------------------------
// Helper: Find customer account by customer ID (supports multiple field names)
// ----------------------------------------------------------------------
async function findCustomerAccount(customerId, transaction) {
  try {
    const CustomerAccount = getCustomerAccount();
    if (!CustomerAccount) {
      logger.error('CustomerAccount model not available');
      return null;
    }

    // Try multiple field names for customer ID
    const account = await CustomerAccount.findOne({
      where: {
        [Op.or]: [
          { CUST_ID: customerId },
          { customer_id: customerId },
          { cust_id: customerId },
          { ACCT_NO: customerId },
          { account_number: customerId }
        ],
        status: 'ACTIVE'
      },
      transaction
    });

    if (!account) {
      logger.warn(`No active customer account found for customer ID: ${customerId}`);
    }

    return account;
  } catch (error) {
    logger.error(`Error finding customer account for ${customerId}:`, error.message);
    return null;
  }
}

// ----------------------------------------------------------------------
// Process a single loan using auto-debit from customer account
// ----------------------------------------------------------------------
async function processLoanViaAutoDebit(loan, currentDate, batchId, transaction, CustomerAccount) {
  try {
    if (checkManualPayment(loan, currentDate)) {
      logger.info(`✅ Manual payment detected for loan ${loan.id} – skipping auto-collection`);
      return { success: true, skipped: true };
    }

    const dueAmount = calculateDueAmount(loan);
    if (dueAmount <= 0) {
      logger.info(`💰 No due amount for loan ${loan.id} – skipping`);
      return { success: true, skipped: true };
    }

    const customerId = loan.CUST_ID || loan.customer_id || loan.cust_id;
    if (!customerId) {
      const reason = `No customer ID found for loan ${loan.id}`;
      await markLoanAsOverdue(loan, currentDate, reason, transaction);
      return { success: false, markedOverdue: true, reason };
    }

    const customerAccount = await findCustomerAccount(customerId, transaction);
    
    if (!customerAccount) {
      const reason = `No active customer account found for customer ${customerId}`;
      await markLoanAsOverdue(loan, currentDate, reason, transaction);
      return { success: false, markedOverdue: true, reason };
    }

    // Determine available balance
    const availableBalance = parseFloat(
      customerAccount.available_balance ?? 
      customerAccount.AVAILABLE_BALANCE ?? 
      customerAccount.ledger_balance ?? 
      0
    );
    
    if (availableBalance < dueAmount) {
      const reason = `Insufficient balance. Available: ${availableBalance}, Required: ${dueAmount}`;
      await markLoanAsOverdue(loan, currentDate, reason, transaction);
      return { success: false, markedOverdue: true, reason };
    }

    // Get account number
    const accountNumber = customerAccount.account_number ?? 
                          customerAccount.ACCT_NO ?? 
                          customerAccount.ACCOUNT_NO;
    if (!accountNumber) {
      const reason = 'Customer account number not found';
      await markLoanAsOverdue(loan, currentDate, reason, transaction);
      return { success: false, markedOverdue: true, reason };
    }

    // Execute repayment via handleLoanRepayment
    const repaymentResult = await handleLoanRepayment({
      ACCT_NO: loan.ACCT_NO || loan.acct_no,
      amount: dueAmount,
      date: currentDate.toISOString(),
      customerAccountNo: accountNumber,
      paymentMethod: 'AUTO_DEBIT',
      reference: `AUTO-${batchId}-${loan.ACCT_NO || loan.acct_no}`,
      description: `Auto-collection from customer account (Batch: ${batchId})`,
      createdBy: 'AUTO_COLLECTION_SYSTEM'
    });

    if (!repaymentResult || !repaymentResult.success) {
      const reason = repaymentResult?.error || 'Auto-debit repayment failed';
      await markLoanAsOverdue(loan, currentDate, reason, transaction);
      return { success: false, markedOverdue: true, reason };
    }

    return {
      success: true,
      amount: dueAmount,
      method: 'AUTO_DEBIT',
      customerAccount: accountNumber,
      transactionId: repaymentResult.data?.repaymentId || repaymentResult.data?.id
    };
  } catch (error) {
    logger.error(`Auto-debit failed for ${loan.id}:`, error);
    const reason = error.message;
    try {
      await markLoanAsOverdue(loan, currentDate, reason, transaction);
    } catch (markError) {
      logger.error(`Failed to mark loan ${loan.id} as overdue:`, markError);
    }
    return { success: false, markedOverdue: true, reason };
  }
}

// ----------------------------------------------------------------------
// Helper: Check if manual payment was made after due date
// ----------------------------------------------------------------------
function checkManualPayment(loan, currentDate) {
  const lastRepaymentDate = loan.LAST_REPAYMENT_DATE || loan.lastRepaymentDate;
  const nextPaymentDate = loan.NEXT_PAYMENT_DATE || loan.nextPaymentDate;
  if (lastRepaymentDate) {
    const lastRepayment = new Date(lastRepaymentDate);
    const dueDate = nextPaymentDate ? new Date(nextPaymentDate) : currentDate;
    return lastRepayment > dueDate;
  }
  return false;
}

// ----------------------------------------------------------------------
// Helper: Calculate due amount
// ----------------------------------------------------------------------
function calculateDueAmount(loan) {
  const principal = parseFloat(loan.OUTSTANDING_PRINCIPAL || loan.outstandingPrincipal || 0);
  const interest = parseFloat(loan.ACCRUED_INTEREST || loan.accruedInterest || 0);
  const penalty = parseFloat(loan.PENALTY_AMOUNT || loan.penaltyAmount || 0);
  const status = loan.LOAN_STATUS || loan.loanStatus || 'ACTIVE';
  const nextPaymentDate = loan.NEXT_PAYMENT_DATE || loan.nextPaymentDate;
  const termValue = loan.TERM_VALUE || loan.termValue || 12;

  if (status === 'OVERDUE' || status === 'DELINQUENT') {
    const lateFee = Math.min(principal * 0.05, 5000);
    return Math.min(principal + interest + penalty + lateFee, principal * 1.1);
  }

  if (status === 'ACTIVE' || status === 'APPROVED' || status === 'DISBURSED') {
    if (nextPaymentDate) {
      const nextDate = new Date(nextPaymentDate);
      nextDate.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (nextDate <= today) {
        const due = Math.max((principal / termValue) + interest, 100);
        return due;
      }
    }
    const fallbackDue = Math.min(principal * 0.1, 100000, principal + interest + penalty);
    return fallbackDue;
  }
  return 0;
}

// ----------------------------------------------------------------------
// Helper: Mark loan as overdue
// ----------------------------------------------------------------------
async function markLoanAsOverdue(loan, currentDate, reason, transaction) {
  const dueDate = loan.NEXT_PAYMENT_DATE || loan.nextPaymentDate ? 
    new Date(loan.NEXT_PAYMENT_DATE || loan.nextPaymentDate) : currentDate;
  const overdueDays = Math.max(0, Math.ceil((currentDate - dueDate) / (1000 * 60 * 60 * 24)));

  await loan.update(
    { 
      LOAN_STATUS: 'OVERDUE', 
      updated_at: currentDate 
    },
    { transaction }
  );
  logger.info(`📝 Loan marked OVERDUE: ${loan.id}`, { overdueDays, reason });
}

// ================================================================
// ✅ MAIN AUTO-COLLECTION PROCESSING FUNCTION - FIXED
// ================================================================
export const processAutoCollections = async (options = {}) => {
  await initializeModels();
  
  const LoanAccount = getLoanAccount();
  const CustomerAccount = getCustomerAccount();
  
  const startTime = Date.now();
  
  // ✅ FIX: Ensure date is a valid Date object
  let collectionDate = ensureDate(options.date);
  const dateStr = safeFormatDate(collectionDate);
  
  const batchId = `AUTO_COLLECT_${dateStr}_${Date.now()}`;
  
  logger.info('💰 Starting auto-collection processing...', { 
    batchId, 
    collectionDate: dateStr 
  });

  let transaction;

  try {
    transaction = await sequelize.transaction();

    const results = {
      individual: { processed: 0, overdueMarked: 0, failed: 0, totalDue: 0, collections: [] },
      group: { processed: 0, overdueMarked: 0, failed: 0, totalDue: 0, membersProcessed: 0, membersFailed: 0, collections: [] },
    };

    // ✅ FIXED: Use .unscoped() and specify only columns that exist in loan_accounts
    const dueIndividualLoans = await LoanAccount.unscoped().findAll({
      attributes: [
        'id',
        'ACCT_NO',
        'CUST_ID',
        'OUTSTANDING_PRINCIPAL',
        'LOAN_STATUS',
        'NEXT_PAYMENT_DATE',
        'MATURITY_DT',
        'PENALTY_AMOUNT',
        'ACCRUED_INTEREST',
        'INTEREST_RATE',
        'TERM_VALUE',
        'LAST_REPAYMENT_DATE'
      ],
      where: {
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DISBURSED', 'APPROVED'] },
        OUTSTANDING_PRINCIPAL: { [Op.gt]: 0 },
        [Op.or]: [
          { NEXT_PAYMENT_DATE: { [Op.lte]: collectionDate } },
          { NEXT_PAYMENT_DATE: null },
        ]
      },
      transaction,
      limit: 1000,
      logging: (sql) => logger.debug(`📝 SQL: ${sql}`)
    });

    results.individual.totalDue = dueIndividualLoans.length;
    logger.info(`📊 Found ${dueIndividualLoans.length} individual loans due for collection`);

    for (const loan of dueIndividualLoans) {
      try {
        const collectionResult = await processLoanViaAutoDebit(
          loan, collectionDate, batchId, transaction, CustomerAccount
        );

        const accountNo = loan.ACCT_NO || loan.acctNo;
        if (collectionResult.success) {
          results.individual.processed++;
          results.individual.collections.push({
            loanId: loan.id,
            accountNo,
            status: 'SUCCESS',
            amount: collectionResult.amount,
            method: 'AUTO_DEBIT',
            transactionId: collectionResult.transactionId,
            timestamp: new Date()
          });
        } else if (collectionResult.markedOverdue) {
          results.individual.overdueMarked++;
          results.individual.collections.push({
            loanId: loan.id,
            accountNo,
            status: 'OVERDUE_MARKED',
            reason: collectionResult.reason,
            timestamp: new Date()
          });
        } else {
          results.individual.failed++;
          results.individual.collections.push({
            loanId: loan.id,
            accountNo,
            status: 'FAILED',
            reason: collectionResult.reason,
            timestamp: new Date()
          });
        }
      } catch (error) {
        logger.error(`❌ Error processing individual loan ${loan.id}`, { error: error.message });
        results.individual.failed++;
        results.individual.collections.push({
          loanId: loan.id,
          accountNo: loan.ACCT_NO || loan.acctNo,
          status: 'ERROR',
          error: error.message,
          timestamp: new Date()
        });
      }
    }

    logger.info('ℹ️ Group loan auto-collection not implemented yet');
    await transaction.commit();

    const executionTime = Date.now() - startTime;
    const totalCollected = results.individual.collections.reduce((sum, coll) => sum + (coll.amount || 0), 0);
    
    logger.info('✅ Auto-collection processing completed successfully', { 
      results, 
      totalCollected, 
      executionTime: `${executionTime}ms`, 
      batchId 
    });

    return {
      success: true,
      batchId,
      executionTime,
      totalCollected,
      results,
      summary: {
        totalProcessed: results.individual.processed,
        totalOverdueMarked: results.individual.overdueMarked,
        totalFailed: results.individual.failed,
        totalDueLoans: results.individual.totalDue,
        totalCollectedAmount: totalCollected,
        successRate: results.individual.totalDue > 0 ? Math.round((results.individual.processed / results.individual.totalDue) * 100) : 0
      }
    };
  } catch (error) {
    if (transaction) await transaction.rollback();
    logger.error('❌ Auto-collection processing failed', { 
      batchId, 
      error: error.message, 
      stack: error.stack 
    });
    return { 
      success: false, 
      batchId, 
      error: error.message, 
      results: { 
        individual: { processed: 0, overdueMarked: 0, failed: 0, totalDue: 0, collections: [] }, 
        group: {} 
      } 
    };
  }
};

// ----------------------------------------------------------------------
// Batch processing
// ----------------------------------------------------------------------
export const processBatchAutoCollections = async (batchSize = 100, maxRetries = 3) => {
  try {
    await initializeModels();
    const LoanAccount = getLoanAccount();
    const CustomerAccount = getCustomerAccount();

    const results = { totalProcessed: 0, successful: 0, failed: 0, retried: 0, errors: [] };
    let offset = 0, hasMore = true;

    while (hasMore) {
      const transaction = await sequelize.transaction();
      try {
        // ✅ FIXED: Use .unscoped() and specify attributes
        const dueLoans = await LoanAccount.unscoped().findAll({
          attributes: [
            'id',
            'ACCT_NO',
            'CUST_ID',
            'OUTSTANDING_PRINCIPAL',
            'LOAN_STATUS',
            'NEXT_PAYMENT_DATE',
            'MATURITY_DT',
            'PENALTY_AMOUNT',
            'ACCRUED_INTEREST'
          ],
          where: {
            LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DISBURSED', 'APPROVED'] },
            OUTSTANDING_PRINCIPAL: { [Op.gt]: 0 },
            [Op.or]: [
              { NEXT_PAYMENT_DATE: { [Op.lte]: new Date() } },
              { NEXT_PAYMENT_DATE: null },
            ]
          },
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
          let attempts = 0, processed = false;
          const batchId = `BATCH_${Date.now()}`;
          while (attempts < maxRetries && !processed) {
            try {
              const res = await processLoanViaAutoDebit(loan, new Date(), batchId, transaction, CustomerAccount);
              if (res.success) { 
                results.successful++; 
                processed = true; 
              } else { 
                attempts++; 
                if (attempts < maxRetries) { 
                  results.retried++; 
                  await new Promise(r => setTimeout(r, 1000 * attempts)); 
                } else { 
                  results.failed++; 
                  processed = true; 
                } 
              }
            } catch (err) {
              attempts++;
              results.errors.push({ 
                loanId: loan.id, 
                accountNo: loan.ACCT_NO || loan.acctNo, 
                error: err.message 
              });
              if (attempts >= maxRetries) { 
                results.failed++; 
                processed = true; 
              } else { 
                results.retried++; 
                await new Promise(r => setTimeout(r, 1000 * attempts)); 
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

// ----------------------------------------------------------------------
// Auto-collection statistics
// ----------------------------------------------------------------------
export const getAutoCollectionStats = async (startDate, endDate) => {
  try {
    await initializeModels();
    const LoanRepayment = getLoanRepayment();
    if (!LoanRepayment) {
      return { success: false, error: 'LoanRepayment model not available' };
    }
    
    const stats = await LoanRepayment.findAll({
      where: {
        paymentMethod: { [Op.in]: ['AUTO_DEBIT', 'DIRECT_DEBIT', 'DIRECT_DEBIT_REQUEST'] },
        repayment_date: { [Op.between]: [startDate, endDate] },
      },
      attributes: [
        'paymentMethod',
        [sequelize.fn('DATE', sequelize.col('repayment_date')), 'collectionDate'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('total_amount')), 'totalAmount'],
      ],
      group: ['paymentMethod', sequelize.fn('DATE', sequelize.col('repayment_date'))],
      order: [[sequelize.fn('DATE', sequelize.col('repayment_date')), 'DESC']],
    });
    
    const totalTransactions = stats.reduce((sum, row) => sum + parseInt(row.get('count') || 0), 0);
    const totalAmount = stats.reduce((sum, row) => sum + parseFloat(row.get('totalAmount') || 0), 0);
    return { 
      success: true, 
      stats: { 
        byMethod: stats, 
        totalTransactions, 
        totalAmount, 
        period: { startDate, endDate } 
      } 
    };
  } catch (error) { 
    logger.error('Failed to retrieve auto-collection stats', { error: error.message }); 
    return { success: false, error: error.message }; 
  }
};

export const getCollectionStatistics = getAutoCollectionStats;

export default {
  processAutoCollections,
  processBatchAutoCollections,
  getAutoCollectionStats,
  getCollectionStatistics
};