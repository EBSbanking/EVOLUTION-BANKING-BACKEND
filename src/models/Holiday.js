// models/Holiday.js
import { DataTypes } from 'sequelize';
import sequelize from '../../config/db.js';

const Holiday = sequelize.define('Holiday', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  holidayDate: {
    type: DataTypes.DATE,
    allowNull: false,
    unique: true,
    field: 'holiday_date'
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  holidayName: {
    type: DataTypes.STRING(100),
    allowNull: false,
    field: 'holiday_name'
  },
  recurring: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  country: {
    type: DataTypes.STRING(2), // ISO country code
    allowNull: false,
    defaultValue: 'US'
  },
  createdBy: {
    type: DataTypes.INTEGER, // or STRING based on your User ID type
    allowNull: true,
    field: 'created_by',
    references: {
      model: 'users', // Make sure this matches your User table name
      key: 'id'
    }
  }
}, {
  tableName: 'holidays',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  hooks: {
    // Ensure date is normalized before saving
    beforeCreate: (holiday) => {
      if (holiday.holidayDate) {
        const date = new Date(holiday.holidayDate);
        date.setHours(0, 0, 0, 0);
        holiday.holidayDate = date;
      }
    },
    beforeUpdate: (holiday) => {
      if (holiday.changed('holidayDate')) {
        const date = new Date(holiday.holidayDate);
        date.setHours(0, 0, 0, 0);
        holiday.holidayDate = date;
      }
    }
  },
  indexes: [
    {
      unique: true,
      fields: ['holiday_date']
    },
    {
      fields: ['country']
    },
    {
      fields: ['recurring']
    },
    {
      fields: ['created_by']
    }
  ]
});

// âœ… Single static method to check if a given date is a holiday
Holiday.isHoliday = async function(date) {
  try {
    const inputDate = new Date(date);
    if (isNaN(inputDate.getTime())) {
      return null;
    }

    // Normalize to start & end of day
    const startOfDay = new Date(inputDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(inputDate);
    endOfDay.setHours(23, 59, 59, 999);

    // 1. Check for exact match using BETWEEN
    const exact = await this.findOne({
      where: {
        holidayDate: {
          [Op.between]: [startOfDay, endOfDay]
        }
      }
    });
    
    if (exact) {
      return exact;
    }

    // 2. Check recurring holidays (month/day match)
    // For MySQL, we can use EXTRACT or DATE_FORMAT
    const recurringHolidays = await this.findAll({
      where: {
        recurring: true
      }
    });

    const inputMonth = startOfDay.getMonth();
    const inputDay = startOfDay.getDate();

    for (const holiday of recurringHolidays) {
      const hDate = new Date(holiday.holidayDate);
      if (hDate.getMonth() === inputMonth && hDate.getDate() === inputDay) {
        return holiday;
      }
    }

    return null;
  } catch (error) {
    console.error('Error checking holiday:', error);
    throw error;
  }
};

// Alternative optimized method using raw SQL for recurring holidays
Holiday.isHolidayOptimized = async function(date) {
  try {
    const inputDate = new Date(date);
    if (isNaN(inputDate.getTime())) {
      return null;
    }

    // Format date for SQL
    const dateString = inputDate.toISOString().split('T')[0];
    
    // Query using raw SQL for better performance
    const [result] = await sequelize.query(`
      SELECT * FROM holidays 
      WHERE (
        -- Exact date match
        DATE(holiday_date) = :date
        OR 
        -- Recurring holiday (same month and day)
        (recurring = 1 AND 
         MONTH(holiday_date) = MONTH(:date) AND 
         DAY(holiday_date) = DAY(:date))
      )
      LIMIT 1
    `, {
      replacements: { date: dateString },
      type: sequelize.QueryTypes.SELECT
    });

    return result || null;
  } catch (error) {
    console.error('Error checking holiday (optimized):', error);
    throw error;
  }
};

// Get all holidays for a date range
Holiday.getHolidaysInRange = async function(startDate, endDate) {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    return await this.findAll({
      where: {
        holidayDate: {
          [Op.between]: [start, end]
        }
      },
      order: [['holidayDate', 'ASC']]
    });
  } catch (error) {
    console.error('Error getting holidays in range:', error);
    throw error;
  }
};

// Check if any date in a range is a holiday
Holiday.isRangeContainsHoliday = async function(startDate, endDate) {
  try {
    const holidays = await this.getHolidaysInRange(startDate, endDate);
    return holidays.length > 0;
  } catch (error) {
    console.error('Error checking range for holidays:', error);
    throw error;
  }
};

// Get next business day (not weekend, not holiday)
Holiday.getNextBusinessDay = async function(currentDate, country = 'US') {
  try {
    let nextDate = new Date(currentDate);
    
    // Loop to find next business day
    for (let i = 0; i < 365; i++) { // Max 1 year ahead
      nextDate.setDate(nextDate.getDate() + 1);
      
      // Check if weekend
      const dayOfWeek = nextDate.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        continue;
      }
      
      // Check if holiday
      const isHoliday = await this.isHoliday(nextDate);
      if (!isHoliday) {
        return nextDate;
      }
    }
    
    throw new Error('Could not find business day within 1 year');
  } catch (error) {
    console.error('Error getting next business day:', error);
    throw error;
  }
};

// Create holiday with validation
Holiday.createHoliday = async function(holidayData) {
  try {
    // Validate date
    const date = new Date(holidayData.holidayDate);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date provided');
    }
    
    // Normalize date
    date.setHours(0, 0, 0, 0);
    holidayData.holidayDate = date;
    
    // Check if holiday already exists for this date
    const existing = await this.findOne({
      where: {
        holidayDate: holidayData.holidayDate,
        country: holidayData.country || 'US'
      }
    });
    
    if (existing) {
      throw new Error(`Holiday already exists for ${date.toDateString()}`);
    }
    
    return await this.create(holidayData);
  } catch (error) {
    console.error('Error creating holiday:', error);
    throw error;
  }
};

// Bulk create holidays
Holiday.bulkCreateHolidays = async function(holidaysArray) {
  const transaction = await sequelize.transaction();
  
  try {
    const createdHolidays = [];
    
    for (const holidayData of holidaysArray) {
      const holiday = await this.createHoliday(holidayData);
      createdHolidays.push(holiday);
    }
    
    await transaction.commit();
    return createdHolidays;
  } catch (error) {
    await transaction.rollback();
    console.error('Error bulk creating holidays:', error);
    throw error;
  }
};

export default Holiday;
