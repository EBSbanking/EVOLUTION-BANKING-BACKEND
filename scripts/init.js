// scripts/createDatabaseWithCharset.js
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env from root
dotenv.config({ path: join(__dirname, '../.env') });

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || '',
  // Don't include database here for creation
};

console.log('🔧 Creating database with configuration:', {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password ? '*** (hidden)' : '(empty)',
});

async function createDatabase() {
  let connection;
  
  try {
    // Connect without database selected
    connection = await mysql.createConnection({
      host: dbConfig.host,
      port: dbConfig.port,
      user: dbConfig.user,
      password: dbConfig.password,
    });

    const databaseName = process.env.DB_NAME || 'core_banking';
    
    console.log(`📊 Creating database '${databaseName}' with utf8mb4 character set...`);
    
    // Drop existing database if exists (optional - comment out if you want to preserve data)
    // await connection.query(`DROP DATABASE IF EXISTS \`${databaseName}\``);
    // console.log(`🗑️  Dropped existing database '${databaseName}'`);
    
    // Create database with utf8mb4 character set
    await connection.query(`
      CREATE DATABASE IF NOT EXISTS \`${databaseName}\` 
      CHARACTER SET utf8mb4 
      COLLATE utf8mb4_unicode_ci
    `);
    
    console.log(`✅ Database '${databaseName}' created or verified with utf8mb4 character set`);
    
    // Verify character set
    const [rows] = await connection.query(`
      SELECT 
        DEFAULT_CHARACTER_SET_NAME,
        DEFAULT_COLLATION_NAME
      FROM INFORMATION_SCHEMA.SCHEMATA 
      WHERE SCHEMA_NAME = ?
    `, [databaseName]);
    
    console.log('📊 Database character set configuration:', {
      database: databaseName,
      characterSet: rows[0]?.DEFAULT_CHARACTER_SET_NAME || 'N/A',
      collation: rows[0]?.DEFAULT_COLLATION_NAME || 'N/A'
    });

    // Set global character set for this session
    await connection.query('SET GLOBAL character_set_server = utf8mb4');
    await connection.query('SET GLOBAL collation_server = utf8mb4_unicode_ci');
    
    console.log('✅ Global character set settings updated');
    
    // Use the database and set session character set
    await connection.query(`USE \`${databaseName}\``);
    await connection.query('SET NAMES utf8mb4');
    await connection.query('SET CHARACTER SET utf8mb4');
    await connection.query('SET collation_connection = utf8mb4_unicode_ci');
    
    console.log('✅ Session character set configured');
    
    // Optional: Create a test table to verify utf8mb4 support
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`${databaseName}\`._charset_test (
        id INT AUTO_INCREMENT PRIMARY KEY,
        test_text VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
        emoji_test VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Insert test data with emoji to verify utf8mb4 support
    await connection.query(`
      INSERT INTO \`${databaseName}\`._charset_test (test_text, emoji_test) 
      VALUES (?, ?)
    `, ['Test with emoji support', '🚀 ✅ ❤️ 😊']);
    
    console.log('✅ utf8mb4 character set verified with emoji insertion test');
    
    // Get current character set settings
    const [variables] = await connection.query(`
      SHOW VARIABLES WHERE Variable_name IN (
        'character_set_server',
        'collation_server',
        'character_set_database',
        'collation_database',
        'character_set_connection',
        'collation_connection'
      )
    `);
    
    console.log('📊 Current MySQL character set settings:');
    variables.forEach(v => {
      console.log(`   ${v.Variable_name}: ${v.Value}`);
    });
    
  } catch (error) {
    console.error('❌ Error creating database:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('   Access denied. Please check your database credentials.');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('   Connection refused. Make sure MySQL is running.');
    }
    process.exit(1);
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// Function to verify database after creation (using your existing config)
export async function verifyDatabaseCharset() {
  try {
    // Import your existing db functions
    const { checkDatabaseHealth, executeQuery } = await import('../config/db.js');
    
    // Check health
    const health = await checkDatabaseHealth();
    console.log('📊 Database health check:', health);
    
    // Verify charset of the database
    const charsetResult = await executeQuery(`
      SELECT 
        DEFAULT_CHARACTER_SET_NAME,
        DEFAULT_COLLATION_NAME
      FROM INFORMATION_SCHEMA.SCHEMATA 
      WHERE SCHEMA_NAME = ?
    `, [process.env.DB_NAME || 'core_banking']);
    
    console.log('✅ Verified database charset:', charsetResult[0]);
    
    // Test emoji insertion
    try {
      await executeQuery(`
        CREATE TABLE IF NOT EXISTS charset_verification (
          id INT AUTO_INCREMENT PRIMARY KEY,
          emoji_test VARCHAR(50) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
        )
      `);
      
      await executeQuery(
        'INSERT INTO charset_verification (emoji_test) VALUES (?)',
        ['Testing with your app config: 🚀 ✅ ❤️ 😊']
      );
      
      const [testResult] = await executeQuery('SELECT * FROM charset_verification ORDER BY id DESC LIMIT 1');
      console.log('✅ utf8mb4 verification successful with emoji:', testResult.emoji_test);
      
    } catch (testError) {
      console.error('❌ utf8mb4 verification failed:', testError.message);
    }
    
  } catch (error) {
    console.error('❌ Error verifying database:', error.message);
  }
}

// Run the creation
async function run() {
  await createDatabase();
  
  console.log('\n' + '='.repeat(50));
  console.log('Verifying database with your application config...');
  console.log('='.repeat(50) + '\n');
  
  await verifyDatabaseCharset();
}

// Execute
run().catch(console.error);