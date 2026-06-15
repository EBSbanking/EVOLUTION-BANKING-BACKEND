// models/SystemDate.js - Fully normalized camelCase model with snake_case DB mapping
import sequelize from '../../config/db.js';
import { calculateNextBusinessDate } from '../utils/dateUtils.js';
import logger from '../utils/logger.js';
import { DataTypes, Op } from 'sequelize';

const SystemDate = sequelize.define('SystemDate', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  currentBusinessDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'current_business_date'
  },
  nextBusinessDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    field: 'next_business_date'
  },
  lastEODDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
    field: 'last_e_o_d_date'
  },
  // New columns for manager dashboard
  lastEODProcessedBy: {
    type: DataTypes.STRING(50),
    allowNull: true,
    field: 'lastEODProcessedBy'
  },
  lastEODRun: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'lastEODRun'
  },
  // Legacy column (backward compatibility)
  lastEODProcessedByLegacy: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'last_e_o_d_processed_by'
  },
  isEODProcessing: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
    field: 'is_e_o_d_processing'
  },
  eodStatus: {
    type: DataTypes.STRING(50),
    defaultValue: 'IDLE',
    field: 'eod_status'
  },
  eodHistory: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'eod_history',
    get() {
      const rawValue = this.getDataValue('eodHistory');
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
        this.setDataValue('eodHistory', JSON.stringify(value));
      } else if (typeof value === 'string') {
        this.setDataValue('eodHistory', value);
      } else if (value && typeof value === 'object') {
        this.setDataValue('eodHistory', JSON.stringify(value));
      } else {
        this.setDataValue('eodHistory', '[]');
      }
    }
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  tableName: 'system_dates',
  timestamps: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  underscored: false,
  hooks: {
    beforeSave: async (systemDate) => {
      if (systemDate.changed('currentBusinessDate')) {
        try {
          const currentDate = new Date(systemDate.currentBusinessDate);
          const nextDate = await calculateNextBusinessDate(currentDate);
          systemDate.nextBusinessDate = nextDate.toISOString().split('T')[0];
        } catch (error) {
          logger.error(`Failed to calculate next business date: ${error.message}`);
          const currentDate = new Date(systemDate.currentBusinessDate);
          const nextDate = new Date(currentDate);
          nextDate.setDate(nextDate.getDate() + 1);
          systemDate.nextBusinessDate = nextDate.toISOString().split('T')[0];
        }
      }
    },
    afterSave: (systemDate) => {
      logger.info('System date updated:', {
        current_business_date: systemDate.currentBusinessDate,
        eod_status: systemDate.eodStatus
      });
    }
  },
  indexes: [
    { fields: ['currentBusinessDate'] },
    { fields: ['isEODProcessing'] },
    { fields: ['eodStatus'] }
  ]
});

// ========== Helper getters ==========
SystemDate.prototype.getCurrentBusinessDate = function() {
  return this.currentBusinessDate;
};

SystemDate.prototype.getNextBusinessDate = function() {
  return this.nextBusinessDate;
};

SystemDate.prototype.getLastEODDate = function() {
  return this.lastEODDate;
};

SystemDate.prototype.getLastEODProcessedBy = function() {
  return this.lastEODProcessedBy || this.lastEODProcessedByLegacy;
};

SystemDate.prototype.getLastEODRun = function() {
  return this.lastEODRun;
};

// ========== Static methods ==========
SystemDate.cleanupInvalidData = async function() {
  const transaction = await sequelize.transaction();
  try {
    console.log('🧹 Cleaning up invalid SystemDate data...');
    const systemDates = await this.findAll({
      where: { eodHistory: { [Op.ne]: null } },
      transaction
    });
    let modifiedCount = 0;
    for (const systemDate of systemDates) {
      let needsUpdate = false;
      const eodHistory = systemDate.eodHistory;
      if (typeof eodHistory === 'string') {
        try {
          const parsed = JSON.parse(eodHistory);
          if (Array.isArray(parsed)) {
            const cleanedHistory = parsed.map(history => {
              if (history.timestamp) needsUpdate = true;
              return history;
            });
            if (needsUpdate) {
              await systemDate.update({ eodHistory: cleanedHistory }, { transaction });
              modifiedCount++;
            }
          }
        } catch (parseError) {
          console.warn('Invalid eodHistory JSON:', parseError.message);
          await systemDate.update({ eodHistory: [] }, { transaction });
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

SystemDate.getCurrentSystemDate = async function() {
  try {
    let systemDate = await this.findOne({ order: [['createdAt', 'DESC']] });
    if (!systemDate) {
      console.log('ℹ️ No system date found, creating default...');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];
      let nextBusinessDate;
      try {
        nextBusinessDate = await calculateNextBusinessDate(today);
        const nextDateStr = nextBusinessDate.toISOString().split('T')[0];
        systemDate = await this.create({
          currentBusinessDate: todayStr,
          nextBusinessDate: nextDateStr,
          eodStatus: 'IDLE',
          isEODProcessing: false,
          eodHistory: []
        });
      } catch (error) {
        console.warn('Error calculating next business date:', error.message);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        systemDate = await this.create({
          currentBusinessDate: todayStr,
          nextBusinessDate: tomorrowStr,
          eodStatus: 'IDLE',
          isEODProcessing: false,
          eodHistory: []
        });
      }
    }
    return systemDate;
  } catch (error) {
    console.error('Error getting system date:', error);
    throw error;
  }
};

// ========== Instance methods ==========
SystemDate.prototype.addToEodHistory = async function(historyEntry) {
  const eodHistory = Array.isArray(this.eodHistory) ? this.eodHistory : [];
  if (!historyEntry.timestamp) historyEntry.timestamp = new Date();
  eodHistory.push(historyEntry);
  if (eodHistory.length > 100) eodHistory.splice(0, eodHistory.length - 100);
  return this.update({ eodHistory });
};

SystemDate.prototype.getLatestEodHistory = function() {
  const eodHistory = Array.isArray(this.eodHistory) ? this.eodHistory : [];
  return eodHistory.length > 0 ? eodHistory[eodHistory.length - 1] : null;
};

// ========== Table creation/upgrade ==========
SystemDate.ensureTableExists = async function() {
  try {
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
          next_business_date DATE NOT NULL,
          last_e_o_d_date DATE,
          last_e_o_d_processed_by VARCHAR(100),
          lastEODProcessedBy VARCHAR(50),
          lastEODRun DATETIME,
          is_e_o_d_processing BOOLEAN DEFAULT FALSE,
          eod_status VARCHAR(50) DEFAULT 'IDLE',
          eod_history TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);
      console.log('✅ system_dates table created');
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];
      await sequelize.query(`
        INSERT INTO system_dates 
        (current_business_date, next_business_date, eod_status, is_e_o_d_processing, eod_history)
        VALUES (?, ?, 'IDLE', FALSE, '[]')
      `, { replacements: [todayStr, tomorrowStr] });
      console.log('✅ Default system date record created');
    } else {
      console.log('✅ system_dates table already exists');
      const [records] = await sequelize.query(`SELECT COUNT(*) as count FROM system_dates`);
      if (records[0].count === 0) {
        console.log('📝 No records found, inserting default...');
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0];
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        await sequelize.query(`
          INSERT INTO system_dates 
          (current_business_date, next_business_date, eod_status, is_e_o_d_processing, eod_history)
          VALUES (?, ?, 'IDLE', FALSE, '[]')
        `, { replacements: [todayStr, tomorrowStr] });
        console.log('✅ Default system date record created');
      }
      // Ensure the new columns exist (idempotent)
      try {
        await sequelize.query(`ALTER TABLE system_dates ADD COLUMN lastEODProcessedBy VARCHAR(50) NULL`);
        console.log('✅ Added lastEODProcessedBy column');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) console.warn('Could not add lastEODProcessedBy:', err.message);
      }
      try {
        await sequelize.query(`ALTER TABLE system_dates ADD COLUMN lastEODRun DATETIME NULL`);
        console.log('✅ Added lastEODRun column');
      } catch (err) {
        if (!err.message.includes('Duplicate column')) console.warn('Could not add lastEODRun:', err.message);
      }
    }
  } catch (error) {
    console.error('❌ Error ensuring system_dates table exists:', error);
    throw error;
  }
};

export default SystemDate;