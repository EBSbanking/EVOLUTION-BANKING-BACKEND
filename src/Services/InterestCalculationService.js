// src/services/InterestCalculationService.js
import { Decimal } from 'decimal.js';
import mongoose from 'mongoose';

const { Decimal128 } = mongoose.Types;

export default class InterestCalculationService {
  constructor() {
    console.log('InterestCalculationService initialized');
  }

  /**
   * Convert value to Decimal128 for MongoDB storage
   */
  toDecimal128(value) {
    if (value === null || value === undefined) return Decimal128.fromString('0');
    if (value instanceof mongoose.Types.Decimal128) return value;
    return Decimal128.fromString(value.toString());
  }

  /**
   * Convert term to months based on term code
   */
  convertTermToMonths(termValue, termCode) {
    const termCodeUpper = String(termCode).toUpperCase();
    
    switch (termCodeUpper) {
      case 'D': return termValue / 30.44; // Days to months
      case 'W': return termValue / 4.345; // Weeks to months
      case 'BW': return termValue / 2; // Bi-weeks to months
      case 'M': return termValue; // Already in months
      case 'Q': return termValue * 3; // Quarters to months
      case 'Y': return termValue * 12; // Years to months
      default: return termValue; // Default to months
    }
  }

  /**
   * Get total payments based on frequency
   */
  getTotalPaymentsForFrequency(termValue, termCode, paymentFrequency) {
    const termMonths = this.convertTermToMonths(termValue, termCode);
    const frequency = String(paymentFrequency).toUpperCase();
    
    let totalPayments;
    
    switch (frequency) {
      case 'DAILY': totalPayments = termMonths * 30.44; break;
      case 'WEEKLY': totalPayments = termMonths * 4.345; break;
      case 'BI_WEEKLY': totalPayments = termMonths * 2; break;
      case 'MONTHLY': totalPayments = termMonths; break;
      case 'QUARTERLY': totalPayments = termMonths / 3; break;
      case 'SEMI_ANNUALLY': totalPayments = termMonths / 6; break;
      case 'ANNUALLY': totalPayments = termMonths / 12; break;
      default: totalPayments = termMonths; // Default to monthly
    }
    
    return Math.ceil(totalPayments);
  }

  /**
   * Calculate next payment date
   */
  calculateNextPaymentDate(installmentNumber, paymentFrequency, startDate) {
    const date = new Date(startDate);
    const frequency = String(paymentFrequency).toUpperCase();
    
    switch (frequency) {
      case 'DAILY': 
        date.setDate(date.getDate() + installmentNumber);
        break;
      case 'WEEKLY': 
        date.setDate(date.getDate() + (installmentNumber * 7));
        break;
      case 'BI_WEEKLY': 
        date.setDate(date.getDate() + (installmentNumber * 14));
        break;
      case 'MONTHLY': 
        date.setMonth(date.getMonth() + installmentNumber);
        break;
      case 'QUARTERLY': 
        date.setMonth(date.getMonth() + (installmentNumber * 3));
        break;
      case 'SEMI_ANNUALLY': 
        date.setMonth(date.getMonth() + (installmentNumber * 6));
        break;
      case 'ANNUALLY': 
        date.setFullYear(date.getFullYear() + installmentNumber);
        break;
      default: 
        date.setMonth(date.getMonth() + installmentNumber);
    }
    
    return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
  }

  /**
   * Calculate FIXED RATE / SIMPLE INTEREST EMI
   * Used for flat rate loans where interest is calculated on original principal
   */
  calculateFixedRateEMI(principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate, isRateForTerm = false) {
    console.log('=== FIXED RATE / SIMPLE INTEREST CALCULATION ===');
    console.log(`Principal: ₦${principal}, Annual Rate: ${annualRatePercent}%, Term: ${termValue} ${termCode}, Frequency: ${paymentFrequency}`);
    console.log(`Is rate for term duration? ${isRateForTerm}`);

    let totalInterest;
    
    if (isRateForTerm || annualRatePercent > 50) {
      console.log(`Rate ${annualRatePercent}% is for the entire term, not annual`);
      totalInterest = principal * (annualRatePercent / 100);
    } else {
      // For annual rates
      const timeInYears = this.convertTermToMonths(termValue, termCode) / 12;
      totalInterest = principal * (annualRatePercent / 100) * timeInYears;
      console.log(`Rate ${annualRatePercent}% is annual, time in years: ${timeInYears.toFixed(4)}`);
    }
    
    const totalRepayable = principal + totalInterest;
    const totalPayments = this.getTotalPaymentsForFrequency(termValue, termCode, paymentFrequency);
    const emi = totalRepayable / totalPayments;

    console.log(`Total Interest: ₦${totalInterest.toFixed(2)}`);
    console.log(`Total Repayable: ₦${totalRepayable.toFixed(2)}`);
    console.log(`EMI (per payment): ₦${emi.toFixed(2)}`);
    console.log(`Total Payments: ${totalPayments}`);

    // Generate schedule
    const installments = [];
    let remaining = principal;

    for (let i = 1; i <= totalPayments; i++) {
      const interestPortion = totalInterest / totalPayments;
      let principalPortion = emi - interestPortion;

      if (i === totalPayments) {
        principalPortion = remaining;
      }

      remaining -= principalPortion;
      if (remaining < 0.01) remaining = 0;

      const dueDate = this.calculateNextPaymentDate(i, paymentFrequency, startDate);

      installments.push({
        installmentNo: i,
        dueDate,
        principal: Number(principalPortion.toFixed(2)),
        interest: Number(interestPortion.toFixed(2)),
        totalPayment: Number((principalPortion + interestPortion).toFixed(2)),
        remainingBalance: Number(remaining.toFixed(2)),
        status: 'PENDING'
      });
    }

    return {
      emi: Number(emi.toFixed(2)),
      totalInterest: Number(totalInterest.toFixed(2)),
      totalRepayable: Number(totalRepayable.toFixed(2)),
      totalPayment: Number(totalRepayable.toFixed(2)), // Added for compatibility
      installments,
      calculationMethod: 'FIXED_RATE_SIMPLE',
      interestType: 'SIMPLE',
      rateUsed: annualRatePercent,
      isRateForTerm: isRateForTerm || annualRatePercent > 50
    };
  }

  /**
   * Calculate REDUCING BALANCE / COMPOUND EMI
   * Used for reducing balance loans where interest is calculated on outstanding balance
   */
  calculateReducingBalanceEMI(principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate) {
    console.log('=== REDUCING BALANCE / COMPOUND INTEREST CALCULATION ===');
    console.log(`Principal: ₦${principal}, Annual Rate: ${annualRatePercent}%, Term: ${termValue} ${termCode}, Frequency: ${paymentFrequency}`);

    const totalPayments = this.getTotalPaymentsForFrequency(termValue, termCode, paymentFrequency);
    
    // Calculate periodic rate based on payment frequency
    let periodicRate;
    const frequency = String(paymentFrequency).toUpperCase();
    
    switch (frequency) {
      case 'DAILY': periodicRate = annualRatePercent / 100 / 365; break;
      case 'WEEKLY': periodicRate = annualRatePercent / 100 / 52; break;
      case 'BI_WEEKLY': periodicRate = annualRatePercent / 100 / 26; break;
      case 'MONTHLY': periodicRate = annualRatePercent / 100 / 12; break;
      case 'QUARTERLY': periodicRate = annualRatePercent / 100 / 4; break;
      case 'SEMI_ANNUALLY': periodicRate = annualRatePercent / 100 / 2; break;
      case 'ANNUALLY': periodicRate = annualRatePercent / 100; break;
      default: periodicRate = annualRatePercent / 100 / 12; // Default to monthly
    }

    let emi;
    if (periodicRate === 0) {
      emi = principal / totalPayments;
    } else {
      emi = principal * periodicRate * Math.pow(1 + periodicRate, totalPayments) /
            (Math.pow(1 + periodicRate, totalPayments) - 1);
    }

    const totalRepayable = emi * totalPayments;
    const totalInterest = totalRepayable - principal;

    // Generate schedule
    const installments = [];
    let remaining = principal;

    for (let i = 1; i <= totalPayments; i++) {
      const interestPortion = remaining * periodicRate;
      let principalPortion = emi - interestPortion;

      if (i === totalPayments) {
        principalPortion = remaining;
      }

      remaining -= principalPortion;
      if (remaining < 0.01) remaining = 0;

      const dueDate = this.calculateNextPaymentDate(i, paymentFrequency, startDate);

      installments.push({
        installmentNo: i,
        dueDate,
        principal: Number(principalPortion.toFixed(2)),
        interest: Number(interestPortion.toFixed(2)),
        totalPayment: Number((principalPortion + interestPortion).toFixed(2)),
        remainingBalance: Number(remaining.toFixed(2)),
        status: 'PENDING'
      });
    }

    return {
      emi: Number(emi.toFixed(2)),
      totalInterest: Number(totalInterest.toFixed(2)),
      totalRepayable: Number(totalRepayable.toFixed(2)),
      totalPayment: Number(totalRepayable.toFixed(2)), // Added for compatibility
      installments,
      calculationMethod: 'REDUCING_BALANCE_COMPOUND',
      interestType: 'COMPOUND',
      rateUsed: annualRatePercent
    };
  }

  /**
   * Calculate interest based on product type
   */
  calculateInterestByProductType(productType, principal, ratePercent, termValue, termCode, paymentFrequency, startDate) {
    console.log(`=== CALCULATING INTEREST BY PRODUCT TYPE: ${productType} ===`);
    console.log(`Principal: ₦${principal}, Rate: ${ratePercent}%`);
    console.log(`Term: ${termValue} ${termCode}, Frequency: ${paymentFrequency}`);

    // Map product types to calculation methods
    const calculationMethodMap = {
      'FIXED_RATE_LOAN': 'FIXED_RATE',
      'FLAT_RATE_LOAN': 'FIXED_RATE',
      'REDUCING_BALANCE_LOAN': 'REDUCING_BALANCE',
      'EMI_LOAN': 'REDUCING_BALANCE',
      'SIMPLE_INTEREST_LOAN': 'FIXED_RATE',
      'COMPOUND_INTEREST_LOAN': 'REDUCING_BALANCE',
      'MICROFINANCE_LOAN': 'FIXED_RATE',
      'PERSONAL_LOAN': 'REDUCING_BALANCE',
      'BUSINESS_LOAN': 'REDUCING_BALANCE',
      'HOME_LOAN': 'REDUCING_BALANCE',
      'CAR_LOAN': 'REDUCING_BALANCE',
      'EDUCATION_LOAN': 'REDUCING_BALANCE',
    };
    
    const calculationMethod = calculationMethodMap[productType] || 'REDUCING_BALANCE';
    const isFixedTermRate = ['FIXED_RATE_LOAN', 'FLAT_RATE_LOAN', 'SIMPLE_INTEREST_LOAN', 'MICROFINANCE_LOAN'].includes(productType);
    
    console.log(`Using calculation method: ${calculationMethod}`);
    console.log(`Is fixed term rate? ${isFixedTermRate}`);
    
    return this.calculateEMIWithChosenMethod(
      principal,
      ratePercent,
      termValue,
      termCode,
      paymentFrequency,
      startDate,
      calculationMethod,
      isFixedTermRate
    );
  }

  /**
   * ENHANCED EMI CALCULATION - Main entry point for loan application
   * Aligns with applyForLoan function requirements
   */
  calculateInterestAndEMIEnhanced(principalAmount, loanInterestRate, termValue, termCode, paymentFrequency, startDate) {
    console.log('=== ENHANCED EMI CALCULATION STARTED ===');
    console.log(`Principal: ₦${principalAmount}`);
    console.log(`Interest Rate Config:`, loanInterestRate);

    // Extract rate - prefer ABSOLUTE_RATE, fallback to FIXED_RATE
    let ratePercent = loanInterestRate.ABSOLUTE_RATE || loanInterestRate.FIXED_RATE || loanInterestRate.DEFAULT_RATE_PER_MONTH || 0;
    
    // Log the rate type to understand what we're dealing with
    console.log(`Rate Type: ${loanInterestRate.RATE_TYPE}, Interest Type: ${loanInterestRate.INTEREST_TYPE}`);
    console.log(`Extracted Rate: ${ratePercent}%`);

    // Check if rate is monthly or annual
    const isFixedOrSimple = (loanInterestRate.RATE_TYPE === 'FIXED' || loanInterestRate.INTEREST_TYPE === 'SIMPLE');
    
    if (isFixedOrSimple) {
      console.log('Using FIXED RATE / SIMPLE INTEREST method');
      
      // For fixed rate loans, the rate is usually for the entire term
      // Example: 74.4% for 6 months = total interest over the term
      return this.calculateFixedRateEMI(
        principalAmount, 
        ratePercent, 
        termValue, 
        termCode, 
        paymentFrequency, 
        startDate, 
        true
      );
    } else {
      console.log('Using REDUCING BALANCE / COMPOUND method');
      
      // For reducing balance, check if rate is monthly
      const isMonthlyRate = ratePercent < 20; // Rates < 20% are likely monthly
      if (isMonthlyRate) {
        console.warn(`⚠️ Rate ${ratePercent}% appears to be monthly - converting to annual: ${ratePercent * 12}%`);
        ratePercent = ratePercent * 12;
      }
      
      return this.calculateReducingBalanceEMI(
        principalAmount, 
        ratePercent, 
        termValue, 
        termCode, 
        paymentFrequency, 
        startDate
      );
    }
  }

  /**
   * Calculate EMI with chosen method - For applyForLoan compatibility
   */
  calculateEMIWithChosenMethod(principal, ratePercent, termValue, termCode, paymentFrequency, startDate, calculationMethod, isFixedTermRate = false) {
    console.log('=== CALCULATING EMI WITH CHOSEN METHOD ===');
    console.log(`Method: ${calculationMethod}, Rate: ${ratePercent}%`);
    console.log(`Is rate for term duration? ${isFixedTermRate}`);
    
    // Force the calculation method based on user choice
    if (calculationMethod === 'FLAT_RATE' || calculationMethod === 'FIXED_RATE') {
      console.log('Using FLAT RATE (Simple Interest) calculation');
      
      // For flat rate loans, we need to know if the rate is for term or annual
      if (isFixedTermRate || ratePercent > 50) {
        console.log(`Rate ${ratePercent}% is for the entire ${termValue} ${termCode} term`);
      }
      
      return this.calculateFixedRateEMI(
        principal, 
        ratePercent, 
        termValue, 
        termCode, 
        paymentFrequency, 
        startDate, 
        isFixedTermRate || ratePercent > 50
      );
    } else if (calculationMethod === 'REDUCING_BALANCE' || calculationMethod === 'EMI') {
      console.log('Using REDUCING BALANCE (Compound Interest) calculation');
      
      // For reducing balance, assume rate is annual
      // If rate seems too high for annual (> 50%), it might be for term
      if (ratePercent > 50) {
        console.warn(`⚠️ WARNING: Rate ${ratePercent}% seems high for annual rate in reducing balance method`);
      }
      
      return this.calculateReducingBalanceEMI(
        principal, 
        ratePercent, 
        termValue, 
        termCode, 
        paymentFrequency, 
        startDate
      );
    } else {
      console.warn(`Unknown calculation method: ${calculationMethod}, defaulting to REDUCING_BALANCE`);
      return this.calculateReducingBalanceEMI(
        principal, 
        ratePercent, 
        termValue, 
        termCode, 
        paymentFrequency, 
        startDate
      );
    }
  }

  /**
   * Calculate total interest for loan
   */
  calculateTotalInterest(principal, ratePercent, termValue, termCode, calculationMethod, isFixedTermRate = false) {
    const termMonths = this.convertTermToMonths(termValue, termCode);
    
    if (calculationMethod === 'FLAT_RATE' || calculationMethod === 'FIXED_RATE') {
      if (isFixedTermRate || ratePercent > 50) {
        // Rate is for the entire term
        return principal * (ratePercent / 100);
      } else {
        // Rate is annual
        const timeInYears = termMonths / 12;
        return principal * (ratePercent / 100) * timeInYears;
      }
    } else {
      // For reducing balance, we need to calculate the full schedule
      // For simplicity, use an approximation
      const annualRate = ratePercent / 100;
      const timeInYears = termMonths / 12;
      return principal * annualRate * timeInYears * 0.6; // Approximation factor for reducing balance
    }
  }

  /**
   * Calculate effective annual percentage rate (APR)
   */
  calculateAPR(principal, totalInterest, termMonths, fees = 0) {
    try {
      const totalCost = totalInterest + fees;
      const financeCharge = new Decimal(totalCost).div(principal).times(100);
      const termInYears = new Decimal(termMonths).div(12);
      
      const apr = financeCharge.div(termInYears).toNumber();
      
      return {
        success: true,
        data: {
          principal,
          totalInterest,
          fees,
          totalCost,
          termMonths,
          apr: parseFloat(apr.toFixed(2)),
          calculationDate: new Date()
        }
      };
    } catch (error) {
      console.error('Error calculating APR:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate daily accrued interest
   */
  calculateDailyAccruedInterest(principal, annualRate, days) {
    const dailyRate = annualRate / 100 / 365;
    return principal * dailyRate * days;
  }

  /**
   * Calculate penalty interest for overdue loans
   */
  calculatePenaltyInterest(principal, penaltyRate, overdueDays) {
    const dailyPenaltyRate = penaltyRate / 100 / 365;
    return principal * dailyPenaltyRate * overdueDays;
  }

  /**
   * Generate repayment schedule
   */
  generateRepaymentSchedule(emiResult, loanAccountData) {
    return {
      LOAN_ACCOUNT_ID: loanAccountData._id,
      ACCT_NO: loanAccountData.ACCT_NO,
      CUST_ID: loanAccountData.CUST_ID,
      START_DATE: loanAccountData.START_DT,
      MATURITY_DATE: loanAccountData.MATURITY_DT,
      PRINCIPAL_AMOUNT: loanAccountData.DISBURSEMENT_LIMIT,
      INTEREST_RATE: loanAccountData.INTEREST_RATE,
      INTEREST_RATE_TYPE: loanAccountData.INTEREST_RATE_TYPE,
      INTEREST_TYPE: loanAccountData.INTEREST_TYPE,
      CALCULATION_METHOD: emiResult.calculationMethod,
      TERM: loanAccountData.TERM_VALUE,
      TERM_TYPE: loanAccountData.TERM_CD,
      paymentFrequency: loanAccountData.PAYMENT_FREQUENCY,
      EMI_AMOUNT: this.toDecimal128(emiResult.emi),
      installments: emiResult.installments.map((installment, index) => ({
        installmentNo: installment.installmentNo || installment.installmentNumber || (index + 1),
        dueDate: installment.dueDate,
        principal: this.toDecimal128(installment.principal),
        interest: this.toDecimal128(installment.interest),
        totalPayment: this.toDecimal128(installment.totalPayment),
        remainingBalance: this.toDecimal128(installment.remainingBalance),
        status: 'PENDING',
        amountPaid: this.toDecimal128('0.00'),
        principalPaid: this.toDecimal128('0.00'),
        interestPaid: this.toDecimal128('0.00'),
        feesPaid: this.toDecimal128('0.00')
      })),
      TOTAL_INTEREST: this.toDecimal128(emiResult.totalInterest),
      TOTAL_REPAYMENT: this.toDecimal128(emiResult.totalRepayable),
      STATUS: 'PENDING'
    };
  }

  /**
   * Validate interest rate configuration
   */
  validateInterestRateConfig(loanInterestRate) {
    const errors = [];
    
    if (!loanInterestRate) {
      errors.push('Interest rate configuration is required');
    }
    
    if (loanInterestRate) {
      if (!loanInterestRate.DEFAULT_RATE_PER_MONTH && 
          !loanInterestRate.ABSOLUTE_RATE && 
          !loanInterestRate.FIXED_RATE) {
        errors.push('No valid rate found in interest rate configuration');
      }
      
      if (loanInterestRate.DEFAULT_RATE_PER_MONTH && 
          (isNaN(loanInterestRate.DEFAULT_RATE_PER_MONTH) || loanInterestRate.DEFAULT_RATE_PER_MONTH < 0)) {
        errors.push('Invalid DEFAULT_RATE_PER_MONTH value');
      }
      
      if (loanInterestRate.ABSOLUTE_RATE && 
          (isNaN(loanInterestRate.ABSOLUTE_RATE) || loanInterestRate.ABSOLUTE_RATE < 0)) {
        errors.push('Invalid ABSOLUTE_RATE value');
      }
      
      if (loanInterestRate.FIXED_RATE && 
          (isNaN(loanInterestRate.FIXED_RATE) || loanInterestRate.FIXED_RATE < 0)) {
        errors.push('Invalid FIXED_RATE value');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors.length > 0 ? errors : null
    };
  }
}

// Export standalone functions for backward compatibility
export const calculateInterestAndEMIEnhanced = (principalAmount, loanInterestRate, termValue, termCode, paymentFrequency, startDate) => {
  const service = new InterestCalculationService();
  return service.calculateInterestAndEMIEnhanced(principalAmount, loanInterestRate, termValue, termCode, paymentFrequency, startDate);
};

export const calculateEMIWithChosenMethod = (principal, ratePercent, termValue, termCode, paymentFrequency, startDate, calculationMethod, isFixedTermRate = false) => {
  const service = new InterestCalculationService();
  return service.calculateEMIWithChosenMethod(principal, ratePercent, termValue, termCode, paymentFrequency, startDate, calculationMethod, isFixedTermRate);
};

export const calculateFixedRateEMI = (principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate, isRateForTerm = false) => {
  const service = new InterestCalculationService();
  return service.calculateFixedRateEMI(principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate, isRateForTerm);
};

export const calculateReducingBalanceEMI = (principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate) => {
  const service = new InterestCalculationService();
  return service.calculateReducingBalanceEMI(principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate);
};

// ADDED: Export the new calculateInterestByProductType function
export const calculateInterestByProductType = (productType, principal, ratePercent, termValue, termCode, paymentFrequency, startDate) => {
  const service = new InterestCalculationService();
  return service.calculateInterestByProductType(productType, principal, ratePercent, termValue, termCode, paymentFrequency, startDate);
};