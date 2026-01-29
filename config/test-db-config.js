// test-db-connection.js - Save this in your project root
import { testConnection, checkConnection, getPool, getSequelize } from '../config/db.js';

async function testDatabaseConnection() {
  console.log('🔍 Testing Database Connection\n');
  console.log('='.repeat(60));
  
  try {
    // Test 1: Direct connection test
    console.log('1️⃣ Testing MySQL2 Pool Connection...');
    try {
      const pool = getPool();
      const connection = await pool.getConnection();
      await connection.query('SELECT 1');
      connection.release();
      console.log('   ✅ MySQL2 Pool: Connected successfully');
    } catch (error) {
      console.log(`   ❌ MySQL2 Pool Failed: ${error.message}`);
      console.log(`   💡 Error Code: ${error.code}`);
    }
    
    // Test 2: Sequelize connection test
    console.log('\n2️⃣ Testing Sequelize Connection...');
    try {
      const sequelize = getSequelize();
      await sequelize.authenticate();
      console.log('   ✅ Sequelize: Connected successfully');
    } catch (error) {
      console.log(`   ❌ Sequelize Failed: ${error.message}`);
    }
    
    // Test 3: Combined test
    console.log('\n3️⃣ Running Combined Connection Test...');
    const combinedResult = await testConnection();
    console.log(combinedResult ? '   ✅ Combined test passed' : '   ❌ Combined test failed');
    
    // Test 4: Detailed status
    console.log('\n4️⃣ Getting Connection Status...');
    const status = await checkConnection();
    
    console.log('\n📊 FINAL CONNECTION STATUS:');
    console.log('='.repeat(60));
    console.log(`   Connected: ${status.connected ? '✅ YES' : '❌ NO'}`);
    console.log(`   Message: ${status.message}`);
    console.log(`   Database: ${status.database}`);
    console.log(`   Host: ${status.host}`);
    console.log(`   Auto-sync: ${status.autoSyncEnabled ? '✅ Enabled' : '❌ Disabled'}`);
    console.log(`   Models loaded: ${status.modelsCount}`);
    console.log(`   Timestamp: ${status.timestamp}`);
    console.log('='.repeat(60));
    
    if (status.connected) {
      console.log('\n🎉 SUCCESS! Database connection is working!');
      console.log('\n💡 Next steps:');
      console.log('   1. Start your application: node server');
      console.log('   2. Check if tables sync automatically');
      console.log('   3. If not, run: node sync-tables.js');
    } else {
      console.log('\n🔧 TROUBLESHOOTING REQUIRED:');
      console.log('   1. Check if MySQL service is running:');
      console.log('      netstat -an | findstr :3306');
      console.log('   2. Try connecting manually:');
      console.log('      "C:\\xamp\\mysql\\bin\\mysql.exe" -u root');
      console.log('   3. Check .env file configuration');
      console.log('   4. Verify config/db.js settings');
    }
    
  } catch (error) {
    console.error('\n❌ Unexpected error during test:', error.message);
    console.error(error.stack);
  }
}

// Run the test
testDatabaseConnection().catch(console.error);