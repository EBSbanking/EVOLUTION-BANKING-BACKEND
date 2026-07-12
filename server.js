// server.js - FIXED: Load .env FIRST, handle both PAYSTACK_SECRET_KEY and PAYSTACK_TEST_SECRET_KEY
// ============================================

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import events from 'events';   // ✅ ADDED for MaxListeners

// ✅ Increase max listeners to avoid warning
events.EventEmitter.defaultMaxListeners = 20;

// ✅ CRITICAL: Load .env BEFORE importing any local modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

// ============================================
// ✅ Map PAYSTACK_TEST_SECRET_KEY to PAYSTACK_SECRET_KEY if the latter is missing
// ============================================
if (process.env.PAYSTACK_TEST_SECRET_KEY && !process.env.PAYSTACK_SECRET_KEY) {
  process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_TEST_SECRET_KEY;
  console.log('✅ Mapped PAYSTACK_TEST_SECRET_KEY → PAYSTACK_SECRET_KEY');
}

if (!process.env.PAYSTACK_SECRET_KEY) {
  console.error('\n❌ FATAL: Neither PAYSTACK_SECRET_KEY nor PAYSTACK_TEST_SECRET_KEY is defined in .env');
  console.error('   Please add: PAYSTACK_TEST_SECRET_KEY=sk_test_...\n');
  process.exit(1);
} else {
  const maskedKey = process.env.PAYSTACK_SECRET_KEY.substring(0, 10) + '...';
  console.log(`✅ PAYSTACK_SECRET_KEY loaded (${maskedKey})`);
}

// ============================================
// Unhandled exception / rejection handlers – log but do NOT exit
// ============================================
process.on('uncaughtException', (error) => {
  console.error('\n⚠️ UNCAUGHT EXCEPTION:');
  console.error('Time:', new Date().toISOString());
  console.error('Message:', error.message);
  console.error('Stack:', error.stack);
  // ❌ Do NOT call process.exit(1) – keep the server running
  // Only log and continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n⚠️ UNHANDLED REJECTION:');
  console.error('Time:', new Date().toISOString());
  console.error('Reason:', reason?.message || reason);
  if (reason?.stack) console.error('Stack:', reason.stack);
  // ❌ Do NOT call process.exit(1) – keep the server running
});

// ============================================
// Now import all other modules (they will see process.env)
// ============================================
// ============================================
// Now import all other modules (they will see process.env)
// ============================================
import app from './src/app.js';
import { sequelize } from './config/db.js';
import { initializeModels } from './src/models/index.js';
import envManager from './src/Services/envManager.js';
import dataSourceManager from './src/Services/dataSourceManager.js';
import pluginManager from './src/Services/pluginManager.js';
import { startAccrualJob } from './src/jobs/accrualJob.js';
import Drawer from './src/models/Drawer.js';
import auditLogger from './src/utils/AuditLogger.js';
import AuditTrail from './src/models/AuditTrail.js';
import jobRegistry from './src/services/jobRegistry.js';
import { runEODLoanRepayment } from './scripts/eodLoanRepayment.js';
import { startAllWebhooks, stopAllWebhooks } from './src/routes/AdminRoutes.js';


// ============================================
// ✅ Import cron jobs to register them (they auto-register via jobRegistry)
// ============================================
import './src/cronJobs/dailyInterestAccrual.js';
import './src/cronJobs/InterestAccrualJob.js';
import './src/scheduler/eodScheduler.js';


// Start all enabled webhooks on server startup
await startAllWebhooks();

// On shutdown, stop them
process.on('SIGTERM', async () => {
  await stopAllWebhooks();
  process.exit(0);
});



// Register EOD jobs
jobRegistry.registerJob(
  'EOD Loan Repayment',
  '30 23 * * *',
  async () => {
    console.log('Running EOD loan repayment...');
    await runEODLoanRepayment();
  },
  'End-of-day loan repayment processing (main)'
);

jobRegistry.registerJob(
  'EOD Loan Repayment (Backup)',
  '0 2 * * *',
  async () => {
    console.log('Running backup EOD loan repayment...');
    await runEODLoanRepayment();
  },
  'Backup EOD loan repayment at 2 AM'
);



// ============================================
// ✅ PATCH: Make auditLogger.info return a Promise
// ============================================
if (auditLogger && auditLogger.info && typeof auditLogger.info === 'function') {
  const originalInfo = auditLogger.info;
  auditLogger.info = function(...args) {
    try {
      const result = originalInfo.apply(this, args);
      if (result === undefined || !(result instanceof Promise)) {
        return Promise.resolve();
      }
      return result;
    } catch (err) {
      return Promise.reject(err);
    }
  };
  console.log('✅ auditLogger.info patched to return a Promise');
}


// ============================================
// Server configuration
// ============================================
const PORT = process.env.PORT || 3003;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🚀 Server configuration:');
console.log(`   PORT: ${PORT}`);
console.log(`   HOST: ${HOST}`);
console.log(`   NODE_ENV: ${NODE_ENV}`);

let server;

// ============================================
// Helper: Create admin tables if missing
// ============================================
async function createAdminTables() {
  console.log('📦 Creating admin tables if missing...');
  try {
    // Admin Data Sources (database is a reserved word – backtick it)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS admin_data_sources (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        jndiName VARCHAR(255),
        host VARCHAR(255),
        port INT,
        \`database\` VARCHAR(255),
        username VARCHAR(255),
        password VARCHAR(255),
        poolMin INT DEFAULT 5,
        poolMax INT DEFAULT 20,
        targets VARCHAR(255),
        status ENUM('active', 'inactive', 'deleted') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Admin Plugins (no reserved words)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS admin_plugins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        version VARCHAR(50),
        status ENUM('active', 'stopped') DEFAULT 'stopped',
        autoStart BOOLEAN DEFAULT FALSE,
        targets VARCHAR(255),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Admin Environment Variables (key is a reserved word – backtick it)
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS admin_env_vars (
        id INT AUTO_INCREMENT PRIMARY KEY,
        \`key\` VARCHAR(255) UNIQUE NOT NULL,
        value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Admin tables ready');
  } catch (error) {
    console.warn('⚠️ Could not create admin tables (they may already exist):', error.message);
  }
}

// ============================================
// Start server
// ============================================
async function startServer() {
  console.log(`🔍 Starting server (single process) with PID ${process.pid}...`);

  try {
    // 1. Initialize Sequelize models
    console.log('🚀 Initializing models...');
    await initializeModels();
    startAccrualJob();

    // 2. Sync Drawer table
    console.log('📦 Syncing Drawer table...');
    await Drawer.sync({ alter: false });
    console.log('✅ Drawer table synced (if it did not exist, it was created)');

    // 3. Sync AuditTrail (development only)
    if (process.env.NODE_ENV === 'development') {
      console.log('📦 Syncing AuditTrail table with alter:true (development only)...');
      await AuditTrail.sync({ alter: true });
      console.log('✅ AuditTrail table synced (missing columns added)');
    } else {
      console.log('ℹ️ Skipping AuditTrail sync in production (use migrations)');
    }

    // 4. Create admin tables (data_sources, plugins, env_vars)
    await createAdminTables();

    // 5. Safe sync for remaining tables (FIRST_RUN)
    const isFirstRun = process.env.FIRST_RUN === 'true';
    if (isFirstRun) {
      console.log('🔄 FIRST RUN: Creating missing tables (preserving existing data)...');
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
      await sequelize.sync();   // no force, no alter
      await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
      console.log('✅ Tables ready (existing data preserved).');
    } else {
      console.log('⚠️ Skipping database sync. Use migrations for schema changes.');
    }

    // 6. Load admin configuration & dynamic plugins
    console.log('\n🔧 Initializing Admin Console components...');

    // Load environment variables from DB
    await envManager.loadAll();
    console.log('✅ Environment variables loaded from DB');

    // Load data sources (connection pools)
    await dataSourceManager.loadFromDB();
    console.log('✅ Data sources loaded');

    // Load and start plugins (services/models) – pass the Express app
    await pluginManager.loadPluginsFromDB(app);
    console.log('✅ Plugins loaded and started');

    // ============================================================
    // ✅ HEALTH CHECK ENDPOINT – added for admin monitoring
    // ============================================================
    app.get('/health', (req, res) => {
      res.json({
        status: 'OK',
        workerId: process.env.WORKER_ID || 'standalone',
        port: process.env.PORT,
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        // Add any other useful info
      });
    });

    // 7. Start HTTP server
    server = app.listen(PORT, HOST, () => {
      console.log('\n' + '🟢'.repeat(30));
      console.log('🟢                    SERVER IS RUNNING!                    ');
      console.log(`🟢                    http://${HOST}:${PORT}               `);
      console.log(`🟢                    Node Env: ${NODE_ENV}                  `);
      console.log(`🟢                    PID: ${process.pid}                    `);
      console.log('🟢'.repeat(30) + '\n');

      console.log('📢 Available API Endpoints (from app.js):');
      console.log(`   • Health:        http://${HOST}:${PORT}/health`);
      console.log(`   • Login:         POST http://${HOST}:${PORT}/api/login/login`);
      console.log(`   • Debit Cards:   POST http://${HOST}:${PORT}/api/cards/issue`);
      console.log(`   • Debit Cards:   POST http://${HOST}:${PORT}/api/cards/transaction`);
      console.log(`   • Admin Console: http://${HOST}:${PORT}/admin (requires authentication)`);
      console.log(`   • All other routes from app.js are available!\n`);
    });

    server.timeout = 300000; // 5 minutes
    server.keepAliveTimeout = 300000;
    server.headersTimeout = 310000;
    server.maxHeadersCount = 2000;
    server.maxConnections = 10000;

    server.on('connection', (socket) => {
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 60000);
    });

    server.on('error', (err) => {
      console.error('❌ Server error:', err.message);
      if (err.code === 'EADDRINUSE') {
        console.error(`   Port ${PORT} is already in use`);
      }
      process.exit(1);
    });

  } catch (err) {
    console.error('❌ FATAL: Failed to start server:', err);
    process.exit(1);
  }
}

// ============================================
// Graceful shutdown – enhanced with timeouts
// ============================================
const gracefulShutdown = async () => {
  console.log(`\n👋 Shutdown signal received`);
  
  if (server) {
    server.close(async () => {
      console.log(`✅ HTTP server closed`);
      
      // Shutdown plugins with a timeout
      const shutdownWithTimeout = async (promise, name) => {
        try {
          await Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} timed out`)), 5000))
          ]);
          console.log(`✅ ${name} completed`);
        } catch (err) {
          console.error(`⚠️ ${name} failed:`, err.message);
        }
      };

      await shutdownWithTimeout(pluginManager.stopAllPlugins(), 'Plugin shutdown');
      await shutdownWithTimeout(dataSourceManager.closeAll(), 'Data source shutdown');
      
      try {
        await sequelize.close();
        console.log(`✅ Database connection closed`);
      } catch (err) {
        console.error(`⚠️ Error closing DB:`, err.message);
      }
      
      process.exit(0);
    });
    
    // Reduce timeout to 10 seconds
    setTimeout(() => {
      console.error(`❌ Forced shutdown after timeout`);
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the server
startServer();

export default app;