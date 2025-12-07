// src/controllers/LoanCalculatorController.js
import asyncHandler from 'express-async-handler';
import LoanProduct from '../models/LoanProduct.js';
import LoanInterestRate from '../models/LoanInterestRate.js';
import RateIndex from '../models/Rate-Index.js';
import InterestCalculationService from '../Services/InterestCalculationService.js';

const interestService = new InterestCalculationService();

const LoanCalculatorController = {
  // CALCULATE LOAN PAYMENT QUOTE WITH FREQUENCY SUPPORT
  calculateLoanQuote: asyncHandler(async (req, res) => {
    const { 
      productId,        // Which loan product
      principal,        // Loan amount
      termValue,        // Loan term (e.g., 10)
      termUnit,         // MONTHS, WEEKS, DAYS, YEARS
      startDate,        // Disbursement date
      paymentFrequency = 'MONTHLY', // DAILY, WEEKLY, BIWEEKLY, MONTHLY, QUARTERLY
      interestRateType,  // Fixed vs Variable (optional)
      calculationMethod = 'reducing' // 'reducing' or 'flat'
    } = req.body;

    // Validate term unit
    const validTermUnits = ['DAYS', 'WEEKS', 'MONTHS', 'YEARS'];
    if (!validTermUnits.includes(termUnit)) {
      return res.status(400).json({
        success: false,
        message: `Invalid termUnit. Must be one of: ${validTermUnits.join(', ')}`
      });
    }

    // Validate payment frequency
    const validFrequencies = ['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL'];
    if (!validFrequencies.includes(paymentFrequency)) {
      return res.status(400).json({
        success: false,
        message: `Invalid paymentFrequency. Must be one of: ${validFrequencies.join(', ')}`
      });
    }

    try {
      // 1. Get product configuration
      const product = await LoanProduct.findOne({ 
        PROD_ID: productId,
        STATUS: 'ACTIVE'
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          message: 'Loan product not found or inactive'
        });
      }

      // 2. Get interest rate configuration
      const interestConfig = await LoanInterestRate.findOne({
        PROD_ID: productId,
        STATUS: 'ACTIVE'
      });

      if (!interestConfig) {
        return res.status(404).json({
          success: false,
          message: 'Interest rate configuration not found for this product'
        });
      }

      // 3. Determine the applicable interest rate
      let annualRate;
      if (interestConfig.RATE_TY === 'FIXED') {
        annualRate = parseFloat(interestConfig.ABSOLUTE_RATE);
      } else if (interestConfig.RATE_TY === 'VARIABLE') {
        const rateIndex = await RateIndex.findOne({
          INDEX_RATE_ID: interestConfig.INDEX_RATE_ID
        });
        annualRate = parseFloat(rateIndex.INDEX_RATE);
      }

      // 4. Convert term to months (for InterestCalculationService)
      const termMonths = convertTermToMonths(termValue, termUnit);

      // 5. Use InterestCalculationService based on method
      let calculationResult;
      
      if (calculationMethod === 'flat') {
        calculationResult = interestService.calculateFlatRate({
          principal: parseFloat(principal),
          annualRate,
          termMonths,
          startDate: startDate ? new Date(startDate) : new Date(),
          precision: 2
        });
      } else {
        calculationResult = interestService.calculateEMI({
          principal: parseFloat(principal),
          annualRate,
          termMonths,
          startDate: startDate ? new Date(startDate) : new Date(),
          precision: 2
        });
      }

      // 6. Adjust schedule for different payment frequencies
      const adjustedSchedule = adjustScheduleForFrequency(
        calculationResult.installments,
        paymentFrequency,
        termValue,
        termUnit
      );

      // 7. Add fees and charges
      const fees = calculateFees(product, principal);
      
      res.status(200).json({
        success: true,
        data: {
          productInfo: {
            name: product.name,
            productCode: product.productCode,
            productType: product.PRODUCT_TYPE,
            amortized: product.AMORTIZED
          },
          interestConfig: {
            rateType: interestConfig.RATE_TY,
            rateValue: annualRate,
            accrualBasis: interestConfig.ACCRUAL_BASIS_TY,
            calculationMethod
          },
          loanTerms: {
            principal,
            term: `${termValue} ${termUnit.toLowerCase()}`,
            termMonths,
            annualInterestRate: `${annualRate}%`,
            paymentFrequency,
            disbursementDate: startDate || new Date().toISOString().split('T')[0]
          },
          calculation: {
            paymentAmount: calculationResult.monthlyPayment,
            totalInterest: calculationResult.totalInterest,
            totalRepayment: calculationResult.totalRepayment,
            effectiveInterestRate: calculateEffectiveRate(
              principal,
              calculationResult.totalRepayment,
              termMonths,
              paymentFrequency
            )
          },
          fees,
          totals: {
            totalAmountFinanced: principal + fees.processingFee,
            totalRepayment: calculationResult.totalRepayment + fees.totalFees,
            apr: calculateAPR(principal, calculationResult.totalRepayment, fees, termMonths)
          },
          paymentSchedule: adjustedSchedule
        }
      });

    } catch (error) {
      console.error('Error calculating loan quote:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to calculate loan quote'
      });
    }
  }),

  // CALCULATE DAILY INTEREST (using InterestCalculationService)
  calculateDailyInterest: asyncHandler(async (req, res) => {
    try {
      const { principal, annualRate, days, precision = 2 } = req.body;
      
      const result = interestService.calculateDailyInterest(
        parseFloat(principal),
        parseFloat(annualRate),
        parseInt(days),
        precision
      );
      
      res.status(200).json({
        success: true,
        message: 'Daily interest calculated successfully',
        data: {
          principal,
          annualRate: `${annualRate}%`,
          days,
          dailyInterest: result,
          calculationDate: new Date()
        }
      });
    } catch (error) {
      console.error('Error calculating daily interest:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to calculate daily interest'
      });
    }
  }),

  // CALCULATE PENALTY INTEREST
  calculatePenalty: asyncHandler(async (req, res) => {
    try {
      const { principal, annualPenaltyRate, overdueDays, precision = 2 } = req.body;
      
      const result = interestService.calculateDailyPenalty(
        parseFloat(principal),
        parseFloat(annualPenaltyRate),
        parseInt(overdueDays),
        precision
      );
      
      res.status(200).json({
        success: true,
        message: 'Penalty calculated successfully',
        data: result
      });
    } catch (error) {
      console.error('Error calculating penalty:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to calculate penalty'
      });
    }
  }),

  // COMPARE CALCULATION METHODS
  compareMethods: asyncHandler(async (req, res) => {
    try {
      const { principal, annualRate, termMonths, startDate, precision = 2 } = req.body;
      
      const result = interestService.compareMethods({
        principal: parseFloat(principal),
        annualRate: parseFloat(annualRate),
        termMonths: parseInt(termMonths),
        startDate: startDate ? new Date(startDate) : new Date(),
        precision
      });
      
      res.status(200).json({
        success: true,
        message: 'Methods compared successfully',
        data: result
      });
    } catch (error) {
      console.error('Error comparing methods:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to compare methods'
      });
    }
  })
};

// ==================== HELPER FUNCTIONS ====================

function convertTermToMonths(termValue, termUnit) {
  switch (termUnit) {
    case 'DAYS': return Math.ceil(termValue / 30);
    case 'WEEKS': return Math.ceil(termValue * 7 / 30);
    case 'MONTHS': return termValue;
    case 'YEARS': return termValue * 12;
    default: return termValue;
  }
}

function adjustScheduleForFrequency(installments, paymentFrequency, termValue, termUnit) {
  if (paymentFrequency === 'MONTHLY') {
    return installments; // No adjustment needed
  }

  const adjustedSchedule = [];
  let scheduleIndex = 0;
  
  const totalPayments = getTotalPaymentsByFrequency(termValue, termUnit, paymentFrequency);
  
  for (let i = 0; i < totalPayments; i++) {
    if (scheduleIndex >= installments.length) {
      scheduleIndex = installments.length - 1;
    }
    
    const original = installments[scheduleIndex];
    const adjustedPayment = original.totalPayment / getFrequencyFactor(paymentFrequency);
    
    adjustedSchedule.push({
      installmentNo: i + 1,
      dueDate: calculateNextPaymentDate(i + 1, paymentFrequency),
      paymentAmount: adjustedPayment,
      principal: adjustedPayment * 0.7, // Approximate
      interest: adjustedPayment * 0.3,  // Approximate
      remainingBalance: Math.max(0, original.remainingBalance * (1 - (i / totalPayments)))
    });
    
    scheduleIndex += Math.ceil(installments.length / totalPayments);
  }
  
  return adjustedSchedule;
}

function getTotalPaymentsByFrequency(termValue, termUnit, paymentFrequency) {
  const termMonths = convertTermToMonths(termValue, termUnit);
  
  switch (paymentFrequency) {
    case 'DAILY': return termMonths * 30; // Approximate
    case 'WEEKLY': return termMonths * 4; // Approximate
    case 'BIWEEKLY': return termMonths * 2; // Approximate
    case 'MONTHLY': return termMonths;
    case 'QUARTERLY': return Math.ceil(termMonths / 3);
    case 'SEMI_ANNUAL': return Math.ceil(termMonths / 6);
    case 'ANNUAL': return Math.ceil(termMonths / 12);
    default: return termMonths;
  }
}

function getFrequencyFactor(paymentFrequency) {
  switch (paymentFrequency) {
    case 'DAILY': return 30;
    case 'WEEKLY': return 4;
    case 'BIWEEKLY': return 2;
    case 'MONTHLY': return 1;
    case 'QUARTERLY': return 1/3;
    case 'SEMI_ANNUAL': return 1/6;
    case 'ANNUAL': return 1/12;
    default: return 1;
  }
}

function calculateNextPaymentDate(periodNumber, paymentFrequency, startDate = new Date()) {
  const date = new Date(startDate);
  
  switch (paymentFrequency) {
    case 'DAILY':
      date.setDate(date.getDate() + periodNumber);
      break;
    case 'WEEKLY':
      date.setDate(date.getDate() + (periodNumber * 7));
      break;
    case 'BIWEEKLY':
      date.setDate(date.getDate() + (periodNumber * 14));
      break;
    case 'MONTHLY':
      date.setMonth(date.getMonth() + periodNumber);
      break;
    case 'QUARTERLY':
      date.setMonth(date.getMonth() + (periodNumber * 3));
      break;
    case 'SEMI_ANNUAL':
      date.setMonth(date.getMonth() + (periodNumber * 6));
      break;
    case 'ANNUAL':
      date.setFullYear(date.getFullYear() + periodNumber);
      break;
  }
  
  return date.toISOString().split('T')[0];
}

function calculateFees(product, principal) {
  const fees = {
    processingFee: 0,
    insuranceFee: 0,
    otherFees: 0,
    totalFees: 0
  };
  
  // Example fee calculation - adjust based on your product configuration
  if (product.PROCESSING_FEE_PERCENT) {
    fees.processingFee = principal * (product.PROCESSING_FEE_PERCENT / 100);
  }
  
  if (product.PROCESSING_FEE_FIXED) {
    fees.processingFee = Math.max(fees.processingFee, product.PROCESSING_FEE_FIXED);
  }
  
  fees.totalFees = fees.processingFee + fees.insuranceFee + fees.otherFees;
  
  return fees;
}

function calculateEffectiveRate(principal, totalRepayment, termMonths, paymentFrequency) {
  const totalInterest = totalRepayment - principal;
  const annualInterest = (totalInterest / termMonths) * 12;
  return ((annualInterest / principal) * 100).toFixed(2);
}

function calculateAPR(principal, totalRepayment, fees, termMonths) {
  const totalCost = totalRepayment + fees.totalFees;
  const monthlyRate = Math.pow(totalCost / principal, 1 / termMonths) - 1;
  const apr = monthlyRate * 12 * 100;
  return apr.toFixed(2);
}

export default LoanCalculatorController;