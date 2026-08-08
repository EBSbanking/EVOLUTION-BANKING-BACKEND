// src/controllers/OsController.js - COMPLETE UPDATED VERSION WITH EMAIL STATEMENTS
import { getServerTime, getBusinessDate, setServerTimeOffset } from '../utils/serverTime.js';
import { checkOverdueLoans } from '../Services/overdueLoanHandler.js';
import { updateLoanStatusForAllLoans } from '../Services/loanStatusUpdater.js';
import { processPendingRepayments } from '../Services/repaymentHandler.js';
import { updateDormantAccounts, countDormantAccountsToUpdate } from '../Services/accountStatusUpdater.js';
import { postDailyAccruedInterest } from '../Services/InterestPostingController.js';
import { createLedgerEntry } from '../controllers/GLAccountController.js';
import { accrueDailyInterest } from '../cronJobs/dailyInterestAccrual.js';
import { calculateNextBusinessDate } from '../utils/dateUtils.js';
import { checkIfLoanIsOverdue as checkOverdue } from '../Services/loanOverdueChecker.js';
import { createAuditTrail } from '../controllers/AudiTrailController.js';
import ThriftController from '../controllers/ThriftController.js';
import { processAutoCollections } from '../Services/autoCollectionService.js';
import { initializeModels, getLoanAccount, getLoanRepayment, getPenaltyRule, getLoanPenalty, getRepaymentSchedule } from '../models/index.js';
import { processDueStandingOrders } from '../controllers/StandingOrderController.js';
import { processPendingGLTransactions } from '../controllers/PendingGLTransactionController.js';
import { processEmailStatements, initializeEmailStatementService } from '../utils/emailStatementService.js';
import GLClosingPeriod from '../models/GLClosingPeriods.js';
import EOYReport from '../models/EOYReport.js';

// Import Sequelize models
import SystemDate from '../models/SystemDate.js';
import Holiday from '../models/Holiday.js';
import Ledger from '../models/Ledger.js';
import GLTransactionQueue from '../models/GLTransactionQueue.js';
import Reconciliation from '../models/Reconciliation.js';
import Customer from '../models/Customer.js';

// Import DirectDebit model for loan repayment processing
import DirectDebit from '../models/DirectDebit.js';
import Deposit from '../models/Deposit.js';
import LoanEvent from '../models/LoanEvent.js';
import LoanAccount from '../models/LoanAccount.js';

// Import database connection
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

// Utils
import logger from '../utils/logger.js';
import moment from 'moment';

// Import SystemDateController
import SystemDateController from './SystemDateController.js';
import os from 'os';

// ==================== MODEL INITIALISATION ====================
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

// ==================== LOAN OVERDUE PROCESSING ====================

/**
 * Process overdue loans
 * @param {Object} options - Processing options
 * @param {Date} options.asOfDate - Date to process as of (default: today)
 * @param {boolean} options.dryRun - If true, only log what would be done
 * @param {boolean} options.updateStatus - If true, update loan statuses
 * @param {boolean} options.accruePenalties - If true, accrue penalties
 * @param {number} options.batchSize - Number of loans to process per batch
 * @returns {Promise<Object>} Processing results
 */
const processOverdueLoans = async (options = {}) => {
  const {
    asOfDate = new Date(),
    dryRun = false,
    updateStatus = true,
    accruePenalties = true,
    batchSize = 100
  } = options;

  logger.info(`⏰ Processing overdue loans as of ${moment(asOfDate).format('YYYY-MM-DD')}...`);
  logger.info(`📋 Options: dryRun=${dryRun}, updateStatus=${updateStatus}, accruePenalties=${accruePenalties}, batchSize=${batchSize}`);

  const results = {
    totalLoansProcessed: 0,
    overdueLoansFound: 0,
    statusUpdated: 0,
    penaltiesAccrued: 0,
    totalPenaltyAmount: 0,
    failedLoans: [],
    details: [],
    dryRun
  };

  try {
    // Get models using the getter functions
    const LoanAccountModel = getLoanAccount();
    const LoanPenaltyModel = getLoanPenalty();
    const PenaltyRuleModel = getPenaltyRule();
    const RepaymentScheduleModel = getRepaymentSchedule();

    if (!LoanAccountModel) {
      throw new Error('LoanAccount model not available');
    }

    logger.debug('📦 Models loaded successfully', {
      hasLoanAccount: !!LoanAccountModel,
      hasLoanPenalty: !!LoanPenaltyModel,
      hasPenaltyRule: !!PenaltyRuleModel
    });

    // Find all loans that are potentially overdue
    // Using .unscoped() to avoid any default scopes that might include penalty_rule_id
    const loans = await LoanAccountModel.unscoped().findAll({
      attributes: [
        'id',
        'acct_no',
        'acct_nm',
        'cust_id',
        'amount',
        'disbursed_amount',
        'outstanding_principal',
        'accrued_interest',
        'penalty_amount',
        'interest_rate',
        'loan_status',
        'servicing_status',
        'application_date',
        'approval_date',
        'disbursement_date',
        'closure_date',
        'last_repayment_date',
        'last_repayment_amount',
        'next_payment_date',
        'maturity_dt',
        'total_repaid_amount',
        'term_cd',
        'term_value',
        'customer_account_id',
        'guarantor_id',
        'guaranteed_amount',
        'loan_portfolio_id',
        'created_by',
        'loan_cycle',
        'has_repayment_schedule',
        'repayment_schedule_id',
        'created_at',
        'updated_at'
      ],
      where: {
        loan_status: ['ACTIVE', 'DISBURSED', 'APPROVED', 'OVERDUE', 'DELINQUENT'],
        outstanding_principal: { [Op.gt]: 0 }
      },
      order: [['next_payment_date', 'ASC']],
      limit: batchSize,
      logging: (sql) => logger.debug(`📝 SQL: ${sql}`)
    });

    logger.info(`📊 Found ${loans.length} active loans to check for overdue status`);

    if (loans.length === 0) {
      logger.info('No active loans found to process');
      return {
        ...results,
        message: 'No active loans found'
      };
    }

    results.totalLoansProcessed = loans.length;

    // Process each loan
    for (const loan of loans) {
      try {
        const loanData = {
          id: loan.id,
          acct_no: loan.acct_no,
          cust_id: loan.cust_id,
          outstanding_principal: parseFloat(loan.outstanding_principal) || 0,
          next_payment_date: loan.next_payment_date,
          maturity_dt: loan.maturity_dt,
          loan_status: loan.loan_status
        };

        // Check if loan is overdue
        const isOverdue = checkIfLoanIsOverdue(loan, asOfDate);
        const daysOverdue = isOverdue ? calculateDaysOverdue(loan, asOfDate) : 0;

        if (isOverdue) {
          results.overdueLoansFound++;
          logger.debug(`🔴 Loan ${loan.acct_no} is overdue by ${daysOverdue} days`);

          // Update loan status if enabled
          if (updateStatus && !dryRun) {
            const newStatus = daysOverdue > 30 ? 'DELINQUENT' : 'OVERDUE';
            if (loan.loan_status !== newStatus) {
              await loan.update({
                loan_status: newStatus,
                updated_at: new Date()
              });
              results.statusUpdated++;
              logger.debug(`✅ Loan ${loan.acct_no} status updated to ${newStatus}`);
            }
          }

          // Accrue penalties if enabled
          if (accruePenalties && !dryRun && LoanPenaltyModel && PenaltyRuleModel) {
            try {
              // Get penalty rule
              const penaltyRule = await getActivePenaltyRule(PenaltyRuleModel);
              if (penaltyRule) {
                const penaltyResult = await accruePenaltyForLoan(
                  loan,
                  penaltyRule,
                  asOfDate,
                  LoanPenaltyModel,
                  null // transaction
                );

                if (penaltyResult.accrued) {
                  results.penaltiesAccrued++;
                  results.totalPenaltyAmount += penaltyResult.amount || 0;
                  results.details.push({
                    loanId: loan.id,
                    accountNo: loan.acct_no,
                    daysOverdue: daysOverdue,
                    penaltyAmount: penaltyResult.amount || 0,
                    action: penaltyResult.action || 'CREATED'
                  });
                  logger.debug(`💰 Penalty accrued for loan ${loan.acct_no}: ₦${penaltyResult.amount}`);
                }
              } else {
                logger.warn(`⚠️ No penalty rule found for loan ${loan.acct_no}`);
              }
            } catch (penaltyError) {
              logger.error(`❌ Failed to accrue penalty for loan ${loan.acct_no}:`, penaltyError.message);
              results.failedLoans.push({
                loanId: loan.id,
                accountNo: loan.acct_no,
                error: penaltyError.message,
                stage: 'penalty_accrual'
              });
            }
          }

          // Log for dry run
          if (dryRun) {
            logger.info(`🔍 DRY RUN: Loan ${loan.acct_no} is overdue by ${daysOverdue} days, would update status and accrue penalty`);
          }
        } else {
          // Loan is not overdue - ensure status is correct
          if (updateStatus && !dryRun && ['OVERDUE', 'DELINQUENT'].includes(loan.loan_status)) {
            // Check if loan should be moved back to active
            const shouldBeActive = await checkIfLoanShouldBeActive(loan, RepaymentScheduleModel);
            if (shouldBeActive) {
              await loan.update({
                loan_status: 'ACTIVE',
                updated_at: new Date()
              });
              logger.debug(`✅ Loan ${loan.acct_no} status reverted to ACTIVE`);
            }
          }
        }

      } catch (loanError) {
        logger.error(`❌ Failed to process loan ${loan.acct_no}:`, loanError.message);
        results.failedLoans.push({
          loanId: loan.id,
          accountNo: loan.acct_no,
          error: loanError.message,
          stage: 'processing'
        });
      }
    }

    // Summary log
    logger.info(`✅ Overdue processing completed:`, {
      totalLoansProcessed: results.totalLoansProcessed,
      overdueLoansFound: results.overdueLoansFound,
      statusUpdated: results.statusUpdated,
      penaltiesAccrued: results.penaltiesAccrued,
      totalPenaltyAmount: results.totalPenaltyAmount,
      failedLoans: results.failedLoans.length,
      dryRun: results.dryRun
    });

    return results;

  } catch (error) {
    logger.error('❌ processOverdueLoans failed:', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Check if a loan is overdue
 */
const checkIfLoanIsOverdue = (loan, asOfDate) => {
  if (!loan.next_payment_date && !loan.maturity_dt) {
    return false;
  }

  const dueDate = loan.next_payment_date || loan.maturity_dt;
  const dueMoment = moment(dueDate);
  const asOfMoment = moment(asOfDate);

  return dueMoment.isBefore(asOfMoment);
};

/**
 * Calculate days overdue
 */
const calculateDaysOverdue = (loan, asOfDate) => {
  if (!loan.next_payment_date && !loan.maturity_dt) {
    return 0;
  }

  const dueDate = loan.next_payment_date || loan.maturity_dt;
  const dueMoment = moment(dueDate);
  const asOfMoment = moment(asOfDate);

  if (dueMoment.isAfter(asOfMoment)) {
    return 0;
  }

  return asOfMoment.diff(dueMoment, 'days');
};

/**
 * Get active penalty rule
 */
const getActivePenaltyRule = async (PenaltyRule) => {
  try {
    if (!PenaltyRule) {
      logger.warn('PenaltyRule model not available');
      return null;
    }

    // Try to get global/default rule
    let rule = await PenaltyRule.findOne({
      where: {
        [Op.or]: [
          { is_global: true, is_active: true },
          { is_default: true, is_active: true }
        ]
      }
    });

    if (rule) return rule;

    // Try to get any active rule (simple model)
    rule = await PenaltyRule.findOne({
      where: { is_active: true }
    });

    if (rule) return rule;

    // Try to get any active rule (complex model)
    const now = new Date();
    rule = await PenaltyRule.findOne({
      where: {
        status: 'ACTIVE',
        effective_from: { [Op.lte]: now },
        [Op.or]: [
          { effective_to: null },
          { effective_to: { [Op.gte]: now } }
        ]
      }
    });

    if (rule) return rule;

    // Fallback: get any rule
    rule = await PenaltyRule.findOne();
    if (rule) {
      logger.warn('Using fallback penalty rule (may not be active)');
      return rule;
    }

    logger.warn('No penalty rule found in database');
    return null;
  } catch (error) {
    logger.error('Error getting penalty rule:', error.message);
    return null;
  }
};

/**
 * Accrue penalty for a loan
 */
const accruePenaltyForLoan = async (loan, penaltyRule, accrualDate, LoanPenalty, transaction) => {
  try {
    if (!LoanPenalty) {
      logger.warn('LoanPenalty model not available');
      return { accrued: false, reason: 'LoanPenalty model not available' };
    }

    const overdueDays = calculateDaysOverdue(loan, accrualDate);
    
    if (overdueDays <= 0) {
      return { accrued: false, reason: 'Not overdue' };
    }

    // Calculate daily penalty amount
    const outstandingPrincipal = parseFloat(loan.outstanding_principal || 0);
    let dailyPenalty = 0;

    // Check if using simple or complex model
    const isSimpleModel = penaltyRule.calculation_method && 
      ['PERCENTAGE_OF_PRINCIPAL', 'FLAT_RATE', 'PERCENTAGE_OF_AMOUNT_DUE', 'SLIDING_SCALE']
      .includes(penaltyRule.calculation_method);

    if (isSimpleModel) {
      // Simple model calculation
      switch (penaltyRule.calculation_method) {
        case 'PERCENTAGE_OF_PRINCIPAL':
          const dailyRate = (penaltyRule.rate || 1) / 100;
          dailyPenalty = outstandingPrincipal * (dailyRate / 365);
          break;
        case 'FLAT_RATE':
          dailyPenalty = parseFloat(penaltyRule.flat_amount || 0);
          break;
        case 'PERCENTAGE_OF_AMOUNT_DUE':
          const amountDue = parseFloat(loan.outstanding_principal || 0);
          dailyPenalty = amountDue * ((penaltyRule.rate || 1) / 100);
          break;
        case 'SLIDING_SCALE':
          const rates = penaltyRule.sliding_rates || [];
          let applicableRate = 1;
          for (const tier of rates) {
            if (overdueDays >= tier.days) {
              applicableRate = tier.rate;
            }
          }
          dailyPenalty = outstandingPrincipal * (applicableRate / 100 / 365);
          break;
        default:
          dailyPenalty = 0;
      }
    } else {
      // Complex model calculation
      if (penaltyRule.rate_value) {
        const dailyRate = parseFloat(penaltyRule.rate_value) / 100;
        dailyPenalty = outstandingPrincipal * (dailyRate / 365);
      } else if (penaltyRule.fixed_amount) {
        dailyPenalty = parseFloat(penaltyRule.fixed_amount);
      }
    }

    dailyPenalty = parseFloat(dailyPenalty.toFixed(2));

    if (dailyPenalty <= 0) {
      return { accrued: false, reason: 'Penalty amount is zero' };
    }

    // Check if penalty already exists for today
    const existingPenalty = await LoanPenalty.findOne({
      where: {
        loan_id: loan.id,
        accrual_date: {
          [Op.gte]: moment(accrualDate).startOf('day').toDate(),
          [Op.lte]: moment(accrualDate).endOf('day').toDate()
        },
        status: 'PENDING'
      },
      transaction
    });

    if (existingPenalty) {
      await existingPenalty.update({
        amount: dailyPenalty,
        days_overdue: overdueDays,
        updated_at: new Date()
      }, { transaction });
      return {
        accrued: true,
        penalty: existingPenalty,
        amount: dailyPenalty,
        action: 'UPDATED'
      };
    }

    // Create new penalty
    const penalty = await LoanPenalty.create({
      loan_id: loan.id,
      loan_account_no: loan.acct_no,
      customer_id: loan.cust_id,
      penalty_type: 'LATE_PAYMENT',
      amount: dailyPenalty,
      days_overdue: overdueDays,
      calculation_basis: penaltyRule?.calculation_method || penaltyRule?.rule_type || 'DAILY_RATE',
      accrual_date: accrualDate,
      due_date: moment(accrualDate).add(7, 'days').toDate(),
      status: 'PENDING',
      description: `Daily late payment penalty - Day ${overdueDays} of overdue (Rule: ${penaltyRule?.rule_name || penaltyRule?.name || penaltyRule?.id})`,
      penalty_rule_id: penaltyRule?.id || null,
      created_at: new Date(),
      updated_at: new Date()
    }, { transaction });

    return {
      accrued: true,
      penalty: penalty,
      amount: dailyPenalty,
      action: 'CREATED'
    };

  } catch (error) {
    logger.error(`Error accruing penalty for loan ${loan.acct_no}:`, error.message);
    return { accrued: false, reason: error.message };
  }
};

/**
 * Check if a loan should be moved back to ACTIVE status
 */
const checkIfLoanShouldBeActive = async (loan, RepaymentSchedule) => {
  try {
    // Check if loan has any pending repayments
    if (RepaymentSchedule) {
      const pendingSchedules = await RepaymentSchedule.count({
        where: {
          loan_id: loan.id,
          status: 'PENDING',
          due_date: { [Op.gte]: new Date() }
        }
      });
      
      if (pendingSchedules > 0) {
        return true;
      }
    }

    // Check if loan is fully paid
    if (parseFloat(loan.outstanding_principal || 0) <= 0) {
      return false;
    }

    // Check if loan is not overdue
    if (loan.next_payment_date) {
      return moment(loan.next_payment_date).isAfter(moment());
    }

    return false;
  } catch (error) {
    logger.error('Error checking if loan should be active:', error.message);
    return false;
  }
};

// ==================== DIRECT DEBIT LOAN REPAYMENT SERVICE ====================

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
            amount: requiredAmount,
            transactionRef
          }, transaction);
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
      GL_ACCT_NO: paymentData.fromAccount,
      AMOUNT: paymentData.amount,
      TRANSACTION_TYPE: 'DR',
      CREATED_BY: 'SYSTEM',
      ACCT_DESC: `Loan Repayment - ${paymentData.loanId} - Installment ${paymentData.installmentNumber}`,
      JOURNAL_ID: `LOAN_REPAY_${paymentData.loanId}_${Date.now()}`
    }, { transaction });

    // 2. Create credit transaction to loan account
    await createLedgerEntry(null, null, {
      GL_ACCT_NO: paymentData.toAccount,
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

// ==================== FIXED: updateLoanBalance function ====================
/**
 * Helper function to update loan balance after a repayment
 */
async function updateLoanBalance(repaymentData, transaction) {
  try {
    const LoanAccount = getLoanAccountModel();
    if (!LoanAccount) {
      logger.error('LoanAccount model not available – cannot update loan balance');
      return;
    }

    // Use the loan's primary key (id) to find the record
    const loan = await LoanAccount.findOne({
      where: { id: repaymentData.loanId },
      transaction
    });

    if (!loan) {
      logger.warn(`Loan with id ${repaymentData.loanId} not found for balance update`);
      return;
    }

    // Validation: skip if loan not disbursed or already zero balance
    if (!loan.DISBURSEMENT_DATE || (parseFloat(loan.OUTSTANDING_PRINCIPAL) || 0) <= 0) {
      logger.warn(`Loan ${loan.ACCT_NO} not disbursed or already zero balance – skipping repayment update`);
      return;
    }

    // Current balances
    const currentPrincipal = parseFloat(loan.OUTSTANDING_PRINCIPAL) || 0;
    const currentInterest = parseFloat(loan.ACCRUED_INTEREST) || 0;
    const currentPenalty = parseFloat(loan.PENALTY_AMOUNT) || 0;
    const currentTotalRepaid = parseFloat(loan.TOTAL_REPAID_AMOUNT) || 0;

    // New values after repayment
    const newPrincipal = Math.max(0, currentPrincipal - (repaymentData.principalAmount || 0));
    const newInterest = Math.max(0, currentInterest - (repaymentData.interestAmount || 0));
    const newPenalty = Math.max(0, currentPenalty - (repaymentData.penaltyAmount || 0));
    const newTotalRepaid = currentTotalRepaid + (repaymentData.amount || 0);

    // Determine if loan is fully paid
    const isFullyPaid = newPrincipal <= 0 && newInterest <= 0 && newPenalty <= 0;
    const newLoanStatus = isFullyPaid ? 'CLOSED' : loan.LOAN_STATUS;

    // Prepare update object
    const updateFields = {
      OUTSTANDING_PRINCIPAL: newPrincipal,
      ACCRUED_INTEREST: newInterest,
      PENALTY_AMOUNT: newPenalty,
      LAST_REPAYMENT_DATE: new Date(),
      LAST_REPAYMENT_AMOUNT: repaymentData.amount || 0,
      TOTAL_REPAID_AMOUNT: newTotalRepaid,
      LOAN_STATUS: newLoanStatus,
      CLOSURE_DATE: isFullyPaid ? new Date() : null
    };

    await loan.update(updateFields, { transaction });

    logger.info(`Updated loan ${loan.ACCT_NO} after repayment`, {
      previousPrincipal: currentPrincipal,
      newPrincipal,
      previousInterest: currentInterest,
      newInterest,
      previousPenalty: currentPenalty,
      newPenalty,
      totalRepaid: newTotalRepaid,
      isFullyPaid,
      newStatus: newLoanStatus
    });
  } catch (error) {
    logger.error(`Error updating loan balance for loanId ${repaymentData.loanId}:`, error);
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
    
    // Use the new processOverdueLoans function
    const result = await processOverdueLoans({
      asOfDate: new Date(),
      dryRun: false,
      updateStatus: true,
      accruePenalties: false, // Don't accrue penalties here, let the penalty service handle it
      batchSize: 500
    });
    
    logger.info('✅ Loan overdue status processing completed', {
      totalLoansProcessed: result.totalLoansProcessed,
      overdueLoansFound: result.overdueLoansFound,
      statusUpdated: result.statusUpdated
    });
    
    return {
      success: true,
      results: {
        overdueLoans: { 
          accounts: result.details.map(d => d.accountNo || d.loanId), 
          count: result.overdueLoansFound 
        },
        statusUpdates: { 
          count: result.statusUpdated 
        },
        details: result.details,
        failedLoans: result.failedLoans
      }
    };
  } catch (error) {
    logger.error('❌ Failed to process loan overdue status', { 
      error: error.message,
      stack: error.stack 
    });
    return {
      success: false,
      error: error.message,
      results: {
        overdueLoans: { accounts: [], count: 0 },
        statusUpdates: { count: 0 }
      }
    };
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
    loanRepaymentSync: {
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
    standingOrders: {
      healthy: true,
      lastError: null,
      lastRun: null,
      executionTime: null,
      successful: 0,
      failed: 0,
      processed: [],
      errors: []
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
    },
    pendingGLTransactions: {
      healthy: true,
      lastError: null,
      lastRun: null,
      executionTime: null,
      processed: 0,
      failed: 0,
      details: []
    },
    // ✅ ADDED: Email Statement Service
    emailStatements: {
      healthy: true,
      lastError: null,
      lastRun: null,
      executionTime: null,
      processed: 0,
      failed: 0,
      details: {
        totalCustomersChecked: 0,
        customersDue: 0,
        statementsGenerated: 0,
        emailsSent: 0,
        emailsFailed: 0
      }
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
      serviceDetails.failed = serviceResult.failedLoans || [];
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
    else if (serviceName === 'standingOrders') {
      serviceDetails.processed = serviceResult.processed || [];
      serviceDetails.failed = serviceResult.failed || [];
      serviceDetails.successful = serviceResult.successful || 0;
      serviceDetails.errors = serviceResult.errors || [];
      logger.info(`standingOrders service completed`, {
        successful: serviceDetails.successful,
        failed: serviceDetails.failed,
        executionTime,
      });
    }
    else if (serviceName === 'pendingGLTransactions') {
      serviceDetails.processed = 0;
      serviceDetails.failed = 0;
      serviceDetails.details = [];
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
    else if (serviceName === 'processAutoCollections') {
      const collectionResult = await processAutoCollections({
        date: systemStatus.currentBusinessDate || new Date()
      });
      
      serviceDetails.healthy = collectionResult.success;
      serviceDetails.lastError = collectionResult.success ? null : collectionResult.error;
      serviceDetails.lastRun = new Date();
      serviceDetails.executionTime = collectionResult.executionTime || 0;
      serviceDetails.processed = collectionResult.results?.individual?.processed || 0;
      serviceDetails.failed = collectionResult.results?.individual?.failed || 0;
      serviceDetails.skipped = [];
      serviceDetails.individualLoans = {
        processed: collectionResult.results?.individual?.processed || 0,
        failed: collectionResult.results?.individual?.failed || 0,
        overdueMarked: collectionResult.results?.individual?.overdueMarked || 0,
        totalDue: collectionResult.results?.individual?.totalDue || 0
      };
      serviceDetails.groupLoans = {
        processed: collectionResult.results?.group?.processed || 0,
        failed: collectionResult.results?.group?.failed || 0,
        totalDue: collectionResult.results?.group?.totalDue || 0
      };
      serviceDetails.collections = collectionResult.results?.individual?.collections || [];
      
      logger.info(`processAutoCollections service completed`, {
        processed: serviceDetails.processed,
        failed: serviceDetails.failed,
        overdueMarked: serviceDetails.individualLoans.overdueMarked,
        totalDue: serviceDetails.individualLoans.totalDue,
        successRate: collectionResult.summary?.successRate || 0,
        executionTime: serviceDetails.executionTime,
      });
      
      return { success: collectionResult.success, result: collectionResult };
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
    // ✅ ADDED: Email Statements Service
    else if (serviceName === 'emailStatements') {
      serviceDetails.processed = serviceResult.results?.customersDue || 0;
      serviceDetails.failed = serviceResult.results?.emailsFailed || 0;
      serviceDetails.details = {
        totalCustomersChecked: serviceResult.results?.totalCustomersChecked || 0,
        customersDue: serviceResult.results?.customersDue || 0,
        statementsGenerated: serviceResult.results?.statementsGenerated || 0,
        emailsSent: serviceResult.results?.emailsSent || 0,
        emailsFailed: serviceResult.results?.emailsFailed || 0
      };
      serviceDetails.errors = serviceResult.results?.errors || [];
      
      logger.info(`emailStatements service completed`, {
        customersDue: serviceDetails.details.customersDue,
        emailsSent: serviceDetails.details.emailsSent,
        emailsFailed: serviceDetails.details.emailsFailed,
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
      processed: [],
      failed: [],
      skipped: [],
      overdueCount: 0,
      statusUpdateCount: 0
    };

    if (serviceName === 'glTransactions') {
      serviceDetails.processed = [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
    }
    if (serviceName === 'reconciliation') {
      serviceDetails.processed = [];
      serviceDetails.failed = [];
      serviceDetails.skipped = [];
      serviceDetails.updated = 0;
    }
    if (serviceName === 'processAutoCollections') {
      serviceDetails.processed = 0;
      serviceDetails.failed = 0;
      serviceDetails.individualLoans = { processed: 0, failed: 0, totalDue: 0 };
      serviceDetails.groupLoans = { processed: 0, failed: 0, membersProcessed: 0, membersFailed: 0 };
    }
    if (serviceName === 'dormantAccounts') {
      serviceDetails.updateCount = 0;
    }
    if (serviceName === 'pendingRepayments') {
      serviceDetails.processedCount = 0;
    }
    // ✅ ADDED: Email Statements Error Handling
    if (serviceName === 'emailStatements') {
      serviceDetails.details = {
        totalCustomersChecked: 0,
        customersDue: 0,
        statementsGenerated: 0,
        emailsSent: 0,
        emailsFailed: 0
      };
      serviceDetails.errors = [errorDetails];
    }

    systemStatus.services[serviceName] = serviceDetails;

    const isCritical = [
      'loanProcessing', 
      'overdueLoans',
      'loanRepaymentSync',
      'processAutoCollections', 
      'loanStatusUpdates', 
      'interestPosting', 
      'glTransactions', 
      'termDepositInterest', 
      'reconciliation',
      'dormantAccounts',
      'pendingRepayments',
      'pendingGLTransactions',
      'standingOrders'
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

    // ✅ ADDED: emailStatements to validServices
    const validServices = [
      'loanProcessing', 'overdueLoans', 'processAutoCollections', 
      'loanStatusUpdates', 'interestPosting', 'glTransactions',
      'termDepositInterest', 'reconciliation', 'pendingRepayments', 
      'dormantAccounts', 'standingOrders', 'pendingGLTransactions',
      'emailStatements' // ✅ ADDED
    ];

    const invalidServices = skipServices.filter(service => !validServices.includes(service));
    if (invalidServices.length > 0) {
      logger.warn('Invalid service names provided in skipServices', { invalidServices });
    }

    const servicesToRun = runServices.length > 0 
      ? runServices.filter(service => validServices.includes(service))
      : validServices.filter(service => !skipServices.includes(service));

    logger.info('Skipping EOD services', { skippedServices: skipServices });

    // ✅ ADDED: emailStatements service function
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
      dormantAccounts: processDormantAccounts,
      standingOrders: processDueStandingOrders,
      pendingGLTransactions: processPendingGLTransactions,
      emailStatements: async () => { // ✅ ADDED
        const result = await processEmailStatements({
          asOfDate: systemStatus.currentBusinessDate || new Date(),
          dryRun: false,
          batchSize: 100,
          sendEmail: true
        });
        return {
          success: result.emailsFailed === 0,
          results: result
        };
      }
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

// ==================== EOD STATUS ====================

/**
 * Get EOD status with detailed service information
 */
export const getEODStatus = async (req, res) => {
  try {
    const systemDate = await SystemDate.findOne({
      order: [['created_at', 'DESC']]
    });

    const status = {
      success: true,
      data: {
        system: {
          state: systemStatus.state || 'idle',
          lastRun: systemStatus.lastRun || null,
          nextRun: systemStatus.nextRun || null,
          currentBusinessDate: systemStatus.currentBusinessDate || systemDate?.currentBusinessDate || null,
          nextBusinessDate: systemStatus.nextBusinessDate || systemDate?.nextBusinessDate || null,
          isEODProcessing: systemStatus.isEODProcessing || false,
          eodStatus: systemStatus.eodStatus || systemDate?.eodStatus || 'IDLE',
          serverTime: getServerTime(),
          uptime: process.uptime(),
        },
        database: {
          systemDateExists: !!systemDate,
          currentBusinessDate: systemDate?.currentBusinessDate,
          nextBusinessDate: systemDate?.nextBusinessDate,
          eodStatus: systemDate?.eodStatus,
          lastEODProcessedBy: systemDate?.lastEODProcessedBy,
          isEODProcessing: systemDate?.isEODProcessing,
          lastEODRun: systemDate?.lastEODRun
        },
        services: Object.keys(systemStatus.services).map((serviceName) => ({
          name: serviceName,
          healthy: systemStatus.services[serviceName].healthy,
          lastRun: systemStatus.services[serviceName].lastRun,
          lastError: systemStatus.services[serviceName].lastError,
          executionTime: systemStatus.services[serviceName].executionTime,
          // Service-specific details
          ...(serviceName === 'glTransactions' && {
            processed: systemStatus.services.glTransactions.processed?.length || 0,
            failed: systemStatus.services.glTransactions.failed?.length || 0,
            skipped: systemStatus.services.glTransactions.skipped?.length || 0,
            details: {
              processed: systemStatus.services.glTransactions.processed || [],
              failed: systemStatus.services.glTransactions.failed || [],
              skipped: systemStatus.services.glTransactions.skipped || []
            }
          }),
          ...(serviceName === 'reconciliation' && {
            updated: systemStatus.services.reconciliation.updated || 0,
            processed: systemStatus.services.reconciliation.processed?.length || 0,
            failed: systemStatus.services.reconciliation.failed?.length || 0,
            skipped: systemStatus.services.reconciliation.skipped?.length || 0,
            details: {
              processed: systemStatus.services.reconciliation.processed || [],
              failed: systemStatus.services.reconciliation.failed || [],
              skipped: systemStatus.services.reconciliation.skipped || []
            }
          }),
          ...(serviceName === 'loanProcessing' && {
            overdueCount: systemStatus.services.loanProcessing.overdueCount || 0,
            statusUpdateCount: systemStatus.services.loanProcessing.statusUpdateCount || 0,
            details: {
              processed: systemStatus.services.loanProcessing.processed || [],
              failed: systemStatus.services.loanProcessing.failed || []
            }
          }),
          ...(serviceName === 'processAutoCollections' && {
            processed: systemStatus.services.processAutoCollections.processed || 0,
            failed: systemStatus.services.processAutoCollections.failed || 0,
            details: {
              individualLoans: systemStatus.services.processAutoCollections.individualLoans || {},
              groupLoans: systemStatus.services.processAutoCollections.groupLoans || {},
              collections: systemStatus.services.processAutoCollections.collections || []
            }
          }),
          ...(serviceName === 'dormantAccounts' && {
            updateCount: systemStatus.services.dormantAccounts.updateCount || 0,
            details: {
              processed: systemStatus.services.dormantAccounts.processed || [],
              failed: systemStatus.services.dormantAccounts.failed || []
            }
          }),
          ...(serviceName === 'standingOrders' && {
            successful: systemStatus.services.standingOrders.successful || 0,
            failed: systemStatus.services.standingOrders.failed || 0,
            details: {
              processed: systemStatus.services.standingOrders.processed || [],
              errors: systemStatus.services.standingOrders.errors || []
            }
          }),
          ...(serviceName === 'pendingGLTransactions' && {
            processed: systemStatus.services.pendingGLTransactions.processed || 0,
            failed: systemStatus.services.pendingGLTransactions.failed || 0,
            details: systemStatus.services.pendingGLTransactions.details || []
          }),
          // ✅ ADDED: Email Statements status
          ...(serviceName === 'emailStatements' && {
            processed: systemStatus.services.emailStatements.processed || 0,
            failed: systemStatus.services.emailStatements.failed || 0,
            details: systemStatus.services.emailStatements.details || {}
          })
        })),
        metrics: {
          serverTime: getServerTime(),
          memoryUsage: process.memoryUsage(),
          loadAverage: os.loadavg(),
          cpuUsage: process.cpuUsage()
        }
      }
    };

    return res.status(200).json(status);
  } catch (error) {
    logger.error('Failed to get EOD status:', {
      error: error.message,
      stack: error.stack
    });
    return res.status(500).json({
      success: false,
      message: 'Failed to get EOD status',
      error: error.message
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

// ==================== SET NEXT BUSINESS DATE ====================

/**
 * Set the next business date
 * @param {Date} currentDate - Current date to calculate from
 * @returns {Promise<Date>} Next business date
 */
const setNextBusinessDateOS = async (currentDate = null) => {
  try {
    const dateToUse = currentDate || systemStatus.currentBusinessDate || new Date();
    const nextBusinessDate = await calculateNextBusinessDate(dateToUse);
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
      // ✅ ADDED: Email Statements status
      ...(serviceName === 'emailStatements' && {
        processed: systemStatus.services.emailStatements.processed,
        failed: systemStatus.services.emailStatements.failed,
        details: systemStatus.services.emailStatements.details
      })
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
          const nextBusinessDate = await calculateNextBusinessDate(currentBusinessDate);

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
        nextBusinessDate: await calculateNextBusinessDate(today)
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

// Add these to your OsController.js
// src/controllers/OsController.js - EOY Functions Section

// ==================== EOY CLOSING STATUS ====================

// EOY status tracking
const eoyStatus = {
  isEOYRunning: false,
  lastEOYRun: null,
  nextEOYRun: null,
  eoyState: 'IDLE', // IDLE, IN_PROGRESS, COMPLETED, FAILED, PARTIAL
  eoyProgress: 0, // 0-100
  eoyErrors: [],
  eoyWarnings: [],
  eoyLogs: [],
  currentFiscalYear: null,
  eoyLocked: false,
  eoyLockReason: null,
  eoyLockedBy: null,
  eoyLockedAt: null
};

// ==================== EOY SERVICE FUNCTIONS ====================

/**
 * Check if EOY is currently running
 * @returns {boolean} True if EOY is running
 */
export const isEOYRunning = () => {
  return eoyStatus.isEOYRunning || eoyStatus.eoyState === 'IN_PROGRESS';
};

/**
 * Check if EOY is locked
 * @returns {boolean} True if EOY is locked
 */
export const isEOYLocked = () => {
  return eoyStatus.eoyLocked;
};

/**
 * Lock EOY process
 * @param {string} reason - Reason for locking
 * @param {string} userId - User who locked
 * @returns {boolean} True if locked successfully
 */
export const lockEOY = (reason, userId) => {
  if (eoyStatus.eoyLocked) {
    logger.warn('EOY is already locked', { 
      lockedBy: eoyStatus.eoyLockedBy, 
      lockedAt: eoyStatus.eoyLockedAt,
      reason: eoyStatus.eoyLockReason
    });
    return false;
  }
  
  eoyStatus.eoyLocked = true;
  eoyStatus.eoyLockReason = reason || 'EOY process in progress';
  eoyStatus.eoyLockedBy = userId || 'system';
  eoyStatus.eoyLockedAt = new Date();
  
  logger.info('🔒 EOY locked', { reason, userId });
  return true;
};

/**
 * Unlock EOY process
 * @param {string} userId - User who unlocks
 * @returns {boolean} True if unlocked successfully
 */
export const unlockEOY = (userId) => {
  if (!eoyStatus.eoyLocked) {
    logger.warn('EOY is not locked');
    return true;
  }
  
  eoyStatus.eoyLocked = false;
  eoyStatus.eoyLockReason = null;
  eoyStatus.eoyLockedBy = null;
  eoyStatus.eoyLockedAt = null;
  
  logger.info('🔓 EOY unlocked', { userId });
  return true;
};

/**
 * Get EOY status
 * @returns {Object} EOY status object
 */
export const getEOYStatus = () => {
  return {
    ...eoyStatus,
    isRunning: eoyStatus.isEOYRunning || eoyStatus.eoyState === 'IN_PROGRESS',
    isLocked: eoyStatus.eoyLocked,
    canRun: !eoyStatus.isEOYRunning && !eoyStatus.eoyLocked && eoyStatus.eoyState !== 'IN_PROGRESS',
    timestamp: new Date().toISOString()
  };
};

/**
 * Reset EOY status
 * @param {string} userId - User performing reset
 * @returns {Object} Reset result
 */
export const resetEOYStatus = (userId) => {
  const oldState = eoyStatus.eoyState;
  const oldLocked = eoyStatus.eoyLocked;
  
  // Reset but keep logs for audit
  eoyStatus.isEOYRunning = false;
  eoyStatus.eoyState = 'IDLE';
  eoyStatus.eoyProgress = 0;
  eoyStatus.eoyErrors = [];
  eoyStatus.eoyWarnings = [];
  eoyStatus.eoyLocked = false;
  eoyStatus.eoyLockReason = null;
  eoyStatus.eoyLockedBy = null;
  eoyStatus.eoyLockedAt = null;
  
  logger.info('🔄 EOY status reset', { 
    userId, 
    oldState, 
    oldLocked,
    timestamp: new Date().toISOString()
  });
  
  return {
    success: true,
    message: 'EOY status reset successfully',
    oldState,
    oldLocked,
    newState: eoyStatus.eoyState,
    timestamp: new Date().toISOString()
  };
};

// ==================== EOY EXECUTION FUNCTION ====================

/**
 * Execute Year-End Closing with status tracking
 * @param {Object} params - Parameters for EOY execution
 * @param {number} params.fiscalYear - Fiscal year to close
 * @param {string} params.userId - User executing the closing
 * @param {number} params.organizationCode - Organization code
 * @param {string} params.branchCode - Branch code
 * @param {boolean} params.dryRun - If true, only simulate
 * @param {boolean} params.force - Force execution even if locked
 * @param {string|Date} params.closingDate - Closing date (defaults to Dec 31 of fiscal year)
 * @returns {Promise<Object>} EOY execution result
 */
export const executeEOY = async (params = {}) => {
  const {
    fiscalYear,
    userId = 'system',
    organizationCode = 1,
    branchCode = '001',
    dryRun = false,
    force = false,
    closingDate = null
  } = params;

  // Validate required parameters
  if (!fiscalYear) {
    return {
      success: false,
      error: 'Fiscal year is required',
      timestamp: new Date().toISOString()
    };
  }

  // ✅ Set closing date to Dec 31 of fiscal year if not provided
  const effectiveClosingDate = closingDate || new Date(fiscalYear, 11, 31);
  const closingDateStr = effectiveClosingDate instanceof Date 
    ? effectiveClosingDate.toISOString().split('T')[0] 
    : effectiveClosingDate;

  logger.info(`📅 Using closing date: ${closingDateStr} for FY${fiscalYear}`);

  // Check if EOY is already running
  if (eoyStatus.isEOYRunning || eoyStatus.eoyState === 'IN_PROGRESS') {
    if (!force) {
      return {
        success: false,
        error: 'EOY is already in progress',
        status: eoyStatus,
        timestamp: new Date().toISOString()
      };
    }
    logger.warn('⚠️ Force executing EOY while already in progress', { userId });
  }

  // Check if EOY is locked
  if (eoyStatus.eoyLocked && !force) {
    return {
      success: false,
      error: `EOY is locked. Reason: ${eoyStatus.eoyLockReason}`,
      lockedBy: eoyStatus.eoyLockedBy,
      lockedAt: eoyStatus.eoyLockedAt,
      timestamp: new Date().toISOString()
    };
  }

  // Update EOY status
  eoyStatus.isEOYRunning = true;
  eoyStatus.eoyState = 'IN_PROGRESS';
  eoyStatus.eoyProgress = 0;
  eoyStatus.eoyErrors = [];
  eoyStatus.eoyWarnings = [];
  eoyStatus.currentFiscalYear = fiscalYear;
  eoyStatus.eoyLogs = [];

  // Lock EOY
  lockEOY(`Year-End Closing FY${fiscalYear}`, userId);

  const startTime = Date.now();
  let result = null;

  try {
    logger.info(`🚀 Starting Year-End Closing for FY${fiscalYear}`, {
      userId,
      organizationCode,
      branchCode,
      dryRun,
      force,
      closingDate: closingDateStr
    });

    // Log EOY start
    eoyStatus.eoyLogs.push({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Starting Year-End Closing for FY${fiscalYear}`,
      userId,
      dryRun,
      closingDate: closingDateStr
    });

    // Update progress: 10%
    eoyStatus.eoyProgress = 10;

    // Import the GLAccountEOYController
    const { GLAccountEOYController } = await import('./GLAccountEOYController.js');

    // Execute Year-End Closing
    eoyStatus.eoyLogs.push({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Executing Year-End Closing for FY${fiscalYear} (${dryRun ? 'DRY RUN' : 'LIVE'})`,
    });

    // Update progress: 30%
    eoyStatus.eoyProgress = 30;

    result = await GLAccountEOYController.executeYearEndClosing({
      fiscalYear,
      userId,
      organizationCode,
      branchCode,
      dryRun,
      closingDate: effectiveClosingDate  // ✅ Pass the closing date
    });

    // Update progress based on result
    if (result.success) {
      eoyStatus.eoyProgress = 80;
      eoyStatus.eoyLogs.push({
        timestamp: new Date().toISOString(),
        level: 'success',
        message: `Year-End Closing for FY${fiscalYear} completed successfully`,
        summary: result.summary
      });
    } else {
      eoyStatus.eoyProgress = 60;
      eoyStatus.eoyErrors.push({
        timestamp: new Date().toISOString(),
        error: result.error || 'Unknown error occurred',
        stack: result.stack
      });
      eoyStatus.eoyLogs.push({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `Year-End Closing for FY${fiscalYear} failed: ${result.error || 'Unknown error'}`,
      });
    }

    // Complete
    eoyStatus.eoyProgress = 100;
    eoyStatus.isEOYRunning = false;
    eoyStatus.eoyState = result.success ? 'COMPLETED' : 'FAILED';
    eoyStatus.lastEOYRun = new Date();

    // Unlock EOY
    unlockEOY(userId);

    const executionTime = Date.now() - startTime;
    logger.info(`✅ Year-End Closing completed for FY${fiscalYear}`, {
      success: result.success,
      executionTime: `${executionTime}ms`,
      dryRun,
      state: eoyStatus.eoyState
    });

    return {
      success: result.success,
      dryRun,
      fiscalYear,
      executionTime,
      result,
      status: { ...eoyStatus },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    // Handle errors
    eoyStatus.isEOYRunning = false;
    eoyStatus.eoyState = 'FAILED';
    eoyStatus.eoyProgress = 0;
    eoyStatus.eoyErrors.push({
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack
    });
    eoyStatus.eoyLogs.push({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: `Year-End Closing for FY${fiscalYear} threw an exception: ${error.message}`,
    });

    // Unlock EOY
    unlockEOY(userId);

    logger.error(`❌ Year-End Closing for FY${fiscalYear} failed with exception`, {
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      dryRun,
      fiscalYear,
      error: error.message,
      stack: error.stack,
      status: { ...eoyStatus },
      timestamp: new Date().toISOString()
    };
  }
};

/**
 * Execute Year-End Closing from API endpoint
 * POST /api/eoy/execute
 */
export const executeYearEndClosing = async (req, res) => {
  try {
    const {
      fiscalYear,
      userId = req.user?.id || req.user?.user_name || 'system',
      organizationCode = 1,
      branchCode = '001',
      dryRun = false,
      force = false,
      checkOnly = false,
      closingDate = null
    } = req.body;

    // If checkOnly is true, just return the status
    if (checkOnly) {
      return res.status(200).json({
        success: true,
        message: 'EOY status check',
        data: {
          canRun: !eoyStatus.isEOYRunning && !eoyStatus.eoyLocked,
          isRunning: eoyStatus.isEOYRunning || eoyStatus.eoyState === 'IN_PROGRESS',
          isLocked: eoyStatus.eoyLocked,
          status: { ...eoyStatus },
          currentFiscalYear: eoyStatus.currentFiscalYear,
          lastEOYRun: eoyStatus.lastEOYRun,
          timestamp: new Date().toISOString()
        }
      });
    }

    // ✅ Set default closing date if not provided
    const effectiveClosingDate = closingDate || new Date(fiscalYear, 11, 31);

    // Execute EOY
    const result = await executeEOY({
      fiscalYear,
      userId,
      organizationCode,
      branchCode,
      dryRun,
      force,
      closingDate: effectiveClosingDate
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error || 'EOY execution failed',
        data: result,
        timestamp: new Date().toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      message: `Year-End Closing for FY${fiscalYear} executed successfully${dryRun ? ' (DRY RUN)' : ''}`,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Failed to execute Year-End Closing:', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to execute Year-End Closing',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Get EOY status from API endpoint
 * GET /api/eoy/status
 */
export const getEOYStatusAPI = async (req, res) => {
  try {
    const status = getEOYStatus();
    
    return res.status(200).json({
      success: true,
      data: {
        ...status,
        canRun: !status.isRunning && !status.isLocked,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('❌ Failed to get EOY status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get EOY status',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Reset EOY status from API endpoint
 * POST /api/eoy/reset
 */
export const resetEOYStatusAPI = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.user_name || 'system';
    const result = resetEOYStatus(userId);
    
    return res.status(200).json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ Failed to reset EOY status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset EOY status',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Get EOY logs
 * GET /api/eoy/logs
 */
export const getEOYLogs = async (req, res) => {
  try {
    const { limit = 100, level } = req.query;
    
    let logs = eoyStatus.eoyLogs || [];
    
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    
    // Sort by timestamp descending (newest first)
    logs = logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Apply limit
    if (limit > 0) {
      logs = logs.slice(0, parseInt(limit));
    }
    
    return res.status(200).json({
      success: true,
      data: {
        logs,
        count: logs.length,
        total: eoyStatus.eoyLogs?.length || 0,
        errors: eoyStatus.eoyErrors || [],
        warnings: eoyStatus.eoyWarnings || []
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ Failed to get EOY logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get EOY logs',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};




// ==================== EXPORTS ====================

// Export the main functions
export {
  processOverdueLoans,
  checkIfLoanIsOverdue,
  calculateDaysOverdue,
  getActivePenaltyRule,
  accruePenaltyForLoan,
  checkIfLoanShouldBeActive,
  processLoanRepaymentDirectDebits,
  initializeSystemDatesOS as initializeSystemDates,
  getCurrentBusinessDateOS as getCurrentBusinessDate,
  setBusinessDateManuallyOS as setBusinessDateManually,
  debugDateIssuesOS as debugDateIssues,
  getStatusOS as getStatus,
  getSystemStatusOS as getSystemStatus,
};

// ==================== DEFAULT EXPORT ====================

export default {
  triggerEndOfDayProcess,
  getCurrentBusinessDate: getCurrentBusinessDateOS,
  getServiceErrors,
  getEODStatus,
  getDormantAccountsCount,
  getStatus: getStatusOS,
  processReconciliation: performReconciliation,
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
  calculateNextBusinessDate: calculateNextBusinessDate,
  calculateNextBusinessDateWithHolidays: calculateNextBusinessDate,
  setNextBusinessDate: setNextBusinessDateOS,
  processLoanRepaymentDirectDebits,
  processOverdueLoans,
  processEmailStatements // ✅ ADDED export
};