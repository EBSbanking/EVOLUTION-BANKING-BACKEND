// src/utils/dateUtils.js
import Holiday from '../models/Holiday.js';
import logger from './logger.js';

// 1. Basic Date Validation Functions

/**
 * Checks if a value is a valid date
 * @param {any} date - The value to check
 * @returns {boolean} True if valid date
 */
export const isValidDate = (date) => {
  if (date instanceof Date) return !isNaN(date.getTime());
  if (typeof date === 'string') {
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  }
  if (typeof date === 'number') {
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  }
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
  
  if (!isValidDate(d) || !isValidDate(start) || !isValidDate(end)) {
    return false;
  }
  
  return d >= start && d <= end;
};

// 2. Loan Calculation Functions

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
  const result = new Date(startDate); // Clone to avoid mutation

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
    case 'Q': // Quarters
      result.setMonth(result.getMonth() + (termValue * 3));
      break;
    case 'Y': // Years
      result.setFullYear(result.getFullYear() + termValue);
      break;
    default:
      throw new Error(`Invalid term code: ${termCode}. Valid codes are D, W, M, Q, Y`);
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
    case 'Q':
      return 'QUARTERLY';
    case 'Y':
      return termValue <= 1 ? 'MONTHLY' : 'YEARLY';
    default:
      return 'MONTHLY';
  }
};

// 3. Business Date Calculation Functions

/**
 * Calculates the next business date, skipping weekends and holidays
 * @param {Date} currentDate - The starting date
 * @returns {Promise<Date>} The next valid business date
 * @throws {Error} If holiday check or date calculation fails
 */
export const calculateNextBusinessDate = async (currentDate) => {
  try {
    if (!isValidDate(currentDate)) {
      throw new Error('Invalid current date provided');
    }

    let nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    
    // Normalize to start of day for consistent comparison
    const normalizeDate = (date) => {
      const normalized = new Date(date);
      normalized.setHours(0, 0, 0, 0);
      return normalized;
    };

    let attempts = 0;
    const maxAttempts = 365; // Prevent infinite loop - max 1 year
    
    while (attempts < maxAttempts) {
      const checkDate = normalizeDate(nextDate);
      
      // Check if weekend (Saturday = 6, Sunday = 0)
      const dayOfWeek = checkDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      let isHoliday = false;
      
      // Only check for holidays if not weekend
      if (!isWeekend) {
        try {
          // Use the Holiday model's isHoliday static method
          const holiday = await Holiday.isHoliday(checkDate);
          isHoliday = !!holiday;
          
          if (isHoliday) {
            logger.debug('Date is a holiday, skipping', {
              date: checkDate.toISOString(),
              holiday: holiday.description
            });
          }
        } catch (holidayError) {
          logger.warn('Holiday check failed, proceeding without holiday check', {
            error: holidayError.message,
            date: checkDate.toISOString()
          });
          // If holiday check fails, assume it's not a holiday and continue
          isHoliday = false;
        }
      } else {
        logger.debug('Date is weekend, skipping', {
          date: checkDate.toISOString(),
          dayOfWeek: dayOfWeek
        });
      }
      
      // If not weekend and not holiday, we found our business date
      if (!isWeekend && !isHoliday) {
        logger.info('Next business date calculated', {
          currentDate: normalizeDate(currentDate).toISOString(),
          nextBusinessDate: checkDate.toISOString(),
          attempts: attempts + 1
        });
        return checkDate;
      }
      
      // Move to next day
      nextDate.setDate(nextDate.getDate() + 1);
      attempts++;
    }
    
    throw new Error('Could not find next business date within reasonable range (1 year)');
  } catch (error) {
    logger.error('Failed to calculate next business date', {
      error: error.message,
      currentDate: currentDate?.toISOString(),
      stack: error.stack
    });
    throw new Error(`Failed to calculate next business date: ${error.message}`);
  }
};

/**
 * Alternative method using direct query (if isHoliday method has issues)
 */
export const calculateNextBusinessDateDirect = async (currentDate) => {
  try {
    if (!isValidDate(currentDate)) {
      throw new Error('Invalid current date provided');
    }

    let nextDate = new Date(currentDate);
    nextDate.setDate(nextDate.getDate() + 1);
    
    const normalizeDate = (date) => {
      const normalized = new Date(date);
      normalized.setHours(0, 0, 0, 0);
      return normalized;
    };

    let attempts = 0;
    const maxAttempts = 365;
    
    while (attempts < maxAttempts) {
      const checkDate = normalizeDate(nextDate);
      const dayOfWeek = checkDate.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      
      let isHoliday = false;
      
      if (!isWeekend) {
        try {
          // Direct query using your Holiday model structure
          const startOfDay = new Date(checkDate);
          const endOfDay = new Date(checkDate);
          endOfDay.setHours(23, 59, 59, 999);
          
          const holiday = await Holiday.findOne({
            date: { $gte: startOfDay, $lte: endOfDay }
          });
          
          isHoliday = !!holiday;
        } catch (error) {
          logger.warn('Direct holiday query failed, continuing', { error: error.message });
          isHoliday = false;
        }
      }
      
      if (!isWeekend && !isHoliday) {
        logger.info('Next business date calculated (direct method)', {
          currentDate: normalizeDate(currentDate).toISOString(),
          nextBusinessDate: checkDate.toISOString(),
          attempts: attempts + 1
        });
        return checkDate;
      }
      
      nextDate.setDate(nextDate.getDate() + 1);
      attempts++;
    }
    
    throw new Error('Could not find next business date within reasonable range');
  } catch (error) {
    logger.error('Direct method failed to calculate next business date', {
      error: error.message,
      currentDate: currentDate?.toISOString()
    });
    throw error;
  }
};

/**
 * Safe version that returns a fallback date if calculation fails
 */
export const calculateNextBusinessDateSafe = async (currentDate) => {
  try {
    // Try the main method first
    return await calculateNextBusinessDate(currentDate);
  } catch (error) {
    logger.warn('Main holiday method failed, trying direct method', { error: error.message });
    
    try {
      // Try direct method
      return await calculateNextBusinessDateDirect(currentDate);
    } catch (directError) {
      logger.warn('All holiday methods failed, using fallback weekend-only calculation', { 
        error: directError.message 
      });
      
      // Final fallback: simple weekend skipping without holiday check
      let nextDate = new Date(currentDate);
      nextDate.setDate(nextDate.getDate() + 1);
      
      while (nextDate.getDay() === 0 || nextDate.getDay() === 6) {
        nextDate.setDate(nextDate.getDate() + 1);
      }
      
      nextDate.setHours(0, 0, 0, 0);
      return nextDate;
    }
  }
};

/**
 * Helper function to add business days to a date
 * @param {Date} startDate - Starting date
 * @param {number} businessDays - Number of business days to add
 * @returns {Promise<Date>} Resulting date
 */
export const addBusinessDays = async (startDate, businessDays) => {
  if (!isValidDate(startDate)) {
    throw new Error('Invalid start date');
  }
  
  if (typeof businessDays !== 'number' || businessDays < 0) {
    throw new Error('Business days must be a non-negative number');
  }

  let result = new Date(startDate);
  
  for (let i = 0; i < businessDays; i++) {
    result = await calculateNextBusinessDateSafe(result);
  }
  
  return result;
};

/**
 * Calculate the number of business days between two dates
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<number>} Number of business days
 */
export const getBusinessDaysBetween = async (startDate, endDate) => {
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    throw new Error('Invalid dates provided');
  }

  let count = 0;
  let current = new Date(startDate);
  current.setHours(0, 0, 0, 0);
  
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (current <= end) {
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Not weekend
      try {
        const isHoliday = await Holiday.isHoliday(current);
        if (!isHoliday) {
          count++;
        }
      } catch (error) {
        // If holiday check fails, count it as a business day
        count++;
      }
    }
    current.setDate(current.getDate() + 1);
  }

  return count;
};

// Default export for convenience
export default {
  isValidDate,
  isFutureDate,
  isPastDate,
  isDateBetween,
  calculateMaturityDate,
  getPaymentFrequency,
  calculateNextBusinessDate,
  calculateNextBusinessDateDirect,
  calculateNextBusinessDateSafe,
  addBusinessDays,
  getBusinessDaysBetween
};