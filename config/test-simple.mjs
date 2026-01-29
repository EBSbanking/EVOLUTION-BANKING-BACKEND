// test-mysql-connection.mjs
import mysql from 'mysql2/promise';

async function testMySQL() {
  console.log('🧪 Testing MySQL connection for Evolution Banking...\n');
  
  // Test different configurations
  const testCases = [
    { name: 'Localhost - root with empty password', config: { host: 'localhost', user: 'root', password: '' } },
    { name: '127.0.0.1 - root with empty password', config: { host: '127.0.0.1', user: 'root', password: '' } },
    { name: 'Localhost - root with no password', config: { host: 'localhost', user: 'root', password: null } },
    { name: 'Localhost - root (no password field)', config: { host: 'localhost', user: 'root' } },
  ];
  
  for (const testCase of testCases) {
    console.log(`🔍 Testing: ${testCase.name}`);
    
    try {
      const connection = await mysql.createConnection({
        host: testCase.config.host,
        port: 3306,
        user: testCase.config.user,
        password: testCase.config.password || '',
        database: 'mysql', // Connect to system database first
        connectTimeout: 5000,
        decimalNumbers: true,
      });
      
      console.log(`   ✅ Connected successfully!`);
      
      // Check if core_banking exists
      const [databases] = await connection.query('SHOW DATABASES');
      const dbNames = databases.map(db => db.Database);
      
      if (dbNames.includes('core_banking')) {
        console.log(`   ✅ Found 'core_banking' database`);
        
        // Test connecting to core_banking directly
        await connection.end();
        const appConnection = await mysql.createConnection({
          host: testCase.config.host,
          port: 3306,
          user: testCase.config.user,
          password: testCase.config.password || '',
          database: 'core_banking',
          connectTimeout: 5000,
        });
        
        const [tables] = await appConnection.query('SHOW TABLES');
        console.log(`   📊 Tables in core_banking: ${tables.length} tables`);
        await appConnection.end();
        
      } else {
        console.log(`   ⚠️  Database 'core_banking' not found`);
        
        // Try to create it
        try {
          await connection.query("CREATE DATABASE IF NOT EXISTS core_banking CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
          console.log(`   ✅ Created 'core_banking' database`);
        } catch (createError) {
          console.log(`   ❌ Could not create database: ${createError.message}`);
        }
      }
      
      // Get MySQL version
      const [versionResult] = await connection.query('SELECT VERSION() as version');
      console.log(`   📊 MySQL Version: ${versionResult[0].version}`);
      
      await connection.end();
      console.log(`   🎉 Configuration works: ${JSON.stringify(testCase.config)}\n`);
      
      // Return successful config
      return {
        success: true,
        config: {
          host: testCase.config.host,
          port: 3306,
          user: testCase.config.user,
          password: testCase.config.password || '',
          database: 'core_banking',
        }
      };
      
    } catch (error) {
      console.log(`   ❌ Failed: ${error.message}`);
      if (error.code) console.log(`      Code: ${error.code}`);
      
      // Specific error suggestions
      if (error.code === 'ER_ACCESS_DENIED_ERROR') {
        console.log(`   💡 Try a different password or check user privileges`);
      } else if (error.code === 'ECONNREFUSED') {
        console.log(`   💡 MySQL might not be running on ${testCase.config.host}:3306`);
      } else if (error.code === 'ETIMEDOUT') {
        console.log(`   💡 Connection timeout - check firewall or MySQL bind address`);
      }
      console.log('');
    }
  }
  
  console.log('\n❌ All connection tests failed.');
  console.log('\n🔧 TROUBLESHOOTING STEPS:');
  console.log('1. Open XAMPP Control Panel');
  console.log('2. Make sure MySQL is GREEN and says "Running"');
  console.log('3. If MySQL won\'t start:');
  console.log('   - Click MySQL "Config" → "my.ini"');
  console.log('   - Add under [mysqld]: innodb_force_recovery = 6');
  console.log('   - Add under [mysqld]: skip-innodb');
  console.log('   - Save and restart MySQL');
  console.log('\n4. If still not working, delete corrupted files:');
  console.log('   - C:\\xamp\\mysql\\data\\ibdata1');
  console.log('   - C:\\xamp\\mysql\\data\\ib_logfile0');
  console.log('   - C:\\xamp\\mysql\\data\\ib_logfile1');
  
  return { success: false };
}

// Also test Sequelize-style connection
async function testSequelizeConnection() {
  console.log('\n🔗 Testing Sequelize-style connection...');
  
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      port: 3306,
      user: 'root',
      password: '',
      connectTimeout: 5000,
    });
    
    console.log('✅ Sequelize connection test passed');
    await connection.end();
    return true;
  } catch (error) {
    console.log(`❌ Sequelize connection failed: ${error.message}`);
    return false;
  }
}

// Main execution
console.log('='.repeat(60));
console.log('EVOLUTION BANKING - MySQL Connection Diagnostics');
console.log('='.repeat(60));

testMySQL().then(result => {
  if (result.success) {
    console.log('\n' + '='.repeat(60));
    console.log('🎉 SUCCESS! Use this config in your app:');
    console.log('='.repeat(60));
    console.log(`
// config/db.js
const dbConfig = {
  host: '${result.config.host}',
  port: ${result.config.port},
  user: '${result.config.user}',
  password: '${result.config.password}',
  database: '${result.config.database}',
  connectionLimit: 10,
  connectTimeout: 10000,
};
    `);
    console.log('='.repeat(60));
  }
  
  return testSequelizeConnection();
}).then(() => {
  console.log('\n✅ Diagnostics complete.');
  process.exit(0);
}).catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});