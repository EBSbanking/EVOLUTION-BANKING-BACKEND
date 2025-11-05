import Holiday from '../models/Holiday.js';
import logger from './logger.js';

/**
 * Checks if a value is a valid date
 * @param {any} date - The value to check
 * @returns {boolean} True if valid date
 */
export const isValidDate = (date) => {
  if (date instanceof Date) return !isNaN(date);
  if (typeof date === 'string') return !isNaN(new Date(date));
  return false;
};

/**
 * Checks if a date is in the future
 * @param {Date|string} date - The date to check
 * @returns {boolean} True if future date
 */
export const isFutureDate = (date) => {
  const d = new Date(date);
  return isValidDate(d) && d > new Date();
};

/**
 * Checks if a date is in the past
 * @param {Date|string} date - The date to check
 * @returns {boolean} True if past date
 */
export const isPastDate = (date) => {
  const d = new Date(date);
  return isValidDate(d) && d < new Date();
};

/**
 * Checks if a date falls between two other dates
 * @param {Date|string} date - The date to check
 * @param {Date|string} startDate - Range start date
 * @param {Date|string} endDate - Range end date
 * @returns {boolean} True if date is within range
 */
export const isDateBetween = (date, startDate, endDate) => {
  const d = new Date(date);
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  return isValidDate(d) && d >= start && d <= end;
};

/**
 * Calculates the maturity date based on start date, term code and term value
 * @param {Date} startDate - The loan start date
 * @param {string} termCode - Term code (D, W, M, Q, Y)
 * @param {number} termValue - Number of terms
 * @returns {Date} Maturity date
 * @throws {Error} If term code is invalid
 */
export const calculateMaturityDate = (startDate, termCode, termValue) => {
  // Validate inputs
  if (!isValidDate(startDate)) {
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
};

/**
 * Determines payment frequency based on term code and term value
 * @param {string} termCode - Term code (D, W, M, Q, Y)
 * @param {number} termValue - Number of terms
 * @returns {string} Payment frequency (DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY)
 */
export const getPaymentFrequency = (termCode, termValue) => {
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
};

/**
 * Calculates the next business date, skipping weekends and holidays
 * @param {Date} currentDate - The starting date
 * @returns {Promise<Date>} The next valid business date
 * @throws {Error} If holiday check or date calculation fails
 */
export const calculateNextBusinessDate = async (currentDate) => {
  try {
    let nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    // Fetch holidays for the next year to reduce queries
    const holidays = await Holiday.find({
      date: {
        $gte: new Date(nextDate.setHours(0, 0, 0, 0)),
        $lt: new Date(new Date(nextDate).setFullYear(nextDate.getFullYear() + 1)),
      },
    });
    const holidayDates = holidays.map(h => new Date(h.date).setHours(0, 0, 0, 0));
    let isHolidayOrWeekend = true;
    while (isHolidayOrWeekend) {
      const normalizedDate = new Date(nextDate.setHours(0, 0, 0, 0));
      const isWeekend = nextDate.getDay() === 0 || nextDate.getDay() === 6;
      const isHoliday = holidayDates.includes(normalizedDate.getTime());
      isHolidayOrWeekend = isHoliday || isWeekend;
      if (isHolidayOrWeekend) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
    }
    return nextDate;
  } catch (error) {
    logger.error('Failed to calculate next business date', { error: error.message, stack: error.stack });
    throw error;
  }
};

export default {
  isValidDate,
  isFutureDate,
  isPastDate,
  isDateBetween,
  calculateMaturityDate,
  getPaymentFrequency,
  calculateNextBusinessDate
};