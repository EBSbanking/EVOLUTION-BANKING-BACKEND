// test-mysql.js - ES MODULE VERSION
import mysql from 'mysql2';
import net from 'net';

console.log('🔍 Testing MySQL Connection...\n');

// Test multiple configurations
const testConfigs = [
  {
    name: 'Localhost with core_banking',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: 'core_banking',
    connectTimeout: 10000
  },
  {
    name: '127.0.0.1 with core_banking',
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: 'core_banking',
    connectTimeout: 10000
  },
  {
    name: 'Localhost without database',
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: '',
    database: null,
    connectTimeout: 5000
  },
  {
    name: '127.0.0.1 without database',
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: '',
    database: null,
    connectTimeout: 5000
  }
];

let successfulConfig = null;

const testConnection = (config) => {
  return new Promise((resolve) => {
    console.log(`\n🔧 Testing: ${config.name}`);
    console.log(`   Host: ${config.host}:${config.port}`);
    console.log(`   User: ${config.user}`);
    console.log(`   Password: ${config.password ? '***' : '(empty)'}`);
    console.log(`   Database: ${config.database || '(none)'}`);
    
    const connection = mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      connectTimeout: config.connectTimeout
    });
    
    connection.connect((err) => {
      if (err) {
        console.log(`   ❌ Failed: ${err.message}`);
        
        // More specific error handling
        if (err.code === 'ER_ACCESS_DENIED_ERROR') {
          console.log(`   💡 Try: Check username/password`);
        } else if (err.code === 'ETIMEDOUT') {
          console.log(`   💡 Try: Increase connectTimeout or check firewall`);
        } else if (err.code === 'ECONNREFUSED') {
          console.log(`   💡 Try: MySQL might not be running on port ${config.port}`);
        } else if (err.code === 'ER_BAD_DB_ERROR') {
          console.log(`   💡 Try: Database '${config.database}' doesn't exist`);
        }
        
        connection.end();
        resolve({ success: false, error: err.message, config });
      } else {
        console.log(`   ✅ Connected successfully!`);
        
        // Test basic query
        connection.query('SELECT 1 as test', (err, results) => {
          if (err) {
            console.log(`   ⚠️  Basic query failed: ${err.message}`);
            resolve({ success: false, error: err.message, config });
          } else {
            console.log(`   ✅ Basic query successful`);
            
            // Get MySQL version and info
            connection.query('SELECT VERSION() as version, DATABASE() as current_db', (err, infoResults) => {
              if (!err && infoResults[0]) {
                console.log(`   📊 MySQL Version: ${infoResults[0].version}`);
                console.log(`   💾 Current Database: ${infoResults[0].current_db || '(none)'}`);
              }
              
              // Check if core_banking exists
              connection.query('SHOW DATABASES', (err, dbResults) => {
                if (!err) {
                  const databases = dbResults.map(db => db.Database);
                  console.log(`   📂 Total databases: ${databases.length}`);
                  
                  if (databases.includes('core_banking')) {
                    console.log(`   ✅ Found: core_banking database`);
                  } else {
                    console.log(`   ⚠️  Missing: core_banking database`);
                    
                    // Try to create it
                    connection.query('CREATE DATABASE IF NOT EXISTS core_banking CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci', (createErr) => {
                      if (!createErr) {
                        console.log(`   ✅ Created: core_banking database`);
                      } else {
                        console.log(`   ⚠️  Could not create database: ${createErr.message}`);
                      }
                    });
                  }
                }
                
                connection.end(() => {
                  resolve({ success: true, config });
                });
              });
            });
          }
        });
      }
    });
    
    // Handle timeout
    setTimeout(() => {
      if (connection.state !== 'authenticated') {
        console.log(`   ⏰ Connection timeout after ${config.connectTimeout}ms`);
        connection.destroy();
        resolve({ success: false, error: 'Connection timeout', config });
      }
    }, config.connectTimeout);
  });
};

const checkPort = () => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(2000);
    
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.on('error', () => {
      socket.destroy();
      resolve(false);
    });
    
    socket.connect(3306, 'localhost');
  });
};

const runAllTests = async () => {
  console.log('='.repeat(60));
  console.log('🔍 COMPREHENSIVE MYSQL CONNECTION TEST');
  console.log('='.repeat(60));
  
  console.log(`\n📊 Checking if MySQL is running on port 3306...`);
  
  const portOpen = await checkPort();
  console.log(`   Port 3306: ${portOpen ? '✅ Open (MySQL is running)' : '❌ Closed (MySQL not running)'}`);
  
  if (!portOpen) {
    console.log('\n💡 SOLUTIONS:');
    console.log('   1. Start MySQL from XAMPP Control Panel');
    console.log('   2. Check if another service is using port 3306');
    console.log('   3. Run: netstat -an | findstr :3306');
    process.exit(1);
  }
  
  // Test all configurations
  for (const config of testConfigs) {
    const result = await testConnection(config);
    
    if (result.success && !successfulConfig) {
      successfulConfig = config;
      
      // Test the successful config with core_banking specifically
      if (config.database !== 'core_banking') {
        console.log(`\n🔗 Testing core_banking with successful config...`);
        const coreBankingTest = await testConnection({
          ...config,
          name: 'core_banking final test',
          database: 'core_banking',
          connectTimeout: 10000
        });
        
        if (coreBankingTest.success) {
          console.log('\n' + '='.repeat(60));
          console.log('🎉 SUCCESS! USE THIS CONFIG IN YOUR APP:');
          console.log('='.repeat(60));
          console.log(`
const dbConfig = {
  host: '${config.host}',
  port: ${config.port},
  user: '${config.user}',
  password: '${config.password}',
  database: 'core_banking',
  connectionLimit: 10,
  connectTimeout: 10000
};
          `);
          console.log('='.repeat(60));
        }
      }
    }
  }
  
  if (!successfulConfig) {
    console.log('\n' + '='.repeat(60));
    console.log('❌ ALL CONNECTION TESTS FAILED');
    console.log('='.repeat(60));
    console.log('\n💡 TROUBLESHOOTING STEPS:');
    console.log('   1. Open XAMPP Control Panel');
    console.log('   2. Make sure MySQL is GREEN and "Running"');
    console.log('   3. Click MySQL "Config" → "my.ini"');
    console.log('   4. Add this line under [mysqld]:');
    console.log('      bind-address = 0.0.0.0');
    console.log('   5. Restart MySQL');
    console.log('\n💡 ALTERNATIVE:');
    console.log('   Delete corrupted files and restart:');
    console.log('   C:\\xamp\\mysql\\data\\ibdata1');
    console.log('   C:\\xamp\\mysql\\data\\ib_logfile0');
    console.log('   C:\\xamp\\mysql\\data\\ib_logfile1');
  } else {
    console.log('\n✅ TEST COMPLETED SUCCESSFULLY!');
  }
};

// Run the tests
runAllTests().catch(console.error);