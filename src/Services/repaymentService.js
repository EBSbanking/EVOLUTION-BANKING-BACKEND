// src/services/loanRepaymentService.js (partial – add these imports and helpers)

import Holiday from '../models/Holiday.js';
import configurationService from '../Services/ConfigurationService.js';
import RepaymentSchedule from '../models/RepaymentSchedule.js';
import { Op } from 'sequelize';

// Helper: Check if a date is a weekend (Saturday = 6, Sunday = 0)
const isWeekend = (date) => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

// Helper: Check if a date is a holiday (using the Holiday model)
const isHoliday = async (date, country = 'NG') => {
  const holiday = await Holiday.isHoliday(date, { country });
  return !!holiday;
};

// Helper: Get the next working day (skip weekends and holidays)
const getNextWorkingDay = async (date, country = 'NG') => {
  let nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + 1);
  while ((await isHoliday(nextDate, country)) || isWeekend(nextDate)) {
    nextDate.setDate(nextDate.getDate() + 1);
  }
  return nextDate;
};

// ========== UPDATED FUNCTION ==========
export const generateRepaymentSchedule = async (loanAccount, TERM_VALUE, DISBURSEMENT_DATE, INTEREST_RATE) => {
  if (!loanAccount) {
    console.error('LoanAccount is not defined or is invalid');
    throw new Error('LoanAccount is not defined or invalid');
  }

  console.log('Generating repayment schedule for loan account:', loanAccount);

  const { ACCT_NO, DISBURSEMENT_LIMIT } = loanAccount;

  try {
    // Check global policy – skip repayments on holidays/weekends?
    const skipHoliday = await configurationService.get('skip_repayment_on_holiday', true);
    const country = 'NG'; // can be made configurable per loan or customer

    // Calculate total interest and EMI
    const totalInterest = DISBURSEMENT_LIMIT * (INTEREST_RATE / 100);
    const totalAmountToBeRepaid = DISBURSEMENT_LIMIT + totalInterest;
    const EMI = totalAmountToBeRepaid / TERM_VALUE;

    const repaymentSchedules = [];
    let remainingPrincipal = DISBURSEMENT_LIMIT;
    const interestForMonth = DISBURSEMENT_LIMIT * (INTEREST_RATE / 100 / 12);
    let dueDate = new Date(DISBURSEMENT_DATE);

    for (let i = 1; i <= TERM_VALUE; i++) {
      const principalForMonth = EMI - interestForMonth;
      remainingPrincipal -= principalForMonth;
      if (i === TERM_VALUE) remainingPrincipal = 0;

      // --- Holiday / weekend adjustment ---
      let effectiveDueDate = new Date(dueDate);
      if (skipHoliday) {
        while ((await isHoliday(effectiveDueDate, country)) || isWeekend(effectiveDueDate)) {
          effectiveDueDate.setDate(effectiveDueDate.getDate() + 1);
        }
      }

      repaymentSchedules.push({
        ACCT_NO,
        installmentNo: i,
        dueDate: effectiveDueDate.toISOString().split('T')[0], // YYYY-MM-DD
        principal: Math.round(principalForMonth * 100) / 100,
        interest: Math.round(interestForMonth * 100) / 100,
        totalPayment: Math.round(EMI * 100) / 100,
        // Optionally store original date and adjustment reason
        originalDueDate: dueDate.toISOString().split('T')[0],
        adjustmentReason: skipHoliday && (effectiveDueDate.getTime() !== dueDate.getTime()) ? 'Holiday/Weekend skip' : null
      });

      // Move to next month (based on the original schedule, not the adjusted date)
      dueDate.setMonth(dueDate.getMonth() + 1);
    }

    // Save all schedules to the database using Sequelize's bulkCreate
    await RepaymentSchedule.bulkCreate(repaymentSchedules);

    console.log('Repayment schedule generated and saved successfully');
    return repaymentSchedules;
  } catch (error) {
    console.error('Error generating repayment schedule:', error);
    throw new Error('Error generating repayment schedule: ' + error.message);
  }
};