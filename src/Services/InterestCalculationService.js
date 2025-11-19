import { Decimal } from 'decimal.js';
import Holidays from 'date-holidays';
import LoanAccount from '../models/LoanAccount.js';
import RateIndex from '../models/Rate-Index.js';
import LoanInterestRate from '../models/LoanInterestRate.js';

export default class InterestCalculationService {
  constructor() {
    try {
      this.holidays = new Holidays('NG'); // Nigeria holiday calendar
    } catch (error) {
      console.warn('Holiday calendar initialization failed, using fallback:', error.message);
      this.holidays = null;
    }
  }

  /**
 * Calculate simple accrued interest for a given rateIndex
 * @param {Object} params - Calculation parameters
 * @param {number} params.rateIndexId - Rate index ID
 * @param {number} params.principal - Principal amount
 * @param {Date|string} params.startDate - Start date
 * @param {Date|string} params.endDate - End date
 * @returns {Object} Calculation results
 */
async calculateInterest({ rateIndexId, principal, startDate, endDate }) {
  try {
    // Enhanced input validation
    if (!rateIndexId || typeof rateIndexId !== 'number' || rateIndexId <= 0) {
      throw new Error('rateIndexId must be a valid positive number');
    }
    
    if (!principal || principal <= 0) {
      throw new Error('Principal must be greater than 0');
    }
    
    if (!startDate || !endDate) {
      throw new Error('Both startDate and endDate are required');
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid startDate or endDate format');
    }
    
    if (end <= start) {
      throw new Error('endDate must be after startDate');
    }

    // Fetch rate index
    const rateIndex = await RateIndex.findOne({ INDEX_RATE_ID: rateIndexId });
    if (!rateIndex) {
      throw new Error(`Rate Index ${rateIndexId} not found`);
    }

    const { 
      INDEX_RATE, 
      PRECISION = 2, 
      DAY_COUNT_CONVENTION = 'ACTUAL/365' 
    } = rateIndex;

    if (!INDEX_RATE || isNaN(INDEX_RATE) || INDEX_RATE < 0) {
      throw new Error('Invalid INDEX_RATE in rate index');
    }

    // Calculate days between dates
    const daysBetween = this.calculateDaysBetween(start, end, DAY_COUNT_CONVENTION);
    
    // Calculate year basis based on convention
    const yearBasis = this.calculateYearBasis(start, end, DAY_COUNT_CONVENTION);

    // Calculate interest
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
  } catch (error) {
    console.error('Error in calculateInterest:', error);
    throw error;
  }
}

/**
 * Calculate days between two dates based on day count convention
 */
calculateDaysBetween(start, end, convention) {
  const msPerDay = 1000 * 60 * 60 * 24;
  let days = Math.floor((end - start) / msPerDay);
  
  // Some conventions might adjust for business days or specific rules
  if (convention === 'ACTUAL/360' || convention === 'ACTUAL/365') {
    return days;
  }
  
  // Add handling for other conventions like 30/360 if needed
  return days;
}

/**
 * Calculate year basis for day count convention
 */
calculateYearBasis(start, end, convention) {
  switch (convention) {
    case 'ACTUAL/360':
      return 360;
    case 'ACTUAL/365':
      // More accurate leap year handling
      const startYear = start.getFullYear();
      const endYear = end.getFullYear();
      
      // If period spans multiple years, use weighted average
      if (startYear === endYear) {
        return this.isLeapYear(startYear) ? 366 : 365;
      } else {
        // For multi-year periods, this should be more sophisticated
        return 365; // Simplified approach
      }
    default:
      return 365;
  }
}

/**
 * Check if year is a leap year
 */
isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}
  /**
   * EMI calculation using reducing balance method
   */
  calculateEMI(params) {
    try {
      this._validateEMIParams(params);

      const { principal, annualRate, termMonths, startDate, precision = 2 } = params;
      const monthlyRate = new Decimal(annualRate).div(100).div(12);

      // EMI formula: P * r * (1+r)^n / ((1+r)^n - 1)
      const numerator = new Decimal(principal)
        .times(monthlyRate)
        .times(Decimal.pow(Decimal.add(1, monthlyRate), termMonths));

      const denominator = Decimal.pow(Decimal.add(1, monthlyRate), termMonths).minus(1);

      const emi = numerator.div(denominator)
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

      const totalInterest = installments.reduce((sum, i) => sum + i.interest, 0);

      return {
        emi,
        totalInterest,
        totalPayment: new Decimal(emi).times(termMonths).toDecimalPlaces(precision).toNumber(),
        installments,
        calculationDate: new Date()
      };
    } catch (error) {
      console.error('Error in calculateEMI:', error);
      throw error;
    }
  }

  /**
   * Flat rate calculation method
   */
  calculateFlatRate(params) {
    try {
      this._validateEMIParams(params);

      const { principal, annualRate, termMonths, startDate, precision = 2 } = params;
      const monthlyRate = new Decimal(annualRate).div(100).div(12);

      // Flat rate calculation: Total interest = Principal * monthly rate * term
      const totalInterest = new Decimal(principal)
        .times(monthlyRate)
        .times(termMonths)
        .toDecimalPlaces(precision)
        .toNumber();

      const totalPayment = new Decimal(principal).plus(totalInterest).toDecimalPlaces(precision).toNumber();
      const monthlyPayment = new Decimal(totalPayment).div(termMonths).toDecimalPlaces(precision).toNumber();

      const installments = this._generateFlatRateSchedule(
        principal,
        annualRate,
        termMonths,
        monthlyPayment,
        startDate,
        precision
      );

      return {
        monthlyPayment,
        totalInterest,
        totalPayment,
        installments,
        calculationDate: new Date()
      };
    } catch (error) {
      console.error('Error in calculateFlatRate:', error);
      throw error;
    }
  }

  /**
   * Combined loan repayment calculation with method choice
   */
  calculateLoanRepayment(params) {
    const { method = 'reducing', ...calculationParams } = params;

    if (method === 'flat') {
      return this.calculateFlatRate(calculationParams);
    } else {
      return this.calculateEMI(calculationParams);
    }
  }

  /**
   * Generate amortization schedule for reducing balance method
   */
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
      
      // Handle final payment adjustment for rounding errors
      let adjustedPrincipal = principalPayment;
      let adjustedEMI = emi;
      let adjustedBalance = balance.toNumber();

      if (isFinalPayment) {
        adjustedPrincipal = balance.plus(principalPayment).toNumber();
        adjustedBalance = 0;
        adjustedEMI = adjustedPrincipal + interest;
      }

      const dueDate = this._calculateDueDate(baseDate, i);

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

  /**
   * Generate payment schedule for flat rate method
   */
  _generateFlatRateSchedule(principal, annualRate, termMonths, monthlyPayment, startDate, precision) {
    const schedule = [];
    const monthlyRate = new Decimal(annualRate).div(100).div(12);
    const baseDate = startDate ? new Date(startDate) : new Date();
    let balance = new Decimal(principal);

    for (let i = 1; i <= termMonths; i++) {
      // Flat rate: interest is calculated on original principal every month
      const interest = new Decimal(principal).times(monthlyRate).toDecimalPlaces(precision).toNumber();
      const principalPayment = new Decimal(monthlyPayment).minus(interest).toDecimalPlaces(precision).toNumber();

      balance = balance.minus(principalPayment);

      const isFinalPayment = i === termMonths;
      
      // Handle final payment adjustment
      let adjustedPrincipal = principalPayment;
      let adjustedEMI = monthlyPayment;
      let adjustedBalance = balance.toNumber();

      if (isFinalPayment) {
        adjustedPrincipal = balance.plus(principalPayment).toNumber();
        adjustedBalance = 0;
        adjustedEMI = adjustedPrincipal + interest;
      }

      const dueDate = this._calculateDueDate(baseDate, i);

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

  /**
   * Calculate due date with holiday adjustment
   */
  _calculateDueDate(baseDate, monthOffset) {
    const dueDate = new Date(baseDate);
    dueDate.setMonth(dueDate.getMonth() + monthOffset);

    // Skip holidays if holiday calendar is available
    if (this.holidays) {
      while (this.holidays.isHoliday(dueDate)) {
        dueDate.setDate(dueDate.getDate() + 1);
      }
    }

    return dueDate;
  }

  /**
   * Validate EMI calculation parameters
   */
  _validateEMIParams(params) {
    const { principal, annualRate, termMonths, startDate, precision } = params;

    if (typeof principal !== 'number' || principal <= 0) {
      throw new Error('Principal must be a positive number');
    }
    if (typeof annualRate !== 'number' || annualRate < 0) {
      throw new Error('Annual rate must be a non-negative number');
    }
    if (typeof termMonths !== 'number' || termMonths <= 0 || !Number.isInteger(termMonths)) {
      throw new Error('Term must be a positive integer (months)');
    }
    if (startDate && !(startDate instanceof Date) && isNaN(new Date(startDate).getTime())) {
      throw new Error('Start date must be a valid Date object or string');
    }
    if (precision && (typeof precision !== 'number' || precision < 0 || !Number.isInteger(precision))) {
      throw new Error('Precision must be a non-negative integer');
    }
  }

  /**
   * Calculate daily interest for overdue payments
   */
  calculateDailyPenalty(principal, annualPenaltyRate, overdueDays, precision = 2) {
    try {
      if (typeof principal !== 'number' || principal <= 0) {
        throw new Error('Principal must be a positive number');
      }
      if (typeof annualPenaltyRate !== 'number' || annualPenaltyRate < 0) {
        throw new Error('Annual penalty rate must be a non-negative number');
      }
      if (typeof overdueDays !== 'number' || overdueDays < 0) {
        throw new Error('Overdue days must be a non-negative number');
      }

      const dailyRate = new Decimal(annualPenaltyRate).div(100).div(365);
      const penalty = new Decimal(principal)
        .times(dailyRate)
        .times(overdueDays)
        .toDecimalPlaces(precision)
        .toNumber();

      return {
        principal,
        annualPenaltyRate,
        overdueDays,
        dailyPenaltyRate: dailyRate.times(100).toNumber(),
        penalty,
        totalAmount: principal + penalty
      };
    } catch (error) {
      console.error('Error in calculateDailyPenalty:', error);
      throw error;
    }
  }

  /**
   * Compare different calculation methods
   */
  compareMethods(params) {
    const emiResult = this.calculateEMI(params);
    const flatResult = this.calculateFlatRate(params);

    return {
      emi: emiResult,
      flatRate: flatResult,
      comparison: {
        monthlyPaymentDifference: flatResult.monthlyPayment - emiResult.emi,
        totalInterestDifference: flatResult.totalInterest - emiResult.totalInterest,
        totalPaymentDifference: flatResult.totalPayment - emiResult.totalPayment,
        interestSavings: flatResult.totalInterest - emiResult.totalInterest,
        recommendedMethod: emiResult.totalInterest < flatResult.totalInterest ? 'emi' : 'flat'
      }
    };
  }
}

// Export utility functions for direct use
export const calculateEMI = (params) => new InterestCalculationService().calculateEMI(params);
export const calculateFlatRate = (params) => new InterestCalculationService().calculateFlatRate(params);
export const calculateLoanRepayment = (params) => new InterestCalculationService().calculateLoanRepayment(params);
export const calculateInterest = (params) => new InterestCalculationService().calculateInterest(params);