// migrations/add-timestamps.js
import { getSequelize } from '../config/db.js';

async function migrate() {
  const sequelize = getSequelize();
  
  try {
    console.log('Starting migration...');
    
    // Check and add created_at column
    const [createdAtResult] = await sequelize.query(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'users' 
       AND COLUMN_NAME = 'created_at'`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    if (createdAtResult.count === 0) {
      await sequelize.query(`
        ALTER TABLE users 
        ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      `);
      console.log('✓ Added created_at column');
    } else {
      console.log('✓ created_at column already exists');
    }
    
    // Check and add updated_at column
    const [updatedAtResult] = await sequelize.query(
      `SELECT COUNT(*) as count FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_SCHEMA = DATABASE() 
       AND TABLE_NAME = 'users' 
       AND COLUMN_NAME = 'updated_at'`,
      { type: sequelize.QueryTypes.SELECT }
    );
    
    if (updatedAtResult.count === 0) {
      await sequelize.query(`
        ALTER TABLE users 
        ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      `);
      console.log('✓ Added updated_at column');
    } else {
      console.log('✓ updated_at column already exists');
    }
    
    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await sequelize.close();
  }
}

// Run migration
migrate();