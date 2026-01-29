// scripts/reset-mysql.js
import mysql from 'mysql2/promise';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function resetMySQL() {
  console.log('⚠️  WARNING: This will reset your database and delete all data!\n');
  
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const answer = await new Promise((resolve) => {
    rl.question('Type "RESET" to confirm: ', resolve);
  });

  if (answer !== 'RESET') {
    console.log('❌ Reset cancelled');
    rl.close();
    process.exit(0);
  }

  rl.close();

  try {
    // Load .env
    const envPath = join(__dirname, '..', '.env');
    let envContent = {};
    
    try {
      const envFile = readFileSync(envPath, 'utf8');
      envFile.split('\n').forEach(line => {
        const [key, value] = line.split('=');
        if (key && value) {
          envContent[key.trim()] = value.trim();
        }
      });
    } catch (err) {
      console.log('No .env file found, using defaults');
    }

    const config = {
      host: envContent.DB_HOST || 'localhost',
      port: parseInt(envContent.DB_PORT || '3306', 10),
      user: envContent.DB_USER || 'root',
      password: envContent.DB_PASSWORD || ''
    };

    console.log(`🔌 Connecting to MySQL at ${config.host}:${config.port}...`);
    
    const connection = await mysql.createConnection(config);
    
    // Drop and recreate database
    console.log('🗑️  Dropping database...');
    await connection.query('DROP DATABASE IF EXISTS `core_banking`');
    
    console.log('🔄 Creating fresh database...');
    await connection.query(`
      CREATE DATABASE \`core_banking\` 
      CHARACTER SET utf8mb4 
      COLLATE utf8mb4_unicode_ci
    `);
    
    await connection.end();
    
    console.log('\n✅ Database reset complete!');
    console.log('\n🚀 Next steps:');
    console.log('1. Run: npm run db:migrate');
    console.log('2. Run: npm run db:seed');
    console.log('3. Run: npm run dev');
    
  } catch (error) {
    console.error('❌ Reset failed:', error.message);
    process.exit(1);
  }
}

resetMySQL();