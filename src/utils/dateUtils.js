// src/utils/dateUtils.js - COMPLETE FIXED VERSION
import { Op } from 'sequelize';
import Holiday from '../models/Holiday.js';
import logger from './logger.js';
import sequelize from '../../config/db.js';

// ==================== HOLIDAY UTILITY FUNCTIONS ====================

/**
 * Check if a specific date is a holiday
 * @param {Date} date - The date to check
 * @returns {Promise<boolean>} True if holiday
 */
export async function isHoliday(date) {
  try {
    const checkDate = new Date(date);
    checkDate.setHours(0, 0, 0, 0);
    
    // Use the model's static method for better recurring holiday handling
    const holiday = await Holiday.isHoliday(checkDate);
    
    return !!holiday;
  } catch (error) {
    logger.error('Error checking holiday:', error);
    return false;
  }
}

/**
 * Get all holidays for a given year
 * @param {number} year - The year to get holidays for
 * @returns {Promise<Array>} List of holidays
 */
export async function getHolidaysForYear(year) {
  try {
    const startDate = new Date(year, 0, 1);
    const endDate = new Date(year, 11, 31);
    
    const holidays = await Holiday.findAll({
      where: {
        holidayDate: {
          [Op.between]: [startDate, endDate]
        }
      },
      order: [['holidayDate', 'ASC']]
    });
    
    return holidays;
  } catch (error) {
    logger.error('Error getting holidays for year:', error);
    return [];
  }
}

/**
 * Get holidays between two dates
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Promise<Array>} List of holidays in the range
 */
export async function getHolidaysBetween(startDate, endDate) {
  try {
    const holidays = await Holiday.getHolidaysInRange(startDate, endDate);
    return holidays;
  } catch (error) {
    logger.error('Error getting holidays between dates:', error);
    return [];
  }
}

// ==================== DATE UTILITY FUNCTIONS ====================

export async function calculateNextBusinessDate(currentDate) {
  const nextDate = new Date(currentDate);
  nextDate.setDate(nextDate.getDate() + 1);   // ✅ move forward at least one day
  nextDate.setHours(0, 0, 0, 0);

  while (await shouldSkipDate(nextDate)) {
    nextDate.setDate(nextDate.getDate() + 1);
  }
  return nextDate;
}

/**
 * Check if a date should be skipped (weekend or holiday)
 */
export async function shouldSkipDate(date) {
  try {
    // Check weekend
    if (date.getDay() === 0 || date.getDay() === 6) {
      return true;
    }
    
    // Check holiday using the model's static method
    const holiday = await Holiday.isHoliday(date);
    return !!holiday;
  } catch (error) {
    logger.error('Error checking if date should be skipped:', error);
    // If we can't check holiday, only check weekend
    return date.getDay() === 0 || date.getDay() === 6;
  }
}

/**
 * Format date to YYYY-MM-DD string
 */
export function formatDate(date) {
  if (!date) return '';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';
    return d.toISOString().split('T')[0];
  } catch (error) {
    logger.error('Error formatting date:', error);
    return '';
  }
}

/**
 * Check if date is a business day (not weekend or holiday)
 */
export async function isBusinessDay(date) {
  try {
    return !(await shouldSkipDate(date));
  } catch (error) {
    logger.error('Error checking if date is business day:', error);
    // Assume it's a business day if we can't check
    return date.getDay() !== 0 && date.getDay() !== 6;
  }
}

/**
 * Get number of business days between two dates
 */
export async function getBusinessDaysCount(startDate, endDate) {
  try {
    let count = 0;
    const current = new Date(startDate);
    current.setHours(0, 0, 0, 0);
    const end = new Date(endDate);
    end.setHours(0, 0, 0, 0);
    
    while (current <= end) {
      if (await isBusinessDay(current)) {
        count++;
      }
      current.setDate(current.getDate() + 1);
    }
    
    return count;
  } catch (error) {
    logger.error('Error calculating business days count:', error);
    return 0;
  }
}

/**
 * Add business days to a date
 */
export async function addBusinessDays(date, days) {
  try {
    const result = new Date(date);
    result.setHours(0, 0, 0, 0);
    let businessDaysAdded = 0;
    let attempts = 0;
    const maxAttempts = 365; // Prevent infinite loop
    
    while (businessDaysAdded < days && attempts < maxAttempts) {
      result.setDate(result.getDate() + 1);
      attempts++;
      if (await isBusinessDay(result)) {
        businessDaysAdded++;
      }
    }
    
    return result;
  } catch (error) {
    logger.error('Error adding business days:', error);
    // Fallback: add regular days
    const fallback = new Date(date);
    fallback.setDate(fallback.getDate() + days);
    return fallback;
  }
}

/**
 * Check if a value is a valid date
 */
export function isValidDate(date) {
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
}

/**
 * Calculate maturity date for loans
 */
export function calculateMaturityDate(startDate, termCode, termValue) {
  try {
    if (!isValidDate(startDate)) {
      throw new Error('Invalid start date');
    }
    
    if (typeof termValue !== 'number' || termValue <= 0) {
      throw new Error('Term value must be a positive number');
    }

    const result = new Date(startDate);
    const code = String(termCode).toUpperCase();

    switch(code) {
      case 'D':
      case 'DAILY':
        result.setDate(result.getDate() + termValue);
        break;
      case 'W':
      case 'WEEKLY':
        result.setDate(result.getDate() + (termValue * 7));
        break;
      case 'M':
      case 'MONTHLY':
        result.setMonth(result.getMonth() + termValue);
        break;
      case 'Q':
      case 'QUARTERLY':
        result.setMonth(result.getMonth() + (termValue * 3));
        break;
      case 'Y':
      case 'YEARLY':
        result.setFullYear(result.getFullYear() + termValue);
        break;
      default:
        throw new Error(`Invalid term code: ${code}`);
    }

    return result;
  } catch (error) {
    logger.error('Error calculating maturity date:', error);
    throw error;
  }
}

/**
 * Get payment frequency based on term
 */
export function getPaymentFrequency(termCode, termValue) {
  try {
    const code = String(termCode).toUpperCase();
    
    switch(code) {
      case 'D':
      case 'DAILY':
        return 'DAILY';
      case 'W':
      case 'WEEKLY':
        return 'WEEKLY';
      case 'M':
      case 'MONTHLY':
        return termValue <= 3 ? 'MONTHLY' : 'QUARTERLY';
      case 'Q':
      case 'QUARTERLY':
        return 'QUARTERLY';
      case 'Y':
      case 'YEARLY':
        return termValue <= 1 ? 'MONTHLY' : 'YEARLY';
      default:
        return 'MONTHLY';
    }
  } catch (error) {
    logger.error('Error getting payment frequency:', error);
    return 'MONTHLY';
  }
}

/**
 * Format date for display (DD/MM/YYYY)
 */
export function formatDateDisplay(date) {
  try {
    if (!isValidDate(date)) return '';
    
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    
    return `${day}/${month}/${year}`;
  } catch (error) {
    logger.error('Error formatting date for display:', error);
    return '';
  }
}

/**
 * Get month date range
 */
export function getMonthDateRange(year, month) {
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0);
  
  return {
    startDate,
    endDate
  };
}

/**
 * Checks if a date is in the future
 * @param {Date|string} date - The date to check
 * @returns {boolean} True if future date
 */
export function isFutureDate(date) {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d > today;
  } catch (error) {
    logger.error('Error checking if date is future:', error);
    return false;
  }
}

/**
 * Checks if a date is in the past
 * @param {Date|string} date - The date to check
 * @returns {boolean} True if past date
 */
export function isPastDate(date) {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d < today;
  } catch (error) {
    logger.error('Error checking if date is past:', error);
    return false;
  }
}

/**
 * Checks if a date is today
 * @param {Date|string} date - The date to check
 * @returns {boolean} True if today
 */
export function isToday(date) {
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  } catch (error) {
    logger.error('Error checking if date is today:', error);
    return false;
  }
}

/**
 * Checks if a date falls between two other dates
 * @param {Date|string} date - The date to check
 * @param {Date|string} startDate - Range start date
 * @param {Date|string} endDate - Range end date
 * @returns {boolean} True if date is within range
 */
export function isDateBetween(date, startDate, endDate) {
  try {
    const d = new Date(date);
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (isNaN(d.getTime()) || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return false;
    }
    
    d.setHours(0, 0, 0, 0);
    start.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    
    return d >= start && d <= end;
  } catch (error) {
    logger.error('Error checking if date is between range:', error);
    return false;
  }
}

/**
 * Get the next occurrence of a specific day of week
 * @param {Date} fromDate - Starting date
 * @param {number} targetDayOfWeek - 0 (Sunday) to 6 (Saturday)
 * @returns {Date} Next occurrence of the target day
 */
export function getNextDayOfWeek(fromDate, targetDayOfWeek) {
  try {
    const result = new Date(fromDate);
    result.setHours(0, 0, 0, 0);
    
    const currentDay = result.getDay();
    let daysToAdd = targetDayOfWeek - currentDay;
    
    if (daysToAdd <= 0) {
      daysToAdd += 7;
    }
    
    result.setDate(result.getDate() + daysToAdd);
    return result;
  } catch (error) {
    logger.error('Error getting next day of week:', error);
    return new Date(fromDate);
  }
}

/**
 * Get the first business day of the month
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @returns {Promise<Date>} First business day
 */
export async function getFirstBusinessDayOfMonth(year, month) {
  try {
    let date = new Date(year, month, 1);
    date.setHours(0, 0, 0, 0);
    
    while (await shouldSkipDate(date)) {
      date.setDate(date.getDate() + 1);
    }
    
    return date;
  } catch (error) {
    logger.error('Error getting first business day of month:', error);
    return new Date(year, month, 1);
  }
}

/**
 * Get the last business day of the month
 * @param {number} year - Year
 * @param {number} month - Month (0-11)
 * @returns {Promise<Date>} Last business day
 */
export async function getLastBusinessDayOfMonth(year, month) {
  try {
    let date = new Date(year, month + 1, 0); // Last day of month
    date.setHours(0, 0, 0, 0);
    
    while (await shouldSkipDate(date)) {
      date.setDate(date.getDate() - 1);
    }
    
    return date;
  } catch (error) {
    logger.error('Error getting last business day of month:', error);
    return new Date(year, month + 1, 0);
  }
}

// ==================== DEFAULT EXPORT ====================

export default {
  // Holiday functions
  isHoliday,
  getHolidaysForYear,
  getHolidaysBetween,
  
  // Business date functions
  calculateNextBusinessDate,
  shouldSkipDate,
  isBusinessDay,
  getBusinessDaysCount,
  addBusinessDays,
  getFirstBusinessDayOfMonth,
  getLastBusinessDayOfMonth,
  
  // Date validation functions
  isValidDate,
  isFutureDate,
  isPastDate,
  isToday,
  isDateBetween,
  
  // Loan calculation functions
  calculateMaturityDate,
  getPaymentFrequency,
  
  // Date formatting functions
  formatDate,
  formatDateDisplay,
  
  // Other utility functions
  getMonthDateRange,
  getNextDayOfWeek
};