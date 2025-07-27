// utils/dateUtils.js

/**
 * Calculates the maturity date based on start date, term code and term value
 * @param {Date} startDate - The loan start date
 * @param {string} termCode - Term code (D, W, M, Q, Y)
 * @param {number} termValue - Number of terms
 * @returns {Date} Maturity date
 * @throws {Error} If term code is invalid
 */
function calculateMaturityDate(startDate, termCode, termValue) {
  // Validate inputs
  if (!(startDate instanceof Date) || isNaN(startDate.getTime())) {
    throw new Error('Invalid start date');
  }
  
  if (typeof termValue !== 'number' || termValue <= 0) {
    throw new Error('Term value must be a positive number');
  }

  termCode = String(termCode).toUpperCase();
  const result = new Date(startDate);

  switch(termCode) {
    case 'D': // Days
      result.setDate(result.getDate() + termValue);
      break;
    case 'W': // Weeks
      result.setDate(result.getDate() + (termValue * 7));
      break;
    case 'M': // Months
      result.setMonth(result.getMonth() + termValue);
      break;
    case 'Y': // Years
      result.setFullYear(result.getFullYear() + termValue);
      break;
    default:
      throw new Error(`Invalid term code: ${termCode}. Valid codes are D, W, M, Y`);
  }

  return result;
}

/**
 * Determines payment frequency based on term code and term value
 * @param {string} termCode - Term code (D, W, M, Q, Y)
 * @param {number} termValue - Number of terms
 * @returns {string} Payment frequency (DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY)
 */
function getPaymentFrequency(termCode, termValue) {
  termCode = String(termCode).toUpperCase();
  
  // Validate termValue
  if (typeof termValue !== 'number' || termValue <= 0) {
    throw new Error('Term value must be a positive number');
  }

  switch(termCode) {
    case 'D': 
      return 'DAILY';
    case 'W': 
      return 'WEEKLY';
    case 'M': 
      return termValue <= 3 ? 'MONTHLY' : 'QUARTERLY';
    case 'Y':
      return termValue <= 1 ? 'MONTHLY' : 'YEARLY';
    default:
      return 'MONTHLY';
  }
}

export default {
  calculateMaturityDate,
  getPaymentFrequency
};