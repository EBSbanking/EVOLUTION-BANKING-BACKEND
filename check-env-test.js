// check-env-test.js
import dotenv from 'dotenv';
import { createConnection } from 'mysql2/promise';

dotenv.config();

console.log('🔍 Checking Environment and MySQL Connection...\n');

// Display relevant env variables
console.log('📋 Environment Variables:');
console.log(`   DB_HOST: ${process.env.DB_HOST}`);
console.log(`   DB_PORT: ${process.env.DB_PORT}`);
console.log(`   DB_USER: ${process.env.DB_USER}`);
console.log(`   DB_PASSWORD: ${process.env.DB_PASSWORD ? '*** (set)' : '(empty)'}`);
console.log(`   DB_NAME: ${process.env.DB_NAME}`);
console.log(`   AUTO_SYNC_DB: ${process.env.AUTO_SYNC_DB}`);
console.log(`   DB_ALTER_SYNC: ${process.env.DB_ALTER_SYNC}`);
console.log(`   DB_FORCE_SYNC: ${process.env.DB_FORCE_SYNC}`);

console.log('\n🔗 Testing MySQL Connection...');

async function testConnection() {
  try {
    const connection = await createConnection({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      connectTimeout: 5000,
    });

    console.log('✅ SUCCESS! Connected to MySQL server\n');
    
    // Get MySQL version
    const [version] = await connection.execute('SELECT VERSION() as version');
    console.log(`📊 MySQL Version: ${version[0].version}`);
    
    // Check databases
    const [databases] = await connection.execute('SHOW DATABASES');
    console.log(`\n📂 Found ${databases.length} databases:`);
    
    const dbNames = databases.map(db => db.Database);
    const targetDb = process.env.DB_NAME;
    
    dbNames.forEach(db => {
      if (db === targetDb) {
        console.log(`   ✅ ${db} (your target database)`);
      } else {
        console.log(`   - ${db}`);
      }
    });
    
    // Create database if it doesn't exist
    if (!dbNames.includes(targetDb)) {
      console.log(`\n🔄 Creating database: ${targetDb}`);
      await connection.execute(`CREATE DATABASE IF NOT EXISTS \`${targetDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      console.log(`✅ Database "${targetDb}" created`);
    }
    
    await connection.end();
    console.log('\n🎉 MySQL setup is complete!');
    console.log('\nNext: Test your config/db.js file');
    
    return true;
    
  } catch (error) {
    console.error('\n❌ Connection failed:', error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 MySQL is not running. Solutions:');
      console.log('1. If using XAMPP:');
      console.log('   - Open XAMPP Control Panel');
      console.log('   - Click "Start" next to MySQL');
      console.log('   - Wait for it to turn green');
      
      console.log('\n2. If using MySQL Installer:');
      console.log('   - Open Services (services.msc)');
      console.log('   - Find "MySQL" service');
      console.log('   - Start it if stopped');
      
      console.log('\n3. Install MySQL if not installed:');
      console.log('   XAMPP: https://www.apachefriends.org/');
      console.log('   MySQL: https://dev.mysql.com/downloads/installer/');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.log('\n💡 Wrong password. Your .env shows empty password.');
      console.log('Try:');
      console.log('   - Leave DB_PASSWORD= (empty) for XAMPP');
      console.log('   - Or set DB_PASSWORD=your_password');
    }
    
    return false;
  }
}

testConnection();