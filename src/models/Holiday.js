// src/models/Holiday.js
import { DataTypes, Op } from 'sequelize';
import sequelize from '../../config/db.js';

const Holiday = sequelize.define('Holiday', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  holidayDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'holiday_date',
    validate: {
      isDate: true,
      notNull: { msg: 'Holiday date is required' }
    }
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Description cannot be empty' }
    }
  },
  holidayName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'holiday_name',
    validate: {
      notEmpty: { msg: 'Holiday name cannot be empty' }
    }
  },
  recurring: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'recurring',
    comment: 'If true, holiday recurs annually on same month/day'
  },
  country: {
    type: DataTypes.STRING(2),
    allowNull: false,
    defaultValue: 'NG',
    field: 'country',
    validate: {
      is: /^[A-Z]{2}$/,
      len: [2, 2]
    }
  },
  status: {
    type: DataTypes.ENUM('ACTIVE', 'INACTIVE'),
    defaultValue: 'ACTIVE',
    field: 'status'
  },
  is_active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'created_by',
    references: {
      model: 'users',
      key: 'id'
    }
  },
  metadata: {
    type: DataTypes.JSON,
    defaultValue: {},
    field: 'metadata',
    comment: 'Additional holiday metadata (religious, federal, regional, etc.)'
  }
}, {
  tableName: 'holidays',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  
  hooks: {
    beforeValidate: (holiday) => {
      // Normalize date before validation
      if (holiday.holidayDate) {
        const date = new Date(holiday.holidayDate);
        if (!isNaN(date.getTime())) {
          holiday.holidayDate = date.toISOString().split('T')[0];
        }
      }
      
      // Sync status with is_active
      if (holiday.status === 'ACTIVE') {
        holiday.is_active = true;
      } else if (holiday.status === 'INACTIVE') {
        holiday.is_active = false;
      } else if (holiday.is_active !== undefined) {
        holiday.status = holiday.is_active ? 'ACTIVE' : 'INACTIVE';
      }
    },
    
    beforeCreate: (holiday) => {
      if (holiday.holidayDate) {
        const date = new Date(holiday.holidayDate);
        if (!isNaN(date.getTime())) {
          holiday.holidayDate = date.toISOString().split('T')[0];
        }
      }
    },
    
    beforeUpdate: (holiday) => {
      if (holiday.changed('holidayDate')) {
        const date = new Date(holiday.holidayDate);
        if (!isNaN(date.getTime())) {
          holiday.holidayDate = date.toISOString().split('T')[0];
        }
      }
      
      // Keep status and is_active in sync
      if (holiday.changed('status')) {
        holiday.is_active = holiday.status === 'ACTIVE';
      } else if (holiday.changed('is_active')) {
        holiday.status = holiday.is_active ? 'ACTIVE' : 'INACTIVE';
      }
    }
  },
  
  indexes: [
    {
      fields: ['holiday_date']
    },
    {
      fields: ['country']
    },
    {
      fields: ['recurring']
    },
    {
      fields: ['status']
    },
    {
      fields: ['is_active']
    },
    {
      fields: ['created_by']
    }
  ]
});

// =============================================
// HELPER: Check if table exists
// =============================================

let tableExistsCache = null;
let tableExistsCacheTime = 0;

async function checkTableExists() {
  // Cache for 30 seconds to avoid excessive queries
  const now = Date.now();
  if (tableExistsCache && (now - tableExistsCacheTime) < 30000) {
    return tableExistsCache;
  }
  
  try {
    const [tables] = await sequelize.query(`
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name = 'holidays'
    `);
    tableExistsCache = tables && tables.length > 0;
    tableExistsCacheTime = now;
    return tableExistsCache;
  } catch (error) {
    console.warn('?? Could not check if holidays table exists:', error.message);
    return false;
  }
}

// =============================================
// INSTANCE METHODS
// =============================================

/**
 * Check if this holiday occurs on a given date
 */
Holiday.prototype.occursOn = function(date) {
  const checkDate = new Date(date);
  const holidayDate = new Date(this.holidayDate);
  
  if (this.recurring) {
    return checkDate.getMonth() === holidayDate.getMonth() && 
           checkDate.getDate() === holidayDate.getDate();
  } else {
    return checkDate.toISOString().split('T')[0] === this.holidayDate;
  }
};

/**
 * Get the next occurrence of this holiday
 */
Holiday.prototype.getNextOccurrence = function(baseDate = new Date()) {
  const checkDate = new Date(baseDate);
  const holidayDate = new Date(this.holidayDate);
  
  if (this.recurring) {
    const nextDate = new Date(checkDate.getFullYear(), holidayDate.getMonth(), holidayDate.getDate());
    if (nextDate < checkDate) {
      nextDate.setFullYear(nextDate.getFullYear() + 1);
    }
    return nextDate;
  } else {
    return holidayDate > checkDate ? holidayDate : null;
  }
};

// =============================================
// STATIC METHODS
// =============================================

/**
 * Check if a date is a holiday - PRODUCTION VERSION
 */
Holiday.isHoliday = async function(date, options = {}) {
  try {
    const inputDate = new Date(date);
    if (isNaN(inputDate.getTime())) {
      return null;
    }

    // Check if table exists first
    const tableExists = await checkTableExists();
    if (!tableExists) {
      return null;
    }

    const dateStr = inputDate.toISOString().split('T')[0];
    const month = inputDate.getMonth() + 1; // MySQL MONTH() returns 1-12
    const day = inputDate.getDate();
    
    // Build query with proper column checks
    let query = `
      SELECT * FROM holidays 
      WHERE (
        holiday_date = :dateStr
        OR 
        (recurring = true AND 
         MONTH(holiday_date) = :month AND 
         DAY(holiday_date) = :day)
      )
    `;
    
    // Check for status columns
    try {
      const [columns] = await sequelize.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'holidays' 
        AND COLUMN_NAME IN ('is_active', 'status')
      `);
      
      const columnNames = columns.map(c => c.COLUMN_NAME);
      
      if (columnNames.includes('is_active')) {
        query += ` AND is_active = true`;
      } else if (columnNames.includes('status')) {
        query += ` AND status = 'ACTIVE'`;
      }
      // If neither column exists, assume all holidays are active
      
    } catch (err) {
      console.warn('Could not check columns, assuming all holidays active:', err.message);
    }
    
    // Add country filter
    if (options.country) {
      query += ` AND country = :country`;
    }
    
    query += ` LIMIT 1`;
    
    const [result] = await sequelize.query(query, {
      replacements: { 
        dateStr, 
        month,
        day,
        country: options.country || 'NG'
      },
      type: sequelize.QueryTypes.SELECT
    });

    return result || null;
  } catch (error) {
    // Don't log full error for missing table to reduce noise
    if (error.message && (error.message.includes('doesn\'t exist') || error.message.includes('does not exist'))) {
      console.warn('?? Holidays table not available:', error.message);
    } else {
      console.error('Error checking holiday:', error.message);
    }
    return null; // Return null to prevent EOD failure
  }
};

/**
 * Get holidays for a specific month/year
 */
Holiday.getHolidaysForMonth = async function(year, month, options = {}) {
  try {
    // Check if table exists
    const tableExists = await checkTableExists();
    if (!tableExists) {
      return [];
    }
    
    const startDate = new Date(year, month, 1);
    const endDate = new Date(year, month + 1, 0);
    
    const whereClause = {
      [Op.or]: [
        {
          holidayDate: {
            [Op.between]: [startDate, endDate]
          }
        },
        {
          recurring: true
        }
      ]
    };
    
    // Add status filter if columns exist
    try {
      const [columns] = await sequelize.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'holidays' 
        AND COLUMN_NAME IN ('is_active', 'status')
      `);
      
      const columnNames = columns.map(c => c.COLUMN_NAME);
      
      if (columnNames.includes('is_active')) {
        whereClause.is_active = true;
      } else if (columnNames.includes('status')) {
        whereClause.status = 'ACTIVE';
      }
    } catch (err) {
      console.warn('Could not check columns for status filter');
    }
    
    if (options.country) {
      whereClause.country = options.country;
    }
    
    const holidays = await this.findAll({
      where: whereClause,
      order: [
        ['recurring', 'ASC'],
        ['holidayDate', 'ASC']
      ]
    });
    
    // Filter recurring holidays to only those that occur in this month
    return holidays.filter(holiday => {
      if (holiday.recurring) {
        const holidayMonth = new Date(holiday.holidayDate).getMonth();
        return holidayMonth === month;
      }
      return true;
    });
  } catch (error) {
    console.error('Error getting holidays for month:', error.message);
    return [];
  }
};

/**
 * Get holidays in a date range
 */
Holiday.getHolidaysInRange = async function(startDate, endDate, options = {}) {
  try {
    // Check if table exists
    const tableExists = await checkTableExists();
    if (!tableExists) {
      return [];
    }
    
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const whereClause = {
      [Op.or]: [
        {
          holidayDate: {
            [Op.between]: [start, end]
          }
        },
        {
          recurring: true
        }
      ]
    };
    
    // Add status filter if columns exist
    try {
      const [columns] = await sequelize.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'holidays' 
        AND COLUMN_NAME IN ('is_active', 'status')
      `);
      
      const columnNames = columns.map(c => c.COLUMN_NAME);
      
      if (columnNames.includes('is_active')) {
        whereClause.is_active = true;
      } else if (columnNames.includes('status')) {
        whereClause.status = 'ACTIVE';
      }
    } catch (err) {
      console.warn('Could not check columns for status filter');
    }
    
    if (options.country) {
      whereClause.country = options.country;
    }
    
    const holidays = await this.findAll({
      where: whereClause,
      order: [['holidayDate', 'ASC']]
    });
    
    // Filter and map recurring holidays to actual dates in the range
    const result = [];
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();
    
    for (const holiday of holidays) {
      if (holiday.recurring) {
        const hDate = new Date(holiday.holidayDate);
        const month = hDate.getMonth();
        const day = hDate.getDate();
        
        for (let year = startYear; year <= endYear; year++) {
          const occurrence = new Date(year, month, day);
          if (occurrence >= start && occurrence <= end) {
            result.push({
              ...holiday.toJSON(),
              actualDate: occurrence
            });
          }
        }
      } else {
        result.push(holiday);
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error getting holidays in range:', error.message);
    return [];
  }
};

/**
 * Create a new holiday with validation
 */
Holiday.createHoliday = async function(holidayData, options = {}) {
  // Check if table exists
  const tableExists = await checkTableExists();
  if (!tableExists) {
    throw new Error('Holidays table does not exist. Please run migrations first.');
  }
  
  const transaction = options.transaction;
  
  try {
    if (!holidayData.holidayDate || !holidayData.holidayName) {
      throw new Error('Holiday date and name are required');
    }
    
    const date = new Date(holidayData.holidayDate);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date provided');
    }
    
    const dateStr = date.toISOString().split('T')[0];
    const country = holidayData.country || 'NG';
    
    // Check if holiday already exists
    const existing = await this.findOne({
      where: {
        holidayDate: dateStr,
        country: country
      },
      transaction
    });
    
    if (existing) {
      throw new Error(`Holiday already exists for ${dateStr} in ${country}`);
    }
    
    const data = {
      ...holidayData,
      holidayDate: dateStr,
      country,
      status: holidayData.status || 'ACTIVE',
      is_active: holidayData.is_active !== undefined ? holidayData.is_active : true
    };
    
    return await this.create(data, { transaction });
  } catch (error) {
    console.error('Error creating holiday:', error.message);
    throw error;
  }
};

/**
 * Update an existing holiday
 */
Holiday.updateHoliday = async function(id, updateData, options = {}) {
  // Check if table exists
  const tableExists = await checkTableExists();
  if (!tableExists) {
    throw new Error('Holidays table does not exist. Please run migrations first.');
  }
  
  const transaction = options.transaction;
  
  try {
    const holiday = await this.findByPk(id, { transaction });
    if (!holiday) {
      throw new Error(`Holiday with ID ${id} not found`);
    }
    
    // Validate date if provided
    if (updateData.holidayDate) {
      const date = new Date(updateData.holidayDate);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid date provided');
      }
      updateData.holidayDate = date.toISOString().split('T')[0];
    }
    
    await holiday.update(updateData, { transaction });
    return holiday;
  } catch (error) {
    console.error('Error updating holiday:', error.message);
    throw error;
  }
};

/**
 * Delete a holiday (soft delete by setting status to INACTIVE)
 */
Holiday.deleteHoliday = async function(id, options = {}) {
  // Check if table exists
  const tableExists = await checkTableExists();
  if (!tableExists) {
    throw new Error('Holidays table does not exist. Please run migrations first.');
  }
  
  const transaction = options.transaction;
  const permanent = options.permanent || false;
  
  try {
    const holiday = await this.findByPk(id, { transaction });
    if (!holiday) {
      throw new Error(`Holiday with ID ${id} not found`);
    }
    
    if (permanent) {
      // Hard delete
      await holiday.destroy({ transaction });
      return { success: true, message: `Holiday "${holiday.holidayName}" permanently deleted` };
    } else {
      // Soft delete by setting status to INACTIVE
      await holiday.update({ 
        status: 'INACTIVE', 
        is_active: false 
      }, { transaction });
      return { success: true, message: `Holiday "${holiday.holidayName}" deactivated` };
    }
  } catch (error) {
    console.error('Error deleting holiday:', error.message);
    throw error;
  }
};

/**
 * Get upcoming holidays
 */
Holiday.getUpcomingHolidays = async function(days = 30, options = {}) {
  try {
    // Check if table exists
    const tableExists = await checkTableExists();
    if (!tableExists) {
      return [];
    }
    
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    return await this.getHolidaysInRange(today, futureDate, options);
  } catch (error) {
    console.error('Error getting upcoming holidays:', error.message);
    return [];
  }
};

/**
 * Check if a given date is a business day (not weekend or holiday)
 */
Holiday.isBusinessDay = async function(date, options = {}) {
  try {
    const checkDate = new Date(date);
    if (isNaN(checkDate.getTime())) {
      return false;
    }
    
    // Check if it's a weekend (Saturday = 6, Sunday = 0)
    const dayOfWeek = checkDate.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return false;
    }
    
    // Check if it's a holiday
    const holiday = await this.isHoliday(date, options);
    if (holiday) {
      return false;
    }
    
    return true;
  } catch (error) {
    console.error('Error checking business day:', error.message);
    // If there's an error, assume it's a business day to prevent blocking operations
    return true;
  }
};

/**
 * Get next business day after a given date
 */
Holiday.getNextBusinessDay = async function(date, options = {}) {
  try {
    const checkDate = new Date(date);
    if (isNaN(checkDate.getTime())) {
      return null;
    }
    
    let nextDate = new Date(checkDate);
    let maxAttempts = 365; // Prevent infinite loop
    
    while (maxAttempts > 0) {
      nextDate.setDate(nextDate.getDate() + 1);
      const isBusiness = await this.isBusinessDay(nextDate, options);
      if (isBusiness) {
        return nextDate;
      }
      maxAttempts--;
    }
    
    return null;
  } catch (error) {
    console.error('Error getting next business day:', error.message);
    // Fallback: return date + 1 day
    const nextDate = new Date(date);
    nextDate.setDate(nextDate.getDate() + 1);
    return nextDate;
  }
};

/**
 * Bulk create holidays
 */
Holiday.bulkCreateHolidays = async function(holidaysData, options = {}) {
  // Check if table exists
  const tableExists = await checkTableExists();
  if (!tableExists) {
    throw new Error('Holidays table does not exist. Please run migrations first.');
  }
  
  const transaction = options.transaction;
  const created = [];
  const errors = [];
  
  for (const data of holidaysData) {
    try {
      const holiday = await this.createHoliday(data, { transaction });
      created.push(holiday);
    } catch (error) {
      errors.push({
        data,
        error: error.message
      });
    }
  }
  
  return {
    created,
    errors,
    total: holidaysData.length,
    successful: created.length,
    failed: errors.length
  };
};

/**
 * Get all holidays with pagination and filtering
 */
Holiday.getHolidays = async function(options = {}) {
  try {
    // Check if table exists
    const tableExists = await checkTableExists();
    if (!tableExists) {
      return { data: [], total: 0 };
    }
    
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
    } = options;
    
    const offset = (page - 1) * limit;
    const whereClause = {};
    
    if (country) {
      whereClause.country = country;
    }
    
    if (status) {
      whereClause.status = status;
    } else {
      // Default: show all except soft-deleted
      whereClause.status = { [Op.ne]: 'DELETED' };
    }
    
    if (year) {
      whereClause[Op.and] = [
        sequelize.where(sequelize.fn('YEAR', sequelize.col('holiday_date')), year)
      ];
    }
    
    if (month) {
      whereClause[Op.and] = [
        ...(whereClause[Op.and] || []),
        sequelize.where(sequelize.fn('MONTH', sequelize.col('holiday_date')), month)
      ];
    }
    
    if (search) {
      whereClause[Op.or] = [
        { holidayName: { [Op.like]: `%${search}%` } },
        { description: { [Op.like]: `%${search}%` } }
      ];
    }
    
    const { count, rows } = await this.findAndCountAll({
      where: whereClause,
      order: [[sortBy, sortOrder]],
      limit,
      offset
    });
    
    return {
      data: rows,
      total: count,
      page,
      limit,
      totalPages: Math.ceil(count / limit)
    };
  } catch (error) {
    console.error('Error getting holidays:', error.message);
    return { data: [], total: 0 };
  }
};

// =============================================
// INITIALIZE TABLE IF NOT EXISTS
// =============================================

/**
 * Initialize the holidays table
 */
Holiday.initializeTable = async function(force = false) {
  try {
    const tableExists = await checkTableExists();
    
    if (!tableExists) {
      console.log('?? Creating holidays table...');
      await this.sync({ force: false });
      console.log('? Holidays table created successfully');
      tableExistsCache = true;
      tableExistsCacheTime = Date.now();
    } else if (force) {
      console.log('?? Recreating holidays table...');
      await this.sync({ force: true });
      console.log('? Holidays table recreated successfully');
    } else {
      console.log('? Holidays table already exists');
    }
    
    return true;
  } catch (error) {
    console.error('? Error initializing holidays table:', error.message);
    return false;
  }
};

export default Holiday;
