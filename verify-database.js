// verify-database.js
import { getPool } from './config/db.js';

async function verifyDatabase() {
  console.log('🔍 Verifying Database Setup\n');
  console.log('='.repeat(40));
  
  const pool = getPool();
  const connection = await pool.getConnection();
  
  try {
    // Get database info
    const [dbInfo] = await connection.query('SELECT DATABASE() as db, USER() as user, VERSION() as version');
    console.log('📊 Database Information:');
    console.log(`   Database: ${dbInfo[0].db}`);
    console.log(`   User: ${dbInfo[0].user}`);
    console.log(`   Version: ${dbInfo[0].version}`);
    
    // Get tables
    const [tables] = await connection.query('SHOW TABLES');
    console.log(`\n📋 Tables (${tables.length}):`);
    
    if (tables.length === 0) {
      console.log('   No tables found. Run: node sync-tables.js create');
    } else {
      tables.forEach((table, index) => {
        const tableName = table[`Tables_in_${dbInfo[0].db}`];
        console.log(`   ${index + 1}. ${tableName}`);
      });
      
      // Show table structures
      console.log('\n🏗️  Table Structures:');
      for (const table of tables) {
        const tableName = table[`Tables_in_${dbInfo[0].db}`];
        console.log(`\n${tableName}:`);
        
        const [columns] = await connection.query(`DESCRIBE ${tableName}`);
        columns.forEach(col => {
          const nullable = col.Null === 'YES' ? 'NULL' : 'NOT NULL';
          const key = col.Key ? ` [${col.Key}]` : '';
          console.log(`   - ${col.Field.padEnd(20)} ${col.Type.padEnd(20)} ${nullable}${key}`);
        });
      }
    }
    
    console.log('\n✅ Verification complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    connection.release();
    await pool.end();
  }
}

verifyDatabase();