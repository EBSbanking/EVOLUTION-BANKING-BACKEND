// scripts/migrateStateTable.js
import dotenv from 'dotenv';
import sequelize from '../config/db.js';

dotenv.config();

async function migrateStateTable() {
  let transaction = null;
  
  try {
    await sequelize.authenticate();
    console.log('✅ Database connected');

    transaction = await sequelize.transaction();

    // Check if id column already exists
    const [columns] = await sequelize.query('DESCRIBE states');
    const hasIdColumn = columns.some(col => col.Field === 'id');
    
    if (hasIdColumn) {
      console.log('✅ id column already exists in states table');
      await transaction.commit();
      process.exit(0);
      return;
    }

    console.log('🔄 Migrating states table to add id column...');

    // Step 1: Create a new table with the correct structure
    console.log('  📌 Creating temporary table with id column...');
    await sequelize.query(`
      CREATE TABLE states_new (
        id INT AUTO_INCREMENT PRIMARY KEY,
        STATE_ID VARCHAR(50) NOT NULL UNIQUE,
        STATE_NM VARCHAR(100) NOT NULL,
        COUNTRY_ID VARCHAR(50) NOT NULL,
        CREATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP,
        UPDATED_AT DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `, { transaction });

    // Step 2: Copy data from old table
    console.log('  📌 Copying data to new table...');
    await sequelize.query(`
      INSERT INTO states_new (STATE_ID, STATE_NM, COUNTRY_ID, CREATED_AT, UPDATED_AT)
      SELECT STATE_ID, STATE_NM, COUNTRY_ID, CREATED_AT, UPDATED_AT
      FROM states
    `, { transaction });

    // Step 3: Drop old table
    console.log('  📌 Dropping old table...');
    await sequelize.query(`DROP TABLE states`, { transaction });

    // Step 4: Rename new table
    console.log('  📌 Renaming new table...');
    await sequelize.query(`RENAME TABLE states_new TO states`, { transaction });

    console.log('✅ States table migration completed successfully!');
    console.log('   ✅ Added auto-increment id column');
    console.log('   ✅ Kept STATE_ID as unique identifier');

    await transaction.commit();
    process.exit(0);

  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    console.error('❌ Migration failed:', error.message);
    if (error.sql) {
      console.error('SQL:', error.sql);
    }
    process.exit(1);
  }
}

migrateStateTable();