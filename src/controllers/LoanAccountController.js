// ======================
// LoanAccountController.js – FINAL VERSION (with model readiness check)
// ======================
import sequelize from '../../config/db.js';
import { DataTypes, Op, QueryTypes } from 'sequelize'; 
import RateIndex from '../models/Rate-Index.js';
import NotificationService from '../Services/NotificationService.js';
import moment from 'moment';
import generateWorkflowIdentifiers from '../utils/generateWorkflowIdentifiers.js';
import WF_WORK_ITEMController from '../controllers/WF_WORK_ITEMController.js';
import { generateRepaymentSchedule, calculateMaturityDate } from '../utils/loanUtils.js';
import LoanContractController from '../controllers/LoanContractFormController.js';
import logAuditTrail from '../Services/AuditService.js';
import submitWorkflowItem from '../Services/workflowService.js';
import repaymentUtils from '../utils/repaymentUtils.js';
import { generateTransactionIds } from '../utils/generateAccountNumber.js';
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
import getErrorMessage from '../utils/errorUtils.js';
import { processLoanDisbursementTransactions, processDisbursement, getGLAccountsFromProduct } from '../Services/processLoanDisbursementTransactions.js';
import { createOrUpdateAccount } from '../Services/accountService.js';
import { getRepaymentHistoryService } from '../controllers/LoanRepaymentController.js';
import LoanAccount from '../models/LoanAccount.js';
import RepaymentSchedule from '../models/RepaymentSchedules.js';
import LoanDisbursement from '../models/LoanDisbursement.js';
import CustomerAccount from '../models/CustomerAccount.js';

import LoanPortfolio from '../models/LoanPortfolio.js';
import GLAccountTransaction from '../models/GLAccountTransaction.js';
import GLAccount from '../models/GLAccount.js';
import CreditApplication from '../models/CreditApplication.js';
import LoanProduct from '../models/LoanProduct.js';
import { ensureGLAccountForBranch } from '../utils/glAccountHelper.js';
import Ledger from '../models/Ledger.js';
import ProductTypeMapping from '../models/ProductTypeMapping.js';


// ✅ Import model getters
import {
  getLoanAccount,
  getLoanProduct,
  getCustomer,
  getCreditApplication,
  getGuarantor,
  getLoanInterestRate,
  getRepaymentSchedule,
  getLoanDisbursement,
  getCounter,
  getGLAccount,
  getCharge,
  getProductTypeMapping,
  getLoanPortfolio,
  getLoanRepaymentTransaction,
  getLoanEvent,
  getCustomerAccount,
  getWF_WORK_ITEM
} from '../models/index.js';


// ==================== HELPER FUNCTIONS (DEFINED ONCE) ====================
const toDecimal = (value) => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return parseFloat(value) || 0;
  return Number(value) || 0;
};

const normalizeCustId = (custId) => typeof custId === 'object' ? custId.toString() : custId;

const normalizeBorrowerAddress = (address) => {
  if (!address) return {};
  return {
    street: address.street || '',
    city: address.city || '',
    state: address.state || '',
    zipCode: address.zipCode || '',
    country: address.country || 'Nigeria'
  };
};

// ✅ Defensive check – ensures model is loaded before use
const getModelSafely = (modelGetter, modelName) => {
  let model = modelGetter();
  if (!model) {
    throw new Error(`❌ Model '${modelName}' not found`);
  }
  // Already initialised Sequelize model (has .sequelize)
  if (model.sequelize && typeof model.init === 'function') {
    return model;
  }
  // Factory function (takes sequelize, DataTypes)
  if (typeof model === 'function' && !model.prototype) {
    return model(sequelize, DataTypes);
  }
  // Legacy class that needs instantiation (fallback)
  if (typeof model === 'function' && model.prototype) {
    try {
      return new model(sequelize, DataTypes);
    } catch (err) {
      console.warn(`⚠️ Could not instantiate ${modelName}, using as is.`);
      return model;
    }
  }
  return model;
};

async function getNextCreditApplicationId(transaction) {
  try {
    const Counter = getCounter();
    if (!Counter) throw new Error('Counter model not loaded');

    const counterName = 'creditApplicationId';
    let counter = await Counter.findOne({ where: { name: counterName }, transaction });
    if (!counter) {
      counter = await Counter.create({ name: counterName, seq: 1 }, { transaction });
      return counter.seq;
    } else {
      await counter.update({ seq: counter.seq + 1 }, { transaction });
      return counter.seq;
    }
  } catch (error) {
    console.error('Error getting next creditApplicationId:', error);
    // Fallback to timestamp seconds (still fits INT)
    return Math.floor(Date.now() / 1000);
  }
};

const checkExistingActiveLoans = async (custId, prodId, transaction) => {
  let LoanAccount = getLoanAccount();
  // If it's a function (the model definition), call it with sequelize to get the real model
  if (typeof LoanAccount === 'function' && LoanAccount.name === 'default') {
    console.log('⚠️ LoanAccount is a function, attempting to initialise with sequelize');
    const { DataTypes } = await import('sequelize');
    LoanAccount = LoanAccount(sequelize, DataTypes);
  }
  if (!LoanAccount || typeof LoanAccount.findAll !== 'function') {
    console.error('❌ LoanAccount model not properly initialised. Value:', LoanAccount);
    throw new Error('LoanAccount model not ready');
  }
  return await LoanAccount.findAll({
    where: { CUST_ID: custId, LOAN_PRODUCT_ID: prodId, LOAN_STATUS: ['ACTIVE', 'PENDING'] },
    transaction
  });
};

const findGuarantor = async (guarantorId, transaction) => {
  const Guarantor = getGuarantor();
  console.log('🔍 Guarantor model:', Guarantor);
  if (!Guarantor) throw new Error('Guarantor model not loaded');
  // ✅ Search by guarantor_id column (the business key), not by primary key id
  return await Guarantor.findOne({ where: { guarantor_id: guarantorId }, transaction });
};

const checkGuarantorExistingLoans = async (guarantorId, transaction) => {
  const LoanAccount = getLoanAccount();
  if (!LoanAccount) throw new Error('LoanAccount model not loaded');
  const loans = await LoanAccount.findAll({
    where: { GUARANTOR_ID: guarantorId, LOAN_STATUS: 'ACTIVE' },
    transaction
  });
  return { hasExistingLoans: loans.length > 0, totalExistingLoans: loans.length };
};



const getPaymentFrequency = (termCode, termValue) => {
  switch (termCode) {
    case 'D': return 'DAILY';
    case 'W': return 'WEEKLY';
    case 'BW': return 'BI_WEEKLY';
    case 'M': return 'MONTHLY';
    case 'Q': return 'QUARTERLY';
    case 'Y': return 'ANNUALLY';
    default: return 'MONTHLY';
  }
};

const calculateFlatRateEMI = (principal, annualRate, termMonths) => {
  const totalInterest = principal * (annualRate / 100) * (termMonths / 12);
  const totalRepayable = principal + totalInterest;
  const emi = totalRepayable / termMonths;
  return { emi, totalInterest, totalRepayable };
};

const generateInstallmentSchedule = (principal, annualRate, termMonths, emi, totalInterest, startDate, paymentFrequency) => {
  const installments = [];
  let remaining = principal;
  for (let i = 1; i <= termMonths; i++) {
    const interestPortion = totalInterest / termMonths;
    let principalPortion = emi - interestPortion;
    if (i === termMonths) principalPortion = remaining;
    remaining -= principalPortion;
    if (remaining < 0.01) remaining = 0;
    const dueDate = moment(startDate).add(i, 'months').format('YYYY-MM-DD');
    installments.push({
      installmentNo: i,
      dueDate,
      principal: Number(principalPortion.toFixed(2)),
      interest: Number(interestPortion.toFixed(2)),
      totalPayment: Number((principalPortion + interestPortion).toFixed(2)),
      remainingBalance: Number(remaining.toFixed(2))
    });
  }
  return installments;
};

// Helper: convert term code to full word – safely handles non‑string input
const mapTermCodeToFullWord = (termCode) => {
  const code = String(termCode).toUpperCase();
  const map = { D: 'DAYS', W: 'WEEKS', BW: 'BI_WEEKS', M: 'MONTHS', Q: 'QUARTERS', Y: 'YEARS' };
  return map[code] || 'MONTHS';
};

// Helper: convert term to months – safe string conversion
const convertTermToMonths = (value, termCode) => {
  const code = String(termCode).toUpperCase();
  const numValue = Number(value);
  if (isNaN(numValue)) return 0;
  switch (code) {
    case 'D': return numValue / 30.44;
    case 'W': return numValue / 4.345;
    case 'BW': return numValue / 4.345 / 2;
    case 'M': return numValue;
    case 'Q': return numValue * 3;
    case 'Y': return numValue * 12;
    default: return numValue;
  }
};

// Helper: total payments for frequency – safe
const getTotalPaymentsForFrequency = (termValue, termCode, paymentFrequency) => {
  const termMonths = convertTermToMonths(termValue, termCode);
  const freq = String(paymentFrequency).toUpperCase();
  let totalPayments;
  switch (freq) {
    case 'DAILY': totalPayments = termMonths * 30.44; break;
    case 'WEEKLY': totalPayments = termMonths * 4.345; break;
    case 'BI_WEEKLY': totalPayments = termMonths * 2; break;
    case 'MONTHLY': totalPayments = termMonths; break;
    case 'QUARTERLY': totalPayments = termMonths / 3; break;
    case 'SEMI_ANNUALLY': totalPayments = termMonths / 6; break;
    case 'ANNUALLY': totalPayments = termMonths / 12; break;
    default: totalPayments = termMonths;
  }
  return Math.ceil(totalPayments);
};

// Helper: calculate next payment date – safe
const calculateNextPaymentDate = (installmentNumber, paymentFrequency, startDate) => {
  const date = moment(startDate);
  const freq = String(paymentFrequency).toUpperCase();
  const num = Number(installmentNumber);
  switch (freq) {
    case 'DAILY': return date.add(num, 'days').format('YYYY-MM-DD');
    case 'WEEKLY': return date.add(num * 7, 'days').format('YYYY-MM-DD');
    case 'BI_WEEKLY': return date.add(num * 14, 'days').format('YYYY-MM-DD');
    case 'MONTHLY': return date.add(num, 'months').format('YYYY-MM-DD');
    case 'QUARTERLY': return date.add(num * 3, 'months').format('YYYY-MM-DD');
    case 'SEMI_ANNUALLY': return date.add(num * 6, 'months').format('YYYY-MM-DD');
    case 'ANNUALLY': return date.add(num, 'years').format('YYYY-MM-DD');
    default: return date.add(num, 'months').format('YYYY-MM-DD');
  }
};



// ==================== EMI CALCULATION FUNCTIONS (KEPT FOR COMPLETENESS) ====================
function calculateFixedRateEMI(principal, ratePercent, termValue, termCode, paymentFrequency, startDate, isRateForTerm = false) {
  console.log('=== FLAT RATE SIMPLE INTEREST CALCULATION ===');
  console.log(`Principal: ₦${principal}, Rate: ${ratePercent}%, Term: ${termValue} ${termCode}, Frequency: ${paymentFrequency}`);
  console.log(`Is rate for term duration? ${isRateForTerm}`);

  let totalInterest;
  if (isRateForTerm || ratePercent > 50) {
    console.log(`Rate ${ratePercent}% is for the entire term, not annual`);
    totalInterest = principal * (ratePercent / 100);
  } else {
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

  const installments = [];
  let remaining = principal;
  for (let i = 1; i <= totalPayments; i++) {
    const interestPortion = totalInterest / totalPayments;
    let principalPortion = emi - interestPortion;
    if (i === totalPayments) principalPortion = remaining;
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
    totalPayment: Number(totalRepayable.toFixed(2)),
    installments,
    calculationMethod: 'FLAT_RATE_SIMPLE',
    rateUsed: ratePercent,
    isRateForTerm: isRateForTerm || ratePercent > 50
  };
}

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

  const installments = [];
  let remaining = principal;
  for (let i = 1; i <= totalPayments; i++) {
    const interestPortion = remaining * periodicRate;
    let principalPortion = emi - interestPortion;
    if (i === totalPayments) principalPortion = remaining;
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
    totalPayment: Number(totalRepayable.toFixed(2)),
    installments,
    calculationMethod: 'REDUCING_BALANCE_COMPOUND',
    rateUsed: annualRatePercent
  };
}

function calculateInterestAndEMIEnhanced(principalAmount, loanInterestRate, termValue, termCode, paymentFrequency, startDate) {
  console.log('=== ENHANCED EMI CALCULATION STARTED ===');
  console.log(`Principal: ₦${principalAmount}`);
  console.log(`Interest Rate Config:`, loanInterestRate);

  let ratePercent = loanInterestRate.ABSOLUTE_RATE || loanInterestRate.FIXED_RATE || 0;
  console.log(`Rate Type: ${loanInterestRate.RATE_TY}, Interest Type: ${loanInterestRate.INT_TY}`);
  console.log(`Extracted Rate: ${ratePercent}%`);

  const isFixedOrSimple = (loanInterestRate.RATE_TY === 'FIXED' || loanInterestRate.INT_TY === 'SIMPLE');
  if (isFixedOrSimple) {
    console.log('Using FLAT RATE / SIMPLE INTEREST method');
    return calculateFixedRateEMI(principalAmount, ratePercent, termValue, termCode, paymentFrequency, startDate, true);
  } else {
    console.log('Using REDUCING BALANCE / COMPOUND method');
    const isMonthlyRate = ratePercent < 20;
    if (isMonthlyRate) {
      console.warn(`⚠️ Rate ${ratePercent}% appears to be monthly - converting to annual: ${ratePercent * 12}%`);
      ratePercent = ratePercent * 12;
    }
    return calculateReducingBalanceEMI(principalAmount, ratePercent, termValue, termCode, paymentFrequency, startDate);
  }
}

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

const generateUniqueLoanAccountId = async () => {
  let id, exists = true;
  let attempts = 0;
  const maxAttempts = 10;
  while (exists && attempts < maxAttempts) {
    id = generateNumber(10);
    const [existing] = await sequelize.query(
      `SELECT id FROM loan_accounts WHERE a_c_c_t__n_o = ? LIMIT 1`,
      { replacements: [id] }
    );
    exists = !!existing;
    attempts++;
  }
  if (exists) throw new Error('Unable to generate unique account ID after multiple attempts');
  return id;
};

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
      const productRate = loanProduct ? (loanProduct.interestRate || (loanProduct.rateInformation && loanProduct.rateInformation.rate)) : null;
      interestRate = parseFloat(productRate) || 12.0;
      console.warn(`Using fallback interest rate: ${interestRate}%`);
    }

    const amount = Number(loanDetails.AMOUNT) || 0;
    const fees = (loanProduct && loanProduct.feeStructure) || [];
    const processingFee = (loanProduct && loanProduct.processingFeeRate)
      ? `${(parseFloat(loanProduct.processingFeeRate) * 100).toFixed(2)}%`
      : '0%';
    const feeDetails = fees
      .filter(fee => fee.isActive)
      .map(fee => `${fee.name}: ${fee.isPercentage ? `${parseFloat(fee.amount) * 100}%` : parseFloat(fee.amount)}`)
      .join('\n');

    const termDesc = getTermDescription(loanDetails.TERM_CD || 'M');
    const freq = convertTermCodeToFrequency(loanDetails.TERM_CD || 'M');
    const formatDate = (dateInput) => {
      if (!dateInput) return 'Not specified';
      try {
        const date = new Date(dateInput);
        return isNaN(date.getTime()) ? 'Invalid date' : date.toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
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
${loanDetails.borrower_name || (customerDetails && (customerDetails.ACCT_NM || customerDetails.CUST_NM)) || 'Customer'}
${loanDetails.borrower_address || (customerDetails && customerDetails.HOME_ADDRESS) || 'Address not provided'}

AND

LENDER: 
${process.env.BANK_NAME || 'Our Bank'}

ARTICLE 1: LOAN TERMS

1.1 Principal Amount: ${amount.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' })}
1.2 Interest Rate: ${interestRate.toFixed(2)}% per annum
1.3 Loan Term: ${loanDetails.TERM_VALUE || 0} ${termDesc}
1.4 Loan Purpose: ${loanDetails.loan_purpose || 'General Business Purpose'}
1.5 Disbursement Date: ${formatDate(loanDetails.DISBURSEMENT_DATE)}

ARTICLE 2: REPAYMENT TERMS

2.1 Payment Frequency: ${freq}
2.2 Number of Installments: ${loanDetails.NUMBER_OF_INSTALLMENTS || 'Not specified'}
2.3 First Payment Date: ${formatDate(loanDetails.FIRST_PAYMENT_DATE)}
2.4 Final Payment Date: ${formatDate(loanDetails.LAST_PAYMENT_DATE)}

ARTICLE 3: FEES AND CHARGES

3.1 Processing Fee: ${processingFee}
${feeDetails ? `3.2 Other Fees:\n${feeDetails.split('\n').map(fee => `   ${fee}`).join('\n')}` : '3.2 Other Fees: None'}

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.

BORROWER:
_________________________
Name: ${loanDetails.borrower_name || (customerDetails && (customerDetails.ACCT_NM || customerDetails.CUST_NM)) || 'Borrower'}
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
Interest Rate: ${(effectiveInterestRate ? effectiveInterestRate.toString() : loanDetails.INTEREST_RATE) || 'Rate not specified'}%
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

// ==================== CONTROLLER OBJECT ====================
const LoanAccountController = {

  // ==================== applyForLoan ====================
// ==================== applyForLoan ====================
applyForLoan: async function(req, res) {
  const transaction = await sequelize.transaction();

  // Helper: get next numeric creditApplicationId using Counter model
  async function getNextCreditApplicationId(transaction) {
    try {
      const Counter = getCounter();
      if (!Counter) throw new Error('Counter model not loaded');
      const counterName = 'creditApplicationId';
      let counter = await Counter.findOne({ where: { name: counterName }, transaction });
      if (!counter) {
        counter = await Counter.create({ name: counterName, seq: 1 }, { transaction });
        return counter.seq;
      } else {
        await counter.update({ seq: counter.seq + 1 }, { transaction });
        return counter.seq;
      }
    } catch (error) {
      console.error('Error getting next creditApplicationId, using timestamp fallback:', error);
      return Math.floor(Date.now() / 1000);
    }
  }

  try {
    // Get models safely
    const LoanProduct = getModelSafely(getLoanProduct, 'LoanProduct');
    const LoanAccount = getModelSafely(getLoanAccount, 'LoanAccount');
    const Guarantor = getModelSafely(getGuarantor, 'Guarantor');
    const LoanInterestRate = getModelSafely(getLoanInterestRate, 'LoanInterestRate');
    const RepaymentSchedule = getModelSafely(getRepaymentSchedule, 'RepaymentSchedule');
    const LoanDisbursement = getModelSafely(getLoanDisbursement, 'LoanDisbursement');
    const CreditApplication = getModelSafely(getCreditApplication, 'CreditApplication');

    // Validate required fields
    const required = [
      'PROD_ID', 'CUST_ID', 'ACCT_NM', 'APPL_ID', 'DISBURSEMENT_LIMIT',
      'START_DT', 'TERM_CD', 'TERM_VALUE', 'GUARANTOR_ID'
    ];
    const missing = required.filter(f => !req.body[f]);
    if (missing.length) {
      await transaction.rollback();
      return res.status(400).json({ success: false, message: 'Missing fields', missing });
    }

    // SAFE: Convert term code to uppercase string, term value to number
    const termCodeRaw = req.body.TERM_CD;
    const termValueRaw = req.body.TERM_VALUE;
    const termCode = String(termCodeRaw).trim().toUpperCase();
    const termValue = parseInt(termValueRaw, 10);

    if (isNaN(termValue) || termValue <= 0) {
      throw new Error('Invalid TERM_VALUE – must be a positive number');
    }
    const validTermCodes = ['D', 'W', 'BW', 'M', 'Q', 'Y'];
    if (!validTermCodes.includes(termCode)) {
      throw new Error(`Invalid TERM_CD – must be one of: ${validTermCodes.join(', ')}`);
    }

    const borrowerAddress = normalizeBorrowerAddress(req.body.Borrower_address);

    const loanProduct = await LoanProduct.findOne({
      where: { prod_id: req.body.PROD_ID, status: 'ACTIVE' },
      transaction
    });
    if (!loanProduct) throw new Error(`Loan product ${req.body.PROD_ID} not found`);

    const allowMultiple = loanProduct.allow_multiple_disbursement === true;
    if (!allowMultiple) {
      const existingLoans = await checkExistingActiveLoans(req.body.CUST_ID, req.body.PROD_ID, transaction);
      if (existingLoans.length > 0) {
        throw new Error(`Customer already has an active loan of product ${req.body.PROD_ID}. Multiple loans not allowed.`);
      }
    }

    const guarantor = await findGuarantor(req.body.GUARANTOR_ID, transaction);
    if (!guarantor) throw new Error(`Guarantor with ID ${req.body.GUARANTOR_ID} not found`);

    const guarantorLoanCheck = await checkGuarantorExistingLoans(guarantor.id, transaction);
    if (guarantorLoanCheck.hasExistingLoans) {
      console.warn(`Guarantor ${guarantor.GUARANTOR_ID} already guarantees ${guarantorLoanCheck.totalExistingLoans} loans.`);
    }

    // Determine interest rate
    let monthlyRate = null, annualRate = null;
    let interestRateSource = '';

    if (loanProduct.loan_interest_rate_id) {
      const linkedRate = await LoanInterestRate.findOne({
        where: { id: loanProduct.loan_interest_rate_id, status: 'ACTIVE' },
        transaction
      });
      if (linkedRate && linkedRate.default_rate_per_month) {
        monthlyRate = parseFloat(linkedRate.default_rate_per_month);
        annualRate = monthlyRate * 12;
        interestRateSource = `LoanInterestRate (${linkedRate.name})`;
      }
    }
    if (!monthlyRate && loanProduct.interest_rate) {
      annualRate = parseFloat(loanProduct.interest_rate);
      monthlyRate = annualRate / 12;
      interestRateSource = 'LoanProduct.interest_rate';
    }
    if (!monthlyRate && loanProduct.default_rate_per_month) {
      monthlyRate = parseFloat(loanProduct.default_rate_per_month);
      annualRate = monthlyRate * 12;
      interestRateSource = 'LoanProduct.default_rate_per_month';
    }
    if (!monthlyRate) {
      monthlyRate = 1.0;
      annualRate = 12.0;
      interestRateSource = 'DEFAULT_FALLBACK';
    }

    console.log(`Interest rate source: ${interestRateSource}, Annual: ${annualRate}%, Monthly: ${monthlyRate}%`);

    const principal = parseFloat(req.body.DISBURSEMENT_LIMIT);
    const startDate = new Date(req.body.START_DT);
    const maturityDate = calculateMaturityDate(startDate, termCode, termValue);
    const paymentFrequency = getPaymentFrequency(termCode, termValue);

    const emiResult = calculateFlatRateEMI(principal, annualRate, termValue);
    const installments = generateInstallmentSchedule(
      principal, annualRate, termValue, emiResult.emi, emiResult.totalInterest, startDate, paymentFrequency
    );

    let loanAccountNumber;
    for (let i = 0; i < 3; i++) {
      loanAccountNumber = await generateLoanAccountNumberByProdId(req.body.PROD_ID);
      const existing = await LoanAccount.findOne({ where: { ACCT_NO: loanAccountNumber }, transaction });
      if (!existing) break;
      loanAccountNumber = null;
    }
    if (!loanAccountNumber) throw new Error('Failed to generate unique loan account number');

    const loanAccount = await LoanAccount.create({
      ACCT_NO: loanAccountNumber,
      ACCT_NM: req.body.ACCT_NM,
      CUST_ID: req.body.CUST_ID,
      LOAN_PRODUCT_ID: req.body.PROD_ID,
      AMOUNT: principal,
      INTEREST_RATE: annualRate,
      LOAN_STATUS: 'PENDING',
      SERVICING_STATUS: 'SERVICED',
      APPLICATION_DATE: startDate,
      MATURITY_DT: maturityDate,
      TERM_CD: mapTermCodeToFullWord(termCode),
      TERM_VALUE: termValue,
      GUARANTOR_ID: guarantor.id,
      GUARANTEED_AMOUNT: req.body.GUARANTEED_AMT || principal,
      CREATED_BY: req.body.CREATED_BY || req.body.USER_ID,
      created_at: new Date(),
      updated_at: new Date()
    }, { transaction });

    const repaymentScheduleData = {
      loan_account_id: loanAccount.id,
      account_number: loanAccountNumber,
      customer_id: req.body.CUST_ID,
      start_date: startDate,
      maturity_date: maturityDate,
      principal_amount: principal,
      interest_rate: annualRate,
      term: termValue,
      term_type: mapTermCodeToFullWord(termCode).substring(0, 1),
      payment_frequency: paymentFrequency,
      emi_amount: emiResult.emi,
      total_interest: emiResult.totalInterest,
      total_repayment: emiResult.totalRepayable,
      upfront_interest: 0,
      status: 'PENDING',
      created_by: req.body.CREATED_BY || req.body.USER_ID,
      created_at: new Date(),
      updated_at: new Date()
    };
    const repaymentSchedule = await RepaymentSchedule.createSchedule(repaymentScheduleData, installments);

    // Generate unique transaction IDs for disbursement record
    const disbursementTxId = `DISB-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const disbursementEventId = `EVT-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    const now = new Date();

    const buId = req.user?.businessUnit || req.body.BU_ID || '100';
    const primaryOfficerId = req.user?.id || req.body.PRIMARY_OFFICER_ID || 'SYSTEM';
    const repaySrcAcctNo = req.body.REPAY_SRC_ACCT_NO || `CUST_${req.body.CUST_ID}`;

    const loanDisbursement = await LoanDisbursement.create({
      accountNumber: loanAccountNumber,
      applicationId: req.body.APPL_ID,
      customerId: req.body.CUST_ID,
      interestRate: annualRate,
      termValue: termValue,
      termCode: termCode,
      amount: principal,
      loanAccountId: loanAccount.id,
      repaymentScheduleId: repaymentSchedule.id,
      guarantorId: guarantor.id,
      productId: Number(req.body.PROD_ID),
      productType: req.body.PRODUCT_TYPE || 'INDIVIDUAL_LOAN',
      accountName: req.body.ACCT_NM,
      businessUnitId: buId,
      primaryOfficerId: primaryOfficerId,
      repaymentSourceAccount: repaySrcAcctNo,
      startDate: startDate,
      maturityDate: maturityDate,
      status: 'PENDING',
      transactionId: disbursementTxId,
      eventId: disbursementEventId,
      transactionReference: `DISB-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdBy: req.body.CREATED_BY || req.user?.username || 'SYSTEM',
      borrowerAddress: borrowerAddress,
      repaymentScheduleJson: installments,
      calculationMethod: 'REDUCING_BALANCE',
      paymentFrequency: paymentFrequency,
      emiAmount: emiResult.emi,
      totalInterest: emiResult.totalInterest,
      totalRepayment: emiResult.totalRepayable,
      interestConfiguration: {
        INTEREST_TYPE: 'COMPOUND',
        CALCULATION_METHOD: 'REDUCING_BALANCE',
        INTEREST_RATE: annualRate,
        RATE_TYPE: 'REDUCING',
        IS_TERM_BASED_RATE: false
      }
    }, { transaction });

    // ✅ CREATE CREDIT APPLICATION WITH SEQUENTIAL NUMERIC ID
    const creditApplication = await CreditApplication.create({
      creditApplicationId: await getNextCreditApplicationId(transaction),
      applId: req.body.APPL_ID,
      custId: req.body.CUST_ID,
      customerName: req.body.ACCT_NM,
      prodId: req.body.PROD_ID,
      primeLimitAmt: principal,
      termCode: termCode,
      termValue: termValue,
      interestRate: annualRate,
      accountNumber: loanAccountNumber,
      status: 'PENDING',
      createdBy: req.body.CREATED_BY || req.user?.username || 'SYSTEM',
      borrowerAddress: borrowerAddress,
      businessUnitId: buId,
      repaymentSourceAccountNo: repaySrcAcctNo,
      userId: req.user?.id || req.body.USER_ID || 'SYSTEM',
      transactionType: 'LOAN_APPLICATION',
      createdAt: new Date(),
      updatedAt: new Date()
    }, { transaction });

    await transaction.commit();

    return res.status(201).json({
      success: true,
      message: 'Loan application submitted successfully – pending approval',
      data: {
        loanAccountId: loanAccount.id,
        loanAccountNumber,
        creditApplicationId: creditApplication.id,
        repaymentScheduleId: repaymentSchedule.id,
        loanDisbursementId: loanDisbursement.id,
        interestRate: annualRate,
        emi: emiResult.emi,
        totalInterest: emiResult.totalInterest,
        totalRepayable: emiResult.totalRepayable
      }
    });

  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error('Loan application error:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
},

  // ==================== disburseLoan ====================
  disburseLoan: async function(req, res) {
    const transaction = await sequelize.transaction();

    try {
      // Get models safely
      const LoanAccount = getModelSafely(getLoanAccount, 'LoanAccount');
      const CreditApplication = getModelSafely(getCreditApplication, 'CreditApplication');
      const CustomerAccount = getModelSafely(getCustomerAccount, 'CustomerAccount');
      const Guarantor = getModelSafely(getGuarantor, 'Guarantor');
      const ProductTypeMapping = getModelSafely(getProductTypeMapping, 'ProductTypeMapping');
      const LoanProduct = getModelSafely(getLoanProduct, 'LoanProduct');
      const LoanInterestRate = getModelSafely(getLoanInterestRate, 'LoanInterestRate');

      const {
        APPL_ID, ACCT_NO, AMOUNT, fundingAcctNo, PROD_ID, GUARANTOR_ID,
        CREATED_BY = 'SYSTEM', LOAN_PROUD_INT_ID
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

      async function findLoanInterestRateForDisbursement(loanProudIntId, transaction) {
        try {
          if (!loanProudIntId) return null;
          const numericId = parseInt(loanProudIntId);
          const query = isNaN(numericId)
            ? { LOAN_PROUD_INT_ID: loanProudIntId.toString(), STATUS: 'ACTIVE' }
            : { LOAN_PROUD_INT_ID: numericId, STATUS: 'ACTIVE' };
          return await LoanInterestRate.findOne({ where: query, transaction });
        } catch (error) {
          console.error('❌ Error finding LoanInterestRate:', error);
          return null;
        }
      }

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

      const loanInterestRate = await findLoanInterestRateForDisbursement(
        LOAN_PROUD_INT_ID || (loanAccount && loanAccount.LOAN_INTEREST_RATE_ID),
        transaction
      );

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
        DEFAULT_RATE_PER_MONTH: loanInterestRate.DEFAULT_RATE_PER_MONTH,
        CALCULATION_METHOD: loanInterestRate.CALCULATION_METHOD
      } : 'Not found');

      if (loanAccount.LOAN_STATUS !== "APPROVED") {
        throw { status: 400, message: `Loan must be APPROVED. Current: ${loanAccount.LOAN_STATUS}` };
      }
      if (parseFloat(loanAccount.DISBURSED_AMOUNT || '0') > 0) {
        throw { status: 400, message: "Loan already disbursed" };
      }

      const processingFeeRate = parseFloat((loanProduct && loanProduct.processingFeeRate) || '0') / 100;
      const upfrontInterestRate = parseFloat(loanAccount.upfrontInterestPercentage || '0') / 100;
      const processingFee = amount * processingFeeRate;
      const upfrontInterest = amount * upfrontInterestRate;
      const totalFees = processingFee + upfrontInterest;
      const netAmount = amount - totalFees;

      if (netAmount <= 0) throw { status: 400, message: "Net disbursement must be positive" };

      let effectiveInterestRate;
      if (loanInterestRate && loanInterestRate.DEFAULT_RATE_PER_MONTH !== undefined) {
        const monthlyRate = loanInterestRate.DEFAULT_RATE_PER_MONTH;
        const isFlatRateForTerm = (loanInterestRate.CALCULATION_METHOD === 'FLAT_RATE' ||
                                   loanInterestRate.CALCULATION_METHOD === 'FIXED_RATE') &&
                                   monthlyRate > 50;
        effectiveInterestRate = isFlatRateForTerm ? monthlyRate : monthlyRate * 12;
      } else if (loanAccount.INTEREST_RATE) {
        effectiveInterestRate = parseFloat(loanAccount.INTEREST_RATE);
      } else if (loanProduct.interestRate) {
        effectiveInterestRate = parseFloat(loanProduct.interestRate);
      } else if (loanProduct.DEFAULT_RATE_PER_MONTH) {
        effectiveInterestRate = parseFloat(loanProduct.DEFAULT_RATE_PER_MONTH) * 12;
      } else {
        effectiveInterestRate = 12.0;
      }

      console.log('=== DISBURSEMENT CALCULATIONS ===');
      console.log(`Loan Amount: ₦${amount.toFixed(2)}`);
      console.log(`Processing Fee (${processingFeeRate * 100}%): ₦${processingFee.toFixed(2)}`);
      console.log(`Upfront Interest (${upfrontInterestRate * 100}%): ₦${upfrontInterest.toFixed(2)}`);
      console.log(`Total Fees: ₦${totalFees.toFixed(2)}`);
      console.log(`Net to Customer: ₦${netAmount.toFixed(2)}`);
      console.log(`Effective Interest Rate: ${effectiveInterestRate}%`);

      const now = new Date();
      const txIds = {
        TRANSACTION_ID: `DISB-${Date.now()}`,
        EVENT_ID: `EVT-${Date.now()}`,
        JOURNAL_ID: `JRN-${Date.now()}`,
      };

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
          INTEREST_RATE_TYPE: (loanInterestRate && loanInterestRate.RATE_TYPE) || loanAccount.INTEREST_RATE_TYPE || 'REDUCING',
          INTEREST_TYPE: (loanInterestRate && loanInterestRate.INTEREST_TYPE) || loanAccount.INTEREST_TYPE || 'COMPOUND',
          INTEREST_CALCULATION_METHOD: (loanInterestRate && loanInterestRate.CALCULATION_METHOD) || loanAccount.INTEREST_CALCULATION_METHOD || 'REDUCING_BALANCE',
          LOAN_INTEREST_RATE_ID: (loanInterestRate && loanInterestRate.LOAN_PROUD_INT_ID) || null,
          ...txIds,
          LAST_UPDATED: now,
        },
        { where: { id: loanAccount.id }, transaction }
      );

      await CreditApplication.update(
        {
          STATUS: "DISBURSED",
          DISBURSEMENT_DATE: now,
          ACTUAL_DISBURSEMENT: amount,
          NET_DISBURSEMENT: netAmount,
          LOAN_STATUS: "ACTIVE",
          LOAN_INTEREST_RATE_ID: (loanInterestRate && loanInterestRate.LOAN_PROUD_INT_ID) || null
        },
        { where: { id: creditApp.id }, transaction }
      );

      await Guarantor.update(
        {
          $addToSet: { guaranteedLoans: loanAccount.id },
          $set: {
            STATUS: "ACTIVE",
            GUARANTEED_AMOUNT: amount,
            LOAN_ACCOUNT_NO: ACCT_NO,
            ACTIVATION_DATE: now,
            LOAN_INTEREST_RATE_ID: (loanInterestRate && loanInterestRate.LOAN_PROUD_INT_ID) || null
          }
        },
        { where: { id: guarantor.id }, transaction }
      );

      await processLoanDisbursementTransactions({
        transaction,
        loanAccount: {
          ...loanAccount.toJSON(),
          ACCT_NM: loanAccount.ACCT_NM || creditApp.borrowerName,
          CUST_ID: loanAccount.CUST_ID,
          BU_ID: loanAccount.BU_ID || fundingAccount.branch,
          PROD_ID: loanAccount.PROD_ID || productIdNum,
          DISBURSED_AMOUNT: amount,
          LOAN_INTEREST_RATE_ID: (loanInterestRate && loanInterestRate.LOAN_PROUD_INT_ID) || null,
          INTEREST_RATE_TYPE: (loanInterestRate && loanInterestRate.RATE_TYPE) || loanAccount.INTEREST_RATE_TYPE,
          INTEREST_CALCULATION_METHOD: (loanInterestRate && loanInterestRate.CALCULATION_METHOD) || loanAccount.INTEREST_CALCULATION_METHOD
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
        interestRateDetails: {
          loanInterestRateId: (loanInterestRate && loanInterestRate.LOAN_PROUD_INT_ID),
          rateType: (loanInterestRate && loanInterestRate.RATE_TYPE),
          calculationMethod: (loanInterestRate && loanInterestRate.CALCULATION_METHOD),
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
          feeBreakdown: { processingFee: processingFee.toFixed(2), upfrontInterest: upfrontInterest.toFixed(2) },
          disbursementDate: now,
          status: "ACTIVE",
          customerId: loanAccount.CUST_ID,
          guarantorName: guarantor.fullName || guarantor.name,
          guarantorId: GUARANTOR_ID,
          transactionIds: txIds,
          interestRateDetails: {
            effectiveRate: effectiveInterestRate,
            source: loanInterestRate ? 'LoanInterestRate' : 'LoanProduct',
            loanInterestRateId: (loanInterestRate && loanInterestRate.LOAN_PROUD_INT_ID),
            loanInterestRateName: (loanInterestRate && loanInterestRate.name),
            rateType: (loanInterestRate && loanInterestRate.RATE_TYPE) || loanAccount.INTEREST_RATE_TYPE,
            calculationMethod: (loanInterestRate && loanInterestRate.CALCULATION_METHOD) || loanAccount.INTEREST_CALCULATION_METHOD,
            isFlatRateForTerm: (loanInterestRate && loanInterestRate.CALCULATION_METHOD === 'FLAT_RATE') ||
                               (loanInterestRate && loanInterestRate.CALCULATION_METHOD === 'FIXED_RATE')
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
      if (transaction) await transaction.rollback();
      console.error("❌ Disbursement failed:", error);
      return res.status(error.status || 500).json({
        success: false,
        message: error.message || "Disbursement failed",
        code: error.code || "DISBURSEMENT_ERROR",
        details: error.details || null
      });
    }
  },

  // ==================== getLoanApplication ====================
  getLoanApplication: async function(req, res) {
    try {
      const { applicationId } = req.params;
      const CreditApplication = getModelSafely(getCreditApplication, 'CreditApplication');
      const LoanAccount = getModelSafely(getLoanAccount, 'LoanAccount');
      const Guarantor = getModelSafely(getGuarantor, 'Guarantor');

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

  // ==================== getPendingLoans ====================
  getPendingLoans: async function(req, res) {
    try {
      const LoanAccount = getModelSafely(getLoanAccount, 'LoanAccount');
      const loans = await LoanAccount.findAll({ where: { LOAN_STATUS: 'PENDING' } });
      res.json({ success: true, data: loans });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  },

// REPLACE your entire rejectLoanApplication function with this
async rejectLoanApplication(req, res) {
    const transaction = await sequelize.transaction();

    try {
        const { ACCT_NO, CUST_ID, rejectedBy, reason } = req.body;

        // Validate required fields
        if (!rejectedBy || !(reason && reason.trim())) {
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

        console.log("Rejecting loan:", { ACCT_NO, CUST_ID, rejectedBy, reason });

        let loanAccount = null;

        // 1. Find loan account using the model
        if (ACCT_NO) {
            loanAccount = await LoanAccount.findOne({
                where: { 
                    ACCT_NO: ACCT_NO, 
                    LOAN_STATUS: { [Op.in]: ['PENDING', 'APPROVED'] } 
                },
                transaction
            });
        }

        if (!loanAccount && CUST_ID) {
            loanAccount = await LoanAccount.findOne({
                where: { 
                    CUST_ID: CUST_ID, 
                    LOAN_STATUS: { [Op.in]: ['PENDING', 'APPROVED'] } 
                },
                transaction
            });
        }

        if (!loanAccount) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: "No pending/approved loan account found",
                code: "LOAN_ACCOUNT_NOT_FOUND",
                debug: { searchedAcctNo: ACCT_NO, searchedCustId: CUST_ID }
            });
        }

        // 2. Find credit application (using the CreditApplication model)
        let creditApplication = await CreditApplication.findOne({
            where: { 
                ACCT_NO: loanAccount.ACCT_NO, 
                STATUS: { [Op.in]: ['PENDING', 'APPROVED'] } 
            },
            transaction
        });

        if (!creditApplication) {
            creditApplication = await CreditApplication.findOne({
                where: { 
                    CUST_ID: loanAccount.CUST_ID, 
                    STATUS: { [Op.in]: ['PENDING', 'APPROVED'] } 
                },
                transaction
            });
        }

        if (!creditApplication) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: "No pending/approved credit application found for this loan",
                code: "CREDIT_APPLICATION_NOT_FOUND",
                debug: { loanAccountAcctNo: loanAccount.ACCT_NO, loanAccountCustId: loanAccount.CUST_ID }
            });
        }

        console.log("Found records:", {
            creditAppId: creditApplication.id,
            creditAppAcctNo: creditApplication.ACCT_NO,
            creditAppStatus: creditApplication.STATUS,
            creditAppCustId: creditApplication.CUST_ID,
            loanAccountId: loanAccount.id,
            loanAccountAcctNo: loanAccount.ACCT_NO,
            loanAccountStatus: loanAccount.LOAN_STATUS,
            guarantorId: loanAccount.GUARANTOR_ID
        });

        const now = new Date();

        // 3. Update credit application status
        await creditApplication.update({
            STATUS: 'REJECTED',
            // If your model has these columns, uncomment:
            // REJECTED_BY: rejectedBy,
            // REJECTION_REASON: reason,
            // REJECTION_DATE: now
        }, { transaction });

        // 4. Update loan account status
        await loanAccount.update({
            LOAN_STATUS: 'REJECTED'
        }, { transaction });

        // 5. Release guarantor if exists
        if (loanAccount.GUARANTOR_ID) {
            try {
                const guarantor = await Guarantor.findByPk(loanAccount.GUARANTOR_ID, { transaction });
                if (guarantor) {
                    await guarantor.update({
                        status: 'RELEASED',
                        released_by: rejectedBy,
                        released_date: now,
                        release_reason: `Loan rejected: ${reason}`
                    }, { transaction });
                    console.log("✅ Guarantor released");
                }
            } catch (err) {
                console.error("Error updating guarantor:", err.message);
                // Continue without failing the whole transaction
            }
        }

        // 6. Cancel repayment schedule if exists
        if (loanAccount.repaymentScheduleId) {
            try {
                const repaymentSchedule = await RepaymentSchedule.findByPk(loanAccount.repaymentScheduleId, { transaction });
                if (repaymentSchedule) {
                    await repaymentSchedule.update({
                        status: 'CANCELLED'
                    }, { transaction });
                    console.log("✅ Repayment schedule cancelled");
                }
            } catch (err) {
                console.error("Error cancelling repayment schedule:", err.message);
            }
        }

        await transaction.commit();
        console.log("✅ Transaction committed successfully");

        return res.json({
            success: true,
            message: "Loan application rejected successfully",
            data: {
                ACCT_NO: loanAccount.ACCT_NO,
                CUST_ID: loanAccount.CUST_ID,
                customerName: creditApplication.CUST_NM || loanAccount.ACCT_NM,
                rejectionReason: reason,
                rejectedBy: rejectedBy,
                rejectedAt: now,
                guarantorReleased: !!loanAccount.GUARANTOR_ID
            }
        });

    } catch (error) {
        if (transaction) await transaction.rollback();
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
    const processingFeeRate = parseFloat((loanProduct && loanProduct.processingFeeRate) || '0') / 100;
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
        if (product.metadata && product.metadata.interestRateConfiguration && product.metadata.interestRateConfiguration.defaultRate) {
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
        guarantorName: (loanAccount.guarantorDetails && loanAccount.guarantorDetails.name),
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



/**
 * Approve and disburse loan – with dynamic GL account resolution and creation,
 * plus ledger balance updates.
 */
async approveAndDisburseLoan(req, res) {
  console.log("=== DEBUG: Starting approveAndDisburseLoan with GL + Portfolio integration ===");
  const transaction = await sequelize.transaction();

  // Helper to ensure a ledger entry exists for a given GL account number
  async function ensureLedgerForBranch(glAccountNo, accountType, branchCode, transaction) {
    let ledger = await Ledger.findOne({ where: { GL_ACCT_NO: glAccountNo }, transaction });
    if (ledger) return ledger;
    // Create a new ledger entry with all required fields
    const ledgerId = `${accountType}_${branchCode}_${Date.now()}`;
    ledger = await Ledger.create({
      GL_ACCT_NO: glAccountNo,
      GL_ACCT_ID: ledgerId,
      CHART_OF_ACCT_ID: '10001',
      BAL_CD: accountType === 'ASSET' ? 'DEBIT' : 'CREDIT',
      SUB_LEDGER_NO: '001',
      ACCT_DESC: `${accountType} account for branch ${branchCode}`,
      LEDGER_NO: '001',
      BU_ID: branchCode,
      GL_ACCT_CAT: accountType,
      CREATED_BY: 'SYSTEM',               // ✅ required
      SEG_NO: '001',                      // ✅ required (varchar)
      organizationName: 'Default Organization',
      branchName: `Branch ${branchCode}`,
      organizationCode: '1',              // varchar(50) – use string
      branchCode: branchCode,
      REC_ST: 'Active',
      CR_ALLOWED: true,
      DR_ALLOWED: true,
      POST_ALLOW: true,
      CURRENCY_CODE: 'NGN',
      LEDGER_BALANCE: 0,
      CURRENT_BALANCE: 0,
      AVAILABLE_BALANCE: 0,
      OPENING_BALANCE: 0,
      ROW_TS: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    }, { transaction });
    console.log(`✅ Auto-created ledger entry for GL account ${glAccountNo} (${accountType})`);
    return ledger;
  }

  try {
    const { ACCT_NO, approvedBy, approvalComments = "Loan approved for disbursement" } = req.body;

    if (!ACCT_NO || !approvedBy) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "ACCT_NO and approvedBy are required",
        code: "MISSING_FIELDS"
      });
    }

    // 1. Find loan account
    const loanAccount = await LoanAccount.findOne({ where: { ACCT_NO }, transaction });
    if (!loanAccount) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Loan account ${ACCT_NO} not found`,
        code: "LOAN_NOT_FOUND"
      });
    }

    const currentStatus = loanAccount.LOAN_STATUS;
    const currentDisbursedAmount = parseFloat(loanAccount.DISBURSED_AMOUNT || 0);
    const currentOutstandingPrincipal = parseFloat(loanAccount.OUTSTANDING_PRINCIPAL || 0);
    const loanAmountValue = parseFloat(loanAccount.AMOUNT || 0);
    const now = new Date();

    // 2. Find associated loan disbursement record
    const loanDisbursement = await LoanDisbursement.findOne({
      where: { loanAccountId: loanAccount.id },
      transaction
    });
    if (!loanDisbursement) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Loan disbursement record not found for account ${ACCT_NO}`,
        code: "DISBURSEMENT_NOT_FOUND"
      });
    }

    // 3. Find associated credit application (optional)
    let creditApplication = null;
    if (loanDisbursement.applicationId) {
      creditApplication = await CreditApplication.findOne({
        where: { applId: loanDisbursement.applicationId },
        transaction
      });
    }

    // 4. Determine disbursement amount and update loan status
    let disbursementAmount = 0;
    let newDisbursedAmount = currentDisbursedAmount;
    let newOutstandingPrincipal = currentOutstandingPrincipal;
    let finalMessage = "";

    if (currentStatus === 'ACTIVE') {
      // Additional (partial) disbursement
      if (currentDisbursedAmount >= loanAmountValue) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "Loan has already been fully disbursed",
          code: "FULLY_DISBURSED"
        });
      }
      disbursementAmount = loanAmountValue - currentDisbursedAmount;
      newDisbursedAmount = loanAmountValue;
      newOutstandingPrincipal = currentOutstandingPrincipal + disbursementAmount;
      finalMessage = "Additional disbursement recorded successfully";

      await loanAccount.update({
        DISBURSED_AMOUNT: newDisbursedAmount,
        OUTSTANDING_PRINCIPAL: newOutstandingPrincipal,
        updated_at: now
      }, { transaction });

      if (loanDisbursement.status !== 'DISBURSED') {
        await loanDisbursement.update({
          status: 'DISBURSED',
          approvedBy,
          approvalDate: now,
          disbursedBy: approvedBy,
          disbursementDate: now,
          updatedAt: now
        }, { transaction });
      }

    } else if (currentStatus === 'PENDING') {
      // First disbursement
      disbursementAmount = loanAmountValue;
      newDisbursedAmount = loanAmountValue;
      newOutstandingPrincipal = loanAmountValue;
      finalMessage = "Loan approved and disbursed successfully";

      await loanAccount.update({
        LOAN_STATUS: 'ACTIVE',
        AMOUNT: loanAmountValue,
        DISBURSED_AMOUNT: newDisbursedAmount,
        APPROVAL_DATE: now,
        DISBURSEMENT_DATE: now,
        OUTSTANDING_PRINCIPAL: newOutstandingPrincipal,
        SERVICING_STATUS: 'SERVICED',
        updated_at: now
      }, { transaction });

      await loanDisbursement.update({
        status: 'DISBURSED',
        approvedBy,
        approvalDate: now,
        disbursedBy: approvedBy,
        disbursementDate: now,
        updatedAt: now
      }, { transaction });

      if (creditApplication) {
        await creditApplication.update({
          STATUS: 'APPROVED',
          APPROVED_BY: approvedBy,
          APPROVAL_DATE: now,
          updated_at: now
        }, { transaction });
      }

    } else {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Cannot disburse loan with status: ${currentStatus}`,
        code: "INVALID_STATUS"
      });
    }

    // ================ CUSTOMER ACCOUNT CREDIT ================
    const customerAccountNumber = loanDisbursement.repaymentSourceAccount;
    let customerAccount = null;
    if (!customerAccountNumber) {
      console.warn(`No repayment source account for loan ${ACCT_NO} – skipping customer account credit`);
    } else {
      customerAccount = await CustomerAccount.findOne({
        where: { account_number: customerAccountNumber },
        transaction
      });
      if (!customerAccount) {
        console.warn(`Customer account ${customerAccountNumber} not found – skipping credit`);
      } else {
        // Credit the customer's account with the disbursement amount
        await customerAccount.update({
          ledger_balance: (parseFloat(customerAccount.ledger_balance) || 0) + disbursementAmount,
          cleared_balance: (parseFloat(customerAccount.cleared_balance) || 0) + disbursementAmount,
          current_balance: (parseFloat(customerAccount.current_balance) || 0) + disbursementAmount,
          updated_at: now
        }, { transaction });
        console.log(`✅ Customer account ${customerAccountNumber} credited with ₦${disbursementAmount}`);
      }
    }

    // ================ GL ENTRIES & LEDGER UPDATES ================
    // 1. Retrieve the loan product (using prod_id)
    let product = await LoanProduct.findOne({
      where: { prod_id: loanAccount.LOAN_PRODUCT_ID },
      transaction
    });

    let glPatterns = null;
    if (product && product.default_gl_accounts && Object.keys(product.default_gl_accounts).length > 0) {
      glPatterns = product.default_gl_accounts;
      console.log(`Using GL patterns from LoanProduct for prod_id ${loanAccount.LOAN_PRODUCT_ID}`);
    } else {
      // Fallback to ProductTypeMapping
      const mapping = await ProductTypeMapping.findOne({
        where: { prod_id: loanAccount.LOAN_PRODUCT_ID },
        transaction
      });
      if (mapping && mapping.gl_accounts && Object.keys(mapping.gl_accounts).length > 0) {
        glPatterns = mapping.gl_accounts;
        console.log(`Using GL patterns from ProductTypeMapping for prod_id ${loanAccount.LOAN_PRODUCT_ID}`);
      } else {
        console.warn(`No GL patterns found for prod_id ${loanAccount.LOAN_PRODUCT_ID} – skipping GL entries`);
      }
    }

    if (glPatterns) {
      // 2. Determine branch code
      const branchCode = loanAccount.BU_ID ? loanAccount.BU_ID.toString().padStart(3, '0') : '001';

      // 3. Get GL account patterns
      const assetPattern = glPatterns.loanGLAccount || glPatterns.principalGLAccountNo || '01***112020001';
      const liabilityPattern = glPatterns.interestGLAccountNo || glPatterns.principalBalanceGLAccountNo || '01***222010001';

      // 4. Ensure both GL accounts exist for this branch (reference table)
      const loanAssetGL = await ensureGLAccountForBranch(assetPattern, branchCode, 'ASSET', product || { prod_id: loanAccount.LOAN_PRODUCT_ID }, transaction);
      const customerDepositGL = await ensureGLAccountForBranch(liabilityPattern, branchCode, 'LIABILITY', product || { prod_id: loanAccount.LOAN_PRODUCT_ID }, transaction);

      if (loanAssetGL && customerDepositGL) {
        const resolvedAssetNo = loanAssetGL.GL_ACCT_NO;
        const resolvedLiabilityNo = customerDepositGL.GL_ACCT_NO;

        // === CRITICAL: Create ledger entries BEFORE creating GL transaction ===
        const assetLedger = await ensureLedgerForBranch(resolvedAssetNo, 'ASSET', branchCode, transaction);
        const liabilityLedger = await ensureLedgerForBranch(resolvedLiabilityNo, 'LIABILITY', branchCode, transaction);

        // Now create GL transaction record (journal entry)
        const numericTxId = Date.now();
        const transactionIdStr = `GL-${numericTxId}-${Math.floor(Math.random() * 1000)}`;
        const journalId = `JRNL-DISB-${loanAccount.id}-${numericTxId}`;

        await GLAccountTransaction.create({
          JOURNAL_ID: journalId,
          TRANSACTION_ID: transactionIdStr,
          DR_ACCT_NO: resolvedAssetNo,
          CR_ACCT_NO: resolvedLiabilityNo,
          AMOUNT: disbursementAmount,
          NARRATION: `Loan disbursement to account ${customerAccountNumber} for loan ${ACCT_NO}`,
          CREATED_BY: approvedBy,
          TRANSACTION_TYPE: 'LOAN_DISBURSEMENT',
          CURRENCY_CODE: 'NGN',
          STATUS: 'POSTED',
          TransactionId: numericTxId,
          createdAt: now,
          updatedAt: now
        }, { transaction });

        // Update reference GL account balances (optional)
        await loanAssetGL.update({
          LEDGER_BALANCE: (parseFloat(loanAssetGL.LEDGER_BALANCE) || 0) + disbursementAmount,
          CURRENT_BALANCE: (parseFloat(loanAssetGL.CURRENT_BALANCE) || 0) + disbursementAmount,
          ROW_TS: now
        }, { transaction });
        await customerDepositGL.update({
          LEDGER_BALANCE: (parseFloat(customerDepositGL.LEDGER_BALANCE) || 0) + disbursementAmount,
          CURRENT_BALANCE: (parseFloat(customerDepositGL.CURRENT_BALANCE) || 0) + disbursementAmount,
          ROW_TS: now
        }, { transaction });

        // Update ledger balances (now they exist)
        await assetLedger.update({
          LEDGER_BALANCE: (parseFloat(assetLedger.LEDGER_BALANCE) || 0) + disbursementAmount,
          CURRENT_BALANCE: (parseFloat(assetLedger.CURRENT_BALANCE) || 0) + disbursementAmount,
          ROW_TS: now
        }, { transaction });
        await liabilityLedger.update({
          LEDGER_BALANCE: (parseFloat(liabilityLedger.LEDGER_BALANCE) || 0) + disbursementAmount,
          CURRENT_BALANCE: (parseFloat(liabilityLedger.CURRENT_BALANCE) || 0) + disbursementAmount,
          ROW_TS: now
        }, { transaction });

        console.log(`GL entries and ledger balances updated for loan ${ACCT_NO}`);
      } else {
        console.warn(`Could not create/resolve GL accounts for prod_id ${loanAccount.LOAN_PRODUCT_ID}, branch ${branchCode}`);
      }
    }

    // ================ PORTFOLIO UPDATE ================
    try {
      if (!loanAccount.BU_ID) {
        console.warn(`Loan account ${ACCT_NO} has no BU_ID, using default '001'`);
        loanAccount.BU_ID = '001';
      }
      await LoanPortfolio.updateForDisbursement(loanAccount, disbursementAmount, transaction);
      console.log(`Portfolio updated for loan ${ACCT_NO}`);
    } catch (portfolioError) {
      console.warn(`Portfolio update failed (non‑critical): ${portfolioError.message}`);
    }

    // Commit all changes
    await transaction.commit();

    // Build response
    const totalDisbursedNow = newDisbursedAmount;
    const remainingLimit = loanAmountValue - totalDisbursedNow;

    const responseData = {
      success: true,
      message: finalMessage,
      data: {
        loanAccount: {
          ACCT_NO,
          previousStatus: currentStatus,
          newStatus: 'ACTIVE',
          approvedAmount: loanAmountValue,
          previousDisbursed: currentDisbursedAmount,
          currentDisbursement: disbursementAmount,
          totalDisbursed: totalDisbursedNow,
          previousOutstanding: currentOutstandingPrincipal,
          newOutstanding: newOutstandingPrincipal,
          remainingLimit,
          approvalDate: now,
          disbursementDate: now,
          approvedBy,
          approvalComments
        },
        loanDisbursement: {
          id: loanDisbursement.id,
          previousStatus: loanDisbursement.status,
          newStatus: 'DISBURSED'
        },
        creditApplication: creditApplication ? {
          id: creditApplication.id,
          previousStatus: creditApplication.STATUS,
          newStatus: 'APPROVED'
        } : null
      }
    };

    return res.status(200).json(responseData);

  } catch (error) {
    if (transaction && !transaction.finished) {
      await transaction.rollback();
    }
    console.error("ERROR in approveAndDisburseLoan:", error);
    return res.status(500).json({
      success: false,
      message: "Approval process failed",
      error: error.message,
      code: "APPROVAL_PROCESS_ERROR"
    });
  }
},


// @desc    Reject a loan disbursement request
// @route   POST /api/loans/reject-disbursement
// @access  Private (Loan Officers, Managers, Approvers)
async rejectDisbursement(req, res) {
    console.log("=== DEBUG: Starting rejectDisbursement ===");
    console.log("Request body:", JSON.stringify(req.body, null, 2));
    
    const transaction = await sequelize.transaction();
    
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
            await transaction.rollback();
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

        // 1. Find loan account using the model
        const loanAccount = await LoanAccount.findOne({
            where: { ACCT_NO: ACCT_NO },
            transaction
        });

        if (!loanAccount) {
            await transaction.rollback();
            return res.status(404).json({
                success: false,
                message: `Loan account ${ACCT_NO} not found`,
                code: "LOAN_NOT_FOUND",
                debug: { searchedAccount: ACCT_NO }
            });
        }

        console.log("DEBUG: loanAccount found:", {
            id: loanAccount.id,
            ACCT_NO: loanAccount.ACCT_NO,
            LOAN_STATUS: loanAccount.LOAN_STATUS,
            DISBURSED_AMOUNT: loanAccount.DISBURSED_AMOUNT
        });

        const currentStatus = loanAccount.LOAN_STATUS;
        const currentDisbursedAmount = parseFloat(loanAccount.DISBURSED_AMOUNT || 0);
        const now = new Date();

        // 2. Validate current status (only allow rejection from specific statuses)
        const allowedStatusesForRejection = ['PENDING', 'UNDER_REVIEW', 'APPROVAL_PENDING'];
        
        if (!allowedStatusesForRejection.includes(currentStatus)) {
            await transaction.rollback();
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

        // 3. Check if loan is already disbursed (positive disbursed amount)
        if (currentDisbursedAmount > 0) {
            await transaction.rollback();
            return res.status(400).json({
                success: false,
                message: "Loan has already been disbursed and cannot be rejected",
                code: "ALREADY_DISBURSED",
                data: {
                    ACCT_NO,
                    disbursedAmount: currentDisbursedAmount
                }
            });
        }

        // 4. Update loan account status to REJECTED
        await loanAccount.update({
            LOAN_STATUS: 'REJECTED',
            // If your model has these columns, uncomment:
            // REJECTION_REASON: rejectionReason,
            // REJECTION_COMMENTS: rejectionComments,
            // REJECTED_BY: rejectedBy,
            // REJECTION_DATE: now,
            updated_at: now
        }, { transaction });

        console.log("DEBUG: ✓ Loan account status updated to REJECTED");

        // 5. Update credit application if exists
        const creditApplication = await CreditApplication.findOne({
            where: { ACCT_NO: ACCT_NO },
            transaction
        });

        if (creditApplication) {
            await creditApplication.update({
                STATUS: 'REJECTED'
                // If your model has rejection columns, add them here
            }, { transaction });
            console.log("DEBUG: ✓ Credit application updated to REJECTED");
        }

        // 6. Release guarantor if exists
        if (loanAccount.GUARANTOR_ID) {
            try {
                const guarantor = await Guarantor.findByPk(loanAccount.GUARANTOR_ID, { transaction });
                if (guarantor) {
                    await guarantor.update({
                        status: 'RELEASED',
                        released_by: rejectedBy,
                        released_date: now,
                        release_reason: `Loan rejected: ${rejectionReason}`
                    }, { transaction });
                    console.log("DEBUG: ✓ Guarantor released");
                }
            } catch (err) {
                console.warn("Could not update guarantor:", err.message);
                // Continue – not critical
            }
        }

        // 7. Cancel repayment schedule if exists
        if (loanAccount.repaymentScheduleId) {
            try {
                const repaymentSchedule = await RepaymentSchedule.findByPk(loanAccount.repaymentScheduleId, { transaction });
                if (repaymentSchedule) {
                    await repaymentSchedule.update({
                        status: 'CANCELLED'
                    }, { transaction });
                    console.log("DEBUG: ✓ Repayment schedule cancelled");
                }
            } catch (err) {
                console.warn("Could not cancel repayment schedule:", err.message);
            }
        }

        // 8. Commit transaction
        await transaction.commit();
        console.log("DEBUG: Transaction committed successfully");

        // 9. Prepare success response
        const responseData = {
            success: true,
            message: "Loan disbursement rejected successfully",
            data: {
                loanAccount: {
                    ACCT_NO: loanAccount.ACCT_NO,
                    previousStatus: currentStatus,
                    newStatus: 'REJECTED',
                    loanAmount: loanAccount.AMOUNT,
                    customerId: loanAccount.CUST_ID,
                    rejectionDetails: {
                        rejectedBy,
                        rejectionReason,
                        rejectionComments,
                        rejectionDate: now
                    }
                },
                audit: {
                    logged: true
                }
            }
        };

        console.log("=== DEBUG: Sending success response ===");
        return res.status(200).json(responseData);

    } catch (error) {
        if (transaction && !transaction.finished) {
            await transaction.rollback();
        }
        console.error("DEBUG: Error in rejectDisbursement:", error);
        console.error("DEBUG: Error stack:", error.stack);

        return res.status(500).json({
            success: false,
            message: error.message || "Loan rejection process failed",
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
    
    const currentBusinessDate = (systemDate && systemDate.currentBusinessDate) || new Date();
    
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
        loan.repaymentStatus && (loan.repaymentStatus.status === 'DUE_SOON' || 
        loan.repaymentStatus.status === 'DUE_TODAY')
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
    const loanStatus = loanData.LOAN_STATUS && loanData.LOAN_STATUS.toUpperCase();
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
      processedBy: (req.user && req.user.id) || 'system'
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
async createRepaymentTransactionRecord(loanData, transaction) {
  console.log('Creating loan repayment transaction record...');
  try {
    const repaymentTransactionData = {
      accountId: loanData.loanAccountId,
      accountNumber: loanData.ACCT_NO,
      customerId: loanData.CUST_ID,
      transactionDate: new Date(loanData.paymentDate),
      transactionType: 'REPAYMENT',
      amount: loanData.amount,
      principalAmount: loanData.principalPaid || 0,
      interestAmount: loanData.interestPaid || 0,
      paymentMethod: (loanData.paymentMethod || 'CASH').toUpperCase().replace(/\s+/g, '_').substring(0, 20),
      transactionReference: loanData.reference || `REPAY-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      repaymentType: 'REPAYMENT',
      isInstallment: loanData.isInstallment || true,
      createdBy: loanData.createdBy || 'system',
      status: 'COMPLETED',
      receiptNo: loanData.receiptNo || `RCP-${Date.now()}`,
      branchCode: loanData.branchCode || '001',
      productCode: loanData.productCode || 'DEFAULT',
      notes: loanData.description || 'Loan repayment against schedule',
      glPosted: false
    };
    const repaymentTransaction = await LoanRepaymentTransaction.create(repaymentTransactionData, { transaction });
    return repaymentTransaction.id;
  } catch (error) {
    console.error('Error creating loan repayment transaction record:', error);
    throw error;
  }
},

// controllers/repaymentController.js
async processSchedulePayment  (req, res){
  console.log('=== PROCESSING SCHEDULE PAYMENT ===');
  const transaction = await sequelize.transaction();
  try {
    const { ACCT_NO } = req.params;
    const { amount, customerAccountNo, paymentMethod = 'CASH_DEPOSIT', referenceNumber, description, paymentDate = new Date(), createdBy = 'SYSTEM' } = req.body;
    console.log('Payment request:', { ACCT_NO, amount, customerAccountNo, paymentMethod });
    if (!ACCT_NO) throw { code: 'MISSING_ACCT_NO', message: 'Loan account number is required', status: 400 };
    if (!amount || isNaN(amount) || amount <= 0) throw { code: 'INVALID_AMOUNT', message: 'Valid payment amount is required', status: 400 };
    if (!customerAccountNo) throw { code: 'MISSING_CUSTOMER_ACCOUNT', message: 'Customer account number is required', status: 400 };

    // Find Loan Account
    const loanAccount = await LoanAccount.findOne({ where: { ACCT_NO: String(ACCT_NO) }, transaction });
    if (!loanAccount) throw { code: 'LOAN_NOT_FOUND', message: `Loan account ${ACCT_NO} not found`, status: 404 };
    console.log('Found loan account:', { ACCT_NO: loanAccount.ACCT_NO, id: loanAccount.id, status: loanAccount.LOAN_STATUS, outstanding: loanAccount.OUTSTANDING_PRINCIPAL });

    // Check loan status
    const validStatuses = ['ACTIVE', 'DISBURSED', 'ONGOING'];
    const loanStatus = loanAccount.LOAN_STATUS;
    if (!validStatuses.includes(loanStatus?.toUpperCase())) {
      throw { code: 'INVALID_LOAN_STATUS', message: `Loan not active. Status: ${loanStatus}`, status: 400 };
    }

    // Find Customer Account
    const customerAccount = await CustomerAccount.findOne({ where: { account_number: String(customerAccountNo) }, transaction });
    if (!customerAccount) throw { code: 'CUSTOMER_NOT_FOUND', message: `Customer account ${customerAccountNo} not found`, status: 404 };
    const customerBalance = toDecimal(customerAccount.ledger_balance || customerAccount.available_balance || 0);
    if (customerBalance < amount) throw { code: 'INSUFFICIENT_FUNDS', message: `Insufficient funds. Available: ${customerBalance}`, status: 400 };

    // Find Repayment Schedule
    const repaymentSchedule = await RepaymentSchedule.findOne({ where: { account_number: String(ACCT_NO) }, transaction });
    if (!repaymentSchedule) throw { code: 'NO_SCHEDULE', message: 'No repayment schedule found for this loan', status: 400 };

    // Process payment
    const paymentResult = await processPaymentAgainstSchedule(repaymentSchedule, amount, paymentDate, loanAccount, transaction);
    console.log('Step 5: Payment processed successfully');

    // Update Loan Account
    const currentTotalRepaid = toDecimal(loanAccount.TOTAL_REPAID_AMOUNT || 0);
    await loanAccount.update({
      OUTSTANDING_PRINCIPAL: -paymentResult.newOutstanding,
      TOTAL_REPAID_AMOUNT: currentTotalRepaid + amount,
      LAST_REPAYMENT_DATE: new Date(paymentDate),
      LAST_REPAYMENT_AMOUNT: amount,
      ...(paymentResult.isFinalPayment && { LOAN_STATUS: 'CLOSED', CLOSURE_DATE: new Date(paymentDate) })
    }, { transaction });
    console.log('Step 6: Loan account updated');

    // Update Customer Account balance
    const updateFields = {};
    if (customerAccount.ledger_balance !== undefined) updateFields.ledger_balance = customerBalance - amount;
    if (customerAccount.available_balance !== undefined) updateFields.available_balance = customerBalance - amount;
    await customerAccount.update(updateFields, { transaction });
    console.log('Step 7: Customer account updated');

    // Update Repayment Schedule
    await repaymentSchedule.update({
      installments_json: paymentResult.updatedSchedule,
      schedule: paymentResult.updatedSchedule,
      status: paymentResult.isFinalPayment ? 'COMPLETED' : 'ACTIVE'
    }, { transaction });
    console.log('Step 8: Repayment schedule updated');

    // Create repayment records
    const repaymentRecords = await createLoanRepaymentRecords({
      loanAccountId: loanAccount.id,
      ACCT_NO: loanAccount.ACCT_NO,
      CUST_ID: loanAccount.CUST_ID,
      customerName: loanAccount.ACCT_NM,
      amount: amount,
      principalPaid: paymentResult.totalPrincipalPaid,
      interestPaid: paymentResult.totalInterestPaid,
      paymentDate: paymentDate,
      paymentMethod: paymentMethod,
      description: description || 'Loan repayment against schedule',
      installmentNo: paymentResult.detailedInstallmentsUpdated[0]?.installmentNo,
      isInstallment: paymentResult.installmentsUpdated > 0,
      createdBy: createdBy
    }, transaction);
    console.log('Step 9: Repayment records created', repaymentRecords);

    // ✅ Update Loan Portfolio
    try {
      const currentDate = new Date(paymentDate);
      const month = currentDate.getMonth() + 1;
      const year = currentDate.getFullYear();
      const branchId = loanAccount.BU_ID || '001';
      const productId = loanAccount.LOAN_PRODUCT_ID;

      let portfolio = await LoanPortfolio.findOne({
        where: {
          BRANCH_ID: branchId,
          PROD_ID: productId,
          MONTH: month,
          YEAR: year,
          CURRENCY: 'NGN'
        },
        transaction
      });

      if (!portfolio) {
        // Create a new portfolio record for this month if not exists
        portfolio = await LoanPortfolio.create({
          BRANCH_ID: branchId,
          PROD_ID: productId,
          PRODUCT_CODE: 'DEFAULT',
          PRODUCT_NAME: 'General Loan',
          PRODUCT_TYPE: 'GENERAL_LOAN',
          MONTH: month,
          YEAR: year,
          CURRENCY: 'NGN',
          TOTAL_DISBURSED: 0,
          TOTAL_PRINCIPAL: 0,
          OUTSTANDING_PRINCIPAL: 0,
          TOTAL_REPAYMENTS: 0,
          TOTAL_RECOVERED: 0,
          NUMBER_OF_LOANS: 0,
          ACTIVE_LOANS: 0,
          DISBURSEMENT_COUNT: 0,
          STATUS: 'ACTIVE',
          CREATED_BY: createdBy,
          UPDATED_BY: createdBy
        }, { transaction });
      }

      // Update portfolio metrics
      const totalRepayments = toDecimal(portfolio.TOTAL_REPAYMENTS) + amount;
      const totalRecovered = toDecimal(portfolio.TOTAL_RECOVERED) + paymentResult.totalPrincipalPaid;
      const totalInterestReceived = toDecimal(portfolio.TOTAL_INTEREST_RECEIVED) + paymentResult.totalInterestPaid;
      const newOutstandingPortfolio = Math.max(0, toDecimal(portfolio.OUTSTANDING_PRINCIPAL) - paymentResult.totalPrincipalPaid);

      await portfolio.update({
        TOTAL_REPAYMENTS: totalRepayments,
        TOTAL_RECOVERED: totalRecovered,
        TOTAL_INTEREST_RECEIVED: totalInterestReceived,
        OUTSTANDING_PRINCIPAL: newOutstandingPortfolio,
        UPDATED_DATE: new Date(),
        UPDATED_BY: createdBy
      }, { transaction });

      // If loan is fully repaid, decrement active loans count
      if (paymentResult.isFinalPayment) {
        const activeLoans = Math.max(0, (portfolio.ACTIVE_LOANS || 0) - 1);
        await portfolio.update({ ACTIVE_LOANS: activeLoans }, { transaction });
      }

      console.log('Step 9b: Loan portfolio updated');
    } catch (portfolioError) {
      console.error('Error updating loan portfolio:', portfolioError);
      // Don't fail the entire transaction – portfolio update is non‑critical
    }

    // Create Transaction record
    const TRANSACTION_IDS = generateTransactionIds();
    const customerName = customerAccount.account_name || loanAccount.ACCT_NM || 'Customer';
    const businessUnitId = loanAccount.BU_ID || customerAccount.BU_ID || 1;
    const accountId = loanAccount.ACCT_ID || customerAccount.ACCT_ID || 'DEFAULT_ACCT';
    const uniqueTransactionRef = `TXN-${Date.now()}-${Math.floor(Math.random() * 10000)}-${loanAccount.id}`;

    await Transaction.create({
      TRANSACTION_IDENTIFIER: TRANSACTION_IDS.TRANSACTION_IDENTIFIER,
      TRANSACTION_ID: TRANSACTION_IDS.TRANSACTION_ID,
      EVENT_ID: TRANSACTION_IDS.EVENT_ID,
      TRAN_JOURNAL_ID: TRANSACTION_IDS.TRAN_JOURNAL_ID,
      JOURNAL_ID: TRANSACTION_IDS.JOURNAL_ID,
      transactionId: TRANSACTION_IDS.transactionId,
      REFERENCE: uniqueTransactionRef,
      ACCT_NO: String(customerAccountNo),
      ACCT_ID: accountId,
      BU_ID: businessUnitId,
      CUST_ID: String(loanAccount.CUST_ID),
      ACCT_NM: customerName,
      AMOUNT: amount,
      TRANSACTION_TYPE: 'LOAN_REPAYMENT',
      TRANSACTIONDATE: new Date(paymentDate),
      transactionDirection: 'DEBIT',
      description: description || `Loan repayment for ${ACCT_NO}`,
      currency: 'NGN',
      createdBy: createdBy,
      status: 'COMPLETED',
      metadata: {
        loanAccount: ACCT_NO,
        customerAccount: customerAccountNo,
        paymentMethod: paymentMethod,
        isFinalPayment: paymentResult.isFinalPayment,
        principalPaid: paymentResult.totalPrincipalPaid,
        interestPaid: paymentResult.totalInterestPaid,
        loanRepaymentId: repaymentRecords.loanRepaymentId,
        repaymentTransactionId: repaymentRecords.repaymentTransactionId,
        externalReference: referenceNumber || null
      }
    }, { transaction });
    console.log('Step 10: Transaction record created');

    // Create Loan Event
    await LoanEvent.create({
      ACCT_NO: String(ACCT_NO),
      LOAN_ACCOUNT_ID: loanAccount.id,
      CUST_ID: String(loanAccount.CUST_ID),
      eventType: 'INSTALLMENT_PAID',
      status: 'PROCESSED',
      installmentNumber: paymentResult.detailedInstallmentsUpdated[0]?.installmentNo || 1,
      dueDate: paymentResult.detailedInstallmentsUpdated[0]?.dueDate || new Date(paymentDate),
      paymentDate: new Date(paymentDate),
      amount: amount,
      principalAmount: paymentResult.totalPrincipalPaid,
      interestAmount: paymentResult.totalInterestPaid,
      transactionId: repaymentRecords.repaymentTransactionId,
      repaymentScheduleId: repaymentSchedule.id,
      details: {
        paymentMethod: paymentMethod,
        isFinalPayment: paymentResult.isFinalPayment,
        installmentsUpdated: paymentResult.detailedInstallmentsUpdated,
        loanRepaymentId: repaymentRecords.loanRepaymentId
      },
      createdBy: createdBy,
      branchId: loanAccount.BU_ID || null,
      timestamp: new Date(),
      effectiveDate: new Date(paymentDate)
    }, { transaction });
    console.log('Step 11: Loan event created');

    await transaction.commit();
    console.log('Step 12: Transaction committed');

    return res.status(200).json({
      success: true,
      message: 'Payment processed successfully against schedule',
      data: {
        repaymentId: repaymentRecords.loanRepaymentId,
        repaymentTransactionId: repaymentRecords.repaymentTransactionId,
        loanAccount: {
          ACCT_NO: loanAccount.ACCT_NO,
          accountName: loanAccount.ACCT_NM,
          newOutstanding: paymentResult.newOutstanding,
          previousOutstanding: paymentResult.previousOutstanding,
          loanStatus: paymentResult.isFinalPayment ? 'CLOSED' : loanAccount.LOAN_STATUS
        },
        customerAccount: {
          accountNumber: customerAccount.account_number,
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
    if (transaction) await transaction.rollback();
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to process payment against schedule',
      error: error.code || 'SCHEDULE_PAYMENT_ERROR'
    });
  }
},

// Also update your recordManualRepayment method with raw queries:
async recordManualRepayment(req, res) {
  try {
    const { ACCT_NO } = req.params;
    const repaymentData = req.body;

    console.log('📝 Processing manual repayment for account:', ACCT_NO);
    console.log('🔓 Decrypted repayment data:', {
      amount: repaymentData.amount,
      principalPaid: repaymentData.principalPaid,
      interestPaid: repaymentData.interestPaid,
      decrypted: req.decrypted || false
    });

    // Validate required fields
    if (!ACCT_NO) {
      return res.status(400).json({
        success: false,
        message: 'Account number is required',
        code: 'MISSING_ACCOUNT_NUMBER'
      });
    }

    if (!repaymentData.amount || parseFloat(repaymentData.amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid repayment amount is required',
        code: 'INVALID_AMOUNT'
      });
    }

    // Find loan account – using ACCT_NO matches your model
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

    console.log('Found loan account:', {
      ACCT_NO: loanAccount.ACCT_NO,
      outstanding: loanAccount.OUTSTANDING_PRINCIPAL,
      status: loanAccount.LOAN_STATUS
    });

    // Check if loan is active
    const activeStatuses = ['ACTIVE', 'APPROVED', 'DISBURSED', 'ONGOING'];
    if (!activeStatuses.includes(loanAccount.LOAN_STATUS)) {
      return res.status(400).json({
        success: false,
        message: `Cannot process repayment for loan with status: ${loanAccount.LOAN_STATUS}`,
        code: 'INVALID_LOAN_STATUS'
      });
    }

    const transaction = await sequelize.transaction();

    try {
      const repaymentAmount = toDecimal(repaymentData.amount);
      const principalPaid = toDecimal(repaymentData.principalPaid || repaymentData.principal_amount || repaymentAmount);
      const interestPaid = toDecimal(repaymentData.interestPaid || repaymentData.interest_amount || 0);
      const paymentDate = new Date(repaymentData.date || repaymentData.paymentDate || Date.now());
      const transactionReference = repaymentData.referenceNumber || repaymentData.reference || `MANUAL-${Date.now()}`;

      // Current outstanding is stored as negative -> convert to positive for calculation
      const currentOutstanding = Math.abs(toDecimal(loanAccount.OUTSTANDING_PRINCIPAL || 0));
      const newOutstandingPositive = Math.max(0, currentOutstanding - principalPaid);
      const newOutstanding = -newOutstandingPositive;   // store as negative

      // 1. Create LoanRepayment record
      const loanRepayment = await LoanRepayment.create({
        loan_account_number: String(ACCT_NO),
        loan_account_id: loanAccount.id,
        customer_id: loanAccount.CUST_ID,
        customer_name: loanAccount.ACCT_NM || 'Customer',
        principal_amount: principalPaid,
        interest_amount: interestPaid,
        penalty_amount: toDecimal(repaymentData.penaltyAmount || 0),
        total_amount: repaymentAmount,
        installment_number: repaymentData.installmentNumber || null,
        repayment_date: paymentDate,
        transaction_reference: transactionReference,
        status: 'COMPLETED',
        collection_id: repaymentData.collectionId || null,
        payment_method: repaymentData.paymentMethod || 'CASH',
        receipt_number: repaymentData.receiptNo || await this.generateReceiptNumber(),
        processed_by: req.user?.id || repaymentData.processedBy || 'SYSTEM',
        notes: repaymentData.notes || repaymentData.description || 'Manual repayment recorded'
      }, { transaction });

      // 2. Create transaction record via helper (ensure helper uses correct model)
      const repaymentTransactionId = await this.createRepaymentTransactionRecord({
        loanAccountId: loanAccount.id,
        ACCT_NO: loanAccount.ACCT_NO,
        CUST_ID: loanAccount.CUST_ID,
        amount: repaymentAmount,
        principalPaid: principalPaid,
        interestPaid: interestPaid,
        paymentDate: paymentDate,
        paymentMethod: repaymentData.paymentMethod || 'CASH',
        reference: transactionReference,
        receiptNo: repaymentData.receiptNo,
        description: repaymentData.description || 'Manual repayment',
        isInstallment: !!repaymentData.installmentNumber,
        createdBy: req.user?.id || 'system',
        branchCode: repaymentData.branchCode || '001',
        productCode: repaymentData.productCode || 'DEFAULT'
      }, transaction);

      // 3. Update loan account outstanding (store as negative)
      await loanAccount.update({
        OUTSTANDING_PRINCIPAL: newOutstanding,
        TOTAL_REPAID_AMOUNT: toDecimal(loanAccount.TOTAL_REPAID_AMOUNT || 0) + repaymentAmount,
        LAST_REPAYMENT_DATE: paymentDate,
        LAST_REPAYMENT_AMOUNT: repaymentAmount,
        updated_at: new Date()
      }, { transaction });

      // 4. Update repayment schedule (optional)
      const hasSchedule = await this.updateRepaymentSchedule(loanAccount.id, principalPaid, paymentDate, transaction);

      // 5. Create audit trail (ensure logAuditTrail is imported/defined)
      if (typeof logAuditTrail === 'function') {
        await logAuditTrail({
          userId: req.user?.id || 'SYSTEM',
          action: 'MANUAL_REPAYMENT',
          entityType: 'LOAN_ACCOUNT',
          entityId: loanAccount.id,
          oldValue: { outstanding: currentOutstanding },
          newValue: { outstanding: newOutstandingPositive, amountPaid: repaymentAmount },
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          transaction
        });
      }

      await transaction.commit();

      // Send notification if requested
      if (repaymentData.sendNotification !== false) {
        try {
          await this.sendRepaymentNotification(loanAccount, repaymentAmount, newOutstandingPositive);
        } catch (notifyError) {
          console.warn('Could not send notification:', notifyError.message);
        }
      }

      return res.status(201).json({
        success: true,
        message: 'Manual repayment recorded successfully',
        data: {
          loanRepaymentId: loanRepayment.id,
          repaymentTransactionId: repaymentTransactionId,
          receiptNumber: loanRepayment.receipt_number,
          transactionReference: transactionReference,
          amountPaid: repaymentAmount,
          principalPaid: principalPaid,
          interestPaid: interestPaid,
          previousOutstanding: currentOutstanding,
          newOutstanding: newOutstandingPositive,
          repaymentDate: paymentDate,
          paymentMethod: repaymentData.paymentMethod || 'CASH',
          scheduleUpdated: hasSchedule,
          encryptionInfo: {
            wasDecrypted: req.decrypted || false,
            timestamp: new Date().toISOString()
          }
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
      details: error.details || null,
      code: 'REPAYMENT_RECORDING_ERROR'
    });
  }
},

// Helper method to generate receipt number
async generateReceiptNumber() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `RCPT-${timestamp}-${random}`;
},

// Helper method to update repayment schedule
async updateRepaymentSchedule(loanAccountId, amountPaid, paymentDate, transaction) {
  try {
    // Find the repayment schedule
    const [schedule] = await sequelize.query(
      `SELECT id, installments_json FROM repayment_schedules 
       WHERE loan_account_id = ? AND status = 'ACTIVE' 
       ORDER BY created_at DESC LIMIT 1`,
      {
        replacements: [loanAccountId],
        type: QueryTypes.SELECT,
        transaction
      }
    );
    
    if (!schedule || !schedule.installments_json) {
      console.log('No active repayment schedule found');
      return false;
    }
    
    let installments = typeof schedule.installments_json === 'string' 
      ? JSON.parse(schedule.installments_json) 
      : schedule.installments_json;
    
    // Find the next pending installment
    const nextInstallment = installments.find(inst => inst.status === 'PENDING');
    
    if (nextInstallment) {
      nextInstallment.status = 'PAID';
      nextInstallment.paid_date = paymentDate;
      nextInstallment.paid_amount = Math.min(amountPaid, nextInstallment.totalPayment);
      
      // Update the schedule
      await sequelize.query(
        `UPDATE repayment_schedules 
         SET installments_json = ?, updated_at = ? 
         WHERE id = ?`,
        {
          replacements: [JSON.stringify(installments), new Date(), schedule.id],
          transaction
        }
      );
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error updating repayment schedule:', error);
    return false;
  }
},

// Helper method to send notification
async sendRepaymentNotification(loanAccount, amount, newOutstanding) {
  try {
    // Get customer phone
    const custId = loanAccount.c_u_s_t__i_d || loanAccount.CUST_ID;
    const [customer] = await sequelize.query(
      `SELECT PHONE_NO, CUST_NM FROM customers WHERE CUST_ID = ? LIMIT 1`,
      {
        replacements: [custId],
        type: QueryTypes.SELECT
      }
    );
    
    if (customer && customer.PHONE_NO) {
      const message = `Dear ${customer.CUST_NM || 'Customer'}, your loan repayment of ₦${amount.toLocaleString()} has been received. Outstanding balance: ₦${newOutstanding.toLocaleString()}. Thank you.`;
      
      // Call SMS service (implement based on your SMS provider)
      console.log('Sending repayment SMS to:', customer.PHONE_NO);
      // await sendSMS(customer.PHONE_NO, message);
    }
  } catch (error) {
    console.error('Error sending notification:', error);
  }
},

// Helper method to create repayment transaction record
async createRepaymentTransactionRecord(data, transaction) {
  try {
    const transactionId = `REPAY-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    
    const query = `
      INSERT INTO loan_repayment_transactions (
        loan_account_id, account_number, customer_id, amount, 
        principal_paid, interest_paid, payment_date, payment_method,
        reference, receipt_number, description, is_installment,
        created_by, branch_code, product_code, transaction_id,
        created_at, updated_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const [result] = await sequelize.query(query, {
      replacements: [
        data.loanAccountId,
        data.ACCT_NO,
        data.CUST_ID,
        data.amount,
        data.principalPaid,
        data.interestPaid,
        data.paymentDate,
        data.paymentMethod,
        data.reference,
        data.receiptNo || `RCPT-${Date.now()}`,
        data.description,
        data.isInstallment ? 1 : 0,
        data.createdBy,
        data.branchCode,
        data.productCode,
        transactionId,
        new Date(),
        new Date(),
        'COMPLETED'
      ],
      transaction
    });
    
    return result.insertId;
  } catch (error) {
    console.error('Error creating repayment transaction:', error);
    throw error;
  }
},


// GET LOAN ACCOUNT STATUS PENDING

// GET /api/loans/pending
async getPendingLoans(req, res) {
  try {
    console.log('🔍 Fetching pending loans...');

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
    const orderDirection = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    // Build WHERE clause
    const where = { LOAN_STATUS: 'PENDING' };

    if (search) {
      where[Op.or] = [
        { ACCT_NO: { [Op.like]: `%${search}%` } },
        { ACCT_NM: { [Op.like]: `%${search}%` } },
        { CUST_ID: { [Op.like]: `%${search}%` } }
      ];
    }

    if (fromDate) {
      where.created_at = { [Op.gte]: new Date(fromDate) };
    }
    if (toDate) {
      where.created_at = { ...where.created_at, [Op.lte]: new Date(toDate) };
    }

    // Valid sort columns mapping (Sequelize attribute names)
    const sortMap = {
      created_at: 'created_at',
      updated_at: 'updated_at',
      application_date: 'APPLICATION_DATE',
      maturity_date: 'MATURITY_DT',
      amount: 'AMOUNT',
      account_number: 'ACCT_NO',
      customer_id: 'CUST_ID'
    };
    const sortColumn = sortMap[sortBy] || 'created_at';

    // Query with pagination
    const { count, rows } = await LoanAccount.findAndCountAll({
      where,
      order: [[sortColumn, orderDirection]],
      limit: parseInt(limit),
      offset: parseInt(offset),
      attributes: [
        'id', 'ACCT_NO', 'ACCT_NM', 'CUST_ID', 'LOAN_PRODUCT_ID',
        'AMOUNT', 'INTEREST_RATE', 'LOAN_STATUS', 'SERVICING_STATUS',
        'APPLICATION_DATE', 'MATURITY_DT', 'TERM_CD', 'TERM_VALUE',
        'hasRepaymentSchedule', 'repaymentScheduleId', 'DISBURSED_AMOUNT',
        'OUTSTANDING_PRINCIPAL', 'ACCRUED_INTEREST', 'created_at', 'updated_at'
      ]
    });

    console.log(`✅ Found ${rows.length} pending loans (total: ${count})`);

    const formattedLoans = rows.map(loan => {
      const applicationDate = loan.APPLICATION_DATE || loan.created_at;
      const daysSinceApplication = applicationDate
        ? Math.floor((new Date() - new Date(applicationDate)) / (1000 * 60 * 60 * 24))
        : 0;

      let maturityStatus = 'ON_TRACK';
      if (loan.MATURITY_DT) {
        const daysToMaturity = Math.floor((new Date(loan.MATURITY_DT) - new Date()) / (1000 * 60 * 60 * 24));
        if (daysToMaturity < 0) {
          maturityStatus = 'OVERDUE';
        } else if (daysToMaturity < 30) {
          maturityStatus = 'NEAR_MATURITY';
        }
      }

      const amount = parseFloat(loan.AMOUNT || 0);

      return {
        id: loan.id,
        account_number: loan.ACCT_NO,
        account_name: loan.ACCT_NM,
        customer_id: loan.CUST_ID,
        product_id: loan.LOAN_PRODUCT_ID,
        amount: amount,
        formatted_amount: `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        interest_rate: parseFloat(loan.INTEREST_RATE || 0),
        formatted_interest_rate: `${parseFloat(loan.INTEREST_RATE || 0).toFixed(2)}%`,
        status: loan.LOAN_STATUS,
        servicing_status: loan.SERVICING_STATUS,
        application_date: loan.APPLICATION_DATE,
        formatted_application_date: loan.APPLICATION_DATE
          ? new Date(loan.APPLICATION_DATE).toLocaleDateString('en-NG')
          : 'N/A',
        maturity_date: loan.MATURITY_DT,
        formatted_maturity_date: loan.MATURITY_DT
          ? new Date(loan.MATURITY_DT).toLocaleDateString('en-NG')
          : 'N/A',
        term: `${loan.TERM_VALUE || 0} ${loan.TERM_CD || ''}`,
        term_code: loan.TERM_CD,
        term_value: loan.TERM_VALUE,
        has_repayment_schedule: Boolean(loan.hasRepaymentSchedule),
        repayment_schedule_id: loan.repaymentScheduleId,
        disbursed_amount: parseFloat(loan.DISBURSED_AMOUNT || 0),
        outstanding_principal: parseFloat(loan.OUTSTANDING_PRINCIPAL || 0),
        accrued_interest: parseFloat(loan.ACCRUED_INTEREST || 0),
        created_at: loan.created_at,
        updated_at: loan.updated_at,
        days_since_application: daysSinceApplication,
        maturity_status: maturityStatus,
        approval_status: 'PENDING'
      };
    });

    // Summary statistics
    const totalAmount = rows.reduce((sum, loan) => sum + parseFloat(loan.AMOUNT || 0), 0);
    const averageAmount = rows.length ? totalAmount / rows.length : 0;

    const applicationDates = rows
      .map(l => new Date(l.APPLICATION_DATE || l.created_at).getTime())
      .filter(t => !isNaN(t));

    const oldestApplication = applicationDates.length ? Math.min(...applicationDates) : null;
    const newestApplication = applicationDates.length ? Math.max(...applicationDates) : null;

    const uniqueCustomers = new Set(rows.map(l => l.CUST_ID)).size;
    const uniqueProducts = new Set(rows.map(l => l.LOAN_PRODUCT_ID)).size;

    return res.status(200).json({
      success: true,
      message: `${formattedLoans.length} pending loan(s) found`,
      data: {
        loans: formattedLoans,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: count,
          pages: Math.ceil(count / limit)
        },
        summary: {
          total_pending: count,
          total_amount: totalAmount,
          average_amount: averageAmount,
          oldest_application: oldestApplication,
          newest_application: newestApplication,
          unique_customers: uniqueCustomers,
          unique_products: uniqueProducts
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

    if (!ACCT_NO || !generatedBy) {
      return res.status(400).json({
        success: false,
        message: "ACCT_NO and generatedBy are required",
        code: "MISSING_FIELDS"
      });
    }

    transaction = await sequelize.transaction({ readOnly: true });
    console.log("DEBUG: Transaction started");

    // ==================== 1. FIND LOAN ACCOUNT USING CLEAN MODEL ====================
    const loanAccount = await LoanAccount.findOne({
      where: { ACCT_NO: ACCT_NO },   // or accountNumber if that's your attribute name
      transaction
    });

    if (!loanAccount) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `Loan account ${ACCT_NO} not found`,
        code: "LOAN_NOT_FOUND"
      });
    }

    console.log("DEBUG: Found loan account successfully");

    // ==================== 2. EXTRACT DATA FROM MODEL ATTRIBUTES ====================
    const customerId = loanAccount.CUST_ID || '';
    const customerName = loanAccount.ACCT_NM || '';
    const productId = loanAccount.LOAN_PRODUCT_ID || 1001;
    let interestRate = parseFloat(loanAccount.INTEREST_RATE || 0);
    const loanAmount = parseFloat(loanAccount.AMOUNT || 0);
    const termCode = loanAccount.TERM_CD || 'M';
    const termValue = parseFloat(loanAccount.TERM_VALUE || 0);
    const loanPurpose = loanAccount.loan_purpose || 'Business';
    const securityCollateral = loanAccount.security_collateral || 'Land';
    const borrowerAddress = loanAccount.borrower_address || 'Address Not Provided';

    console.log("DEBUG: Extracted data:", {
      customerId, customerName, productId, interestRate,
      loanAmount, termCode, termValue, loanPurpose, securityCollateral
    });

    // ==================== 3. GET CUSTOMER DETAILS (using getCustomer getter) ====================
    let customerDetails = {
      CUST_NM: customerName,
      HOME_ADDRESS: borrowerAddress
    };

    if (customerId) {
      try {
        const Customer = getCustomer();
        if (Customer) {
          const customer = await Customer.findOne({
            where: { [Op.or]: [{ id: customerId }, { CUST_ID: customerId }] },
            transaction
          });
          if (customer) {
            console.log("DEBUG: Found customer details");
            customerDetails.CUST_NM = customer.full_name || customer.name || customerName;
            // Try to find address
            const addressFields = ['address', 'home_address', 'residential_address', 'contact_address'];
            for (const field of addressFields) {
              if (customer[field]) {
                customerDetails.HOME_ADDRESS = customer[field];
                break;
              }
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
        const LoanProduct = getLoanProduct();
        if (LoanProduct) {
          const product = await LoanProduct.findOne({
            where: { [Op.or]: [{ id: productId }, { PROD_ID: productId }] },
            transaction
          });
          if (product) {
            console.log("DEBUG: Retrieved product details");
            processingFeeRate = parseFloat(product.processing_fee_rate || 1.0);
            insuranceFeeRate = parseFloat(product.insurance_fee_rate || 1.0);
            if (product.effective_interest_rate) {
              interestRate = parseFloat(product.effective_interest_rate);
            } else if (product.interest_rate) {
              interestRate = parseFloat(product.interest_rate);
            }
          }
        }
      } catch (error) {
        console.warn("DEBUG: Error retrieving product config:", error.message);
      }
    }

    // ==================== 5. CALCULATE DATES AND AMOUNTS ====================
    const now = new Date();
    const disbursementAmount = Math.abs(loanAmount);
    const maturityDate = new Date(now);
    if (termCode === 'M' || termCode === 'MONTHLY') {
      maturityDate.setMonth(maturityDate.getMonth() + termValue);
    } else if (termCode === 'Y' || termCode === 'YEARLY') {
      maturityDate.setFullYear(maturityDate.getFullYear() + termValue);
    }
    const firstPaymentDate = new Date(now);
    firstPaymentDate.setDate(firstPaymentDate.getDate() + 30);

    const processingFeeAmount = (disbursementAmount * processingFeeRate) / 100;
    const insuranceFeeAmount = (disbursementAmount * insuranceFeeRate) / 100;
    const totalFees = processingFeeAmount + insuranceFeeAmount;

    // ==================== 6. GENERATE CONTRACT TEXT ====================
    const generateContractText = () => {
      // (the same contract generation function as in original – unchanged)
      const today = new Date();
      const formattedDate = today.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'long',
        year: 'numeric'
      });
      const numberToWords = (num) => {
        const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
        const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
        const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
        if (num === 0) return 'Zero';
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
              if (one > 0) words += ' ' + ones[one];
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
          customerName: customerDetails.CUST_NM
        }
      }
    };

    // ==================== 8. OPTIONAL: SAVE TO DATABASE ====================
    if (saveToDatabase !== false) {
      try {
        const LoanContractForm = getLoanContractForm(); // assume you have a getter
        if (LoanContractForm) {
          const [existingContract] = await LoanContractForm.findOrCreate({
            where: { loanAccountNo: ACCT_NO },
            defaults: {
              loanContractNo: `LOAN-CONTRACT-${ACCT_NO}-${Date.now()}`,
              customerId: customerId || 'UNKNOWN',
              borrowerName: customerName,
              borrowerAddress: borrowerAddress,
              loanPurpose: loanPurpose,
              loanAmount: disbursementAmount.toString(),
              loanTerm: termValue,
              termCode: termCode,
              interestRate: interestRate,
              status: 'GENERATED',
              contractText: contractText,
              userId: generatedBy,
              loanAccountNo: ACCT_NO,
              metadata: {
                generatedBy: generatedBy,
                generationDate: now.toISOString(),
                processingFeeRate: processingFeeRate,
                insuranceFeeRate: insuranceFeeRate
              },
              disbursementDate: now,
              maturityDate: maturityDate,
              createdAt: now,
              updatedAt: now
            },
            transaction
          });
          if (!existingContract) {
            // update if already exists
            await LoanContractForm.update(
              {
                contractText: contractText,
                status: 'GENERATED',
                updatedAt: now,
                userId: generatedBy
              },
              { where: { loanAccountNo: ACCT_NO }, transaction }
            );
          }
          console.log("DEBUG: Contract saved to database");
        }
      } catch (dbError) {
        console.warn("DEBUG: Could not save contract to database:", dbError.message);
      }
    }

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
async getPendingLoansSimple(req, res) {
  try {
    const pendingLoans = await LoanAccount.findAll({
      where: { LOAN_STATUS: 'PENDING' },
      attributes: [
        'id',
        ['ACCT_NO', 'account_number'],
        ['ACCT_NM', 'account_name'],
        ['CUST_ID', 'customer_id'],
        ['AMOUNT', 'amount'],
        ['INTEREST_RATE', 'interest_rate'],
        ['LOAN_STATUS', 'status'],
        ['APPLICATION_DATE', 'application_date'],
        'created_at'
      ],
      order: [['created_at', 'DESC']]
    });

    return res.status(200).json({
      success: true,
      count: pendingLoans.length,
      data: pendingLoans
    });
  } catch (error) {
    console.error('Error in getPendingLoansSimple:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pending loans',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
},

/**
 * Get summary statistics of pending loans
 */
async getPendingLoansSummary(req, res) {
  try {
    // 1. Get main summary using Sequelize aggregations
    const summaryResult = await LoanAccount.findAll({
      where: { LOAN_STATUS: 'PENDING' },
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total_count'],
        [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'total_amount'],
        [sequelize.fn('AVG', sequelize.col('AMOUNT')), 'average_amount'],
        [sequelize.fn('MIN', sequelize.col('APPLICATION_DATE')), 'oldest_application'],
        [sequelize.fn('MAX', sequelize.col('APPLICATION_DATE')), 'newest_application'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('CUST_ID'))), 'unique_customers'],
        [sequelize.fn('COUNT', sequelize.fn('DISTINCT', sequelize.col('LOAN_PRODUCT_ID'))), 'unique_products']
      ],
      raw: true
    });

    // Extract the first row (aggregates are returned as a single object)
    const summary = summaryResult[0] || {};

    // 2. Get term breakdown (group by TERM_CD)
    const termBreakdown = await LoanAccount.findAll({
      where: { LOAN_STATUS: 'PENDING' },
      attributes: [
        ['TERM_CD', 'term_code'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.col('AMOUNT')), 'total_amount']
      ],
      group: ['TERM_CD'],
      raw: true
    });

    return res.status(200).json({
      success: true,
      data: {
        summary: summary,
        term_breakdown: termBreakdown,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error in getPendingLoansSummary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pending loans summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
},

/**
 * Get details of a specific pending loan by account number
 */
async getPendingLoanByAccount(req, res) {
  try {
    const { accountNumber } = req.params;

    const loan = await LoanAccount.findOne({
      where: {
        ACCT_NO: accountNumber,
        LOAN_STATUS: 'PENDING'
      },
      attributes: [
        'id',
        ['ACCT_NO', 'account_number'],
        ['ACCT_NM', 'account_name'],
        ['CUST_ID', 'customer_id'],
        ['LOAN_PRODUCT_ID', 'product_id'],
        ['AMOUNT', 'amount'],
        ['INTEREST_RATE', 'interest_rate'],
        ['LOAN_STATUS', 'status'],
        ['SERVICING_STATUS', 'servicing_status'],
        ['APPLICATION_DATE', 'application_date'],
        ['MATURITY_DT', 'maturity_date'],
        ['TERM_CD', 'term_code'],
        ['TERM_VALUE', 'term_value'],
        'hasRepaymentSchedule',
        'repaymentScheduleId',
        ['DISBURSED_AMOUNT', 'disbursed_amount'],
        ['OUTSTANDING_PRINCIPAL', 'outstanding_principal'],
        ['ACCRUED_INTEREST', 'accrued_interest'],
        'created_at',
        'updated_at'
      ],
      include: [
        {
          model: Customer,   // make sure Customer model is imported
          as: 'customer',    // adjust association alias if needed
          attributes: [
            ['CUST_NM', 'customer_name'],
            ['EMAIL_ADDRESS', 'customer_email'],
            ['PHONE_NO', 'customer_phone']
          ],
          required: false    // left join
        },
        {
          model: LoanProduct, // import LoanProduct model
          as: 'product',     // adjust alias
          attributes: [
            ['PRODUCT_NAME', 'product_name'],
            ['PRODUCT_TYPE', 'product_type']
          ],
          required: false    // left join
        }
      ]
    });

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Pending loan not found or loan is not in PENDING status'
      });
    }

    // Convert loan to plain object (Sequelize instance)
    const loanData = loan.toJSON();

    return res.status(200).json({
      success: true,
      data: loanData
    });
  } catch (error) {
    console.error('Error in getPendingLoanByAccount:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch pending loan details',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
},

/**
 * Get pending loans for a specific customer
 */
async getLoanAccountsByCustomerId(req, res) {
  try {
    const { custId } = req.params;

    if (!custId) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID (custId) is required',
        code: 'MISSING_CUST_ID'
      });
    }

    console.log('🔍 Fetching loan accounts for customer:', custId);

    const loanAccounts = await LoanAccount.findAll({
      where: {
        CUST_ID: custId,
        LOAN_STATUS: { 
          [Op.in]: ['ACTIVE', 'APPROVED', 'PENDING', 'DISBURSED', 'CLOSED']
        }
      },
      attributes: [
        'id',
        ['ACCT_NO', 'account_number'],
        ['ACCT_NM', 'account_name'],
        ['LOAN_STATUS', 'status'],
        ['DISBURSED_AMOUNT', 'disbursed_amount'],
        ['OUTSTANDING_PRINCIPAL', 'outstanding_principal'],
        ['INTEREST_RATE', 'interest_rate'],
        ['MATURITY_DT', 'maturity_date'],
        ['APPLICATION_DATE', 'application_date'],
        'created_at'
      ],
      order: [['created_at', 'DESC']]
    });

    if (!loanAccounts || loanAccounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No loan accounts found for this customer',
        code: 'NO_LOAN_ACCOUNTS'
      });
    }

    const totalOutstanding = loanAccounts.reduce((sum, loan) => 
      sum + parseFloat(loan.dataValues.outstanding_principal || 0), 0);
    const totalDisbursed = loanAccounts.reduce((sum, loan) => 
      sum + parseFloat(loan.dataValues.disbursed_amount || 0), 0);

    return res.status(200).json({
      success: true,
      message: `Found ${loanAccounts.length} loan accounts`,
      data: {
        customerId: custId,
        totalActiveLoans: loanAccounts.length,
        totalOutstandingBalance: parseFloat(totalOutstanding.toFixed(2)),
        totalDisbursedAmount: parseFloat(totalDisbursed.toFixed(2)),
        loans: loanAccounts.map(loan => loan.toJSON())
      }
    });
  } catch (error) {
    console.error('❌ Error fetching loan accounts by customer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch loan accounts',
      code: 'FETCH_LOAN_ACCOUNTS_ERROR',
      error: error.message
    });
  }
},

/**
 * Bulk actions on pending loans
 */
async bulkActionPendingLoans(req, res) {
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

    const newStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    // Update loan statuses where current status is 'PENDING' and id is in the list
    const [affectedRows] = await LoanAccount.update(
      { LOAN_STATUS: newStatus, updated_at: new Date() },
      {
        where: {
          id: loanIds,
          LOAN_STATUS: 'PENDING'
        }
      }
    );

    // Log the bulk action (using raw SQL if no model for audit logs)
    // If you have a model like AuditLog or LoanAuditLog, use it instead.
    await sequelize.query(
      `INSERT INTO loan_audit_logs (
        action, loan_ids, reason, performed_by, performed_by_role, created_at
      ) VALUES (?, ?, ?, ?, ?, NOW())`,
      {
        replacements: [action, JSON.stringify(loanIds), reason || '', userId, userRole],
        type: QueryTypes.INSERT
      }
    );

    return res.status(200).json({
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
    return res.status(500).json({
      success: false,
      message: 'Failed to process bulk action',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
},

  // =========================
  // LOAN INFORMATION METHODS
  // =========================

async getLoanAccountByAcctNo(req, res) {
  try {
    const { ACCT_NO } = req.params;

    if (!ACCT_NO || ACCT_NO.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Account number is required'
      });
    }

    const loanAccount = await LoanAccount.findOne({
      where: { ACCT_NO: ACCT_NO.trim() }
    });

    if (!loanAccount) {
      return res.status(404).json({
        success: false,
        message: `Loan account not found: ${ACCT_NO}`
      });
    }

    const loanAccountData = loanAccount.toJSON();
    const responseData = {
      ...loanAccountData,
      workItemId: 129
    };

    return res.status(200).json({
      success: true,
      message: 'Loan account retrieved successfully',
      data: responseData
    });
  } catch (error) {
    console.error('Error in getLoanAccountByAcctNo:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error while fetching loan account',
      error: error.message
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
          [Op.in]: ['ACTIVE', 'APPROVED', 'PENDING', 'DISBURSED', 'CLOSED']
        }
      },
      attributes: [
        'ACCT_NO', 'ACCT_NM', 'LOAN_STATUS', 'DISBURSED_AMOUNT', 
        'OUTSTANDING_PRINCIPAL', 'INTEREST_RATE', 'MATURITY_DT', 'created_at'
      ],
      order: [['created_at', 'DESC']]
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
      return sum + parseFloat(loan.OUTSTANDING_PRINCIPAL || '0');
    }, 0);
    
    const totalDisbursedAmount = loanAccounts.reduce((sum, loan) => {
      return sum + parseFloat(loan.DISBURSED_AMOUNT || '0');
    }, 0);

    const response = {
      success: true,
      message: `Found ${totalActiveLoans} loans`,
      data: {
        customerId: CUST_ID,
        totalActiveLoans,
        totalOutstandingBalance: parseFloat(totalOutstandingBalance.toFixed(2)),
        totalDisbursedAmount: parseFloat(totalDisbursedAmount.toFixed(2))
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

/**
 * Detailed loan balance for customer (with repayment schedules)
 * GET /api/loans/balance/:CUST_ID/detailed
 */
async getLoanBalanceForCustomerDetailed(req, res) {
  try {
    const { CUST_ID } = req.params;
    
    if (!CUST_ID) {
      return res.status(400).json({
        success: false,
        message: 'Customer ID (CUST_ID) is required',
        code: 'MISSING_CUST_ID'
      });
    }

    console.log('🔍 Fetching detailed loan balances for customer:', CUST_ID);

    // ✅ Include OVERDUE status – an overdue loan is still active
    const loanAccounts = await LoanAccount.findAll({
      where: {
        CUST_ID: CUST_ID,
        LOAN_STATUS: { 
          [Op.in]: ['ACTIVE', 'APPROVED', 'PENDING', 'DISBURSED', 'CLOSED', 'OVERDUE']
        }
      },
      attributes: [
        'ACCT_NO', 'ACCT_NM', 'LOAN_STATUS', 'DISBURSED_AMOUNT', 
        'OUTSTANDING_PRINCIPAL', 'INTEREST_RATE', 'MATURITY_DT', 'created_at',
        'accrued_interest'
      ],
      order: [['created_at', 'DESC']]
    });

    if (!loanAccounts || loanAccounts.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No loan accounts found for this customer',
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
      return sum + parseFloat(loan.OUTSTANDING_PRINCIPAL || '0');
    }, 0);
    
    const totalDisbursedAmount = loanAccounts.reduce((sum, loan) => {
      return sum + parseFloat(loan.DISBURSED_AMOUNT || '0');
    }, 0);

    const formattedLoans = loanAccounts.map(loan => ({
      loanAccountNumber: loan.ACCT_NO,
      accountName: loan.ACCT_NM,
      loanStatus: loan.LOAN_STATUS,
      disbursedAmount: Math.abs(parseFloat(loan.DISBURSED_AMOUNT || '0')),
      outstandingPrincipal: Math.abs(parseFloat(loan.OUTSTANDING_PRINCIPAL || '0')),
      interestRate: parseFloat(loan.INTEREST_RATE || '0'),
      startDate: loan.created_at,
      maturityDate: loan.MATURITY_DT,
      accruedInterest: parseFloat(loan.accrued_interest) || 0,
      isActive: ['ACTIVE', 'DISBURSED', 'OVERDUE'].includes(loan.LOAN_STATUS),  // ✅ OVERDUE is active
      isPending: loan.LOAN_STATUS === 'PENDING',
      isApproved: loan.LOAN_STATUS === 'APPROVED',
      isClosed: loan.LOAN_STATUS === 'CLOSED'
    }));

    const activeLoanNumbers = formattedLoans
      .filter(loan => loan.isActive)
      .map(loan => loan.loanAccountNumber);

    // 1. Fetch repayment schedules (if any)
    let repaymentSchedules = [];
    if (activeLoanNumbers.length > 0) {
      repaymentSchedules = await RepaymentSchedule.findAll({
        where: {
          account_number: { [Op.in]: activeLoanNumbers },
          status: 'ACTIVE'
        },
        attributes: ['account_number', 'installments_json', 'total_repayment', 'emi_amount']
      });
    }

    // 2. Fetch loan disbursements (fallback for when repayment schedule is missing)
    let disbursements = [];
    if (activeLoanNumbers.length > 0) {
      disbursements = await LoanDisbursement.findAll({
        where: { accountNumber: { [Op.in]: activeLoanNumbers } },
        attributes: ['accountNumber', 'totalInterest', 'totalRepayment', 'emiAmount', 'repaymentScheduleJson']
      });
    }

    // 3. Build loan details with repayment info
    const loansWithRepaymentInfo = formattedLoans.map(loan => {
      // First, try to find a repayment schedule
      const schedule = repaymentSchedules.find(s => s.account_number === loan.loanAccountNumber);
      let nextPayment = null;
      let totalRepayment = 0;
      let emiAmount = 0;
      let totalInterest = null;

      if (schedule) {
        let installments = [];
        try {
          installments = schedule.installments_json || [];
        } catch (e) {
          console.error(`Error parsing installments for ${loan.loanAccountNumber}:`, e);
        }

        if (installments.length > 0) {
          const nextInstallment = installments.find(inst => 
            inst.status === 'PENDING' || !inst.status
          ) || installments[0];

          nextPayment = {
            dueDate: nextInstallment.dueDate,
            amount: parseFloat(nextInstallment.totalPayment || '0'),
            installmentNumber: nextInstallment.installmentNumber
          };
        }

        totalRepayment = parseFloat(schedule.total_repayment || '0');
        emiAmount = parseFloat(schedule.emi_amount || '0');

        if (totalRepayment > 0 && loan.disbursedAmount > 0) {
          totalInterest = totalRepayment - loan.disbursedAmount;
          totalInterest = totalInterest > 0 ? totalInterest : 0;
        } else {
          totalInterest = 0;
        }
      } else {
        const disbursement = disbursements.find(d => d.accountNumber === loan.loanAccountNumber);
        if (disbursement) {
          totalInterest = parseFloat(disbursement.totalInterest) || 0;
          totalRepayment = parseFloat(disbursement.totalRepayment) || 0;
          emiAmount = parseFloat(disbursement.emiAmount) || 0;

          if (disbursement.repaymentScheduleJson && Array.isArray(disbursement.repaymentScheduleJson)) {
            const nextInstallment = disbursement.repaymentScheduleJson.find(inst => inst.status !== 'PAID');
            if (nextInstallment) {
              nextPayment = {
                dueDate: nextInstallment.dueDate,
                amount: parseFloat(nextInstallment.totalPayment || '0'),
                installmentNumber: nextInstallment.installmentNo
              };
            }
          }
        }
      }

      return {
        ...loan,
        nextPayment,
        totalRepayment,
        emiAmount,
        totalInterest,
        remainingBalance: loan.outstandingPrincipal
      };
    });

    const response = {
      success: true,
      data: {
        customerId: CUST_ID,
        summary: {
          totalActiveLoans: totalActiveLoans,   // all returned loans (including OVERDUE)
          totalOutstandingBalance: parseFloat(totalOutstandingBalance.toFixed(2)),
          totalDisbursedAmount: parseFloat(totalDisbursedAmount.toFixed(2)),
          totalPendingLoans: formattedLoans.filter(loan => loan.isPending).length,
          totalApprovedLoans: formattedLoans.filter(loan => loan.isApproved).length,
          totalClosedLoans: formattedLoans.filter(loan => loan.isClosed).length
        },
        loans: loansWithRepaymentInfo
      }
    };

    console.log(`✅ Detailed: Found ${totalActiveLoans} loan accounts for customer ${CUST_ID}`);
    return res.status(200).json(response);

  } catch (error) {
    console.error('❌ Error fetching detailed loan balances:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch detailed loan balances',
      code: 'FETCH_DETAILED_LOAN_BALANCE_ERROR',
      error: error.message
    });
  }
},
  // =========================
  // OTHER METHODS (getPendingLoans, getAllLoans, etc.)
  // =========================
  // ... keep your other methods unchanged



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
          customerName: (loan.customerAccount && loan.customerAccount.customer_name),
          amount: repaymentStatus.totalOutstanding,
          daysOverdue: repaymentStatus.daysOverdue,
          delinquencyLevel: repaymentStatus.delinquencyLevel
        });
      } else if (repaymentStatus.isOverdue) {
        categories.overdue.push({
          accountNo: loan.ACCT_NO,
          customerName: (loan.customerAccount && loan.customerAccount.customer_name),
          amount: repaymentStatus.totalOutstanding,
          daysOverdue: repaymentStatus.daysOverdue
        });
      } else if (repaymentStatus.status === 'DUE_TODAY') {
        categories.dueToday.push({
          accountNo: loan.ACCT_NO,
          customerName: (loan.customerAccount && loan.customerAccount.customer_name),
          amountDue: repaymentStatus.amountDue
        });
      } else if (repaymentStatus.status === 'DUE_SOON') {
        categories.dueSoon.push({
          accountNo: loan.ACCT_NO,
          customerName: (loan.customerAccount && loan.customerAccount.customer_name),
          amountDue: repaymentStatus.amountDue,
          daysUntilDue: repaymentStatus.schedule && repaymentStatus.schedule.nextRepaymentDate ? 
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

async getLoansDisbursedByUser(req, res) {
  try {
    const { userId } = req.params;
    const { startDate, endDate, status } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    // Build where clause - Include multiple statuses
    let whereClause = {
      CREATED_BY: userId
    };
    
    // If status parameter is provided, use it
    if (status && status !== 'ALL') {
      whereClause.LOAN_STATUS = status;
    } else {
      // Default: include PENDING, APPROVED, and DISBURSED
      whereClause.LOAN_STATUS = {
        [Op.in]: ['PENDING', 'APPROVED', 'DISBURSED', 'ACTIVE']
      };
    }
    
    // Date range filter for application date or disbursement date
    if (startDate || endDate) {
      whereClause.createdAt = {};
      if (startDate) {
        whereClause.createdAt[Op.gte] = new Date(startDate);
      }
      if (endDate) {
        whereClause.createdAt[Op.lte] = new Date(endDate);
      }
    }
    
    console.log('Executing query for userId:', userId, 'status filter:', status);
    
    const loans = await LoanAccount.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      raw: true
    });
    
    // Calculate summary
    const summary = {
      totalLoans: loans.length,
      totalAmount: loans.reduce((sum, loan) => sum + (parseFloat(loan.AMOUNT) || 0), 0),
      totalDisbursedAmount: loans
        .filter(loan => loan.LOAN_STATUS === 'DISBURSED')
        .reduce((sum, loan) => sum + (parseFloat(loan.AMOUNT) || 0), 0),
      totalOutstanding: loans.reduce((sum, loan) => sum + (parseFloat(loan.OUTSTANDING_PRINCIPAL) || 0), 0),
      averageLoanAmount: loans.length > 0 ? 
        loans.reduce((sum, loan) => sum + (parseFloat(loan.AMOUNT) || 0), 0) / loans.length : 0,
      byStatus: {
        pending: loans.filter(l => l.LOAN_STATUS === 'PENDING').length,
        approved: loans.filter(l => l.LOAN_STATUS === 'APPROVED').length,
        disbursed: loans.filter(l => l.LOAN_STATUS === 'DISBURSED').length,
        active: loans.filter(l => l.LOAN_STATUS === 'ACTIVE').length
      }
    };
    
    return res.status(200).json({
      success: true,
      message: `Loans processed by ${userId} retrieved successfully`,
      data: {
        userId,
        summary,
        loans: loans.map(loan => ({
          id: loan.id,
          accountNumber: loan.ACCT_NO,
          accountName: loan.ACCT_NM,
          customerId: loan.CUST_ID,
          amount: parseFloat(loan.AMOUNT),
          disbursedAmount: parseFloat(loan.DISBURSED_AMOUNT) || 0,
          outstandingPrincipal: parseFloat(loan.OUTSTANDING_PRINCIPAL) || 0,
          interestRate: parseFloat(loan.INTEREST_RATE),
          status: loan.LOAN_STATUS,
          servicingStatus: loan.SERVICING_STATUS,
          applicationDate: loan.APPLICATION_DATE,
          disbursementDate: loan.DISBURSEMENT_DATE,
          maturityDate: loan.MATURITY_DT,
          term: {
            code: loan.TERM_CD,
            value: loan.TERM_VALUE
          },
          guarantorId: loan.GUARANTOR_ID,
          guaranteedAmount: parseFloat(loan.GUARANTEED_AMOUNT) || 0,
          createdAt: loan.createdAt,
          createdBy: loan.CREATED_BY
        })),
        count: loans.length
      }
    });
    
  } catch (error) {
    console.error('Error in getLoansDisbursedByUser:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch loans',
      error: error.message
    });
  }
},
  
  // Get statistics for loans disbursed by user
async getLoansByUserAndStatus(req, res) {
  try {
    const { userId } = req.params;
    const { status = 'ALL' } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    let whereClause = { CREATED_BY: userId };
    
    if (status !== 'ALL') {
      whereClause.LOAN_STATUS = status;
    }
    
    const loans = await LoanAccount.findAll({
      where: whereClause,
      order: [['createdAt', 'DESC']],
      raw: true
    });
    
    return res.status(200).json({
      success: true,
      data: {
        userId,
        status: status,
        loans: loans,
        count: loans.length
      }
    });
    
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
},


// Alternative: Get loans by CREATED_BY from loan_disbursements table
async getLoansDisbursedByUserFromDisbursements(req, res) {
  try {
    const { userId } = req.params;
    const { startDate, endDate } = req.query;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    let whereClause = {
      CREATED_BY: userId,
      STATUS: 'DISBURSED'
    };
    
    if (startDate || endDate) {
      whereClause.created_at = {};
      if (startDate) whereClause.created_at[Op.gte] = new Date(startDate);
      if (endDate) whereClause.created_at[Op.lte] = new Date(endDate);
    }
    
    const disbursements = await LoanDisbursement.findAll({
      where: whereClause,
      order: [['created_at', 'DESC']],
      include: [
        {
          model: LoanAccount,
          as: 'loanAccount',
          attributes: ['id', 'a_c_c_t__n_o', 'a_c_c_t__n_m', 'a_m_o_u_n_t', 'l_o_a_n__s_t_a_t_u_s']
        },
        {
          model: Customer,
          as: 'customer',
          attributes: ['CUST_ID', 'CUST_NM', 'FIRST_NAME', 'LAST_NAME']
        }
      ]
    });
    
    const summary = {
      totalDisbursements: disbursements.length,
      totalAmount: disbursements.reduce((sum, d) => sum + (parseFloat(d.AMOUNT) || 0), 0)
    };
    
    return res.status(200).json({
      success: true,
      data: {
        userId,
        summary,
        disbursements,
        count: disbursements.length
      }
    });
    
  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch disbursements',
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

console.log('Controller methods:', Object.keys(LoanAccountController));
export default LoanAccountController;