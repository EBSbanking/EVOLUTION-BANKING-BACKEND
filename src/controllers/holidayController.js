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
        type: DataTypes.INTEGER,   // ✅ integer (user ID)
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
  if (user.BU_ROLE_ID === '1' || user.BU_ROLE_ID === 1) return true;
  const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN', 'HR_MANAGER', 'OPERATIONS_MANAGER'];
  return allowedRoles.includes(user.primary_role);
};

// ========== NAMED EXPORTS ==========

export const isDateHoliday = async (req, res) => {
  try {
    const { date, country } = req.query;
    if (!date) return res.status(400).json({ success: false, error: 'Date query parameter is required' });
    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) return res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD' });
    const holiday = await Holiday.isHoliday(parsedDate, { country: country || 'US' });
    return res.status(200).json({
      success: true,
      data: {
        date: parsedDate,
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
    logger.error('Error checking if date is holiday:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getAllHolidays = async (req, res) => {
  try {
    const { country, year, recurring, status, limit = 100, offset = 0 } = req.query;
    const whereClause = {};
    if (country) whereClause.country = country;
    if (recurring !== undefined) whereClause.recurring = recurring === 'true';
    if (status) whereClause.status = status;
    else whereClause.is_active = true;
    if (year) {
      const startDate = new Date(parseInt(year), 0, 1);
      const endDate = new Date(parseInt(year), 11, 31);
      whereClause.holidayDate = { [Op.between]: [startDate, endDate] };
    }
    const holidays = await Holiday.findAndCountAll({
      where: whereClause,
      order: [['holidayDate', 'ASC'], ['country', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
    return res.status(200).json({
      success: true,
      data: {
        count: holidays.count,
        rows: holidays.rows.map(h => ({
          id: h.id,
          name: h.holidayName,
          description: h.description,
          date: h.holidayDate,
          recurring: h.recurring,
          country: h.country,
          status: h.status,
          is_active: h.is_active,
          createdBy: h.createdBy,
          createdAt: h.created_at,
          updatedAt: h.updated_at,
          metadata: h.metadata
        }))
      }
    });
  } catch (error) {
    logger.error('Error fetching holidays:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getHolidayById = async (req, res) => {
  try {
    const { id } = req.params;
    const holiday = await Holiday.findByPk(id);
    if (!holiday) return res.status(404).json({ success: false, error: 'Holiday not found' });
    return res.status(200).json({
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
    logger.error('Error getting holiday by ID:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const createHoliday = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { holidayDate, holidayName, description, recurring, country, createdBy, metadata } = req.body;

    if (!holidayDate || !holidayName || !description || !country || !createdBy) {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: 'All fields are required: holidayDate, holidayName, description, country, createdBy' });
    }

    const user = await resolveUser(createdBy, transaction);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!hasHolidayPermission(user)) {
      await transaction.rollback();
      logger.warn(`Permission denied for user ${createdBy}: primary_role=${user.primary_role}, BU_ROLE_ID=${user.BU_ROLE_ID}`);
      return res.status(403).json({ success: false, error: 'Insufficient permissions to create holidays' });
    }

    const parsedDate = new Date(holidayDate);
    if (isNaN(parsedDate.getTime())) {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    const dateStr = parsedDate.toISOString().split('T')[0];
    const existingHoliday = await Holiday.findOne({
      where: { holidayDate: dateStr, country },
      transaction
    });
    if (existingHoliday) {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: `A holiday already exists for ${dateStr} in ${country}` });
    }

    const holiday = await Holiday.create({
      holidayDate: dateStr,
      holidayName,
      description,
      recurring: recurring || false,
      country,
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
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateHolidayByDate = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { holidayName, description, recurring, country, createdBy, status } = req.body;

    if (!id) {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: 'Date or ID parameter is required' });
    }
    if (!holidayName || !description || !country || !createdBy) {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: 'All fields are required: holidayName, description, country, createdBy' });
    }

    let whereCondition;
    if (id.match(/^\d{4}-\d{2}-\d{2}$/)) {
      whereCondition = { holidayDate: id, country };
    } else {
      whereCondition = { id: parseInt(id) };
    }

    const holiday = await Holiday.findOne({ where: whereCondition, transaction });
    if (!holiday) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: 'Holiday not found' });
    }

    const user = await resolveUser(createdBy, transaction);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!hasHolidayPermission(user)) {
      await transaction.rollback();
      return res.status(403).json({ success: false, error: 'Insufficient permissions to update holidays' });
    }

    holiday.holidayName = holidayName;
    holiday.description = description;
    holiday.recurring = recurring !== undefined ? recurring : holiday.recurring;
    if (status) holiday.status = status;
    holiday.updated_at = new Date();
    await holiday.save({ transaction });
    await transaction.commit();

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
        status: holiday.status
      }
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error updating holiday by date:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteHoliday = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { userId, permanent = false } = req.body;

    if (!userId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const holiday = await Holiday.findByPk(id, { transaction });
    if (!holiday) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: 'Holiday not found' });
    }

    const user = await resolveUser(userId, transaction);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const isAdmin = user.BU_ROLE_ID === '1' || user.BU_ROLE_ID === 1;
    const allowedRoles = ['ADMIN', 'SYSTEM_ADMIN'];
    if (!isAdmin && !allowedRoles.includes(user.primary_role)) {
      await transaction.rollback();
      return res.status(403).json({ success: false, error: 'Insufficient permissions to delete holidays' });
    }

    if (permanent) {
      await holiday.destroy({ transaction });
      logger.info(`Holiday permanently deleted: ID ${id} by ${user.user_name}`);
    } else {
      holiday.status = 'INACTIVE';
      holiday.is_active = false;
      holiday.updated_at = new Date();
      await holiday.save({ transaction });
      logger.info(`Holiday soft deleted: ID ${id} by ${user.user_name}`);
    }

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: permanent ? 'Holiday permanently deleted' : 'Holiday deactivated successfully',
      data: { id: holiday.id, name: holiday.holidayName, status: permanent ? 'DELETED' : holiday.status }
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error deleting holiday:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const bulkCreateHolidays = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { holidays, userId } = req.body;

    if (!userId) {
      return res.status(400).json({ success: false, error: 'userId is required' });
    }
    if (!holidays || !Array.isArray(holidays) || holidays.length === 0) {
      return res.status(400).json({ success: false, error: 'holidays array is required and must not be empty' });
    }

    const user = await resolveUser(userId, transaction);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!hasHolidayPermission(user)) {
      await transaction.rollback();
      return res.status(403).json({ success: false, error: 'Insufficient permissions to bulk create holidays' });
    }

    const createdHolidays = [];
    const errors = [];

    for (const h of holidays) {
      try {
        const { holidayDate, holidayName, description, recurring, country } = h;
        if (!holidayDate || !holidayName || !description || !country) {
          errors.push({ holiday: h, error: 'Missing required fields' });
          continue;
        }
        const parsedDate = new Date(holidayDate);
        if (isNaN(parsedDate.getTime())) {
          errors.push({ holiday: h, error: 'Invalid date format' });
          continue;
        }
        const dateStr = parsedDate.toISOString().split('T')[0];
        const existing = await Holiday.findOne({
          where: { holidayDate: dateStr, country },
          transaction
        });
        if (existing) {
          errors.push({ holiday: h, error: `Holiday already exists for ${dateStr} in ${country}` });
          continue;
        }
        const newHoliday = await Holiday.create({
          holidayDate: dateStr,
          holidayName,
          description,
          recurring: recurring || false,
          country,
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
        created: createdHolidays.map(h => ({ id: h.id, name: h.holidayName, date: h.holidayDate, country: h.country })),
        errors,
        totalCreated: createdHolidays.length,
        totalErrors: errors.length
      }
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error bulk creating holidays:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getHolidaysForMonth = async (req, res) => {
  try {
    const { year, month } = req.params;
    const { country } = req.query;
    const targetYear = parseInt(year) || new Date().getFullYear();
    const targetMonth = parseInt(month) !== undefined ? parseInt(month) : new Date().getMonth();
    if (targetMonth < 0 || targetMonth > 11) {
      return res.status(400).json({ success: false, error: 'Month must be between 0 (January) and 11 (December)' });
    }
    const holidays = await Holiday.getHolidaysForMonth(targetYear, targetMonth, { country: country || 'US' });
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
        country: country || 'US'
      }
    });
  } catch (error) {
    logger.error('Error getting holidays for month:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getUpcomingHolidays = async (req, res) => {
  try {
    const { days = 30, country } = req.query;
    const holidays = await Holiday.getUpcomingHolidays(parseInt(days), { country: country || 'US' });
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
        country: country || 'US'
      }
    });
  } catch (error) {
    logger.error('Error getting upcoming holidays:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getHolidaysInRange = async (req, res) => {
  try {
    const { start, end, country } = req.query;
    if (!start || !end) {
      return res.status(400).json({ success: false, error: 'start and end dates are required' });
    }
    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid date format. Use YYYY-MM-DD' });
    }
    if (startDate > endDate) {
      return res.status(400).json({ success: false, error: 'start date must be before end date' });
    }
    const holidays = await Holiday.getHolidaysInRange(startDate, endDate, { country: country || 'US' });
    return res.status(200).json({
      success: true,
      data: {
        range: { start: startDate, end: endDate },
        count: holidays.length,
        holidays: holidays.map(h => ({
          id: h.id,
          name: h.holidayName,
          description: h.description,
          date: h.actualDate || h.holidayDate,
          originalDate: h.holidayDate,
          recurring: h.recurring,
          country: h.country
        })),
        country: country || 'US'
      }
    });
  } catch (error) {
    logger.error('Error getting holidays in range:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const toggleHolidayStatus = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { userId, activate } = req.body;

    if (!userId) {
      await transaction.rollback();
      return res.status(400).json({ success: false, error: 'userId is required' });
    }

    const holiday = await Holiday.findByPk(id, { transaction });
    if (!holiday) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: 'Holiday not found' });
    }

    const user = await resolveUser(userId, transaction);
    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    if (!hasHolidayPermission(user)) {
      await transaction.rollback();
      return res.status(403).json({ success: false, error: 'Insufficient permissions to modify holiday status' });
    }

    holiday.is_active = activate;
    holiday.status = activate ? 'ACTIVE' : 'INACTIVE';
    holiday.updated_at = new Date();
    await holiday.save({ transaction });
    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: `Holiday ${activate ? 'activated' : 'deactivated'} successfully`,
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
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ========== CONFIGURATION ENDPOINTS (fixed with dynamic model) ==========

// ========== NAMED EXPORTS (all holiday CRUD functions unchanged) ==========
// ... (keep all existing holiday functions: isDateHoliday, getAllHolidays, etc.)
// To save space, I'm not repeating them here – they remain exactly as in your previous version.
// Only the configuration endpoints are updated.

// ========== CONFIGURATION ENDPOINTS (FIXED) ==========

export const getSkipRepaymentConfig = async (req, res) => {
  try {
    let skipHoliday = true;
    try {
      const Configuration = getConfigurationModel();
      const config = await Configuration.findOne({ where: { key: 'skip_repayment_on_holiday' } });
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
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateSkipRepaymentConfig = async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const token = authHeader.split(' ')[1];

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    logger.error('Token verification failed:', err.message);
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  const userId = decoded.user_name || decoded.username || decoded.id || decoded.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: 'Invalid token payload' });
  }
  const user = await resolveUser(userId);
  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  if (!hasHolidayPermission(user)) {
    return res.status(403).json({ success: false, error: 'Insufficient permissions to update configuration' });
  }

  const { skip_repayment_on_holiday } = req.body;
  if (typeof skip_repayment_on_holiday !== 'boolean') {
    return res.status(400).json({ success: false, error: 'skip_repayment_on_holiday must be a boolean' });
  }

  try {
    const Configuration = getConfigurationModel();
    await Configuration.upsert({
      key: 'skip_repayment_on_holiday',
      value: skip_repayment_on_holiday ? 'true' : 'false',
      updated_by: user.id,        // ✅ fixed: use numeric user ID
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
    return res.status(500).json({ success: false, error: error.message });
  }
};


// ========== DEFAULT EXPORT ==========
const HolidayController = {
  isDateHoliday,
  getAllHolidays,
  getHolidayById,
  createHoliday,
  updateHolidayByDate,
  deleteHoliday,
  bulkCreateHolidays,
  getHolidaysForMonth,
  getUpcomingHolidays,
  getHolidaysInRange,
  toggleHolidayStatus,
  getSkipRepaymentConfig,
  updateSkipRepaymentConfig
};
export default HolidayController;