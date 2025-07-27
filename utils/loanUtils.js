// utils/loanUtils.js

/**
 * Checks if a year is a leap year
 * @param {number} year - The year to check
 * @returns {boolean} - True if leap year, false otherwise
 */
function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Calculates the maturity date based on disbursement date and loan term
 * @param {Date|string} startDate - The loan start date
 * @param {number} termValue - The term value (number of periods)
 * @param {string} termCode - Term code ('D', 'W', 'M', 'Q', 'Y')
 * @returns {Date} - The calculated maturity date
 */
export const calculateMaturityDate = (startDate, termValue, termCode) => {
  const date = new Date(startDate);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid start date');
  }

  const term = termCode.toUpperCase();
  const validTermCodes = ['D', 'W', 'M', 'Q', 'Y'];
  if (!validTermCodes.includes(term)) {
    throw new Error(`Invalid term code: ${term}. Valid codes are: ${validTermCodes.join(', ')}`);
  }

  switch (term) {
    case 'D': date.setDate(date.getDate() + termValue); break;
    case 'W': date.setDate(date.getDate() + (termValue * 7)); break;
    case 'M':
      const originalDate = date.getDate();
      date.setMonth(date.getMonth() + termValue);
      if (date.getDate() !== originalDate) date.setDate(0);
      break;
    case 'Q': date.setMonth(date.getMonth() + (termValue * 3)); break;
    case 'Y':
      date.setFullYear(date.getFullYear() + termValue);
      if (date.getMonth() === 1 && date.getDate() === 29 && !isLeapYear(date.getFullYear())) {
        date.setDate(28);
      }
      break;
  }
  return date;
};

/**
 * Generates a complete repayment schedule (reducing method)
 * Supports: grace period, balloon payments, rate changes
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

  const term = termCode.toUpperCase();
  const validTermCodes = ['D', 'W', 'M', 'Q', 'Y'];
  if (!validTermCodes.includes(term)) {
    throw new Error(`Invalid term code: ${term}. Valid codes are: ${validTermCodes.join(', ')}`);
  }

  let paymentDate = new Date(startDate);
  if (isNaN(paymentDate.getTime())) throw new Error('Invalid start date');

  let termInMonths;
  switch (term) {
    case 'D': termInMonths = termValue / 30; break;
    case 'W': termInMonths = termValue / 4; break;
    case 'M': termInMonths = termValue; break;
    case 'Q': termInMonths = termValue * 3; break;
    case 'Y': termInMonths = termValue * 12; break;
    default: termInMonths = termValue;
  }

  const schedule = [];
  let remainingPrincipal = principal;

  // Calculate regular reducing EMI (excluding balloon)
  const adjustedPrincipal = principal - balloonPayment;
  let monthlyInterestRate = annualInterestRate / 100 / 12;
  let monthlyPayment = adjustedPrincipal * monthlyInterestRate /
    (1 - Math.pow(1 + monthlyInterestRate, -(termInMonths - gracePeriod)));

  for (let i = 1; i <= termInMonths; i++) {
    // Handle dynamic rate changes
    const rateChange = rateChanges.find(r => r.installmentNumber === i);
    if (rateChange) {
      monthlyInterestRate = rateChange.newAnnualRate / 100 / 12;
      monthlyPayment = remainingPrincipal * monthlyInterestRate /
        (1 - Math.pow(1 + monthlyInterestRate, -(termInMonths - i + 1 - gracePeriod)));
    }

    // Update payment date
    switch (term) {
      case 'W': paymentDate.setDate(paymentDate.getDate() + 7); break;
      case 'M':
        const originalDay = paymentDate.getDate();
        paymentDate.setMonth(paymentDate.getMonth() + 1);
        const testDate = new Date(paymentDate);
        testDate.setMonth(testDate.getMonth() + 1);
        testDate.setDate(0);
        if (originalDay > testDate.getDate()) paymentDate.setDate(testDate.getDate());
        break;
      case 'Q': paymentDate.setMonth(paymentDate.getMonth() + 3); break;
      case 'Y':
        paymentDate.setFullYear(paymentDate.getFullYear() + 1);
        if (paymentDate.getMonth() === 1 && paymentDate.getDate() === 29 &&
            !isLeapYear(paymentDate.getFullYear())) {
          paymentDate.setDate(28);
        }
        break;
      case 'D': paymentDate.setDate(paymentDate.getDate() + 1); break;
    }

    let interestDue = remainingPrincipal * monthlyInterestRate;
    let principalDue = 0;

    // Apply grace period logic
    if (i <= gracePeriod) {
      principalDue = 0;
    } else {
      principalDue = monthlyPayment - interestDue;
      remainingPrincipal -= principalDue;
    }

    // Balloon payment in final installment
    let isFinal = i === termInMonths;
    let totalPayment = monthlyPayment;
    if (isFinal && balloonPayment > 0) {
      totalPayment += balloonPayment;
      principalDue += balloonPayment;
      remainingPrincipal = 0;
    }

    schedule.push({
      principal: parseFloat(principalDue.toFixed(2)),
      interest: parseFloat(interestDue.toFixed(2)),
      totalPayment: parseFloat(totalPayment.toFixed(2)),
      dueDate: new Date(paymentDate),
      loanAccountNo,
      installmentNumber: i,
      remainingBalance: parseFloat(remainingPrincipal.toFixed(2)),
      status: 'PENDING',
      paymentFrequency: term,
      isFinalInstallment: isFinal,
      createdDate: new Date()
    });
  }

  return schedule;
};

/**
 * Generates a unique credit application ID
 * Format: CRAPP/XXXX-TIMESTAMP
 */
export const generateUniqueCreditApplicationId = async () => {
  const prefix = 'CRAPP';
  const randomNumber = Math.floor(1000 + Math.random() * 9000);
  const timestamp = Date.now();
  return `${prefix}/${randomNumber}-${timestamp}`;
};

/**
 * Generates a valid loan account number starting with "300" and followed by 9 random digits
 * @returns {string}
 */
export const generateLoanAccountNumber = () => {
  const randomDigits = Math.floor(100000000 + Math.random() * 900000000);
  return `300${randomDigits}`;
};
