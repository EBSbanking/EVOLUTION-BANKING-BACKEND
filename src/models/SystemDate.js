// models/SystemDate.js - UPDATED TO MATCH DATABASE SCHEMA
import { DataTypes, Op } from 'sequelize';
import sequelize from '../../config/db.js';
import { calculateNextBusinessDate } from '../utils/dateUtils.js';
import logger from '../utils/logger.js';

const SystemDate = sequelize.define('SystemDate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  current_business_date: {  // ✅ FIXED: Use snake_case to match database
    type: DataTypes.DATE,
    allowNull: false,
    field: 'current_business_date'  // Explicit field mapping
  },
  next_business_date: {  // ✅ FIXED: Use snake_case
    type: DataTypes.DATE,
    allowNull: true,
    field: 'next_business_date'
  },
  last_e_o_d_date: {  // ✅ FIXED: Use snake_case
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_e_o_d_date'
  },
  last_e_o_d_processed_by: {  // ✅ FIXED: Use snake_case
    type: DataTypes.STRING(100),  // Changed from INTEGER to STRING to match VARCHAR(100)
    allowNull: true,
    field: 'last_e_o_d_processed_by'
  },
  is_e_o_d_processing: {  // ✅ FIXED: Use snake_case
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_e_o_d_processing'
  },
  eod_status: {  // ✅ FIXED: Use snake_case
    type: DataTypes.STRING(50),  // Changed from ENUM to STRING
    defaultValue: 'IDLE',
    field: 'eod_status'
  },
  eod_history: {  // ✅ FIXED: Use snake_case
    type: DataTypes.TEXT,  // Changed from JSON to TEXT
    allowNull: true,
    field: 'eod_history',
    get() {
      const rawValue = this.getDataValue('eod_history');
      if (!rawValue) return [];
      try {
        return JSON.parse(rawValue);
      } catch (e) {
        console.error('Error parsing eod_history:', e);
        return [];
      }
    },
    set(value) {
      if (Array.isArray(value)) {
        this.setDataValue('eod_history', JSON.stringify(value));
      } else if (typeof value === 'string') {
        this.setDataValue('eod_history', value);
      } else {
        this.setDataValue('eod_history', '[]');
      }
    }
  },
  createdAt: {
    type: DataTypes.DATE,
    field: 'created_at',
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    field: 'updated_at',
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'system_dates',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  underscored: true, // ✅ Important: This tells Sequelize to use snake_case
  hooks: {
    // Equivalent to pre-save hook
    beforeSave: async (systemDate, options) => {
      if (systemDate.changed('current_business_date')) {
        try {
          systemDate.next_business_date = await calculateNextBusinessDate(systemDate.current_business_date);
        } catch (error) {
          logger.error(`Failed to calculate next business date: ${error.message}`);
          throw new Error(`Failed to calculate next business date: ${error.message}`);
        }
      }
    },
    // Equivalent to post-save hook
    afterSave: (systemDate, options) => {
      logger.info('System date updated:', { 
        current_business_date: systemDate.current_business_date, 
        eod_status: systemDate.eod_status 
      });
    }
  },
  indexes: [
    {
      fields: ['current_business_date']
    },
    {
      fields: ['is_e_o_d_processing']
    },
    {
      fields: ['eod_status']
    }
  ]
});

// Add getters for camelCase access (optional, for backward compatibility)
SystemDate.prototype.getCurrentBusinessDate = function() {
  return this.current_business_date;
};

SystemDate.prototype.getNextBusinessDate = function() {
  return this.next_business_date;
};

SystemDate.prototype.getLastEODDate = function() {
  return this.last_e_o_d_date;
};

// Static method to clean up invalid data
SystemDate.cleanupInvalidData = async function() {
  const transaction = await sequelize.transaction();
  
  try {
    console.log('🧹 Cleaning up invalid SystemDate data...');
    
    // Find all system dates with eod_history
    const systemDates = await this.findAll({
      where: {
        eod_history: {
          [Op.ne]: null
        }
      },
      transaction
    });
    
    let modifiedCount = 0;
    
    for (const systemDate of systemDates) {
      let needsUpdate = false;
      const eodHistory = systemDate.eod_history;
      
      // Clean up eod_history entries
      if (typeof eodHistory === 'string') {
        try {
          const parsed = JSON.parse(eodHistory);
          if (Array.isArray(parsed)) {
            const cleanedHistory = parsed.map(history => {
              // Ensure processedBy is proper type
              if (history.processedBy && typeof history.processedBy === 'string') {
                needsUpdate = true;
                return { ...history, processedBy: history.processedBy };
              }
              return history;
            });
            
            if (needsUpdate) {
              await systemDate.update({
                eod_history: cleanedHistory
              }, { transaction });
              modifiedCount++;
            }
          }
        } catch (parseError) {
          console.warn('Invalid eod_history JSON:', parseError.message);
          // Fix invalid JSON
          await systemDate.update({
            eod_history: []
          }, { transaction });
          modifiedCount++;
        }
      }
    }
    
    await transaction.commit();
    console.log(`✅ Cleaned up ${modifiedCount} SystemDate records`);
    return modifiedCount;
    
  } catch (error) {
    await transaction.rollback();
    console.log('⚠️ Error cleaning up SystemDate data:', error.message);
    return 0;
  }
};

// Static method to get current system date
SystemDate.getCurrentSystemDate = async function() {
  try {
    const systemDate = await this.findOne({
      order: [['created_at', 'DESC']]
    });
    
    if (!systemDate) {
      console.log('ℹ️ No system date found, creating default...');
      // Initialize if not exists
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      let nextBusinessDate;
      try {
        nextBusinessDate = await calculateNextBusinessDate(today);
      } catch (error) {
        console.warn('Error calculating next business date:', error.message);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        nextBusinessDate = tomorrow;
      }
      
      return await this.create({
        current_business_date: today,
        next_business_date: nextBusinessDate,
        eod_status: 'IDLE',
        is_e_o_d_processing: false,
        eod_history: []
      });
    }
    
    return systemDate;
  } catch (error) {
    console.error('Error getting system date:', error);
    throw error;
  }
};

// Instance method to add to eod_history
SystemDate.prototype.addToEodHistory = function(historyEntry) {
  const eodHistory = Array.isArray(this.eod_history) ? this.eod_history : [];
  eodHistory.push(historyEntry);
  return this.update({ eod_history: eodHistory });
};

// Instance method to get latest EOD history
SystemDate.prototype.getLatestEodHistory = function() {
  const eodHistory = Array.isArray(this.eod_history) ? this.eod_history : [];
  return eodHistory.length > 0 ? eodHistory[eodHistory.length - 1] : null;
};

// Static method to ensure table exists with correct structure
SystemDate.ensureTableExists = async function() {
  try {
    // Check if table exists
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'system_dates'
    `);
    
    if (tables.length === 0) {
      console.log('📝 Creating system_dates table...');
      await sequelize.query(`
        CREATE TABLE system_dates (
          id INT PRIMARY KEY AUTO_INCREMENT,
          current_business_date DATE NOT NULL,
          next_business_date DATE,
          last_e_o_d_date DATE,
          last_e_o_d_processed_by VARCHAR(100),
          is_e_o_d_processing BOOLEAN DEFAULT FALSE,
          eod_status VARCHAR(50),
          eod_history TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ system_dates table created');
      
      // Insert default record
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      await sequelize.query(`
        INSERT INTO system_dates 
        (current_business_date, next_business_date, eod_status, is_e_o_d_processing, eod_history)
        VALUES (?, ?, 'IDLE', FALSE, '[]')
      `, {
        replacements: [today, tomorrow]
      });
      console.log('✅ Default system date record created');
    } else {
      console.log('✅ system_dates table already exists');
    }
  } catch (error) {
    console.error('❌ Error ensuring system_dates table exists:', error);
    throw error;
  }
};

export default SystemDate;