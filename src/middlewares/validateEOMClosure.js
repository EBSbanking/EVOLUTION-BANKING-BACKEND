// middleware/validateEOMClosure.js
import EOMClosingPeriod from '../models/EOMClosingPeriod.js';
import logger from '../utils/logger.js';

/**
 * Middleware to prevent transactions from being posted to closed periods
 * This enforces the no-backdating rule when EOM is run
 */
export const validateEOMClosure = async (req, res, next) => {
  try {
    // Get the transaction date from various possible sources
    const transactionDate = req.body.transactionDate || 
                           req.body.transaction_date || 
                           req.body.date || 
                           req.body.postingDate ||
                           req.body.effectiveDate ||
                           req.body.created_at ||
                           req.body.createdAt;
    
    // If no date is provided, use current date
    if (!transactionDate) {
      return next();
    }

    const date = new Date(transactionDate);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      logger.warn('⚠️ Invalid date format in EOM validation:', transactionDate);
      return next();
    }

    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    
    const organizationCode = req.body.organizationCode || 
                            req.body.organization_code || 
                            req.user?.organizationCode || 
                            1;
    const branchCode = req.body.branchCode || 
                      req.body.branch_code || 
                      req.user?.branchCode || 
                      '001';

    // Check if the month is closed
    const isClosed = await EOMClosingPeriod.isMonthClosed(month, year, organizationCode, branchCode);
    
    if (isClosed) {
      return res.status(403).json({
        success: false,
        message: `Cannot post transactions to ${month}/${year}. The period is closed.`,
        error: 'PERIOD_CLOSED',
        details: {
          month,
          year,
          organizationCode,
          branchCode,
          date: date.toISOString()
        },
        resolution: 'Please reopen the period or contact your administrator.'
      });
    }

    next();
  } catch (error) {
    // If there's an error, allow the transaction but log it
    // This prevents blocking transactions due to validation errors
    logger.error('❌ Error validating EOM closure:', error);
    logger.warn('⚠️ EOM validation bypassed due to error:', error.message);
    next();
  }
};

/**
 * Middleware to check if a date is in a closed period (without blocking)
 * Returns the closure status in req.eomClosure
 */
export const checkEOMClosure = async (req, res, next) => {
  try {
    // Support both params and query parameters
    let month, year;
    
    if (req.params.month && req.params.year) {
      month = parseInt(req.params.month);
      year = parseInt(req.params.year);
    } else if (req.query.date) {
      const d = new Date(req.query.date);
      month = d.getMonth() + 1;
      year = d.getFullYear();
    } else if (req.params.date) {
      const d = new Date(req.params.date);
      month = d.getMonth() + 1;
      year = d.getFullYear();
    } else {
      // If no date provided, use current date
      const now = new Date();
      month = now.getMonth() + 1;
      year = now.getFullYear();
    }

    const organizationCode = req.query.organizationCode || 
                            req.query.organization_code || 
                            req.user?.organizationCode || 
                            1;
    const branchCode = req.query.branchCode || 
                      req.query.branch_code || 
                      req.user?.branchCode || 
                      '001';

    const isClosed = await EOMClosingPeriod.isMonthClosed(month, year, organizationCode, branchCode);

    req.eomClosure = {
      month: month,
      year: year,
      isClosed: isClosed,
      organizationCode: organizationCode,
      branchCode: branchCode,
      canPost: !isClosed,
      timestamp: new Date().toISOString()
    };

    next();
  } catch (error) {
    logger.error('❌ Error checking EOM closure:', error);
    req.eomClosure = { 
      isClosed: false, 
      error: error.message,
      canPost: true,
      timestamp: new Date().toISOString()
    };
    next();
  }
};

/**
 * Get the latest closed period for a user's branch
 */
export const getLatestClosedPeriod = async (organizationCode = 1, branchCode = '001') => {
  try {
    return await EOMClosingPeriod.getLatestClosedPeriod(organizationCode, branchCode);
  } catch (error) {
    logger.error('❌ Error getting latest closed period:', error);
    return null;
  }
};

/**
 * Check if a date range overlaps with any closed periods
 */
export const isDateRangeOverlappingClosedPeriod = async (startDate, endDate, organizationCode = 1, branchCode = '001') => {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Validate dates
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return {
        overlaps: false,
        period: null,
        error: 'Invalid date range provided'
      };
    }
    
    const closedPeriods = await EOMClosingPeriod.getClosedPeriods(organizationCode, branchCode);
    
    for (const period of closedPeriods) {
      const periodStart = new Date(period.period_start);
      const periodEnd = new Date(period.period_end);
      
      // Check if ranges overlap
      if (start <= periodEnd && end >= periodStart) {
        return {
          overlaps: true,
          period: period
        };
      }
    }
    
    return {
      overlaps: false,
      period: null
    };
  } catch (error) {
    logger.error('❌ Error checking date range overlap:', error);
    return {
      overlaps: false,
      period: null,
      error: error.message
    };
  }
};

/**
 * Get all closed periods for a branch
 */
export const getClosedPeriods = async (organizationCode = 1, branchCode = '001') => {
  try {
    return await EOMClosingPeriod.getClosedPeriods(organizationCode, branchCode);
  } catch (error) {
    logger.error('❌ Error getting closed periods:', error);
    return [];
  }
};

/**
 * Get closing summary for a branch
 */
export const getEOMClosingSummary = async (organizationCode = 1, branchCode = '001') => {
  try {
    const closedPeriods = await EOMClosingPeriod.getClosedPeriods(organizationCode, branchCode);
    const latestClosed = await EOMClosingPeriod.getLatestClosedPeriod(organizationCode, branchCode);
    
    // Get the next month to close
    let nextMonth, nextYear;
    if (latestClosed) {
      nextMonth = latestClosed.month + 1;
      nextYear = latestClosed.year;
      if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
      }
    } else {
      const now = new Date();
      nextMonth = now.getMonth() + 1;
      nextYear = now.getFullYear();
    }

    return {
      closedPeriods: closedPeriods,
      latestClosed: latestClosed,
      nextMonth: nextMonth,
      nextYear: nextYear,
      totalClosed: closedPeriods.length,
      isFullyClosed: closedPeriods.length > 0 && 
        closedPeriods.length >= ((new Date().getFullYear() - 2000) * 12 + new Date().getMonth())
    };
  } catch (error) {
    logger.error('❌ Error getting EOM closing summary:', error);
    return {
      closedPeriods: [],
      latestClosed: null,
      nextMonth: new Date().getMonth() + 1,
      nextYear: new Date().getFullYear(),
      totalClosed: 0,
      isFullyClosed: false
    };
  }
};

export default {
  validateEOMClosure,
  checkEOMClosure,
  getLatestClosedPeriod,
  getClosedPeriods,
  getEOMClosingSummary,
  isDateRangeOverlappingClosedPeriod
};