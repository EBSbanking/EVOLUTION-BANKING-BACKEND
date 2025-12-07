// src/services/InterestCalculationService.js
import { Decimal } from 'decimal.js';
import Holidays from 'date-holidays';
import moment from 'moment';
import mongoose from 'mongoose';
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
   * ==================== CORE INTEREST CALCULATION METHODS ====================
   */

  /**
   * Calculate interest using rate index configuration
   */
  async calculateInterest({ rateIndexId, principal, startDate, endDate, precision = 4 }) {
    try {
      // Input validation
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
        PRECISION = 4, 
        DAY_COUNT_CONVENTION = 'ACTUAL/365' 
      } = rateIndex;

      if (!INDEX_RATE || isNaN(INDEX_RATE) || INDEX_RATE < 0) {
        throw new Error('Invalid INDEX_RATE in rate index');
      }

      // Calculate days between dates (considering business days)
      const daysBetween = this.calculateBusinessDaysBetween(start, end);
      
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
        success: true,
        data: {
          principal,
          annualRate: INDEX_RATE,
          dayCountConvention: DAY_COUNT_CONVENTION,
          daysBetween,
          businessDays: daysBetween,
          startDate: start,
          endDate: end,
          interest,
          totalAmount: principal + interest,
          calculationDate: new Date()
        }
      };
    } catch (error) {
      console.error('Error in calculateInterest:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * ==================== LOAN INTEREST CALCULATION WITH CAPITALIZATION ====================
   */

  /**
   * Calculate loan interest with capitalization support
   */
  async calculateLoanInterest({ 
    loanAccountData, 
    interestConfig, 
    calculationDate, 
    includePenalties = false,
    precision = 4 
  }) {
    try {
      // Validate inputs
      if (!loanAccountData || !loanAccountData.PRINCIPAL_AMOUNT) {
        throw new Error('Loan account data with PRINCIPAL_AMOUNT is required');
      }
      
      if (!interestConfig) {
        throw new Error('Interest rate configuration is required');
      }

      const effectiveDate = calculationDate ? new Date(calculationDate) : new Date();
      const lastCalcDate = loanAccountData.lastInterestCalculationDate || 
                          loanAccountData.disbursementDate || 
                          loanAccountData.CREATED_DT;
      
      // Calculate days elapsed (business days)
      const daysElapsed = this.calculateBusinessDaysBetween(new Date(lastCalcDate), effectiveDate);
      
      if (daysElapsed <= 0) {
        throw new Error('No business days have elapsed since last calculation');
      }

      const principal = parseFloat(loanAccountData.PRINCIPAL_AMOUNT.toString());
      const annualRate = parseFloat(interestConfig.ABSOLUTE_RATE.toString());

      // Calculate interest based on accrual basis
      let interestAmount = 0;
      let calculationMethod = '';
      
      switch (interestConfig.ACCRUAL_BASIS_TY?.toUpperCase()) {
        case 'DAILY':
          interestAmount = this.calculateDailyInterest(principal, annualRate, daysElapsed, precision);
          calculationMethod = 'DAILY_ACCRUAL';
          break;
          
        case 'MONTHLY':
          const monthsElapsed = daysElapsed / 30;
          interestAmount = this.calculateMonthlyInterest(principal, annualRate, monthsElapsed, precision);
          calculationMethod = 'MONTHLY_ACCRUAL';
          break;
          
        case 'WEEKLY':
          const weeksElapsed = daysElapsed / 7;
          interestAmount = this.calculateWeeklyInterest(principal, annualRate, weeksElapsed, precision);
          calculationMethod = 'WEEKLY_ACCRUAL';
          break;
          
        default:
          // Default to daily calculation
          interestAmount = this.calculateDailyInterest(principal, annualRate, daysElapsed, precision);
          calculationMethod = 'DAILY_ACCRUAL';
      }

      // Calculate penalties if enabled
      let penaltyAmount = 0;
      if (includePenalties && loanAccountData.overdueDays > 0) {
        penaltyAmount = this.calculateDailyPenalty(
          principal,
          loanAccountData.penaltyRate || interestConfig.PENALTY_RATE || 5,
          loanAccountData.overdueDays,
          precision
        ).penalty;
      }

      // Check for capitalization
      let capitalizationApplied = false;
      let capitalizedAmount = 0;
      let newPrincipal = principal;
      
      if (interestConfig.CAPITALIZE_INTEREST === true) {
        const shouldCapitalize = await this.shouldApplyCapitalization(interestConfig, daysElapsed);
        
        if (shouldCapitalize) {
          capitalizedAmount = interestAmount;
          capitalizationApplied = true;
          newPrincipal = principal + capitalizedAmount;
          
          // Reset interest since it's been capitalized
          interestAmount = 0;
        }
      }

      return {
        success: true,
        data: {
          calculationDate: effectiveDate,
          daysElapsed,
          interestRate: annualRate,
          interestAmount,
          penaltyAmount,
          capitalizationApplied,
          capitalizedAmount,
          calculationMethod,
          newPrincipal,
          totalAccrued: interestAmount + penaltyAmount,
          businessDayCount: daysElapsed
        }
      };
    } catch (error) {
      console.error('Error in calculateLoanInterest:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * ==================== EMI AND REPAYMENT CALCULATIONS ====================
   */

  /**
   * EMI calculation using reducing balance method
   */
  calculateEMI({ principal, annualRate, termMonths, startDate, precision = 2 }) {
    try {
      this._validateEMIParams({ principal, annualRate, termMonths, startDate, precision });

      const monthlyRate = new Decimal(annualRate).div(100).div(12);

      // EMI formula: P * r * (1+r)^n / ((1+r)^n - 1)
      const onePlusR = Decimal.add(1, monthlyRate);
      const powTerm = Decimal.pow(onePlusR, termMonths);
      
      const numerator = new Decimal(principal)
        .times(monthlyRate)
        .times(powTerm);

      const denominator = powTerm.minus(1);

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
        success: true,
        data: {
          monthlyPayment: emi,
          totalInterest,
          totalRepayment: new Decimal(emi).times(termMonths).toDecimalPlaces(precision).toNumber(),
          installments,
          method: 'reducing_balance',
          calculationDate: new Date(),
          effectiveAnnualRate: this.calculateEffectiveAnnualRate(annualRate, 12)
        }
      };
    } catch (error) {
      console.error('Error in calculateEMI:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Flat rate calculation method
   */
  calculateFlatRate({ principal, annualRate, termMonths, startDate, precision = 2 }) {
    try {
      this._validateEMIParams({ principal, annualRate, termMonths, startDate, precision });

      const monthlyRate = new Decimal(annualRate).div(100).div(12);

      // Flat rate calculation
      const totalInterest = new Decimal(principal)
        .times(monthlyRate)
        .times(termMonths)
        .toDecimalPlaces(precision)
        .toNumber();

      const totalRepayment = new Decimal(principal).plus(totalInterest).toDecimalPlaces(precision).toNumber();
      const monthlyPayment = new Decimal(totalRepayment).div(termMonths).toDecimalPlaces(precision).toNumber();

      const installments = this._generateFlatRateSchedule(
        principal,
        annualRate,
        termMonths,
        monthlyPayment,
        startDate,
        precision
      );

      return {
        success: true,
        data: {
          monthlyPayment,
          totalInterest,
          totalRepayment,
          installments,
          method: 'flat_rate',
          calculationDate: new Date(),
          effectiveAnnualRate: this.calculateEffectiveAnnualRate(annualRate, 12)
        }
      };
    } catch (error) {
      console.error('Error in calculateFlatRate:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate interest capitalization amount
   */
  calculateCapitalizationAmount(principal, accruedInterest, capitalizationRate = null, capitalizationType = 'FULL') {
    try {
      if (capitalizationRate) {
        // If a specific capitalization rate is provided
        return new Decimal(accruedInterest)
          .times(capitalizationRate)
          .div(100)
          .toDecimalPlaces(4)
          .toNumber();
      }
      
      // Based on capitalization type
      switch (capitalizationType?.toUpperCase()) {
        case 'PARTIAL':
          // Capitalize only a portion (e.g., 50%)
          return new Decimal(accruedInterest)
            .times(0.5)
            .toDecimalPlaces(4)
            .toNumber();
            
        case 'MINIMUM':
          // Capitalize minimum of interest or threshold
          const threshold = new Decimal(principal).times(0.01); // 1% threshold
          return Decimal.min(accruedInterest, threshold)
            .toDecimalPlaces(4)
            .toNumber();
            
        case 'FULL':
        default:
          // Capitalize all accrued interest
          return new Decimal(accruedInterest)
            .toDecimalPlaces(4)
            .toNumber();
      }
    } catch (error) {
      console.error('Error in calculateCapitalizationAmount:', error);
      return 0;
    }
  }

  /**
   * ==================== SPECIALIZED INTEREST CALCULATIONS ====================
   */

  /**
   * Calculate interest by product type with different frequencies
   */
  calculateInterestByProductType({ 
    principal, 
    annualRate, 
    duration, 
    productType, 
    precision = 4 
  }) {
    try {
      let effectiveRate, periods, interest;
      
      switch(productType?.toUpperCase()) {
        case 'DAILY':
          effectiveRate = new Decimal(annualRate).div(365);
          periods = duration; // duration in days
          interest = new Decimal(principal)
            .times(effectiveRate.div(100))
            .times(periods)
            .toDecimalPlaces(precision)
            .toNumber();
          break;
          
        case 'WEEKLY':
          effectiveRate = new Decimal(annualRate).div(52);
          periods = duration; // duration in weeks
          interest = new Decimal(principal)
            .times(effectiveRate.div(100))
            .times(periods)
            .toDecimalPlaces(precision)
            .toNumber();
          break;
          
        case 'MONTHLY':
          effectiveRate = new Decimal(annualRate).div(12);
          periods = duration; // duration in months
          interest = new Decimal(principal)
            .times(effectiveRate.div(100))
            .times(periods)
            .toDecimalPlaces(precision)
            .toNumber();
          break;
          
        case 'QUARTERLY':
          effectiveRate = new Decimal(annualRate).div(4);
          periods = duration; // duration in quarters
          interest = new Decimal(principal)
            .times(effectiveRate.div(100))
            .times(periods)
            .toDecimalPlaces(precision)
            .toNumber();
          break;
          
        case 'BULLET':
          effectiveRate = new Decimal(annualRate);
          periods = 1;
          interest = new Decimal(principal)
            .times(effectiveRate.div(100))
            .times(periods)
            .toDecimalPlaces(precision)
            .toNumber();
          break;
          
        case 'ANNUAL':
          effectiveRate = new Decimal(annualRate);
          periods = duration; // duration in years
          interest = new Decimal(principal)
            .times(effectiveRate.div(100))
            .times(periods)
            .toDecimalPlaces(precision)
            .toNumber();
          break;
          
        default:
          throw new Error(`Unsupported product type: ${productType}`);
      }
      
      return {
        success: true,
        data: {
          principal,
          annualRate,
          productType,
          duration,
          effectiveRate: effectiveRate.toNumber(),
          interest,
          totalAmount: principal + interest,
          calculationDate: new Date()
        }
      };
    } catch (error) {
      console.error('Error in calculateInterestByProductType:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate daily interest with different day count conventions
   */
  calculateDailyInterest(principal, annualRate, days, precision = 4, convention = 'ACTUAL/365') {
    try {
      let dailyRate;
      
      switch(convention) {
        case 'ACTUAL/365':
          dailyRate = new Decimal(annualRate).div(365).div(100);
          break;
        case 'ACTUAL/360':
          dailyRate = new Decimal(annualRate).div(360).div(100);
          break;
        case '30/360':
          dailyRate = new Decimal(annualRate).div(360).div(100);
          break;
        default:
          dailyRate = new Decimal(annualRate).div(365).div(100);
      }
      
      const interest = new Decimal(principal)
        .times(dailyRate)
        .times(days)
        .toDecimalPlaces(precision)
        .toNumber();
      
      return {
        success: true,
        data: {
          principal,
          annualRate,
          days,
          convention,
          dailyRate: dailyRate.times(100).toNumber(),
          interest,
          calculationDate: new Date()
        }
      };
    } catch (error) {
      console.error('Error in calculateDailyInterest:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate monthly interest
   */
  calculateMonthlyInterest(principal, annualRate, months, precision = 4) {
    try {
      const monthlyRate = new Decimal(annualRate).div(12).div(100);
      const interest = new Decimal(principal)
        .times(monthlyRate)
        .times(months)
        .toDecimalPlaces(precision)
        .toNumber();
      
      return interest;
    } catch (error) {
      console.error('Error in calculateMonthlyInterest:', error);
      return 0;
    }
  }

  /**
   * Calculate weekly interest
   */
  calculateWeeklyInterest(principal, annualRate, weeks, precision = 4) {
    try {
      const weeklyRate = new Decimal(annualRate).div(52).div(100);
      const interest = new Decimal(principal)
        .times(weeklyRate)
        .times(weeks)
        .toDecimalPlaces(precision)
        .toNumber();
      
      return interest;
    } catch (error) {
      console.error('Error in calculateWeeklyInterest:', error);
      return 0;
    }
  }

  /**
   * Calculate daily penalty for overdue payments
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
        success: true,
        data: {
          principal,
          annualPenaltyRate,
          overdueDays,
          dailyPenaltyRate: dailyRate.times(100).toNumber(),
          penalty,
          totalAmount: principal + penalty,
          calculationDate: new Date()
        }
      };
    } catch (error) {
      console.error('Error in calculateDailyPenalty:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * ==================== ADVANCED CALCULATIONS ====================
   */

  /**
   * Compare different calculation methods
   */
  compareMethods(params) {
    try {
      const emiResult = this.calculateEMI(params);
      const flatResult = this.calculateFlatRate(params);

      if (!emiResult.success || !flatResult.success) {
        throw new Error('Failed to calculate comparison');
      }

      return {
        success: true,
        data: {
          emi: emiResult.data,
          flatRate: flatResult.data,
          comparison: {
            monthlyPaymentDifference: flatResult.data.monthlyPayment - emiResult.data.monthlyPayment,
            totalInterestDifference: flatResult.data.totalInterest - emiResult.data.totalInterest,
            totalRepaymentDifference: flatResult.data.totalRepayment - emiResult.data.totalRepayment,
            interestSavings: flatResult.data.totalInterest - emiResult.data.totalInterest,
            recommendedMethod: emiResult.data.totalInterest < flatResult.data.totalInterest ? 'emi' : 'flat',
            effectiveRateDifference: this.calculateEffectiveRateDifference(
              emiResult.data.effectiveAnnualRate,
              flatResult.data.effectiveAnnualRate
            )
          }
        }
      };
    } catch (error) {
      console.error('Error in compareMethods:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate variable rate interest
   */
  calculateVariableInterest(principal, rateSegments, days, precision = 4) {
    try {
      let totalInterest = new Decimal(0);
      let remainingDays = days;
      
      for (const segment of rateSegments) {
        const daysInSegment = Math.min(remainingDays, segment.days);
        const segmentInterest = this.calculateDailyInterest(
          principal,
          segment.rate,
          daysInSegment,
          precision + 2
        );
        
        if (!segmentInterest.success) {
          throw new Error(`Failed to calculate segment interest: ${segmentInterest.error}`);
        }
        
        totalInterest = totalInterest.plus(segmentInterest.data.interest);
        remainingDays -= daysInSegment;
        
        if (remainingDays <= 0) break;
      }
      
      return {
        success: true,
        data: {
          principal,
          rateSegments,
          totalDays: days,
          totalInterest: totalInterest.toDecimalPlaces(precision).toNumber(),
          totalAmount: principal + totalInterest.toNumber(),
          calculationDate: new Date()
        }
      };
    } catch (error) {
      console.error('Error in calculateVariableInterest:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate effective annual rate
   */
  calculateEffectiveAnnualRate(nominalRate, compoundingFrequency = 12) {
    try {
      const effectiveRate = Decimal.pow(
        Decimal.add(1, new Decimal(nominalRate).div(100).div(compoundingFrequency)),
        compoundingFrequency
      ).minus(1);
      
      return effectiveRate.times(100).toDecimalPlaces(4).toNumber();
    } catch (error) {
      console.error('Error in calculateEffectiveAnnualRate:', error);
      return nominalRate;
    }
  }

  /**
   * Calculate effective rate difference
   */
  calculateEffectiveRateDifference(rate1, rate2) {
    try {
      const diff = new Decimal(rate2).minus(rate1);
      const percentDiff = diff.div(rate1).times(100);
      
      return {
        absolute: diff.toDecimalPlaces(4).toNumber(),
        percentage: percentDiff.toDecimalPlaces(2).toNumber()
      };
    } catch (error) {
      console.error('Error in calculateEffectiveRateDifference:', error);
      return { absolute: 0, percentage: 0 };
    }
  }

  /**
   * ==================== HELPER AND UTILITY METHODS ====================
   */

  /**
   * Determine if capitalization should be applied
   */
  async shouldApplyCapitalization(interestConfig, daysElapsed) {
    try {
      if (!interestConfig.CAPITALIZE_INTEREST) {
        return false;
      }

      // Check frequency-based capitalization
      if (interestConfig.CAPITALIZATION_FREQUENCY) {
        switch (interestConfig.CAPITALIZATION_FREQUENCY.toUpperCase()) {
          case 'DAILY':
            return daysElapsed >= 1;
          case 'WEEKLY':
            return daysElapsed >= 7;
          case 'MONTHLY':
            return daysElapsed >= 30;
          case 'QUARTERLY':
            return daysElapsed >= 90;
          case 'ANNUAL':
            return daysElapsed >= 365;
          default:
            return daysElapsed >= 30;
        }
      }

      // Check threshold-based capitalization
      if (interestConfig.CAPITALIZATION_THRESHOLD) {
        // This would require the accrued interest amount
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error in shouldApplyCapitalization:', error);
      return false;
    }
  }

  /**
   * Calculate business days between dates (excluding weekends and holidays)
   */
  calculateBusinessDaysBetween(start, end) {
    try {
      let count = 0;
      const current = new Date(start);
      current.setHours(0, 0, 0, 0);
      const endDate = new Date(end);
      endDate.setHours(23, 59, 59, 999);
      
      while (current <= endDate) {
        const dayOfWeek = current.getDay();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isHoliday = this.holidays ? this.holidays.isHoliday(current) : false;
        
        if (!isWeekend && !isHoliday) {
          count++;
        }
        
        current.setDate(current.getDate() + 1);
      }
      
      return count;
    } catch (error) {
      console.error('Error in calculateBusinessDaysBetween:', error);
      // Fallback to simple day count
      return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    }
  }

  /**
   * Calculate year basis for different day count conventions
   */
  calculateYearBasis(start, end, convention) {
    switch (convention?.toUpperCase()) {
      case 'ACTUAL/360':
        return 360;
      case 'ACTUAL/365':
        const startYear = start.getFullYear();
        const endYear = end.getFullYear();
        
        if (startYear === endYear) {
          return this.isLeapYear(startYear) ? 366 : 365;
        } else {
          // For multi-year periods, use 365 (simplified)
          return 365;
        }
      case '30/360':
        return 360;
      case 'ACTUAL/ACTUAL':
        const daysInYear = this.isLeapYear(start.getFullYear()) ? 366 : 365;
        return daysInYear;
      default:
        return 365;
    }
  }

  /**
   * Generate amortization schedule
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
      
      // Handle final payment adjustment
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
        dueDate: dueDate.toISOString().split('T')[0],
        principal: adjustedPrincipal,
        interest,
        totalPayment: adjustedEMI,
        remainingBalance: adjustedBalance,
        isFinalInstallment: isFinalPayment,
        cumulativeInterest: schedule.reduce((sum, item) => sum + item.interest, 0) + interest,
        cumulativePrincipal: schedule.reduce((sum, item) => sum + item.principal, 0) + adjustedPrincipal
      });

      if (isFinalPayment) break;
    }

    return schedule;
  }

  /**
   * Generate flat rate schedule
   */
  _generateFlatRateSchedule(principal, annualRate, termMonths, monthlyPayment, startDate, precision) {
    const schedule = [];
    const monthlyRate = new Decimal(annualRate).div(100).div(12);
    const baseDate = startDate ? new Date(startDate) : new Date();
    let balance = new Decimal(principal);

    for (let i = 1; i <= termMonths; i++) {
      const interest = new Decimal(principal).times(monthlyRate).toDecimalPlaces(precision).toNumber();
      const principalPayment = new Decimal(monthlyPayment).minus(interest).toDecimalPlaces(precision).toNumber();

      balance = balance.minus(principalPayment);

      const isFinalPayment = i === termMonths;
      
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
        dueDate: dueDate.toISOString().split('T')[0],
        principal: adjustedPrincipal,
        interest,
        totalPayment: adjustedEMI,
        remainingBalance: adjustedBalance,
        isFinalInstallment: isFinalPayment,
        cumulativeInterest: schedule.reduce((sum, item) => sum + item.interest, 0) + interest,
        cumulativePrincipal: schedule.reduce((sum, item) => sum + item.principal, 0) + adjustedPrincipal
      });

      if (isFinalPayment) break;
    }

    return schedule;
  }

  /**
   * Calculate due date considering business days
   */
  _calculateDueDate(baseDate, monthOffset) {
    const dueDate = new Date(baseDate);
    dueDate.setMonth(dueDate.getMonth() + monthOffset);

    // Adjust for weekends and holidays
    while (this._isNonBusinessDay(dueDate)) {
      dueDate.setDate(dueDate.getDate() + 1);
    }

    return dueDate;
  }

  /**
   * Check if date is non-business day
   */
  _isNonBusinessDay(date) {
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const isHoliday = this.holidays ? this.holidays.isHoliday(date) : false;
    
    return isWeekend || isHoliday;
  }

  /**
   * Check if year is leap year
   */
  isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
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
   * Get interest calculation summary
   */
  async getCalculationSummary(loanAccountId) {
    try {
      // This would fetch and summarize all interest calculations for a loan
      // Implementation depends on your data structure
      return {
        success: true,
        data: {
          totalInterestAccrued: 0,
          totalInterestCapitalized: 0,
          totalPenalties: 0,
          currentOutstandingInterest: 0,
          lastCalculationDate: null
        }
      };
    } catch (error) {
      console.error('Error in getCalculationSummary:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Export utility functions for direct use
export const calculateEMI = (params) => new InterestCalculationService().calculateEMI(params);
export const calculateFlatRate = (params) => new InterestCalculationService().calculateFlatRate(params);
export const calculateLoanInterest = (params) => new InterestCalculationService().calculateLoanInterest(params);
export const calculateInterest = (params) => new InterestCalculationService().calculateInterest(params);
export const calculateDailyInterest = (principal, annualRate, days, precision, convention) => 
  new InterestCalculationService().calculateDailyInterest(principal, annualRate, days, precision, convention);
export const calculateInterestByProductType = (params) => 
  new InterestCalculationService().calculateInterestByProductType(params);
export const calculateCapitalizationAmount = (principal, accruedInterest, capitalizationRate, capitalizationType) =>
  new InterestCalculationService().calculateCapitalizationAmount(principal, accruedInterest, capitalizationRate, capitalizationType);
export const calculateEffectiveAnnualRate = (nominalRate, compoundingFrequency) =>
  new InterestCalculationService().calculateEffectiveAnnualRate(nominalRate, compoundingFrequency);