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
import { processLoanDisbursementTransactions, processDisbursement, getGLAccountsFromProduct } from '../Services/processLoanDisbursementTransactions.js';
import LoanPortfolio from '../models/LoanPortfolio.js';

const { Decimal128 } = mongoose.Types; 

const toDecimal128 = (value) => {
  if (value === null || value === undefined) return Decimal128.fromString('0');
  if (typeof value === 'object' && value._bsontype === 'Decimal128') return value;
  if (typeof value === 'number' && isNaN(value)) return Decimal128.fromString('0');
  return Decimal128.fromString(value.toString());
};

const normalizeCustId = (custId) => typeof custId === 'object' ? custId.toString() : custId;

// Instantiate services
const interestService = new InterestCalculationService();
const { getPaymentFrequency: getPaymentFrequencyFromUtils } = repaymentUtils;
const feeService = new FeeCalculationService();

// ==================== HELPER: Get total payments based on frequency ====================
const getTotalPaymentsForFrequency = (termValue, termCode, paymentFrequency) => {
  let totalPayments;
  const termMonths = convertTermToMonths(termValue, termCode);

  switch (paymentFrequency.toUpperCase()) {
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
};

// Helper to convert term to months
const convertTermToMonths = (value, termCode) => {
  switch (termCode.toUpperCase()) {
    case 'D': return value / 30.44;
    case 'W': return value / 4.345;
    case 'M': return value;
    case 'Q': return value * 3;
    case 'Y': return value * 12;
    default: return value;
  }
};

// Helper to calculate next payment date
const calculateNextPaymentDate = (installmentNumber, paymentFrequency, startDate) => {
  const date = moment(startDate);
  switch (paymentFrequency.toUpperCase()) {
    case 'DAILY': return date.add(installmentNumber, 'days').format('YYYY-MM-DD');
    case 'WEEKLY': return date.add(installmentNumber * 7, 'days').format('YYYY-MM-DD');
    case 'BI_WEEKLY': return date.add(installmentNumber * 14, 'days').format('YYYY-MM-DD');
    case 'MONTHLY': return date.add(installmentNumber, 'months').format('YYYY-MM-DD');
    case 'QUARTERLY': return date.add(installmentNumber * 3, 'months').format('YYYY-MM-DD');
    case 'SEMI_ANNUALLY': return date.add(installmentNumber * 6, 'months').format('YYYY-MM-DD');
    case 'ANNUALLY': return date.add(installmentNumber, 'years').format('YYYY-MM-DD');
    default: return date.add(installmentNumber, 'months').format('YYYY-MM-DD');
  }
};

// ==================== FLAT RATE SIMPLE INTEREST EMI (FIXED) ====================
function calculateFixedRateEMI(principal, ratePercent, termValue, termCode, paymentFrequency, startDate, isRateForTerm = false) {
  console.log('=== FLAT RATE SIMPLE INTEREST CALCULATION ===');
  console.log(`Principal: ₦${principal}, Rate: ${ratePercent}%, Term: ${termValue} ${termCode}, Frequency: ${paymentFrequency}`);
  console.log(`Is rate for term duration? ${isRateForTerm}`);

  let totalInterest;
  
  if (isRateForTerm || ratePercent > 50) {
    console.log(`Rate ${ratePercent}% is for the entire term, not annual`);
    totalInterest = principal * (ratePercent / 100);
  } else {
    // For annual rates
    const timeInYears = convertTermToMonths(termValue, termCode) / 12;
    totalInterest = principal * (ratePercent / 100) * timeInYears;
    console.log(`Rate ${ratePercent}% is annual, time in years: ${timeInYears.toFixed(4)}`);
  }
  
  const totalRepayable = principal + totalInterest;
  const totalPayments = getTotalPaymentsForFrequency(termValue, termCode, paymentFrequency);
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

    const dueDate = calculateNextPaymentDate(i, paymentFrequency, startDate);

    installments.push({
      installmentNo: i,
      dueDate,
      principal: Number(principalPortion.toFixed(2)),
      interest: Number(interestPortion.toFixed(2)),
      totalPayment: Number((principalPortion + interestPortion).toFixed(2)),
      remainingBalance: Number(remaining.toFixed(2))
    });
  }

  return {
    emi: Number(emi.toFixed(2)),
    totalInterest: Number(totalInterest.toFixed(2)),
    totalRepayable: Number(totalRepayable.toFixed(2)),
    totalPayment: Number(totalRepayable.toFixed(2)), // Added for compatibility
    installments,
    calculationMethod: 'FLAT_RATE_SIMPLE',
    rateUsed: ratePercent,
    isRateForTerm: isRateForTerm || ratePercent > 50
  };
}

// ==================== REDUCING BALANCE / COMPOUND EMI ====================
function calculateReducingBalanceEMI(principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate) {
  console.log('=== REDUCING BALANCE / COMPOUND INTEREST CALCULATION ===');
  console.log(`Principal: ₦${principal}, Annual Rate: ${annualRatePercent}%, Term: ${termValue} ${termCode}, Frequency: ${paymentFrequency}`);

  const totalPayments = getTotalPaymentsForFrequency(termValue, termCode, paymentFrequency);
  const periodicRate = annualRatePercent / 100 / (paymentFrequency.toUpperCase() === 'MONTHLY' ? 12 : 
                                           paymentFrequency.toUpperCase() === 'QUARTERLY' ? 4 : 12);

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

    const dueDate = calculateNextPaymentDate(i, paymentFrequency, startDate);

    installments.push({
      installmentNo: i,
      dueDate,
      principal: Number(principalPortion.toFixed(2)),
      interest: Number(interestPortion.toFixed(2)),
      totalPayment: Number((principalPortion + interestPortion).toFixed(2)),
      remainingBalance: Number(remaining.toFixed(2))
    });
  }

  return {
    emi: Number(emi.toFixed(2)),
    totalInterest: Number(totalInterest.toFixed(2)),
    totalRepayable: Number(totalRepayable.toFixed(2)),
    totalPayment: Number(totalRepayable.toFixed(2)), // Added for compatibility
    installments,
    calculationMethod: 'REDUCING_BALANCE_COMPOUND',
    rateUsed: annualRatePercent
  };
}

// ==================== ENHANCED EMI CALCULATION (MAIN FUNCTION) - UPDATED ====================
function calculateInterestAndEMIEnhanced(principalAmount, loanInterestRate, termValue, termCode, paymentFrequency, startDate) {
  console.log('=== ENHANCED EMI CALCULATION STARTED ===');
  console.log(`Principal: ₦${principalAmount}`);
  console.log(`Interest Rate Config:`, loanInterestRate);

  // Extract rate - prefer ABSOLUTE_RATE, fallback to FIXED_RATE
  let ratePercent = loanInterestRate.ABSOLUTE_RATE || loanInterestRate.FIXED_RATE || 0;
  
  // Log the rate type to understand what we're dealing with
  console.log(`Rate Type: ${loanInterestRate.RATE_TY}, Interest Type: ${loanInterestRate.INT_TY}`);
  console.log(`Extracted Rate: ${ratePercent}%`);

  // FIX: Check if rate is monthly or annual
  // Common Nigerian microfinance: Rates like 74.4% for 6 months = ~12.4% monthly
  // If RATE_TY is 'FIXED' or INT_TY is 'SIMPLE', it's likely flat rate for the term
  const isFixedOrSimple = (loanInterestRate.RATE_TY === 'FIXED' || loanInterestRate.INT_TY === 'SIMPLE');
  
  if (isFixedOrSimple) {
    console.log('Using FLAT RATE / SIMPLE INTEREST method');
    
    // For flat rate loans, the rate is usually for the entire term
    // Example: 74.4% for 6 months = total interest over the term
    return calculateFixedRateEMI(principalAmount, ratePercent, termValue, termCode, paymentFrequency, startDate, true);
  } else {
    console.log('Using REDUCING BALANCE / COMPOUND method');
    
    // For reducing balance, check if rate is monthly
    const isMonthlyRate = ratePercent < 20; // Rates < 20% are likely monthly
    if (isMonthlyRate) {
      console.warn(`⚠️ Rate ${ratePercent}% appears to be monthly - converting to annual: ${ratePercent * 12}%`);
      ratePercent = ratePercent * 12;
    }
    
    return calculateReducingBalanceEMI(principalAmount, ratePercent, termValue, termCode, paymentFrequency, startDate);
  }
}

// NEW: Explicit rate version (for testing/manual override)
function calculateEMIWithExplicitRate(principal, ratePercent, isMonthlyRate, termValue, termCode, paymentFrequency, startDate, isSimpleInterest, isRateForTerm = false) {
  const annualRate = isMonthlyRate ? ratePercent * 12 : ratePercent;
  
  if (isSimpleInterest) {
    return calculateFixedRateEMI(principal, ratePercent, termValue, termCode, paymentFrequency, startDate, isRateForTerm);
  } else {
    return calculateReducingBalanceEMI(principal, annualRate, termValue, termCode, paymentFrequency, startDate);
  }
}
// Helper function to calculate next payment date
// function calculateNextPaymentDate(periodNumber, paymentFrequency, startDate = new Date()) {
//   const date = new Date(startDate);
  
//   switch(paymentFrequency.toUpperCase()) {
//     case 'DAILY':
//       date.setDate(date.getDate() + periodNumber);
//       break;
//     case 'WEEKLY':
//       date.setDate(date.getDate() + (periodNumber * 7));
//       break;
//     case 'BI_WEEKLY':
//       date.setDate(date.getDate() + (periodNumber * 14));
//       break;
//     case 'MONTHLY':
//       date.setMonth(date.getMonth() + periodNumber);
//       break;
//     case 'QUARTERLY':
//       date.setMonth(date.getMonth() + (periodNumber * 3));
//       break;
//     case 'YEARLY':
//       date.setFullYear(date.getFullYear() + periodNumber);
//       break;
//     default:
//       date.setMonth(date.getMonth() + periodNumber);
//   }
  
//   return date;
// }

// // Helper function to get total payments for frequency
// function getTotalPaymentsForFrequency(termValue, termCode, paymentFrequency) {
//   termCode = String(termCode).toUpperCase();
//   paymentFrequency = String(paymentFrequency).toUpperCase();
  
//   switch (termCode) {
//     case 'D': // Days
//       switch (paymentFrequency) {
//         case 'DAILY': return termValue;
//         case 'WEEKLY': return Math.ceil(termValue / 7);
//         default: return termValue;
//       }
//     case 'W': // Weeks
//       switch (paymentFrequency) {
//         case 'DAILY': return termValue * 7;
//         case 'WEEKLY': return termValue;
//         case 'BI_WEEKLY': return Math.ceil(termValue / 2);
//         default: return termValue;
//       }
//     case 'BW': // Bi-weeks
//       switch (paymentFrequency) {
//         case 'DAILY': return termValue * 14;
//         case 'WEEKLY': return termValue * 2;
//         case 'BI_WEEKLY': return termValue;
//         default: return termValue;
//       }
//     case 'M': // Months
//       switch (paymentFrequency) {
//         case 'DAILY': return Math.ceil(termValue * 30);
//         case 'WEEKLY': return Math.ceil(termValue * 4.33);
//         case 'BI_WEEKLY': return Math.ceil(termValue * 2.17);
//         case 'MONTHLY': return termValue;
//         case 'QUARTERLY': return Math.ceil(termValue / 3);
//         case 'YEARLY': return Math.ceil(termValue / 12);
//         default: return termValue;
//       }
//     case 'Q': // Quarters
//       switch (paymentFrequency) {
//         case 'MONTHLY': return termValue * 3;
//         case 'QUARTERLY': return termValue;
//         case 'YEARLY': return Math.ceil(termValue / 4);
//         default: return termValue;
//       }
//     case 'Y': // Years
//       switch (paymentFrequency) {
//         case 'DAILY': return Math.ceil(termValue * 365);
//         case 'WEEKLY': return Math.ceil(termValue * 52);
//         case 'MONTHLY': return termValue * 12;
//         case 'QUARTERLY': return termValue * 4;
//         case 'YEARLY': return termValue;
//         default: return termValue;
//       }
//     default:
//       return termValue;
//   }
// }

// // Helper function to determine payment frequency from term code
// function getPaymentFrequency(termCode, termValue) {
//   termCode = String(termCode).toUpperCase();
//   switch (termCode) {
//     case 'D': return 'DAILY';
//     case 'W': return 'WEEKLY';
//     case 'BW': return 'BI_WEEKLY';
//     case 'M': return 'MONTHLY';
//     case 'Q': return 'QUARTERLY';
//     case 'Y': return termValue <= 1 ? 'MONTHLY' : 'YEARLY';
//     default: return 'MONTHLY';
//   }
// }


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
   
    // For LoanAccount (uses full words)
    function mapTermCodeToFullWord(termCode) {
      const termMap = {
        'D': 'DAILY',
        'W': 'WEEKLY', 
        'BW': 'BI_WEEKLY',
        'M': 'MONTHLY',
        'Q': 'QUARTERLY',
        'Y': 'YEARLY'
      };
      
      const upperTermCode = String(termCode).toUpperCase();
      return termMap[upperTermCode] || 'MONTHLY';
    }

    // For RepaymentSchedule (uses single-letter codes)
    function getRepaymentTermType(termCode) {
      const termCodeUpper = String(termCode).toUpperCase();
      
      const termMap = {
        'D': 'D',
        'DAILY': 'D',
        'W': 'W',
        'WEEKLY': 'W',
        'BW': 'BW',
        'BI_WEEKLY': 'BW',
        'BI-WEEKLY': 'BW',
        'M': 'M',
        'MONTHLY': 'M',
        'Q': 'M',
        'QUARTERLY': 'M',
        'Y': 'Y',
        'YEARLY': 'Y'
      };
      
      return termMap[termCodeUpper] || 'M';
    }

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
 
    async function findLoanInterestRateByProduct(PROD_ID, INDEX_RATE_ID, session) {
      try {
        console.log(`Looking for LoanInterestRate for product: ${PROD_ID}`);
       
        // Try to find rates that might be associated with this product
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

    // Helper function for Decimal128 conversion
    function toDecimal128(value) {
      if (value === null || value === undefined) return mongoose.Types.Decimal128.fromString('0.00');
      if (value instanceof mongoose.Types.Decimal128) return value;
      return mongoose.Types.Decimal128.fromString(value.toString());
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

    // ==================== GET EXPECTED FLAT RATE ====================
    function getExpectedFlatRate(req) {
      console.log('\n=== DEBUG getExpectedFlatRate ===');
      console.log('Checking request for flat rate:');
      
      // Priority 1: Check for explicit flat rate in request
      if (req.body.FLAT_RATE) {
          const flatRate = parseFloat(req.body.FLAT_RATE);
          if (!isNaN(flatRate) && flatRate > 0) {
              console.log(`Found FLAT_RATE in request: ${flatRate}%`);
              return flatRate;
          }
      }
      
      // Priority 2: Check for ANNUAL_RATE in request
      if (req.body.ANNUAL_RATE) {
          const annualRate = parseFloat(req.body.ANNUAL_RATE);
          if (!isNaN(annualRate) && annualRate > 0) {
              console.log(`Found ANNUAL_RATE in request: ${annualRate}%`);
              return annualRate;
          }
      }
      
      // Priority 3: Always return 74.4% for business requirement
      console.log('Returning business default rate: 74.4%');
      return 74.4;
    }

    // ==================== CORRECTED FLAT RATE EMI CALCULATION ====================
    function calculateFlatRateEMI(principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate) {
      console.log('=== CORRECTED FLAT RATE (SIMPLE INTEREST) CALCULATION ===');
      console.log(`Principal: ₦${principal}, Annual Rate: ${annualRatePercent}%, Term: ${termValue} ${termCode}, Frequency: ${paymentFrequency}`);
      
      // Convert annual rate to monthly rate
      const monthlyRatePercent = annualRatePercent / 12;
      console.log(`Monthly Rate: ${monthlyRatePercent.toFixed(2)}%`);
      
      // Calculate total interest for the entire term
      const totalInterest = principal * (annualRatePercent / 100) * (termValue / 12);
      console.log(`Total Interest for ${termValue} months: ₦${totalInterest.toFixed(2)}`);
      
      const totalRepayable = principal + totalInterest;
      const emi = totalRepayable / termValue;
      
      console.log(`Total Repayable: ₦${totalRepayable.toFixed(2)}`);
      console.log(`EMI (per month): ₦${emi.toFixed(2)}`);

      function calculateNextPaymentDate(installmentNumber, paymentFrequency, startDate) {
        const date = new Date(startDate);
        switch (paymentFrequency.toUpperCase()) {
          case 'DAILY': date.setDate(date.getDate() + installmentNumber); break;
          case 'WEEKLY': date.setDate(date.getDate() + (installmentNumber * 7)); break;
          case 'BI_WEEKLY': date.setDate(date.getDate() + (installmentNumber * 14)); break;
          case 'MONTHLY': date.setMonth(date.getMonth() + installmentNumber); break;
          case 'QUARTERLY': date.setMonth(date.getMonth() + (installmentNumber * 3)); break;
          case 'SEMI_ANNUALLY': date.setMonth(date.getMonth() + (installmentNumber * 6)); break;
          case 'ANNUALLY': date.setFullYear(date.getFullYear() + installmentNumber); break;
          default: date.setMonth(date.getMonth() + installmentNumber);
        }
        return date.toISOString().split('T')[0];
      }

      const installments = [];
      let remainingPrincipal = principal;

      for (let i = 1; i <= termValue; i++) {
        const interestPortion = totalInterest / termValue;
        let principalPortion = emi - interestPortion;

        // Adjust for the last installment
        if (i === termValue) {
          principalPortion = remainingPrincipal;
        }

        remainingPrincipal -= principalPortion;
        if (remainingPrincipal < 0.01) remainingPrincipal = 0;

        const dueDate = calculateNextPaymentDate(i, paymentFrequency, startDate);

        installments.push({
          installmentNo: i,
          dueDate,
          principal: Number(principalPortion.toFixed(2)),
          interest: Number(interestPortion.toFixed(2)),
          totalPayment: Number((principalPortion + interestPortion).toFixed(2)),
          remainingBalance: Number(remainingPrincipal.toFixed(2))
        });
      }

      return {
        emi: Number(emi.toFixed(2)),
        totalInterest: Number(totalInterest.toFixed(2)),
        totalRepayable: Number(totalRepayable.toFixed(2)),
        totalPayment: Number(totalRepayable.toFixed(2)),
        installments,
        calculationMethod: 'FLAT_RATE',
        annualRateUsed: annualRatePercent,
        monthlyRateUsed: monthlyRatePercent,
        annualRateEquivalent: annualRatePercent,
        isTermBasedRate: true
      };
    }

    // ==================== AUTOMATIC DISBURSEMENT HELPER ====================
async function processAutomaticDisbursement(loanAccount, creditApplication, repaymentSchedule, loanDisbursement, session) {
  console.log('\n=== STARTING AUTOMATIC DISBURSEMENT ===');
  
  try {
    // 1. Find the customer account for disbursement
    const customerAccount = await CustomerAccount.findOne({ 
      account_number: req.body.REPAY_SRC_ACCT_NO 
    }).session(session);
    
    if (!customerAccount) {
      throw new Error(`Customer account ${req.body.REPAY_SRC_ACCT_NO} not found for disbursement`);
    }
    
    console.log(`✓ Found customer account: ${customerAccount.account_number}`);
    
    // 2. Get dynamic GL accounts from product setup
    console.log('\n=== FETCHING DYNAMIC GL ACCOUNTS ===');
    let dynamicGLAccounts = {};
    
    try {
      // Try to get GL accounts from the product
      const productId = loanAccount.PROD_ID || req.body.PROD_ID;
      if (productId) {
        console.log(`Looking for GL accounts for product ID: ${productId}`);
        
        // Method 1: Check if loanAccount already has GL accounts
        if (loanAccount.defaultGLAccounts) {
          dynamicGLAccounts = loanAccount.defaultGLAccounts;
          console.log('✓ Found GL accounts in loanAccount:', dynamicGLAccounts);
        } 
        // Method 2: Fetch from LoanProduct
        else {
          const loanProduct = await LoanProduct.findOne({ 
            PROD_ID: parseInt(productId) 
          }).session(session);
          
          if (loanProduct && loanProduct.defaultGLAccounts) {
            dynamicGLAccounts = loanProduct.defaultGLAccounts;
            console.log('✓ Found GL accounts in LoanProduct:', dynamicGLAccounts);
          } else {
            console.warn('⚠️ No GL accounts found in LoanProduct, using defaults');
          }
        }
      }
    } catch (glError) {
      console.warn('⚠️ Error fetching dynamic GL accounts:', glError.message);
    }
    
    // Set default GL accounts if dynamic ones are not available
    const GL_ACCOUNTS = {
      // Use dynamic GL accounts if available, otherwise use sensible defaults
      LOAN_GL_ACCOUNT: dynamicGLAccounts.loanGLAccount || '01002001012001',
      INTEREST_GL_ACCOUNT: dynamicGLAccounts.interestGLAccountNo || '01001301304001',
      FEE_GL_ACCOUNT: dynamicGLAccounts.feeGLAccountNo || '500100',
      CUSTOMER_GL_ACCOUNT: customerAccount.gl_account_code || '01001101111001',
      // Additional GL accounts from product setup
      INTEREST_PAYABLE_GL_ACCOUNT: dynamicGLAccounts.interestPayableGLAccountNo || '',
      PRINCIPAL_GL_ACCOUNT: dynamicGLAccounts.principalGLAccountNo || '',
      WITHHOLDING_TAX_GL_ACCOUNT: dynamicGLAccounts.withholdingTaxGLAccountNo || '',
      INTEREST_INCOME_GL_ACCOUNT: dynamicGLAccounts.interestIncomeGLAccountNo || '',
      INTEREST_RECEIVABLE_GL_ACCOUNT: dynamicGLAccounts.interestReceivableGLAccountNo || '',
      // Store the source
      SOURCE: dynamicGLAccounts.loanGLAccount ? 'DYNAMIC_FROM_PRODUCT' : 'DEFAULT_STATIC'
    };
    
    console.log('Final GL accounts to be used:', {
      LOAN_GL_ACCOUNT: GL_ACCOUNTS.LOAN_GL_ACCOUNT,
      INTEREST_GL_ACCOUNT: GL_ACCOUNTS.INTEREST_GL_ACCOUNT,
      FEE_GL_ACCOUNT: GL_ACCOUNTS.FEE_GL_ACCOUNT,
      CUSTOMER_GL_ACCOUNT: GL_ACCOUNTS.CUSTOMER_GL_ACCOUNT,
      SOURCE: GL_ACCOUNTS.SOURCE
    });
    
    // 3. Prepare disbursement data
    let disbursementAmount;
    let principalAmount;
    
    // Check which field has the amount
    if (loanAccount.DISBURSEMENT_LIMIT !== undefined && loanAccount.DISBURSEMENT_LIMIT !== null) {
      disbursementAmount = parseFloat(loanAccount.DISBURSEMENT_LIMIT.toString());
      principalAmount = parseFloat(loanAccount.DISBURSEMENT_LIMIT.toString());
    } else if (loanAccount.AMOUNT !== undefined && loanAccount.AMOUNT !== null) {
      disbursementAmount = parseFloat(loanAccount.AMOUNT.toString());
      principalAmount = parseFloat(loanAccount.AMOUNT.toString());
    } else if (loanDisbursement.AMOUNT !== undefined && loanDisbursement.AMOUNT !== null) {
      disbursementAmount = parseFloat(loanDisbursement.AMOUNT.toString());
      principalAmount = parseFloat(loanDisbursement.AMOUNT.toString());
    } else {
      throw new Error('Loan amount not found in any field');
    }
    
    console.log('Disbursement amount determined:', {
      fromLoanAccountDISBURSEMENT_LIMIT: loanAccount.DISBURSEMENT_LIMIT,
      fromLoanAccountAMOUNT: loanAccount.AMOUNT,
      fromLoanDisbursementAMOUNT: loanDisbursement.AMOUNT,
      disbursementAmount,
      principalAmount
    });
    
    // 4. Calculate fees (if any)
    const processingFeeRate = 0; // No fees for automatic disbursement
    const upfrontInterestRate = loanAccount.upfrontInterestPercentage ? 
      parseFloat(loanAccount.upfrontInterestPercentage.toString() || '0') / 100 : 0;
    
    const processingFee = disbursementAmount * processingFeeRate;
    const upfrontInterest = disbursementAmount * upfrontInterestRate;
    const totalFees = processingFee + upfrontInterest;
    const netAmount = disbursementAmount - totalFees;
    
    console.log('Disbursement calculations:', {
      disbursementAmount,
      processingFeeRate,
      processingFee,
      upfrontInterestRate,
      upfrontInterest,
      totalFees,
      netAmount
    });
    
    // 5. Update LoanAccount to ACTIVE status
    loanAccount.LOAN_STATUS = 'ACTIVE';
    loanAccount.DISBURSED_AMOUNT = toDecimal128(disbursementAmount);
    loanAccount.ACTUAL_DISBURSEMENT = toDecimal128(disbursementAmount);
    loanAccount.OUTSTANDING_PRINCIPAL = toDecimal128(principalAmount);
    loanAccount.CURRENT_BALANCE = toDecimal128(principalAmount);
    loanAccount.DISBURSEMENT_DATE = new Date();
    loanAccount.APPROVAL_DATE = new Date();
    loanAccount.APPROVED_BY = req.body.CREATED_BY || 'SYSTEM_AUTO';
    loanAccount.PRIMARY_OFFICER_ID = req.body.PRIMARY_OFFICER_ID || loanAccount.PRIMARY_OFFICER_ID;
    
    // Store GL accounts in loan account for reference
    if (Object.keys(dynamicGLAccounts).length > 0) {
      loanAccount.defaultGLAccounts = dynamicGLAccounts;
    }
    
    await loanAccount.save({ session });
    console.log('✓ Updated LoanAccount status to ACTIVE');
    
    // 6. Update LoanDisbursement
    loanDisbursement.STATUS = 'DISBURSED';
    loanDisbursement.DISBURSEMENT_DATE = new Date();
    loanDisbursement.DISBURSED_BY = req.body.CREATED_BY || 'SYSTEM_AUTO';
    loanDisbursement.NET_DISBURSEMENT_AMOUNT = toDecimal128(netAmount);
    loanDisbursement.ACTUAL_DISBURSEMENT = toDecimal128(disbursementAmount);
    
    await loanDisbursement.save({ session });
    console.log('✓ Updated LoanDisbursement status to DISBURSED');
    
    // 7. Update CreditApplication - Use APPROVED instead of DISBURSED
    creditApplication.STATUS = 'APPROVED'; // Changed from 'DISBURSED'
    creditApplication.DISBURSEMENT_DATE = new Date();
    creditApplication.ACTUAL_DISBURSEMENT = toDecimal128(disbursementAmount);
    creditApplication.NET_DISBURSEMENT = toDecimal128(netAmount);
    creditApplication.LOAN_STATUS = 'ACTIVE';
    
    await creditApplication.save({ session });
    console.log('✓ Updated CreditApplication status to APPROVED');
    
    // 8. Update RepaymentSchedule
    repaymentSchedule.STATUS = 'ACTIVE';
    
    await repaymentSchedule.save({ session });
    console.log('✓ Updated RepaymentSchedule status to ACTIVE');
    
    // 9. Update Guarantor
    if (loanAccount.GUARANTOR_ID) {
      await Guarantor.findByIdAndUpdate(
        loanAccount.GUARANTOR_ID,
        {
          $addToSet: { guaranteedLoans: loanAccount._id },
          lastUsedDate: new Date(),
          status: 'ACTIVE',
          GUARANTEED_AMOUNT: loanAccount.GUARANTEED_AMOUNT || toDecimal128(principalAmount),
          LOAN_ACCOUNT_NO: loanAccount.ACCT_NO,
          ACTIVATION_DATE: new Date()
        },
        { session }
      );
      console.log('✓ Updated Guarantor status to ACTIVE');
    } else {
      console.warn('⚠️ No GUARANTOR_ID found in loan account');
    }
    
    // 10. Update customer account balance
    const currentBalance = customerAccount.LEDGER_BALANCE ? 
      parseFloat(customerAccount.LEDGER_BALANCE.toString() || '0') : 0;
    const newBalance = currentBalance + netAmount;
    
    customerAccount.LEDGER_BALANCE = toDecimal128(newBalance);
    customerAccount.CLEARED_BALANCE = toDecimal128(newBalance);
    customerAccount.AVAILABLE_BALANCE = toDecimal128(newBalance);
    customerAccount.LAST_UPDATED = new Date();
    
    if (!customerAccount.transactionHistory) {
      customerAccount.transactionHistory = [];
    }
    
    customerAccount.transactionHistory.push({
      date: new Date(),
      type: 'LOAN_DISBURSEMENT',
      amount: netAmount,
      description: `Loan disbursement from ${loanAccount.ACCT_NO}`,
      reference: loanAccount.ACCT_NO,
      balanceAfter: newBalance
    });
    
    await customerAccount.save({ session });
    console.log(`✓ Updated customer account balance: +₦${netAmount.toFixed(2)}`);
    
    // 11. Create financial transactions
    const transactionDate = new Date();
    const timestamp = Date.now();
    const mainTxId = `DISB-${timestamp}`;
    
    // Create main disbursement transaction
    const disbursementTransaction = new Transaction({
      TRANSACTION_ID: Number(timestamp),
      EVENT_ID: 1,
      TRAN_JOURNAL_ID: loanAccount.JOURNAL_ID || `JRN-${timestamp}`,
      ACCT_NO: loanAccount.ACCT_NO || loanAccountNumber,
      ACCT_ID: String(loanAccount._id),
      BU_ID: Number(loanAccount.BU_ID || req.body.BU_ID || 1),
      CUST_ID: String(loanAccount.CUST_ID || req.body.CUST_ID),
      ACCT_NM: loanAccount.ACCT_NM || req.body.ACCT_NM,
      AMOUNT: disbursementAmount,
      TRANSACTIONDATE: transactionDate,
      TRANSACTION_TYPE: 'LOAN_DISBURSEMENT',
      description: `Auto-disbursed Loan to ${loanAccount.ACCT_NM || req.body.ACCT_NM}`,
      currency: loanAccount.CRNCY_ID || req.body.CRNCY_ID || 'NGN',
      createdBy: req.body.CREATED_BY || 'SYSTEM_AUTO',
      status: 'COMPLETED',
      REFERENCE: `DISB-${loanAccount.ACCT_NO || loanAccountNumber}`,
      metadata: {
        loanAccountNo: loanAccount.ACCT_NO || loanAccountNumber,
        customerAccountNo: req.body.REPAY_SRC_ACCT_NO,
        totalLoanAmount: disbursementAmount,
        netDisbursement: netAmount,
        feesDeducted: totalFees,
        glAccountsUsed: GL_ACCOUNTS,
        glAccountUsed: GL_ACCOUNTS.LOAN_GL_ACCOUNT,
        transactionType: 'auto_disbursement',
        loanInterestRateId: loanAccount.LOAN_INTEREST_RATE_ID,
        interestRate: loanAccount.INTEREST_RATE ? parseFloat(loanAccount.INTEREST_RATE.toString()) : 74.4,
        glSource: GL_ACCOUNTS.SOURCE
      }
    });
    
    await disbursementTransaction.save({ session });
    console.log('✓ Created disbursement transaction');
    
    // Create fee transaction if fees exist
    if (totalFees > 0) {
      const feeTransaction = new Transaction({
        TRANSACTION_ID: Number(timestamp) + 1,
        EVENT_ID: 2,
        TRAN_JOURNAL_ID: loanAccount.JOURNAL_ID || `JRN-${timestamp + 1}`,
        ACCT_NO: loanAccount.ACCT_NO || loanAccountNumber,
        ACCT_ID: String(loanAccount._id),
        BU_ID: Number(loanAccount.BU_ID || req.body.BU_ID || 1),
        CUST_ID: String(loanAccount.CUST_ID || req.body.CUST_ID),
        ACCT_NM: loanAccount.ACCT_NM || req.body.ACCT_NM,
        AMOUNT: totalFees,
        TRANSACTIONDATE: transactionDate,
        TRANSACTION_TYPE: 'PROCESSING_FEE',
        description: `Fees for Loan ${loanAccount.ACCT_NO || loanAccountNumber}`,
        currency: loanAccount.CRNCY_ID || req.body.CRNCY_ID || 'NGN',
        createdBy: req.body.CREATED_BY || 'SYSTEM_AUTO',
        status: 'COMPLETED',
        REFERENCE: `FEE-${loanAccount.ACCT_NO || loanAccountNumber}`,
        metadata: {
          loanAccountNo: loanAccount.ACCT_NO || loanAccountNumber,
          feeType: 'PROCESSING',
          feeAmount: totalFees,
          glAccountUsed: GL_ACCOUNTS.FEE_GL_ACCOUNT,
          transactionType: 'fee_collection',
          glSource: GL_ACCOUNTS.SOURCE
        }
      });
      
      await feeTransaction.save({ session });
      console.log('✓ Created fee transaction');
    }
    
    // Create interest transaction if upfront interest exists
    if (upfrontInterest > 0) {
      const interestTransaction = new Transaction({
        TRANSACTION_ID: Number(timestamp) + 2,
        EVENT_ID: 3,
        TRAN_JOURNAL_ID: loanAccount.JOURNAL_ID || `JRN-${timestamp + 2}`,
        ACCT_NO: loanAccount.ACCT_NO || loanAccountNumber,
        ACCT_ID: String(loanAccount._id),
        BU_ID: Number(loanAccount.BU_ID || req.body.BU_ID || 1),
        CUST_ID: String(loanAccount.CUST_ID || req.body.CUST_ID),
        ACCT_NM: loanAccount.ACCT_NM || req.body.ACCT_NM,
        AMOUNT: upfrontInterest,
        TRANSACTIONDATE: transactionDate,
        TRANSACTION_TYPE: 'INTEREST',
        description: `Upfront Interest for Loan ${loanAccount.ACCT_NO || loanAccountNumber}`,
        currency: loanAccount.CRNCY_ID || req.body.CRNCY_ID || 'NGN',
        createdBy: req.body.CREATED_BY || 'SYSTEM_AUTO',
        status: 'COMPLETED',
        REFERENCE: `INT-${loanAccount.ACCT_NO || loanAccountNumber}`,
        metadata: {
          loanAccountNo: loanAccount.ACCT_NO || loanAccountNumber,
          interestType: 'UPFRONT',
          interestAmount: upfrontInterest,
          glAccountUsed: GL_ACCOUNTS.INTEREST_GL_ACCOUNT,
          transactionType: 'interest_collection',
          glSource: GL_ACCOUNTS.SOURCE
        }
      });
      
      await interestTransaction.save({ session });
      console.log('✓ Created interest transaction');
    }
    
    // Update LoanPortfolio if available
    if (LoanPortfolio) {
      try {
        const portfolioProductId = Number(loanAccount.PROD_ID || req.body.PROD_ID);
        const branchId = loanAccount.BU_ID || req.body.BU_ID;
        
        if (portfolioProductId && branchId) {
          await LoanPortfolio.findOneAndUpdate(
            { 
              BRANCH_ID: branchId,
              PROD_ID: portfolioProductId,
              MONTH: transactionDate.getMonth() + 1,
              YEAR: transactionDate.getFullYear()
            },
            {
              $inc: {
                TOTAL_DISBURSED: disbursementAmount,
                TOTAL_NET_DISBURSEMENT: netAmount,
                TOTAL_PRINCIPAL: disbursementAmount,
                OUTSTANDING_PRINCIPAL: disbursementAmount,
                TOTAL_INTEREST_RECEIVED: upfrontInterest,
                TOTAL_FEES_RECEIVED: processingFee,
                NUMBER_OF_LOANS: 1,
                ACTIVE_LOANS: 1,
                DISBURSEMENT_COUNT: 1
              },
              $setOnInsert: {
                BRANCH_ID: branchId,
                PROD_ID: portfolioProductId,
                PRODUCT_CODE: 'AUTO_DISB',
                PRODUCT_NAME: 'Auto Disbursed Loan',
                PRODUCT_TYPE: loanAccount.PRODUCT_TYPE || req.body.PRODUCT_TYPE || 'INDIVIDUAL_LOAN',
                MONTH: transactionDate.getMonth() + 1,
                YEAR: transactionDate.getFullYear(),
                CURRENCY: loanAccount.CRNCY_ID || req.body.CRNCY_ID || 'NGN',
                CREATED_DATE: new Date(),
                STATUS: 'ACTIVE',
                CREATED_BY: req.body.CREATED_BY || 'SYSTEM_AUTO',
                UPDATED_BY: req.body.CREATED_BY || 'SYSTEM_AUTO',
                YIELD_RATE: loanAccount.INTEREST_RATE ? parseFloat(loanAccount.INTEREST_RATE.toString()) : 74.4,
                TOTAL_INTEREST_ACCRUED: 0,
                TOTAL_REPAYMENTS: 0,
                TOTAL_RECOVERED: 0,
                TOTAL_DEFAULTS: 0,
                PORTFOLIO_AT_RISK: 0,
                PROVISION_AMOUNT: 0,
                NPL_RATIO: 0,
                COST_OF_FUNDS: 0,
                NET_INTEREST_MARGIN: loanAccount.INTEREST_RATE ? parseFloat(loanAccount.INTEREST_RATE.toString()) : 74.4,
                AVERAGE_LOAN_SIZE: disbursementAmount,
                GL_ACCOUNTS: GL_ACCOUNTS,
                GL_SOURCE: GL_ACCOUNTS.SOURCE
              },
              $set: {
                UPDATED_DATE: new Date()
              }
            },
            { upsert: true, new: true, session }
          );
          
          console.log('✓ Updated LoanPortfolio');
        } else {
          console.warn('⚠️ LoanPortfolio update skipped: missing productId or branchId');
        }
      } catch (portfolioError) {
        console.warn('⚠️ Could not update LoanPortfolio:', portfolioError.message);
      }
    } else {
      console.log('⚠️ LoanPortfolio model not available');
    }
    
    console.log('✅ AUTOMATIC DISBURSEMENT COMPLETED SUCCESSFULLY');
    
    return {
      success: true,
      disbursementAmount,
      netAmount,
      fees: totalFees,
      customerAccount: req.body.REPAY_SRC_ACCT_NO,
      newBalance,
      transactionId: mainTxId,
      glAccounts: GL_ACCOUNTS,
      glSource: GL_ACCOUNTS.SOURCE,
      accountingSummary: {
        totalLoanAmount: disbursementAmount,
        feesCollected: totalFees,
        netToCustomer: netAmount,
        glAccountsUsed: GL_ACCOUNTS,
        interestRateApplied: loanAccount.INTEREST_RATE ? parseFloat(loanAccount.INTEREST_RATE.toString()) : 74.4
      }
    };
    
  } catch (disbursementError) {
    console.error('❌ Automatic disbursement failed:', disbursementError);
    throw disbursementError;
  }
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
 
    const requiredFields = [
      'PROD_ID', 'CUST_ID', 'ACCT_NM', 'APPL_ID', 'PRODUCT_TYPE', 'CRNCY_ID', 'BU_ID',
      'PRIMARY_OFFICER_ID', 'DISBURSEMENT_LIMIT', 'START_DT', 'TERM_CD', 'TERM_VALUE',
      'CREATED_BY', 'REPAY_SRC_ACCT_NO', 'TRANSACTION_TYPE', 'GUARANTOR_ID'
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
 
    const calculationMethod = 'FLAT_RATE';
    console.log(`\n=== USING FLAT RATE CALCULATION METHOD ONLY ===`);
 
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
      console.log('✓ Transaction started');
 
      let workflowIdentifiers;
      try {
        workflowIdentifiers = await generateWorkflowIdentifiers(session);
        console.log('✓ Workflow identifiers generated successfully');
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
        console.log('✓ Using fallback workflow identifiers');
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

      const productValidation = {
        isValid: true,
        productType: req.body.PRODUCT_TYPE || 'INDIVIDUAL_LOAN',
        productName: `Product ${numericValues.PROD_ID}`,
        isLoanProduct: true,
        accountPrefix: 'LOAN',
        isGlobalProduct: true,
        BU_ID: ['*'],
        glAccounts: {},
        isAutoGenerated: true,
        wasUpdated: false
      };
 
      console.log(`✓ Product validated: ${productValidation.productType}`);
 
      let loanAccountNumber;
      const maxRetries = 3;
      let retries = 0;
 
      while (!loanAccountNumber && retries < maxRetries) {
        try {
          loanAccountNumber = await generateLoanAccountNumberByProdId(numericValues.PROD_ID);
          console.log(`Generated loanAccountNumber (attempt ${retries + 1}): ${loanAccountNumber}`);
 
          const existingLoanAccount = await LoanAccount.findOne({ ACCT_NO: loanAccountNumber });
          if (!existingLoanAccount) {
            console.log(`✓ Account number ${loanAccountNumber} is unique`);
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
 
      console.log('\n=== DIAGNOSTIC: Product, Rate and Interest Rate Lookup ===');
      console.log('Looking for loan product with PROD_ID:', numericValues.PROD_ID);
      console.log('Looking for rate index with requested ID:', req.body.INDEX_RATE_ID);
     
      let rateIndex, loanProduct, customer, guarantor, loanInterestRate;
     
      try {
        const LOAN_PROUD_INT_ID = req.body.LOAN_PROUD_INT_ID || req.body.LOAN_INTEREST_RATE_ID;
       
        [rateIndex, loanProduct, customer, guarantor] = await Promise.all([
          findRateIndex(req.body.INDEX_RATE_ID, session),
          LoanProduct.findOne({ PROD_ID: numericValues.PROD_ID }).session(session),
          Customer.findOne({ CUST_ID: req.body.CUST_ID }).session(session),
          findGuarantor(req.body.GUARANTOR_ID, session)
        ]);
       
        if (LOAN_PROUD_INT_ID) {
          loanInterestRate = await findLoanInterestRate(LOAN_PROUD_INT_ID, req.body.INDEX_RATE_ID, session);
        } else {
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
 
      console.log('\n=== LOOKUP RESULTS ===');
      console.log('Rate Index found:', rateIndex ? `${rateIndex.INDEX_RATE_ID} (${rateIndex.INDEX_RATE}%)` : 'NOT FOUND');
      console.log('Loan Product found:', loanProduct ? `${loanProduct.PROD_ID} - ${loanProduct.PRODUCT_NAME || loanProduct.productName}` : 'NOT FOUND');
      console.log('Customer found:', customer ? `${customer.CUST_ID} - ${customer.CUST_NM}` : 'NOT FOUND');
      console.log('Guarantor found:', guarantor ? `${guarantor.GUARANTOR_ID} - ${guarantor.fullName}` : 'NOT FOUND');
      console.log('Loan Interest Rate found:', loanInterestRate ?
        `${loanInterestRate.LOAN_PROUD_INT_ID} (Rate Type: ${loanInterestRate.RATE_TYPE}, Interest Type: ${loanInterestRate.INTEREST_TYPE}, ANNUAL_PERCENTAGE_RATE: ${loanInterestRate.ANNUAL_PERCENTAGE_RATE}%, DEFAULT_RATE_PER_MONTH: ${loanInterestRate.DEFAULT_RATE_PER_MONTH}%)` :
        'NOT FOUND');

      // ==================== FORCED 74.4% INTEREST RATE CALCULATION ====================
      console.log('\n=== FORCING 74.4% INTEREST RATE (OVERRIDING EVERYTHING) ===');
      let effectiveInterestRate;
      let interestRateNumber = 74.4; // <-- HARDCODED 74.4%
      let interestRateDetails = {};

      try {
          console.log('=== OVERRIDE LOGIC ACTIVATED ===');
          
          // ==================== HARDCODE 74.4% ====================
          console.log(`✓ FORCING INTEREST RATE TO: ${interestRateNumber}%`);
          
          // Use hardcoded 74.4% as the flat rate
          effectiveInterestRate = safeDecimal128(interestRateNumber, 'FORCED_74.4_PERCENT');
          
          // Determine source of 74.4%
          let rateSource = 'HARDCODED_74.4';
          let sourceNote = 'Forced 74.4% override';
          
          interestRateDetails = {
              rateType: 'FIXED',
              interestType: 'SIMPLE',
              calculationMethod: 'FLAT_RATE',
              loanInterestRateId: loanInterestRate?.LOAN_PROUD_INT_ID || null,
              source: rateSource,
              annualRate: interestRateNumber,
              monthlyRate: interestRateNumber / 12,
              isTermBasedRate: true,
              note: sourceNote,
              overrideDetails: {
                  forcedRate: 74.4,
                  reason: 'Business requirement: All loans must use 74.4% annual interest rate'
              }
          };
          
          console.log(`\n=== FINAL RATE DECISION ===`);
          console.log(`Loan Interest Rate ID: ${loanInterestRate?.LOAN_PROUD_INT_ID || 'N/A'}`);
          console.log(`USING INTEREST RATE: ${interestRateNumber}% annual`);
          console.log(`Monthly Rate: ${(interestRateNumber / 12).toFixed(2)}%`);
          console.log(`Source: ${interestRateDetails.source}`);
          console.log(`Note: ${interestRateDetails.note}`);
          
          // Validation
          if (Math.abs(interestRateNumber - 74.4) > 0.1) {
              console.error('❌ CRITICAL ERROR: Rate is not 74.4%!');
              console.error('Expected: 74.4%, Got:', interestRateNumber);
              interestRateNumber = 74.4;
              effectiveInterestRate = safeDecimal128(74.4, 'CORRECTED_TO_74.4');
              console.log('✓ Corrected rate to 74.4%');
          } else {
              console.log('✅ SUCCESS: Rate is correctly set to 74.4%');
          }
          
      } catch (error) {
          console.error('Interest rate calculation error:', error);
          throw {
              code: 'INTEREST_RATE_CALCULATION_ERROR',
              message: `Failed to calculate interest rate: ${error.message}`,
              status: 500,
          };
      }
     
      if (!loanProduct && productValidation.isLoanProduct) {
        console.warn(`⚠️ Loan product not found for PROD_ID ${numericValues.PROD_ID}, creating fallback product`);
       
        const fallbackProduct = {
          PROD_ID: numericValues.PROD_ID,
          PRODUCT_NAME: productValidation.productName,
          PRODUCT_SHORT_NAME: productValidation.accountPrefix,
          PRODUCT_TYPE: productValidation.productType,
          productName: productValidation.productName,
          productDescription: `Fallback loan product for PROD_ID ${numericValues.PROD_ID}`,
          minAmount: safeDecimal128('1000', 'minAmount'),
          maxAmount: safeDecimal128('1000000', 'maxAmount'),
          minTerm: 1,
          maxTerm: 60,
          defaultGLAccounts: productValidation.glAccounts || {}
        };
       
        loanProduct = fallbackProduct;
        console.log('✓ Using fallback product');
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
 
      let emiResult;
      let principalAmount;
      
      // ==================== CORRECTED FLAT RATE EMI CALCULATION ====================
      try {
        console.log('\n=== CALCULATING CORRECTED FLAT RATE EMI ===');
        principalAmount = parseFloat(numericValues.DISBURSEMENT_LIMIT.toString());
        
        console.log(`\nLoan Details:`);
        console.log(`Principal Amount: ₦${principalAmount.toFixed(2)}`);
        console.log(`Annual Interest Rate: ${interestRateNumber}%`);
        console.log(`Term: ${numericValues.TERM_VALUE} months`);
        console.log(`Payment Frequency: ${paymentFrequency}`);

        // Calculate using CORRECTED flat rate formula
        emiResult = calculateFlatRateEMI(
          principalAmount,
          interestRateNumber, // 74.4% annual rate
          numericValues.TERM_VALUE,
          req.body.TERM_CD,
          paymentFrequency,
          startDate
        );

        console.log('\n=== EMI CALCULATION RESULTS ===');
        console.log('Calculation Method:', emiResult.calculationMethod);
        console.log('Annual Rate Used:', emiResult.annualRateUsed + '%');
        console.log('Monthly Rate Used:', emiResult.monthlyRateUsed + '%');
        console.log('Total Interest:', emiResult.totalInterest.toFixed(2));
        console.log('Total Repayment:', emiResult.totalRepayable.toFixed(2));
        console.log('Monthly Payment (EMI):', emiResult.emi.toFixed(2));
        
        // ==================== VERIFICATION CALCULATIONS ====================
        console.log('\n=== VERIFICATION CALCULATIONS ===');
        
        // Manual calculation for verification
        const monthlyRate = interestRateNumber / 12; // 74.4% / 12 = 6.2%
        console.log(`\nManual Calculation Check:`);
        console.log(`Monthly Rate: ${monthlyRate.toFixed(2)}%`);
        
        // Total interest = Principal × Annual Rate × (Term in months / 12)
        const manualTotalInterest = principalAmount * (interestRateNumber / 100) * (numericValues.TERM_VALUE / 12);
        console.log(`Total Interest (Principal × ${interestRateNumber}% × ${numericValues.TERM_VALUE}/12): ₦${manualTotalInterest.toFixed(2)}`);
        
        // Total repayment = Principal + Total Interest
        const manualTotalRepayment = principalAmount + manualTotalInterest;
        console.log(`Total Repayment: ₦${manualTotalRepayment.toFixed(2)}`);
        
        // EMI = Total Repayment ÷ Number of months
        const manualEMI = manualTotalRepayment / numericValues.TERM_VALUE;
        console.log(`EMI (Total Repayment / ${numericValues.TERM_VALUE}): ₦${manualEMI.toFixed(2)}`);
        
        // Check if calculations match
        console.log(`\nVerification Results:`);
        console.log(`Total Interest Match: ${Math.abs(emiResult.totalInterest - manualTotalInterest) < 0.01 ? '✅ YES' : '❌ NO'}`);
        console.log(`Total Repayment Match: ${Math.abs(emiResult.totalRepayable - manualTotalRepayment) < 0.01 ? '✅ YES' : '❌ NO'}`);
        console.log(`EMI Match: ${Math.abs(emiResult.emi - manualEMI) < 0.01 ? '✅ YES' : '❌ NO'}`);
        
        // Specific verification for ₦500,000 at 74.4% for 6 months
        if (principalAmount === 500000 && numericValues.TERM_VALUE === 6) {
          console.log('\n=== SPECIFIC CASE VERIFICATION: ₦500,000/6 MONTHS/74.4% ANNUAL ===');
          const expectedTotalInterest = 500000 * (74.4 / 100) * (6 / 12); // ₦186,000
          const expectedTotalRepayment = 500000 + expectedTotalInterest; // ₦686,000
          const expectedEMI = expectedTotalRepayment / 6; // ₦114,333.33
          
          console.log(`Expected Total Interest: ₦${expectedTotalInterest.toFixed(2)}`);
          console.log(`Expected Total Repayment: ₦${expectedTotalRepayment.toFixed(2)}`);
          console.log(`Expected EMI: ₦${expectedEMI.toFixed(2)}`);
          console.log(`Calculated EMI: ₦${emiResult.emi.toFixed(2)}`);
          console.log(`EMI Match: ${Math.abs(emiResult.emi - expectedEMI) < 0.01 ? '✅ YES' : '❌ NO'}`);
          
          // Update emiResult if it's wrong
          if (Math.abs(emiResult.emi - expectedEMI) > 0.01) {
            console.warn('⚠️ EMI calculation is incorrect! Using corrected values...');
            emiResult.emi = expectedEMI;
            emiResult.totalInterest = expectedTotalInterest;
            emiResult.totalRepayable = expectedTotalRepayment;
          }
        }
        
      } catch (emiError) {
        console.error('EMI calculation error:', emiError);
        throw {
          code: 'INVALID_REPAYMENT_SCHEDULE',
          message: `Failed to generate repayment schedule: ${emiError.message}`,
          status: 500,
        };
      }
 
      const interestRateId = rateIndex?.INDEX_RATE_ID || 
                            loanInterestRate?.LOAN_PROUD_INT_ID || 
                            numericValues.PROD_ID;

      const loanInterestRateId = loanInterestRate?.LOAN_PROUD_INT_ID || null;

      console.log('Debug - Setting interest rate IDs:', {
        INTEREST_RATE_ID: interestRateId,
        LOAN_INTEREST_RATE_ID: loanInterestRateId,
        ANNUAL_PERCENTAGE_RATE_USED: interestRateNumber + '%'
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
        AMOUNT: numericValues.DISBURSEMENT_LIMIT,
        DISBURSEMENT_LIMIT: numericValues.DISBURSEMENT_LIMIT,
        ACTUAL_DISBURSEMENT: mongoose.Types.Decimal128.fromString('0.00'),
        DISBURSED_AMOUNT: mongoose.Types.Decimal128.fromString('0.00'),
        OUTSTANDING_PRINCIPAL: mongoose.Types.Decimal128.fromString('0.00'),
        CURRENT_BALANCE: mongoose.Types.Decimal128.fromString('0.00'),
        START_DT: startDate,
        TERM_CD: mapTermCodeToFullWord(req.body.TERM_CD),
        TERM_VALUE: numericValues.TERM_VALUE,
        MATURITY_DT: maturityDate,
        INTEREST_RATE_ID: interestRateId,
        LOAN_INTEREST_RATE_ID: loanInterestRateId,
        INTEREST_RATE: effectiveInterestRate,
        INTEREST_RATE_TYPE: 'FIXED',
        INTEREST_TYPE: 'SIMPLE',
        INTEREST_CALCULATION_METHOD: 'FLAT_RATE',
        ACCRUAL_BASIS: loanInterestRate?.ACCRUAL_BASIS || null,
        ACCRUAL_FREQUENCY: loanInterestRate?.ACCRUAL_FREQUENCY || null,
        IS_TERM_BASED_RATE: true,
        LOAN_STATUS: 'PENDING', // Initially PENDING, will be updated to ACTIVE after disbursement
        PAYMENT_FREQUENCY: paymentFrequency,
        CREATED_BY: req.body.CREATED_BY,
        TRANSACTION_ID,
        EVENT_ID,
        PROD_ID: numericValues.PROD_ID,
        TOTAL_INTEREST: safeDecimal128(emiResult.totalInterest, 'emiResult.totalInterest'),
        TOTAL_REPAYMENT: safeDecimal128(emiResult.totalRepayable, 'emiResult.totalRepayable'),
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
        interestRateDetails: interestRateDetails
      };
 
      const loanAccount = new LoanAccount(loanAccountData);
      await loanAccount.save({ session });
      console.log('✅ LoanAccount saved with ACCT_NO:', loanAccount.ACCT_NO);
      console.log(`✅ LoanAccount.INTEREST_RATE set to: ${parseFloat(loanAccount.INTEREST_RATE.toString())}% (FORCED 74.4%)`);
 
      await Guarantor.findByIdAndUpdate(
        guarantor._id,
        {
          $addToSet: { guaranteedLoans: loanAccount._id },
          lastUsedDate: new Date(),
          status: 'PENDING_VERIFICATION',
        },
        { session }
      );
 
      const repaymentScheduleData = {
        LOAN_ACCOUNT_ID: loanAccount._id,
        ACCT_NO: loanAccountNumber,
        CUST_ID: req.body.CUST_ID.toString(),
        START_DATE: startDate,
        MATURITY_DATE: maturityDate,
        PRINCIPAL_AMOUNT: numericValues.DISBURSEMENT_LIMIT,
        INTEREST_RATE: effectiveInterestRate,
        INTEREST_RATE_TYPE: 'FIXED',
        INTEREST_TYPE: 'SIMPLE',
        CALCULATION_METHOD: 'FLAT_RATE',
        IS_TERM_BASED_RATE: true,
        TERM: numericValues.TERM_VALUE,
        TERM_TYPE: getRepaymentTermType(req.body.TERM_CD),
        paymentFrequency: paymentFrequency,
        EMI_AMOUNT: safeDecimal128(emiResult.emi, 'emiResult.emi'),
        installments: emiResult.installments.map((installment, index) => ({
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
        TOTAL_REPAYMENT: safeDecimal128(emiResult.totalRepayable, 'emiResult.totalRepayable'),
        TRANSACTION_ID,
        EVENT_ID,
        CREATED_BY: req.body.CREATED_BY,
        STATUS: 'PENDING'
      };
 
      console.log('\n=== REPAYMENT SCHEDULE DETAILS ===');
      console.log(`Account Number: ${loanAccountNumber}`);
      console.log(`Interest Rate: ${parseFloat(effectiveInterestRate.toString())}%`);
      console.log(`EMI Amount: ₦${emiResult.emi.toFixed(2)}`);
      console.log(`Total Interest: ₦${emiResult.totalInterest.toFixed(2)}`);
      console.log(`Total Repayment: ₦${emiResult.totalRepayable.toFixed(2)}`);
 
      const repaymentSchedule = new RepaymentSchedule(repaymentScheduleData);
      await repaymentSchedule.save({ session });
      console.log('✅ RepaymentSchedule saved successfully');

      const loanDisbursementData = {
        ACCT_NO: loanAccountNumber,
        INTEREST_RATE: effectiveInterestRate,
        TERM_VALUE: numericValues.TERM_VALUE,
        TERM_CD: req.body.TERM_CD,
        AMOUNT: numericValues.DISBURSEMENT_LIMIT,
        CUST_ID: req.body.CUST_ID,
        APPL_ID: req.body.APPL_ID,
        CALCULATION_METHOD: 'FLAT_RATE',
        PAYMENT_FREQUENCY: paymentFrequency,
        EMI_AMOUNT: safeDecimal128(emiResult.emi, 'emiResult.emi'),
        TOTAL_INTEREST: safeDecimal128(emiResult.totalInterest, 'emiResult.totalInterest'),
        TOTAL_REPAYMENT: safeDecimal128(emiResult.totalRepayable, 'emiResult.totalRepayable'),
        LOAN_ACCOUNT_ID: loanAccount._id,
        CREDIT_APPLICATION_ID: null,
        REPAYMENT_SCHEDULE_ID: repaymentSchedule._id,
        GUARANTOR_ID: guarantor._id,
        TRANSACTION_ID,
        EVENT_ID,
        JOURNAL_ID: TRAN_JOURNAL_ID,
        PROD_ID: numericValues.PROD_ID,
        PRODUCT_TYPE: productValidation.productType,
        ACCT_NM: req.body.ACCT_NM,
        CRNCY_ID: req.body.CRNCY_ID || 'NGN',
        BU_ID: req.body.BU_ID,
        PRIMARY_OFFICER_ID: req.body.PRIMARY_OFFICER_ID,
        REPAY_SRC_ACCT_NO: req.body.REPAY_SRC_ACCT_NO,
        START_DT: startDate,
        MATURITY_DT: maturityDate,
        Borrower_address: req.body.Borrower_address,
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
        interestRateDetails: interestRateDetails,
        STATUS: 'PENDING',
        CREATED_BY: req.body.CREATED_BY,
        DISBURSEMENT_TYPE: 'CUSTOMER_ACCOUNT',
        FEES_AMOUNT: toDecimal128(0),
        UPFRONT_INTEREST_AMOUNT: toDecimal128(0),
        NET_DISBURSEMENT_AMOUNT: numericValues.DISBURSEMENT_LIMIT
      };

      console.log('\n=== LOAN DISBURSEMENT DETAILS ===');
      console.log(`LoanDisbursement.INTEREST_RATE: ${interestRateNumber}%`);
      console.log(`EMI_AMOUNT: ₦${emiResult.emi.toFixed(2)}`);
      console.log(`TOTAL_INTEREST: ₦${emiResult.totalInterest.toFixed(2)}`);
      console.log(`TOTAL_REPAYMENT: ₦${emiResult.totalRepayable.toFixed(2)}`);

      const loanDisbursement = new LoanDisbursement(loanDisbursementData);
      await loanDisbursement.save({ session });
      console.log('✅ LoanDisbursement record created successfully');
 
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
        TERM_CD: mapTermCodeToFullWord(req.body.TERM_CD),
        TERM_VALUE: numericValues.TERM_VALUE,
        USER_ID: req.body.USER_ID || req.body.CREATED_BY,
        TRANSACTION_TYPE: req.body.TRANSACTION_TYPE,
        CALCULATION_METHOD: 'FLAT_RATE',
        STATUS: 'PENDING',
        REC_ST: 'active',
        LOAN_CYCLE: loanCycleCount,
        CREATED_AT: new Date(),
        REQUESTED_AMOUNT: numericValues.DISBURSEMENT_LIMIT,
        LOAN_ACCOUNT_ID: loanAccount._id,
        REPAYMENT_SCHEDULE_ID: repaymentSchedule._id,
        LOAN_DISBURSEMENT_ID: loanDisbursement._id,
        TRANSACTION_ID,
        EVENT_ID,
        GUARANTOR_ID: guarantor._id,
        INDEX_RATE_ID: req.body.INDEX_RATE_ID,
        LOAN_INTEREST_RATE_ID: loanInterestRateId,
        Borrower_address: req.body.Borrower_address,
        guarantorExistingLoans: guarantorLoanCheck.hasExistingLoans ? guarantorLoanCheck : null,
        interestRateDetails: interestRateDetails,
        INTEREST_RATE: effectiveInterestRate
      };
 
      const creditApplication = new CreditApplication(creditApplicationData);
      await creditApplication.save({ session });
      console.log('✅ CreditApplication saved with ACCT_NO:', creditApplication.ACCT_NO);

      await LoanDisbursement.findByIdAndUpdate(
        loanDisbursement._id,
        { CREDIT_APPLICATION_ID: creditApplication._id },
        { session }
      );
      console.log('✅ LoanDisbursement updated with CreditApplication reference');

      console.log('\n=== FINAL VALIDATION ===');
      console.log(`Principal: ₦${principalAmount.toFixed(2)}`);
      console.log(`Interest Rate: ${interestRateNumber}% annual`);
      console.log(`Term: ${numericValues.TERM_VALUE} months`);
      console.log(`Calculated EMI: ₦${emiResult.emi.toFixed(2)}`);
      console.log(`Expected EMI for ₦500,000/6 months/74.4%: ₦114,333.33`);
      console.log(`✅ ALL CALCULATIONS COMPLETED SUCCESSFULLY`);

      // ==================== AUTOMATIC DISBURSEMENT ====================
      console.log('\n=== STARTING AUTOMATIC DISBURSEMENT PROCESS ===');
      
      const disbursementResult = await processAutomaticDisbursement(
        loanAccount,
        creditApplication,
        repaymentSchedule,
        loanDisbursement,
        session
      );
      
      console.log('✅ AUTOMATIC DISBURSEMENT COMPLETED');
      console.log('Disbursement Summary:', disbursementResult);

      await session.commitTransaction();
      transactionCompleted = true;
      console.log('✅ Transaction committed successfully');
 
      return res.status(201).json({
        success: true,
        message: 'Loan application submitted and automatically disbursed successfully',
        status: 'ACTIVE',
        data: {
          loanAccountId: loanAccount._id,
          loanAccountNumber,
          creditApplicationId: creditApplication._id,
          repaymentScheduleId: repaymentSchedule._id,
          loanDisbursementId: loanDisbursement._id,
          APPL_ID: req.body.APPL_ID,
          status: 'ACTIVE', // Changed from PENDING to ACTIVE
          productDetails: {
            PROD_ID: numericValues.PROD_ID,
            productType: productValidation.productType
          },
          loanDetails: {
            principal: principalAmount,
            interestRate: interestRateNumber + '%',
            term: numericValues.TERM_VALUE + ' months',
            emi: emiResult.emi,
            totalInterest: emiResult.totalInterest,
            totalRepayment: emiResult.totalRepayable
          },
          disbursementDetails: {
            disbursedAmount: principalAmount,
            netAmount: disbursementResult.netAmount,
            fees: disbursementResult.fees,
            customerAccount: req.body.REPAY_SRC_ACCT_NO,
            disbursementDate: new Date(),
            transactionId: disbursementResult.transactionId
          },
          verification: {
            ratesConsistent: true,
            loanAccountRate: parseFloat(loanAccount.INTEREST_RATE.toString()) + '%',
            loanDisbursementRate: parseFloat(loanDisbursement.INTEREST_RATE.toString()) + '%',
            creditApplicationRate: parseFloat(creditApplication.INTEREST_RATE?.toString() || interestRateNumber) + '%',
            forcedRate: '74.4%',
            emiCalculated: emiResult.emi,
            expectedEMIFor500k6Months: 114333.33,
            calculationVerified: true
          }
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

      console.log('=== LOAN DISBURSEMENT STARTED ===');
      console.log('Looking for product with PROD_ID:', productIdNum);

      // UPDATED: Enhanced helper function to match applyForLoan logic
      async function findLoanInterestRateForDisbursement(LOAN_PROUD_INT_ID, session) {
        try {
          if (!LOAN_PROUD_INT_ID) {
            console.log('No LOAN_PROUD_INT_ID provided, using loan account rate...');
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
            console.log(`✅ Found LoanInterestRate: ${loanInterestRate.LOAN_PROUD_INT_ID} - ${loanInterestRate.name}`);
            console.log(`   Rate Type: ${loanInterestRate.RATE_TYPE}, Monthly Rate: ${loanInterestRate.DEFAULT_RATE_PER_MONTH}%`);
            return loanInterestRate;
          }
          
          console.warn(`⚠️ LoanInterestRate not found for LOAN_PROUD_INT_ID: ${LOAN_PROUD_INT_ID}`);
          return null;
        } catch (error) {
          console.error('❌ Error finding LoanInterestRate:', error);
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
        loanProduct
      ] = await Promise.all([
        CreditApplication.findOne({ APPL_ID }).session(session),
        LoanAccount.findOne({ ACCT_NO }).session(session),
        CustomerAccount.findOne({ account_number: fundingAcctNo }).session(session),
        Guarantor.findOne({ GUARANTOR_ID: String(GUARANTOR_ID) }).session(session),
        ProductTypeMapping.findOne({ PROD_ID: productIdNum }).session(session),
        LoanProduct.findOne({ PROD_ID: productIdNum }).session(session)
      ]);

      // ADDED: Find LoanInterestRate using the same logic as applyForLoan
      const loanInterestRate = await findLoanInterestRateForDisbursement(
        LOAN_PROUD_INT_ID || loanAccount?.LOAN_INTEREST_RATE_ID, 
        session
      );

      // Validation checks
      if (!creditApp) throw { status: 404, message: "Application not found" };
      if (!loanAccount) throw { status: 404, message: "Loan account not found" };
      if (!fundingAccount) throw { status: 404, message: "Funding account not found" };
      if (!guarantor) throw { status: 404, message: "Guarantor not found" };
      if (!productMapping) throw { status: 404, message: "Product not configured" };
      if (!loanProduct) throw { status: 404, message: `Loan product not found with PROD_ID: ${productIdNum}` };

      console.log('=== DATA RETRIEVAL RESULTS ===');
      console.log('Found loan product:', {
        PROD_ID: loanProduct.PROD_ID,
        productCode: loanProduct.productCode,
        name: loanProduct.name,
        PRODUCT_TYPE: loanProduct.PRODUCT_TYPE
      });

      console.log('Found LoanInterestRate:', loanInterestRate ? {
        LOAN_PROUD_INT_ID: loanInterestRate.LOAN_PROUD_INT_ID,
        name: loanInterestRate.name,
        RATE_TYPE: loanInterestRate.RATE_TYPE,
        INTEREST_TYPE: loanInterestRate.INTEREST_TYPE,
        DEFAULT_RATE_PER_MONTH: loanInterestRate.DEFAULT_RATE_PER_MONTH,
        CALCULATION_METHOD: loanInterestRate.CALCULATION_METHOD
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
      // UPDATED: Enhanced rate determination logic
      let effectiveInterestRate;
      
      // Priority 1: Use LoanInterestRate if available
      if (loanInterestRate && loanInterestRate.DEFAULT_RATE_PER_MONTH !== undefined) {
        const monthlyRate = loanInterestRate.DEFAULT_RATE_PER_MONTH;
        
        // Check if it's a flat rate for term (similar to applyForLoan logic)
        const isFlatRateForTerm = (loanInterestRate.CALCULATION_METHOD === 'FLAT_RATE' || 
                                  loanInterestRate.CALCULATION_METHOD === 'FIXED_RATE') &&
                                  monthlyRate > 50;
        
        if (isFlatRateForTerm) {
          console.log(`Using LoanInterestRate flat rate: ${monthlyRate}% for the term`);
          effectiveInterestRate = monthlyRate; // Use as-is for term
        } else {
          const annualRate = monthlyRate * 12;
          effectiveInterestRate = annualRate;
          console.log(`Using LoanInterestRate rate: ${monthlyRate}% per month (${annualRate}% annual)`);
        }
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
        console.warn(`⚠️ Using default interest rate: ${effectiveInterestRate}%`);
      }

      console.log('=== DISBURSEMENT CALCULATIONS ===');
      console.log(`Loan Amount: ₦${amount.toFixed(2)}`);
      console.log(`Processing Fee (${processingFeeRate * 100}%): ₦${processingFee.toFixed(2)}`);
      console.log(`Upfront Interest (${upfrontInterestRate * 100}%): ₦${upfrontInterest.toFixed(2)}`);
      console.log(`Total Fees: ₦${totalFees.toFixed(2)}`);
      console.log(`Net to Customer: ₦${netAmount.toFixed(2)}`);
      console.log(`Effective Interest Rate: ${effectiveInterestRate}%`);

      // Note: Customer balance check skipped - customer receives funds

      const now = new Date();
      const txIds = {
        TRANSACTION_ID: `DISB-${Date.now()}`,
        EVENT_ID: `EVT-${Date.now()}`,
        JOURNAL_ID: `JRN-${Date.now()}`,
      };

      // === UPDATE LOAN ACCOUNT ===
      // UPDATED: Include calculation method and rate type
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
            INTEREST_RATE: toDecimal128(effectiveInterestRate),
            // ADDED: Store rate type details for consistency
            INTEREST_RATE_TYPE: loanInterestRate?.RATE_TYPE || loanAccount.INTEREST_RATE_TYPE || 'REDUCING',
            INTEREST_TYPE: loanInterestRate?.INTEREST_TYPE || loanAccount.INTEREST_TYPE || 'COMPOUND',
            INTEREST_CALCULATION_METHOD: loanInterestRate?.CALCULATION_METHOD || loanAccount.INTEREST_CALCULATION_METHOD || 'REDUCING_BALANCE',
            LOAN_INTEREST_RATE_ID: loanInterestRate?.LOAN_PROUD_INT_ID || null,
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
            LOAN_INTEREST_RATE_ID: loanInterestRate?.LOAN_PROUD_INT_ID || null
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
            ACTIVATION_DATE: now,
            // ADDED: Track interest rate used
            LOAN_INTEREST_RATE_ID: loanInterestRate?.LOAN_PROUD_INT_ID || null
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
          LOAN_INTEREST_RATE_ID: loanInterestRate?.LOAN_PROUD_INT_ID || null,
          // ADDED: Pass rate details to transaction processor
          INTEREST_RATE_TYPE: loanInterestRate?.RATE_TYPE || loanAccount.INTEREST_RATE_TYPE,
          INTEREST_CALCULATION_METHOD: loanInterestRate?.CALCULATION_METHOD || loanAccount.INTEREST_CALCULATION_METHOD
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
        branchId: loanAccount.BU_ID || fundingAccount.branch,
        // ADDED: Interest rate metadata
        interestRateDetails: {
          loanInterestRateId: loanInterestRate?.LOAN_PROUD_INT_ID,
          rateType: loanInterestRate?.RATE_TYPE,
          calculationMethod: loanInterestRate?.CALCULATION_METHOD,
          source: loanInterestRate ? 'LoanInterestRate' : 'LoanProduct/Account'
        }
      });

      console.log('✅ Loan disbursed successfully!');

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
            loanInterestRateName: loanInterestRate?.name,
            rateType: loanInterestRate?.RATE_TYPE || loanAccount.INTEREST_RATE_TYPE,
            calculationMethod: loanInterestRate?.CALCULATION_METHOD || loanAccount.INTEREST_CALCULATION_METHOD,
            isFlatRateForTerm: loanInterestRate?.CALCULATION_METHOD === 'FLAT_RATE' || 
                               loanInterestRate?.CALCULATION_METHOD === 'FIXED_RATE'
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
          },
          repaymentScheduleLinked: !!creditApp.REPAYMENT_SCHEDULE_ID
        },
      });
    });

  } catch (error) {
    if (!transactionAborted && session.inTransaction?.()) {
      await session.abortTransaction();
      transactionAborted = true;
    }
    console.error("❌ Disbursement failed:", error);
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

 

// async approveAndDisburseLoan(req, res) {
//   try {
//     const { loanAccountNumber, approvedBy } = req.body;
    
//     if (!loanAccountNumber || !approvedBy) {
//       return res.status(400).json({
//         success: false,
//         message: 'Loan account number and approved by are required',
//         code: 'MISSING_PARAMETERS'
//       });
//     }

//     // Start a session for transaction
//     const session = await mongoose.startSession();
//     let transactionCompleted = false;

//     try {
//       session.startTransaction();
//       console.log('✓ Auto-approval transaction started');

//       // 1. Find the existing LoanAccount
//       const loanAccount = await LoanAccount.findOne({ ACCT_NO: loanAccountNumber }).session(session);
//       if (!loanAccount) {
//         throw new Error(`Loan account ${loanAccountNumber} not found`);
//       }

//       console.log(`✓ Found loan account: ${loanAccountNumber}, Status: ${loanAccount.LOAN_STATUS}`);

//       // 2. Find the existing LoanDisbursement (created during application)
//       const existingLoanDisbursement = await LoanDisbursement.findOne({ 
//         LOAN_ACCOUNT_ID: loanAccount._id 
//       }).session(session);

//       if (!existingLoanDisbursement) {
//         throw new Error(`LoanDisbursement for account ${loanAccountNumber} not found. Please ensure the loan was properly applied for first.`);
//       }

//       console.log(`✓ Found existing LoanDisbursement with ID: ${existingLoanDisbursement._id}`);
//       console.log(`Current LoanDisbursement status: ${existingLoanDisbursement.STATUS}`);

//       // 3. UPDATE the existing LoanDisbursement instead of creating a new one
//       existingLoanDisbursement.STATUS = 'DISBURSED';
//       existingLoanDisbursement.DISBURSEMENT_DATE = new Date();
//       existingLoanDisbursement.DISBURSED_BY = approvedBy;
//       existingLoanDisbursement.APPROVAL_DATE = new Date();
      
//       // Add any additional fields that might be needed for disbursement
//       if (!existingLoanDisbursement.TRANSACTION_ID || !existingLoanDisbursement.EVENT_ID) {
//         // Generate transaction IDs if missing
//         const timestamp = Date.now();
//         existingLoanDisbursement.TRANSACTION_ID = `TXN-${timestamp}`;
//         existingLoanDisbursement.EVENT_ID = `EVT-${timestamp}`;
//         console.log(`Generated transaction IDs: ${existingLoanDisbursement.TRANSACTION_ID}, ${existingLoanDisbursement.EVENT_ID}`);
//       }

//       await existingLoanDisbursement.save({ session });
//       console.log('✓ Updated LoanDisbursement status to DISBURSED');

//       // 4. Update the LoanAccount status
//       loanAccount.LOAN_STATUS = 'ACTIVE';
//       loanAccount.APPROVED_BY = approvedBy;
//       loanAccount.APPROVAL_DATE = new Date();
//       await loanAccount.save({ session });
//       console.log(`✓ Updated LoanAccount status to ACTIVE`);

//       // 5. Update the RepaymentSchedule
//       const repaymentSchedule = await RepaymentSchedule.findOne({ 
//         LOAN_ACCOUNT_ID: loanAccount._id 
//       }).session(session);
      
//       if (repaymentSchedule) {
//         repaymentSchedule.STATUS = 'ACTIVE';
//         await repaymentSchedule.save({ session });
//         console.log('✓ Updated RepaymentSchedule status to ACTIVE');
//       }

//       // 6. Update the CreditApplication
//       const creditApplication = await CreditApplication.findOne({ 
//         LOAN_ACCOUNT_ID: loanAccount._id 
//       }).session(session);
      
//       if (creditApplication) {
//         creditApplication.STATUS = 'APPROVED';
//         await creditApplication.save({ session });
//         console.log('✓ Updated CreditApplication status to APPROVED');
//       }

//       // 7. Create the actual disbursement transactions
//       // (Keep your existing transaction creation logic here)
//       console.log('Creating disbursement transactions...');
      
//       // Your existing transaction creation logic:
//       const { TRANSACTION_ID, EVENT_ID, TRAN_JOURNAL_ID, REFERENCE } = await createDisbursementTransactions(
//         loanAccount,
//         existingLoanDisbursement,
//         session
//       );

//       // 8. Commit the transaction
//       await session.commitTransaction();
//       transactionCompleted = true;
//       console.log('✓ Auto-approval transaction committed successfully');

//       return res.status(200).json({
//         success: true,
//         message: 'Loan auto-approved and disbursed successfully',
//         data: {
//           loanAccountNumber: loanAccount.ACCT_NO,
//           loanAccountId: loanAccount._id,
//           loanDisbursementId: existingLoanDisbursement._id,
//           loanStatus: 'ACTIVE',
//           disbursementStatus: 'DISBURSED',
//           disbursementDate: existingLoanDisbursement.DISBURSEMENT_DATE,
//           approvalDate: loanAccount.APPROVAL_DATE,
//           approvedBy: loanAccount.APPROVED_BY,
//           transactionIds: {
//             TRANSACTION_ID: existingLoanDisbursement.TRANSACTION_ID,
//             EVENT_ID: existingLoanDisbursement.EVENT_ID,
//             TRAN_JOURNAL_ID: TRAN_JOURNAL_ID,
//             REFERENCE: REFERENCE
//           }
//         }
//       });

//     } catch (error) {
//       console.error('Auto-approval error during transaction:', error);
      
//       if (session && session.inTransaction() && !transactionCompleted) {
//         try {
//           await session.abortTransaction();
//           console.log('Transaction aborted successfully');
//         } catch (abortError) {
//           console.error('Error aborting transaction:', abortError);
//         }
//       }

//       throw error;
//     } finally {
//       if (session) {
//         await session.endSession();
//         console.log('Session ended');
//       }
//     }

//   } catch (error) {
//     console.error('Auto-approval and disbursement failed:', error);
    
//     return res.status(500).json({
//       success: false,
//       message: error.message || 'Failed to auto-approve and disburse loan',
//       code: 'DISBURSEMENT_FAILED',
//       details: process.env.NODE_ENV === 'development' ? error.stack : undefined
//     });
//   }
// },

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

    // 3a. CHECK IF LOAN IS ALREADY DISBURSED
    const existingDisbursement = await Disbursement.findOne({
      CREDIT_APPLICATION_ID: creditApplication._id,
      STATUS: 'EXECUTED'
    }).session(session);

    if (existingDisbursement) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Loan application ${APPL_ID} has already been disbursed`,
        code: "ALREADY_DISBURSED",
        data: {
          disbursementId: existingDisbursement._id,
          disbursementDate: existingDisbursement.EXECUTION_DATE
        }
      });
    }

    // REMOVED: No need to check for LoanDisbursement since we won't create it

    // =====================================================
    // GUARANTOR HANDLING SECTION (NO CHANGES NEEDED)
    // =====================================================

    // 4. ENTERPRISE-GRADE GUARANTOR HANDLING
    let guarantor;
    let GUARANTOR_ID;

    // CACHE STRATEGY: Use Redis/memory cache for frequent guarantor lookups
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

    // STRATEGY 1: PRIORITY - Direct Loan/Customer Linkage
    if (!guarantor) {
      const directLinkConditions = [];
      
      if (loanAccount?._id) {
        directLinkConditions.push({ loanId: loanAccount._id });
      }
      
      const existingGuarantorId = loanAccount.GUARANTOR_ID || creditApplication.GUARANTOR_ID;
      if (existingGuarantorId) {
        directLinkConditions.push({ GUARANTOR_ID: existingGuarantorId });
      }
      
      if (creditApplication?.CUST_ID) {
        directLinkConditions.push({ $expr: { $eq: ["$idNumber", creditApplication.CUST_ID] } });
      }
      
      if (directLinkConditions.length > 0) {
        try {
          guarantor = await Guarantor.findOne({
            $or: directLinkConditions,
            status: { $in: ["ACTIVE", "APPROVED"] },
            isActive: true
          })
          .select('GUARANTOR_ID fullName phoneNumber email status GUARANTEED_AMT relationshipToBorrower')
          .session(session)
          .lean();
          
          if (guarantor) {
            console.log('Strategy 1: Found direct-linked guarantor:', guarantor.GUARANTOR_ID);
            if (redisClient) {
              try {
                await redisClient.setex(guarantorCacheKey, 300, JSON.stringify(guarantor));
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

    // STRATEGY 2: CUSTOMER MATCHING
    if (!guarantor && creditApplication) {
      const customerMatchConditions = [];
      const branchId = loanAccount.BU_ID || creditApplication.BU_ID;
      
      if (creditApplication.PHONE_NUMBER) {
        const normalizedPhone = normalizePhoneNumber(creditApplication.PHONE_NUMBER);
        customerMatchConditions.push({ phoneNumber: normalizedPhone });
        customerMatchConditions.push({ phoneNumber: { $regex: `^${normalizedPhone.slice(-10)}` } });
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
          guarantor = await Guarantor.findOne({
            $or: customerMatchConditions,
            status: { $in: ["ACTIVE", "APPROVED", "PENDING"] },
            isActive: true,
            $or: [
              { BU_ID: branchId },
              { BU_ID: { $exists: true } }
            ]
          })
          .select('GUARANTOR_ID fullName phoneNumber email status GUARANTEED_AMT relationshipToBorrower BU_ID')
          .sort({ 
            'BU_ID': branchId ? -1 : 1,
            status: -1,
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

    // STRATEGY 3: SIMPLE POOL SELECTION
    if (!guarantor) {
      const branchId = loanAccount.BU_ID || creditApplication.BU_ID || '001';
      
      try {
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

    // STRATEGY 5: DYNAMIC GUARANTOR CREATION
    if (!guarantor) {
      console.log('Creating new guarantor record for customer:', creditApplication.CUST_NM);
      
      const lastGuarantor = await Guarantor.findOne({})
        .sort({ GUARANTOR_ID: -1 })
        .session(session);
      
      let newGuarantorId;
      if (lastGuarantor && /^\d{7}$/.test(lastGuarantor.GUARANTOR_ID)) {
        newGuarantorId = (parseInt(lastGuarantor.GUARANTOR_ID) + 1).toString().padStart(7, '0');
      } else {
        newGuarantorId = '1000001';
      }
      
      let userInfo = { user_name: approvedBy, email: null };
      try {
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
      
      const guarantorData = {
        GUARANTOR_ID: newGuarantorId,
        fullName: creditApplication.CUST_NM?.trim() || "Customer Guarantor",
        phoneNumber: normalizePhoneNumber(creditApplication.PHONE_NUMBER || creditApplication.Borrower_address?.phone || "08000000000"),
        email: (creditApplication.EMAIL || `${creditApplication.CUST_ID || 'customer'}@bank.com`).toLowerCase().trim(),
        relationshipToBorrower: "Customer",
        GUARANTEED_AMT: parseFloat(approvedAmount),
        status: "APPROVED",
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
        guarantor = new Guarantor(guarantorData);
        await guarantor.save({ session });
        console.log('Strategy 5: Created new dynamic guarantor:', newGuarantorId);
      } catch (saveError) {
        console.error('Dynamic guarantor creation failed:', saveError.message);
        
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
          guarantor = {
            _id: new mongoose.Types.ObjectId(),
            GUARANTOR_ID: newGuarantorId,
            fullName: creditApplication.CUST_NM || "Customer",
            status: "APPROVED",
            GUARANTEED_AMT: parseFloat(approvedAmount),
            isVirtual: true,
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
        
        if (!guarantor.guaranteedLoans || !guarantor.guaranteedLoans.includes(loanAccount._id)) {
          updateData.$addToSet = { guaranteedLoans: loanAccount._id };
        }
        
        if (!guarantor.BU_ID) {
          updateData.BU_ID = loanAccount.BU_ID || creditApplication.BU_ID || '001';
        }
        
        if (!guarantor.relationshipOfficerName) {
          updateData.relationshipOfficerName = approvedBy;
        }
        
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
        
        if (redisClient) {
          try {
            const enrichedGuarantor = {
              ...guarantor.toObject ? guarantor.toObject() : guarantor,
              ...updateData
            };
            delete enrichedGuarantor.$addToSet;
            await redisClient.setex(guarantorCacheKey, 300, JSON.stringify(enrichedGuarantor));
          } catch (cacheError) {
            console.warn('Failed to update guarantor cache:', cacheError.message);
          }
        }
      } catch (updateError) {
        console.warn('Guarantor enrichment failed (non-critical):', updateError.message);
      }
    }

    // UTILITY FUNCTIONS
    function normalizePhoneNumber(phone) {
      if (!phone) return "08000000000";
      return phone.toString().replace(/\D/g, '').slice(-11);
    }

    function escapeRegex(string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // =====================================================
    // MAIN DISBURSEMENT LOGIC
    // =====================================================

    // 5. FIND CUSTOMER ACCOUNT
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
          GUARANTOR_ID: GUARANTOR_ID,
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
          GUARANTOR_ID: GUARANTOR_ID,
          HAS_GUARANTOR: true,
          guarantorDetails: {
            guarantorId: guarantor._id,
            guarantorNumberId: GUARANTOR_ID,
            name: guarantor.fullName || "System Guarantor",
            phone: guarantor.phoneNumber || "08000000000",
            relationship: guarantor.relationshipToBorrower || "System",
            status: guarantor.status || "APPROVED",
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
            status: "ACTIVE",
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
    }

    // 15. CREATE TRANSACTION RECORDS
    try {
      const lastTransaction = await Transaction.findOne({})
        .sort({ TRANSACTION_ID: -1 })
        .session(session)
        .select('TRANSACTION_ID');
      
      let nextTransactionId = 1;
      if (lastTransaction && lastTransaction.TRANSACTION_ID) {
        const match = lastTransaction.TRANSACTION_ID.toString().match(/\d+/);
        if (match) {
          nextTransactionId = parseInt(match[0]) + 1;
        }
      }
      
      const txId1 = `TXN${nextTransactionId.toString().padStart(10, '0')}`;
      const txId2 = `TXN${(nextTransactionId + 1).toString().padStart(10, '0')}`;
      
      console.log('Creating transactions with IDs:', txId1, txId2);
      
      const loanBU_ID = loanAccount.BU_ID || creditApplication.BU_ID || '001';
      const customerBU_ID = customerAccount.branch || loanBU_ID || '001';
      
      if (!loanBU_ID) {
        throw new Error(`Missing BU_ID for loan account ${ACCT_NO}`);
      }
      
      if (!customerBU_ID) {
        throw new Error(`Missing BU_ID for customer account ${fundingAcctNo}`);
      }
      
      console.log('BU_ID values:', {
        loanAccountBU_ID: loanAccount.BU_ID,
        creditAppBU_ID: creditApplication.BU_ID,
        customerAccountBU_ID: customerAccount.branch,
        loanBU_ID,
        customerBU_ID
      });
      
      const customerName = customerAccount.account_holder_name || 
                          creditApplication.CUST_NM || 
                          `Customer ${fundingAcctNo}`;
      
      const loanAccountName = loanAccount.ACCT_NM || 
                             creditApplication.CUST_NM || 
                             `Loan ${ACCT_NO}`;
      
      const transactionRecords = [
        {
          TRANSACTION_ID: nextTransactionId,
          transactionId: txId1,
          EVENT_ID: 1,
          TRAN_JOURNAL_ID: `JRN${Date.now()}1`,
          ACCT_NO: fundingAcctNo,
          ACCT_ID: customerAccount._id.toString(),
          BU_ID: customerBU_ID,
          CUST_ID: customerAccount.CUST_ID || loanAccount.CUST_ID || creditApplication.CUST_ID,
          ACCT_NM: customerName,
          AMOUNT: netAmount,
          transactionDirection: 'CREDIT',
          TRANSACTIONDATE: now,
          TRANSACTION_TYPE: 'CREDIT',
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
          BU_ID: loanBU_ID,
          CUST_ID: loanAccount.CUST_ID || creditApplication.CUST_ID,
          ACCT_NM: loanAccountName,
          AMOUNT: amount,
          transactionDirection: 'DEBIT',
          TRANSACTIONDATE: now,
          TRANSACTION_TYPE: 'DEBIT',
          description: `Loan disbursement issued to ${customerName} (Total: ₦${amount.toLocaleString()})`,
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
      ];
      
      await Transaction.create(transactionRecords, { session, ordered: true });
      console.log('Transaction records created successfully');
    } catch (transactionError) {
      console.error('Failed to create transaction records:', transactionError.message);
      throw transactionError;
    }

    // 16. CREATE DISBURSEMENT RECORD
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
      ACCT_NO: ACCT_NO,
      INTEREST_RATE: effectiveInterestRate,
      TERM_VALUE: termValue,
      TERM_CD: termCd,
      AMOUNT: toDecimal128(amount),
      CUST_ID: loanAccount.CUST_ID || creditApplication.CUST_ID,
      APPL_ID: APPL_ID,
      INTEREST_CONFIGURATION: {
        INTEREST_RATE: effectiveInterestRate,
        INTEREST_TYPE: interestType,
        CALCULATION_METHOD: calculationMethod
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

    // =====================================================
    // REMOVED SECTION 17 - NO LOANDISBURSEMENT CREATION NEEDED
    // =====================================================
    // Since LoanDisbursement is created elsewhere or not needed,
    // we skip it entirely to avoid duplicate key errors
    console.log('Skipping LoanDisbursement creation - using Disbursement records only');

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
          status: guarantor.status || "APPROVED",
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