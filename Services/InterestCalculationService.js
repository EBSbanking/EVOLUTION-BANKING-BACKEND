import { Decimal } from 'decimal.js';
import Holidays from 'date-holidays';
import LoanAccount from '../models/LoanAccount.js';
import RateIndex from '../models/Rate-Index.js';
import LoanInterestRate from '../models/loanInterestRate.js';

export default class InterestCalculationService {
  constructor() {
    this.holidays = new Holidays('NG'); // Nigeria holiday calendar
  }

  /**
   * Calculate simple accrued interest for a given rateIndex
   */
  async calculateInterest({ rateIndexId, principal, startDate, endDate }) {
    if (!rateIndexId || typeof rateIndexId !== 'number') {
      throw new Error('rateIndexId must be a valid number');
    }
    if (!principal || principal <= 0) {
      throw new Error('Principal must be greater than 0');
    }
    if (!startDate || !endDate) {
      throw new Error('Both startDate and endDate are required');
    }

    const rateIndex = await RateIndex.findOne({ INDEX_RATE_ID: rateIndexId });
    if (!rateIndex) {
      throw new Error(`Rate Index ${rateIndexId} not found`);
    }

    const { INDEX_RATE, PRECISION = 2, DAY_COUNT_CONVENTION } = rateIndex;

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (end <= start) {
      throw new Error('endDate must be after startDate');
    }

    const msPerDay = 1000 * 60 * 60 * 24;
    const daysBetween = Math.floor((end - start) / msPerDay);

    
        // Day-count convention handling
    let yearBasis = 365;
    if (DAY_COUNT_CONVENTION === 'ACTUAL/360') {
      yearBasis = 360;
    } else if (DAY_COUNT_CONVENTION === 'ACTUAL/365') {
      // check if period falls in a leap year
      const isLeap = (year) => (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
      if (isLeap(start.getFullYear()) || isLeap(end.getFullYear())) {
        yearBasis = 366;
      }
    }


    const annualRate = new Decimal(INDEX_RATE).div(100);
    const interest = new Decimal(principal)
      .times(annualRate)
      .times(daysBetween)
      .div(yearBasis)
      .toDecimalPlaces(PRECISION)
      .toNumber();

    return {
      principal,
      annualRate: INDEX_RATE,
      dayCountConvention: DAY_COUNT_CONVENTION,
      daysBetween,
      startDate: start,
      endDate: end,
      interest,
      totalAmount: principal + interest,
      calculationDate: new Date()
    };
  }

  /**
   * EMI calculation using reducing balance method
   */
  calculateEMI(params) {
    this._validateEMIParams(params);

    const { principal, annualRate, termMonths, startDate, precision = 2 } = params;
    const monthlyRate = new Decimal(annualRate).div(100).div(12);

    const emi = new Decimal(principal)
      .times(monthlyRate)
      .times(Decimal.pow(Decimal.add(1, monthlyRate), termMonths))
      .div(Decimal.pow(Decimal.add(1, monthlyRate), termMonths).minus(1))
      .toDecimalPlaces(precision)
      .toNumber();

    const installments = this._generateAmortizationSchedule(
      principal,
      annualRate,
      termMonths,
      emi,
      startDate,
      precision
    );

    return {
      emi,
      totalInterest: installments.reduce((sum, i) => sum + i.interest, 0),
      totalPayment: emi * termMonths,
      installments,
      calculationDate: new Date()
    };
  }

  _generateAmortizationSchedule(principal, annualRate, termMonths, emi, startDate, precision) {
    const schedule = [];
    let balance = new Decimal(principal);
    const monthlyRate = new Decimal(annualRate).div(100).div(12);
    const baseDate = startDate ? new Date(startDate) : new Date();

    for (let i = 1; i <= termMonths; i++) {
      const interest = balance.times(monthlyRate).toDecimalPlaces(precision).toNumber();
      const principalPayment = new Decimal(emi).minus(interest).toDecimalPlaces(precision).toNumber();

      balance = balance.minus(principalPayment);

      const isFinalPayment = i === termMonths;
      const adjustedPrincipal = isFinalPayment ? balance.plus(principalPayment).toNumber() : principalPayment;
      const adjustedBalance = isFinalPayment ? 0 : balance.toNumber();
      const adjustedEMI = isFinalPayment ? adjustedPrincipal + interest : emi;

      // Generate due date
      const dueDate = new Date(baseDate);
      dueDate.setMonth(dueDate.getMonth() + i);

      // Skip holidays: push to next working day
      while (this.holidays.isHoliday(dueDate)) {
        dueDate.setDate(dueDate.getDate() + 1);
      }

      schedule.push({
        installmentNo: i,
        dueDate,
        principal: adjustedPrincipal,
        interest,
        totalPayment: adjustedEMI,
        remainingBalance: adjustedBalance,
        isFinalInstallment: isFinalPayment
      });

      if (isFinalPayment) break;
    }

    return schedule;
  }

  _validateEMIParams(params) {
    const { principal, annualRate, termMonths } = params;

    if (typeof principal !== 'number' || principal <= 0) {
      throw new Error('Principal must be a positive number');
    }
    if (typeof annualRate !== 'number' || annualRate < 0) {
      throw new Error('Annual rate must be a non-negative number');
    }
    if (typeof termMonths !== 'number' || termMonths <= 0 || !Number.isInteger(termMonths)) {
      throw new Error('Term must be a positive integer (months)');
    }
    if (params.startDate && !(params.startDate instanceof Date)) {
      throw new Error('Start date must be a valid Date object');
    }
  }
}
