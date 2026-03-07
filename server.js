// server.js - STARTS SERVER FIRST, THEN LOADS EVERYTHING IN BACKGROUND
import app from './src/app.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import cors from 'cors';
// Import sequelize from db.js
import { getSequelize } from './config/db.js';
import fs from 'fs/promises';
import configurationService from './src/Services/ConfigurationService.js';
import SavingsProduct from './src/models/SavingsProduct.js';
import LoanFee from './src/models/LoanFee.js';
import http from 'http';

import sequelize from './config/db.js';
import ThriftSettings from './src/models/ThriftSettings.js';

// ============================================
// GLOBAL ERROR HANDLERS
// ============================================
process.on('uncaughtException', (err) => {
  console.error('\n❌❌❌ UNCAUGHT EXCEPTION:', err);
  console.error(err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('\n❌❌❌ UNHANDLED REJECTION:', err);
  console.error(err.stack);
  // Don't exit - just log
});

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🔍 DEBUG [1]: Server.js started');
console.log('🔍 DEBUG [2]: __dirname =', __dirname);

// Load environment variables
console.log('🔍 DEBUG [3]: Loading .env from', path.resolve(__dirname, '.env'));
dotenv.config({ path: path.resolve(__dirname, '.env') });

// ============================================
// PORT CONFIGURATION
// ============================================
const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🔍 DEBUG [4]: PORT =', PORT);
console.log('🔍 DEBUG [5]: HOST =', HOST);
console.log('🔍 DEBUG [6]: NODE_ENV =', NODE_ENV);

// ============================================
// START SERVER IMMEDIATELY - BEFORE ANY INITIALIZATION
// ============================================
console.log('\n' + '🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴');
console.log('🔴                    STARTING SERVER...                    ');
console.log('🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴🔴\n');

const server = app.listen(PORT, HOST, () => {
  console.log('\n' + '🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢');
  console.log('🟢                    SERVER IS RUNNING!                    ');
  console.log(`🟢                    http://localhost:${PORT}               `);
  console.log('🟢                    Press Ctrl+C to stop                    ');
  console.log('🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢🟢\n');
  
  console.log('📢 Server is now listening! All background initializations will continue...');
  console.log('📢 You can immediately access:');
  console.log(`   • Health: http://localhost:${PORT}/health`);
  console.log(`   • Test: http://localhost:${PORT}/api/test`);
  console.log(`   • CORS Debug: http://localhost:${PORT}/cors-check\n`);
});

server.on('error', (err) => {
  console.error('❌ Server error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.error(`   Port ${PORT} is already in use. Try: taskkill /F /IM node.exe`);
  }
  process.exit(1);
});

// ============================================
// HANDLE GRACEFUL SHUTDOWN
// ============================================
process.on('SIGTERM', () => {
  console.log('\n🔻 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n🔻 Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// ============================================
// BACKGROUND INITIALIZATIONS (RUN AFTER SERVER STARTED)
// ============================================
(async function runBackgroundInitializations() {
  console.log('\n🔧 Starting background initializations (server is already running)...');
  
  try {
    // ============================================
    // INITIALIZE CONFIGURATION SERVICE
    // ============================================
    console.log('🔍 Background: Initializing configuration service...');
    await configurationService.initialize();
    console.log('✅ Background: Configuration service initialized');

    // ============================================
    // GET SEQUELIZE INSTANCE
    // ============================================
    console.log('🔍 Background: Getting Sequelize instance...');
    const sequelize = getSequelize();
    console.log('✅ Background: Sequelize instance obtained');

    // ============================================
    // CREATE PUBLIC DIRECTORY
    // ============================================
    const publicDir = path.join(__dirname, 'public');
    console.log(`📁 Background: Public directory: ${publicDir}`);
    await fs.mkdir(publicDir, { recursive: true });

    // ============================================
    // DATABASE SYNC
    // ============================================
    console.log('🔍 Background: Starting database sync...');
    try {
      await sequelize.authenticate();
      console.log('✅ Background: Database connection established');
      
      if (NODE_ENV === 'development') {
        await sequelize.sync({ alter: true });
        console.log('✅ Background: Database synced with alterations');
      } else {
        await sequelize.sync({ force: false });
        console.log('✅ Background: Database synced (safe mode)');
      }
    } catch (error) {
      console.error('❌ Background: Database sync failed:', error.message);
    }

    // ============================================
    // INITIALIZE COUNTERS
    // ============================================
    await initializeCounters(sequelize);


    // Add this right after your database connection is confirmed
async function initializeThriftSettings() {
  try {
    console.log('🔄 Initializing ThriftSettings...');
    const ThriftSettingsModel = ThriftSettings(sequelize);
    await ThriftSettingsModel.sync({ alter: true });
    console.log('✅ ThriftSettings table ready');
    
    // Check if GL accounts exist
    const cashGL = await ThriftSettingsModel.findOne({
      where: { setting_key: 'thrift_cash_gl' }
    });
    
    const incomeGL = await ThriftSettingsModel.findOne({
      where: { setting_key: 'thrift_income_gl' }
    });
    
    if (!cashGL || !incomeGL) {
      console.log('⚠️ Thrift GL accounts not configured. Please run:');
      console.log('   POST /api/thrift/settings/init/default');
      console.log('   or manually insert settings');
    }
  } catch (error) {
    console.error('❌ Error initializing ThriftSettings:', error.message);
  }
}

// Call it after DB connection
initializeThriftSettings();

    // ============================================
    // CREATE MISSING TABLES
    // ============================================
    await createMissingTables(sequelize);

    // ============================================
    // FIX APPROVAL TABLE
    // ============================================
    await fixApprovalTableIssue(sequelize);

    // ============================================
    // INITIALIZE CRITICAL TABLES
    // ============================================
    try {
      if (SavingsProduct && typeof SavingsProduct.initializeTable === 'function') {
        await SavingsProduct.initializeTable();
        console.log('✅ Background: SavingsProduct table ready');
      }
    } catch (e) {
      console.log('⚠️ Background: SavingsProduct:', e.message);
    }

    try {
      if (LoanFee && typeof LoanFee.initializeTable === 'function') {
        await LoanFee.initializeTable();
        console.log('✅ Background: LoanFee table ready');
      }
    } catch (e) {
      console.log('⚠️ Background: LoanFee:', e.message);
    }

    console.log('\n' + '✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅');
    console.log('✅         ALL BACKGROUND INITIALIZATIONS COMPLETE!        ✅');
    console.log('✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅✅\n');
    
  } catch (error) {
    console.error('❌ Background initialization error:', error.message);
    console.error(error.stack);
    // Don't exit - server is already running
  }
})();

// ============================================
// HELPER FUNCTIONS
// ============================================

async function initializeCounters(sequelize) {
  try {
    console.log('📊 Background: Initializing counters...');
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'counters'");

    if (tables.length === 0) {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS counters (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(50) UNIQUE NOT NULL,
          seq INT DEFAULT 0 NOT NULL,
          description VARCHAR(255),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    const [counters] = await sequelize.query('SELECT COUNT(*) as count FROM counters');
    if (counters[0].count === 0) {
      await sequelize.query(`
        INSERT INTO counters (name, seq) VALUES
        ('customer', 1000),
        ('account', 10000),
        ('transaction', 100000),
        ('application', 1)
      `);
      console.log('✅ Background: Default counters created');
    } else {
      console.log('✅ Background: Counters already initialized');
    }
  } catch (error) {
    console.error('❌ Background: Counter initialization failed:', error.message);
  }
}

async function createMissingTables(sequelize) {
  console.log('\n🔍 Background: Checking for missing critical tables...');
  const criticalTables = [
    'customers',
    'customer_accounts',
    'account_applications',
    'bvn_verifications'
  ];

  for (const tableName of criticalTables) {
    try {
      const [tables] = await sequelize.query(`SHOW TABLES LIKE '${tableName}'`);
      if (tables.length === 0) {
        console.log(`   ⚠️ Table ${tableName} doesn't exist, creating...`);

        if (tableName === 'bvn_verifications') {
          await sequelize.query(`
            CREATE TABLE bvn_verifications (
              id BIGINT AUTO_INCREMENT PRIMARY KEY,
              bvn VARCHAR(11) NOT NULL,
              customer_id VARCHAR(50),
              first_name VARCHAR(100),
              last_name VARCHAR(100),
              phone_number VARCHAR(20),
              date_of_birth DATE,
              verified BOOLEAN DEFAULT FALSE,
              verification_status VARCHAR(50),
              response_data JSON,
              ip_address VARCHAR(45),
              verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_bvn (bvn),
              INDEX idx_customer_id (customer_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
          `);
          console.log(`   ✅ Created table: ${tableName}`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Failed to create ${tableName}: ${error.message}`);
    }
  }
}

async function fixApprovalTableIssue(sequelize) {
  console.log('\n🔧 Background: Checking approval_requests table...');
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'approval_requests'");
    if (tables.length === 0) {
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS approval_requests (
          id INT AUTO_INCREMENT PRIMARY KEY,
          request_type VARCHAR(100) NOT NULL,
          status VARCHAR(50) DEFAULT 'PENDING',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_status (status)
        ) ENGINE=InnoDB
      `);
      console.log('✅ Background: approval_requests table created');
    } else {
      console.log('✅ Background: approval_requests table exists');
    }
  } catch (error) {
    console.error('❌ Background: Error with approval table:', error.message);
  }
}

// ============================================
// SIMPLE TEST ENDPOINTS (These work immediately)
// ============================================

// Health endpoint (already in app.js, but adding here for safety)
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    port: PORT,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    message: 'Server is running'
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    port: PORT,
    environment: NODE_ENV,
    status: 'initializing',
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET /api/health',
      'GET /api/test',
      'GET /health',
      'GET /cors-check'
    ]
  });
});

// CORS debug endpoint
app.get('/cors-check', (req, res) => {
  res.json({
    message: 'CORS Debug Info',
    yourOrigin: req.headers.origin || 'No origin',
    headers: req.headers,
    time: new Date().toISOString()
  });
});

// Ping endpoint
app.get('/api/ping', (req, res) => {
  res.json({ 
    success: true, 
    message: 'pong', 
    timestamp: new Date().toISOString() 
  });
});

// Note: Route mounting should be handled in app.js with lazy loading
// The server.js should NOT try to mount routes beyond these simple test endpoints

export default app;