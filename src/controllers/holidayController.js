// src/controllers/HolidayController.js
import { Op } from 'sequelize';
import jwt from 'jsonwebtoken';
import sequelize from '../../config/db.js';
import { DataTypes } from 'sequelize';
import Holiday from '../models/Holiday.js';
import User from '../models/User.js';
import logger from '../utils/logger.js';

// JWT secret from environment
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is not defined in environment variables');
}

// Helper: get or define Configuration model dynamically (matching existing schema)
const getConfigurationModel = () => {
  if (sequelize.models.Configuration) {
    return sequelize.models.Configuration;
  }
  
  try {
    const Configuration = sequelize.define('Configuration', {
      key: {
        type: DataTypes.STRING,
        primaryKey: true,
        allowNull: false
      },
      value: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      updated_by: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
      }
    }, {
      tableName: 'configurations',
      timestamps: false,
      freezeTableName: true
    });
    
    Configuration.sync({ alter: false }).catch(err => {
      logger.error('Failed to sync Configuration table:', err);
    });
    
    return Configuration;
  } catch (error) {
    logger.error('Failed to define Configuration model:', error);
    throw new Error('Configuration model could not be initialized');
  }
};

// Helper: find user by username/employer_number (not ID)
const findUserByIdentifier = async (identifier, transaction = null) => {
  if (!identifier) return null;
  return await User.findOne({
    where: {
      [Op.or]: [
        { user_name: identifier },
        { username: identifier },
        { employer_number: identifier }
      ]
    },
    transaction
  });
};

// Helper: resolve user from either ID (numeric) or username/employer_number
const resolveUser = async (identifier, transaction = null) => {
  if (!identifier) return null;
  if (!isNaN(identifier)) {
    return await User.findByPk(parseInt(identifier), { transaction });
  }
  return await findUserByIdentifier(identifier, transaction);
};

// Helper: check if user has admin or allowed role
const hasHolidayPermission = (user) => {
  if (!user) return false;
  if (user.BU_ROLE_ID === '1' || user.BU_ROLE_ID === 1) return true;
  const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN', 'HR_MANAGER', 'OPERATIONS_MANAGER'];
  return allowedRoles.includes(user.primary_role);
};

// =============================================
// HOLIDAY CRUD OPERATIONS
// =============================================

/**
 * GET /holidays
 * Get all holidays with pagination and filtering
 */
export const getAllHolidays = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      country, 
      status, 
      year, 
      month, 
      search,
      sortBy = 'holidayDate',
      sortOrder = 'ASC'
    } = req.query;
    
    const result = await Holiday.getHolidays({
      page: parseInt(page),
      limit: parseInt(limit),
      country,
      status,
      year: parseInt(year),
      month: parseInt(month),
      search,
      sortBy,
      sortOrder
    });
    
    res.status(200).json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      }
    });
  } catch (error) {
    logger.error('Error fetching holidays:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch holidays',
      error: error.message
    });
  }
};

/**
 * GET /holidays/:id
 * Get a single holiday by ID
 */
export const getHolidayById = async (req, res) => {
  try {
    const { id } = req.params;
    const holiday = await Holiday.findByPk(id);
    
    if (!holiday) {
      return res.status(404).json({
        success: false,
        message: 'Holiday not found'
      });
    }
    
    res.status(200).json({
      success: true,
      data: {
        id: holiday.id,
        name: holiday.holidayName,
        description: holiday.description,
        date: holiday.holidayDate,
        recurring: holiday.recurring,
        country: holiday.country,
        status: holiday.status,
        is_active: holiday.is_active,
        createdBy: holiday.createdBy,
        createdAt: holiday.created_at,
        updatedAt: holiday.updated_at,
        metadata: holiday.metadata
      }
    });
  } catch (error) {
    logger.error('Error getting holiday by ID:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch holiday',
      error: error.message
    });
  }
};

/**
 * POST /holidays
 * Create a new holiday
 */
export const createHoliday = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { 
      holidayDate, 
      holidayName, 
      description, 
      recurring, 
      country, 
      createdBy,
      metadata 
    } = req.body;

    // Validate required fields
    if (!holidayDate || !holidayName || !description) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'holidayDate, holidayName, and description are required'
      });
    }

    // Validate user
    const user = await resolveUser(createdBy || req.user?.id || req.user?.user_name, transaction);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check permissions
    if (!hasHolidayPermission(user)) {
      await transaction.rollback();
      logger.warn(`Permission denied for user ${createdBy}: primary_role=${user.primary_role}, BU_ROLE_ID=${user.BU_ROLE_ID}`);
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to create holidays'
      });
    }

    // Validate date
    const parsedDate = new Date(holidayDate);
    if (isNaN(parsedDate.getTime())) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }
    const dateStr = parsedDate.toISOString().split('T')[0];
    const holidayCountry = country || 'NG';

    // Check if holiday already exists
    const existingHoliday = await Holiday.findOne({
      where: { 
        holidayDate: dateStr, 
        country: holidayCountry 
      },
      transaction
    });
    
    if (existingHoliday) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `A holiday already exists for ${dateStr} in ${holidayCountry}`
      });
    }

    // Create holiday
    const holiday = await Holiday.create({
      holidayDate: dateStr,
      holidayName,
      description,
      recurring: recurring || false,
      country: holidayCountry,
      createdBy: user.id,
      metadata: metadata || {},
      status: 'ACTIVE',
      is_active: true
    }, { transaction });

    await transaction.commit();
    logger.info(`Holiday created: ${holidayName} on ${dateStr} by ${user.user_name} (ID: ${user.id})`);
    
    return res.status(201).json({
      success: true,
      message: 'Holiday created successfully',
      data: {
        id: holiday.id,
        name: holiday.holidayName,
        description: holiday.description,
        date: holiday.holidayDate,
        recurring: holiday.recurring,
        country: holiday.country,
        status: holiday.status,
        createdBy: holiday.createdBy,
        createdAt: holiday.created_at
      }
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error creating holiday:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to create holiday',
      error: error.message
    });
  }
};

/**
 * PUT /holidays/:id
 * Update a holiday
 */
export const updateHoliday = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { 
      holidayName, 
      description, 
      recurring, 
      country, 
      status,
      updatedBy,
      metadata 
    } = req.body;

    // Find holiday
    const holiday = await Holiday.findByPk(id, { transaction });
    if (!holiday) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Holiday not found'
      });
    }

    // Validate user
    const user = await resolveUser(updatedBy || req.user?.id || req.user?.user_name, transaction);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check permissions
    if (!hasHolidayPermission(user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to update holidays'
      });
    }

    // Update fields
    if (holidayName) holiday.holidayName = holidayName;
    if (description) holiday.description = description;
    if (recurring !== undefined) holiday.recurring = recurring;
    if (country) holiday.country = country;
    if (status) holiday.status = status;
    if (metadata) holiday.metadata = metadata;
    holiday.updated_at = new Date();

    await holiday.save({ transaction });
    await transaction.commit();

    logger.info(`Holiday updated: ID ${id} by ${user.user_name} (ID: ${user.id})`);
    
    return res.status(200).json({
      success: true,
      message: 'Holiday updated successfully',
      data: {
        id: holiday.id,
        name: holiday.holidayName,
        description: holiday.description,
        date: holiday.holidayDate,
        recurring: holiday.recurring,
        country: holiday.country,
        status: holiday.status,
        is_active: holiday.is_active
      }
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error updating holiday:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to update holiday',
      error: error.message
    });
  }
};

/**
 * DELETE /holidays/:id
 * Delete a holiday (soft delete by default, permanent if specified)
 */
export const deleteHoliday = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { permanent = false } = req.query;
    const { userId } = req.body;

    // Find holiday
    const holiday = await Holiday.findByPk(id, { transaction });
    if (!holiday) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Holiday not found'
      });
    }

    // Validate user
    const user = await resolveUser(userId || req.user?.id || req.user?.user_name, transaction);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check permissions - only admins can delete
    const isAdmin = user.BU_ROLE_ID === '1' || user.BU_ROLE_ID === 1;
    const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN'];
    if (!isAdmin && !allowedRoles.includes(user.primary_role)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to delete holidays'
      });
    }

    if (permanent === true || permanent === 'true') {
      // Permanent delete
      await holiday.destroy({ transaction });
      logger.info(`Holiday permanently deleted: ID ${id} by ${user.user_name}`);
      await transaction.commit();
      return res.status(200).json({
        success: true,
        message: 'Holiday permanently deleted',
        data: { id: holiday.id, name: holiday.holidayName }
      });
    } else {
      // Soft delete
      holiday.status = 'INACTIVE';
      holiday.is_active = false;
      holiday.updated_at = new Date();
      await holiday.save({ transaction });
      logger.info(`Holiday soft deleted: ID ${id} by ${user.user_name}`);
      await transaction.commit();
      return res.status(200).json({
        success: true,
        message: 'Holiday deactivated successfully',
        data: { 
          id: holiday.id, 
          name: holiday.holidayName, 
          status: holiday.status 
        }
      });
    }
  } catch (error) {
    await transaction.rollback();
    logger.error('Error deleting holiday:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to delete holiday',
      error: error.message
    });
  }
};

/**
 * POST /holidays/bulk
 * Bulk create holidays
 */
export const bulkCreateHolidays = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { holidays, userId } = req.body;

    if (!holidays || !Array.isArray(holidays) || holidays.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'holidays array is required and must not be empty'
      });
    }

    // Validate user
    const user = await resolveUser(userId || req.user?.id || req.user?.user_name, transaction);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check permissions
    if (!hasHolidayPermission(user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to bulk create holidays'
      });
    }

    const createdHolidays = [];
    const errors = [];

    for (const h of holidays) {
      try {
        const { holidayDate, holidayName, description, recurring, country } = h;
        
        // Validate required fields
        if (!holidayDate || !holidayName || !description) {
          errors.push({ holiday: h, error: 'Missing required fields: holidayDate, holidayName, description' });
          continue;
        }
        
        // Validate date
        const parsedDate = new Date(holidayDate);
        if (isNaN(parsedDate.getTime())) {
          errors.push({ holiday: h, error: 'Invalid date format' });
          continue;
        }
        
        const dateStr = parsedDate.toISOString().split('T')[0];
        const holidayCountry = country || 'NG';
        
        // Check if holiday already exists
        const existing = await Holiday.findOne({
          where: { holidayDate: dateStr, country: holidayCountry },
          transaction
        });
        
        if (existing) {
          errors.push({ holiday: h, error: `Holiday already exists for ${dateStr} in ${holidayCountry}` });
          continue;
        }
        
        // Create holiday
        const newHoliday = await Holiday.create({
          holidayDate: dateStr,
          holidayName,
          description,
          recurring: recurring || false,
          country: holidayCountry,
          createdBy: user.id,
          status: 'ACTIVE',
          is_active: true
        }, { transaction });
        
        createdHolidays.push(newHoliday);
      } catch (err) {
        errors.push({ holiday: h, error: err.message });
      }
    }

    await transaction.commit();
    
    return res.status(201).json({
      success: true,
      message: `Created ${createdHolidays.length} holidays, ${errors.length} errors`,
      data: {
        created: createdHolidays.map(h => ({
          id: h.id,
          name: h.holidayName,
          date: h.holidayDate,
          country: h.country
        })),
        errors,
        totalCreated: createdHolidays.length,
        totalErrors: errors.length
      }
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error bulk creating holidays:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to bulk create holidays',
      error: error.message
    });
  }
};

/**
 * GET /holidays/upcoming
 * Get upcoming holidays
 */
export const getUpcomingHolidays = async (req, res) => {
  try {
    const { days = 30, country } = req.query;
    
    const holidays = await Holiday.getUpcomingHolidays(parseInt(days), { 
      country: country || 'NG' 
    });
    
    return res.status(200).json({
      success: true,
      data: {
        count: holidays.length,
        days: parseInt(days),
        holidays: holidays.map(h => ({
          id: h.id,
          name: h.holidayName,
          description: h.description,
          date: h.actualDate || h.holidayDate,
          recurring: h.recurring,
          country: h.country
        })),
        country: country || 'NG'
      }
    });
  } catch (error) {
    logger.error('Error getting upcoming holidays:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch upcoming holidays',
      error: error.message
    });
  }
};

/**
 * GET /holidays/check
 * Check if a date is a holiday
 */
export const checkHoliday = async (req, res) => {
  try {
    const { date, country } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required'
      });
    }
    
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }
    
    const holiday = await Holiday.isHoliday(parsedDate, { 
      country: country || 'NG' 
    });
    
    return res.status(200).json({
      success: true,
      data: {
        date: parsedDate.toISOString().split('T')[0],
        isHoliday: !!holiday,
        holiday: holiday ? {
          id: holiday.id,
          name: holiday.holidayName,
          description: holiday.description,
          date: holiday.holidayDate,
          recurring: holiday.recurring,
          country: holiday.country
        } : null
      }
    });
  } catch (error) {
    logger.error('Error checking holiday:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check holiday',
      error: error.message
    });
  }
};

/**
 * GET /holidays/check-business-day
 * Check if a date is a business day
 */
export const checkBusinessDay = async (req, res) => {
  try {
    const { date, country } = req.query;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date parameter is required'
      });
    }
    
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }
    
    const isBusinessDay = await Holiday.isBusinessDay(parsedDate, { 
      country: country || 'NG' 
    });
    const dayOfWeek = parsedDate.getDay();
    
    return res.status(200).json({
      success: true,
      data: {
        date: parsedDate.toISOString().split('T')[0],
        isBusinessDay,
        isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
        dayOfWeek: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOfWeek]
      }
    });
  } catch (error) {
    logger.error('Error checking business day:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to check business day',
      error: error.message
    });
  }
};

/**
 * GET /holidays/next-business-day
 * Get next business day after a given date
 */
export const getNextBusinessDay = async (req, res) => {
  try {
    const { date, country } = req.query;
    const fromDate = date ? new Date(date) : new Date();
    
    if (isNaN(fromDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }
    
    const nextBusinessDay = await Holiday.getNextBusinessDay(fromDate, { 
      country: country || 'NG' 
    });
    
    return res.status(200).json({
      success: true,
      data: {
        fromDate: fromDate.toISOString().split('T')[0],
        nextBusinessDay: nextBusinessDay ? nextBusinessDay.toISOString().split('T')[0] : null
      }
    });
  } catch (error) {
    logger.error('Error getting next business day:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get next business day',
      error: error.message
    });
  }
};

/**
 * GET /holidays/month/:year/:month
 * Get holidays for a specific month
 */
export const getHolidaysForMonth = async (req, res) => {
  try {
    const { year, month } = req.params;
    const { country } = req.query;
    
    const targetYear = parseInt(year) || new Date().getFullYear();
    const targetMonth = parseInt(month);
    
    if (isNaN(targetMonth) || targetMonth < 0 || targetMonth > 11) {
      return res.status(400).json({
        success: false,
        message: 'Month must be between 0 (January) and 11 (December)'
      });
    }
    
    const holidays = await Holiday.getHolidaysForMonth(targetYear, targetMonth, { 
      country: country || 'NG' 
    });
    
    return res.status(200).json({
      success: true,
      data: {
        year: targetYear,
        month: targetMonth,
        monthName: new Date(targetYear, targetMonth).toLocaleString('default', { month: 'long' }),
        count: holidays.length,
        holidays: holidays.map(h => ({
          id: h.id,
          name: h.holidayName,
          description: h.description,
          date: h.holidayDate,
          recurring: h.recurring,
          country: h.country
        })),
        country: country || 'NG'
      }
    });
  } catch (error) {
    logger.error('Error getting holidays for month:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get holidays for month',
      error: error.message
    });
  }
};

/**
 * GET /holidays/range
 * Get holidays in a date range
 */
export const getHolidaysInRange = async (req, res) => {
  try {
    const { start, end, country } = req.query;
    
    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: 'start and end dates are required'
      });
    }
    
    const startDate = new Date(start);
    const endDate = new Date(end);
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Use YYYY-MM-DD'
      });
    }
    
    if (startDate > endDate) {
      return res.status(400).json({
        success: false,
        message: 'start date must be before end date'
      });
    }
    
    const holidays = await Holiday.getHolidaysInRange(startDate, endDate, { 
      country: country || 'NG' 
    });
    
    return res.status(200).json({
      success: true,
      data: {
        range: {
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0]
        },
        count: holidays.length,
        holidays: holidays.map(h => ({
          id: h.id,
          name: h.holidayName,
          description: h.description,
          date: h.actualDate ? h.actualDate.toISOString().split('T')[0] : h.holidayDate,
          originalDate: h.holidayDate,
          recurring: h.recurring,
          country: h.country
        })),
        country: country || 'NG'
      }
    });
  } catch (error) {
    logger.error('Error getting holidays in range:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get holidays in range',
      error: error.message
    });
  }
};

/**
 * PATCH /holidays/:id/toggle
 * Toggle holiday status (activate/deactivate)
 */
export const toggleHolidayStatus = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { userId } = req.body;
    
    // Find holiday
    const holiday = await Holiday.findByPk(id, { transaction });
    if (!holiday) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Holiday not found'
      });
    }
    
    // Validate user
    const user = await resolveUser(userId || req.user?.id || req.user?.user_name, transaction);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check permissions
    if (!hasHolidayPermission(user)) {
      await transaction.rollback();
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to modify holiday status'
      });
    }
    
    // Toggle status
    holiday.is_active = !holiday.is_active;
    holiday.status = holiday.is_active ? 'ACTIVE' : 'INACTIVE';
    holiday.updated_at = new Date();
    await holiday.save({ transaction });
    await transaction.commit();
    
    logger.info(`Holiday ${holiday.is_active ? 'activated' : 'deactivated'}: ID ${id} by ${user.user_name}`);
    
    return res.status(200).json({
      success: true,
      message: `Holiday ${holiday.is_active ? 'activated' : 'deactivated'} successfully`,
      data: {
        id: holiday.id,
        name: holiday.holidayName,
        is_active: holiday.is_active,
        status: holiday.status
      }
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error toggling holiday status:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to toggle holiday status',
      error: error.message
    });
  }
};

/**
 * POST /holidays/initialize
 * Initialize holidays table
 */
export const initializeTable = async (req, res) => {
  try {
    const { force } = req.query;
    const result = await Holiday.initializeTable(force === 'true');
    
    res.status(200).json({
      success: result,
      message: result ? 'Holidays table initialized successfully' : 'Failed to initialize holidays table'
    });
  } catch (error) {
    logger.error('Error initializing holidays table:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to initialize holidays table',
      error: error.message
    });
  }
};

// =============================================
// CONFIGURATION ENDPOINTS
// =============================================

/**
 * GET /holidays/config/skip-repayment
 * Get skip repayment on holiday configuration
 */
export const getSkipRepaymentConfig = async (req, res) => {
  try {
    let skipHoliday = true;
    try {
      const Configuration = getConfigurationModel();
      const config = await Configuration.findOne({ 
        where: { key: 'skip_repayment_on_holiday' } 
      });
      if (config && config.value === 'true') {
        skipHoliday = true;
      } else if (config && config.value === 'false') {
        skipHoliday = false;
      }
    } catch (err) {
      logger.warn('Could not read skip_repayment_on_holiday config, using default true', err);
    }
    return res.status(200).json({
      success: true,
      data: { skip_repayment_on_holiday: skipHoliday }
    });
  } catch (error) {
    logger.error('Error getting skip repayment config:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to get configuration',
      error: error.message
    });
  }
};

/**
 * PUT /holidays/config/skip-repayment
 * Update skip repayment on holiday configuration
 */
export const updateSkipRepaymentConfig = async (req, res) => {
  try {
    const { skip_repayment_on_holiday } = req.body;
    
    if (typeof skip_repayment_on_holiday !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'skip_repayment_on_holiday must be a boolean'
      });
    }
    
    // Get user from request
    const userId = req.user?.id || req.user?.user_name;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }
    
    const user = await resolveUser(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check permissions
    if (!hasHolidayPermission(user)) {
      return res.status(403).json({
        success: false,
        message: 'Insufficient permissions to update configuration'
      });
    }
    
    const Configuration = getConfigurationModel();
    await Configuration.upsert({
      key: 'skip_repayment_on_holiday',
      value: skip_repayment_on_holiday ? 'true' : 'false',
      updated_by: user.id,
      updated_at: new Date()
    });
    
    logger.info(`skip_repayment_on_holiday updated to ${skip_repayment_on_holiday} by ${user.user_name} (ID: ${user.id})`);
    
    return res.status(200).json({
      success: true,
      message: `Repayment holiday skip ${skip_repayment_on_holiday ? 'enabled' : 'disabled'}`,
      data: { skip_repayment_on_holiday }
    });
  } catch (error) {
    logger.error('Error updating skip repayment config:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update configuration',
      error: error.message
    });
  }
};

// =============================================
// DEFAULT EXPORT
// =============================================

const HolidayController = {
  // Holiday CRUD
  getAllHolidays,
  getHolidayById,
  createHoliday,
  updateHoliday,
  deleteHoliday,
  bulkCreateHolidays,
  toggleHolidayStatus,
  
  // Holiday queries
  getUpcomingHolidays,
  getHolidaysForMonth,
  getHolidaysInRange,
  checkHoliday,
  checkBusinessDay,
  getNextBusinessDay,
  
  // Utilities
  initializeTable,
  
  // Configuration
  getSkipRepaymentConfig,
  updateSkipRepaymentConfig
};

export default HolidayController;