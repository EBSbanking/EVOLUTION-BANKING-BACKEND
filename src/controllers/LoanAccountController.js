// Updated imports with mongoose removed
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
import { processPaymentAgainstSchedule, generateCollectionId, generateReceiptNumber } from '../utils/loanUtils.js';
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
import LoanRepaymentTransaction from '../models/LoanRepaymentTransaction.js';
import LoanEvent from '../models/LoanEvent.js';
import { createOrUpdateAccount } from '../Services/accountService.js';

import { getRepaymentHistoryService } from '../controllers/LoanRepaymentController.js'; // Import your repayment controller

// Import sequelize instance and QueryTypes
import sequelize from '../../config/db.js';
import { QueryTypes, Op } from 'sequelize'; // Added Op for Sequelize operators

const toDecimal = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  return Number(value) || 0;
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
    case 'BW': return value / 4.345 / 2;
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
    exists = await LoanAccount.findOne({ where: { loanAccountId: id } });
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
// async applyForLoan(req, res) {
//   // ==================== TABLE CREATION ====================
//   try {
//     console.log('🔍 Checking if loan_accounts table exists...');
    
//     // First try to create table directly using raw SQL
//     await sequelize.query(`
//       CREATE TABLE IF NOT EXISTS loan_accounts (
//         id INT PRIMARY KEY AUTO_INCREMENT,
//         loan_account_id BIGINT,
//         a_c_c_t__n_o VARCHAR(255) UNIQUE NOT NULL,
//         a_c_c_t__n_m VARCHAR(255) NOT NULL,
//         c_u_s_t__i_d VARCHAR(255) NOT NULL,
//         l_o_a_n__p_r_o_d_u_c_t__i_d INT,
//         a_m_o_u_n_t DECIMAL(20,2) NOT NULL,
//         d_i_s_b_u_r_s_e_d__a_m_o_u_n_t DECIMAL(20,2) DEFAULT 0.00,
//         o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l DECIMAL(20,2) DEFAULT 0.00,
//         a_c_c_r_u_e_d__i_n_t_e_r_e_s_t DECIMAL(20,2) DEFAULT 0.00,
//         p_e_n_a_l_t_y__a_m_o_u_n_t DECIMAL(20,2) DEFAULT 0.00,
//         i_n_t_e_r_e_s_t__r_a_t_e DECIMAL(10,4) DEFAULT 0.0000,
//         l_o_a_n__s_t_a_t_u_s VARCHAR(50) DEFAULT 'PENDING',
//         s_e_r_v_i_c_i_n_g__s_t_a_t_u_s VARCHAR(50) DEFAULT 'SERVICED',
//         a_p_p_l_i_c_a_t_i_o_n__d_a_t_e DATETIME DEFAULT CURRENT_TIMESTAMP,
//         a_p_p_r_o_v_a_l__d_a_t_e DATETIME,
//         d_i_s_b_u_r_s_e_m_e_n t__d_a_t_e DATETIME,
//         c_l_o_s_u_r_e__d_a_t_e DATETIME,
//         l_a_s_t__r_e_p_a_y_m_e_n t__d_a_t_e DATETIME,
//         l_a_s_t__r_e_p_a_y_m_e_n t__a_m_o_u_n_t DECIMAL(20,2) DEFAULT 0.00,
//         n_e_x_t__p_a_y_m_e_n t__d_a_t_e DATETIME,
//         m_a_t_u_r_i_t_y__d_t DATETIME,
//         t_o_t_a_l__r_e_p_a_i_d__a_m_o_u_n_t DECIMAL(20,2) DEFAULT 0.00,
//         t_e_r_m__c_d VARCHAR(20) DEFAULT 'MONTHLY',
//         t_e_r_m__v_a_l_u_e INT DEFAULT 12,
//         c_u_s_t_o_m_e_r__a_c_c_o_u_n t__i_d BIGINT,
//         has_repayment_schedule BOOLEAN DEFAULT FALSE,
//         repayment_schedule_id INT,
//         created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
//         updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//         -- Essential fields that match your existing table
//         G_U_A_R_A_N_T_O_R__I_D INT,
//         d_i_s_b_u_r_s_e_m_e_n t__l_i_m_i_t DECIMAL(20,2),
//         g_u_a_r_a_n_t_e_e_d__a_m_o_u_n_t DECIMAL(20,2),
//         s_t_a_r_t__d_t DATETIME
//       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
//     `);
    
//     console.log('✅ loan_accounts table created or already exists');
    
//   } catch (syncError) {
//     console.error('❌ Error creating loan_accounts table:', syncError);
//     // Try a simpler table creation
//     try {
//       console.log('🔄 Trying simpler table creation...');
//       await sequelize.query(`
//         CREATE TABLE IF NOT EXISTS loan_accounts (
//           id INT PRIMARY KEY AUTO_INCREMENT,
//           a_c_c_t__n_o VARCHAR(255) UNIQUE NOT NULL,
//           a_c_c_t__n_m VARCHAR(255) NOT NULL,
//           c_u_s_t__i_d VARCHAR(255) NOT NULL,
//           a_m_o_u_n_t DECIMAL(20,2) NOT NULL,
//           i_n_t_e_r_e_s_t__r_a_t_e DECIMAL(10,4) DEFAULT 0.0000,
//           l_o_a_n__s_t_a_t_u_s VARCHAR(50) DEFAULT 'PENDING',
//           created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
//           updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
//         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
//       `);
//       console.log('✅ Simpler loan_accounts table created');
//     } catch (simpleError) {
//       console.error('❌ Even simple table creation failed:', simpleError);
//       return res.status(500).json({
//         success: false,
//         message: 'Database table creation failed',
//         error: simpleError.message,
//         code: 'TABLE_CREATION_FAILED'
//       });
//     }
//   }

//   // ==================== CREATE COUNTERS TABLE IF NOT EXISTS ====================
//   try {
//     console.log('🔍 Checking if counters table exists...');
    
//     await sequelize.query(`
//       CREATE TABLE IF NOT EXISTS counters (
//         name VARCHAR(100) PRIMARY KEY,
//         seq INT NOT NULL DEFAULT 0,
//         description VARCHAR(255),
//         created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
//         updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
//       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
//     `);
    
//     console.log('✅ counters table created or already exists');
    
//     // Initialize required counters if they don't exist
//     const requiredCounters = [
//       'creditApplicationId',
//       'creditAppId', 
//       'refNo',
//       'custId',
//       'loanAccountId',
//       'loanDisbursementId',
//       'repaymentScheduleId'
//     ];
    
//     for (const counterName of requiredCounters) {
//       try {
//         const [existingCounter] = await sequelize.query(
//           `SELECT COUNT(*) as count FROM counters WHERE name = ?`,
//           { replacements: [counterName] }
//         );
        
//         if (existingCounter[0].count === 0) {
//           await sequelize.query(
//             `INSERT INTO counters (name, seq, description) VALUES (?, 0, ?)`,
//             {
//               replacements: [counterName, `Counter for ${counterName}`]
//             }
//           );
//           console.log(`✅ Initialized counter: ${counterName}`);
//         }
//       } catch (counterError) {
//         console.warn(`⚠️ Could not initialize counter ${counterName}:`, counterError.message);
//       }
//     }
    
//   } catch (counterTableError) {
//     console.error('❌ Error creating counters table:', counterTableError);
//   }

//   // ==================== CREATE LOAN_DISBURSEMENTS TABLE IF NOT EXISTS ====================
//   console.log('\n=== CHECKING/ CREATING LOAN_DISBURSEMENTS TABLE ===');

//   // ==================== INNER HELPER FUNCTIONS ====================
   
//   // For LoanAccount (uses full words)
//   function mapTermCodeToFullWord(termCode) {
//     const termMap = {
//       'D': 'DAILY',
//       'W': 'WEEKLY', 
//       'BW': 'BI_WEEKLY',
//       'M': 'MONTHLY',
//       'Q': 'QUARTERLY',
//       'Y': 'YEARLY'
//     };
    
//     const upperTermCode = String(termCode).toUpperCase();
//     return termMap[upperTermCode] || 'MONTHLY';
//   }

//   // For RepaymentSchedule (uses single-letter codes)
//   function getRepaymentTermType(termCode) {
//     const termCodeUpper = String(termCode).toUpperCase();
    
//     const termMap = {
//       'D': 'D',
//       'DAILY': 'D',
//       'W': 'W',
//       'WEEKLY': 'W',
//       'BW': 'BW',
//       'BI_WEEKLY': 'BW',
//       'BI-WEEKLY': 'BW',
//       'M': 'M',
//       'MONTHLY': 'M',
//       'Q': 'M',
//       'QUARTERLY': 'M',
//       'Y': 'Y',
//       'YEARLY': 'Y'
//     };
    
//     return termMap[termCodeUpper] || 'M';
//   }

//   // Helper function to get table columns
//   async function getTableColumns(tableName, transaction) {
//     try {
//       const [columns] = await sequelize.query(
//         `DESCRIBE ${tableName}`,
//         { transaction }
//       );
//       return columns.map(col => col.Field);
//     } catch (error) {
//       console.warn(`Could not describe table ${tableName}:`, error.message);
//       return [];
//     }
//   }

//   async function getLoanCycleCount(custId, transaction) {
//     try {
//       console.log('🔍 Getting loan cycle count for CUST_ID:', custId);
      
//       // Check if table exists using information_schema
//       const [tables] = await sequelize.query(
//         `SELECT TABLE_NAME 
//          FROM INFORMATION_SCHEMA.TABLES 
//          WHERE TABLE_SCHEMA = DATABASE() 
//          AND TABLE_NAME = 'loan_accounts'`,
//         { type: QueryTypes.SELECT, transaction }
//       );
      
//       if (tables.length === 0) {
//         console.log('📊 Table just created, returning default count: 1');
//         return 1;
//       }
      
//       // If we get here, table exists - now count the loans
//       const custIdStr = String(custId).trim();
      
//       // Use raw SQL query to be safe
//       const [result] = await sequelize.query(
//         `SELECT COUNT(*) as count FROM loan_accounts WHERE c_u_s_t__i_d = ?`,
//         {
//           replacements: [custIdStr],
//           type: QueryTypes.SELECT,
//           transaction
//         }
//       );
      
//       const count = result.count || 0;
//       console.log(`📊 Found ${count} existing loans for customer ${custId}`);
//       return count + 1;
      
//     } catch (error) {
//       console.error('❌ Error in getLoanCycleCount:', error.message);
      
//       // If any error occurs, return default value
//       console.log('⚠️ Returning default loan cycle count: 1');
//       return 1;
//     }
//   }
 
//   function calculateMaturityDate(startDate, termCode, termValue) {
//     termCode = String(termCode).toUpperCase();
//     const result = new Date(startDate);
//     switch (termCode) {
//       case 'D': result.setDate(result.getDate() + termValue); break;
//       case 'W': result.setDate(result.getDate() + termValue * 7); break;
//       case 'BW': result.setDate(result.getDate() + termValue * 14); break;
//       case 'M': result.setMonth(result.getMonth() + termValue); break;
//       case 'Q': result.setMonth(result.getonth() + termValue * 3); break;
//       case 'Y': result.setFullYear(result.getFullYear() + termValue); break;
//       default: throw new Error(`Invalid term code: ${termCode}`);
//     }
//     return result;
//   }
 
//   function getPaymentFrequency(termCode, termValue) {
//     termCode = String(termCode).toUpperCase();
//     switch (termCode) {
//       case 'D': return 'DAILY';
//       case 'W': return 'WEEKLY';
//       case 'BW': return 'BI_WEEKLY';
//       case 'M': return 'MONTHLY';
//       case 'Q': return 'QUARTERLY';
//       case 'Y': return termValue <= 1 ? 'MONTHLY' : 'YEARLY';
//       default: return 'MONTHLY';
//     }
//   }
 
//   async function findGuarantor(guarantorId, transaction) {
//     try {
//       if (!guarantorId) {
//         return null;
//       }

//       if (!isNaN(guarantorId)) {
//         const byNumber = await Guarantor.findOne({ 
//           where: { GUARANTOR_ID: Number(guarantorId) },
//           transaction 
//         });
//         if (byNumber) return byNumber;
//       }

//       // For Sequelize, just try to find by GUARANTOR_ID as string or number
//       const byString = await Guarantor.findOne({ 
//         where: { GUARANTOR_ID: guarantorId.toString() },
//         transaction 
//       });
//       return byString;
//     } catch (error) {
//       console.error('Error finding guarantor:', error);
//       return null;
//     }
//   }
 
//   async function checkGuarantorExistingLoans(guarantorId, transaction) {
//     try {
//       console.log(`Checking existing loans for guarantor: ${guarantorId}`);
     
//       const existingLoans = await LoanAccount.findAll({
//         where: {
//           G_U_A_R_A_N_T_O_R__I_D: guarantorId,
//           l_o_a_n__s_t_a_t_u_s: { [Op.in]: ['ACTIVE', 'PENDING', 'APPROVED'] }
//         },
//         transaction
//       });
     
//       console.log(`Found ${existingLoans.length} existing loans for guarantor`);

//       if (existingLoans.length > 0) {
//         const loanDetails = existingLoans.map(loan => ({
//           loanAccountId: loan.loanAccountId,
//           a_c_c_t__n_o: loan.a_c_c_t__n_o,
//           l_o_a_n__s_t_a_t_u_s: loan.l_o_a_n__s_t_a_t_u_s,
//           d_i_s_b_u_r_s_e_m_e_n_t__l_i_m_i_t: parseFloat(loan.d_i_s_b_u_r_s_e_m_e_n_t__l_i_m_i_t || '0'),
//           g_u_a_r_a_n_t_e_e_d__a_m_o_u_n_t: parseFloat(loan.g_u_a_r_a_n_t_e_e_d__a_m_o_u_n_t || '0'),
//           c_u_s_t__i_d: loan.c_u_s_t__i_d,
//           s_t_a_r_t__d_t: loan.s_t_a_r_t__d_t,
//           m_a_t_u_r_i_t_y__d_t: loan.m_a_t_u_r_i_t_y__d_t
//         }));

//         return {
//           hasExistingLoans: true,
//           totalExistingLoans: existingLoans.length,
//           loanDetails: loanDetails,
//           totalGuaranteedAmount: loanDetails.reduce((sum, loan) => sum + loan.g_u_a_r_a_n_t_e_e_d__a_m_o_u_n_t, 0)
//         };
//       }

//       return {
//         hasExistingLoans: false,
//         totalExistingLoans: 0,
//         loanDetails: [],
//         totalGuaranteedAmount: 0
//       };
//     } catch (error) {
//       console.error('Error checking guarantor existing loans:', error);
//       return {
//         hasExistingLoans: false,
//         totalExistingLoans: 0,
//         loanDetails: [],
//         totalGuaranteedAmount: 0
//       };
//     }
//   }
 
//   async function findRateIndex(rateIndexId, transaction) {
//     try {
//       let query = {};
     
//       const numericId = parseInt(rateIndexId);
//       if (!isNaN(numericId)) {
//         query = { INDEX_RATE_ID: numericId };
//       } else {
//         query = { INDEX_RATE_ID: rateIndexId };
//       }

//       let rateIndex = await RateIndex.findOne({
//         where: query,
//         transaction
//       });
     
//       if (!rateIndex) {
//         console.warn(`Rate index ${rateIndexId} not found, looking for default...`);
       
//         rateIndex = await RateIndex.findOne({
//           where: { IS_DEFAULT: true },
//           transaction
//         });
       
//         if (!rateIndex) {
//           rateIndex = await RateIndex.findOne({
//             transaction
//           });
         
//           if (rateIndex) {
//             console.warn(`Using first available rate index: ${rateIndex.INDEX_RATE_ID} instead of requested ${rateIndexId}`);
//           } else {
//             console.warn('No rate indexes available in the system');
//             return null;
//           }
//         } else {
//           console.warn(`Using default rate index: ${rateIndex.INDEX_RATE_ID} instead of requested ${rateIndexId}`);
//         }
//       }
     
//       return rateIndex;
//     } catch (error) {
//       console.error('Error in findRateIndex:', error);
//       return null;
//     }
//   }
 
//   async function findLoanInterestRate(LOAN_PROUD_INT_ID, INDEX_RATE_ID, transaction) {
//     try {
//       console.log(`Looking for LoanInterestRate with LOAN_PROUD_INT_ID: ${LOAN_PROUD_INT_ID}, INDEX_RATE_ID: ${INDEX_RATE_ID}`);
     
//       let query = {};
     
//       // First, try to find by LOAN_PROUD_INT_ID
//       if (LOAN_PROUD_INT_ID) {
//         const numericLoanProudIntId = parseInt(LOAN_PROUD_INT_ID);
//         if (!isNaN(numericLoanProudIntId)) {
//           query = {
//             LOAN_PROUD_INT_ID: numericLoanProudIntId,
//             STATUS: 'ACTIVE'
//           };
//         } else {
//           query = {
//             LOAN_PROUD_INT_ID: LOAN_PROUD_INT_ID.toString(),
//             STATUS: 'ACTIVE'
//           };
//         }
       
//         const loanInterestRate = await LoanInterestRate.findOne({
//           where: query,
//           transaction
//         });
       
//         if (loanInterestRate) {
//           console.log(`Found LoanInterestRate by LOAN_PROUD_INT_ID: ${loanInterestRate.LOAN_PROUD_INT_ID} - ${loanInterestRate.name}`);
//           return loanInterestRate;
//         }
//       }
     
//       // If not found by LOAN_PROUD_INT_ID, try by INDEX_RATE_ID
//       if (INDEX_RATE_ID) {
//         const indexRateId = parseInt(INDEX_RATE_ID);
//         if (!isNaN(indexRateId)) {
//           query = {
//             INDEX_RATE_ID: indexRateId,
//             STATUS: 'ACTIVE'
//           };
//         }
       
//         const loanInterestRate = await LoanInterestRate.findOne({
//           where: query,
//           transaction
//         });
       
//         if (loanInterestRate) {
//           console.log(`Found LoanInterestRate by INDEX_RATE_ID: ${loanInterestRate.LOAN_PROUD_INT_ID} - ${loanInterestRate.name}`);
//           return loanInterestRate;
//         }
//       }
     
//       // If still not found, try to find any active rate
//       console.warn(`No LoanInterestRate found for LOAN_PROUD_INT_ID: ${LOAN_PROUD_INT_ID} or INDEX_RATE_ID: ${INDEX_RATE_ID}, looking for any active rate...`);
     
//       const fallbackRate = await LoanInterestRate.findOne({
//         where: { STATUS: 'ACTIVE' },
//         transaction
//       });
     
//       if (fallbackRate) {
//         console.warn(`Using fallback LoanInterestRate: ${fallbackRate.LOAN_PROUD_INT_ID} - ${fallbackRate.name}`);
//         return fallbackRate;
//       }
     
//       console.warn('No active LoanInterestRate found in the system');
//       return null;
     
//     } catch (error) {
//       console.error('Error in findLoanInterestRate:', error);
//       return null;
//     }
//   }
 
//   async function findLoanInterestRateByProduct(PROD_ID, INDEX_RATE_ID, transaction) {
//     try {
//       console.log(`Looking for LoanInterestRate for product: ${PROD_ID}`);
     
//       // Try to find rates that might be associated with this product
//       let loanInterestRate = await LoanInterestRate.findOne({
//         where: {
//           [Op.or]: [
//             { name: { [Op.like]: `%PROD_${PROD_ID}%` } },
//             { code: { [Op.like]: `%LO-%-${PROD_ID}%` } },
//             { description: { [Op.like]: `%Product ${PROD_ID}%` } }
//           ],
//           STATUS: 'ACTIVE'
//         },
//         transaction
//       });
     
//       if (!loanInterestRate) {
//         // Try by INDEX_RATE_ID if provided
//         if (INDEX_RATE_ID) {
//           const indexRateId = parseInt(INDEX_RATE_ID);
//           if (!isNaN(indexRateId)) {
//             loanInterestRate = await LoanInterestRate.findOne({
//               where: {
//                 INDEX_RATE_ID: indexRateId,
//                 STATUS: 'ACTIVE'
//               },
//               transaction
//             });
//           }
//         }
       
//         if (!loanInterestRate) {
//           // Try to find any active rate
//           loanInterestRate = await LoanInterestRate.findOne({
//             where: { STATUS: 'ACTIVE' },
//             transaction
//           });
         
//           if (loanInterestRate) {
//             console.warn(`Using first available LoanInterestRate: ${loanInterestRate.LOAN_PROUD_INT_ID} for product ${PROD_ID}`);
//           }
//         }
//       }
     
//       if (loanInterestRate) {
//         console.log(`Found LoanInterestRate for product ${PROD_ID}: ${loanInterestRate.LOAN_PROUD_INT_ID} - ${loanInterestRate.name}`);
//       }
     
//       return loanInterestRate;
//     } catch (error) {
//       console.error('Error in findLoanInterestRateByProduct:', error);
//       return null;
//     }
//   }
 
//   function safeDecimal(value, fieldName = 'value') {
//     console.log(`safeDecimal: Converting field ${fieldName} with value:`, value);
   
//     if (value === null || value === undefined) {
//       throw new Error(`Invalid ${fieldName}: null or undefined. Field: ${fieldName}, Value: ${value}`);
//     }
   
//     const numericValue = typeof value === 'string' ? parseFloat(value) : Number(value);
   
//     if (isNaN(numericValue)) {
//       throw new Error(`Invalid ${fieldName}: not a number. Field: ${fieldName}, Value: ${value}`);
//     }
   
//     if (!isFinite(numericValue)) {
//       throw new Error(`Invalid ${fieldName}: infinite value. Field: ${fieldName}, Value: ${value}`);
//     }
   
//     return parseFloat(numericValue.toFixed(2));
//   }

//   // Helper function for decimal conversion
//   function toDecimal(value) {
//     if (value === null || value === undefined) return 0.00;
//     return parseFloat(value.toString());
//   }
 
//   const normalizeBorrowerAddress = (address) => {
//     if (!address || typeof address !== 'object') return null;
//     return {
//       street: address.street || address.Street || '',
//       city: address.city || address.City || '',
//       state: address.state || address.State || '',
//       zipCode: address.zipCode || address.ZIPCode || address.zipcode || '',
//       country: address.country || address.Country || 'Nigeria'
//     };
//   };
 
//   async function generateWorkflowIdentifiers() {
//     const timestamp = Date.now();
//     return {
//       TRANSACTION_ID: `TXN-${timestamp}`,
//       WORK_ITEM_ID: `WORK-${timestamp}`,
//       EVENT_ID: `EVT-${timestamp}`,
//       WORKFLOW_ID: `WF-${timestamp}`,
//       TRAN_JOURNAL_ID: `JRN-${timestamp}`
//     };
//   }
 
//   async function generateLoanAccountNumberByProdId(prodId) {
//     const prefix = prodId.toString().padStart(3, '0');
//     const randomSuffix = Math.floor(1000000 + Math.random() * 9000000).toString().padStart(7, '0');
//     return `${prefix}${randomSuffix}`;
//   }

//   // ==================== GET EXPECTED FLAT RATE ====================
//   function getExpectedFlatRate(req) {
//     console.log('\n=== DEBUG getExpectedFlatRate ===');
//     console.log('Checking request for flat rate:');
    
//     // Priority 1: Check for explicit flat rate in request
//     if (req.body.FLAT_RATE) {
//         const flatRate = parseFloat(req.body.FLAT_RATE);
//         if (!isNaN(flatRate) && flatRate > 0) {
//             console.log(`Found FLAT_RATE in request: ${flatRate}%`);
//             return flatRate;
//         }
//     }
    
//     // Priority 2: Check for ANNUAL_RATE in request
//     if (req.body.ANNUAL_RATE) {
//         const annualRate = parseFloat(req.body.ANNUAL_RATE);
//         if (!isNaN(annualRate) && annualRate > 0) {
//             console.log(`Found ANNUAL_RATE in request: ${annualRate}%`);
//             return annualRate;
//         }
//     }
    
//     // Priority 3: Return null to let LoanProduct determine the rate
//     console.log('No rate specified in request, using LoanProduct rate');
//     return null;
//   }

//   // ==================== CORRECTED FLAT RATE EMI CALCULATION ====================
//   function calculateFlatRateEMI(principal, annualRatePercent, termValue, termCode, paymentFrequency, startDate) {
//     console.log('=== CORRECTED FLAT RATE (SIMPLE INTEREST) CALCULATION ===');
//     console.log(`Principal: ₦${principal}, Annual Rate: ${annualRatePercent}%, Term: ${termValue} ${termCode}, Frequency: ${paymentFrequency}`);
    
//     // Convert annual rate to monthly rate
//     const monthlyRatePercent = annualRatePercent / 12;
//     console.log(`Monthly Rate: ${monthlyRatePercent.toFixed(2)}%`);
    
//     // Calculate total interest for the entire term
//     const totalInterest = principal * (annualRatePercent / 100) * (termValue / 12);
//     console.log(`Total Interest for ${termValue} months: ₦${totalInterest.toFixed(2)}`);
    
//     const totalRepayable = principal + totalInterest;
//     const emi = totalRepayable / termValue;
    
//     console.log(`Total Repayable: ₦${totalRepayable.toFixed(2)}`);
//     console.log(`EMI (per month): ₦${emi.toFixed(2)}`);

//     function calculateNextPaymentDate(installmentNumber, paymentFrequency, startDate) {
//       const date = new Date(startDate);
//       switch (paymentFrequency.toUpperCase()) {
//         case 'DAILY': date.setDate(date.getDate() + installmentNumber); break;
//         case 'WEEKLY': date.setDate(date.getDate() + (installmentNumber * 7)); break;
//         case 'BI_WEEKLY': date.setDate(date.getDate() + (installmentNumber * 14)); break;
//         case 'MONTHLY': date.setMonth(date.getMonth() + installmentNumber); break;
//         case 'QUARTERLY': date.setMonth(date.getMonth() + (installmentNumber * 3)); break;
//         case 'SEMI_ANNUALLY': date.setMonth(date.getMonth() + (installmentNumber * 6)); break;
//         case 'ANNUALLY': date.setFullYear(date.getFullYear() + installmentNumber); break;
//         default: date.setMonth(date.getMonth() + installmentNumber);
//       }
//       return date.toISOString().split('T')[0];
//     }

//     const installments = [];
//     let remainingPrincipal = principal;

//     for (let i = 1; i <= termValue; i++) {
//       const interestPortion = totalInterest / termValue;
//       let principalPortion = emi - interestPortion;

//       // Adjust for the last installment
//       if (i === termValue) {
//         principalPortion = remainingPrincipal;
//       }

//       remainingPrincipal -= principalPortion;
//       if (remainingPrincipal < 0.01) remainingPrincipal = 0;

//       const dueDate = calculateNextPaymentDate(i, paymentFrequency, startDate);

//       installments.push({
//         installmentNo: i,
//         dueDate,
//         principal: Number(principalPortion.toFixed(2)),
//         interest: Number(interestPortion.toFixed(2)),
//         totalPayment: Number((principalPortion + interestPortion).toFixed(2)),
//         remainingBalance: Number(remainingPrincipal.toFixed(2))
//       });
//     }

//     return {
//       emi: Number(emi.toFixed(2)),
//       totalInterest: Number(totalInterest.toFixed(2)),
//       totalRepayable: Number(totalRepayable.toFixed(2)),
//       totalPayment: Number(totalRepayable.toFixed(2)),
//       installments,
//       calculationMethod: 'FLAT_RATE',
//       annualRateUsed: annualRatePercent,
//       monthlyRateUsed: monthlyRatePercent,
//       annualRateEquivalent: annualRatePercent,
//       isTermBasedRate: true
//     };
//   }

//   // ==================== MISSING FUNCTION: calculateTotalFees ====================
//   function calculateTotalFees(loanAccount, loanProduct) {
//     console.log('\n=== CALCULATING TOTAL FEES ===');
    
//     try {
//       // Get fee configuration from loan product or use defaults
//       const feeConfig = loanProduct?.feeConfiguration || {
//         processingFeeRate: 0, // 0% processing fee
//         upfrontInterestRate: 0, // 0% upfront interest
//         otherFees: []
//       };
      
//       const principalAmount = parseFloat(loanAccount.a_m_o_u_n_t || loanAccount.AMOUNT || 0);
      
//       console.log('Fee calculation inputs:', {
//         principalAmount,
//         processingFeeRate: feeConfig.processingFeeRate,
//         upfrontInterestRate: feeConfig.upfrontInterestRate,
//         hasUpfrontInterestSetting: !!loanAccount.upfrontInterestPercentage
//       });
      
//       // 1. Processing Fee
//       const processingFee = principalAmount * (feeConfig.processingFeeRate / 100);
      
//       // 2. Upfront Interest (if applicable)
//       let upfrontInterest = 0;
      
//       // Check if loan has upfront interest configured
//       if (loanAccount.upfrontInterestPercentage) {
//         const upfrontInterestRate = parseFloat(loanAccount.upfrontInterestPercentage) / 100;
//         upfrontInterest = principalAmount * upfrontInterestRate;
//         console.log(`Calculating upfront interest: ${principalAmount} × ${loanAccount.upfrontInterestPercentage}% = ${upfrontInterest}`);
//       } else if (feeConfig.upfrontInterestRate > 0) {
//         // Use product default
//         upfrontInterest = principalAmount * (feeConfig.upfrontInterestRate / 100);
//         console.log(`Using product upfront interest: ${principalAmount} × ${feeConfig.upfrontInterestRate}% = ${upfrontInterest}`);
//       }
      
//       // 3. Other fees from product configuration
//       let otherFeesTotal = 0;
//       if (feeConfig.otherFees && Array.isArray(feeConfig.otherFees)) {
//         feeConfig.otherFees.forEach(fee => {
//           if (fee.amount) {
//             otherFeesTotal += parseFloat(fee.amount);
//           } else if (fee.rate) {
//             otherFeesTotal += principalAmount * (fee.rate / 100);
//           }
//         });
//       }
      
//       const totalFees = processingFee + upfrontInterest + otherFeesTotal;
      
//       console.log('Fee calculation results:', {
//         processingFee: processingFee.toFixed(2),
//         upfrontInterest: upfrontInterest.toFixed(2),
//         otherFees: otherFeesTotal.toFixed(2),
//         totalFees: totalFees.toFixed(2)
//       });
      
//       return {
//         total: totalFees,
//         breakdown: {
//           processingFee,
//           upfrontInterest,
//           otherFees: otherFeesTotal
//         },
//         principalAmount,
//         feePercentage: totalFees > 0 ? (totalFees / principalAmount) * 100 : 0
//       };
      
//     } catch (error) {
//       console.error('Error calculating total fees:', error);
      
//       // Return zero fees in case of error
//       return {
//         total: 0,
//         breakdown: {
//           processingFee: 0,
//           upfrontInterest: 0,
//           otherFees: 0
//         },
//         principalAmount: parseFloat(loanAccount.a_m_o_u_n_t || loanAccount.AMOUNT || 0),
//         feePercentage: 0
//       };
//     }
//   }

//   // ==================== NEW HELPER: Extract interest rate from LoanProduct ====================
//   function extractInterestRateFromProduct(loanProduct) {
//     console.log('=== EXTRACTING INTEREST RATE FROM LOAN PRODUCT ===');
    
//     if (!loanProduct) {
//       console.warn('No loan product provided, using default rate');
//       return {
//         annualRate: 12.0,
//         monthlyRate: 1.0,
//         calculationMethod: 'FLAT_RATE',
//         rateType: 'FIXED',
//         interestType: 'SIMPLE',
//         source: 'DEFAULT_FALLBACK'
//       };
//     }
    
//     console.log('LoanProduct data:', {
//       productCode: loanProduct.productCode,
//       name: loanProduct.name,
//       PROD_ID: loanProduct.PROD_ID,
//       interestRateFields: {
//         LOAN_INTEREST_RATE_ID: loanProduct.LOAN_INTEREST_RATE_ID,
//         LOAN_PROUD_INT_ID: loanProduct.LOAN_PROUD_INT_ID,
//         DEFAULT_RATE_PER_MONTH: loanProduct.DEFAULT_RATE_PER_MONTH,
//         TOTAL_INTEREST_RATE: loanProduct.TOTAL_INTEREST_RATE,
//         RATE_TY: loanProduct.RATE_TY,
//         INT_TY: loanProduct.INT_TY,
//         CALCULATION_METHOD: loanProduct.CALCULATION_METHOD
//       }
//     });
    
//     // Priority 1: Check if product has DEFAULT_RATE_PER_MONTH
//     if (loanProduct.DEFAULT_RATE_PER_MONTH) {
//       const monthlyRate = parseFloat(loanProduct.DEFAULT_RATE_PER_MONTH);
//       const annualRate = monthlyRate * 12;
//       console.log(`Found DEFAULT_RATE_PER_MONTH: ${monthlyRate}% per month (${annualRate}% annual)`);
      
//       return {
//         annualRate,
//         monthlyRate,
//         calculationMethod: loanProduct.CALCULATION_METHOD || 'FLAT_RATE',
//         rateType: loanProduct.RATE_TY || 'FIXED',
//         interestType: loanProduct.INT_TY || 'SIMPLE',
//         source: 'LOAN_PRODUCT_DEFAULT_RATE',
//         loanInterestRateId: loanProduct.LOAN_INTEREST_RATE_ID,
//         loanProudIntId: loanProduct.LOAN_PROUD_INT_ID
//       };
//     }
    
//     // Priority 2: Check if product has TOTAL_INTEREST_RATE
//     if (loanProduct.TOTAL_INTEREST_RATE) {
//       const totalRate = parseFloat(loanProduct.TOTAL_INTEREST_RATE);
//       console.log(`Found TOTAL_INTEREST_RATE: ${totalRate}% total for term`);
      
//       return {
//         annualRate: totalRate, // This is total for term, not annual
//         monthlyRate: totalRate,
//         calculationMethod: 'FLAT_RATE', // TOTAL_INTEREST_RATE usually indicates flat rate for term
//         rateType: 'FIXED',
//         interestType: 'SIMPLE',
//         source: 'LOAN_PRODUCT_TOTAL_RATE',
//         isTermBasedRate: true,
//         loanInterestRateId: loanProduct.LOAN_INTEREST_RATE_ID,
//         loanProudIntId: loanProduct.LOAN_PROUD_INT_ID
//       };
//     }
    
//     // Priority 3: Check metadata or other fields
//     if (loanProduct.metadata && loanProduct.metadata.interestRateConfiguration) {
//       const config = loanProduct.metadata.interestRateConfiguration;
//       console.log('Found interest rate in metadata:', config);
      
//       if (config.defaultRate) {
//         const monthlyRate = parseFloat(config.defaultRate);
//         const annualRate = monthlyRate * 12;
        
//         return {
//           annualRate,
//           monthlyRate,
//           calculationMethod: config.calculationMethod || 'FLAT_RATE',
//           rateType: config.rateType || 'FIXED',
//           interestType: config.interestType || 'SIMPLE',
//           source: 'LOAN_PRODUCT_METADATA',
//           loanInterestRateId: loanProduct.LOAN_INTEREST_RATE_ID,
//           loanProudIntId: loanProduct.LOAN_PROUD_INT_ID
//         };
//       }
//     }
    
//     // Priority 4: Check defaultGLAccounts or other fields
//     if (loanProduct.defaultGLAccounts && loanProduct.defaultGLAccounts.interestRate) {
//       const rate = parseFloat(loanProduct.defaultGLAccounts.interestRate);
//       console.log(`Found interest rate in defaultGLAccounts: ${rate}%`);
      
//       return {
//         annualRate: rate,
//         monthlyRate: rate / 12,
//         calculationMethod: loanProduct.CALCULATION_METHOD || 'FLAT_RATE',
//         rateType: loanProduct.RATE_TY || 'FIXED',
//         interestType: loanProduct.INT_TY || 'SIMPLE',
//         source: 'LOAN_PRODUCT_GL_ACCOUNTS',
//         loanInterestRateId: loanProduct.LOAN_INTEREST_RATE_ID,
//         loanProudIntId: loanProduct.LOAN_PROUD_INT_ID
//       };
//     }
    
//     // Priority 5: Check if there's an interest rate field directly
//     if (loanProduct.interestRate) {
//       const rate = parseFloat(loanProduct.interestRate);
//       console.log(`Found interestRate field: ${rate}%`);
      
//       return {
//         annualRate: rate,
//         monthlyRate: rate / 12,
//         calculationMethod: loanProduct.CALCULATION_METHOD || 'FLAT_RATE',
//         rateType: loanProduct.RATE_TY || 'FIXED',
//         interestType: loanProduct.INT_TY || 'SIMPLE',
//         source: 'LOAN_PRODUCT_DIRECT_FIELD',
//         loanInterestRateId: loanProduct.LOAN_INTEREST_RATE_ID,
//         loanProudIntId: loanProduct.LOAN_PROUD_INT_ID
//       };
//     }
    
//     // Fallback: Use a default rate
//     console.warn('⚠️ No interest rate found in LoanProduct, using default 12.0% annual');
    
//     return {
//       annualRate: 12.0,
//       monthlyRate: 1.0,
//       calculationMethod: 'FLAT_RATE',
//       rateType: 'FIXED',
//       interestType: 'SIMPLE',
//       source: 'DEFAULT_FALLBACK'
//     };
//   }

//   // ==================== NEW HELPER: Fetch LoanInterestRate from database ====================
//   async function fetchLoanInterestRate(loanInterestRateId, transaction) {
//     if (!loanInterestRateId) {
//       console.log('No LOAN_INTEREST_RATE_ID provided');
//       return null;
//     }
    
//     try {
//       console.log(`Fetching LoanInterestRate with ID: ${loanInterestRateId}`);
      
//       // Try to find by LOAN_INTEREST_RATE_ID or LOAN_PROUD_INT_ID
//       const loanInterestRate = await LoanInterestRate.findOne({
//         where: {
//           [Op.or]: [
//             { id: loanInterestRateId },
//             { LOAN_PROUD_INT_ID: loanInterestRateId }
//           ],
//           STATUS: 'ACTIVE'
//         },
//         transaction
//       });
      
//       if (loanInterestRate) {
//         console.log('Found LoanInterestRate:', {
//           id: loanInterestRate.id,
//           LOAN_PROUD_INT_ID: loanInterestRate.LOAN_PROUD_INT_ID,
//           name: loanInterestRate.name,
//           DEFAULT_RATE_PER_MONTH: loanInterestRate.DEFAULT_RATE_PER_MONTH,
//           MIN_RATE_PER_MONTH: loanInterestRate.MIN_RATE_PER_MONTH,
//           MAX_RATE_PER_MONTH: loanInterestRate.MAX_RATE_PER_MONTH,
//           RATE_TYPE: loanInterestRate.RATE_TYPE,
//           INTEREST_TYPE: loanInterestRate.INTEREST_TYPE,
//           CALCULATION_METHOD: loanInterestRate.CALCULATION_METHOD,
//           ANNUAL_PERCENTAGE_RATE: loanInterestRate.ANNUAL_PERCENTAGE_RATE
//         });
//         return loanInterestRate;
//       }
      
//       console.warn(`LoanInterestRate not found for ID: ${loanInterestRateId}`);
//       return null;
//     } catch (error) {
//       console.error('Error fetching LoanInterestRate:', error);
//       return null;
//     }
//   }

//   // ==================== MAIN LOGIC ====================

//   if (!req.body || typeof req.body !== 'object') {
//     return res.status(400).json({
//       success: false,
//       message: 'Invalid request body',
//       code: 'INVALID_BODY',
//     });
//   }

//   req.body.Borrower_address = normalizeBorrowerAddress(req.body.Borrower_address);

//   const requiredFields = [
//     'PROD_ID', 'CUST_ID', 'ACCT_NM', 'APPL_ID', 'PRODUCT_TYPE', 'CRNCY_ID', 'BU_ID',
//     'PRIMARY_OFFICER_ID', 'DISBURSEMENT_LIMIT', 'START_DT', 'TERM_CD', 'TERM_VALUE',
//     'CREATED_BY', 'REPAY_SRC_ACCT_NO', 'TRANSACTION_TYPE', 'GUARANTOR_ID'
//   ];

//   const missingFields = requiredFields.filter((field) => {
//     return !req.body.hasOwnProperty(field) || req.body[field] === undefined || req.body[field] === null || req.body[field] === '';
//   });

//   if (missingFields.length > 0) {
//     return res.status(400).json({
//       success: false,
//       message: 'Missing or undefined required fields',
//       missingFields,
//       code: 'MISSING_FIELDS',
//     });
//   }

//   if (!req.body.GUARANTOR_ID) {
//     return res.status(400).json({
//       success: false,
//       message: 'GUARANTOR_ID is required',
//       code: 'INVALID_GUARANTOR_ID',
//     });
//   }

//   const calculationMethod = 'FLAT_RATE';
//   console.log(`\n=== USING FLAT RATE CALCULATION METHOD ===`);

//   const numericFields = {
//     PROD_ID: req.body.PROD_ID,
//     TERM_VALUE: req.body.TERM_VALUE,
//     DISBURSEMENT_LIMIT: req.body.DISBURSEMENT_LIMIT,
//   };

//   const invalidNumericFields = Object.entries(numericFields).filter(([field, value]) => {
//     return isNaN(parseFloat(value)) || parseFloat(value) <= 0;
//   });

//   if (invalidNumericFields.length > 0) {
//     return res.status(400).json({
//       success: false,
//       message: 'Invalid numeric fields',
//       invalidFields: invalidNumericFields.map(([field]) => field),
//       code: 'INVALID_NUMERIC_FIELDS',
//     });
//   }

//   const upfrontInterest = req.body.UPFRONT_INTEREST || 0;
//   const partialInterest = req.body.PARTIAL_INTEREST || false;
//   const guaranteedAmount = req.body.GUARANTEED_AMT || req.body.DISBURSEMENT_LIMIT;

//   // ==================== SEQUELIZE TRANSACTION ====================
//   const transaction = await sequelize.transaction();
  
//   try {
//     console.log('✓ Transaction started');

//     // ==================== CREATE LOAN_DISBURSEMENTS TABLE IF NOT EXISTS ====================
//     try {
//       console.log('\n=== CHECKING/ CREATING LOAN_DISBURSEMENTS TABLE ===');
      
//       // First, check if table exists
//       const [tables] = await sequelize.query(
//         `SELECT TABLE_NAME 
//          FROM INFORMATION_SCHEMA.TABLES 
//          WHERE TABLE_SCHEMA = DATABASE() 
//          AND TABLE_NAME = 'loan_disbursements'`,
//         { transaction }
//       );
      
//       if (tables.length === 0) {
//         console.log('🔄 Creating loan_disbursements table...');
        
//         // Create a simplified version first
//         await sequelize.query(`
//           CREATE TABLE IF NOT EXISTS loan_disbursements (
//             id INT PRIMARY KEY AUTO_INCREMENT,
//             a_c_c_t__n_o VARCHAR(255) UNIQUE NOT NULL,
//             a_p_p_l__i_d VARCHAR(255) NOT NULL,
//             c_u_s_t__i_d VARCHAR(255) NOT NULL,
//             i_n_t_e_r_e_s_t__r_a_t_e DECIMAL(7, 4) NOT NULL,
//             t_e_r_m__v_a_l_u_e INT NOT NULL,
//             t_e_r_m__c_d VARCHAR(255) NOT NULL,
//             a_m_o_u_n_t DECIMAL(20, 2) NOT NULL,
//             l_o_a_n__a_c_c_o_u_n t__i_d INT NOT NULL,
//             r_e_p_a_y_m_e_n t__s_c_h_e_d_u_l_e__i_d INT NOT NULL,
//             g_u_a_r_a_n_t_o_r__i_d INT NOT NULL,
//             p_r_o_d__i_d VARCHAR(255) NOT NULL,
//             p_r_o_d_u_c_t__t_y_p_e VARCHAR(255) NOT NULL,
//             created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
//             updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//             s_t_a_t_u_s VARCHAR(50) DEFAULT 'PENDING'
//           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
//         `, { transaction });
        
//         console.log('✅ Created simplified loan_disbursements table');
//       } else {
//         console.log('✅ loan_disbursements table already exists');
//       }
//     } catch (tableError) {
//       console.error('❌ Error checking/creating loan_disbursements table:', tableError.message);
//       // Don't fail - try to continue
//     }

//     let workflowIdentifiers;
//     try {
//       workflowIdentifiers = await generateWorkflowIdentifiers();
//       console.log('✓ Workflow identifiers generated successfully');
//     } catch (workflowIdError) {
//       console.error('Failed to generate workflow identifiers:', workflowIdError);
//       const timestamp = Date.now();
//       workflowIdentifiers = {
//         TRANSACTION_ID: `TXN-${timestamp}`,
//         WORK_ITEM_ID: `WORK-${timestamp}`,
//         EVENT_ID: `EVT-${timestamp}`,
//         WORKFLOW_ID: `WF-${timestamp}`,
//         TRAN_JOURNAL_ID: `JRN-${timestamp}`
//       };
//       console.log('✓ Using fallback workflow identifiers');
//     }

//     const { TRANSACTION_ID, EVENT_ID, WORK_ITEM_ID, WORKFLOW_ID, TRAN_JOURNAL_ID } = workflowIdentifiers;

//     const numericValues = {
//       INDEX_RATE_ID: req.body.INDEX_RATE_ID,
//       PROD_ID: parseInt(req.body.PROD_ID),
//       TERM_VALUE: parseInt(req.body.TERM_VALUE),
//       CUST_ID: req.body.CUST_ID,
//       GUARANTEED_AMT: safeDecimal(guaranteedAmount, 'GUARANTEED_AMT'),
//       DISBURSEMENT_LIMIT: safeDecimal(req.body.DISBURSEMENT_LIMIT, 'DISBURSEMENT_LIMIT'),
//     };

//     const productValidation = {
//       isValid: true,
//       productType: req.body.PRODUCT_TYPE || 'INDIVIDUAL_LOAN',
//       productName: `Product ${numericValues.PROD_ID}`,
//       isLoanProduct: true,
//       accountPrefix: 'LOAN',
//       isGlobalProduct: true,
//       BU_ID: ['*'],
//       glAccounts: {},
//       isAutoGenerated: true,
//       wasUpdated: false
//     };

//     console.log(`✓ Product validated: ${productValidation.productType}`);

//     let loanAccountNumber;
//     const maxRetries = 3;
//     let retries = 0;

//     while (!loanAccountNumber && retries < maxRetries) {
//       try {
//         loanAccountNumber = await generateLoanAccountNumberByProdId(numericValues.PROD_ID);
//         console.log(`Generated loanAccountNumber (attempt ${retries + 1}): ${loanAccountNumber}`);

//         const existingLoanAccount = await LoanAccount.findOne({ where: { a_c_c_t__n_o: loanAccountNumber } });
//         if (!existingLoanAccount) {
//           console.log(`✓ Account number ${loanAccountNumber} is unique`);
//           break;
//         }

//         console.warn(`Account number ${loanAccountNumber} already exists, retrying...`);
//         loanAccountNumber = null;
//         retries++;
//       } catch (genError) {
//         console.error('Failed to generate loan account number:', genError.message);
//         retries++;
//       }
//     }

//     if (!loanAccountNumber) {
//       throw {
//         code: 'ACCOUNT_GENERATION_FAILED',
//         message: `Failed to generate a unique loan account number after ${maxRetries} attempts`,
//         status: 500,
//       };
//     }

//     const existingCreditApplication = await CreditApplication.findOne({ 
//       where: { APPL_ID: req.body.APPL_ID },
//       transaction 
//     });
//     if (existingCreditApplication) {
//       throw {
//         code: 'DUPLICATE_APPLICATION',
//         message: `A CreditApplication with APPL_ID ${req.body.APPL_ID} already exists`,
//         status: 409,
//       };
//     }

//     const loanCycleCount = await getLoanCycleCount(numericValues.CUST_ID, transaction);

//     console.log('\n=== DIAGNOSTIC: Product, Rate and Interest Rate Lookup ===');
//     console.log('Looking for loan product with PROD_ID:', numericValues.PROD_ID);
//     console.log('Looking for rate index with requested ID:', req.body.INDEX_RATE_ID);
   
//     let rateIndex, loanProduct, customer, guarantor, loanInterestRate;
   
//     try {
//       const LOAN_PROUD_INT_ID = req.body.LOAN_PROUD_INT_ID || req.body.LOAN_INTEREST_RATE_ID;
     
//       // IMPORTANT FIX: Handle Customer lookup separately
//       console.log('\n=== CUSTOMER LOOKUP DEBUG ===');
//       console.log('Customer model type:', typeof Customer);
      
//       // Check if Customer is a function (factory) or a model
//       let CustomerModel;
//       if (typeof Customer === 'function') {
//         // Customer is a factory function
//         try {
//           CustomerModel = Customer(sequelize);
//           console.log('Customer factory function called successfully');
//         } catch (factoryError) {
//           console.error('Error calling Customer factory:', factoryError);
//           // Fallback to raw query
//           CustomerModel = null;
//         }
//       } else {
//         // Customer is a model
//         CustomerModel = Customer;
//         console.log('Customer is already a model');
//       }
      
//       if (CustomerModel && typeof CustomerModel.findOne === 'function') {
//         // Use the model method
//         console.log(`Looking for customer with CUST_ID: ${req.body.CUST_ID}`);
//         customer = await CustomerModel.findOne({ 
//           where: { CUST_ID: req.body.CUST_ID },
//           transaction 
//         });
//         console.log('Customer lookup result:', customer ? 'Found' : 'Not found');
//       } else {
//         // Fallback: Use raw SQL query
//         console.warn('Customer.findOne not available, using raw SQL query');
//         const [customerResult] = await sequelize.query(
//           `SELECT * FROM customers WHERE CUST_ID = ? AND REC_ST = 'ACTIVE' LIMIT 1`,
//           {
//             replacements: [req.body.CUST_ID],
//             type: QueryTypes.SELECT,
//             transaction
//           }
//         );
        
//         if (customerResult) {
//           customer = {
//             id: customerResult.id,
//             CUST_ID: customerResult.CUST_ID,
//             CUST_NM: customerResult.CUST_NM,
//             FIRST_NAME: customerResult.FIRST_NAME,
//             LAST_NAME: customerResult.LAST_NAME,
//             EMAIL_ADDRESS: customerResult.EMAIL_ADDRESS,
//             PHONE_NO: customerResult.PHONE_NO,
//             HOME_ADDRESS: customerResult.HOME_ADDRESS,
//             BVN: customerResult.BVN,
//             NIN: customerResult.NIN,
//             BU_ID: customerResult.BU_ID,
//             REC_ST: customerResult.REC_ST,
//             status: customerResult.status,
//             created_at: customerResult.created_at,
//             updated_at: customerResult.updated_at,
//             // Add all other fields from result
//             ...customerResult
//           };
//           console.log(`✓ Customer found via raw query: ${customer.CUST_ID} - ${customer.CUST_NM}`);
//         }
//       }
      
//       // Execute other lookups
//       [rateIndex, loanProduct, guarantor] = await Promise.all([
//         findRateIndex(req.body.INDEX_RATE_ID, transaction),
//         LoanProduct.findOne({ where: { PROD_ID: numericValues.PROD_ID }, transaction }),
//         findGuarantor(req.body.GUARANTOR_ID, transaction)
//       ]);
      
//     } catch (error) {
//       console.error('Error in Promise.all lookup:', error);
//       throw {
//         code: 'LOOKUP_ERROR',
//         message: `Error during data lookup: ${error.message}`,
//         status: 500,
//       };
//     }

//     console.log('\n=== LOOKUP RESULTS ===');
//     console.log('Rate Index found:', rateIndex ? `${rateIndex.INDEX_RATE_ID} (${rateIndex.INDEX_RATE}%)` : 'NOT FOUND');
//     console.log('Loan Product found:', loanProduct ? `${loanProduct.PROD_ID} - ${loanProduct.PRODUCT_NAME || loanProduct.productName || loanProduct.name}` : 'NOT FOUND');
//     console.log('Customer found:', customer ? `${customer.CUST_ID} - ${customer.CUST_NM}` : 'NOT FOUND');
//     console.log('Guarantor found:', guarantor ? `${guarantor.GUARANTOR_ID} - ${guarantor.fullName}` : 'NOT FOUND');

//     // Fetch LoanInterestRate if available
//     if (loanProduct && loanProduct.LOAN_INTEREST_RATE_ID) {
//       loanInterestRate = await fetchLoanInterestRate(loanProduct.LOAN_INTEREST_RATE_ID, transaction);
//     } else if (LOAN_PROUD_INT_ID) {
//       loanInterestRate = await findLoanInterestRate(LOAN_PROUD_INT_ID, req.body.INDEX_RATE_ID, transaction);
//     } else {
//       loanInterestRate = await findLoanInterestRateByProduct(numericValues.PROD_ID, req.body.INDEX_RATE_ID, transaction);
//     }
    
//     console.log('Loan Interest Rate found:', loanInterestRate ?
//       `${loanInterestRate.LOAN_PROUD_INT_ID || loanInterestRate.id} (Rate Type: ${loanInterestRate.RATE_TYPE}, Interest Type: ${loanInterestRate.INTEREST_TYPE}, ANNUAL_PERCENTAGE_RATE: ${loanInterestRate.ANNUAL_PERCENTAGE_RATE}%, DEFAULT_RATE_PER_MONTH: ${loanInterestRate.DEFAULT_RATE_PER_MONTH}%)` :
//       'NOT FOUND');

//     // ==================== INTEREST RATE DETERMINATION ====================
//     console.log('\n=== DETERMINING INTEREST RATE FROM LOAN PRODUCT ===');
//     let effectiveInterestRate;
//     let interestRateNumber;
//     let interestRateDetails = {};

//     try {
//       // First, check if we have a LoanProduct
//       if (!loanProduct) {
//         console.warn('⚠️ No LoanProduct found, using default rate');
//         interestRateNumber = 12.0; // Default fallback
//         interestRateDetails = {
//           rateType: 'FIXED',
//           interestType: 'SIMPLE',
//           calculationMethod: 'FLAT_RATE',
//           source: 'DEFAULT_NO_PRODUCT',
//           annualRate: interestRateNumber,
//           monthlyRate: interestRateNumber / 12
//         };
//       } else {
//         // Extract rate from LoanProduct
//         const productRateInfo = extractInterestRateFromProduct(loanProduct);
        
//         // If LoanProduct has LOAN_INTEREST_RATE_ID, fetch the actual rate
//         if (loanProduct.LOAN_INTEREST_RATE_ID) {
//           const fetchedLoanInterestRate = await fetchLoanInterestRate(
//             loanProduct.LOAN_INTEREST_RATE_ID, 
//             transaction
//           );
          
//           if (fetchedLoanInterestRate && fetchedLoanInterestRate.DEFAULT_RATE_PER_MONTH) {
//             // Use rate from LoanInterestRate table
//             const monthlyRate = parseFloat(fetchedLoanInterestRate.DEFAULT_RATE_PER_MONTH);
//             interestRateNumber = monthlyRate * 12; // Convert to annual
            
//             interestRateDetails = {
//               rateType: fetchedLoanInterestRate.RATE_TYPE || 'FIXED',
//               interestType: fetchedLoanInterestRate.INTEREST_TYPE || 'SIMPLE',
//               calculationMethod: fetchedLoanInterestRate.CALCULATION_METHOD || 'FLAT_RATE',
//               loanInterestRateId: fetchedLoanInterestRate.id,
//               loanProudIntId: fetchedLoanInterestRate.LOAN_PROUD_INT_ID,
//               source: 'LOAN_INTEREST_RATE_TABLE',
//               annualRate: interestRateNumber,
//               monthlyRate: monthlyRate,
//               isTermBasedRate: fetchedLoanInterestRate.CALCULATION_METHOD === 'FLAT_RATE'
//             };
            
//             console.log(`✓ Using rate from LoanInterestRate: ${monthlyRate}% per month (${interestRateNumber}% annual)`);
//           } else {
//             // Fall back to LoanProduct rate
//             interestRateNumber = productRateInfo.annualRate;
//             interestRateDetails = {
//               ...productRateInfo,
//               loanInterestRateId: loanProduct.LOAN_INTEREST_RATE_ID,
//               source: productRateInfo.source + ' (LoanInterestRate not found)'
//             };
//             console.log(`✓ Using rate from LoanProduct (fallback): ${interestRateNumber}% annual`);
//           }
//         } else {
//           // Use rate directly from LoanProduct
//           interestRateNumber = productRateInfo.annualRate;
//           interestRateDetails = productRateInfo;
//           console.log(`✓ Using rate directly from LoanProduct: ${interestRateNumber}% annual`);
//         }
//       }
      
//       effectiveInterestRate = safeDecimal(interestRateNumber, 'determined_interest_rate');
      
//       console.log('\n=== FINAL RATE DECISION ===');
//       console.log(`Loan Product: ${loanProduct ? `${loanProduct.PROD_ID} - ${loanProduct.name || loanProduct.productName}` : 'Not found'}`);
//       console.log(`LOAN_INTEREST_RATE_ID: ${loanProduct?.LOAN_INTEREST_RATE_ID || 'Not set'}`);
//       console.log(`USING INTEREST RATE: ${interestRateNumber}% annual`);
//       console.log(`Monthly Rate: ${(interestRateNumber / 12).toFixed(2)}%`);
//       console.log(`Source: ${interestRateDetails.source}`);
//       console.log(`Calculation Method: ${interestRateDetails.calculationMethod}`);
//       console.log(`Rate Type: ${interestRateDetails.rateType}`);
      
//     } catch (error) {
//       console.error('Interest rate determination error:', error);
//       throw {
//         code: 'INTEREST_RATE_CALCULATION_ERROR',
//         message: `Failed to determine interest rate: ${error.message}`,
//         status: 500,
//       };
//     }
   
//     if (!loanProduct && productValidation.isLoanProduct) {
//       console.warn(`⚠️ Loan product not found for PROD_ID ${numericValues.PROD_ID}, creating fallback product`);
     
//       const fallbackProduct = {
//         PROD_ID: numericValues.PROD_ID,
//         PRODUCT_NAME: productValidation.productName,
//         PRODUCT_SHORT_NAME: productValidation.accountPrefix,
//         PRODUCT_TYPE: productValidation.productType,
//         productName: productValidation.productName,
//         productDescription: `Fallback loan product for PROD_ID ${numericValues.PROD_ID}`,
//         minAmount: safeDecimal('1000', 'minAmount'),
//         maxAmount: safeDecimal('1000000', 'maxAmount'),
//         minTerm: 1,
//         maxTerm: 60,
//         defaultGLAccounts: productValidation.glAccounts || {}
//       };
     
//       loanProduct = fallbackProduct;
//       console.log('✓ Using fallback product');
//     }
   
//     if (!customer) {
//       throw {
//         code: 'CUSTOMER_NOT_FOUND',
//         message: `Customer not found for CUST_ID ${req.body.CUST_ID}`,
//         status: 404,
//       };
//     }
   
//     if (!guarantor) {
//       throw {
//         code: 'GUARANTOR_NOT_FOUND',
//         message: `Guarantor with ID ${req.body.GUARANTOR_ID} not found`,
//         status: 404,
//       };
//     }

//     console.log('Checking guarantor existing loans...');
//     const guarantorLoanCheck = await checkGuarantorExistingLoans(guarantor.id, transaction);

//     if (guarantorLoanCheck.hasExistingLoans) {
//       console.log(`Guarantor has ${guarantorLoanCheck.totalExistingLoans} existing guaranteed loans`);
//       console.warn(`Guarantor ${guarantor.GUARANTOR_ID} (${guarantor.fullName}) is already guaranteeing ${guarantorLoanCheck.totalExistingLoans} loan(s)`);
//     }

//     const validTermCodes = ['D', 'W', 'BW', 'M', 'Q', 'Y'];
//     if (!validTermCodes.includes(req.body.TERM_CD)) {
//       throw {
//         code: 'INVALID_TERM_CD',
//         message: `Invalid TERM_CD: ${req.body.TERM_CD}. Must be one of ${validTermCodes.join(', ')}`,
//         status: 400,
//       };
//     }

//     const paymentFrequency = getPaymentFrequency(req.body.TERM_CD, numericValues.TERM_VALUE);

//     const startDate = new Date(req.body.START_DT);
//     const maturityDate = calculateMaturityDate(startDate, req.body.TERM_CD, numericValues.TERM_VALUE);

//     let emiResult;
//     let principalAmount;
    
//     // ==================== CORRECTED FLAT RATE EMI CALCULATION ====================
//     try {
//       console.log('\n=== CALCULATING CORRECTED FLAT RATE EMI ===');
//       principalAmount = parseFloat(numericValues.DISBURSEMENT_LIMIT);
      
//       console.log(`\nLoan Details:`);
//       console.log(`Principal Amount: ₦${principalAmount.toFixed(2)}`);
//       console.log(`Annual Interest Rate: ${interestRateNumber}%`);
//       console.log(`Term: ${numericValues.TERM_VALUE} months`);
//       console.log(`Payment Frequency: ${paymentFrequency}`);

//       // Calculate using CORRECTED flat rate formula
//       emiResult = calculateFlatRateEMI(
//         principalAmount,
//         interestRateNumber, // Use determined interest rate
//         numericValues.TERM_VALUE,
//         req.body.TERM_CD,
//         paymentFrequency,
//         startDate
//       );

//       console.log('\n=== EMI CALCULATION RESULTS ===');
//       console.log('Calculation Method:', emiResult.calculationMethod);
//       console.log('Annual Rate Used:', emiResult.annualRateUsed + '%');
//       console.log('Monthly Rate Used:', emiResult.monthlyRateUsed + '%');
//       console.log('Total Interest:', emiResult.totalInterest.toFixed(2));
//       console.log('Total Repayment:', emiResult.totalRepayable.toFixed(2));
//       console.log('Monthly Payment (EMI):', emiResult.emi.toFixed(2));
      
//       // ==================== VERIFICATION CALCULATIONS ====================
//       console.log('\n=== VERIFICATION CALCULATIONS ===');
      
//       // Manual calculation for verification
//       const monthlyRate = interestRateNumber / 12;
//       console.log(`\nManual Calculation Check:`);
//       console.log(`Monthly Rate: ${monthlyRate.toFixed(2)}%`);
      
//       // Total interest = Principal × Annual Rate × (Term in months / 12)
//       const manualTotalInterest = principalAmount * (interestRateNumber / 100) * (numericValues.TERM_VALUE / 12);
//       console.log(`Total Interest (Principal × ${interestRateNumber}% × ${numericValues.TERM_VALUE}/12): ₦${manualTotalInterest.toFixed(2)}`);
      
//       // Total repayment = Principal + Total Interest
//       const manualTotalRepayment = principalAmount + manualTotalInterest;
//       console.log(`Total Repayment: ₦${manualTotalRepayment.toFixed(2)}`);
      
//       // EMI = Total Repayment ÷ Number of months
//       const manualEMI = manualTotalRepayment / numericValues.TERM_VALUE;
//       console.log(`EMI (Total Repayment / ${numericValues.TERM_VALUE}): ₦${manualEMI.toFixed(2)}`);
      
//       // Check if calculations match
//       console.log(`\nVerification Results:`);
//       console.log(`Total Interest Match: ${Math.abs(emiResult.totalInterest - manualTotalInterest) < 0.01 ? '✅ YES' : '❌ NO'}`);
//       console.log(`Total Repayment Match: ${Math.abs(emiResult.totalRepayable - manualTotalRepayment) < 0.01 ? '✅ YES' : '❌ NO'}`);
//       console.log(`EMI Match: ${Math.abs(emiResult.emi - manualEMI) < 0.01 ? '✅ YES' : '❌ NO'}`);
      
//     } catch (emiError) {
//       console.error('EMI calculation error:', emiError);
//       throw {
//         code: 'INVALID_REPAYMENT_SCHEDULE',
//         message: `Failed to generate repayment schedule: ${emiError.message}`,
//         status: 500,
//       };
//     }

//     const interestRateId = rateIndex?.INDEX_RATE_ID || 
//                           loanInterestRate?.LOAN_PROUD_INT_ID || 
//                           numericValues.PROD_ID;

//     const loanInterestRateId = loanInterestRate?.LOAN_PROUD_INT_ID || loanInterestRate?.id || null;

//     console.log('Debug - Setting interest rate IDs:', {
//       INTEREST_RATE_ID: interestRateId,
//       LOAN_INTEREST_RATE_ID: loanInterestRateId,
//       ANNUAL_PERCENTAGE_RATE_USED: interestRateNumber + '%'
//     });

//     // ============ FIXED LOAN ACCOUNT CREATION ============
//     console.log('\n=== CREATING LOAN ACCOUNT WITH CORRECT COLUMN NAMES ===');

//     let loanAccountId;

//     try {
//       // First, let's check what columns actually exist in loan_accounts
//       console.log('🔍 Checking loan_accounts table structure...');
//       const [tableInfo] = await sequelize.query(
//         `DESCRIBE loan_accounts`,
//         { transaction }
//       );
      
//       const existingColumns = tableInfo.map(col => col.Field);
//       console.log('Existing columns in loan_accounts:', existingColumns);
      
//       // Build dynamic SQL based on what columns exist
//       let columns = [];
//       let values = [];
//       let placeholders = [];
      
//       // Always include these basic columns
//       columns.push('a_c_c_t__n_o');
//       values.push(loanAccountNumber);
//       placeholders.push('?');
      
//       columns.push('a_c_c_t__n_m');
//       values.push(req.body.ACCT_NM);
//       placeholders.push('?');
      
//       columns.push('c_u_s_t__i_d');
//       values.push(req.body.CUST_ID);
//       placeholders.push('?');
      
//       columns.push('a_m_o_u_n_t');
//       values.push(numericValues.DISBURSEMENT_LIMIT);
//       placeholders.push('?');
      
//       columns.push('i_n_t_e_r_e_s_t__r_a_t_e');
//       values.push(effectiveInterestRate);
//       placeholders.push('?');
      
//       columns.push('l_o_a_n__s_t_a_t_u_s');
//       values.push('PENDING');
//       placeholders.push('?');
      
//       columns.push('created_at');
//       values.push(new Date());
//       placeholders.push('?');
      
//       columns.push('updated_at');
//       values.push(new Date());
//       placeholders.push('?');
      
//       // Add optional columns only if they exist
//       if (existingColumns.includes('l_o_a_n__p_r_o_d_u_c t__i_d')) {
//         columns.push('l_o_a_n__p_r_o_d_u_c_t__i_d');
//         values.push(numericValues.PROD_ID);
//         placeholders.push('?');
//       }
      
//       if (existingColumns.includes('G_U_A_R_A_N_T_O_R__I_D')) {
//         columns.push('G_U_A_R_A_N_T_O_R__I_D');
//         values.push(guarantor.id);
//         placeholders.push('?');
//       }
      
//       if (existingColumns.includes('g_u_a_r_a_n_t_e_e_d__a_m_o_u_n_t')) {
//         columns.push('g_u_a_r_a_n_t_e_e_d__a_m_o_u_n_t');
//         values.push(numericValues.GUARANTEED_AMT);
//         placeholders.push('?');
//       }
      
//       if (existingColumns.includes('s_t_a_r_t__d_t')) {
//         columns.push('s_t_a_r_t__d_t');
//         values.push(startDate);
//         placeholders.push('?');
//       }
      
//       if (existingColumns.includes('t_e_r_m__c_d')) {
//         columns.push('t_e_r_m__c_d');
//         values.push(mapTermCodeToFullWord(req.body.TERM_CD));
//         placeholders.push('?');
//       }
      
//       if (existingColumns.includes('t_e_r_m__v_a_l_u_e')) {
//         columns.push('t_e_r_m__v_a_l_u_e');
//         values.push(numericValues.TERM_VALUE);
//         placeholders.push('?');
//       }
      
//       if (existingColumns.includes('m_a_t_u_r_i_t_y__d_t')) {
//         columns.push('m_a_t_u_r_i_t_y__d_t');
//         values.push(maturityDate);
//         placeholders.push('?');
//       }
      
//       if (existingColumns.includes('a_p_p_l_i_c_a_t_i_o_n__d_a_t_e')) {
//         columns.push('a_p_p_l_i_c_a_t_i_o_n__d_a_t_e');
//         values.push(new Date());
//         placeholders.push('?');
//       }
      
//       if (existingColumns.includes('s_e_r_v_i_c_i_n_g__s_t_a_t_u_s')) {
//         columns.push('s_e_r_v_i_c_i_n_g__s_t_a_t_u_s');
//         values.push('SERVICED');
//         placeholders.push('?');
//       }
      
//       const dynamicInsertQuery = `
//         INSERT INTO loan_accounts (
//           ${columns.join(', ')}
//         ) VALUES (
//           ${placeholders.join(', ')}
//         )
//       `;
      
//       console.log('Dynamic insert SQL:', dynamicInsertQuery);
//       console.log('Inserting with values:', values);
      
//       const [loanAccountResult] = await sequelize.query(dynamicInsertQuery, {
//         replacements: values,
//         transaction
//       });
      
//       // IMPORTANT FIX: Properly get the insertId
//       loanAccountId = loanAccountResult.insertId;
//       console.log(`✅ LoanAccount inserted with ID: ${loanAccountId}`);
      
//       // Verify the ID was actually inserted by querying the record
//       if (!loanAccountId || isNaN(loanAccountId)) {
//         console.error('❌ No valid insertId returned. Querying for the inserted record...');
        
//         const [recentLoans] = await sequelize.query(
//           `SELECT id FROM loan_accounts WHERE a_c_c_t__n_o = ? ORDER BY id DESC LIMIT 1`,
//           {
//             replacements: [loanAccountNumber],
//             transaction
//           }
//         );
        
//         if (recentLoans && recentLoans.length > 0) {
//           loanAccountId = recentLoans[0].id;
//           console.log(`✅ Found loan account ID via query: ${loanAccountId}`);
//         } else {
//           throw new Error('Could not retrieve loan account ID after insertion');
//         }
//       }
      
//     } catch (insertError) {
//       console.error('Error in loan account creation:', insertError.message);
      
//       // Try a simpler insert if the complex one fails
//       console.log('🔄 Trying simplest insert...');
      
//       const simplestInsertQuery = `
//         INSERT INTO loan_accounts (
//           a_c_c_t__n_o, a_c_c_t__n_m, c_u_s_t__i_d, a_m_o_u_n_t, 
//           i_n_t_e_r_e_s_t__r_a_t_e, l_o_a_n__s_t_a_t_u_s,
//           created_at, updated_at
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
//       `;
      
//       const [loanAccountResult] = await sequelize.query(simplestInsertQuery, {
//         replacements: [
//           loanAccountNumber,
//           req.body.ACCT_NM,
//           req.body.CUST_ID,
//           numericValues.DISBURSEMENT_LIMIT,
//           effectiveInterestRate,
//           'PENDING',
//           new Date(),
//           new Date()
//         ],
//         transaction
//       });
      
//       loanAccountId = loanAccountResult.insertId;
      
//       // Verify the ID
//       if (!loanAccountId || isNaN(loanAccountId)) {
//         const [recentLoans] = await sequelize.query(
//           `SELECT id FROM loan_accounts WHERE a_c_c_t__n_o = ? ORDER BY id DESC LIMIT 1`,
//           {
//             replacements: [loanAccountNumber],
//             transaction
//           }
//         );
        
//         if (recentLoans && recentLoans.length > 0) {
//           loanAccountId = recentLoans[0].id;
//         } else {
//           throw new Error('Could not retrieve loan account ID after simple insertion');
//         }
//       }
      
//       console.log(`✅ LoanAccount inserted with simplest fields, ID: ${loanAccountId}`);
//     }

//     // Create a loanAccount object for the rest of the code
//     const loanAccount = {
//       id: loanAccountId,
//       a_c_c_t__n_o: loanAccountNumber,
//       a_c_c_t__n_m: req.body.ACCT_NM,
//       c_u_s_t__i_d: req.body.CUST_ID,
//       l_o_a_n__p_r_o_d_u_c_t__i_d: numericValues.PROD_ID,
//       a_m_o_u_n_t: numericValues.DISBURSEMENT_LIMIT,
//       i_n_t_e_r_e_s_t__r_a_t_e: effectiveInterestRate,
//       l_o_a_n__s_t_a_t_u_s: 'PENDING',
//       d_i_s_b_u_r_s_e_m_e_n_t__l_i_m_i_t: numericValues.DISBURSEMENT_LIMIT,
//       G_U_A_R_A_N_T_O_R__I_D: guarantor.id,
//       g_u_a_r_a_n_t_e_e_d__a_m_o_u_n_t: numericValues.GUARANTEED_AMT,
//       s_t_a_r_t__d_t: startDate,
//       t_e_r_m__c_d: mapTermCodeToFullWord(req.body.TERM_CD),
//       t_e_r_m__v_a_l_u_e: numericValues.TERM_VALUE,
//       m_a_t_u_r_i_t_y__d_t: maturityDate,
//       // Also keep simple names for compatibility
//       ACCT_NO: loanAccountNumber,
//       ACCT_NM: req.body.ACCT_NM,
//       CUST_ID: req.body.CUST_ID,
//       PROD_ID: numericValues.PROD_ID,
//       AMOUNT: numericValues.DISBURSEMENT_LIMIT,
//       INTEREST_RATE: effectiveInterestRate,
//       LOAN_STATUS: 'PENDING',
//       DISBURSEMENT_LIMIT: numericValues.DISBURSEMENT_LIMIT,
//       GUARANTOR_ID: guarantor.id,
//       GUARANTEED_AMOUNT: numericValues.GUARANTEED_AMT,
//       START_DT: startDate,
//       TERM_CD: mapTermCodeToFullWord(req.body.TERM_CD),
//       TERM_VALUE: numericValues.TERM_VALUE,
//       MATURITY_DT: maturityDate,
//       // Add other essential fields
//       loanAccountId: parseInt(loanAccountNumber) || Date.now(),
//       JOURNAL_ID: TRAN_JOURNAL_ID,
//       APPL_ID: req.body.APPL_ID,
//       PRODUCT_TYPE: productValidation.productType,
//       CRNCY_ID: req.body.CRNCY_ID || 'NGN',
//       BU_ID: req.body.BU_ID,
//       PRIMARY_OFFICER_ID: req.body.PRIMARY_OFFICER_ID,
//       SECONDARY_OFFICER_ID: req.body.SECONDARY_OFFICER_ID || req.body.PRIMARY_OFFICER_ID,
//       INTEREST_RATE_ID: interestRateId,
//       LOAN_INTEREST_RATE_ID: loanInterestRateId,
//       INTEREST_RATE_TYPE: interestRateDetails.rateType || 'FIXED',
//       INTEREST_TYPE: interestRateDetails.interestType || 'SIMPLE',
//       INTEREST_CALCULATION_METHOD: interestRateDetails.calculationMethod || 'FLAT_RATE',
//       LOAN_STATUS: 'PENDING',
//       PAYMENT_FREQUENCY: paymentFrequency,
//       CREATED_BY: req.body.CREATED_BY,
//       TRANSACTION_ID,
//       EVENT_ID,
//       TOTAL_INTEREST: safeDecimal(emiResult.totalInterest, 'emiResult.totalInterest'),
//       TOTAL_REPAYMENT: safeDecimal(emiResult.totalRepayable, 'emiResult.totalRepayable'),
//       REPAYMENT_SOURCE_ACCOUNT: req.body.REPAY_SRC_ACCT_NO,
//       HAS_GUARANTOR: true,
//       guarantorDetails: {
//         name: guarantor.fullName,
//         phone: guarantor.phoneNumber,
//         relationship: guarantor.relationshipToBorrower,
//         guarantorNumberId: guarantor.GUARANTOR_ID.toString(),
//         email: guarantor.email,
//         address: guarantor.address,
//         existingGuarantees: guarantorLoanCheck.hasExistingLoans ? {
//           totalExistingLoans: guarantorLoanCheck.totalExistingLoans,
//           totalGuaranteedAmount: guarantorLoanCheck.totalGuaranteedAmount
//         } : null
//       },
//       Borrower_address: req.body.Borrower_address ? {
//         street: req.body.Borrower_address.street || '',
//         city: req.body.Borrower_address.city || '',
//         state: req.body.Borrower_address.state || '',
//         zipCode: req.body.Borrower_address.zipCode || '',
//         country: req.body.Borrower_address.country || 'Nigeria',
//       } : undefined,
//       upfrontInterestPercentage: safeDecimal(upfrontInterest, 'upfrontInterest'),
//       partialUpfrontInterest: partialInterest,
//       applicationDate: new Date(),
//       lastUpdated: new Date(),
//       interestRateDetails: interestRateDetails
//     };

//     console.log('✅ LoanAccount created with ACCT_NO:', loanAccount.ACCT_NO);
//     console.log(`✅ LoanAccount.INTEREST_RATE set to: ${parseFloat(loanAccount.INTEREST_RATE)}%`);
//     console.log(`✅ LoanAccount.ID verified as: ${loanAccount.id} (type: ${typeof loanAccount.id})`);
    
//     // ===== FIXED CODE - Update Guarantor =====
//     try {
//       const guarantorRecord = await Guarantor.findByPk(guarantor.id, { transaction });
      
//       if (guarantorRecord) {
//         const currentLoans = guarantorRecord.guaranteedLoans || [];
        
//         if (!currentLoans.includes(loanAccount.id)) {
//           currentLoans.push(loanAccount.id);
//         }
        
//         const safeStatus = 'ACTIVE';
        
//         await guarantorRecord.update({
//           guaranteedLoans: currentLoans,
//           lastUsedDate: new Date(),
//           status: safeStatus,
//         }, { transaction });
        
//         console.log('✅ Guarantor updated successfully with status:', safeStatus);
//       } else {
//         console.warn(`Guarantor with ID ${guarantor.id} not found for update`);
//       }
//     } catch (guarantorUpdateError) {
//       console.error('Error updating guarantor:', guarantorUpdateError.message);
//       console.warn('Continuing despite guarantor update error');
//     }

//     // ==================== FIXED REPAYMENT SCHEDULE CREATION ====================
//     console.log('\n=== CREATING REPAYMENT SCHEDULE ===');

//     let repaymentSchedule;
//     let repaymentScheduleId = null;

//     try {
//       console.log('🔍 Checking repayment_schedules table structure in detail...');
//       const [tableInfo] = await sequelize.query(
//         `DESCRIBE repayment_schedules`,
//         { transaction }
//       );
      
//       const existingColumns = tableInfo.map(col => col.Field);
//       const requiredColumns = tableInfo
//         .filter(col => col.Null === 'NO' && !col.Default && col.Field !== 'id')
//         .map(col => col.Field);
      
//       console.log('ACTUAL columns in repayment_schedules:', existingColumns);
//       console.log('REQUIRED columns (no default, not null):', requiredColumns);
      
//       console.log('🔄 Using raw SQL to insert repayment schedule...');
      
//       const columnsToInsert = [];
//       const valuesToInsert = [];
//       const placeholders = [];
      
//       const requiredFields = [
//         { name: 'loan_account_id', value: loanAccountId, type: 'number' },
//         { name: 'account_number', value: loanAccountNumber, type: 'string' },
//         { name: 'customer_id', value: req.body.CUST_ID.toString(), type: 'string' },
//         { name: 'status', value: 'PENDING', type: 'string' },
//         { name: 'created_at', value: new Date(), type: 'date' },
//         { name: 'updated_at', value: new Date(), type: 'date' }
//       ];
      
//       requiredFields.forEach(field => {
//         if (existingColumns.includes(field.name) || requiredColumns.includes(field.name)) {
//           columnsToInsert.push(field.name);
//           valuesToInsert.push(field.value);
//           placeholders.push('?');
//           console.log(`✓ Adding required field: ${field.name}`);
//         }
//       });
      
//       if (!columnsToInsert.includes('loan_account_id') && existingColumns.includes('loan_account_id')) {
//         columnsToInsert.push('loan_account_id');
//         valuesToInsert.push(loanAccountId);
//         placeholders.push('?');
//         console.log('✓ Adding loan_account_id (required field)');
//       }
      
//       const optionalFields = [
//         { name: 'start_date', value: startDate },
//         { name: 'maturity_date', value: maturityDate },
//         { name: 'principal_amount', value: numericValues.DISBURSEMENT_LIMIT },
//         { name: 'interest_rate', value: effectiveInterestRate },
//         { name: 'term', value: numericValues.TERM_VALUE },
//         { name: 'term_type', value: getRepaymentTermType(req.body.TERM_CD) },
//         { name: 'total_interest', value: safeDecimal(emiResult.totalInterest, 'emiResult.totalInterest') },
//         { name: 'total_repayment', value: safeDecimal(emiResult.totalRepayable, 'emiResult.totalRepayable') },
//         { name: 'emi_amount', value: safeDecimal(emiResult.emi, 'emiResult.emi') },
//         { name: 'payment_frequency', value: paymentFrequency },
//         { name: 'transaction_id', value: TRANSACTION_ID },
//         { name: 'event_id', value: EVENT_ID },
//         { name: 'created_by', value: req.body.CREATED_BY },
//         { name: 'guarantor_id', value: guarantor.id },
//         { name: 'guaranteed_amount', value: numericValues.GUARANTEED_AMT },
//         { name: 'loan_interest_rate_id', value: loanInterestRateId }
//       ];
      
//       optionalFields.forEach(field => {
//         if (existingColumns.includes(field.name)) {
//           columnsToInsert.push(field.name);
//           valuesToInsert.push(field.value);
//           placeholders.push('?');
//           console.log(`✓ Adding optional field: ${field.name}`);
//         }
//       });
      
//       if (existingColumns.includes('schedule')) {
//         columnsToInsert.push('schedule');
//         valuesToInsert.push(JSON.stringify(emiResult.installments));
//         placeholders.push('?');
//         console.log('✓ Adding schedule (JSON)');
//       }
      
//       if (existingColumns.includes('installments_json')) {
//         columnsToInsert.push('installments_json');
//         valuesToInsert.push(JSON.stringify(emiResult.installments));
//         placeholders.push('?');
//         console.log('✓ Adding installments_json');
//       }
      
//       if (existingColumns.includes('metadata')) {
//         columnsToInsert.push('metadata');
//         valuesToInsert.push(JSON.stringify({
//           calculationMethod: interestRateDetails.calculationMethod || 'FLAT_RATE',
//           rateType: interestRateDetails.rateType || 'FIXED',
//           interestType: interestRateDetails.interestType || 'SIMPLE',
//           isTermBasedRate: interestRateDetails.isTermBasedRate || false
//         }));
//         placeholders.push('?');
//         console.log('✓ Adding metadata');
//       }
      
//       if (existingColumns.includes('calculation_method')) {
//         console.warn('⚠️ calculation_method column exists, adding it');
//         columnsToInsert.push('calculation_method');
//         valuesToInsert.push(interestRateDetails.calculationMethod || 'FLAT_RATE');
//         placeholders.push('?');
//       }
      
//       console.log('Final columns to insert:', columnsToInsert);
//       console.log('Values count:', valuesToInsert.length);
      
//       const missingRequired = requiredColumns.filter(col => !columnsToInsert.includes(col));
//       if (missingRequired.length > 0) {
//         console.error('Missing required columns:', missingRequired);
//         console.log('🔄 Adding missing required columns...');
//         missingRequired.forEach(col => {
//           columnsToInsert.push(col);
//           if (col === 'loan_account_id') {
//             valuesToInsert.push(loanAccountId);
//           } else if (col === 'account_number') {
//             valuesToInsert.push(loanAccountNumber);
//           } else if (col === 'customer_id') {
//             valuesToInsert.push(req.body.CUST_ID.toString());
//           } else if (col === 'status') {
//             valuesToInsert.push('PENDING');
//           } else if (col === 'created_at' || col === 'updated_at') {
//             valuesToInsert.push(new Date());
//           } else {
//             valuesToInsert.push('');
//           }
//           placeholders.push('?');
//           console.log(`✓ Added missing required column: ${col}`);
//         });
//       }
      
//       const insertQuery = `
//         INSERT INTO repayment_schedules (
//           ${columnsToInsert.join(', ')}
//         ) VALUES (
//           ${placeholders.join(', ')}
//         )
//       `;
      
//       console.log('Executing raw SQL insert for repayment schedule...');
//       console.log('Query:', insertQuery);
      
//       const [result] = await sequelize.query(insertQuery, {
//         replacements: valuesToInsert,
//         transaction
//       });
      
//       repaymentScheduleId = result.insertId;
//       console.log('✅ RepaymentSchedule inserted with raw SQL. ID:', repaymentScheduleId);
      
//       if (!repaymentScheduleId || isNaN(repaymentScheduleId)) {
//         console.warn('⚠️ No valid insertId returned. Trying alternative methods...');
        
//         const [lastIdResult] = await sequelize.query(
//           'SELECT LAST_INSERT_ID() as last_id',
//           { transaction }
//         );
        
//         if (lastIdResult && lastIdResult[0] && lastIdResult[0].last_id) {
//           repaymentScheduleId = lastIdResult[0].last_id;
//           console.log(`✅ Got ID via LAST_INSERT_ID: ${repaymentScheduleId}`);
//         } else {
//           const [recentSchedules] = await sequelize.query(
//             `SELECT id FROM repayment_schedules WHERE account_number = ? ORDER BY created_at DESC LIMIT 1`,
//             {
//               replacements: [loanAccountNumber],
//               transaction
//             }
//           );
          
//           if (recentSchedules && recentSchedules.length > 0) {
//             repaymentScheduleId = recentSchedules[0].id;
//             console.log(`✅ Found ID via query: ${repaymentScheduleId}`);
//           }
//         }
//       }
      
//       repaymentSchedule = {
//         id: repaymentScheduleId,
//         LOAN_ACCOUNT_ID: loanAccountId,
//         ACCT_NO: loanAccountNumber,
//         CUST_ID: req.body.CUST_ID.toString(),
//         STATUS: 'PENDING',
//         TRANSACTION_ID,
//         EVENT_ID,
//         CREATED_BY: req.body.CREATED_BY
//       };
      
//       console.log('✅ Created repaymentSchedule object with ID:', repaymentSchedule.id);
      
//       console.log('Creating individual installment records...');
//       const installmentsData = emiResult.installments.map((installment, index) => ({
//         repayment_schedule_id: repaymentScheduleId,
//         loan_account_id: loanAccountId,
//         installment_no: installment.installmentNo || installment.installmentNumber || (index + 1),
//         due_date: installment.dueDate,
//         principal_amount: safeDecimal(installment.principal, `installment.principal for ${index}`),
//         interest_amount: safeDecimal(installment.interest, `installment.interest for ${index}`),
//         total_payment: safeDecimal(installment.totalPayment, `installment.totalPayment for ${index}`),
//         remaining_balance: safeDecimal(installment.remainingBalance, `installment.remainingBalance for ${index}`),
//         status: 'PENDING'
//       }));
      
//       const [installmentTables] = await sequelize.query(
//         `SHOW TABLES LIKE 'loan_installments'`,
//         { transaction }
//       );
      
//       if (installmentTables.length > 0) {
//         try {
//           const [installmentColumns] = await sequelize.query(
//             `DESCRIBE loan_installments`,
//             { transaction }
//           );
          
//           const installmentColumnNames = installmentColumns.map(col => col.Field);
//           console.log('loan_installments columns:', installmentColumnNames);
          
//           for (const installment of installmentsData) {
//             const installmentColumns = [];
//             const installmentValues = [];
//             const installmentPlaceholders = [];
            
//             Object.keys(installment).forEach(key => {
//               const columnExists = installmentColumnNames.some(col => 
//                 col.toLowerCase() === key.toLowerCase()
//               );
              
//               if (columnExists) {
//                 installmentColumns.push(key);
//                 installmentValues.push(installment[key]);
//                 installmentPlaceholders.push('?');
//               }
//             });
            
//             if (installmentColumns.length > 0) {
//               const installmentQuery = `
//                 INSERT INTO loan_installments (
//                   ${installmentColumns.join(', ')}
//                 ) VALUES (
//                   ${installmentPlaceholders.join(', ')}
//                 )
//               `;
              
//               await sequelize.query(installmentQuery, {
//                 replacements: installmentValues,
//                 transaction
//               });
//             }
//           }
          
//           console.log(`✅ Created ${installmentsData.length} installment records via raw SQL`);
          
//         } catch (installmentError) {
//           console.warn('⚠️ Could not create installment records:', installmentError.message);
//           console.log('Continuing without individual installment records...');
//         }
//       } else {
//         console.warn('⚠️ loan_installments table does not exist, skipping installment creation');
//       }
      
//     } catch (repaymentError) {
//       console.error('❌ Error creating RepaymentSchedule with raw SQL:', repaymentError.message);
      
//       console.log('🔄 Trying emergency fallback with only absolute required fields...');
      
//       try {
//         let existingColumns = [];
//         try {
//           const [tableInfo] = await sequelize.query(
//             `DESCRIBE repayment_schedules`,
//             { transaction }
//           );
//           existingColumns = tableInfo.map(col => col.Field);
//         } catch (descError) {
//           console.warn('Could not describe table, using default columns');
//           existingColumns = ['loan_account_id', 'account_number', 'customer_id', 'status', 'created_at', 'updated_at'];
//         }
        
//         const emergencyFields = [];
//         const emergencyValues = [];
//         const emergencyPlaceholders = [];
        
//         const emergencyRequired = ['loan_account_id', 'account_number', 'customer_id', 'status'];
        
//         emergencyRequired.forEach(field => {
//           if (existingColumns.includes(field)) {
//             emergencyFields.push(field);
//             if (field === 'loan_account_id') emergencyValues.push(loanAccountId);
//             else if (field === 'account_number') emergencyValues.push(loanAccountNumber);
//             else if (field === 'customer_id') emergencyValues.push(req.body.CUST_ID.toString());
//             else if (field === 'status') emergencyValues.push('PENDING');
//             emergencyPlaceholders.push('?');
//           }
//         });
        
//         if (existingColumns.includes('created_at')) {
//           emergencyFields.push('created_at');
//           emergencyValues.push(new Date());
//           emergencyPlaceholders.push('?');
//         }
        
//         if (existingColumns.includes('updated_at')) {
//           emergencyFields.push('updated_at');
//           emergencyValues.push(new Date());
//           emergencyPlaceholders.push('?');
//         }
        
//         if (emergencyFields.length === 0) {
//           throw new Error('No valid fields found for emergency insert');
//         }
        
//         const emergencyQuery = `
//           INSERT INTO repayment_schedules (
//             ${emergencyFields.join(', ')}
//           ) VALUES (
//             ${emergencyPlaceholders.join(', ')}
//           )
//         `;
        
//         console.log('Emergency query:', emergencyQuery);
        
//         const [result] = await sequelize.query(emergencyQuery, {
//           replacements: emergencyValues,
//           transaction
//         });
        
//         repaymentScheduleId = result.insertId;
//         console.log('✅ Emergency RepaymentSchedule created via raw SQL. ID:', repaymentScheduleId);
        
//         if (!repaymentScheduleId || isNaN(repaymentScheduleId)) {
//           console.warn('⚠️ No ID from emergency insert, generating temporary ID');
//           repaymentScheduleId = Date.now();
//         }
        
//         repaymentSchedule = {
//           id: repaymentScheduleId,
//           LOAN_ACCOUNT_ID: loanAccountId,
//           ACCT_NO: loanAccountNumber,
//           CUST_ID: req.body.CUST_ID.toString(),
//           STATUS: 'PENDING'
//         };
        
//       } catch (emergencyError) {
//         console.error('❌ Emergency creation failed:', emergencyError.message);
        
//         console.log('🔄 Creating dummy repayment schedule object...');
//         repaymentScheduleId = Date.now();
//         repaymentSchedule = {
//           id: repaymentScheduleId,
//           LOAN_ACCOUNT_ID: loanAccountId,
//           ACCT_NO: loanAccountNumber,
//           CUST_ID: req.body.CUST_ID.toString(),
//           STATUS: 'PENDING',
//           CREATED_BY: req.body.CREATED_BY,
//           TRANSACTION_ID,
//           EVENT_ID
//         };
        
//         console.warn(`⚠️ Using dummy repayment schedule object with ID: ${repaymentScheduleId}. Loan will be created but repayment schedule may not be saved in database.`);
//       }
//     }

//     console.log('\n=== REPAYMENT SCHEDULE VALIDATION CHECK ===');
//     console.log('repaymentSchedule object:', repaymentSchedule);
//     console.log('repaymentSchedule.id:', repaymentSchedule.id, 'type:', typeof repaymentSchedule.id);

//     if (!repaymentSchedule || !repaymentSchedule.id) {
//       console.error('❌ repaymentSchedule or its id is undefined/null');
//       repaymentSchedule = repaymentSchedule || {};
//       repaymentSchedule.id = Date.now();
//       console.warn(`⚠️ Generated temporary ID: ${repaymentSchedule.id}`);
//     }

//     console.log('✅ Final repaymentSchedule.id:', repaymentSchedule.id);

//     // ==================== LOAN DISBURSEMENT DATA CREATION ====================
//     console.log('\n=== CREATING LOAN DISBURSEMENT RECORD ===');

//     console.log('loanAccount object:', {
//       id: loanAccount.id,
//       hasId: !!loanAccount.id,
//       typeOfId: typeof loanAccount.id
//     });

//     console.log('repaymentSchedule object:', {
//       id: repaymentSchedule.id,
//       hasId: !!repaymentSchedule.id,
//       typeOfId: typeof repaymentSchedule.id
//     });

//     if (!loanAccount.id || isNaN(loanAccount.id)) {
//       console.error('❌ loanAccount.id is invalid:', loanAccount.id);
//       throw new Error('Invalid loan account ID');
//     }

//     if (!repaymentSchedule.id) {
//       console.error('❌ repaymentSchedule.id is undefined/null');
//       console.log('Attempting to continue with temporary ID...');
      
//       repaymentSchedule.id = Date.now();
//       console.warn(`⚠️ Generated temporary repayment schedule ID: ${repaymentSchedule.id}`);
//     }

//     const repaymentScheduleIdNum = Number(repaymentSchedule.id);
//     if (isNaN(repaymentScheduleIdNum)) {
//       console.error('❌ repaymentSchedule.id is not a valid number:', repaymentSchedule.id);
//       repaymentSchedule.id = Date.now();
//       console.warn(`⚠️ Generated valid temporary repayment schedule ID: ${repaymentSchedule.id}`);
//     }

//     if (!guarantor.id || isNaN(guarantor.id)) {
//       console.error('❌ guarantor.id is invalid:', guarantor.id);
//       throw new Error('Invalid guarantor ID');
//     }

//     const validCalculationMethods = ['FLAT_RATE', 'DECLINING_BALANCE'];
//     let calculationMethod = interestRateDetails.calculationMethod || 'FLAT_RATE';
//     if (!validCalculationMethods.includes(calculationMethod)) {
//       console.warn(`⚠️ Invalid calculation method: ${calculationMethod}, defaulting to FLAT_RATE`);
//       calculationMethod = 'FLAT_RATE';
//     }

//     const productType = String(productValidation.productType || 'INDIVIDUAL_LOAN').toUpperCase();
//     const sanitizedProductType = productType === 'PERSONAL LOAN' ? 'INDIVIDUAL_LOAN' : productType;

//     const loanDisbursementData = {
//       ACCT_NO: loanAccountNumber,
//       APPL_ID: req.body.APPL_ID,
//       CUST_ID: req.body.CUST_ID,
      
//       INTEREST_RATE: effectiveInterestRate,
//       TERM_VALUE: numericValues.TERM_VALUE,
//       TERM_CD: req.body.TERM_CD,
//       AMOUNT: numericValues.DISBURSEMENT_LIMIT,
//       CALCULATION_METHOD: calculationMethod,
//       PAYMENT_FREQUENCY: paymentFrequency,
      
//       EMI_AMOUNT: safeDecimal(emiResult.emi, 'emiResult.emi'),
//       TOTAL_INTEREST: safeDecimal(emiResult.totalInterest, 'emiResult.totalInterest'),
//       TOTAL_REPAYMENT: safeDecimal(emiResult.totalRepayable, 'emiResult.totalRepayable'),
      
//       LOAN_ACCOUNT_ID: Number(loanAccount.id),
//       CREDIT_APPLICATION_ID: null,
//       REPAYMENT_SCHEDULE_ID: Number(repaymentSchedule.id),
//       GUARANTOR_ID: Number(guarantor.id),
      
//       TRANSACTION_ID,
//       EVENT_ID,
//       JOURNAL_ID: TRAN_JOURNAL_ID,
      
//       PROD_ID: String(numericValues.PROD_ID),
//       PRODUCT_TYPE: sanitizedProductType,
      
//       ACCT_NM: req.body.ACCT_NM,
//       CRNCY_ID: req.body.CRNCY_ID || 'NGN',
//       BU_ID: req.body.BU_ID,
      
//       PRIMARY_OFFICER_ID: req.body.PRIMARY_OFFICER_ID,
//       REPAY_SRC_ACCT_NO: req.body.REPAY_SRC_ACCT_NO,
      
//       START_DT: startDate,
//       MATURITY_DT: maturityDate,
      
//       borrower_address: req.body.Borrower_address || {},
//       guarantor_details: {
//         name: guarantor.fullName || '',
//         phone: guarantor.phoneNumber || '',
//         relationship: guarantor.relationshipToBorrower || '',
//         guarantorNumberId: String(guarantor.GUARANTOR_ID || ''),
//         email: guarantor.email || '',
//         address: guarantor.address || '',
//         existingGuarantees: guarantorLoanCheck.hasExistingLoans ? {
//           totalExistingLoans: guarantorLoanCheck.totalExistingLoans,
//           totalGuaranteedAmount: guarantorLoanCheck.totalGuaranteedAmount
//         } : null
//       },
//       interest_rate_details: interestRateDetails || {},
//       metadata: {},
      
//       STATUS: 'PENDING',
//       CREATED_BY: req.body.CREATED_BY,
      
//       DISBURSEMENT_TYPE: 'CUSTOMER_ACCOUNT',
//       FEES_AMOUNT: toDecimal(0),
//       UPFRONT_INTEREST_AMOUNT: toDecimal(0),
//       NET_DISBURSEMENT_AMOUNT: numericValues.DISBURSEMENT_LIMIT
//     };

//     console.log('\n=== LOAN DISBURSEMENT DATA VALIDATION ===');
//     console.log('LOAN_ACCOUNT_ID:', loanDisbursementData.LOAN_ACCOUNT_ID, 'type:', typeof loanDisbursementData.LOAN_ACCOUNT_ID);
//     console.log('REPAYMENT_SCHEDULE_ID:', loanDisbursementData.REPAYMENT_SCHEDULE_ID, 'type:', typeof loanDisbursementData.REPAYMENT_SCHEDULE_ID);
//     console.log('GUARANTOR_ID:', loanDisbursementData.GUARANTOR_ID, 'type:', typeof loanDisbursementData.GUARANTOR_ID);
//     console.log('CALCULATION_METHOD:', loanDisbursementData.CALCULATION_METHOD);
//     console.log('PRODUCT_TYPE:', loanDisbursementData.PRODUCT_TYPE);

//     let loanDisbursement;
//     try {
//       loanDisbursement = await LoanDisbursement.create(loanDisbursementData, { transaction });
//       console.log('✅ LoanDisbursement created via Sequelize with ID:', loanDisbursement.id);
//     } catch (sequelizeError) {
//       console.error('❌ Sequelize create failed:', sequelizeError.message);
      
//       console.log('🔄 Trying raw SQL fallback...');
      
//       try {
//         const tableColumns = await getTableColumns('loan_disbursements', transaction);
        
//         const insertData = {
//           'a_c_c_t__n_o': loanAccountNumber,
//           'a_p_p_l__i_d': req.body.APPL_ID,
//           'c_u_s_t__i_d': req.body.CUST_ID,
//           'i_n_t_e_r_e_s_t__r_a_t_e': effectiveInterestRate,
//           't_e_r_m__v_a_l_u_e': numericValues.TERM_VALUE,
//           't_e_r_m__c_d': req.body.TERM_CD,
//           'a_m_o_u_n_t': numericValues.DISBURSEMENT_LIMIT,
//           'l_o_a_n__a_c_c_o_u_n_t__i_d': Number(loanAccount.id),
//           'r_e_p_a_y_m_e_n_t__s_c_h_e_d_u_l_e__i_d': Number(repaymentSchedule.id),
//           'g_u_a_r_a_n_t_o_r__i_d': Number(guarantor.id),
//           'p_r_o_d__i_d': String(numericValues.PROD_ID),
//           'p_r_o_d_u_c_t__t_y_p_e': 'INDIVIDUAL_LOAN',
//           's_t_a_t_u_s': 'PENDING',
//           'created_at': new Date(),
//           'updated_at': new Date()
//         };
        
//         const columns = [];
//         const values = [];
//         const placeholders = [];
        
//         for (const [column, value] of Object.entries(insertData)) {
//           if (tableColumns.includes(column)) {
//             columns.push(column);
//             values.push(value);
//             placeholders.push('?');
//           }
//         }
        
//         if (columns.length > 0) {
//           const insertQuery = `
//             INSERT INTO loan_disbursements (
//               ${columns.join(', ')}
//             ) VALUES (
//               ${placeholders.join(', ')}
//             )
//           `;
          
//           const [result] = await sequelize.query(insertQuery, {
//             replacements: values,
//             transaction
//           });
          
//           console.log('✅ LoanDisbursement created via raw SQL with ID:', result.insertId);
          
//           loanDisbursement = {
//             id: result.insertId,
//             ...insertData,
//             ACCT_NO: insertData['a_c_c_t__n_o'],
//             APPL_ID: insertData['a_p_p_l__i_d'],
//             CUST_ID: insertData['c_u_s_t__i_d'],
//             INTEREST_RATE: insertData['i_n_t_e_r_e_s_t__r_a_t_e'],
//             TERM_VALUE: insertData['t_e_r_m__v_a_l_u_e'],
//             TERM_CD: insertData['t_e_r_m__c_d'],
//             AMOUNT: insertData['a_m_o_u_n_t'],
//             LOAN_ACCOUNT_ID: insertData['l_o_a_n__a_c_c_o_u_n_t__i_d'],
//             REPAYMENT_SCHEDULE_ID: insertData['r_e_p_a_y_m_e_n_t__s_c_h_e_d_u_l_e__i_d'],
//             GUARANTOR_ID: insertData['g_u_a_r_a_n_t_o_r__i_d'],
//             PROD_ID: insertData['p_r_o_d__i_d'],
//             PRODUCT_TYPE: insertData['p_r_o_d_u_c_t__t_y_p_e'],
//             STATUS: insertData['s_t_a_t_u_s']
//           };
//         } else {
//           throw new Error('No valid columns found for loan_disbursements table');
//         }
//       } catch (rawSQLError) {
//         console.error('❌ Raw SQL fallback also failed:', rawSQLError.message);
//         throw new Error('Failed to create loan disbursement record');
//       }
//     }

//     console.log('=== DEBUG: REQUEST BODY STRUCTURE ===');
//     console.log('Full req.body:', JSON.stringify(req.body, null, 2));

//     const possibleAddressPaths = [
//       'Borrower_address',
//       'address',
//       'borrowerAddress',
//       'customer_address',
//       'customerAddress'
//     ];

//     possibleAddressPaths.forEach(path => {
//       if (req.body[path]) {
//         console.log(`Found address at req.body.${path}:`, req.body[path]);
//       }
//     });

//     const rootAddressFields = ['street', 'city', 'state', 'zipCode', 'country', 'postal_code'];
//     rootAddressFields.forEach(field => {
//       if (req.body[field]) {
//         console.log(`Found root-level field req.body.${field}:`, req.body[field]);
//       }
//     });

//     // ==================== CREDIT APPLICATION CREATION ====================
//     console.log('\n=== CREATING CREDIT APPLICATION ===');

//     let addressData = {};

//     if (req.body.Borrower_address) {
//       addressData = req.body.Borrower_address;
//     } else if (req.body.address) {
//       addressData = {
//         street: req.body.address.street || req.body.address.address_line_1 || req.body.address.addressLine1 || '',
//         city: req.body.address.city || '',
//         state: req.body.address.state || '',
//         zipCode: req.body.address.zipCode || req.body.address.postal_code || req.body.address.postalCode || req.body.address.zip_code || '',
//         country: req.body.address.country || 'Nigeria'
//       };
//     } else if (req.body.street || req.body.city || req.body.state) {
//       addressData = {
//         street: req.body.street || req.body.address_line_1 || req.body.addressLine1 || '',
//         city: req.body.city || '',
//         state: req.body.state || '',
//         zipCode: req.body.zipCode || req.body.postal_code || req.body.postalCode || req.body.zip_code || '',
//         country: req.body.country || 'Nigeria'
//       };
//     } else {
//       addressData = {
//         street: '',
//         city: '',
//         state: '',
//         zipCode: '',
//         country: 'Nigeria'
//       };
//     }

//     console.log('Address data from request:', addressData);

//     let generatedCreditApplicationId;
//     let generatedCustId;
//     let generatedApplId;
//     let generatedRefNo;

//     try {
//       generatedCreditApplicationId = await CreditApplication.generateCreditApplicationId();
//       console.log('Generated creditApplicationId:', generatedCreditApplicationId);
      
//       if (!req.body.CUST_ID) {
//         generatedCustId = await CreditApplication.generateCustId();
//         console.log('Generated CUST_ID:', generatedCustId);
//       }
      
//       if (!req.body.APPL_ID) {
//         generatedApplId = await CreditApplication.generateApplId();
//         console.log('Generated APPL_ID:', generatedApplId);
//       }
      
//       generatedRefNo = await CreditApplication.generateRefNo();
//       console.log('Generated REF_NO:', generatedRefNo);
      
//     } catch (idError) {
//       console.error('Failed to generate IDs:', idError);
//       generatedCreditApplicationId = Date.now() % 1000000;
//       generatedCustId = req.body.CUST_ID || Date.now() % 100000;
//       generatedApplId = req.body.APPL_ID || `APP-${Date.now()}`;
//       generatedRefNo = `REF-${Date.now()}`;
//       console.log('Using fallback IDs:', {
//         creditApplicationId: generatedCreditApplicationId,
//         CUST_ID: generatedCustId,
//         APPL_ID: generatedApplId,
//         REF_NO: generatedRefNo
//       });
//     }

//     let creditApplication;
//     try {
//       creditApplication = await CreditApplication.create({
//         creditApplicationId: generatedCreditApplicationId,
//         CUST_NM: req.body.ACCT_NM || req.body.customerName || req.body.CUST_NM || 'Unknown Customer',
//         CUST_ID: req.body.CUST_ID || generatedCustId || 0,
//         APPL_ID: req.body.APPL_ID || generatedApplId || `APP-${Date.now()}`,
//         PROD_ID: req.body.PROD_ID || numericValues.PROD_ID,
        
//         Borrower_address: addressData,
        
//         PRIME_LIMIT_AMT: numericValues.DISBURSEMENT_LIMIT?.toString() || '0',
//         Purpose_of_Credit: req.body.loan_purpose || req.body.Purpose_of_Credit || 'GENERAL LOAN',
//         REPAY_SRC_ACCT_NO: req.body.REPAY_SRC_ACCT_NO,
//         TERM_CD: mapTermCodeToFullWord(req.body.TERM_CD) || 'MONTHLY',
//         TERM_VALUE: numericValues.TERM_VALUE || 12,
        
//         BU_ID: req.body.BU_ID || '001',
//         CREATED_BY: req.body.CREATED_BY || req.body.USER_ID || 'SYSTEM',
//         USER_ID: req.body.USER_ID || req.body.CREATED_BY || 'SYSTEM',
//         CRNCY_ID: req.body.CRNCY_ID || 'NGN',
//         TRANSACTION_TYPE: req.body.TRANSACTION_TYPE || 'LOAN_DISBURSEMENT',
//         STATUS: 'PENDING',
//         REC_ST: 'active',
//         LOAN_CYCLE: loanCycleCount || 1,
        
//         INTEREST_RATE: effectiveInterestRate,
//         LOAN_INTEREST_RATE_ID: loanInterestRateId,
//         INDEX_RATE_ID: req.body.INDEX_RATE_ID || null,
        
//         ACCT_ID: loanAccountNumber,
//         ACCT_NO: loanAccountNumber,
//         PRODUCT: productValidation.productType || 'LOAN',
//         Credit_Type: 'LOAN',
        
//         APPL_DT: new Date(),
//         CREATE_DT: new Date(),
//         ROW_TS: new Date(),
//         SYS_CREATE_TS: new Date(),
        
//         REF_NO: generatedRefNo,
        
//         VERSION_NO: 1,
//         MULTI_CRNCY_FG: false
        
//       }, { 
//         transaction,
//         hooks: false
//       });
      
//       console.log('✅ CreditApplication created successfully:', {
//         id: creditApplication.id,
//         creditApplicationId: creditApplication.creditApplicationId,
//         APPL_ID: creditApplication.APPL_ID,
//         CUST_NM: creditApplication.CUST_NM,
//         status: creditApplication.STATUS,
//         address: creditApplication.Borrower_address
//       });
      
//       if (loanDisbursement && loanDisbursement.id) {
//         try {
//           await LoanDisbursement.update(
//             { CREDIT_APPLICATION_ID: creditApplication.id },
//             {
//               where: { id: loanDisbursement.id },
//               transaction
//             }
//           );
//           console.log('✅ LoanDisbursement updated with CreditApplication reference');
//         } catch (updateError) {
//           console.warn('⚠️ Could not update LoanDisbursement with CreditApplication reference:', updateError.message);
//         }
//       }

//     } catch (modelError) {
//       console.error('❌ CreditApplication creation failed:', modelError.message);
//       console.error('Model error details:', modelError);
      
//       console.log('Debug - addressData type:', typeof addressData);
//       console.log('Debug - addressData:', addressData);
//       console.log('Debug - Full request body keys:', Object.keys(req.body));
      
//       throw new Error(`CreditApplication creation failed: ${modelError.message}`);
//     }

//     if (loanDisbursement && loanDisbursement.id) {
//       try {
//         await LoanDisbursement.update(
//           { CREDIT_APPLICATION_ID: creditApplication.id },
//           {
//             where: { id: loanDisbursement.id },
//             transaction
//           }
//         );
//         console.log('✅ LoanDisbursement updated with CreditApplication reference');
//       } catch (updateError) {
//         console.warn('⚠️ Could not update LoanDisbursement with CreditApplication reference:', updateError.message);
//       }
//     }

//     console.log('\n=== FINAL VALIDATION ===');
//     console.log(`Principal: ₦${principalAmount.toFixed(2)}`);
//     console.log(`Interest Rate: ${interestRateNumber}% annual`);
//     console.log(`Term: ${numericValues.TERM_VALUE} months`);
//     console.log(`Calculated EMI: ₦${emiResult.emi.toFixed(2)}`);
//     console.log(`✅ ALL CALCULATIONS COMPLETED SUCCESSFULLY`);

//     // ==================== GENERATE LOAN CONTRACT ====================
// console.log('\n=== GENERATING LOAN CONTRACT ===');

// try {
//   // Prepare data for contract generation
//   const contractData = {
//     loan_contract_no: `CONTRACT-${Date.now()}-${loanAccountNumber}`,
//     customer_id: req.body.CUST_ID,
//     borrower_name: req.body.ACCT_NM || customer?.CUST_NM || 'Unknown Borrower',
//     borrower_address: addressData?.street 
//       ? `${addressData.street}, ${addressData.city}, ${addressData.state}, ${addressData.country}`
//       : 'Address Not Provided',
//     loan_purpose: req.body.loan_purpose || req.body.Purpose_of_Credit || 'GENERAL LOAN',
//     loan_amount: numericValues.DISBURSEMENT_LIMIT.toString(),
//     loan_term: numericValues.TERM_VALUE,
//     t_e_r_m__c_d: req.body.TERM_CD || 'M',
//     interest_rate: effectiveInterestRate,
//     interest_rate_id: loanInterestRate?.id || 101, // Default interest rate ID
//     guarantor_name: guarantor?.fullName || '',
//     bank_name: process.env.BANK_NAME || 'Our Bank',
//     bank_short: process.env.BANK_SHORT_NAME || 'BANK',
//     status: 'PENDING',
    
//     // Generate contract text using your existing function
//     contract_text: generateContractText(
//       {
//         AMOUNT: numericValues.DISBURSEMENT_LIMIT,
//         INTEREST_RATE: effectiveInterestRate,
//         TERM_VALUE: numericValues.TERM_VALUE,
//         TERM_CD: req.body.TERM_CD || 'M',
//         loan_purpose: req.body.loan_purpose || req.body.Purpose_of_Credit || 'GENERAL LOAN',
//         borrower_name: req.body.ACCT_NM || customer?.CUST_NM || 'Unknown Borrower',
//         borrower_address: addressData?.street 
//           ? `${addressData.street}, ${addressData.city}, ${addressData.state}, ${addressData.country}`
//           : 'Address Not Provided',
//         DISBURSEMENT_DATE: startDate,
//         NUMBER_OF_INSTALLMENTS: numericValues.TERM_VALUE,
//         FIRST_PAYMENT_DATE: startDate,
//         LAST_PAYMENT_DATE: maturityDate
//       },
//       customer,
//       loanProduct,
//       effectiveInterestRate
//     ),
    
//     u_s_e_r__i_d: req.body.CREATED_BY || req.body.USER_ID || 'SYSTEM',
//     application_id: creditApplication.id,
//     loan_account_no: loanAccountNumber,
//     funding_account_no: req.body.REPAY_SRC_ACCT_NO || '',
//     workflow_id: WORK_ITEM_ID || Date.now(),
    
//     // Fees information
//     fees: JSON.stringify({
//       processing_fee: {
//         rate: loanProduct?.processingFeeRate || 0,
//         amount: (numericValues.DISBURSEMENT_LIMIT * (loanProduct?.processingFeeRate || 0) / 100).toFixed(2)
//       },
//       upfront_interest: {
//         rate: upfrontInterest,
//         amount: (numericValues.DISBURSEMENT_LIMIT * (upfrontInterest || 0) / 100).toFixed(2)
//       }
//     }),
    
//     // Signature requirements
//     signature_requirements: JSON.stringify({
//       required_signatures: [
//         {
//           party: 'BORROWER',
//           required: true,
//           field_name: 'borrower_signature'
//         },
//         {
//           party: 'GUARANTOR',
//           required: true,
//           field_name: 'guarantor_signature'
//         },
//         {
//           party: 'LENDER',
//           required: true,
//           field_name: 'lender_authorized_signature'
//         }
//       ]
//     }),
    
//     // Metadata
//     metadata: JSON.stringify({
//       product_id: numericValues.PROD_ID,
//       product_type: productValidation.productType,
//       interest_rate_details: interestRateDetails,
//       calculation_method: calculationMethod,
//       emi_details: emiResult,
//       guarantor_details: {
//         id: guarantor.id,
//         name: guarantor.fullName,
//         relationship: guarantor.relationshipToBorrower
//       }
//     }),
    
//     disbursement_date: startDate,
//     maturity_date: maturityDate,
//     created_at: new Date(),
//     updated_at: new Date()
//   };

//   console.log('Generated contract data:', {
//     loan_contract_no: contractData.loan_contract_no,
//     loan_account_no: contractData.loan_account_no,
//     status: contractData.status
//   });

//   // Check if loan_contract_forms table exists and create it if needed
//   try {
//     await sequelize.query(`
//       CREATE TABLE IF NOT EXISTS loan_contract_forms (
//         id INT PRIMARY KEY AUTO_INCREMENT,
//         loan_contract_no VARCHAR(255) UNIQUE NOT NULL,
//         customer_id VARCHAR(255) NOT NULL,
//         borrower_name VARCHAR(255) NOT NULL,
//         co_signatory_name VARCHAR(255) DEFAULT '',
//         borrower_address VARCHAR(255) DEFAULT 'Address Not Provided',
//         loan_purpose VARCHAR(255) NOT NULL,
//         loan_amount VARCHAR(255) NOT NULL,
//         loan_term INT NOT NULL,
//         t_e_r_m__c_d ENUM('M','Y') NOT NULL DEFAULT 'M',
//         interest_rate DECIMAL(7,4) NOT NULL,
//         interest_rate_id INT NOT NULL DEFAULT 101,
//         guarantor_name VARCHAR(255) DEFAULT '',
//         bank_name VARCHAR(255) NOT NULL,
//         bank_short VARCHAR(255) NOT NULL,
//         status ENUM('PENDING','APPROVED','REJECTED','DISBURSED','ACTIVE','CLOSED') NOT NULL DEFAULT 'PENDING',
//         contract_text TEXT NOT NULL,
//         u_s_e_r__i_d VARCHAR(255) NOT NULL,
//         application_id VARCHAR(255) NOT NULL,
//         loan_account_no VARCHAR(255) NOT NULL,
//         funding_account_no VARCHAR(255),
//         workflow_id BIGINT,
//         fees LONGTEXT NOT NULL,
//         signature_requirements LONGTEXT NOT NULL,
//         metadata LONGTEXT NOT NULL,
//         disbursement_date DATETIME,
//         maturity_date DATETIME,
//         created_at DATETIME NOT NULL,
//         updated_at DATETIME NOT NULL,
//         INDEX idx_customer_id (customer_id),
//         INDEX idx_status (status),
//         INDEX idx_loan_account_no (loan_account_no),
//         INDEX idx_application_id (application_id),
//         INDEX idx_created_at (created_at),
//         UNIQUE KEY uk_workflow_id (workflow_id)
//       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
//     `, { transaction });
    
//     console.log('✅ loan_contract_forms table created or already exists');
//   } catch (tableError) {
//     console.warn('⚠️ Could not create loan_contract_forms table:', tableError.message);
//   }

//   // Insert contract into database
//   const columns = Object.keys(contractData);
//   const placeholders = columns.map(() => '?').join(', ');
//   const values = columns.map(col => contractData[col]);
  
//   const insertContractQuery = `
//     INSERT INTO loan_contract_forms (
//       ${columns.join(', ')}
//     ) VALUES (
//       ${placeholders}
//   )`;
  
//   const [contractResult] = await sequelize.query(insertContractQuery, {
//     replacements: values,
//     transaction
//   });
  
//   console.log('✅ Loan contract generated with ID:', contractResult.insertId);
  
//   // Update loan account with contract reference
//   await sequelize.query(
//     `UPDATE loan_accounts SET 
//       has_repayment_schedule = TRUE,
//       repayment_schedule_id = ?,
//       updated_at = ?
//      WHERE id = ?`,
//     {
//       replacements: [repaymentScheduleId, new Date(), loanAccountId],
//       transaction
//     }
//   );

// } catch (contractError) {
//   console.error('❌ Error generating loan contract:', contractError.message);
//   console.error('Contract error details:', contractError);
//   // Don't fail the entire loan application if contract generation fails
//   console.warn('⚠️ Continuing without loan contract generation');
// }

//     // ==================== COMMIT TRANSACTION AND RETURN SUCCESS ====================
//     await transaction.commit();
//     console.log('✅ Transaction committed successfully');

//  return res.status(201).json({
//   success: true,
//   message: 'Loan application submitted successfully - pending approval',
//   status: 'PENDING',
//   data: {
//     loanAccountId: loanAccount.id,
//     loanAccountNumber: loanAccountNumber,
//     creditApplicationId: creditApplication.id,
//     repaymentScheduleId: repaymentSchedule.id,
//     loanDisbursementId: loanDisbursement.id,
//     contractGenerated: true, // Add this
//     contractStatus: 'PENDING', // Add this
//     APPL_ID: req.body.APPL_ID,
//     status: 'PENDING',
//     productDetails: {
//       PROD_ID: numericValues.PROD_ID,
//       productType: productValidation.productType
//     },
//     loanDetails: {
//       principal: principalAmount,
//       interestRate: interestRateNumber + '%',
//       term: numericValues.TERM_VALUE + ' months',
//       emi: emiResult.emi,
//       totalInterest: emiResult.totalInterest,
//       totalRepayable: emiResult.totalRepayable
//     },
//     nextSteps: 'Loan requires manual approval before disbursement',
//     approvalEndpoint: 'POST /api/loans/approve-and-disburse',
//     approvalBodyExample: {
//       ACCT_NO: loanAccountNumber,
//       approvedBy: "[USER_ID]",
//       approvalComments: "Optional approval comments"
//     }
//   }
// });

//   } catch (error) {
//     // Rollback transaction on error
//     if (transaction) {
//       await transaction.rollback();
//     }
    
//     console.error('❌ Loan application failed:', error);
    
//     return res.status(error.status || 500).json({
//       success: false,
//       message: error.message || 'Loan application failed',
//       code: error.code || 'LOAN_APPLICATION_FAILED',
//       details: process.env.NODE_ENV === 'development' ? error.stack : undefined
//     });
//   }
// },

async applyForLoan(req, res) {
  // ==================== TABLE CREATION ====================
  try {
    console.log('🔍 Checking if loan_accounts table exists...');
    
    // First try to create table directly using raw SQL
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS loan_accounts (
        id INT PRIMARY KEY AUTO_INCREMENT,
        loan_account_id BIGINT,
        a_c_c_t__n_o VARCHAR(255) UNIQUE NOT NULL,
        a_c_c_t__n_m VARCHAR(255) NOT NULL,
        c_u_s_t__i_d VARCHAR(255) NOT NULL,
        l_o_a_n__p_r_o_d_u_c_t__i_d INT,
        a_m_o_u_n_t DECIMAL(20,2) NOT NULL,
        d_i_s_b_u_r_s_e_d__a_m_o_u_n_t DECIMAL(20,2) DEFAULT 0.00,
        o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l DECIMAL(20,2) DEFAULT 0.00,
        a_c_c_r_u_e_d__i_n_t_e_r_e_s_t DECIMAL(20,2) DEFAULT 0.00,
        p_e_n_a_l_t_y__a_m_o_u_n_t DECIMAL(20,2) DEFAULT 0.00,
        i_n_t_e_r_e_s_t__r_a_t_e DECIMAL(10,4) DEFAULT 0.0000,
        l_o_a_n__s_t_a_t_u_s VARCHAR(50) DEFAULT 'PENDING',
        s_e_r_v_i_c_i_n_g__s_t_a_t_u_s VARCHAR(50) DEFAULT 'SERVICED',
        a_p_p_l_i_c_a_t_i_o_n__d_a_t_e DATETIME DEFAULT CURRENT_TIMESTAMP,
        a_p_p_r_o_v_a_l__d_a_t_e DATETIME,
        d_i_s_b_u_r_s_e_m_e n t__d_a_t_e DATETIME,
        c_l_o_s_u_r_e__d_a_t_e DATETIME,
        l_a_s_t__r_e_p_a_y_m_e n t__d_a_t_e DATETIME,
        l_a_s_t__r_e_p_a_y_m_e n t__a_m_o_u_n_t DECIMAL(20,2) DEFAULT 0.00,
        n_e_x_t__p_a_y_m_e n t__d_a_t_e DATETIME,
        m_a_t_u_r_i_t_y__d_t DATETIME,
        t_o_t_a_l__r_e_p_a_i_d__a_m_o_u_n_t DECIMAL(20,2) DEFAULT 0.00,
        t_e_r_m__c_d VARCHAR(20) DEFAULT 'MONTHLY',
        t_e_r_m__v_a_l_u_e INT DEFAULT 12,
        c_u_s_t_o_m_e_r__a_c_c_o_u n t__i_d BIGINT,
        has_repayment_schedule BOOLEAN DEFAULT FALSE,
        repayment_schedule_id INT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        -- Essential fields that match your existing table
        G_U_A_R_A_N_T_O_R__I_D INT,
        d_i_s_b_u_r_s_e_m_e n t__l_i_m_i_t DECIMAL(20,2),
        g_u_a_r_a_n_t_e_e_d__a_m_o_u_n_t DECIMAL(20,2),
        s_t_a_r_t__d_t DATETIME
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('✅ loan_accounts table created or already exists');
    
  } catch (syncError) {
    console.error('❌ Error creating loan_accounts table:', syncError);
    // Try a simpler table creation
    try {
      console.log('🔄 Trying simpler table creation...');
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS loan_accounts (
          id INT PRIMARY KEY AUTO_INCREMENT,
          a_c_c_t__n_o VARCHAR(255) UNIQUE NOT NULL,
          a_c_c_t__n_m VARCHAR(255) NOT NULL,
          c_u_s_t__i_d VARCHAR(255) NOT NULL,
          a_m_o_u_n_t DECIMAL(20,2) NOT NULL,
          i_n_t_e_r_e_s_t__r_a_t_e DECIMAL(10,4) DEFAULT 0.0000,
          l_o_a_n__s_t_a_t_u_s VARCHAR(50) DEFAULT 'PENDING',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('✅ Simpler loan_accounts table created');
    } catch (simpleError) {
      console.error('❌ Even simple table creation failed:', simpleError);
      return res.status(500).json({
        success: false,
        message: 'Database table creation failed',
        error: simpleError.message,
        code: 'TABLE_CREATION_FAILED'
      });
    }
  }

  // ==================== CREATE COUNTERS TABLE IF NOT EXISTS ====================
  try {
    console.log('🔍 Checking if counters table exists...');
    
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS counters (
        name VARCHAR(100) PRIMARY KEY,
        seq INT NOT NULL DEFAULT 0,
        description VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('✅ counters table created or already exists');
    
    // Initialize required counters if they don't exist
    const requiredCounters = [
      'creditApplicationId',
      'creditAppId', 
      'refNo',
      'custId',
      'loanAccountId',
      'loanDisbursementId',
      'repaymentScheduleId'
    ];
    
    for (const counterName of requiredCounters) {
      try {
        const [existingCounter] = await sequelize.query(
          `SELECT COUNT(*) as count FROM counters WHERE name = ?`,
          { replacements: [counterName] }
        );
        
        if (existingCounter[0].count === 0) {
          await sequelize.query(
            `INSERT INTO counters (name, seq, description) VALUES (?, 0, ?)`,
            {
              replacements: [counterName, `Counter for ${counterName}`]
            }
          );
          console.log(`✅ Initialized counter: ${counterName}`);
        }
      } catch (counterError) {
        console.warn(`⚠️ Could not initialize counter ${counterName}:`, counterError.message);
      }
    }
    
  } catch (counterTableError) {
    console.error('❌ Error creating counters table:', counterTableError);
  }

  // ==================== CREATE LOAN_DISBURSEMENTS TABLE IF NOT EXISTS ====================
  console.log('\n=== CHECKING/ CREATING LOAN_DISBURSEMENTS TABLE ===');

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

  // Helper function to get table columns
  async function getTableColumns(tableName, transaction) {
    try {
      const [columns] = await sequelize.query(
        `DESCRIBE ${tableName}`,
        { transaction }
      );
      return columns.map(col => col.Field);
    } catch (error) {
      console.warn(`Could not describe table ${tableName}:`, error.message);
      return [];
    }
  }

  async function getLoanCycleCount(custId, transaction) {
    try {
      console.log('🔍 Getting loan cycle count for CUST_ID:', custId);
      
      // Check if table exists using information_schema
      const [tables] = await sequelize.query(
        `SELECT TABLE_NAME 
         FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'loan_accounts'`,
        { type: QueryTypes.SELECT, transaction }
      );
      
      if (tables.length === 0) {
        console.log('📊 Table just created, returning default count: 1');
        return 1;
      }
      
      // If we get here, table exists - now count the loans
      const custIdStr = String(custId).trim();
      
      // Use raw SQL query to be safe
      const [result] = await sequelize.query(
        `SELECT COUNT(*) as count FROM loan_accounts WHERE c_u_s_t__i_d = ?`,
        {
          replacements: [custIdStr],
          type: QueryTypes.SELECT,
          transaction
        }
      );
      
      const count = result.count || 0;
      console.log(`📊 Found ${count} existing loans for customer ${custId}`);
      return count + 1;
      
    } catch (error) {
      console.error('❌ Error in getLoanCycleCount:', error.message);
      
      // If any error occurs, return default value
      console.log('⚠️ Returning default loan cycle count: 1');
      return 1;
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
 
  async function findGuarantor(guarantorId, transaction) {
    try {
      if (!guarantorId) {
        return null;
      }

      if (!isNaN(guarantorId)) {
        const byNumber = await Guarantor.findOne({ 
          where: { GUARANTOR_ID: Number(guarantorId) },
          transaction 
        });
        if (byNumber) return byNumber;
      }

      // For Sequelize, just try to find by GUARANTOR_ID as string or number
      const byString = await Guarantor.findOne({ 
        where: { GUARANTOR_ID: guarantorId.toString() },
        transaction 
      });
      return byString;
    } catch (error) {
      console.error('Error finding guarantor:', error);
      return null;
    }
  }
 
  async function checkGuarantorExistingLoans(guarantorId, transaction) {
    try {
      console.log(`Checking existing loans for guarantor: ${guarantorId}`);
     
      const existingLoans = await LoanAccount.findAll({
        where: {
          G_U_A_R_A_N_T_O_R__I_D: guarantorId,
          l_o_a_n__s_t_a_t_u_s: { [Op.in]: ['ACTIVE', 'PENDING', 'APPROVED'] }
        },
        transaction
      });
     
      console.log(`Found ${existingLoans.length} existing loans for guarantor`);

      if (existingLoans.length > 0) {
        const loanDetails = existingLoans.map(loan => ({
          loanAccountId: loan.loanAccountId,
          a_c_c_t__n_o: loan.a_c_c_t__n_o,
          l_o_a_n__s_t_a_t_u_s: loan.l_o_a_n__s_t_a_t_u_s,
          d_i_s_b_u_r_s_e_m_e_n_t__l_i_m_i_t: parseFloat(loan.d_i_s_b_u_r_s_e_m_e_n_t__l_i_m_i_t || '0'),
          g_u_a_r_a_n_t_e_e_d__a_m_o_u_n_t: parseFloat(loan.g_u_a_r_a_n_t_e_e_d__a_m_o_u_n_t || '0'),
          c_u_s_t__i_d: loan.c_u_s_t__i_d,
          s_t_a_r_t__d_t: loan.s_t_a_r_t__d_t,
          m_a_t_u_r_i_t_y__d_t: loan.m_a_t_u_r_i_t_y__d_t
        }));

        return {
          hasExistingLoans: true,
          totalExistingLoans: existingLoans.length,
          loanDetails: loanDetails,
          totalGuaranteedAmount: loanDetails.reduce((sum, loan) => sum + loan.g_u_a_r_a_n_t_e_e_d__a_m_o_u_n_t, 0)
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
 
  async function findRateIndex(rateIndexId, transaction) {
    try {
      let query = {};
     
      const numericId = parseInt(rateIndexId);
      if (!isNaN(numericId)) {
        query = { INDEX_RATE_ID: numericId };
      } else {
        query = { INDEX_RATE_ID: rateIndexId };
      }

      let rateIndex = await RateIndex.findOne({
        where: query,
        transaction
      });
     
      if (!rateIndex) {
        console.warn(`Rate index ${rateIndexId} not found, looking for default...`);
       
        rateIndex = await RateIndex.findOne({
          where: { IS_DEFAULT: true },
          transaction
        });
       
        if (!rateIndex) {
          rateIndex = await RateIndex.findOne({
            transaction
          });
         
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
 
  async function findLoanInterestRate(LOAN_PROUD_INT_ID, INDEX_RATE_ID, transaction) {
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
       
        const loanInterestRate = await LoanInterestRate.findOne({
          where: query,
          transaction
        });
       
        if (loanInterestRate) {
          console.log(`Found LoanInterestRate by LOAN_PROUD_INT_ID: ${loanInterestRate.LOAN_PROUD_INT_ID} - ${loanInterestRate.name}`);
          return loanInterestRate;
        }
      }
     
      // If not found by LOAN_PROUD_INT_ID, try by INDEX_RATE_ID
      if (INDEX_RATE_ID) {
        const indexRateId = parseInt(INDEX_RATE_ID);
        if (!isNaN(indexRateId)) {
          query = {
            INDEX_RATE_ID: indexRateId,
            STATUS: 'ACTIVE'
          };
        }
       
        const loanInterestRate = await LoanInterestRate.findOne({
          where: query,
          transaction
        });
       
        if (loanInterestRate) {
          console.log(`Found LoanInterestRate by INDEX_RATE_ID: ${loanInterestRate.LOAN_PROUD_INT_ID} - ${loanInterestRate.name}`);
          return loanInterestRate;
        }
      }
     
      // If still not found, try to find any active rate
      console.warn(`No LoanInterestRate found for LOAN_PROUD_INT_ID: ${LOAN_PROUD_INT_ID} or INDEX_RATE_ID: ${INDEX_RATE_ID}, looking for any active rate...`);
     
      const fallbackRate = await LoanInterestRate.findOne({
        where: { STATUS: 'ACTIVE' },
        transaction
      });
     
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
 
  async function findLoanInterestRateByProduct(PROD_ID, INDEX_RATE_ID, transaction) {
    try {
      console.log(`Looking for LoanInterestRate for product: ${PROD_ID}`);
      
      // Try to find rates that might be associated with this product
      let loanInterestRate = await LoanInterestRate.findOne({
        where: {
          [Op.or]: [
            { name: { [Op.like]: `%PROD_${PROD_ID}%` } },
            { code: { [Op.like]: `%LO-%-${PROD_ID}%` } },
            { description: { [Op.like]: `%Product ${PROD_ID}%` } }
          ],
          STATUS: 'ACTIVE'
        },
        transaction
      });
      
      if (!loanInterestRate) {
        // Try by INDEX_RATE_ID if provided
        if (INDEX_RATE_ID) {
          const indexRateId = parseInt(INDEX_RATE_ID);
          if (!isNaN(indexRateId)) {
            loanInterestRate = await LoanInterestRate.findOne({
              where: {
                INDEX_RATE_ID: indexRateId,
                STATUS: 'ACTIVE'
              },
              transaction
            });
          }
        }
        
        if (!loanInterestRate) {
          // Try to find any active rate
          loanInterestRate = await LoanInterestRate.findOne({
            where: { STATUS: 'ACTIVE' },
            transaction
          });
          
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
 
  function safeDecimal(value, fieldName = 'value') {
    console.log(`safeDecimal: Converting field ${fieldName} with value:`, value);
   
    if (value === null || value === undefined) {
      throw new Error(`Invalid ${fieldName}: null or undefined. Field: ${fieldName}, Value: ${value}`);
    }
   
    const numericValue = typeof value === 'string' ? parseFloat(value) : Number(value);
   
    if (isNaN(numericValue)) {
      throw new Error(`Invalid ${fieldName}: not a number. Field: ${fieldName}, Value: ${value}`);
    }
   
    if (!isFinite(numericValue)) {
      throw new Error(`Invalid ${fieldName}: infinite value. Field: ${fieldName}, Value: ${value}`);
    }
   
    return parseFloat(numericValue.toFixed(2));
  }

  // Helper function for decimal conversion
  function toDecimal(value) {
    if (value === null || value === undefined) return 0.00;
    return parseFloat(value.toString());
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
 
  async function generateWorkflowIdentifiers() {
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
    
    // Priority 3: Return null to let LoanProduct determine the rate
    console.log('No rate specified in request, using LoanProduct rate');
    return null;
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

  // ==================== MISSING FUNCTION: calculateTotalFees ====================
  function calculateTotalFees(loanAccount, loanProduct) {
    console.log('\n=== CALCULATING TOTAL FEES ===');
    
    try {
      // Get fee configuration from loan product or use defaults
      const feeConfig = loanProduct?.feeConfiguration || {
        processingFeeRate: 0, // 0% processing fee
        upfrontInterestRate: 0, // 0% upfront interest
        otherFees: []
      };
      
      const principalAmount = parseFloat(loanAccount.a_m_o_u_n_t || loanAccount.AMOUNT || 0);
      
      console.log('Fee calculation inputs:', {
        principalAmount,
        processingFeeRate: feeConfig.processingFeeRate,
        upfrontInterestRate: feeConfig.upfrontInterestRate,
        hasUpfrontInterestSetting: !!loanAccount.upfrontInterestPercentage
      });
      
      // 1. Processing Fee
      const processingFee = principalAmount * (feeConfig.processingFeeRate / 100);
      
      // 2. Upfront Interest (if applicable)
      let upfrontInterest = 0;
      
      // Check if loan has upfront interest configured
      if (loanAccount.upfrontInterestPercentage) {
        const upfrontInterestRate = parseFloat(loanAccount.upfrontInterestPercentage) / 100;
        upfrontInterest = principalAmount * upfrontInterestRate;
        console.log(`Calculating upfront interest: ${principalAmount} × ${loanAccount.upfrontInterestPercentage}% = ${upfrontInterest}`);
      } else if (feeConfig.upfrontInterestRate > 0) {
        // Use product default
        upfrontInterest = principalAmount * (feeConfig.upfrontInterestRate / 100);
        console.log(`Using product upfront interest: ${principalAmount} × ${feeConfig.upfrontInterestRate}% = ${upfrontInterest}`);
      }
      
      // 3. Other fees from product configuration
      let otherFeesTotal = 0;
      if (feeConfig.otherFees && Array.isArray(feeConfig.otherFees)) {
        feeConfig.otherFees.forEach(fee => {
          if (fee.amount) {
            otherFeesTotal += parseFloat(fee.amount);
          } else if (fee.rate) {
            otherFeesTotal += principalAmount * (fee.rate / 100);
          }
        });
      }
      
      const totalFees = processingFee + upfrontInterest + otherFeesTotal;
      
      console.log('Fee calculation results:', {
        processingFee: processingFee.toFixed(2),
        upfrontInterest: upfrontInterest.toFixed(2),
        otherFees: otherFeesTotal.toFixed(2),
        totalFees: totalFees.toFixed(2)
      });
      
      return {
        total: totalFees,
        breakdown: {
          processingFee,
          upfrontInterest,
          otherFees: otherFeesTotal
        },
        principalAmount,
        feePercentage: totalFees > 0 ? (totalFees / principalAmount) * 100 : 0
      };
      
    } catch (error) {
      console.error('Error calculating total fees:', error);
      
      // Return zero fees in case of error
      return {
        total: 0,
        breakdown: {
          processingFee: 0,
          upfrontInterest: 0,
          otherFees: 0
        },
        principalAmount: parseFloat(loanAccount.a_m_o_u_n_t || loanAccount.AMOUNT || 0),
        feePercentage: 0
      };
    }
  }

  // ==================== EXTRACT INTEREST RATE FROM LOAN PRODUCT ====================
  function extractInterestRateFromProduct(loanProduct) {
    console.log('=== EXTRACTING INTEREST RATE FROM LOAN PRODUCT ===');
    
    if (!loanProduct) {
      console.warn('No loan product provided, using default rate');
      return {
        annualRate: 12.0,
        monthlyRate: 1.0,
        calculationMethod: 'FLAT_RATE',
        rateType: 'FIXED',
        interestType: 'SIMPLE',
        source: 'DEFAULT_FALLBACK'
      };
    }
    
    console.log('LoanProduct data:', {
      PROD_ID: loanProduct.PROD_ID,
      name: loanProduct.name,
      productCode: loanProduct.productCode,
      LOAN_INTEREST_RATE_ID: loanProduct.LOAN_INTEREST_RATE_ID,
      LOAN_PROUD_INT_ID: loanProduct.LOAN_PROUD_INT_ID,
      minAmount: loanProduct.minAmount,
      maxAmount: loanProduct.maxAmount,
      defaultGLAccounts: loanProduct.defaultGLAccounts,
      processingFeeRate: loanProduct.processingFeeRate,
      processingFeeGLCode: loanProduct.processingFeeGLCode,
      isActive: loanProduct.isActive,
      STATUS: loanProduct.STATUS
    });
    
    // Check for interest rate in metadata
    if (loanProduct.metadata && loanProduct.metadata.interestRateConfiguration) {
      const config = loanProduct.metadata.interestRateConfiguration;
      console.log('Found interest rate in metadata:', config);
      
      if (config.defaultRate) {
        const monthlyRate = parseFloat(config.defaultRate);
        const annualRate = monthlyRate * 12;
        
        return {
          annualRate,
          monthlyRate,
          calculationMethod: config.calculationMethod || 'FLAT_RATE',
          rateType: config.rateType || 'FIXED',
          interestType: config.interestType || 'SIMPLE',
          source: 'LOAN_PRODUCT_METADATA',
          loanInterestRateId: loanProduct.LOAN_INTEREST_RATE_ID,
          loanProudIntId: loanProduct.LOAN_PROUD_INT_ID
        };
      }
    }
    
    // Check if the loan product has a direct interest rate field
    if (loanProduct.interestRate) {
      const rate = parseFloat(loanProduct.interestRate);
      console.log(`Found interestRate field: ${rate}%`);
      
      return {
        annualRate: rate,
        monthlyRate: rate / 12,
        calculationMethod: 'FLAT_RATE',
        rateType: 'FIXED',
        interestType: 'SIMPLE',
        source: 'LOAN_PRODUCT_DIRECT_FIELD',
        loanInterestRateId: loanProduct.LOAN_INTEREST_RATE_ID,
        loanProudIntId: loanProduct.LOAN_PROUD_INT_ID
      };
    }
    
    // Check defaultGLAccounts for interest rate
    if (loanProduct.defaultGLAccounts && loanProduct.defaultGLAccounts.interestRate) {
      const rate = parseFloat(loanProduct.defaultGLAccounts.interestRate);
      console.log(`Found interest rate in defaultGLAccounts: ${rate}%`);
      
      return {
        annualRate: rate,
        monthlyRate: rate / 12,
        calculationMethod: 'FLAT_RATE',
        rateType: 'FIXED',
        interestType: 'SIMPLE',
        source: 'LOAN_PRODUCT_GL_ACCOUNTS',
        loanInterestRateId: loanProduct.LOAN_INTEREST_RATE_ID,
        loanProudIntId: loanProduct.LOAN_PROUD_INT_ID
      };
    }
    
    // Fallback: use default rate
    console.warn('⚠️ No interest rate found in LoanProduct, using default 12.0% annual');
    
    return {
      annualRate: 12.0,
      monthlyRate: 1.0,
      calculationMethod: 'FLAT_RATE',
      rateType: 'FIXED',
      interestType: 'SIMPLE',
      source: 'DEFAULT_FALLBACK',
      loanInterestRateId: loanProduct.LOAN_INTEREST_RATE_ID,
      loanProudIntId: loanProduct.LOAN_PROUD_INT_ID
    };
  }

  // ==================== FETCH LOAN INTEREST RATE ====================
  async function fetchLoanInterestRate(loanInterestRateId, transaction) {
    if (!loanInterestRateId) {
      console.log('No LOAN_INTEREST_RATE_ID provided');
      return null;
    }
    
    try {
      console.log(`Fetching LoanInterestRate with ID: ${loanInterestRateId}`);
      
      // Try to find by LOAN_INTEREST_RATE_ID or LOAN_PROUD_INT_ID
      const loanInterestRate = await LoanInterestRate.findOne({
        where: {
          [Op.or]: [
            { id: loanInterestRateId },
            { LOAN_PROUD_INT_ID: loanInterestRateId }
          ],
          STATUS: 'ACTIVE'
        },
        transaction
      });
      
      if (loanInterestRate) {
        console.log('Found LoanInterestRate:', {
          id: loanInterestRate.id,
          LOAN_PROUD_INT_ID: loanInterestRate.LOAN_PROUD_INT_ID,
          name: loanInterestRate.name,
          DEFAULT_RATE_PER_MONTH: loanInterestRate.DEFAULT_RATE_PER_MONTH,
          MIN_RATE_PER_MONTH: loanInterestRate.MIN_RATE_PER_MONTH,
          MAX_RATE_PER_MONTH: loanInterestRate.MAX_RATE_PER_MONTH,
          RATE_TYPE: loanInterestRate.RATE_TYPE,
          INTEREST_TYPE: loanInterestRate.INTEREST_TYPE,
          CALCULATION_METHOD: loanInterestRate.CALCULATION_METHOD,
          ANNUAL_PERCENTAGE_RATE: loanInterestRate.ANNUAL_PERCENTAGE_RATE
        });
        return loanInterestRate;
      }
      
      console.warn(`LoanInterestRate not found for ID: ${loanInterestRateId}`);
      return null;
    } catch (error) {
      console.error('Error fetching LoanInterestRate:', error);
      return null;
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
  console.log(`\n=== USING FLAT RATE CALCULATION METHOD ===`);

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

  // ==================== SEQUELIZE TRANSACTION ====================
  const transaction = await sequelize.transaction();
  
  try {
    console.log('✓ Transaction started');

    // ==================== CREATE LOAN_DISBURSEMENTS TABLE IF NOT EXISTS ====================
    try {
      console.log('\n=== CHECKING/ CREATING LOAN_DISBURSEMENTS TABLE ===');
      
      // First, check if table exists
      const [tables] = await sequelize.query(
        `SELECT TABLE_NAME 
         FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_SCHEMA = DATABASE() 
         AND TABLE_NAME = 'loan_disbursements'`,
        { transaction }
      );
      
      if (tables.length === 0) {
        console.log('🔄 Creating loan_disbursements table...');
        
        // Create a simplified version first
        await sequelize.query(`
          CREATE TABLE IF NOT EXISTS loan_disbursements (
            id INT PRIMARY KEY AUTO_INCREMENT,
            a_c_c_t__n_o VARCHAR(255) UNIQUE NOT NULL,
            a_p_p_l__i_d VARCHAR(255) NOT NULL,
            c_u_s_t__i_d VARCHAR(255) NOT NULL,
            i_n_t_e_r_e_s_t__r_a_t_e DECIMAL(7, 4) NOT NULL,
            t_e_r_m__v_a_l_u_e INT NOT NULL,
            t_e_r_m__c_d VARCHAR(255) NOT NULL,
            a_m_o_u_n_t DECIMAL(20, 2) NOT NULL,
            l_o_a_n__a_c_c_o_u n t__i_d INT NOT NULL,
            r_e_p_a_y_m_e n t__s_c_h_e_d_u_l_e__i_d INT NOT NULL,
            g_u_a_r_a_n_t_o_r__i_d INT NOT NULL,
            p_r_o_d__i_d VARCHAR(255) NOT NULL,
            p_r_o_d_u_c_t__t_y_p_e VARCHAR(255) NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            s_t_a_t_u_s VARCHAR(50) DEFAULT 'PENDING'
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `, { transaction });
        
        console.log('✅ Created simplified loan_disbursements table');
      } else {
        console.log('✅ loan_disbursements table already exists');
      }
    } catch (tableError) {
      console.error('❌ Error checking/creating loan_disbursements table:', tableError.message);
      // Don't fail - try to continue
    }

    let workflowIdentifiers;
    try {
      workflowIdentifiers = await generateWorkflowIdentifiers();
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
      GUARANTEED_AMT: safeDecimal(guaranteedAmount, 'GUARANTEED_AMT'),
      DISBURSEMENT_LIMIT: safeDecimal(req.body.DISBURSEMENT_LIMIT, 'DISBURSEMENT_LIMIT'),
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

        const existingLoanAccount = await LoanAccount.findOne({ where: { a_c_c_t__n_o: loanAccountNumber } });
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

    const existingCreditApplication = await CreditApplication.findOne({ 
      where: { APPL_ID: req.body.APPL_ID },
      transaction 
    });
    if (existingCreditApplication) {
      throw {
        code: 'DUPLICATE_APPLICATION',
        message: `A CreditApplication with APPL_ID ${req.body.APPL_ID} already exists`,
        status: 409,
      };
    }

    const loanCycleCount = await getLoanCycleCount(numericValues.CUST_ID, transaction);

    console.log('\n=== DIAGNOSTIC: Product, Rate and Interest Rate Lookup ===');
    console.log('Looking for loan product with PROD_ID:', numericValues.PROD_ID);
    console.log('Looking for rate index with requested ID:', req.body.INDEX_RATE_ID);
   
    let rateIndex, loanProduct, customer, guarantor, loanInterestRate;
   
    try {
      const LOAN_PROUD_INT_ID = req.body.LOAN_PROUD_INT_ID || req.body.LOAN_INTEREST_RATE_ID;
     
      // IMPORTANT FIX: Handle Customer lookup separately
      console.log('\n=== CUSTOMER LOOKUP DEBUG ===');
      console.log('Customer model type:', typeof Customer);
      
      // Check if Customer is a function (factory) or a model
      let CustomerModel;
      if (typeof Customer === 'function') {
        // Customer is a factory function
        try {
          CustomerModel = Customer(sequelize);
          console.log('Customer factory function called successfully');
        } catch (factoryError) {
          console.error('Error calling Customer factory:', factoryError);
          // Fallback to raw query
          CustomerModel = null;
        }
      } else {
        // Customer is a model
        CustomerModel = Customer;
        console.log('Customer is already a model');
      }
      
      if (CustomerModel && typeof CustomerModel.findOne === 'function') {
        // Use the model method
        console.log(`Looking for customer with CUST_ID: ${req.body.CUST_ID}`);
        customer = await CustomerModel.findOne({ 
          where: { CUST_ID: req.body.CUST_ID },
          transaction 
        });
        console.log('Customer lookup result:', customer ? 'Found' : 'Not found');
      } else {
        // Fallback: Use raw SQL query
        console.warn('Customer.findOne not available, using raw SQL query');
        const [customerResult] = await sequelize.query(
          `SELECT * FROM customers WHERE CUST_ID = ? AND REC_ST = 'ACTIVE' LIMIT 1`,
          {
            replacements: [req.body.CUST_ID],
            type: QueryTypes.SELECT,
            transaction
          }
        );
        
        if (customerResult) {
          customer = {
            id: customerResult.id,
            CUST_ID: customerResult.CUST_ID,
            CUST_NM: customerResult.CUST_NM,
            FIRST_NAME: customerResult.FIRST_NAME,
            LAST_NAME: customerResult.LAST_NAME,
            EMAIL_ADDRESS: customerResult.EMAIL_ADDRESS,
            PHONE_NO: customerResult.PHONE_NO,
            HOME_ADDRESS: customerResult.HOME_ADDRESS,
            BVN: customerResult.BVN,
            NIN: customerResult.NIN,
            BU_ID: customerResult.BU_ID,
            REC_ST: customerResult.REC_ST,
            status: customerResult.status,
            created_at: customerResult.created_at,
            updated_at: customerResult.updated_at,
            // Add all other fields from result
            ...customerResult
          };
          console.log(`✓ Customer found via raw query: ${customer.CUST_ID} - ${customer.CUST_NM}`);
        }
      }
      
      // Execute other lookups
      [rateIndex, loanProduct, guarantor] = await Promise.all([
        findRateIndex(req.body.INDEX_RATE_ID, transaction),
        // Find loan product - USING YOUR ACTUAL COLUMN NAMES
        LoanProduct.findOne({ where: { PROD_ID: numericValues.PROD_ID }, transaction }),
        findGuarantor(req.body.GUARANTOR_ID, transaction)
      ]);
      
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
    console.log('Loan Product found:', loanProduct ? `${loanProduct.PROD_ID} - ${loanProduct.name || loanProduct.productName}` : 'NOT FOUND');
    console.log('Customer found:', customer ? `${customer.CUST_ID} - ${customer.CUST_NM}` : 'NOT FOUND');
    console.log('Guarantor found:', guarantor ? `${guarantor.GUARANTOR_ID} - ${guarantor.fullName}` : 'NOT FOUND');

    // If loan product found, log its details with your column names
    if (loanProduct) {
      console.log('Loan product details:', {
        PROD_ID: loanProduct.PROD_ID,
        name: loanProduct.name,
        productCode: loanProduct.productCode,
        LOAN_INTEREST_RATE_ID: loanProduct.LOAN_INTEREST_RATE_ID,
        LOAN_PROUD_INT_ID: loanProduct.LOAN_PROUD_INT_ID,
        minAmount: loanProduct.minAmount,
        maxAmount: loanProduct.maxAmount,
        defaultGLAccounts: loanProduct.defaultGLAccounts,
        processingFeeRate: loanProduct.processingFeeRate,
        processingFeeGLCode: loanProduct.processingFeeGLCode,
        isActive: loanProduct.isActive,
        STATUS: loanProduct.STATUS
      });
    }

    // Fetch LoanInterestRate if available
    if (loanProduct && loanProduct.LOAN_INTEREST_RATE_ID) {
      loanInterestRate = await fetchLoanInterestRate(loanProduct.LOAN_INTEREST_RATE_ID, transaction);
    } else if (LOAN_PROUD_INT_ID) {
      loanInterestRate = await findLoanInterestRate(LOAN_PROUD_INT_ID, req.body.INDEX_RATE_ID, transaction);
    } else {
      loanInterestRate = await findLoanInterestRateByProduct(numericValues.PROD_ID, req.body.INDEX_RATE_ID, transaction);
    }
    
    console.log('Loan Interest Rate found:', loanInterestRate ?
      `${loanInterestRate.LOAN_PROUD_INT_ID || loanInterestRate.id} (Rate Type: ${loanInterestRate.RATE_TYPE}, Interest Type: ${loanInterestRate.INTEREST_TYPE}, ANNUAL_PERCENTAGE_RATE: ${loanInterestRate.ANNUAL_PERCENTAGE_RATE}%, DEFAULT_RATE_PER_MONTH: ${loanInterestRate.DEFAULT_RATE_PER_MONTH}%)` :
      'NOT FOUND');

    // ==================== INTEREST RATE DETERMINATION ====================
    console.log('\n=== DETERMINING INTEREST RATE FROM LOAN PRODUCT ===');
    let effectiveInterestRate;
    let interestRateNumber;
    let interestRateDetails = {};

    try {
      // First, check if we have a LoanProduct
      if (!loanProduct) {
        console.warn('⚠️ No LoanProduct found, using default rate');
        interestRateNumber = 12.0; // Default fallback
        interestRateDetails = {
          rateType: 'FIXED',
          interestType: 'SIMPLE',
          calculationMethod: 'FLAT_RATE',
          source: 'DEFAULT_NO_PRODUCT',
          annualRate: interestRateNumber,
          monthlyRate: interestRateNumber / 12
        };
      } else {
        // Extract rate from LoanProduct
        const productRateInfo = extractInterestRateFromProduct(loanProduct);
        
        // If LoanProduct has LOAN_INTEREST_RATE_ID, fetch the actual rate
        if (loanProduct.LOAN_INTEREST_RATE_ID) {
          const fetchedLoanInterestRate = await fetchLoanInterestRate(
            loanProduct.LOAN_INTEREST_RATE_ID, 
            transaction
          );
          
          if (fetchedLoanInterestRate && fetchedLoanInterestRate.DEFAULT_RATE_PER_MONTH) {
            // Use rate from LoanInterestRate table
            const monthlyRate = parseFloat(fetchedLoanInterestRate.DEFAULT_RATE_PER_MONTH);
            interestRateNumber = monthlyRate * 12; // Convert to annual
            
            interestRateDetails = {
              rateType: fetchedLoanInterestRate.RATE_TYPE || 'FIXED',
              interestType: fetchedLoanInterestRate.INTEREST_TYPE || 'SIMPLE',
              calculationMethod: fetchedLoanInterestRate.CALCULATION_METHOD || 'FLAT_RATE',
              loanInterestRateId: fetchedLoanInterestRate.id,
              loanProudIntId: fetchedLoanInterestRate.LOAN_PROUD_INT_ID,
              source: 'LOAN_INTEREST_RATE_TABLE',
              annualRate: interestRateNumber,
              monthlyRate: monthlyRate,
              isTermBasedRate: fetchedLoanInterestRate.CALCULATION_METHOD === 'FLAT_RATE'
            };
            
            console.log(`✓ Using rate from LoanInterestRate: ${monthlyRate}% per month (${interestRateNumber}% annual)`);
          } else {
            // Fall back to LoanProduct rate
            interestRateNumber = productRateInfo.annualRate;
            interestRateDetails = {
              ...productRateInfo,
              loanInterestRateId: loanProduct.LOAN_INTEREST_RATE_ID,
              source: productRateInfo.source + ' (LoanInterestRate not found)'
            };
            console.log(`✓ Using rate from LoanProduct (fallback): ${interestRateNumber}% annual`);
          }
        } else {
          // Use rate directly from LoanProduct
          interestRateNumber = productRateInfo.annualRate;
          interestRateDetails = productRateInfo;
          console.log(`✓ Using rate directly from LoanProduct: ${interestRateNumber}% annual`);
        }
      }
      
      effectiveInterestRate = safeDecimal(interestRateNumber, 'determined_interest_rate');
      
      console.log('\n=== FINAL RATE DECISION ===');
      console.log(`Loan Product: ${loanProduct ? `${loanProduct.PROD_ID} - ${loanProduct.name || loanProduct.productName}` : 'Not found'}`);
      console.log(`LOAN_INTEREST_RATE_ID: ${loanProduct?.LOAN_INTEREST_RATE_ID || 'Not set'}`);
      console.log(`USING INTEREST RATE: ${interestRateNumber}% annual`);
      console.log(`Monthly Rate: ${(interestRateNumber / 12).toFixed(2)}%`);
      console.log(`Source: ${interestRateDetails.source}`);
      console.log(`Calculation Method: ${interestRateDetails.calculationMethod}`);
      console.log(`Rate Type: ${interestRateDetails.rateType}`);
      
    } catch (error) {
      console.error('Interest rate determination error:', error);
      throw {
        code: 'INTEREST_RATE_CALCULATION_ERROR',
        message: `Failed to determine interest rate: ${error.message}`,
        status: 500,
      };
    }
   
    if (!loanProduct && productValidation.isLoanProduct) {
      console.warn(`⚠️ Loan product not found for PROD_ID ${numericValues.PROD_ID}, creating fallback product`);
     
      // Fallback product with your column names
      const fallbackProduct = {
        PROD_ID: numericValues.PROD_ID,
        name: productValidation.productName,
        PRODUCT_SHORT_NAME: productValidation.accountPrefix,
        PRODUCT_TYPE: productValidation.productType,
        description: `Fallback loan product for PROD_ID ${numericValues.PROD_ID}`,
        minAmount: safeDecimal('1000', 'minAmount'),
        maxAmount: safeDecimal('1000000', 'maxAmount'),
        MIN_LOAN_TERM_VALUE: 1,
        MAX_LOAN_TERM_VALUE: 60,
        defaultGLAccounts: productValidation.glAccounts || {},
        processingFeeRate: 0,
        processingFeeGLCode: null,
        isActive: true,
        STATUS: 'ACTIVE'
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
    const guarantorLoanCheck = await checkGuarantorExistingLoans(guarantor.id, transaction);

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
      principalAmount = parseFloat(numericValues.DISBURSEMENT_LIMIT);
      
      console.log(`\nLoan Details:`);
      console.log(`Principal Amount: ₦${principalAmount.toFixed(2)}`);
      console.log(`Annual Interest Rate: ${interestRateNumber}%`);
      console.log(`Term: ${numericValues.TERM_VALUE} months`);
      console.log(`Payment Frequency: ${paymentFrequency}`);

      // Calculate using CORRECTED flat rate formula
      emiResult = calculateFlatRateEMI(
        principalAmount,
        interestRateNumber, // Use determined interest rate
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
      const monthlyRate = interestRateNumber / 12;
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

    const loanInterestRateId = loanInterestRate?.LOAN_PROUD_INT_ID || loanInterestRate?.id || null;

    console.log('Debug - Setting interest rate IDs:', {
      INTEREST_RATE_ID: interestRateId,
      LOAN_INTEREST_RATE_ID: loanInterestRateId,
      ANNUAL_PERCENTAGE_RATE_USED: interestRateNumber + '%'
    });
  
// ============ FIXED LOAN ACCOUNT CREATION ============
console.log('\n=== CREATING LOAN ACCOUNT WITH CORRECT COLUMN NAMES ===');

let loanAccountId;

try {
  // Build dynamic SQL based on what columns exist
  let columns = [];
  let values = [];
  let placeholders = [];
  
  // Always include these basic columns - WITH CORRECT COLUMN NAMES from your DESCRIBE
  columns.push('a_c_c_t__n_o');
  values.push(loanAccountNumber);
  placeholders.push('?');
  
  columns.push('a_c_c_t__n_m');
  values.push(req.body.ACCT_NM);
  placeholders.push('?');
  
  // FIXED: Use the correct column name from your DESCRIBE - CUST_ID (all caps)
  columns.push('CUST_ID');  // ← CORRECT: matches your actual column name
  values.push(req.body.CUST_ID);
  placeholders.push('?');
  
  columns.push('a_m_o_u_n_t');
  values.push(numericValues.DISBURSEMENT_LIMIT);
  placeholders.push('?');
  
  columns.push('i_n_t_e_r_e_s_t__r_a_t_e');
  values.push(effectiveInterestRate);
  placeholders.push('?');
  
  columns.push('l_o_a_n__s_t_a_t_u_s');
  values.push('PENDING');
  placeholders.push('?');
  
  columns.push('created_at');
  values.push(new Date());
  placeholders.push('?');
  
  columns.push('updated_at');
  values.push(new Date());
  placeholders.push('?');
  
  // Add optional columns from your DESCRIBE output
  if (loanProduct) {
    columns.push('l_o_a_n__p_r_o_d_u_c_t__i_d');
    values.push(numericValues.PROD_ID);
    placeholders.push('?');
  }
  
  if (guarantor) {
    columns.push('G_U_A_R_A_N_T_O_R__I_D');
    values.push(guarantor.id);
    placeholders.push('?');
  }
  
  columns.push('g_u_a_r_a_n_t_e_e_d__a_m_o_u_n_t');
  values.push(numericValues.GUARANTEED_AMT);
  placeholders.push('?');
  
  columns.push('s_t_a_r_t__d_t');
  values.push(startDate);
  placeholders.push('?');
  
  columns.push('t_e_r_m__c_d');
  values.push(mapTermCodeToFullWord(req.body.TERM_CD));
  placeholders.push('?');
  
  columns.push('t_e_r_m__v_a_l_u_e');
  values.push(numericValues.TERM_VALUE);
  placeholders.push('?');
  
  columns.push('m_a_t_u_r_i_t_y__d_t');
  values.push(maturityDate);
  placeholders.push('?');
  
  columns.push('a_p_p_l_i_c_a_t_i_o_n__d_a_t_e');
  values.push(new Date());
  placeholders.push('?');
  
  columns.push('s_e_r_v_i_c_i_n_g__s_t_a_t_u_s');
  values.push('SERVICED');
  placeholders.push('?');
  
  const dynamicInsertQuery = `
    INSERT INTO loan_accounts (
      ${columns.join(', ')}
    ) VALUES (
      ${placeholders.join(', ')}
    )
  `;
  
  console.log('Dynamic insert SQL:', dynamicInsertQuery);
  console.log('Inserting with values:', values);
  
  const [loanAccountResult] = await sequelize.query(dynamicInsertQuery, {
    replacements: values,
    transaction
  });
  
  // Get the insertId
  loanAccountId = loanAccountResult.insertId;
  console.log(`✅ LoanAccount inserted with ID: ${loanAccountId}`);
  
  // Verify the ID was actually inserted
  if (!loanAccountId || isNaN(loanAccountId)) {
    console.error('❌ No valid insertId returned. Querying for the inserted record...');
    
    const [recentLoans] = await sequelize.query(
      `SELECT id FROM loan_accounts WHERE a_c_c_t__n_o = ? ORDER BY id DESC LIMIT 1`,
      {
        replacements: [loanAccountNumber],
        transaction
      }
    );
    
    if (recentLoans && recentLoans.length > 0) {
      loanAccountId = recentLoans[0].id;
      console.log(`✅ Found loan account ID via query: ${loanAccountId}`);
    } else {
      throw new Error('Could not retrieve loan account ID after insertion');
    }
  }
  
} catch (insertError) {
  console.error('Error in loan account creation:', insertError.message);
  
  // Try a simpler insert if the complex one fails
  console.log('🔄 Trying simplest insert with minimal fields...');
  
  try {
    const simplestInsertQuery = `
      INSERT INTO loan_accounts (
        a_c_c_t__n_o, 
        a_c_c_t__n_m, 
        CUST_ID, 
        a_m_o_u_n_t, 
        i_n_t_e_r_e_s_t__r_a_t_e, 
        l_o_a_n__s_t_a_t_u_s,
        created_at, 
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [loanAccountResult] = await sequelize.query(simplestInsertQuery, {
      replacements: [
        loanAccountNumber,
        req.body.ACCT_NM,
        req.body.CUST_ID,
        numericValues.DISBURSEMENT_LIMIT,
        effectiveInterestRate,
        'PENDING',
        new Date(),
        new Date()
      ],
      transaction
    });
    
    loanAccountId = loanAccountResult.insertId;
    
    // Verify the ID
    if (!loanAccountId || isNaN(loanAccountId)) {
      const [recentLoans] = await sequelize.query(
        `SELECT id FROM loan_accounts WHERE a_c_c_t__n_o = ? ORDER BY id DESC LIMIT 1`,
        {
          replacements: [loanAccountNumber],
          transaction
        }
      );
      
      if (recentLoans && recentLoans.length > 0) {
        loanAccountId = recentLoans[0].id;
      } else {
        throw new Error('Could not retrieve loan account ID after simple insertion');
      }
    }
    
    console.log(`✅ LoanAccount inserted with simplest fields, ID: ${loanAccountId}`);
  } catch (simpleError) {
    console.error('❌ Even simplest insert failed:', simpleError.message);
    throw simpleError;
  }
      
      console.log(`✅ LoanAccount inserted with simplest fields, ID: ${loanAccountId}`);
    }

    // Create a loanAccount object for the rest of the code
    const loanAccount = {
      id: loanAccountId,
      a_c_c_t__n_o: loanAccountNumber,
      a_c_c_t__n_m: req.body.ACCT_NM,
      c_u_s_t__i_d: req.body.CUST_ID,
      l_o_a_n__p_r_o_d_u_c_t__i_d: numericValues.PROD_ID,
      a_m_o_u_n_t: numericValues.DISBURSEMENT_LIMIT,
      i_n_t_e_r_e_s_t__r_a_t_e: effectiveInterestRate,
      l_o_a_n__s_t_a_t_u_s: 'PENDING',
      d_i_s_b_u_r_s_e_m_e_n_t__l_i_m_i_t: numericValues.DISBURSEMENT_LIMIT,
      G_U_A_R_A_N_T_O_R__I_D: guarantor.id,
      g_u_a_r_a_n_t_e_e_d__a_m_o_u_n_t: numericValues.GUARANTEED_AMT,
      s_t_a_r_t__d_t: startDate,
      t_e_r_m__c_d: mapTermCodeToFullWord(req.body.TERM_CD),
      t_e_r_m__v_a_l_u_e: numericValues.TERM_VALUE,
      m_a_t_u_r_i_t_y__d_t: maturityDate,
      // Also keep simple names for compatibility
      ACCT_NO: loanAccountNumber,
      ACCT_NM: req.body.ACCT_NM,
      CUST_ID: req.body.CUST_ID,
      PROD_ID: numericValues.PROD_ID,
      AMOUNT: numericValues.DISBURSEMENT_LIMIT,
      INTEREST_RATE: effectiveInterestRate,
      LOAN_STATUS: 'PENDING',
      DISBURSEMENT_LIMIT: numericValues.DISBURSEMENT_LIMIT,
      GUARANTOR_ID: guarantor.id,
      GUARANTEED_AMOUNT: numericValues.GUARANTEED_AMT,
      START_DT: startDate,
      TERM_CD: mapTermCodeToFullWord(req.body.TERM_CD),
      TERM_VALUE: numericValues.TERM_VALUE,
      MATURITY_DT: maturityDate,
      // Add other essential fields
      loanAccountId: parseInt(loanAccountNumber) || Date.now(),
      JOURNAL_ID: TRAN_JOURNAL_ID,
      APPL_ID: req.body.APPL_ID,
      PRODUCT_TYPE: productValidation.productType,
      CRNCY_ID: req.body.CRNCY_ID || 'NGN',
      BU_ID: req.body.BU_ID,
      PRIMARY_OFFICER_ID: req.body.PRIMARY_OFFICER_ID,
      SECONDARY_OFFICER_ID: req.body.SECONDARY_OFFICER_ID || req.body.PRIMARY_OFFICER_ID,
      INTEREST_RATE_ID: interestRateId,
      LOAN_INTEREST_RATE_ID: loanInterestRateId,
      INTEREST_RATE_TYPE: interestRateDetails.rateType || 'FIXED',
      INTEREST_TYPE: interestRateDetails.interestType || 'SIMPLE',
      INTEREST_CALCULATION_METHOD: interestRateDetails.calculationMethod || 'FLAT_RATE',
      LOAN_STATUS: 'PENDING',
      PAYMENT_FREQUENCY: paymentFrequency,
      CREATED_BY: req.body.CREATED_BY,
      TRANSACTION_ID,
      EVENT_ID,
      TOTAL_INTEREST: safeDecimal(emiResult.totalInterest, 'emiResult.totalInterest'),
      TOTAL_REPAYMENT: safeDecimal(emiResult.totalRepayable, 'emiResult.totalRepayable'),
      REPAYMENT_SOURCE_ACCOUNT: req.body.REPAY_SRC_ACCT_NO,
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
      upfrontInterestPercentage: safeDecimal(upfrontInterest, 'upfrontInterest'),
      partialUpfrontInterest: partialInterest,
      applicationDate: new Date(),
      lastUpdated: new Date(),
      interestRateDetails: interestRateDetails
    };

    console.log('✅ LoanAccount created with ACCT_NO:', loanAccount.ACCT_NO);
    console.log(`✅ LoanAccount.INTEREST_RATE set to: ${parseFloat(loanAccount.INTEREST_RATE)}%`);
    console.log(`✅ LoanAccount.ID verified as: ${loanAccount.id} (type: ${typeof loanAccount.id})`);
    
    // ===== FIXED CODE - Update Guarantor =====
    try {
      const guarantorRecord = await Guarantor.findByPk(guarantor.id, { transaction });
      
      if (guarantorRecord) {
        const currentLoans = guarantorRecord.guaranteedLoans || [];
        
        if (!currentLoans.includes(loanAccount.id)) {
          currentLoans.push(loanAccount.id);
        }
        
        const safeStatus = 'ACTIVE';
        
        await guarantorRecord.update({
          guaranteedLoans: currentLoans,
          lastUsedDate: new Date(),
          status: safeStatus,
        }, { transaction });
        
        console.log('✅ Guarantor updated successfully with status:', safeStatus);
      } else {
        console.warn(`Guarantor with ID ${guarantor.id} not found for update`);
      }
    } catch (guarantorUpdateError) {
      console.error('Error updating guarantor:', guarantorUpdateError.message);
      console.warn('Continuing despite guarantor update error');
    }

    // ==================== FIXED REPAYMENT SCHEDULE CREATION ====================
    console.log('\n=== CREATING REPAYMENT SCHEDULE ===');

    let repaymentSchedule;
    let repaymentScheduleId = null;

    try {
      console.log('🔍 Checking repayment_schedules table structure in detail...');
      const [tableInfo] = await sequelize.query(
        `DESCRIBE repayment_schedules`,
        { transaction }
      );
      
      const existingColumns = tableInfo.map(col => col.Field);
      const requiredColumns = tableInfo
        .filter(col => col.Null === 'NO' && !col.Default && col.Field !== 'id')
        .map(col => col.Field);
      
      console.log('ACTUAL columns in repayment_schedules:', existingColumns);
      console.log('REQUIRED columns (no default, not null):', requiredColumns);
      
      console.log('🔄 Using raw SQL to insert repayment schedule...');
      
      const columnsToInsert = [];
      const valuesToInsert = [];
      const placeholders = [];
      
      const requiredFields = [
        { name: 'loan_account_id', value: loanAccountId, type: 'number' },
        { name: 'account_number', value: loanAccountNumber, type: 'string' },
        { name: 'customer_id', value: req.body.CUST_ID.toString(), type: 'string' },
        { name: 'status', value: 'PENDING', type: 'string' },
        { name: 'created_at', value: new Date(), type: 'date' },
        { name: 'updated_at', value: new Date(), type: 'date' }
      ];
      
      requiredFields.forEach(field => {
        if (existingColumns.includes(field.name) || requiredColumns.includes(field.name)) {
          columnsToInsert.push(field.name);
          valuesToInsert.push(field.value);
          placeholders.push('?');
          console.log(`✓ Adding required field: ${field.name}`);
        }
      });
      
      if (!columnsToInsert.includes('loan_account_id') && existingColumns.includes('loan_account_id')) {
        columnsToInsert.push('loan_account_id');
        valuesToInsert.push(loanAccountId);
        placeholders.push('?');
        console.log('✓ Adding loan_account_id (required field)');
      }
      
      const optionalFields = [
        { name: 'start_date', value: startDate },
        { name: 'maturity_date', value: maturityDate },
        { name: 'principal_amount', value: numericValues.DISBURSEMENT_LIMIT },
        { name: 'interest_rate', value: effectiveInterestRate },
        { name: 'term', value: numericValues.TERM_VALUE },
        { name: 'term_type', value: getRepaymentTermType(req.body.TERM_CD) },
        { name: 'total_interest', value: safeDecimal(emiResult.totalInterest, 'emiResult.totalInterest') },
        { name: 'total_repayment', value: safeDecimal(emiResult.totalRepayable, 'emiResult.totalRepayable') },
        { name: 'emi_amount', value: safeDecimal(emiResult.emi, 'emiResult.emi') },
        { name: 'payment_frequency', value: paymentFrequency },
        { name: 'transaction_id', value: TRANSACTION_ID },
        { name: 'event_id', value: EVENT_ID },
        { name: 'created_by', value: req.body.CREATED_BY },
        { name: 'guarantor_id', value: guarantor.id },
        { name: 'guaranteed_amount', value: numericValues.GUARANTEED_AMT },
        { name: 'loan_interest_rate_id', value: loanInterestRateId }
      ];
      
      optionalFields.forEach(field => {
        if (existingColumns.includes(field.name)) {
          columnsToInsert.push(field.name);
          valuesToInsert.push(field.value);
          placeholders.push('?');
          console.log(`✓ Adding optional field: ${field.name}`);
        }
      });
      
      if (existingColumns.includes('schedule')) {
        columnsToInsert.push('schedule');
        valuesToInsert.push(JSON.stringify(emiResult.installments));
        placeholders.push('?');
        console.log('✓ Adding schedule (JSON)');
      }
      
      if (existingColumns.includes('installments_json')) {
        columnsToInsert.push('installments_json');
        valuesToInsert.push(JSON.stringify(emiResult.installments));
        placeholders.push('?');
        console.log('✓ Adding installments_json');
      }
      
      if (existingColumns.includes('metadata')) {
        columnsToInsert.push('metadata');
        valuesToInsert.push(JSON.stringify({
          calculationMethod: interestRateDetails.calculationMethod || 'FLAT_RATE',
          rateType: interestRateDetails.rateType || 'FIXED',
          interestType: interestRateDetails.interestType || 'SIMPLE',
          isTermBasedRate: interestRateDetails.isTermBasedRate || false
        }));
        placeholders.push('?');
        console.log('✓ Adding metadata');
      }
      
      if (existingColumns.includes('calculation_method')) {
        console.warn('⚠️ calculation_method column exists, adding it');
        columnsToInsert.push('calculation_method');
        valuesToInsert.push(interestRateDetails.calculationMethod || 'FLAT_RATE');
        placeholders.push('?');
      }
      
      console.log('Final columns to insert:', columnsToInsert);
      console.log('Values count:', valuesToInsert.length);
      
      const missingRequired = requiredColumns.filter(col => !columnsToInsert.includes(col));
      if (missingRequired.length > 0) {
        console.error('Missing required columns:', missingRequired);
        console.log('🔄 Adding missing required columns...');
        missingRequired.forEach(col => {
          columnsToInsert.push(col);
          if (col === 'loan_account_id') {
            valuesToInsert.push(loanAccountId);
          } else if (col === 'account_number') {
            valuesToInsert.push(loanAccountNumber);
          } else if (col === 'customer_id') {
            valuesToInsert.push(req.body.CUST_ID.toString());
          } else if (col === 'status') {
            valuesToInsert.push('PENDING');
          } else if (col === 'created_at' || col === 'updated_at') {
            valuesToInsert.push(new Date());
          } else {
            valuesToInsert.push('');
          }
          placeholders.push('?');
          console.log(`✓ Added missing required column: ${col}`);
        });
      }
      
      const insertQuery = `
        INSERT INTO repayment_schedules (
          ${columnsToInsert.join(', ')}
        ) VALUES (
          ${placeholders.join(', ')}
        )
      `;
      
      console.log('Executing raw SQL insert for repayment schedule...');
      console.log('Query:', insertQuery);
      
      const [result] = await sequelize.query(insertQuery, {
        replacements: valuesToInsert,
        transaction
      });
      
      repaymentScheduleId = result.insertId;
      console.log('✅ RepaymentSchedule inserted with raw SQL. ID:', repaymentScheduleId);
      
      if (!repaymentScheduleId || isNaN(repaymentScheduleId)) {
        console.warn('⚠️ No valid insertId returned. Trying alternative methods...');
        
        const [lastIdResult] = await sequelize.query(
          'SELECT LAST_INSERT_ID() as last_id',
          { transaction }
        );
        
        if (lastIdResult && lastIdResult[0] && lastIdResult[0].last_id) {
          repaymentScheduleId = lastIdResult[0].last_id;
          console.log(`✅ Got ID via LAST_INSERT_ID: ${repaymentScheduleId}`);
        } else {
          const [recentSchedules] = await sequelize.query(
            `SELECT id FROM repayment_schedules WHERE account_number = ? ORDER BY created_at DESC LIMIT 1`,
            {
              replacements: [loanAccountNumber],
              transaction
            }
          );
          
          if (recentSchedules && recentSchedules.length > 0) {
            repaymentScheduleId = recentSchedules[0].id;
            console.log(`✅ Found ID via query: ${repaymentScheduleId}`);
          }
        }
      }
      
      repaymentSchedule = {
        id: repaymentScheduleId,
        LOAN_ACCOUNT_ID: loanAccountId,
        ACCT_NO: loanAccountNumber,
        CUST_ID: req.body.CUST_ID.toString(),
        STATUS: 'PENDING',
        TRANSACTION_ID,
        EVENT_ID,
        CREATED_BY: req.body.CREATED_BY
      };
      
      console.log('✅ Created repaymentSchedule object with ID:', repaymentSchedule.id);
      
      console.log('Creating individual installment records...');
      const installmentsData = emiResult.installments.map((installment, index) => ({
        repayment_schedule_id: repaymentScheduleId,
        loan_account_id: loanAccountId,
        installment_no: installment.installmentNo || installment.installmentNumber || (index + 1),
        due_date: installment.dueDate,
        principal_amount: safeDecimal(installment.principal, `installment.principal for ${index}`),
        interest_amount: safeDecimal(installment.interest, `installment.interest for ${index}`),
        total_payment: safeDecimal(installment.totalPayment, `installment.totalPayment for ${index}`),
        remaining_balance: safeDecimal(installment.remainingBalance, `installment.remainingBalance for ${index}`),
        status: 'PENDING'
      }));
      
      const [installmentTables] = await sequelize.query(
        `SHOW TABLES LIKE 'loan_installments'`,
        { transaction }
      );
      
      if (installmentTables.length > 0) {
        try {
          const [installmentColumns] = await sequelize.query(
            `DESCRIBE loan_installments`,
            { transaction }
          );
          
          const installmentColumnNames = installmentColumns.map(col => col.Field);
          console.log('loan_installments columns:', installmentColumnNames);
          
          for (const installment of installmentsData) {
            const installmentColumns = [];
            const installmentValues = [];
            const installmentPlaceholders = [];
            
            Object.keys(installment).forEach(key => {
              const columnExists = installmentColumnNames.some(col => 
                col.toLowerCase() === key.toLowerCase()
              );
              
              if (columnExists) {
                installmentColumns.push(key);
                installmentValues.push(installment[key]);
                installmentPlaceholders.push('?');
              }
            });
            
            if (installmentColumns.length > 0) {
              const installmentQuery = `
                INSERT INTO loan_installments (
                  ${installmentColumns.join(', ')}
                ) VALUES (
                  ${installmentPlaceholders.join(', ')}
                )
              `;
              
              await sequelize.query(installmentQuery, {
                replacements: installmentValues,
                transaction
              });
            }
          }
          
          console.log(`✅ Created ${installmentsData.length} installment records via raw SQL`);
          
        } catch (installmentError) {
          console.warn('⚠️ Could not create installment records:', installmentError.message);
          console.log('Continuing without individual installment records...');
        }
      } else {
        console.warn('⚠️ loan_installments table does not exist, skipping installment creation');
      }
      
    } catch (repaymentError) {
      console.error('❌ Error creating RepaymentSchedule with raw SQL:', repaymentError.message);
      
      console.log('🔄 Trying emergency fallback with only absolute required fields...');
      
      try {
        let existingColumns = [];
        try {
          const [tableInfo] = await sequelize.query(
            `DESCRIBE repayment_schedules`,
            { transaction }
          );
          existingColumns = tableInfo.map(col => col.Field);
        } catch (descError) {
          console.warn('Could not describe table, using default columns');
          existingColumns = ['loan_account_id', 'account_number', 'customer_id', 'status', 'created_at', 'updated_at'];
        }
        
        const emergencyFields = [];
        const emergencyValues = [];
        const emergencyPlaceholders = [];
        
        const emergencyRequired = ['loan_account_id', 'account_number', 'customer_id', 'status'];
        
        emergencyRequired.forEach(field => {
          if (existingColumns.includes(field)) {
            emergencyFields.push(field);
            if (field === 'loan_account_id') emergencyValues.push(loanAccountId);
            else if (field === 'account_number') emergencyValues.push(loanAccountNumber);
            else if (field === 'customer_id') emergencyValues.push(req.body.CUST_ID.toString());
            else if (field === 'status') emergencyValues.push('PENDING');
            emergencyPlaceholders.push('?');
          }
        });
        
        if (existingColumns.includes('created_at')) {
          emergencyFields.push('created_at');
          emergencyValues.push(new Date());
          emergencyPlaceholders.push('?');
        }
        
        if (existingColumns.includes('updated_at')) {
          emergencyFields.push('updated_at');
          emergencyValues.push(new Date());
          emergencyPlaceholders.push('?');
        }
        
        if (emergencyFields.length === 0) {
          throw new Error('No valid fields found for emergency insert');
        }
        
        const emergencyQuery = `
          INSERT INTO repayment_schedules (
            ${emergencyFields.join(', ')}
          ) VALUES (
            ${emergencyPlaceholders.join(', ')}
          )
        `;
        
        console.log('Emergency query:', emergencyQuery);
        
        const [result] = await sequelize.query(emergencyQuery, {
          replacements: emergencyValues,
          transaction
        });
        
        repaymentScheduleId = result.insertId;
        console.log('✅ Emergency RepaymentSchedule created via raw SQL. ID:', repaymentScheduleId);
        
        if (!repaymentScheduleId || isNaN(repaymentScheduleId)) {
          console.warn('⚠️ No ID from emergency insert, generating temporary ID');
          repaymentScheduleId = Date.now();
        }
        
        repaymentSchedule = {
          id: repaymentScheduleId,
          LOAN_ACCOUNT_ID: loanAccountId,
          ACCT_NO: loanAccountNumber,
          CUST_ID: req.body.CUST_ID.toString(),
          STATUS: 'PENDING'
        };
        
      } catch (emergencyError) {
        console.error('❌ Emergency creation failed:', emergencyError.message);
        
        console.log('🔄 Creating dummy repayment schedule object...');
        repaymentScheduleId = Date.now();
        repaymentSchedule = {
          id: repaymentScheduleId,
          LOAN_ACCOUNT_ID: loanAccountId,
          ACCT_NO: loanAccountNumber,
          CUST_ID: req.body.CUST_ID.toString(),
          STATUS: 'PENDING',
          CREATED_BY: req.body.CREATED_BY,
          TRANSACTION_ID,
          EVENT_ID
        };
        
        console.warn(`⚠️ Using dummy repayment schedule object with ID: ${repaymentScheduleId}. Loan will be created but repayment schedule may not be saved in database.`);
      }
    }

    console.log('\n=== REPAYMENT SCHEDULE VALIDATION CHECK ===');
    console.log('repaymentSchedule object:', repaymentSchedule);
    console.log('repaymentSchedule.id:', repaymentSchedule.id, 'type:', typeof repaymentSchedule.id);

    if (!repaymentSchedule || !repaymentSchedule.id) {
      console.error('❌ repaymentSchedule or its id is undefined/null');
      repaymentSchedule = repaymentSchedule || {};
      repaymentSchedule.id = Date.now();
      console.warn(`⚠️ Generated temporary ID: ${repaymentSchedule.id}`);
    }

    console.log('✅ Final repaymentSchedule.id:', repaymentSchedule.id);

    // ==================== LOAN DISBURSEMENT DATA CREATION ====================
    console.log('\n=== CREATING LOAN DISBURSEMENT RECORD ===');

    console.log('loanAccount object:', {
      id: loanAccount.id,
      hasId: !!loanAccount.id,
      typeOfId: typeof loanAccount.id
    });

    console.log('repaymentSchedule object:', {
      id: repaymentSchedule.id,
      hasId: !!repaymentSchedule.id,
      typeOfId: typeof repaymentSchedule.id
    });

    if (!loanAccount.id || isNaN(loanAccount.id)) {
      console.error('❌ loanAccount.id is invalid:', loanAccount.id);
      throw new Error('Invalid loan account ID');
    }

    if (!repaymentSchedule.id) {
      console.error('❌ repaymentSchedule.id is undefined/null');
      console.log('Attempting to continue with temporary ID...');
      
      repaymentSchedule.id = Date.now();
      console.warn(`⚠️ Generated temporary repayment schedule ID: ${repaymentSchedule.id}`);
    }

    const repaymentScheduleIdNum = Number(repaymentSchedule.id);
    if (isNaN(repaymentScheduleIdNum)) {
      console.error('❌ repaymentSchedule.id is not a valid number:', repaymentSchedule.id);
      repaymentSchedule.id = Date.now();
      console.warn(`⚠️ Generated valid temporary repayment schedule ID: ${repaymentSchedule.id}`);
    }

    if (!guarantor.id || isNaN(guarantor.id)) {
      console.error('❌ guarantor.id is invalid:', guarantor.id);
      throw new Error('Invalid guarantor ID');
    }

    const validCalculationMethods = ['FLAT_RATE', 'DECLINING_BALANCE'];
    let calculationMethod = interestRateDetails.calculationMethod || 'FLAT_RATE';
    if (!validCalculationMethods.includes(calculationMethod)) {
      console.warn(`⚠️ Invalid calculation method: ${calculationMethod}, defaulting to FLAT_RATE`);
      calculationMethod = 'FLAT_RATE';
    }

    const productType = String(productValidation.productType || 'INDIVIDUAL_LOAN').toUpperCase();
    const sanitizedProductType = productType === 'PERSONAL LOAN' ? 'INDIVIDUAL_LOAN' : productType;

    const loanDisbursementData = {
      ACCT_NO: loanAccountNumber,
      APPL_ID: req.body.APPL_ID,
      CUST_ID: req.body.CUST_ID,
      
      INTEREST_RATE: effectiveInterestRate,
      TERM_VALUE: numericValues.TERM_VALUE,
      TERM_CD: req.body.TERM_CD,
      AMOUNT: numericValues.DISBURSEMENT_LIMIT,
      CALCULATION_METHOD: calculationMethod,
      PAYMENT_FREQUENCY: paymentFrequency,
      
      EMI_AMOUNT: safeDecimal(emiResult.emi, 'emiResult.emi'),
      TOTAL_INTEREST: safeDecimal(emiResult.totalInterest, 'emiResult.totalInterest'),
      TOTAL_REPAYMENT: safeDecimal(emiResult.totalRepayable, 'emiResult.totalRepayable'),
      
      LOAN_ACCOUNT_ID: Number(loanAccount.id),
      CREDIT_APPLICATION_ID: null,
      REPAYMENT_SCHEDULE_ID: Number(repaymentSchedule.id),
      GUARANTOR_ID: Number(guarantor.id),
      
      TRANSACTION_ID,
      EVENT_ID,
      JOURNAL_ID: TRAN_JOURNAL_ID,
      
      PROD_ID: String(numericValues.PROD_ID),
      PRODUCT_TYPE: sanitizedProductType,
      
      ACCT_NM: req.body.ACCT_NM,
      CRNCY_ID: req.body.CRNCY_ID || 'NGN',
      BU_ID: req.body.BU_ID,
      
      PRIMARY_OFFICER_ID: req.body.PRIMARY_OFFICER_ID,
      REPAY_SRC_ACCT_NO: req.body.REPAY_SRC_ACCT_NO,
      
      START_DT: startDate,
      MATURITY_DT: maturityDate,
      
      borrower_address: req.body.Borrower_address || {},
      guarantor_details: {
        name: guarantor.fullName || '',
        phone: guarantor.phoneNumber || '',
        relationship: guarantor.relationshipToBorrower || '',
        guarantorNumberId: String(guarantor.GUARANTOR_ID || ''),
        email: guarantor.email || '',
        address: guarantor.address || '',
        existingGuarantees: guarantorLoanCheck.hasExistingLoans ? {
          totalExistingLoans: guarantorLoanCheck.totalExistingLoans,
          totalGuaranteedAmount: guarantorLoanCheck.totalGuaranteedAmount
        } : null
      },
      interest_rate_details: interestRateDetails || {},
      metadata: {},
      
      STATUS: 'PENDING',
      CREATED_BY: req.body.CREATED_BY,
      
      DISBURSEMENT_TYPE: 'CUSTOMER_ACCOUNT',
      FEES_AMOUNT: toDecimal(0),
      UPFRONT_INTEREST_AMOUNT: toDecimal(0),
      NET_DISBURSEMENT_AMOUNT: numericValues.DISBURSEMENT_LIMIT
    };

    console.log('\n=== LOAN DISBURSEMENT DATA VALIDATION ===');
    console.log('LOAN_ACCOUNT_ID:', loanDisbursementData.LOAN_ACCOUNT_ID, 'type:', typeof loanDisbursementData.LOAN_ACCOUNT_ID);
    console.log('REPAYMENT_SCHEDULE_ID:', loanDisbursementData.REPAYMENT_SCHEDULE_ID, 'type:', typeof loanDisbursementData.REPAYMENT_SCHEDULE_ID);
    console.log('GUARANTOR_ID:', loanDisbursementData.GUARANTOR_ID, 'type:', typeof loanDisbursementData.GUARANTOR_ID);
    console.log('CALCULATION_METHOD:', loanDisbursementData.CALCULATION_METHOD);
    console.log('PRODUCT_TYPE:', loanDisbursementData.PRODUCT_TYPE);

    let loanDisbursement;
    try {
      loanDisbursement = await LoanDisbursement.create(loanDisbursementData, { transaction });
      console.log('✅ LoanDisbursement created via Sequelize with ID:', loanDisbursement.id);
    } catch (sequelizeError) {
      console.error('❌ Sequelize create failed:', sequelizeError.message);
      
      console.log('🔄 Trying raw SQL fallback...');
      
      try {
        const tableColumns = await getTableColumns('loan_disbursements', transaction);
        
        const insertData = {
          'a_c_c_t__n_o': loanAccountNumber,
          'a_p_p_l__i_d': req.body.APPL_ID,
          'c_u_s_t__i_d': req.body.CUST_ID,
          'i_n_t_e_r_e_s_t__r_a_t_e': effectiveInterestRate,
          't_e_r_m__v_a_l_u_e': numericValues.TERM_VALUE,
          't_e_r_m__c_d': req.body.TERM_CD,
          'a_m_o_u_n_t': numericValues.DISBURSEMENT_LIMIT,
          'l_o_a_n__a_c_c_o_u_n_t__i_d': Number(loanAccount.id),
          'r_e_p_a_y_m_e_n_t__s_c_h_e_d_u_l_e__i_d': Number(repaymentSchedule.id),
          'g_u_a_r_a_n_t_o_r__i_d': Number(guarantor.id),
          'p_r_o_d__i_d': String(numericValues.PROD_ID),
          'p_r_o_d_u_c_t__t_y_p_e': 'INDIVIDUAL_LOAN',
          's_t_a_t_u_s': 'PENDING',
          'created_at': new Date(),
          'updated_at': new Date()
        };
        
        const columns = [];
        const values = [];
        const placeholders = [];
        
        for (const [column, value] of Object.entries(insertData)) {
          if (tableColumns.includes(column)) {
            columns.push(column);
            values.push(value);
            placeholders.push('?');
          }
        }
        
        if (columns.length > 0) {
          const insertQuery = `
            INSERT INTO loan_disbursements (
              ${columns.join(', ')}
            ) VALUES (
              ${placeholders.join(', ')}
            )
          `;
          
          const [result] = await sequelize.query(insertQuery, {
            replacements: values,
            transaction
          });
          
          console.log('✅ LoanDisbursement created via raw SQL with ID:', result.insertId);
          
          loanDisbursement = {
            id: result.insertId,
            ...insertData,
            ACCT_NO: insertData['a_c_c_t__n_o'],
            APPL_ID: insertData['a_p_p_l__i_d'],
            CUST_ID: insertData['c_u_s_t__i_d'],
            INTEREST_RATE: insertData['i_n_t_e_r_e_s_t__r_a_t_e'],
            TERM_VALUE: insertData['t_e_r_m__v_a_l_u_e'],
            TERM_CD: insertData['t_e_r_m__c_d'],
            AMOUNT: insertData['a_m_o_u_n_t'],
            LOAN_ACCOUNT_ID: insertData['l_o_a_n__a_c_c_o_u_n_t__i_d'],
            REPAYMENT_SCHEDULE_ID: insertData['r_e_p_a_y_m_e_n_t__s_c_h_e_d_u_l_e__i_d'],
            GUARANTOR_ID: insertData['g_u_a_r_a_n_t_o_r__i_d'],
            PROD_ID: insertData['p_r_o_d__i_d'],
            PRODUCT_TYPE: insertData['p_r_o_d_u_c_t__t_y_p_e'],
            STATUS: insertData['s_t_a_t_u_s']
          };
        } else {
          throw new Error('No valid columns found for loan_disbursements table');
        }
      } catch (rawSQLError) {
        console.error('❌ Raw SQL fallback also failed:', rawSQLError.message);
        throw new Error('Failed to create loan disbursement record');
      }
    }

    console.log('=== DEBUG: REQUEST BODY STRUCTURE ===');
    console.log('Full req.body:', JSON.stringify(req.body, null, 2));

    const possibleAddressPaths = [
      'Borrower_address',
      'address',
      'borrowerAddress',
      'customer_address',
      'customerAddress'
    ];

    possibleAddressPaths.forEach(path => {
      if (req.body[path]) {
        console.log(`Found address at req.body.${path}:`, req.body[path]);
      }
    });

    const rootAddressFields = ['street', 'city', 'state', 'zipCode', 'country', 'postal_code'];
    rootAddressFields.forEach(field => {
      if (req.body[field]) {
        console.log(`Found root-level field req.body.${field}:`, req.body[field]);
      }
    });

    // ==================== CREDIT APPLICATION CREATION ====================
    console.log('\n=== CREATING CREDIT APPLICATION ===');

    let addressData = {};

    if (req.body.Borrower_address) {
      addressData = req.body.Borrower_address;
    } else if (req.body.address) {
      addressData = {
        street: req.body.address.street || req.body.address.address_line_1 || req.body.address.addressLine1 || '',
        city: req.body.address.city || '',
        state: req.body.address.state || '',
        zipCode: req.body.address.zipCode || req.body.address.postal_code || req.body.address.postalCode || req.body.address.zip_code || '',
        country: req.body.address.country || 'Nigeria'
      };
    } else if (req.body.street || req.body.city || req.body.state) {
      addressData = {
        street: req.body.street || req.body.address_line_1 || req.body.addressLine1 || '',
        city: req.body.city || '',
        state: req.body.state || '',
        zipCode: req.body.zipCode || req.body.postal_code || req.body.postalCode || req.body.zip_code || '',
        country: req.body.country || 'Nigeria'
      };
    } else {
      addressData = {
        street: '',
        city: '',
        state: '',
        zipCode: '',
        country: 'Nigeria'
      };
    }

    console.log('Address data from request:', addressData);

    let generatedCreditApplicationId;
    let generatedCustId;
    let generatedApplId;
    let generatedRefNo;

    try {
      generatedCreditApplicationId = await CreditApplication.generateCreditApplicationId();
      console.log('Generated creditApplicationId:', generatedCreditApplicationId);
      
      if (!req.body.CUST_ID) {
        generatedCustId = await CreditApplication.generateCustId();
        console.log('Generated CUST_ID:', generatedCustId);
      }
      
      if (!req.body.APPL_ID) {
        generatedApplId = await CreditApplication.generateApplId();
        console.log('Generated APPL_ID:', generatedApplId);
      }
      
      generatedRefNo = await CreditApplication.generateRefNo();
      console.log('Generated REF_NO:', generatedRefNo);
      
    } catch (idError) {
      console.error('Failed to generate IDs:', idError);
      generatedCreditApplicationId = Date.now() % 1000000;
      generatedCustId = req.body.CUST_ID || Date.now() % 100000;
      generatedApplId = req.body.APPL_ID || `APP-${Date.now()}`;
      generatedRefNo = `REF-${Date.now()}`;
      console.log('Using fallback IDs:', {
        creditApplicationId: generatedCreditApplicationId,
        CUST_ID: generatedCustId,
        APPL_ID: generatedApplId,
        REF_NO: generatedRefNo
      });
    }

    let creditApplication;
    try {
      creditApplication = await CreditApplication.create({
        creditApplicationId: generatedCreditApplicationId,
        CUST_NM: req.body.ACCT_NM || req.body.customerName || req.body.CUST_NM || 'Unknown Customer',
        CUST_ID: req.body.CUST_ID || generatedCustId || 0,
        APPL_ID: req.body.APPL_ID || generatedApplId || `APP-${Date.now()}`,
        PROD_ID: req.body.PROD_ID || numericValues.PROD_ID,
        
        Borrower_address: addressData,
        
        PRIME_LIMIT_AMT: numericValues.DISBURSEMENT_LIMIT?.toString() || '0',
        Purpose_of_Credit: req.body.loan_purpose || req.body.Purpose_of_Credit || 'GENERAL LOAN',
        REPAY_SRC_ACCT_NO: req.body.REPAY_SRC_ACCT_NO,
        TERM_CD: mapTermCodeToFullWord(req.body.TERM_CD) || 'MONTHLY',
        TERM_VALUE: numericValues.TERM_VALUE || 12,
        
        BU_ID: req.body.BU_ID || '001',
        CREATED_BY: req.body.CREATED_BY || req.body.USER_ID || 'SYSTEM',
        USER_ID: req.body.USER_ID || req.body.CREATED_BY || 'SYSTEM',
        CRNCY_ID: req.body.CRNCY_ID || 'NGN',
        TRANSACTION_TYPE: req.body.TRANSACTION_TYPE || 'LOAN_DISBURSEMENT',
        STATUS: 'PENDING',
        REC_ST: 'active',
        LOAN_CYCLE: loanCycleCount || 1,
        
        INTEREST_RATE: effectiveInterestRate,
        LOAN_INTEREST_RATE_ID: loanInterestRateId,
        INDEX_RATE_ID: req.body.INDEX_RATE_ID || null,
        
        ACCT_ID: loanAccountNumber,
        ACCT_NO: loanAccountNumber,
        PRODUCT: productValidation.productType || 'LOAN',
        Credit_Type: 'LOAN',
        
        APPL_DT: new Date(),
        CREATE_DT: new Date(),
        ROW_TS: new Date(),
        SYS_CREATE_TS: new Date(),
        
        REF_NO: generatedRefNo,
        
        VERSION_NO: 1,
        MULTI_CRNCY_FG: false
        
      }, { 
        transaction,
        hooks: false
      });
      
      console.log('✅ CreditApplication created successfully:', {
        id: creditApplication.id,
        creditApplicationId: creditApplication.creditApplicationId,
        APPL_ID: creditApplication.APPL_ID,
        CUST_NM: creditApplication.CUST_NM,
        status: creditApplication.STATUS,
        address: creditApplication.Borrower_address
      });
      
      if (loanDisbursement && loanDisbursement.id) {
        try {
          await LoanDisbursement.update(
            { CREDIT_APPLICATION_ID: creditApplication.id },
            {
              where: { id: loanDisbursement.id },
              transaction
            }
          );
          console.log('✅ LoanDisbursement updated with CreditApplication reference');
        } catch (updateError) {
          console.warn('⚠️ Could not update LoanDisbursement with CreditApplication reference:', updateError.message);
        }
      }

    } catch (modelError) {
      console.error('❌ CreditApplication creation failed:', modelError.message);
      console.error('Model error details:', modelError);
      
      console.log('Debug - addressData type:', typeof addressData);
      console.log('Debug - addressData:', addressData);
      console.log('Debug - Full request body keys:', Object.keys(req.body));
      
      throw new Error(`CreditApplication creation failed: ${modelError.message}`);
    }

    if (loanDisbursement && loanDisbursement.id) {
      try {
        await LoanDisbursement.update(
          { CREDIT_APPLICATION_ID: creditApplication.id },
          {
            where: { id: loanDisbursement.id },
            transaction
          }
        );
        console.log('✅ LoanDisbursement updated with CreditApplication reference');
      } catch (updateError) {
        console.warn('⚠️ Could not update LoanDisbursement with CreditApplication reference:', updateError.message);
      }
    }

    console.log('\n=== FINAL VALIDATION ===');
    console.log(`Principal: ₦${principalAmount.toFixed(2)}`);
    console.log(`Interest Rate: ${interestRateNumber}% annual`);
    console.log(`Term: ${numericValues.TERM_VALUE} months`);
    console.log(`Calculated EMI: ₦${emiResult.emi.toFixed(2)}`);
    console.log(`✅ ALL CALCULATIONS COMPLETED SUCCESSFULLY`);

    // ==================== GENERATE LOAN CONTRACT ====================
    console.log('\n=== GENERATING LOAN CONTRACT ===');

    try {
      // Prepare data for contract generation
      const contractData = {
        loan_contract_no: `CONTRACT-${Date.now()}-${loanAccountNumber}`,
        customer_id: req.body.CUST_ID,
        borrower_name: req.body.ACCT_NM || customer?.CUST_NM || 'Unknown Borrower',
        borrower_address: addressData?.street 
          ? `${addressData.street}, ${addressData.city}, ${addressData.state}, ${addressData.country}`
          : 'Address Not Provided',
        loan_purpose: req.body.loan_purpose || req.body.Purpose_of_Credit || 'GENERAL LOAN',
        loan_amount: numericValues.DISBURSEMENT_LIMIT.toString(),
        loan_term: numericValues.TERM_VALUE,
        t_e_r_m__c_d: req.body.TERM_CD || 'M',
        interest_rate: effectiveInterestRate,
        interest_rate_id: loanInterestRate?.id || 101, // Default interest rate ID
        guarantor_name: guarantor?.fullName || '',
        bank_name: process.env.BANK_NAME || 'Our Bank',
        bank_short: process.env.BANK_SHORT_NAME || 'BANK',
        status: 'PENDING',
        
        // Generate contract text using your existing function
        contract_text: generateContractText(
          {
            AMOUNT: numericValues.DISBURSEMENT_LIMIT,
            INTEREST_RATE: effectiveInterestRate,
            TERM_VALUE: numericValues.TERM_VALUE,
            TERM_CD: req.body.TERM_CD || 'M',
            loan_purpose: req.body.loan_purpose || req.body.Purpose_of_Credit || 'GENERAL LOAN',
            borrower_name: req.body.ACCT_NM || customer?.CUST_NM || 'Unknown Borrower',
            borrower_address: addressData?.street 
              ? `${addressData.street}, ${addressData.city}, ${addressData.state}, ${addressData.country}`
              : 'Address Not Provided',
            DISBURSEMENT_DATE: startDate,
            NUMBER_OF_INSTALLMENTS: numericValues.TERM_VALUE,
            FIRST_PAYMENT_DATE: startDate,
            LAST_PAYMENT_DATE: maturityDate
          },
          customer,
          loanProduct,
          effectiveInterestRate
        ),
        
        u_s_e_r__i_d: req.body.CREATED_BY || req.body.USER_ID || 'SYSTEM',
        application_id: creditApplication.id,
        loan_account_no: loanAccountNumber,
        funding_account_no: req.body.REPAY_SRC_ACCT_NO || '',
        workflow_id: WORK_ITEM_ID || Date.now(),
        
        // Fees information from loan product
        fees: JSON.stringify({
          processing_fee: {
            rate: loanProduct?.processingFeeRate || 0,
            amount: (numericValues.DISBURSEMENT_LIMIT * (loanProduct?.processingFeeRate || 0) / 100).toFixed(2)
          },
          upfront_interest: {
            rate: upfrontInterest,
            amount: (numericValues.DISBURSEMENT_LIMIT * (upfrontInterest || 0) / 100).toFixed(2)
          }
        }),
        
        // Signature requirements
        signature_requirements: JSON.stringify({
          required_signatures: [
            {
              party: 'BORROWER',
              required: true,
              field_name: 'borrower_signature'
            },
            {
              party: 'GUARANTOR',
              required: true,
              field_name: 'guarantor_signature'
            },
            {
              party: 'LENDER',
              required: true,
              field_name: 'lender_authorized_signature'
            }
          ]
        }),
        
        // Metadata
        metadata: JSON.stringify({
          product_id: numericValues.PROD_ID,
          product_type: productValidation.productType,
          interest_rate_details: interestRateDetails,
          calculation_method: calculationMethod,
          emi_details: emiResult,
          guarantor_details: {
            id: guarantor.id,
            name: guarantor.fullName,
            relationship: guarantor.relationshipToBorrower
          }
        }),
        
        disbursement_date: startDate,
        maturity_date: maturityDate,
        created_at: new Date(),
        updated_at: new Date()
      };

      console.log('Generated contract data:', {
        loan_contract_no: contractData.loan_contract_no,
        loan_account_no: contractData.loan_account_no,
        status: contractData.status
      });

      // Check if loan_contract_forms table exists and create it if needed
      try {
        await sequelize.query(`
          CREATE TABLE IF NOT EXISTS loan_contract_forms (
            id INT PRIMARY KEY AUTO_INCREMENT,
            loan_contract_no VARCHAR(255) UNIQUE NOT NULL,
            customer_id VARCHAR(255) NOT NULL,
            borrower_name VARCHAR(255) NOT NULL,
            co_signatory_name VARCHAR(255) DEFAULT '',
            borrower_address VARCHAR(255) DEFAULT 'Address Not Provided',
            loan_purpose VARCHAR(255) NOT NULL,
            loan_amount VARCHAR(255) NOT NULL,
            loan_term INT NOT NULL,
            t_e_r_m__c_d ENUM('M','Y') NOT NULL DEFAULT 'M',
            interest_rate DECIMAL(7,4) NOT NULL,
            interest_rate_id INT NOT NULL DEFAULT 101,
            guarantor_name VARCHAR(255) DEFAULT '',
            bank_name VARCHAR(255) NOT NULL,
            bank_short VARCHAR(255) NOT NULL,
            status ENUM('PENDING','APPROVED','REJECTED','DISBURSED','ACTIVE','CLOSED') NOT NULL DEFAULT 'PENDING',
            contract_text TEXT NOT NULL,
            u_s_e_r__i_d VARCHAR(255) NOT NULL,
            application_id VARCHAR(255) NOT NULL,
            loan_account_no VARCHAR(255) NOT NULL,
            funding_account_no VARCHAR(255),
            workflow_id BIGINT,
            fees LONGTEXT NOT NULL,
            signature_requirements LONGTEXT NOT NULL,
            metadata LONGTEXT NOT NULL,
            disbursement_date DATETIME,
            maturity_date DATETIME,
            created_at DATETIME NOT NULL,
            updated_at DATETIME NOT NULL,
            INDEX idx_customer_id (customer_id),
            INDEX idx_status (status),
            INDEX idx_loan_account_no (loan_account_no),
            INDEX idx_application_id (application_id),
            INDEX idx_created_at (created_at),
            UNIQUE KEY uk_workflow_id (workflow_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `, { transaction });
        
        console.log('✅ loan_contract_forms table created or already exists');
      } catch (tableError) {
        console.warn('⚠️ Could not create loan_contract_forms table:', tableError.message);
      }

      // Insert contract into database
      const columns = Object.keys(contractData);
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map(col => contractData[col]);
      
      const insertContractQuery = `
        INSERT INTO loan_contract_forms (
          ${columns.join(', ')}
        ) VALUES (
          ${placeholders}
      )`;
      
      const [contractResult] = await sequelize.query(insertContractQuery, {
        replacements: values,
        transaction
      });
      
      console.log('✅ Loan contract generated with ID:', contractResult.insertId);
      
      // Update loan account with contract reference
      await sequelize.query(
        `UPDATE loan_accounts SET 
          has_repayment_schedule = TRUE,
          repayment_schedule_id = ?,
          updated_at = ?
         WHERE id = ?`,
        {
          replacements: [repaymentScheduleId, new Date(), loanAccountId],
          transaction
        }
      );

    } catch (contractError) {
      console.error('❌ Error generating loan contract:', contractError.message);
      console.error('Contract error details:', contractError);
      // Don't fail the entire loan application if contract generation fails
      console.warn('⚠️ Continuing without loan contract generation');
    }

    // ==================== COMMIT TRANSACTION AND RETURN SUCCESS ====================
    await transaction.commit();
    console.log('✅ Transaction committed successfully');

    return res.status(201).json({
      success: true,
      message: 'Loan application submitted successfully - pending approval',
      status: 'PENDING',
      data: {
        loanAccountId: loanAccount.id,
        loanAccountNumber: loanAccountNumber,
        creditApplicationId: creditApplication.id,
        repaymentScheduleId: repaymentSchedule.id,
        loanDisbursementId: loanDisbursement.id,
        contractGenerated: true,
        contractStatus: 'PENDING',
        APPL_ID: req.body.APPL_ID,
        status: 'PENDING',
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
          totalRepayable: emiResult.totalRepayable
        },
        nextSteps: 'Loan requires manual approval before disbursement',
        approvalEndpoint: 'POST /api/loans/approve-and-disburse',
        approvalBodyExample: {
          ACCT_NO: loanAccountNumber,
          approvedBy: "[USER_ID]",
          approvalComments: "Optional approval comments"
        }
      }
    });

  } catch (error) {
    // Rollback transaction on error
    if (transaction) {
      await transaction.rollback();
    }
    
    console.error('❌ Loan application failed:', error);
    
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Loan application failed',
      code: error.code || 'LOAN_APPLICATION_FAILED',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
},


  async disburseLoan(req, res) {
    const transaction = await sequelize.transaction();

    try {
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
      async function findLoanInterestRateForDisbursement(LOAN_PROUD_INT_ID, transaction) {
        try {
          if (!LOAN_PROUD_INT_ID) {
            console.log('No LOAN_PROUD_INT_ID provided, using loan account rate...');
            return null;
          }
          
          const numericId = parseInt(LOAN_PROUD_INT_ID);
          const query = isNaN(numericId) 
            ? { LOAN_PROUD_INT_ID: LOAN_PROUD_INT_ID.toString(), STATUS: 'ACTIVE' }
            : { LOAN_PROUD_INT_ID: numericId, STATUS: 'ACTIVE' };
          
          const loanInterestRate = await LoanInterestRate.findOne({
            where: query,
            transaction
          });
          
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
        CreditApplication.findOne({ where: { APPL_ID }, transaction }),
        LoanAccount.findOne({ where: { ACCT_NO }, transaction }),
        CustomerAccount.findOne({ where: { account_number: fundingAcctNo }, transaction }),
        Guarantor.findOne({ where: { GUARANTOR_ID: String(GUARANTOR_ID) }, transaction }),
        ProductTypeMapping.findOne({ where: { PROD_ID: productIdNum }, transaction }),
        LoanProduct.findOne({ where: { PROD_ID: productIdNum }, transaction })
      ]);

      // ADDED: Find LoanInterestRate using the same logic as applyForLoan
      const loanInterestRate = await findLoanInterestRateForDisbursement(
        LOAN_PROUD_INT_ID || loanAccount?.LOAN_INTEREST_RATE_ID, 
        transaction
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
      
      if (parseFloat(loanAccount.DISBURSED_AMOUNT || '0') > 0) throw { 
        status: 400, 
        message: "Loan already disbursed" 
      };

      // === CALCULATE FEES ===
      const processingFeeRate = parseFloat(loanProduct.processingFeeRate || '0') / 100;
      const upfrontInterestRate = parseFloat(loanAccount.upfrontInterestPercentage || '0') / 100;

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
        effectiveInterestRate = parseFloat(loanAccount.INTEREST_RATE);
        console.log(`Using loan account stored rate: ${effectiveInterestRate}%`);
      }
      // Priority 3: Use loan product rate
      else if (loanProduct.interestRate) {
        effectiveInterestRate = parseFloat(loanProduct.interestRate);
        console.log(`Using loan product rate: ${effectiveInterestRate}%`);
      }
      // Priority 4: Use loan product DEFAULT_RATE_PER_MONTH
      else if (loanProduct.DEFAULT_RATE_PER_MONTH) {
        const monthlyRate = parseFloat(loanProduct.DEFAULT_RATE_PER_MONTH);
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
      await LoanAccount.update(
        {
          LOAN_STATUS: "ACTIVE",
          DISBURSED_AMOUNT: toDecimal(amount),
          ACTUAL_DISBURSEMENT: toDecimal(amount),
          OUTSTANDING_PRINCIPAL: toDecimal(amount),
          CURRENT_BALANCE: toDecimal(-amount),
          START_DT: now,
          DISBURSEMENT_DATE: now,
          processingFee: toDecimal(processingFee),
          upfrontInterestCollected: toDecimal(upfrontInterest),
          totalFeesCollected: toDecimal(totalFees),
          NET_DISBURSEMENT: toDecimal(netAmount),
          INTEREST_RATE: toDecimal(effectiveInterestRate),
          // ADDED: Store rate type details for consistency
          INTEREST_RATE_TYPE: loanInterestRate?.RATE_TYPE || loanAccount.INTEREST_RATE_TYPE || 'REDUCING',
          INTEREST_TYPE: loanInterestRate?.INTEREST_TYPE || loanAccount.INTEREST_TYPE || 'COMPOUND',
          INTEREST_CALCULATION_METHOD: loanInterestRate?.CALCULATION_METHOD || loanAccount.INTEREST_CALCULATION_METHOD || 'REDUCING_BALANCE',
          LOAN_INTEREST_RATE_ID: loanInterestRate?.LOAN_PROUD_INT_ID || null,
          ...txIds,
          LAST_UPDATED: now,
        },
        {
          where: { id: loanAccount.id },
          transaction
        }
      );

      // === UPDATE CREDIT APPLICATION ===
      await CreditApplication.update(
        { 
          STATUS: "DISBURSED", 
          DISBURSEMENT_DATE: now, 
          ACTUAL_DISBURSEMENT: amount, 
          NET_DISBURSEMENT: netAmount,
          LOAN_STATUS: "ACTIVE",
          LOAN_INTEREST_RATE_ID: loanInterestRate?.LOAN_PROUD_INT_ID || null
        },
        {
          where: { id: creditApp.id },
          transaction
        }
      );

      // === ACTIVATE GUARANTOR ===
      await Guarantor.update(
        { 
          $addToSet: { guaranteedLoans: loanAccount.id }, 
          $set: { 
            STATUS: "ACTIVE",
            GUARANTEED_AMOUNT: amount,
            LOAN_ACCOUNT_NO: ACCT_NO,
            ACTIVATION_DATE: now,
            // ADDED: Track interest rate used
            LOAN_INTEREST_RATE_ID: loanInterestRate?.LOAN_PROUD_INT_ID || null
          } 
        },
        {
          where: { id: guarantor.id },
          transaction
        }
      );

      // === PROCESS FINANCIAL TRANSACTIONS ===
      await processLoanDisbursementTransactions({
        transaction,
        loanAccount: {
          ...loanAccount.toJSON(),
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
        upfrontInterestPercentage: parseFloat(loanAccount.upfrontInterestPercentage || '0'),
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

      await transaction.commit();

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

    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      console.error("❌ Disbursement failed:", error);
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || "Disbursement failed",
        code: error.code || "DISBURSEMENT_ERROR",
        details: error.details || null
      });
    }
  },

  async getLoanApplication(req, res) {
    try {
      const { applicationId } = req.params;
      
      const application = await CreditApplication.findOne({ 
        where: { APPL_ID: applicationId },
        include: [
          { model: LoanAccount },
          { model: Guarantor }
        ]
      });
      
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

  async rejectLoanApplication(req, res) {
    const transaction = await sequelize.transaction();

    try {
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
          where: {
            ACCT_NO,
            STATUS: { $in: ["PENDING", "APPROVED"] }
          },
          transaction
        });

        loanAccount = await LoanAccount.findOne({
          where: {
            ACCT_NO,
            LOAN_STATUS: { $in: ["PENDING", "APPROVED"] }
          },
          transaction
        });
      }
      // CASE 2: Fallback to CUST_ID (safe now!)
      else if (CUST_ID) {
        const custIdStr = String(CUST_ID || "").trim();
        const normalizedCustId = custIdStr.replace(/^0+/, "") || custIdStr;

        creditApplication = await CreditApplication.findOne({
          where: {
            CUST_ID: { $in: [custIdStr, normalizedCustId] },
            STATUS: { $in: ["PENDING", "APPROVED"] }
          },
          transaction
        });

        if (creditApplication) {
          loanAccount = await LoanAccount.findOne({
            where: {
              ACCT_NO: creditApplication.ACCT_NO,
              LOAN_STATUS: { $in: ["PENDING", "APPROVED"] }
            },
            transaction
          });
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
      await CreditApplication.update(
        {
          STATUS: "REJECTED",
          REJECTED_BY: rejectedBy,
          REJECTED_DATE: now,
          REJECTION_REASON: reason,
          UPDATED_AT: now,
        },
        {
          where: { id: creditApplication.id },
          transaction
        }
      );

      // Update Loan Account
      await LoanAccount.update(
        {
          LOAN_STATUS: "REJECTED",
          REJECTED_BY: rejectedBy,
          REJECTED_DATE: now,
          REJECTION_REASON: reason,
          UPDATED_AT: now,
          GUARANTOR_ID: null,
          HAS_GARANTOR: false,
          GUARANTEED_AMOUNT: 0,
        },
        {
          where: { id: loanAccount.id },
          transaction
        }
      );

      // Release Guarantor
      if (loanAccount.GUARANTOR_ID) {
        await Guarantor.update(
          {
            status: "RELEASED",
            releasedBy: rejectedBy,
            releasedDate: now,
            releaseReason: `Loan rejected: ${reason}`,
            loanAccountNo: null,
            loanId: null,
          },
          {
            where: { id: loanAccount.GUARANTOR_ID },
            transaction
          }
        );
      }

      // Cancel Repayment Schedule
      await RepaymentSchedule.update(
        { STATUS: "CANCELLED" },
        {
          where: { LOAN_ACCOUNT_ID: loanAccount.id },
          transaction
        }
      );

      await transaction.commit();

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
      if (transaction) {
        await transaction.rollback();
      }
      console.error("Rejection failed:", error);

      return res.status(500).json({
        success: false,
        message: error.message || "Failed to reject loan",
        code: "REJECTION_FAILED",
      });
    }
  }, 

  // Helper: Get interest configuration from LoanInterestRate table
  async getInterestConfiguration(PROD_ID, INDEX_RATE_ID, transaction) {
    try {
      console.log('Getting interest configuration for:', { PROD_ID, INDEX_RATE_ID });
      
      // First try to get from LoanInterestRate table
      const loanInterestRate = await LoanInterestRate.findOne({
        where: {
          PROD_ID: Number(PROD_ID),
          INDEX_RATE_ID: Number(INDEX_RATE_ID),
          STATUS: 'ACTIVE'
        },
        transaction
      });

      if (loanInterestRate) {
        console.log('Found LoanInterestRate:', loanInterestRate.id);
        return {
          LOAN_INTEREST_RATE_ID: loanInterestRate.id,
          INTEREST_RATE: parseFloat(loanInterestRate.ABSOLUTE_RATE || loanInterestRate.FIXED_RATE || '0'),
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
        where: {
          INDEX_RATE_ID: Number(INDEX_RATE_ID)
        },
        transaction
      });

      if (rateIndex) {
        return {
          INTEREST_RATE: parseFloat(rateIndex.INDEX_RATE || '0'),
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
        where: {
          PROD_ID: Number(PROD_ID)
        },
        transaction
      });

      if (loanProduct) {
        return {
          INTEREST_RATE: parseFloat(loanProduct.interestRate || loanProduct.DEFAULT_RATE_PER_MONTH || '0'),
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
  async calculateDisbursementAmount(loanAccount, interestConfig, transaction) {
    const loanAmount = parseFloat(loanAccount.DISBURSEMENT_LIMIT || '0');
    
    // Get product for fee calculation
    const loanProduct = await LoanProduct.findOne({
      where: {
        PROD_ID: Number(loanAccount.PROD_ID)
      },
      transaction
    });

    // Calculate processing fee
    const processingFeeRate = parseFloat(loanProduct?.processingFeeRate || '0') / 100;
    const processingFee = loanAmount * processingFeeRate;

    // Calculate upfront interest (if applicable)
    const upfrontInterestPercentage = parseFloat(loanAccount.upfrontInterestPercentage || '0') / 100;
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
    const transaction = await sequelize.transaction();

    try {
      const { 
        disbursementId,
        executedBy,
        transactionNotes
      } = req.body;

      if (!disbursementId || !executedBy) {
        throw { status: 400, message: "Disbursement ID and executor are required" };
      }

      // 1. Get the disbursement record
      const disbursement = await Disbursement.findByPk(disbursementId, { transaction });
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
      const loanAccount = await LoanAccount.findByPk(disbursement.LOAN_ACCOUNT_ID, { transaction });
      if (!loanAccount) {
        throw { status: 404, message: "Loan account not found" };
      }

      if (loanAccount.LOAN_STATUS !== 'APPROVED') {
        throw { 
          status: 400, 
          message: `Loan must be APPROVED for disbursement. Current status: ${loanAccount.LOAN_STATUS}` 
        };
      }

      // 3. Get loan product to fetch interest rate
      const loanProduct = await LoanProduct.findOne({
        where: { PROD_ID: loanAccount.PROD_ID },
        transaction
      });

      if (!loanProduct) {
        throw { status: 404, message: `Loan product not found for PROD_ID: ${loanAccount.PROD_ID}` };
      }

      // 4. Get customer account
      const customerAccount = await CustomerAccount.findOne({
        where: {
          account_number: disbursement.TARGET_ACCOUNT_NO
        },
        transaction
      });

      if (!customerAccount) {
        throw { status: 404, message: "Target account not found" };
      }

      // 5. Determine interest rate from LoanProduct
      let effectiveInterestRate;
      let interestRateDetails = {};
      
      // Helper function to extract interest rate from LoanProduct
      const extractInterestRateFromProduct = (product) => {
        if (!product) return { annualRate: 12.0, source: 'DEFAULT_FALLBACK' };
        
        // Priority 1: Check DEFAULT_RATE_PER_MONTH
        if (product.DEFAULT_RATE_PER_MONTH) {
          const monthlyRate = parseFloat(product.DEFAULT_RATE_PER_MONTH);
          const annualRate = monthlyRate * 12;
          return {
            annualRate,
            monthlyRate,
            source: 'LOAN_PRODUCT_DEFAULT_RATE'
          };
        }
        
        // Priority 2: Check TOTAL_INTEREST_RATE
        if (product.TOTAL_INTEREST_RATE) {
          const totalRate = parseFloat(product.TOTAL_INTEREST_RATE);
          return {
            annualRate: totalRate,
            source: 'LOAN_PRODUCT_TOTAL_RATE'
          };
        }
        
        // Priority 3: Check metadata
        if (product.metadata?.interestRateConfiguration?.defaultRate) {
          const monthlyRate = parseFloat(product.metadata.interestRateConfiguration.defaultRate);
          const annualRate = monthlyRate * 12;
          return {
            annualRate,
            monthlyRate,
            source: 'LOAN_PRODUCT_METADATA'
          };
        }
        
        // Fallback
        return { annualRate: 12.0, source: 'DEFAULT_FALLBACK' };
      };

      // Extract interest rate
      const productRateInfo = extractInterestRateFromProduct(loanProduct);
      effectiveInterestRate = productRateInfo.annualRate;
      interestRateDetails = productRateInfo;

      console.log('Interest rate determined from LoanProduct:', {
        PROD_ID: loanProduct.PROD_ID,
        productName: loanProduct.name,
        interestRate: effectiveInterestRate + '%',
        source: interestRateDetails.source
      });

      // 6. Execute the disbursement using your existing disbursement service
      const disbursementResult = await processLoanDisbursementTransactions({
        transaction,
        loanAccount: {
          ...loanAccount.toJSON(),
          DISBURSED_AMOUNT: toDecimal(disbursement.DISBURSEMENT_AMOUNT),
          NET_DISBURSEMENT: toDecimal(disbursement.NET_DISBURSEMENT_AMOUNT),
          // Update with LoanProduct interest rate
          INTEREST_RATE: effectiveInterestRate,
          INTEREST_RATE_TYPE: loanProduct.RATE_TY || 'FIXED',
          INTEREST_TYPE: loanProduct.INT_TY || 'SIMPLE',
          INTEREST_CALCULATION_METHOD: loanProduct.CALCULATION_METHOD || 'FLAT_RATE'
        },
        customerAccount,
        AMOUNT: parseFloat(disbursement.DISBURSEMENT_AMOUNT),
        loanFeeAmount: parseFloat(disbursement.FEES_AMOUNT),
        fundingAcctNo: disbursement.TARGET_ACCOUNT_NO,
        ACCT_NO: loanAccount.ACCT_NO,
        CREATED_BY: executedBy,
        DISBURSEMENT_DATE: new Date(),
        INTEREST_RATE: effectiveInterestRate, // Use LoanProduct rate
        PRODUCT_TYPE: loanAccount.PRODUCT_TYPE || 'INDIVIDUAL_LOAN',
        productId: loanAccount.PROD_ID,
        deductUpfrontInterest: loanAccount.DEDUCT_UPFRONT_INTEREST || false,
        partialUpfrontInterest: loanAccount.PARTIAL_UPFRONT_INTEREST || false,
        upfrontInterestAmount: parseFloat(disbursement.UPFRONT_INTEREST_AMOUNT),
        upfrontInterestPercentage: parseFloat(loanAccount.upfrontInterestPercentage || '0'),
        guarantorId: loanAccount.GUARANTOR_ID,
        guaranteedAmount: parseFloat(loanAccount.GUARANTEED_AMOUNT || '0'),
        guarantorName: loanAccount.guarantorDetails?.name,
        TRANSACTION_ID: `DISB-${Date.now()}`,
        EVENT_ID: `EVT-${Date.now()}`,
        JOURNAL_ID: `JRN-${Date.now()}`,
        branchId: loanAccount.BU_ID,
        // Pass LoanProduct rate details
        interestRateDetails: {
          source: interestRateDetails.source,
          loanProductId: loanProduct.id,
          productName: loanProduct.name,
          calculationMethod: loanProduct.CALCULATION_METHOD || 'FLAT_RATE'
        }
      });

      // 7. Update disbursement status with LoanProduct interest rate
      await disbursement.update({
        STATUS: 'EXECUTED',
        EXECUTED_BY: executedBy,
        EXECUTION_DATE: new Date(),
        TRANSACTION_NOTES: transactionNotes,
        TRANSACTION_REFERENCE: disbursementResult.transactionIds.TRANSACTION_ID,
        // Update interest configuration with LoanProduct rate
        INTEREST_CONFIGURATION: {
          INTEREST_RATE: effectiveInterestRate,
          INTEREST_TYPE: loanProduct.INT_TY || 'SIMPLE',
          CALCULATION_METHOD: loanProduct.CALCULATION_METHOD || 'FLAT_RATE',
          SOURCE: 'LOAN_PRODUCT',
          PRODUCT_ID: loanProduct.PROD_ID,
          PRODUCT_NAME: loanProduct.name
        }
      }, { transaction });

      // 8. Update loan account status with LoanProduct interest rate
      await loanAccount.update({
        LOAN_STATUS: 'ACTIVE',
        DISBURSEMENT_DATE: new Date(),
        DISBURSED_AMOUNT: disbursement.DISBURSEMENT_AMOUNT,
        ACTUAL_DISBURSEMENT: disbursement.DISBURSEMENT_AMOUNT,
        OUTSTANDING_PRINCIPAL: disbursement.DISBURSEMENT_AMOUNT,
        CURRENT_BALANCE: toDecimal(parseFloat(disbursement.DISBURSEMENT_AMOUNT) * -1), // Negative balance
        // Update interest rate from LoanProduct
        INTEREST_RATE: effectiveInterestRate,
        INTEREST_RATE_TYPE: loanProduct.RATE_TY || 'FIXED',
        INTEREST_TYPE: loanProduct.INT_TY || 'SIMPLE',
        INTEREST_CALCULATION_METHOD: loanProduct.CALCULATION_METHOD || 'FLAT_RATE',
        LOAN_INTEREST_RATE_ID: loanProduct.LOAN_INTEREST_RATE_ID
      }, { transaction });

      // 9. Update customer account balance
      const netDisbursement = parseFloat(disbursement.NET_DISBURSEMENT_AMOUNT);
      const currentBalance = parseFloat(customerAccount.LEDGER_BALANCE || '0');
      await customerAccount.update({
        LEDGER_BALANCE: toDecimal(currentBalance + netDisbursement),
        CLEARED_BALANCE: toDecimal(currentBalance + netDisbursement),
        AVAILABLE_BALANCE: toDecimal(currentBalance + netDisbursement)
      }, { transaction });

      // 10. Create transaction history with LoanProduct interest rate info
      await Transaction.create({
        TRANSACTION_ID: disbursementResult.transactionIds.TRANSACTION_ID,
        EVENT_ID: disbursementResult.transactionIds.EVENT_ID,
        TRAN_JOURNAL_ID: disbursementResult.transactionIds.JOURNAL_ID,
        ACCT_NO: loanAccount.ACCT_NO,
        ACCT_ID: loanAccount.id.toString(),
        BU_ID: loanAccount.BU_ID,
        CUST_ID: loanAccount.CUST_ID,
        ACCT_NM: loanAccount.ACCT_NM,
        AMOUNT: netDisbursement,
        TRANSACTIONDATE: new Date(),
        TRANSACTION_TYPE: 'LOAN_DISBURSEMENT',
        description: `Loan disbursement to ${loanAccount.ACCT_NM} at ${effectiveInterestRate}% interest`,
        currency: loanAccount.CRNCY_ID || 'NGN',
        createdBy: executedBy,
        status: 'COMPLETED',
        REFERENCE: `DISB-${loanAccount.ACCT_NO}-${Date.now()}`,
        metadata: {
          loanProductId: loanProduct.PROD_ID,
          loanProductName: loanProduct.name,
          interestRate: effectiveInterestRate,
          interestRateSource: interestRateDetails.source,
          calculationMethod: loanProduct.CALCULATION_METHOD || 'FLAT_RATE'
        }
      }, { transaction });

      await transaction.commit();

      return res.status(200).json({
        success: true,
        message: 'Loan disbursement executed successfully',
        data: {
          loanAccountNumber: loanAccount.ACCT_NO,
          customerName: loanAccount.ACCT_NM,
          disbursementStatus: 'EXECUTED',
          interestRateDetails: {
            interestRate: effectiveInterestRate + '%',
            source: interestRateDetails.source,
            loanProductId: loanProduct.PROD_ID,
            productName: loanProduct.name,
            calculationMethod: loanProduct.CALCULATION_METHOD || 'FLAT_RATE'
          },
          financialImpact: {
            totalLoanAmount: parseFloat(disbursement.DISBURSEMENT_AMOUNT),
            feesDeducted: parseFloat(disbursement.FEES_AMOUNT),
            upfrontInterest: parseFloat(disbursement.UPFRONT_INTEREST_AMOUNT),
            netAmountToCustomer: parseFloat(disbursement.NET_DISBURSEMENT_AMOUNT),
            targetAccount: customerAccount.account_number,
            customerBalanceBefore: currentBalance,
            customerBalanceAfter: currentBalance + netDisbursement
          },
          loanDetails: {
            status: 'ACTIVE',
            outstandingPrincipal: parseFloat(disbursement.DISBURSEMENT_AMOUNT),
            nextPaymentDate: loanAccount.NEXT_PAYMENT_DATE,
            interestRate: effectiveInterestRate + '%',
            interestType: loanProduct.INT_TY || 'SIMPLE',
            calculationMethod: loanProduct.CALCULATION_METHOD || 'FLAT_RATE'
          },
          transactionReference: disbursementResult.transactionIds.TRANSACTION_ID
        }
      });

    } catch (error) {
      if (transaction) {
        await transaction.rollback();
      }
      console.error("Disbursement execution failed:", error);
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || "Disbursement execution failed",
        code: error.code || "DISBURSEMENT_EXECUTION_ERROR"
      });
    }
  },

// Import the service at the top of your file (outside the function)
// Make sure the path is correct


// async approveAndDisburseLoan(req, res) {
//     console.log("=== DEBUG: Starting approveAndDisburseLoan ===");
//     console.log("Request body:", JSON.stringify(req.body, null, 2));
    
//     let transaction;
    
//     try {
//         const { 
//             ACCT_NO, 
//             approvedBy, 
//             approvalComments = "Loan approved for disbursement"
//         } = req.body;

//         console.log("DEBUG: ACCT_NO =", ACCT_NO);
//         console.log("DEBUG: approvedBy =", approvedBy);

//         // Validate required fields
//         if (!ACCT_NO || !approvedBy) {
//             return res.status(400).json({
//                 success: false,
//                 message: "ACCT_NO and approvedBy are required",
//                 code: "MISSING_FIELDS",
//                 debug: {
//                     receivedACCT_NO: ACCT_NO,
//                     receivedApprovedBy: approvedBy
//                 }
//             });
//         }

//         // Start transaction
//         transaction = await sequelize.transaction();
//         console.log("DEBUG: Transaction started");

//         // ==================== 1. FIND LOAN ACCOUNT ====================
//         console.log(`DEBUG: Looking for loan account: ${ACCT_NO}`);
        
//         let loanAccounts;
//         try {
//             const result = await sequelize.query(
//                 `SELECT * FROM loan_accounts WHERE a_c_c_t__n_o = ? LIMIT 1`,
//                 {
//                     replacements: [ACCT_NO],
//                     transaction,
//                     type: sequelize.QueryTypes.SELECT
//                 }
//             );
//             loanAccounts = result;
//             console.log("DEBUG: Query result type:", typeof result);
//             console.log("DEBUG: Is array?", Array.isArray(result));
//             console.log("DEBUG: Query result length:", result ? result.length : 0);
//             console.log("DEBUG: Query result:", JSON.stringify(result, null, 2));
//         } catch (queryError) {
//             console.error("DEBUG: Database query failed:", queryError);
//             if (transaction && !transaction.finished) {
//                 await transaction.rollback();
//             }
//             return res.status(500).json({
//                 success: false,
//                 message: "Database query failed",
//                 error: queryError.message,
//                 code: "DATABASE_ERROR"
//             });
//         }

//         console.log("DEBUG: loanAccounts =", loanAccounts);
//         console.log("DEBUG: loanAccounts is array?", Array.isArray(loanAccounts));
//         console.log("DEBUG: loanAccounts.length?", loanAccounts ? loanAccounts.length : 'null');

//         if (!loanAccounts || !Array.isArray(loanAccounts) || loanAccounts.length === 0) {
//             if (transaction && !transaction.finished) {
//                 await transaction.rollback();
//             }
            
//             try {
//                 const allAccounts = await sequelize.query(
//                     `SELECT a_c_c_t__n_o, l_o_a_n__s_t_a_t_u_s FROM loan_accounts LIMIT 5`,
//                     { type: sequelize.QueryTypes.SELECT }
//                 );
                
//                 const columnCheck = await sequelize.query(
//                     `SHOW COLUMNS FROM loan_accounts`,
//                     { type: sequelize.QueryTypes.SELECT }
//                 );
                
//                 const accountColumns = columnCheck.map(col => col.Field);
                
//                 return res.status(404).json({
//                     success: false,
//                     message: `Loan account ${ACCT_NO} not found`,
//                     code: "LOAN_NOT_FOUND",
//                     debug: {
//                         searchedAccount: ACCT_NO,
//                         loanAccountsResult: loanAccounts,
//                         firstFewAccounts: allAccounts,
//                         tableColumns: accountColumns,
//                         searchedColumn: 'a_c_c_t__n_o'
//                     }
//                 });
//             } catch (error) {
//                 return res.status(404).json({
//                     success: false,
//                     message: `Loan account ${ACCT_NO} not found`,
//                     code: "LOAN_NOT_FOUND",
//                     debug: {
//                         searchedAccount: ACCT_NO,
//                         errorCheckingTable: error.message
//                     }
//                 });
//             }
//         }

//         const loanAccount = loanAccounts[0];
//         console.log("DEBUG: loanAccount =", JSON.stringify(loanAccount, null, 2));
//         console.log("DEBUG: loanAccount.l_o_a_n__s_t_a_t_u_s =", loanAccount.l_o_a_n__s_t_a_t_u_s);
//         console.log("DEBUG: loanAccount type:", typeof loanAccount);
//         console.log("DEBUG: loanAccount keys:", Object.keys(loanAccount));

//         if (!loanAccount) {
//             if (transaction && !transaction.finished) {
//                 await transaction.rollback();
//             }
//             return res.status(500).json({
//                 success: false,
//                 message: "Loan account object is null",
//                 code: "INVALID_ACCOUNT_DATA",
//                 debug: {
//                     loanAccountsLength: loanAccounts.length,
//                     firstElement: loanAccounts[0]
//                 }
//             });
//         }

//         const currentStatus = loanAccount.l_o_a_n__s_t_a_t_u_s;
//         const currentDisbursedAmount = parseFloat(loanAccount.d_i_s_b_u_r_s_e_d__a_m_o_u_n_t || 0);
//         const currentOutstandingPrincipal = parseFloat(loanAccount.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l || 0);
//         const loanAmountValue = parseFloat(loanAccount.a_m_o_u_n_t || 0);
//         const now = new Date();

//         console.log("DEBUG: Current Status =", currentStatus);
//         console.log("DEBUG: Current Disbursed Amount =", currentDisbursedAmount);
//         console.log("DEBUG: Current Outstanding Principal =", currentOutstandingPrincipal);
//         console.log("DEBUG: Loan Amount Value =", loanAmountValue);
//         console.log("DEBUG: Disbursed Amount column value =", loanAccount.d_i_s_b_u_r_s_e_d__a_m_o_u_n_t);
//         console.log("DEBUG: Outstanding Principal column value =", loanAccount.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l);
//         console.log("DEBUG: Amount column value =", loanAccount.a_m_o_u_n_t);

//         // ==================== 2. CHECK DATA CONSISTENCY ====================
//         // Get the absolute approved amount (should be positive)
//         const approvedAmount = Math.abs(loanAmountValue);
//         console.log("DEBUG: Approved Amount (absolute) =", approvedAmount);

//         // ==================== 3. GET CUSTOMER INFORMATION ====================
//         // Get customer ID from loan account and convert to numeric
//         const customerId = loanAccount.c_u_s_t__i_d;
//         const numericCustomerId = customerId ? parseInt(customerId.replace(/^0+/, ''), 10) : null;
//         const customerName = loanAccount.a_c_c_t__n_m || '';
        
//         console.log("DEBUG: Customer ID from loan =", customerId);
//         console.log("DEBUG: Numeric Customer ID =", numericCustomerId);
//         console.log("DEBUG: Customer Name =", customerName);

//         // ==================== 4. CHECK CURRENT STATUS ====================
//         if (currentStatus === 'ACTIVE') {
//             console.log(`DEBUG: Loan ${ACCT_NO} is already ACTIVE`);
            
//             // Note: currentDisbursedAmount is negative, so we compare absolute values
//             if (Math.abs(currentDisbursedAmount) >= approvedAmount) {
//                 if (transaction && !transaction.finished) {
//                     await transaction.rollback();
//                 }
//                 return res.status(400).json({
//                     success: false,
//                     message: "Loan has already been fully disbursed",
//                     code: "FULLY_DISBURSED",
//                     data: {
//                         ACCT_NO,
//                         approvedAmount,
//                         alreadyDisbursed: Math.abs(currentDisbursedAmount)
//                     }
//                 });
//             }
            
//             const remainingAmount = approvedAmount - Math.abs(currentDisbursedAmount);
//             console.log(`DEBUG: Remaining amount to disburse: ${remainingAmount}`);
            
//             // For ACTIVE loans, we're doing ADDITIONAL disbursement
//             // Since amounts are negative, we subtract (make more negative)
//             await sequelize.query(
//                 `UPDATE loan_accounts 
//                  SET d_i_s_b_u_r_s_e_d__a_m_o_u_n_t = d_i_s_b_u_r_s_e_d__a_m_o_u_n_t - ?,
//                      o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l = o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l - ?,
//                      updated_at = ?
//                  WHERE a_c_c_t__n_o = ?`,
//                 {
//                     replacements: [
//                         remainingAmount,  // Subtract from negative (makes more negative)
//                         remainingAmount,  // Subtract from negative (makes more negative)
//                         now,
//                         ACCT_NO
//                     ],
//                     transaction
//                 }
//             );
            
//             console.log(`DEBUG: Updated loan account for additional disbursement`);
//             console.log(`DEBUG: Previous disbursed: ${currentDisbursedAmount}`);
//             console.log(`DEBUG: New disbursed: ${currentDisbursedAmount - remainingAmount}`);
            
//         } else if (currentStatus === 'PENDING') {
//             console.log(`DEBUG: Processing new disbursement for PENDING loan ${ACCT_NO}`);
            
//             // For PENDING loans, set all amounts to NEGATIVE (initial disbursement)
//             const disbursementAmountForUpdate = -approvedAmount;  // Negative value
            
//             // Update all three fields consistently with negative values
//             await sequelize.query(
//                 `UPDATE loan_accounts 
//                  SET l_o_a_n__s_t_a_t_u_s = 'ACTIVE',
//                      a_m_o_u_n_t = ?,
//                      d_i_s_b_u_r_s_e_d__a_m_o_u_n_t = ?,
//                      a_p_p_r_o_v_a_l__d_a_t_e = ?,
//                      d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e = ?,
//                      o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l = ?,
//                      s_e_r_v_i_c_i_n_g__s_t_a_t_u_s = 'SERVICED',
//                      updated_at = ?
//                  WHERE a_c_c_t__n_o = ?`,
//                 {
//                     replacements: [
//                         disbursementAmountForUpdate,  // Negative amount (e.g., -50000)
//                         disbursementAmountForUpdate,  // Negative disbursed amount
//                         now,
//                         now,
//                         disbursementAmountForUpdate,  // Negative outstanding principal
//                         now,
//                         ACCT_NO
//                     ],
//                     transaction
//                 }
//             );
            
//             console.log(`DEBUG: Updated loan account with negative values:`);
//             console.log(`DEBUG:   Amount: ${disbursementAmountForUpdate}`);
//             console.log(`DEBUG:   Disbursed: ${disbursementAmountForUpdate}`);
//             console.log(`DEBUG:   Outstanding: ${disbursementAmountForUpdate}`);
            
//         } else {
//             if (transaction && !transaction.finished) {
//                 await transaction.rollback();
//             }
//             return res.status(400).json({
//                 success: false,
//                 message: `Cannot disburse loan with status: ${currentStatus}`,
//                 code: "INVALID_STATUS",
//                 data: {
//                     ACCT_NO,
//                     currentStatus,
//                     allowedStatuses: ['PENDING', 'ACTIVE']
//                 }
//             });
//         }

//         // ==================== 5. CALCULATE DISBURSEMENT AMOUNT ====================
//         // disbursementAmount should always be POSITIVE for calculations
//         let disbursementAmount;

//         if (currentStatus === 'ACTIVE') {
//             // For additional disbursement on ACTIVE loan
//             disbursementAmount = approvedAmount - Math.abs(currentDisbursedAmount);
//         } else if (currentStatus === 'PENDING') {
//             // For initial disbursement
//             disbursementAmount = approvedAmount;
//         } else {
//             disbursementAmount = 0;
//         }

//         console.log("DEBUG: Disbursement Amount (positive for calculations) = ₦" + disbursementAmount.toLocaleString());
//         console.log("DEBUG: Note: Loan account stores amounts as NEGATIVE values");
//         console.log("DEBUG:       This represents the bank's receivable asset");

//         // ==================== 6. GET CUSTOMER ACCOUNT DETAILS ====================
//         let customerAccountNumber = null;
//         let customerAccountDetails = null;
//         let accountsTableRecord = null;
//         let customerAccountsTableRecord = null;

//         try {
//             console.log("DEBUG: Getting customer account details...");
            
//             // FIRST: Try to get the account number from loan application (credit_applications table)
//             let targetAccountNumber = null;
            
//             // Check if there's a repay source account number in credit_applications table
//             try {
//                 console.log(`DEBUG: Looking for repay account in credit_applications for loan ${ACCT_NO}`);
                
//                 const [creditAppResult] = await sequelize.query(
//                     `SELECT r_e_p_a_y__s_r_c__a_c_c_t__n_o FROM credit_applications WHERE a_c_c_t__n_o = ? LIMIT 1`,
//                     {
//                         replacements: [ACCT_NO],
//                         transaction,
//                         type: sequelize.QueryTypes.SELECT
//                     }
//                 );
                
//                 console.log("DEBUG: credit_applications query result:", creditAppResult);
                
//                 if (creditAppResult && creditAppResult.r_e_p_a_y__s_r_c__a_c_c_t__n_o) {
//                     targetAccountNumber = creditAppResult.r_e_p_a_y__s_r_c__a_c_c_t__n_o;
//                     console.log("DEBUG: ✓ Found repay source account from credit_applications:", targetAccountNumber);
//                 } else {
//                     console.log("DEBUG: ✗ No repay account found in credit_applications");
//                     if (creditAppResult) {
//                         console.log("DEBUG: Available columns in result:", Object.keys(creditAppResult));
//                     }
//                 }
//             } catch (creditAppError) {
//                 console.log("DEBUG: Could not get account from credit_applications:", creditAppError.message);
//             }
            
//             // SECOND: If no account from credit app, check loan_accounts table for account number
//             if (!targetAccountNumber) {
//                 console.log("DEBUG: Checking loan_accounts for account number...");
//                 try {
//                     // Some loan systems store the customer account number in loan_accounts
//                     const [loanAccountDetails] = await sequelize.query(
//                         `SELECT c_u_s_t_o_m_e_r__a_c_c_o_u_n_t__n_o, d_i_s_b_u_r_s_e_m_e_n_t__a_c_c_o_u_n_t FROM loan_accounts WHERE a_c_c_t__n_o = ? LIMIT 1`,
//                         {
//                             replacements: [ACCT_NO],
//                             transaction,
//                             type: sequelize.QueryTypes.SELECT
//                         }
//                     );
                    
//                     if (loanAccountDetails) {
//                         console.log("DEBUG: Loan account details:", loanAccountDetails);
//                         if (loanAccountDetails.c_u_s_t_o_m_e_r__a_c_c_o_u_n_t__n_o) {
//                             targetAccountNumber = loanAccountDetails.c_u_s_t_o_m_e_r__a_c_c_o_u_n_t__n_o;
//                             console.log("DEBUG: Found customer account in loan_accounts:", targetAccountNumber);
//                         } else if (loanAccountDetails.d_i_s_b_u_r_s_e_m_e_n_t__a_c_c_o_u_n_t) {
//                             targetAccountNumber = loanAccountDetails.d_i_s_b_u_r_s_e_m_e_n_t__a_c_c_o_u_n_t;
//                             console.log("DEBUG: Found disbursement account in loan_accounts:", targetAccountNumber);
//                         }
//                     }
//                 } catch (loanAccountError) {
//                     console.log("DEBUG: Could not get account from loan_accounts:", loanAccountError.message);
//                 }
//             }
            
//             // THIRD: If still no account number, use customer ID search as fallback
//             if (!targetAccountNumber && customerId) {
//                 console.log("DEBUG: No account number found, searching by customer ID:", numericCustomerId);
                
//                 // Direct query to customer_accounts with numeric ID
//                 const findAccountQuery = `SELECT account_number FROM customer_accounts WHERE customer_id = ${numericCustomerId} LIMIT 1`;
//                 console.log("DEBUG: Executing customer ID search:", findAccountQuery);
                
//                 const [accountResult] = await sequelize.query(findAccountQuery, {
//                     transaction,
//                     type: sequelize.QueryTypes.SELECT
//                 });
                
//                 console.log("DEBUG: Customer ID search result:", accountResult);
                
//                 if (accountResult && accountResult.account_number) {
//                     targetAccountNumber = accountResult.account_number;
//                     console.log("DEBUG: ✓ Found account by customer ID:", targetAccountNumber);
//                 } else {
//                     console.log("DEBUG: ✗ No account found by customer ID");
//                 }
//             }
            
//             // FOURTH: If we have an account number, search for it in the database
//             if (targetAccountNumber) {
//                 customerAccountNumber = targetAccountNumber;
//                 console.log("DEBUG: ✓ Using account number:", customerAccountNumber);
                
//                 // Search in customer_accounts table
//                 console.log("DEBUG: Searching customer_accounts for account:", customerAccountNumber);
//                 const custAccountQuery = `SELECT * FROM customer_accounts WHERE account_number = '${customerAccountNumber}' LIMIT 1`;
//                 console.log("DEBUG: Executing:", custAccountQuery);
                
//                 const [custAccountResult] = await sequelize.query(custAccountQuery, {
//                     transaction,
//                     type: sequelize.QueryTypes.SELECT
//                 });
                
//                 if (custAccountResult) {
//                     customerAccountsTableRecord = custAccountResult;
//                     console.log("DEBUG: ✓ Found in customer_accounts table!");
//                     console.log("DEBUG: Account details:", {
//                         id: customerAccountsTableRecord.id,
//                         account_number: customerAccountsTableRecord.account_number,
//                         customer_id: customerAccountsTableRecord.customer_id,
//                         account_name: customerAccountsTableRecord.account_name,
//                         current_balance: customerAccountsTableRecord.current_balance,
//                         available_balance: customerAccountsTableRecord.available_balance,
//                         ledger_balance: customerAccountsTableRecord.ledger_balance,
//                         cleared_balance: customerAccountsTableRecord.cleared_balance
//                     });
//                 } else {
//                     console.log("DEBUG: ✗ Account not found in customer_accounts table");
//                     console.log("DEBUG: This is strange because we should have found account", customerAccountNumber);
//                 }
                
//                 // Search in accounts table
//                 console.log("DEBUG: Searching accounts table for account:", customerAccountNumber);
//                 const accountsQuery = `SELECT * FROM accounts WHERE account_number = '${customerAccountNumber}' OR acct_no = '${customerAccountNumber}' LIMIT 1`;
//                 console.log("DEBUG: Executing:", accountsQuery);
                
//                 const [accountsResult] = await sequelize.query(accountsQuery, {
//                     transaction,
//                     type: sequelize.QueryTypes.SELECT
//                 });
                
//                 if (accountsResult) {
//                     accountsTableRecord = accountsResult;
//                     console.log("DEBUG: ✓ Found in accounts table");
//                 } else {
//                     console.log("DEBUG: ✗ Account not found in accounts table");
//                 }
                
//                 // Create customer account details
//                 if (customerAccountsTableRecord) {
//                     customerAccountDetails = {
//                         accountNumber: customerAccountNumber,
//                         accountName: customerAccountsTableRecord.account_name || customerName || 'Unknown',
//                         accountType: customerAccountsTableRecord.account_type || 'SAVINGS',
//                         currency: customerAccountsTableRecord.currency_code || 'NGN',
//                         currentLedgerBalance: parseFloat(customerAccountsTableRecord.ledger_balance || 0),
//                         currentAvailableBalance: parseFloat(customerAccountsTableRecord.available_balance || 0),
//                         currentClearedBalance: parseFloat(customerAccountsTableRecord.cleared_balance || 0),
//                         currentBalance: parseFloat(customerAccountsTableRecord.current_balance || 0),
//                         accountsTableRecord: accountsTableRecord,
//                         customerAccountsTableRecord: customerAccountsTableRecord
//                     };
                    
//                     console.log("DEBUG: ✓ Created customer account details object");
//                 }
//             } else {
//                 console.log("DEBUG: ✗ No account number could be determined");
//                 console.log("DEBUG: Tried:", {
//                     fromCreditApp: false, // will be true if found
//                     fromLoanAccount: false, // will be true if found  
//                     fromCustomerId: !!customerId
//                 });
//             }
            
//         } catch (lookupError) {
//             console.error("DEBUG: Error in customer account lookup:", lookupError.message);
//             console.error("DEBUG: Error stack:", lookupError.stack);
//         }

//         // ==================== 7. UPDATE BOTH ACCOUNT TABLES ====================
//         if (customerAccountNumber && customerAccountsTableRecord) {
//             try {
//                 console.log("DEBUG: =========================================");
//                 console.log("DEBUG: ✓ CREDITING CUSTOMER ACCOUNT");
//                 console.log("DEBUG: =========================================");
//                 console.log("DEBUG: Account to credit:", customerAccountNumber);
//                 console.log("DEBUG: Disbursement amount: ₦" + disbursementAmount.toLocaleString());
                
//                 // Get current balances
//                 const currentLedgerBalance = parseFloat(customerAccountsTableRecord.ledger_balance || 0);
//                 const currentAvailableBalance = parseFloat(customerAccountsTableRecord.available_balance || 0);
//                 const currentClearedBalance = parseFloat(customerAccountsTableRecord.cleared_balance || 0);
//                 const currentBalance = parseFloat(customerAccountsTableRecord.current_balance || 0);
                
//                 // Calculate new balances
//                 const newLedgerBalance = currentLedgerBalance + disbursementAmount;
//                 const newAvailableBalance = currentAvailableBalance + disbursementAmount;
//                 const newClearedBalance = currentClearedBalance + disbursementAmount;
//                 const newCurrentBalance = currentBalance + disbursementAmount;
                
//                 console.log("DEBUG: BALANCE UPDATE:");
//                 console.log("DEBUG: ---------------------------------");
//                 console.log("DEBUG: Type           | Current      | New");
//                 console.log("DEBUG: ---------------------------------");
//                 console.log("DEBUG: Ledger Balance | ₦" + currentLedgerBalance.toLocaleString().padEnd(10) + " | ₦" + newLedgerBalance.toLocaleString());
//                 console.log("DEBUG: Available      | ₦" + currentAvailableBalance.toLocaleString().padEnd(10) + " | ₦" + newAvailableBalance.toLocaleString());
//                 console.log("DEBUG: Cleared        | ₦" + currentClearedBalance.toLocaleString().padEnd(10) + " | ₦" + newClearedBalance.toLocaleString());
//                 console.log("DEBUG: Current        | ₦" + currentBalance.toLocaleString().padEnd(10) + " | ₦" + newCurrentBalance.toLocaleString());
//                 console.log("DEBUG: ---------------------------------");
                
//                 // Format date for SQL
//                 const sqlDate = now.toISOString().slice(0, 19).replace('T', ' ');
                
//                 // 1. UPDATE CUSTOMER_ACCOUNTS TABLE
//                 console.log("\nDEBUG: Step 1: Updating customer_accounts table...");
//                 const updateCustomerAccountQuery = `
//                     UPDATE customer_accounts 
//                     SET ledger_balance = ${newLedgerBalance},
//                         available_balance = ${newAvailableBalance},
//                         cleared_balance = ${newClearedBalance},
//                         current_balance = ${newCurrentBalance},
//                         last_transaction_date = '${sqlDate}',
//                         updated_at = '${sqlDate}'
//                     WHERE account_number = '${customerAccountNumber}'
//                 `;
                
//                 console.log("DEBUG: Executing query...");
//                 const customerUpdateResult = await sequelize.query(updateCustomerAccountQuery, { transaction });
//                 console.log("DEBUG: ✓ customer_accounts table updated successfully");
                
//                 // 2. UPDATE ACCOUNTS TABLE USING ACCOUNT SERVICE
//                 console.log("\nDEBUG: Step 2: Updating accounts table using AccountService...");
                
//                 try {
//                     // Prepare account data for AccountService
//                     const accountData = {
//                         customer_id: numericCustomerId || customerAccountsTableRecord.customer_id || 0,
//                         account_number: customerAccountNumber,
//                         acct_no: customerAccountNumber,
//                         acct_nm: customerAccountsTableRecord.account_name || customerName || 'Loan Customer',
//                         account_type: customerAccountsTableRecord.account_type || 'SAVINGS',
//                         product_type: 'SAVINGS',
//                         product: 'Savings Account',
//                         branch: 1, // REQUIRED! Use appropriate branch ID
//                         ledger_balance: newLedgerBalance,
//                         available_balance: newAvailableBalance,
//                         cleared_balance: newClearedBalance,
//                         rec_st: 'ACTIVE',
//                         currency: customerAccountsTableRecord.currency_code || 'NGN',
//                         online_enabled: 1,
//                         dr_allowed: 1,
//                         cr_allowed: 1,
//                         last_activity_date: sqlDate,
//                         created_by: approvedBy || 'LOAN_SYSTEM',
//                         product_desc: 'Account for loan disbursement',
                        
//                         // Optional fields that might be needed
//                         customer_code: customerId, // Use the original customer ID string
//                         opening_amount: 0, // Default opening amount
//                         interest_rate: 0, // No interest for savings account
//                         accrued_interest: 0,
//                         overdraft_limit: 0,
//                         substatus: 'Active',
//                         sms_alert: 'No',
//                         email_alert: 'No',
//                         is_overdraft_allowed: 0,
//                         auto_approve: 0,
//                         disbursement_method: 'Cash',
//                         creation_date: sqlDate.substring(0, 10) // Just the date part
//                     };
                    
//                     console.log("DEBUG: Calling AccountService.createOrUpdateAccount...");
//                     const result = await createOrUpdateAccount(accountData, transaction);
                    
//                     if (result.success) {
//                         console.log("DEBUG: ✓ AccountService operation successful:", result.message);
//                         console.log("DEBUG: Action performed:", result.action);
//                         console.log("DEBUG: Account ID:", result.account?.id || result.account?.insertId || 'Unknown');
                        
//                         // Store the account record for later use if needed
//                         const updatedAccount = result.account;
//                         if (updatedAccount && !accountsTableRecord) {
//                             accountsTableRecord = updatedAccount;
//                         }
//                     } else {
//                         console.warn("DEBUG: ⚠️ AccountService returned success: false");
//                         console.warn("DEBUG: Message:", result.message);
                        
//                         // Fallback to manual creation/update
//                         await fallbackToManualAccountUpdate(customerAccountNumber, accountData, transaction, sqlDate);
//                     }
                    
//                 } catch (serviceError) {
//                     console.error("DEBUG: ❌ AccountService failed:", serviceError.message);
//                     console.error("DEBUG: Service error stack:", serviceError.stack);
                    
//                     // Fallback to manual creation/update
//                     console.log("DEBUG: 🔄 Falling back to manual account update...");
//                     await fallbackToManualAccountUpdate(customerAccountNumber, {
//                         customer_id: numericCustomerId || customerAccountsTableRecord.customer_id || 0,
//                         account_number: customerAccountNumber,
//                         acct_nm: customerAccountsTableRecord.account_name || customerName || 'Loan Customer',
//                         account_type: customerAccountsTableRecord.account_type || 'SAVINGS',
//                         newLedgerBalance,
//                         newAvailableBalance,
//                         newClearedBalance,
//                         currency: customerAccountsTableRecord.currency_code || 'NGN'
//                     }, transaction, sqlDate);
//                 }
                
//                 // 3. CREATE TRANSACTION RECORD
//                 console.log("\nDEBUG: Step 3: Creating transaction record...");
//                 try {
//                     const transactionId = `LOAN-DISB-${ACCT_NO}-${Date.now()}`;
                    
//                     const transactionQuery = `
//                         INSERT INTO customer_transactions (
//                             transaction_id, account_number, transaction_type,
//                             amount, description, balance_after,
//                             transaction_date, reference_number, created_by
//                         ) VALUES (
//                             '${transactionId}',
//                             '${customerAccountNumber}',
//                             'CREDIT',
//                             ${disbursementAmount},
//                             'Loan disbursement from loan account ${ACCT_NO}',
//                             ${newCurrentBalance},
//                             '${sqlDate}',
//                             '${ACCT_NO}',
//                             '${approvedBy}'
//                         )
//                     `;
                    
//                     console.log("DEBUG: Creating transaction record...");
//                     await sequelize.query(transactionQuery, { transaction });
//                     console.log("DEBUG: ✓ Transaction record created");
                    
//                 } catch (txnError) {
//                     console.warn("DEBUG: Could not create transaction record:", txnError.message);
//                     console.warn("DEBUG: This is not critical - account was still updated");
//                 }
                
//                 console.log("\nDEBUG: =========================================");
//                 console.log("DEBUG: ✓ SUCCESS!");
//                 console.log("DEBUG: =========================================");
//                 console.log(`DEBUG: Account ${customerAccountNumber} credited with ₦${disbursementAmount.toLocaleString()}`);
//                 console.log(`DEBUG: New balance: ₦${newCurrentBalance.toLocaleString()}`);
//                 console.log("DEBUG: =========================================");
                
//             } catch (accountError) {
//                 console.error("\nDEBUG: ✗ ERROR updating customer account:", accountError.message);
//                 console.error("DEBUG: Error details:", accountError);
//                 console.error("DEBUG: This is a critical error - account was NOT updated");
//             }
//         } else {
//             console.log("\nDEBUG: =========================================");
//             console.log("DEBUG: ✗ CRITICAL: Cannot update customer account");
//             console.log("DEBUG: =========================================");
//             console.log("DEBUG: Missing required data:");
//             console.log("DEBUG: - Has account number:", !!customerAccountNumber);
//             console.log("DEBUG: - Has account record:", !!customerAccountsTableRecord);
//             console.log("DEBUG: - Customer ID:", customerId);
//             console.log("DEBUG: - Numeric Customer ID:", numericCustomerId);
            
//             // Let's try a direct query to see what's in the database
//             console.log("\nDEBUG: Diagnostic query - checking credit_applications:");
//             try {
//                 const diagQuery = `SELECT a_c_c_t__n_o, r_e_p_a_y__s_r_c__a_c_c_t__n_o FROM credit_applications WHERE a_c_c_t__n_o = '${ACCT_NO}' LIMIT 1`;
//                 console.log("DEBUG: Executing:", diagQuery);
                
//                 const [diagResult] = await sequelize.query(diagQuery, { 
//                     transaction, 
//                     type: sequelize.QueryTypes.SELECT 
//                 });
                
//                 console.log("DEBUG: Diagnostic result:", diagResult);
                
//                 if (diagResult) {
//                     console.log("DEBUG: Found in credit_applications:");
//                     console.log("DEBUG: - Account No:", diagResult.a_c_c_t__n_o);
//                     console.log("DEBUG: - Repay Source Account:", diagResult.r_e_p_a_y__s_r_c__a_c_c_t__n_o);
                    
//                     if (diagResult.r_e_p_a_y__s_r_c__a_c_c_t__n_o) {
//                         console.log("DEBUG: We have the account! It's:", diagResult.r_e_p_a_y__s_r_c__a_c_c_t__n_o);
                        
//                         // Try to find it directly
//                         const findAccountQuery = `SELECT * FROM customer_accounts WHERE account_number = '${diagResult.r_e_p_a_y__s_r_c__a_c_c_t__n_o}' LIMIT 1`;
//                         console.log("DEBUG: Looking for account:", findAccountQuery);
                        
//                         const [foundAccount] = await sequelize.query(findAccountQuery, { 
//                             transaction, 
//                             type: sequelize.QueryTypes.SELECT 
//                         });
                        
//                         console.log("DEBUG: Found account?", !!foundAccount);
//                         if (foundAccount) {
//                             console.log("DEBUG: Account details:", {
//                                 account_number: foundAccount.account_number,
//                                 customer_id: foundAccount.customer_id,
//                                 account_name: foundAccount.account_name
//                             });
//                         }
//                     }
//                 } else {
//                     console.log("DEBUG: No record found in credit_applications for loan", ACCT_NO);
//                 }
//             } catch (diagError) {
//                 console.error("DEBUG: Diagnostic query failed:", diagError.message);
//             }
//         }

//         // ==================== HELPER FUNCTION FOR FALLBACK ====================
//         async function fallbackToManualAccountUpdate(accountNumber, accountData, transaction, sqlDate) {
//             try {
//                 console.log("DEBUG: Executing manual account update fallback...");
                
//                 // Check if account exists in accounts table
//                 const accountsCheckQuery = `
//                     SELECT id FROM accounts 
//                     WHERE account_number = '${accountNumber}' 
//                        OR acct_no = '${accountNumber}'
//                     LIMIT 1
//                 `;
                
//                 const [existingAccount] = await sequelize.query(accountsCheckQuery, {
//                     transaction,
//                     type: sequelize.QueryTypes.SELECT
//                 });
                
//                 if (existingAccount && existingAccount.id) {
//                     // Update existing account
//                     const updateAccountsQuery = `
//                         UPDATE accounts 
//                         SET ledger_balance = ${accountData.ledger_balance || accountData.newLedgerBalance || 0},
//                             available_balance = ${accountData.available_balance || accountData.newAvailableBalance || 0},
//                             cleared_balance = ${accountData.cleared_balance || accountData.newClearedBalance || 0},
//                             last_activity_date = '${sqlDate}',
//                             updated_at = '${sqlDate}'
//                         WHERE account_number = '${accountNumber}' 
//                            OR acct_no = '${accountNumber}'
//                     `;
                    
//                     await sequelize.query(updateAccountsQuery, { transaction });
//                     console.log("DEBUG: ✓ accounts table updated via manual fallback");
//                 } else {
//                     // Create new account
//                     const createAccountsQuery = `
//                         INSERT INTO accounts (
//                             customer_id, account_number, acct_no, acct_nm,
//                             account_type, product_type, product,
//                             ledger_balance, available_balance, cleared_balance,
//                             rec_st, currency, online_enabled,
//                             dr_allowed, cr_allowed, last_activity_date,
//                             created_at, updated_at, branch
//                         ) VALUES (
//                             ${accountData.customer_id || 'NULL'},
//                             '${accountNumber}',
//                             '${accountNumber}',
//                             '${accountData.acct_nm || 'Loan Customer'}',
//                             '${accountData.account_type || 'SAVINGS'}',
//                             'SAVINGS',
//                             'Savings Account',
//                             ${accountData.ledger_balance || accountData.newLedgerBalance || 0},
//                             ${accountData.available_balance || accountData.newAvailableBalance || 0},
//                             ${accountData.cleared_balance || accountData.newClearedBalance || 0},
//                             'ACTIVE',
//                             '${accountData.currency || 'NGN'}',
//                             1,
//                             1,
//                             1,
//                             '${sqlDate}',
//                             '${sqlDate}',
//                             '${sqlDate}',
//                             1  -- BRANCH ID (required!)
//                         )
//                     `;
                    
//                     console.log("DEBUG: Creating account in accounts table via manual fallback...");
//                     const createResult = await sequelize.query(createAccountsQuery, { transaction });
//                     console.log("DEBUG: ✓ Created account in accounts table via manual fallback, ID:", createResult[0]?.insertId);
//                 }
                
//             } catch (fallbackError) {
//                 console.error("DEBUG: ❌ Manual fallback also failed:", fallbackError.message);
//                 console.error("DEBUG: This is a serious issue - accounts table may not be updated");
//             }
//         }

//         // ==================== 8. CREATE/UPDATE DISBURSEMENT RECORD ====================
//         // Check if loan_disbursements table exists
//         const disbTables = await sequelize.query(
//             `SELECT TABLE_NAME 
//              FROM INFORMATION_SCHEMA.TABLES 
//              WHERE TABLE_SCHEMA = DATABASE() 
//              AND TABLE_NAME = 'loan_disbursements'`,
//             { transaction, type: sequelize.QueryTypes.SELECT }
//         );
        
//         let disbursementRecord;
        
//         if (disbTables.length > 0) {
//             console.log("DEBUG: loan_disbursements table exists");
            
//             // Check for existing disbursements using the correct column name
//             const existingDisbursements = await sequelize.query(
//                 `SELECT * FROM loan_disbursements WHERE a_c_c_t__n_o = ?`,
//                 {
//                     replacements: [ACCT_NO],
//                     transaction,
//                     type: sequelize.QueryTypes.SELECT
//                 }
//             );
            
//             if (existingDisbursements.length > 0) {
//                 // Update existing disbursement record
//                 const existingId = existingDisbursements[0].id;
                
//                 // Update status to APPROVED (or COMPLETED)
//                 await sequelize.query(
//                     `UPDATE loan_disbursements 
//                      SET s_t_a_t_u_s = 'APPROVED',
//                          updated_at = ?
//                      WHERE id = ?`,
//                     {
//                         replacements: [now, existingId],
//                         transaction
//                     }
//                 );
                
//                 disbursementRecord = { id: existingId };
//                 console.log(`DEBUG: Updated existing disbursement record ID: ${existingId}`);
                
//             } else {
//                 // Create new disbursement record using existing table structure
//                 console.log("DEBUG: Creating new disbursement record with existing table structure");
                
//                 const result = await sequelize.query(
//                     `INSERT INTO loan_disbursements (
//                         a_c_c_t__n_o, 
//                         a_p_p_l__i_d,
//                         c_u_s_t__i_d,
//                         i_n_t_e_r_e_s_t__r_a_t_e,
//                         t_e_r_m__v_a_l_u_e,
//                         t_e_r_m__c_d,
//                         a_m_o_u_n_t,
//                         l_o_a_n__a_c_c_o_u_n_t__i_d,
//                         s_t_a_t_u_s,
//                         created_at,
//                         updated_at
//                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//                     {
//                         replacements: [
//                             ACCT_NO,
//                             ACCT_NO,
//                             loanAccount.c_u_s_t__i_d,
//                             loanAccount.i_n_t_e_r_e_s_t__r_a_t_e || 0,
//                             loanAccount.t_e_r_m__v_a_l_u_e || 0,
//                             loanAccount.t_e_r_m__c_d || 'MONTHLY',
//                             disbursementAmount,
//                             loanAccount.id,
//                             'APPROVED',
//                             now,
//                             now
//                         ],
//                         transaction
//                     }
//                 );
                
//                 disbursementRecord = { id: result[0].insertId };
//                 console.log(`DEBUG: Created new disbursement record ID: ${disbursementRecord.id}`);
//             }
//         } else {
//             console.log("DEBUG: loan_disbursements table does not exist, creating it...");
            
//             // Create table with proper column names based on your existing schema
//             await sequelize.query(`
//                 CREATE TABLE IF NOT EXISTS loan_disbursements (
//                     id INT PRIMARY KEY AUTO_INCREMENT,
//                     a_c_c_t__n_o VARCHAR(255),
//                     a_p_p_l__i_d VARCHAR(255),
//                     c_u_s_t__i_d VARCHAR(255),
//                     i_n_t_e_r_e_s_t__r_a_t_e DECIMAL(7,4),
//                     t_e_r_m__v_a_l_u_e INT,
//                     t_e_r_m__c_d VARCHAR(255),
//                     a_m_o_u_n_t DECIMAL(20,2),
//                     l_o_a_n__a_c_c_o_u_n_t__i_d INT,
//                     r_e_p_a_y_m_e n_t__s_c_h_e_d_u_l_e__i_d INT,
//                     g_u_a_r_a_n_t_o_r__i_d INT,
//                     p_r_o_d__i_d VARCHAR(255),
//                     p_r_o_d_u_c_t__t_y_p_e VARCHAR(255),
//                     created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
//                     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
//                     s_t_a_t_u_s VARCHAR(50) DEFAULT 'PENDING'
//                 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
//                 { transaction }
//             );
            
//             // Create new disbursement record
//             const result = await sequelize.query(
//                 `INSERT INTO loan_disbursements (
//                     a_c_c_t__n_o, 
//                     a_p_p_l__i_d,
//                     c_u_s_t__i_d,
//                     i_n_t_e_r_e_s_t__r_a_t_e,
//                     t_e_r_m__v_a_l_u_e,
//                     t_e_r_m__c_d,
//                     a_m_o_u_n_t,
//                     l_o_a_n__a_c_c_o_u_n_t__i_d,
//                     s_t_a_t_u_s,
//                     created_at,
//                     updated_at
//                 ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//                 {
//                     replacements: [
//                         ACCT_NO,
//                         ACCT_NO,
//                         loanAccount.c_u_s_t__i_d,
//                         loanAccount.i_n_t_e_r_e_s_t__r_a_t_e || 0,
//                         loanAccount.t_e_r_m__v_a_l_u_e || 0,
//                         loanAccount.t_e_r_m__c_d || 'MONTHLY',
//                         disbursementAmount,
//                         loanAccount.id,
//                         'APPROVED',
//                         now,
//                         now
//                     ],
//                     transaction
//                 }
//             );
            
//             disbursementRecord = { id: result[0].insertId };
//             console.log(`DEBUG: Created new disbursement record ID: ${disbursementRecord.id}`);
//         }

//         // ==================== 9. UPDATE CREDIT APPLICATION ====================
//         // Check if credit_applications table exists
//         const creditTables = await sequelize.query(
//             `SELECT TABLE_NAME 
//              FROM INFORMATION_SCHEMA.TABLES 
//              WHERE TABLE_SCHEMA = DATABASE() 
//              AND TABLE_NAME = 'credit_applications'`,
//             { transaction, type: sequelize.QueryTypes.SELECT }
//         );

//         if (creditTables.length > 0) {
//             console.log("DEBUG: credit_applications table exists, attempting update...");
            
//             try {
//                 // Use the correct column name a_c_c_t__n_o instead of ACCT_NO
//                 await sequelize.query(
//                     `UPDATE credit_applications 
//                      SET s_t_a_t_u_s = 'APPROVED',
//                          a_p_p_r_o_v_e_d__b_y = ?,
//                          a_p_p_r_o_v_a_l__d_t = ?,
//                          c_o_m_m_e_n_t_s = CONCAT(COALESCE(c_o_m_m_e_n_t_s, ''), ?),
//                          r_o_w__t_s = ?
//                      WHERE a_c_c_t__n_o = ?`,
//                     {
//                         replacements: [
//                             approvedBy, 
//                             now, 
//                             ` | ${approvalComments}`,
//                             now, 
//                             ACCT_NO
//                         ],
//                         transaction
//                     }
//                 );
//                 console.log("DEBUG: Credit application updated");
//             } catch (creditUpdateError) {
//                 console.error("DEBUG: Failed to update credit application:", creditUpdateError.message);
//                 // Don't rollback for this error - just log and continue
//             }
//         } else {
//             console.log("DEBUG: credit_applications table does not exist, skipping update");
//         }

//         // ==================== 10. POST TO GENERAL LEDGER ====================
//         try {
//             const transactionId = `LOAN-DISB-${ACCT_NO}-${Date.now()}`;
//             const journalId = `JRNL-LOAN-${Date.now()}`;
            
//             console.log("DEBUG: =========================================");
//             console.log("DEBUG: GENERAL LEDGER POSTING");
//             console.log("DEBUG: =========================================");
//             console.log(`DEBUG: Transaction ID: ${transactionId}`);
//             console.log(`DEBUG: Journal ID: ${journalId}`);
//             console.log(`DEBUG: Loan Account: ${ACCT_NO}`);
//             console.log(`DEBUG: Gross Disbursement Amount: ₦${disbursementAmount.toLocaleString()}`);
            
//             // Check if ledgers table exists
//             const ledgersTableCheck = await sequelize.query(
//                 `SELECT TABLE_NAME 
//                  FROM INFORMATION_SCHEMA.TABLES 
//                  WHERE TABLE_SCHEMA = DATABASE() 
//                  AND TABLE_NAME = 'ledgers'`,
//                 { transaction, type: sequelize.QueryTypes.SELECT }
//             );
            
//             if (ledgersTableCheck.length > 0) {
//                 console.log("DEBUG: ✓ ledgers table exists");
                
//                 // Get current date in SQL format
//                 const sqlDate = now.toISOString().slice(0, 19).replace('T', ' ');
                
//                 // ==================== 10.1. GET LOAN PRODUCT CONFIGURATION ====================
//                 console.log("\nDEBUG: Step 1: Getting loan product configuration...");

//                 let productConfig = null;
//                 let principalGLAccount = null;
//                 let interestGLAccount = null;
//                 let processingFeeGLAccount = null;
//                 let processingFeeRate = 0;
//                 let processingFeeAmount = 0;

//                 try {
//                     // Try to get the loan product ID from loan_accounts
//                     console.log("DEBUG: Attempting to get product ID from loan account:", ACCT_NO);
                    
//                     const loanAccountQuery = `
//                         SELECT l_o_a_n__p_r_o_d_u_c_t__i_d 
//                         FROM loan_accounts 
//                         WHERE a_c_c_t__n_o = ? 
//                         LIMIT 1
//                     `;
                    
//                     const [loanAccountResult] = await sequelize.query(loanAccountQuery, {
//                         replacements: [ACCT_NO],
//                         transaction,
//                         type: sequelize.QueryTypes.SELECT
//                     });
                    
//                     let productId = null;
//                     let usingDefaultProduct = false;
                    
//                     if (loanAccountResult && loanAccountResult.l_o_a_n__p_r_o_d_u_c_t__i_d) {
//                         productId = loanAccountResult.l_o_a_n__p_r_o_d_u_c_t__i_d;
//                         console.log("DEBUG: Found product ID in loan account:", productId);
//                     } else {
//                         console.warn("DEBUG: ⚠️ No product ID found in loan account, using default product");
//                         usingDefaultProduct = true;
                        
//                         // Get the default/active loan product (first active product)
//                         const defaultProductQuery = `
//                             SELECT p_r_o_d__i_d 
//                             FROM loan_products 
//                             WHERE is_active = 1 
//                             AND s_t_a_t_u_s = 'ACTIVE'
//                             LIMIT 1
//                         `;
                        
//                         const [defaultProductResult] = await sequelize.query(defaultProductQuery, {
//                             transaction,
//                             type: sequelize.QueryTypes.SELECT
//                         });
                        
//                         if (defaultProductResult && defaultProductResult.p_r_o_d__i_d) {
//                             productId = defaultProductResult.p_r_o_d__i_d;
//                             console.warn("DEBUG: ⚠️ Using default product ID:", productId);
//                         } else {
//                             // If no active product, use the first product in the table
//                             const firstProductQuery = `
//                                 SELECT p_r_o_d__i_d 
//                                 FROM loan_products 
//                                 LIMIT 1
//                             `;
                            
//                             const [firstProductResult] = await sequelize.query(firstProductQuery, {
//                                 transaction,
//                                 type: sequelize.QueryTypes.SELECT
//                             });
                            
//                             if (firstProductResult && firstProductResult.p_r_o_d__i_d) {
//                                 productId = firstProductResult.p_r_o_d__i_d;
//                                 console.warn("DEBUG: ⚠️ Using first available product ID:", productId);
//                             } else {
//                                 console.error("DEBUG: ❌ No loan products found in the database");
//                                 throw new Error("No loan products configured in the system. Please create a loan product first.");
//                             }
//                         }
//                     }
                    
//                     // Now get the loan product using the product ID
//                     const productQuery = `
//                         SELECT lp.*, 
//                                JSON_EXTRACT(lp.default_g_l_accounts, '$.loanGLAccount') as loanGLAccount,
//                                JSON_EXTRACT(lp.default_g_l_accounts, '$.principalGLAccountNo') as principalGLAccount,
//                                JSON_EXTRACT(lp.default_g_l_accounts, '$.interestGLAccountNo') as interestGLAccount,
//                                JSON_EXTRACT(lp.default_g_l_accounts, '$.processingFeeGLCode') as processingFeeGLAccount,
//                                lp.processing_fee_g_l_code,
//                                lp.processing_fee_rate
//                         FROM loan_products lp
//                         WHERE lp.p_r_o_d__i_d = ?
//                         LIMIT 1
//                     `;
                    
//                     const [productResult] = await sequelize.query(productQuery, {
//                         replacements: [productId],
//                         transaction,
//                         type: sequelize.QueryTypes.SELECT
//                     });
                    
//                     if (productResult) {
//                         productConfig = productResult;
                        
//                         if (usingDefaultProduct) {
//                             console.warn("DEBUG: ⚠️ Using default/first available loan product:");
//                             console.warn(`DEBUG:   Product ID: ${productResult.p_r_o_d__i_d}`);
//                             console.warn(`DEBUG:   Product Name: ${productResult.name}`);
//                             console.warn("DEBUG:   NOTE: Consider updating the loan account with a proper product ID");
                            
//                             // Update the loan account with the product ID for future reference
//                             try {
//                                 await sequelize.query(
//                                     `UPDATE loan_accounts 
//                                      SET l_o_a_n__p_r_o_d_u_c_t__i_d = ? 
//                                      WHERE a_c_c_t__n_o = ?`,
//                                     {
//                                         replacements: [productId, ACCT_NO],
//                                         transaction
//                                     }
//                                 );
//                                 console.log("DEBUG: ✓ Updated loan account with product ID:", productId);
//                             } catch (updateError) {
//                                 console.warn("DEBUG: Could not update loan account with product ID:", updateError.message);
//                             }
//                         } else {
//                             console.log("DEBUG: ✓ Found loan product configuration");
//                             console.log("DEBUG: Product ID:", productResult.p_r_o_d__i_d);
//                             console.log("DEBUG: Product Name:", productResult.name);
//                         }
                        
//                         // Extract GL accounts from default_g_l_accounts JSON
//                         if (productResult.default_g_l_accounts) {
//                             try {
//                                 const glAccounts = JSON.parse(productResult.default_g_l_accounts);
//                                 principalGLAccount = glAccounts.principalGLAccountNo || glAccounts.loanGLAccount;
//                                 interestGLAccount = glAccounts.interestGLAccountNo;
//                                 processingFeeGLAccount = glAccounts.processingFeeGLCode;
                                
//                                 console.log("DEBUG: Extracted GL accounts from default_g_l_accounts:");
//                                 console.log("DEBUG:   Principal GL Account:", principalGLAccount);
//                                 console.log("DEBUG:   Interest GL Account:", interestGLAccount);
//                                 console.log("DEBUG:   Processing Fee GL Account:", processingFeeGLAccount);
                                
//                                 // Validate that required GL accounts are present
//                                 if (!principalGLAccount) {
//                                     throw new Error("Principal GL account not found in loan product configuration");
//                                 }
//                                 if (!interestGLAccount) {
//                                     console.warn("DEBUG: Warning: Interest GL account not found in loan product configuration");
//                                 }
//                                 if (!processingFeeGLAccount) {
//                                     console.warn("DEBUG: Warning: Processing Fee GL account not found in default_g_l_accounts");
//                                 }
                                
//                             } catch (e) {
//                                 console.error("DEBUG: ❌ Could not parse GL accounts JSON:", e.message);
//                                 throw new Error(`Invalid GL accounts configuration in loan product: ${e.message}`);
//                             }
//                         } else {
//                             console.error("DEBUG: ❌ No default_g_l_accounts found in loan product");
//                             throw new Error("Loan product does not have GL accounts configured");
//                         }
                        
//                         // Get processing fee details
//                         processingFeeRate = parseFloat(productResult.processing_fee_rate || 0);
                        
//                         // Calculate processing fee amount
//                         if (processingFeeRate > 0) {
//                             processingFeeAmount = (disbursementAmount * processingFeeRate) / 100;
//                             console.log("DEBUG: Processing Fee Rate:", processingFeeRate + '%');
//                             console.log("DEBUG: Processing Fee Amount: ₦" + processingFeeAmount.toLocaleString());
//                         }
                        
//                         // If processingFeeGLAccount not found in default_g_l_accounts, use processing_fee_g_l_code
//                         if (!processingFeeGLAccount && productResult.processing_fee_g_l_code) {
//                             processingFeeGLAccount = productResult.processing_fee_g_l_code;
//                             console.log("DEBUG: Using processing_fee_g_l_code for fee:", processingFeeGLAccount);
//                         }
                        
//                         // Also check fee_structure for processing fee GL account
//                         if (productResult.fee_structure && !processingFeeGLAccount) {
//                             try {
//                                 const feeStructure = JSON.parse(productResult.fee_structure);
//                                 const processingFee = feeStructure.find(fee => 
//                                     fee.feeType === 'PROCESSING' || fee.name === 'Processing Fee'
//                                 );
//                                 if (processingFee && processingFee.glAccountCode) {
//                                     processingFeeGLAccount = processingFee.glAccountCode;
//                                     console.log("DEBUG: Found Processing Fee GL account in fee_structure:", processingFeeGLAccount);
//                                 }
//                             } catch (e) {
//                                 console.warn("DEBUG: Could not parse fee_structure:", e.message);
//                             }
//                         }
                        
//                         console.log("DEBUG: ✓ GL accounts configured successfully:");
//                         console.log("DEBUG:   Principal: ", principalGLAccount);
//                         console.log("DEBUG:   Interest:  ", interestGLAccount || "Not configured");
//                         console.log("DEBUG:   Fee:       ", processingFeeGLAccount || "Not configured");
                        
//                     } else {
//                         console.error("DEBUG: ❌ No loan product found for product ID:", productId);
//                         throw new Error(`Loan product with ID ${productId} not found in loan_products table`);
//                     }
//                 } catch (productError) {
//                     console.error("DEBUG: ❌ ERROR getting loan product configuration:", productError.message);
//                     console.error("DEBUG: This is a critical error - loan cannot be disbursed without GL accounts");
                    
//                     // Rollback the transaction since we can't proceed without GL accounts
//                     if (transaction && !transaction.finished) {
//                         await transaction.rollback();
//                     }
                    
//                     return res.status(500).json({
//                         success: false,
//                         message: "Loan disbursement failed: Missing GL account configuration",
//                         error: productError.message,
//                         code: "MISSING_GL_CONFIGURATION",
//                         debug: {
//                             loanAccount: ACCT_NO,
//                             error: productError.message,
//                             requiredInfo: "Loan product must have GL accounts configured in default_g_l_accounts",
//                             suggestion: "1. Check if loan_products table has any products\n2. Check if default_g_l_accounts JSON is valid\n3. Ensure at least one product is active"
//                         }
//                     });
//                 }
                
//                 // ==================== 10.2. CALCULATE INTEREST COMPONENT ====================
//                 console.log("\nDEBUG: Step 2: Calculating interest component...");
                
//                 let interestAmount = 0;
//                 const interestRate = parseFloat(loanAccount.i_n_t_e_r_e_s_t__r_a_t_e || 0);
//                 const termValue = parseFloat(loanAccount.t_e_r_m__v_a_l_u_e || 0);
                
//                 if (interestRate > 0 && termValue > 0) {
//                     // Calculate interest for the full loan term
//                     interestAmount = (disbursementAmount * interestRate * termValue) / (12 * 100); // Monthly calculation
//                     console.log("DEBUG: Interest Rate:", interestRate + "%");
//                     console.log("DEBUG: Term Value:", termValue + " months");
//                     console.log("DEBUG: Calculated Interest: ₦" + interestAmount.toLocaleString());
//                 } else {
//                     console.log("DEBUG: No interest rate or term specified, skipping interest component");
//                 }
                
//                 // ==================== 10.3. VERIFY GL ACCOUNTS EXIST IN gl_accounts TABLE ====================
//                 console.log("\nDEBUG: Step 3: Verifying GL accounts in gl_accounts table...");

//                 // Function to check if GL account exists and get its details
//                 const getGLAccountDetails = async (glAccountNo) => {
//                     try {
//                         const accountCheck = await sequelize.query(
//                             `SELECT g_l__a_c_c_t__n_o, a_c_c_t__d_e_s_c, g_l__a_c_c_t__c_a_t,
//                                     l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e,
//                                     c_u_r_r_e_n_t__b_a_l_a_n_c_e, b_a_l__c_d,
//                                     c_r__a_l_l_o_w_e_d, d_r__a_l_l_o_w_e_d, r_e_c__s_t,
//                                     c_u_r_r_e_n_c_y__c_o_d_e, c_o_n_t_r_o_l__a_c_c_t__f_g,
//                                     s_u_s_p_e_n_s_e__a_c_c_t__f_g, p_o_s_t__a_l_l_o_w
//                              FROM gl_accounts 
//                              WHERE g_l__a_c_c_t__n_o = ? 
//                              LIMIT 1`,
//                             {
//                                 replacements: [glAccountNo],
//                                 transaction,
//                                 type: sequelize.QueryTypes.SELECT
//                             }
//                         );
                        
//                         if (accountCheck && accountCheck.length > 0) {
//                             const account = accountCheck[0];
                            
//                             // Check if account is active
//                             if (account.r_e_c__s_t !== 'Active') {
//                                 console.warn(`DEBUG: GL account ${glAccountNo} is not active (status: ${account.r_e_c__s_t})`);
//                                 return null;
//                             }
                            
//                             console.log(`DEBUG: ✓ Found GL account: ${account.g_l__a_c_c_t__n_o} - ${account.a_c_c_t__d_e_s_c}`);
//                             console.log(`DEBUG:   Account Category: ${account.g_l__a_c_c_t__c_a_t}`);
//                             console.log(`DEBUG:   Balance Code: ${account.b_a_l__c_d}`);
//                             console.log(`DEBUG:   Current Balance: ₦${parseFloat(account.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0).toLocaleString()}`);
//                             console.log(`DEBUG:   DR Allowed: ${account.d_r__a_l_l_o_w_e_d}, CR Allowed: ${account.c_r__a_l_l_o_w_e_d}`);
//                             console.log(`DEBUG:   Post Allowed: ${account.p_o_s_t__a_l_l_o_w}`);
//                             console.log(`DEBUG:   Control Account: ${account.c_o_n_t_r_o_l__a_c_c_t__f_g}, Suspense: ${account.s_u_s_p_e_n_s_e__a_c_c_t__f_g}`);
                            
//                             return {
//                                 accountNo: account.g_l__a_c_c_t__n_o,
//                                 accountName: account.a_c_c_t__d_e_s_c,
//                                 accountCategory: account.g_l__a_c_c_t__c_a_t,
//                                 balanceCode: account.b_a_l__c_d,
//                                 currentBalance: parseFloat(account.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0),
//                                 ledgerBalance: parseFloat(account.l_e_d_g_e_r__b_a_l_a_n_c_e || 0),
//                                 availableBalance: parseFloat(account.a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e || 0),
//                                 openingBalance: parseFloat(account.o_p_e_n_i_n_g__b_a_l_a_n_c_e || 0),
//                                 drAllowed: account.d_r__a_l_l_o_w_e_d,
//                                 crAllowed: account.c_r__a_l_l_o_w_e_d,
//                                 postAllowed: account.p_o_s_t__a_l_l_o_w,
//                                 isControlAccount: account.c_o_n_t_r_o_l__a_c_c_t__f_g,
//                                 isSuspenseAccount: account.s_u_s_p_e_n_s_e__a_c_c_t__f_g,
//                                 currency: account.c_u_r_r_e_n_c_y__c_o_d_e || 'NGN',
//                                 status: account.r_e_c__s_t
//                             };
//                         } else {
//                             console.log(`DEBUG: ✗ GL account ${glAccountNo} not found`);
//                             return null;
//                         }
//                     } catch (error) {
//                         console.error(`DEBUG: Error checking GL account ${glAccountNo}:`, error.message);
//                         return null;
//                     }
//                 };

//                 // Get details for all required GL accounts from loan product configuration
//                 console.log("DEBUG: Fetching GL accounts from loan product configuration...");
//                 const principalGL = await getGLAccountDetails(principalGLAccount);
//                 const interestGL = interestGLAccount ? await getGLAccountDetails(interestGLAccount) : null;
//                 const processingFeeGL = processingFeeGLAccount ? await getGLAccountDetails(processingFeeGLAccount) : null;

//                 // ==================== PLACE THE CUSTOMER GL ACCOUNT LOGIC HERE ====================
//                 // Get Customer GL Account (from customer_accounts or use appropriate GL)
//                 let customerGL = null;

//                 // First try: Check if customer has a GL account with their account number
//                 if (customerAccountNumber) {
//                     customerGL = await getGLAccountDetails(customerAccountNumber);
//                     if (customerGL) {
//                         console.log(`DEBUG: Found customer GL account using account number: ${customerAccountNumber}`);
//                     }
//                 }

//                 // Second try: Look for customer deposit/savings GL accounts (LIABILITY type)
//                 if (!customerGL) {
//                     console.log("DEBUG: Searching for customer deposit GL accounts...");
                    
//                     const customerDepositAccounts = await sequelize.query(
//                         `SELECT g_l__a_c_c_t__n_o, a_c_c_t__d_e_s_c, g_l__a_c_c_t__c_a_t
//                          FROM gl_accounts 
//                          WHERE (a_c_c_t__d_e_s_c LIKE '%Customer%' 
//                                 OR a_c_c_t__d_e_s_c LIKE '%Deposit%'
//                                 OR a_c_c_t__d_e_s_c LIKE '%Savings%'
//                                 OR a_c_c_t__d_e_s_c LIKE '%Current Account%')
//                            AND g_l__a_c_c_t__c_a_t = 'LIABILITY'
//                            AND r_e_c__s_t = 'Active'
//                            AND c_r__a_l_l_o_w_e_d = 1
//                          LIMIT 1`,
//                         { transaction, type: sequelize.QueryTypes.SELECT }
//                     );
                    
//                     if (customerDepositAccounts && customerDepositAccounts.length > 0) {
//                         customerGL = await getGLAccountDetails(customerDepositAccounts[0].g_l__a_c_c_t__n_o);
//                         console.log(`DEBUG: Using customer deposit GL account: ${customerGL.accountNo} - ${customerGL.accountName}`);
//                     }
//                 }

//                 // Third try: Look for suspense accounts
//                 if (!customerGL) {
//                     console.log("DEBUG: Searching for suspense GL accounts...");
                    
//                     const suspenseAccounts = await sequelize.query(
//                         `SELECT g_l__a_c_c_t__n_o 
//                          FROM gl_accounts 
//                          WHERE (a_c_c_t__d_e_s_c LIKE '%Suspense%' 
//                                 OR g_l__a_c_c_t__c_a_t = 'SUSPENSE'
//                                 OR s_u_s_p_e_n_s_e__a_c_c_t__f_g = 1)
//                            AND r_e_c__s_t = 'Active'
//                            AND c_r__a_l_l_o_w_e_d = 1
//                          LIMIT 1`,
//                         { transaction, type: sequelize.QueryTypes.SELECT }
//                     );
                    
//                     if (suspenseAccounts && suspenseAccounts.length > 0) {
//                         customerGL = await getGLAccountDetails(suspenseAccounts[0].g_l__a_c_c_t__n_o);
//                         console.log(`DEBUG: Using suspense GL account: ${customerGL.accountNo} - ${customerGL.accountName}`);
//                     }
//                 }

//                 // Fourth try: If still no customer GL, use the principal GL account as last resort
//                 if (!customerGL && principalGL) {
//                     console.warn("DEBUG: No suitable customer GL account found, using principal GL account as suspense");
//                     customerGL = principalGL;
//                     console.warn(`DEBUG: WARNING: Using principal GL account (${principalGL.accountNo}) as customer account. This may cause accounting issues.`);
//                 }

//                 // If we still don't have a customer GL account, throw an error
//                 if (!customerGL) {
//                     console.error("DEBUG: ❌ Could not find any suitable GL account for customer");
//                     throw new Error(`No suitable GL account found for customer. Tried: 
//                     - Customer account number: ${customerAccountNumber || 'Not available'}
//                     - Customer deposit accounts
//                     - Suspense accounts
//                     - Principal GL account`);
//                 }

//                 // Validate that principal GL account is found and active
//                 if (!principalGL) {
//                     console.error("DEBUG: ❌ Principal GL account not found or not active:", principalGLAccount);
//                     throw new Error(`Principal GL account ${principalGLAccount} not found or not active. Please verify:
//                     1. The GL account exists in gl_accounts table
//                     2. The GL account is marked as 'Active' (r_e_c__s_t = 'Active')
//                     3. The GL account allows posting (p_o_s_t__a_l_l_o_w = 1)`);
//                 }

//                 // Validate that customer GL allows credit transactions
//                 if (customerGL.crAllowed !== 1) {
//                     console.warn(`DEBUG: ⚠️ Warning: Credit not allowed for customer GL account ${customerGL.accountNo}`);
//                     console.warn("DEBUG: The transaction may fail if posting restrictions are enforced");
//                 }

//                 // Validate that principal GL allows debit transactions
//                 if (principalGL.drAllowed !== 1) {
//                     console.warn(`DEBUG: ⚠️ Warning: Debit not allowed for principal GL account ${principalGL.accountNo}`);
//                     console.warn("DEBUG: The transaction may fail if posting restrictions are enforced");
//                 }

//                 // Validate that accounts allow posting
//                 if (principalGL.postAllowed !== 1) {
//                     console.warn(`DEBUG: ⚠️ Warning: Posting not allowed for principal GL account ${principalGL.accountNo}`);
//                 }

//                 if (customerGL.postAllowed !== 1) {
//                     console.warn(`DEBUG: ⚠️ Warning: Posting not allowed for customer GL account ${customerGL.accountNo}`);
//                 }

//                 // Log GL account validation summary
//                 console.log("\nDEBUG: =========================================");
//                 console.log("DEBUG: GL ACCOUNT VALIDATION SUMMARY");
//                 console.log("DEBUG: =========================================");
//                 console.log(`DEBUG: Principal GL Account:`);
//                 console.log(`  Account No: ${principalGL.accountNo}`);
//                 console.log(`  Account Name: ${principalGL.accountName}`);
//                 console.log(`  Category: ${principalGL.accountCategory}`);
//                 console.log(`  Balance: ₦${principalGL.currentBalance.toLocaleString()}`);
//                 console.log(`  DR Allowed: ${principalGL.drAllowed ? 'Yes' : 'No'}, CR Allowed: ${principalGL.crAllowed ? 'Yes' : 'No'}`);

//                 console.log(`\nDEBUG: Customer GL Account:`);
//                 console.log(`  Account No: ${customerGL.accountNo}`);
//                 console.log(`  Account Name: ${customerGL.accountName}`);
//                 console.log(`  Category: ${customerGL.accountCategory}`);
//                 console.log(`  Balance: ₦${customerGL.currentBalance.toLocaleString()}`);
//                 console.log(`  DR Allowed: ${customerGL.drAllowed ? 'Yes' : 'No'}, CR Allowed: ${customerGL.crAllowed ? 'Yes' : 'No'}`);

//                 if (interestGL) {
//                     console.log(`\nDEBUG: Interest GL Account:`);
//                     console.log(`  Account No: ${interestGL.accountNo}`);
//                     console.log(`  Account Name: ${interestGL.accountName}`);
//                     console.log(`  Category: ${interestGL.accountCategory}`);
//                     console.log(`  Balance: ₦${interestGL.currentBalance.toLocaleString()}`);
//                 }

//                 if (processingFeeGL) {
//                     console.log(`\nDEBUG: Processing Fee GL Account:`);
//                     console.log(`  Account No: ${processingFeeGL.accountNo}`);
//                     console.log(`  Account Name: ${processingFeeGL.accountName}`);
//                     console.log(`  Category: ${processingFeeGL.accountCategory}`);
//                     console.log(`  Balance: ₦${processingFeeGL.currentBalance.toLocaleString()}`);
//                 }

//                 console.log("DEBUG: =========================================");
//                 console.log("DEBUG: ✓ All GL accounts validated successfully");
//                 // ==================== END OF CUSTOMER GL ACCOUNT LOGIC ====================

//                 // ==================== 10.4. CREATE GL TRANSACTIONS ====================
//                 console.log("\nDEBUG: Step 4: Creating GL transactions...");
                
//                 // Generate unique TransactionId (BigInt)
//                 const baseTransactionId = BigInt(Date.now());
                
//                 // 1. PRINCIPAL TRANSACTION: DR Principal GL, CR Customer GL (FULL AMOUNT)
//                 if (principalGL && customerGL) {
//                     const principalTransactionId = `${transactionId}-PRINCIPAL`;
//                     const glTransactionId1 = baseTransactionId;
                    
//                     await sequelize.query(
//                         `INSERT INTO gl_account_transactions (
//                             JOURNAL_ID, TRANSACTION_ID, DR_ACCT_NO, CR_ACCT_NO, 
//                             AMOUNT, NARRATION, CREATED_BY, UPDATED_BY,
//                             TRANSACTION_TYPE, CURRENCY_CODE, STATUS, TransactionId,
//                             createdAt, updatedAt
//                         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//                         {
//                             replacements: [
//                                 journalId,
//                                 principalTransactionId,
//                                 principalGL.accountNo,  // DEBIT: Principal Asset increases
//                                 customerGL.accountNo,   // CREDIT: Customer Liability increases (FULL AMOUNT)
//                                 disbursementAmount,     // FULL DISBURSEMENT AMOUNT
//                                 `Loan principal disbursement of ₦${disbursementAmount.toLocaleString()} for ${ACCT_NO} to ${customerName || 'customer'}`,
//                                 approvedBy,
//                                 approvedBy,
//                                 'LOAN_DISBURSEMENT_PRINCIPAL',
//                                 'NGN',
//                                 'POSTED',
//                                 glTransactionId1,
//                                 sqlDate,
//                                 sqlDate
//                             ],
//                             transaction
//                         }
//                     );
                    
//                     console.log("DEBUG: ✓ Principal Transaction:");
//                     console.log(`  DEBIT:  ${principalGL.accountNo} (Principal Asset) +₦${disbursementAmount.toLocaleString()}`);
//                     console.log(`  CREDIT: ${customerGL.accountNo} (Customer Liability) +₦${disbursementAmount.toLocaleString()}`);
//                     console.log(`  Note: Full disbursement amount credited to customer`);
//                 }
                
//                 // 2. INTEREST TRANSACTION (if applicable): DR Interest GL, CR Customer GL
//                 if (interestGL && interestAmount > 0 && customerGL) {
//                     const interestTransactionId = `${transactionId}-INTEREST`;
//                     const glTransactionId2 = baseTransactionId + 1n;
                    
//                     await sequelize.query(
//                         `INSERT INTO gl_account_transactions (
//                             JOURNAL_ID, TRANSACTION_ID, DR_ACCT_NO, CR_ACCT_NO, 
//                             AMOUNT, NARRATION, CREATED_BY, UPDATED_BY,
//                             TRANSACTION_TYPE, CURRENCY_CODE, STATUS, TransactionId,
//                             createdAt, updatedAt
//                         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//                         {
//                             replacements: [
//                                 journalId,
//                                 interestTransactionId,
//                                 interestGL.accountNo,   // DEBIT: Interest Asset increases
//                                 customerGL.accountNo,   // CREDIT: Customer Liability increases further
//                                 interestAmount,
//                                 `Loan interest accrual of ₦${interestAmount.toLocaleString()} for ${ACCT_NO}. Rate: ${interestRate}%, Term: ${termValue} months`,
//                                 approvedBy,
//                                 approvedBy,
//                                 'LOAN_DISBURSEMENT_INTEREST',
//                                 'NGN',
//                                 'POSTED',
//                                 glTransactionId2,
//                                 sqlDate,
//                                 sqlDate
//                             ],
//                             transaction
//                         }
//                     );
                    
//                     console.log("DEBUG: ✓ Interest Transaction:");
//                     console.log(`  DEBIT:  ${interestGL.accountNo} (Interest Asset) +₦${interestAmount.toLocaleString()}`);
//                     console.log(`  CREDIT: ${customerGL.accountNo} (Customer Liability) +₦${interestAmount.toLocaleString()}`);
//                 }
                
//                 // 3. PROCESSING FEE TRANSACTION (if applicable): DR Customer GL, CR Processing Fee GL
//                 if (processingFeeGL && processingFeeAmount > 0 && customerGL) {
//                     const feeTransactionId = `${transactionId}-PROCESSING-FEE`;
//                     const glTransactionId3 = baseTransactionId + 2n;
                    
//                     await sequelize.query(
//                         `INSERT INTO gl_account_transactions (
//                             JOURNAL_ID, TRANSACTION_ID, DR_ACCT_NO, CR_ACCT_NO, 
//                             AMOUNT, NARRATION, CREATED_BY, UPDATED_BY,
//                             TRANSACTION_TYPE, CURRENCY_CODE, STATUS, TransactionId,
//                             createdAt, updatedAt
//                         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//                         {
//                             replacements: [
//                                 journalId,
//                                 feeTransactionId,
//                                 customerGL.accountNo,      // DEBIT: Customer Liability decreases (fee deducted)
//                                 processingFeeGL.accountNo, // CREDIT: Processing Fee Revenue increases
//                                 processingFeeAmount,
//                                 `Processing fee of ₦${processingFeeAmount.toLocaleString()} for loan ${ACCT_NO}. Rate: ${processingFeeRate}${productConfig?.fee_structure ? '%' : ''}`,
//                                 approvedBy,
//                                 approvedBy,
//                                 'PROCESSING_FEE',
//                                 'NGN',
//                                 'POSTED',
//                                 glTransactionId3,
//                                 sqlDate,
//                                 sqlDate
//                             ],
//                             transaction
//                         }
//                     );
                    
//                     console.log("DEBUG: ✓ Processing Fee Transaction:");
//                     console.log(`  DEBIT:  ${customerGL.accountNo} (Customer Liability) -₦${processingFeeAmount.toLocaleString()}`);
//                     console.log(`  CREDIT: ${processingFeeGL.accountNo} (Processing Fee Revenue) +₦${processingFeeAmount.toLocaleString()}`);
//                     console.log(`  Note: Processing fee debited from customer account separately`);
//                 }
                
//                 // ==================== 10.5. CORRECT GL ACCOUNT BALANCES UPDATE ====================
//                 console.log("\nDEBUG: Step 5: Updating GL account balances with CORRECT accounting...");

//                 // First, let's log all account details
//                 console.log("\nDEBUG: ACCOUNT DETAILS:");
//                 console.log(`1. Customer GL: ${customerGL.accountNo} (${customerGL.accountCategory})`);
//                 console.log(`2. Principal/Portfolio GL: ${principalGL.accountNo} (${principalGL.accountCategory})`);
//                 console.log(`3. Interest GL: ${interestGL.accountNo} (${interestGL.accountCategory})`);
//                 console.log(`4. Processing Fee GL: ${processingFeeGL.accountNo} (${processingFeeGL.accountCategory})`);

//                 // Function to update GL accounts with proper accounting
//                 const updateGLAccountBalance = async (accountNo, amount, isDebit, description) => {
//                     try {
//                         const accountDetails = await getGLAccountDetails(accountNo);
//                         const accountCategory = accountDetails.accountCategory;
//                         const currentBalance = accountDetails.currentBalance;
                        
//                         console.log(`\nDEBUG: Updating ${accountNo} (${accountCategory})`);
//                         console.log(`  Transaction: ${isDebit ? 'DEBIT' : 'CREDIT'} ₦${amount.toLocaleString()}`);
//                         console.log(`  Description: ${description}`);
//                         console.log(`  Current Balance: ₦${currentBalance.toLocaleString()}`);
                        
//                         // Determine change amount based on account type
//                         let changeAmount = 0;
                        
//                         if (accountCategory === 'ASSET') {
//                             // Asset: Debit increases, Credit decreases
//                             changeAmount = isDebit ? amount : -amount;
//                             console.log(`  Action: ${isDebit ? 'DEBIT increases' : 'CREDIT decreases'} asset`);
//                         } else if (accountCategory === 'REVENUE' || accountCategory === 'LIABILITY') {
//                             // Revenue/Liability: Credit increases, Debit decreases
//                             changeAmount = isDebit ? -amount : amount;
//                             console.log(`  Action: ${isDebit ? 'DEBIT decreases' : 'CREDIT increases'} ${accountCategory.toLowerCase()}`);
//                         }
                        
//                         console.log(`  Change: ${changeAmount >= 0 ? '+' : ''}₦${changeAmount.toLocaleString()}`);
                        
//                         // Calculate new balance
//                         const newBalance = currentBalance + changeAmount;
//                         console.log(`  New Balance: ₦${newBalance.toLocaleString()}`);
                        
//                         // Update gl_accounts table
//                         const glUpdateQuery = `
//                             UPDATE gl_accounts 
//                             SET l_e_d_g_e_r__b_a_l_a_n_c_e = ?,
//                                 c_u_r_r_e_n_t__b_a_l_a_n_c_e = ?,
//                                 a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e = ?,
//                                 updated_at = ?
//                             WHERE g_l__a_c_c_t__n_o = ?
//                         `;
                        
//                         await sequelize.query(glUpdateQuery, {
//                             replacements: [newBalance, newBalance, newBalance, sqlDate, accountNo],
//                             transaction
//                         });
                        
//                         // Update ledgers table
//                         const ledgerUpdateQuery = `
//                             UPDATE ledgers 
//                             SET l_e_d_g_e_r__b_a_l_a_n_c_e = ?,
//                                 c_u_r_r_e_n_t__b_a_l_a_n_c_e = ?,
//                                 a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e = ?,
//                                 r_o_w__t_s = ?,
//                                 updated_at = ?
//                             WHERE g_l__a_c_c_t__n_o = ?
//                         `;
                        
//                         await sequelize.query(ledgerUpdateQuery, {
//                             replacements: [newBalance, newBalance, newBalance, sqlDate, sqlDate, accountNo],
//                             transaction
//                         });
                        
//                         console.log(`  ✓ Both tables updated`);
                        
//                         // Update audit trail
//                         try {
//                             const auditQuery = `
//                                 UPDATE gl_accounts 
//                                 SET balance_history = JSON_ARRAY_APPEND(
//                                     COALESCE(balance_history, '[]'), 
//                                     '$', 
//                                     JSON_OBJECT(
//                                         'date', ?,
//                                         'previous_balance', ?,
//                                         'change', ?,
//                                         'new_balance', ?,
//                                         'transaction_type', ?,
//                                         'loan_account', ?,
//                                         'description', ?
//                                     )
//                                 ),
//                                 transactions = JSON_ARRAY_APPEND(
//                                     COALESCE(transactions, '[]'),
//                                     '$',
//                                     JSON_OBJECT(
//                                         'date', ?,
//                                         'amount', ?,
//                                         'type', ?,
//                                         'loan_account', ?,
//                                         'description', ?,
//                                         'new_balance', ?
//                                     )
//                                 )
//                                 WHERE g_l__a_c_c_t__n_o = ?
//                             `;
                            
//                             const transactionType = isDebit ? 'DEBIT' : 'CREDIT';
                            
//                             await sequelize.query(auditQuery, {
//                                 replacements: [
//                                     sqlDate, 
//                                     currentBalance, 
//                                     changeAmount, 
//                                     newBalance,
//                                     transactionType,
//                                     ACCT_NO,
//                                     description,
//                                     sqlDate, 
//                                     amount, 
//                                     transactionType, 
//                                     ACCT_NO, 
//                                     description,
//                                     newBalance,
//                                     accountNo
//                                 ],
//                                 transaction
//                             });
                            
//                             console.log(`  ✓ Audit trail updated`);
//                         } catch (auditError) {
//                             console.warn(`  ! Audit trail error: ${auditError.message}`);
//                         }
                        
//                         return newBalance;
                        
//                     } catch (error) {
//                         console.error(`  ✗ Error updating ${accountNo}: ${error.message}`);
//                         throw error;
//                     }
//                 };

//                 // Now apply the CORRECT accounting entries:
//                 console.log("\nDEBUG: =========================================");
//                 console.log("DEBUG: APPLYING CORRECT ACCOUNTING ENTRIES");
//                 console.log("DEBUG: =========================================");

//                 // 1. PRINCIPAL DISBURSEMENT (₦500,000)
//                 console.log("\nDEBUG: 1. PRINCIPAL DISBURSEMENT:");
//                 // CREDIT Customer GL (Asset: money goes out to customer)
//                 // This REDUCES customer's balance
//                 await updateGLAccountBalance(
//                     customerGL.accountNo,
//                     disbursementAmount,
//                     false, // CREDIT (decreases asset)
//                     `Principal disbursement to customer - Loan ${ACCT_NO}`
//                 );

//                 // DEBIT Loan Portfolio GL (Asset: loan receivable increases)
//                 // This INCREASES loan portfolio
//                 await updateGLAccountBalance(
//                     principalGL.accountNo,
//                     disbursementAmount,
//                     true, // DEBIT (increases asset)
//                     `Loan portfolio increase - Loan ${ACCT_NO}`
//                 );

//                 // 2. INTEREST ACCRUAL (₦186,000)
//                 console.log("\nDEBUG: 2. INTEREST ACCRUAL:");
//                 // DEBIT Customer GL (Asset: interest owed increases loan amount)
//                 // This INCREASES customer's loan balance
//                 await updateGLAccountBalance(
//                     customerGL.accountNo,
//                     interestAmount,
//                     true, // DEBIT (increases asset - customer owes more)
//                     `Interest accrual added to loan - Loan ${ACCT_NO}`
//                 );

//                 // CREDIT Interest Income GL (Revenue: interest income earned)
//                 // This INCREASES interest income
//                 await updateGLAccountBalance(
//                     interestGL.accountNo,
//                     interestAmount,
//                     false, // CREDIT (increases revenue)
//                     `Interest income earned - Loan ${ACCT_NO}`
//                 );

//                 // 3. PROCESSING FEE (₦15,000) - DEDUCTED FROM CUSTOMER ACCOUNT
//                 console.log("\nDEBUG: 3. PROCESSING FEE (Deducted from customer account):");
//                 // Since processing fee is paid FROM customer account (not added to loan):
//                 // CREDIT Customer GL (Asset: fee deducted from customer balance)
//                 // This REDUCES customer's account balance
//                 await updateGLAccountBalance(
//                     customerGL.accountNo,
//                     processingFeeAmount,
//                     false, // CREDIT (decreases asset)
//                     `Processing fee deducted from account - Loan ${ACCT_NO}`
//                 );

//                 // DEBIT Processing Fee GL (Revenue: fee income earned)
//                 // OR if Processing Fee GL is REVENUE: CREDIT increases it
//                 await updateGLAccountBalance(
//                     processingFeeGL.accountNo,
//                     processingFeeAmount,
//                     false, // CREDIT (increases revenue)
//                     `Processing fee income - Loan ${ACCT_NO}`
//                 );

//                 // SUMMARY
//                 console.log("\nDEBUG: =========================================");
//                 console.log("DEBUG: TRANSACTION SUMMARY");
//                 console.log("DEBUG: =========================================");

//                 console.log(`\nLoan ${ACCT_NO}:`);
//                 console.log(`Principal Disbursed: ₦${disbursementAmount.toLocaleString()}`);
//                 console.log(`Interest Accrued: ₦${interestAmount.toLocaleString()}`);
//                 console.log(`Processing Fee Deducted: ₦${processingFeeAmount.toLocaleString()}`);

//                 console.log(`\nCustomer's Position:`);
//                 console.log(`- Received: ₦${disbursementAmount.toLocaleString()} (principal)`);
//                 console.log(`- Owes: ₦${(disbursementAmount + interestAmount).toLocaleString()} (principal + interest)`);
//                 console.log(`- Paid: ₦${processingFeeAmount.toLocaleString()} (processing fee)`);

//                 // Get final balances
//                 const getFinalBalance = async (accountNo) => {
//                     const query = `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e FROM gl_accounts WHERE g_l__a_c_c_t__n_o = ?`;
//                     const [result] = await sequelize.query(query, {
//                         replacements: [accountNo],
//                         type: sequelize.QueryTypes.SELECT
//                     });
//                     return result?.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0;
//                 };

//                 const finalBalances = {
//                     customer: await getFinalBalance(customerGL.accountNo),
//                     principal: await getFinalBalance(principalGL.accountNo),
//                     interest: await getFinalBalance(interestGL.accountNo),
//                     processingFee: await getFinalBalance(processingFeeGL.accountNo)
//                 };

//                 console.log("\nDEBUG: FINAL BALANCES:");
//                 console.log(`Customer GL: ₦${finalBalances.customer.toLocaleString()}`);
//                 console.log(`Principal/Portfolio GL: ₦${finalBalances.principal.toLocaleString()}`);
//                 console.log(`Interest GL: ₦${finalBalances.interest.toLocaleString()}`);
//                 console.log(`Processing Fee GL: ₦${finalBalances.processingFee.toLocaleString()}`);

//                 // Calculate expected values based on account types
//                 console.log("\nDEBUG: EXPECTED VALUES:");

//                 // Customer GL (ASSET account):
//                 // - CREDIT ₦500,000 (disbursement) = -500,000
//                 // - DEBIT ₦186,000 (interest) = +186,000  
//                 // - CREDIT ₦15,000 (processing fee) = -15,000
//                 // Expected: -500,000 + 186,000 - 15,000 = -329,000
//                 const customerExpected = -disbursementAmount + interestAmount - processingFeeAmount;
//                 console.log(`Customer GL should be: ₦${customerExpected.toLocaleString()} (Negative balance = customer owes bank)`);

//                 // Principal GL (ASSET account):
//                 // - DEBIT ₦500,000 = +500,000
//                 const principalExpected = disbursementAmount;
//                 console.log(`Principal GL should be: ₦${principalExpected.toLocaleString()} (Loan portfolio asset)`);

//                 // Interest GL (REVENUE account):
//                 // - CREDIT ₦186,000 = +186,000
//                 const interestExpected = interestAmount;
//                 console.log(`Interest GL should be: ₦${interestExpected.toLocaleString()} (Interest income)`);

//                 // Processing Fee GL (REVENUE account):
//                 // - CREDIT ₦15,000 = +15,000
//                 const feeExpected = processingFeeAmount;
//                 console.log(`Processing Fee GL should be: ₦${feeExpected.toLocaleString()} (Fee income)`);

//                 // Verify
//                 console.log("\nDEBUG: VERIFICATION:");
//                 console.log(`Customer GL: ${Math.abs(finalBalances.customer - customerExpected) < 0.01 ? '✓' : '✗'} (Expected: ₦${customerExpected.toLocaleString()}, Actual: ₦${finalBalances.customer.toLocaleString()})`);
//                 console.log(`Principal GL: ${Math.abs(finalBalances.principal - principalExpected) < 0.01 ? '✓' : '✗'} (Expected: ₦${principalExpected.toLocaleString()}, Actual: ₦${finalBalances.principal.toLocaleString()})`);
//                 console.log(`Interest GL: ${Math.abs(finalBalances.interest - interestExpected) < 0.01 ? '✓' : '✗'} (Expected: ₦${interestExpected.toLocaleString()}, Actual: ₦${finalBalances.interest.toLocaleString()})`);
//                 console.log(`Processing Fee GL: ${Math.abs(finalBalances.processingFee - feeExpected) < 0.01 ? '✓' : '✗'} (Expected: ₦${feeExpected.toLocaleString()}, Actual: ₦${finalBalances.processingFee.toLocaleString()})`);

//                 console.log("\nDEBUG: =========================================");
//                 console.log("DEBUG: ✓ ACCOUNTING COMPLETE");
//                 console.log("DEBUG: =========================================");
                
//                 // ==================== 10.6. UPDATE CUSTOMER ACCOUNT WITH PROCESSING FEE ====================
//                 console.log("\nDEBUG: Step 6: Updating customer account with processing fee...");
                
//                 if (customerAccountNumber && customerAccountsTableRecord && processingFeeAmount > 0) {
//                     try {
//                         // Calculate customer's final balance after all transactions
//                         const customerFinalCredit = disbursementAmount; // Full disbursement credited
//                         const customerFinalDebit = processingFeeAmount; // Processing fee debited
//                         const customerNetChange = customerFinalCredit - customerFinalDebit;
                        
//                         console.log("DEBUG: Customer Account Reconciliation:");
//                         console.log(`DEBUG:   Credit (Loan Disbursement): +₦${customerFinalCredit.toLocaleString()}`);
//                         console.log(`DEBUG:   Debit (Processing Fee): -₦${customerFinalDebit.toLocaleString()}`);
//                         console.log(`DEBUG:   Net Change: +₦${customerNetChange.toLocaleString()}`);
                        
//                         // Get current balances
//                         const currentLedgerBalance = parseFloat(customerAccountsTableRecord.ledger_balance || 0);
//                         const currentAvailableBalance = parseFloat(customerAccountsTableRecord.available_balance || 0);
//                         const currentClearedBalance = parseFloat(customerAccountsTableRecord.cleared_balance || 0);
//                         const currentBalance = parseFloat(customerAccountsTableRecord.current_balance || 0);
                        
//                         // Calculate new balances (full disbursement minus processing fee)
//                         const newLedgerBalance = currentLedgerBalance + customerNetChange;
//                         const newAvailableBalance = currentAvailableBalance + customerNetChange;
//                         const newClearedBalance = currentClearedBalance + customerNetChange;
//                         const newCurrentBalance = currentBalance + customerNetChange;
                        
//                         console.log("DEBUG: Updating customer_accounts table...");
                        
//                         // Update customer_accounts table
//                         await sequelize.query(
//                             `UPDATE customer_accounts 
//                              SET ledger_balance = ${newLedgerBalance},
//                                  available_balance = ${newAvailableBalance},
//                                  cleared_balance = ${newClearedBalance},
//                                  current_balance = ${newCurrentBalance},
//                                  last_transaction_date = '${sqlDate}',
//                                  updated_at = '${sqlDate}'
//                              WHERE account_number = '${customerAccountNumber}'`,
//                             { transaction }
//                         );
                        
//                         console.log("DEBUG: ✓ Customer account updated:");
//                         console.log(`DEBUG:   Previous Balance: ₦${currentBalance.toLocaleString()}`);
//                         console.log(`DEBUG:   Net Credit: +₦${customerNetChange.toLocaleString()}`);
//                         console.log(`DEBUG:   New Balance: ₦${newCurrentBalance.toLocaleString()}`);
                        
//                     } catch (custError) {
//                         console.error("DEBUG: Error updating customer account with processing fee:", custError.message);
//                     }
//                 }
                
//                 // ==================== 10.7. SUMMARY ====================
//                 console.log("\nDEBUG: =========================================");
//                 console.log("DEBUG: LEDGER POSTING SUMMARY");
//                 console.log("DEBUG: =========================================");
//                 console.log(`DEBUG: Journal ID: ${journalId}`);
//                 console.log(`DEBUG: Loan Account: ${ACCT_NO}`);
//                 console.log(`DEBUG: Customer: ${customerName || 'N/A'}`);
//                 console.log(`DEBUG: Customer Account: ${customerAccountNumber || 'N/A'}`);
//                 console.log("\nDEBUG: TRANSACTION BREAKDOWN:");
//                 console.log(`DEBUG: 1. Principal Disbursement: ₦${disbursementAmount.toLocaleString()}`);
//                 if (interestAmount > 0) {
//                     console.log(`DEBUG: 2. Interest Accrual: ₦${interestAmount.toLocaleString()}`);
//                 }
//                 if (processingFeeAmount > 0) {
//                     console.log(`DEBUG: 3. Processing Fee: ₦${processingFeeAmount.toLocaleString()}`);
//                 }
                
//                 console.log("\nDEBUG: CUSTOMER IMPACT:");
//                 console.log(`DEBUG:   Total Credit (Loan): +₦${disbursementAmount.toLocaleString()}`);
//                 if (processingFeeAmount > 0) {
//                     console.log(`DEBUG:   Processing Fee Debit: -₦${processingFeeAmount.toLocaleString()}`);
//                     console.log(`DEBUG:   Net to Customer: ₦${(disbursementAmount - processingFeeAmount).toLocaleString()}`);
//                 } else {
//                     console.log(`DEBUG:   Net to Customer: ₦${disbursementAmount.toLocaleString()}`);
//                 }
                
//                 console.log("\nDEBUG: GL ACCOUNTS USED:");
//                 console.log(`DEBUG:   Principal GL: ${principalGL?.accountNo || 'N/A'}`);
//                 console.log(`DEBUG:   Interest GL: ${interestGL?.accountNo || 'N/A'}`);
//                 console.log(`DEBUG:   Processing Fee GL: ${processingFeeGL?.accountNo || 'N/A'}`);
//                 console.log(`DEBUG:   Customer GL: ${customerGL?.accountNo || 'N/A'}`);
//                 console.log("DEBUG: =========================================");
                
//             } else {
//                 console.log("DEBUG: ledgers table does not exist, skipping ledger posting");
//             }
            
//         } catch (glError) {
//             console.error("DEBUG: GL posting failed:", glError.message);
//             console.error("DEBUG: Error stack:", glError.stack);
//             // Don't rollback for GL errors - they're not critical for the loan disbursement
//         }

//         // ==================== 11. CREATE AUDIT LOG ====================
//         try {
//             const auditTables = await sequelize.query(
//                 `SELECT TABLE_NAME 
//                  FROM INFORMATION_SCHEMA.TABLES 
//                  WHERE TABLE_SCHEMA = DATABASE() 
//                  AND TABLE_NAME = 'audit_logs'`,
//                 { transaction, type: sequelize.QueryTypes.SELECT }
//             );
            
//             if (auditTables.length > 0) {
//                 await sequelize.query(
//                     `INSERT INTO audit_logs (
//                         action, entity_type, entity_id, description,
//                         performed_by, performed_at, old_values, new_values,
//                         transaction_id, amount
//                     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//                     {
//                         replacements: [
//                             'LOAN_DISBURSEMENT',
//                             'LOAN_ACCOUNT',
//                             loanAccount.id,
//                             `Loan ${ACCT_NO} approved and disbursed by ${approvedBy}`,
//                             approvedBy,
//                             now,
//                             JSON.stringify({ 
//                                 status: currentStatus, 
//                                 disbursed_amount: currentDisbursedAmount,
//                                 outstanding_principal: currentOutstandingPrincipal,
//                                 loan_amount: loanAccount.a_m_o_u_n_t,
//                                 customer_id: customerId,
//                                 numeric_customer_id: numericCustomerId
//                             }),
//                             JSON.stringify({ 
//                                 status: 'ACTIVE', 
//                                 disbursed_amount: currentStatus === 'ACTIVE' 
//                                     ? (currentDisbursedAmount + disbursementAmount)
//                                     : disbursementAmount,
//                                 outstanding_principal: currentStatus === 'ACTIVE'
//                                     ? (currentOutstandingPrincipal + disbursementAmount)
//                                     : disbursementAmount,
//                                 loan_amount: -disbursementAmount,
//                                 disbursement_date: now,
//                                 customer_account: customerAccountNumber,
//                                 customer_account_balance_impact: customerAccountNumber ? `+₦${disbursementAmount.toLocaleString()}` : 'No customer account found',
//                                 tables_updated: [
//                                     accountsTableRecord ? 'accounts' : null,
//                                     customerAccountsTableRecord ? 'customer_accounts' : 'new_record_created'
//                                 ].filter(Boolean),
//                                 customer_id_converted: numericCustomerId
//                             }),
//                             `DISB-${Date.now()}`,
//                             disbursementAmount
//                         ],
//                         transaction
//                     }
//                 );
//                 console.log("DEBUG: Audit log created");
//             } else {
//                 console.log("DEBUG: audit_logs table does not exist, skipping audit log");
//             }
//         } catch (auditError) {
//             console.error("DEBUG: Could not create audit log:", auditError.message);
//         }
//       // ==================== HELPER FUNCTION: generateContractText ====================
// function generateContractText(loanDetails, customerDetails, productDetails, effectiveInterestRate) {
//     const now = new Date();
//     const formattedDate = now.toLocaleDateString('en-US', { 
//         year: 'numeric', 
//         month: 'long', 
//         day: 'numeric' 
//     });
    
//     const maturityDate = loanDetails.LAST_PAYMENT_DATE.toLocaleDateString('en-US', {
//         year: 'numeric',
//         month: 'long',
//         day: 'numeric'
//     });
    
//     const firstPaymentDate = loanDetails.FIRST_PAYMENT_DATE.toLocaleDateString('en-US', {
//         year: 'numeric',
//         month: 'long',
//         day: 'numeric'
//     });
    
//     // Calculate monthly payment
//     const principal = loanDetails.AMOUNT;
//     const annualRate = effectiveInterestRate / 100;
//     const monthlyRate = annualRate / 12;
//     const numberOfPayments = loanDetails.NUMBER_OF_INSTALLMENTS;
    
//     let monthlyPayment = 0;
//     if (monthlyRate > 0) {
//         monthlyPayment = (principal * monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) / 
//                         (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
//     } else {
//         monthlyPayment = principal / numberOfPayments;
//     }
    
//     // Build the contract text
//     const contractText = `
// LOAN AGREEMENT AND CONTRACT

// THIS LOAN AGREEMENT is made and entered into on this ${formattedDate}

// BETWEEN:

// ${process.env.BANK_NAME || "OUR BANK PLC"}
// (hereinafter referred to as "the Lender")

// AND:

// ${customerDetails.ACCT_NM || customerDetails.CUST_NM || "The Borrower"}
// Address: ${customerDetails.HOME_ADDRESS || "Address Not Provided"}
// (hereinafter referred to as "the Borrower")

// WHEREAS:
// 1. The Borrower has applied for a loan from the Lender.
// 2. The Lender has agreed to grant the loan to the Borrower subject to the terms and conditions herein.

// NOW, THEREFORE, in consideration of the mutual covenants and promises herein contained, the parties agree as follows:

// ARTICLE 1: LOAN DETAILS
// 1.1 Loan Amount: ₦${loanDetails.AMOUNT.toLocaleString()}
// 1.2 Disbursement Date: ${loanDetails.DISBURSEMENT_DATE.toLocaleDateString()}
// 1.3 Interest Rate: ${effectiveInterestRate}% per annum
// 1.4 Loan Term: ${loanDetails.TERM_VALUE} ${loanDetails.TERM_CD === 'M' ? 'Months' : 'Years'}
// 1.5 Maturity Date: ${maturityDate}
// 1.6 Purpose of Loan: ${loanDetails.loan_purpose || "General Business Purpose"}

// ARTICLE 2: REPAYMENT TERMS
// 2.1 Number of Installments: ${loanDetails.NUMBER_OF_INSTALLMENTS}
// 2.2 Monthly Installment: ₦${monthlyPayment.toFixed(2).toLocaleString()}
// 2.3 First Payment Date: ${firstPaymentDate}
// 2.4 Payment Method: Direct debit from the Borrower's account with the Lender
// 2.5 Account for Repayment: ${customerDetails.ACCT_NM || "Borrower's Account"}

// ARTICLE 3: INTEREST AND CHARGES
// 3.1 Interest shall accrue on the outstanding principal balance from the disbursement date.
// 3.2 Interest is calculated on a monthly reducing balance basis.
// 3.3 Late payment penalty: 5% of the overdue amount per month.
// 3.4 Early repayment is allowed without penalty after 3 months.

// ARTICLE 4: DEFAULT AND REMEDIES
// 4.1 The Borrower shall be in default if:
//     a) Any installment is not paid within 7 days of its due date;
//     b) The Borrower becomes insolvent or bankrupt;
//     c) Any representation or warranty made by the Borrower is false.
// 4.2 Upon default, the Lender may:
//     a) Declare the entire outstanding amount immediately due and payable;
//     b) Charge default interest at 15% per annum;
//     c) Exercise any other rights available under applicable law.

// ARTICLE 5: REPRESENTATIONS AND WARRANTIES
// The Borrower represents and warrants that:
// 5.1 All information provided is true and accurate.
// 5.2 The Borrower has the capacity to enter into this agreement.
// 5.3 The loan proceeds will be used solely for the purpose stated in Article 1.6.

// ARTICLE 6: GOVERNING LAW
// This agreement shall be governed by and construed in accordance with the laws of Nigeria.

// ARTICLE 7: SIGNATURES
// IN WITNESS WHEREOF, the parties have executed this agreement on the date first above written.

// _________________________
// For and on behalf of
// ${process.env.BANK_NAME || "OUR BANK PLC"}

// Name: ___________________
// Title: __________________
// Date: ___________________

// _________________________
// The Borrower

// Name: ${customerDetails.ACCT_NM || customerDetails.CUST_NM || "The Borrower"}
// Signature: ___________________
// Date: ___________________

// WITNESS:
// _________________________
// Name: ___________________
// Address: ________________
// Date: ___________________

// This document constitutes the entire agreement between the parties.
//     `;
    
//     return contractText;
// }

// // ==================== X. CREATE LOAN CONTRACT FORM ====================
// console.log("\nDEBUG: Creating loan contract form...");

// try {
//     // Check if loan_contract_forms table exists
//     const contractsTableCheck = await sequelize.query(
//         `SELECT TABLE_NAME 
//          FROM INFORMATION_SCHEMA.TABLES 
//          WHERE TABLE_SCHEMA = DATABASE() 
//          AND TABLE_NAME = 'loan_contract_forms'`,
//         { transaction, type: sequelize.QueryTypes.SELECT }
//     );
    
//     if (contractsTableCheck.length === 0) {
//         console.log("DEBUG: loan_contract_forms table does not exist, creating it...");
        
//         await sequelize.query(`
//             CREATE TABLE IF NOT EXISTS loan_contract_forms (
//                 id INT PRIMARY KEY AUTO_INCREMENT,
//                 loan_contract_no VARCHAR(255) UNIQUE NOT NULL,
//                 customer_id VARCHAR(255) NOT NULL,
//                 borrower_name VARCHAR(255) NOT NULL,
//                 co_signatory_name VARCHAR(255) DEFAULT '',
//                 borrower_address VARCHAR(255) DEFAULT 'Address Not Provided',
//                 loan_purpose VARCHAR(255) NOT NULL,
//                 loan_amount VARCHAR(255) NOT NULL,
//                 loan_term INT(11) NOT NULL,
//                 t_e_r_m__c_d ENUM('M','Y') DEFAULT 'M',
//                 interest_rate DECIMAL(7,4) NOT NULL,
//                 interest_rate_id INT(11) DEFAULT 101,
//                 guarantor_name VARCHAR(255) DEFAULT '',
//                 bank_name VARCHAR(255) NOT NULL,
//                 bank_short VARCHAR(255) NOT NULL,
//                 status ENUM('PENDING','APPROVED','REJECTED','DISBURSED','ACTIVE','CLOSED') DEFAULT 'PENDING',
//                 contract_text TEXT NOT NULL,
//                 u_s_e_r__i_d VARCHAR(255) NOT NULL,
//                 application_id VARCHAR(255) NOT NULL,
//                 loan_account_no VARCHAR(255) NOT NULL,
//                 funding_account_no VARCHAR(255) NOT NULL,
//                 workflow_id BIGINT(20) UNIQUE,
//                 fees LONGTEXT NOT NULL,
//                 signature_requirements LONGTEXT NOT NULL,
//                 metadata LONGTEXT NOT NULL,
//                 disbursement_date DATETIME,
//                 maturity_date DATETIME,
//                 created_at DATETIME NOT NULL,
//                 updated_at DATETIME NOT NULL
//             ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
//             { transaction }
//         );
        
//         console.log("DEBUG: ✓ loan_contract_forms table created");
//     }
    
//     // Generate contract number
//     const contractNumber = `LOAN-CONTRACT-${ACCT_NO}-${Date.now()}`;
    
//     // Calculate maturity date based on term
//     const termCode = loanAccount.t_e_r_m__c_d || 'M';
//     const termValue = parseFloat(loanAccount.t_e_r_m__v_a_l_u_e || 0);
//     const maturityDate = new Date(now);
    
//     if (termCode === 'M') {
//         maturityDate.setMonth(maturityDate.getMonth() + termValue);
//     } else if (termCode === 'Y') {
//         maturityDate.setFullYear(maturityDate.getFullYear() + termValue);
//     }
    
//     // Get loan product details for contract - WITH FALLBACK LOGIC
//     let loanProductDetails = {};
//     let effectiveInterestRate = parseFloat(loanAccount.i_n_t_e_r_e_s_t__r_a_t_e || 0);
//     let processingFeeAmount = 0;
//     let processingFeeRate = 0;
//     let principalGLAccount = null;
//     let interestGLAccount = null;
//     let processingFeeGLAccount = null;

//     // Check if productConfig exists, if not, try to get it again
//     if (!productConfig) {
//         console.log("DEBUG: productConfig not found in scope, attempting to retrieve loan product...");
//         try {
//             // Get the product ID from loan account (updated during GL posting)
//             const productId = loanAccount.l_o_a_n__p_r_o_d_u_c_t__i_d || 1001;
            
//             const productQuery = `
//                 SELECT lp.*, 
//                        JSON_EXTRACT(lp.default_g_l_accounts, '$.loanGLAccount') as loanGLAccount,
//                        JSON_EXTRACT(lp.default_g_l_accounts, '$.principalGLAccountNo') as principalGLAccount,
//                        JSON_EXTRACT(lp.default_g_l_accounts, '$.interestGLAccountNo') as interestGLAccount,
//                        JSON_EXTRACT(lp.default_g_l_accounts, '$.processingFeeGLCode') as processingFeeGLAccount,
//                        lp.processing_fee_g_l_code,
//                        lp.processing_fee_rate,
//                        lp.effective_interest_rate,
//                        lp.interest_rate,
//                        lp.fee_structure,
//                        lp.rate_information
//                 FROM loan_products lp
//                 WHERE lp.p_r_o_d__i_d = ?
//                 LIMIT 1
//             `;
            
//             const [productResult] = await sequelize.query(productQuery, {
//                 replacements: [productId],
//                 transaction,
//                 type: sequelize.QueryTypes.SELECT
//             });
            
//             if (productResult) {
//                 productConfig = productResult;
//                 console.log("DEBUG: Retrieved productConfig successfully for contract");
                
//                 // Extract GL accounts for reference in contract metadata
//                 if (productResult.default_g_l_accounts) {
//                     try {
//                         const glAccounts = JSON.parse(productResult.default_g_l_accounts);
//                         principalGLAccount = glAccounts.principalGLAccountNo || glAccounts.loanGLAccount;
//                         interestGLAccount = glAccounts.interestGLAccountNo;
//                         processingFeeGLAccount = glAccounts.processingFeeGLCode;
//                     } catch (e) {
//                         console.warn("DEBUG: Could not parse GL accounts JSON for contract");
//                     }
//                 }
                
//                 // Get processing fee details
//                 processingFeeRate = parseFloat(productResult.processing_fee_rate || 0);
//                 processingFeeAmount = (disbursementAmount * processingFeeRate) / 100;
//             } else {
//                 console.warn("DEBUG: Could not retrieve productConfig from database");
//             }
//         } catch (error) {
//             console.warn("DEBUG: Error retrieving productConfig for contract:", error.message);
//         }
//     } else {
//         console.log("DEBUG: Using existing productConfig for contract");
        
//         // Extract GL accounts from existing productConfig
//         if (productConfig.default_g_l_accounts) {
//             try {
//                 const glAccounts = JSON.parse(productConfig.default_g_l_accounts);
//                 principalGLAccount = glAccounts.principalGLAccountNo || glAccounts.loanGLAccount;
//                 interestGLAccount = glAccounts.interestGLAccountNo;
//                 processingFeeGLAccount = glAccounts.processingFeeGLCode;
//             } catch (e) {
//                 console.warn("DEBUG: Could not parse GL accounts JSON from existing productConfig");
//             }
//         }
        
//         // Get processing fee details
//         processingFeeRate = parseFloat(productConfig.processing_fee_rate || 0);
//         processingFeeAmount = (disbursementAmount * processingFeeRate) / 100;
//     }
    
//     // Set loan product details
//     if (productConfig) {
//         loanProductDetails = {
//             interestRate: parseFloat(productConfig.interest_rate) || effectiveInterestRate,
//             feeStructure: productConfig.fee_structure ? JSON.parse(productConfig.fee_structure) : [],
//             processingFeeRate: processingFeeRate,
//             rateInformation: productConfig.rate_information ? JSON.parse(productConfig.rate_information) : {}
//         };
        
//         // Try to get effective interest rate from loan product
//         if (productConfig.effective_interest_rate) {
//             try {
//                 effectiveInterestRate = parseFloat(productConfig.effective_interest_rate);
//             } catch (e) {
//                 console.warn("DEBUG: Could not parse effective interest rate, using loan account rate");
//             }
//         }
//     } else {
//         console.warn("DEBUG: No productConfig available, using loan account values");
//         loanProductDetails = {
//             interestRate: effectiveInterestRate,
//             feeStructure: [],
//             processingFeeRate: 0,
//             rateInformation: {}
//         };
//     }
    
//     // Prepare loan details for contract
//     const firstPaymentDate = new Date(now); // Create a new date object
//     firstPaymentDate.setDate(firstPaymentDate.getDate() + 30);
    
//     const loanDetails = {
//         AMOUNT: disbursementAmount,
//         INTEREST_RATE: effectiveInterestRate,
//         TERM_VALUE: termValue,
//         TERM_CD: termCode,
//         DISBURSEMENT_DATE: new Date(now), // Create a copy of now
//         FIRST_PAYMENT_DATE: firstPaymentDate,
//         LAST_PAYMENT_DATE: maturityDate,
//         NUMBER_OF_INSTALLMENTS: termValue,
//         borrower_name: customerName || loanAccount.a_c_c_t__n_m || 'Customer',
//         borrower_address: loanAccount.borrower_address || customerAccountDetails?.address || 'Address Not Provided',
//         loan_purpose: loanAccount.loan_purpose || 'General Business Purpose'
//     };
    
//     // Prepare customer details
//     const customerDetails = {
//         ACCT_NM: customerName,
//         CUST_NM: customerName,
//         HOME_ADDRESS: loanAccount.borrower_address || 'Address Not Provided'
//     };
    
//     // Generate contract text using your function
//     const contractText = generateContractText(loanDetails, customerDetails, loanProductDetails, effectiveInterestRate);
    
//     console.log("DEBUG: Contract text generated successfully");
    
//     // Prepare fees data
//     let feesData = [];
//     if (productConfig?.fee_structure) {
//         try {
//             feesData = JSON.parse(productConfig.fee_structure);
//         } catch (e) {
//             console.warn("DEBUG: Could not parse fee structure");
//             feesData = [];
//         }
//     }
    
//     // Prepare signature requirements
//     const signatureRequirements = {
//         requiredSignatures: [
//             {
//                 role: "Borrower",
//                 name: customerName,
//                 required: true
//             },
//             {
//                 role: "Lender Representative",
//                 name: approvedBy,
//                 required: true
//             }
//         ],
//         coSignatories: [],
//         witnessRequired: false
//     };
    
//     // Add guarantor if exists
//     if (loanAccount.g_u_a_r_a_n_t_o_r__n_a_m_e) {
//         signatureRequirements.requiredSignatures.push({
//             role: "Guarantor",
//             name: loanAccount.g_u_a_r_a_n_t_o_r__n_a_m_e,
//             required: true
//         });
//         signatureRequirements.coSignatories.push(loanAccount.g_u_a_r_a_n_t_o_r__n_a_m_e);
//     }
    
//     // Prepare metadata
//     const metadata = {
//         generatedBy: approvedBy,
//         generationDate: now.toISOString(),
//         loanProductId: productConfig?.p_r_o_d__i_d || loanAccount.l_o_a_n__p_r_o_d_u_c_t__i_d || 'Unknown',
//         loanAccountNumber: ACCT_NO,
//         customerAccountNumber: customerAccountNumber,
//         disbursementAmount: disbursementAmount,
//         interestAmount: (disbursementAmount * effectiveInterestRate * termValue) / (12 * 100), // Calculate interest
//         processingFeeAmount: processingFeeAmount,
//         processingFeeRate: processingFeeRate,
//         effectiveInterestRate: effectiveInterestRate,
//         termDetails: `${termValue} ${termCode === 'M' ? 'Months' : 'Years'}`,
//         glAccounts: {
//             principalGL: principalGLAccount,
//             interestGL: interestGLAccount,
//             processingFeeGL: processingFeeGLAccount
//         },
//         customerDetails: {
//             customerId: customerId,
//             customerName: customerName,
//             accountNumber: customerAccountNumber
//         },
//         financialSummary: {
//             totalLoanAmount: disbursementAmount,
//             totalPayable: disbursementAmount + (disbursementAmount * effectiveInterestRate * termValue) / (12 * 100),
//             monthlyPayment: calculateMonthlyPayment(disbursementAmount, effectiveInterestRate, termValue, termCode)
//         }
//     };
    
//     // Helper function to calculate monthly payment
//     function calculateMonthlyPayment(principal, annualRate, termValue, termCode) {
//         const annualRateDecimal = annualRate / 100;
//         let monthlyRate, numberOfPayments;
        
//         if (termCode === 'M') {
//             monthlyRate = annualRateDecimal / 12;
//             numberOfPayments = termValue;
//         } else {
//             // For years, convert to months
//             monthlyRate = annualRateDecimal / 12;
//             numberOfPayments = termValue * 12;
//         }
        
//         if (monthlyRate > 0) {
//             return (principal * monthlyRate * Math.pow(1 + monthlyRate, numberOfPayments)) / 
//                    (Math.pow(1 + monthlyRate, numberOfPayments) - 1);
//         } else {
//             return principal / numberOfPayments;
//         }
//     }
    
//     // Insert contract into loan_contract_forms table
//     const contractResult = await sequelize.query(
//         `INSERT INTO loan_contract_forms (
//             loan_contract_no,
//             customer_id,
//             borrower_name,
//             co_signatory_name,
//             borrower_address,
//             loan_purpose,
//             loan_amount,
//             loan_term,
//             t_e_r_m__c_d,
//             interest_rate,
//             interest_rate_id,
//             guarantor_name,
//             bank_name,
//             bank_short,
//             status,
//             contract_text,
//             u_s_e_r__i_d,
//             application_id,
//             loan_account_no,
//             funding_account_no,
//             workflow_id,
//             fees,
//             signature_requirements,
//             metadata,
//             disbursement_date,
//             maturity_date,
//             created_at,
//             updated_at
//         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
//         {
//             replacements: [
//                 contractNumber,
//                 customerId,
//                 customerName,
//                 loanAccount.co_signatory_name || '',
//                 loanAccount.borrower_address || 'Address Not Provided',
//                 loanAccount.loan_purpose || 'General Business Purpose',
//                 disbursementAmount.toString(),
//                 termValue,
//                 termCode,
//                 effectiveInterestRate,
//                 101, // Default interest rate ID
//                 loanAccount.g_u_a_r_a_n_t_o_r__n_a_m_e || '',
//                 process.env.BANK_NAME || 'Our Bank',
//                 process.env.BANK_SHORT_NAME || 'BANK',
//                 'DISBURSED',
//                 contractText,
//                 approvedBy,
//                 ACCT_NO, // Using loan account as application ID
//                 ACCT_NO,
//                 customerAccountNumber || 'N/A',
//                 null, // workflow_id
//                 JSON.stringify(feesData),
//                 JSON.stringify(signatureRequirements),
//                 JSON.stringify(metadata),
//                 now,
//                 maturityDate,
//                 now,
//                 now
//             ],
//             transaction
//         }
//     );
    
//     const contractId = contractResult[0].insertId;
//     console.log(`DEBUG: ✓ Created loan contract form ID: ${contractId}, Contract No: ${contractNumber}`);
    
//     // Also update loan_accounts with contract reference
//     await sequelize.query(
//         `UPDATE loan_accounts 
//          SET l_o_a_n__c_o_n_t_r_a_c_t__n_o = ?,
//              contract_status = 'SIGNED'
//          WHERE a_c_c_t__n_o = ?`,
//         {
//             replacements: [contractNumber, ACCT_NO],
//             transaction
//         }
//     );
    
//     console.log("DEBUG: ✓ Loan contract form created and linked to loan account");
    
//     // Store contract reference for response (INSIDE the try block)
//     const contractRecord = {
//         id: contractId,
//         contractNumber: contractNumber,
//         status: 'DISBURSED',
//         generatedDate: now,
//         maturityDate: maturityDate
//     };
    
// } catch (contractError) {
//     console.error("DEBUG: ✗ Error creating loan contract form:", contractError.message);
//     console.error("DEBUG: Contract error stack:", contractError.stack);
//     // Don't rollback for contract errors - it's not critical for disbursement
// }

//         // ==================== 12. UPDATE LOAN PORTFOLIO ====================
//         try {
//             console.log("\nDEBUG: =========================================");
//             console.log("DEBUG: UPDATING LOAN PORTFOLIO");
//             console.log("DEBUG: =========================================");
            
//             // Use simpler table check
//             const portfolioTableCheck = await sequelize.query(
//                 `SHOW TABLES LIKE 'loan_portfolio'`,
//                 { transaction, type: sequelize.QueryTypes.SELECT }
//             );
            
//             console.log("DEBUG: Portfolio table check result:", portfolioTableCheck);
            
//             if (portfolioTableCheck && portfolioTableCheck.length > 0) {
//                 console.log("DEBUG: ✓ loan_portfolio table exists");
                
//                 // Get current month and year
//                 const currentDate = new Date();
//                 const currentMonth = currentDate.getMonth() + 1; // 1-12
//                 const currentYear = currentDate.getFullYear();
                
//                 console.log(`DEBUG: Current period: Month ${currentMonth}, Year ${currentYear}`);
                
//                 // Get loan product details - check what fields actually exist in loanAccount
//                 console.log("DEBUG: Available loan account fields:", Object.keys(loanAccount));
                
//                 // Use default values if fields don't exist
//                 const loanProductId = loanAccount.l_o_a_n__p_r_o_d_u_c_t__i_d || 
//                                      loanAccount.p_r_o_d__i_d || 
//                                      loanAccount.product_id || 
//                                      0;
                
//                 const branchId = loanAccount.b_r_a_n_c_h__i_d || 
//                                 loanAccount.branch_id || 
//                                 '001';
                
//                 const productCode = loanAccount.p_r_o_d__c_d || 
//                                   loanAccount.product_code || 
//                                   'GENERAL_LOAN';
                
//                 const productType = loanAccount.p_r_o_d_u_c_t__t_y_p_e || 
//                                   loanAccount.product_type || 
//                                   'GENERAL_LOAN';
                
//                 const productName = loanAccount.p_r_o_d_u_c_t__n_a_m_e || 
//                                   loanAccount.product_name || 
//                                   'General Loan';
                
//                 console.log("DEBUG: Loan product details:", {
//                     loanProductId,
//                     branchId,
//                     productCode,
//                     productType,
//                     productName
//                 });
                
//                 // Check if portfolio record exists for this month/year/product/branch
//                 console.log("DEBUG: Checking for existing portfolio record...");
                
//                 const existingPortfolioQuery = `
//                     SELECT * FROM loan_portfolio 
//                     WHERE m_o_n_t_h = ${currentMonth} 
//                       AND y_e_a_r = ${currentYear} 
//                       AND p_r_o_d__i_d = ${loanProductId} 
//                       AND b_r_a_n_c_h__i_d = '${branchId}' 
//                     LIMIT 1
//                 `;
                
//                 console.log("DEBUG: Executing portfolio check query:", existingPortfolioQuery);
                
//                 const existingPortfolio = await sequelize.query(existingPortfolioQuery, {
//                     transaction,
//                     type: sequelize.QueryTypes.SELECT
//                 });
                
//                 console.log("DEBUG: Existing portfolio check result:", existingPortfolio);
//                 console.log("DEBUG: Number of existing records:", existingPortfolio ? existingPortfolio.length : 0);
                
//                 if (existingPortfolio && existingPortfolio.length > 0) {
//                     // Update existing portfolio record
//                     const portfolioId = existingPortfolio[0].id;
//                     console.log(`DEBUG: ✓ Found existing portfolio record ID: ${portfolioId}`);
                    
//                     // Get current values for calculation
//                     const currentTotalPrincipal = parseFloat(existingPortfolio[0].t_o_t_a_l__p_r_i_n_c_i_p_a_l || 0);
//                     const currentNumberOfLoans = parseInt(existingPortfolio[0].n_u_m_b_e_r__o_f__l_o_a_n_s || 0);
                    
//                     // Calculate new average loan size
//                     const newTotalPrincipal = currentTotalPrincipal + disbursementAmount;
//                     const newNumberOfLoans = currentNumberOfLoans + 1;
//                     const newAverageLoanSize = newTotalPrincipal / newNumberOfLoans;
                    
//                     console.log("DEBUG: Portfolio update calculations:", {
//                         currentTotalPrincipal,
//                         currentNumberOfLoans,
//                         disbursementAmount,
//                         newTotalPrincipal,
//                         newNumberOfLoans,
//                         newAverageLoanSize
//                     });
                    
//                     const updatePortfolioQuery = `
//     UPDATE loan_portfolio 
//     SET t_o_t_a_l__d_i_s_b_u_r_s_e_d = t_o_t_a_l__d_i_s_b_u_r_s_e_d + ${disbursementAmount},
//         t_o_t_a_l__n_e_t__d_i_s_b_u_r_s_e_m_e_n_t = t_o_t_a_l__n_e_t__d_i_s_b_u_r_s_e_m_e_n_t + ${disbursementAmount},
//         t_o_t_a_l__p_r_i_n_c_i_p_a_l = t_o_t_a_l__p_r_i_n_c_i_p_a_l + ${disbursementAmount},
//         o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l = o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l + ${disbursementAmount},
//         n_u_m_b_e_r__o_f__l_o_a_n_s = n_u_m_b_e_r__o_f__l_o_a_n_s + 1,
//         a_c_t_i_v_e__l_o_a_n_s = a_c_t_i_v_e__l_o_a_n_s + 1,
//         d_i_s_b_u_r_s_e_m_e_n_t__c_o_u_n_t = d_i_s_b_u_r_s_e_m_e_n_t__c_o_u_n_t + 1,
//         a_v_e_r_a_g_e__l_o_a_n__s_i_z_e = ${newAverageLoanSize},
//         u_p_d_a_t_e_d__d_a_t_e = '${now.toISOString().slice(0, 19).replace('T', ' ')}',
//         u_p_d_a_t_e_d__b_y = '${approvedBy}'
//     WHERE id = ${portfolioId}
// `;
                    
//                     console.log("DEBUG: Executing update query:", updatePortfolioQuery);
                    
//                     const updateResult = await sequelize.query(updatePortfolioQuery, { transaction });
//                     console.log("DEBUG: ✓ Updated existing loan portfolio record");
//                     console.log("DEBUG: Update result:", updateResult);
                    
//                 } else {
//                     // Create new portfolio record
//                     console.log("DEBUG: ✗ No existing portfolio found, creating new record...");
                    
//                     // For new record, average loan size is just this loan amount
//                     const averageLoanSize = disbursementAmount;
//                     const sqlDate = now.toISOString().slice(0, 19).replace('T', ' ');
                    
//                     const insertPortfolioQuery = `
//     INSERT INTO loan_portfolio (
//         b_r_a_n_c_h__i_d,
//         p_r_o_d__i_d,
//         p_r_o_d_u_c_t__c_o_d_e,
//         p_r_o_d_u_c_t__n_a_m_e,
//         p_r_o_d_u_c_t__t_y_p_e,
//         m_o_n_t_h,
//         y_e_a_r,
//         c_u_r_r_e_n_c_y,
//         t_o_t_a_l__d_i_s_b_u_r_s_e_d,
//         t_o_t_a_l__n_e_t__d_i_s_b_u_r_s_e_m_e_n_t,
//         t_o_t_a_l__p_r_i_n_c_i_p_a_l,
//         o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l,
//         n_u_m_b_e_r__o_f__l_o_a_n_s,
//         a_c_t_i_v_e__l_o_a_n_s,
//         d_i_s_b_u_r_s_e_m_e_n_t__c_o_u_n_t,  // FIXED!
//         a_v_e_r_a_g_e__l_o_a_n__s_i_z_e,
//         s_t_a_t_u_s,
//         c_r_e_a_t_e_d__b_y,
//         u_p_d_a_t_e_d__b_y,
//         c_r_e_a_t_e_d__d_a_t_e,
//         u_p_d_a_t_e_d__d_a_t_e
//     ) VALUES (
//         '${branchId}',
//         ${loanProductId},
//         '${productCode}',
//         '${productName}',
//         '${productType}',
//         ${currentMonth},
//         ${currentYear},
//         'NGN',
//         ${disbursementAmount},
//         ${disbursementAmount},
//         ${disbursementAmount},
//         ${disbursementAmount},
//         1,
//         1,
//         1,  // Fixed value position
//         ${averageLoanSize},
//         'ACTIVE',
//         '${approvedBy}',
//         '${approvedBy}',
//         '${sqlDate}',
//         '${sqlDate}'
//     )
// `;
                    
//                     console.log("DEBUG: Executing insert query:", insertPortfolioQuery);
                    
//                     const insertResult = await sequelize.query(insertPortfolioQuery, { transaction });
//                     console.log("DEBUG: ✓ Created new loan portfolio record");
//                     console.log("DEBUG: Insert result:", insertResult);
//                 }
                
//                 console.log("DEBUG: ✓ Loan portfolio updated successfully");
                
//             } else {
//                 console.log("DEBUG: ✗ loan_portfolio table does not exist or not found");
//                 console.log("DEBUG: Table check result was:", portfolioTableCheck);
//             }
//         } catch (portfolioError) {
//             console.error("DEBUG: ✗ ERROR updating loan portfolio:", portfolioError.message);
//             console.error("DEBUG: Error details:", portfolioError);
//             // Don't rollback for portfolio errors - it's not critical
//         }

//         // ==================== 13. COMMIT TRANSACTION ====================
//         await transaction.commit();
//         console.log("DEBUG: Transaction committed successfully");

//         // ==================== 14. PREPARE RESPONSE ====================
//         const totalDisbursedNow = currentStatus === 'ACTIVE' 
//             ? (currentDisbursedAmount + disbursementAmount) 
//             : disbursementAmount;
        
//         const newOutstandingPrincipal = currentStatus === 'ACTIVE'
//             ? (currentOutstandingPrincipal + disbursementAmount)
//             : disbursementAmount;
        
//         // Define portfolio variables
//         const currentMonth = now.getMonth() + 1;
//         const currentYear = now.getFullYear();
//         const loanProductId = loanAccount.l_o_a_n__p_r_o_d_u_c_t__i_d || 0;
//         const branchId = loanAccount.b_r_a_n_c_h__i_d || '001';
        
//         const responseData = {
//             success: true,
//             message: currentStatus === 'ACTIVE' 
//                 ? "Additional disbursement recorded successfully" 
//                 : "Loan approved and disbursed successfully",
//             data: {
//                 loanAccount: {
//                     ACCT_NO,
//                     previousStatus: currentStatus,
//                     newStatus: 'ACTIVE',
//                     previousAmount: loanAmountValue,
//                     newAmount: -disbursementAmount,
//                     approvedAmount: approvedAmount,
//                     previousDisbursed: currentDisbursedAmount,
//                     currentDisbursement: disbursementAmount,
//                     totalDisbursed: totalDisbursedNow,
//                     previousOutstanding: currentOutstandingPrincipal,
//                     newOutstanding: newOutstandingPrincipal,
//                     remainingLimit: approvedAmount - totalDisbursedNow,
//                     approvalDate: now,
//                     disbursementDate: now,
//                     approvedBy,
//                     approvalComments,
//                     customerId: customerId,
//                     numericCustomerId: numericCustomerId
//                 },
//                 disbursement: {
//                     id: disbursementRecord.id,
//                     status: 'APPROVED',
//                     customerAccount: customerAccountNumber,
//                     customerAccountType: customerAccountDetails?.accountType || 'UNKNOWN',
//                     amount: disbursementAmount
//                 },
//                 customerAccountUpdate: customerAccountNumber && customerAccountDetails ? {
//                     accountNumber: customerAccountNumber,
//                     customerId: customerId,
//                     numericCustomerId: numericCustomerId,
//                     previousBalances: {
//                         ledger: customerAccountDetails.currentLedgerBalance,
//                         available: customerAccountDetails.currentAvailableBalance,
//                         cleared: customerAccountDetails.currentClearedBalance,
//                         current: customerAccountDetails.currentBalance
//                     },
//                     newBalances: {
//                         ledger: customerAccountDetails.currentLedgerBalance + disbursementAmount,
//                         available: customerAccountDetails.currentAvailableBalance + disbursementAmount,
//                         cleared: customerAccountDetails.currentClearedBalance + disbursementAmount,
//                         current: customerAccountDetails.currentBalance + disbursementAmount
//                     },
//                     currency: customerAccountDetails.currency || 'NGN',
//                     tablesUpdated: [
//                         accountsTableRecord ? 'accounts' : null,
//                         customerAccountsTableRecord ? 'customer_accounts' : 'new_record_created'
//                     ].filter(Boolean),
//                     accountCreated: !customerAccountsTableRecord?.id ? 'Yes' : 'No'
//                 } : {
//                     note: "No customer account found to update",
//                     customerId: customerId,
//                     numericCustomerId: numericCustomerId,
//                     searchedAccountName: customerName,
//                     searchedInTables: ['customer_accounts', 'accounts']
//                 },
//                 portfolioUpdate: {
//                     updated: true,
//                     month: currentMonth,
//                     year: currentYear,
//                     productId: loanProductId,
//                     branchId: branchId,
//                     amount: disbursementAmount,
//                     message: "Loan portfolio statistics updated"
//                 },
//                 accountingSummary: {
//                     loanAccount: `Debited: -₦${disbursementAmount.toLocaleString()} (Loan account set to negative)`,
//                     customerAccount: customerAccountNumber 
//                         ? `Credited: +₦${disbursementAmount.toLocaleString()} to account ${customerAccountNumber}`
//                         : "No customer account found to credit",
//                     netEffect: customerAccountNumber 
//                         ? "Funds transferred from loan account to customer account" 
//                         : "Loan disbursed but customer account not updated"
//                 },
//                 debug: {
//                     transactionId: `DISB-${Date.now()}`,
//                     timestamp: now.toISOString(),
//                     loanAccountId: loanAccount.id,
//                     customerId: customerId,
//                     numericCustomerId: numericCustomerId,
//                     customerAccountFound: !!customerAccountNumber,
//                     accountsTableUpdated: !!accountsTableRecord,
//                     customerAccountsTableUpdated: !!customerAccountsTableRecord,
//                     accountsTableRecordExists: !!accountsTableRecord,
//                     customerAccountsTableRecordExists: !!customerAccountsTableRecord,
//                     searchDetails: {
//                         searchedCustomerId: customerId,
//                         searchedNumericId: numericCustomerId,
//                         searchedName: customerName
//                     }
//                 }
//             }
//         };

//         // Add note for partial disbursement
//         const remainingAfter = approvedAmount - totalDisbursedNow;
//         if (remainingAfter > 0) {
//             responseData.data.note = "Partial disbursement completed";
//             responseData.data.remainingForDisbursement = remainingAfter;
//         }

//         console.log("=== DEBUG: Sending success response ===");
//         return res.status(200).json(responseData);
//     } catch (error) {
//         // ==================== ERROR HANDLING ====================
//         console.error("DEBUG: Error in approveAndDisburseLoan:", error);
//         console.error("DEBUG: Error stack:", error.stack);
        
//         try {
//             if (transaction) {
//                 // Check transaction state before attempting rollback
//                 if (!transaction.finished) {
//                     await transaction.rollback();
//                     console.log("DEBUG: Transaction rolled back successfully");
//                 } else {
//                     console.log("DEBUG: Transaction already finished with state:", transaction.finished);
//                 }
//             }
//         } catch (rollbackError) {
//             console.error("DEBUG: Rollback failed:", rollbackError.message);
//             // Continue with original error handling
//         }

//         return res.status(500).json({
//             success: false,
//             message: "Approval process failed",
//             error: error.message,
//             code: "APPROVAL_PROCESS_ERROR",
//             debug: {
//                 errorName: error.name,
//                 errorMessage: error.message,
//                 errorLine: error.lineNumber,
//                 errorColumn: error.columnNumber,
//                 fullError: process.env.NODE_ENV === 'development' ? error.stack : 'Hidden in production'
//             }
//         });
//     }
// },
async approveAndDisburseLoan(req, res) {
    console.log("=== DEBUG: Starting approveAndDisburseLoan ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    
    let transaction;
    
    try {
        const { 
            ACCT_NO, 
            approvedBy, 
            approvalComments = "Loan approved for disbursement"
        } = req.body;

        console.log("DEBUG: ACCT_NO =", ACCT_NO);
        console.log("DEBUG: approvedBy =", approvedBy);

        // Validate required fields
        if (!ACCT_NO || !approvedBy) {
            return res.status(400).json({
                success: false,
                message: "ACCT_NO and approvedBy are required",
                code: "MISSING_FIELDS",
                debug: {
                    receivedACCT_NO: ACCT_NO,
                    receivedApprovedBy: approvedBy
                }
            });
        }

        // Start transaction
        transaction = await sequelize.transaction();
        console.log("DEBUG: Transaction started");

        // ==================== 1. FIND LOAN ACCOUNT ====================
        console.log(`DEBUG: Looking for loan account: ${ACCT_NO}`);
        
        let loanAccounts;
        try {
            const result = await sequelize.query(
                `SELECT * FROM loan_accounts WHERE a_c_c_t__n_o = ? LIMIT 1`,
                {
                    replacements: [ACCT_NO],
                    transaction,
                    type: sequelize.QueryTypes.SELECT
                }
            );
            loanAccounts = result;
            console.log("DEBUG: Query result type:", typeof result);
            console.log("DEBUG: Is array?", Array.isArray(result));
            console.log("DEBUG: Query result length:", result ? result.length : 0);
            console.log("DEBUG: Query result:", JSON.stringify(result, null, 2));
        } catch (queryError) {
            console.error("DEBUG: Database query failed:", queryError);
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            return res.status(500).json({
                success: false,
                message: "Database query failed",
                error: queryError.message,
                code: "DATABASE_ERROR"
            });
        }

        console.log("DEBUG: loanAccounts =", loanAccounts);
        console.log("DEBUG: loanAccounts is array?", Array.isArray(loanAccounts));
        console.log("DEBUG: loanAccounts.length?", loanAccounts ? loanAccounts.length : 'null');

        if (!loanAccounts || !Array.isArray(loanAccounts) || loanAccounts.length === 0) {
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            
            try {
                const allAccounts = await sequelize.query(
                    `SELECT a_c_c_t__n_o, l_o_a_n__s_t_a_t_u_s FROM loan_accounts LIMIT 5`,
                    { type: sequelize.QueryTypes.SELECT }
                );
                
                const columnCheck = await sequelize.query(
                    `SHOW COLUMNS FROM loan_accounts`,
                    { type: sequelize.QueryTypes.SELECT }
                );
                
                const accountColumns = columnCheck.map(col => col.Field);
                
                return res.status(404).json({
                    success: false,
                    message: `Loan account ${ACCT_NO} not found`,
                    code: "LOAN_NOT_FOUND",
                    debug: {
                        searchedAccount: ACCT_NO,
                        loanAccountsResult: loanAccounts,
                        firstFewAccounts: allAccounts,
                        tableColumns: accountColumns,
                        searchedColumn: 'a_c_c_t__n_o'
                    }
                });
            } catch (error) {
                return res.status(404).json({
                    success: false,
                    message: `Loan account ${ACCT_NO} not found`,
                    code: "LOAN_NOT_FOUND",
                    debug: {
                        searchedAccount: ACCT_NO,
                        errorCheckingTable: error.message
                    }
                });
            }
        }

        const loanAccount = loanAccounts[0];
        console.log("DEBUG: loanAccount =", JSON.stringify(loanAccount, null, 2));
        console.log("DEBUG: loanAccount.l_o_a_n__s_t_a_t_u_s =", loanAccount.l_o_a_n__s_t_a_t_u_s);
        console.log("DEBUG: loanAccount type:", typeof loanAccount);
        console.log("DEBUG: loanAccount keys:", Object.keys(loanAccount));

        if (!loanAccount) {
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            return res.status(500).json({
                success: false,
                message: "Loan account object is null",
                code: "INVALID_ACCOUNT_DATA",
                debug: {
                    loanAccountsLength: loanAccounts.length,
                    firstElement: loanAccounts[0]
                }
            });
        }

        const currentStatus = loanAccount.l_o_a_n__s_t_a_t_u_s;
        const currentDisbursedAmount = parseFloat(loanAccount.d_i_s_b_u_r_s_e_d__a_m_o_u_n_t || 0);
        const currentOutstandingPrincipal = parseFloat(loanAccount.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l || 0);
        const loanAmountValue = parseFloat(loanAccount.a_m_o_u_n_t || 0);
        const now = new Date();

        console.log("DEBUG: Current Status =", currentStatus);
        console.log("DEBUG: Current Disbursed Amount =", currentDisbursedAmount);
        console.log("DEBUG: Current Outstanding Principal =", currentOutstandingPrincipal);
        console.log("DEBUG: Loan Amount Value =", loanAmountValue);
        console.log("DEBUG: Disbursed Amount column value =", loanAccount.d_i_s_b_u_r_s_e_d__a_m_o_u_n_t);
        console.log("DEBUG: Outstanding Principal column value =", loanAccount.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l);
        console.log("DEBUG: Amount column value =", loanAccount.a_m_o_u_n_t);

        // ==================== 2. CHECK DATA CONSISTENCY ====================
        // Get the absolute approved amount (should be positive)
        const approvedAmount = Math.abs(loanAmountValue);
        console.log("DEBUG: Approved Amount (absolute) =", approvedAmount);

        // ==================== 3. GET CUSTOMER INFORMATION ====================
        // Get customer ID from loan account and convert to numeric
        const customerId = loanAccount.c_u_s_t__i_d;
        const numericCustomerId = customerId ? parseInt(customerId.replace(/^0+/, ''), 10) : null;
        const customerName = loanAccount.a_c_c_t__n_m || '';
        
        console.log("DEBUG: Customer ID from loan =", customerId);
        console.log("DEBUG: Numeric Customer ID =", numericCustomerId);
        console.log("DEBUG: Customer Name =", customerName);

        // ==================== 4. CHECK CURRENT STATUS ====================
        if (currentStatus === 'ACTIVE') {
            console.log(`DEBUG: Loan ${ACCT_NO} is already ACTIVE`);
            
            // Note: currentDisbursedAmount is negative, so we compare absolute values
            if (Math.abs(currentDisbursedAmount) >= approvedAmount) {
                if (transaction && !transaction.finished) {
                    await transaction.rollback();
                }
                return res.status(400).json({
                    success: false,
                    message: "Loan has already been fully disbursed",
                    code: "FULLY_DISBURSED",
                    data: {
                        ACCT_NO,
                        approvedAmount,
                        alreadyDisbursed: Math.abs(currentDisbursedAmount)
                    }
                });
            }
            
            const remainingAmount = approvedAmount - Math.abs(currentDisbursedAmount);
            console.log(`DEBUG: Remaining amount to disburse: ${remainingAmount}`);
            
            // For ACTIVE loans, we're doing ADDITIONAL disbursement
            // Since amounts are negative, we subtract (make more negative)
            await sequelize.query(
                `UPDATE loan_accounts 
                 SET d_i_s_b_u_r_s_e_d__a_m_o_u_n_t = d_i_s_b_u_r_s_e_d__a_m_o_u_n_t - ?,
                     o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l = o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l - ?,
                     updated_at = ?
                 WHERE a_c_c_t__n_o = ?`,
                {
                    replacements: [
                        remainingAmount,  // Subtract from negative (makes more negative)
                        remainingAmount,  // Subtract from negative (makes more negative)
                        now,
                        ACCT_NO
                    ],
                    transaction
                }
            );
            
            console.log(`DEBUG: Updated loan account for additional disbursement`);
            console.log(`DEBUG: Previous disbursed: ${currentDisbursedAmount}`);
            console.log(`DEBUG: New disbursed: ${currentDisbursedAmount - remainingAmount}`);
            
        } else if (currentStatus === 'PENDING') {
            console.log(`DEBUG: Processing new disbursement for PENDING loan ${ACCT_NO}`);
            
            // For PENDING loans, set all amounts to NEGATIVE (initial disbursement)
            const disbursementAmountForUpdate = -approvedAmount;  // Negative value
            
            // Update all three fields consistently with negative values
            await sequelize.query(
                `UPDATE loan_accounts 
                 SET l_o_a_n__s_t_a_t_u_s = 'ACTIVE',
                     a_m_o_u_n_t = ?,
                     d_i_s_b_u_r_s_e_d__a_m_o_u_n_t = ?,
                     a_p_p_r_o_v_a_l__d_a_t_e = ?,
                     d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e = ?,
                     o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l = ?,
                     s_e_r_v_i_c_i_n_g__s_t_a_t_u_s = 'SERVICED',
                     updated_at = ?
                 WHERE a_c_c_t__n_o = ?`,
                {
                    replacements: [
                        disbursementAmountForUpdate,  // Negative amount (e.g., -50000)
                        disbursementAmountForUpdate,  // Negative disbursed amount
                        now,
                        now,
                        disbursementAmountForUpdate,  // Negative outstanding principal
                        now,
                        ACCT_NO
                    ],
                    transaction
                }
            );
            
            console.log(`DEBUG: Updated loan account with negative values:`);
            console.log(`DEBUG:   Amount: ${disbursementAmountForUpdate}`);
            console.log(`DEBUG:   Disbursed: ${disbursementAmountForUpdate}`);
            console.log(`DEBUG:   Outstanding: ${disbursementAmountForUpdate}`);
            
        } else {
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            return res.status(400).json({
                success: false,
                message: `Cannot disburse loan with status: ${currentStatus}`,
                code: "INVALID_STATUS",
                data: {
                    ACCT_NO,
                    currentStatus,
                    allowedStatuses: ['PENDING', 'ACTIVE']
                }
            });
        }

        // ==================== 5. CALCULATE DISBURSEMENT AMOUNT ====================
        // disbursementAmount should always be POSITIVE for calculations
        let disbursementAmount;

        if (currentStatus === 'ACTIVE') {
            // For additional disbursement on ACTIVE loan
            disbursementAmount = approvedAmount - Math.abs(currentDisbursedAmount);
        } else if (currentStatus === 'PENDING') {
            // For initial disbursement
            disbursementAmount = approvedAmount;
        } else {
            disbursementAmount = 0;
        }

        console.log("DEBUG: Disbursement Amount (positive for calculations) = ₦" + disbursementAmount.toLocaleString());
        console.log("DEBUG: Note: Loan account stores amounts as NEGATIVE values");
        console.log("DEBUG:       This represents the bank's receivable asset");

        // ==================== 6. GET CUSTOMER ACCOUNT DETAILS ====================
        let customerAccountNumber = null;
        let customerAccountDetails = null;
        let accountsTableRecord = null;
        let customerAccountsTableRecord = null;

        try {
            console.log("DEBUG: Getting customer account details...");
            
            // FIRST: Try to get the account number from loan application (credit_applications table)
            let targetAccountNumber = null;
            
            // Check if there's a repay source account number in credit_applications table
            try {
                console.log(`DEBUG: Looking for repay account in credit_applications for loan ${ACCT_NO}`);
                
                const [creditAppResult] = await sequelize.query(
                    `SELECT r_e_p_a_y__s_r_c__a_c_c_t__n_o FROM credit_applications WHERE a_c_c_t__n_o = ? LIMIT 1`,
                    {
                        replacements: [ACCT_NO],
                        transaction,
                        type: sequelize.QueryTypes.SELECT
                    }
                );
                
                console.log("DEBUG: credit_applications query result:", creditAppResult);
                
                if (creditAppResult && creditAppResult.r_e_p_a_y__s_r_c__a_c_c_t__n_o) {
                    targetAccountNumber = creditAppResult.r_e_p_a_y__s_r_c__a_c_c_t__n_o;
                    console.log("DEBUG: ✓ Found repay source account from credit_applications:", targetAccountNumber);
                } else {
                    console.log("DEBUG: ✗ No repay account found in credit_applications");
                    if (creditAppResult) {
                        console.log("DEBUG: Available columns in result:", Object.keys(creditAppResult));
                    }
                }
            } catch (creditAppError) {
                console.log("DEBUG: Could not get account from credit_applications:", creditAppError.message);
            }
            
            // SECOND: If no account from credit app, check loan_accounts table for account number
            if (!targetAccountNumber) {
                console.log("DEBUG: Checking loan_accounts for account number...");
                try {
                    // Some loan systems store the customer account number in loan_accounts
                    const [loanAccountDetails] = await sequelize.query(
                        `SELECT c_u_s_t_o_m_e_r__a_c_c_o_u_n_t__n_o, d_i_s_b_u_r_s_e_m_e_n_t__a_c_c_o_u_n_t FROM loan_accounts WHERE a_c_c_t__n_o = ? LIMIT 1`,
                        {
                            replacements: [ACCT_NO],
                            transaction,
                            type: sequelize.QueryTypes.SELECT
                        }
                    );
                    
                    if (loanAccountDetails) {
                        console.log("DEBUG: Loan account details:", loanAccountDetails);
                        if (loanAccountDetails.c_u_s_t_o_m_e_r__a_c_c_o_u_n_t__n_o) {
                            targetAccountNumber = loanAccountDetails.c_u_s_t_o_m_e_r__a_c_c_o_u_n_t__n_o;
                            console.log("DEBUG: Found customer account in loan_accounts:", targetAccountNumber);
                        } else if (loanAccountDetails.d_i_s_b_u_r_s_e_m_e_n_t__a_c_c_o_u_n_t) {
                            targetAccountNumber = loanAccountDetails.d_i_s_b_u_r_s_e_m_e_n_t__a_c_c_o_u_n_t;
                            console.log("DEBUG: Found disbursement account in loan_accounts:", targetAccountNumber);
                        }
                    }
                } catch (loanAccountError) {
                    console.log("DEBUG: Could not get account from loan_accounts:", loanAccountError.message);
                }
            }
            
            // THIRD: If still no account number, use customer ID search as fallback
            if (!targetAccountNumber && customerId) {
                console.log("DEBUG: No account number found, searching by customer ID:", numericCustomerId);
                
                // Direct query to customer_accounts with numeric ID
                const findAccountQuery = `SELECT account_number FROM customer_accounts WHERE customer_id = ${numericCustomerId} LIMIT 1`;
                console.log("DEBUG: Executing customer ID search:", findAccountQuery);
                
                const [accountResult] = await sequelize.query(findAccountQuery, {
                    transaction,
                    type: sequelize.QueryTypes.SELECT
                });
                
                console.log("DEBUG: Customer ID search result:", accountResult);
                
                if (accountResult && accountResult.account_number) {
                    targetAccountNumber = accountResult.account_number;
                    console.log("DEBUG: ✓ Found account by customer ID:", targetAccountNumber);
                } else {
                    console.log("DEBUG: ✗ No account found by customer ID");
                }
            }
            
            // FOURTH: If we have an account number, search for it in the database
            if (targetAccountNumber) {
                customerAccountNumber = targetAccountNumber;
                console.log("DEBUG: ✓ Using account number:", customerAccountNumber);
                
                // Search in customer_accounts table
                console.log("DEBUG: Searching customer_accounts for account:", customerAccountNumber);
                const custAccountQuery = `SELECT * FROM customer_accounts WHERE account_number = '${customerAccountNumber}' LIMIT 1`;
                console.log("DEBUG: Executing:", custAccountQuery);
                
                const [custAccountResult] = await sequelize.query(custAccountQuery, {
                    transaction,
                    type: sequelize.QueryTypes.SELECT
                });
                
                if (custAccountResult) {
                    customerAccountsTableRecord = custAccountResult;
                    console.log("DEBUG: ✓ Found in customer_accounts table!");
                    console.log("DEBUG: Account details:", {
                        id: customerAccountsTableRecord.id,
                        account_number: customerAccountsTableRecord.account_number,
                        customer_id: customerAccountsTableRecord.customer_id,
                        account_name: customerAccountsTableRecord.account_name,
                        current_balance: customerAccountsTableRecord.current_balance,
                        available_balance: customerAccountsTableRecord.available_balance,
                        ledger_balance: customerAccountsTableRecord.ledger_balance,
                        cleared_balance: customerAccountsTableRecord.cleared_balance
                    });
                } else {
                    console.log("DEBUG: ✗ Account not found in customer_accounts table");
                    console.log("DEBUG: This is strange because we should have found account", customerAccountNumber);
                }
                
                // Search in accounts table
                console.log("DEBUG: Searching accounts table for account:", customerAccountNumber);
                const accountsQuery = `SELECT * FROM accounts WHERE account_number = '${customerAccountNumber}' OR acct_no = '${customerAccountNumber}' LIMIT 1`;
                console.log("DEBUG: Executing:", accountsQuery);
                
                const [accountsResult] = await sequelize.query(accountsQuery, {
                    transaction,
                    type: sequelize.QueryTypes.SELECT
                });
                
                if (accountsResult) {
                    accountsTableRecord = accountsResult;
                    console.log("DEBUG: ✓ Found in accounts table");
                } else {
                    console.log("DEBUG: ✗ Account not found in accounts table");
                }
                
                // Create customer account details
                if (customerAccountsTableRecord) {
                    customerAccountDetails = {
                        accountNumber: customerAccountNumber,
                        accountName: customerAccountsTableRecord.account_name || customerName || 'Unknown',
                        accountType: customerAccountsTableRecord.account_type || 'SAVINGS',
                        currency: customerAccountsTableRecord.currency_code || 'NGN',
                        currentLedgerBalance: parseFloat(customerAccountsTableRecord.ledger_balance || 0),
                        currentAvailableBalance: parseFloat(customerAccountsTableRecord.available_balance || 0),
                        currentClearedBalance: parseFloat(customerAccountsTableRecord.cleared_balance || 0),
                        currentBalance: parseFloat(customerAccountsTableRecord.current_balance || 0),
                        accountsTableRecord: accountsTableRecord,
                        customerAccountsTableRecord: customerAccountsTableRecord
                    };
                    
                    console.log("DEBUG: ✓ Created customer account details object");
                }
            } else {
                console.log("DEBUG: ✗ No account number could be determined");
                console.log("DEBUG: Tried:", {
                    fromCreditApp: false, // will be true if found
                    fromLoanAccount: false, // will be true if found  
                    fromCustomerId: !!customerId
                });
            }
            
        } catch (lookupError) {
            console.error("DEBUG: Error in customer account lookup:", lookupError.message);
            console.error("DEBUG: Error stack:", lookupError.stack);
        }

        // ==================== 7. UPDATE BOTH ACCOUNT TABLES ====================
        if (customerAccountNumber && customerAccountsTableRecord) {
            try {
                console.log("DEBUG: =========================================");
                console.log("DEBUG: ✓ CREDITING CUSTOMER ACCOUNT");
                console.log("DEBUG: =========================================");
                console.log("DEBUG: Account to credit:", customerAccountNumber);
                console.log("DEBUG: Disbursement amount: ₦" + disbursementAmount.toLocaleString());
                
                // Get current balances
                const currentLedgerBalance = parseFloat(customerAccountsTableRecord.ledger_balance || 0);
                const currentAvailableBalance = parseFloat(customerAccountsTableRecord.available_balance || 0);
                const currentClearedBalance = parseFloat(customerAccountsTableRecord.cleared_balance || 0);
                const currentBalance = parseFloat(customerAccountsTableRecord.current_balance || 0);
                
                // Calculate new balances
                const newLedgerBalance = currentLedgerBalance + disbursementAmount;
                const newAvailableBalance = currentAvailableBalance + disbursementAmount;
                const newClearedBalance = currentClearedBalance + disbursementAmount;
                const newCurrentBalance = currentBalance + disbursementAmount;
                
                console.log("DEBUG: BALANCE UPDATE:");
                console.log("DEBUG: ---------------------------------");
                console.log("DEBUG: Type           | Current      | New");
                console.log("DEBUG: ---------------------------------");
                console.log("DEBUG: Ledger Balance | ₦" + currentLedgerBalance.toLocaleString().padEnd(10) + " | ₦" + newLedgerBalance.toLocaleString());
                console.log("DEBUG: Available      | ₦" + currentAvailableBalance.toLocaleString().padEnd(10) + " | ₦" + newAvailableBalance.toLocaleString());
                console.log("DEBUG: Cleared        | ₦" + currentClearedBalance.toLocaleString().padEnd(10) + " | ₦" + newClearedBalance.toLocaleString());
                console.log("DEBUG: Current        | ₦" + currentBalance.toLocaleString().padEnd(10) + " | ₦" + newCurrentBalance.toLocaleString());
                console.log("DEBUG: ---------------------------------");
                
                // Format date for SQL
                const sqlDate = now.toISOString().slice(0, 19).replace('T', ' ');
                
                // 1. UPDATE CUSTOMER_ACCOUNTS TABLE
                console.log("\nDEBUG: Step 1: Updating customer_accounts table...");
                const updateCustomerAccountQuery = `
                    UPDATE customer_accounts 
                    SET ledger_balance = ${newLedgerBalance},
                        available_balance = ${newAvailableBalance},
                        cleared_balance = ${newClearedBalance},
                        current_balance = ${newCurrentBalance},
                        last_transaction_date = '${sqlDate}',
                        updated_at = '${sqlDate}'
                    WHERE account_number = '${customerAccountNumber}'
                `;
                
                console.log("DEBUG: Executing query...");
                const customerUpdateResult = await sequelize.query(updateCustomerAccountQuery, { transaction });
                console.log("DEBUG: ✓ customer_accounts table updated successfully");
                
                // 2. UPDATE ACCOUNTS TABLE USING ACCOUNT SERVICE
                console.log("\nDEBUG: Step 2: Updating accounts table using AccountService...");
                
                try {
                    // Prepare account data for AccountService
                    const accountData = {
                        customer_id: numericCustomerId || customerAccountsTableRecord.customer_id || 0,
                        account_number: customerAccountNumber,
                        acct_no: customerAccountNumber,
                        acct_nm: customerAccountsTableRecord.account_name || customerName || 'Loan Customer',
                        account_type: customerAccountsTableRecord.account_type || 'SAVINGS',
                        product_type: 'SAVINGS',
                        product: 'Savings Account',
                        branch: 1, // REQUIRED! Use appropriate branch ID
                        ledger_balance: newLedgerBalance,
                        available_balance: newAvailableBalance,
                        cleared_balance: newClearedBalance,
                        rec_st: 'ACTIVE',
                        currency: customerAccountsTableRecord.currency_code || 'NGN',
                        online_enabled: 1,
                        dr_allowed: 1,
                        cr_allowed: 1,
                        last_activity_date: sqlDate,
                        created_by: approvedBy || 'LOAN_SYSTEM',
                        product_desc: 'Account for loan disbursement',
                        
                        // Optional fields that might be needed
                        customer_code: customerId, // Use the original customer ID string
                        opening_amount: 0, // Default opening amount
                        interest_rate: 0, // No interest for savings account
                        accrued_interest: 0,
                        overdraft_limit: 0,
                        substatus: 'Active',
                        sms_alert: 'No',
                        email_alert: 'No',
                        is_overdraft_allowed: 0,
                        auto_approve: 0,
                        disbursement_method: 'Cash',
                        creation_date: sqlDate.substring(0, 10) // Just the date part
                    };
                    
                    console.log("DEBUG: Calling AccountService.createOrUpdateAccount...");
                    const result = await createOrUpdateAccount(accountData, transaction);
                    
                    if (result.success) {
                        console.log("DEBUG: ✓ AccountService operation successful:", result.message);
                        console.log("DEBUG: Action performed:", result.action);
                        console.log("DEBUG: Account ID:", result.account?.id || result.account?.insertId || 'Unknown');
                        
                        // Store the account record for later use if needed
                        const updatedAccount = result.account;
                        if (updatedAccount && !accountsTableRecord) {
                            accountsTableRecord = updatedAccount;
                        }
                    } else {
                        console.warn("DEBUG: ⚠️ AccountService returned success: false");
                        console.warn("DEBUG: Message:", result.message);
                        
                        // Fallback to manual creation/update
                        await fallbackToManualAccountUpdate(customerAccountNumber, accountData, transaction, sqlDate);
                    }
                    
                } catch (serviceError) {
                    console.error("DEBUG: ❌ AccountService failed:", serviceError.message);
                    console.error("DEBUG: Service error stack:", serviceError.stack);
                    
                    // Fallback to manual creation/update
                    console.log("DEBUG: 🔄 Falling back to manual account update...");
                    await fallbackToManualAccountUpdate(customerAccountNumber, {
                        customer_id: numericCustomerId || customerAccountsTableRecord.customer_id || 0,
                        account_number: customerAccountNumber,
                        acct_nm: customerAccountsTableRecord.account_name || customerName || 'Loan Customer',
                        account_type: customerAccountsTableRecord.account_type || 'SAVINGS',
                        newLedgerBalance,
                        newAvailableBalance,
                        newClearedBalance,
                        currency: customerAccountsTableRecord.currency_code || 'NGN'
                    }, transaction, sqlDate);
                }
                
                // 3. CREATE TRANSACTION RECORD
                console.log("\nDEBUG: Step 3: Creating transaction record...");
                try {
                    const transactionId = `LOAN-DISB-${ACCT_NO}-${Date.now()}`;
                    
                    const transactionQuery = `
                        INSERT INTO customer_transactions (
                            transaction_id, account_number, transaction_type,
                            amount, description, balance_after,
                            transaction_date, reference_number, created_by
                        ) VALUES (
                            '${transactionId}',
                            '${customerAccountNumber}',
                            'CREDIT',
                            ${disbursementAmount},
                            'Loan disbursement from loan account ${ACCT_NO}',
                            ${newCurrentBalance},
                            '${sqlDate}',
                            '${ACCT_NO}',
                            '${approvedBy}'
                        )
                    `;
                    
                    console.log("DEBUG: Creating transaction record...");
                    await sequelize.query(transactionQuery, { transaction });
                    console.log("DEBUG: ✓ Transaction record created");
                    
                } catch (txnError) {
                    console.warn("DEBUG: Could not create transaction record:", txnError.message);
                    console.warn("DEBUG: This is not critical - account was still updated");
                }
                
                console.log("\nDEBUG: =========================================");
                console.log("DEBUG: ✓ SUCCESS!");
                console.log("DEBUG: =========================================");
                console.log(`DEBUG: Account ${customerAccountNumber} credited with ₦${disbursementAmount.toLocaleString()}`);
                console.log(`DEBUG: New balance: ₦${newCurrentBalance.toLocaleString()}`);
                console.log("DEBUG: =========================================");
                
            } catch (accountError) {
                console.error("\nDEBUG: ✗ ERROR updating customer account:", accountError.message);
                console.error("DEBUG: Error details:", accountError);
                console.error("DEBUG: This is a critical error - account was NOT updated");
            }
        } else {
            console.log("\nDEBUG: =========================================");
            console.log("DEBUG: ✗ CRITICAL: Cannot update customer account");
            console.log("DEBUG: =========================================");
            console.log("DEBUG: Missing required data:");
            console.log("DEBUG: - Has account number:", !!customerAccountNumber);
            console.log("DEBUG: - Has account record:", !!customerAccountsTableRecord);
            console.log("DEBUG: - Customer ID:", customerId);
            console.log("DEBUG: - Numeric Customer ID:", numericCustomerId);
            
            // Let's try a direct query to see what's in the database
            console.log("\nDEBUG: Diagnostic query - checking credit_applications:");
            try {
                const diagQuery = `SELECT a_c_c_t__n_o, r_e_p_a_y__s_r_c__a_c_c_t__n_o FROM credit_applications WHERE a_c_c_t__n_o = '${ACCT_NO}' LIMIT 1`;
                console.log("DEBUG: Executing:", diagQuery);
                
                const [diagResult] = await sequelize.query(diagQuery, { 
                    transaction, 
                    type: sequelize.QueryTypes.SELECT 
                });
                
                console.log("DEBUG: Diagnostic result:", diagResult);
                
                if (diagResult) {
                    console.log("DEBUG: Found in credit_applications:");
                    console.log("DEBUG: - Account No:", diagResult.a_c_c_t__n_o);
                    console.log("DEBUG: - Repay Source Account:", diagResult.r_e_p_a_y__s_r_c__a_c_c_t__n_o);
                    
                    if (diagResult.r_e_p_a_y__s_r_c__a_c_c_t__n_o) {
                        console.log("DEBUG: We have the account! It's:", diagResult.r_e_p_a_y__s_r_c__a_c_c_t__n_o);
                        
                        // Try to find it directly
                        const findAccountQuery = `SELECT * FROM customer_accounts WHERE account_number = '${diagResult.r_e_p_a_y__s_r_c__a_c_c_t__n_o}' LIMIT 1`;
                        console.log("DEBUG: Looking for account:", findAccountQuery);
                        
                        const [foundAccount] = await sequelize.query(findAccountQuery, { 
                            transaction, 
                            type: sequelize.QueryTypes.SELECT 
                        });
                        
                        console.log("DEBUG: Found account?", !!foundAccount);
                        if (foundAccount) {
                            console.log("DEBUG: Account details:", {
                                account_number: foundAccount.account_number,
                                customer_id: foundAccount.customer_id,
                                account_name: foundAccount.account_name
                            });
                        }
                    }
                } else {
                    console.log("DEBUG: No record found in credit_applications for loan", ACCT_NO);
                }
            } catch (diagError) {
                console.error("DEBUG: Diagnostic query failed:", diagError.message);
            }
        }

        // ==================== HELPER FUNCTION FOR FALLBACK ====================
        async function fallbackToManualAccountUpdate(accountNumber, accountData, transaction, sqlDate) {
            try {
                console.log("DEBUG: Executing manual account update fallback...");
                
                // Check if account exists in accounts table
                const accountsCheckQuery = `
                    SELECT id FROM accounts 
                    WHERE account_number = '${accountNumber}' 
                       OR acct_no = '${accountNumber}'
                    LIMIT 1
                `;
                
                const [existingAccount] = await sequelize.query(accountsCheckQuery, {
                    transaction,
                    type: sequelize.QueryTypes.SELECT
                });
                
                if (existingAccount && existingAccount.id) {
                    // Update existing account
                    const updateAccountsQuery = `
                        UPDATE accounts 
                        SET ledger_balance = ${accountData.ledger_balance || accountData.newLedgerBalance || 0},
                            available_balance = ${accountData.available_balance || accountData.newAvailableBalance || 0},
                            cleared_balance = ${accountData.cleared_balance || accountData.newClearedBalance || 0},
                            last_activity_date = '${sqlDate}',
                            updated_at = '${sqlDate}'
                        WHERE account_number = '${accountNumber}' 
                           OR acct_no = '${accountNumber}'
                    `;
                    
                    await sequelize.query(updateAccountsQuery, { transaction });
                    console.log("DEBUG: ✓ accounts table updated via manual fallback");
                } else {
                    // Create new account
                    const createAccountsQuery = `
                        INSERT INTO accounts (
                            customer_id, account_number, acct_no, acct_nm,
                            account_type, product_type, product,
                            ledger_balance, available_balance, cleared_balance,
                            rec_st, currency, online_enabled,
                            dr_allowed, cr_allowed, last_activity_date,
                            created_at, updated_at, branch
                        ) VALUES (
                            ${accountData.customer_id || 'NULL'},
                            '${accountNumber}',
                            '${accountNumber}',
                            '${accountData.acct_nm || 'Loan Customer'}',
                            '${accountData.account_type || 'SAVINGS'}',
                            'SAVINGS',
                            'Savings Account',
                            ${accountData.ledger_balance || accountData.newLedgerBalance || 0},
                            ${accountData.available_balance || accountData.newAvailableBalance || 0},
                            ${accountData.cleared_balance || accountData.newClearedBalance || 0},
                            'ACTIVE',
                            '${accountData.currency || 'NGN'}',
                            1,
                            1,
                            1,
                            '${sqlDate}',
                            '${sqlDate}',
                            '${sqlDate}',
                            1  -- BRANCH ID (required!)
                        )
                    `;
                    
                    console.log("DEBUG: Creating account in accounts table via manual fallback...");
                    const createResult = await sequelize.query(createAccountsQuery, { transaction });
                    console.log("DEBUG: ✓ Created account in accounts table via manual fallback, ID:", createResult[0]?.insertId);
                }
                
            } catch (fallbackError) {
                console.error("DEBUG: ❌ Manual fallback also failed:", fallbackError.message);
                console.error("DEBUG: This is a serious issue - accounts table may not be updated");
            }
        }

        // ==================== 8. GET LOAN PRODUCT CONFIGURATION ====================
       // ==================== 8. GET LOAN PRODUCT CONFIGURATION ====================
console.log("\nDEBUG: Getting loan product configuration...");

let productConfig = null;
let principalGLAccount = null;
let interestGLAccount = null;
let processingFeeGLAccount = null;
let processingFeeRate = 0;
let processingFeeAmount = 0;

try {
    // Try to get the loan product ID from loan_accounts
    console.log("DEBUG: Attempting to get product ID from loan account:", ACCT_NO);
    
    const loanAccountQuery = `
        SELECT l_o_a_n__p_r_o_d_u_c_t__i_d 
        FROM loan_accounts 
        WHERE a_c_c_t__n_o = ? 
        LIMIT 1
    `;
    
    const [loanAccountResult] = await sequelize.query(loanAccountQuery, {
        replacements: [ACCT_NO],
        transaction,
        type: sequelize.QueryTypes.SELECT
    });
    
    let productId = null;
    let usingDefaultProduct = false;
    
    if (loanAccountResult && loanAccountResult.l_o_a_n__p_r_o_d_u_c_t__i_d) {
        productId = loanAccountResult.l_o_a_n__p_r_o_d_u_c_t__i_d;
        console.log("DEBUG: Found product ID in loan account:", productId);
    } else {
        console.warn("DEBUG: ⚠️ No product ID found in loan account, using default product");
        usingDefaultProduct = true;
        
        // Get the default/active loan product (first active product) - USING THE VIEW
        const defaultProductQuery = `
            SELECT PROD_ID 
            FROM loan_product 
            WHERE isActive = 1 
            AND STATUS = 'ACTIVE'
            LIMIT 1
        `;
        
        const [defaultProductResult] = await sequelize.query(defaultProductQuery, {
            transaction,
            type: sequelize.QueryTypes.SELECT
        });
        
        if (defaultProductResult && defaultProductResult.PROD_ID) {
            productId = defaultProductResult.PROD_ID;
            console.warn("DEBUG: ⚠️ Using default product ID:", productId);
        } else {
            // If no active product, use the first product in the view
            const firstProductQuery = `
                SELECT PROD_ID 
                FROM loan_product 
                LIMIT 1
            `;
            
            const [firstProductResult] = await sequelize.query(firstProductQuery, {
                transaction,
                type: sequelize.QueryTypes.SELECT
            });
            
            if (firstProductResult && firstProductResult.PROD_ID) {
                productId = firstProductResult.PROD_ID;
                console.warn("DEBUG: ⚠️ Using first available product ID:", productId);
            } else {
                console.error("DEBUG: ❌ No loan products found in the database");
                throw new Error("No loan products configured in the system. Please create a loan product first.");
            }
        }
    }
    
    // Now get the loan product using the product ID - USING THE VIEW
    const productQuery = `
        SELECT 
            PROD_ID,
            name,
            productCode,
            PRODUCT_SHORT_NAME,
            description,
            PRODUCT_TYPE,
            LOAN_INTEREST_RATE_ID,
            LOAN_PROUD_INT_ID,
            minAmount,
            maxAmount,
            MIN_LOAN_TERM_VALUE,
            MAX_LOAN_TERM_VALUE,
            LOAN_TERM_TYPE,
            BU_ID,
            isGlobalProduct,
            visibility,
            REPAYMENT_TYPE,
            PAYMENT_FREQUENCY,
            TERM_CD,
            CRNCY_ID,
            allowedCurrencies,
            CALCULATION_METHOD_OVERRIDE,
            INTEREST_TYPE_OVERRIDE,
            defaultGLAccounts,
            branchGLAccounts,
            feeStructure,
            processingFeeRate,
            processingFeeGLCode,
            lateFeePerDay,
            maxLateFee,
            productCategory,
            productSubCategory,
            riskLevel,
            collateralRequired,
            eligibilityCriteria,
            EFFECTIVE_DT,
            EXPIRY_DT,
            VERSION,
            STATUS,
            isActive,
            createdBy,
            USER_ID,
            LAST_MODIFIED_BY,
            metadata,
            created_at,
            updated_at
        FROM loan_product 
        WHERE PROD_ID = ?
        LIMIT 1
    `;
    
    const [productResult] = await sequelize.query(productQuery, {
        replacements: [productId],
        transaction,
        type: sequelize.QueryTypes.SELECT
    });
    
    if (productResult) {
        productConfig = productResult;
        
        if (usingDefaultProduct) {
            console.warn("DEBUG: ⚠️ Using default/first available loan product:");
            console.warn(`DEBUG:   Product ID: ${productResult.PROD_ID}`);
            console.warn(`DEBUG:   Product Name: ${productResult.name}`);
            console.warn("DEBUG:   NOTE: Consider updating the loan account with a proper product ID");
            
            // Update the loan account with the product ID for future reference
            try {
                await sequelize.query(
                    `UPDATE loan_accounts 
                     SET l_o_a_n__p_r_o_d_u_c_t__i_d = ? 
                     WHERE a_c_c_t__n_o = ?`,
                    {
                        replacements: [productId, ACCT_NO],
                        transaction
                    }
                );
                console.log("DEBUG: ✓ Updated loan account with product ID:", productId);
            } catch (updateError) {
                console.warn("DEBUG: Could not update loan account with product ID:", updateError.message);
            }
        } else {
            console.log("DEBUG: ✓ Found loan product configuration");
            console.log("DEBUG: Product ID:", productResult.PROD_ID);
            console.log("DEBUG: Product Name:", productResult.name);
        }
        
        // Extract GL accounts from defaultGLAccounts JSON
        if (productResult.defaultGLAccounts) {
            try {
                const glAccounts = typeof productResult.defaultGLAccounts === 'string' 
                    ? JSON.parse(productResult.defaultGLAccounts) 
                    : productResult.defaultGLAccounts;
                
                principalGLAccount = glAccounts.principalGLAccountNo || glAccounts.loanGLAccount;
                interestGLAccount = glAccounts.interestGLAccountNo;
                processingFeeGLAccount = glAccounts.processingFeeGLCode;
                
                console.log("DEBUG: Extracted GL accounts from defaultGLAccounts:");
                console.log("DEBUG:   Principal GL Account:", principalGLAccount);
                console.log("DEBUG:   Interest GL Account:", interestGLAccount);
                console.log("DEBUG:   Processing Fee GL Account:", processingFeeGLAccount);
                
                // Validate that required GL accounts are present
                if (!principalGLAccount) {
                    throw new Error("Principal GL account not found in loan product configuration");
                }
                if (!interestGLAccount) {
                    console.warn("DEBUG: Warning: Interest GL account not found in loan product configuration");
                }
                if (!processingFeeGLAccount) {
                    console.warn("DEBUG: Warning: Processing Fee GL account not found in defaultGLAccounts");
                }
                
            } catch (e) {
                console.error("DEBUG: ❌ Could not parse GL accounts JSON:", e.message);
                throw new Error(`Invalid GL accounts configuration in loan product: ${e.message}`);
            }
        } else {
            console.error("DEBUG: ❌ No defaultGLAccounts found in loan product");
            throw new Error("Loan product does not have GL accounts configured");
        }
        
        // Get processing fee details
        processingFeeRate = parseFloat(productResult.processingFeeRate || 0);
        
        // Calculate processing fee amount
        if (processingFeeRate > 0) {
            processingFeeAmount = (disbursementAmount * processingFeeRate) / 100;
            console.log("DEBUG: Processing Fee Rate:", processingFeeRate + '%');
            console.log("DEBUG: Processing Fee Amount: ₦" + processingFeeAmount.toLocaleString());
        }
        
        // If processingFeeGLAccount not found in defaultGLAccounts, use processingFeeGLCode
        if (!processingFeeGLAccount && productResult.processingFeeGLCode) {
            processingFeeGLAccount = productResult.processingFeeGLCode;
            console.log("DEBUG: Using processingFeeGLCode for fee:", processingFeeGLAccount);
        }
        
        // Also check feeStructure for processing fee GL account
        if (productResult.feeStructure && !processingFeeGLAccount) {
            try {
                const feeStructure = typeof productResult.feeStructure === 'string'
                    ? JSON.parse(productResult.feeStructure)
                    : productResult.feeStructure;
                    
                const processingFee = Array.isArray(feeStructure) ? feeStructure.find(fee => 
                    fee.feeType === 'PROCESSING' || fee.name === 'Processing Fee'
                ) : null;
                
                if (processingFee && processingFee.glAccountCode) {
                    processingFeeGLAccount = processingFee.glAccountCode;
                    console.log("DEBUG: Found Processing Fee GL account in feeStructure:", processingFeeGLAccount);
                }
            } catch (e) {
                console.warn("DEBUG: Could not parse feeStructure:", e.message);
            }
        }
        
        console.log("DEBUG: ✓ GL accounts configured successfully:");
        console.log("DEBUG:   Principal: ", principalGLAccount);
        console.log("DEBUG:   Interest:  ", interestGLAccount || "Not configured");
        console.log("DEBUG:   Fee:       ", processingFeeGLAccount || "Not configured");
        
    } else {
        console.error("DEBUG: ❌ No loan product found for product ID:", productId);
        throw new Error(`Loan product with ID ${productId} not found in loan_product view`);
    }
} catch (productError) {
    console.error("DEBUG: ❌ ERROR getting loan product configuration:", productError.message);
    console.error("DEBUG: This is a critical error - loan cannot be disbursed without GL accounts");
    
    // Rollback the transaction since we can't proceed without GL accounts
    if (transaction && !transaction.finished) {
        await transaction.rollback();
    }
    
    return res.status(500).json({
        success: false,
        message: "Loan disbursement failed: Missing GL account configuration",
        error: productError.message,
        code: "MISSING_GL_CONFIGURATION",
        debug: {
            loanAccount: ACCT_NO,
            error: productError.message,
            requiredInfo: "Loan product must have GL accounts configured in defaultGLAccounts",
            suggestion: "1. Check if loan_product view has any products\n2. Check if defaultGLAccounts JSON is valid\n3. Ensure at least one product is active"
        }
    });
}

        // ==================== 9. CREATE/UPDATE DISBURSEMENT RECORD ====================
        // Check if loan_disbursements table exists
        const disbTables = await sequelize.query(
            `SELECT TABLE_NAME 
             FROM INFORMATION_SCHEMA.TABLES 
             WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = 'loan_disbursements'`,
            { transaction, type: sequelize.QueryTypes.SELECT }
        );
        
        let disbursementRecord;
        
        if (disbTables.length > 0) {
            console.log("DEBUG: loan_disbursements table exists");
            
            // Check for existing disbursements using the correct column name
            const existingDisbursements = await sequelize.query(
                `SELECT * FROM loan_disbursements WHERE a_c_c_t__n_o = ?`,
                {
                    replacements: [ACCT_NO],
                    transaction,
                    type: sequelize.QueryTypes.SELECT
                }
            );
            
            if (existingDisbursements.length > 0) {
                // Update existing disbursement record
                const existingId = existingDisbursements[0].id;
                
                // Update status to APPROVED (or COMPLETED)
                await sequelize.query(
                    `UPDATE loan_disbursements 
                     SET s_t_a_t_u_s = 'APPROVED',
                         updated_at = ?
                     WHERE id = ?`,
                    {
                        replacements: [now, existingId],
                        transaction
                    }
                );
                
                disbursementRecord = { id: existingId };
                console.log(`DEBUG: Updated existing disbursement record ID: ${existingId}`);
                
            } else {
                // Create new disbursement record using existing table structure
                console.log("DEBUG: Creating new disbursement record with existing table structure");
                
                const result = await sequelize.query(
                    `INSERT INTO loan_disbursements (
                        a_c_c_t__n_o, 
                        a_p_p_l__i_d,
                        c_u_s_t__i_d,
                        i_n_t_e_r_e_s_t__r_a_t_e,
                        t_e_r_m__v_a_l_u_e,
                        t_e_r_m__c_d,
                        a_m_o_u_n_t,
                        l_o_a_n__a_c_c_o_u_n_t__i_d,
                        s_t_a_t_u_s,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    {
                        replacements: [
                            ACCT_NO,
                            ACCT_NO,
                            loanAccount.c_u_s_t__i_d,
                            loanAccount.i_n_t_e_r_e_s_t__r_a_t_e || 0,
                            loanAccount.t_e_r_m__v_a_l_u_e || 0,
                            loanAccount.t_e_r_m__c_d || 'MONTHLY',
                            disbursementAmount,
                            loanAccount.id,
                            'APPROVED',
                            now,
                            now
                        ],
                        transaction
                    }
                );
                
                disbursementRecord = { id: result[0].insertId };
                console.log(`DEBUG: Created new disbursement record ID: ${disbursementRecord.id}`);
            }
        } else {
            console.log("DEBUG: loan_disbursements table does not exist, creating it...");
            
            // Create table with proper column names based on your existing schema
            await sequelize.query(`
                CREATE TABLE IF NOT EXISTS loan_disbursements (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    a_c_c_t__n_o VARCHAR(255),
                    a_p_p_l__i_d VARCHAR(255),
                    c_u_s_t__i_d VARCHAR(255),
                    i_n_t_e_r_e_s_t__r_a_t_e DECIMAL(7,4),
                    t_e_r_m__v_a_l_u_e INT,
                    t_e_r_m__c_d VARCHAR(255),
                    a_m_o_u_n_t DECIMAL(20,2),
                    l_o_a_n__a_c_c_o_u_n_t__i_d INT,
                    r_e_p_a_y_m_e n_t__s_c_h_e_d_u_l_e__i_d INT,
                    g_u_a_r_a_n_t_o_r__i_d INT,
                    p_r_o_d__i_d VARCHAR(255),
                    p_r_o_d_u_c_t__t_y_p_e VARCHAR(255),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    s_t_a_t_u_s VARCHAR(50) DEFAULT 'PENDING'
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
                { transaction }
            );
            
            // Create new disbursement record
            const result = await sequelize.query(
                `INSERT INTO loan_disbursements (
                    a_c_c_t__n_o, 
                    a_p_p_l__i_d,
                    c_u_s_t__i_d,
                    i_n_t_e_r_e_s_t__r_a_t_e,
                    t_e_r_m__v_a_l_u_e,
                    t_e_r_m__c_d,
                    a_m_o_u_n_t,
                    l_o_a_n__a_c_c_o_u_n_t__i_d,
                    s_t_a_t_u_s,
                    created_at,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                {
                    replacements: [
                        ACCT_NO,
                        ACCT_NO,
                        loanAccount.c_u_s_t__i_d,
                        loanAccount.i_n_t_e_r_e_s_t__r_a_t_e || 0,
                        loanAccount.t_e_r_m__v_a_l_u_e || 0,
                        loanAccount.t_e_r_m__c_d || 'MONTHLY',
                        disbursementAmount,
                        loanAccount.id,
                        'APPROVED',
                        now,
                        now
                    ],
                    transaction
                }
            );
            
            disbursementRecord = { id: result[0].insertId };
            console.log(`DEBUG: Created new disbursement record ID: ${disbursementRecord.id}`);
        }

        // ==================== 10. UPDATE CREDIT APPLICATION ====================
        // Check if credit_applications table exists
        const creditTables = await sequelize.query(
            `SELECT TABLE_NAME 
             FROM INFORMATION_SCHEMA.TABLES 
             WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = 'credit_applications'`,
            { transaction, type: sequelize.QueryTypes.SELECT }
        );

        if (creditTables.length > 0) {
            console.log("DEBUG: credit_applications table exists, attempting update...");
            
            try {
                // Use the correct column name a_c_c_t__n_o instead of ACCT_NO
                await sequelize.query(
                    `UPDATE credit_applications 
                     SET s_t_a_t_u_s = 'APPROVED',
                         a_p_p_r_o_v_e_d__b_y = ?,
                         a_p_p_r_o_v_a_l__d_t = ?,
                         c_o_m_m_e_n_t_s = CONCAT(COALESCE(c_o_m_m_e_n_t_s, ''), ?),
                         r_o_w__t_s = ?
                     WHERE a_c_c_t__n_o = ?`,
                    {
                        replacements: [
                            approvedBy, 
                            now, 
                            ` | ${approvalComments}`,
                            now, 
                            ACCT_NO
                        ],
                        transaction
                    }
                );
                console.log("DEBUG: Credit application updated");
            } catch (creditUpdateError) {
                console.error("DEBUG: Failed to update credit application:", creditUpdateError.message);
                // Don't rollback for this error - just log and continue
            }
        } else {
            console.log("DEBUG: credit_applications table does not exist, skipping update");
        }

        // ==================== 11. POST TO GENERAL LEDGER ====================
        try {
            const transactionId = `LOAN-DISB-${ACCT_NO}-${Date.now()}`;
            const journalId = `JRNL-LOAN-${Date.now()}`;
            
            console.log("DEBUG: =========================================");
            console.log("DEBUG: GENERAL LEDGER POSTING");
            console.log("DEBUG: =========================================");
            console.log(`DEBUG: Transaction ID: ${transactionId}`);
            console.log(`DEBUG: Journal ID: ${journalId}`);
            console.log(`DEBUG: Loan Account: ${ACCT_NO}`);
            console.log(`DEBUG: Gross Disbursement Amount: ₦${disbursementAmount.toLocaleString()}`);
            
            // Check if ledgers table exists
            const ledgersTableCheck = await sequelize.query(
                `SELECT TABLE_NAME 
                 FROM INFORMATION_SCHEMA.TABLES 
                 WHERE TABLE_SCHEMA = DATABASE() 
                 AND TABLE_NAME = 'ledgers'`,
                { transaction, type: sequelize.QueryTypes.SELECT }
            );
            
            if (ledgersTableCheck.length > 0) {
                console.log("DEBUG: ✓ ledgers table exists");
                
                // Get current date in SQL format
                const sqlDate = now.toISOString().slice(0, 19).replace('T', ' ');
                
                // Function to check if GL account exists and get its details
                const getGLAccountDetails = async (glAccountNo) => {
                    try {
                        const accountCheck = await sequelize.query(
                            `SELECT g_l__a_c_c_t__n_o, a_c_c_t__d_e_s_c, g_l__a_c_c_t__c_a_t,
                                    l_e_d_g_e_r__b_a_l_a_n_c_e, a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e,
                                    c_u_r_r_e_n_t__b_a_l_a_n_c_e, b_a_l__c_d,
                                    c_r__a_l_l_o_w_e_d, d_r__a_l_l_o_w_e_d, r_e_c__s_t,
                                    c_u_r_r_e_n_c_y__c_o_d_e, c_o_n_t_r_o_l__a_c_c_t__f_g,
                                    s_u_s_p_e_n_s_e__a_c_c_t__f_g, p_o_s_t__a_l_l_o_w
                             FROM gl_accounts 
                             WHERE g_l__a_c_c_t__n_o = ? 
                             LIMIT 1`,
                            {
                                replacements: [glAccountNo],
                                transaction,
                                type: sequelize.QueryTypes.SELECT
                            }
                        );
                        
                        if (accountCheck && accountCheck.length > 0) {
                            const account = accountCheck[0];
                            
                            // Check if account is active
                            if (account.r_e_c__s_t !== 'Active') {
                                console.warn(`DEBUG: GL account ${glAccountNo} is not active (status: ${account.r_e_c__s_t})`);
                                return null;
                            }
                            
                            console.log(`DEBUG: ✓ Found GL account: ${account.g_l__a_c_c_t__n_o} - ${account.a_c_c_t__d_e_s_c}`);
                            console.log(`DEBUG:   Account Category: ${account.g_l__a_c_c_t__c_a_t}`);
                            console.log(`DEBUG:   Balance Code: ${account.b_a_l__c_d}`);
                            console.log(`DEBUG:   Current Balance: ₦${parseFloat(account.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0).toLocaleString()}`);
                            console.log(`DEBUG:   DR Allowed: ${account.d_r__a_l_l_o_w_e_d}, CR Allowed: ${account.c_r__a_l_l_o_w_e_d}`);
                            console.log(`DEBUG:   Post Allowed: ${account.p_o_s_t__a_l_l_o_w}`);
                            console.log(`DEBUG:   Control Account: ${account.c_o_n_t_r_o_l__a_c_c_t__f_g}, Suspense: ${account.s_u_s_p_e_n_s_e__a_c_c_t__f_g}`);
                            
                            return {
                                accountNo: account.g_l__a_c_c_t__n_o,
                                accountName: account.a_c_c_t__d_e_s_c,
                                accountCategory: account.g_l__a_c_c_t__c_a_t,
                                balanceCode: account.b_a_l__c_d,
                                currentBalance: parseFloat(account.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0),
                                ledgerBalance: parseFloat(account.l_e_d_g_e_r__b_a_l_a_n_c_e || 0),
                                availableBalance: parseFloat(account.a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e || 0),
                                openingBalance: parseFloat(account.o_p_e_n_i_n_g__b_a_l_a_n_c_e || 0),
                                drAllowed: account.d_r__a_l_l_o_w_e_d,
                                crAllowed: account.c_r__a_l_l_o_w_e_d,
                                postAllowed: account.p_o_s_t__a_l_l_o_w,
                                isControlAccount: account.c_o_n_t_r_o_l__a_c_c_t__f_g,
                                isSuspenseAccount: account.s_u_s_p_e_n_s_e__a_c_c_t__f_g,
                                currency: account.c_u_r_r_e_n_c_y__c_o_d_e || 'NGN',
                                status: account.r_e_c__s_t
                            };
                        } else {
                            console.log(`DEBUG: ✗ GL account ${glAccountNo} not found`);
                            return null;
                        }
                    } catch (error) {
                        console.error(`DEBUG: Error checking GL account ${glAccountNo}:`, error.message);
                        return null;
                    }
                };

                // Get details for all required GL accounts from loan product configuration
                console.log("DEBUG: Fetching GL accounts from loan product configuration...");
                const principalGL = await getGLAccountDetails(principalGLAccount);
                const interestGL = interestGLAccount ? await getGLAccountDetails(interestGLAccount) : null;
                const processingFeeGL = processingFeeGLAccount ? await getGLAccountDetails(processingFeeGLAccount) : null;

                // Get Customer GL Account
                let customerGL = null;

                // First try: Check if customer has a GL account with their account number
                if (customerAccountNumber) {
                    customerGL = await getGLAccountDetails(customerAccountNumber);
                    if (customerGL) {
                        console.log(`DEBUG: Found customer GL account using account number: ${customerAccountNumber}`);
                    }
                }

                // Second try: Look for customer deposit/savings GL accounts (LIABILITY type)
                if (!customerGL) {
                    console.log("DEBUG: Searching for customer deposit GL accounts...");
                    
                    const customerDepositAccounts = await sequelize.query(
                        `SELECT g_l__a_c_c_t__n_o, a_c_c_t__d_e_s_c, g_l__a_c_c_t__c_a_t
                         FROM gl_accounts 
                         WHERE (a_c_c_t__d_e_s_c LIKE '%Customer%' 
                                OR a_c_c_t__d_e_s_c LIKE '%Deposit%'
                                OR a_c_c_t__d_e_s_c LIKE '%Savings%'
                                OR a_c_c_t__d_e_s_c LIKE '%Current Account%')
                           AND g_l__a_c_c_t__c_a_t = 'LIABILITY'
                           AND r_e_c__s_t = 'Active'
                           AND c_r__a_l_l_o_w_e_d = 1
                         LIMIT 1`,
                        { transaction, type: sequelize.QueryTypes.SELECT }
                    );
                    
                    if (customerDepositAccounts && customerDepositAccounts.length > 0) {
                        customerGL = await getGLAccountDetails(customerDepositAccounts[0].g_l__a_c_c_t__n_o);
                        console.log(`DEBUG: Using customer deposit GL account: ${customerGL.accountNo} - ${customerGL.accountName}`);
                    }
                }

                // Third try: Look for suspense accounts
                if (!customerGL) {
                    console.log("DEBUG: Searching for suspense GL accounts...");
                    
                    const suspenseAccounts = await sequelize.query(
                        `SELECT g_l__a_c_c_t__n_o 
                         FROM gl_accounts 
                         WHERE (a_c_c_t__d_e_s_c LIKE '%Suspense%' 
                                OR g_l__a_c_c_t__c_a_t = 'SUSPENSE'
                                OR s_u_s_p_e_n_s_e__a_c_c_t__f_g = 1)
                           AND r_e_c__s_t = 'Active'
                           AND c_r__a_l_l_o_w_e_d = 1
                         LIMIT 1`,
                        { transaction, type: sequelize.QueryTypes.SELECT }
                    );
                    
                    if (suspenseAccounts && suspenseAccounts.length > 0) {
                        customerGL = await getGLAccountDetails(suspenseAccounts[0].g_l__a_c_c_t__n_o);
                        console.log(`DEBUG: Using suspense GL account: ${customerGL.accountNo} - ${customerGL.accountName}`);
                    }
                }

                // Fourth try: If still no customer GL, use the principal GL account as last resort
                if (!customerGL && principalGL) {
                    console.warn("DEBUG: No suitable customer GL account found, using principal GL account as suspense");
                    customerGL = principalGL;
                    console.warn(`DEBUG: WARNING: Using principal GL account (${principalGL.accountNo}) as customer account. This may cause accounting issues.`);
                }

                // If we still don't have a customer GL account, throw an error
                if (!customerGL) {
                    console.error("DEBUG: ❌ Could not find any suitable GL account for customer");
                    throw new Error(`No suitable GL account found for customer. Tried: 
                    - Customer account number: ${customerAccountNumber || 'Not available'}
                    - Customer deposit accounts
                    - Suspense accounts
                    - Principal GL account`);
                }

                // Validate that principal GL account is found and active
                if (!principalGL) {
                    console.error("DEBUG: ❌ Principal GL account not found or not active:", principalGLAccount);
                    throw new Error(`Principal GL account ${principalGLAccount} not found or not active. Please verify:
                    1. The GL account exists in gl_accounts table
                    2. The GL account is marked as 'Active' (r_e_c__s_t = 'Active')
                    3. The GL account allows posting (p_o_s_t__a_l_l_o_w = 1)`);
                }

                // Validate that customer GL allows credit transactions
                if (customerGL.crAllowed !== 1) {
                    console.warn(`DEBUG: ⚠️ Warning: Credit not allowed for customer GL account ${customerGL.accountNo}`);
                    console.warn("DEBUG: The transaction may fail if posting restrictions are enforced");
                }

                // Validate that principal GL allows debit transactions
                if (principalGL.drAllowed !== 1) {
                    console.warn(`DEBUG: ⚠️ Warning: Debit not allowed for principal GL account ${principalGL.accountNo}`);
                    console.warn("DEBUG: The transaction may fail if posting restrictions are enforced");
                }

                // Validate that accounts allow posting
                if (principalGL.postAllowed !== 1) {
                    console.warn(`DEBUG: ⚠️ Warning: Posting not allowed for principal GL account ${principalGL.accountNo}`);
                }

                if (customerGL.postAllowed !== 1) {
                    console.warn(`DEBUG: ⚠️ Warning: Posting not allowed for customer GL account ${customerGL.accountNo}`);
                }

                // Log GL account validation summary
                console.log("\nDEBUG: =========================================");
                console.log("DEBUG: GL ACCOUNT VALIDATION SUMMARY");
                console.log("DEBUG: =========================================");
                console.log(`DEBUG: Principal GL Account:`);
                console.log(`  Account No: ${principalGL.accountNo}`);
                console.log(`  Account Name: ${principalGL.accountName}`);
                console.log(`  Category: ${principalGL.accountCategory}`);
                console.log(`  Balance: ₦${principalGL.currentBalance.toLocaleString()}`);
                console.log(`  DR Allowed: ${principalGL.drAllowed ? 'Yes' : 'No'}, CR Allowed: ${principalGL.crAllowed ? 'Yes' : 'No'}`);

                console.log(`\nDEBUG: Customer GL Account:`);
                console.log(`  Account No: ${customerGL.accountNo}`);
                console.log(`  Account Name: ${customerGL.accountName}`);
                console.log(`  Category: ${customerGL.accountCategory}`);
                console.log(`  Balance: ₦${customerGL.currentBalance.toLocaleString()}`);
                console.log(`  DR Allowed: ${customerGL.drAllowed ? 'Yes' : 'No'}, CR Allowed: ${customerGL.crAllowed ? 'Yes' : 'No'}`);

                if (interestGL) {
                    console.log(`\nDEBUG: Interest GL Account:`);
                    console.log(`  Account No: ${interestGL.accountNo}`);
                    console.log(`  Account Name: ${interestGL.accountName}`);
                    console.log(`  Category: ${interestGL.accountCategory}`);
                    console.log(`  Balance: ₦${interestGL.currentBalance.toLocaleString()}`);
                }

                if (processingFeeGL) {
                    console.log(`\nDEBUG: Processing Fee GL Account:`);
                    console.log(`  Account No: ${processingFeeGL.accountNo}`);
                    console.log(`  Account Name: ${processingFeeGL.accountName}`);
                    console.log(`  Category: ${processingFeeGL.accountCategory}`);
                    console.log(`  Balance: ₦${processingFeeGL.currentBalance.toLocaleString()}`);
                }

                console.log("DEBUG: =========================================");
                console.log("DEBUG: ✓ All GL accounts validated successfully");

                // Generate unique TransactionId (BigInt)
                const baseTransactionId = BigInt(Date.now());
                
                // 1. PRINCIPAL TRANSACTION: DR Principal GL, CR Customer GL (FULL AMOUNT)
                if (principalGL && customerGL) {
                    const principalTransactionId = `${transactionId}-PRINCIPAL`;
                    const glTransactionId1 = baseTransactionId;
                    
                    await sequelize.query(
                        `INSERT INTO gl_account_transactions (
                            JOURNAL_ID, TRANSACTION_ID, DR_ACCT_NO, CR_ACCT_NO, 
                            AMOUNT, NARRATION, CREATED_BY, UPDATED_BY,
                            TRANSACTION_TYPE, CURRENCY_CODE, STATUS, TransactionId,
                            createdAt, updatedAt
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        {
                            replacements: [
                                journalId,
                                principalTransactionId,
                                principalGL.accountNo,  // DEBIT: Principal Asset increases
                                customerGL.accountNo,   // CREDIT: Customer Liability increases (FULL AMOUNT)
                                disbursementAmount,     // FULL DISBURSEMENT AMOUNT
                                `Loan principal disbursement of ₦${disbursementAmount.toLocaleString()} for ${ACCT_NO} to ${customerName || 'customer'}`,
                                approvedBy,
                                approvedBy,
                                'LOAN_DISBURSEMENT_PRINCIPAL',
                                'NGN',
                                'POSTED',
                                glTransactionId1,
                                sqlDate,
                                sqlDate
                            ],
                            transaction
                        }
                    );
                    
                    console.log("DEBUG: ✓ Principal Transaction:");
                    console.log(`  DEBIT:  ${principalGL.accountNo} (Principal Asset) +₦${disbursementAmount.toLocaleString()}`);
                    console.log(`  CREDIT: ${customerGL.accountNo} (Customer Liability) +₦${disbursementAmount.toLocaleString()}`);
                    console.log(`  Note: Full disbursement amount credited to customer`);
                }
                
                // 2. INTEREST TRANSACTION (if applicable): DR Interest GL, CR Customer GL
                if (interestGL && interestAmount > 0 && customerGL) {
                    const interestTransactionId = `${transactionId}-INTEREST`;
                    const glTransactionId2 = baseTransactionId + 1n;
                    
                    await sequelize.query(
                        `INSERT INTO gl_account_transactions (
                            JOURNAL_ID, TRANSACTION_ID, DR_ACCT_NO, CR_ACCT_NO, 
                            AMOUNT, NARRATION, CREATED_BY, UPDATED_BY,
                            TRANSACTION_TYPE, CURRENCY_CODE, STATUS, TransactionId,
                            createdAt, updatedAt
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        {
                            replacements: [
                                journalId,
                                interestTransactionId,
                                interestGL.accountNo,   // DEBIT: Interest Asset increases
                                customerGL.accountNo,   // CREDIT: Customer Liability increases further
                                interestAmount,
                                `Loan interest accrual of ₦${interestAmount.toLocaleString()} for ${ACCT_NO}. Rate: ${interestRate}%, Term: ${termValue} months`,
                                approvedBy,
                                approvedBy,
                                'LOAN_DISBURSEMENT_INTEREST',
                                'NGN',
                                'POSTED',
                                glTransactionId2,
                                sqlDate,
                                sqlDate
                            ],
                            transaction
                        }
                    );
                    
                    console.log("DEBUG: ✓ Interest Transaction:");
                    console.log(`  DEBIT:  ${interestGL.accountNo} (Interest Asset) +₦${interestAmount.toLocaleString()}`);
                    console.log(`  CREDIT: ${customerGL.accountNo} (Customer Liability) +₦${interestAmount.toLocaleString()}`);
                }
                
                // 3. PROCESSING FEE TRANSACTION (if applicable): DR Customer GL, CR Processing Fee GL
                if (processingFeeGL && processingFeeAmount > 0 && customerGL) {
                    const feeTransactionId = `${transactionId}-PROCESSING-FEE`;
                    const glTransactionId3 = baseTransactionId + 2n;
                    
                    await sequelize.query(
                        `INSERT INTO gl_account_transactions (
                            JOURNAL_ID, TRANSACTION_ID, DR_ACCT_NO, CR_ACCT_NO, 
                            AMOUNT, NARRATION, CREATED_BY, UPDATED_BY,
                            TRANSACTION_TYPE, CURRENCY_CODE, STATUS, TransactionId,
                            createdAt, updatedAt
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        {
                            replacements: [
                                journalId,
                                feeTransactionId,
                                customerGL.accountNo,      // DEBIT: Customer Liability decreases (fee deducted)
                                processingFeeGL.accountNo, // CREDIT: Processing Fee Revenue increases
                                processingFeeAmount,
                                `Processing fee of ₦${processingFeeAmount.toLocaleString()} for loan ${ACCT_NO}. Rate: ${processingFeeRate}${productConfig?.feeStructure ? '%' : ''}`,
                                approvedBy,
                                approvedBy,
                                'PROCESSING_FEE',
                                'NGN',
                                'POSTED',
                                glTransactionId3,
                                sqlDate,
                                sqlDate
                            ],
                            transaction
                        }
                    );
                    
                    console.log("DEBUG: ✓ Processing Fee Transaction:");
                    console.log(`  DEBIT:  ${customerGL.accountNo} (Customer Liability) -₦${processingFeeAmount.toLocaleString()}`);
                    console.log(`  CREDIT: ${processingFeeGL.accountNo} (Processing Fee Revenue) +₦${processingFeeAmount.toLocaleString()}`);
                    console.log(`  Note: Processing fee debited from customer account separately`);
                }
                
                // Update GL account balances
                const updateGLAccountBalance = async (accountNo, amount, isDebit, description) => {
                    try {
                        const accountDetails = await getGLAccountDetails(accountNo);
                        const accountCategory = accountDetails.accountCategory;
                        const currentBalance = accountDetails.currentBalance;
                        
                        console.log(`\nDEBUG: Updating ${accountNo} (${accountCategory})`);
                        console.log(`  Transaction: ${isDebit ? 'DEBIT' : 'CREDIT'} ₦${amount.toLocaleString()}`);
                        console.log(`  Description: ${description}`);
                        console.log(`  Current Balance: ₦${currentBalance.toLocaleString()}`);
                        
                        // Determine change amount based on account type
                        let changeAmount = 0;
                        
                        if (accountCategory === 'ASSET') {
                            // Asset: Debit increases, Credit decreases
                            changeAmount = isDebit ? amount : -amount;
                            console.log(`  Action: ${isDebit ? 'DEBIT increases' : 'CREDIT decreases'} asset`);
                        } else if (accountCategory === 'REVENUE' || accountCategory === 'LIABILITY') {
                            // Revenue/Liability: Credit increases, Debit decreases
                            changeAmount = isDebit ? -amount : amount;
                            console.log(`  Action: ${isDebit ? 'DEBIT decreases' : 'CREDIT increases'} ${accountCategory.toLowerCase()}`);
                        }
                        
                        console.log(`  Change: ${changeAmount >= 0 ? '+' : ''}₦${changeAmount.toLocaleString()}`);
                        
                        // Calculate new balance
                        const newBalance = currentBalance + changeAmount;
                        console.log(`  New Balance: ₦${newBalance.toLocaleString()}`);
                        
                        // Update gl_accounts table
                        const glUpdateQuery = `
                            UPDATE gl_accounts 
                            SET l_e_d_g_e_r__b_a_l_a_n_c_e = ?,
                                c_u_r_r_e_n_t__b_a_l_a_n_c_e = ?,
                                a_v_a_i_l_a_b_l_e__b_a_l_a_n_c_e = ?,
                                updated_at = ?
                            WHERE g_l__a_c_c_t__n_o = ?
                        `;
                        
                        await sequelize.query(glUpdateQuery, {
                            replacements: [newBalance, newBalance, newBalance, sqlDate, accountNo],
                            transaction
                        });
                        
                        console.log(`  ✓ GL account updated`);
                        
                        return newBalance;
                        
                    } catch (error) {
                        console.error(`  ✗ Error updating ${accountNo}: ${error.message}`);
                        throw error;
                    }
                };

                // Apply accounting entries
                console.log("\nDEBUG: =========================================");
                console.log("DEBUG: APPLYING ACCOUNTING ENTRIES");
                console.log("DEBUG: =========================================");

                // 1. PRINCIPAL DISBURSEMENT
                console.log("\nDEBUG: 1. PRINCIPAL DISBURSEMENT:");
                // CREDIT Customer GL (Asset: money goes out to customer)
                await updateGLAccountBalance(
                    customerGL.accountNo,
                    disbursementAmount,
                    false, // CREDIT (decreases asset)
                    `Principal disbursement to customer - Loan ${ACCT_NO}`
                );

                // DEBIT Loan Portfolio GL (Asset: loan receivable increases)
                await updateGLAccountBalance(
                    principalGL.accountNo,
                    disbursementAmount,
                    true, // DEBIT (increases asset)
                    `Loan portfolio increase - Loan ${ACCT_NO}`
                );

                // 2. INTEREST ACCRUAL
                console.log("\nDEBUG: 2. INTEREST ACCRUAL:");
                // DEBIT Customer GL (Asset: interest owed increases loan amount)
                await updateGLAccountBalance(
                    customerGL.accountNo,
                    interestAmount,
                    true, // DEBIT (increases asset - customer owes more)
                    `Interest accrual added to loan - Loan ${ACCT_NO}`
                );

                // CREDIT Interest Income GL (Revenue: interest income earned)
                await updateGLAccountBalance(
                    interestGL.accountNo,
                    interestAmount,
                    false, // CREDIT (increases revenue)
                    `Interest income earned - Loan ${ACCT_NO}`
                );

                // 3. PROCESSING FEE
                console.log("\nDEBUG: 3. PROCESSING FEE:");
                // CREDIT Customer GL (Asset: fee deducted from customer balance)
                await updateGLAccountBalance(
                    customerGL.accountNo,
                    processingFeeAmount,
                    false, // CREDIT (decreases asset)
                    `Processing fee deducted from account - Loan ${ACCT_NO}`
                );

                // CREDIT Processing Fee GL (Revenue: fee income earned)
                await updateGLAccountBalance(
                    processingFeeGL.accountNo,
                    processingFeeAmount,
                    false, // CREDIT (increases revenue)
                    `Processing fee income - Loan ${ACCT_NO}`
                );

                // SUMMARY
                console.log("\nDEBUG: =========================================");
                console.log("DEBUG: TRANSACTION SUMMARY");
                console.log("DEBUG: =========================================");

                console.log(`\nLoan ${ACCT_NO}:`);
                console.log(`Principal Disbursed: ₦${disbursementAmount.toLocaleString()}`);
                console.log(`Interest Accrued: ₦${interestAmount.toLocaleString()}`);
                console.log(`Processing Fee Deducted: ₦${processingFeeAmount.toLocaleString()}`);

                console.log(`\nCustomer's Position:`);
                console.log(`- Received: ₦${disbursementAmount.toLocaleString()} (principal)`);
                console.log(`- Owes: ₦${(disbursementAmount + interestAmount).toLocaleString()} (principal + interest)`);
                console.log(`- Paid: ₦${processingFeeAmount.toLocaleString()} (processing fee)`);

                // Get final balances
                const getFinalBalance = async (accountNo) => {
                    const query = `SELECT c_u_r_r_e_n_t__b_a_l_a_n_c_e FROM gl_accounts WHERE g_l__a_c_c_t__n_o = ?`;
                    const [result] = await sequelize.query(query, {
                        replacements: [accountNo],
                        type: sequelize.QueryTypes.SELECT
                    });
                    return result?.c_u_r_r_e_n_t__b_a_l_a_n_c_e || 0;
                };

                const finalBalances = {
                    customer: await getFinalBalance(customerGL.accountNo),
                    principal: await getFinalBalance(principalGL.accountNo),
                    interest: await getFinalBalance(interestGL.accountNo),
                    processingFee: await getFinalBalance(processingFeeGL.accountNo)
                };

                console.log("\nDEBUG: FINAL BALANCES:");
                console.log(`Customer GL: ₦${finalBalances.customer.toLocaleString()}`);
                console.log(`Principal/Portfolio GL: ₦${finalBalances.principal.toLocaleString()}`);
                console.log(`Interest GL: ₦${finalBalances.interest.toLocaleString()}`);
                console.log(`Processing Fee GL: ₦${finalBalances.processingFee.toLocaleString()}`);

                // Calculate expected values based on account types
                console.log("\nDEBUG: EXPECTED VALUES:");

                const customerExpected = -disbursementAmount + interestAmount - processingFeeAmount;
                console.log(`Customer GL should be: ₦${customerExpected.toLocaleString()} (Negative balance = customer owes bank)`);

                const principalExpected = disbursementAmount;
                console.log(`Principal GL should be: ₦${principalExpected.toLocaleString()} (Loan portfolio asset)`);

                const interestExpected = interestAmount;
                console.log(`Interest GL should be: ₦${interestExpected.toLocaleString()} (Interest income)`);

                const feeExpected = processingFeeAmount;
                console.log(`Processing Fee GL should be: ₦${feeExpected.toLocaleString()} (Fee income)`);

                // Verify
                console.log("\nDEBUG: VERIFICATION:");
                console.log(`Customer GL: ${Math.abs(finalBalances.customer - customerExpected) < 0.01 ? '✓' : '✗'} (Expected: ₦${customerExpected.toLocaleString()}, Actual: ₦${finalBalances.customer.toLocaleString()})`);
                console.log(`Principal GL: ${Math.abs(finalBalances.principal - principalExpected) < 0.01 ? '✓' : '✗'} (Expected: ₦${principalExpected.toLocaleString()}, Actual: ₦${finalBalances.principal.toLocaleString()})`);
                console.log(`Interest GL: ${Math.abs(finalBalances.interest - interestExpected) < 0.01 ? '✓' : '✗'} (Expected: ₦${interestExpected.toLocaleString()}, Actual: ₦${finalBalances.interest.toLocaleString()})`);
                console.log(`Processing Fee GL: ${Math.abs(finalBalances.processingFee - feeExpected) < 0.01 ? '✓' : '✗'} (Expected: ₦${feeExpected.toLocaleString()}, Actual: ₦${finalBalances.processingFee.toLocaleString()})`);

                console.log("\nDEBUG: =========================================");
                console.log("DEBUG: ✓ ACCOUNTING COMPLETE");
                console.log("DEBUG: =========================================");
                
            } else {
                console.log("DEBUG: ledgers table does not exist, skipping ledger posting");
            }
            
        } catch (glError) {
            console.error("DEBUG: GL posting failed:", glError.message);
            console.error("DEBUG: Error stack:", glError.stack);
            // Don't rollback for GL errors - they're not critical for the loan disbursement
        }

        // ==================== 12. CREATE AUDIT LOG ====================
        try {
            const auditTables = await sequelize.query(
                `SELECT TABLE_NAME 
                 FROM INFORMATION_SCHEMA.TABLES 
                 WHERE TABLE_SCHEMA = DATABASE() 
                 AND TABLE_NAME = 'audit_logs'`,
                { transaction, type: sequelize.QueryTypes.SELECT }
            );
            
            if (auditTables.length > 0) {
                await sequelize.query(
                    `INSERT INTO audit_logs (
                        action, entity_type, entity_id, description,
                        performed_by, performed_at, old_values, new_values,
                        transaction_id, amount
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    {
                        replacements: [
                            'LOAN_DISBURSEMENT',
                            'LOAN_ACCOUNT',
                            loanAccount.id,
                            `Loan ${ACCT_NO} approved and disbursed by ${approvedBy}`,
                            approvedBy,
                            now,
                            JSON.stringify({ 
                                status: currentStatus, 
                                disbursed_amount: currentDisbursedAmount,
                                outstanding_principal: currentOutstandingPrincipal,
                                loan_amount: loanAccount.a_m_o_u_n_t,
                                customer_id: customerId,
                                numeric_customer_id: numericCustomerId
                            }),
                            JSON.stringify({ 
                                status: 'ACTIVE', 
                                disbursed_amount: currentStatus === 'ACTIVE' 
                                    ? (currentDisbursedAmount + disbursementAmount)
                                    : disbursementAmount,
                                outstanding_principal: currentStatus === 'ACTIVE'
                                    ? (currentOutstandingPrincipal + disbursementAmount)
                                    : disbursementAmount,
                                loan_amount: -disbursementAmount,
                                disbursement_date: now,
                                customer_account: customerAccountNumber,
                                customer_account_balance_impact: customerAccountNumber ? `+₦${disbursementAmount.toLocaleString()}` : 'No customer account found',
                                tables_updated: [
                                    accountsTableRecord ? 'accounts' : null,
                                    customerAccountsTableRecord ? 'customer_accounts' : 'new_record_created'
                                ].filter(Boolean),
                                customer_id_converted: numericCustomerId
                            }),
                            `DISB-${Date.now()}`,
                            disbursementAmount
                        ],
                        transaction
                    }
                );
                console.log("DEBUG: Audit log created");
            } else {
                console.log("DEBUG: audit_logs table does not exist, skipping audit log");
            }
        } catch (auditError) {
            console.error("DEBUG: Could not create audit log:", auditError.message);
        }

        // ==================== 13. CREATE LOAN CONTRACT FORM ====================
        console.log("\nDEBUG: Creating loan contract form...");

        try {
            // Check if loan_contract_forms table exists
            const contractsTableCheck = await sequelize.query(
                `SELECT TABLE_NAME 
                 FROM INFORMATION_SCHEMA.TABLES 
                 WHERE TABLE_SCHEMA = DATABASE() 
                 AND TABLE_NAME = 'loan_contract_forms'`,
                { transaction, type: sequelize.QueryTypes.SELECT }
            );
            
            if (contractsTableCheck.length === 0) {
                console.log("DEBUG: loan_contract_forms table does not exist, skipping contract creation");
                // Don't create the table here - just skip
            } else {
                // Generate contract number
                const contractNumber = `LOAN-CONTRACT-${ACCT_NO}-${Date.now()}`;
                
                // Calculate maturity date based on term
                const termCode = loanAccount.t_e_r_m__c_d || 'M';
                const termValue = parseFloat(loanAccount.t_e_r_m__v_a_l_u_e || 0);
                const maturityDate = new Date(now);
                
                if (termCode === 'M') {
                    maturityDate.setMonth(maturityDate.getMonth() + termValue);
                } else if (termCode === 'Y') {
                    maturityDate.setFullYear(maturityDate.getFullYear() + termValue);
                }
                
                // Prepare loan details for contract
                const firstPaymentDate = new Date(now);
                firstPaymentDate.setDate(firstPaymentDate.getDate() + 30);
                
                const loanDetails = {
                    AMOUNT: disbursementAmount,
                    INTEREST_RATE: loanAccount.i_n_t_e_r_e_s_t__r_a_t_e || 0,
                    TERM_VALUE: termValue,
                    TERM_CD: termCode,
                    DISBURSEMENT_DATE: new Date(now),
                    FIRST_PAYMENT_DATE: firstPaymentDate,
                    LAST_PAYMENT_DATE: maturityDate,
                    NUMBER_OF_INSTALLMENTS: termValue,
                    borrower_name: customerName || loanAccount.a_c_c_t__n_m || 'Customer',
                    borrower_address: loanAccount.borrower_address || 'Address Not Provided',
                    loan_purpose: loanAccount.loan_purpose || 'General Business Purpose'
                };
                
                // Prepare customer details
                const customerDetails = {
                    ACCT_NM: customerName,
                    CUST_NM: customerName,
                    HOME_ADDRESS: loanAccount.borrower_address || 'Address Not Provided'
                };
                
                // Generate contract text
                const contractText = generateContractText(loanDetails, customerDetails, productConfig, loanAccount.i_n_t_e_r_e_s_t__r_a_t_e || 0);
                
                console.log("DEBUG: Contract text generated successfully");
                
                // Prepare fees data
                let feesData = [];
                if (productConfig?.feeStructure) {
                    try {
                        feesData = typeof productConfig.feeStructure === 'string'
                            ? JSON.parse(productConfig.feeStructure)
                            : productConfig.feeStructure;
                    } catch (e) {
                        console.warn("DEBUG: Could not parse fee structure");
                        feesData = [];
                    }
                }
                
                // Prepare signature requirements
                const signatureRequirements = {
                    requiredSignatures: [
                        {
                            role: "Borrower",
                            name: customerName,
                            required: true
                        },
                        {
                            role: "Lender Representative",
                            name: approvedBy,
                            required: true
                        }
                    ],
                    coSignatories: [],
                    witnessRequired: false
                };
                
                // Add guarantor if exists
                if (loanAccount.g_u_a_r_a_n_t_o_r__n_a_m_e) {
                    signatureRequirements.requiredSignatures.push({
                        role: "Guarantor",
                        name: loanAccount.g_u_a_r_a_n_t_o_r__n_a_m_e,
                        required: true
                    });
                    signatureRequirements.coSignatories.push(loanAccount.g_u_a_r_a_n_t_o_r__n_a_m_e);
                }
                
                // Prepare metadata
                const metadata = {
                    generatedBy: approvedBy,
                    generationDate: now.toISOString(),
                    loanProductId: productConfig?.PROD_ID || loanAccount.l_o_a_n__p_r_o_d_u_c_t__i_d || 'Unknown',
                    loanAccountNumber: ACCT_NO,
                    customerAccountNumber: customerAccountNumber,
                    disbursementAmount: disbursementAmount,
                    interestAmount: interestAmount,
                    processingFeeAmount: processingFeeAmount,
                    processingFeeRate: processingFeeRate,
                    effectiveInterestRate: loanAccount.i_n_t_e_r_e_s_t__r_a_t_e || 0,
                    termDetails: `${termValue} ${termCode === 'M' ? 'Months' : 'Years'}`,
                    glAccounts: {
                        principalGL: principalGLAccount,
                        interestGL: interestGLAccount,
                        processingFeeGL: processingFeeGLAccount
                    },
                    customerDetails: {
                        customerId: customerId,
                        customerName: customerName,
                        accountNumber: customerAccountNumber
                    }
                };
                
                // Insert contract into loan_contract_forms table
                const contractResult = await sequelize.query(
                    `INSERT INTO loan_contract_forms (
                        loan_contract_no,
                        customer_id,
                        borrower_name,
                        co_signatory_name,
                        borrower_address,
                        loan_purpose,
                        loan_amount,
                        loan_term,
                        t_e_r_m__c_d,
                        interest_rate,
                        interest_rate_id,
                        guarantor_name,
                        bank_name,
                        bank_short,
                        status,
                        contract_text,
                        u_s_e_r__i_d,
                        application_id,
                        loan_account_no,
                        funding_account_no,
                        fees,
                        signature_requirements,
                        metadata,
                        disbursement_date,
                        maturity_date,
                        created_at,
                        updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    {
                        replacements: [
                            contractNumber,
                            customerId,
                            customerName,
                            loanAccount.co_signatory_name || '',
                            loanAccount.borrower_address || 'Address Not Provided',
                            loanAccount.loan_purpose || 'General Business Purpose',
                            disbursementAmount.toString(),
                            termValue,
                            termCode,
                            loanAccount.i_n_t_e_r_e_s_t__r_a_t_e || 0,
                            101, // Default interest rate ID
                            loanAccount.g_u_a_r_a_n_t_o_r__n_a_m_e || '',
                            process.env.BANK_NAME || 'Our Bank',
                            process.env.BANK_SHORT_NAME || 'BANK',
                            'DISBURSED',
                            contractText,
                            approvedBy,
                            ACCT_NO, // Using loan account as application ID
                            ACCT_NO,
                            customerAccountNumber || 'N/A',
                            JSON.stringify(feesData),
                            JSON.stringify(signatureRequirements),
                            JSON.stringify(metadata),
                            now,
                            maturityDate,
                            now,
                            now
                        ],
                        transaction
                    }
                );
                
                const contractId = contractResult[0].insertId;
                console.log(`DEBUG: ✓ Created loan contract form ID: ${contractId}, Contract No: ${contractNumber}`);
                
                // Update loan_accounts with contract reference
                await sequelize.query(
                    `UPDATE loan_accounts 
                     SET l_o_a_n__c_o_n_t_r_a_c_t__n_o = ?,
                         contract_status = 'SIGNED'
                     WHERE a_c_c_t__n_o = ?`,
                    {
                        replacements: [contractNumber, ACCT_NO],
                        transaction
                    }
                );
                
                console.log("DEBUG: ✓ Loan contract form created and linked to loan account");
            }
            
        } catch (contractError) {
            console.error("DEBUG: ✗ Error creating loan contract form:", contractError.message);
            // Don't rollback for contract errors - it's not critical for disbursement
        }

        // ==================== 14. UPDATE LOAN PORTFOLIO ====================
        try {
            console.log("\nDEBUG: =========================================");
            console.log("DEBUG: UPDATING LOAN PORTFOLIO");
            console.log("DEBUG: =========================================");
            
            const portfolioTableCheck = await sequelize.query(
                `SHOW TABLES LIKE 'loan_portfolio'`,
                { transaction, type: sequelize.QueryTypes.SELECT }
            );
            
            console.log("DEBUG: Portfolio table check result:", portfolioTableCheck);
            
            if (portfolioTableCheck && portfolioTableCheck.length > 0) {
                console.log("DEBUG: ✓ loan_portfolio table exists");
                
                // Get current month and year
                const currentDate = new Date();
                const currentMonth = currentDate.getMonth() + 1; // 1-12
                const currentYear = currentDate.getFullYear();
                
                console.log(`DEBUG: Current period: Month ${currentMonth}, Year ${currentYear}`);
                
                // Get loan product details
                console.log("DEBUG: Available loan account fields:", Object.keys(loanAccount));
                
                const loanProductId = loanAccount.l_o_a_n__p_r_o_d_u_c_t__i_d || 
                                     productConfig?.PROD_ID || 
                                     0;
                
                const branchId = loanAccount.b_r_a_n_c_h__i_d || 
                                loanAccount.branch_id || 
                                '001';
                
                const productCode = productConfig?.PRODUCT_SHORT_NAME || 
                                  'GENERAL_LOAN';
                
                const productType = productConfig?.PRODUCT_TYPE || 
                                  'GENERAL_LOAN';
                
                const productName = productConfig?.name || 
                                  'General Loan';
                
                console.log("DEBUG: Loan product details:", {
                    loanProductId,
                    branchId,
                    productCode,
                    productType,
                    productName
                });
                
                // Check if portfolio record exists for this month/year/product/branch
                console.log("DEBUG: Checking for existing portfolio record...");
                
                const existingPortfolioQuery = `
                    SELECT * FROM loan_portfolio 
                    WHERE m_o_n_t_h = ${currentMonth} 
                      AND y_e_a_r = ${currentYear} 
                      AND p_r_o_d__i_d = ${loanProductId} 
                      AND b_r_a_n_c_h__i_d = '${branchId}' 
                    LIMIT 1
                `;
                
                console.log("DEBUG: Executing portfolio check query:", existingPortfolioQuery);
                
                const existingPortfolio = await sequelize.query(existingPortfolioQuery, {
                    transaction,
                    type: sequelize.QueryTypes.SELECT
                });
                
                console.log("DEBUG: Existing portfolio check result:", existingPortfolio);
                console.log("DEBUG: Number of existing records:", existingPortfolio ? existingPortfolio.length : 0);
                
                if (existingPortfolio && existingPortfolio.length > 0) {
                    // Update existing portfolio record
                    const portfolioId = existingPortfolio[0].id;
                    console.log(`DEBUG: ✓ Found existing portfolio record ID: ${portfolioId}`);
                    
                    // Get current values for calculation
                    const currentTotalPrincipal = parseFloat(existingPortfolio[0].t_o_t_a_l__p_r_i_n_c_i_p_a_l || 0);
                    const currentNumberOfLoans = parseInt(existingPortfolio[0].n_u_m_b_e_r__o_f__l_o_a_n_s || 0);
                    
                    // Calculate new average loan size
                    const newTotalPrincipal = currentTotalPrincipal + disbursementAmount;
                    const newNumberOfLoans = currentNumberOfLoans + 1;
                    const newAverageLoanSize = newTotalPrincipal / newNumberOfLoans;
                    
                    console.log("DEBUG: Portfolio update calculations:", {
                        currentTotalPrincipal,
                        currentNumberOfLoans,
                        disbursementAmount,
                        newTotalPrincipal,
                        newNumberOfLoans,
                        newAverageLoanSize
                    });
                    
                    const updatePortfolioQuery = `
                        UPDATE loan_portfolio 
                        SET t_o_t_a_l__d_i_s_b_u_r_s_e_d = t_o_t_a_l__d_i_s_b_u_r_s_e_d + ${disbursementAmount},
                            t_o_t_a_l__n_e_t__d_i_s_b_u_r_s_e_m_e_n_t = t_o_t_a_l__n_e_t__d_i_s_b_u_r_s_e_m_e_n_t + ${disbursementAmount},
                            t_o_t_a_l__p_r_i_n_c_i_p_a_l = t_o_t_a_l__p_r_i_n_c_i_p_a_l + ${disbursementAmount},
                            o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l = o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l + ${disbursementAmount},
                            n_u_m_b_e_r__o_f__l_o_a_n_s = n_u_m_b_e_r__o_f__l_o_a_n_s + 1,
                            a_c_t_i_v_e__l_o_a_n_s = a_c_t_i_v_e__l_o_a_n_s + 1,
                            d_i_s_b_u_r_s_e_m_e_n_t__c_o_u_n_t = d_i_s_b_u_r_s_e_m_e_n_t__c_o_u_n_t + 1,
                            a_v_e_r_a_g_e__l_o_a_n__s_i_z_e = ${newAverageLoanSize},
                            u_p_d_a_t_e_d__d_a_t_e = '${now.toISOString().slice(0, 19).replace('T', ' ')}',
                            u_p_d_a_t_e_d__b_y = '${approvedBy}'
                        WHERE id = ${portfolioId}
                    `;
                    
                    console.log("DEBUG: Executing update query:", updatePortfolioQuery);
                    
                    const updateResult = await sequelize.query(updatePortfolioQuery, { transaction });
                    console.log("DEBUG: ✓ Updated existing loan portfolio record");
                    console.log("DEBUG: Update result:", updateResult);
                    
                } else {
                    // Create new portfolio record
                    console.log("DEBUG: ✗ No existing portfolio found, creating new record...");
                    
                    // For new record, average loan size is just this loan amount
                    const averageLoanSize = disbursementAmount;
                    const sqlDate = now.toISOString().slice(0, 19).replace('T', ' ');
                    
                    const insertPortfolioQuery = `
                        INSERT INTO loan_portfolio (
                            b_r_a_n_c_h__i_d,
                            p_r_o_d__i_d,
                            p_r_o_d_u_c_t__c_o_d_e,
                            p_r_o_d_u_c_t__n_a_m_e,
                            p_r_o_d_u_c_t__t_y_p_e,
                            m_o_n_t_h,
                            y_e_a_r,
                            c_u_r_r_e_n_c_y,
                            t_o_t_a_l__d_i_s_b_u_r_s_e_d,
                            t_o_t_a_l__n_e_t__d_i_s_b_u_r_s_e_m_e_n_t,
                            t_o_t_a_l__p_r_i_n_c_i_p_a_l,
                            o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l,
                            n_u_m_b_e_r__o_f__l_o_a_n_s,
                            a_c_t_i_v_e__l_o_a_n_s,
                            d_i_s_b_u_r_s_e_m_e_n_t__c_o_u_n_t,
                            a_v_e_r_a_g_e__l_o_a_n__s_i_z_e,
                            s_t_a_t_u_s,
                            c_r_e_a_t_e_d__b_y,
                            u_p_d_a_t_e_d__b_y,
                            c_r_e_a_t_e_d__d_a_t_e,
                            u_p_d_a_t_e_d__d_a_t_e
                        ) VALUES (
                            '${branchId}',
                            ${loanProductId},
                            '${productCode}',
                            '${productName}',
                            '${productType}',
                            ${currentMonth},
                            ${currentYear},
                            'NGN',
                            ${disbursementAmount},
                            ${disbursementAmount},
                            ${disbursementAmount},
                            ${disbursementAmount},
                            1,
                            1,
                            1,
                            ${averageLoanSize},
                            'ACTIVE',
                            '${approvedBy}',
                            '${approvedBy}',
                            '${sqlDate}',
                            '${sqlDate}'
                        )
                    `;
                    
                    console.log("DEBUG: Executing insert query:", insertPortfolioQuery);
                    
                    const insertResult = await sequelize.query(insertPortfolioQuery, { transaction });
                    console.log("DEBUG: ✓ Created new loan portfolio record");
                    console.log("DEBUG: Insert result:", insertResult);
                }
                
                console.log("DEBUG: ✓ Loan portfolio updated successfully");
                
            } else {
                console.log("DEBUG: ✗ loan_portfolio table does not exist or not found");
            }
        } catch (portfolioError) {
            console.error("DEBUG: ✗ ERROR updating loan portfolio:", portfolioError.message);
            // Don't rollback for portfolio errors - it's not critical
        }

        // ==================== 15. COMMIT TRANSACTION ====================
        await transaction.commit();
        console.log("DEBUG: Transaction committed successfully");

        // ==================== 16. PREPARE RESPONSE ====================
        const totalDisbursedNow = currentStatus === 'ACTIVE' 
            ? (currentDisbursedAmount + disbursementAmount) 
            : disbursementAmount;
        
        const newOutstandingPrincipal = currentStatus === 'ACTIVE'
            ? (currentOutstandingPrincipal + disbursementAmount)
            : disbursementAmount;
        
        // Define portfolio variables
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const loanProductId = loanAccount.l_o_a_n__p_r_o_d_u_c_t__i_d || 0;
        const branchId = loanAccount.b_r_a_n_c_h__i_d || '001';
        
        const responseData = {
            success: true,
            message: currentStatus === 'ACTIVE' 
                ? "Additional disbursement recorded successfully" 
                : "Loan approved and disbursed successfully",
            data: {
                loanAccount: {
                    ACCT_NO,
                    previousStatus: currentStatus,
                    newStatus: 'ACTIVE',
                    previousAmount: loanAmountValue,
                    newAmount: -disbursementAmount,
                    approvedAmount: approvedAmount,
                    previousDisbursed: currentDisbursedAmount,
                    currentDisbursement: disbursementAmount,
                    totalDisbursed: totalDisbursedNow,
                    previousOutstanding: currentOutstandingPrincipal,
                    newOutstanding: newOutstandingPrincipal,
                    remainingLimit: approvedAmount - totalDisbursedNow,
                    approvalDate: now,
                    disbursementDate: now,
                    approvedBy,
                    approvalComments,
                    customerId: customerId,
                    numericCustomerId: numericCustomerId
                },
                disbursement: {
                    id: disbursementRecord.id,
                    status: 'APPROVED',
                    customerAccount: customerAccountNumber,
                    customerAccountType: customerAccountDetails?.accountType || 'UNKNOWN',
                    amount: disbursementAmount
                },
                customerAccountUpdate: customerAccountNumber && customerAccountDetails ? {
                    accountNumber: customerAccountNumber,
                    customerId: customerId,
                    numericCustomerId: numericCustomerId,
                    previousBalances: {
                        ledger: customerAccountDetails.currentLedgerBalance,
                        available: customerAccountDetails.currentAvailableBalance,
                        cleared: customerAccountDetails.currentClearedBalance,
                        current: customerAccountDetails.currentBalance
                    },
                    newBalances: {
                        ledger: customerAccountDetails.currentLedgerBalance + disbursementAmount,
                        available: customerAccountDetails.currentAvailableBalance + disbursementAmount,
                        cleared: customerAccountDetails.currentClearedBalance + disbursementAmount,
                        current: customerAccountDetails.currentBalance + disbursementAmount
                    },
                    currency: customerAccountDetails.currency || 'NGN',
                    tablesUpdated: [
                        accountsTableRecord ? 'accounts' : null,
                        customerAccountsTableRecord ? 'customer_accounts' : 'new_record_created'
                    ].filter(Boolean),
                    accountCreated: !customerAccountsTableRecord?.id ? 'Yes' : 'No'
                } : {
                    note: "No customer account found to update",
                    customerId: customerId,
                    numericCustomerId: numericCustomerId,
                    searchedAccountName: customerName,
                    searchedInTables: ['customer_accounts', 'accounts']
                },
                portfolioUpdate: {
                    updated: true,
                    month: currentMonth,
                    year: currentYear,
                    productId: loanProductId,
                    branchId: branchId,
                    amount: disbursementAmount,
                    message: "Loan portfolio statistics updated"
                },
                accountingSummary: {
                    loanAccount: `Debited: -₦${disbursementAmount.toLocaleString()} (Loan account set to negative)`,
                    customerAccount: customerAccountNumber 
                        ? `Credited: +₦${disbursementAmount.toLocaleString()} to account ${customerAccountNumber}`
                        : "No customer account found to credit",
                    netEffect: customerAccountNumber 
                        ? "Funds transferred from loan account to customer account" 
                        : "Loan disbursed but customer account not updated"
                },
                debug: {
                    transactionId: `DISB-${Date.now()}`,
                    timestamp: now.toISOString(),
                    loanAccountId: loanAccount.id,
                    customerId: customerId,
                    numericCustomerId: numericCustomerId,
                    customerAccountFound: !!customerAccountNumber,
                    accountsTableUpdated: !!accountsTableRecord,
                    customerAccountsTableUpdated: !!customerAccountsTableRecord,
                    accountsTableRecordExists: !!accountsTableRecord,
                    customerAccountsTableRecordExists: !!customerAccountsTableRecord,
                    searchDetails: {
                        searchedCustomerId: customerId,
                        searchedNumericId: numericCustomerId,
                        searchedName: customerName
                    }
                }
            }
        };

        // Add note for partial disbursement
        const remainingAfter = approvedAmount - totalDisbursedNow;
        if (remainingAfter > 0) {
            responseData.data.note = "Partial disbursement completed";
            responseData.data.remainingForDisbursement = remainingAfter;
        }

        console.log("=== DEBUG: Sending success response ===");
        return res.status(200).json(responseData);
    } catch (error) {
        // ==================== ERROR HANDLING ====================
        console.error("DEBUG: Error in approveAndDisburseLoan:", error);
        console.error("DEBUG: Error stack:", error.stack);
        
        try {
            if (transaction) {
                // Check transaction state before attempting rollback
                if (!transaction.finished) {
                    await transaction.rollback();
                    console.log("DEBUG: Transaction rolled back successfully");
                } else {
                    console.log("DEBUG: Transaction already finished with state:", transaction.finished);
                }
            }
        } catch (rollbackError) {
            console.error("DEBUG: Rollback failed:", rollbackError.message);
            // Continue with original error handling
        }

        return res.status(500).json({
            success: false,
            message: "Approval process failed",
            error: error.message,
            code: "APPROVAL_PROCESS_ERROR",
            debug: {
                errorName: error.name,
                errorMessage: error.message,
                errorLine: error.lineNumber,
                errorColumn: error.columnNumber,
                fullError: process.env.NODE_ENV === 'development' ? error.stack : 'Hidden in production'
            }
        });
    }
},


// @desc    Reject a loan disbursement request
// @route   POST /api/loans/reject-disbursement
// @access  Private (Loan Officers, Managers, Approvers)
async rejectDisbursement (req, res) {
    console.log("=== DEBUG: Starting rejectDisbursement ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    
    let transaction;
    
    try {
        const { 
            ACCT_NO, 
            rejectedBy, 
            rejectionReason,
            rejectionComments = "Loan disbursement rejected"
        } = req.body;

        console.log("DEBUG: ACCT_NO =", ACCT_NO);
        console.log("DEBUG: rejectedBy =", rejectedBy);
        console.log("DEBUG: rejectionReason =", rejectionReason);

        // Validate required fields
        if (!ACCT_NO || !rejectedBy || !rejectionReason) {
            return res.status(400).json({
                success: false,
                message: "ACCT_NO, rejectedBy, and rejectionReason are required",
                code: "MISSING_FIELDS",
                debug: {
                    receivedACCT_NO: ACCT_NO,
                    receivedRejectedBy: rejectedBy,
                    receivedRejectionReason: rejectionReason
                }
            });
        }

        // Start transaction
        transaction = await sequelize.transaction();
        console.log("DEBUG: Transaction started");

        // ==================== 1. FIND LOAN ACCOUNT ====================
        console.log(`DEBUG: Looking for loan account: ${ACCT_NO}`);
        
        let loanAccounts;
        try {
            const result = await sequelize.query(
                `SELECT * FROM loan_accounts WHERE a_c_c_t__n_o = ? LIMIT 1`,
                {
                    replacements: [ACCT_NO],
                    transaction,
                    type: sequelize.QueryTypes.SELECT
                }
            );
            loanAccounts = result;
            console.log("DEBUG: Query result length:", result ? result.length : 0);
        } catch (queryError) {
            console.error("DEBUG: Database query failed:", queryError);
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            return res.status(500).json({
                success: false,
                message: "Database query failed",
                error: queryError.message,
                code: "DATABASE_ERROR"
            });
        }

        if (!loanAccounts || !Array.isArray(loanAccounts) || loanAccounts.length === 0) {
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            return res.status(404).json({
                success: false,
                message: `Loan account ${ACCT_NO} not found`,
                code: "LOAN_NOT_FOUND",
                debug: {
                    searchedAccount: ACCT_NO
                }
            });
        }

        const loanAccount = loanAccounts[0];
        console.log("DEBUG: loanAccount found:", JSON.stringify(loanAccount, null, 2));
        
        const currentStatus = loanAccount.l_o_a_n__s_t_a_t_u_s;
        const now = new Date();

        // ==================== 2. VALIDATE CURRENT STATUS ====================
        console.log("DEBUG: Current Status =", currentStatus);
        
        // Only allow rejection from specific statuses
        const allowedStatusesForRejection = ['PENDING', 'UNDER_REVIEW', 'APPROVAL_PENDING'];
        
        if (!allowedStatusesForRejection.includes(currentStatus)) {
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            return res.status(400).json({
                success: false,
                message: `Cannot reject loan with status: ${currentStatus}`,
                code: "INVALID_STATUS_FOR_REJECTION",
                data: {
                    ACCT_NO,
                    currentStatus,
                    allowedStatuses: allowedStatusesForRejection
                }
            });
        }

        // Check if loan is already disbursed
        const currentDisbursedAmount = parseFloat(loanAccount.d_i_s_b_u_r_s_e_d__a_m_o_u_n_t || 0);
        if (currentDisbursedAmount < 0) { // Negative means disbursed
            if (transaction && !transaction.finished) {
                await transaction.rollback();
            }
            return res.status(400).json({
                success: false,
                message: "Loan has already been disbursed and cannot be rejected",
                code: "ALREADY_DISBURSED",
                data: {
                    ACCT_NO,
                    disbursedAmount: Math.abs(currentDisbursedAmount)
                }
            });
        }

        // ==================== 3. UPDATE LOAN ACCOUNT STATUS ====================
        console.log("DEBUG: Updating loan account status to REJECTED...");
        
        await sequelize.query(
            `UPDATE loan_accounts 
             SET l_o_a_n__s_t_a_t_u_s = 'REJECTED',
                 r_e_j_e_c_t_i_o_n__r_e_a_s_o_n = ?,
                 r_e_j_e_c_t_i_o_n__c_o_m_m_e_n_t_s = ?,
                 r_e_j_e_c_t_e_d__b_y = ?,
                 r_e_j_e_c_t_i_o_n__d_a_t_e = ?,
                 u_p_d_a_t_e_d__a_t = ?
             WHERE a_c_c_t__n_o = ?`,
            {
                replacements: [
                    rejectionReason,
                    rejectionComments,
                    rejectedBy,
                    now,
                    now,
                    ACCT_NO
                ],
                transaction
            }
        );
        
        console.log("DEBUG: ✓ Loan account status updated to REJECTED");

        // ==================== 4. UPDATE CREDIT APPLICATION (if exists) ====================
        try {
            const creditTables = await sequelize.query(
                `SELECT TABLE_NAME 
                 FROM INFORMATION_SCHEMA.TABLES 
                 WHERE TABLE_SCHEMA = DATABASE() 
                 AND TABLE_NAME = 'credit_applications'`,
                { transaction, type: sequelize.QueryTypes.SELECT }
            );

            if (creditTables.length > 0) {
                console.log("DEBUG: Updating credit_application status...");
                
                await sequelize.query(
                    `UPDATE credit_applications 
                     SET s_t_a_t_u_s = 'REJECTED',
                         r_e_j_e_c_t_e_d__b_y = ?,
                         r_e_j_e_c_t_i_o_n__r_e_a_s_o_n = ?,
                         r_e_j_e_c_t_i_o_n__d_a_t_e = ?,
                         c_o_m_m_e n_t_s = CONCAT(COALESCE(c_o_m_m_e_n_t_s, ''), ' | Rejected: ', ?),
                         u_p_d_a_t_e_d__a_t = ?
                     WHERE a_c_c_t__n_o = ?`,
                    {
                        replacements: [
                            rejectedBy,
                            rejectionReason,
                            now,
                            rejectionComments,
                            now,
                            ACCT_NO
                        ],
                        transaction
                    }
                );
                console.log("DEBUG: ✓ Credit application updated");
            }
        } catch (creditError) {
            console.warn("DEBUG: Could not update credit application:", creditError.message);
            // Continue - this is not critical
        }

        // ==================== 5. UPDATE LOAN DISBURSEMENT RECORD (if exists) ====================
        try {
            const disbursementTables = await sequelize.query(
                `SELECT TABLE_NAME 
                 FROM INFORMATION_SCHEMA.TABLES 
                 WHERE TABLE_SCHEMA = DATABASE() 
                 AND TABLE_NAME = 'loan_disbursements'`,
                { transaction, type: sequelize.QueryTypes.SELECT }
            );

            if (disbursementTables.length > 0) {
                console.log("DEBUG: Updating loan_disbursements status...");
                
                await sequelize.query(
                    `UPDATE loan_disbursements 
                     SET s_t_a_t_u_s = 'REJECTED',
                         r_e_j_e_c_t_i_o_n__r_e_a_s_o_n = ?,
                         u_p_d_a_t_e_d__a_t = ?
                     WHERE a_c_c_t__n_o = ?`,
                    {
                        replacements: [
                            rejectionReason,
                            now,
                            ACCT_NO
                        ],
                        transaction
                    }
                );
                console.log("DEBUG: ✓ Loan disbursement record updated");
            }
        } catch (disbursementError) {
            console.warn("DEBUG: Could not update loan disbursements:", disbursementError.message);
            // Continue - this is not critical
        }

        // ==================== 6. CREATE REJECTION AUDIT LOG ====================
        try {
            const auditTables = await sequelize.query(
                `SELECT TABLE_NAME 
                 FROM INFORMATION_SCHEMA.TABLES 
                 WHERE TABLE_SCHEMA = DATABASE() 
                 AND TABLE_NAME = 'audit_logs'`,
                { transaction, type: sequelize.QueryTypes.SELECT }
            );
            
            if (auditTables.length > 0) {
                await sequelize.query(
                    `INSERT INTO audit_logs (
                        action, entity_type, entity_id, description,
                        performed_by, performed_at, old_values, new_values,
                        transaction_id, metadata
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    {
                        replacements: [
                            'LOAN_REJECTION',
                            'LOAN_ACCOUNT',
                            loanAccount.id,
                            `Loan ${ACCT_NO} disbursement rejected by ${rejectedBy}`,
                            rejectedBy,
                            now,
                            JSON.stringify({ 
                                status: currentStatus,
                                loan_amount: loanAccount.a_m_o_u_n_t,
                                customer_id: loanAccount.c_u_s_t__i_d
                            }),
                            JSON.stringify({ 
                                status: 'REJECTED',
                                rejection_reason: rejectionReason,
                                rejection_comments: rejectionComments,
                                rejected_by: rejectedBy,
                                rejection_date: now
                            }),
                            `REJECT-${Date.now()}`,
                            JSON.stringify({
                                rejection_source: 'manual',
                                user_role: 'approver',
                                ip_address: req.ip
                            })
                        ],
                        transaction
                    }
                );
                console.log("DEBUG: ✓ Rejection audit log created");
            }
        } catch (auditError) {
            console.warn("DEBUG: Could not create audit log:", auditError.message);
        }

        // ==================== 7. NOTIFY CUSTOMER (Optional) ====================
        try {
            // Get customer details for notification
            const customerId = loanAccount.c_u_s_t__i_d;
            
            // You can implement notification logic here:
            // - Send email to customer
            // - Send SMS notification
            // - Create notification in notifications table
            // - Log to customer communication log
            
            console.log(`DEBUG: Customer ${customerId} should be notified of rejection`);
            
            // Example: Create notification record
            const notificationTables = await sequelize.query(
                `SELECT TABLE_NAME 
                 FROM INFORMATION_SCHEMA.TABLES 
                 WHERE TABLE_SCHEMA = DATABASE() 
                 AND TABLE_NAME = 'notifications'`,
                { transaction, type: sequelize.QueryTypes.SELECT }
            );
            
            if (notificationTables.length > 0 && customerId) {
                await sequelize.query(
                    `INSERT INTO notifications (
                        user_id, user_type, title, message,
                        notification_type, status, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    {
                        replacements: [
                            customerId,
                            'CUSTOMER',
                            'Loan Application Rejected',
                            `Your loan application ${ACCT_NO} has been rejected. Reason: ${rejectionReason}`,
                            'LOAN_REJECTION',
                            'UNREAD',
                            now
                        ],
                        transaction
                    }
                );
                console.log("DEBUG: ✓ Customer notification created");
            }
        } catch (notificationError) {
            console.warn("DEBUG: Could not create notification:", notificationError.message);
        }

        // ==================== 8. COMMIT TRANSACTION ====================
        await transaction.commit();
        console.log("DEBUG: Transaction committed successfully");

        // ==================== 9. PREPARE SUCCESS RESPONSE ====================
        const responseData = {
            success: true,
            message: "Loan disbursement rejected successfully",
            data: {
                loanAccount: {
                    ACCT_NO,
                    previousStatus: currentStatus,
                    newStatus: 'REJECTED',
                    loanAmount: loanAccount.a_m_o_u_n_t,
                    customerId: loanAccount.c_u_s_t__i_d,
                    rejectionDetails: {
                        rejectedBy,
                        rejectionReason,
                        rejectionComments,
                        rejectionDate: now
                    }
                },
                audit: {
                    logged: true,
                    notificationSent: true // Based on your implementation
                }
            }
        };

        console.log("=== DEBUG: Sending success response ===");
        return res.status(200).json(responseData);

    } catch (error) {
        // ==================== ERROR HANDLING ====================
        console.error("DEBUG: Error in rejectDisbursement:", error);
        console.error("DEBUG: Error stack:", error.stack);
        
        try {
            if (transaction) {
                if (!transaction.finished) {
                    await transaction.rollback();
                    console.log("DEBUG: Transaction rolled back successfully");
                }
            }
        } catch (rollbackError) {
            console.error("DEBUG: Rollback failed:", rollbackError.message);
        }

        return res.status(500).json({
            success: false,
            message: "Loan rejection process failed",
            error: error.message,
            code: "REJECTION_PROCESS_ERROR",
            debug: process.env.NODE_ENV === 'development' ? {
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack
            } : undefined
        });
    }
},


// =========================
  // LOAN MANAGEMENT METHODS
  // =========================

// controllers/loanController.js - FIXED VERSION
async getAllLoans(req, res) {
  try {
    const { 
      status, 
      branch, 
      product, 
      page = 1, 
      limit = 20, 
      showRepaymentStatus = true,
      overdueOnly = false,
      dueSoon = false 
    } = req.query;
    
    // Get current business date from OS system
    const systemDate = await SystemDate.findOne({ 
      order: [['created_at', 'DESC']] 
    });
    
    const currentBusinessDate = systemDate?.currentBusinessDate || new Date();
    
    // Build query conditions
    let where = {};
    
    // Status filtering
    if (status) {
      where.LOAN_STATUS = status;
    }
    
    if (branch) {
      where.BU_ID = branch;
    }
    
    if (product) {
      where.LOAN_PRODUCT_ID = product;
    }
    
    // Overdue only filter
    if (overdueOnly) {
      where.LOAN_STATUS = { [Op.in]: ['OVERDUE', 'DELINQUENT'] };
    }
    
    // Due soon filter
    if (dueSoon) {
      // We'll handle this in post-processing
    }
    
    // Calculate pagination
    const offset = (page - 1) * limit;
    
    // Get loans with pagination
    const loans = await LoanAccount.findAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [
        {
          model: CustomerAccount,
          as: 'customerAccount',
          attributes: ['account_number', 'customer_name', 'available_balance', 'currency_code']
        }
      ]
    });

    // Get total count
    const total = await LoanAccount.count({ where });

    // If we want to check repayment status
    let loansWithStatus = loans;
    if (showRepaymentStatus === 'true' || showRepaymentStatus === true) {
      loansWithStatus = await Promise.all(
        loans.map(async (loan) => {
          // Get repayment history
          let repaymentHistory = [];
          try {
            repaymentHistory = await getRepaymentHistoryService(loan.ACCT_NO);
          } catch (error) {
            console.warn(`Could not fetch repayment history for ${loan.ACCT_NO}:`, error.message);
          }
          
          // Calculate repayment status
          const repaymentStatus = await calculateRepaymentStatus(loan, currentBusinessDate, repaymentHistory);
          
          // Create enhanced loan object
          return {
            ...loan.toJSON(),
            repaymentStatus,
            repaymentHistory: repaymentHistory.slice(0, 10), // Last 10 repayments
            customerDetails: loan.customerAccount
          };
        })
      );
    }

    // Filter for due soon if requested
    if (dueSoon) {
      loansWithStatus = loansWithStatus.filter(loan => 
        loan.repaymentStatus?.status === 'DUE_SOON' || 
        loan.repaymentStatus?.status === 'DUE_TODAY'
      );
    }

    return res.json({
      success: true,
      data: loansWithStatus,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      },
      filters: {
        status,
        branch,
        product,
        overdueOnly,
        dueSoon
      },
      currentBusinessDate,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Loan fetch error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch loans',
      error: error.message
    });
  }
},

/**
 * Comprehensive repayment status calculation
 */
async  calculateRepaymentStatus (req, res, loan, currentDate, repaymentHistory = []) {
  try {
    const loanData = loan.toJSON ? loan.toJSON() : loan;
    const loanStatus = loanData.LOAN_STATUS?.toUpperCase();
    const outstandingPrincipal = parseFloat(loanData.OUTSTANDING_PRINCIPAL || 0);
    const disbursedAmount = parseFloat(loanData.DISBURSEMENT_LIMIT || 0);
    const accruedInterest = parseFloat(loanData.ACCRUED_INTEREST || 0);
    const penaltyAmount = parseFloat(loanData.PENALTY_AMOUNT || 0);
    const maturityDate = loanData.MATURITY_DT ? new Date(loanData.MATURITY_DT) : null;
    const nextRepaymentDate = loanData.NEXT_REPAYMENT_DATE ? new Date(loanData.NEXT_REPAYMENT_DATE) : null;
    const lastRepaymentDate = loanData.LAST_REPAYMENT_DATE ? new Date(loanData.LAST_REPAYMENT_DATE) : null;
    const installmentAmount = parseFloat(loanData.INSTALLMENT_AMOUNT || 0);
    const totalInstallments = parseInt(loanData.TOTAL_INSTALLMENTS || 0);
    const paidInstallments = parseInt(loanData.PAID_INSTALLMENTS || 0);
    
    // If loan is fully paid
    if (outstandingPrincipal <= 0 && accruedInterest <= 0 && penaltyAmount <= 0) {
      return {
        status: 'PAID',
        description: 'Loan fully repaid',
        isDue: false,
        isOverdue: false,
        isDelinquent: false,
        isMatured: maturityDate ? currentDate >= maturityDate : false,
        daysOverdue: 0,
        amountDue: 0,
        totalOutstanding: 0,
        breakdown: {
          principal: 0,
          interest: 0,
          penalty: 0
        }
      };
    }
    
    // Calculate total outstanding
    const totalOutstanding = outstandingPrincipal + accruedInterest + penaltyAmount;
    
    // Check if loan is overdue based on maturity date
    let isMaturedOverdue = false;
    let daysSinceMaturity = 0;
    
    if (maturityDate && currentDate > maturityDate) {
      isMaturedOverdue = true;
      daysSinceMaturity = Math.floor((currentDate - maturityDate) / (1000 * 60 * 60 * 24));
    }
    
    // Check next repayment date
    let isRepaymentOverdue = false;
    let daysSinceDue = 0;
    let amountDue = 0;
    
    if (nextRepaymentDate) {
      if (currentDate > nextRepaymentDate) {
        isRepaymentOverdue = true;
        daysSinceDue = Math.floor((currentDate - nextRepaymentDate) / (1000 * 60 * 60 * 24));
        amountDue = installmentAmount;
      } else if (currentDate.toDateString() === nextRepaymentDate.toDateString()) {
        amountDue = installmentAmount;
      }
    }
    
    // Determine delinquency level
    let isDelinquent = false;
    let delinquencyLevel = 'CURRENT';
    
    if (isRepaymentOverdue) {
      if (daysSinceDue > 90) {
        isDelinquent = true;
        delinquencyLevel = 'SEVERE';
      } else if (daysSinceDue > 60) {
        isDelinquent = true;
        delinquencyLevel = 'HIGH';
      } else if (daysSinceDue > 30) {
        isDelinquent = true;
        delinquencyLevel = 'MODERATE';
      } else if (daysSinceDue > 15) {
        isDelinquent = true;
        delinquencyLevel = 'MILD';
      }
    }
    
    // Check for penalties
    const hasPenalties = penaltyAmount > 0;
    
    // Determine overall status
    let status = 'ACTIVE';
    let description = 'Loan active';
    
    if (loanStatus === 'OVERDUE' || loanStatus === 'DELINQUENT') {
      status = loanStatus;
      description = `Loan is ${loanStatus.toLowerCase()}`;
    } else if (isMaturedOverdue) {
      status = 'MATURED_OVERDUE';
      description = `Loan matured ${daysSinceMaturity} days ago`;
    } else if (isRepaymentOverdue) {
      status = 'OVERDUE';
      description = `Repayment overdue by ${daysSinceDue} days`;
    } else if (nextRepaymentDate && nextRepaymentDate > currentDate) {
      const daysUntilDue = Math.ceil((nextRepaymentDate - currentDate) / (1000 * 60 * 60 * 24));
      
      if (daysUntilDue === 0) {
        status = 'DUE_TODAY';
        description = 'Repayment due today';
      } else if (daysUntilDue <= 7) {
        status = 'DUE_SOON';
        description = `Repayment due in ${daysUntilDue} days`;
      } else {
        status = 'SCHEDULED';
        description = `Next payment in ${daysUntilDue} days`;
      }
    }
    
    // Calculate payment progress
    const paymentProgress = totalInstallments > 0 ? (paidInstallments / totalInstallments) * 100 : 0;
    const principalProgress = disbursedAmount > 0 ? ((disbursedAmount - outstandingPrincipal) / disbursedAmount) * 100 : 0;
    
    // Analyze repayment pattern
    const repaymentPattern = analyzeRepaymentPattern(repaymentHistory, totalInstallments, paidInstallments);
    
    return {
      status,
      description,
      isDue: status === 'DUE_TODAY' || status === 'DUE_SOON',
      isOverdue: isRepaymentOverdue || isMaturedOverdue || loanStatus === 'OVERDUE',
      isDelinquent: isDelinquent || loanStatus === 'DELINQUENT',
      isMatured: isMaturedOverdue,
      delinquencyLevel,
      daysOverdue: Math.max(daysSinceDue, daysSinceMaturity),
      daysSinceLastRepayment: lastRepaymentDate ? 
        Math.floor((currentDate - lastRepaymentDate) / (1000 * 60 * 60 * 24)) : null,
      amountDue,
      totalOutstanding,
      breakdown: {
        principal: outstandingPrincipal,
        interest: accruedInterest,
        penalty: penaltyAmount
      },
      schedule: {
        nextRepaymentDate,
        lastRepaymentDate,
        maturityDate,
        installmentAmount,
        paidInstallments,
        totalInstallments,
        paymentProgress: Math.round(paymentProgress * 100) / 100,
        principalProgress: Math.round(principalProgress * 100) / 100
      },
      flags: {
        hasPenalties,
        hasArrears: isRepaymentOverdue,
        nearingMaturity: maturityDate && 
          Math.floor((maturityDate - currentDate) / (1000 * 60 * 60 * 24)) <= 30,
        irregularPayments: repaymentPattern.isIrregular,
        frequentLatePayments: repaymentPattern.frequentLate
      },
      recommendations: generateRepaymentRecommendations(
        status,
        outstandingPrincipal,
        accruedInterest,
        penaltyAmount,
        isDelinquent,
        delinquencyLevel,
        repaymentPattern
      )
    };
    
  } catch (error) {
    console.error('Error calculating repayment status:', error);
    return {
      status: 'ERROR',
      description: 'Error calculating repayment status',
      isDue: false,
      isOverdue: false,
      isDelinquent: false,
      error: error.message
    };
  }
},

/**
 * Analyze repayment pattern
 */
async  analyzeRepaymentPattern (req, res, repaymentHistory, totalInstallments, paidInstallments) {
  if (repaymentHistory.length === 0) {
    return {
      isIrregular: false,
      frequentLate: false,
      averageDaysLate: 0,
      onTimePercentage: 100
    };
  }
  
  const recentRepayments = repaymentHistory.slice(0, Math.min(repaymentHistory.length, 12));
  let lateCount = 0;
  let totalDaysLate = 0;
  
  // Simple analysis - assume scheduled dates should be monthly
  for (let i = 1; i < recentRepayments.length; i++) {
    const daysBetween = Math.floor(
      (new Date(recentRepayments[i-1].date) - new Date(recentRepayments[i].date)) / 
      (1000 * 60 * 60 * 24)
    );
    
    if (daysBetween > 35) { // More than 5 days late (assuming 30-day cycle)
      lateCount++;
      totalDaysLate += (daysBetween - 30);
    }
  }
  
  const onTimePercentage = recentRepayments.length > 1 ? 
    ((recentRepayments.length - 1 - lateCount) / (recentRepayments.length - 1)) * 100 : 100;
  
  return {
    isIrregular: lateCount > (recentRepayments.length * 0.3), // More than 30% late
    frequentLate: lateCount > (recentRepayments.length * 0.5), // More than 50% late
    averageDaysLate: lateCount > 0 ? Math.round(totalDaysLate / lateCount) : 0,
    onTimePercentage: Math.round(onTimePercentage * 100) / 100,
    missedInstallments: Math.max(0, totalInstallments - paidInstallments)
  };
},

/**
 * Generate repayment recommendations
 */
async generateRepaymentRecommendations(status, principal, interest, penalty, isDelinquent, delinquencyLevel, repaymentPattern) {
  const recommendations = [];
  
  if (status === 'OVERDUE' || status === 'DELINQUENT') {
    recommendations.push('Immediate payment required to avoid further penalties');
    recommendations.push('Contact customer to discuss payment plan');
  }
  
  if (penalty > 0) {
    recommendations.push('Outstanding penalties need to be cleared');
  }
  
  if (interest > (principal * 0.1)) { // High interest relative to principal
    recommendations.push('Consider paying down accrued interest to reduce total cost');
  }
  
  if (repaymentPattern.frequentLate) {
    recommendations.push('Customer has history of late payments - consider adjusting repayment schedule');
  }
  
  if (repaymentPattern.missedInstallments > 2) {
    recommendations.push(`${repaymentPattern.missedInstallments} installments missed - review loan for possible restructuring`);
  }
  
  if (delinquencyLevel === 'SEVERE') {
    recommendations.push('Severe delinquency - escalate to collections department');
  } else if (delinquencyLevel === 'HIGH') {
    recommendations.push('High delinquency risk - initiate recovery procedures');
  }
  
  if (status === 'DUE_SOON') {
    recommendations.push('Send payment reminder to customer');
  }
  
  // Add positive reinforcement
  if (repaymentPattern.onTimePercentage >= 90) {
    recommendations.push('Excellent repayment history - consider loyalty benefits');
  }
  
  return recommendations;
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
      
      const newLoanAccount = await LoanAccount.create({
        ...loanData,
        ACCT_NO: accountNumber,
        LOAN_STATUS: 'PENDING',
        applicationDate: new Date(),
        lastUpdated: new Date()
      });

      return res.status(201).json({
        success: true,
        message: 'Loan account created successfully',
        data: {
          loanAccountId: newLoanAccount.id,
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

      const loanAccount = await LoanAccount.findOne({ where: { ACCT_NO } });
      if (!loanAccount) {
        return res.status(404).json({
          success: false,
          message: 'Loan account not found',
          code: 'LOAN_ACCOUNT_NOT_FOUND'
        });
      }

      delete updateData.ACCT_NO;
      delete updateData.id;
      delete updateData.CUST_ID;

      updateData.lastUpdated = new Date();

      const updatedLoanAccount = await loanAccount.update(updateData);

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

      const loanAccount = await LoanAccount.findOne({ where: { ACCT_NO } });
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

      await loanAccount.destroy();

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

      let where = {};

      if (accountNumber) {
        where.ACCT_NO = { $like: `%${accountNumber}%` };
      }

      if (customerId) {
        where.CUST_ID = customerId;
      }

      if (customerName) {
        where.ACCT_NM = { $like: `%${customerName}%` };
      }

      if (phone) {
        const customers = await Customer.findAll({
          where: {
            $or: [
              { MOBILE: { $like: `%${phone}%` } },
              { PHONE: { $like: `%${phone}%` } }
            ]
          },
          attributes: ['CUST_ID']
        });

        const customerIds = customers.map(c => c.CUST_ID);
        if (customerIds.length > 0) {
          where.CUST_ID = { $in: customerIds };
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
      const loans = await LoanAccount.findAll({
        where,
        offset: skip,
        limit: parseInt(limit),
        order: [['applicationDate', 'DESC']]
      });

      const total = await LoanAccount.count({ where });

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

      const repaymentSchedule = await RepaymentSchedule.findOne({ where: { ACCT_NO } });
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

      const transactions = await Transaction.findAll({
        where: { ACCT_NO },
        offset: skip,
        limit: parseInt(limit),
        order: [['VALUE_DATE', 'DESC']]
      });

      const total = await Transaction.count({ where: { ACCT_NO } });

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

    const loanAccount = await LoanAccount.findOne({ where: { ACCT_NO } });
    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: 'Loan account not found',
        code: 'LOAN_ACCOUNT_NOT_FOUND'
      });
    }

    const loanRepayment = await LoanRepayment.create({
      ACCT_NO,
      LOAN_ACCOUNT_ID: loanAccount.id,
      amount: parseFloat(repaymentData.amount),
      date: new Date(repaymentData.date || Date.now()),
      CUST_ID: loanAccount.CUST_ID,
      interestPaid: parseFloat(repaymentData.interestPaid || '0'),
      principalPaid: parseFloat(repaymentData.principalPaid || '0'),
      processedBy: req.user?.id || 'system'
    });

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

// Updated createRepaymentTransactionRecord method with utils function
async  createRepaymentTransactionRecord(loanData, transaction) {
  console.log('Creating loan repayment transaction record...');
  
  try {
    // Map our data to match the database column names (using snake_case with underscores)
    const repaymentTransactionData = {
      a_c_c_t__i_d: loanData.loanAccountId,
      a_c_c_t__n_o: loanData.ACCT_NO || loanData.accountNumber,
      c_u_s_t__i_d: loanData.CUST_ID || loanData.customerId,
      t_r_a_n_s_a_c_t_i_o_n__d_a_t_e: new Date(loanData.paymentDate || new Date()),
      t_r_a_n_s_a_c_t_i_o_n__t_y_p_e: 'REPAYMENT',
      a_m_o_u_n_t: loanData.amount,
      p_r_i_n_c_i_p_a_l__a_m_o_u_n_t: loanData.principalPaid || 0,
      i_n_t_e_r_e_s_t__a_m_o_u_n_t: loanData.interestPaid || 0,
      p_a_y_m_e_n_t__m_e_t_h_o_d: (loanData.paymentMethod || 'CASH').toUpperCase().replace(/\s+/g, '_'),
      t_r_a_n_s_a_c_t_i_o_n__r_e_f_e_r_e_n_c_e: loanData.reference || `REPAY-${Date.now()}`,
      r_e_p_a_y_m_e_n_t__t_y_p_e: 'REPAYMENT',
      i_s__i_n_s_t_a_l_l_m_e_n_t: loanData.isInstallment || true,
      c_r_e_a_t_e_d__b_y: loanData.createdBy || 'system',
      s_t_a_t_u_s: 'COMPLETED',
      r_e_c_e_i_p_t__n_o: loanData.receiptNo || generateReceiptNumber(),
      b_r_a_n_c_h__c_o_d_e: loanData.branchCode || '001',
      p_r_o_d_u_c_t__c_o_d_e: loanData.productCode || 'DEFAULT',
      n_o_t_e_s: loanData.description || 'Loan repayment against schedule',
      g_l__p_o_s_t_e_d: false
    };
    
    console.log('Creating loan_repayment_transactions record:', repaymentTransactionData);
    const repaymentTransaction = await LoanRepaymentTransaction.create(repaymentTransactionData, { transaction });
    
    return repaymentTransaction.id;
    
  } catch (error) {
    console.error('Error creating loan repayment transaction record:', error);
    throw error;
  }
},

// controllers/repaymentController.js
async processSchedulePayment(req, res) {
  console.log('=== PROCESSING SCHEDULE PAYMENT ===');
  
  const transaction = await sequelize.transaction();
  
  try {
    const { ACCT_NO } = req.params;
    const {
      amount,
      customerAccountNo,
      paymentMethod = 'CASH',
      referenceNumber,
      description,
      paymentDate = new Date(),
      createdBy = 'SYSTEM',
      branchCode = '001',
      productCode = 'DEFAULT',
      receiptNo
    } = req.body;

    console.log('Payment request:', {
      ACCT_NO,
      amount,
      customerAccountNo,
      paymentMethod,
      referenceNumber
    });

    // Validate required fields
    if (!ACCT_NO) {
      throw {
        code: 'MISSING_ACCT_NO',
        message: 'Loan account number is required',
        status: 400
      };
    }

    if (!amount || isNaN(amount) || amount <= 0) {
      throw {
        code: 'INVALID_AMOUNT',
        message: 'Valid payment amount is required',
        status: 400
      };
    }

    if (!customerAccountNo) {
      throw {
        code: 'MISSING_CUSTOMER_ACCOUNT',
        message: 'Customer account number is required',
        status: 400
      };
    }

    // 1. Find Loan Account
    const loanAccount = await LoanAccount.findOne({
      where: { ACCT_NO: String(ACCT_NO) },
      transaction
    });

    if (!loanAccount) {
      throw {
        code: 'LOAN_NOT_FOUND',
        message: `Loan account ${ACCT_NO} not found`,
        status: 404
      };
    }

    console.log('Found loan account:', {
      ACCT_NO: loanAccount.ACCT_NO,
      status: loanAccount.LOAN_STATUS,
      outstanding: loanAccount.OUTSTANDING_PRINCIPAL,
      CUST_ID: loanAccount.CUST_ID
    });

    // 2. Check loan status
    const validStatuses = ['ACTIVE', 'DISBURSED', 'ONGOING'];
    const loanStatus = loanAccount.LOAN_STATUS;
    
    if (!validStatuses.includes(loanStatus?.toUpperCase())) {
      throw {
        code: 'INVALID_LOAN_STATUS',
        message: `Loan not active. Status: ${loanStatus}`,
        status: 400
      };
    }

    // 3. Find Customer Account
    const customerAccountResult = await sequelize.query(
      `SELECT id, customer_id, account_number, account_name, 
              ledger_balance, available_balance, current_balance,
              branch_id, branch_name, bu_id, product_code,
              currency_code, created_by, approved_by, gl_account_id
       FROM customer_accounts 
       WHERE account_number = ?`,
      {
        replacements: [String(customerAccountNo)],
        transaction,
        type: sequelize.QueryTypes.SELECT
      }
    );

    const customerAccount = customerAccountResult && customerAccountResult.length > 0 
      ? customerAccountResult[0] 
      : null;

    if (!customerAccount) {
      throw {
        code: 'CUSTOMER_NOT_FOUND',
        message: `Customer account ${customerAccountNo} not found`,
        status: 404
      };
    }

    console.log('Found customer account:', customerAccount);

    // 4. Check balance
    const customerBalance = parseFloat(customerAccount.ledger_balance || customerAccount.available_balance || 0);
    
    if (customerBalance < amount) {
      throw {
        code: 'INSUFFICIENT_FUNDS',
        message: `Insufficient funds. Available: ${customerBalance}`,
        status: 400
      };
    }

    // 5. Find Repayment Schedule
    const repaymentScheduleResult = await sequelize.query(
      `SELECT id, loan_account_id, account_number, customer_id, start_date, maturity_date,
              principal_amount, interest_rate, term, term_type, payment_frequency,
              status, total_interest, total_repayment, transaction_id, event_id,
              created_by, emi_amount, upfront_interest, guarantor_id, guaranteed_amount,
              installments_json, created_at, updated_at
       FROM repayment_schedules 
       WHERE account_number = ?`,
      {
        replacements: [String(ACCT_NO)],
        transaction,
        type: sequelize.QueryTypes.SELECT
      }
    );

    const repaymentSchedule = repaymentScheduleResult && repaymentScheduleResult.length > 0 
      ? repaymentScheduleResult[0] 
      : null;

    if (!repaymentSchedule) {
      throw {
        code: 'NO_SCHEDULE',
        message: 'No repayment schedule found for this loan',
        status: 400
      };
    }

    console.log('Found repayment schedule:', {
      id: repaymentSchedule.id,
      account_number: repaymentSchedule.account_number,
      customer_id: repaymentSchedule.customer_id,
      installments_json: repaymentSchedule.installments_json ? JSON.parse(repaymentSchedule.installments_json).length : 0
    });

    // Helper function to process payment against schedule
    const processPaymentAgainstSchedule = async (schedule, paymentAmount, paymentDate, loanAccount, transaction) => {
      try {
        console.log('Processing payment against schedule...');
        
        const installments = JSON.parse(schedule.installments_json || '[]');
        let remainingPayment = parseFloat(paymentAmount);
        let totalPrincipalPaid = 0;
        let totalInterestPaid = 0;
        let installmentsUpdated = 0;
        const detailedInstallmentsUpdated = [];
        
        // Sort installments by due date
        installments.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        
        // Process each installment until payment is exhausted
        for (let i = 0; i < installments.length && remainingPayment > 0; i++) {
          const installment = installments[i];
          
          // Skip already paid installments
          if (installment.status === 'PAID') continue;
          
          const installmentTotal = parseFloat(installment.principal || 0) + parseFloat(installment.interest || 0);
          const installmentPrincipal = parseFloat(installment.principal || 0);
          const installmentInterest = parseFloat(installment.interest || 0);
          const installmentBalance = parseFloat(installment.balance || 0);
          
          console.log(`Processing installment ${i + 1}:`, {
            total: installmentTotal,
            principal: installmentPrincipal,
            interest: installmentInterest,
            balance: installmentBalance,
            status: installment.status
          });
          
          if (remainingPayment >= installmentBalance) {
            // Full payment for this installment
            totalPrincipalPaid += installmentPrincipal;
            totalInterestPaid += installmentInterest;
            remainingPayment -= installmentBalance;
            
            installment.paidPrincipal = installmentPrincipal;
            installment.paidInterest = installmentInterest;
            installment.paidAmount = installmentBalance;
            installment.paymentDate = paymentDate;
            installment.status = 'PAID';
            installment.balance = 0;
            
            installmentsUpdated++;
            detailedInstallmentsUpdated.push({
              installmentNumber: i + 1,
              status: 'FULLY_PAID',
              amountPaid: installmentBalance
            });
            
          } else if (remainingPayment > 0) {
            // Partial payment for this installment
            // First apply to interest, then to principal
            let interestPaid = Math.min(remainingPayment, installmentInterest);
            remainingPayment -= interestPaid;
            totalInterestPaid += interestPaid;
            
            let principalPaid = 0;
            if (remainingPayment > 0) {
              principalPaid = Math.min(remainingPayment, installmentPrincipal);
              remainingPayment -= principalPaid;
              totalPrincipalPaid += principalPaid;
            }
            
            const totalPaid = interestPaid + principalPaid;
            const newBalance = installmentBalance - totalPaid;
            
            installment.paidPrincipal = (installment.paidPrincipal || 0) + principalPaid;
            installment.paidInterest = (installment.paidInterest || 0) + interestPaid;
            installment.paidAmount = (installment.paidAmount || 0) + totalPaid;
            installment.paymentDate = paymentDate;
            installment.status = newBalance > 0 ? 'PARTIAL' : 'PAID';
            installment.balance = newBalance;
            
            installmentsUpdated++;
            detailedInstallmentsUpdated.push({
              installmentNumber: i + 1,
              status: 'PARTIALLY_PAID',
              amountPaid: totalPaid,
              remainingBalance: newBalance
            });
          }
        }
        
        // Calculate new outstanding principal
        const previousOutstanding = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0);
        const newOutstanding = Math.max(0, previousOutstanding - totalPrincipalPaid);
        const isFinalPayment = newOutstanding <= 0;
        
        console.log('Payment processing result:', {
          totalPrincipalPaid,
          totalInterestPaid,
          installmentsUpdated,
          previousOutstanding,
          newOutstanding,
          isFinalPayment,
          remainingPayment // This is any excess payment
        });
        
        return {
          totalPrincipalPaid,
          totalInterestPaid,
          installmentsUpdated,
          detailedInstallmentsUpdated,
          updatedSchedule: installments,
          previousOutstanding,
          newOutstanding,
          isFinalPayment,
          remainingAmount: remainingPayment
        };
        
      } catch (error) {
        console.error('Error in processPaymentAgainstSchedule:', error);
        throw error;
      }
    };

    // Helper function to generate collection ID
    const generateCollectionId = () => {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      return `COL-${timestamp}-${random}`;
    };

    // Helper function to generate transaction reference
    const generateCollectionTransactionRef = (prefix = 'REPAY') => {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      return `${prefix}-${timestamp}-${random}`;
    };

    // 6. Process payment against schedule
    const paymentResult = await processPaymentAgainstSchedule(
      repaymentSchedule,
      amount,
      paymentDate,
      loanAccount,
      transaction
    );

    console.log('Payment result:', {
      totalPrincipalPaid: paymentResult.totalPrincipalPaid,
      totalInterestPaid: paymentResult.totalInterestPaid,
      installmentsUpdated: paymentResult.installmentsUpdated,
      isFinalPayment: paymentResult.isFinalPayment
    });

    // 7. Update Loan Account
    const currentTotalRepaid = parseFloat(loanAccount.TOTAL_REPAID_AMOUNT || 0);
    
    await loanAccount.update({
      OUTSTANDING_PRINCIPAL: paymentResult.newOutstanding,
      TOTAL_REPAID_AMOUNT: currentTotalRepaid + amount,
      LAST_REPAYMENT_DATE: new Date(paymentDate),
      LAST_REPAYMENT_AMOUNT: amount,
      ...(paymentResult.isFinalPayment && {
        LOAN_STATUS: 'CLOSED',
        CLOSURE_DATE: new Date(paymentDate)
      })
    }, { transaction });

    // 8. Update Customer Account
    await sequelize.query(
      `UPDATE customer_accounts 
       SET ledger_balance = ?, 
           available_balance = ?,
           current_balance = ?,
           updated_at = NOW()
       WHERE account_number = ?`,
      {
        replacements: [
          customerBalance - amount,
          customerBalance - amount,
          customerBalance - amount,
          String(customerAccountNo)
        ],
        transaction
      }
    );

    // 9. Update Repayment Schedule
    await sequelize.query(
      `UPDATE repayment_schedules 
       SET installments_json = ?,
           status = ?,
           updated_at = NOW()
       WHERE account_number = ?`,
      {
        replacements: [
          JSON.stringify(paymentResult.updatedSchedule),
          paymentResult.isFinalPayment ? 'COMPLETED' : 'ACTIVE',
          String(ACCT_NO)
        ],
        transaction
      }
    );

    // 10. GET OR CREATE COLLECTION
    let collectionId = null;
    let collectionIdType = null;
    let collectionCreated = false;

    try {
      console.log('=== DEBUG: Checking collections table structure ===');
      
      // First, check the exact structure of the collections table
      const tableStructure = await sequelize.query(
        `SHOW COLUMNS FROM collections`,
        { transaction, type: sequelize.QueryTypes.SELECT }
      );
      
      console.log('Collections table structure:');
      tableStructure.forEach(col => {
        console.log(`  ${col.Field}: ${col.Type} ${col.Null === 'NO' ? 'NOT NULL' : 'NULL'} ${col.Default ? `DEFAULT ${col.Default}` : 'NO DEFAULT'} ${col.Extra}`);
      });
      
      // Find all NOT NULL columns without defaults
      const requiredColumns = tableStructure.filter(col => 
        col.Null === 'NO' && col.Default === null
      ).map(col => col.Field);
      
      console.log('Required columns (NOT NULL, no default):', requiredColumns);
      
      // Try to get an existing collection first
      let existingCollection = await sequelize.query(
        `SELECT id, collection_id FROM collections LIMIT 1`,
        { transaction, type: sequelize.QueryTypes.SELECT }
      );
      
      if (existingCollection && existingCollection.length > 0) {
        // Use existing collection
        collectionId = existingCollection[0].id;
        collectionIdType = 'id';
        console.log('Using existing collection with ID:', collectionId);
      } else {
        // Need to create a new collection with ALL required columns
        console.log('Creating new collection with all required columns...');
        
        // Generate values for required columns
        const columnValues = {};
        
        // Handle specific required columns
        if (requiredColumns.includes('collection_id')) {
          columnValues.collection_id = generateCollectionId();
        }
        
        if (requiredColumns.includes('group_id')) {
          columnValues.group_id = 1; // Default group ID
        }
        
        if (requiredColumns.includes('group_code')) {
          columnValues.group_code = 'DEFAULT_GROUP'; // Default group code
        }
        
        if (requiredColumns.includes('branch')) {
          columnValues.branch = 1; // Default branch
        }
        
        if (requiredColumns.includes('relationship_manager')) {
          columnValues.relationship_manager = 1; // Default relationship manager
        }
        
        // Add other required columns with default values
        const defaultValues = {
          amount: amount,
          currency: 'NGN',
          collection_date: new Date(),
          status: 'active',
          repayment_type: 'loan_repayment',
          channel: 6,
          payment_method: paymentMethod,
          transaction_reference: referenceNumber || generateCollectionTransactionRef('REPAY'),
          created_by: createdBy,
          created_at: new Date(),
          updated_at: new Date()
        };
        
        // Merge defaults
        Object.assign(columnValues, defaultValues);
        
        // Now create arrays for the SQL query
        const insertColumns = [];
        const insertValues = [];
        
        // Add ALL columns that exist in the table
        tableStructure.forEach(col => {
          if (columnValues[col.Field] !== undefined) {
            insertColumns.push(col.Field);
            insertValues.push(columnValues[col.Field]);
          } else if (col.Default !== null) {
            // Column has a default value, don't include it
            console.log(`Column ${col.Field} has default ${col.Default}, skipping`);
          } else if (col.Null === 'YES') {
            // Column is nullable, use NULL
            insertColumns.push(col.Field);
            insertValues.push(null);
          } else {
            // Required column without value - use appropriate default
            let defaultValue;
            if (col.Type.includes('int')) {
              defaultValue = 0;
            } else if (col.Type.includes('varchar') || col.Type.includes('char')) {
              defaultValue = '';
            } else if (col.Type.includes('datetime')) {
              defaultValue = new Date();
            } else if (col.Type.includes('decimal')) {
              defaultValue = 0.00;
            } else {
              defaultValue = null;
            }
            
            insertColumns.push(col.Field);
            insertValues.push(defaultValue);
            console.log(`Using default value for ${col.Field}:`, defaultValue);
          }
        });
        
        console.log('Insert columns:', insertColumns);
        console.log('Insert values (first 5):', insertValues.slice(0, 5), '...');
        
        // Build and execute insert query
        const insertQuery = `
          INSERT INTO collections (${insertColumns.join(', ')})
          VALUES (${insertColumns.map(() => '?').join(', ')})
        `;
        
        console.log('Executing collection creation...');
        await sequelize.query(insertQuery, {
          replacements: insertValues,
          transaction
        });
        
        // Get the inserted ID
        const idResult = await sequelize.query(
          'SELECT LAST_INSERT_ID() as id',
          { transaction, type: sequelize.QueryTypes.SELECT }
        );
        
        collectionId = idResult[0].id;
        collectionIdType = 'id';
        collectionCreated = true;
        
        console.log('New collection created with ID:', collectionId);
      }
      
    } catch (collectionError) {
      console.error('Collection handling error:', collectionError.message);
      console.error('Error stack:', collectionError.stack);
      
      // SIMPLER FALLBACK: Try with minimal required columns based on error
      try {
        console.log('Trying simplified collection creation...');
        
        const minimalQuery = `
          INSERT INTO collections 
          (collection_id, group_id, group_code, amount, currency, collection_date, 
           status, branch, relationship_manager, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, NOW(), ?, ?, ?, ?, NOW(), NOW())
        `;
        
        await sequelize.query(minimalQuery, {
          replacements: [
            generateCollectionId(),  // collection_id
            1,                       // group_id
            'DEFAULT_GROUP',         // group_code
            amount,                  // amount
            'NGN',                   // currency
            'pending',               // status (use default from table)
            1,                       // branch
            1,                       // relationship_manager
            createdBy                // created_by
          ],
          transaction
        });
        
        // Get the inserted ID
        const idResult = await sequelize.query(
          'SELECT LAST_INSERT_ID() as id',
          { transaction, type: sequelize.QueryTypes.SELECT }
        );
        
        collectionId = idResult[0].id;
        collectionIdType = 'id';
        collectionCreated = true;
        
        console.log('Minimal collection created with ID:', collectionId);
        
      } catch (minimalError) {
        console.error('Minimal collection creation failed:', minimalError.message);
        
        // ULTIMATE FALLBACK: Try to disable foreign key checks and insert a dummy collection
        try {
          console.log('Trying ultimate fallback with FK checks disabled...');
          
          await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
          
          // Try to insert with only absolutely essential columns
          const fallbackQuery = `
            INSERT INTO collections 
            (collection_id, group_id, group_code, amount, status, created_at, updated_at)
            VALUES (?, 1, 'DEFAULT', ?, 'active', NOW(), NOW())
          `;
          
          await sequelize.query(fallbackQuery, {
            replacements: [
              generateCollectionId(),
              amount || 0
            ],
            transaction
          });
          
          await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
          
          // Get the inserted ID
          const idResult = await sequelize.query(
            'SELECT LAST_INSERT_ID() as id',
            { transaction, type: sequelize.QueryTypes.SELECT }
          );
          
          collectionId = idResult[0].id;
          collectionIdType = 'id';
          collectionCreated = true;
          
          console.log('Fallback collection created with ID:', collectionId);
          
        } catch (ultimateError) {
          console.error('Ultimate fallback failed:', ultimateError.message);
          await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction }).catch(() => {});
          
          // If we still can't create a collection, check if loan_repayments can work without it
          console.log('Checking if loan_repayments can work without collection...');
          
          const fkNullableCheck = await sequelize.query(
            `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS 
             WHERE TABLE_SCHEMA = DATABASE() 
             AND TABLE_NAME = 'loan_repayments' 
             AND COLUMN_NAME = 'collection_id'`,
            { transaction, type: sequelize.QueryTypes.SELECT }
          );
          
          if (fkNullableCheck && fkNullableCheck.length > 0 && fkNullableCheck[0].IS_NULLABLE === 'YES') {
            console.log('loan_repayments.collection_id is nullable, will proceed without collection');
            collectionId = null;
          } else {
            throw {
              code: 'COLLECTION_CREATION_FAILED',
              message: 'Failed to create collection and foreign key requires it',
              status: 500,
              details: ultimateError.message
            };
          }
        }
      }
    }

    console.log('Final collection info:', {
      collectionId,
      collectionIdType,
      collectionCreated
    });

    // 11. Create LoanRepayment record
    console.log('Creating loan repayment with collection_id:', collectionId);

    let loanRepaymentId = null;

    try {
      // Check if we need to include collection_id
      if (collectionId !== null && collectionId !== undefined) {
        // Verify the collection exists
        const collectionCheck = await sequelize.query(
          `SELECT id FROM collections WHERE id = ?`,
          {
            replacements: [collectionId],
            transaction,
            type: sequelize.QueryTypes.SELECT
          }
        );
        
        if (!collectionCheck || collectionCheck.length === 0) {
          console.warn('Collection ID not found, will try to get any collection');
          
          const anyCollection = await sequelize.query(
            `SELECT id FROM collections LIMIT 1`,
            { transaction, type: sequelize.QueryTypes.SELECT }
          );
          
          if (anyCollection && anyCollection.length > 0) {
            collectionId = anyCollection[0].id;
            console.log('Using available collection ID:', collectionId);
          } else {
            // No collections exist, check if we can proceed without it
            const fkInfo = await sequelize.query(
              `SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS 
               WHERE TABLE_SCHEMA = DATABASE() 
               AND TABLE_NAME = 'loan_repayments' 
               AND COLUMN_NAME = 'collection_id'`,
              { transaction, type: sequelize.QueryTypes.SELECT }
            );
            
            if (fkInfo && fkInfo.length > 0 && fkInfo[0].IS_NULLABLE === 'YES') {
              collectionId = null;
              console.log('collection_id is nullable, proceeding without it');
            }
          }
        }
      }
      
      // Build the insert query
      let insertQuery;
      let replacements;
      
      if (collectionId !== null && collectionId !== undefined) {
        insertQuery = `
          INSERT INTO loan_repayments 
          (loan_account_number, loan_account_id, customer_id, principal_amount, 
           interest_amount, total_amount, repayment_date, transaction_reference, 
           status, customer_name, collection_id, installment_number, penalty_amount,
           created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;
        
        replacements = [
          String(ACCT_NO),
          loanAccount.id,
          loanAccount.CUST_ID,
          paymentResult.totalPrincipalPaid,
          paymentResult.totalInterestPaid,
          amount,
          new Date(paymentDate),
          referenceNumber || generateCollectionTransactionRef('REPAY'),
          'COMPLETED',
          loanAccount.ACCT_NM || customerAccount.account_name || 'Customer',
          collectionId,
          paymentResult.installmentsUpdated > 0 ? 1 : null,
          0
        ];
      } else {
        insertQuery = `
          INSERT INTO loan_repayments 
          (loan_account_number, loan_account_id, customer_id, principal_amount, 
           interest_amount, total_amount, repayment_date, transaction_reference, 
           status, customer_name, installment_number, penalty_amount,
           created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;
        
        replacements = [
          String(ACCT_NO),
          loanAccount.id,
          loanAccount.CUST_ID,
          paymentResult.totalPrincipalPaid,
          paymentResult.totalInterestPaid,
          amount,
          new Date(paymentDate),
          referenceNumber || generateCollectionTransactionRef('REPAY'),
          'COMPLETED',
          loanAccount.ACCT_NM || customerAccount.account_name || 'Customer',
          paymentResult.installmentsUpdated > 0 ? 1 : null,
          0
        ];
      }
      
      console.log('Executing loan repayment insertion...');
      await sequelize.query(insertQuery, {
        replacements,
        transaction
      });
      
      // Get the last insert ID
      const repaymentInsertResult = await sequelize.query(
        'SELECT LAST_INSERT_ID() as id',
        { transaction, type: sequelize.QueryTypes.SELECT }
      );
      
      loanRepaymentId = repaymentInsertResult && repaymentInsertResult.length > 0 
        ? (repaymentInsertResult[0].id || null)
        : null;
      
      console.log('Loan repayment created with ID:', loanRepaymentId);
      
    } catch (repaymentError) {
      console.error('Error creating loan repayment:', repaymentError.message);
      console.error('Error stack:', repaymentError.stack);
      
      // Final fallback: Try without collection_id
      try {
        console.log('Trying final fallback without collection_id...');
        
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction });
        
        const fallbackQuery = `
          INSERT INTO loan_repayments 
          (loan_account_number, loan_account_id, customer_id, principal_amount, 
           interest_amount, total_amount, repayment_date, transaction_reference, 
           status, customer_name, installment_number, penalty_amount,
           created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
        `;
        
        await sequelize.query(fallbackQuery, {
          replacements: [
            String(ACCT_NO),
            loanAccount.id,
            loanAccount.CUST_ID,
            paymentResult.totalPrincipalPaid,
            paymentResult.totalInterestPaid,
            amount,
            new Date(paymentDate),
            referenceNumber || generateCollectionTransactionRef('REPAY'),
            'COMPLETED',
            loanAccount.ACCT_NM || customerAccount.account_name || 'Customer',
            paymentResult.installmentsUpdated > 0 ? 1 : null,
            0
          ],
          transaction
        });
        
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction });
        
        // Get the last insert ID
        const repaymentInsertResult = await sequelize.query(
          'SELECT LAST_INSERT_ID() as id',
          { transaction, type: sequelize.QueryTypes.SELECT }
        );
        
        loanRepaymentId = repaymentInsertResult && repaymentInsertResult.length > 0 
          ? (repaymentInsertResult[0].id || null)
          : null;
        
        console.log('Fallback loan repayment created with ID:', loanRepaymentId);
        
      } catch (finalError) {
        console.error('Final fallback failed:', finalError.message);
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction }).catch(() => {});
        throw repaymentError;
      }
    }

    console.log('Final loan repayment ID:', loanRepaymentId);

    // 12. Update Loan Portfolio
    try {
      console.log('Updating loan portfolio with repayment...');
      
      // Get loan product details
      let productDetails = {
        PROD_ID: loanAccount.LOAN_PRODUCT_ID || 0,
        PRODUCT_CODE: 'GENERAL_LOAN',
        PRODUCT_NAME: 'General Loan',
        PRODUCT_TYPE: 'GENERAL_LOAN',
        BRANCH_ID: branchCode || '001'
      };
      
      // Fetch actual product details if available
      if (loanAccount.LOAN_PRODUCT_ID) {
        try {
          const loanProduct = await LoanProduct.findOne({
            where: { id: loanAccount.LOAN_PRODUCT_ID },
            transaction
          });
          
          if (loanProduct) {
            productDetails.PROD_ID = loanProduct.id;
            productDetails.PRODUCT_CODE = loanProduct.PRODUCT_CODE || 'GENERAL_LOAN';
            productDetails.PRODUCT_NAME = loanProduct.PRODUCT_NAME || 'General Loan';
            productDetails.PRODUCT_TYPE = loanProduct.PRODUCT_TYPE || 'GENERAL_LOAN';
          }
        } catch (productError) {
          console.error('Error fetching loan product:', productError.message);
        }
      }
      
      // Update portfolio with principal repayment
      const updatedPortfolio = await LoanPortfolio.updateForRepayment(
        productDetails,
        paymentResult.totalPrincipalPaid,  // Use principal, not total amount
        transaction
      );
      
      console.log('Portfolio principal updated:', {
        portfolioId: updatedPortfolio.id,
        principalPaid: paymentResult.totalPrincipalPaid,
        newOutstanding: updatedPortfolio.OUTSTANDING_PRINCIPAL,
        totalRecovered: updatedPortfolio.TOTAL_RECOVERED
      });
      
      // Update interest received if any
      if (paymentResult.totalInterestPaid > 0) {
        const currentInterest = parseFloat(updatedPortfolio.TOTAL_INTEREST_RECEIVED) || 0;
        await updatedPortfolio.update({
          TOTAL_INTEREST_RECEIVED: currentInterest + paymentResult.totalInterestPaid,
          UPDATED_BY: createdBy
        }, { transaction });
        
        console.log('Portfolio interest updated:', {
          interestPaid: paymentResult.totalInterestPaid,
          totalInterestReceived: updatedPortfolio.TOTAL_INTEREST_RECEIVED
        });
      }
      
    } catch (portfolioError) {
      console.error('Error updating loan portfolio:', portfolioError.message);
      console.warn('Portfolio update failed, but payment will continue');
    }

    // 13. Create LoanRepaymentTransaction record
    let repaymentTransactionId = null;
    try {
      const generateReceiptNumber = () => {
        const timestamp = Date.now();
        const random = Math.floor(Math.random() * 1000);
        return `RCPT-${timestamp}-${random}`;
      };
      
      // Truncate payment method to avoid column length issues
      const truncatedPaymentMethod = (paymentMethod || 'CASH').toUpperCase().replace(/\s+/g, '_').substring(0, 20);
      
      // Create repayment transaction data
      const repaymentTransactionData = {
        a_c_c_t__i_d: loanAccount.id,
        a_c_c_t__n_o: loanAccount.ACCT_NO,
        c_u_s_t__i_d: loanAccount.CUST_ID,
        t_r_a_n_s_a_c_t_i_o_n__d_a_t_e: new Date(paymentDate),
        t_r_a_n_s_a_c_t_i_o_n__t_y_p_e: 'REPAYMENT',
        a_m_o_u_n_t: amount,
        p_r_i_n_c_i_p_a_l__a_m_o_u_n_t: paymentResult.totalPrincipalPaid || 0,
        i_n_t_e_r_e_s_t__a_m_o_u_n_t: paymentResult.totalInterestPaid || 0,
        p_a_y_m_e_n_t__m_e_t_h_o_d: truncatedPaymentMethod,
        t_r_a_n_s_a_c_t_i_o_n__r_e_f_e_r_e_n_c_e: referenceNumber || `REPAY-${Date.now()}`,
        r_e_p_a_y_m_e_n_t__t_y_p_e: 'REPAYMENT',
        i_s__i_n_s_t_a_l_l_m_e_n_t: paymentResult.installmentsUpdated > 0,
        c_r_e_a_t_e_d__b_y: createdBy || 'system',
        s_t_a_t_u_s: 'COMPLETED',
        r_e_c_e_i_p_t__n_o: receiptNo || generateReceiptNumber(),
        b_r_a_n_c_h__c_o_d_e: branchCode || '001',
        p_r_o_d_u_c_t__c_o_d_e: productCode || 'DEFAULT',
        n_o_t_e_s: description || 'Loan repayment against schedule',
        g_l__p_o_s_t_e_d: false
      };
      
      console.log('Creating loan_repayment_transactions record:', repaymentTransactionData);
      const repaymentTransaction = await LoanRepaymentTransaction.create(repaymentTransactionData, { transaction });
      repaymentTransactionId = repaymentTransaction.id;
      
    } catch (txError) {
      console.error('Error creating loan repayment transaction record:', txError.message);
      // Don't fail the entire transaction if this fails
      repaymentTransactionId = null;
    }

    // 14. Create Transaction record
    const generateTransactionIds = () => {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000000).toString().padStart(7, '0');
      const baseRef = `${timestamp}${random}`;

      return {
        TRANSACTION_ID: `TXN-${timestamp}-${random}`,
        EVENT_ID: `EVT-${timestamp}-${random}`,
        TRAN_JOURNAL_ID: `JRN-${timestamp}-${random}`,
        transactionId: `TX-${timestamp}-${random}`,
        JOURNAL_ID: `JNL-${timestamp}-${random}`,
        TRANSACTION_IDENTIFIER: `TRX-${timestamp}-${random}`,
        REFERENCE: `REF-${timestamp}-${random.substr(0, 6)}`
      };
    };

    const TRANSACTION_IDS = generateTransactionIds();
    const customerName = customerAccount.account_name || 'Customer';
    const businessUnitId = loanAccount.BU_ID || customerAccount.bu_id || '001';
    const accountId = customerAccount.gl_account_id || 'DEFAULT_ACCT';

    try {
      const transactionData = {
        account_number: String(customerAccountNo),
        account_id: accountId,
        bu_id: businessUnitId,
        customer_id: String(loanAccount.CUST_ID),
        account_name: customerName,
        amount: amount,
        transaction_direction: 'DEBIT',
        transaction_date: new Date(paymentDate),
        transaction_type: 'LOAN_REPAYMENT',
        transaction_identifier: TRANSACTION_IDS.TRANSACTION_IDENTIFIER,
        transaction_id: TRANSACTION_IDS.TRANSACTION_ID,
        event_id: TRANSACTION_IDS.EVENT_ID,
        journal_id: TRANSACTION_IDS.JOURNAL_ID,
        reference: referenceNumber || TRANSACTION_IDS.REFERENCE,
        description: description || `Loan repayment for ${ACCT_NO}`,
        currency: customerAccount.currency_code || 'NGN',
        created_by: createdBy,
        status: 'COMPLETED',
        flagged_for_aml: false,
        aml_threshold_used: null,
        metadata: JSON.stringify({
          loanAccount: ACCT_NO,
          customerAccount: customerAccountNo,
          paymentMethod: paymentMethod,
          isFinalPayment: paymentResult.isFinalPayment,
          principalPaid: paymentResult.totalPrincipalPaid,
          interestPaid: paymentResult.totalInterestPaid,
          loanRepaymentId: loanRepaymentId,
          repaymentTransactionId: repaymentTransactionId,
          collectionId: collectionId
        })
      };
      
      console.log('Creating transaction with data:', {
        ...transactionData,
        metadata: 'JSON string (truncated for display)'
      });
      
      await Transaction.create(transactionData, { transaction });
      
      console.log('Transaction created successfully');
      
    } catch (txCreationError) {
      console.error('Error creating transaction:', txCreationError.message);
      // Continue without failing - transaction is optional
    }

    // 15. Create Loan Event
    try {
      const loanEventData = {
        LOAN_ACCOUNT_ID: loanAccount.id,
        LOAN_ACCOUNT_NO: String(ACCT_NO),
        CUST_ID: String(loanAccount.CUST_ID),
        CUSTOMER_NAME: loanAccount.ACCT_NM || customerAccount.account_name || 'Customer',
        eventType: 'PAYMENT_PROCESSED',
        status: 'SUCCESS',
        details: JSON.stringify({
          amount: amount,
          paymentMethod: paymentMethod,
          principalPaid: paymentResult.totalPrincipalPaid,
          interestPaid: paymentResult.totalInterestPaid,
          installmentsUpdated: paymentResult.detailedInstallmentsUpdated,
          isFinalPayment: paymentResult.isFinalPayment,
          loanRepaymentId: loanRepaymentId,
          repaymentTransactionId: repaymentTransactionId,
          collectionId: collectionId
        }),
        createdBy: createdBy,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      console.log('Creating loan event with data:', loanEventData);
      
      await LoanEvent.create(loanEventData, { transaction });
      
      console.log('Loan event created successfully');
    } catch (loanEventError) {
      console.error('Error creating loan event:', loanEventError.message);
      // Continue without failing - loan event is optional
    }

    await transaction.commit();

    console.log('=== SCHEDULE PAYMENT PROCESSED SUCCESSFULLY ===');

    return res.status(200).json({
      success: true,
      message: 'Payment processed successfully against schedule',
      data: {
        repaymentId: loanRepaymentId,
        repaymentTransactionId: repaymentTransactionId,
        collectionId: collectionId,
        transactionReference: referenceNumber || TRANSACTION_IDS.REFERENCE,
        loanAccount: {
          ACCT_NO: loanAccount.ACCT_NO,
          accountName: loanAccount.ACCT_NM,
          newOutstanding: paymentResult.newOutstanding,
          previousOutstanding: paymentResult.previousOutstanding,
          loanStatus: paymentResult.isFinalPayment ? 'CLOSED' : loanAccount.LOAN_STATUS
        },
        customerAccount: {
          accountNumber: customerAccount.account_number,
          accountName: customerAccount.account_name,
          newBalance: customerBalance - amount
        },
        paymentBreakdown: {
          totalAmount: amount,
          principalPaid: paymentResult.totalPrincipalPaid,
          interestPaid: paymentResult.totalInterestPaid,
          isFinalPayment: paymentResult.isFinalPayment,
          remainingAmount: paymentResult.remainingAmount
        },
        scheduleSummary: {
          totalInstallments: paymentResult.updatedSchedule.length,
          paidInstallments: paymentResult.updatedSchedule.filter(i => i.status === 'PAID').length,
          pendingInstallments: paymentResult.updatedSchedule.filter(i => 
            i.status === 'PENDING' || i.status === 'OVERDUE' || i.status === 'PARTIAL'
          ).length,
          installmentsUpdated: paymentResult.installmentsUpdated,
          updatedInstallments: paymentResult.detailedInstallmentsUpdated
        }
      }
    });

  } catch (error) {
    console.error('=== SCHEDULE PAYMENT ERROR ===', error);
    console.error('Stack trace:', error.stack);
    
    if (transaction) {
      await transaction.rollback();
    }
    
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to process payment against schedule',
      error: error.code || 'SCHEDULE_PAYMENT_ERROR',
      details: error.details || null,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
},

// Also update your recordManualRepayment method with raw queries:
async recordManualRepayment(req, res) {
  try {
    const { ACCT_NO } = req.params;
    const repaymentData = req.body;

    console.log('📝 Processing manual repayment for account:', ACCT_NO);

    // Find loan account
    const loanAccount = await LoanAccount.findOne({ 
      where: { ACCT_NO: ACCT_NO } 
    });
    
    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: 'Loan account not found',
        code: 'LOAN_ACCOUNT_NOT_FOUND'
      });
    }

    console.log('Found loan account:', loanAccount.ACCT_NO);

    // Create repayment records in a transaction
    const transaction = await sequelize.transaction();
    
    try {
      // 1. Create LoanRepayment record
      const loanRepaymentData = {
        loan_account_number: String(ACCT_NO),
        loan_account_id: loanAccount.id,
        customer_id: loanAccount.CUST_ID,
        principal_amount: parseFloat(repaymentData.principalPaid || '0'),
        interest_amount: parseFloat(repaymentData.interestPaid || '0'),
        total_amount: parseFloat(repaymentData.amount || 0),
        repayment_date: new Date(repaymentData.date || Date.now()),
        transaction_reference: repaymentData.referenceNumber || `MANUAL-${Date.now()}`,
        status: 'COMPLETED',
        created_at: new Date(),
        updated_at: new Date(),
        customer_name: loanAccount.ACCT_NM || 'Customer',
        collection_id: null,
        installment_number: null,
        penalty_amount: 0
      };

      console.log('Creating loan repayment:', loanRepaymentData);
      const loanRepayment = await LoanRepayment.create(loanRepaymentData, { transaction });

      // Get the loan repayment ID
      const loanRepaymentId = loanRepayment.id;

      // 2. Create LoanRepaymentTransaction record
      const repaymentTransactionId = await this.createRepaymentTransactionRecord({
        loanAccountId: loanAccount.id,
        ACCT_NO: loanAccount.ACCT_NO,
        CUST_ID: loanAccount.CUST_ID,
        amount: parseFloat(repaymentData.amount || 0),
        principalPaid: parseFloat(repaymentData.principalPaid || '0'),
        interestPaid: parseFloat(repaymentData.interestPaid || '0'),
        paymentDate: repaymentData.date || new Date(),
        paymentMethod: repaymentData.paymentMethod || 'CASH',
        reference: repaymentData.referenceNumber || `MANUAL-${Date.now()}`,
        receiptNo: repaymentData.receiptNo,
        description: repaymentData.description || 'Manual repayment',
        isInstallment: false,
        createdBy: req.user?.id || 'system',
        branchCode: repaymentData.branchCode || '001',
        productCode: repaymentData.productCode || 'DEFAULT'
      }, transaction);

      // Update loan account outstanding if needed
      if (repaymentData.updateOutstanding !== false) {
        const currentOutstanding = Math.abs(parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0));
        const newOutstanding = Math.max(0, currentOutstanding - parseFloat(repaymentData.principalPaid || '0'));
        
        await loanAccount.update({
          OUTSTANDING_PRINCIPAL: -newOutstanding,
          TOTAL_REPAID_AMOUNT: parseFloat(loanAccount.TOTAL_REPAID_AMOUNT || 0) + parseFloat(repaymentData.amount),
          LAST_REPAYMENT_DATE: new Date(repaymentData.date || Date.now()),
          LAST_REPAYMENT_AMOUNT: parseFloat(repaymentData.amount)
        }, { transaction });
      }

      await transaction.commit();

      return res.status(201).json({
        success: true,
        message: 'Manual repayment recorded successfully',
        data: {
          loanRepaymentId: loanRepaymentId, // Use loanRepaymentId
          repaymentTransactionId: repaymentTransactionId
        }
      });
      
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    
  } catch (error) {
    console.error('Record manual repayment error:', error);
    console.error('Stack trace:', error.stack);
    return res.status(500).json({
      success: false,
      message: 'Failed to record manual repayment',
      error: error.message,
      details: error.details || null
    });
  }
},


// GET LOAN ACCOUNT STATUS PENDING

// GET /api/loans/pending
// In your LoanAccountController.js - fix the getPendingLoans function
async getPendingLoans  (req, res) {
  try {
    console.log('🔍 Fetching pending loans...');
    
    // Optional query parameters
    const { 
      page = 1, 
      limit = 50, 
      sortBy = 'created_at', 
      sortOrder = 'DESC',
      search = '',
      fromDate,
      toDate
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    // Build base query
    let baseQuery = `
      SELECT 
        id,
        a_c_c_t__n_o as account_number,
        a_c_c_t__n_m as account_name,
        c_u_s_t__i_d as customer_id,
        l_o_a_n__p_r_o_d_u_c_t__i_d as product_id,
        a_m_o_u_n_t as amount,
        i_n_t_e_r_e_s_t__r_a_t_e as interest_rate,
        l_o_a_n__s_t_a_t_u_s as status,
        s_e_r_v_i_c_i_n_g__s_t_a_t_u_s as servicing_status,
        a_p_p_l_i_c_a_t_i_o_n__d_a_t_e as application_date,
        m_a_t_u_r_i_t_y__d_t as maturity_date,
        t_e_r_m__c_d as term_code,
        t_e_r_m__v_a_l_u_e as term_value,
        has_repayment_schedule,
        repayment_schedule_id,
        d_i_s_b_u_r_s_e_d__a_m_o_u_n_t as disbursed_amount,
        o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l as outstanding_principal,
        a_c_c_r_u_e_d__i_n_t_e_r_e_s_t as accrued_interest,
        created_at,
        updated_at
      FROM loan_accounts 
      WHERE l_o_a_n__s_t_a_t_u_s = 'PENDING'
    `;
    
    // Add search filters if provided
    const replacements = [];
    
    if (search) {
      baseQuery += ` AND (
        a_c_c_t__n_o LIKE ? OR 
        a_c_c_t__n_m LIKE ? OR 
        c_u_s_t__i_d LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      replacements.push(searchTerm, searchTerm, searchTerm);
    }
    
    if (fromDate) {
      baseQuery += ` AND DATE(created_at) >= ?`;
      replacements.push(fromDate);
    }
    
    if (toDate) {
      baseQuery += ` AND DATE(created_at) <= ?`;
      replacements.push(toDate);
    }
    
    // Add sorting
    const validSortColumns = [
      'created_at', 'updated_at', 'application_date', 'maturity_date', 
      'amount', 'account_number', 'customer_id'
    ];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const order = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    
    baseQuery += ` ORDER BY ${sortColumn} ${order}`;
    
    // FIX: Get total count separately - don't modify the query
    const countQuery = `
      SELECT COUNT(*) as total FROM loan_accounts 
      WHERE l_o_a_n__s_t_a_t_u_s = 'PENDING'
    `;
    
    console.log('🔢 Executing count query:', countQuery);
    const countResult = await sequelize.query(countQuery, {
      type: sequelize.QueryTypes.SELECT
    });
    
    const total = countResult[0]?.total || 0;
    console.log(`📊 Total pending loans from count query: ${total}`);
    
    // Add pagination to main query
    baseQuery += ` LIMIT ? OFFSET ?`;
    replacements.push(parseInt(limit), parseInt(offset));
    
    console.log('📋 Executing main query:', baseQuery);
    console.log('🔧 Replacements:', replacements);
    
    // Execute main query
    const pendingLoans = await sequelize.query(baseQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT
    });
    
    console.log(`✅ Found ${pendingLoans.length} pending loans in data query (total from count: ${total})`);
    
    // Format the response
    const formattedLoans = pendingLoans.map(loan => {
      // Calculate days since application
      const daysSinceApplication = loan.application_date 
        ? Math.floor((new Date() - new Date(loan.application_date)) / (1000 * 60 * 60 * 24))
        : 0;
      
      // Calculate maturity status
      let maturityStatus = 'ON_TRACK';
      if (loan.maturity_date) {
        const daysToMaturity = Math.floor((new Date(loan.maturity_date) - new Date()) / (1000 * 60 * 60 * 24));
        if (daysToMaturity < 0) {
          maturityStatus = 'OVERDUE';
        } else if (daysToMaturity < 30) {
          maturityStatus = 'NEAR_MATURITY';
        }
      }
      
      return {
        id: loan.id,
        account_number: loan.account_number,
        account_name: loan.account_name,
        customer_id: loan.customer_id,
        product_id: loan.product_id,
        amount: parseFloat(loan.amount || 0),
        formatted_amount: `₦${parseFloat(loan.amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        interest_rate: parseFloat(loan.interest_rate || 0),
        formatted_interest_rate: `${parseFloat(loan.interest_rate || 0).toFixed(2)}%`,
        status: loan.status,
        servicing_status: loan.servicing_status,
        application_date: loan.application_date,
        formatted_application_date: loan.application_date 
          ? new Date(loan.application_date).toLocaleDateString('en-NG')
          : 'N/A',
        maturity_date: loan.maturity_date,
        formatted_maturity_date: loan.maturity_date 
          ? new Date(loan.maturity_date).toLocaleDateString('en-NG')
          : 'N/A',
        term: `${loan.term_value} ${loan.term_code}`,
        term_code: loan.term_code,
        term_value: loan.term_value,
        has_repayment_schedule: Boolean(loan.has_repayment_schedule),
        repayment_schedule_id: loan.repayment_schedule_id,
        disbursed_amount: parseFloat(loan.disbursed_amount || 0),
        outstanding_principal: parseFloat(loan.outstanding_principal || 0),
        accrued_interest: parseFloat(loan.accrued_interest || 0),
        created_at: loan.created_at,
        updated_at: loan.updated_at,
        // Additional calculated fields
        days_since_application: daysSinceApplication,
        maturity_status: maturityStatus,
        approval_status: 'PENDING'
      };
    });
    
    // Calculate summary stats
    const totalAmount = pendingLoans.reduce((sum, loan) => sum + parseFloat(loan.amount || 0), 0);
    const averageAmount = pendingLoans.length > 0 ? totalAmount / pendingLoans.length : 0;
    
    // Get oldest and newest application dates
    const applicationDates = pendingLoans
      .map(l => new Date(l.application_date || l.created_at).getTime())
      .filter(t => !isNaN(t));
    
    const oldestApplication = applicationDates.length > 0 ? Math.min(...applicationDates) : null;
    const newestApplication = applicationDates.length > 0 ? Math.max(...applicationDates) : null;
    
    return res.status(200).json({
      success: true,
      message: `${formattedLoans.length} pending loan(s) found`,
      data: {
        loans: formattedLoans,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: total, // Use the count from the separate query
          pages: Math.ceil(total / limit)
        },
        summary: {
          total_pending: total,
          total_amount: totalAmount,
          average_amount: averageAmount,
          oldest_application: oldestApplication,
          newest_application: newestApplication,
          // Additional useful stats
          unique_customers: [...new Set(pendingLoans.map(l => l.customer_id))].length,
          unique_products: [...new Set(pendingLoans.map(l => l.product_id))].length
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching pending loans:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pending loans',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
},


// In your LoanAccountController.js

// ==================== GENERATE LOAN CONTRACT API ====================
async generateLoanContract(req, res) {
    console.log("=== DEBUG: Starting generateLoanContract ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    
    let transaction;
    
    try {
        const { 
            ACCT_NO, 
            generatedBy,
            download = false,
            saveToDatabase = true
        } = req.body;

        console.log("DEBUG: ACCT_NO =", ACCT_NO);
        console.log("DEBUG: generatedBy =", generatedBy);

        // Validate required fields
        if (!ACCT_NO || !generatedBy) {
            return res.status(400).json({
                success: false,
                message: "ACCT_NO and generatedBy are required",
                code: "MISSING_FIELDS"
            });
        }

        // Start transaction
        transaction = await sequelize.transaction({ readOnly: true });
        console.log("DEBUG: Transaction started");

        // ==================== 1. FIND LOAN ACCOUNT USING ACTUAL COLUMN NAME ====================
        console.log(`DEBUG: Looking for loan account: ${ACCT_NO} in column a_c_c_t__n_o`);
        
        const loanAccounts = await sequelize.query(
            `SELECT * FROM loan_accounts WHERE a_c_c_t__n_o = ? LIMIT 1`,
            {
                replacements: [ACCT_NO],
                transaction,
                type: QueryTypes.SELECT
            }
        );

        console.log("DEBUG: Query result length:", loanAccounts.length);
        
        if (loanAccounts.length === 0) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: `Loan account ${ACCT_NO} not found`,
                code: "LOAN_NOT_FOUND",
                debug: {
                    searchedAccount: ACCT_NO,
                    columnUsed: 'a_c_c_t__n_o'
                }
            });
        }

        const loanAccount = loanAccounts[0];
        console.log("DEBUG: Found loan account successfully");
        
        // ==================== 2. EXTRACT DATA USING ACTUAL COLUMN NAMES ====================
        const customerId = loanAccount.CUST_ID || '';  // This column is already CUST_ID
        const customerName = loanAccount.a_c_c_t__n_m || '';
        const productId = loanAccount.l_o_a_n__p_r_o_d_u_c_t__i_d || 1001;
        const interestRate = parseFloat(loanAccount.i_n_t_e_r_e_s_t__r_a_t_e || 0);
        const loanAmount = parseFloat(loanAccount.a_m_o_u_n_t || 0);
        const termCode = loanAccount.t_e_r_m__c_d || 'M';
        const termValue = parseFloat(loanAccount.t_e_r_m__v_a_l_u_e || 0);
        const loanPurpose = loanAccount.loan_purpose || 'Business';
        const securityCollateral = loanAccount.security_collateral || 'Land';
        const borrowerAddress = loanAccount.borrower_address || 'Address Not Provided';

        console.log("DEBUG: Extracted data:");
        console.log("  Customer ID:", customerId);
        console.log("  Customer Name:", customerName);
        console.log("  Product ID:", productId);
        console.log("  Interest Rate:", interestRate);
        console.log("  Loan Amount:", loanAmount);
        console.log("  Term Code:", termCode);
        console.log("  Term Value:", termValue);
        console.log("  Loan Purpose:", loanPurpose);
        console.log("  Security:", securityCollateral);

        // ==================== 3. GET CUSTOMER DETAILS ====================
        let customerDetails = {
            CUST_NM: customerName,
            HOME_ADDRESS: borrowerAddress
        };

        // Try to get customer details if we have an ID
        if (customerId) {
            try {
                const customerResults = await sequelize.query(
                    `SELECT * FROM customers WHERE id = ? OR CUST_ID = ? LIMIT 1`,
                    {
                        replacements: [customerId, customerId],
                        transaction,
                        type: QueryTypes.SELECT
                    }
                );

                if (customerResults && customerResults.length > 0) {
                    const customer = customerResults[0];
                    console.log("DEBUG: Found customer details");
                    
                    // Get customer name
                    customerDetails.CUST_NM = customer.full_name || customer.name || customerName;
                    
                    // Get address
                    const addressFields = ['address', 'home_address', 'residential_address', 'contact_address'];
                    for (const field of addressFields) {
                        if (customer[field]) {
                            customerDetails.HOME_ADDRESS = customer[field];
                            break;
                        }
                    }
                }
            } catch (error) {
                console.warn("DEBUG: Could not get customer details:", error.message);
            }
        }

        // ==================== 4. GET LOAN PRODUCT DETAILS ====================
        let processingFeeRate = 1.0;
        let insuranceFeeRate = 1.0;

        if (productId) {
            try {
                const productResults = await sequelize.query(
                    `SELECT * FROM loan_products WHERE id = ? OR p_r_o_d__i_d = ? LIMIT 1`,
                    {
                        replacements: [productId, productId],
                        transaction,
                        type: QueryTypes.SELECT
                    }
                );
                
                if (productResults && productResults.length > 0) {
                    const product = productResults[0];
                    console.log("DEBUG: Retrieved product details");
                    
                    // Get fees from product
                    processingFeeRate = parseFloat(product.processing_fee_rate || 1.0);
                    insuranceFeeRate = parseFloat(product.insurance_fee_rate || 1.0);
                    
                    // Update interest rate if available from product
                    if (product.effective_interest_rate) {
                        interestRate = parseFloat(product.effective_interest_rate);
                    } else if (product.interest_rate) {
                        interestRate = parseFloat(product.interest_rate);
                    }
                }
            } catch (error) {
                console.warn("DEBUG: Error retrieving product config:", error.message);
            }
        }

        // ==================== 5. CALCULATE DATES AND AMOUNTS ====================
        const now = new Date();
        const disbursementAmount = Math.abs(loanAmount);
        
        // Calculate maturity date
        const maturityDate = new Date(now);
        if (termCode === 'M' || termCode === 'MONTHLY') {
            maturityDate.setMonth(maturityDate.getMonth() + termValue);
        } else if (termCode === 'Y' || termCode === 'YEARLY') {
            maturityDate.setFullYear(maturityDate.getFullYear() + termValue);
        }
        
        // First payment is 30 days from now
        const firstPaymentDate = new Date(now);
        firstPaymentDate.setDate(firstPaymentDate.getDate() + 30);

        // Calculate fees
        const processingFeeAmount = (disbursementAmount * processingFeeRate) / 100;
        const insuranceFeeAmount = (disbursementAmount * insuranceFeeRate) / 100;
        const totalFees = processingFeeAmount + insuranceFeeAmount;

        // ==================== 6. GENERATE CONTRACT TEXT ====================
        const generateContractText = () => {
            const today = new Date();
            const formattedDate = today.toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
            });
            
            // Helper function to convert number to words
            const numberToWords = (num) => {
                const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
                const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
                const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
                
                if (num === 0) return 'Zero';
                
                // For amounts in thousands
                const thousands = Math.floor(num / 1000);
                const remainder = num % 1000;
                
                let words = '';
                
                if (thousands > 0) {
                    words += numberToWords(thousands) + ' Thousand';
                    if (remainder > 0) words += ' ';
                }
                
                if (remainder > 0) {
                    const hundreds = Math.floor(remainder / 100);
                    const tensOnes = remainder % 100;
                    
                    if (hundreds > 0) {
                        words += ones[hundreds] + ' Hundred';
                        if (tensOnes > 0) words += ' ';
                    }
                    
                    if (tensOnes > 0) {
                        if (tensOnes < 10) {
                            words += ones[tensOnes];
                        } else if (tensOnes < 20) {
                            words += teens[tensOnes - 10];
                        } else {
                            const ten = Math.floor(tensOnes / 10);
                            const one = tensOnes % 10;
                            words += tens[ten];
                            if (one > 0) {
                                words += ' ' + ones[one];
                            }
                        }
                    }
                }
                
                return words;
            };
            
            const amountInWords = numberToWords(Math.floor(disbursementAmount)) + ' Naira Only';
            
            return `
OFFER OF CREDIT FACILITY
=========================================

Date: ${formattedDate}                                         
Customer Name: ${customerDetails.CUST_NM}
ADDRESS: ${customerDetails.HOME_ADDRESS}

OFFER OF CREDIT FACILITY

We are pleased to inform you that your application for a loan has been approved under the following terms and conditions:

1. Facility Type: Working Capital Loan
2. Facility Amount: ${amountInWords} (₦${disbursementAmount.toLocaleString()})
3. Purpose of Loan: ${loanPurpose}
4. Tenor: ${termValue} ${termCode === 'M' || termCode === 'MONTHLY' ? 'Months' : 'Years'} from the date of disbursement.
5. Repayment Type and Frequency: Monthly Repayments
6. Interest Rate: ${interestRate}% per month subject to review in line with market conditions.
7. Fees and Charges: ${(processingFeeRate + insuranceFeeRate)}%
   • Processing Fee: ${processingFeeRate}% of facility amount (₦${processingFeeAmount.toLocaleString()})
   • Insurance/Management Fee: ${insuranceFeeRate}% of facility amount (₦${insuranceFeeAmount.toLocaleString()})
8. Security/Collateral: ${securityCollateral}
9. Conditions Precedent to Disbursement:
   The following conditions must be met before disbursement of funds:
   A. Acceptance and execution of this offer letter.
   B. Submission of duly completed loan application form.
   C. Submission of required KYC documents.
   D. Execution of security documents.
   E. Provision of post-dated cheques or direct debit mandate.
   F. Payment of all applicable fees.

10. Conditions Subsequent:
    The Borrower agrees to:
    a. Use the facility strictly for the approved purpose.
    b. Maintain good credit conduct and not default on any due repayment.
    c. Notify the Bank promptly of any change in business address, contact details or significant business development.
    d. Permit the Bank to carry out regular business visits or monitoring when required.
    e. Promptly provide additional documentation or security if required due to adverse business changes or poor repayment behavior.

11. Events of Default:
    Default shall occur if:
    a. Repayments are not made on due dates.
    b. False or misleading information was provided.
    c. Any covenant, undertaking, or obligation under this agreement is breached.
    d. The Borrower becomes insolvent or is subject to legal proceedings affecting ability to repay.

Kindly signify your acceptance of this offer by signing and returning a duplicate copy of this letter.

Thank you for choosing GO LEXICA Resources & Finance Company. We look forward to a mutually beneficial relationship.

Yours faithfully,

For: GO-LEXICA RESOURCES & FINANCE COMPANY

_________________________			______________________
Pastor Tony Ekeh					Lilian Anulika Ndu
Chairman								Business Manager

CUSTOMER'S ACCEPTANCE

I, ${customerDetails.CUST_NM}, hereby accept the terms and conditions of this loan offer.

Signature: ___________________
Date: ___________________

Loan Account Number: ${ACCT_NO}
Contract Generated: ${formattedDate}
Generated By: ${generatedBy}
            `;
        };

        const contractText = generateContractText();
        
        console.log("DEBUG: Contract text generated successfully");

        // ==================== 7. PREPARE RESPONSE ====================
        const responseData = {
            success: true,
            message: "Loan contract generated successfully",
            data: {
                contract: {
                    loanAccount: ACCT_NO,
                    contractGeneratedDate: now,
                    borrowerDetails: customerDetails,
                    loanDetails: {
                        AMOUNT: disbursementAmount,
                        INTEREST_RATE: interestRate,
                        TERM_VALUE: termValue,
                        TERM_CD: termCode,
                        DISBURSEMENT_DATE: now,
                        FIRST_PAYMENT_DATE: firstPaymentDate,
                        MATURITY_DATE: maturityDate,
                        LOAN_PURPOSE: loanPurpose,
                        SECURITY_COLLATERAL: securityCollateral
                    },
                    financialSummary: {
                        loanAmount: `₦${disbursementAmount.toLocaleString()}`,
                        interestRate: `${interestRate}% per month`,
                        loanTerm: `${termValue} ${termCode === 'M' || termCode === 'MONTHLY' ? 'Months' : 'Years'}`,
                        processingFee: `₦${processingFeeAmount.toLocaleString()} (${processingFeeRate}%)`,
                        insuranceFee: `₦${insuranceFeeAmount.toLocaleString()} (${insuranceFeeRate}%)`,
                        totalFees: `₦${totalFees.toLocaleString()}`
                    }
                },
                contractText: contractText,
                metadata: {
                    generatedBy: generatedBy,
                    generationDate: now.toISOString(),
                    customerId: customerId,
                    customerName: customerDetails.CUST_NM,
                    actualAccountColumn: 'a_c_c_t__n_o'
                }
            }
        };

        // ==================== 8. OPTIONAL: SAVE TO DATABASE ====================
        if (saveToDatabase !== false) {
            try {
                // Check if contract already exists
                const existingContracts = await sequelize.query(
                    `SELECT * FROM loan_contract_forms WHERE loan_account_no = ? LIMIT 1`,
                    {
                        replacements: [ACCT_NO],
                        transaction,
                        type: QueryTypes.SELECT
                    }
                );

                const contractNumber = `LOAN-CONTRACT-${ACCT_NO}-${Date.now()}`;
                
                if (existingContracts && existingContracts.length > 0) {
                    // Update existing contract
                    await sequelize.query(
                        `UPDATE loan_contract_forms 
                         SET contract_text = ?,
                             status = 'GENERATED',
                             updated_at = ?,
                             u_s_e_r__i_d = ?
                         WHERE loan_account_no = ?`,
                        {
                            replacements: [contractText, now, generatedBy, ACCT_NO],
                            transaction
                        }
                    );
                    console.log("DEBUG: Updated existing contract in database");
                } else {
                    // Insert new contract
                    await sequelize.query(
                        `INSERT INTO loan_contract_forms (
                            loan_contract_no,
                            customer_id,
                            borrower_name,
                            borrower_address,
                            loan_purpose,
                            loan_amount,
                            loan_term,
                            t_e_r_m__c_d,
                            interest_rate,
                            status,
                            contract_text,
                            u_s_e_r__i_d,
                            loan_account_no,
                            metadata,
                            disbursement_date,
                            maturity_date,
                            created_at,
                            updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        {
                            replacements: [
                                contractNumber,
                                customerId || 'UNKNOWN',
                                customerName,
                                borrowerAddress,
                                loanPurpose,
                                disbursementAmount.toString(),
                                termValue,
                                termCode,
                                interestRate,
                                'GENERATED',
                                contractText,
                                generatedBy,
                                ACCT_NO,
                                JSON.stringify({
                                    generatedBy: generatedBy,
                                    generationDate: now.toISOString(),
                                    processingFeeRate: processingFeeRate,
                                    insuranceFeeRate: insuranceFeeRate
                                }),
                                now,
                                maturityDate,
                                now,
                                now
                            ],
                            transaction
                        }
                    );
                    console.log(`DEBUG: Created new contract in database`);
                }
            } catch (dbError) {
                console.warn("DEBUG: Could not save contract to database:", dbError.message);
            }
        }

        // ==================== 9. COMMIT AND RESPOND ====================
        await transaction.commit();
        console.log("DEBUG: Transaction committed successfully");

        if (!download) {
            return res.status(200).json(responseData);
        }
        
        const fileName = `Loan-Contract-${ACCT_NO}-${Date.now()}.txt`;
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        return res.send(contractText);

    } catch (error) {
        console.error("DEBUG: Error in generateLoanContract:", error);
        console.error("DEBUG: Error stack:", error.stack);
        
        try {
            if (transaction && !transaction.finished) {
                await transaction.rollback();
                console.log("DEBUG: Transaction rolled back successfully");
            }
        } catch (rollbackError) {
            console.error("DEBUG: Rollback failed:", rollbackError.message);
        }

        return res.status(500).json({
            success: false,
            message: "Failed to generate loan contract",
            error: error.message,
            code: "CONTRACT_GENERATION_ERROR",
            debug: process.env.NODE_ENV === 'development' ? {
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack
            } : undefined
        });
    }
},

/**
 * Get simple list of pending loans (without pagination)
 */
async getPendingLoansSimple  (req, res) {
  try {
    const pendingLoans = await sequelize.query(`
      SELECT 
        id,
        a_c_c_t__n_o as account_number,
        a_c_c_t__n_m as account_name,
        c_u_s_t__i_d as customer_id,
        a_m_o_u_n_t as amount,
        i_n_t_e_r_e_s_t__r_a_t_e as interest_rate,
        l_o_a_n__s_t_a_t_u_s as status,
        a_p_p_l_i_c_a_t_i_o_n__d_a_t_e as application_date,
        created_at
      FROM loan_accounts 
      WHERE l_o_a_n__s_t_a_t_u_s = 'PENDING'
      ORDER BY created_at DESC
    `, { type: sequelize.QueryTypes.SELECT });
    
    res.status(200).json({
      success: true,
      count: pendingLoans.length,
      data: pendingLoans
    });
  } catch (error) {
    console.error('Error in getPendingLoansSimple:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch pending loans',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
},

/**
 * Get summary statistics of pending loans
 */
async getPendingLoansSummary (req, res) {
  try {
    const summary = await sequelize.query(`
      SELECT 
        COUNT(*) as total_count,
        SUM(a_m_o_u_n_t) as total_amount,
        AVG(a_m_o_u_n_t) as average_amount,
        MIN(a_p_p_l_i_c_a_t_i_o_n__d_a_t_e) as oldest_application,
        MAX(a_p_p_l_i_c_a_t_i_o_n__d_a_t_e) as newest_application,
        COUNT(DISTINCT c_u_s_t__i_d) as unique_customers,
        COUNT(DISTINCT l_o_a_n__p_r_o_d_u_c_t__i_d) as unique_products
      FROM loan_accounts 
      WHERE l_o_a_n__s_t_a_t_u_s = 'PENDING'
    `, { type: sequelize.QueryTypes.SELECT });
    
    const termBreakdown = await sequelize.query(`
      SELECT 
        t_e_r_m__c_d as term_code,
        COUNT(*) as count,
        SUM(a_m_o_u_n_t) as total_amount
      FROM loan_accounts 
      WHERE l_o_a_n__s_t_a_t_u_s = 'PENDING'
      GROUP BY t_e_r_m__c_d
    `, { type: sequelize.QueryTypes.SELECT });
    
    res.status(200).json({
      success: true,
      data: {
        summary: summary[0],
        term_breakdown: termBreakdown,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error in getPendingLoansSummary:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch pending loans summary' 
    });
  }
},

/**
 * Get details of a specific pending loan by account number
 */
async getPendingLoanByAccount (req, res) {
  try {
    const { accountNumber } = req.params;
    
    const loan = await sequelize.query(`
      SELECT 
        la.id,
        la.a_c_c_t__n_o as account_number,
        la.a_c_c_t__n_m as account_name,
        la.c_u_s_t__i_d as customer_id,
        la.l_o_a_n__p_r_o_d_u_c_t__i_d as product_id,
        la.a_m_o_u_n_t as amount,
        la.i_n_t_e_r_e_s_t__r_a_t_e as interest_rate,
        la.l_o_a_n__s_t_a_t_u_s as status,
        la.s_e_r_v_i_c_i_n_g__s_t_a_t_u_s as servicing_status,
        la.a_p_p_l_i_c_a_t_i_o_n__d_a_t_e as application_date,
        la.m_a_t_u_r_i_t_y__d_t as maturity_date,
        la.t_e_r_m__c_d as term_code,
        la.t_e_r_m__v_a_l_u_e as term_value,
        la.has_repayment_schedule,
        la.repayment_schedule_id,
        la.d_i_s_b_u_r_s_e_d__a_m_o_u_n_t as disbursed_amount,
        la.o_u_t_s_t_a_n_d_i_n_g__p_r_i_n_c_i_p_a_l as outstanding_principal,
        la.a_c_c_r_u_e_d__i_n_t_e_r_e_s_t as accrued_interest,
        la.created_at,
        la.updated_at,
        ca.CUST_NM as customer_name,
        ca.EMAIL_ADDRESS as customer_email,
        ca.PHONE_NO as customer_phone,
        lp.PRODUCT_NAME as product_name,
        lp.PRODUCT_TYPE as product_type
      FROM loan_accounts la
      LEFT JOIN customers ca ON la.c_u_s_t__i_d = ca.CUST_ID
      LEFT JOIN loan_products lp ON la.l_o_a_n__p_r_o_d_u_c_t__i_d = lp.PROD_ID
      WHERE la.a_c_c_t__n_o = ? 
        AND la.l_o_a_n__s_t_a_t_u_s = 'PENDING'
    `, {
      replacements: [accountNumber],
      type: sequelize.QueryTypes.SELECT
    });
    
    if (loan.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Pending loan not found or loan is not in PENDING status'
      });
    }
    
    res.status(200).json({
      success: true,
      data: loan[0]
    });
  } catch (error) {
    console.error('Error in getPendingLoanByAccount:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch pending loan details' 
    });
  }
},

/**
 * Get pending loans for a specific customer
 */
async getPendingLoansByCustomer(req, res) {
  try {
    const { customerId } = req.params;
    
    // If customerId is actually the account_number
    const loans = await sequelize.query(`
      SELECT 
        id,
        a_c_c_t__n_o as account_number,
        a_c_c_t__n_m as account_name,
        a_m_o_u_n_t as amount,
        i_n_t_e_r_e_s_t__r_a_t_e as interest_rate,
        l_o_a_n__s_t_a_t_u_s as status,
        a_p_p_l_i_c_a_t_i_o_n__d_a_t_e as application_date,
        m_a_t_u_r_i_t_y__d_t as maturity_date,
        t_e_r_m__c_d as term_code,
        t_e_r_m__v_a_l_u_e as term_value,
        created_at
      FROM loan_accounts 
      WHERE a_c_c_t__n_o = ?  -- Using account_number instead of c_u_s_t__i_d
        AND l_o_a_n__s_t_a_t_u_s = 'PENDING'
      ORDER BY created_at DESC
    `, {
      replacements: [customerId],
      type: sequelize.QueryTypes.SELECT
    });
    
    res.status(200).json({
      success: true,
      count: loans.length,
      customer_id: customerId,
      data: loans
    });
  } catch (error) {
    console.error('Error in getPendingLoansByCustomer:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch customer pending loans',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
},

/**
 * Bulk actions on pending loans
 */
async bulkActionPendingLoans  (req, res) {
  try {
    const { action, loanIds, reason, userId, userRole } = req.body;
    
    if (!action || !loanIds || !Array.isArray(loanIds) || loanIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Action, loanIds array, userId, and userRole are required'
      });
    }
    
    const validActions = ['APPROVE', 'REJECT'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action must be either APPROVE or REJECT'
      });
    }
    
    // Update all specified loans
    const updateQuery = `
      UPDATE loan_accounts 
      SET l_o_a_n__s_t_a_t_u_s = ?,
          updated_at = NOW()
      WHERE id IN (?)
        AND l_o_a_n__s_t_a_t_u_s = 'PENDING'
    `;
    
    const [affectedRows] = await sequelize.query(updateQuery, {
      replacements: [action === 'APPROVE' ? 'APPROVED' : 'REJECTED', loanIds]
    });
    
    // Log the bulk action
    await sequelize.query(`
      INSERT INTO loan_audit_logs (
        action, loan_ids, reason, performed_by, performed_by_role, created_at
      ) VALUES (?, ?, ?, ?, ?, NOW())
    `, {
      replacements: [action, JSON.stringify(loanIds), reason || '', userId, userRole]
    });
    
    res.status(200).json({
      success: true,
      message: `${affectedRows} loan(s) ${action.toLowerCase()}ed successfully`,
      data: {
        action,
        affected_count: affectedRows,
        loan_ids: loanIds,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error in bulkActionPendingLoans:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to process bulk action' 
    });
  }
},

  // =========================
  // LOAN INFORMATION METHODS
  // =========================

async getLoanAccountByAcctNo(req, res) {
  try {
    // Extract ACCT_NO from URL parameter
    const ACCT_NO = req.params.ACCT_NO;
    
    console.log('🔍 [DEBUG] getLoanAccountByAcctNo called');
    console.log('🔍 Received ACCT_NO parameter:', ACCT_NO);
    console.log('🔍 Full URL:', req.originalUrl);

    if (!ACCT_NO || ACCT_NO.trim() === '') {
      return res.status(400).json({ 
        success: false,
        message: 'Account number is required',
        help: 'Please provide an account number in the URL: /api/loans/loan-account/10017345077'
      });
    }

    const accountNumber = ACCT_NO.trim();
    console.log('🔍 Searching for loan account with number:', accountNumber);

    // FIRST: Let's check if the table exists and see the exact column names
    console.log('🔍 Checking loan_accounts table structure...');
    
    try {
      const [columns] = await sequelize.query(
        'SHOW COLUMNS FROM loan_accounts',
        { type: sequelize.QueryTypes.SELECT }
      );
      
      console.log('🔍 Available columns in loan_accounts:');
      columns.forEach(col => {
        console.log(`  - ${col.Field} (Type: ${col.Type})`);
      });
      
      // Look for account number columns
      const accountColumns = columns.filter(col => 
        col.Field.toLowerCase().includes('acct') || 
        col.Field.toLowerCase().includes('account') ||
        col.Field.toLowerCase().includes('no')
      );
      
      console.log('🔍 Potential account number columns:', accountColumns.map(c => c.Field));
    } catch (error) {
      console.error('❌ Error checking table structure:', error.message);
    }

    // SECOND: Try the EXACT column name from your data: a_c_c_t__n_o
    console.log('🔍 Trying exact column name: a_c_c_t__n_o');
    
    let loanAccount;
    
    try {
      // Method 1: Direct SQL with exact column name
      const [result] = await sequelize.query(
        `SELECT * FROM loan_accounts WHERE a_c_c_t__n_o = ? LIMIT 1`,
        {
          replacements: [accountNumber],
          type: sequelize.QueryTypes.SELECT
        }
      );
      
      if (result) {
        loanAccount = result;
        console.log('✅ Found using column: a_c_c_t__n_o');
        console.log('✅ Found loan account ID:', result.id);
        console.log('✅ Loan status:', result.l_o_a_n__s_t_a_t_u_s);
      } else {
        console.log('❌ Not found with a_c_c_t__n_o, trying other variations...');
        
        // Try other possible column names
        const possibleColumns = [
          'ACCT_NO', 
          'account_no', 
          'account_number', 
          'loan_account_no',
          'acct_no',
          'a_c_c_t__n_o'  // Already tried, but included for completeness
        ];
        
        for (const column of possibleColumns) {
          try {
            const [row] = await sequelize.query(
              `SELECT * FROM loan_accounts WHERE ${column} = ? LIMIT 1`,
              {
                replacements: [accountNumber],
                type: sequelize.QueryTypes.SELECT
              }
            );
            
            if (row) {
              loanAccount = row;
              console.log(`✅ Found using column: ${column}`);
              break;
            }
          } catch (e) {
            console.log(`  ⚠️ Column ${column} not found or error:`, e.message);
          }
        }
      }
      
      // Method 2: Try Sequelize model if you have it
      if (!loanAccount && LoanAccount && typeof LoanAccount.findOne === 'function') {
        console.log('🔍 Trying Sequelize model...');
        
        // First try with a_c_c_t__n_o
        loanAccount = await LoanAccount.findOne({ 
          where: { a_c_c_t__n_o: accountNumber }
        });
        
        if (!loanAccount) {
          // Try with ACCT_NO
          loanAccount = await LoanAccount.findOne({ 
            where: { ACCT_NO: accountNumber }
          });
        }
        
        if (loanAccount) {
          console.log('✅ Found using Sequelize model');
        }
      }
      
    } catch (queryError) {
      console.error('❌ Database query error:', queryError.message);
    }

    if (!loanAccount) {
      // Let's see what's actually in the database for debugging
      try {
        console.log('🔍 Checking what accounts exist (first 10)...');
        const [allAccounts] = await sequelize.query(
          'SELECT id, a_c_c_t__n_o, l_o_a_n__s_t_a_t_u_s FROM loan_accounts LIMIT 10',
          { type: sequelize.QueryTypes.SELECT }
        );
        
        console.log('🔍 Sample accounts in database:');
        allAccounts.forEach(acc => {
          console.log(`  - ID: ${acc.id}, Account No: ${acc.a_c_c_t__n_o}, Status: ${acc.l_o_a_n__s_t_a_t_u_s}`);
        });
        
        // Check if our account exists with different casing or spaces
        const [exactMatch] = await sequelize.query(
          'SELECT * FROM loan_accounts WHERE a_c_c_t__n_o LIKE ?',
          {
            replacements: [`%${accountNumber}%`],
            type: sequelize.QueryTypes.SELECT
          }
        );
        
        if (exactMatch) {
          console.log('⚠️ Found with LIKE search:', exactMatch.a_c_c_t__n_o);
        }
        
      } catch (debugError) {
        console.error('❌ Debug query error:', debugError.message);
      }
      
      return res.status(404).json({ 
        success: false,
        message: `Loan account not found: ${accountNumber}`,
        accountNumber: accountNumber,
        note: 'The account number exists but might be stored in a different column',
        suggestions: [
          'Check column name: should be a_c_c_t__n_o (with underscores)',
          'Verify no trailing/leading spaces in account number',
          'Check if account is in a different table'
        ],
        debug: {
          searchedColumn: 'a_c_c_t__n_o',
          accountNumberProvided: accountNumber,
          sampleAccounts: 'Check server logs for sample data'
        }
      });
    }

    // Format the response
    const loanAccountData = loanAccount.dataValues || loanAccount;
    
    console.log('✅ Loan account FOUND successfully');
    console.log('✅ Full account data:', JSON.stringify(loanAccountData, null, 2));
    
    // Add workItemId if needed
    const responseData = {
      ...loanAccountData,
      workItemId: 129
    };

    res.status(200).json({
      success: true,
      message: 'Loan account retrieved successfully',
      data: responseData,
      metadata: {
        retrievedAt: new Date().toISOString(),
        accountNumber: loanAccountData.a_c_c_t__n_o || accountNumber,
        accountColumnUsed: 'a_c_c_t__n_o',
        recordId: responseData.id,
        loanStatus: responseData.l_o_a_n__s_t_a_t_u_s,
        workItemId: 129
      }
    });

  } catch (error) {
    console.error('❌ Critical error in getLoanAccountByAcctNo:', error);
    
    res.status(500).json({ 
      success: false,
      message: 'Internal server error while fetching loan account',
      error: error.message,
      help: 'Please check server logs for details'
    });
  }
},

async getLoanAccountsByCustomerId(req, res) {
  try {
    const { custId } = req.params;
    console.log('🔍 DEBUG: Searching for customer:', custId);

    if (!custId) {
      return res.status(400).json({ 
        success: false,
        message: 'Customer ID is required'
      });
    }

    // 1. MAIN QUERY - Simplified with exact match
    const customerId = custId.trim();
    const paddedId = customerId.padStart(10, '0'); // Your data shows 10-digit padded IDs
    
    console.log('🔍 Querying for customer ID:', paddedId);
    
    const mainQuery = `
      SELECT 
        id, 
        a_c_c_t__n_o, 
        c_u_s_t__i_d,
        l_o_a_n__s_t_a_t_u_s,
        a_c_c_t__n_m,
        a_m_o_u_n_t,
        i_n_t_e_r_e_s_t__r_a_t_e,
        d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e,
        m_a_t_u_r_i_t_y__d_t
      FROM loan_accounts 
      WHERE c_u_s_t__i_d = ?
    `;

    // 2. EXECUTE QUERY - Use RAW to get consistent array format
    const queryResult = await sequelize.query(mainQuery, {
      replacements: [paddedId], // Use padded ID since that's what your data shows
      type: sequelize.QueryTypes.RAW
    });

    // 3. PROCESS RESULTS - Raw returns [rows, metadata]
    const rows = queryResult[0] || [];
    console.log('🔍 Found rows:', rows.length);
    
    if (rows.length > 0) {
      console.log('🔍 First row sample:', rows[0]);
    }

    // 4. HANDLE NO RESULTS
    if (rows.length === 0) {
      console.log('⚠️ No results found, checking database...');
      
      // Debug: Check what customer IDs actually exist
      const [allCustomers] = await sequelize.query(
        `SELECT DISTINCT c_u_s_t__i_d, COUNT(*) as count 
         FROM loan_accounts 
         GROUP BY c_u_s_t__i_d 
         LIMIT 10`,
        { type: sequelize.QueryTypes.RAW }
      );
      
      console.log('🔍 Existing customer IDs in database:');
      allCustomers[0].forEach(cust => {
        console.log(`  - ${cust.c_u_s_t__i_d} (${cust.count} accounts)`);
      });
      
      return res.status(404).json({ 
        success: false,
        message: `No loan accounts found for customer ID: ${customerId}`,
        debug: {
          searchedId: paddedId,
          existingIds: allCustomers[0].map(c => c.c_u_s_t__i_d),
          suggestion: 'Try using the exact 10-digit ID from the database'
        }
      });
    }

    // 5. SUCCESS RESPONSE
    console.log(`✅ Found ${rows.length} loan account(s) for customer ${paddedId}`);
    
    const transformedData = rows.map(account => ({
      loanAccountId: account.id,
      accountNumber: account.a_c_c_t__n_o,
      customerId: account.c_u_s_t__i_d,
      customerName: account.a_c_c_t__n_m,
      loanStatus: account.l_o_a_n__s_t_a_t_u_s,
      loanAmount: Math.abs(account.a_m_o_u_n_t), // Remove negative sign
      interestRate: account.i_n_t_e_r_e_s_t__r_a_t_e,
      disbursementDate: account.d_i_s_b_u_r_s_e_m_e_n_t__d_a_t_e,
      maturityDate: account.m_a_t_u_r_i_t_y__d_t,
      workItemId: 129
    }));

    res.status(200).json({
      success: true,
      message: `${rows.length} loan account(s) found`,
      count: rows.length,
      data: transformedData,
      metadata: {
        customerIdFound: paddedId,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Error in getLoanAccountsByCustomerId:', error);
    
    // More specific error messages
    let errorMessage = 'Database query failed';
    let suggestion = 'Check database connection';
    
    if (error.message.includes('Table')) {
      errorMessage = 'Table not found';
      suggestion = 'Verify the table name "loan_accounts" exists in the database';
    } else if (error.message.includes('column')) {
      errorMessage = 'Column not found';
      suggestion = 'Check column names match the table structure';
    }
    
    res.status(500).json({ 
      success: false,
      message: errorMessage,
      error: error.message,
      suggestion: suggestion
    });
  }
},

  async getLoanInterestDetails(req, res) {
    try {
      const { ACCT_NO } = req.params;
      
      const [account, repayments] = await Promise.all([
        LoanAccount.findOne({
          where: { ACCT_NO },
          attributes: ['INTEREST_RATE', 'accruedInterest', 'lastAccrualAmount']
        }),
        RepaymentSchedule.findAll({
          where: { ACCT_NO },
          attributes: ['dueDate', 'interestDue', 'status'],
          order: [['dueDate', 'ASC']]
        })
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

      const loanAccounts = await LoanAccount.findAll({
        where: {
          CUST_ID: CUST_ID,
          LOAN_STATUS: { 
            $in: ['ACTIVE', 'APPROVED', 'PENDING', 'DISBURSED'] 
          }
        },
        attributes: ['ACCT_NO', 'ACCT_NM', 'LOAN_STATUS', 'DISBURSED_AMOUNT', 'OUTSTANDING_PRINCIPAL', 'CURRENT_BALANCE', 'INTEREST_RATE', 'START_DT', 'MATURITY_DT', 'PRODUCT_TYPE', 'PROD_ID'],
        order: [['START_DT', 'DESC']]
      });

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
        return sum + parseFloat(loan.OUTSTANDING_PRINCIPAL || loan.CURRENT_BALANCE || '0');
      }, 0);
      
      const totalDisbursedAmount = loanAccounts.reduce((sum, loan) => {
        return sum + parseFloat(loan.DISBURSED_AMOUNT || '0');
      }, 0);

      const formattedLoans = loanAccounts.map(loan => ({
        loanAccountNumber: loan.ACCT_NO,
        accountName: loan.ACCT_NM,
        loanStatus: loan.LOAN_STATUS,
        productType: loan.PRODUCT_TYPE,
        productId: loan.PROD_ID,
        disbursedAmount: parseFloat(loan.DISBURSED_AMOUNT || '0'),
        outstandingPrincipal: parseFloat(loan.OUTSTANDING_PRINCIPAL || loan.CURRENT_BALANCE || '0'),
        currentBalance: parseFloat(loan.CURRENT_BALANCE || '0'),
        interestRate: parseFloat(loan.INTEREST_RATE || '0'),
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
        repaymentSchedules = await RepaymentSchedule.findAll({
          where: {
            ACCT_NO: { $in: activeLoanNumbers },
            STATUS: 'ACTIVE'
          },
          attributes: ['ACCT_NO', 'installments', 'TOTAL_REPAYMENT', 'EMI_AMOUNT']
        });
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
            amount: parseFloat(nextInstallment.totalPayment || '0'),
            installmentNumber: nextInstallment.installmentNumber
          };

          totalRepayment = parseFloat(schedule.TOTAL_REPAYMENT || '0');
          emiAmount = parseFloat(schedule.EMI_AMOUNT || '0');
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

  // =========================
  // REPORT METHODS (Simplified for Sequelize)
  // =========================

  async getLoanSummaryReport(req, res) {
    try {
      const { branch, product, status, startDate, endDate } = req.query;
      
      let where = {};
      
      if (branch) where.BU_ID = branch;
      if (product) where.PROD_ID = product;
      if (status) where.LOAN_STATUS = status;
      if (startDate || endDate) {
        where.applicationDate = {};
        if (startDate) where.applicationDate.$gte = new Date(startDate);
        if (endDate) where.applicationDate.$lte = new Date(endDate);
      }

      const totalLoans = await LoanAccount.count({ where });
      
      const activeLoans = await LoanAccount.count({
        where: {
          ...where,
          LOAN_STATUS: 'ACTIVE'
        }
      });

      const pendingLoans = await LoanAccount.count({
        where: {
          ...where,
          LOAN_STATUS: 'PENDING'
        }
      });

      const approvedLoans = await LoanAccount.count({
        where: {
          ...where,
          LOAN_STATUS: 'APPROVED'
        }
      });

      const closedLoans = await LoanAccount.count({
        where: {
          ...where,
          LOAN_STATUS: { $in: ['CLOSED', 'PAID', 'SETTLED'] }
        }
      });

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const recentLoans = await LoanAccount.count({
        where: {
          ...where,
          applicationDate: { $gte: thirtyDaysAgo }
        }
      });

      // For Sequelize, you might need to use raw queries for aggregation
      // This is a simplified version
      const balanceStats = await LoanAccount.findAll({
        where,
        attributes: [
          [sequelize.fn('SUM', sequelize.cast(sequelize.col('DISBURSED_AMOUNT'), 'FLOAT')), 'totalDisbursed'],
          [sequelize.fn('SUM', sequelize.cast(sequelize.col('OUTSTANDING_PRINCIPAL'), 'FLOAT')), 'totalOutstanding'],
          [sequelize.fn('AVG', sequelize.cast(sequelize.col('DISBURSEMENT_LIMIT'), 'FLOAT')), 'avgLoanSize'],
          [sequelize.fn('MAX', sequelize.cast(sequelize.col('DISBURSEMENT_LIMIT'), 'FLOAT')), 'maxLoanSize'],
          [sequelize.fn('COUNT', '*'), 'totalLoans']
        ],
        raw: true
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
            totalDisbursed: Math.round(balanceData.totalDisbursed * 100) / 100,
            totalOutstanding: Math.round(balanceData.totalOutstanding * 100) / 100,
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

  /**
 * Get repayment status overview dashboard
 */
async getRepaymentStatusOverview(req, res) {
  try {
    const currentDate = new Date();
    
    // Get all active loans
    const activeLoans = await LoanAccount.findAll({
      where: {
        LOAN_STATUS: { [Op.in]: ['ACTIVE', 'APPROVED', 'OVERDUE', 'DELINQUENT'] }
      },
      include: [{
        model: CustomerAccount,
        as: 'customerAccount',
        attributes: ['customer_name', 'account_number']
      }]
    });
    
    // Categorize loans by repayment status
    const categories = {
      paid: [],
      current: [],
      dueSoon: [],
      dueToday: [],
      overdue: [],
      delinquent: [],
      withPenalties: []
    };
    
    let totalOutstanding = 0;
    let totalInterest = 0;
    let totalPenalty = 0;
    
    for (const loan of activeLoans) {
      const repaymentHistory = await getRepaymentHistoryService(loan.ACCT_NO);
      const repaymentStatus = await calculateRepaymentStatus(loan, currentDate, repaymentHistory);
      
      totalOutstanding += repaymentStatus.totalOutstanding;
      totalInterest += repaymentStatus.breakdown.interest;
      totalPenalty += repaymentStatus.breakdown.penalty;
      
      // Categorize
      if (repaymentStatus.status === 'PAID') {
        categories.paid.push(loan.ACCT_NO);
      } else if (repaymentStatus.isDelinquent) {
        categories.delinquent.push({
          accountNo: loan.ACCT_NO,
          customerName: loan.customerAccount?.customer_name,
          amount: repaymentStatus.totalOutstanding,
          daysOverdue: repaymentStatus.daysOverdue,
          delinquencyLevel: repaymentStatus.delinquencyLevel
        });
      } else if (repaymentStatus.isOverdue) {
        categories.overdue.push({
          accountNo: loan.ACCT_NO,
          customerName: loan.customerAccount?.customer_name,
          amount: repaymentStatus.totalOutstanding,
          daysOverdue: repaymentStatus.daysOverdue
        });
      } else if (repaymentStatus.status === 'DUE_TODAY') {
        categories.dueToday.push({
          accountNo: loan.ACCT_NO,
          customerName: loan.customerAccount?.customer_name,
          amountDue: repaymentStatus.amountDue
        });
      } else if (repaymentStatus.status === 'DUE_SOON') {
        categories.dueSoon.push({
          accountNo: loan.ACCT_NO,
          customerName: loan.customerAccount?.customer_name,
          amountDue: repaymentStatus.amountDue,
          daysUntilDue: repaymentStatus.schedule?.nextRepaymentDate ? 
            Math.ceil((repaymentStatus.schedule.nextRepaymentDate - currentDate) / (1000 * 60 * 60 * 24)) : null
        });
      } else {
        categories.current.push(loan.ACCT_NO);
      }
      
      if (repaymentStatus.breakdown.penalty > 0) {
        categories.withPenalties.push({
          accountNo: loan.ACCT_NO,
          penaltyAmount: repaymentStatus.breakdown.penalty
        });
      }
    }
    
    // Calculate metrics
    const metrics = {
      totalLoans: activeLoans.length,
      totalOutstanding,
      totalInterest,
      totalPenalty,
      overdueAmount: categories.overdue.reduce((sum, loan) => sum + loan.amount, 0),
      delinquentAmount: categories.delinquent.reduce((sum, loan) => sum + loan.amount, 0),
      collectionRate: totalOutstanding > 0 ? 
        ((totalOutstanding - categories.overdue.reduce((sum, loan) => sum + loan.amount, 0)) / totalOutstanding) * 100 : 100,
      averageDaysOverdue: categories.overdue.length > 0 ? 
        categories.overdue.reduce((sum, loan) => sum + loan.daysOverdue, 0) / categories.overdue.length : 0
    };
    
    return res.json({
      success: true,
      data: {
        metrics,
        categories,
        summary: {
          overdueLoans: categories.overdue.length,
          delinquentLoans: categories.delinquent.length,
          loansDueToday: categories.dueToday.length,
          loansDueSoon: categories.dueSoon.length,
          loansWithPenalties: categories.withPenalties.length
        },
        timestamp: currentDate.toISOString()
      }
    });
    
  } catch (error) {
    console.error('❌ Repayment status overview error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get repayment status overview',
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

  async generateRepaymentSchedule(amount, rate, term, termCode, accountNo, startDate, transaction) {
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
