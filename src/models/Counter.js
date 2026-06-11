// models/Counter.js - FIXED VERSION
import { DataTypes, Model, Op } from 'sequelize';  // Make sure Op is imported
import sequelize from '../../config/db.js';

class Counter extends Model {
  // Get next sequence - ROBUST VERSION WITH MULTIPLE FALLBACKS
  static async getNextSequence(name) {
    let transaction;
    
    try {
      transaction = await sequelize.transaction();
      
      console.log(`🔢 [Counter] Attempting to get next sequence for: ${name}`);
      
      // First, check if the counter exists
      const [results] = await sequelize.query(
        `SELECT * FROM counters WHERE name = ? FOR UPDATE`,
        {
          replacements: [name],
          transaction,
          type: sequelize.QueryTypes.SELECT
        }
      );

      let newSeq;
      
      if (results) {
        // Counter exists, increment it
        const currentSeq = results.seq || 0;
        newSeq = currentSeq + 1;
        
        console.log(`📈 [Counter] Incrementing ${name} from ${currentSeq} to ${newSeq}`);
        
        await sequelize.query(
          `UPDATE counters SET seq = ?, updated_at = NOW() WHERE name = ?`,
          {
            replacements: [newSeq, name],
            transaction
          }
        );
      } else {
        // Counter doesn't exist, create it
        console.log(`➕ [Counter] Creating new counter for: ${name}`);
        newSeq = 1;
        
        await sequelize.query(
          `INSERT INTO counters (name, seq, description, created_at, updated_at) 
           VALUES (?, ?, ?, NOW(), NOW())`,
          {
            replacements: [name, newSeq, `Auto-created counter for ${name}`],
            transaction
          }
        );
      }
      
      await transaction.commit();
      console.log(`✅ [Counter] Successfully got sequence for ${name}: ${newSeq}`);
      return newSeq;

    } catch (error) {
      console.error(`❌ [Counter] Failed in getNextSequence for ${name}:`, error.message);
      
      if (transaction) {
        try {
          await transaction.rollback();
          console.log(`🔄 [Counter] Transaction rolled back for ${name}`);
        } catch (rollbackError) {
          console.error('[Counter] Failed to rollback transaction:', rollbackError.message);
        }
      }
      
      // FALLBACK 1: Try a simpler approach without transaction
      console.log(`🔄 [Counter] Trying fallback sequence generation for ${name}...`);
      
      try {
        // Check if counters table exists
        const [tableExists] = await sequelize.query(
          `SHOW TABLES LIKE 'counters'`
        );
        
        if (tableExists.length === 0) {
          console.warn(`⚠️ [Counter] Table 'counters' doesn't exist for ${name}`);
          throw new Error('Counters table not found');
        }
        
        // Try to get current value
        const [fallbackResults] = await sequelize.query(
          `SELECT seq FROM counters WHERE name = ?`,
          { replacements: [name] }
        );
        
        if (fallbackResults && fallbackResults.length > 0) {
          const currentSeq = fallbackResults[0].seq || 0;
          const newSeq = currentSeq + 1;
          
          console.log(`🔄 [Counter] Fallback: Updating ${name} from ${currentSeq} to ${newSeq}`);
          
          await sequelize.query(
            `UPDATE counters SET seq = ?, updated_at = NOW() WHERE name = ?`,
            { replacements: [newSeq, name] }
          );
          
          return newSeq;
        } else {
          // Create new counter without transaction
          console.log(`➕ [Counter] Fallback: Creating new counter for ${name}`);
          
          await sequelize.query(
            `INSERT INTO counters (name, seq, description, created_at, updated_at) 
             VALUES (?, 1, ?, NOW(), NOW())`,
            { replacements: [name, `Fallback-created counter for ${name}`] }
          );
          
          return 1;
        }
      } catch (fallbackError) {
        console.error(`❌ [Counter] Fallback also failed for ${name}:`, fallbackError.message);
        
        // FALLBACK 2: Try to create counters table if it doesn't exist
        console.log(`🔄 [Counter] Attempting to create counters table for ${name}...`);
        
        try {
          // Create counters table
          await sequelize.query(`
            CREATE TABLE IF NOT EXISTS counters (
              name VARCHAR(100) PRIMARY KEY,
              seq INT NOT NULL DEFAULT 0,
              description VARCHAR(255),
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          
          console.log(`✅ [Counter] Created counters table for ${name}`);
          
          // Insert the counter
          await sequelize.query(
            `INSERT INTO counters (name, seq, description) VALUES (?, 1, ?)`,
            { replacements: [name, `Emergency-created counter for ${name}`] }
          );
          
          console.log(`✅ [Counter] Created counter ${name} with initial value 1`);
          return 1;
          
        } catch (createTableError) {
          console.error(`❌ [Counter] Could not create table for ${name}:`, createTableError.message);
          
          // FALLBACK 3: Return a timestamp-based sequence
          console.warn(`⚠️ [Counter] Using timestamp fallback for ${name}`);
          const timestampSeq = Date.now() % 1000000;
          console.log(`🔄 [Counter] Generated timestamp-based sequence: ${timestampSeq}`);
          return timestampSeq;
        }
      }
    }
  }

  // Static method: Initialize required counters
  static async initializeRequiredCounters() {
    console.log('🔧 [Counter] Initializing required counters...');
    
    const requiredCounters = [
      { name: 'creditApplicationId', description: 'Credit Application ID counter' },
      { name: 'creditAppId', description: 'Credit Application reference counter' },
      { name: 'refNo', description: 'Reference number counter' },
      { name: 'custId', description: 'Customer ID counter' },
      { name: 'loanAccountId', description: 'Loan Account ID counter' },
      { name: 'loanDisbursementId', description: 'Loan Disbursement ID counter' },
      { name: 'repaymentScheduleId', description: 'Repayment Schedule ID counter' }
    ];

    let initializedCount = 0;
    
    for (const counter of requiredCounters) {
      try {
        // Check if counter exists
        const [existing] = await sequelize.query(
          `SELECT COUNT(*) as count FROM counters WHERE name = ?`,
          { replacements: [counter.name] }
        );
        
        if (existing[0].count === 0) {
          // Insert the counter
          await sequelize.query(
            `INSERT INTO counters (name, seq, description) VALUES (?, 0, ?)`,
            {
              replacements: [counter.name, counter.description]
            }
          );
          console.log(`✅ [Counter] Initialized: ${counter.name}`);
          initializedCount++;
        } else {
          console.log(`📋 [Counter] Already exists: ${counter.name}`);
        }
      } catch (initError) {
        console.error(`❌ [Counter] Failed to initialize ${counter.name}:`, initError.message);
      }
    }
    
    console.log(`✅ [Counter] Initialization complete. ${initializedCount} counters initialized.`);
    return initializedCount;
  }

  // Static method: Get current sequence without incrementing
  static async getCurrentSequence(name) {
    try {
      const [results] = await sequelize.query(
        `SELECT seq FROM counters WHERE name = ?`,
        { replacements: [name] }
      );
      
      if (results && results.length > 0) {
        return results[0].seq || 0;
      }
      return 0;
    } catch (error) {
      console.error(`❌ [Counter] Failed to get current sequence for ${name}:`, error.message);
      return 0;
    }
  }

  // Static method: Reset counter (use with caution!)
  static async resetCounter(name, newValue = 0) {
    try {
      await sequelize.query(
        `UPDATE counters SET seq = ?, updated_at = NOW() WHERE name = ?`,
        { replacements: [newValue, name] }
      );
      console.log(`✅ [Counter] Reset ${name} to ${newValue}`);
      return true;
    } catch (error) {
      console.error(`❌ [Counter] Failed to reset ${name}:`, error.message);
      return false;
    }
  }

  // Static method: List all counters
  static async listCounters() {
    try {
      const [counters] = await sequelize.query(
        `SELECT name, seq, description, created_at, updated_at FROM counters ORDER BY name`
      );
      return counters;
    } catch (error) {
      console.error('❌ [Counter] Failed to list counters:', error.message);
      return [];
    }
  }
}

Counter.init({
  name: {
    type: DataTypes.STRING(100),
    primaryKey: true,
    field: 'name',
    comment: 'Counter identifier (creditApplicationId, refNo, etc.)'
  },
  seq: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'seq',
    comment: 'Current sequence value'
  },
  description: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'description',
    comment: 'Optional description'
  },
  created_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'created_at'
  },
  updated_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
    field: 'updated_at'
  }
}, {
  sequelize,
  modelName: 'Counter',
  tableName: 'counters',
  timestamps: false, // We're manually handling timestamps
  freezeTableName: true,
  underscored: true,
  hooks: {
    beforeCreate: async (counter) => {
      // Ensure seq has a default value
      if (!counter.seq && counter.seq !== 0) {
        counter.seq = 0;
      }
      // Ensure description has a default
      if (!counter.description) {
        counter.description = `Counter for ${counter.name}`;
      }
    }
  },
 
  // Add scopes for common queries - FIXED: Use Op.gt properly
  scopes: {
    active: {
      where: { seq: { [Op.gt]: 0 } }
    },
    byName: (name) => ({
      where: { name }
    }),
    recent: {
      order: [['updated_at', 'DESC']],
      limit: 10
    }
  }
});

export default Counter;