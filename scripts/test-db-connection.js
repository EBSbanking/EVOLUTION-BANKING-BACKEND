// scripts/test-db-connection.js
import { connectWithInit } from '../config/db.js';

async function testConnection() {
  console.log('🔍 Testing MySQL database connection...');
  
  try {
    const sequelize = await connectWithInit();
    console.log('✅ Database connection successful!');
    
    // Test query
    const [result] = await sequelize.query('SELECT VERSION() as version');
    console.log(`📊 MySQL Version: ${result[0].version}`);
    
    // List tables
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME, TABLE_ROWS 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = 'core_banking'
    `);
    
    console.log(`📋 Found ${tables.length} tables in database`);
    
    if (tables.length > 0) {
      console.log('\n📊 Tables:');
      tables.forEach(table => {
        console.log(`   - ${table.TABLE_NAME} (${table.TABLE_ROWS} rows)`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();