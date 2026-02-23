// scripts/checkMySQL.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

async function checkMySQL() {
  console.log('🔍 Checking MySQL connection...');
  
  const configs = [
    {
      name: 'localhost (IPv4)',
      config: {
        host: '127.0.0.1',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
      }
    },
    {
      name: 'localhost (IPv6)',
      config: {
        host: '::1',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
      }
    },
    {
      name: 'localhost (hostname)',
      config: {
        host: 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
      }
    }
  ];

  for (const { name, config } of configs) {
    try {
      console.log(`\n🔄 Trying ${name}...`);
      const connection = await mysql.createConnection(config);
      console.log(`✅ Connected to ${name}`);
      
      const [rows] = await connection.query('SELECT version() as version');
      console.log(`   MySQL Version: ${rows[0].version}`);
      
      await connection.end();
      return true;
    } catch (error) {
      console.log(`❌ Failed to connect to ${name}:`, error.message);
    }
  }

  return false;
}

async function checkMySQLService() {
  console.log('='.repeat(60));
  console.log('MySQL Connection Diagnostic');
  console.log('='.repeat(60));
  
  // Check if MySQL is installed
  try {
    const connected = await checkMySQL();
    
    if (!connected) {
      console.log('\n⚠️  Could not connect to MySQL on any address');
      console.log('\nPossible solutions:');
      console.log('1. Start MySQL service:');
      console.log('   - Windows: net start MySQL');
      console.log('   - Or open Services.msc and start MySQL');
      console.log('   - Or run: "C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqld"');
      console.log('\n2. Check if MySQL is installed:');
      console.log('   - Look for MySQL in Programs and Features');
      console.log('   - Check if MySQL service exists: sc query MySQL');
      console.log('\n3. Verify MySQL port:');
      console.log('   - Check if port 3306 is listening: netstat -an | findstr 3306');
      console.log('\n4. If using XAMPP/WAMP:');
      console.log('   - Make sure MySQL is started in the control panel');
      console.log('\n5. Check credentials in .env file:');
      console.log(`   - User: ${process.env.DB_USER || 'root'}`);
      console.log(`   - Password: ${process.env.DB_PASSWORD ? '***' : '(empty)'}`);
    }
  } catch (error) {
    console.error('Error checking MySQL:', error);
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  checkMySQLService();
}

export { checkMySQLService };