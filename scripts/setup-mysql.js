// scripts/setup_mysql.js
import mysql from 'mysql2/promise';
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function setupMySQL() {
  console.log('🚀 Setting up MySQL database for Core Banking System...\n');

  const configs = [
    // Docker MySQL (default password 'root')
    { host: '127.0.0.1', port: 3306, user: 'root', password: 'root', source: 'Docker' },
    // XAMPP MySQL (empty password)
    { host: 'localhost', port: 3306, user: 'root', password: '', source: 'XAMPP' },
    // Alternative ports
    { host: '127.0.0.1', port: 3307, user: 'root', password: 'root', source: 'Docker (3307)' },
    { host: 'localhost', port: 3307, user: 'root', password: '', source: 'XAMPP (3307)' },
    // MySQL Installer (default password)
    { host: 'localhost', port: 3306, user: 'root', password: 'root', source: 'MySQL Installer' },
  ];

  let connection;
  let successfulConfig = null;

  for (const config of configs) {
    try {
      console.log(`🔍 Trying ${config.source} at ${config.host}:${config.port}...`);
      
      connection = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        connectTimeout: 3000
      });
      
      console.log(`✅ Connected to ${config.source} MySQL server`);
      
      // Create database
      await connection.query(`
        CREATE DATABASE IF NOT EXISTS \`core_banking\` 
        CHARACTER SET utf8mb4 
        COLLATE utf8mb4_unicode_ci
      `);
      
      console.log('✅ Database "core_banking" verified/created');
      
      // Create application user
      try {
        await connection.query(`
          CREATE USER IF NOT EXISTS 'core_banking_user'@'%' IDENTIFIED BY 'SecurePass123!';
          GRANT ALL PRIVILEGES ON core_banking.* TO 'core_banking_user'@'%';
          FLUSH PRIVILEGES;
        `);
        console.log('✅ Application user created with privileges');
      } catch (userError) {
        // If user creation fails, use root
        console.log('⚠️  Using root user instead (user creation failed)');
      }
      
      successfulConfig = config;
      break;
      
    } catch (error) {
      console.log(`❌ ${config.source} failed: ${error.code || error.message}\n`);
      continue;
    }
  }

  if (!successfulConfig) {
    console.error('💥 Could not connect to any MySQL server\n');
    console.log('💡 TROUBLESHOOTING:');
    console.log('1. For Docker: Run `npm run docker:mysql`');
    console.log('2. For XAMPP: Start MySQL from XAMPP Control Panel');
    console.log('3. For MySQL Installer: Ensure MySQL service is running');
    console.log('\n📚 Then run: npm run db:setup');
    process.exit(1);
  }

  // Determine which user to use
  const useRootUser = successfulConfig.source.includes('XAMPP') || 
                     successfulConfig.source.includes('MySQL Installer');
  
  const dbUser = useRootUser ? 'root' : 'core_banking_user';
  const dbPassword = useRootUser ? successfulConfig.password : 'SecurePass123!';

  // Check if .env already exists
  const envPath = join(__dirname, '..', '.env');
  let existingEnv = {};
  
  try {
    const envContent = readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const [key, value] = line.split('=');
      if (key && value) {
        existingEnv[key.trim()] = value.trim().replace(/['"]/g, '');
      }
    });
  } catch (err) {
    // .env doesn't exist, that's fine
  }

  // Merge with existing .env
  const envContent = `# MySQL Database Configuration
DB_HOST=${successfulConfig.host}
DB_PORT=${successfulConfig.port}
DB_USER=${dbUser}
DB_PASSWORD=${dbPassword}
DB_NAME=core_banking

# Application Settings
NODE_ENV=${existingEnv.NODE_ENV || 'development'}
JWT_SECRET=${existingEnv.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production'}
SESSION_SECRET=${existingEnv.SESSION_SECRET || 'your-session-secret-key-change-this'}
PORT=${existingEnv.PORT || '5000'}

# Email Configuration (for notifications)
SMTP_HOST=${existingEnv.SMTP_HOST || 'smtp.gmail.com'}
SMTP_PORT=${existingEnv.SMTP_PORT || '587'}
SMTP_USER=${existingEnv.SMTP_USER || 'your-email@gmail.com'}
SMTP_PASS=${existingEnv.SMTP_PASS || 'your-app-password'}

# File Upload
MAX_FILE_SIZE=${existingEnv.MAX_FILE_SIZE || '5242880'}
UPLOAD_PATH=${existingEnv.UPLOAD_PATH || './uploads'}
`;

  writeFileSync(envPath, envContent);
  
  console.log('\n✅ .env file created/updated with configuration');
  console.log('\n📊 Configuration Summary:');
  console.log(`   Source: ${successfulConfig.source}`);
  console.log(`   Host: ${successfulConfig.host}:${successfulConfig.port}`);
  console.log(`   Database: core_banking`);
  console.log(`   User: ${dbUser}`);
  console.log(`   Password: ${dbPassword ? '***' : '(empty)'}`);
  
  console.log('\n🚀 Next steps:');
  console.log('1. Review the .env file and update passwords/secrets');
  console.log('2. Run: npm run db:migrate (to create tables)');
  console.log('3. Run: npm run db:seed (to seed initial data)');
  console.log('4. Run: npm run dev (to start development server)');
  console.log('\n✅ Setup complete!');
}

setupMySQL().catch(console.error);