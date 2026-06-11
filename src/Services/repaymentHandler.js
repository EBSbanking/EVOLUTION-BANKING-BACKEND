// src/Services/repaymentHandler.js - FINAL (holiday/weekend skip + model getters)
import { Op } from 'sequelize';
import {
  initializeModels,
  getLoanAccount,
  getCustomerAccount,
  getLoanRepayment,
  getGLAccount,
  getRepaymentSchedule
} from '../models/index.js';
import sequelize from '../../config/db.js';
import logger from '../utils/logger.js';
import Holiday from '../models/Holiday.js';
import configurationService from '../Services/ConfigurationService.js';

// ========== HOLIDAY HELPER FUNCTIONS ==========
const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

const isHoliday = async (date, country = 'NG') => {
  try {
    const holiday = await Holiday.isHoliday(date, { country });
    return !!holiday;
  } catch (error) {
    logger.error('Error checking holiday:', error);
    return false;
  }
};

const getNextWorkingDay = async (date, country = 'NG') => {
  let nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  while ((await isHoliday(nextDate, country)) || isWeekend(nextDate)) {
    nextDate.setDate(nextDate.getDate() + 1);
  }
  return nextDate;
};
// =============================================

/**
 * Process pending loan repayments
 */
export const processPendingRepayments = async () => {
  await initializeModels();

  const LoanRepayment = getLoanRepayment();
  const LoanAccount = getLoanAccount();
  const CustomerAccount = getCustomerAccount();
  const GLAccount = getGLAccount();
  const RepaymentSchedule = getRepaymentSchedule();

  let transaction;

  try {
    logger.info('🔄 Processing pending loan repayments...');
    transaction = await sequelize.transaction();

    const pendingRepayments = await LoanRepayment.findAll({
      where: {
        status: 'PENDING',
        repayment_date: { [Op.lte]: new Date() }
      },
      transaction
    });

    const results = { processed: [], failed: [], skipped: [] };
    logger.info(`Found ${pendingRepayments.length} pending repayments`);

    if (pendingRepayments.length === 0) {
      await transaction.commit();
      return { success: true, count: 0, ...results };
    }

    for (const repayment of pendingRepayments) {
      try {
        const canProcess = await validateRepayment(repayment, transaction, LoanAccount, CustomerAccount);
        if (!canProcess.valid) {
          results.skipped.push({ repaymentId: repayment.id, reason: canProcess.reason });
          continue;
        }
        const processResult = await processRepayment(
          repayment, transaction, LoanAccount, CustomerAccount, GLAccount, RepaymentSchedule
        );
        if (processResult.success) {
          await repayment.update({ status: 'COMPLETED', updatedAt: new Date() }, { transaction });
          results.processed.push({ repaymentId: repayment.id, amount: repayment.total_amount });
        } else {
          await repayment.update({ status: 'FAILED', updatedAt: new Date() }, { transaction });
          results.failed.push({ repaymentId: repayment.id, error: processResult.error });
        }
      } catch (error) {
        await repayment.update({ status: 'FAILED', updatedAt: new Date() }, { transaction });
        results.failed.push({ repaymentId: repayment.id, error: error.message });
      }
    }

    await transaction.commit();
    logger.info('✅ Pending repayments completed', { processed: results.processed.length, failed: results.failed.length });
    return { success: true, count: results.processed.length, ...results };
  } catch (error) {
    if (transaction) await transaction.rollback();
    logger.error('❌ Failed to process pending repayments', { error: error.message });
    throw error;
  }
};

const validateRepayment = async (repayment, transaction, LoanAccount, CustomerAccount) => {
  try {
    const loanAccount = await LoanAccount.findOne({
      where: {
        ACCT_NO: repayment.loan_account_number,
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'DISBURSED', 'APPROVED'] }
      },
      transaction
    });
    if (!loanAccount) return { valid: false, reason: 'Loan account not active' };

    const customerAccount = await CustomerAccount.findOne({
      where: { customer_id: repayment.customer_id, REC_ST: 'ACTIVE' },
      transaction
    });
    if (!customerAccount) return { valid: false, reason: 'Customer account not found' };

    const availableBalance = parseFloat(customerAccount.AVAILABLE_BALANCE || 0);
    if (availableBalance < repayment.total_amount) {
      return { valid: false, reason: `Insufficient balance. Required: ${repayment.total_amount}, Available: ${availableBalance}` };
    }
    return { valid: true, loanAccount, customerAccount };
  } catch (error) {
    return { valid: false, reason: `Validation error: ${error.message}` };
  }
};

const processRepayment = async (repayment, transaction, LoanAccount, CustomerAccount, GLAccount, RepaymentSchedule) => {
  try {
    const validation = await validateRepayment(repayment, transaction, LoanAccount, CustomerAccount);
    if (!validation.valid) return { success: false, error: validation.reason };

    const { loanAccount, customerAccount } = validation;
    const repaymentAmount = parseFloat(repayment.total_amount || 0);

    // 1. Deduct from customer account
    const newCustomerBalance = parseFloat(customerAccount.AVAILABLE_BALANCE || 0) - repaymentAmount;
    await customerAccount.update({
      AVAILABLE_BALANCE: newCustomerBalance,
      ledger_balance: newCustomerBalance,
      lastActivityDate: new Date()
    }, { transaction });

    // 2. Update loan account balances
    const outstandingPrincipal = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0);
    const accruedInterest = parseFloat(loanAccount.ACCRUED_INTEREST || 0);
    const penaltyAmount = parseFloat(loanAccount.PENALTY_AMOUNT || 0);

    let remainingAmount = repaymentAmount;
    const penaltyPaid = Math.min(penaltyAmount, remainingAmount);
    const newPenalty = penaltyAmount - penaltyPaid;
    remainingAmount -= penaltyPaid;

    const interestPaid = Math.min(accruedInterest, remainingAmount);
    const newInterest = accruedInterest - interestPaid;
    remainingAmount -= interestPaid;

    const principalPaid = Math.min(outstandingPrincipal, remainingAmount);
    const newPrincipal = outstandingPrincipal - principalPaid;

    const updateData = {
      OUTSTANDING_PRINCIPAL: newPrincipal,
      ACCRUED_INTEREST: newInterest,
      PENALTY_AMOUNT: newPenalty,
      TOTAL_REPAID_AMOUNT: (parseFloat(loanAccount.TOTAL_REPAID_AMOUNT || 0) + repaymentAmount),
      LAST_REPAYMENT_DATE: new Date(),
      LAST_REPAYMENT_AMOUNT: repaymentAmount,
      LAST_PAYMENT_METHOD: repayment.paymentMethod || 'AUTO_DEBIT'
    };

    if (loanAccount.NEXT_PAYMENT_DATE) {
      updateData.NEXT_PAYMENT_DATE = calculateNextPaymentDate(loanAccount, new Date());
    }

    if (newPrincipal <= 0 && newInterest <= 0 && newPenalty <= 0) {
      updateData.LOAN_STATUS = 'PAID';
      updateData.CLOSURE_DATE = new Date();
    }

    await loanAccount.update(updateData, { transaction });

    // Update repayment schedule if exists
    await updateRepaymentSchedule(repayment, loanAccount, transaction, RepaymentSchedule);

    // Create GL transaction
    await createGLTransaction(repayment, loanAccount, customerAccount, transaction, GLAccount);

    return { success: true, amount: repaymentAmount, principalPaid, interestPaid, penaltyPaid };
  } catch (error) {
    logger.error(`Error processing repayment ${repayment.id}:`, error);
    return { success: false, error: error.message };
  }
};

const updateRepaymentSchedule = async (repayment, loanAccount, transaction, RepaymentSchedule) => {
  if (!RepaymentSchedule) return;
  try {
    const schedule = await RepaymentSchedule.findOne({
      where: {
        account_number: repayment.loan_account_number,
        status: 'PENDING',
        is_schedule_complete: false
      },
      transaction
    });
    if (!schedule) return;

    if (typeof schedule.markInstallmentPaid === 'function') {
      const currentInstallment = schedule.getCurrentInstallment?.();
      if (currentInstallment) {
        await schedule.markInstallmentPaid(
          currentInstallment.installmentNo,
          repayment.transaction_reference,
          transaction
        );
        logger.info(`✅ Updated repayment schedule - marked installment ${currentInstallment.installmentNo} as paid`);
      }
    } else {
      const installments = schedule.installments_json || [];
      const nextIndex = installments.findIndex(inst => inst.status === 'PENDING');
      if (nextIndex >= 0) {
        installments[nextIndex].status = 'PAID';
        installments[nextIndex].paidDate = new Date();
        installments[nextIndex].transactionReference = repayment.transaction_reference;
        const allPaid = installments.every(inst => inst.status === 'PAID');
        await schedule.update({
          installments_json: installments,
          schedule: installments,
          status: allPaid ? 'COMPLETED' : 'PENDING',
          is_schedule_complete: allPaid,
          updated_at: new Date()
        }, { transaction });
        logger.info(`✅ Updated repayment schedule for account ${repayment.loan_account_number}`);
      }
    }
  } catch (error) {
    logger.error('Error updating repayment schedule:', error);
  }
};

const createGLTransaction = async (repayment, loanAccount, customerAccount, transaction, GLAccount) => {
  if (!GLAccount) return;
  try {
    await GLAccount.create({
      account_number: customerAccount.account_number,
      amount: repayment.total_amount,
      transaction_type: 'DEBIT',
      date: new Date(),
      description: `Loan repayment for account ${repayment.loan_account_number}`,
      reference: repayment.transaction_reference,
      status: 'COMPLETED'
    }, { transaction });
    await GLAccount.create({
      account_number: 'LOAN_RECEIVABLE',
      amount: repayment.total_amount,
      transaction_type: 'CREDIT',
      date: new Date(),
      description: `Loan repayment received for ${repayment.loan_account_number}`,
      reference: repayment.transaction_reference,
      status: 'COMPLETED'
    }, { transaction });
    logger.debug(`✅ GL transactions created for repayment ${repayment.transaction_reference}`);
  } catch (error) {
    logger.error('Error creating GL transaction:', error);
  }
};

/**
 * Loan repayment service (for manual repayments) - WITH HOLIDAY SKIP
 */
export const repayLoanService = async (loanAcctNo, amount, depositAcctNo) => {
  await initializeModels();
  const LoanAccount = getLoanAccount();
  const CustomerAccount = getCustomerAccount();
  const LoanRepayment = getLoanRepayment();
  const GLAccount = getGLAccount();
  const RepaymentSchedule = getRepaymentSchedule();

  let transaction;

  try {
    if (!loanAcctNo || !depositAcctNo || !amount || amount <= 0) {
      throw new Error('Invalid repayment request');
    }

    transaction = await sequelize.transaction();

    const loanAccount = await LoanAccount.findOne({
      where: { ACCT_NO: loanAcctNo },
      transaction
    });
    if (!loanAccount) throw new Error('Loan account not found');

    const customerDeposit = await CustomerAccount.findOne({
      where: { account_number: depositAcctNo },
      transaction
    });
    if (!customerDeposit) throw new Error('Customer deposit account not found');

    if (loanAccount.CUST_ID !== customerDeposit.customer_id?.toString()) {
      throw new Error('Customer does not own this loan');
    }

    const outstandingBalance = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0) +
                              parseFloat(loanAccount.ACCRUED_INTEREST || 0) +
                              parseFloat(loanAccount.PENALTY_AMOUNT || 0);

    if (outstandingBalance <= 0) throw new Error('No outstanding loan balance');
    if (amount > outstandingBalance) throw new Error('Amount exceeds outstanding balance');

    const availableBalance = parseFloat(customerDeposit.AVAILABLE_BALANCE || 0);
    if (availableBalance < amount) throw new Error('Insufficient funds');

    // Holiday skip logic
    let skipHoliday = true;
    try {
      skipHoliday = await configurationService.get('skip_repayment_on_holiday', true);
    } catch (configError) {
      logger.warn('Could not read skip_repayment_on_holiday config, defaulting to true', configError);
    }

    let effectiveRepaymentDate = new Date();
    if (skipHoliday) {
      const country = 'NG';
      const isDateHoliday = await isHoliday(effectiveRepaymentDate, country);
      if (isDateHoliday || isWeekend(effectiveRepaymentDate)) {
        const originalDate = new Date(effectiveRepaymentDate);
        effectiveRepaymentDate = await getNextWorkingDay(effectiveRepaymentDate, country);
        logger.info(`Repayment date moved from ${originalDate.toISOString()} to ${effectiveRepaymentDate.toISOString()} due to holiday/weekend.`);
      }
    }

    // Debit deposit account
    await customerDeposit.update({
      AVAILABLE_BALANCE: availableBalance - amount,
      ledger_balance: availableBalance - amount,
      cleared_balance: availableBalance - amount,
      lastActivityDate: new Date()
    }, { transaction });

    // Allocate payment
    let remainingAmount = amount;
    const penaltyAmount = parseFloat(loanAccount.PENALTY_AMOUNT || 0);
    const penaltyPaid = Math.min(penaltyAmount, remainingAmount);
    remainingAmount -= penaltyPaid;

    const interestAmount = parseFloat(loanAccount.ACCRUED_INTEREST || 0);
    const interestPaid = Math.min(interestAmount, remainingAmount);
    remainingAmount -= interestPaid;

    const principalAmount = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0);
    const principalPaid = Math.min(principalAmount, remainingAmount);

    const newPrincipal = principalAmount - principalPaid;
    const newInterest = interestAmount - interestPaid;
    const newPenalty = penaltyAmount - penaltyPaid;

    // Update loan account
    const updateData = {
      OUTSTANDING_PRINCIPAL: newPrincipal,
      ACCRUED_INTEREST: newInterest,
      PENALTY_AMOUNT: newPenalty,
      TOTAL_REPAID_AMOUNT: (parseFloat(loanAccount.TOTAL_REPAID_AMOUNT || 0) + amount),
      LAST_REPAYMENT_DATE: effectiveRepaymentDate,
      LAST_REPAYMENT_AMOUNT: amount
    };

    if (newPrincipal <= 0 && newInterest <= 0 && newPenalty <= 0) {
      updateData.LOAN_STATUS = 'PAID';
      updateData.CLOSURE_DATE = effectiveRepaymentDate;
    }

    await loanAccount.update(updateData, { transaction });

    // Record repayment
    const repayment = await LoanRepayment.create({
      loan_account_number: loanAcctNo,
      loan_account_id: loanAccount.id,
      customer_id: loanAccount.CUST_ID,
      principal_amount: principalPaid,
      interest_amount: interestPaid,
      total_amount: amount,
      repayment_date: effectiveRepaymentDate,
      transaction_reference: `REPAY-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      status: 'COMPLETED',
      customer_name: customerDeposit.customer_name,
      penalty_amount: penaltyPaid,
      createdAt: effectiveRepaymentDate,
      updatedAt: effectiveRepaymentDate
    }, { transaction });

    // Update repayment schedule
    await updateRepaymentSchedule(repayment, loanAccount, transaction, RepaymentSchedule);

    // Create GL transactions
    await createGLTransaction(repayment, loanAccount, customerDeposit, transaction, GLAccount);

    await transaction.commit();

    logger.info(`✅ Loan repayment processed for account ${loanAcctNo}`, {
      amount,
      principalPaid,
      interestPaid,
      penaltyPaid,
      effectiveDate: effectiveRepaymentDate
    });

    return {
      success: true,
      message: 'Loan repayment successful',
      repaymentId: repayment.id,
      reference: repayment.transaction_reference,
      loanAccount: {
        accountNo: loanAccount.ACCT_NO,
        previousBalance: outstandingBalance,
        newBalance: newPrincipal + newInterest + newPenalty
      },
      allocation: { principalPaid, interestPaid, penaltyPaid, totalPaid: amount }
    };
  } catch (error) {
    if (transaction) await transaction.rollback();
    logger.error('❌ Loan repayment failed:', { error: error.message });
    throw error;
  }
};

/**
 * Calculate next payment date
 */
const calculateNextPaymentDate = (loanAccount, currentDate) => {
  const nextDate = new Date(currentDate);
  const termCd = loanAccount.TERM_CD || 'MONTHLY';
  const termValue = loanAccount.TERM_VALUE || 1;
  const addMap = {
    'DAILY': () => nextDate.setDate(nextDate.getDate() + termValue),
    'WEEKLY': () => nextDate.setDate(nextDate.getDate() + (7 * termValue)),
    'MONTHLY': () => nextDate.setMonth(nextDate.getMonth() + termValue),
    'QUARTERLY': () => nextDate.setMonth(nextDate.getMonth() + (3 * termValue)),
    'YEARLY': () => nextDate.setFullYear(nextDate.getFullYear() + termValue)
  };
  (addMap[termCd] || addMap['MONTHLY'])();
  return nextDate;
};

/**
 * Get repayment statistics
 */
export const getRepaymentStatistics = async (startDate, endDate) => {
  await initializeModels();
  const LoanRepayment = getLoanRepayment();
  try {
    const stats = await LoanRepayment.findAll({
      where: {
        repayment_date: { [Op.between]: [startDate, endDate] },
        status: 'COMPLETED'
      },
      attributes: [
        [sequelize.fn('DATE', sequelize.col('repayment_date')), 'repaymentDate'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalRepayments'],
        [sequelize.fn('SUM', sequelize.col('total_amount')), 'totalAmount'],
        [sequelize.fn('AVG', sequelize.col('total_amount')), 'averageAmount']
      ],
      group: [sequelize.fn('DATE', sequelize.col('repayment_date'))],
      order: [[sequelize.fn('DATE', sequelize.col('repayment_date')), 'DESC']]
    });
    return {
      success: true,
      dailyStats: stats,
      summary: {
        totalRepayments: stats.reduce((s, i) => s + parseInt(i.dataValues.totalRepayments || 0), 0),
        totalAmount: stats.reduce((s, i) => s + parseFloat(i.dataValues.totalAmount || 0), 0)
      }
    };
  } catch (error) {
    logger.error('Error getting repayment statistics:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Generate repayment schedule - WITH HOLIDAY SKIP
 */
export const generateRepaymentSchedule = async (loanAccount, TERM_VALUE, DISBURSEMENT_DATE, INTEREST_RATE) => {
  await initializeModels();
  const RepaymentSchedule = getRepaymentSchedule();

  if (!loanAccount) throw new Error('LoanAccount is not defined');
  const accountNumber = loanAccount.ACCT_NO || loanAccount.account_number;
  const disbursementLimit = parseFloat(loanAccount.DISBURSEMENT_LIMIT || 0);

  try {
    const totalInterest = disbursementLimit * (INTEREST_RATE / 100);
    const totalAmountToBeRepaid = disbursementLimit + totalInterest;
    const EMI = totalAmountToBeRepaid / TERM_VALUE;
    const interestForMonth = disbursementLimit * (INTEREST_RATE / 100 / 12);

    let skipHoliday = true;
    try {
      skipHoliday = await configurationService.get('skip_repayment_on_holiday', true);
    } catch (configError) {
      logger.warn('Could not read skip_repayment_on_holiday config, defaulting to true', configError);
    }
    const country = 'NG';

    const installments = [];
    let dueDate = new Date(DISBURSEMENT_DATE);

    for (let i = 1; i <= TERM_VALUE; i++) {
      const principalForMonth = EMI - interestForMonth;
      let effectiveDueDate = new Date(dueDate);
      if (skipHoliday) {
        while ((await isHoliday(effectiveDueDate, country)) || isWeekend(effectiveDueDate)) {
          effectiveDueDate.setDate(effectiveDueDate.getDate() + 1);
        }
      }
      installments.push({
        installmentNo: i,
        dueDate: effectiveDueDate.toISOString().split('T')[0],
        principal: Math.round(principalForMonth * 100) / 100,
        interest: Math.round(interestForMonth * 100) / 100,
        totalPayment: Math.round(EMI * 100) / 100,
        status: 'PENDING',
        paidAmount: 0,
        originalDueDate: dueDate.toISOString().split('T')[0],
        adjustmentReason: (skipHoliday && (effectiveDueDate.getTime() !== dueDate.getTime())) ? 'Holiday/Weekend skip' : null
      });
      dueDate.setMonth(dueDate.getMonth() + 1);
    }

    if (RepaymentSchedule?.createSchedule) {
      await RepaymentSchedule.createSchedule({
        account_number: accountNumber,
        id: loanAccount.id,
        CUST_ID: loanAccount.CUST_ID,
        a_m_o_u_n_t: disbursementLimit,
        start_date: DISBURSEMENT_DATE
      }, installments);
    }

    return installments;
  } catch (error) {
    logger.error('Error generating repayment schedule:', error);
    throw error;
  }
};

export default {
  processPendingRepayments,
  repayLoanService,
  getRepaymentStatistics,
  generateRepaymentSchedule
};