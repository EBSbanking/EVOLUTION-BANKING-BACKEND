// src/utils/initializeCounters.js
import logger from './logger.js';
import { sequelize } from '../../config/db.js';

const initializeCounters = async () => {
  try {
    logger.info('📊 Initializing counters...');
    
    // First, check if counters table exists
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_NAME = 'counters' 
      AND TABLE_SCHEMA = '${sequelize.config.database}'
    `);
    
    if (tables.length === 0) {
      logger.warn('Counters table does not exist');
      return false;
    }
    
    // Check what columns the table actually has
    const [columns] = await sequelize.query('DESCRIBE counters');
    logger.info('Counters table columns:', columns.map(col => col.Field));
    
    // Dynamically import Counter model
    const { default: Counter } = await import('../models/Counter.js');
    
    // Check if any counters exist
    const counters = await Counter.findAll();
    
    if (counters.length === 0) {
      logger.info('Creating default counters...');
      
      // Check if table uses _id or id
      const hasUnderscoreId = columns.some(col => col.Field === '_id');
      
      if (hasUnderscoreId) {
        // Table uses _id as primary key
        await Counter.bulkCreate([
          { id: 'customerId', name: 'customer', seq: 1000 },
          { id: 'accountId', name: 'account', seq: 10000 },
          { id: 'transactionId', name: 'transaction', seq: 100000 }
        ]);
      } else {
        // Table uses id (auto-increment)
        await Counter.bulkCreate([
          { name: 'customer', seq: 1000 },
          { name: 'account', seq: 10000 },
          { name: 'transaction', seq: 100000 }
        ]);
      }
      
      logger.info('✅ Default counters created');
    } else {
      logger.info(`Found ${counters.length} existing counters`);
    }
    
    return true;
    
  } catch (error) {
    logger.error('Counter initialization failed:', error.message);
    
    // If column mismatch, try to fix it
    if (error.message.includes('Unknown column') || error.message.includes('last_generated_at')) {
      logger.warn('Counter model has wrong column mapping. Trying alternative...');
      
      // Try with raw SQL
      try {
        await sequelize.query(`
          INSERT IGNORE INTO counters (name, seq) VALUES
          ('customer', 1000),
          ('account', 10000),
          ('transaction', 100000)
        `);
        logger.info('Counters initialized with raw SQL');
        return true;
      } catch (sqlError) {
        logger.error('Raw SQL also failed:', sqlError.message);
      }
    }
    
    return false;
  }
};

export default initializeCounters;