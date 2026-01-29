// fix-timestamps.js
import { getSequelize } from '../config/db.js';

async function fixModelTimestamps() {
  const sequelize = getSequelize();
  
  try {
    // First, let's check the current table structure
    const [columns] = await sequelize.query(`
      SHOW COLUMNS FROM users
    `);
    
    console.log('Current users table columns:');
    columns.forEach(col => console.log(`- ${col.Field} (${col.Type})`));
    
    // Check if we have timestamp columns
    const hasCreatedAt = columns.some(col => col.Field === 'created_at');
    const hasUpdatedAt = columns.some(col => col.Field === 'updated_at');
    
    if (!hasCreatedAt || !hasUpdatedAt) {
      console.log('\nAdding missing timestamp columns...');
      
      if (!hasCreatedAt) {
        await sequelize.query(`
          ALTER TABLE users 
          ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        `);
        console.log('Added created_at column');
      }
      
      if (!hasUpdatedAt) {
        await sequelize.query(`
          ALTER TABLE users 
          ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        `);
        console.log('Added updated_at column');
      }
      
      console.log('\n✓ Timestamp columns added successfully!');
    } else {
      console.log('\n✓ Timestamp columns already exist');
    }
    
    // Verify the fix
    const userCount = await sequelize.query(`
      SELECT COUNT(*) as count FROM users
    `, { type: sequelize.QueryTypes.SELECT });
    
    console.log(`\nTotal users in database: ${userCount[0].count}`);
    
  } catch (error) {
    console.error('Error fixing timestamps:', error);
  } finally {
    await sequelize.close();
  }
}

fixModelTimestamps();