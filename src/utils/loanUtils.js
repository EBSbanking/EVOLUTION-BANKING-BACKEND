// utils/loanUtils.js
import { Op } from 'sequelize';

/**
 * Checks if a year is a leap year
 * @param {number} year - The year to check
 * @returns {boolean} - True if leap year, false otherwise
 */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Map term codes to single letters
 * @param {string} termCode - The term code (full word or single letter)
 * @returns {string} - Mapped single letter code
 */
export const mapTermCodeToLetter = (termCode) => {
  const code = String(termCode).toUpperCase().trim();
  
  const termCodeMap = {
    'DAYS': 'D',
    'DAY': 'D',
    'WEEKS': 'W',
    'WEEK': 'W',
    'BIWEEKLY': 'BW',
    'BI_WEEKLY': 'BW',
    'MONTHS': 'M',
    'MONTH': 'M',
    'QUARTERS': 'Q',
    'QUARTER': 'Q',
    'YEARS': 'Y',
    'YEAR': 'Y'
  };
  
  if (termCodeMap[code]) {
    return termCodeMap[code];
  }
  
  const validTermCodes = ['D', 'W', 'BW', 'M', 'Q', 'Y'];
  if (validTermCodes.includes(code)) {
    return code;
  }
  
  const firstChar = code.charAt(0);
  const validFirstChars = ['D', 'W', 'M', 'Q', 'Y'];
  if (validFirstChars.includes(firstChar)) {
    console.log(`🔄 Using first character as term code: ${code} → ${firstChar}`);
    return firstChar;
  }
  
  console.log(`⚠️ Unknown term code '${code}', defaulting to 'M' (Months)`);
  return 'M';
};

/**
 * Validates and normalizes a term code
 * @param {string} termCode - The term code to validate
 * @param {boolean} strict - If true, throw error on invalid; if false, default to 'M'
 * @returns {string} - Validated and normalized term code
 * @throws {Error} - If term code is invalid and strict mode is true
 */
export const validateTermCode = (termCode, strict = false) => {
  const code = String(termCode).toUpperCase().trim();
  const validTermCodes = ['D', 'W', 'BW', 'M', 'Q', 'Y'];
  const termCodeMap = {
    'DAYS': 'D',
    'DAY': 'D',
    'WEEKS': 'W',
    'WEEK': 'W',
    'BIWEEKLY': 'BW',
    'BI_WEEKLY': 'BW',
    'MONTHS': 'M',
    'MONTH': 'M',
    'QUARTERS': 'Q',
    'QUARTER': 'Q',
    'YEARS': 'Y',
    'YEAR': 'Y'
  };
  
  // Check if it's a mapped full word
  if (termCodeMap[code]) {
    return termCodeMap[code];
  }
  
  // Check if it's already a valid single letter
  if (validTermCodes.includes(code)) {
    return code;
  }
  
  // Try to use first character
  const firstChar = code.charAt(0);
  const validFirstChars = ['D', 'W', 'M', 'Q', 'Y'];
  if (validFirstChars.includes(firstChar)) {
    if (firstChar === 'B') {
      // Check if it might be 'BW'
      if (code.startsWith('BW')) return 'BW';
      return 'M'; // Default if ambiguous
    }
    return firstChar;
  }
  
  // 🔧 FIX: If strict mode, throw error; otherwise return default 'M'
  if (strict) {
    throw new Error(`Invalid term code: ${termCode}. Valid codes are: ${validTermCodes.join(', ')}`);
  }
  
  console.warn(`⚠️ Invalid term code: "${termCode}", defaulting to "M" (Months)`);
  return 'M';
};

/**
 * Map term code to full word for display
 * @param {string} termCode - The term code
 * @returns {string} - Full word representation
 */
export const mapTermCodeToFullWord = (termCode) => {
  const code = mapTermCodeToLetter(termCode);
  const map = { 
    'D': 'DAYS', 
    'W': 'WEEKS', 
    'BW': 'BI_WEEKS', 
    'M': 'MONTHS', 
    'Q': 'QUARTERS', 
    'Y': 'YEARS' 
  };
  return map[code] || 'MONTHS';
};

/**
 * Map term code to payment frequency
 * @param {string} termCode - The term code
 * @returns {string} - Payment frequency
 */
export const mapTermCodeToFrequency = (termCode) => {
  const code = mapTermCodeToLetter(termCode);
  const map = {
    'D': 'DAILY',
    'W': 'WEEKLY',
    'BW': 'BI_WEEKLY',
    'M': 'MONTHLY',
    'Q': 'QUARTERLY',
    'Y': 'ANNUALLY'
  };
  return map[code] || 'MONTHLY';
};

/**
 * Converts term to months
 * @param {number} value - The term value
 * @param {string} termCode - The term code
 * @returns {number} - Term in months
 */
export const convertTermToMonths = (value, termCode) => {
  const code = mapTermCodeToLetter(termCode);
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

/**
 * Gets total payments for frequency
 * @param {number} termValue - The term value
 * @param {string} termCode - The term code
 * @param {string} paymentFrequency - The payment frequency
 * @returns {number} - Total number of payments
 */
export const getTotalPaymentsForFrequency = (termValue, termCode, paymentFrequency) => {
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

/**
 * Calculates the maturity date based on disbursement date and loan term
 * @param {Date|string} startDate - The loan start date
 * @param {string|number} termCode - Term code ('D', 'W', 'M', 'Q', 'Y') or full word
 * @param {number} termValue - The term value (number of periods)
 * @returns {Date} - The calculated maturity date
 */
export const calculateMaturityDate = (startDate, termCode, termValue) => {
  const date = new Date(startDate);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid start date');
  }

  let term = validateTermCode(termCode);
  const value = Number(termValue);
  if (isNaN(value)) throw new Error('Invalid term value');

  console.log(`📅 Calculating maturity date: termCode=${termCode} → ${term}, termValue=${value}`);

  switch (term) {
    case 'D':
      date.setDate(date.getDate() + value);
      break;
    case 'W':
      date.setDate(date.getDate() + value * 7);
      break;
    case 'BW':
      date.setDate(date.getDate() + value * 14);
      break;
    case 'M':
      const originalDate = date.getDate();
      date.setMonth(date.getMonth() + value);
      if (date.getDate() !== originalDate) {
        date.setDate(0);
      }
      break;
    case 'Q':
      date.setMonth(date.getMonth() + value * 3);
      break;
    case 'Y':
      date.setFullYear(date.getFullYear() + value);
      if (date.getMonth() === 1 && date.getDate() === 29 && !isLeapYear(date.getFullYear())) {
        date.setDate(28);
      }
      break;
    default:
      throw new Error(`Unsupported term code: ${term}`);
  }
  return date;
};

/**
 * Get term description
 * @param {string} termCode - The term code
 * @returns {string} - Term description
 */
export const getTermDescription = (termCode) => {
  const code = mapTermCodeToLetter(termCode);
  switch (code) {
    case 'D': return 'Days';
    case 'W': return 'Weeks';
    case 'BW': return 'Bi-Weeks';
    case 'M': return 'Months';
    case 'Q': return 'Quarters';
    case 'Y': return 'Years';
    default: return 'Months';
  }
};

/**
 * Convert term code to frequency
 * @param {string} termCode - The term code
 * @returns {string} - Payment frequency
 */
export const convertTermCodeToFrequency = (termCode) => {
  const code = mapTermCodeToLetter(termCode);
  switch (code) {
    case 'D': return 'DAILY';
    case 'W': return 'WEEKLY';
    case 'BW': return 'BI_WEEKLY';
    case 'M': return 'MONTHLY';
    case 'Q': return 'QUARTERLY';
    case 'Y': return 'YEARLY';
    default: throw new Error(`Invalid term code: ${termCode}`);
  }
};

/**
 * Generate a unique collection ID
 * Format: COL-YYYYMMDD-HHMMSS-RANDOM
 * @returns {string} Collection ID
 */
export function generateCollectionId() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

  return `COL-${year}${month}${day}-${hours}${minutes}${seconds}-${random}`;
}

/**
 * Generate a unique credit application ID
 * Format: CRAPP/YYYYMMDD-RANDOM
 * @returns {Promise<string>}
 */
export const generateUniqueCreditApplicationId = async () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `CRAPP/${year}${month}${day}-${random}`;
};

/**
 * Generate a unique transaction reference for collections
 * Format: REPAY-YYYYMMDD-RANDOM
 * @param {string} prefix - Optional prefix (default: 'REPAY')
 * @returns {string} Transaction reference
 */
export function generateCollectionTransactionRef(prefix = 'REPAY') {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');

  return `${prefix}-${year}${month}${day}-${random}`;
}

/**
 * Generate a unique loan account number
 * @returns {string} - Loan account number
 */
export const generateLoanAccountNumber = () => {
  const randomDigits = Math.floor(100000000 + Math.random() * 900000000);
  return `300${randomDigits}`;
};

/**
 * Generate transaction IDs for loan transactions
 * @returns {Object} Transaction IDs
 */
export function generateTransactionIds() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000000).toString().padStart(7, '0');

  return {
    TRANSACTION_ID: `TXN-${timestamp}-${random}`,
    EVENT_ID: `EVT-${timestamp}-${random}`,
    TRAN_JOURNAL_ID: `JRN-${timestamp}-${random}`,
    transactionId: `TX-${timestamp}-${random}`,
    JOURNAL_ID: `JNL-${timestamp}-${random}`,
    TRANSACTION_IDENTIFIER: `TRX-${timestamp}-${random}`,
    REFERENCE: `REF-${timestamp}-${random.substr(0, 6)}`
  };
}

/**
 * Calculate interest for a loan (daily basis)
 * @param {Number} principal - Loan principal
 * @param {Number} interestRate - Annual interest rate (percentage)
 * @param {Number} days - Number of days
 * @returns {Number} Interest amount
 */
export function calculateInterest(principal, interestRate, days) {
  if (!principal || !interestRate || !days) return 0;
  const dailyRate = interestRate / 100 / 365;
  return parseFloat((principal * dailyRate * days).toFixed(2));
}

/**
 * Calculate EMI (Equated Monthly Installment)
 * @param {Number} principal - Loan amount
 * @param {Number} annualRate - Annual interest rate (percentage)
 * @param {Number} months - Loan term in months
 * @returns {Number} EMI amount
 */
export function calculateEMI(principal, annualRate, months) {
  if (!principal || !annualRate || !months) return 0;
  const monthlyRate = annualRate / 100 / 12;
  const emi =
    (principal * monthlyRate * Math.pow(1 + monthlyRate, months)) /
    (Math.pow(1 + monthlyRate, months) - 1);
  return parseFloat(emi.toFixed(2));
}

/**
 * Generate a unique receipt number for loan repayments
 * @returns {string} Receipt number
 */
export function generateReceiptNumber() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `RCPT-${timestamp}-${random}`;
}

/**
 * Validate loan payment data
 * @param {Object} paymentData - Payment data to validate
 * @returns {Object} Validation result {isValid: boolean, errors: string[]}
 */
export function validateLoanPayment(paymentData) {
  const errors = [];

  if (!paymentData.amount || isNaN(paymentData.amount) || paymentData.amount <= 0) {
    errors.push('Valid payment amount is required');
  }

  if (!paymentData.customerAccountNo) {
    errors.push('Customer account number is required');
  }

  if (paymentData.paymentDate && isNaN(new Date(paymentData.paymentDate).getTime())) {
    errors.push('Invalid payment date');
  }

  const validPaymentMethods = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'CASH_DEPOSIT', 'MANUAL'];
  if (paymentData.paymentMethod && !validPaymentMethods.includes(paymentData.paymentMethod.toUpperCase())) {
    errors.push(`Invalid payment method. Valid methods are: ${validPaymentMethods.join(', ')}`);
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Format amount for display
 * @param {Number} amount - Amount to format
 * @param {String} currency - Currency code (default: 'NGN')
 * @returns {String} Formatted amount
 */
export function formatAmount(amount, currency = 'NGN') {
  if (isNaN(amount)) return '0.00';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Calculate total loan cost
 * @param {Number} principal - Loan principal
 * @param {Number} annualRate - Annual interest rate (%)
 * @param {Number} termMonths - Loan term in months
 * @returns {Object} Total cost breakdown
 */
export function calculateTotalLoanCost(principal, annualRate, termMonths) {
  const emi = calculateEMI(principal, annualRate, termMonths);
  const totalRepayment = emi * termMonths;
  const totalInterest = totalRepayment - principal;

  return {
    principal,
    totalInterest: parseFloat(totalInterest.toFixed(2)),
    totalRepayment: parseFloat(totalRepayment.toFixed(2)),
    emi,
    interestPercentage: ((totalInterest / principal) * 100).toFixed(2)
  };
}

/**
 * ============================================
 * ✅ GENERATE REPAYMENT SCHEDULE - FIXED
 * ============================================
 */

/**
 * Generates a repayment schedule for a loan
 * @param {Object} options - Schedule options
 * @param {number} options.principal - Loan principal amount
 * @param {number} options.interestRate - Annual interest rate (%)
 * @param {number} options.termValue - Term value
 * @param {string} options.termCode - Term code ('D', 'W', 'M', 'Q', 'Y')
 * @param {string} options.loanAccountNo - Loan account number
 * @param {Date|string} options.startDate - Start date
 * @param {Object} options.options - Additional options (gracePeriod, balloonPayment, rateChanges)
 * @returns {Array} - Repayment schedule array
 */
export const generateRepaymentSchedule = (
  principal,
  annualInterestRate,
  termValue,
  termCode,
  loanAccountNo,
  startDate = new Date(),
  options = {}
) => {
  const {
    gracePeriod = 0,
    balloonPayment = 0,
    rateChanges = []
  } = options;

  if (principal <= 0) throw new Error('Loan amount must be positive');
  if (annualInterestRate < 0) throw new Error('Interest rate cannot be negative');
  if (termValue <= 0) throw new Error('Term value must be positive');

  const term = mapTermCodeToLetter(termCode);
  const validTermCodes = ['D', 'W', 'BW', 'M', 'Q', 'Y'];
  if (!validTermCodes.includes(term)) {
    throw new Error(`Invalid term code: ${term}. Valid codes are: ${validTermCodes.join(', ')}`);
  }

  let paymentDate = new Date(startDate);
  if (isNaN(paymentDate.getTime())) throw new Error('Invalid start date');

  let termInMonths = 0;
  switch (term) {
    case 'D': termInMonths = Math.round(termValue / 30); break;
    case 'W': termInMonths = termValue * 4; break;
    case 'BW': termInMonths = termValue * 2; break;
    case 'M': termInMonths = termValue; break;
    case 'Q': termInMonths = termValue * 3; break;
    case 'Y': termInMonths = termValue * 12; break;
    default: throw new Error('Unsupported term code');
  }

  const schedule = [];
  let remainingPrincipal = principal;

  const adjustedPrincipal = principal - balloonPayment;
  let monthlyInterestRate = annualInterestRate / 100 / 12;
  let monthlyPayment = adjustedPrincipal * monthlyInterestRate /
    (1 - Math.pow(1 + monthlyInterestRate, -(termInMonths - gracePeriod)));

  if (isNaN(monthlyPayment) || monthlyPayment <= 0) {
    monthlyPayment = 0;
  }

  for (let i = 1; i <= termInMonths; i++) {
    const rateChange = rateChanges.find(rc => rc.installmentNumber === i);
    if (rateChange) {
      monthlyInterestRate = rateChange.newAnnualRate / 100 / 12;
      const remainingInstallments = termInMonths - i + 1 - Math.max(0, gracePeriod - i + 1);
      if (remainingInstallments > 0) {
        monthlyPayment = remainingPrincipal * monthlyInterestRate /
          (1 - Math.pow(1 + monthlyInterestRate, -remainingInstallments));
      }
    }

    // Determine increment based on term
    const incrementDays = term === 'D' ? 1 : term === 'W' ? 7 : term === 'BW' ? 14 : term === 'M' ? 30 : term === 'Q' ? 90 : 365;
    paymentDate = new Date(paymentDate);
    paymentDate.setDate(paymentDate.getDate() + incrementDays);

    const interestDue = remainingPrincipal * monthlyInterestRate;
    let principalDue = 0;
    let totalPayment = interestDue;

    if (i > gracePeriod) {
      principalDue = monthlyPayment - interestDue;
      totalPayment = monthlyPayment;
    }

    remainingPrincipal = Math.max(0, remainingPrincipal - principalDue);

    const isFinal = i === termInMonths;
    if (isFinal && balloonPayment > 0) {
      principalDue += balloonPayment;
      totalPayment += balloonPayment;
      remainingPrincipal = 0;
    }

    schedule.push({
      installmentNumber: i,
      dueDate: new Date(paymentDate),
      principal: parseFloat(principalDue.toFixed(2)),
      interest: parseFloat(interestDue.toFixed(2)),
      totalPayment: parseFloat(totalPayment.toFixed(2)),
      remainingBalance: parseFloat(remainingPrincipal.toFixed(2)),
      loanAccountNo,
      paymentFrequency: term,
      isFinalInstallment: isFinal,
      status: 'PENDING',
      amountPaid: 0,
      interestPaid: 0,
      principalPaid: 0,
      createdDate: new Date()
    });
  }

  return schedule;
};

/**
 * Determine if a column exists and get its properties
 * @param {Object} sequelize - Sequelize instance
 * @param {string} tableName - Table name to check
 * @param {string} columnName - Column name to check
 * @param {Object} transaction - Sequelize transaction
 * @returns {Promise<Object>} Column info
 */
export async function getColumnInfo(sequelize, tableName, columnName = 'collection_id', transaction = null) {
  try {
    const result = await sequelize.query(
      `SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
      {
        replacements: [tableName, columnName],
        transaction,
        type: sequelize.QueryTypes.SELECT
      }
    );
    if (result && result.length > 0) {
      const column = result[0];
      return {
        exists: true,
        dataType: column.DATA_TYPE,
        isNullable: column.IS_NULLABLE === 'YES',
        hasDefault: column.COLUMN_DEFAULT !== null
      };
    }
    return {
      exists: false,
      dataType: null,
      isNullable: false,
      hasDefault: false
    };
  } catch (error) {
    console.error('Error getting column info:', error.message);
    return {
      exists: false,
      dataType: null,
      isNullable: false,
      hasDefault: false
    };
  }
}

/**
 * Process loan payment against repayment schedule
 */
export async function processPaymentAgainstSchedule(repaymentSchedule, amount, paymentDate, loanAccount, transaction = null) {
  const toDecimal = (value) => {
    if (value === null || value === undefined || value === '') return 0.00;
    const num = parseFloat(value);
    return isNaN(num) ? 0.00 : parseFloat(num.toFixed(2));
  };

  const installmentsJson = repaymentSchedule.installments_json;
  let schedule = installmentsJson ? (typeof installmentsJson === 'string' ? JSON.parse(installmentsJson) : installmentsJson) : [];

  const paymentDateTime = new Date(paymentDate);
  let remainingAmount = toDecimal(amount);
  let totalPrincipalPaid = 0;
  let totalInterestPaid = 0;
  let installmentsUpdated = 0;
  const detailedInstallmentsUpdated = [];

  let currentOutstanding = Math.abs(toDecimal(loanAccount.OUTSTANDING_PRINCIPAL || 0));
  let previousOutstanding = currentOutstanding;

  schedule.forEach((inst, idx) => {
    inst.installmentNo = inst.installmentNo || idx + 1;
    inst.amountPaid = toDecimal(inst.amountPaid);
    inst.interestPaid = toDecimal(inst.interestPaid);
    inst.principalPaid = toDecimal(inst.principalPaid);
    inst.status = inst.status || 'PENDING';
    inst.remainingBalance = toDecimal(inst.remainingBalance || currentOutstanding);

    if (inst.status === 'PENDING' && inst.dueDate && new Date(inst.dueDate) < paymentDateTime) {
      inst.status = 'OVERDUE';
    }
  });

  schedule.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  for (const inst of schedule) {
    if (remainingAmount <= 0) break;
    if (inst.status === 'PAID') continue;

    const totalDue = toDecimal(inst.totalPayment);
    const paidSoFar = toDecimal(inst.amountPaid);
    const remainingDue = totalDue - paidSoFar;
    if (remainingDue <= 0) continue;

    const payThisInst = Math.min(remainingAmount, remainingDue);

    const remainingInterest = toDecimal(inst.interest) - toDecimal(inst.interestPaid);
    const remainingPrincipalDue = toDecimal(inst.principal) - toDecimal(inst.principalPaid);

    let interestThis = Math.min(payThisInst, remainingInterest);
    let principalThis = payThisInst - interestThis;
    if (principalThis > remainingPrincipalDue) {
      principalThis = remainingPrincipalDue;
    }

    inst.amountPaid += interestThis + principalThis;
    inst.interestPaid += interestThis;
    inst.principalPaid += principalThis;
    inst.remainingBalance = Math.max(0, inst.remainingBalance - principalThis);

    inst.status = inst.amountPaid >= totalDue ? 'PAID' : inst.amountPaid > 0 ? 'PARTIAL' : inst.status;

    totalInterestPaid += interestThis;
    totalPrincipalPaid += principalThis;
    remainingAmount -= interestThis + principalThis;
    installmentsUpdated++;

    detailedInstallmentsUpdated.push({
      installmentNo: inst.installmentNo,
      dueDate: inst.dueDate,
      amountPaid: interestThis + principalThis,
      principalPaid: principalThis,
      interestPaid: interestThis,
      status: inst.status,
      previousBalance: previousOutstanding,
      newBalance: inst.remainingBalance
    });

    previousOutstanding = inst.remainingBalance;
  }

  const newOutstanding = -Math.max(0, previousOutstanding);
  const isFinalPayment = schedule.every(i => i.status === 'PAID');

  return {
    updatedSchedule: schedule,
    totalPrincipalPaid,
    totalInterestPaid,
    previousOutstanding: Math.abs(newOutstanding + totalPrincipalPaid),
    newOutstanding: Math.abs(newOutstanding),
    isFinalPayment,
    installmentsUpdated,
    detailedInstallmentsUpdated,
    remainingAmount
  };
}

/**
 * Create or get collection record
 */
export async function createOrGetCollection(sequelize, options = {}, transaction = null) {
  const {
    amount = 0,
    paymentMethod = 'CASH',
    referenceNumber,
    createdBy = 'SYSTEM',
    currency = 'NGN',
    branch = 1,
    channel = 6,
    repaymentType = 'loan_repayment'
  } = options;

  try {
    const tableStructure = await sequelize.query(
      `DESCRIBE collections`,
      { transaction, type: sequelize.QueryTypes.SELECT }
    );

    const columns = tableStructure.map(col => col.Field);
    const hasId = columns.includes('id');
    const hasCollectionId = columns.includes('collection_id');
    const hasStatus = columns.includes('status');
    const hasCollectionDate = columns.includes('collection_date');

    let collectionId = null;
    let collectionIdType = null;
    let isNew = false;

    if (hasStatus) {
      const existing = await sequelize.query(
        `SELECT ${hasId ? 'id' : hasCollectionId ? 'collection_id' : '1'} as collectionId 
         FROM collections WHERE status = 'active' LIMIT 1`,
        { transaction, type: sequelize.QueryTypes.SELECT }
      );

      if (existing.length > 0) {
        collectionId = existing[0].collectionId;
        collectionIdType = hasId ? 'id' : 'collection_id';
      }
    }

    if (!collectionId) {
      isNew = true;
      const insertColumns = [];
      const insertValues = [];

      if (hasCollectionId && !hasId) {
        const generatedId = generateCollectionId();
        insertColumns.push('collection_id');
        insertValues.push(generatedId);
        collectionId = generatedId;
        collectionIdType = 'collection_id';
      }

      if (columns.includes('amount')) {
        insertColumns.push('amount');
        insertValues.push(amount);
      }

      if (hasCollectionDate) {
        insertColumns.push('collection_date');
        insertValues.push(new Date());
      }

      if (hasStatus) {
        insertColumns.push('status');
        insertValues.push('active');
      }

      const optional = {
        currency,
        repayment_type: repaymentType,
        branch,
        channel,
        payment_method: paymentMethod,
        transaction_reference: referenceNumber || generateCollectionTransactionRef(),
        created_by: createdBy,
        group_id: 1
      };

      Object.entries(optional).forEach(([col, val]) => {
        if (columns.includes(col)) {
          insertColumns.push(col);
          insertValues.push(val);
        }
      });

      if (columns.includes('created_at')) {
        insertColumns.push('created_at');
        insertValues.push(new Date());
      }
      if (columns.includes('updated_at')) {
        insertColumns.push('updated_at');
        insertValues.push(new Date());
      }

      if (insertColumns.length > 0) {
        const query = `INSERT INTO collections (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`;
        await sequelize.query(query, { replacements: insertValues, transaction });

        if (hasId && !hasCollectionId) {
          const [{ id }] = await sequelize.query('SELECT LAST_INSERT_ID() as id', {
            transaction,
            type: sequelize.QueryTypes.SELECT
          });
          collectionId = id;
          collectionIdType = 'id';
        }
      } else {
        collectionId = generateCollectionId();
        collectionIdType = 'string';
      }
    }

    return { collectionId, collectionIdType, created: isNew };
  } catch (error) {
    console.error('Error in createOrGetCollection:', error.message);
    return {
      collectionId: generateCollectionId(),
      collectionIdType: 'string',
      created: false,
      error: error.message
    };
  }
}

// ============================================
// ✅ DEFAULT EXPORT - Includes all functions
// ============================================

export default {
  // Term code utilities
  mapTermCodeToLetter,
  validateTermCode,
  mapTermCodeToFullWord,
  mapTermCodeToFrequency,
  convertTermToMonths,
  getTotalPaymentsForFrequency,
  calculateMaturityDate,
  getTermDescription,
  convertTermCodeToFrequency,
  
  // Generation utilities
  generateCollectionId,
  generateUniqueCreditApplicationId,
  generateCollectionTransactionRef,
  generateLoanAccountNumber,
  generateTransactionIds,
  generateReceiptNumber,
  
  // ✅ REPAYMENT SCHEDULE - FIXED EXPORT
  generateRepaymentSchedule,
  
  // Calculation utilities
  calculateInterest,
  calculateEMI,
  calculateTotalLoanCost,
  
  // Validation and formatting
  validateLoanPayment,
  formatAmount,
  
  // Database utilities
  getColumnInfo,
  processPaymentAgainstSchedule,
  createOrGetCollection,
  
  // Utility
  isLeapYear
};