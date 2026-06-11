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
    defaultValue: 'US',
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
 * Check if a date is a holiday - FIXED VERSION
 */
Holiday.isHoliday = async function(date, options = {}) {
  try {
    const inputDate = new Date(date);
    if (isNaN(inputDate.getTime())) {
      return null;
    }

    const dateStr = inputDate.toISOString().split('T')[0];
    const month = inputDate.getMonth() + 1; // MySQL MONTH() returns 1-12
    const day = inputDate.getDate();
    
    // Build query conditionally based on what columns exist
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
    
    // Check if is_active column exists - if not, we'll skip that condition
    try {
      // Try to get table info
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
        country: options.country 
      },
      type: sequelize.QueryTypes.SELECT
    });

    return result || null;
  } catch (error) {
    console.error('Error checking holiday:', error);
    // Return null instead of throwing to prevent EOD failure
    return null;
  }
};

/**
 * Get holidays for a specific month/year
 */
Holiday.getHolidaysForMonth = async function(year, month, options = {}) {
  try {
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
    console.error('Error getting holidays for month:', error);
    return [];
  }
};

/**
 * Get holidays in a date range
 */
Holiday.getHolidaysInRange = async function(startDate, endDate, options = {}) {
  try {
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
    console.error('Error getting holidays in range:', error);
    return [];
  }
};

/**
 * Create a new holiday with validation
 */
Holiday.createHoliday = async function(holidayData, options = {}) {
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
    const country = holidayData.country || 'US';
    
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
    console.error('Error creating holiday:', error);
    throw error;
  }
};

/**
 * Get upcoming holidays
 */
Holiday.getUpcomingHolidays = async function(days = 30, options = {}) {
  try {
    const today = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    
    return await this.getHolidaysInRange(today, futureDate, options);
  } catch (error) {
    console.error('Error getting upcoming holidays:', error);
    return [];
  }
};

export default Holiday;