// src/Services/autoCollectionService.js
import { Op } from 'sequelize';
import models from '../models/index.js';
const { LoanAccount, CustomerAccount } = models;
import sequelize  from '../../config/db.js';
import logger from '../utils/logger.js';

/**
 * Main function to process auto-collections for due loans (individual + group)
 * Runs during End-of-Day (EOD) processing
 */
export const processAutoCollections = async () => {
  let transaction;

  try {
    logger.info('💰 Starting auto-collection processing for due loans (individual + group)');

    transaction = await sequelize.transaction();

    const currentDate = new Date();

    const results = {
      individual: {
        processed: 0,
        overdueMarked: 0,
        failed: 0,
        totalDue: 0,
      },
      group: {
        processed: 0,
        overdueMarked: 0,
        failed: 0,
        totalDue: 0,
        membersProcessed: 0,
        membersFailed: 0,
      },
    };

    // ==================== PROCESS INDIVIDUAL LOANS ====================
    const dueIndividualLoans = await LoanAccount.findAll({
      where: {
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DISBURSED'] },
        [Op.or]: [
          { NEXT_PAYMENT_DATE: { [Op.lte]: currentDate } },
          { NEXT_PAYMENT_DATE: null },
        ],
        [Op.or]: [
          { OUTSTANDING_PRINCIPAL: { [Op.gt]: 0 } },
          { ACCRUED_INTEREST: { [Op.gt]: 0 } },
        ],
      },
      include: [
        {
          model: CustomerAccount,
          as: 'customerAccount',
          required: true,
          where: { REC_ST: 'ACTIVE' },
        },
      ],
      transaction,
    });

    results.individual.totalDue = dueIndividualLoans.length;
    logger.info(`📊 Found ${dueIndividualLoans.length} individual loans due for collection`);

    for (const loan of dueIndividualLoans) {
      try {
        const collectionResult = await processIndividualLoanCollection(loan, currentDate, transaction);

        if (collectionResult.success) {
          results.individual.processed++;
        } else if (collectionResult.markedOverdue) {
          results.individual.overdueMarked++;
          results.individual.failed++;
        } else {
          results.individual.failed++;
        }
      } catch (error) {
        logger.error(`❌ Error processing individual loan ${loan.ACCT_NO || loan.id}`, { error: error.message });
        results.individual.failed++;
      }
    }

    // ==================== GROUP LOANS (Placeholder) ====================
    logger.info('ℹ️ Group loan auto-collection not implemented yet');

    await transaction.commit();

    logger.info('✅ Auto-collection processing completed successfully', { results });

    return {
      success: true,
      results,
      summary: {
        totalProcessed: results.individual.processed,
        totalOverdueMarked: results.individual.overdueMarked,
        totalFailed: results.individual.failed,
        totalDueLoans: results.individual.totalDue,
      },
    };
  } catch (error) {
    if (transaction) await transaction.rollback();

    logger.error('❌ Auto-collection processing failed', { error: error.message });

    return {
      success: false,
      error: error.message,
      results: {
        individual: { processed: 0, overdueMarked: 0, failed: 0, totalDue: 0 },
        group: { processed: 0, overdueMarked: 0, failed: 0, totalDue: 0, membersProcessed: 0, membersFailed: 0 },
      },
    };
  }
};

/**
 * Process collection for a single individual loan
 */
const processIndividualLoanCollection = async (loan, currentDate, transaction) => {
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

    const collectionResult = await attemptAutoCollectionFromCustomerAccount(loan, dueAmount, currentDate, transaction);

    if (collectionResult.success) {
      logger.info(`✅ Auto-collection successful for loan ${loan.ACCT_NO || loan.id}`, {
        amount: collectionResult.amount,
        customerAccount: collectionResult.customerAccount,
      });
      return { success: true, amount: collectionResult.amount };
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

const checkManualPayment = async (loan, currentDate) => {
  if (loan.LAST_REPAYMENT_DATE) {
    const lastRepayment = new Date(loan.LAST_REPAYMENT_DATE);
    const dueDate = loan.NEXT_PAYMENT_DATE ? new Date(loan.NEXT_PAYMENT_DATE) : currentDate;
    return lastRepayment > dueDate;
  }
  return false;
};

const calculateDueAmount = async (loan) => {
  const principal = parseFloat(loan.OUTSTANDING_PRINCIPAL || 0);
  const interest = parseFloat(loan.ACCRUED_INTEREST || 0);
  const penalty = parseFloat(loan.PENALTY_AMOUNT || 0);
  const termValue = loan.TERM_VALUE || 12;

  const principalInstallment = principal > 0 ? principal / termValue : 0;
  return Math.max(0, principalInstallment + interest + penalty);
};

const attemptAutoCollectionFromCustomerAccount = async (loan, dueAmount, currentDate, transaction) => {
  if (!loan.customerAccount) {
    return { success: false, reason: 'No linked active customer account' };
  }

  const availableBalance = parseFloat(loan.customerAccount.AVAILABLE_BALANCE || 0);

  if (availableBalance < dueAmount) {
    return { success: false, reason: 'Insufficient balance' };
  }

  // Debit customer account
  const newBalance = availableBalance - dueAmount;
  await loan.customerAccount.update(
    {
      AVAILABLE_BALANCE: newBalance,
      ledger_balance: newBalance,
      lastActivityDate: currentDate,
    },
    { transaction }
  );

  // Update loan after successful debit
  await updateLoanAccountAfterCollection(loan, dueAmount, currentDate, transaction);

  return {
    success: true,
    amount: dueAmount,
    customerAccount: loan.customerAccount.account_number,
  };
};

const updateLoanAccountAfterCollection = async (loan, amount, currentDate, transaction) => {
  let remaining = amount;

  const penaltyPaid = Math.min(parseFloat(loan.PENALTY_AMOUNT || 0), remaining);
  remaining -= penaltyPaid;
  const newPenalty = parseFloat(loan.PENALTY_AMOUNT || 0) - penaltyPaid;

  const interestPaid = Math.min(parseFloat(loan.ACCRUED_INTEREST || 0), remaining);
  remaining -= interestPaid;
  const newInterest = parseFloat(loan.ACCRUED_INTEREST || 0) - interestPaid;

  const principalPaid = Math.min(parseFloat(loan.OUTSTANDING_PRINCIPAL || 0), remaining);
  const newPrincipal = parseFloat(loan.OUTSTANDING_PRINCIPAL || 0) - principalPaid;

  const totalRepaid = parseFloat(loan.TOTAL_REPAID_AMOUNT || 0) + amount;

  const updateData = {
    OUTSTANDING_PRINCIPAL: newPrincipal,
    ACCRUED_INTEREST: newInterest,
    PENALTY_AMOUNT: newPenalty,
    TOTAL_REPAID_AMOUNT: totalRepaid,
    LAST_REPAYMENT_DATE: currentDate,
    LAST_REPAYMENT_AMOUNT: amount,
    LAST_PAYMENT_METHOD: 'AUTO_DEBIT',
    NEXT_PAYMENT_DATE: calculateNextPaymentDate(loan, currentDate),
  };

  if (newPrincipal <= 0 && newInterest <= 0 && newPenalty <= 0) {
    updateData.LOAN_STATUS = 'PAID';
    updateData.CLOSURE_DATE = currentDate;
  }

  await loan.update(updateData, { transaction });
};

const markLoanAsOverdue = async (loan, currentDate, reason, transaction) => {
  const dueDate = loan.NEXT_PAYMENT_DATE ? new Date(loan.NEXT_PAYMENT_DATE) : currentDate;
  const overdueDays = Math.ceil((currentDate - dueDate) / (1000 * 60 * 60 * 24));

  await loan.update(
    {
      LOAN_STATUS: 'OVERDUE',
      SERVICING_STATUS: 'DELINQUENT',
      updatedAt: currentDate,
    },
    { transaction }
  );

  logger.info(`📝 Loan marked OVERDUE: ${loan.ACCT_NO || loan.id}`, { overdueDays, reason });
};

const calculateNextPaymentDate = (loan, currentDate) => {
  const next = new Date(currentDate);
  const frequency = (loan.TERM_CD || 'MONTHLY').toUpperCase();
  const value = loan.TERM_VALUE || 1;

  switch (frequency) {
    case 'DAILY':
      next.setDate(next.getDate() + value);
      break;
    case 'WEEKLY':
      next.setDate(next.getDate() + 7 * value);
      break;
    case 'MONTHLY':
      next.setMonth(next.getMonth() + value);
      break;
    case 'QUARTERLY':
      next.setMonth(next.getMonth() + 3 * value);
      break;
    case 'YEARLY':
      next.setFullYear(next.getFullYear() + value);
      break;
    default:
      next.setMonth(next.getMonth() + 1);
  }
  return next;
};

/**
 * Batch processing with retry logic
 */
export const processBatchAutoCollections = async (batchSize = 100, maxRetries = 3) => {
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
          LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DISBURSED'] },
          [Op.or]: [
            { NEXT_PAYMENT_DATE: { [Op.lte]: new Date() } },
            { NEXT_PAYMENT_DATE: null },
          ],
          [Op.or]: [
            { OUTSTANDING_PRINCIPAL: { [Op.gt]: 0 } },
            { ACCRUED_INTEREST: { [Op.gt]: 0 } },
          ],
        },
        include: [{ model: CustomerAccount, as: 'customerAccount', required: true, where: { REC_ST: 'ACTIVE' } }],
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

        while (attempts < maxRetries && !processed) {
          try {
            const res = await processIndividualLoanCollection(loan, new Date(), transaction);
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
};

/**
 * Retrieve auto-collection statistics within a date range
 */
export const getAutoCollectionStats = async (startDate, endDate) => {
  try {
    const stats = await LoanAccount.findAll({
      where: {
        LAST_PAYMENT_METHOD: 'AUTO_DEBIT',
        LAST_REPAYMENT_DATE: {
          [Op.between]: [startDate, endDate],
        },
      },
      attributes: [
        'LOAN_STATUS',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('LAST_REPAYMENT_AMOUNT')), 'totalAmount'],
        [sequelize.fn('SUM', sequelize.col('TOTAL_REPAID_AMOUNT')), 'totalRepaid'],
      ],
      group: ['LOAN_STATUS'],
    });

    const totalTransactions = stats.reduce((sum, row) => sum + parseInt(row.get('count') || 0), 0);
    const totalAmount = stats.reduce((sum, row) => sum + parseFloat(row.get('totalAmount') || 0), 0);

    return {
      success: true,
      stats: {
        byStatus: stats,
        totalTransactions,
        totalAmount,
      },
    };
  } catch (error) {
    logger.error('Failed to retrieve auto-collection stats', { error: error.message });
    return { success: false, error: error.message };
  }
};

export default {
  processAutoCollections,
  processBatchAutoCollections,
  getAutoCollectionStats,
};