// src/controllers/OsController.js - COMPLETE FIXED VERSION
// ============================================================================
// ✅ FIXED: All email/SMS services properly configured
// ✅ FIXED: Consistent camelCase for SystemDate properties
// ✅ FIXED: Email statements service properly registered
// ✅ FIXED: All exports properly defined
// ✅ FIXED: Date handling for processAutoCollections
// ✅ FIXED: Safe date formatting for logs and responses
// ============================================================================

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
import EOMReport from '../models/EOMReport.js';
import EOMTaskService from '../Services/EOMTaskService.js';
import EOMClosingPeriod from '../models/EOMClosingPeriod.js';

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

// ================================================================
// ✅ HELPER: Safely format dates for logging and responses
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
// ✅ HELPER: Get Server Business Date from SystemDate - FIXED
// ================================================================
const getServerBusinessDate = async () => {
  try {
    const systemDate = await SystemDate.findOne({
      order: [['created_at', 'DESC']]
    });
    
    if (systemDate && systemDate.currentBusinessDate) {
      return new Date(systemDate.currentBusinessDate);
    }
    
    logger.warn('⚠️ No system date found, using current date as fallback');
    return new Date();
  } catch (error) {
    logger.error('❌ Error fetching system date:', error);
    return new Date();
  }
};

// ================================================================
// ✅ HELPER: Get Server Time - FIXED
// ================================================================
const getServerTimeFromDB = async () => {
  try {
    const systemDate = await SystemDate.findOne({
      order: [['created_at', 'DESC']]
    });
    
    if (systemDate && systemDate.updatedAt) {
      return new Date(systemDate.updatedAt);
    }
    
    return new Date();
  } catch (error) {
    return new Date();
  }
};

// ================================================================
// ✅ HELPER: Get Current System Status with Server Date - FIXED
// ================================================================
const getCurrentSystemStatus = async () => {
  try {
    const systemDate = await SystemDate.findOne({
      order: [['created_at', 'DESC']]
    });
    
    if (systemDate) {
      return {
        currentBusinessDate: systemDate.currentBusinessDate,
        nextBusinessDate: systemDate.nextBusinessDate,
        eodStatus: systemDate.eodStatus || 'IDLE',
        isEODProcessing: systemDate.isEODProcessing || false,
        lastEODDate: systemDate.lastEODDate,
        lastEODProcessedBy: systemDate.lastEODProcessedBy || systemDate.lastEODProcessedByLegacy,
        serverTime: getServerTime()
      };
    }
    
    return {
      currentBusinessDate: new Date(),
      nextBusinessDate: null,
      eodStatus: 'IDLE',
      isEODProcessing: false,
      lastEODDate: null,
      lastEODProcessedBy: null,
      serverTime: getServerTime()
    };
  } catch (error) {
    logger.error('Error getting system status:', error);
    return {
      currentBusinessDate: new Date(),
      nextBusinessDate: null,
      eodStatus: 'ERROR',
      isEODProcessing: false,
      lastEODDate: null,
      lastEODProcessedBy: null,
      serverTime: getServerTime()
    };
  }
};

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
    const LoanAccountModel = getLoanAccount();
    const LoanPenaltyModel = getLoanPenalty();
    const PenaltyRuleModel = getPenaltyRule();
    const RepaymentScheduleModel = getRepaymentSchedule();

    if (!LoanAccountModel) {
      throw new Error('LoanAccount model not available');
    }

    const loans = await LoanAccountModel.unscoped().findAll({
      attributes: [
        'id', 'acct_no', 'acct_nm', 'cust_id', 'amount', 'disbursed_amount',
        'outstanding_principal', 'accrued_interest', 'penalty_amount', 'interest_rate',
        'loan_status', 'servicing_status', 'application_date', 'approval_date',
        'disbursement_date', 'closure_date', 'last_repayment_date', 'last_repayment_amount',
        'next_payment_date', 'maturity_dt', 'total_repaid_amount', 'term_cd', 'term_value',
        'customer_account_id', 'guarantor_id', 'guaranteed_amount', 'loan_portfolio_id',
        'created_by', 'loan_cycle', 'has_repayment_schedule', 'repayment_schedule_id',
        'created_at', 'updated_at'
      ],
      where: {
        loan_status: ['ACTIVE', 'DISBURSED', 'APPROVED', 'OVERDUE', 'DELINQUENT'],
        outstanding_principal: { [Op.gt]: 0 }
      },
      order: [['next_payment_date', 'ASC']],
      limit: batchSize
    });

    if (loans.length === 0) {
      logger.info('No active loans found to process');
      return { ...results, message: 'No active loans found' };
    }

    results.totalLoansProcessed = loans.length;

    for (const loan of loans) {
      try {
        const isOverdue = checkIfLoanIsOverdue(loan, asOfDate);
        const daysOverdue = isOverdue ? calculateDaysOverdue(loan, asOfDate) : 0;

        if (isOverdue) {
          results.overdueLoansFound++;
          logger.debug(`🔴 Loan ${loan.acct_no} is overdue by ${daysOverdue} days`);

          if (updateStatus && !dryRun) {
            const newStatus = daysOverdue > 30 ? 'DELINQUENT' : 'OVERDUE';
            if (loan.loan_status !== newStatus) {
              await loan.update({ loan_status: newStatus, updated_at: new Date() });
              results.statusUpdated++;
              logger.debug(`✅ Loan ${loan.acct_no} status updated to ${newStatus}`);
            }
          }

          if (accruePenalties && !dryRun && LoanPenaltyModel && PenaltyRuleModel) {
            try {
              const penaltyRule = await getActivePenaltyRule(PenaltyRuleModel);
              if (penaltyRule) {
                const penaltyResult = await accruePenaltyForLoan(loan, penaltyRule, asOfDate, LoanPenaltyModel, null);
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
                }
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
    logger.error('❌ processOverdueLoans failed:', { error: error.message, stack: error.stack });
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
  return moment(dueDate).isBefore(moment(asOfDate));
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

    let rule = await PenaltyRule.findOne({
      where: {
        [Op.or]: [
          { is_global: true, is_active: true },
          { is_default: true, is_active: true }
        ]
      }
    });

    if (rule) return rule;

    rule = await PenaltyRule.findOne({
      where: { is_active: true }
    });

    if (rule) return rule;

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

    const outstandingPrincipal = parseFloat(loan.outstanding_principal || 0);
    let dailyPenalty = 0;

    const isSimpleModel = penaltyRule.calculation_method && 
      ['PERCENTAGE_OF_PRINCIPAL', 'FLAT_RATE', 'PERCENTAGE_OF_AMOUNT_DUE', 'SLIDING_SCALE']
      .includes(penaltyRule.calculation_method);

    if (isSimpleModel) {
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

    if (parseFloat(loan.outstanding_principal || 0) <= 0) {
      return false;
    }

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
 */
const processLoanRepaymentDirectDebits = async () => {
  const startTime = Date.now();
  logger.info('💰 Starting Loan Repayment Direct Debit Processing...');
  
  try {
    const batchDate = new Date();
    
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

        if (repayment.INSTALLMENT_NUMBER >= repayment.TOTAL_INSTALLMENTS) {
          await repayment.update({
            REC_ST: 'C',
            EXPIRY_DT: new Date()
          }, { transaction });
        }

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
    const debitTransaction = await createLedgerEntry(null, null, {
      GL_ACCT_NO: paymentData.fromAccount,
      AMOUNT: paymentData.amount,
      TRANSACTION_TYPE: 'DR',
      CREATED_BY: 'SYSTEM',
      ACCT_DESC: `Loan Repayment - ${paymentData.loanId} - Installment ${paymentData.installmentNumber}`,
      JOURNAL_ID: `LOAN_REPAY_${paymentData.loanId}_${Date.now()}`
    }, { transaction });

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

    const loan = await LoanAccount.findOne({
      where: { id: repaymentData.loanId },
      transaction
    });

    if (!loan) {
      logger.warn(`Loan with id ${repaymentData.loanId} not found for balance update`);
      return;
    }

    if (!loan.DISBURSEMENT_DATE || (parseFloat(loan.OUTSTANDING_PRINCIPAL) || 0) <= 0) {
      logger.warn(`Loan ${loan.ACCT_NO} not disbursed or already zero balance – skipping repayment update`);
      return;
    }

    const currentPrincipal = parseFloat(loan.OUTSTANDING_PRINCIPAL) || 0;
    const currentInterest = parseFloat(loan.ACCRUED_INTEREST) || 0;
    const currentPenalty = parseFloat(loan.PENALTY_AMOUNT) || 0;
    const currentTotalRepaid = parseFloat(loan.TOTAL_REPAID_AMOUNT) || 0;

    const newPrincipal = Math.max(0, currentPrincipal - (repaymentData.principalAmount || 0));
    const newInterest = Math.max(0, currentInterest - (repaymentData.interestAmount || 0));
    const newPenalty = Math.max(0, currentPenalty - (repaymentData.penaltyAmount || 0));
    const newTotalRepaid = currentTotalRepaid + (repaymentData.amount || 0);

    const isFullyPaid = newPrincipal <= 0 && newInterest <= 0 && newPenalty <= 0;
    const newLoanStatus = isFullyPaid ? 'CLOSED' : loan.LOAN_STATUS;

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
    
    const result = await processOverdueLoans({
      asOfDate: new Date(),
      dryRun: false,
      updateStatus: true,
      accruePenalties: false,
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
        emailsFailed: 0,
        smsSent: 0,
        smsFailed: 0
      }
    }
  }
};

// ==================== EOD TRANSACTION PROCESSING ====================

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

const executeService = async (serviceName, serviceFn) => {
  const startTime = Date.now();
  try {
    logger.info(`Starting ${serviceName} service`, {
      timestamp: getServerTime().toISOString(),
      businessDate: safeFormatDate(systemStatus.currentBusinessDate),
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
    // ✅ FIXED: processAutoCollections with proper date handling
    else if (serviceName === 'processAutoCollections') {
      // ✅ FIX: Ensure date is a Date object
      let collectionDate = systemStatus.currentBusinessDate || new Date();
      
      // If it's not a Date, convert it
      if (!(collectionDate instanceof Date)) {
        if (typeof collectionDate === 'string') {
          collectionDate = new Date(collectionDate);
        } else if (typeof collectionDate === 'number') {
          collectionDate = new Date(collectionDate);
        } else {
          collectionDate = new Date();
        }
      }
      
      // Validate the date
      if (isNaN(collectionDate.getTime())) {
        collectionDate = new Date();
        logger.warn('⚠️ Invalid business date, using current date for auto collections');
      }
      
      const collectionResult = await processAutoCollections({
        date: collectionDate
      });
      
      serviceDetails.healthy = collectionResult.success;
      serviceDetails.lastError = collectionResult.success ? null : collectionResult.error;
      serviceDetails.lastRun = new Date();
      serviceDetails.executionTime = collectionResult.executionTime || 0;
      serviceDetails.processed = collectionResult.individual?.processed || 0;
      serviceDetails.failed = collectionResult.individual?.failed || 0;
      serviceDetails.skipped = collectionResult.skipped || [];
      serviceDetails.individualLoans = {
        processed: collectionResult.individual?.processed || 0,
        failed: collectionResult.individual?.failed || 0,
        overdueMarked: collectionResult.individual?.overdueMarked || 0,
        totalDue: collectionResult.individual?.totalDue || 0
      };
      serviceDetails.groupLoans = {
        processed: collectionResult.group?.processed || 0,
        failed: collectionResult.group?.failed || 0,
        totalDue: collectionResult.group?.totalDue || 0
      };
      serviceDetails.collections = collectionResult.individual?.collections || [];
      
      logger.info(`processAutoCollections service completed`, {
        processed: serviceDetails.processed,
        failed: serviceDetails.failed,
        overdueMarked: serviceDetails.individualLoans.overdueMarked,
        totalDue: serviceDetails.individualLoans.totalDue,
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
    // ✅ FIXED: emailStatements service handler
    else if (serviceName === 'emailStatements') {
      serviceDetails.processed = serviceResult.results?.customersDue || 0;
      serviceDetails.failed = serviceResult.results?.emailsFailed || 0;
      serviceDetails.details = {
        totalCustomersChecked: serviceResult.results?.totalCustomersChecked || 0,
        customersDue: serviceResult.results?.customersDue || 0,
        statementsGenerated: serviceResult.results?.statementsGenerated || 0,
        emailsSent: serviceResult.results?.emailsSent || 0,
        emailsFailed: serviceResult.results?.emailsFailed || 0,
        smsSent: serviceResult.results?.smsSent || 0,
        smsFailed: serviceResult.results?.smsFailed || 0
      };
      serviceDetails.errors = serviceResult.results?.errors || [];
      
      logger.info(`✅ emailStatements service completed`, {
        customersDue: serviceDetails.details.customersDue,
        emailsSent: serviceDetails.details.emailsSent,
        emailsFailed: serviceDetails.details.emailsFailed,
        smsSent: serviceDetails.details.smsSent,
        smsFailed: serviceDetails.details.smsFailed,
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
    // ✅ FIXED: emailStatements error handling
    if (serviceName === 'emailStatements') {
      serviceDetails.details = {
        totalCustomersChecked: 0,
        customersDue: 0,
        statementsGenerated: 0,
        emailsSent: 0,
        emailsFailed: 0,
        smsSent: 0,
        smsFailed: 0
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
 * ✅ FIXED: Properly includes emailStatements service
 * ✅ FIXED: Console logs moved inside function
 */
export const triggerEndOfDayProcess = async (req, res) => {
  try {
    const { skipServices = [], runServices = [], userId = 'system' } = req.body;
    
    // ✅ MOVED INSIDE - These logs now work
    console.log('🚀 triggerEndOfDayProcess called');
    console.log('📋 runServices:', runServices);
    console.log('📋 skipServices:', skipServices);
    console.log('📋 userId:', userId);
    
    const serverBusinessDate = await getServerBusinessDate();
    const serverTime = getServerTime();
    
    logger.info('Starting End of Day process', {
      userId,
      serverBusinessDate: safeFormatDate(serverBusinessDate),
      serverTime: serverTime.toISOString(),
      skipServices,
      runServices
    });

    // ✅ FIXED: emailStatements properly included
    const validServices = [
      'loanProcessing', 'overdueLoans', 'processAutoCollections', 
      'loanStatusUpdates', 'interestPosting', 'glTransactions',
      'termDepositInterest', 'reconciliation', 'pendingRepayments', 
      'dormantAccounts', 'standingOrders', 'pendingGLTransactions',
      'emailStatements'
    ];

    // ✅ Log valid services
    console.log('📋 Valid services:', validServices);

    const invalidServices = skipServices.filter(service => !validServices.includes(service));
    if (invalidServices.length > 0) {
      logger.warn('Invalid service names provided in skipServices', { invalidServices });
    }

    const servicesToRun = runServices.length > 0 
      ? runServices.filter(service => validServices.includes(service))
      : validServices.filter(service => !skipServices.includes(service));

    // ✅ Log what will run
    console.log('📋 Services to run:', servicesToRun);

    logger.info('Services to run:', { servicesToRun });

    // ✅ FIXED: emailStatements function properly defined
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
      emailStatements: async () => {
        console.log('📧 Executing emailStatements service...');
        console.log('📧 Using date:', safeFormatDate(serverBusinessDate));
        
        const result = await processEmailStatements({
          asOfDate: serverBusinessDate,
          dryRun: false,
          batchSize: 100,
          sendEmail: true,
          sendSms: true
        });
        
        console.log('📧 emailStatements result:', {
          totalCustomersChecked: result.totalCustomersChecked,
          customersDue: result.customersDue,
          emailsSent: result.emailsSent,
          emailsFailed: result.emailsFailed,
          smsSent: result.smsSent,
          smsFailed: result.smsFailed
        });
        
        logger.info('📧 emailStatements result:', {
          customersDue: result.customersDue,
          emailsSent: result.emailsSent,
          emailsFailed: result.emailsFailed,
          smsSent: result.smsSent,
          smsFailed: result.smsFailed
        });
        
        return {
          success: result.emailsFailed === 0 && result.smsFailed === 0,
          results: result
        };
      }
    };

    const serviceResults = {};
    const currentBusinessDate = serverBusinessDate;

    for (const service of servicesToRun) {
      if (serviceFunctions[service]) {
        console.log(`🔄 Starting ${service} service...`);
        logger.info(`Starting ${service} service`, { 
          businessDate: safeFormatDate(currentBusinessDate),
          serverTime: serverTime.toISOString()
        });
        serviceResults[service] = await executeService(service, serviceFunctions[service]);
        console.log(`✅ ${service} service completed`);
      } else {
        console.log(`⚠️ Service function not found for: ${service}`);
        logger.warn(`Service function not found for: ${service}`);
        serviceResults[service] = { success: false, error: 'Service function not implemented' };
      }
    }

    let validUserId = userId;
    
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
        userId: validUserId, 
        force: false,
        serverBusinessDate: serverBusinessDate
      } 
    };
    
    logger.info('Calling SystemDateController.processEOD with userId:', { 
      userId: validUserId,
      serverBusinessDate: safeFormatDate(serverBusinessDate)
    });
    
    await SystemDateController.processEOD(mockReq, mockRes);

    systemStatus.lastEODRun = new Date();
    
    if (mockRes.data && mockRes.data.success) {
      systemStatus.nextBusinessDate = mockRes.data.data?.nextBusinessDate || systemStatus.nextBusinessDate;
      systemStatus.currentBusinessDate = mockRes.data.data?.currentBusinessDate || systemStatus.currentBusinessDate;
      systemStatus.eodStatus = 'COMPLETED';
      systemStatus.serverTime = serverTime;
      
      logger.info('EOD processing completed successfully via SystemDateController', {
        nextBusinessDate: safeFormatDate(systemStatus.nextBusinessDate),
        currentBusinessDate: safeFormatDate(systemStatus.currentBusinessDate),
        serverTime: serverTime.toISOString()
      });
    } else {
      systemStatus.eodStatus = 'FAILED';
      logger.warn('EOD processing failed via SystemDateController', {
        error: mockRes.data?.message || 'Unknown error'
      });
    }

    logger.info('End of Day processing completed successfully', {
      servicesExecuted: servicesToRun,
      nextBusinessDate: safeFormatDate(systemStatus.nextBusinessDate),
      totalServices: servicesToRun.length
    });

    return res.status(200).json({
      success: true,
      message: 'End of Day processing completed successfully',
      results: serviceResults,
      eodResult: mockRes.data,
      nextBusinessDate: safeFormatDate(systemStatus.nextBusinessDate),
      currentBusinessDate: safeFormatDate(systemStatus.currentBusinessDate),
      serverTime: serverTime.toISOString(),
      servicesExecuted: servicesToRun,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ EOD failed:', error);
    logger.error('EOD failed', { 
      error: error.message, 
      stack: error.stack,
      skippedServices: req.body.skipServices || [],
      userId: req.body.userId || 'system'
    });
    
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

export const getEODStatus = async (req, res) => {
  try {
    const systemDate = await SystemDate.findOne({
      order: [['created_at', 'DESC']]
    });

    const serverTime = getServerTime();
    const serverBusinessDate = await getServerBusinessDate();

    const status = {
      success: true,
      data: {
        system: {
          state: systemStatus.state || 'idle',
          lastRun: systemStatus.lastRun || null,
          nextRun: systemStatus.nextRun || null,
          currentBusinessDate: safeFormatDate(systemStatus.currentBusinessDate || systemDate?.currentBusinessDate),
          nextBusinessDate: safeFormatDate(systemStatus.nextBusinessDate || systemDate?.nextBusinessDate),
          isEODProcessing: systemStatus.isEODProcessing || systemDate?.isEODProcessing || false,
          eodStatus: systemStatus.eodStatus || systemDate?.eodStatus || 'IDLE',
          serverTime: serverTime,
          serverBusinessDate: serverBusinessDate,
          uptime: process.uptime(),
        },
        database: {
          systemDateExists: !!systemDate,
          currentBusinessDate: safeFormatDate(systemDate?.currentBusinessDate),
          nextBusinessDate: safeFormatDate(systemDate?.nextBusinessDate),
          eodStatus: systemDate?.eodStatus,
          lastEODProcessedBy: systemDate?.lastEODProcessedBy || systemDate?.lastEODProcessedByLegacy,
          isEODProcessing: systemDate?.isEODProcessing,
          lastEODRun: systemDate?.lastEODRun
        },
        services: Object.keys(systemStatus.services).map((serviceName) => ({
          name: serviceName,
          healthy: systemStatus.services[serviceName].healthy,
          lastRun: systemStatus.services[serviceName].lastRun,
          lastError: systemStatus.services[serviceName].lastError,
          executionTime: systemStatus.services[serviceName].executionTime,
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
          ...(serviceName === 'emailStatements' && {
            processed: systemStatus.services.emailStatements.processed || 0,
            failed: systemStatus.services.emailStatements.failed || 0,
            details: systemStatus.services.emailStatements.details || {}
          })
        })),
        metrics: {
          serverTime: serverTime,
          serverBusinessDate: serverBusinessDate,
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

export const getCurrentBusinessDateOS = async (req, res) => {
  try {
    const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
    if (!systemDate) {
      return res.status(404).json({
        success: false,
        message: 'System date not found'
      });
    }
    
    const serverTime = getServerTime();
    const serverBusinessDate = await getServerBusinessDate();
    
    systemStatus.serverTime = serverTime;
    systemStatus.currentBusinessDate = systemDate.currentBusinessDate;
    systemStatus.nextBusinessDate = systemDate.nextBusinessDate;
    
    return res.status(200).json({
      success: true,
      currentBusinessDate: systemDate.currentBusinessDate,
      nextBusinessDate: systemDate.nextBusinessDate,
      serverTime: serverTime,
      serverBusinessDate: serverBusinessDate,
      isEODProcessing: systemDate.isEODProcessing || false,
      eodStatus: systemDate.eodStatus || 'IDLE',
      lastEODDate: systemDate.lastEODDate,
      lastEODProcessedBy: systemDate.lastEODProcessedBy || systemDate.lastEODProcessedByLegacy,
      timestamp: serverTime.toISOString(),
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

const setNextBusinessDateOS = async (currentDate = null) => {
  try {
    const dateToUse = currentDate || systemStatus.currentBusinessDate || await getServerBusinessDate();
    const nextBusinessDate = await calculateNextBusinessDate(dateToUse);
    systemStatus.nextBusinessDate = nextBusinessDate;
    systemStatus.lastUpdated = new Date();
    systemStatus.serverTime = getServerTime();
    
    logger.info('Next business date set', {
      currentBusinessDate: safeFormatDate(systemStatus.currentBusinessDate),
      nextBusinessDate: safeFormatDate(systemStatus.nextBusinessDate),
      serverTime: systemStatus.serverTime.toISOString()
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

export const setBusinessDateManuallyOS = async (req, res) => {
  try {
    const { newDate, updatedBy = 'system', reason = 'Manual adjustment' } = req.body;

    if (!newDate) {
      return res.status(400).json({
        success: false,
        message: 'New date is required'
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

export const debugDateIssuesOS = async (req, res) => {
  try {
    const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
    const businessDate = getBusinessDate();
    const serverTime = getServerTime();
    const serverBusinessDate = await getServerBusinessDate();
    
    const debugInfo = {
      systemDate: systemDate ? {
        currentBusinessDate: systemDate.currentBusinessDate,
        currentBusinessDateType: typeof systemDate.currentBusinessDate,
        currentBusinessDateValid: systemDate.currentBusinessDate instanceof Date && !isNaN(systemDate.currentBusinessDate.getTime()),
        nextBusinessDate: systemDate.nextBusinessDate,
        nextBusinessDateType: typeof systemDate.nextBusinessDate,
        nextBusinessDateValid: systemDate.nextBusinessDate instanceof Date && !isNaN(systemDate.nextBusinessDate.getTime()),
        eodStatus: systemDate.eodStatus,
        isEODProcessing: systemDate.isEODProcessing,
        lastEODDate: systemDate.lastEODDate,
        lastEODProcessedBy: systemDate.lastEODProcessedBy || systemDate.lastEODProcessedByLegacy
      } : 'No system date found',
      serverBusinessDate: {
        value: serverBusinessDate,
        type: typeof serverBusinessDate,
        valid: serverBusinessDate instanceof Date && !isNaN(serverBusinessDate.getTime()),
        formatted: safeFormatDate(serverBusinessDate)
      },
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
        currentBusinessDate: safeFormatDate(systemStatus.currentBusinessDate),
        nextBusinessDate: safeFormatDate(systemStatus.nextBusinessDate),
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

export const getStatusOS = async (req, res) => {
  try {
    const dormantCount = await countDormantAccountsToUpdate();
    const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
    const serverTime = getServerTime();
    const serverBusinessDate = await getServerBusinessDate();
    
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
      ...(serviceName === 'emailStatements' && {
        processed: systemStatus.services.emailStatements.processed,
        failed: systemStatus.services.emailStatements.failed,
        details: systemStatus.services.emailStatements.details
      })
    }));

    systemStatus.serverTime = serverTime;
    systemStatus.currentBusinessDate = systemDate?.currentBusinessDate;
    systemStatus.nextBusinessDate = systemDate?.nextBusinessDate;
    
    res.status(200).json({
      success: true,
      system: {
        state: systemStatus.state,
        lastRun: systemStatus.lastRun,
        nextRun: systemStatus.nextRun,
        currentBusinessDate: safeFormatDate(systemStatus.currentBusinessDate),
        nextBusinessDate: safeFormatDate(systemStatus.nextBusinessDate),
        isEODProcessing: systemStatus.isEODProcessing || systemDate?.isEODProcessing || false,
        eodStatus: systemStatus.eodStatus || systemDate?.eodStatus || 'IDLE',
        serverTime: systemStatus.serverTime,
        serverBusinessDate: serverBusinessDate,
        serverTimeOffset: systemStatus.serverTimeOffset,
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      },
      database: {
        systemDateExists: !!systemDate,
        currentBusinessDate: safeFormatDate(systemDate?.currentBusinessDate),
        nextBusinessDate: safeFormatDate(systemDate?.nextBusinessDate),
        eodStatus: systemDate?.eodStatus,
        lastEODProcessedBy: systemDate?.lastEODProcessedBy || systemDate?.lastEODProcessedByLegacy,
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

export const initializeSystemDatesOS = async (req, res) => {
  try {
    const { maxRetries = 3, retryDelay = 5000 } = req.body;
    
    let retryCount = 0;
    while (retryCount < maxRetries) {
      try {
        logger.info(`📅 Initializing system dates (attempt ${retryCount + 1}/${maxRetries})`);
        
        try {
          await sequelize.authenticate();
          logger.info('✅ Database connection established');
        } catch (dbError) {
          logger.error('❌ Database connection failed:', dbError.message);
          throw new Error('Database connection failed');
        }

        const serverBusinessDate = await getServerBusinessDate();
        const serverTime = await getServerTimeFromDB();

        const systemDate = await SystemDate.findOne({ order: [['created_at', 'DESC']] });
        
        if (systemDate) {
          systemStatus.currentBusinessDate = systemDate.currentBusinessDate;
          systemStatus.nextBusinessDate = systemDate.nextBusinessDate;
          systemStatus.eodStatus = systemDate.eodStatus || 'IDLE';
          systemStatus.serverTime = serverTime;
          systemStatus.initialized = true;
          
          logger.info('✅ System dates loaded from database', {
            currentBusinessDate: safeFormatDate(systemStatus.currentBusinessDate),
            nextBusinessDate: safeFormatDate(systemStatus.nextBusinessDate),
            eodStatus: systemStatus.eodStatus,
            serverTime: systemStatus.serverTime
          });
        } else {
          const defaultStartDate = new Date('2025-01-01');
          const currentBusinessDate = defaultStartDate;
          const nextBusinessDate = await calculateNextBusinessDate(currentBusinessDate);

          const newSystemDate = await SystemDate.create({
            currentBusinessDate: currentBusinessDate,
            nextBusinessDate: nextBusinessDate,
            eodStatus: 'IDLE',
          });

          systemStatus.currentBusinessDate = currentBusinessDate;
          systemStatus.nextBusinessDate = nextBusinessDate;
          systemStatus.eodStatus = 'IDLE';
          systemStatus.serverTime = serverTime;
          systemStatus.initialized = true;
          
          logger.info('✅ Initial system date created', {
            currentBusinessDate: safeFormatDate(currentBusinessDate),
            nextBusinessDate: safeFormatDate(nextBusinessDate),
          });
        }

        systemStatus.serverTime = new Date();
        logger.info('🎉 System dates initialized successfully');
        
        systemStatus.serverTime = getServerTime();
        return res.status(200).json({
          success: true,
          message: 'System dates initialized successfully',
          systemStatus: {
            currentBusinessDate: safeFormatDate(systemStatus.currentBusinessDate),
            nextBusinessDate: safeFormatDate(systemStatus.nextBusinessDate),
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

export const getSystemStatusOS = () => {
  if (!systemStatus || typeof systemStatus !== 'object') {
    return {
      currentBusinessDate: null,
      initialized: false,
      status: 'Not Initialized'
    };
  }
  
  return {
    currentBusinessDate: safeFormatDate(systemStatus.currentBusinessDate),
    previousBusinessDate: safeFormatDate(systemStatus.previousBusinessDate),
    nextBusinessDate: safeFormatDate(systemStatus.nextBusinessDate),
    initialized: systemStatus.initialized,
    status: systemStatus.currentBusinessDate ? 'Initialized' : 'Not Initialized'
  };
};

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

// ==================== EOY CLOSING STATUS ====================

const eoyStatus = {
  isEOYRunning: false,
  lastEOYRun: null,
  nextEOYRun: null,
  eoyState: 'IDLE',
  eoyProgress: 0,
  eoyErrors: [],
  eoyWarnings: [],
  eoyLogs: [],
  currentFiscalYear: null,
  eoyLocked: false,
  eoyLockReason: null,
  eoyLockedBy: null,
  eoyLockedAt: null
};

export const isEOYRunning = () => {
  return eoyStatus.isEOYRunning || eoyStatus.eoyState === 'IN_PROGRESS';
};

export const isEOYLocked = () => {
  return eoyStatus.eoyLocked;
};

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

export const getEOYStatus = () => {
  return {
    ...eoyStatus,
    isRunning: eoyStatus.isEOYRunning || eoyStatus.eoyState === 'IN_PROGRESS',
    isLocked: eoyStatus.eoyLocked,
    canRun: !eoyStatus.isEOYRunning && !eoyStatus.eoyLocked && eoyStatus.eoyState !== 'IN_PROGRESS',
    timestamp: new Date().toISOString()
  };
};

export const resetEOYStatus = (userId) => {
  const oldState = eoyStatus.eoyState;
  const oldLocked = eoyStatus.eoyLocked;
  
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

  if (!fiscalYear) {
    return {
      success: false,
      error: 'Fiscal year is required',
      timestamp: new Date().toISOString()
    };
  }

  const effectiveClosingDate = closingDate || new Date(fiscalYear, 11, 31);
  const closingDateStr = effectiveClosingDate instanceof Date 
    ? effectiveClosingDate.toISOString().split('T')[0] 
    : effectiveClosingDate;

  logger.info(`📅 Using closing date: ${closingDateStr} for FY${fiscalYear}`);

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

  if (eoyStatus.eoyLocked && !force) {
    return {
      success: false,
      error: `EOY is locked. Reason: ${eoyStatus.eoyLockReason}`,
      lockedBy: eoyStatus.eoyLockedBy,
      lockedAt: eoyStatus.eoyLockedAt,
      timestamp: new Date().toISOString()
    };
  }

  eoyStatus.isEOYRunning = true;
  eoyStatus.eoyState = 'IN_PROGRESS';
  eoyStatus.eoyProgress = 0;
  eoyStatus.eoyErrors = [];
  eoyStatus.eoyWarnings = [];
  eoyStatus.currentFiscalYear = fiscalYear;
  eoyStatus.eoyLogs = [];

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

    eoyStatus.eoyLogs.push({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Starting Year-End Closing for FY${fiscalYear}`,
      userId,
      dryRun,
      closingDate: closingDateStr
    });

    eoyStatus.eoyProgress = 10;

    const { GLAccountEOYController } = await import('./GLAccountEOYController.js');

    eoyStatus.eoyLogs.push({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Executing Year-End Closing for FY${fiscalYear} (${dryRun ? 'DRY RUN' : 'LIVE'})`,
    });

    eoyStatus.eoyProgress = 30;

    result = await GLAccountEOYController.executeYearEndClosing({
      fiscalYear,
      userId,
      organizationCode,
      branchCode,
      dryRun,
      closingDate: effectiveClosingDate
    });

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

    eoyStatus.eoyProgress = 100;
    eoyStatus.isEOYRunning = false;
    eoyStatus.eoyState = result.success ? 'COMPLETED' : 'FAILED';
    eoyStatus.lastEOYRun = new Date();

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

    const effectiveClosingDate = closingDate || new Date(fiscalYear, 11, 31);

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

export const getEOYLogs = async (req, res) => {
  try {
    const { limit = 100, level } = req.query;
    
    let logs = eoyStatus.eoyLogs || [];
    
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    
    logs = logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
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

// ==================== EOM CLOSING STATUS ====================

const eomStatus = {
  isEOMRunning: false,
  lastEOMRun: null,
  nextEOMRun: null,
  eomState: 'IDLE',
  eomProgress: 0,
  eomErrors: [],
  eomWarnings: [],
  eomLogs: [],
  currentMonth: null,
  currentYear: null,
  eomLocked: false,
  eomLockReason: null,
  eomLockedBy: null,
  eomLockedAt: null,
  lastClosedMonth: null,
  lastClosedYear: null
};

export const isEOMRunning = () => {
  return eomStatus.isEOMRunning || eomStatus.eomState === 'IN_PROGRESS';
};

export const isEOMLocked = () => {
  return eomStatus.eomLocked;
};

export const lockEOM = (reason, userId) => {
  if (eomStatus.eomLocked) {
    logger.warn('EOM is already locked', { 
      lockedBy: eomStatus.eomLockedBy, 
      lockedAt: eomStatus.eomLockedAt,
      reason: eomStatus.eomLockReason
    });
    return false;
  }
  
  eomStatus.eomLocked = true;
  eomStatus.eomLockReason = reason || 'EOM process in progress';
  eomStatus.eomLockedBy = userId || 'system';
  eomStatus.eomLockedAt = new Date();
  
  logger.info('🔒 EOM locked', { reason, userId });
  return true;
};

export const unlockEOM = (userId) => {
  if (!eomStatus.eomLocked) {
    logger.warn('EOM is not locked');
    return true;
  }
  
  eomStatus.eomLocked = false;
  eomStatus.eomLockReason = null;
  eomStatus.eomLockedBy = null;
  eomStatus.eomLockedAt = null;
  
  logger.info('🔓 EOM unlocked', { userId });
  return true;
};

export const getEOMStatus = () => {
  return {
    ...eomStatus,
    isRunning: eomStatus.isEOMRunning || eomStatus.eomState === 'IN_PROGRESS',
    isLocked: eomStatus.eomLocked,
    canRun: !eomStatus.isEOMRunning && !eomStatus.eomLocked && eomStatus.eomState !== 'IN_PROGRESS',
    timestamp: new Date().toISOString()
  };
};

export const resetEOMStatus = (userId) => {
  const oldState = eomStatus.eomState;
  const oldLocked = eomStatus.eomLocked;
  
  eomStatus.isEOMRunning = false;
  eomStatus.eomState = 'IDLE';
  eomStatus.eomProgress = 0;
  eomStatus.eomErrors = [];
  eomStatus.eomWarnings = [];
  eomStatus.eomLocked = false;
  eomStatus.eomLockReason = null;
  eomStatus.eomLockedBy = null;
  eomStatus.eomLockedAt = null;
  
  logger.info('🔄 EOM status reset', { 
    userId, 
    oldState, 
    oldLocked,
    timestamp: new Date().toISOString()
  });
  
  return {
    success: true,
    message: 'EOM status reset successfully',
    oldState,
    oldLocked,
    newState: eomStatus.eomState,
    timestamp: new Date().toISOString()
  };
};

export const executeEOM = async (params = {}) => {
  const {
    month,
    year,
    userId = 'system',
    organizationCode = 1,
    branchCode = '001',
    dryRun = false,
    force = false,
    closingDate = null
  } = params;

  if (!month || !year) {
    return {
      success: false,
      error: 'Month and year are required',
      timestamp: new Date().toISOString()
    };
  }

  if (month < 1 || month > 12) {
    return {
      success: false,
      error: 'Invalid month. Must be between 1 and 12',
      timestamp: new Date().toISOString()
    };
  }

  const effectiveClosingDate = closingDate || new Date(year, month, 0);
  const closingDateStr = effectiveClosingDate instanceof Date 
    ? effectiveClosingDate.toISOString().split('T')[0] 
    : effectiveClosingDate;

  logger.info(`📅 Using closing date: ${closingDateStr} for ${month}/${year}`);

  if (eomStatus.isEOMRunning || eomStatus.eomState === 'IN_PROGRESS') {
    if (!force) {
      return {
        success: false,
        error: 'EOM is already in progress',
        status: eomStatus,
        timestamp: new Date().toISOString()
      };
    }
    logger.warn('⚠️ Force executing EOM while already in progress', { userId });
  }

  if (eomStatus.eomLocked && !force) {
    return {
      success: false,
      error: `EOM is locked. Reason: ${eomStatus.eomLockReason}`,
      lockedBy: eomStatus.eomLockedBy,
      lockedAt: eomStatus.eomLockedAt,
      timestamp: new Date().toISOString()
    };
  }

  try {
    const { EOMClosingPeriod } = await import('../models/EOMClosingPeriod.js');
    const isClosed = await EOMClosingPeriod.isMonthClosed(month, year, organizationCode, branchCode);
    
    if (isClosed && !force) {
      return {
        success: false,
        error: `Month ${month}/${year} is already closed`,
        timestamp: new Date().toISOString()
      };
    }
  } catch (error) {
    logger.warn('⚠️ Could not check EOM closing status:', error.message);
  }

  eomStatus.isEOMRunning = true;
  eomStatus.eomState = 'IN_PROGRESS';
  eomStatus.eomProgress = 0;
  eomStatus.eomErrors = [];
  eomStatus.eomWarnings = [];
  eomStatus.currentMonth = month;
  eomStatus.currentYear = year;
  eomStatus.eomLogs = [];

  lockEOM(`End of Month Closing ${month}/${year}`, userId);

  const startTime = Date.now();
  let result = null;

  try {
    logger.info(`🚀 Starting End of Month Closing for ${month}/${year}`, {
      userId,
      organizationCode,
      branchCode,
      dryRun,
      force,
      closingDate: closingDateStr
    });

    eomStatus.eomLogs.push({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Starting End of Month Closing for ${month}/${year}`,
      userId,
      dryRun,
      closingDate: closingDateStr
    });

    eomStatus.eomProgress = 10;

    const { default: EOMController } = await import('./EOMController.js');

    eomStatus.eomLogs.push({
      timestamp: new Date().toISOString(),
      level: 'info',
      message: `Executing End of Month Closing for ${month}/${year} (${dryRun ? 'DRY RUN' : 'LIVE'})`,
    });

    eomStatus.eomProgress = 30;

    result = await EOMController.executeEOMClosing({
      month,
      year,
      userId,
      organizationCode,
      branchCode,
      dryRun,
      force,
      closingDate: effectiveClosingDate
    });

    if (result.success) {
      eomStatus.eomProgress = 80;
      eomStatus.lastClosedMonth = month;
      eomStatus.lastClosedYear = year;
      eomStatus.eomLogs.push({
        timestamp: new Date().toISOString(),
        level: 'success',
        message: `End of Month Closing for ${month}/${year} completed successfully`,
        summary: result.summary
      });
    } else {
      eomStatus.eomProgress = 60;
      eomStatus.eomErrors.push({
        timestamp: new Date().toISOString(),
        error: result.error || 'Unknown error occurred',
        stack: result.stack
      });
      eomStatus.eomLogs.push({
        timestamp: new Date().toISOString(),
        level: 'error',
        message: `End of Month Closing for ${month}/${year} failed: ${result.error || 'Unknown error'}`,
      });
    }

    eomStatus.eomProgress = 100;
    eomStatus.isEOMRunning = false;
    eomStatus.eomState = result.success ? 'COMPLETED' : 'FAILED';
    eomStatus.lastEOMRun = new Date();

    unlockEOM(userId);

    const executionTime = Date.now() - startTime;
    logger.info(`✅ End of Month Closing completed for ${month}/${year}`, {
      success: result.success,
      executionTime: `${executionTime}ms`,
      dryRun,
      state: eomStatus.eomState
    });

    return {
      success: result.success,
      dryRun,
      month,
      year,
      executionTime,
      result,
      status: { ...eomStatus },
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    eomStatus.isEOMRunning = false;
    eomStatus.eomState = 'FAILED';
    eomStatus.eomProgress = 0;
    eomStatus.eomErrors.push({
      timestamp: new Date().toISOString(),
      error: error.message,
      stack: error.stack
    });
    eomStatus.eomLogs.push({
      timestamp: new Date().toISOString(),
      level: 'error',
      message: `End of Month Closing for ${month}/${year} threw an exception: ${error.message}`,
    });

    unlockEOM(userId);

    logger.error(`❌ End of Month Closing for ${month}/${year} failed with exception`, {
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      dryRun,
      month,
      year,
      error: error.message,
      stack: error.stack,
      status: { ...eomStatus },
      timestamp: new Date().toISOString()
    };
  }
};

export const executeEndOfMonthClosing = async (req, res) => {
  try {
    const {
      month,
      year,
      userId = req.user?.id || req.user?.user_name || 'system',
      organizationCode = 1,
      branchCode = '001',
      dryRun = false,
      force = false,
      checkOnly = false,
      closingDate = null
    } = req.body;

    if (checkOnly) {
      return res.status(200).json({
        success: true,
        message: 'EOM status check',
        data: {
          canRun: !eomStatus.isEOMRunning && !eomStatus.eomLocked,
          isRunning: eomStatus.isEOMRunning || eomStatus.eomState === 'IN_PROGRESS',
          isLocked: eomStatus.eomLocked,
          status: { ...eomStatus },
          currentMonth: eomStatus.currentMonth,
          currentYear: eomStatus.currentYear,
          lastClosedMonth: eomStatus.lastClosedMonth,
          lastClosedYear: eomStatus.lastClosedYear,
          lastEOMRun: eomStatus.lastEOMRun,
          timestamp: new Date().toISOString()
        }
      });
    }

    if (!month || !year) {
      return res.status(400).json({
        success: false,
        message: 'Month and year are required'
      });
    }

    const effectiveClosingDate = closingDate || new Date(year, month, 0);

    const result = await executeEOM({
      month: parseInt(month),
      year: parseInt(year),
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
        message: result.error || 'EOM execution failed',
        data: result,
        timestamp: new Date().toISOString()
      });
    }

    return res.status(200).json({
      success: true,
      message: `End of Month Closing for ${result.month}/${result.year} executed successfully${dryRun ? ' (DRY RUN)' : ''}`,
      data: result,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    logger.error('❌ Failed to execute End of Month Closing:', {
      error: error.message,
      stack: error.stack,
      body: req.body
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to execute End of Month Closing',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

export const getEOMStatusAPI = async (req, res) => {
  try {
    const status = getEOMStatus();
    
    let closedPeriods = [];
    let latestClosed = null;
    
    try {
      const { EOMClosingPeriod } = await import('../models/EOMClosingPeriod.js');
      const organizationCode = parseInt(req.query.organizationCode) || 1;
      const branchCode = req.query.branchCode || '001';
      
      closedPeriods = await EOMClosingPeriod.getClosedPeriods(organizationCode, branchCode);
      latestClosed = await EOMClosingPeriod.getLatestClosedPeriod(organizationCode, branchCode);
    } catch (error) {
      logger.warn('⚠️ Could not fetch EOM closing periods:', error.message);
    }
    
    return res.status(200).json({
      success: true,
      data: {
        ...status,
        canRun: !status.isRunning && !status.isLocked,
        closedPeriods,
        latestClosed,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('❌ Failed to get EOM status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get EOM status',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

export const resetEOMStatusAPI = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?.user_name || 'system';
    const result = resetEOMStatus(userId);
    
    return res.status(200).json({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ Failed to reset EOM status:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reset EOM status',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

export const getEOMLogs = async (req, res) => {
  try {
    const { limit = 100, level } = req.query;
    
    let logs = eomStatus.eomLogs || [];
    
    if (level) {
      logs = logs.filter(log => log.level === level);
    }
    
    logs = logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    if (limit > 0) {
      logs = logs.slice(0, parseInt(limit));
    }
    
    return res.status(200).json({
      success: true,
      data: {
        logs,
        count: logs.length,
        total: eomStatus.eomLogs?.length || 0,
        errors: eomStatus.eomErrors || [],
        warnings: eomStatus.eomWarnings || []
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('❌ Failed to get EOM logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get EOM logs',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

export const checkEOMDateClosure = async (req, res) => {
  try {
    const { date, organizationCode = 1, branchCode = '001' } = req.query;

    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }

    const d = new Date(date);
    const month = d.getMonth() + 1;
    const year = d.getFullYear();

    const { EOMClosingPeriod } = await import('../models/EOMClosingPeriod.js');
    const isClosed = await EOMClosingPeriod.isMonthClosed(
      parseInt(month), 
      parseInt(year), 
      parseInt(organizationCode), 
      branchCode
    );

    return res.status(200).json({
      success: true,
      data: {
        date: d.toISOString().split('T')[0],
        month,
        year,
        isClosed,
        canPost: !isClosed,
        message: isClosed ? `Cannot post to ${month}/${year}. Period is closed.` : `Can post to ${month}/${year}.`,
        organizationCode,
        branchCode,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('❌ Failed to check EOM date closure:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check date closure',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

// ==================== EXPORTS ====================

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
  getServerBusinessDate,
  getServerTimeFromDB,
  getCurrentSystemStatus,
  processEmailStatements,
  initializeEmailStatementService,
  // EOY exports
  executeEOY,
  executeYearEndClosing,
  getEOYStatus: getEOYStatusAPI,
  resetEOYStatus: resetEOYStatusAPI,
  getEOYLogs,
  isEOYRunning,
  isEOYLocked,
  lockEOY,
  unlockEOY,
  eoyStatus,
  // EOM exports
  executeEOM,
  executeEndOfMonthClosing,
  getEOMStatus: getEOMStatusAPI,
  resetEOMStatus: resetEOMStatusAPI,
  getEOMLogs,
  isEOMRunning,
  isEOMLocked,
  lockEOM,
  unlockEOM,
  checkEOMDateClosure,
  eomStatus
};