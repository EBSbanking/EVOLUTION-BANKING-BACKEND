import mongoose from 'mongoose';
import RateIndex from '../models/Rate-Index.js';
import LoanInterestRate from '../models/LoanInterestRate.js';
import CreditApplication from '../models/CreditApplication.js';
import WF_WORK_ITEM from '../models/WF_WORK_ITEM.js';
import CustomerAccount from "../models/CustomerAccount.js";
import NotificationService from '../Services/NotificationService.js';
import moment from 'moment';
import generateWorkflowIdentifiers from '../utils/generateWorkflowIdentifiers.js';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import LoanContractForm from '../models/LoanContractForm.js';
import LoanAccount from '../models/LoanAccount.js';
import Transaction from '../models/Transaction.js';
import { generateRepaymentSchedule, calculateMaturityDate } from '../utils/loanUtils.js';
import LoanContractController from '../controllers/LoanContractFormController.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import Customer from '../models/Customer.js';
import LoanFee from '../models/LoanFee.js';
import LoanProduct from '../models/LoanProduct.js';
import logAuditTrail from '../Services/AuditService.js';
import submitWorkflowItem from '../Services/workflowService.js';
import repaymentUtils from '../utils/repaymentUtils.js';
import { generateTransactionIds } from '../utils/generateAccountNumber.js';
import InterestAccrual from '../models/InterestAccrual.js';
import { addDays } from 'date-fns';
import InterestCalculationService from '../Services/InterestCalculationService.js';
import FeeCalculationService from '../Services/FeeCalculationService.js';
import { generateNumber } from '../utils/generateNumber.js';
import { generateLoanAccountNumberByProdId } from '../utils/generateLoanAccountId.js';
import { getProductTypeOnly } from '../controllers/ProductTypeMappingController.js';
import logger from '../utils/logger.js';
import { generateLoanAccountNumber, generateUniqueCreditApplicationId } from '../utils/loanUtils.js';
import Decimal from 'decimal.js';
import Counter from '../models/Counter.js';
import GLAccount from '../models/GLAccount.js';
import Guarantor from '../models/Guarantor.js';
import Charge from '../models/Charge.js';
import getErrorMessage from '../utils/errorUtils.js';
import LoanDisbursement from '../models/Disbursement.js'; 
import LoanRepayment from '../models/LoanRepayment.js';
import Disbursement from '../models/Disbursement.js';
import ProductTypeMapping from '../models/ProductTypeMapping.js';
// At the top of LoanAccountController.js, add this import:
import {  processLoanDisbursementTransactions,
  processDisbursement,
  getGLAccountsFromProduct } from '../Services/processLoanDisbursementTransactions.js';
import LoanPortfolio from '../models/LoanPortfolio.js';





const { Decimal128 } = mongoose.Types; 


const toDecimal128 = (value) => {
  if (value === null || value === undefined) return Decimal128.fromString('0');
  if (typeof value === 'object' && value._bsontype === 'Decimal128') return value;
  if (typeof value === 'number' && isNaN(value)) return Decimal128.fromString('0');
  return Decimal128.fromString(value.toString());
};

const normalizeCustId = (custId) => typeof custId === 'object' ? custId.toString() : custId;

// FIXED: Now you can instantiate it
const interestService = new InterestCalculationService();
const { getPaymentFrequency: getPaymentFrequencyFromUtils } = repaymentUtils;
const feeService = new FeeCalculationService();



// ==================== CORRECTED EMI CALCULATION FUNCTIONS ====================

// CORRECTED FIXED RATE EMI CALCULATION - SIMPLE INTEREST
// CORRECTED AND SIMPLIFIED EMI CALCULATION FUNCTIONS

// CORRECTED FIXED RATE EMI CALCULATION - SIMPLE INTEREST
function calculateFixedRateEMI(principal, annualRate, termValue, termCode, paymentFrequency, startDate) {
  console.log('=== CALCULATING FIXED RATE EMI (SIMPLE INTEREST) ===');
  console.log(`Principal: ${principal}, Annual Rate: ${annualRate}%, Term: ${termValue} ${termCode}, Frequency: ${paymentFrequency}`);
  
  // Convert annual rate to decimal
  const annualRateDecimal = annualRate / 100;
  
  // Get total number of payments based on frequency
  const totalPayments = getTotalPaymentsForFrequency(termValue, termCode, paymentFrequency);
  
  // Calculate time in years based on term code
  let timeInYears;
  switch(termCode.toUpperCase()) {
    case 'D': timeInYears = termValue / 365; break; // Days to years
    case 'W': timeInYears = termValue / 52; break;  // Weeks to years
    case 'BW': timeInYears = termValue / 26; break; // Bi-weeks to years
    case 'M': timeInYears = termValue / 12; break;  // Months to years
    case 'Q': timeInYears = termValue / 4; break;   // Quarters to years
    case 'Y': timeInYears = termValue; break;       // Years
    default: timeInYears = termValue / 12; break;   // Default to months
  }
  
  // For SIMPLE INTEREST (FIXED RATE): Total Interest = Principal * Annual Rate * Time in Years
  const totalInterest = principal * annualRateDecimal * timeInYears;
  const totalPayment = principal + totalInterest;
  const paymentAmount = totalPayment / totalPayments;
  
  console.log(`Time in Years: ${timeInYears.toFixed(4)}`);
  console.log(`Total Interest: ₦${totalInterest.toFixed(2)}`);
  console.log(`Total Payment: ₦${totalPayment.toFixed(2)}`);
  console.log(`Payment Amount: ₦${paymentAmount.toFixed(2)}`);
  console.log(`Total Payments: ${totalPayments}`);
  
  // Generate installments
  const installments = [];
  let remainingBalance = principal;
  
  for (let i = 1; i <= totalPayments; i++) {
    // For fixed rate (simple interest), interest portion is same each period
    const interestPortion = totalInterest / totalPayments;
    let principalPortion = paymentAmount - interestPortion;
    
    // Adjust for last payment to ensure exact balance
    if (i === totalPayments) {
      principalPortion = remainingBalance;
    }
    
    const dueDate = calculateNextPaymentDate(i, paymentFrequency, startDate);
    
    remainingBalance -= principalPortion;
    if (remainingBalance < 0.01) remainingBalance = 0;
    
    installments.push({
      installmentNo: i,
      installmentNumber: i,
      dueDate: dueDate,
      principal: parseFloat(principalPortion.toFixed(2)),
      interest: parseFloat(interestPortion.toFixed(2)),
      totalPayment: parseFloat((principalPortion + interestPortion).toFixed(2)),
      remainingBalance: parseFloat(remainingBalance.toFixed(2))
    });
  }
  
  // Verify totals
  const calculatedTotalInterest = installments.reduce((sum, inst) => sum + inst.interest, 0);
  const calculatedTotalPayment = installments.reduce((sum, inst) => sum + inst.totalPayment, 0);
  
  console.log(`Verified - Total Interest: ${calculatedTotalInterest.toFixed(2)}, Total Payment: ${calculatedTotalPayment.toFixed(2)}`);
  
  return {
    emi: parseFloat(paymentAmount.toFixed(2)),
    paymentAmount: parseFloat(paymentAmount.toFixed(2)),
    totalPayment: parseFloat(totalPayment.toFixed(2)),
    totalInterest: parseFloat(totalInterest.toFixed(2)),
    installments,
    calculationMethod: 'FIXED_RATE',
    interestType: 'SIMPLE',
    totalPeriods: totalPayments,
    paymentFrequency
  };
}

// CORRECTED REDUCING BALANCE EMI CALCULATION - COMPOUND INTEREST
function calculateReducingBalanceEMI(principal, annualRate, termValue, termCode, paymentFrequency, startDate) {
  console.log('=== CALCULATING REDUCING BALANCE EMI (COMPOUND INTEREST) ===');
  console.log(`Principal: ${principal}, Annual Rate: ${annualRate}%, Term: ${termValue} ${termCode}, Frequency: ${paymentFrequency}`);
  
  // Get total number of payments based on frequency
  const totalPayments = getTotalPaymentsForFrequency(termValue, termCode, paymentFrequency);
  
  // Determine periodic rate based on payment frequency
  let periodicRate;
  let periodsPerYear;
  
  switch(paymentFrequency.toUpperCase()) {
    case 'DAILY':
      periodicRate = annualRate / 100 / 365; // Daily rate
      periodsPerYear = 365;
      break;
    case 'WEEKLY':
      periodicRate = annualRate / 100 / 52; // Weekly rate
      periodsPerYear = 52;
      break;
    case 'BI_WEEKLY':
      periodicRate = annualRate / 100 / 26; // Bi-weekly rate
      periodsPerYear = 26;
      break;
    case 'MONTHLY':
      periodicRate = annualRate / 100 / 12; // Monthly rate
      periodsPerYear = 12;
      break;
    case 'QUARTERLY':
      periodicRate = annualRate / 100 / 4; // Quarterly rate
      periodsPerYear = 4;
      break;
    case 'YEARLY':
      periodicRate = annualRate / 100; // Annual rate
      periodsPerYear = 1;
      break;
    default:
      periodicRate = annualRate / 100 / 12; // Default to monthly
      periodsPerYear = 12;
  }
  
  console.log(`Periodic Rate (decimal): ${periodicRate.toFixed(6)}, Total Payments: ${totalPayments}`);
  console.log(`Monthly equivalent rate: ${(periodicRate * periodsPerYear / 12 * 100).toFixed(2)}%`);
  
  // Standard EMI formula for reducing balance (compound interest)
  let paymentAmount;
  if (periodicRate === 0) {
    paymentAmount = principal / totalPayments;
  } else {
    paymentAmount = principal * periodicRate * Math.pow(1 + periodicRate, totalPayments) /
                   (Math.pow(1 + periodicRate, totalPayments) - 1);
  }
  
  const totalPayment = paymentAmount * totalPayments;
  const totalInterest = totalPayment - principal;
  
  console.log(`Calculated: EMI: ₦${paymentAmount.toFixed(2)}`);
  console.log(`Total Payment: ₦${totalPayment.toFixed(2)}`);
  console.log(`Total Interest: ₦${totalInterest.toFixed(2)}`);
  
  // Generate amortization schedule
  const installments = [];
  let remainingBalance = principal;
  let totalPrincipalPaid = 0;
  
  for (let i = 1; i <= totalPayments; i++) {
    const interestPortion = remainingBalance * periodicRate;
    let principalPortion = paymentAmount - interestPortion;
    
    // Adjust for last payment to avoid rounding errors
    if (i === totalPayments) {
      principalPortion = remainingBalance;
    }
    
    const dueDate = calculateNextPaymentDate(i, paymentFrequency, startDate);
    
    remainingBalance -= principalPortion;
    totalPrincipalPaid += principalPortion;
    
    if (remainingBalance < 0.01) remainingBalance = 0;
    
    installments.push({
      installmentNo: i,
      installmentNumber: i,
      dueDate: dueDate,
      principal: parseFloat(principalPortion.toFixed(2)),
      interest: parseFloat(interestPortion.toFixed(2)),
      totalPayment: parseFloat((principalPortion + interestPortion).toFixed(2)),
      remainingBalance: parseFloat(remainingBalance.toFixed(2))
    });
  }
  
  // Fix rounding errors
  const roundingError = principal - totalPrincipalPaid;
  
  if (Math.abs(roundingError) > 0.01 && installments.length > 0) {
    const lastInstallment = installments[installments.length - 1];
    lastInstallment.principal = parseFloat((lastInstallment.principal + roundingError).toFixed(2));
    lastInstallment.totalPayment = parseFloat((lastInstallment.totalPayment + roundingError).toFixed(2));
    lastInstallment.remainingBalance = 0;
  }
  
  // Final check to ensure zero balance at the end
  if (installments.length > 0 && Math.abs(installments[installments.length - 1].remainingBalance) > 0.01) {
    installments[installments.length - 1].remainingBalance = 0;
  }
  
  // Recalculate totals after adjustments
  const finalTotalInterest = installments.reduce((sum, inst) => sum + inst.interest, 0);
  const finalTotalPayment = installments.reduce((sum, inst) => sum + inst.totalPayment, 0);
  
  console.log(`Final Total Interest: ₦${finalTotalInterest.toFixed(2)}`);
  console.log(`Final Total Payment: ₦${finalTotalPayment.toFixed(2)}`);
  
  return {
    emi: parseFloat(paymentAmount.toFixed(2)),
    paymentAmount: parseFloat(paymentAmount.toFixed(2)),
    totalPayment: parseFloat(finalTotalPayment.toFixed(2)),
    totalInterest: parseFloat(finalTotalInterest.toFixed(2)),
    installments,
    calculationMethod: 'REDUCING_BALANCE',
    interestType: 'COMPOUND',
    totalPeriods: totalPayments,
    paymentFrequency,
    periodicRate: periodicRate * 100 // Convert back to percentage
  };
}

// UPDATED AND CORRECTED calculateInterestAndEMIEnhanced FUNCTION
function calculateInterestAndEMIEnhanced(principalAmount, loanInterestRate, termValue, termCode, paymentFrequency, startDate) {
  console.log('=== ENHANCED EMI CALCULATION ===');
  console.log(`Principal: ${principalAmount}, Term: ${termValue} ${termCode}, Frequency: ${paymentFrequency}`);
  console.log(`Loan Interest Rate Details:`, {
    RATE_TY: loanInterestRate.RATE_TY,
    INT_TY: loanInterestRate.INT_TY,
    ABSOLUTE_RATE: loanInterestRate.ABSOLUTE_RATE,
    FIXED_RATE: loanInterestRate.FIXED_RATE
  });
  
  // Get the interest rate from loanInterestRate
  let rateValue = loanInterestRate.ABSOLUTE_RATE || loanInterestRate.FIXED_RATE || 0;
  
  console.log(`Raw rate value from DB: ${rateValue}%`);
  
  // CRITICAL FIX: Check if this is the 6.20% vs 74.40% issue
  // If rate seems too low for your business (e.g., 6.20% when expecting 74.40%)
  // Check if the rate in DB might be monthly instead of annual
  if (rateValue < 20 && loanInterestRate.RATE_TY === 'FIXED') {
    console.warn(`⚠️ WARNING: Rate ${rateValue}% seems too low for FIXED rate loan.`);
    console.warn(`Expected ~74.40%, got ${rateValue}%. Checking for rate conversion issue...`);
    
    // Try to see if rate should be multiplied by 12 (monthly to annual)
    const possibleMonthlyRate = rateValue;
    const possibleAnnualRate = rateValue * 12;
    
    console.log(`If ${rateValue}% is monthly rate: Annual = ${possibleAnnualRate}%`);
    
    // Ask user or implement logic to handle this
    // For now, we'll use the rate as-is but log warning
  }
  
  // IMPORTANT: Determine calculation method based on interest type
  if (loanInterestRate.INT_TY === 'SIMPLE' || loanInterestRate.RATE_TY === 'FIXED') {
    console.log(`Using FIXED RATE/SIMPLE INTEREST calculation with ${rateValue}% annual rate`);
    return calculateFixedRateEMI(principalAmount, rateValue, termValue, termCode, paymentFrequency, startDate);
  } else {
    console.log(`Using REDUCING BALANCE/COMPOUND INTEREST calculation with ${rateValue}% annual rate`);
    return calculateReducingBalanceEMI(principalAmount, rateValue, termValue, termCode, paymentFrequency, startDate);
  }
}

// NEW FUNCTION: Calculate EMI with explicit rate handling
function calculateEMIWithExplicitRate(principal, rate, isAnnualRate, termValue, termCode, paymentFrequency, startDate, calculationMethod, interestType) {
  console.log('=== CALCULATE EMI WITH EXPLICIT RATE ===');
  console.log(`Principal: ${principal}, Rate: ${rate}%, Is Annual Rate: ${isAnnualRate}`);
  console.log(`Term: ${termValue} ${termCode}, Method: ${calculationMethod}, Type: ${interestType}`);
  
  let annualRate = rate;
  
  // If rate is monthly, convert to annual
  if (!isAnnualRate) {
    annualRate = rate * 12;
    console.log(`Converted monthly rate ${rate}% to annual rate ${annualRate}%`);
  }
  
  if (calculationMethod === 'FIXED_RATE' || interestType === 'SIMPLE') {
    return calculateFixedRateEMI(principal, annualRate, termValue, termCode, paymentFrequency, startDate);
  } else {
    return calculateReducingBalanceEMI(principal, annualRate, termValue, termCode, paymentFrequency, startDate);
  }
}

// Helper function to calculate next payment date
function calculateNextPaymentDate(periodNumber, paymentFrequency, startDate = new Date()) {
  const date = new Date(startDate);
  
  switch(paymentFrequency.toUpperCase()) {
    case 'DAILY':
      date.setDate(date.getDate() + periodNumber);
      break;
    case 'WEEKLY':
      date.setDate(date.getDate() + (periodNumber * 7));
      break;
    case 'BI_WEEKLY':
      date.setDate(date.getDate() + (periodNumber * 14));
      break;
    case 'MONTHLY':
      date.setMonth(date.getMonth() + periodNumber);
      break;
    case 'QUARTERLY':
      date.setMonth(date.getMonth() + (periodNumber * 3));
      break;
    case 'YEARLY':
      date.setFullYear(date.getFullYear() + periodNumber);
      break;
    default:
      date.setMonth(date.getMonth() + periodNumber);
  }
  
  return date;
}

// Helper function to get total payments for frequency
function getTotalPaymentsForFrequency(termValue, termCode, paymentFrequency) {
  termCode = String(termCode).toUpperCase();
  paymentFrequency = String(paymentFrequency).toUpperCase();
  
  switch (termCode) {
    case 'D': // Days
      switch (paymentFrequency) {
        case 'DAILY': return termValue;
        case 'WEEKLY': return Math.ceil(termValue / 7);
        default: return termValue;
      }
    case 'W': // Weeks
      switch (paymentFrequency) {
        case 'DAILY': return termValue * 7;
        case 'WEEKLY': return termValue;
        case 'BI_WEEKLY': return Math.ceil(termValue / 2);
        default: return termValue;
      }
    case 'BW': // Bi-weeks
      switch (paymentFrequency) {
        case 'DAILY': return termValue * 14;
        case 'WEEKLY': return termValue * 2;
        case 'BI_WEEKLY': return termValue;
        default: return termValue;
      }
    case 'M': // Months
      switch (paymentFrequency) {
        case 'DAILY': return Math.ceil(termValue * 30);
        case 'WEEKLY': return Math.ceil(termValue * 4.33);
        case 'BI_WEEKLY': return Math.ceil(termValue * 2.17);
        case 'MONTHLY': return termValue;
        case 'QUARTERLY': return Math.ceil(termValue / 3);
        case 'YEARLY': return Math.ceil(termValue / 12);
        default: return termValue;
      }
    case 'Q': // Quarters
      switch (paymentFrequency) {
        case 'MONTHLY': return termValue * 3;
        case 'QUARTERLY': return termValue;
        case 'YEARLY': return Math.ceil(termValue / 4);
        default: return termValue;
      }
    case 'Y': // Years
      switch (paymentFrequency) {
        case 'DAILY': return Math.ceil(termValue * 365);
        case 'WEEKLY': return Math.ceil(termValue * 52);
        case 'MONTHLY': return termValue * 12;
        case 'QUARTERLY': return termValue * 4;
        case 'YEARLY': return termValue;
        default: return termValue;
      }
    default:
      return termValue;
  }
}

// Helper function to determine payment frequency from term code
function getPaymentFrequency(termCode, termValue) {
  termCode = String(termCode).toUpperCase();
  switch (termCode) {
    case 'D': return 'DAILY';
    case 'W': return 'WEEKLY';
    case 'BW': return 'BI_WEEKLY';
    case 'M': return 'MONTHLY';
    case 'Q': return 'QUARTERLY';
    case 'Y': return termValue <= 1 ? 'MONTHLY' : 'YEARLY';
    default: return 'MONTHLY';
  }
}


// Helper functions
function generateId(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

function generateNumericId() {
  return Math.floor(100000000000 + Math.random() * 900000000000);
}

async function generateUniqueLoanAccountId() {
  let id, exists = true;
  while (exists) {
    id = generateNumber(10);
    exists = await LoanAccount.findOne({ loanAccountId: id });
  }
  return id;
}

const getTermDescription = (termCode) => {
  switch (termCode.toUpperCase()) {
    case 'D': return 'Days';
    case 'W': return 'Weeks';
    case 'BW': return 'Bi-Weeks';
    case 'M': return 'Months';
    case 'Q': return 'Quarters';
    case 'Y': return 'Years';
    default: return 'Months';
  }
};

const convertTermCodeToFrequency = (termCode) => {
  switch (termCode.toUpperCase()) {
    case 'D': return 'DAILY';
    case 'W': return 'WEEKLY';
    case 'BW': return 'BI_WEEKLY';
    case 'M': return 'MONTHLY';
    case 'Q': return 'QUARTERLY';
    case 'Y': return 'YEARLY';
    default: throw new Error(`Invalid term code: ${termCode}`);
  }
};

const generateContractText = (loanDetails, customerDetails, loanProduct, effectiveInterestRate) => {
  try {
    let interestRate;
    
    if (effectiveInterestRate !== undefined && effectiveInterestRate !== null) {
      if (effectiveInterestRate && typeof effectiveInterestRate === 'object') {
        if (effectiveInterestRate.toString && typeof effectiveInterestRate.toString === 'function') {
          interestRate = parseFloat(effectiveInterestRate.toString());
        } else if (effectiveInterestRate.$numberDecimal) {
          interestRate = parseFloat(effectiveInterestRate.$numberDecimal);
        } else {
          interestRate = parseFloat(effectiveInterestRate);
        }
      } else if (typeof effectiveInterestRate === 'number') {
        interestRate = effectiveInterestRate;
      } else if (typeof effectiveInterestRate === 'string') {
        interestRate = parseFloat(effectiveInterestRate);
      }
    }
    
    if (isNaN(interestRate) || interestRate === undefined) {
      interestRate = parseFloat(loanDetails.INTEREST_RATE);
    }
    
    if (isNaN(interestRate) || !isFinite(interestRate)) {
      console.error('CRITICAL: No valid interest rate found for contract generation');
      interestRate = parseFloat(loanProduct?.interestRate) || 
                    parseFloat(loanProduct?.rateInformation?.rate) || 
                    12.0;
      console.warn(`Using fallback interest rate: ${interestRate}%`);
    }

    const amount = Number(loanDetails.AMOUNT) || 0;
    const fees = loanProduct.feeStructure || [];
    const processingFee = loanProduct.processingFeeRate
      ? `${(parseFloat(loanProduct.processingFeeRate) * 100).toFixed(2)}%`
      : '0%';
    
    const feeDetails = fees
      .filter(fee => fee.isActive)
      .map(fee => `${fee.name}: ${fee.isPercentage ? `${parseFloat(fee.amount) * 100}%` : parseFloat(fee.amount)}`)
      .join('\n');

    const getTermDescription = (termCode) => {
      const termMap = {
        'D': 'Days',
        'W': 'Weeks',
        'BW': 'Bi-Weeks',
        'M': 'Months',
        'Q': 'Quarters',
        'Y': 'Years'
      };
      return termMap[termCode] || 'Months';
    };

    const convertTermCodeToFrequency = (termCode) => {
      const frequencyMap = {
        'D': 'Daily',
        'W': 'Weekly',
        'BW': 'Bi-Weekly',
        'M': 'Monthly',
        'Q': 'Quarterly',
        'Y': 'Yearly'
      };
      return frequencyMap[termCode] || 'Monthly';
    };

    const formatDate = (dateInput) => {
      if (!dateInput) return 'Not specified';
      try {
        const date = new Date(dateInput);
        return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleDateString('en-NG', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      } catch (error) {
        return 'Invalid date';
      }
    };

    return `LOAN AGREEMENT

This Agreement is made on ${new Date().toLocaleDateString('en-NG', {
  year: 'numeric',
  month: 'long',
  day: 'numeric'
})} between:

BORROWER: 
${loanDetails.borrower_name || customerDetails?.ACCT_NM || customerDetails?.CUST_NM || 'Customer'}
${loanDetails.borrower_address || customerDetails?.HOME_ADDRESS || 'Address not provided'}

AND

LENDER: 
${process.env.BANK_NAME || 'Our Bank'}

ARTICLE 1: LOAN TERMS

1.1 Principal Amount: ${amount.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
1.2 Interest Rate: ${interestRate.toFixed(2)}% per annum
1.3 Loan Term: ${loanDetails.TERM_VALUE || 0} ${getTermDescription(loanDetails.TERM_CD || 'M')}
1.4 Loan Purpose: ${loanDetails.loan_purpose || 'General Business Purpose'}
1.5 Disbursement Date: ${formatDate(loanDetails.DISBURSEMENT_DATE)}

ARTICLE 2: REPAYMENT TERMS

2.1 Payment Frequency: ${convertTermCodeToFrequency(loanDetails.TERM_CD || 'M')}
2.2 Number of Installments: ${loanDetails.NUMBER_OF_INSTALLMENTS || 'Not specified'}
2.3 First Payment Date: ${formatDate(loanDetails.FIRST_PAYMENT_DATE)}
2.4 Final Payment Date: ${formatDate(loanDetails.LAST_PAYMENT_DATE)}

ARTICLE 3: FEES AND CHARGES

3.1 Processing Fee: ${processingFee}
${feeDetails ? `3.2 Other Fees:\n${feeDetails.split('\n').map(fee => `   ${fee}`).join('\n')}` : '3.2 Other Fees: None'}

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.

BORROWER:
_________________________
Name: ${loanDetails.borrower_name || customerDetails?.ACCT_NM || customerDetails?.CUST_NM || 'Borrower'}
Signature: ___________________
Date: ___________________

LENDER:
_________________________
Name: ${process.env.BANK_NAME || 'Our Bank'}
Signature: ___________________
Date: ___________________`;
  } catch (error) {
    console.error('Error generating contract text:', error);
    return `LOAN AGREEMENT 
    
Between ${loanDetails.borrower_name || 'Borrower'} 
And ${process.env.BANK_NAME || 'Our Bank'}

Principal Amount: ${loanDetails.AMOUNT || 0}
Interest Rate: ${effectiveInterestRate?.toString() || loanDetails.INTEREST_RATE || 'Rate not specified'}%
Term: ${loanDetails.TERM_VALUE || 0} ${loanDetails.TERM_CD || 'M'}

NOTE: Contract generated with limited details due to system error.

Signatures:
___________________________
Borrower

___________________________
Lender
Date: ${new Date().toLocaleDateString()}`;
  }
};


const LoanAccountController = {

  // =========================
  // CORE LOAN OPERATIONS
  // =========================

async applyForLoan(req, res) {
    // ==================== INNER HELPER FUNCTIONS ====================
   
    async function getLoanCycleCount(custId, session) {
      try {
        const query = LoanAccount.countDocuments({ CUST_ID: custId });
        if (session) query.session(session);
        const loanCount = await query;
        return loanCount + 1;
      } catch (error) {
        console.error('Error in getLoanCycleCount:', error);
        throw {
          code: 'LOAN_CYCLE_COUNT_ERROR',
          message: 'Failed to retrieve loan cycle count',
          status: 500,
        };
      }
    }
 
    function calculateMaturityDate(startDate, termCode, termValue) {
      termCode = String(termCode).toUpperCase();
      const result = new Date(startDate);
      switch (termCode) {
        case 'D': result.setDate(result.getDate() + termValue); break;
        case 'W': result.setDate(result.getDate() + termValue * 7); break;
        case 'BW': result.setDate(result.getDate() + termValue * 14); break;
        case 'M': result.setMonth(result.getMonth() + termValue); break;
        case 'Q': result.setMonth(result.getMonth() + termValue * 3); break;
        case 'Y': result.setFullYear(result.getFullYear() + termValue); break;
        default: throw new Error(`Invalid term code: ${termCode}`);
      }
      return result;
    }
 
    function getPaymentFrequency(termCode, termValue) {
      termCode = String(termCode).toUpperCase();
      switch (termCode) {
        case 'D': return 'DAILY';
        case 'W': return 'WEEKLY';
        case 'BW': return 'BI_WEEKLY';
        case 'M': return 'MONTHLY';
        case 'Q': return 'QUARTERLY';
        case 'Y': return termValue <= 1 ? 'MONTHLY' : 'YEARLY';
        default: return 'MONTHLY';
      }
    }
 
    async function findGuarantor(guarantorId, session) {
      try {
        if (!guarantorId) {
          return null;
        }
 
        if (!isNaN(guarantorId)) {
          let query = Guarantor.findOne({ GUARANTOR_ID: Number(guarantorId) });
          if (session) query = query.session(session);
          const byNumber = await query;
          if (byNumber) return byNumber;
        }
 
        if (mongoose.Types.ObjectId.isValid(guarantorId)) {
          let query = Guarantor.findById(guarantorId);
          if (session) query = query.session(session);
          const byObjectId = await query;
          if (byObjectId) return byObjectId;
        }
 
        let query = Guarantor.findOne({ GUARANTOR_ID: guarantorId.toString() });
        if (session) query = query.session(session);
        const byString = await query;
        return byString;
      } catch (error) {
        console.error('Error finding guarantor:', error);
        return null;
      }
    }
 
    async function checkGuarantorExistingLoans(guarantorId, session) {
      try {
        console.log(`Checking existing loans for guarantor: ${guarantorId}`);
       
        let query = LoanAccount.find({
          GUARANTOR_ID: guarantorId,
          LOAN_STATUS: { $in: ['ACTIVE', 'PENDING', 'APPROVED'] }
        });
       
        if (session) {
          query = query.session(session);
        }
 
        const existingLoans = await query;
        console.log(`Found ${existingLoans.length} existing loans for guarantor`);
 
        if (existingLoans.length > 0) {
          const loanDetails = existingLoans.map(loan => ({
            loanAccountId: loan.loanAccountId,
            ACCT_NO: loan.ACCT_NO,
            LOAN_STATUS: loan.LOAN_STATUS,
            DISBURSEMENT_LIMIT: parseFloat(loan.DISBURSEMENT_LIMIT?.toString() || '0'),
            GUARANTEED_AMOUNT: parseFloat(loan.GUARANTEED_AMOUNT?.toString() || '0'),
            CUST_ID: loan.CUST_ID,
            START_DT: loan.START_DT,
            MATURITY_DT: loan.MATURITY_DT
          }));
 
          return {
            hasExistingLoans: true,
            totalExistingLoans: existingLoans.length,
            loanDetails: loanDetails,
            totalGuaranteedAmount: loanDetails.reduce((sum, loan) => sum + loan.GUARANTEED_AMOUNT, 0)
          };
        }
 
        return {
          hasExistingLoans: false,
          totalExistingLoans: 0,
          loanDetails: [],
          totalGuaranteedAmount: 0
        };
      } catch (error) {
        console.error('Error checking guarantor existing loans:', error);
        return {
          hasExistingLoans: false,
          totalExistingLoans: 0,
          loanDetails: [],
          totalGuaranteedAmount: 0
        };
      }
    }
 
    async function findRateIndex(rateIndexId, session) {
      try {
        let query = {};
       
        const numericId = parseInt(rateIndexId);
        if (!isNaN(numericId)) {
          query = { INDEX_RATE_ID: numericId };
        } else {
          query = { INDEX_RATE_ID: rateIndexId };
        }
 
        let rateQuery = RateIndex.findOne(query);
        if (session) rateQuery = rateQuery.session(session);
        let rateIndex = await rateQuery;
       
        if (!rateIndex) {
          console.warn(`Rate index ${rateIndexId} not found, looking for default...`);
         
          let defaultQuery = RateIndex.findOne({ IS_DEFAULT: true });
          if (session) defaultQuery = defaultQuery.session(session);
          rateIndex = await defaultQuery;
         
          if (!rateIndex) {
            let firstQuery = RateIndex.findOne({});
            if (session) firstQuery = firstQuery.session(session);
            rateIndex = await firstQuery;
           
            if (rateIndex) {
              console.warn(`Using first available rate index: ${rateIndex.INDEX_RATE_ID} instead of requested ${rateIndexId}`);
            } else {
              console.warn('No rate indexes available in the system');
              return null;
            }
          } else {
            console.warn(`Using default rate index: ${rateIndex.INDEX_RATE_ID} instead of requested ${rateIndexId}`);
          }
        }
       
        return rateIndex;
      } catch (error) {
        console.error('Error in findRateIndex:', error);
        return null;
      }
    }
 
    // UPDATED: Find LoanInterestRate using LOAN_PROUD_INT_ID instead of PROD_ID
    async function findLoanInterestRate(LOAN_PROUD_INT_ID, INDEX_RATE_ID, session) {
      try {
        console.log(`Looking for LoanInterestRate with LOAN_PROUD_INT_ID: ${LOAN_PROUD_INT_ID}, INDEX_RATE_ID: ${INDEX_RATE_ID}`);
       
        let query = {};
       
        // First, try to find by LOAN_PROUD_INT_ID
        if (LOAN_PROUD_INT_ID) {
          const numericLoanProudIntId = parseInt(LOAN_PROUD_INT_ID);
          if (!isNaN(numericLoanProudIntId)) {
            query = {
              LOAN_PROUD_INT_ID: numericLoanProudIntId,
              STATUS: 'ACTIVE'
            };
          } else {
            query = {
              LOAN_PROUD_INT_ID: LOAN_PROUD_INT_ID.toString(),
              STATUS: 'ACTIVE'
            };
          }
         
          let rateQuery = LoanInterestRate.findOne(query).populate('INDEX_RATE_ID');
          if (session) rateQuery = rateQuery.session(session);
          const loanInterestRate = await rateQuery;
         
          if (loanInterestRate) {
            console.log(`Found LoanInterestRate by LOAN_PROUD_INT_ID: ${loanInterestRate.LOAN_PROUD_INT_ID} - ${loanInterestRate.name}`);
            return loanInterestRate;
          }
        }
       
        // If not found by LOAN_PROUD_INT_ID, try by INDEX_RATE_ID
        if (INDEX_RATE_ID) {
          query = {
            INDEX_RATE_ID: parseInt(INDEX_RATE_ID),
            STATUS: 'ACTIVE'
          };
         
          let rateQuery = LoanInterestRate.findOne(query).populate('INDEX_RATE_ID');
          if (session) rateQuery = rateQuery.session(session);
          const loanInterestRate = await rateQuery;
         
          if (loanInterestRate) {
            console.log(`Found LoanInterestRate by INDEX_RATE_ID: ${loanInterestRate.LOAN_PROUD_INT_ID} - ${loanInterestRate.name}`);
            return loanInterestRate;
          }
        }
       
        // If still not found, try to find any active rate
        console.warn(`No LoanInterestRate found for LOAN_PROUD_INT_ID: ${LOAN_PROUD_INT_ID} or INDEX_RATE_ID: ${INDEX_RATE_ID}, looking for any active rate...`);
       
        let fallbackQuery = LoanInterestRate.findOne({
          STATUS: 'ACTIVE'
        }).populate('INDEX_RATE_ID');
       
        if (session) fallbackQuery = fallbackQuery.session(session);
        const fallbackRate = await fallbackQuery;
       
        if (fallbackRate) {
          console.warn(`Using fallback LoanInterestRate: ${fallbackRate.LOAN_PROUD_INT_ID} - ${fallbackRate.name}`);
          return fallbackRate;
        }
       
        console.warn('No active LoanInterestRate found in the system');
        return null;
       
      } catch (error) {
        console.error('Error in findLoanInterestRate:', error);
        return null;
      }
    }
 
    // NEW: Find LoanInterestRate by PROD_ID (for backward compatibility)
    async function findLoanInterestRateByProduct(PROD_ID, INDEX_RATE_ID, session) {
      try {
        console.log(`Looking for LoanInterestRate for product: ${PROD_ID}`);
       
        // Try to find rates that might be associated with this product
        // We can look for patterns in the name or code
        let query = LoanInterestRate.findOne({
          $or: [
            { name: { $regex: `PROD_${PROD_ID}`, $options: 'i' } },
            { code: { $regex: `^LO-.*-${PROD_ID}`, $options: 'i' } },
            { description: { $regex: `Product ${PROD_ID}`, $options: 'i' } }
          ],
          STATUS: 'ACTIVE'
        }).populate('INDEX_RATE_ID');
       
        if (session) query = query.session(session);
       
        let loanInterestRate = await query;
       
        if (!loanInterestRate) {
          // Try by INDEX_RATE_ID if provided
          if (INDEX_RATE_ID) {
            query = LoanInterestRate.findOne({
              INDEX_RATE_ID: parseInt(INDEX_RATE_ID),
              STATUS: 'ACTIVE'
            }).populate('INDEX_RATE_ID');
           
            if (session) query = query.session(session);
            loanInterestRate = await query;
          }
         
          if (!loanInterestRate) {
            // Try to find any active rate
            query = LoanInterestRate.findOne({
              STATUS: 'ACTIVE'
            }).populate('INDEX_RATE_ID');
           
            if (session) query = query.session(session);
            loanInterestRate = await query;
           
            if (loanInterestRate) {
              console.warn(`Using first available LoanInterestRate: ${loanInterestRate.LOAN_PROUD_INT_ID} for product ${PROD_ID}`);
            }
          }
        }
       
        if (loanInterestRate) {
          console.log(`Found LoanInterestRate for product ${PROD_ID}: ${loanInterestRate.LOAN_PROUD_INT_ID} - ${loanInterestRate.name}`);
        }
       
        return loanInterestRate;
      } catch (error) {
        console.error('Error in findLoanInterestRateByProduct:', error);
        return null;
      }
    }
 
    function safeDecimal128(value, fieldName = 'value') {
      console.log(`safeDecimal128: Converting field ${fieldName} with value:`, value);
     
      if (value === null || value === undefined) {
        throw new Error(`Invalid ${fieldName}: null or undefined. Field: ${fieldName}, Value: ${value}`);
      }
     
      if (value instanceof mongoose.Types.Decimal128) {
        return value;
      }
     
      const numericValue = typeof value === 'string' ? parseFloat(value) : Number(value);
     
      if (isNaN(numericValue)) {
        throw new Error(`Invalid ${fieldName}: not a number. Field: ${fieldName}, Value: ${value}`);
      }
     
      if (!isFinite(numericValue)) {
        throw new Error(`Invalid ${fieldName}: infinite value. Field: ${fieldName}, Value: ${value}`);
      }
     
      try {
        return mongoose.Types.Decimal128.fromString(numericValue.toFixed(2));
      } catch (error) {
        console.error(`Error converting ${fieldName} to Decimal128:`, error);
        throw new Error(`Failed to convert ${fieldName} to Decimal128: ${error.message}`);
      }
    }
 
    const normalizeBorrowerAddress = (address) => {
      if (!address || typeof address !== 'object') return null;
      return {
        street: address.street || address.Street || '',
        city: address.city || address.City || '',
        state: address.state || address.State || '',
        zipCode: address.zipCode || address.ZIPCode || address.zipcode || '',
        country: address.country || address.Country || 'Nigeria'
      };
    };
 
    async function generateWorkflowIdentifiers(session) {
      const timestamp = Date.now();
      return {
        TRANSACTION_ID: `TXN-${timestamp}`,
        WORK_ITEM_ID: `WORK-${timestamp}`,
        EVENT_ID: `EVT-${timestamp}`,
        WORKFLOW_ID: `WF-${timestamp}`,
        TRAN_JOURNAL_ID: `JRN-${timestamp}`
      };
    }
 
    async function generateLoanAccountNumberByProdId(prodId) {
      const prefix = prodId.toString().padStart(3, '0');
      const randomSuffix = Math.floor(1000000 + Math.random() * 9000000).toString().padStart(7, '0');
      return `${prefix}${randomSuffix}`;
    }
 
    // NEW: Function to calculate EMI with chosen method
    function calculateEMIWithChosenMethod(principal, annualRate, termValue, termCode, paymentFrequency, startDate, calculationMethod) {
      console.log('=== CALCULATING EMI WITH CHOSEN METHOD ===');
      console.log(`Method: ${calculationMethod}, Rate: ${annualRate}%`);
     
      // Force the calculation method based on user choice
      if (calculationMethod === 'FLAT_RATE' || calculationMethod === 'FIXED_RATE') {
        console.log('Using FLAT RATE (Simple Interest) calculation');
        return calculateFixedRateEMI(principal, annualRate, termValue, termCode, paymentFrequency, startDate);
      } else if (calculationMethod === 'REDUCING_BALANCE' || calculationMethod === 'EMI') {
        console.log('Using REDUCING BALANCE (Compound Interest) calculation');
        return calculateReducingBalanceEMI(principal, annualRate, termValue, termCode, paymentFrequency, startDate);
      } else {
        console.warn(`Unknown calculation method: ${calculationMethod}, defaulting to REDUCING_BALANCE`);
        return calculateReducingBalanceEMI(principal, annualRate, termValue, termCode, paymentFrequency, startDate);
      }
    }
 
    // ==================== PRODUCT VALIDATION USING ProductTypeMapping ====================
 
    async function validateProductUsingMapping(PROD_ID, PRODUCT_TYPE, session) {
      try {
        console.log(`Validating product using ProductTypeMapping: PROD_ID=${PROD_ID}, PRODUCT_TYPE=${PRODUCT_TYPE}`);
       
        // Check if product exists in ProductTypeMapping
        let productMapping;
        if (session) {
          productMapping = await ProductTypeMapping.findOne({
            PROD_ID: PROD_ID
          }).session(session);
        } else {
          productMapping = await ProductTypeMapping.findOne({
            PROD_ID: PROD_ID
          });
        }
       
        // If no mapping exists OR mapping exists but missing PRODUCT_TYPE
        if (!productMapping) {
          console.warn(`No ProductTypeMapping found for PROD_ID ${PROD_ID}. Creating new mapping...`);
          return await createNewProductMapping(PROD_ID, PRODUCT_TYPE, session);
        }
       
        // Check if PRODUCT_TYPE is missing in existing mapping
        if (!productMapping.PRODUCT_TYPE) {
          console.warn(`ProductTypeMapping found for PROD_ID ${PROD_ID} but missing PRODUCT_TYPE. Inferring from product name...`);
         
          // Try to infer PRODUCT_TYPE from productName or PROD_ID
          let inferredProductType = inferProductTypeFromData(productMapping, PRODUCT_TYPE, PROD_ID);
         
          console.log(`Inferred PRODUCT_TYPE for PROD_ID ${PROD_ID}: ${inferredProductType}`);
         
          // Update the existing mapping with the inferred PRODUCT_TYPE
          productMapping.PRODUCT_TYPE = inferredProductType;
         
          // Also set accountPrefix based on the inferred product type
          if (!productMapping.accountPrefix || productMapping.accountPrefix === '10') {
            productMapping.accountPrefix = getAccountPrefixForProductType(inferredProductType);
          }
         
          // Save the updated mapping
          if (session) {
            await productMapping.save({ session });
          } else {
            await productMapping.save();
          }
         
          console.log(`Updated ProductTypeMapping for PROD_ID ${PROD_ID} with PRODUCT_TYPE: ${inferredProductType}`);
         
          return {
            isValid: true,
            productType: inferredProductType,
            productName: productMapping.productName,
            isLoanProduct: true,
            accountPrefix: productMapping.accountPrefix,
            isGlobalProduct: productMapping.isGlobalProduct || true,
            BU_ID: productMapping.BU_ID || ['*'],
            glAccounts: productMapping.glAccounts || {},
            isAutoGenerated: false,
            wasUpdated: true
          };
        }
       
        // Product mapping exists and has PRODUCT_TYPE - validate it
        const normalizedProductType = productMapping.PRODUCT_TYPE.toUpperCase().replace(/ /g, '_');
        const isLoanProduct = normalizedProductType.includes('LOAN') ||
                              normalizedProductType === 'MORTGAGE' ||
                              normalizedProductType === 'CREDIT_CARD';
       
        if (!isLoanProduct) {
          throw new Error(`PRODUCT_TYPE ${productMapping.PRODUCT_TYPE} in ProductTypeMapping is not a valid loan product`);
        }
       
        // Check if provided PRODUCT_TYPE matches mapping (if provided)
        if (PRODUCT_TYPE && PRODUCT_TYPE !== '') {
          const normalizedProvidedType = PRODUCT_TYPE.toUpperCase().replace(/ /g, '_');
         
          if (normalizedProvidedType !== normalizedProductType) {
            console.warn(`PRODUCT_TYPE mismatch: Provided "${PRODUCT_TYPE}" doesn't match mapped "${productMapping.PRODUCT_TYPE}". Using mapped type.`);
          }
        }
       
        // Ensure BU_ID exists in the mapping
        if (!productMapping.BU_ID || !Array.isArray(productMapping.BU_ID)) {
          console.warn(`BU_ID not found or invalid in ProductTypeMapping for PROD_ID ${PROD_ID}. Defaulting to ['*']`);
          productMapping.BU_ID = ['*'];
        }
       
        return {
          isValid: true,
          productType: productMapping.PRODUCT_TYPE,
          productName: productMapping.productName,
          isLoanProduct: isLoanProduct,
          accountPrefix: productMapping.accountPrefix,
          isGlobalProduct: productMapping.isGlobalProduct,
          BU_ID: productMapping.BU_ID,
          glAccounts: productMapping.glAccounts,
          isAutoGenerated: false,
          wasUpdated: false
        };
      } catch (error) {
        console.error('Error in validateProductUsingMapping:', error);
        throw {
          code: 'PRODUCT_VALIDATION_ERROR',
          message: `Failed to validate product: ${error.message}`,
          status: 400,
        };
      }
    }
 
    function inferProductTypeFromData(productMapping, providedProductType, prodId) {
      // First priority: Use provided PRODUCT_TYPE if available
      if (providedProductType && providedProductType.trim() !== '') {
        return providedProductType.toUpperCase().replace(/ /g, '_');
      }
     
      // Second priority: Infer from productName
      if (productMapping.productName) {
        const productName = productMapping.productName.toLowerCase();
       
        if (productName.includes('individual')) {
          return 'INDIVIDUAL_LOAN';
        } else if (productName.includes('business') || productName.includes('term')) {
          return 'BUSINESS_TERM_LOAN';
        } else if (productName.includes('consumer')) {
          return 'CONSUMER_LOAN';
        } else if (productName.includes('personal')) {
          return 'PERSONAL_LOAN';
        } else if (productName.includes('auto')) {
          return 'AUTO_LOAN';
        } else if (productName.includes('mortgage')) {
          return 'MORTGAGE';
        } else if (productName.includes('education')) {
          return 'EDUCATION_LOAN';
        } else if (productName.includes('sme')) {
          return 'SME_LOAN';
        } else if (productName.includes('group')) {
          return 'GROUP_LOAN';
        } else if (productName.includes('staff')) {
          return 'STAFF_LOAN';
        } else if (productName.includes('loan')) {
          return 'GENERAL_LOAN';
        }
      }
     
      // Third priority: Infer from PROD_ID
      if (prodId === 301) {
        return 'INDIVIDUAL_LOAN';
      } else if (prodId === 300) {
        return 'BUSINESS_TERM_LOAN';
      } else if (prodId === 302) {
        return 'CONSUMER_LOAN';
      } else if (prodId === 303) {
        return 'MORTGAGE';
      } else if (prodId === 304) {
        return 'AUTO_LOAN';
      } else if (prodId === 305) {
        return 'PERSONAL_LOAN';
      } else if (prodId === 306) {
        return 'EDUCATION_LOAN';
      } else if (prodId === 307) {
        return 'CREDIT_CARD';
      } else if (prodId === 308) {
        return 'LINE_OF_CREDIT';
      } else if (prodId === 309) {
        return 'SME_LOAN';
      } else if (prodId >= 300 && prodId <= 399) {
        return 'GENERAL_LOAN';
      }
     
      // Default fallback
      return 'GENERAL_LOAN';
    }
 
    async function createNewProductMapping(PROD_ID, PRODUCT_TYPE, session) {
      // Determine product type from PRODUCT_TYPE or default
      let resolvedProductType = PRODUCT_TYPE;
      if (!resolvedProductType || resolvedProductType === '') {
        // Try to determine from PROD_ID pattern
        if (PROD_ID === 301) {
          resolvedProductType = 'INDIVIDUAL_LOAN';
        } else if (PROD_ID >= 300 && PROD_ID <= 399) {
          resolvedProductType = 'GENERAL_LOAN';
        } else {
          resolvedProductType = 'GENERAL_LOAN';
        }
      }
     
      resolvedProductType = resolvedProductType.toUpperCase().replace(/ /g, '_');
     
      // Check if it's a loan product
      const isLoanProduct = resolvedProductType.includes('LOAN') ||
                            resolvedProductType === 'MORTGAGE' ||
                            resolvedProductType === 'CREDIT_CARD';
     
      if (!isLoanProduct) {
        throw new Error(`PRODUCT_TYPE ${resolvedProductType} is not a valid loan product`);
      }
     
      // Get GL accounts from the LoanProduct if available
      let loanGLAccount = '100100';
      let interestGLAccountNo = '400100';
     
      let loanProduct;
      if (session) {
        loanProduct = await LoanProduct.findOne({ PROD_ID: PROD_ID }).session(session);
      } else {
        loanProduct = await LoanProduct.findOne({ PROD_ID: PROD_ID });
      }
     
      if (loanProduct) {
        console.log(`Found LoanProduct for PROD_ID ${PROD_ID}, using its GL accounts`);
        if (loanProduct.defaultGLAccounts && loanProduct.defaultGLAccounts.loanGLAccount) {
          loanGLAccount = loanProduct.defaultGLAccounts.loanGLAccount;
        }
        if (loanProduct.defaultGLAccounts && loanProduct.defaultGLAccounts.interestGLAccountNo) {
          interestGLAccountNo = loanProduct.defaultGLAccounts.interestGLAccountNo;
        }
      }
     
      // Create new dynamic mapping
      const dynamicMapping = new ProductTypeMapping({
        PROD_ID: PROD_ID,
        PRODUCT_TYPE: resolvedProductType,
        productName: `Auto-generated Product ${PROD_ID}`,
        accountPrefix: getAccountPrefixForProductType(resolvedProductType),
        BU_ID: ['*'],
        isGlobalProduct: true,
        visibility: 'GLOBAL',
        glAccounts: {
          loanGLAccount: loanGLAccount,
          interestGLAccountNo: interestGLAccountNo,
          principalGLAccountNo: loanGLAccount,
          interestIncomeGLAccountNo: interestGLAccountNo,
          SETTLEMENT_GL_ACCT_NO: '200100'
        },
        metadata: {
          autoGenerated: true,
          generatedAt: new Date(),
          source: 'applyForLoan_auto_mapping'
        }
      });
     
      if (session) {
        await dynamicMapping.save({ session });
      } else {
        await dynamicMapping.save();
      }
     
      console.log(`Created auto-mapping for PROD_ID ${PROD_ID}: ${resolvedProductType}`);
     
      return {
        isValid: true,
        productType: resolvedProductType,
        productName: dynamicMapping.productName,
        isLoanProduct: true,
        accountPrefix: dynamicMapping.accountPrefix,
        isGlobalProduct: true,
        BU_ID: dynamicMapping.BU_ID,
        glAccounts: dynamicMapping.glAccounts,
        isAutoGenerated: true,
        wasUpdated: false
      };
    }
 
    function getAccountPrefixForProductType(productType) {
      const prefixMap = {
        'BUSINESS_TERM_LOAN': 'BTL',
        'INDIVIDUAL_LOAN': 'IL',
        'CONSUMER_LOAN': 'CL',
        'MORTGAGE': 'MTG',
        'AUTO_LOAN': 'AL',
        'PERSONAL_LOAN': 'PL',
        'EDUCATION_LOAN': 'EL',
        'CREDIT_CARD': 'CC',
        'LINE_OF_CREDIT': 'LOC',
        'SME_LOAN': 'SME',
        'GENERAL_LOAN': 'GL',
        'GROUP_LOAN': 'GLN',
        'MONTHLY_LOAN': 'MOL',
        'ASSET_LOAN': 'ASL',
        'RAPID_CASH_LOAN': 'RCL',
        'STAFF_LOAN': 'STL',
        'STAFF_SALARY_ADVANCE': 'SSA',
        'GROUP_MONTHLY_LOAN': 'GML',
        'SOLAR_LOAN': 'SOL',
        'DAILY_LOAN': 'DLN'
      };
     
      return prefixMap[productType] || '10';
    }
 
    // ==================== MAIN LOGIC ====================
 
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid request body',
        code: 'INVALID_BODY',
      });
    }
 
    req.body.Borrower_address = normalizeBorrowerAddress(req.body.Borrower_address);
 
    // UPDATED: Added LOAN_PROUD_INT_ID to required fields (or make it optional)
    const requiredFields = [
      'PROD_ID', 'CUST_ID', 'ACCT_NM', 'APPL_ID', 'PRODUCT_TYPE', 'CRNCY_ID', 'BU_ID',
      'PRIMARY_OFFICER_ID', 'DISBURSEMENT_LIMIT', 'START_DT', 'TERM_CD', 'TERM_VALUE',
      'CREATED_BY', 'REPAY_SRC_ACCT_NO', 'TRANSACTION_TYPE', 'GUARANTOR_ID',
      'CALCULATION_METHOD'
      // 'LOAN_PROUD_INT_ID' // Optional but recommended
    ];
 
    const missingFields = requiredFields.filter((field) => {
      return !req.body.hasOwnProperty(field) || req.body[field] === undefined || req.body[field] === null || req.body[field] === '';
    });
 
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing or undefined required fields',
        missingFields,
        code: 'MISSING_FIELDS',
      });
    }
 
    if (!req.body.GUARANTOR_ID) {
      return res.status(400).json({
        success: false,
        message: 'GUARANTOR_ID is required',
        code: 'INVALID_GUARANTOR_ID',
      });
    }
 
    // Validate calculation method
    const validCalculationMethods = ['FLAT_RATE', 'REDUCING_BALANCE', 'FIXED_RATE', 'EMI'];
    const calculationMethod = req.body.CALCULATION_METHOD.toUpperCase();
   
    if (!validCalculationMethods.includes(calculationMethod)) {
      return res.status(400).json({
        success: false,
        message: `Invalid calculation method. Must be one of: ${validCalculationMethods.join(', ')}`,
        code: 'INVALID_CALCULATION_METHOD',
      });
    }
 
    const numericFields = {
      PROD_ID: req.body.PROD_ID,
      TERM_VALUE: req.body.TERM_VALUE,
      DISBURSEMENT_LIMIT: req.body.DISBURSEMENT_LIMIT,
    };
 
    const invalidNumericFields = Object.entries(numericFields).filter(([field, value]) => {
      return isNaN(parseFloat(value)) || parseFloat(value) <= 0;
    });
 
    if (invalidNumericFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid numeric fields',
        invalidFields: invalidNumericFields.map(([field]) => field),
        code: 'INVALID_NUMERIC_FIELDS',
      });
    }
 
    const upfrontInterest = req.body.UPFRONT_INTEREST || 0;
    const partialInterest = req.body.PARTIAL_INTEREST || false;
    const guaranteedAmount = req.body.GUARANTEED_AMT || req.body.DISBURSEMENT_LIMIT;
 
    const session = await mongoose.startSession();
    let transactionCompleted = false;
 
    try {
      session.startTransaction();
      console.log('Transaction started');
 
      let workflowIdentifiers;
      try {
        workflowIdentifiers = await generateWorkflowIdentifiers(session);
        console.log('Workflow identifiers generated successfully:', workflowIdentifiers);
      } catch (workflowIdError) {
        console.error('Failed to generate workflow identifiers:', workflowIdError);
        const timestamp = Date.now();
        workflowIdentifiers = {
          TRANSACTION_ID: `TXN-${timestamp}`,
          WORK_ITEM_ID: `WORK-${timestamp}`,
          EVENT_ID: `EVT-${timestamp}`,
          WORKFLOW_ID: `WF-${timestamp}`,
          TRAN_JOURNAL_ID: `JRN-${timestamp}`
        };
        console.log('Using fallback workflow identifiers:', workflowIdentifiers);
      }
 
      const { TRANSACTION_ID, EVENT_ID, WORK_ITEM_ID, WORKFLOW_ID, TRAN_JOURNAL_ID } = workflowIdentifiers;
 
      const numericValues = {
        INDEX_RATE_ID: req.body.INDEX_RATE_ID,
        PROD_ID: parseInt(req.body.PROD_ID),
        TERM_VALUE: parseInt(req.body.TERM_VALUE),
        CUST_ID: req.body.CUST_ID,
        GUARANTEED_AMT: safeDecimal128(guaranteedAmount, 'GUARANTEED_AMT'),
        DISBURSEMENT_LIMIT: safeDecimal128(req.body.DISBURSEMENT_LIMIT, 'DISBURSEMENT_LIMIT'),
      };
 
      // ==================== PRODUCT VALIDATION ====================
      console.log('=== PRODUCT VALIDATION USING ProductTypeMapping ===');
     
      const productValidation = await validateProductUsingMapping(
        numericValues.PROD_ID,
        req.body.PRODUCT_TYPE,
        session
      );
 
      if (!productValidation.isValid) {
        throw {
          code: 'PRODUCT_VALIDATION_FAILED',
          message: `Product validation failed for PROD_ID ${numericValues.PROD_ID}`,
          status: 400,
        };
      }
 
      console.log(`Product validated: ${productValidation.productType} (${productValidation.productName})`);
      console.log(`Is loan product: ${productValidation.isLoanProduct}`);
      console.log(`Account prefix: ${productValidation.accountPrefix}`);
      console.log(`Is global: ${productValidation.isGlobalProduct}`);
      console.log(`Is auto-generated: ${productValidation.isAutoGenerated}`);
 
      // Generate loan account number
      let loanAccountNumber;
      const maxRetries = 3;
      let retries = 0;
 
      while (!loanAccountNumber && retries < maxRetries) {
        try {
          loanAccountNumber = await generateLoanAccountNumberByProdId(numericValues.PROD_ID);
          console.log(`Generated loanAccountNumber (attempt ${retries + 1}): ${loanAccountNumber}`);
 
          const existingLoanAccount = await LoanAccount.findOne({ ACCT_NO: loanAccountNumber });
          if (!existingLoanAccount) {
            console.log(`Account number ${loanAccountNumber} is unique`);
            break;
          }
 
          console.warn(`Account number ${loanAccountNumber} already exists, retrying...`);
          loanAccountNumber = null;
          retries++;
        } catch (genError) {
          console.error('Failed to generate loan account number:', genError.message);
          retries++;
        }
      }
 
      if (!loanAccountNumber) {
        throw {
          code: 'ACCOUNT_GENERATION_FAILED',
          message: `Failed to generate a unique loan account number after ${maxRetries} attempts`,
          status: 500,
        };
      }
 
      const existingCreditApplication = await CreditApplication.findOne({ APPL_ID: req.body.APPL_ID });
      if (existingCreditApplication) {
        throw {
          code: 'DUPLICATE_APPLICATION',
          message: `A CreditApplication with APPL_ID ${req.body.APPL_ID} already exists`,
          status: 409,
        };
      }
 
      const loanCycleCount = await getLoanCycleCount(numericValues.CUST_ID, session);
 
      console.log('=== DIAGNOSTIC: Product, Rate and Interest Rate Lookup ===');
      console.log('Looking for loan product with PROD_ID:', numericValues.PROD_ID);
      console.log('Looking for rate index with requested ID:', req.body.INDEX_RATE_ID);
      console.log('Looking for loan interest rate with PROD_ID:', numericValues.PROD_ID, 'and INDEX_RATE_ID:', req.body.INDEX_RATE_ID);
     
      const allLoanProducts = await LoanProduct.find({}).limit(10).session(session);
      console.log('Available loan products in database:',
        allLoanProducts.map(p => ({
          PROD_ID: p.PROD_ID,
          PRODUCT_NAME: p.PRODUCT_NAME || p.productName,
          PRODUCT_TYPE: p.PRODUCT_TYPE
        }))
      );
 
      let rateIndex, loanProduct, customer, guarantor, loanInterestRate;
     
      try {
        // UPDATED: Get LOAN_PROUD_INT_ID from request or find by product
        const LOAN_PROUD_INT_ID = req.body.LOAN_PROUD_INT_ID || req.body.LOAN_INTEREST_RATE_ID;
       
        [rateIndex, loanProduct, customer, guarantor] = await Promise.all([
          findRateIndex(req.body.INDEX_RATE_ID, session),
          LoanProduct.findOne({ PROD_ID: numericValues.PROD_ID }).session(session),
          Customer.findOne({ CUST_ID: req.body.CUST_ID }).session(session),
          findGuarantor(req.body.GUARANTOR_ID, session)
        ]);
       
        // UPDATED: Find LoanInterestRate using LOAN_PROUD_INT_ID or by product
        if (LOAN_PROUD_INT_ID) {
          loanInterestRate = await findLoanInterestRate(LOAN_PROUD_INT_ID, req.body.INDEX_RATE_ID, session);
        } else {
          // Fallback: Try to find by product ID
          loanInterestRate = await findLoanInterestRateByProduct(numericValues.PROD_ID, req.body.INDEX_RATE_ID, session);
        }
       
      } catch (error) {
        console.error('Error in Promise.all lookup:', error);
        throw {
          code: 'LOOKUP_ERROR',
          message: `Error during data lookup: ${error.message}`,
          status: 500,
        };
      }
 
      console.log('=== LOOKUP RESULTS ===');
      console.log('Rate Index found:', rateIndex ? `${rateIndex.INDEX_RATE_ID} (${rateIndex.INDEX_RATE}%)` : 'NOT FOUND');
      console.log('Loan Product found:', loanProduct ? `${loanProduct.PROD_ID} - ${loanProduct.PRODUCT_NAME || loanProduct.productName}` : 'NOT FOUND');
      console.log('Customer found:', customer ? `${customer.CUST_ID} - ${customer.CUST_NM}` : 'NOT FOUND');
      console.log('Guarantor found:', guarantor ? `${guarantor.GUARANTOR_ID} - ${guarantor.fullName}` : 'NOT FOUND');
      console.log('Loan Interest Rate found:', loanInterestRate ?
        `${loanInterestRate.LOAN_PROUD_INT_ID} (Rate Type: ${loanInterestRate.RATE_TYPE}, Interest Type: ${loanInterestRate.INTEREST_TYPE}, Rate: ${loanInterestRate.DEFAULT_RATE_PER_MONTH}%)` :
        'NOT FOUND');
 
      // If LoanProduct not found but ProductTypeMapping says it's a loan, create fallback
      if (!loanProduct && productValidation.isLoanProduct) {
        console.warn(`⚠️ Loan product not found for PROD_ID ${numericValues.PROD_ID}, creating fallback product`);
       
        const fallbackProduct = {
          PROD_ID: numericValues.PROD_ID,
          PRODUCT_NAME: productValidation.productName,
          PRODUCT_SHORT_NAME: productValidation.accountPrefix,
          PRODUCT_TYPE: productValidation.productType,
          productName: productValidation.productName,
          productDescription: `Fallback loan product for PROD_ID ${numericValues.PROD_ID}`,
          // REMOVED HARDCODED INTEREST VALUES - Rely on dynamic fetch
          minAmount: safeDecimal128('1000', 'minAmount'),
          maxAmount: safeDecimal128('1000000', 'maxAmount'),
          minTerm: 1,
          maxTerm: 60,
          // No hardcoded interestRate or DEFAULT_RATE_PER_MONTH - will be set dynamically later
          defaultGLAccounts: productValidation.glAccounts || {}
        };
       
        loanProduct = fallbackProduct;
        console.log('Using fallback product:', fallbackProduct);
      }
     
      if (!customer) {
        throw {
          code: 'CUSTOMER_NOT_FOUND',
          message: `Customer not found for CUST_ID ${req.body.CUST_ID}`,
          status: 404,
        };
      }
     
      if (!guarantor) {
        throw {
          code: 'GUARANTOR_NOT_FOUND',
          message: `Guarantor with ID ${req.body.GUARANTOR_ID} not found`,
          status: 404,
        };
      }
 
      console.log('Checking guarantor existing loans...');
      const guarantorLoanCheck = await checkGuarantorExistingLoans(guarantor._id, session);
 
      if (guarantorLoanCheck.hasExistingLoans) {
        console.log(`Guarantor has ${guarantorLoanCheck.totalExistingLoans} existing guaranteed loans`);
        console.warn(`Guarantor ${guarantor.GUARANTOR_ID} (${guarantor.fullName}) is already guaranteeing ${guarantorLoanCheck.totalExistingLoans} loan(s)`);
      }
 
      const validTermCodes = ['D', 'W', 'BW', 'M', 'Q', 'Y'];
      if (!validTermCodes.includes(req.body.TERM_CD)) {
        throw {
          code: 'INVALID_TERM_CD',
          message: `Invalid TERM_CD: ${req.body.TERM_CD}. Must be one of ${validTermCodes.join(', ')}`,
          status: 400,
        };
      }
 
      const paymentFrequency = getPaymentFrequency(req.body.TERM_CD, numericValues.TERM_VALUE);
 
      const startDate = new Date(req.body.START_DT);
      const maturityDate = calculateMaturityDate(startDate, req.body.TERM_CD, numericValues.TERM_VALUE);
 
      console.log('=== INTEREST RATE CALCULATION ===');
      let effectiveInterestRate;
      let interestRateNumber;
      let interestRateDetails = {};
 
      try {
        // Priority 1: Use LoanInterestRate if available
        if (loanInterestRate && loanInterestRate.DEFAULT_RATE_PER_MONTH !== undefined) {
          const monthlyRate = loanInterestRate.DEFAULT_RATE_PER_MONTH;
          // Convert monthly rate to annual for calculation
          const annualRate = monthlyRate * 12;
          console.log(`Using LoanInterestRate: ${monthlyRate}% per month (${annualRate}% annual) - Type: ${loanInterestRate.RATE_TYPE}, Int Type: ${loanInterestRate.INTEREST_TYPE}, Calc Method: ${loanInterestRate.CALCULATION_METHOD}`);
         
          effectiveInterestRate = safeDecimal128(annualRate, 'LoanInterestRate.annualRate');
          interestRateNumber = parseFloat(annualRate);
          interestRateDetails = {
            rateType: loanInterestRate.RATE_TYPE,
            interestType: loanInterestRate.INTEREST_TYPE,
            calculationMethod: loanInterestRate.CALCULATION_METHOD,
            accrualBasis: loanInterestRate.ACCRUAL_BASIS,
            accrualFrequency: loanInterestRate.ACCRUAL_FREQUENCY,
            loanInterestRateId: loanInterestRate.LOAN_PROUD_INT_ID,
            source: 'LOAN_INTEREST_RATE',
            monthlyRate: monthlyRate,
            annualRate: annualRate
          };
         
          // Override user's calculation method with LoanInterestRate's method if available
          if (loanInterestRate.CALCULATION_METHOD) {
            console.log(`Overriding calculation method from ${calculationMethod} to ${loanInterestRate.CALCULATION_METHOD}`);
            // Note: We'll use this in EMI calculation
          }
        }
        // Priority 2: Use RateIndex if available
        else if (rateIndex && rateIndex.INDEX_RATE !== undefined && rateIndex.INDEX_RATE !== null) {
          const rateValue = rateIndex.INDEX_RATE;
          console.log(`Using RateIndex interest rate: ${rateValue}%`);
          effectiveInterestRate = safeDecimal128(rateValue, 'INDEX_RATE');
          interestRateNumber = parseFloat(rateValue);
          interestRateDetails = {
            rateType: 'REDUCING',
            interestType: 'COMPOUND',
            calculationMethod: 'REDUCING_BALANCE',
            source: 'RATE_INDEX',
            rateIndexId: rateIndex.INDEX_RATE_ID
          };
        }
        // Priority 3: Use LoanProduct if it has interest rate
        else if (loanProduct && loanProduct.interestRate !== undefined && loanProduct.interestRate !== null) {
          const rateValue = loanProduct.interestRate;
          console.log(`Using LoanProduct.interestRate: ${rateValue}%`);
          effectiveInterestRate = safeDecimal128(rateValue, 'loanProduct.interestRate');
          interestRateNumber = parseFloat(rateValue);
          interestRateDetails = {
            rateType: 'REDUCING',
            interestType: 'COMPOUND',
            calculationMethod: 'REDUCING_BALANCE',
            source: 'LOAN_PRODUCT'
          };
        }
        // Priority 4: Use LoanProduct DEFAULT_RATE_PER_MONTH if available
        else if (loanProduct && loanProduct.DEFAULT_RATE_PER_MONTH !== undefined) {
          const monthlyRate = loanProduct.DEFAULT_RATE_PER_MONTH;
          const annualRate = monthlyRate * 12;
          console.log(`Using LoanProduct DEFAULT_RATE_PER_MONTH: ${monthlyRate}% per month (${annualRate}% annual)`);
          effectiveInterestRate = safeDecimal128(annualRate, 'DEFAULT_RATE_PER_MONTH');
          interestRateNumber = parseFloat(annualRate);
          interestRateDetails = {
            rateType: 'REDUCING',
            interestType: 'COMPOUND',
            calculationMethod: 'REDUCING_BALANCE',
            source: 'LOAN_PRODUCT_DEFAULT_RATE'
          };
        }
        // NO HARDCODED DEFAULT - Throw error if no interest rate can be determined
        else {
          console.error('No interest rate source found:', {
            hasLoanInterestRate: !!loanInterestRate,
            loanInterestRateHasRate: loanInterestRate ? loanInterestRate.DEFAULT_RATE_PER_MONTH : false,
            hasRateIndex: !!rateIndex,
            rateIndexHasRate: rateIndex ? rateIndex.INDEX_RATE : false,
            loanProductInterestRate: loanProduct?.interestRate,
            loanProductDefaultRate: loanProduct?.DEFAULT_RATE_PER_MONTH
          });
         
          throw {
            code: 'NO_INTEREST_RATE_FOUND',
            message: 'Cannot determine interest rate for this loan application. Please ensure:' +
                    '\n1. A LoanInterestRate record exists (specify LOAN_PROUD_INT_ID)' +
                    '\n2. A RateIndex record exists with the specified INDEX_RATE_ID' +
                    '\n3. The LoanProduct has an interestRate or DEFAULT_RATE_PER_MONTH defined',
            status: 400,
          };
        }
 
        console.log(`Final effective interest rate: ${interestRateNumber}% annual`);
        console.log('Interest Rate Details:', interestRateDetails);
      } catch (error) {
        console.error('Interest rate calculation error:', error);
       
        // Re-throw the error if it's our custom NO_INTEREST_RATE_FOUND error
        if (error.code === 'NO_INTEREST_RATE_FOUND') {
          throw error;
        }
       
        // For other errors, throw a more specific error
        throw {
          code: 'INTEREST_RATE_CALCULATION_ERROR',
          message: `Failed to calculate interest rate: ${error.message}`,
          status: 500,
        };
      }
 
      let emiResult;
      try {
        console.log('Calculating EMI...');
        const principalAmount = parseFloat(numericValues.DISBURSEMENT_LIMIT.toString());
       
        // ==================== UPDATED EMI CALCULATION ====================
        // Use calculation method from LoanInterestRate if available, otherwise use user's choice
        const finalCalculationMethod = interestRateDetails.calculationMethod || calculationMethod;
        console.log(`Final calculation method: ${finalCalculationMethod} (from ${interestRateDetails.source || 'user input'})`);
       
        // Check if rate seems too low (monthly vs annual confusion)
        if (interestRateNumber < 20 && interestRateDetails.source === 'LOAN_INTEREST_RATE') {
          console.warn(`⚠️ WARNING: Interest rate ${interestRateNumber}% seems low for annual rate.`);
          console.warn('If this is a monthly rate stored as monthly, it should be multiplied by 12 for annual calculations.');
        }
       
        // Use the calculation function that respects the chosen method
        emiResult = calculateEMIWithChosenMethod(
          principalAmount,
          interestRateNumber,
          numericValues.TERM_VALUE,
          req.body.TERM_CD,
          paymentFrequency,
          startDate,
          finalCalculationMethod
        );
       
        console.log('EMI calculation successful - Generated', emiResult.installments.length, 'installments');
        console.log('Calculation Method:', emiResult.calculationMethod, 'Interest Type:', emiResult.interestType);
        console.log('Sample installment (first):', emiResult.installments[0]);
        console.log('Sample installment (last):', emiResult.installments[emiResult.installments.length - 1]);
        console.log('Total Interest:', emiResult.totalInterest);
        console.log('Total Repayment:', emiResult.totalPayment);
        console.log('Monthly Payment (EMI):', emiResult.emi);
      } catch (emiError) {
        console.error('EMI calculation error:', emiError);
        throw {
          code: 'INVALID_REPAYMENT_SCHEDULE',
          message: `Failed to generate repayment schedule: ${emiError.message}`,
          status: 500,
        };
      }
 
      // ==================== DEFINE interestRateId VARIABLE ====================
      // Find the correct INTEREST_RATE_ID value
      // Priority: Use rateIndex ID, then loanInterestRate ID, then PROD_ID as fallback
      const interestRateId = rateIndex?.INDEX_RATE_ID || 
                            loanInterestRate?.LOAN_PROUD_INT_ID || 
                            numericValues.PROD_ID;

      // Also get loanInterestRateId separately
      const loanInterestRateId = loanInterestRate?.LOAN_PROUD_INT_ID || null;

      console.log('Debug - Setting interest rate IDs:', {
        INTEREST_RATE_ID: interestRateId,
        LOAN_INTEREST_RATE_ID: loanInterestRateId,
        rateIndexId: rateIndex?.INDEX_RATE_ID,
        loanInterestRateId: loanInterestRate?.LOAN_PROUD_INT_ID,
        hasRateIndex: !!rateIndex,
        hasLoanInterestRate: !!loanInterestRate,
        PROD_ID: numericValues.PROD_ID
      });

      const loanAccountData = {
        loanAccountId: parseInt(loanAccountNumber) || Date.now(),
        JOURNAL_ID: TRAN_JOURNAL_ID,
        CUST_ID: req.body.CUST_ID,
        ACCT_NM: req.body.ACCT_NM,
        ACCT_NO: loanAccountNumber,
        APPL_ID: req.body.APPL_ID,
        PRODUCT_TYPE: productValidation.productType,
        CRNCY_ID: req.body.CRNCY_ID || 'NGN',
        BU_ID: req.body.BU_ID,
        PRIMARY_OFFICER_ID: req.body.PRIMARY_OFFICER_ID,
        SECONDARY_OFFICER_ID: req.body.SECONDARY_OFFICER_ID || req.body.PRIMARY_OFFICER_ID,
        DISBURSEMENT_LIMIT: numericValues.DISBURSEMENT_LIMIT,
        ACTUAL_DISBURSEMENT: mongoose.Types.Decimal128.fromString('0.00'),
        DISBURSED_AMOUNT: mongoose.Types.Decimal128.fromString('0.00'),
        OUTSTANDING_PRINCIPAL: mongoose.Types.Decimal128.fromString('0.00'),
        CURRENT_BALANCE: mongoose.Types.Decimal128.fromString('0.00'),
        START_DT: startDate,
        TERM_CD: req.body.TERM_CD,
        TERM_VALUE: numericValues.TERM_VALUE,
        MATURITY_DT: maturityDate,
        // FIXED: Now using the defined interestRateId variable
        INTEREST_RATE_ID: interestRateId,
        LOAN_INTEREST_RATE_ID: loanInterestRateId,
        INTEREST_RATE: effectiveInterestRate,
        INTEREST_RATE_TYPE: interestRateDetails.rateType || 'REDUCING',
        INTEREST_TYPE: interestRateDetails.interestType || 'COMPOUND',
        INTEREST_CALCULATION_METHOD: interestRateDetails.calculationMethod || calculationMethod,
        ACCRUAL_BASIS: loanInterestRate?.ACCRUAL_BASIS || null,
        ACCRUAL_FREQUENCY: loanInterestRate?.ACCRUAL_FREQUENCY || null,
        LOAN_STATUS: 'PENDING',
        PAYMENT_FREQUENCY: paymentFrequency,
        CREATED_BY: req.body.CREATED_BY,
        TRANSACTION_ID,
        EVENT_ID,
        PROD_ID: numericValues.PROD_ID,
        TOTAL_INTEREST: safeDecimal128(emiResult.totalInterest, 'emiResult.totalInterest'),
        TOTAL_REPAYMENT: safeDecimal128(emiResult.totalPayment, 'emiResult.totalPayment'),
        REPAYMENT_SOURCE_ACCOUNT: req.body.REPAY_SRC_ACCT_NO,
        GUARANTOR_ID: guarantor._id,
        GUARANTEED_AMOUNT: numericValues.GUARANTEED_AMT,
        HAS_GUARANTOR: true,
        guarantorDetails: {
          name: guarantor.fullName,
          phone: guarantor.phoneNumber,
          relationship: guarantor.relationshipToBorrower,
          guarantorNumberId: guarantor.GUARANTOR_ID.toString(),
          email: guarantor.email,
          address: guarantor.address,
          existingGuarantees: guarantorLoanCheck.hasExistingLoans ? {
            totalExistingLoans: guarantorLoanCheck.totalExistingLoans,
            totalGuaranteedAmount: guarantorLoanCheck.totalGuaranteedAmount
          } : null
        },
        Borrower_address: req.body.Borrower_address ? {
          street: req.body.Borrower_address.street || '',
          city: req.body.Borrower_address.city || '',
          state: req.body.Borrower_address.state || '',
          zipCode: req.body.Borrower_address.zipCode || '',
          country: req.body.Borrower_address.country || 'Nigeria',
        } : undefined,
        upfrontInterestPercentage: safeDecimal128(upfrontInterest, 'upfrontInterest'),
        partialUpfrontInterest: partialInterest,
        applicationDate: new Date(),
        lastUpdated: new Date(),
        productValidationDetails: {
          isAutoGenerated: productValidation.isAutoGenerated,
          productName: productValidation.productName,
          accountPrefix: productValidation.accountPrefix
        }
      };
 
      const loanAccount = new LoanAccount(loanAccountData);
      await loanAccount.save({ session });
      console.log('LoanAccount saved with ACCT_NO:', loanAccount.ACCT_NO);
 
      await Guarantor.findByIdAndUpdate(
        guarantor._id,
        {
          $addToSet: { guaranteedLoans: loanAccount._id },
          lastUsedDate: new Date(),
          status: 'PENDING_VERIFICATION',
        },
        { session }
      );
 
      // ==================== FIXED REPAYMENT SCHEDULE CREATION ====================
      const repaymentScheduleData = {
        LOAN_ACCOUNT_ID: loanAccount._id,
        ACCT_NO: loanAccountNumber,
        CUST_ID: req.body.CUST_ID.toString(), // Ensure string type
        START_DATE: startDate,
        MATURITY_DATE: maturityDate,
        PRINCIPAL_AMOUNT: numericValues.DISBURSEMENT_LIMIT,
        INTEREST_RATE: effectiveInterestRate,
        INTEREST_RATE_TYPE: interestRateDetails.rateType || 'REDUCING',
        INTEREST_TYPE: interestRateDetails.interestType || 'COMPOUND',
        CALCULATION_METHOD: interestRateDetails.calculationMethod || calculationMethod,
        TERM: numericValues.TERM_VALUE,
        TERM_TYPE: req.body.TERM_CD,
        paymentFrequency: paymentFrequency,
        EMI_AMOUNT: safeDecimal128(emiResult.emi, 'emiResult.emi'),
        installments: emiResult.installments.map((installment, index) => ({
          // Use installmentNo as per schema requirement
          installmentNo: installment.installmentNo || installment.installmentNumber || (index + 1),
          dueDate: installment.dueDate,
          principal: safeDecimal128(installment.principal, `installment.principal for ${index}`),
          interest: safeDecimal128(installment.interest, `installment.interest for ${index}`),
          totalPayment: safeDecimal128(installment.totalPayment, `installment.totalPayment for ${index}`),
          remainingBalance: safeDecimal128(installment.remainingBalance, `installment.remainingBalance for ${index}`),
          status: 'PENDING',
          amountPaid: mongoose.Types.Decimal128.fromString('0.00'),
          principalPaid: mongoose.Types.Decimal128.fromString('0.00'),
          interestPaid: mongoose.Types.Decimal128.fromString('0.00'),
          feesPaid: mongoose.Types.Decimal128.fromString('0.00')
        })),
        TOTAL_INTEREST: safeDecimal128(emiResult.totalInterest, 'emiResult.totalInterest'),
        TOTAL_REPAYMENT: safeDecimal128(emiResult.totalPayment, 'emiResult.totalPayment'),
        TRANSACTION_ID,
        EVENT_ID,
        CREATED_BY: req.body.CREATED_BY,
        STATUS: 'PENDING'
      };
 
      console.log('Creating RepaymentSchedule with:', {
        loanAccountId: loanAccount._id,
        accountNumber: loanAccountNumber,
        installmentsCount: repaymentScheduleData.installments.length,
        calculationMethod: repaymentScheduleData.CALCULATION_METHOD,
        totalInterest: emiResult.totalInterest,
        totalRepayment: emiResult.totalPayment,
        emi: emiResult.emi
      });
 
      const repaymentSchedule = new RepaymentSchedule(repaymentScheduleData);
      await repaymentSchedule.save({ session });
      console.log('✅ RepaymentSchedule saved successfully with ACCT_NO:', repaymentSchedule.ACCT_NO, '- Installments:', repaymentScheduleData.installments.length);
 
      const creditApplicationData = {
        creditApplicationId: `APP-${Date.now()}`,
        CUST_NM: req.body.ACCT_NM,
        CUST_ID: req.body.CUST_ID,
        PRODUCT: productValidation.productType,
        ACCT_ID: loanAccountNumber,
        ACCT_NO: loanAccountNumber,
        APPL_ID: req.body.APPL_ID,
        PROD_ID: req.body.PROD_ID,
        BU_ID: req.body.BU_ID,
        CREATED_BY: req.body.CREATED_BY,
        CRNCY_ID: req.body.CRNCY_ID || 'NGN',
        Credit_Type: 'LOAN',
        PRIME_LIMIT_AMT: numericValues.DISBURSEMENT_LIMIT,
        Purpose_of_Credit: req.body.loan_purpose || 'GENERAL LOAN',
        REPAY_SRC_ACCT_NO: req.body.REPAY_SRC_ACCT_NO,
        TERM_CD: req.body.TERM_CD,
        TERM_VALUE: numericValues.TERM_VALUE,
        USER_ID: req.body.USER_ID || req.body.CREATED_BY,
        TRANSACTION_TYPE: req.body.TRANSACTION_TYPE,
        CALCULATION_METHOD: interestRateDetails.calculationMethod || calculationMethod,
        STATUS: 'PENDING',
        REC_ST: 'active',
        LOAN_CYCLE: loanCycleCount,
        CREATED_AT: new Date(),
        REQUESTED_AMOUNT: numericValues.DISBURSEMENT_LIMIT,
        LOAN_ACCOUNT_ID: loanAccount._id,
        REPAYMENT_SCHEDULE_ID: repaymentSchedule._id,
        TRANSACTION_ID,
        EVENT_ID,
        GUARANTOR_ID: guarantor._id,
        INDEX_RATE_ID: req.body.INDEX_RATE_ID,
        LOAN_INTEREST_RATE_ID: loanInterestRateId,
        Borrower_address: req.body.Borrower_address,
        guarantorExistingLoans: guarantorLoanCheck.hasExistingLoans ? guarantorLoanCheck : null,
        interestRateDetails: {
          rateType: interestRateDetails.rateType,
          interestType: interestRateDetails.interestType,
          calculationMethod: interestRateDetails.calculationMethod || calculationMethod,
          source: interestRateDetails.source,
          monthlyRate: interestRateDetails.monthlyRate,
          annualRate: interestRateNumber
        },
        productValidation: {
          productType: productValidation.productType,
          productName: productValidation.productName,
          isAutoGenerated: productValidation.isAutoGenerated,
          accountPrefix: productValidation.accountPrefix
        }
      };
 
      const creditApplication = new CreditApplication(creditApplicationData);
      await creditApplication.save({ session });
      console.log('CreditApplication saved with ACCT_NO:', creditApplication.ACCT_NO);
 
      let workflowResult;
      try {
        workflowResult = await createWorkflowItem(
          {
            ITEM_VALUE: loanAccount._id.toString(),
            ITEM_DESC: `Loan Application for ${loanAccountNumber}`,
            ITEM_CLASS_NM: 'Loan',
            ITEM_TYPE: 'Loan',
            CUST_ID: req.body.CUST_ID,
            USER_ID: req.body.USER_ID || req.body.CREATED_BY,
            BU_ID: req.body.BU_ID || '0001',
            TARGET_USER_ROLE_ID: 'LOAN_OFFICER',
            ORIGINATOR_USER_ROLE_ID: 'Creator',
            ITEM_ID: creditApplication._id.toString(),
            REPAYMENT_SCHEDULE_ID: repaymentSchedule._id.toString(),
            REC_ST: 'PENDING',
            WAIT_ST: 'PENDING',
            VERSION: 1,
            CREATE_DT: new Date(),
            dueDate: new Date(Date.now() + 7 * 86400000),
            WORKFLOW_ID: WORKFLOW_ID,
            WORK_ITEM_ID: WORK_ITEM_ID,
            TRANSACTION_ID: TRANSACTION_ID,
            EVENT_ID: EVENT_ID,
            GUARANTOR_ID: guarantor._id.toString(),
            ITEM_BU_ID: req.body.BU_ID,
          },
          session
        );
      } catch (workflowError) {
        console.error('Workflow creation error:', workflowError);
        workflowResult = {
          success: true,
          WORK_ITEM_ID: WORK_ITEM_ID,
          WORKFLOW_ID: WORKFLOW_ID
        };
      }
 
      await session.commitTransaction();
      transactionCompleted = true;
      console.log('✅ Transaction committed successfully');
 
      return res.status(201).json({
        success: true,
        message: 'Loan application submitted successfully',
        status: 'Pending',
        data: {
          loanAccountId: loanAccount._id,
          loanAccountNumber,
          creditApplicationId: creditApplication._id,
          repaymentScheduleId: repaymentSchedule._id,
          workItemId: workflowResult.WORK_ITEM_ID,
          workflowId: workflowResult.WORKFLOW_ID,
          APPL_ID: req.body.APPL_ID,
          status: 'PENDING',
          disbursementStatus: 'NOT_DISBURSED',
          currentBalance: '0.00',
          disbursedAmount: '0.00',
          productDetails: {
            PROD_ID: numericValues.PROD_ID,
            productType: productValidation.productType,
            productName: productValidation.productName,
            accountPrefix: productValidation.accountPrefix,
            isAutoGenerated: productValidation.isAutoGenerated
          },
          interestRateDetails: {
            loanInterestRateId: loanInterestRate?.LOAN_PROUD_INT_ID,
            effectiveRate: interestRateNumber,
            rateType: interestRateDetails.rateType,
            interestType: interestRateDetails.interestType,
            calculationMethod: interestRateDetails.calculationMethod || calculationMethod,
            source: interestRateDetails.source,
            monthlyRate: interestRateDetails.monthlyRate,
            annualRate: interestRateNumber,
            rateIndexId: rateIndex?.INDEX_RATE_ID
          },
          guarantor: {
            guarantorId: guarantor._id,
            guarantorNumberId: guarantor.GUARANTOR_ID,
            name: guarantor.fullName,
            guaranteedAmount: parseFloat(numericValues.GUARANTEED_AMT.toString()),
            status: 'PENDING_VERIFICATION',
            existingGuarantees: guarantorLoanCheck.hasExistingLoans ? {
              totalExistingLoans: guarantorLoanCheck.totalExistingLoans,
              totalGuaranteedAmount: guarantorLoanCheck.totalGuaranteedAmount
            } : null
          },
          repaymentSchedule: {
            id: repaymentSchedule._id,
            numberOfInstallments: emiResult.installments.length,
            firstPaymentDate: emiResult.installments[0]?.dueDate,
            lastPaymentDate: emiResult.installments.at(-1)?.dueDate,
            emiAmount: parseFloat(emiResult.emi),
            totalInterest: parseFloat(emiResult.totalInterest),
            totalRepayment: parseFloat(emiResult.totalPayment),
            paymentFrequency: paymentFrequency,
            calculationMethod: interestRateDetails.calculationMethod || calculationMethod,
            totalPeriods: emiResult.totalPeriods
          },
          Borrower_address: req.body.Borrower_address,
          guarantorWarning: guarantorLoanCheck.hasExistingLoans ?
            `Guarantor is already guaranteeing ${guarantorLoanCheck.totalExistingLoans} loan(s)`
            : null,
        },
      });
    } catch (error) {
      console.error('❌ Loan application error:', error);
      console.error('Error stack:', error.stack);
     
      if (session && session.inTransaction() && !transactionCompleted) {
        try {
          await session.abortTransaction();
          console.log('Transaction aborted successfully');
        } catch (abortError) {
          console.error('Error aborting transaction:', abortError);
        }
      }
 
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to process loan application',
        code: error.code || 'SERVER_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      });
    } finally {
      try {
        if (session) {
          await session.endSession();
          console.log('Session ended successfully');
        }
      } catch (endSessionError) {
        console.error('Error ending session:', endSessionError);
      }
    }
  },

// Helper: Normalize CUST_ID to 10-digit string with leading zeros
// Helper: Normalize CUST_ID to 10-digit string with leading zeros
// const normalizeCustId = (id) => {
//   if (!id) return null;
//   return String(id).replace(/^0+/, "").padStart(10, "0");
// },

async disburseLoan(req, res) {
  const session = await mongoose.startSession();
  let transactionAborted = false;

  try {
    await session.withTransaction(async () => {
      const { 
        APPL_ID, 
        ACCT_NO, 
        AMOUNT, 
        fundingAcctNo, 
        PROD_ID, 
        GUARANTOR_ID, 
        CREATED_BY = 'SYSTEM',
        LOAN_PROUD_INT_ID // Added for LoanInterestRate lookup
      } = req.body;

      if (!APPL_ID || !ACCT_NO || !AMOUNT || !fundingAcctNo || !PROD_ID || !GUARANTOR_ID) {
        throw { status: 400, message: "All required fields are mandatory", code: "MISSING_FIELDS" };
      }

      const amount = parseFloat(AMOUNT);
      const productIdNum = Number(PROD_ID);

      if (isNaN(productIdNum)) {
        throw { status: 400, message: "Invalid product ID", code: "INVALID_PRODUCT_ID" };
      }

      console.log('Looking for product with PROD_ID:', productIdNum);

      // Helper function to find LoanInterestRate
      async function findLoanInterestRateForDisbursement(LOAN_PROUD_INT_ID, session) {
        try {
          if (!LOAN_PROUD_INT_ID) {
            console.log('No LOAN_PROUD_INT_ID provided, looking for default rate...');
            return null;
          }
          
          const numericId = parseInt(LOAN_PROUD_INT_ID);
          const query = isNaN(numericId) 
            ? { LOAN_PROUD_INT_ID: LOAN_PROUD_INT_ID.toString(), STATUS: 'ACTIVE' }
            : { LOAN_PROUD_INT_ID: numericId, STATUS: 'ACTIVE' };
          
          let rateQuery = LoanInterestRate.findOne(query).populate('INDEX_RATE_ID');
          if (session) rateQuery = rateQuery.session(session);
          
          const loanInterestRate = await rateQuery;
          
          if (loanInterestRate) {
            console.log(`Found LoanInterestRate: ${loanInterestRate.LOAN_PROUD_INT_ID} - ${loanInterestRate.name}`);
            return loanInterestRate;
          }
          
          console.warn(`LoanInterestRate not found for LOAN_PROUD_INT_ID: ${LOAN_PROUD_INT_ID}`);
          return null;
        } catch (error) {
          console.error('Error finding LoanInterestRate:', error);
          return null;
        }
      }

      // Fetch all required data including LoanInterestRate
      const [
        creditApp, 
        loanAccount, 
        fundingAccount, 
        guarantor, 
        productMapping, 
        loanProduct,
        loanInterestRate
      ] = await Promise.all([
        CreditApplication.findOne({ APPL_ID }).session(session),
        LoanAccount.findOne({ ACCT_NO }).session(session),
        CustomerAccount.findOne({ account_number: fundingAcctNo }).session(session),
        Guarantor.findOne({ GUARANTOR_ID: String(GUARANTOR_ID) }).session(session),
        ProductTypeMapping.findOne({ PROD_ID: productIdNum }).session(session),
        LoanProduct.findOne({ PROD_ID: productIdNum }).session(session),
        findLoanInterestRateForDisbursement(LOAN_PROUD_INT_ID || loanAccount?.LOAN_INTEREST_RATE_ID, session)
      ]);

      // Validation checks
      if (!creditApp) throw { status: 404, message: "Application not found" };
      if (!loanAccount) throw { status: 404, message: "Loan account not found" };
      if (!fundingAccount) throw { status: 404, message: "Funding account not found" };
      if (!guarantor) throw { status: 404, message: "Guarantor not found" };
      if (!productMapping) throw { status: 404, message: "Product not configured" };
      if (!loanProduct) throw { status: 404, message: `Loan product not found with PROD_ID: ${productIdNum}` };

      console.log('Found loan product:', {
        PROD_ID: loanProduct.PROD_ID,
        productCode: loanProduct.productCode,
        name: loanProduct.name,
        hasDefaultGLAccounts: !!loanProduct.defaultGLAccounts
      });

      console.log('Found LoanInterestRate:', loanInterestRate ? {
        LOAN_PROUD_INT_ID: loanInterestRate.LOAN_PROUD_INT_ID,
        name: loanInterestRate.name,
        RATE_TYPE: loanInterestRate.RATE_TYPE,
        DEFAULT_RATE_PER_MONTH: loanInterestRate.DEFAULT_RATE_PER_MONTH,
        ANNUAL_PERCENTAGE_RATE: loanInterestRate.ANNUAL_PERCENTAGE_RATE
      } : 'Not found');

      // Validate loan status
      if (loanAccount.LOAN_STATUS !== "APPROVED") throw { 
        status: 400, 
        message: `Loan must be APPROVED. Current: ${loanAccount.LOAN_STATUS}` 
      };
      
      if (parseFloat(loanAccount.DISBURSED_AMOUNT?.toString() || '0') > 0) throw { 
        status: 400, 
        message: "Loan already disbursed" 
      };

      // === CALCULATE FEES ===
      const processingFeeRate = parseFloat(loanProduct.processingFeeRate?.toString() || '0') / 100;
      const upfrontInterestRate = parseFloat(loanAccount.upfrontInterestPercentage?.toString() || '0') / 100;

      const processingFee = amount * processingFeeRate;
      const upfrontInterest = amount * upfrontInterestRate;
      const totalFees = processingFee + upfrontInterest;
      const netAmount = amount - totalFees;

      if (netAmount <= 0) throw { 
        status: 400, 
        message: "Net disbursement must be positive" 
      };

      // === Determine interest rate to use ===
      let effectiveInterestRate;
      
      // Priority 1: Use LoanInterestRate if available
      if (loanInterestRate && loanInterestRate.DEFAULT_RATE_PER_MONTH !== undefined) {
        const monthlyRate = loanInterestRate.DEFAULT_RATE_PER_MONTH;
        const annualRate = monthlyRate * 12;
        effectiveInterestRate = annualRate;
        console.log(`Using LoanInterestRate rate: ${monthlyRate}% per month (${annualRate}% annual)`);
      } 
      // Priority 2: Use loan account's stored rate
      else if (loanAccount.INTEREST_RATE) {
        effectiveInterestRate = parseFloat(loanAccount.INTEREST_RATE.toString());
        console.log(`Using loan account stored rate: ${effectiveInterestRate}%`);
      }
      // Priority 3: Use loan product rate
      else if (loanProduct.interestRate) {
        effectiveInterestRate = parseFloat(loanProduct.interestRate.toString());
        console.log(`Using loan product rate: ${effectiveInterestRate}%`);
      }
      // Priority 4: Use loan product DEFAULT_RATE_PER_MONTH
      else if (loanProduct.DEFAULT_RATE_PER_MONTH) {
        const monthlyRate = parseFloat(loanProduct.DEFAULT_RATE_PER_MONTH.toString());
        const annualRate = monthlyRate * 12;
        effectiveInterestRate = annualRate;
        console.log(`Using loan product DEFAULT_RATE_PER_MONTH: ${monthlyRate}% per month (${annualRate}% annual)`);
      }
      else {
        effectiveInterestRate = 12.0; // Default fallback
        console.warn(`Using default interest rate: ${effectiveInterestRate}%`);
      }

      console.log('Customer balance check skipped - customer receives funds');

      const now = new Date();
      const txIds = {
        TRANSACTION_ID: `DISB-${Date.now()}`,
        EVENT_ID: `EVT-${Date.now()}`,
        JOURNAL_ID: `JRN-${Date.now()}`,
      };

      // === UPDATE LOAN ACCOUNT ===
      await LoanAccount.updateOne(
        { _id: loanAccount._id },
        {
          $set: {
            LOAN_STATUS: "ACTIVE",
            DISBURSED_AMOUNT: toDecimal128(amount),
            ACTUAL_DISBURSEMENT: toDecimal128(amount),
            OUTSTANDING_PRINCIPAL: toDecimal128(amount),
            CURRENT_BALANCE: toDecimal128(-amount),
            START_DT: now,
            DISBURSEMENT_DATE: now,
            processingFee: toDecimal128(processingFee),
            upfrontInterestCollected: toDecimal128(upfrontInterest),
            totalFeesCollected: toDecimal128(totalFees),
            NET_DISBURSEMENT: toDecimal128(netAmount),
            INTEREST_RATE: toDecimal128(effectiveInterestRate), // Update with effective rate
            LOAN_INTEREST_RATE_ID: loanInterestRate?.LOAN_PROUD_INT_ID || null, // Store LOAN_PROUD_INT_ID
            ...txIds,
            LAST_UPDATED: now,
          },
        },
        { session }
      );

      // === UPDATE CREDIT APPLICATION ===
      await CreditApplication.updateOne(
        { _id: creditApp._id },
        { 
          $set: { 
            STATUS: "DISBURSED", 
            DISBURSEMENT_DATE: now, 
            ACTUAL_DISBURSEMENT: amount, 
            NET_DISBURSEMENT: netAmount,
            LOAN_STATUS: "ACTIVE",
            LOAN_INTEREST_RATE_ID: loanInterestRate?.LOAN_PROUD_INT_ID || null // Store LOAN_PROUD_INT_ID
          } 
        },
        { session }
      );

      // === ACTIVATE GUARANTOR ===
      await Guarantor.updateOne(
        { _id: guarantor._id },
        { 
          $addToSet: { guaranteedLoans: loanAccount._id }, 
          $set: { 
            STATUS: "ACTIVE",
            GUARANTEED_AMOUNT: amount,
            LOAN_ACCOUNT_NO: ACCT_NO,
            ACTIVATION_DATE: now
          } 
        },
        { session }
      );

      // === PROCESS FINANCIAL TRANSACTIONS ===
      await processLoanDisbursementTransactions({
        session,
        loanAccount: {
          ...loanAccount.toObject(),
          ACCT_NM: loanAccount.ACCT_NM || creditApp.borrowerName,
          CUST_ID: loanAccount.CUST_ID,
          BU_ID: loanAccount.BU_ID || fundingAccount.branch,
          PROD_ID: loanAccount.PROD_ID || productIdNum,
          DISBURSED_AMOUNT: amount,
          LOAN_INTEREST_RATE_ID: loanInterestRate?.LOAN_PROUD_INT_ID || null // Pass LOAN_PROUD_INT_ID
        },
        customerAccount: fundingAccount,
        AMOUNT: amount,
        loanFeeAmount: totalFees,
        fundingAcctNo: fundingAcctNo,
        ACCT_NO: ACCT_NO,
        CREATED_BY: CREATED_BY,
        DISBURSEMENT_DATE: now,
        INTEREST_RATE: effectiveInterestRate,
        PRODUCT_TYPE: loanProduct.PRODUCT_TYPE || 'INDIVIDUAL_LOAN',
        productId: loanProduct.PROD_ID,
        deductUpfrontInterest: loanAccount.DEDUCT_UPFRONT_INTEREST || false,
        partialUpfrontInterest: loanAccount.PARTIAL_UPFRONT_INTEREST || false,
        upfrontInterestAmount: upfrontInterest,
        upfrontInterestPercentage: parseFloat(loanAccount.upfrontInterestPercentage?.toString() || '0'),
        guarantorId: GUARANTOR_ID,
        guaranteedAmount: amount,
        guarantorName: guarantor.fullName || guarantor.name,
        TRANSACTION_ID: txIds.TRANSACTION_ID,
        EVENT_ID: txIds.EVENT_ID,
        JOURNAL_ID: txIds.JOURNAL_ID,
        branchId: loanAccount.BU_ID || fundingAccount.branch
      });

      return res.status(200).json({
        success: true,
        message: "Loan disbursed successfully!",
        data: {
          loanAccountNumber: ACCT_NO,
          applicationId: APPL_ID,
          totalLoanAmount: amount,
          feesAndInterestDeducted: totalFees.toFixed(2),
          netAmountToCustomer: netAmount,
          feeBreakdown: { 
            processingFee: processingFee.toFixed(2), 
            upfrontInterest: upfrontInterest.toFixed(2) 
          },
          disbursementDate: now,
          status: "ACTIVE",
          customerId: loanAccount.CUST_ID,
          guarantorName: guarantor.fullName || guarantor.name,
          guarantorId: GUARANTOR_ID,
          transactionIds: txIds,
          interestRateDetails: {
            effectiveRate: effectiveInterestRate,
            source: loanInterestRate ? 'LoanInterestRate' : 'LoanProduct',
            loanInterestRateId: loanInterestRate?.LOAN_PROUD_INT_ID,
            loanInterestRateName: loanInterestRate?.name
          },
          accountingEntries: {
            loanPortfolioDebit: amount.toFixed(2),
            customerAccountCredit: netAmount.toFixed(2),
            feeIncome: totalFees.toFixed(2),
            netEffect: `Customer receives ₦${netAmount.toFixed(2)} (₦${amount.toFixed(2)} loan - ₦${totalFees.toFixed(2)} fees)`
          },
          customerAccountImpact: {
            balanceBefore: fundingAccount.ledger_balance,
            amountAdded: netAmount,
            balanceAfter: fundingAccount.ledger_balance + netAmount
          },
          productDetails: {
            PROD_ID: loanProduct.PROD_ID,
            productCode: loanProduct.productCode,
            name: loanProduct.name,
            PRODUCT_TYPE: loanProduct.PRODUCT_TYPE
          }
        },
      });
    });

  } catch (error) {
    if (!transactionAborted && session.inTransaction?.()) {
      await session.abortTransaction();
      transactionAborted = true;
    }
    console.error("Disbursement failed:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Disbursement failed",
      code: error.code || "DISBURSEMENT_ERROR",
      details: error.details || null
    });
  } finally {
    await session.endSession();
  }
},


  async getLoanApplication(req, res) {
    try {
      const { applicationId } = req.params;
      
      const application = await CreditApplication.findOne({ APPL_ID: applicationId })
        .populate('LOAN_ACCOUNT_ID')
        .populate('GUARANTOR_ID');
      
      if (!application) {
        return res.status(404).json({
          success: false,
          message: 'Loan application not found',
          code: 'APPLICATION_NOT_FOUND',
        });
      }

      return res.status(200).json({
        success: true,
        data: application,
      });
    } catch (error) {
      console.error('Error fetching loan application:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch loan application',
        code: 'FETCH_ERROR',
      });
    }
  },

 

// In your loan controller
async approveAndDisburseLoan(req, res) {
  const session = await mongoose.startSession();
  let transactionSuccess = false;

  try {
    await session.startTransaction();

    const { 
      ACCT_NO, 
      CUST_ID, 
      approvedBy, 
      approvalComments = "Approved and auto-disbursed"
    } = req.body;

    // Required fields for approval
    if (!ACCT_NO || !approvedBy) {
      return res.status(400).json({
        success: false,
        message: "ACCT_NO and approvedBy are required",
        code: "MISSING_FIELDS",
      });
    }

    console.log("Auto-approving and disbursing loan:", { ACCT_NO, approvedBy });

    // 1. FIND PENDING APPLICATION
    const creditApplication = await CreditApplication.findOne({
      ACCT_NO,
      STATUS: "PENDING",
    }).session(session);

    if (!creditApplication) {
      return res.status(404).json({
        success: false,
        message: `No pending application found for account ${ACCT_NO}`,
        code: "NOT_FOUND",
      });
    }

    // 2. FIND LOAN ACCOUNT
    const loanAccount = await LoanAccount.findOne({
      ACCT_NO,
      LOAN_STATUS: "PENDING",
    }).session(session);

    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: `Loan account ${ACCT_NO} not in pending state`,
        code: "LOAN_NOT_PENDING",
      });
    }

    const now = new Date();
    const approvedAmount = loanAccount.DISBURSEMENT_LIMIT || creditApplication.PRIME_LIMIT_AMT;

    // 3. GET REQUIRED DISBURSEMENT DATA
    const fundingAcctNo = creditApplication.REPAY_SRC_ACCT_NO;
    const PROD_ID = creditApplication.PROD_ID;
    const APPL_ID = creditApplication.APPL_ID;
    
    if (!APPL_ID || !fundingAcctNo || !PROD_ID) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Missing required data for disbursement. Need APPL_ID, funding account, and PROD_ID",
        code: "MISSING_DISBURSEMENT_DATA",
      });
    }

    // =====================================================
    // START OF REPLACEMENT AREA - REPLACE FROM HERE
    // =====================================================

    // 4. ENTERPRISE-GRADE GUARANTOR HANDLING FOR MASSIVE SCALE (MILLIONS+ CUSTOMERS)
    let guarantor;
    let GUARANTOR_ID;

    // CACHE STRATEGY: Use Redis/memory cache for frequent guarantor lookups
    // Handle Redis gracefully - if not configured, skip caching
    let redisClient;
    try {
      redisClient = req.app.get('redisClient') || null;
    } catch (error) {
      console.log('Redis not available, proceeding without cache');
      redisClient = null;
    }

    const guarantorCacheKey = `guarantor_${creditApplication.CUST_ID || loanAccount.CUST_ID}`;
    let cachedGuarantor = null;

    if (redisClient) {
      try {
        cachedGuarantor = await redisClient.get(guarantorCacheKey);
      } catch (redisError) {
        console.warn('Redis cache read failed:', redisError.message);
      }
    }

    if (cachedGuarantor) {
      guarantor = JSON.parse(cachedGuarantor);
      console.log('Using cached guarantor:', guarantor.GUARANTOR_ID);
    }

    // STRATEGY 1: PRIORITY - Direct Loan/Customer Linkage (Most Reliable)
    if (!guarantor) {
      const directLinkConditions = [];
      
      // A) Direct loan account linkage
      if (loanAccount?._id) {
        directLinkConditions.push({ loanId: loanAccount._id });
      }
      
      // B) Existing guarantor ID from application or loan
      const existingGuarantorId = loanAccount.GUARANTOR_ID || creditApplication.GUARANTOR_ID;
      if (existingGuarantorId) {
        directLinkConditions.push({ GUARANTOR_ID: existingGuarantorId });
      }
      
      // C) Customer ID linkage (if guarantor has customer reference)
      if (creditApplication?.CUST_ID) {
        directLinkConditions.push({ $expr: { $eq: ["$idNumber", creditApplication.CUST_ID] } });
      }
      
      if (directLinkConditions.length > 0) {
        try {
          guarantor = await Guarantor.findOne({
            $or: directLinkConditions,
            status: { 
              $in: ["ACTIVE", "APPROVED"] // Using lowercase 'status' as per your schema
            },
            isActive: true
          })
          .select('GUARANTOR_ID fullName phoneNumber email status GUARANTEED_AMT relationshipToBorrower')
          .session(session)
          .lean(); // Use lean() for performance
          
          if (guarantor) {
            console.log('Strategy 1: Found direct-linked guarantor:', guarantor.GUARANTOR_ID);
            // Cache for future use
            if (redisClient) {
              try {
                await redisClient.setex(guarantorCacheKey, 300, JSON.stringify(guarantor)); // 5 min cache
              } catch (cacheError) {
                console.warn('Failed to cache guarantor:', cacheError.message);
              }
            }
          }
        } catch (error) {
          console.warn('Strategy 1 query failed:', error.message);
        }
      }
    }

    // STRATEGY 2: CUSTOMER MATCHING - Find by customer attributes (Optimized)
    if (!guarantor && creditApplication) {
      const customerMatchConditions = [];
      const branchId = loanAccount.BU_ID || creditApplication.BU_ID;
      
      // Build efficient search conditions with exact matches first
      if (creditApplication.PHONE_NUMBER) {
        const normalizedPhone = normalizePhoneNumber(creditApplication.PHONE_NUMBER);
        customerMatchConditions.push({ phoneNumber: normalizedPhone });
        customerMatchConditions.push({ phoneNumber: { $regex: `^${normalizedPhone.slice(-10)}` } }); // Last 10 digits
      }
      
      if (creditApplication.EMAIL) {
        const normalizedEmail = creditApplication.EMAIL.toLowerCase().trim();
        customerMatchConditions.push({ email: normalizedEmail });
      }
      
      if (creditApplication.BVN) {
        customerMatchConditions.push({ bvn: creditApplication.BVN });
      }
      
      if (creditApplication.CUST_NM) {
        const names = creditApplication.CUST_NM.trim().split(/\s+/);
        if (names.length > 0) {
          const firstName = names[0];
          // Create case-insensitive regex for first name
          customerMatchConditions.push({ 
            fullName: { $regex: new RegExp(`^${escapeRegex(firstName)}`, 'i') }
          });
        }
      }
      
      if (creditApplication.CUST_ID) {
        customerMatchConditions.push({ idNumber: creditApplication.CUST_ID });
      }
      
      if (customerMatchConditions.length > 0) {
        try {
          // Prioritize guarantors in same branch, then any branch
          guarantor = await Guarantor.findOne({
            $or: customerMatchConditions,
            status: { 
              $in: ["ACTIVE", "APPROVED", "PENDING"] // Using lowercase 'status'
            },
            isActive: true,
            $or: [
              { BU_ID: branchId }, // Same branch first
              { BU_ID: { $exists: true } } // Any branch second
            ]
          })
          .select('GUARANTOR_ID fullName phoneNumber email status GUARANTEED_AMT relationshipToBorrower BU_ID')
          .sort({ 
            'BU_ID': branchId ? -1 : 1, // Prefer same branch
            status: -1, // Prefer active over pending
            updatedAt: -1 
          })
          .session(session)
          .lean();
          
          if (guarantor) {
            console.log('Strategy 2: Found customer-matched guarantor:', guarantor.GUARANTOR_ID);
            if (redisClient) {
              try {
                await redisClient.setex(guarantorCacheKey, 300, JSON.stringify(guarantor));
              } catch (cacheError) {
                console.warn('Failed to cache guarantor:', cacheError.message);
              }
            }
          }
        } catch (error) {
          console.warn('Strategy 2 query failed:', error.message);
        }
      }
    }

    // STRATEGY 3: SIMPLE POOL SELECTION (Simplified version without pool guarantor flags)
    if (!guarantor) {
      const branchId = loanAccount.BU_ID || creditApplication.BU_ID || '001';
      
      try {
        // Look for any active guarantor in the same branch
        guarantor = await Guarantor.findOne({
          BU_ID: branchId,
          status: "ACTIVE",
          isActive: true
        })
        .select('GUARANTOR_ID fullName phoneNumber email status GUARANTEED_AMT')
        .sort({ updatedAt: -1 })
        .session(session)
        .lean();
        
        if (guarantor) {
          console.log('Strategy 3: Found branch guarantor:', guarantor.GUARANTOR_ID);
          if (redisClient) {
            try {
              await redisClient.setex(guarantorCacheKey, 600, JSON.stringify(guarantor));
            } catch (cacheError) {
              console.warn('Failed to cache guarantor:', cacheError.message);
            }
          }
        }
      } catch (error) {
        console.warn('Strategy 3 query failed:', error.message);
      }
    }

    // STRATEGY 4: ANY ACTIVE GUARANTOR FALLBACK
    if (!guarantor) {
      try {
        // Find any active guarantor in the system
        guarantor = await Guarantor.findOne({
          status: "ACTIVE",
          isActive: true
        })
        .select('GUARANTOR_ID fullName phoneNumber email status GUARANTEED_AMT')
        .sort({ updatedAt: -1 })
        .session(session)
        .lean();
        
        if (guarantor) {
          console.log('Strategy 4: Found any active guarantor:', guarantor.GUARANTOR_ID);
          if (redisClient) {
            try {
              await redisClient.setex(guarantorCacheKey, 180, JSON.stringify(guarantor));
            } catch (cacheError) {
              console.warn('Failed to cache guarantor:', cacheError.message);
            }
          }
        }
      } catch (error) {
        console.warn('Strategy 4 query failed:', error.message);
      }
    }

    // STRATEGY 5: DYNAMIC GUARANTOR CREATION - SIMPLIFIED VERSION
    if (!guarantor) {
      console.log('Creating new guarantor record for customer:', creditApplication.CUST_NM);
      
      // Generate unique 7-digit GUARANTOR_ID (as per your schema requirement)
      const lastGuarantor = await Guarantor.findOne({})
        .sort({ GUARANTOR_ID: -1 })
        .session(session);
      
      let newGuarantorId;
      if (lastGuarantor && /^\d{7}$/.test(lastGuarantor.GUARANTOR_ID)) {
        // Increment last ID
        newGuarantorId = (parseInt(lastGuarantor.GUARANTOR_ID) + 1).toString().padStart(7, '0');
      } else {
        // Start from 1000001
        newGuarantorId = '1000001';
      }
      
      // Get user info from User model if available, otherwise use approvedBy
      let userInfo = { user_name: approvedBy, email: null };
      try {
        // Check if User model exists and get user info
        const User = mongoose.models.User;
        if (User) {
          const user = await User.findById(approvedBy).select('user_name email').session(session).catch(() => null);
          if (user) {
            userInfo = { user_name: user.user_name, email: user.email };
          }
        }
      } catch (userError) {
        console.warn('Could not fetch user info:', userError.message);
      }
      
      const branchId = loanAccount.BU_ID || creditApplication.BU_ID || '001';
      
      // Build simplified guarantor data based on your schema
      const guarantorData = {
        GUARANTOR_ID: newGuarantorId,
        fullName: creditApplication.CUST_NM?.trim() || "Customer Guarantor",
        phoneNumber: normalizePhoneNumber(creditApplication.PHONE_NUMBER || creditApplication.Borrower_address?.phone || "08000000000"),
        email: (creditApplication.EMAIL || `${creditApplication.CUST_ID || 'customer'}@bank.com`).toLowerCase().trim(),
        relationshipToBorrower: "Customer",
        GUARANTEED_AMT: parseFloat(approvedAmount),
        status: "APPROVED", // Using lowercase 'status' as per schema
        createdBy: approvedBy,
        relationshipOfficerName: userInfo.user_name,
        loanId: loanAccount._id,
        guaranteedLoans: [loanAccount._id],
        address: creditApplication.Borrower_address?.street || "Not specified",
        state: creditApplication.Borrower_address?.state || "Lagos",
        localGovernment: creditApplication.Borrower_address?.localGovernment || "Not specified",
        country: creditApplication.Borrower_address?.country || "Nigeria",
        BU_ID: branchId,
        idType: "Customer ID",
        idNumber: creditApplication.CUST_ID || newGuarantorId,
        bvn: creditApplication.BVN || null,
        dateOfBirth: creditApplication.dateOfBirth || new Date('1980-01-01'),
        netWorth: parseFloat(approvedAmount) * 10,
        annualIncome: parseFloat(approvedAmount) * 2,
        occupation: creditApplication.occupation || "Not specified",
        employmentType: creditApplication.employmentType || "Other",
        verificationStatus: "Verified",
        verifiedBy: approvedBy,
        verificationDate: now,
        consentDate: now,
        isActive: true
      };

      try {
        // Create guarantor
        guarantor = new Guarantor(guarantorData);
        await guarantor.save({ session });
        
        console.log('Strategy 5: Created new dynamic guarantor:', newGuarantorId);
        
      } catch (saveError) {
        console.error('Dynamic guarantor creation failed:', saveError.message);
        
        // LAST RESORT: Minimal valid guarantor
        try {
          const minimalGuarantor = {
            GUARANTOR_ID: newGuarantorId,
            fullName: creditApplication.CUST_NM?.substring(0, 100) || "Customer",
            phoneNumber: "08000000000",
            relationshipToBorrower: "Customer",
            GUARANTEED_AMT: parseFloat(approvedAmount),
            status: "APPROVED",
            createdBy: approvedBy,
            relationshipOfficerName: approvedBy,
            loanId: loanAccount._id,
            state: "Lagos",
            BU_ID: branchId,
            idNumber: creditApplication.CUST_ID || newGuarantorId,
            verificationStatus: "Verified",
            verifiedBy: approvedBy,
            verificationDate: now,
            consentDate: now,
            isActive: true,
            createdAt: now,
            updatedAt: now
          };
          
          guarantor = new Guarantor(minimalGuarantor);
          await guarantor.save({ session });
          
          console.log('Created minimal guarantor as fallback:', newGuarantorId);
        } catch (minimalError) {
          console.error('Minimal guarantor failed:', minimalError.message);
          // Final fallback: In-memory guarantor object
          guarantor = {
            _id: new mongoose.Types.ObjectId(),
            GUARANTOR_ID: newGuarantorId,
            fullName: creditApplication.CUST_NM || "Customer",
            status: "APPROVED",
            GUARANTEED_AMT: parseFloat(approvedAmount),
            isVirtual: true, // Flag as virtual/unsaved
            isFallback: true
          };
        }
      }
    }

    // PROCESS THE FOUND/CREATED GUARANTOR
    GUARANTOR_ID = guarantor.GUARANTOR_ID;
    console.log('Selected guarantor:', GUARANTOR_ID);

    // ENRICHMENT: Update guarantor with loan linkage
    if (guarantor._id && !guarantor.isVirtual) {
      try {
        const updateData = {
          loanId: loanAccount._id,
          updatedAt: now
        };
        
        // Add to guaranteed loans array if not already present
        if (!guarantor.guaranteedLoans || !guarantor.guaranteedLoans.includes(loanAccount._id)) {
          updateData.$addToSet = { guaranteedLoans: loanAccount._id };
        }
        
        // Ensure required fields
        if (!guarantor.BU_ID) {
          updateData.BU_ID = loanAccount.BU_ID || creditApplication.BU_ID || '001';
        }
        
        if (!guarantor.relationshipOfficerName) {
          updateData.relationshipOfficerName = approvedBy;
        }
        
        // Auto-activate if pending
        if (guarantor.status === "PENDING") {
          updateData.status = "ACTIVE";
          updateData.verifiedBy = approvedBy;
          updateData.verificationDate = now;
        }
        
        await Guarantor.updateOne(
          { _id: guarantor._id },
          updateData,
          { session }
        );
        
        // Update cache
        if (redisClient) {
          try {
            const enrichedGuarantor = {
              ...guarantor.toObject ? guarantor.toObject() : guarantor,
              ...updateData
            };
            delete enrichedGuarantor.$addToSet; // Remove MongoDB operator
            
            await redisClient.setex(guarantorCacheKey, 300, JSON.stringify(enrichedGuarantor));
          } catch (cacheError) {
            console.warn('Failed to update guarantor cache:', cacheError.message);
          }
        }
        
      } catch (updateError) {
        console.warn('Guarantor enrichment failed (non-critical):', updateError.message);
        console.error('Guarantor update error:', {
          guarantorId: GUARANTOR_ID,
          loanAccount: ACCT_NO,
          error: updateError.message,
          timestamp: now
        });
      }
    }

    // UTILITY FUNCTIONS
    function normalizePhoneNumber(phone) {
      if (!phone) return "08000000000";
      return phone.toString().replace(/\D/g, '').slice(-11); // Keep last 11 digits
    }

    function escapeRegex(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // =====================================================
    // END OF REPLACEMENT AREA - CONTINUE WITH EXISTING CODE
    // =====================================================

    // 5. FIND CUSTOMER ACCOUNT (CONTINUE WITH EXISTING CODE)
    const customerAccount = await CustomerAccount.findOne({
      account_number: fundingAcctNo
    }).session(session);

    if (!customerAccount) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Customer account not found for disbursement",
        code: "CUSTOMER_ACCOUNT_NOT_FOUND",
      });
    }

    // 6. VALIDATE LOAN AMOUNT
    const amount = parseFloat(approvedAmount);
    const productIdNum = Number(PROD_ID);

    if (isNaN(productIdNum)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
        code: "INVALID_PRODUCT_ID",
      });
    }

    // 7. APPROVE CREDIT APPLICATION
    await CreditApplication.updateOne(
      { _id: creditApplication._id },
      {
        $set: {
          STATUS: "APPROVED",
          APPROVED_BY: approvedBy,
          APPROVAL_DT: now,
          APPROVED_LIMIT_AMT: approvedAmount,
          approvalComments: approvalComments,
          GUARANTOR_ID: GUARANTOR_ID, // Add guarantor reference
          UPDATED_AT: now,
        },
      },
      { session }
    );

    // 8. FETCH ADDITIONAL DATA
    const [
      loanProduct,
      productMapping,
      loanInterestRate
    ] = await Promise.all([
      LoanProduct.findOne({ PROD_ID: productIdNum }).session(session),
      ProductTypeMapping.findOne({ PROD_ID: productIdNum }).session(session),
      (async () => {
        try {
          if (!loanAccount.LOAN_INTEREST_RATE_ID && !creditApplication.INDEX_RATE_ID) return null;
          const loanInterestRateId = loanAccount.LOAN_INTEREST_RATE_ID || creditApplication.INDEX_RATE_ID;
          const numericId = parseInt(loanInterestRateId);
          const query = isNaN(numericId) 
            ? { LOAN_PROUD_INT_ID: loanInterestRateId.toString(), STATUS: 'ACTIVE' }
            : { LOAN_PROUD_INT_ID: numericId, STATUS: 'ACTIVE' };
          return await LoanInterestRate.findOne(query).populate('INDEX_RATE_ID').session(session);
        } catch (error) {
          console.error('Error finding LoanInterestRate:', error);
          return null;
        }
      })()
    ]);

    if (!loanProduct) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: `Loan product not found with PROD_ID: ${productIdNum}`,
        code: "PRODUCT_NOT_FOUND",
      });
    }

    // 9. CALCULATE FEES
    const processingFeeRate = parseFloat(loanProduct.processingFeeRate?.toString() || '0') / 100;
    const upfrontInterestRate = parseFloat(loanAccount.upfrontInterestPercentage?.toString() || '0') / 100;

    const processingFee = amount * processingFeeRate;
    const upfrontInterest = amount * upfrontInterestRate;
    const totalFees = processingFee + upfrontInterest;
    const netAmount = amount - totalFees;

    if (netAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Net disbursement must be positive",
        code: "INVALID_NET_AMOUNT",
      });
    }

    // 10. DETERMINE INTEREST RATE
    let effectiveInterestRate;
    
    if (loanInterestRate && loanInterestRate.DEFAULT_RATE_PER_MONTH !== undefined) {
      const monthlyRate = loanInterestRate.DEFAULT_RATE_PER_MONTH;
      effectiveInterestRate = monthlyRate * 12;
    } else if (loanAccount.INTEREST_RATE) {
      effectiveInterestRate = parseFloat(loanAccount.INTEREST_RATE.toString());
    } else if (loanProduct.interestRate) {
      effectiveInterestRate = parseFloat(loanProduct.interestRate.toString());
    } else if (loanProduct.DEFAULT_RATE_PER_MONTH) {
      const monthlyRate = parseFloat(loanProduct.DEFAULT_RATE_PER_MONTH.toString());
      effectiveInterestRate = monthlyRate * 12;
    } else {
      effectiveInterestRate = 12.0;
    }

    const txIds = {
      TRANSACTION_ID: `AUTO-DISB-${Date.now()}`,
      EVENT_ID: `AUTO-EVT-${Date.now()}`,
      JOURNAL_ID: `AUTO-JRN-${Date.now()}`,
    };

    // 11. UPDATE LOAN ACCOUNT WITH GUARANTOR INFO
    // Get loan term data
    const termValue = loanAccount.TERM_VALUE || creditApplication.TERM_VALUE || 12;
    const termCd = loanAccount.TERM_CD || creditApplication.TERM_CD || 'MONTH';
    
    await LoanAccount.updateOne(
      { _id: loanAccount._id },
      {
        $set: {
          LOAN_STATUS: "ACTIVE",
          APPROVED_BY: approvedBy,
          APPROVED_DATE: now,
          DISBURSEMENT_DATE: now,
          DISBURSED_AMOUNT: toDecimal128(amount),
          ACTUAL_DISBURSEMENT: toDecimal128(amount),
          OUTSTANDING_PRINCIPAL: toDecimal128(amount),
          CURRENT_BALANCE: toDecimal128(-amount),
          START_DT: now,
          processingFee: toDecimal128(processingFee),
          upfrontInterestCollected: toDecimal128(upfrontInterest),
          totalFeesCollected: toDecimal128(totalFees),
          NET_DISBURSEMENT: toDecimal128(netAmount),
          INTEREST_RATE: toDecimal128(effectiveInterestRate),
          LOAN_INTEREST_RATE_ID: loanInterestRate?.LOAN_PROUD_INT_ID || null,
          TERM_VALUE: termValue,
          TERM_CD: termCd,
          // ADD GUARANTOR INFO
          GUARANTOR_ID: GUARANTOR_ID,
          HAS_GUARANTOR: true,
          guarantorDetails: {
            guarantorId: guarantor._id,
            guarantorNumberId: GUARANTOR_ID,
            name: guarantor.fullName || "System Guarantor",
            phone: guarantor.phoneNumber || "08000000000",
            relationship: guarantor.relationshipToBorrower || "System",
            status: guarantor.status || "APPROVED", // Changed from STATUS to status
            guaranteedAmount: toDecimal128(guarantor.GUARANTEED_AMT || amount)
          },
          ...txIds,
          LAST_UPDATED: now,
        },
      },
      { session }
    );

    // 12. UPDATE CREDIT APPLICATION STATUS
    await CreditApplication.updateOne(
      { _id: creditApplication._id },
      {
        $set: {
          STATUS: "DISBURSED",
          DISBURSEMENT_DATE: now,
          ACTUAL_DISBURSEMENT: amount,
          NET_DISBURSEMENT: netAmount,
          LOAN_STATUS: "ACTIVE",
          GUARANTOR_ID: GUARANTOR_ID,
        },
      },
      { session }
    );

    // 13. UPDATE CUSTOMER ACCOUNT WITH POSITIVE BALANCE
    const currentCustomerBalance = parseFloat(customerAccount.LEDGER_BALANCE?.toString() || '0');
    const newCustomerBalance = currentCustomerBalance + netAmount;
    
    await CustomerAccount.updateOne(
      { _id: customerAccount._id },
      {
        $set: {
          LEDGER_BALANCE: toDecimal128(newCustomerBalance),
          CLEARED_BALANCE: toDecimal128(newCustomerBalance),
          AVAILABLE_BALANCE: toDecimal128(newCustomerBalance),
          LAST_UPDATED: now,
        },
      },
      { session }
    );

    // 14. ACTIVATE AND LINK GUARANTOR TO LOAN
    try {
      await Guarantor.updateOne(
        { _id: guarantor._id },
        {
          $addToSet: { guaranteedLoans: loanAccount._id },
          $set: {
            status: "ACTIVE", // Changed from STATUS to status
            GUARANTEED_AMOUNT: amount,
            LOAN_ACCOUNT_NO: ACCT_NO,
            ACTIVATION_DATE: now,
            LOAN_ACCOUNT_ID: loanAccount._id,
            loanId: loanAccount._id.toString(),
            updatedAt: now
          }
        },
        { session }
      );
      console.log('Guarantor linked to loan successfully');
    } catch (guarantorUpdateError) {
      console.warn('Guarantor update failed (non-critical):', guarantorUpdateError.message);
      // Continue even if guarantor update fails
    }

    // 15. CREATE TRANSACTION RECORDS - USING CREDIT/DEBIT TYPES
    try {
      // Get the last transaction ID to increment properly
      const lastTransaction = await Transaction.findOne({})
        .sort({ TRANSACTION_ID: -1 })
        .session(session)
        .select('TRANSACTION_ID');
      
      let nextTransactionId = 1;
      if (lastTransaction && lastTransaction.TRANSACTION_ID) {
        // Extract numeric part and increment
        const match = lastTransaction.TRANSACTION_ID.toString().match(/\d+/);
        if (match) {
          nextTransactionId = parseInt(match[0]) + 1;
        }
      }
      
      const txId1 = `TXN${nextTransactionId.toString().padStart(10, '0')}`;
      const txId2 = `TXN${(nextTransactionId + 1).toString().padStart(10, '0')}`;
      
      console.log('Creating transactions with IDs:', txId1, txId2);
      
      await Transaction.create([
        {
          TRANSACTION_ID: nextTransactionId,
          transactionId: txId1,
          EVENT_ID: 1,
          TRAN_JOURNAL_ID: `JRN${Date.now()}1`,
          ACCT_NO: fundingAcctNo,
          ACCT_ID: customerAccount._id.toString(),
          BU_ID: customerAccount.branch || loanAccount.BU_ID,
          CUST_ID: customerAccount.CUST_ID || loanAccount.CUST_ID,
          ACCT_NM: customerAccount.account_holder_name || `Customer ${fundingAcctNo}`,
          AMOUNT: netAmount,
          transactionDirection: 'CREDIT',
          TRANSACTIONDATE: now,
          TRANSACTION_TYPE: 'CREDIT', // Use CREDIT type
          description: `Loan disbursement received from loan ${ACCT_NO} (Net: ₦${netAmount.toLocaleString()})`,
          currency: loanAccount.CRNCY_ID || 'NGN',
          createdBy: approvedBy,
          status: 'COMPLETED',
          REFERENCE: `DISB-RCV-${ACCT_NO}`,
          metadata: {
            sourceLoanAccount: ACCT_NO,
            totalLoanAmount: amount,
            feesDeducted: totalFees,
            netAmountReceived: netAmount,
            guarantorId: GUARANTOR_ID,
            guarantorName: guarantor.fullName || "System Guarantor",
            transactionCategory: 'LOAN_DISBURSEMENT',
            isLoanDisbursement: true
          }
        },
        {
          TRANSACTION_ID: nextTransactionId + 1,
          transactionId: txId2,
          EVENT_ID: 2,
          TRAN_JOURNAL_ID: `JRN${Date.now()}2`,
          ACCT_NO: ACCT_NO,
          ACCT_ID: loanAccount._id.toString(),
          BU_ID: loanAccount.BU_ID,
          CUST_ID: loanAccount.CUST_ID,
          ACCT_NM: loanAccount.ACCT_NM || creditApplication.CUST_NM || `Loan ${ACCT_NO}`,
          AMOUNT: amount,
          transactionDirection: 'DEBIT',
          TRANSACTIONDATE: now,
          TRANSACTION_TYPE: 'DEBIT', // Use DEBIT type
          description: `Loan disbursement issued to ${customerAccount.account_holder_name} (Total: ₦${amount.toLocaleString()})`,
          currency: loanAccount.CRNCY_ID || 'NGN',
          createdBy: approvedBy,
          status: 'COMPLETED',
          REFERENCE: `DISB-ISS-${ACCT_NO}`,
          metadata: {
            targetCustomerAccount: fundingAcctNo,
            totalLoanAmount: amount,
            feesDeducted: totalFees,
            netAmountDisbursed: netAmount,
            guarantorId: GUARANTOR_ID,
            transactionCategory: 'LOAN_DISBURSEMENT',
            isLoanDisbursement: true
          }
        }
      ], { session, ordered: true });
      
      console.log('Transaction records created successfully');
    } catch (transactionError) {
      console.error('Failed to create transaction records:', transactionError.message);
      throw transactionError;
    }

    // 16. CREATE DISBURSEMENT RECORD - WITH ALL REQUIRED FIELDS
    // Get interest configuration data
    const interestType = (loanAccount.INTEREST_TYPE || 'FIXED').toUpperCase();
    const calculationMethod = (loanAccount.INTEREST_CALCULATION || 'DECLINING_BALANCE').toUpperCase();
    
    console.log('Creating disbursement with data:', {
      ACCT_NO,
      TERM_VALUE: termValue,
      TERM_CD: termCd,
      INTEREST_RATE: effectiveInterestRate,
      AMOUNT: amount,
      CUST_ID: loanAccount.CUST_ID || creditApplication.CUST_ID,
      APPL_ID,
      INTEREST_TYPE: interestType,
      CALCULATION_METHOD: calculationMethod
    });
    
    const disbursement = new Disbursement({
      LOAN_ACCOUNT_ID: loanAccount._id,
      CREDIT_APPLICATION_ID: creditApplication._id,
      DISBURSEMENT_AMOUNT: toDecimal128(amount),
      FEES_AMOUNT: toDecimal128(totalFees),
      UPFRONT_INTEREST_AMOUNT: toDecimal128(upfrontInterest),
      NET_DISBURSEMENT_AMOUNT: toDecimal128(netAmount),
      TARGET_ACCOUNT_NO: fundingAcctNo,
      SOURCE_ACCOUNT_NO: 'BANK_CAPITAL_ACCOUNT',
      CURRENCY: loanAccount.CRNCY_ID || 'NGN',
      STATUS: 'EXECUTED',
      APPROVED_BY: approvedBy,
      EXECUTED_BY: approvedBy,
      APPROVED_DATE: now,
      EXECUTION_DATE: now,
      EXECUTION_METHOD: 'AUTO',
      
      // REQUIRED FIELDS FOR LOAN DISBURSEMENT
      ACCT_NO: ACCT_NO,
      INTEREST_RATE: effectiveInterestRate,
      TERM_VALUE: termValue,
      TERM_CD: termCd,
      AMOUNT: toDecimal128(amount),
      CUST_ID: loanAccount.CUST_ID || creditApplication.CUST_ID,
      APPL_ID: APPL_ID,
      
      INTEREST_CONFIGURATION: {
        INTEREST_RATE: effectiveInterestRate,
        INTEREST_TYPE: interestType, // Ensure uppercase
        CALCULATION_METHOD: calculationMethod // Ensure uppercase
      },
      
      GUARANTOR_DETAILS: {
        GUARANTOR_ID: GUARANTOR_ID,
        name: guarantor.fullName || "System Guarantor",
        phone: guarantor.phoneNumber || "08000000000",
        relationship: guarantor.relationshipToBorrower || "System",
        guaranteedAmount: guarantor.GUARANTEED_AMT || amount
      },
      
      CREATED_BY: approvedBy,
      CREATED_DATE: now,
      TRANSACTION_REFERENCE: txIds.TRANSACTION_ID,
      ACCOUNTING_ENTRIES: {
        loanAccountDebit: amount,
        customerAccountCredit: netAmount,
        feeIncome: totalFees,
        netEffect: `Bank: -₦${amount} | Customer: +₦${netAmount} | Bank Fees: +₦${totalFees}`
      }
    });

    await disbursement.save({ session });
    console.log('Disbursement record created successfully:', disbursement._id);

    // 17. CREATE LOANDISBURSEMENT RECORD IF NEEDED
    try {
      // Check if LoanDisbursement model exists
      const LoanDisbursementModel = mongoose.models.LoanDisbursement;
      if (LoanDisbursementModel) {
        const loanDisbursement = new LoanDisbursementModel({
          ACCT_NO: ACCT_NO,
          INTEREST_RATE: effectiveInterestRate,
          TERM_VALUE: termValue,
          TERM_CD: termCd,
          AMOUNT: toDecimal128(amount),
          CUST_ID: loanAccount.CUST_ID || creditApplication.CUST_ID,
          APPL_ID: APPL_ID,
          INTEREST_CONFIGURATION: {
            INTEREST_TYPE: interestType,
            CALCULATION_METHOD: calculationMethod,
            INTEREST_RATE: effectiveInterestRate
          },
          DISBURSEMENT_ID: disbursement._id,
          DISBURSEMENT_AMOUNT: toDecimal128(amount),
          DISBURSEMENT_DATE: now,
          STATUS: 'COMPLETED',
          CREATED_DATE: now,
          APPROVED_BY: approvedBy
        });
        
        await loanDisbursement.save({ session });
        console.log('LoanDisbursement record created successfully');
      }
    } catch (loanDisbursementError) {
      console.warn('LoanDisbursement creation failed (non-critical):', loanDisbursementError.message);
      // Continue even if this fails
    }

    // 18. AUDIT LOG
    try {
      const AuditLog = mongoose.model("AuditLog");
      const auditRecord = new AuditLog({
        action: "LOAN_APPROVED_AND_DISBURSED",
        userId: approvedBy,
        timestamp: now,
        details: {
          ACCT_NO,
          CUST_ID: creditApplication.CUST_ID,
          approvedAmount: amount,
          disbursedAmount: amount,
          netAmount,
          feesDeducted: totalFees,
          method: "AUTO_DISBURSEMENT",
          accountingEntries: {
            loanAccountBalance: -amount,
            customerAccountBalanceChange: netAmount,
            customerAccountBalanceBefore: currentCustomerBalance,
            customerAccountBalanceAfter: newCustomerBalance
          },
          transactionId: txIds.TRANSACTION_ID,
          fundingAccount: fundingAcctNo,
          guarantorId: GUARANTOR_ID,
          guarantorName: guarantor.fullName || "System Guarantor",
          guarantorStatus: guarantor.status || "APPROVED"
        },
      });
      
      await auditRecord.save({ session });
    } catch (e) {
      console.warn("Audit failed:", e.message);
      // Don't throw error - audit failure shouldn't break the transaction
    }

    await session.commitTransaction();
    transactionSuccess = true;

    return res.json({
      success: true,
      message: "Loan approved and auto-disbursed successfully",
      data: {
        approval: {
          ACCT_NO,
          customerName: creditApplication.CUST_NM,
          approvedAmount: amount,
          approvedBy,
          approvedAt: now,
        },
        disbursement: {
          disbursementId: disbursement._id,
          transactionReference: txIds.TRANSACTION_ID,
          netAmountToCustomer: netAmount,
          feesDeducted: totalFees,
          feeBreakdown: {
            processingFee,
            upfrontInterest
          },
          fundingAccount: fundingAcctNo,
          disbursementDate: now,
          loanStatus: "ACTIVE"
        },
        guarantorDetails: {
          guarantorId: GUARANTOR_ID,
          name: guarantor.fullName || "System Guarantor",
          phone: guarantor.phoneNumber || "08000000000",
          relationship: guarantor.relationshipToBorrower || "System",
          status: guarantor.status || "APPROVED", // Changed from STATUS to status
          guaranteedAmount: guarantor.GUARANTEED_AMT || amount
        },
        accountingImpact: {
          loanAccount: {
            accountNumber: ACCT_NO,
            balanceChange: -amount,
            newBalance: -amount,
            description: "Liability to bank"
          },
          customerAccount: {
            accountNumber: fundingAcctNo,
            balanceBefore: currentCustomerBalance,
            balanceChange: netAmount,
            balanceAfter: newCustomerBalance,
            description: "Asset to customer"
          },
          bankIncome: {
            feeIncome: totalFees,
            description: "Bank revenue from fees"
          }
        },
        transactionIds: txIds
      },
    });
  } catch (error) {
    if (!transactionSuccess) {
      await session.abortTransaction();
    }

    console.error("Auto-approval and disbursement failed:", error);

    return res.status(500).json({
      success: false,
      message: "Auto-approval and disbursement failed",
      error: error.message,
      code: "AUTO_APPROVAL_DISBURSEMENT_ERROR",
    });
  } finally {
    session.endSession();
  }
},

async rejectLoanApplication(req, res) {
  const session = await mongoose.startSession();
  let transactionSuccess = false;

  try {
    await session.startTransaction();

    const { ACCT_NO, CUST_ID, rejectedBy, reason } = req.body;

    // Required fields
    if (!rejectedBy || !reason?.trim()) {
      return res.status(400).json({
        success: false,
        message: "rejectedBy and reason are required",
        code: "MISSING_FIELDS",
      });
    }

    if (!ACCT_NO && !CUST_ID) {
      return res.status(400).json({
        success: false,
        message: "Either ACCT_NO or CUST_ID is required",
        code: "MISSING_IDENTIFIER",
      });
    }

    console.log("Rejecting loan:", { ACCT_NO, CUST_ID, rejectedBy });

    let creditApplication;
    let loanAccount;

    // CASE 1: Use ACCT_NO (preferred & safest)
    if (ACCT_NO) {
      creditApplication = await CreditApplication.findOne({
        ACCT_NO,
        STATUS: { $in: ["PENDING", "APPROVED"] },
      }).session(session);

      loanAccount = await LoanAccount.findOne({
        ACCT_NO,
        LOAN_STATUS: { $in: ["PENDING", "APPROVED"] },
      }).session(session);
    }
    // CASE 2: Fallback to CUST_ID (safe now!)
    else if (CUST_ID) {
      const custIdStr = String(CUST_ID || "").trim();
      const normalizedCustId = custIdStr.replace(/^0+/, "") || custIdStr;

      creditApplication = await CreditApplication.findOne({
        CUST_ID: { $in: [custIdStr, normalizedCustId] },
        STATUS: { $in: ["PENDING", "APPROVED"] },
      }).session(session);

      if (creditApplication) {
        loanAccount = await LoanAccount.findOne({
          ACCT_NO: creditApplication.ACCT_NO,
          LOAN_STATUS: { $in: ["PENDING", "APPROVED"] },
        }).session(session);
      }
    }

    if (!creditApplication || !loanAccount) {
      return res.status(404).json({
        success: false,
        message: "No loan application found to reject",
        code: "APPLICATION_NOT_FOUND",
        hint: ACCT_NO ? `Account: ${ACCT_NO}` : `Customer ID: ${CUST_ID}`,
      });
    }

    const now = new Date();

    // Update Credit Application
    await CreditApplication.updateOne(
      { _id: creditApplication._id },
      {
        $set: {
          STATUS: "REJECTED",
          REJECTED_BY: rejectedBy,
          REJECTED_DATE: now,
          REJECTION_REASON: reason,
          UPDATED_AT: now,
        },
      },
      { session }
    );

    // Update Loan Account
    await LoanAccount.updateOne(
      { _id: loanAccount._id },
      {
        $set: {
          LOAN_STATUS: "REJECTED",
          REJECTED_BY: rejectedBy,
          REJECTED_DATE: now,
          REJECTION_REASON: reason,
          UPDATED_AT: now,
          GUARANTOR_ID: null,
          HAS_GUARANTOR: false,
          GUARANTEED_AMOUNT: 0,
        },
      },
      { session }
    );

    // Release Guarantor
    if (loanAccount.GUARANTOR_ID) {
      await Guarantor.updateOne(
        { _id: loanAccount.GUARANTOR_ID },
        {
          $set: {
            status: "RELEASED",
            releasedBy: rejectedBy,
            releasedDate: now,
            releaseReason: `Loan rejected: ${reason}`,
            loanAccountNo: null,
            loanId: null,
          },
        },
        { session }
      );
    }

    // Cancel Repayment Schedule
    await RepaymentSchedule.updateOne(
      { LOAN_ACCOUNT_ID: loanAccount._id },
      { $set: { STATUS: "CANCELLED" } },
      { session }
    ).catch(() => {});

    // Audit Trail
    try {
      const AuditLog = mongoose.model("AuditLog");
      await AuditLog.create(
        [{
          action: "LOAN_REJECTED",
          userId: rejectedBy,
          timestamp: now,
          details: {
            ACCT_NO: loanAccount.ACCT_NO,
            CUST_ID: creditApplication.CUST_ID,
            customerName: creditApplication.CUST_NM,
            rejectionReason: reason,
            previousStatus: creditApplication.STATUS,
            rejectedUsing: ACCT_NO ? "ACCT_NO" : "CUST_ID",
          },
        }],
        { session }
      );
    } catch (err) {
      console.warn("Audit log failed:", err.message);
    }

    await session.commitTransaction();
    transactionSuccess = true;

    return res.json({
      success: true,
      message: "Loan application rejected successfully",
      data: {
        ACCT_NO: loanAccount.ACCT_NO,
        customerName: creditApplication.CUST_NM,
        rejectionReason: reason,
        rejectedBy,
        rejectedAt: now,
        guarantorReleased: !!loanAccount.GUARANTOR_ID,
      },
    });
  } catch (error) {
    if (session.inTransaction() && !transactionSuccess) {
      await session.abortTransaction();
    }
    console.error("Rejection failed:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Failed to reject loan",
      code: "REJECTION_FAILED",
    });
  } finally {
    session.endSession();
  }
}, 



// Helper: Get interest configuration from LoanInterestRate table
async getInterestConfiguration(PROD_ID, INDEX_RATE_ID, session) {
  try {
    console.log('Getting interest configuration for:', { PROD_ID, INDEX_RATE_ID });
    
    // First try to get from LoanInterestRate table
    const loanInterestRate = await LoanInterestRate.findOne({
      PROD_ID: Number(PROD_ID),
      INDEX_RATE_ID: Number(INDEX_RATE_ID),
      STATUS: 'ACTIVE'
    }).session(session);

    if (loanInterestRate) {
      console.log('Found LoanInterestRate:', loanInterestRate._id);
      return {
        LOAN_INTEREST_RATE_ID: loanInterestRate._id,
        INTEREST_RATE: parseFloat(loanInterestRate.ABSOLUTE_RATE?.toString() || loanInterestRate.FIXED_RATE?.toString() || '0'),
        INTEREST_TYPE: loanInterestRate.INT_TY || 'COMPOUND',
        RATE_TYPE: loanInterestRate.RATE_TY || 'FIXED',
        CALCULATION_METHOD: loanInterestRate.CALCULATION_METHOD || 'REDUCING_BALANCE',
        PROD_ID: loanInterestRate.PROD_ID,
        INDEX_RATE_ID: loanInterestRate.INDEX_RATE_ID,
        ACCRUAL_BASIS: loanInterestRate.ACCRUAL_BASIS_TY,
        ACCRUAL_FREQUENCY: loanInterestRate.ACCRUAL_FREQ_CD,
        SOURCE: 'LOAN_INTEREST_RATE_TABLE'
      };
    }

    // Fallback to RateIndex
    console.log('LoanInterestRate not found, checking RateIndex...');
    const rateIndex = await RateIndex.findOne({
      INDEX_RATE_ID: Number(INDEX_RATE_ID)
    }).session(session);

    if (rateIndex) {
      return {
        INTEREST_RATE: parseFloat(rateIndex.INDEX_RATE?.toString() || '0'),
        INTEREST_TYPE: 'COMPOUND',
        RATE_TYPE: 'VARIABLE',
        CALCULATION_METHOD: 'REDUCING_BALANCE',
        INDEX_RATE_ID: rateIndex.INDEX_RATE_ID,
        SOURCE: 'RATE_INDEX_TABLE'
      };
    }

    // Fallback to LoanProduct
    console.log('RateIndex not found, checking LoanProduct...');
    const loanProduct = await LoanProduct.findOne({
      PROD_ID: Number(PROD_ID)
    }).session(session);

    if (loanProduct) {
      return {
        INTEREST_RATE: parseFloat(loanProduct.interestRate?.toString() || loanProduct.DEFAULT_RATE_PER_MONTH?.toString() || '0'),
        INTEREST_TYPE: 'COMPOUND',
        RATE_TYPE: 'FIXED',
        CALCULATION_METHOD: 'REDUCING_BALANCE',
        PROD_ID: loanProduct.PROD_ID,
        SOURCE: 'LOAN_PRODUCT_TABLE'
      };
    }

    throw new Error('No interest configuration found for this loan product and rate index');

  } catch (error) {
    console.error('Error getting interest configuration:', error);
    throw error;
  }
},

// Helper: Calculate disbursement amount with fees
async calculateDisbursementAmount(loanAccount, interestConfig, session) {
  const loanAmount = parseFloat(loanAccount.DISBURSEMENT_LIMIT?.toString() || '0');
  
  // Get product for fee calculation
  const loanProduct = await LoanProduct.findOne({
    PROD_ID: Number(loanAccount.PROD_ID)
  }).session(session);

  // Calculate processing fee
  const processingFeeRate = parseFloat(loanProduct?.processingFeeRate?.toString() || '0') / 100;
  const processingFee = loanAmount * processingFeeRate;

  // Calculate upfront interest (if applicable)
  const upfrontInterestPercentage = parseFloat(loanAccount.upfrontInterestPercentage?.toString() || '0') / 100;
  const upfrontInterest = loanAmount * upfrontInterestPercentage;

  const totalFees = processingFee + upfrontInterest;
  const netAmount = loanAmount - totalFees;

  return {
    totalLoanAmount: loanAmount,
    processingFee,
    upfrontInterest,
    totalFees,
    netAmount,
    processingFeeRate: processingFeeRate * 100,
    upfrontInterestPercentage: upfrontInterestPercentage * 100
  };
},

async executeDisbursement(req, res) {
  const session = await mongoose.startSession();
  let transactionAborted = false;

  try {
    await session.withTransaction(async () => {
      const { 
        disbursementId,
        executedBy,
        transactionNotes
      } = req.body;

      if (!disbursementId || !executedBy) {
        throw { status: 400, message: "Disbursement ID and executor are required" };
      }

      // 1. Get the disbursement record
      const disbursement = await Disbursement.findById(disbursementId).session(session);
      if (!disbursement) {
        throw { status: 404, message: "Disbursement record not found" };
      }

      if (disbursement.STATUS !== 'APPROVED') {
        throw { 
          status: 400, 
          message: `Disbursement cannot be executed. Current status: ${disbursement.STATUS}` 
        };
      }

      // 2. Get the loan account
      const loanAccount = await LoanAccount.findById(disbursement.LOAN_ACCOUNT_ID).session(session);
      if (!loanAccount) {
        throw { status: 404, message: "Loan account not found" };
      }

      if (loanAccount.LOAN_STATUS !== 'APPROVED') {
        throw { 
          status: 400, 
          message: `Loan must be APPROVED for disbursement. Current status: ${loanAccount.LOAN_STATUS}` 
        };
      }

      // 3. Get customer account
      const customerAccount = await CustomerAccount.findOne({
        account_number: disbursement.TARGET_ACCOUNT_NO
      }).session(session);

      if (!customerAccount) {
        throw { status: 404, message: "Target account not found" };
      }

      // 4. Execute the disbursement using your existing disbursement service
      const disbursementResult = await processLoanDisbursementTransactions({
        session,
        loanAccount: {
          ...loanAccount.toObject(),
          DISBURSED_AMOUNT: toDecimal128(disbursement.DISBURSEMENT_AMOUNT.toString()),
          NET_DISBURSEMENT: toDecimal128(disbursement.NET_DISBURSEMENT_AMOUNT.toString())
        },
        customerAccount,
        AMOUNT: parseFloat(disbursement.DISBURSEMENT_AMOUNT.toString()),
        loanFeeAmount: parseFloat(disbursement.FEES_AMOUNT.toString()),
        fundingAcctNo: disbursement.TARGET_ACCOUNT_NO,
        ACCT_NO: loanAccount.ACCT_NO,
        CREATED_BY: executedBy,
        DISBURSEMENT_DATE: new Date(),
        INTEREST_RATE: disbursement.INTEREST_CONFIGURATION.INTEREST_RATE,
        PRODUCT_TYPE: loanAccount.PRODUCT_TYPE || 'INDIVIDUAL_LOAN',
        productId: loanAccount.PROD_ID,
        deductUpfrontInterest: loanAccount.DEDUCT_UPFRONT_INTEREST || false,
        partialUpfrontInterest: loanAccount.PARTIAL_UPFRONT_INTEREST || false,
        upfrontInterestAmount: parseFloat(disbursement.UPFRONT_INTEREST_AMOUNT.toString()),
        upfrontInterestPercentage: parseFloat(loanAccount.upfrontInterestPercentage?.toString() || '0'),
        guarantorId: loanAccount.GUARANTOR_ID,
        guaranteedAmount: parseFloat(loanAccount.GUARANTEED_AMOUNT?.toString() || '0'),
        guarantorName: loanAccount.guarantorDetails?.name,
        TRANSACTION_ID: `DISB-${Date.now()}`,
        EVENT_ID: `EVT-${Date.now()}`,
        JOURNAL_ID: `JRN-${Date.now()}`,
        branchId: loanAccount.BU_ID
      });

      // 5. Update disbursement status
      disbursement.STATUS = 'EXECUTED';
      disbursement.EXECUTED_BY = executedBy;
      disbursement.EXECUTION_DATE = new Date();
      disbursement.TRANSACTION_NOTES = transactionNotes;
      disbursement.TRANSACTION_REFERENCE = disbursementResult.transactionIds.TRANSACTION_ID;
      await disbursement.save({ session });

      // 6. Update loan account status
      loanAccount.LOAN_STATUS = 'ACTIVE';
      loanAccount.DISBURSEMENT_DATE = new Date();
      loanAccount.DISBURSED_AMOUNT = disbursement.DISBURSEMENT_AMOUNT;
      loanAccount.ACTUAL_DISBURSEMENT = disbursement.DISBURSEMENT_AMOUNT;
      loanAccount.OUTSTANDING_PRINCIPAL = disbursement.DISBURSEMENT_AMOUNT;
      loanAccount.CURRENT_BALANCE = toDecimal128(parseFloat(disbursement.DISBURSEMENT_AMOUNT.toString()) * -1); // Negative balance
      await loanAccount.save({ session });

      // 7. Update customer account balance
      const netDisbursement = parseFloat(disbursement.NET_DISBURSEMENT_AMOUNT.toString());
      const currentBalance = parseFloat(customerAccount.LEDGER_BALANCE?.toString() || '0');
      customerAccount.LEDGER_BALANCE = toDecimal128(currentBalance + netDisbursement);
      customerAccount.CLEARED_BALANCE = toDecimal128(currentBalance + netDisbursement);
      customerAccount.AVAILABLE_BALANCE = toDecimal128(currentBalance + netDisbursement);
      await customerAccount.save({ session });

      // 8. Create transaction history
      await Transaction.create([{
        TRANSACTION_ID: disbursementResult.transactionIds.TRANSACTION_ID,
        EVENT_ID: disbursementResult.transactionIds.EVENT_ID,
        TRAN_JOURNAL_ID: disbursementResult.transactionIds.JOURNAL_ID,
        ACCT_NO: loanAccount.ACCT_NO,
        ACCT_ID: loanAccount._id.toString(),
        BU_ID: loanAccount.BU_ID,
        CUST_ID: loanAccount.CUST_ID,
        ACCT_NM: loanAccount.ACCT_NM,
        AMOUNT: netDisbursement,
        TRANSACTIONDATE: new Date(),
        TRANSACTION_TYPE: 'LOAN_DISBURSEMENT',
        description: `Loan disbursement to ${loanAccount.ACCT_NM}`,
        currency: loanAccount.CRNCY_ID || 'NGN',
        createdBy: executedBy,
        status: 'COMPLETED',
        REFERENCE: `DISB-${loanAccount.ACCT_NO}-${Date.now()}`
      }], { session });

      // 9. Update workflow
      const workflowItem = await WorkflowItem.findOne({
        ITEM_VALUE: loanAccount._id.toString()
      }).session(session);

      if (workflowItem) {
        workflowItem.STATUS = 'COMPLETED';
        workflowItem.ACTION_BY = executedBy;
        workflowItem.ACTION_DATE = new Date();
        workflowItem.ACTION_NOTES = 'Loan disbursement completed';
        await workflowItem.save({ session });
      }

      // 10. Create audit trail
      await AuditTrail.create([{
        EVENT_ID: `EXEC-DISB-${Date.now()}`,
        USER_ID: executedBy,
        EVENT_TYPE: 'EXECUTION',
        ACTION: 'LOAN_DISBURSEMENT_EXECUTED',
        ENTITY_ID: loanAccount._id,
        ENTITY_TYPE: 'LoanAccount',
        OLD_VALUE: { 
          LOAN_STATUS: 'APPROVED',
          DISBURSED_AMOUNT: '0.00' 
        },
        NEW_VALUE: { 
          LOAN_STATUS: 'ACTIVE',
          DISBURSED_AMOUNT: disbursement.DISBURSEMENT_AMOUNT.toString() 
        },
        DESCRIPTION: `Loan ${loanAccount.ACCT_NO} disbursed to ${customerAccount.account_number}`,
        IP_ADDRESS: req.ip,
        STATUS: 'SUCCESS',
        TIMESTAMP: new Date()
      }], { session });

      return res.status(200).json({
        success: true,
        message: 'Loan disbursement executed successfully',
        data: {
          loanAccountNumber: loanAccount.ACCT_NO,
          customerName: loanAccount.ACCT_NM,
          disbursementStatus: 'EXECUTED',
          financialImpact: {
            totalLoanAmount: parseFloat(disbursement.DISBURSEMENT_AMOUNT.toString()),
            feesDeducted: parseFloat(disbursement.FEES_AMOUNT.toString()),
            upfrontInterest: parseFloat(disbursement.UPFRONT_INTEREST_AMOUNT.toString()),
            netAmountToCustomer: parseFloat(disbursement.NET_DISBURSEMENT_AMOUNT.toString()),
            targetAccount: customerAccount.account_number,
            customerBalanceBefore: currentBalance,
            customerBalanceAfter: currentBalance + netDisbursement
          },
          loanDetails: {
            status: 'ACTIVE',
            outstandingPrincipal: parseFloat(disbursement.DISBURSEMENT_AMOUNT.toString()),
            nextPaymentDate: loanAccount.NEXT_PAYMENT_DATE,
            interestRate: disbursement.INTEREST_CONFIGURATION.INTEREST_RATE,
            interestType: disbursement.INTEREST_CONFIGURATION.INTEREST_TYPE
          },
          transactionReference: disbursementResult.transactionIds.TRANSACTION_ID
        }
      });
    });

  } catch (error) {
    if (!transactionAborted && session.inTransaction?.()) {
      await session.abortTransaction();
      transactionAborted = true;
    }
    console.error("Disbursement execution failed:", error);
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || "Disbursement execution failed",
      code: error.code || "DISBURSEMENT_EXECUTION_ERROR"
    });
  } finally {
    await session.endSession();
  }
},

// async disburseLoan(req, res) {
//   const session = await mongoose.startSession();
//   let transactionAborted = false;

//   try {
//     await session.withTransaction(async () => {
//       console.log('Starting loan disbursement process with transaction');

//       const {
//         APPL_ID,
//         ACCT_NO,
//         AMOUNT,
//         fundingAcctNo,
//         PROD_ID,
//         GUARANTOR_ID,
//         CREATED_BY = req.user?.id || 'SYSTEM',
//       } = req.body;

//       // Required fields
//       if (!APPL_ID || !ACCT_NO || !AMOUNT || !fundingAcctNo || !PROD_ID || !GUARANTOR_ID) {
//         throw { status: 400, message: "All required fields must be provided", code: "MISSING_FIELDS" };
//       }

//       console.log("Disbursement request:", { APPL_ID, ACCT_NO, AMOUNT, fundingAcctNo, PROD_ID, GUARANTOR_ID });

//       // === FETCH ALL DOCUMENTS ===
//       const [creditApp, loanAccount, fundingAccount, guarantor, productMapping] = await Promise.all([
//         CreditApplication.findOne({ APPL_ID }).session(session),
//         LoanAccount.findOne({ ACCT_NO }).session(session),
//         CustomerAccount.findOne({ ACCT_NO: fundingAcctNo }).session(session), // CORRECT
//         Guarantor.findOne({ GUARANTOR_ID: String(GUARANTOR_ID) }).session(session),
//         ProductTypeMapping.findOne({ PROD_ID }).session(session),
//       ]);

//       // === VALIDATE ===
//       if (!creditApp) throw { status: 404, message: `Application ${APPL_ID} not found`, code: "APP_NOT_FOUND" };
//       if (!loanAccount) throw { status: 404, message: `Loan account ${ACCT_NO} not found`, code: "LOAN_NOT_FOUND" };
//       if (!fundingAccount) throw { status: 404, message: `Funding account ${fundingAcctNo} not found`, code: "FUNDING_NOT_FOUND" };
//       if (!guarantor) throw { status: 404, message: `Guarantor ${GUARANTOR_ID} not found`, code: "GUARANTOR_NOT_FOUND" };
//       if (!productMapping) throw { status: 404, message: `Product ${PROD_ID} not configured`, code: "PRODUCT_NOT_FOUND" };

//       console.log(`Funding account found: ${fundingAccount.ACCT_NO} | Balance: ${fundingAccount.ledger_balance} | CUST_ID: ${fundingAccount.CUST_ID}`);

//       // === CUST_ID MATCHING (CRITICAL FIX) ===
//       const normalizedFundingCustId = normalizeCustId(fundingAccount.CUST_ID); // "0000000002"
//       const normalizedLoanCustId = normalizeCustId(loanAccount.CUST_ID);       // "0000000002"

//       if (normalizedFundingCustId !== normalizedLoanCustId) {
//         throw {
//           status: 400,
//           message: `Funding account belongs to CUST_ID ${normalizedFundingCustId}, but loan is for ${normalizedLoanCustId}`,
//           code: "CUST_ID_MISMATCH",
//         };
//       }

//       // === STATUS CHECKS ===
//       if (loanAccount.LOAN_STATUS !== "APPROVED") {
//         throw { status: 400, message: `Loan must be APPROVED. Current: ${loanAccount.LOAN_STATUS}`, code: "NOT_APPROVED" };
//       }
//       if (loanAccount.DISBURSED_AMOUNT && parseFloat(loanAccount.DISBURSED_AMOUNT.toString()) > 0) {
//         throw { status: 400, message: "Loan already disbursed", code: "ALREADY_DISBURSED" };
//       }

//       // === FEES & NET AMOUNT ===
//       const amount = parseFloat(AMOUNT);
//       const totalFees = amount * 0.015;
//       const netAmount = amount - totalFees;

//       if (netAmount <= 0) throw { status: 400, message: "Net amount must be positive", code: "INVALID_NET" };

//       const now = new Date();
//       const txIds = {
//         TRANSACTION_ID: `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
//         EVENT_ID: `EVT-${Date.now()}`,
//         JOURNAL_ID: `JRN-${Date.now()}`,
//       };

//       // === UPDATE LOAN ACCOUNT ===
//       await LoanAccount.updateOne(
//         { _id: loanAccount._id },
//         {
//           $set: {
//             LOAN_STATUS: "ACTIVE",
//             DISBURSED_AMOUNT: mongoose.Types.Decimal128.fromString(amount.toFixed(2)),
//             ACTUAL_DISBURSEMENT: mongoose.Types.Decimal128.fromString(amount.toFixed(2)),
//             OUTSTANDING_PRINCIPAL: mongoose.Types.Decimal128.fromString(amount.toFixed(2)),
//             CURRENT_BALANCE: mongoose.Types.Decimal128.fromString(amount.toFixed(2)),
//             START_DT: now,
//             DISBURSEMENT_DATE: now,
//             ...txIds,
//             lastUpdated: now,
//           },
//         },
//         { session }
//       );

//       // === UPDATE CREDIT APPLICATION ===
//       await CreditApplication.updateOne(
//         { _id: creditApp._id },
//         { $set: { STATUS: "DISBURSED", disbursementDate: now, lastUpdated: now } },
//         { session }
//       );

//       // === ACTIVATE GUARANTOR ===
//       await Guarantor.updateOne(
//         { _id: guarantor._id },
//         {
//           $addToSet: { guaranteedLoans: loanAccount._id },
//           $set: { status: "ACTIVE", lastUsedDate: now },
//         },
//         { session }
//       );

//       // === PROCESS TRANSACTIONS ===
//       await processLoanDisbursementTransactions({
//         session,
//         loanAccount,
//         customerAccount: fundingAccount,
//         AMOUNT: amount,
//         loanFeeAmount: totalFees,
//         fundingAcctNo,
//         ACCT_NO,
//         CREATED_BY,
//         DISBURSEMENT_DATE: now,
//         PRODUCT_TYPE: productMapping.PRODUCT_TYPE,
//         ...txIds,
//       });

//       console.log('LOAN DISBURSED SUCCESSFULLY');

//       return res.json({
//         success: true,
//         message: "Loan disbursed successfully!",
//         data: {
//           loanAccountNumber: ACCT_NO,
//           applicationId: APPL_ID,
//           disbursedAmount: amount,
//           netToCustomer: netAmount,
//           totalFees,
//           disbursementDate: now,
//           status: "ACTIVE",
//           customerId: normalizedLoanCustId,
//         },
//       });
//     });

//     transactionAborted = false;
//   } catch (error) {
//     if (!transactionAborted && session.inTransaction?.()) {
//       try {
//         await session.abortTransaction();
//         transactionAborted = true;
//       } catch (e) {
//         console.error("Transaction already aborted");
//       }
//     }

//     console.error("Disbursement failed:", error.message || error);
//     return res.status(error.status || 500).json({
//       success: false,
//       message: error.message || "Loan disbursement failed",
//       code: error.code || "DISBURSEMENT_FAILED",
//     });
//   } finally {
//     await session.endSession();
//   }
// },

  async getErrorMessage(error, sourceAcctNo) {
    const errorMessages = {
      'GL_ACCOUNT_NOT_FOUND': `The treasury GL account ${sourceAcctNo} was not found`,
      'GL_ACCOUNT_DEBIT_NOT_ALLOWED': `The treasury GL account ${sourceAcctNo} cannot be debited`,
      'INSUFFICIENT_GL_BALANCE': `Insufficient funds in treasury GL account ${sourceAcctNo}`,
      'TRANSACTION_VALIDATION_FAILED': `Transaction validation failed: ${error.message}`,
      'UPFRONT_INTEREST_ALREADY_DEDUCTED': 'Cannot approve disbursement - upfront interest was already deducted',
      'INVALID_GUARANTOR_STATUS': `Invalid guarantor status: ${error.message}`,
      'MISSING_REQUIRED_FIELDS': error.message,
      'INVALID_APPROVER': error.message,
      'INVALID_LOAN_FEE_PERCENTAGE': error.message,
      'INVALID_LOAN_FEE_RANGE': error.message,
      'WORK_ITEM_NOT_FOUND': error.message,
      'LOAN_CONTRACT_NOT_FOUND': error.message,
      'LOAN_ACCOUNT_NOT_FOUND': 'Loan account not found',
      'CUSTOMER_ACCOUNT_NOT_FOUND': 'Customer account not found',
      'INVALID_LOAN_AMOUNT': 'Invalid loan amount',
      'INVALID_REPAYMENT_SCHEDULE': 'Failed to generate repayment schedule'
    };
    
    return errorMessages[error.code] || error.message || 'An unexpected error occurred';
  },

  async approveLoanDisbursement(req, res) {
    const session = await mongoose.startSession();
    let transactionCompleted = false;

    try {
      await session.startTransaction();

      const { workItemId, approvedBy = req.user?.id || 'system' } = req.body;

      if (!workItemId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required field: workItemId',
          code: 'MISSING_WORK_ITEM_ID'
        });
      }

      console.log('🔍 Starting disbursement approval for workItem:', workItemId);

      const workItem = await WF_WORK_ITEM.findOne({
        WORK_ITEM_ID: workItemId,
        status: { $in: ['PENDING', 'APPROVAL_PENDING', 'READY_FOR_DISBURSEMENT'] }
      }).session(session);

      if (!workItem) {
        const existingItem = await WF_WORK_ITEM.findOne({ WORK_ITEM_ID: workItemId }).session(session);
        return res.status(404).json({
          success: false,
          message: existingItem ? `Work item is in ${existingItem.status} status` : 'Work item not found',
          code: 'WORK_ITEM_NOT_FOUND'
        });
      }

      const loanAccount = await LoanAccount.findOne({
        _id: workItem.entityId,
        LOAN_STATUS: 'APPROVED'
      }).session(session);

      if (!loanAccount) {
        return res.status(404).json({
          success: false,
          message: 'Approved loan account not found for this work item',
          code: 'LOAN_ACCOUNT_NOT_FOUND'
        });
      }

      console.log('🔍 Found approved loan account:', loanAccount.ACCT_NO);

      const customerAccount = await CustomerAccount.findOne({
        ACCT_NO: loanAccount.REPAYMENT_SOURCE_ACCOUNT
      }).session(session);

      if (!customerAccount) {
        return res.status(404).json({
          success: false,
          message: `Customer account ${loanAccount.REPAYMENT_SOURCE_ACCOUNT} not found`,
          code: 'CUSTOMER_ACCOUNT_NOT_FOUND'
        });
      }

      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(2, 15);
      const { TRANSACTION_ID, EVENT_ID, JOURNAL_ID } = {
        TRANSACTION_ID: `TXN-${timestamp}-${randomSuffix}`,
        EVENT_ID: `EVT-${timestamp}-${randomSuffix}`,
        JOURNAL_ID: `JRN-${timestamp}-${randomSuffix}`
      };

      const loanAmount = parseFloat(loanAccount.DISBURSEMENT_LIMIT?.toString() || '0');
      const totalFees = parseFloat(loanAccount.FEE_DETAILS?.totalFees?.toString() || '0');
      const upfrontInterest = parseFloat(loanAccount.UPFRONT_INTEREST_AMOUNT?.toString() || '0');
      const netDisbursement = loanAmount - totalFees - upfrontInterest;

      if (netDisbursement <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Net disbursement amount must be positive after deducting fees and upfront interest',
          code: 'INVALID_NET_DISBURSEMENT'
        });
      }

      console.log('💰 Disbursement amounts:', {
        loanAmount,
        totalFees,
        upfrontInterest,
        netDisbursement
      });

      console.log('🔄 Processing loan disbursement transactions for approved loan...');
      
      const transactionResult = await processLoanDisbursementTransactions({
        session,
        loanAccount,
        customerAccount,
        AMOUNT: loanAmount,
        loanFeeAmount: totalFees,
        fundingAcctNo: customerAccount.ACCT_NO,
        ACCT_NO: loanAccount.ACCT_NO,
        CREATED_BY: approvedBy,
        DISBURSEMENT_DATE: new Date(),
        INTEREST_RATE: parseFloat(loanAccount.INTEREST_RATE?.toString() || '0'),
        FEE_TYPE: 'PROCESSING_FEE',
        PRODUCT_TYPE: loanAccount.PRODUCT_TYPE || 'UNKNOWN',
        deductUpfrontInterest: loanAccount.DEDUCT_UPFRONT_INTEREST || false,
        partialUpfrontInterest: loanAccount.PARTIAL_UPFRONT_INTEREST || false,
        upfrontInterestAmount: upfrontInterest,
        upfrontInterestPercentage: parseFloat(loanAccount.UPFRONT_INTEREST_PERCENTAGE?.toString() || '0'),
        guarantorId: loanAccount.GUARANTOR_ID,
        guaranteedAmount: parseFloat(loanAccount.GUARANTEED_AMOUNT?.toString() || '0'),
        guarantorName: loanAccount.guarantorDetails?.name,
        TRANSACTION_ID,
        EVENT_ID,
        JOURNAL_ID
      });

      if (!transactionResult.success) {
        throw new Error(`Disbursement transactions failed: ${transactionResult.message}`);
      }

      console.log('✅ Loan disbursement transactions completed');

      await LoanAccount.updateOne(
        { _id: loanAccount._id },
        {
          $set: {
            LOAN_STATUS: 'ACTIVE',
            DISBURSED_AMOUNT: mongoose.Types.Decimal128.fromString(loanAmount.toFixed(2)),
            ACTUAL_DISBURSEMENT: mongoose.Types.Decimal128.fromString(netDisbursement.toFixed(2)),
            DISBURSEMENT_DATE: new Date(),
            TRANSACTION_ID,
            EVENT_ID,
            JOURNAL_ID,
            lastUpdated: new Date()
          }
        },
        { session }
      );

      await CreditApplication.updateOne(
        { APPL_ID: loanAccount.APPL_ID },
        {
          $set: {
            STATUS: 'DISBURSED',
            disbursementDate: new Date(),
            lastUpdated: new Date()
          }
        },
        { session }
      );

      await WF_WORK_ITEM.updateOne(
        { WORK_ITEM_ID: workItemId },
        {
          $set: {
            status: 'COMPLETED',
            REC_ST: 'COMPLETED',
            WAIT_ST: 'COMPLETED',
            UPDATED_BY: approvedBy,
            UPDATE_DT: new Date(),
            transactionDetails: {
              TRANSACTION_ID,
              EVENT_ID,
              JOURNAL_ID
            }
          }
        },
        { session }
      );

      if (loanAccount.GUARANTOR_ID) {
        await Guarantor.updateOne(
          { _id: loanAccount.GUARANTOR_ID },
          {
            $set: {
              status: 'ACTIVE',
              lastUsedDate: new Date()
            },
            $addToSet: { guaranteedLoans: loanAccount._id }
          },
          { session }
        );
      }

      await RepaymentSchedule.updateOne(
        { LOAN_ACCOUNT_ID: loanAccount._id },
        {
          $set: {
            STATUS: 'ACTIVE',
            lastUpdated: new Date()
          }
        },
        { session }
      );

      try {
        const AuditLog = mongoose.model('AuditLog');
        await AuditLog.create([{
          action: 'APPROVE_DISBURSEMENT',
          userId: approvedBy,
          timestamp: new Date(),
          details: {
            workItemId,
            loanAccountNumber: loanAccount.ACCT_NO,
            disbursedAmount: loanAmount,
            netDisbursement,
            transactionIds: { TRANSACTION_ID, EVENT_ID, JOURNAL_ID }
          }
        }], { session });
      } catch (auditError) {
        console.warn('Audit trail logging failed:', auditError.message);
      }

      await session.commitTransaction();
      transactionCompleted = true;

      console.log('✅ Loan disbursement approval completed successfully');

      return res.status(200).json({
        success: true,
        message: 'Loan disbursement approved and funds transferred successfully',
        data: {
          loanAccountNumber: loanAccount.ACCT_NO,
          disbursedAmount: loanAmount,
          netDisbursement,
          feesDeducted: totalFees,
          upfrontInterestDeducted: upfrontInterest,
          fundingAccount: customerAccount.ACCT_NO,
          transactionDetails: {
            TRANSACTION_ID,
            EVENT_ID,
            JOURNAL_ID
          },
          workItemId,
          status: 'ACTIVE'
        }
      });

    } catch (error) {
      console.error('❌ Disbursement approval error:', error);

      if (session.inTransaction() && !transactionCompleted) {
        try {
          await session.abortTransaction();
          console.log('🔄 Transaction rolled back due to error');
        } catch (abortError) {
          console.error('Error aborting transaction:', abortError);
        }
      }

      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to approve loan disbursement',
        code: error.code || 'DISBURSEMENT_APPROVAL_ERROR'
      });
    } finally {
      await session.endSession();
    }
  },

  async rejectLoanDisbursement(req, res) {
    const { 
      contractId, 
      rejectedBy, 
      rejectionReason,
      interestIncomeAccount = '1-01-400-100-100-1',
      overrideChecks = false
    } = req.body;

    const missingFields = [];
    if (!contractId) missingFields.push('contractId');
    if (!rejectedBy) missingFields.push('rejectedBy');
    if (!rejectionReason) missingFields.push('rejectionReason');
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        code: 'MISSING_REQUIRED_FIELDS',
        missingFields,
        details: {
          received: {
            contractId: !!contractId,
            rejectedBy: !!rejectedBy,
            rejectionReason: !!rejectionReason
          }
        }
      });
    }

    const officerIdRegex = /^[A-Z]{2,3}\d{3,4}$/;
    if (!officerIdRegex.test(rejectedBy)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Rejector ID must be in format AA123 or AAA1234',
        code: 'INVALID_OFFICER_ID',
        details: { rejectedBy }
      });
    }

    const session = await mongoose.startSession();
    let transactionCompleted = false;

    try {
      await session.withTransaction(async () => {
        const [loanContract, loanAccount, guarantor, creditApplication] = await Promise.all([
          LoanContractForm.findOne({
            $or: [
              { loan_contract_no: contractId },
              { _id: contractId }
            ],
            status: { $in: ['PENDING', 'APPROVED'] }
          }).session(session),
          LoanAccount.findOne({ 
            $or: [
              { ACCT_NO: contractId },
              { _id: contractId }
            ],
            LOAN_STATUS: { $in: ['PENDING', 'APPROVED'] }
          }).session(session),
          Guarantor.findOne({ 
            $or: [
              { loanAccountNo: contractId },
              { loanId: contractId }
            ],
            status: { $ne: 'RELEASED' }
          }).session(session),
          CreditApplication.findOne({
            $or: [
              { loanContractNo: contractId },
              { _id: contractId }
            ]
          }).session(session)
        ]);

        if (!loanContract && !loanAccount) {
          throw {
            code: 'LOAN_NOT_FOUND',
            message: 'Pending or approved loan contract/account not found',
            status: 404,
            details: { contractId }
          };
        }

        const targetLoanContract = loanContract || loanAccount;
        if (!targetLoanContract) {
          throw {
            code: 'LOAN_RECORD_NOT_FOUND',
            message: 'No valid loan record found for rejection',
            status: 404,
            details: { contractId }
          };
        }

        const hasUpfrontInterest = targetLoanContract.upfrontInterestAmount > 0 || 
                                 targetLoanContract.UPFRONT_INTEREST_AMOUNT > 0;
        const upfrontInterestAmount = parseFloat(
          targetLoanContract.upfrontInterestAmount?.toString() || 
          targetLoanContract.UPFRONT_INTEREST_AMOUNT?.toString() || '0'
        );
        const hasGuarantor = !!guarantor;

        const upfrontInterestPaid = targetLoanContract.upfrontInterestPaid || 
                                  targetLoanContract.UPFRONT_INTEREST_PAID;

        if (hasUpfrontInterest && upfrontInterestPaid && !overrideChecks) {
          throw {
            code: 'UPFRONT_INTEREST_ALREADY_DEDUCTED',
            message: 'Cannot reject loan - upfront interest was already deducted (use overrideChecks if intentional)',
            status: 400,
            details: {
              upfrontInterestPaid: true,
              amount: upfrontInterestAmount,
              paidDate: targetLoanContract.upfrontInterestPaidDate || targetLoanContract.UPFRONT_INTEREST_PAID_DATE
            }
          };
        }

        if (hasUpfrontInterest && upfrontInterestPaid) {
          const fundingAccount = await CustomerAccount.findOne({
            ACCT_NO: targetLoanContract.disbursementAccount || targetLoanContract.REPAYMENT_SOURCE_ACCOUNT
          }).session(session);

          if (!fundingAccount) {
            throw {
              code: 'FUNDING_ACCOUNT_NOT_FOUND',
              message: 'Cannot reverse upfront interest - funding account not found',
              status: 404,
              details: {
                accountNumber: targetLoanContract.disbursementAccount || targetLoanContract.REPAYMENT_SOURCE_ACCOUNT
              }
            };
          }

          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 15);
          const TRANSACTION_ID = `TXN-REV-${timestamp}-${randomSuffix}`;
          const EVENT_ID = `EVT-REV-${timestamp}-${randomSuffix}`;

          const JournalEntry = mongoose.model('JournalEntry');
          await JournalEntry.create([{
            account: interestIncomeAccount,
            debit: 0,
            credit: upfrontInterestAmount,
            description: `Reversal of upfront interest for rejected loan ${contractId}`,
            reference: contractId,
            transactionId: TRANSACTION_ID,
            eventId: EVENT_ID,
            date: new Date(),
            postedBy: rejectedBy,
            status: 'COMPLETED',
            session
          }, {
            account: fundingAccount.ACCT_NO,
            debit: upfrontInterestAmount,
            credit: 0,
            description: `Reversal of upfront interest for rejected loan ${contractId}`,
            reference: contractId,
            transactionId: TRANSACTION_ID,
            eventId: EVENT_ID,
            date: new Date(),
            postedBy: rejectedBy,
            status: 'COMPLETED',
            session
          }], { session });

          await CustomerAccount.updateOne(
            { _id: fundingAccount._id },
            { 
              $inc: { BALANCE: upfrontInterestAmount },
              $push: {
                transactions: {
                  transactionId: TRANSACTION_ID,
                  amount: upfrontInterestAmount,
                  type: 'INTEREST_REVERSAL',
                  date: new Date(),
                  description: `Reversal of upfront interest for rejected loan ${contractId}`
                }
              }
            },
            { session }
          );
        }

        const updatePromises = [];
        const now = new Date();

        if (loanContract) {
          const updateData = {
            status: 'REJECTED',
            approvalStatus: 'REJECTED',
            rejectedBy,
            rejectedAt: now,
            rejectionReason,
            updatedAt: now,
            deductUpfrontInterest: false,
            partialUpfrontInterest: false,
            upfrontInterestAmount: 0,
            upfrontInterestPercentage: 0,
            ...(hasUpfrontInterest && upfrontInterestPaid && { 
              upfrontInterestReversed: true,
              upfrontInterestReversalDate: now,
              upfrontInterestReversalBy: rejectedBy
            }),
            ...(hasGuarantor && {
              'guarantorDetails.status': 'RELEASED',
              'guarantorDetails.releaseDate': now,
              'guarantorDetails.releaseReason': `Loan rejection: ${rejectionReason}`
            })
          };
          updatePromises.push(loanContract.updateOne(updateData, { session }));
        }

        if (loanAccount) {
          const updateData = {
            LOAN_STATUS: 'REJECTED',
            REJECTED_BY: rejectedBy,
            REJECTED_DATE: now,
            REJECTION_REASON: rejectionReason,
            UPDATED_AT: now,
            DEDUCT_UPFRONT_INTEREST: false,
            PARTIAL_UPFRONT_INTEREST: false,
            UPFRONT_INTEREST_AMOUNT: 0,
            UPFRONT_INTEREST_PERCENTAGE: 0,
            UPFRONT_INTEREST_PAID: false,
            UPFRONT_INTEREST_PAID_DATE: null,
            ...(hasUpfrontInterest && upfrontInterestPaid && {
              UPFRONT_INTEREST_REVERSED: true,
              UPFRONT_INTEREST_REVERSAL_DATE: now
            }),
            ...(hasGuarantor && {
              GUARANTOR_ID: null,
              GUARANTEED_AMOUNT: 0,
              HAS_GUARANTOR: false
            })
          };
          updatePromises.push(loanAccount.updateOne(updateData, { session }));
        }

        if (creditApplication) {
          const updateData = {
            STATUS: 'REJECTED',
            REJECTED_BY: rejectedBy,
            REJECTED_DATE: now,
            UPDATED_AT: now,
            REJECTION_REASON: rejectionReason,
            deductUpfrontInterest: false,
            partialUpfrontInterest: false,
            upfrontInterestAmount: 0,
            upfrontInterestPercentage: 0,
            ...(hasGuarantor && {
              GUARANTOR_STATUS: 'RELEASED'
            })
          };
          updatePromises.push(creditApplication.updateOne(updateData, { session }));
        }

        if (guarantor) {
          const updateData = {
            status: 'RELEASED',
            releasedBy: rejectedBy,
            releasedDate: now,
            releaseReason: `Loan rejection: ${rejectionReason}`,
            updatedAt: now,
            loanAccountNo: null,
            loanId: null,
            creditApplicationId: null
          };
          updatePromises.push(guarantor.updateOne(updateData, { session }));
        }

        await Promise.all(updatePromises);

        await logAuditTrail({
          eventType: 'LOAN_REJECTION',
          userId: rejectedBy,
          entityType: 'Loan',
          entityId: loanAccount?._id || loanContract?._id,
          action: 'REJECT',
          oldValues: {
            status: loanContract?.status || loanAccount?.LOAN_STATUS,
            interestType: loanContract?.partialUpfrontInterest ? 'PARTIAL' : 
                         loanContract?.deductUpfrontInterest ? 'FULL' : 'NONE',
            upfrontInterestAmount: upfrontInterestAmount,
            upfrontInterestPercentage: loanContract?.upfrontInterestPercentage || loanAccount?.UPFRONT_INTEREST_PERCENTAGE || 0,
            hasGuarantor: !!guarantor,
            guarantorId: guarantor?._id || null,
            guaranteedAmount: guarantor?.GUARANTEED_AMT?.toString() || '0'
          },
          newValues: {
            status: 'REJECTED',
            rejectedBy,
            rejectionReason,
            rejectionDate: now,
            interestType: 'NONE',
            upfrontInterestAmount: 0,
            upfrontInterestPercentage: 0,
            hasGuarantor: false,
            guarantorId: null,
            guaranteedAmount: '0'
          },
          ipAddress: req.ip,
          metadata: {
            overrideUsed: overrideChecks,
            upfrontInterestReversed: hasUpfrontInterest && upfrontInterestPaid,
            reversalAmount: hasUpfrontInterest ? upfrontInterestAmount : 0,
            contractId
          }
        }, session);

        const notificationPromises = [];
        
        notificationPromises.push(
          NotificationService.send({
            ROLE_ID: [20, 19, 30],
            USER_ID: [loanAccount?.CREATED_BY, guarantor?.RELATIONSHIP_OFFICER_ID].filter(Boolean),
            message: `Loan application ${contractId} has been rejected`,
            status: 'REJECTED',
            notificationType: 'LOAN_REJECTION',
            metadata: {
              loanAccountNumber: contractId,
              rejectionReason,
              rejectedBy,
              rejectionDate: now,
              upfrontInterestHandling: hasUpfrontInterest ? 
                (upfrontInterestPaid ? 'REVERSED' : 'CLEARED') : 'NONE',
              reversalAmount: hasUpfrontInterest && upfrontInterestPaid ? 
                upfrontInterestAmount : 0,
              guarantorReleased: hasGuarantor,
              overrideUsed: overrideChecks
            }
          })
        );

        if (guarantor?.phoneNumber) {
          notificationPromises.push(
            NotificationService.sendSMS({
              phoneNumber: guarantor.phoneNumber,
              message: `Your guarantee for loan ${contractId} has been released due to loan rejection. Reason: ${rejectionReason}`
            })
          );
        }

        await Promise.all(notificationPromises);

        transactionCompleted = true;

        return res.status(200).json({
          success: true,
          message: 'Loan application rejected successfully',
          code: 'LOAN_REJECTED',
          data: {
            contractId,
            rejectedAt: now,
            rejectionReason,
            upfrontInterest: {
              existed: hasUpfrontInterest,
              amount: upfrontInterestAmount,
              wasDeducted: upfrontInterestPaid,
              wasReversed: hasUpfrontInterest && upfrontInterestPaid,
              reversalAmount: hasUpfrontInterest && upfrontInterestPaid ? 
                upfrontInterestAmount : 0
            },
            guarantor: {
              existed: hasGuarantor,
              wasReleased: hasGuarantor,
              guarantorId: guarantor?._id,
              guaranteedAmount: guarantor?.GUARANTEED_AMT || 0
            },
            affectedRecords: {
              loanContract: !!loanContract,
              loanAccount: !!loanAccount,
              creditApplication: !!creditApplication,
              guarantor: !!guarantor
            },
            overrideUsed: overrideChecks
          }
        });
      });
    } catch (error) {
      if (!transactionCompleted) {
        try {
          await session.abortTransaction();
        } catch (abortError) {
          logger.error('Transaction abort failed:', {
            error: abortError.message,
            originalError: error.message,
            contractId,
            timestamp: new Date()
          });
        }
      }

      logger.error('Loan disbursement rejection failed:', {
        error: error.message,
        code: error.code || 'REJECTION_ERROR',
        stack: error.stack,
        contractId,
        rejectedBy,
        timestamp: new Date(),
        details: error.details || {}
      });

      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Loan disbursement rejection failed',
        code: error.code || 'REJECTION_ERROR',
        details: process.env.NODE_ENV === 'development' ? {
          stack: error.stack,
          ...(error.details || {})
        } : undefined
      });
    } finally {
      await session.endSession();
    }
  },

  async repayLoan(req, res) {
    const session = await mongoose.startSession();
    let transactionCompleted = false;

    try {
      await session.withTransaction(async () => {
        const { ACCT_NO, REPAYMENT_AMOUNT, LOAN_ACCOUNT_ID, REPAYMENT_DATE = new Date(), IS_LEGACY_LOAN = false } = req.body;

        if (!req.user || !req.user.id) {
          throw new Error('Unauthorized: User not found');
        }

        const requiredFields = ['ACCT_NO', 'REPAYMENT_AMOUNT'];
        const missingFields = requiredFields.filter(field => !req.body[field]);
        if (missingFields.length > 0) {
          throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
        }

        if (REPAYMENT_AMOUNT <= 0) {
          throw new Error('Repayment amount must be positive');
        }

        const repaymentDate = new Date(REPAYMENT_DATE);
        if (isNaN(repaymentDate.getTime())) {
          throw new Error('Invalid repayment date format');
        }

        const loanAccount = await LoanAccount.findOne({ ACCT_NO }).session(session);
        if (!loanAccount) {
          throw new Error(`Loan account not found for ACCT_NO: ${ACCT_NO}`);
        }

        const sourceAccountNo = loanAccount.REPAYMENT_SOURCE_ACCOUNT;
        if (!sourceAccountNo) {
          throw new Error('No repayment source account mapped to this loan');
        }

        console.log('DEBUG - Looking for source account:', sourceAccountNo);
        console.log('DEBUG - Loan CUST_ID:', loanAccount.CUST_ID);

        let customerAccount = await CustomerAccount.findOne({ 
          $or: [
            { ACCT_NO: sourceAccountNo },
            { account_number: sourceAccountNo }
          ]
        }).session(session);

        if (!customerAccount) {
          customerAccount = await CustomerAccount.findOne({ 
            CUST_ID: loanAccount.CUST_ID 
          }).session(session);
          
          if (customerAccount) {
            console.log('DEBUG - Found alternative account for customer:', {
              ACCT_NO: customerAccount.ACCT_NO,
              account_number: customerAccount.account_number,
              CUST_ID: customerAccount.CUST_ID
            });
          }
        }

        if (!customerAccount) {
          const allAccounts = await CustomerAccount.find({}).limit(5).session(session);
          console.log('DEBUG - Sample accounts in database:', allAccounts.map(acc => ({
            _id: acc._id,
            ACCT_NO: acc.ACCT_NO,
            account_number: acc.account_number,
            CUST_ID: acc.CUST_ID,
            ACCT_NM: acc.ACCT_NM
          })));
          
          throw new Error(`Repayment source account ${sourceAccountNo} not found. Available fields in CustomerAccount: ACCT_NO, account_number`);
        }

        console.log('DEBUG - Found customer account:', {
          _id: customerAccount._id,
          ACCT_NO: customerAccount.ACCT_NO,
          account_number: customerAccount.account_number,
          CUST_ID: customerAccount.CUST_ID,
          ACCT_NM: customerAccount.ACCT_NM,
          LEDGER_BAL: customerAccount.LEDGER_BAL,
          AVAILABLE_BALANCE: customerAccount.AVAILABLE_BALANCE
        });

        const actualAccountNo = customerAccount.ACCT_NO || customerAccount.account_number;
        if (!actualAccountNo) {
          throw new Error('Customer account has no valid account number (ACCT_NO or account_number)');
        }

        const loanProduct = await LoanProduct.findOne({ PROD_ID: loanAccount.PROD_ID }).session(session);
        if (!loanProduct || !loanProduct.loanGLAccount) {
          throw new Error('Loan GL account not configured');
        }

        const customerBalance = parseFloat(
          customerAccount.AVAILABLE_BALANCE?.toString() || 
          customerAccount.LEDGER_BAL?.toString() || 
          customerAccount.BALANCE?.toString() || 
          '0'
        );
        
        if (customerBalance < REPAYMENT_AMOUNT) {
          throw new Error(`Insufficient balance in source account. Available: ${customerBalance.toFixed(2)}, Required: ${REPAYMENT_AMOUNT}`);
        }

        const eligibleStatuses = ['ACTIVE', 'active', 'DISBURSED', 'disbursed'];
        if (!eligibleStatuses.includes(loanAccount.LOAN_STATUS)) {
          throw new Error(`Loan is not active for repayment. Current status: ${loanAccount.LOAN_STATUS}`);
        }

        let outstandingPrincipal = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL?.toString() || '0');
        let outstandingInterest = parseFloat(loanAccount.TOTAL_INTEREST?.toString() || '0') - 
                                 parseFloat(loanAccount.interestPaid?.toString() || '0');
        
        const totalOutstanding = outstandingPrincipal + Math.max(0, outstandingInterest);

        if (REPAYMENT_AMOUNT > totalOutstanding) {
          throw new Error(`Repayment amount (${REPAYMENT_AMOUNT}) exceeds outstanding balance (${totalOutstanding.toFixed(2)})`);
        }

        let interestPaid = 0;
        let principalPaid = 0;
        
        if (outstandingInterest > 0) {
          interestPaid = Math.min(REPAYMENT_AMOUNT, outstandingInterest);
          principalPaid = REPAYMENT_AMOUNT - interestPaid;
        } else {
          principalPaid = REPAYMENT_AMOUNT;
        }

        const loanRepayment = new LoanRepayment({
          ACCT_NO: loanAccount.ACCT_NO,
          LOAN_ACCOUNT_ID: loanAccount._id,
          amount: mongoose.Types.Decimal128.fromString(REPAYMENT_AMOUNT.toFixed(2)),
          date: repaymentDate,
          CUST_ID: loanAccount.CUST_ID,
          interestPaid: mongoose.Types.Decimal128.fromString(interestPaid.toFixed(2)),
          principalPaid: mongoose.Types.Decimal128.fromString(principalPaid.toFixed(2)),
          REPAYMENT_HISTORY: [{
            amount: mongoose.Types.Decimal128.fromString(REPAYMENT_AMOUNT.toFixed(2)),
            date: repaymentDate,
            interestPaid: mongoose.Types.Decimal128.fromString(interestPaid.toFixed(2)),
            principalPaid: mongoose.Types.Decimal128.fromString(principalPaid.toFixed(2))
          }],
          isLegacyLoan: IS_LEGACY_LOAN,
          processedBy: req.user.id,
          sourceAccount: actualAccountNo
        });

        const TRANSACTION_IDS = generateTransactionIds();

        const repaymentTx = new Transaction({
          TRANSACTION_ID: TRANSACTION_IDS.TRANSACTION_ID,
          EVENT_ID: TRANSACTION_IDS.EVENT_ID,
          JOURNAL_ID: TRANSACTION_IDS.JOURNAL_ID,
          TRAN_JOURNAL_ID: TRANSACTION_IDS.TRAN_JOURNAL_ID,
          ACCT_ID: loanAccount._id,
          ACCT_NO: loanAccount.ACCT_NO,
          ACCT_NM: loanAccount.ACCT_NM,
          CUST_ID: loanAccount.CUST_ID,
          BU_ID: loanAccount.BU_ID || 'DEFAULT_BU',
          FROM_ACCT_NO: actualAccountNo,
          TO_ACCT_NO: loanProduct.loanGLAccount,
          AMOUNT: mongoose.Types.Decimal128.fromString(REPAYMENT_AMOUNT.toFixed(2)),
          CRNCY_ID: 'NGN',
          TRANSACTION_TYPE: 'LOAN_REPAYMENT',
          TRANSACTION_DESC: `Loan repayment for ${loanAccount.ACCT_NM} (Interest: ${interestPaid.toFixed(2)}, Principal: ${principalPaid.toFixed(2)})`,
          STATUS: 'COMPLETED',
          VALUE_DATE: repaymentDate,
          createdBy: req.user.id,
          metadata: {
            loanAccountNo: loanAccount.ACCT_NO,
            productType: loanAccount.PRODUCT_TYPE,
            interestPaid,
            principalPaid,
            isLegacyLoan: IS_LEGACY_LOAN,
            sourceAccount: actualAccountNo,
            sourceAccountField: customerAccount.ACCT_NO ? 'ACCT_NO' : 'account_number'
          }
        });

        const updateQuery = {
          $inc: {}
        };

        if (customerAccount.AVAILABLE_BALANCE !== undefined) {
          updateQuery.$inc.AVAILABLE_BALANCE = -REPAYMENT_AMOUNT;
        }
        if (customerAccount.LEDGER_BAL !== undefined) {
          updateQuery.$inc.LEDGER_BAL = -REPAYMENT_AMOUNT;
        }
        if (customerAccount.BALANCE !== undefined) {
          updateQuery.$inc.BALANCE = -REPAYMENT_AMOUNT;
        }

        const accountIdentifier = customerAccount.ACCT_NO ? { ACCT_NO: actualAccountNo } : { account_number: actualAccountNo };

        await CustomerAccount.updateOne(
          accountIdentifier,
          updateQuery,
          { session }
        );

        await GLAccount.updateOne(
          { GL_ACCT_NO: loanProduct.loanGLAccount },
          { $inc: { BALANCE: -REPAYMENT_AMOUNT } },
          { session }
        );

        const updateFields = {
          $inc: {
            TOTAL_REPAID_AMOUNT: REPAYMENT_AMOUNT,
            OUTSTANDING_PRINCIPAL: -principalPaid,
            interestPaid: interestPaid
          },
          $set: {
            lastRepaymentDate: repaymentDate
          }
        };

        const newOutstandingPrincipal = outstandingPrincipal - principalPaid;
        if (newOutstandingPrincipal <= 0.01) {
          updateFields.$set.LOAN_STATUS = 'PAID';
          updateFields.$set.repaidAt = new Date();
        }

        await LoanAccount.updateOne(
          { _id: loanAccount._id },
          updateFields,
          { session }
        );

        await loanRepayment.save({ session });
        await repaymentTx.save({ session });

        await session.commitTransaction();
        transactionCompleted = true;

        return res.status(200).json({
          success: true,
          message: 'Loan repayment processed successfully',
          data: {
            transactionId: TRANSACTION_IDS.TRANSACTION_ID,
            repaymentAmount: REPAYMENT_AMOUNT,
            interestPaid: parseFloat(interestPaid.toFixed(2)),
            principalPaid: parseFloat(principalPaid.toFixed(2)),
            loanAccountNo: loanAccount.ACCT_NO,
            sourceAccount: actualAccountNo,
            repaymentId: loanRepayment._id,
            outstandingPrincipal: parseFloat(newOutstandingPrincipal.toFixed(2)),
            outstandingInterest: parseFloat(Math.max(0, outstandingInterest - interestPaid).toFixed(2)),
            isLegacyLoan: IS_LEGACY_LOAN
          }
        });
      });
    } catch (error) {
      if (session.inTransaction() && !transactionCompleted) {
        await session.abortTransaction();
      }
      
      console.error('Loan repayment error:', error);
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Failed to process loan repayment',
        code: error.code || 'INTERNAL_SERVER_ERROR',
        isLegacyLoan: req.body.IS_LEGACY_LOAN || false
      });
    } finally {
      session.endSession();
    }
  },

  // =========================
  // LOAN MANAGEMENT METHODS
  // =========================

  async getAllLoans(req, res) {
    try {
      const { status, branch, product, page = 1, limit = 20 } = req.query;
      
      let query = {};
      if (status) query.LOAN_STATUS = status;
      if (branch) query.BU_ID = branch;
      if (product) query.PROD_ID = product;

      const loans = await LoanAccount.find(query)
        .skip((page - 1) * limit)
        .limit(parseInt(limit))
        .sort({ createdAt: -1 });

      const total = await LoanAccount.countDocuments(query);

      return res.json({
        success: true,
        data: loans,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch loans',
        error: error.message
      });
    }
  },

  async createLoanAccount(req, res) {
    try {
      const loanData = req.body;
      
      const requiredFields = ['CUST_ID', 'ACCT_NM', 'PROD_ID', 'DISBURSEMENT_LIMIT'];
      const missingFields = requiredFields.filter(field => !loanData[field]);
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required fields: ${missingFields.join(', ')}`,
          code: 'MISSING_REQUIRED_FIELDS'
        });
      }

      const accountNumber = await generateLoanAccountNumberByProdId(loanData.PROD_ID);
      
      const newLoanAccount = new LoanAccount({
        ...loanData,
        ACCT_NO: accountNumber,
        LOAN_STATUS: 'PENDING',
        applicationDate: new Date(),
        lastUpdated: new Date()
      });

      await newLoanAccount.save();

      return res.status(201).json({
        success: true,
        message: 'Loan account created successfully',
        data: {
          loanAccountId: newLoanAccount._id,
          accountNumber: newLoanAccount.ACCT_NO,
          status: newLoanAccount.LOAN_STATUS
        }
      });
    } catch (error) {
      console.error('Create loan account error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create loan account',
        error: error.message
      });
    }
  },

  async updateLoanAccount(req, res) {
    try {
      const { ACCT_NO } = req.params;
      const updateData = req.body;

      const loanAccount = await LoanAccount.findOne({ ACCT_NO });
      if (!loanAccount) {
        return res.status(404).json({
          success: false,
          message: 'Loan account not found',
          code: 'LOAN_ACCOUNT_NOT_FOUND'
        });
      }

      delete updateData.ACCT_NO;
      delete updateData._id;
      delete updateData.CUST_ID;

      updateData.lastUpdated = new Date();

      const updatedLoanAccount = await LoanAccount.findOneAndUpdate(
        { ACCT_NO },
        { $set: updateData },
        { new: true, runValidators: true }
      );

      return res.json({
        success: true,
        message: 'Loan account updated successfully',
        data: updatedLoanAccount
      });
    } catch (error) {
      console.error('Update loan account error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to update loan account',
        error: error.message
      });
    }
  },

  async deleteLoanAccount(req, res) {
    try {
      const { ACCT_NO } = req.params;

      const loanAccount = await LoanAccount.findOne({ ACCT_NO });
      if (!loanAccount) {
        return res.status(404).json({
          success: false,
          message: 'Loan account not found',
          code: 'LOAN_ACCOUNT_NOT_FOUND'
        });
      }

      if (!['PENDING', 'REJECTED'].includes(loanAccount.LOAN_STATUS)) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete loan account with status: ' + loanAccount.LOAN_STATUS,
          code: 'INVALID_DELETION_STATUS'
        });
      }

      await LoanAccount.findOneAndDelete({ ACCT_NO });

      return res.json({
        success: true,
        message: 'Loan account deleted successfully'
      });
    } catch (error) {
      console.error('Delete loan account error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete loan account',
        error: error.message
      });
    }
  },

  async searchLoans(req, res) {
    try {
      const { accountNumber, customerName, customerId, phone, page = 1, limit = 20 } = req.query;

      let query = {};

      if (accountNumber) {
        query.ACCT_NO = { $regex: accountNumber, $options: 'i' };
      }

      if (customerId) {
        query.CUST_ID = customerId;
      }

      if (customerName) {
        query.ACCT_NM = { $regex: customerName, $options: 'i' };
      }

      if (phone) {
        const customers = await Customer.find({
          $or: [
            { MOBILE: { $regex: phone, $options: 'i' } },
            { PHONE: { $regex: phone, $options: 'i' } }
          ]
        }).select('CUST_ID');

        const customerIds = customers.map(c => c.CUST_ID);
        if (customerIds.length > 0) {
          query.CUST_ID = { $in: customerIds };
        } else {
          return res.json({
            success: true,
            data: [],
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: 0,
              pages: 0
            }
          });
        }
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const loans = await LoanAccount.find(query)
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ applicationDate: -1 });

      const total = await LoanAccount.countDocuments(query);

      return res.json({
        success: true,
        data: loans,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Search loans error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to search loans',
        error: error.message
      });
    }
  },

  async getRepaymentSchedule(req, res) {
    try {
      const { ACCT_NO } = req.params;

      const repaymentSchedule = await RepaymentSchedule.findOne({ ACCT_NO });
      if (!repaymentSchedule) {
        return res.status(404).json({
          success: false,
          message: 'Repayment schedule not found for this loan account',
          code: 'REPAYMENT_SCHEDULE_NOT_FOUND'
        });
      }

      return res.json({
        success: true,
        data: repaymentSchedule
      });
    } catch (error) {
      console.error('Get repayment schedule error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch repayment schedule',
        error: error.message
      });
    }
  },

  async getLoanTransactions(req, res) {
    try {
      const { ACCT_NO } = req.params;
      const { page = 1, limit = 50 } = req.query;

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const transactions = await Transaction.find({ ACCT_NO })
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ VALUE_DATE: -1 });

      const total = await Transaction.countDocuments({ ACCT_NO });

      return res.json({
        success: true,
        data: transactions,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Get loan transactions error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch loan transactions',
        error: error.message
      });
    }
  },

  async recordRepayment(req, res) {
    try {
      const { ACCT_NO } = req.params;
      const repaymentData = req.body;

      const loanAccount = await LoanAccount.findOne({ ACCT_NO });
      if (!loanAccount) {
        return res.status(404).json({
          success: false,
          message: 'Loan account not found',
          code: 'LOAN_ACCOUNT_NOT_FOUND'
        });
      }

      const loanRepayment = new LoanRepayment({
        ACCT_NO,
        LOAN_ACCOUNT_ID: loanAccount._id,
        amount: mongoose.Types.Decimal128.fromString(repaymentData.amount.toString()),
        date: new Date(repaymentData.date || Date.now()),
        CUST_ID: loanAccount.CUST_ID,
        interestPaid: mongoose.Types.Decimal128.fromString(repaymentData.interestPaid?.toString() || '0'),
        principalPaid: mongoose.Types.Decimal128.fromString(repaymentData.principalPaid?.toString() || '0'),
        processedBy: req.user?.id || 'system'
      });

      await loanRepayment.save();

      return res.status(201).json({
        success: true,
        message: 'Repayment recorded successfully',
        data: loanRepayment
      });
    } catch (error) {
      console.error('Record repayment error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to record repayment',
        error: error.message
      });
    }
  },

  // =========================
  // LOAN INFORMATION METHODS
  // =========================

async getLoanAccountByAcctNo(req, res) {
  try {
    // More robust way to get ACCT_NO from params
    const ACCT_NO = req.params.ACCT_NO || req.params.acctNo || req.query.ACCT_NO;
    
    console.log('🔍 Received request for account:', ACCT_NO);
    console.log('Full req.params:', req.params);
    console.log('Full req.query:', req.query);

    if (!ACCT_NO) {
      return res.status(400).json({ 
        success: false,
        message: 'Account number is required',
        receivedParams: req.params,
        receivedQuery: req.query
      });
    }

    // Safe conversion to string
    const accountNumber = String(ACCT_NO).trim();
    console.log('🔍 Searching for account number:', accountNumber);

    // Search in LoanAccount model
    const loanAccount = await LoanAccount.findOne({ 
      ACCT_NO: accountNumber 
    });
    
    console.log('Query result:', loanAccount);

    if (!loanAccount) {
      return res.status(404).json({ 
        success: false,
        message: `Loan account not found: ${accountNumber}`,
        accountNumber: accountNumber
      });
    }

    // Safe conversion to plain object
    let loanAccountData;
    if (typeof loanAccount.toObject === 'function') {
      loanAccountData = loanAccount.toObject();
    } else if (typeof loanAccount.get === 'function') {
      // For Sequelize
      loanAccountData = loanAccount.get({ plain: true });
    } else {
      loanAccountData = { ...loanAccount };
    }

    const loanAccountWithWorkItem = {
      ...loanAccountData,
      workItemId: 129
    };

    res.status(200).json({
      success: true,
      message: 'Loan account retrieved successfully',
      loanAccount: loanAccountWithWorkItem
    });

  } catch (error) {
    console.error('❌ Error fetching loan account:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching loan account', 
      error: error.message,
      // Remove stack trace in production
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
},


  async getLoanAccountsByCustomerId(req, res) {
    const { custId } = req.params;

    if (!custId) {
      return res.status(400).json({ message: 'Customer ID (custId) is required' });
    }

    try {
      const loanAccounts = await LoanAccount.find({ CUST_ID: custId }).lean();

      if (!loanAccounts || loanAccounts.length === 0) {
        return res.status(404).json({ message: 'No loan accounts found for this customer' });
      }

      const loanAccountsWithWorkItem = loanAccounts.map(loanAccount => ({
        ...loanAccount,
        workItemId: 129
      }));

      res.status(200).json({
        message: 'Loan accounts retrieved successfully',
        count: loanAccounts.length,
        loanAccounts: loanAccountsWithWorkItem
      });
    } catch (error) {
      console.error('Error fetching loan accounts by customer ID:', error);
      res.status(500).json({ message: 'Internal server error', error: error.message });
    }
  },

  async getLoanInterestDetails(req, res) {
    try {
      const { ACCT_NO } = req.params;
      
      const [account, repayments] = await Promise.all([
        LoanAccount.findOne({ ACCT_NO })
          .select('INTEREST_RATE accruedInterest lastAccrualAmount'),
        RepaymentSchedule.find({ ACCT_NO })
          .select('dueDate interestDue status')
          .sort({ dueDate: 1 })
      ]);
      
      if (!account) {
        return res.status(404).json({ message: 'Loan account not found' });
      }
      
      res.status(200).json({
        success: true,
        data: {
          interestRate: account.INTEREST_RATE,
          accruedInterest: account.accruedInterest,
          lastAccrualAmount: account.lastAccrualAmount,
          repaymentSchedule: repayments.map(p => ({
            dueDate: p.dueDate,
            interestDue: p.interestDue,
            status: p.status
          })),
          totalInterest: repayments.reduce((sum, p) => sum + p.interestDue, 0),
          interestPaid: repayments
            .filter(p => p.status === 'PAID')
            .reduce((sum, p) => sum + p.interestDue, 0)
        }
      });
      
    } catch (error) {
      console.error('Error fetching interest details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch interest details',
        error: error.message
      });
    }
  },

  async getLoanBalanceForCustomer(req, res) {
    try {
      const { CUST_ID } = req.params;
      
      if (!CUST_ID) {
        return res.status(400).json({
          success: false,
          message: 'Customer ID (CUST_ID) is required',
          code: 'MISSING_CUST_ID'
        });
      }

      console.log('🔍 Fetching loan balances for customer:', CUST_ID);

      const loanAccounts = await LoanAccount.find({
        CUST_ID: CUST_ID,
        LOAN_STATUS: { 
          $in: ['ACTIVE', 'APPROVED', 'PENDING', 'DISBURSED'] 
        }
      })
      .select('ACCT_NO ACCT_NM LOAN_STATUS DISBURSED_AMOUNT OUTSTANDING_PRINCIPAL CURRENT_BALANCE INTEREST_RATE START_DT MATURITY_DT PRODUCT_TYPE PROD_ID')
      .sort({ START_DT: -1 });

      if (!loanAccounts || loanAccounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No active loan accounts found for this customer',
          code: 'NO_LOAN_ACCOUNTS',
          data: {
            totalActiveLoans: 0,
            totalOutstandingBalance: 0,
            totalDisbursedAmount: 0,
            loans: []
          }
        });
      }

      const totalActiveLoans = loanAccounts.length;
      const totalOutstandingBalance = loanAccounts.reduce((sum, loan) => {
        return sum + parseFloat(loan.OUTSTANDING_PRINCIPAL?.toString() || loan.CURRENT_BALANCE?.toString() || '0');
      }, 0);
      
      const totalDisbursedAmount = loanAccounts.reduce((sum, loan) => {
        return sum + parseFloat(loan.DISBURSED_AMOUNT?.toString() || '0');
      }, 0);

      const formattedLoans = loanAccounts.map(loan => ({
        loanAccountNumber: loan.ACCT_NO,
        accountName: loan.ACCT_NM,
        loanStatus: loan.LOAN_STATUS,
        productType: loan.PRODUCT_TYPE,
        productId: loan.PROD_ID,
        disbursedAmount: parseFloat(loan.DISBURSED_AMOUNT?.toString() || '0'),
        outstandingPrincipal: parseFloat(loan.OUTSTANDING_PRINCIPAL?.toString() || loan.CURRENT_BALANCE?.toString() || '0'),
        currentBalance: parseFloat(loan.CURRENT_BALANCE?.toString() || '0'),
        interestRate: parseFloat(loan.INTEREST_RATE?.toString() || '0'),
        startDate: loan.START_DT,
        maturityDate: loan.MATURITY_DT,
        isActive: ['ACTIVE', 'DISBURSED'].includes(loan.LOAN_STATUS),
        isPending: loan.LOAN_STATUS === 'PENDING',
        isApproved: loan.LOAN_STATUS === 'APPROVED'
      }));

      const activeLoanNumbers = formattedLoans
        .filter(loan => loan.isActive)
        .map(loan => loan.loanAccountNumber);

      let repaymentSchedules = [];
      if (activeLoanNumbers.length > 0) {
        repaymentSchedules = await RepaymentSchedule.find({
          ACCT_NO: { $in: activeLoanNumbers },
          STATUS: 'ACTIVE'
        })
        .select('ACCT_NO installments TOTAL_REPAYMENT EMI_AMOUNT')
        .lean();
      }

      const loansWithRepaymentInfo = formattedLoans.map(loan => {
        const schedule = repaymentSchedules.find(s => s.ACCT_NO === loan.loanAccountNumber);
        let nextPayment = null;
        let totalRepayment = 0;
        let emiAmount = 0;

        if (schedule && schedule.installments && schedule.installments.length > 0) {
          const nextInstallment = schedule.installments.find(inst => 
            inst.status === 'PENDING' || !inst.status
          ) || schedule.installments[0];

          nextPayment = {
            dueDate: nextInstallment.dueDate,
            amount: parseFloat(nextInstallment.totalPayment?.toString() || '0'),
            installmentNumber: nextInstallment.installmentNumber
          };

          totalRepayment = parseFloat(schedule.TOTAL_REPAYMENT?.toString() || '0');
          emiAmount = parseFloat(schedule.EMI_AMOUNT?.toString() || '0');
        }

        return {
          ...loan,
          nextPayment,
          totalRepayment,
          emiAmount,
          remainingBalance: loan.outstandingPrincipal
        };
      });

      const response = {
        success: true,
        data: {
          customerId: CUST_ID,
          summary: {
            totalActiveLoans,
            totalOutstandingBalance: parseFloat(totalOutstandingBalance.toFixed(2)),
            totalDisbursedAmount: parseFloat(totalDisbursedAmount.toFixed(2)),
            totalPendingLoans: formattedLoans.filter(loan => loan.isPending).length,
            totalApprovedLoans: formattedLoans.filter(loan => loan.isApproved).length
          },
          loans: loansWithRepaymentInfo
        }
      };

      console.log(`✅ Found ${totalActiveLoans} loan accounts for customer ${CUST_ID}`);
      
      return res.status(200).json(response);

    } catch (error) {
      console.error('❌ Error fetching loan balances:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch loan balances',
        code: 'FETCH_LOAN_BALANCE_ERROR',
        error: error.message
      });
    }
  },

  async getLoanDetailsForCustomer(req, res) {
    try {
      const { CUST_ID } = req.params;
      
      if (!CUST_ID) {
        return res.status(400).json({
          success: false,
          message: 'Customer ID (CUST_ID) is required',
          code: 'MISSING_CUST_ID'
        });
      }

      console.log('🔍 Fetching detailed loan information for customer:', CUST_ID);

      const loanAccounts = await LoanAccount.find({
        CUST_ID: CUST_ID
      })
      .populate('GUARANTOR_ID', 'fullName phoneNumber relationshipToBorrower GUARANTOR_ID email address status')
      .select('-__v')
      .sort({ START_DT: -1 });

      if (!loanAccounts || loanAccounts.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'No loan accounts found for this customer',
          code: 'NO_LOAN_ACCOUNTS',
          data: []
        });
      }

      const formattedLoans = loanAccounts.map(loan => {
        const loanData = {
          loanAccountId: loan._id,
          loanAccountNumber: loan.ACCT_NO,
          accountName: loan.ACCT_NM,
          loanStatus: loan.LOAN_STATUS,
          productType: loan.PRODUCT_TYPE,
          productId: loan.PROD_ID,
          currency: loan.CRNCY_ID || 'NGN',
          businessUnit: loan.BU_ID,
          
          disbursementLimit: parseFloat(loan.DISBURSEMENT_LIMIT?.toString() || '0'),
          disbursedAmount: parseFloat(loan.DISBURSED_AMOUNT?.toString() || '0'),
          actualDisbursement: parseFloat(loan.ACTUAL_DISBURSEMENT?.toString() || '0'),
          outstandingPrincipal: parseFloat(loan.OUTSTANDING_PRINCIPAL?.toString() || '0'),
          currentBalance: parseFloat(loan.CURRENT_BALANCE?.toString() || '0'),
          
          interestRate: parseFloat(loan.INTEREST_RATE?.toString() || '0'),
          totalInterest: parseFloat(loan.TOTAL_INTEREST?.toString() || '0'),
          totalRepayment: parseFloat(loan.TOTAL_REPAYMENT?.toString() || '0'),
          
          startDate: loan.START_DT,
          maturityDate: loan.MATURITY_DT,
          applicationDate: loan.applicationDate,
          disbursementDate: loan.disbursementDate,
          lastUpdated: loan.lastUpdated,
          
          repaymentSourceAccount: loan.REPAYMENT_SOURCE_ACCOUNT,
          paymentFrequency: loan.PAYMENT_FREQUENCY,
          
          hasGuarantor: loan.HAS_GUARANTOR,
          guaranteedAmount: parseFloat(loan.GUARANTEED_AMOUNT?.toString() || '0'),
          guarantor: loan.GUARANTOR_ID ? {
            guarantorId: loan.GUARANTOR_ID._id,
            guarantorNumber: loan.GUARANTOR_ID.GUARANTOR_ID,
            fullName: loan.GUARANTOR_ID.fullName,
            phoneNumber: loan.GUARANTOR_ID.phoneNumber,
            relationship: loan.GUARANTOR_ID.relationshipToBorrower,
            email: loan.GUARANTOR_ID.email,
            address: loan.GUARANTOR_ID.address,
            status: loan.GUARANTOR_ID.status
          } : null,
          
          createdBy: loan.CREATED_BY,
          primaryOfficer: loan.PRIMARY_OFFICER_ID,
          secondaryOfficer: loan.SECONDARY_OFFICER_ID,
          
          isActive: ['ACTIVE', 'DISBURSED'].includes(loan.LOAN_STATUS),
          isPending: loan.LOAN_STATUS === 'PENDING',
          isApproved: loan.LOAN_STATUS === 'APPROVED',
          isClosed: ['CLOSED', 'PAID', 'SETTLED'].includes(loan.LOAN_STATUS),
          isRejected: loan.LOAN_STATUS === 'REJECTED'
        };

        return loanData;
      });

      const activeLoans = formattedLoans.filter(loan => loan.isActive);
      const totalActiveLoans = activeLoans.length;
      const totalOutstandingBalance = activeLoans.reduce((sum, loan) => sum + loan.outstandingPrincipal, 0);
      const totalDisbursedAmount = formattedLoans.reduce((sum, loan) => sum + loan.disbursedAmount, 0);

      const response = {
        success: true,
        data: {
          customerId: CUST_ID,
          summary: {
            totalLoans: formattedLoans.length,
            totalActiveLoans,
            totalOutstandingBalance: parseFloat(totalOutstandingBalance.toFixed(2)),
            totalDisbursedAmount: parseFloat(totalDisbursedAmount.toFixed(2)),
            totalPendingLoans: formattedLoans.filter(loan => loan.isPending).length,
            totalApprovedLoans: formattedLoans.filter(loan => loan.isApproved).length,
            totalClosedLoans: formattedLoans.filter(loan => loan.isClosed).length,
            totalRejectedLoans: formattedLoans.filter(loan => loan.isRejected).length
          },
          loans: formattedLoans
        }
      };

      console.log(`✅ Found ${formattedLoans.length} loan accounts for customer ${CUST_ID}`);
      
      return res.status(200).json(response);

    } catch (error) {
      console.error('❌ Error fetching detailed loan information:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch detailed loan information',
        code: 'FETCH_LOAN_DETAILS_ERROR',
        error: error.message
      });
    }
  },

  // =========================
  // REPORT METHODS
  // =========================

  async getLoanSummaryReport(req, res) {
    try {
      const { branch, product, status, startDate, endDate } = req.query;
      
      let query = {};
      
      if (branch) query.BU_ID = branch;
      if (product) query.PROD_ID = product;
      if (status) query.LOAN_STATUS = status;
      if (startDate || endDate) {
        query.applicationDate = {};
        if (startDate) query.applicationDate.$gte = new Date(startDate);
        if (endDate) query.applicationDate.$lte = new Date(endDate);
      }

      const totalLoans = await LoanAccount.countDocuments(query);
      
      const activeLoans = await LoanAccount.countDocuments({
        ...query,
        LOAN_STATUS: 'ACTIVE'
      });

      const pendingLoans = await LoanAccount.countDocuments({
        ...query,
        LOAN_STATUS: 'PENDING'
      });

      const approvedLoans = await LoanAccount.countDocuments({
        ...query,
        LOAN_STATUS: 'APPROVED'
      });

      const closedLoans = await LoanAccount.countDocuments({
        ...query,
        LOAN_STATUS: { $in: ['CLOSED', 'PAID', 'SETTLED'] }
      });

      const balanceStats = await LoanAccount.aggregate([
        { $match: query },
        {
          $group: {
            _id: null,
            totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } },
            totalOutstanding: { $sum: { $toDouble: "$OUTSTANDING_PRINCIPAL" } },
            totalCurrentBalance: { $sum: { $toDouble: "$CURRENT_BALANCE" } },
            totalLimit: { $sum: { $toDouble: "$DISBURSEMENT_LIMIT" } },
            avgLoanSize: { $avg: { $toDouble: "$DISBURSEMENT_LIMIT" } },
            maxLoanSize: { $max: { $toDouble: "$DISBURSEMENT_LIMIT" } },
            totalLoans: { $sum: 1 }
          }
        }
      ]);

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentLoans = await LoanAccount.countDocuments({
        ...query,
        applicationDate: { $gte: thirtyDaysAgo }
      });

      const balanceData = balanceStats[0] || {
        totalDisbursed: 0,
        totalOutstanding: 0,
        totalCurrentBalance: 0,
        totalLimit: 0,
        avgLoanSize: 0,
        maxLoanSize: 0,
        totalLoans: 0
      };

      const portfolioHealth = balanceData.totalDisbursed > 0 ? 
        Math.round(((balanceData.totalDisbursed - balanceData.totalOutstanding) / balanceData.totalDisbursed) * 100) : 0;

      return res.json({
        success: true,
        reportType: 'summary',
        generatedAt: new Date(),
        filters: { branch, product, status, startDate, endDate },
        data: {
          overview: {
            totalLoans: totalLoans,
            activeLoans,
            pendingLoans,
            approvedLoans,
            closedLoans,
            recentLoansLast30Days: recentLoans
          },
          financialSummary: {
            totalDisbursementLimit: Math.round(balanceData.totalLimit * 100) / 100,
            totalDisbursed: Math.round(balanceData.totalDisbursed * 100) / 100,
            totalOutstanding: Math.round(balanceData.totalOutstanding * 100) / 100,
            totalCurrentBalance: Math.round(balanceData.totalCurrentBalance * 100) / 100,
            averageLoanSize: Math.round(balanceData.avgLoanSize * 100) / 100,
            maximumLoanSize: Math.round(balanceData.maxLoanSize * 100) / 100,
            portfolioHealth: portfolioHealth
          },
          percentages: {
            activePercentage: totalLoans > 0 ? Math.round((activeLoans / totalLoans) * 100) : 0,
            pendingPercentage: totalLoans > 0 ? Math.round((pendingLoans / totalLoans) * 100) : 0,
            approvedPercentage: totalLoans > 0 ? Math.round((approvedLoans / totalLoans) * 100) : 0,
            closedPercentage: totalLoans > 0 ? Math.round((closedLoans / totalLoans) * 100) : 0
          }
        }
      });
    } catch (error) {
      console.error('Loan summary report error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate loan summary report',
        error: error.message
      });
    }
  },

  async getDetailedLoanReport(req, res) {
    try {
      const { branch, product, status, startDate, endDate, page = 1, limit = 50 } = req.query;
      
      let query = {};
      
      if (branch) query.BU_ID = branch;
      if (product) query.PROD_ID = product;
      if (status) query.LOAN_STATUS = status;
      if (startDate || endDate) {
        query.applicationDate = {};
        if (startDate) query.applicationDate.$gte = new Date(startDate);
        if (endDate) query.applicationDate.$lte = new Date(endDate);
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);

      const loans = await LoanAccount.find(query)
        .select('ACCT_NO ACCT_NM CUST_ID LOAN_STATUS DISBURSED_AMOUNT OUTSTANDING_PRINCIPAL CURRENT_BALANCE INTEREST_RATE START_DT MATURITY_DT PRODUCT_TYPE PROD_ID branch BU_ID CREATED_BY disbursementDate')
        .sort({ START_DT: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const totalCount = await LoanAccount.countDocuments(query);

      const transformedLoans = loans.map(loan => ({
        id: loan._id,
        accountNumber: loan.ACCT_NO,
        customerId: loan.CUST_ID,
        accountName: loan.ACCT_NM,
        status: loan.LOAN_STATUS,
        financials: {
          disbursedAmount: loan.DISBURSED_AMOUNT ? parseFloat(loan.DISBURSED_AMOUNT.toString()) : 0,
          outstandingPrincipal: loan.OUTSTANDING_PRINCIPAL ? parseFloat(loan.OUTSTANDING_PRINCIPAL.toString()) : 0,
          currentBalance: loan.CURRENT_BALANCE ? parseFloat(loan.CURRENT_BALANCE.toString()) : 0,
          interestRate: loan.INTEREST_RATE ? parseFloat(loan.INTEREST_RATE.toString()) : 0
        },
        branch: loan.branch || loan.BU_ID,
        product: loan.PROD_ID,
        productType: loan.PRODUCT_TYPE,
        dates: {
          startDate: loan.START_DT,
          maturityDate: loan.MATURITY_DT,
          disbursementDate: loan.disbursementDate
        },
        createdBy: loan.CREATED_BY
      }));

      return res.json({
        success: true,
        reportType: 'detailed',
        generatedAt: new Date(),
        filters: { branch, product, status, startDate, endDate },
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalItems: totalCount,
          itemsPerPage: parseInt(limit)
        },
        data: transformedLoans
      });
    } catch (error) {
      console.error('Detailed loan report error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate detailed loan report',
        error: error.message
      });
    }
  },

  async getBranchWiseLoanReport(req, res) {
    try {
      const { startDate, endDate } = req.query;
      
      let query = {};
      if (startDate || endDate) {
        query.applicationDate = {};
        if (startDate) query.applicationDate.$gte = new Date(startDate);
        if (endDate) query.applicationDate.$lte = new Date(endDate);
      }

      const branchStats = await LoanAccount.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              $ifNull: ["$branch", "$BU_ID"]
            },
            totalLoans: { $sum: 1 },
            activeLoans: {
              $sum: { $cond: [{ $eq: ["$LOAN_STATUS", "ACTIVE"] }, 1, 0] }
            },
            totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } },
            totalOutstanding: { $sum: { $toDouble: "$OUTSTANDING_PRINCIPAL" } },
            averageLoanSize: { $avg: { $toDouble: "$DISBURSED_AMOUNT" } }
          }
        },
        { $sort: { totalDisbursed: -1 } }
      ]);

      const transformedStats = branchStats.map(branch => ({
        branchId: branch._id,
        totalLoans: branch.totalLoans,
        activeLoans: branch.activeLoans,
        inactiveLoans: branch.totalLoans - branch.activeLoans,
        totalDisbursed: Math.round(branch.totalDisbursed * 100) / 100,
        totalOutstanding: Math.round(branch.totalOutstanding * 100) / 100,
        averageLoanSize: Math.round(branch.averageLoanSize * 100) / 100
      }));

      return res.json({
        success: true,
        reportType: 'branch-wise',
        generatedAt: new Date(),
        filters: { startDate, endDate },
        data: transformedStats
      });
    } catch (error) {
      console.error('Branch-wise loan report error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate branch-wise loan report',
        error: error.message
      });
    }
  },

  async getProductWiseLoanReport(req, res) {
    try {
      const { startDate, endDate } = req.query;
      
      let query = {};
      if (startDate || endDate) {
        query.applicationDate = {};
        if (startDate) query.applicationDate.$gte = new Date(startDate);
        if (endDate) query.applicationDate.$lte = new Date(endDate);
      }

      const productStats = await LoanAccount.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              $ifNull: ["$PROD_ID", "$PRODUCT_TYPE"]
            },
            totalLoans: { $sum: 1 },
            activeLoans: {
              $sum: { $cond: [{ $eq: ["$LOAN_STATUS", "ACTIVE"] }, 1, 0] }
            },
            totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } },
            totalOutstanding: { $sum: { $toDouble: "$OUTSTANDING_PRINCIPAL" } },
            averageLoanSize: { $avg: { $toDouble: "$DISBURSED_AMOUNT" } },
            averageInterestRate: { $avg: { $toDouble: "$INTEREST_RATE" } }
          }
        },
        { $sort: { totalDisbursed: -1 } }
      ]);

      const transformedStats = productStats.map(product => ({
        productCode: product._id,
        totalLoans: product.totalLoans,
        activeLoans: product.activeLoans,
        totalDisbursed: Math.round(product.totalDisbursed * 100) / 100,
        totalOutstanding: Math.round(product.totalOutstanding * 100) / 100,
        averageLoanSize: Math.round(product.averageLoanSize * 100) / 100,
        averageInterestRate: Math.round(product.averageInterestRate * 100) / 100
      }));

      return res.json({
        success: true,
        reportType: 'product-wise',
        generatedAt: new Date(),
        filters: { startDate, endDate },
        data: transformedStats
      });
    } catch (error) {
      console.error('Product-wise loan report error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate product-wise loan report',
        error: error.message
      });
    }
  },

  async getStatusWiseLoanReport(req, res) {
    try {
      const { startDate, endDate } = req.query;
      
      let query = {};
      if (startDate || endDate) {
        query.applicationDate = {};
        if (startDate) query.applicationDate.$gte = new Date(startDate);
        if (endDate) query.applicationDate.$lte = new Date(endDate);
      }

      const statusStats = await LoanAccount.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$LOAN_STATUS",
            totalLoans: { $sum: 1 },
            totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } },
            totalOutstanding: { $sum: { $toDouble: "$OUTSTANDING_PRINCIPAL" } },
            averageLoanSize: { $avg: { $toDouble: "$DISBURSED_AMOUNT" } }
          }
        },
        { $sort: { totalLoans: -1 } }
      ]);

      const transformedStats = statusStats.map(status => ({
        status: status._id || 'Unknown',
        totalLoans: status.totalLoans,
        totalDisbursed: Math.round(status.totalDisbursed * 100) / 100,
        totalOutstanding: Math.round(status.totalOutstanding * 100) / 100,
        averageLoanSize: Math.round(status.averageLoanSize * 100) / 100
      }));

      return res.json({
        success: true,
        reportType: 'status-wise',
        generatedAt: new Date(),
        filters: { startDate, endDate },
        data: transformedStats
      });
    } catch (error) {
      console.error('Status-wise loan report error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate status-wise loan report',
        error: error.message
      });
    }
  },

  async getLoanBalanceAnalysisReport(req, res) {
    try {
      const { branch, product } = req.query;
      
      let query = {};
      if (branch) query.BU_ID = branch;
      if (product) query.PROD_ID = product;

      const balanceRanges = [
        { range: '0-50,000', min: 0, max: 50000 },
        { range: '50,001-100,000', min: 50001, max: 100000 },
        { range: '100,001-500,000', min: 100001, max: 500000 },
        { range: '500,001-1,000,000', min: 500001, max: 1000000 },
        { range: '1,000,001-5,000,000', min: 1000001, max: 5000000 },
        { range: '5,000,001+', min: 5000001, max: Number.MAX_SAFE_INTEGER }
      ];

      const balanceAnalysis = [];

      for (const range of balanceRanges) {
        const count = await LoanAccount.countDocuments({
          ...query,
          DISBURSED_AMOUNT: {
            $gte: range.min,
            $lte: range.max
          }
        });

        balanceAnalysis.push({
          range: range.range,
          loanCount: count,
          percentage: 0
        });
      }

      const totalLoans = balanceAnalysis.reduce((sum, item) => sum + item.loanCount, 0);
      balanceAnalysis.forEach(item => {
        item.percentage = totalLoans > 0 ? Math.round((item.loanCount / totalLoans) * 100) : 0;
      });

      const topLoans = await LoanAccount.find(query)
        .select('ACCT_NO ACCT_NM DISBURSED_AMOUNT OUTSTANDING_PRINCIPAL LOAN_STATUS')
        .sort({ DISBURSED_AMOUNT: -1 })
        .limit(10)
        .lean();

      const transformedTopLoans = topLoans.map(loan => ({
        accountNumber: loan.ACCT_NO,
        accountName: loan.ACCT_NM,
        disbursedAmount: loan.DISBURSED_AMOUNT ? parseFloat(loan.DISBURSED_AMOUNT.toString()) : 0,
        outstandingPrincipal: loan.OUTSTANDING_PRINCIPAL ? parseFloat(loan.OUTSTANDING_PRINCIPAL.toString()) : 0,
        status: loan.LOAN_STATUS
      }));

      return res.json({
        success: true,
        reportType: 'balance-analysis',
        generatedAt: new Date(),
        filters: { branch, product },
        data: {
          balanceDistribution: balanceAnalysis,
          topLoansByAmount: transformedTopLoans,
          summary: {
            totalLoansAnalyzed: totalLoans,
            ranges: balanceRanges.length
          }
        }
      });
    } catch (error) {
      console.error('Loan balance analysis report error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate loan balance analysis report',
        error: error.message
      });
    }
  },

  async getDisbursementAnalysisReport(req, res) {
    try {
      const { branch, product, months = 12 } = req.query;
      
      let query = { DISBURSED_AMOUNT: { $gt: 0 } };
      if (branch) query.BU_ID = branch;
      if (product) query.PROD_ID = product;

      const monthlyDisbursements = await LoanAccount.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              year: { $year: "$disbursementDate" },
              month: { $month: "$disbursementDate" }
            },
            totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } },
            loanCount: { $sum: 1 },
            averageDisbursement: { $avg: { $toDouble: "$DISBURSED_AMOUNT" } }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
        { $limit: parseInt(months) }
      ]);

      const transformedDisbursements = monthlyDisbursements.map(month => ({
        period: `${month._id.year}-${String(month._id.month).padStart(2, '0')}`,
        totalDisbursed: Math.round(month.totalDisbursed * 100) / 100,
        loanCount: month.loanCount,
        averageDisbursement: Math.round(month.averageDisbursement * 100) / 100
      }));

      const productDisbursements = await LoanAccount.aggregate([
        { $match: query },
        {
          $group: {
            _id: "$PROD_ID",
            totalDisbursed: { $sum: { $toDouble: "$DISBURSED_AMOUNT" } },
            loanCount: { $sum: 1 }
          }
        },
        { $sort: { totalDisbursed: -1 } }
      ]);

      return res.json({
        success: true,
        reportType: 'disbursement-analysis',
        generatedAt: new Date(),
        filters: { branch, product, months },
        data: {
          monthlyTrend: transformedDisbursements,
          productBreakdown: productDisbursements.map(product => ({
            productCode: product._id,
            totalDisbursed: Math.round(product.totalDisbursed * 100) / 100,
            loanCount: product.loanCount
          }))
        }
      });
    } catch (error) {
      console.error('Disbursement analysis report error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate disbursement analysis report',
        error: error.message
      });
    }
  },

  async getRepaymentAnalysisReport(req, res) {
    try {
      const { branch, product, months = 6 } = req.query;
      
      let query = {};
      if (branch) query['loanAccount.BU_ID'] = branch;
      if (product) query['loanAccount.PROD_ID'] = product;

      const repaymentStats = await LoanRepayment.aggregate([
        {
          $lookup: {
            from: "loanaccounts",
            localField: "LOAN_ACCOUNT_ID",
            foreignField: "_id",
            as: "loanAccount"
          }
        },
        { $unwind: "$loanAccount" },
        { $match: query },
        {
          $group: {
            _id: null,
            totalRepayments: { $sum: { $toDouble: "$amount" } },
            totalInterestPaid: { $sum: { $toDouble: "$interestPaid" } },
            totalPrincipalPaid: { $sum: { $toDouble: "$principalPaid" } },
            repaymentCount: { $sum: 1 },
            uniqueLoans: { $addToSet: "$LOAN_ACCOUNT_ID" }
          }
        }
      ]);

      const stats = repaymentStats[0] || {
        totalRepayments: 0,
        totalInterestPaid: 0,
        totalPrincipalPaid: 0,
        repaymentCount: 0,
        uniqueLoans: []
      };

      const monthlyRepayments = await LoanRepayment.aggregate([
        {
          $lookup: {
            from: "loanaccounts",
            localField: "LOAN_ACCOUNT_ID",
            foreignField: "_id",
            as: "loanAccount"
          }
        },
        { $unwind: "$loanAccount" },
        { $match: query },
        {
          $group: {
            _id: {
              year: { $year: "$date" },
              month: { $month: "$date" }
            },
            totalRepaid: { $sum: { $toDouble: "$amount" } },
            repaymentCount: { $sum: 1 }
          }
        },
        { $sort: { "_id.year": 1, "_id.month": 1 } },
        { $limit: parseInt(months) }
      ]);

      const transformedRepayments = monthlyRepayments.map(month => ({
        period: `${month._id.year}-${String(month._id.month).padStart(2, '0')}`,
        totalRepaid: Math.round(month.totalRepaid * 100) / 100,
        repaymentCount: month.repaymentCount
      }));

      return res.json({
        success: true,
        reportType: 'repayment-analysis',
        generatedAt: new Date(),
        filters: { branch, product, months },
        data: {
          summary: {
            totalRepayments: Math.round(stats.totalRepayments * 100) / 100,
            totalInterestPaid: Math.round(stats.totalInterestPaid * 100) / 100,
            totalPrincipalPaid: Math.round(stats.totalPrincipalPaid * 100) / 100,
            repaymentCount: stats.repaymentCount,
            uniqueLoansWithRepayments: stats.uniqueLoans.length
          },
          monthlyTrend: transformedRepayments,
          composition: {
            interestPercentage: stats.totalRepayments > 0 ? 
              Math.round((stats.totalInterestPaid / stats.totalRepayments) * 100) : 0,
            principalPercentage: stats.totalRepayments > 0 ? 
              Math.round((stats.totalPrincipalPaid / stats.totalRepayments) * 100) : 0
          }
        }
      });
    } catch (error) {
      console.error('Repayment analysis report error:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to generate repayment analysis report',
        error: error.message
      });
    }
  },

  // =========================
  // DASHBOARD & ANALYTICS METHODS
  // =========================

  async getDashboardOverview(req, res) {
    try {
      const { branch, period = 'month' } = req.query;
      
      return res.json({
        success: true,
        data: {
          totalLoans: 0,
          activeLoans: 0,
          totalDisbursed: 0,
          totalOutstanding: 0,
          pendingApprovals: 0,
          recentActivity: []
        },
        message: 'Dashboard overview data will be implemented soon'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard overview',
        error: error.message
      });
    }
  },

  async getPortfolioPerformance(req, res) {
    try {
      const { branch, startDate, endDate } = req.query;
      
      return res.json({
        success: true,
        data: {
          performanceMetrics: {},
          trends: []
        },
        message: 'Portfolio performance data will be implemented soon'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch portfolio performance',
        error: error.message
      });
    }
  },

  async getRiskAnalysis(req, res) {
    try {
      const { branch } = req.query;
      
      return res.json({
        success: true,
        data: {
          riskMetrics: {},
          highRiskLoans: []
        },
        message: 'Risk analysis data will be implemented soon'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch risk analysis',
        error: error.message
      });
    }
  },

  async exportLoanSummary(req, res) {
    try {
      const { format = 'csv', branch, startDate, endDate } = req.query;
      
      return res.status(501).json({
        success: false,
        message: 'Export functionality will be implemented soon'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to export loan summary',
        error: error.message
      });
    }
  },

  async exportDetailedReport(req, res) {
    try {
      const { format = 'csv', branch, status } = req.query;
      
      return res.status(501).json({
        success: false,
        message: 'Export functionality will be implemented soon'
      });
    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to export detailed report',
        error: error.message
      });
    }
  },

  // =========================
  // HELPER METHODS
  // =========================

  generateJournalId() {
    return 'JRN-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  },

  generateUniqueTransactionId() {
    return 'TXN-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  },

  generateLedgerNo() {
    return 'LEDGER-' + Date.now() + '-' + Math.floor(Math.random() * 10000);
  },

  async generateRepaymentSchedule(amount, rate, term, termCode, accountNo, startDate, session) {
    const termMonths = termCode === 'M' ? term : term * 12;
    const monthlyRate = rate / 100 / 12;
    const emi = amount * monthlyRate * Math.pow(1 + monthlyRate, termMonths) / 
                (Math.pow(1 + monthlyRate, termMonths) - 1);

    let balance = amount;
    const installments = [];
    const start = new Date(startDate);

    for (let i = 0; i < termMonths; i++) {
      const interest = balance * monthlyRate;
      const principal = emi - interest;
      balance -= principal;

      const installment = {
        dueDate: new Date(start.setMonth(start.getMonth() + 1)),
        principal: parseFloat(principal.toFixed(2)),
        interest: parseFloat(interest.toFixed(2)),
        totalPayment: parseFloat(emi.toFixed(2)),
        remainingBalance: parseFloat(Math.max(0, balance).toFixed(2)),
        status: 'PENDING',
        installmentNo: i + 1
      };

      installments.push(installment);
    }

    return installments;
  }
};

export default LoanAccountController;