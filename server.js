// server.js - SAFE VERSION (no data loss) + WebLogic‑like Admin Console
// ============================================
process.on('uncaughtException', (error) => {
  console.error('\n❌❌❌ UNCAUGHT EXCEPTION ❌❌❌');
  console.error('Time:', new Date().toISOString());
  console.error('Error name:', error.name);
  console.error('Error message:', error.message);
  console.error('Error stack:', error.stack);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('\n❌❌❌ UNHANDLED REJECTION ❌❌❌');
  console.error('Time:', new Date().toISOString());
  console.error('Reason:', reason);
  if (reason && reason.stack) console.error('Stack:', reason.stack);
  process.exit(1);
});

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import app from './src/app.js';
import { sequelize } from './config/db.js';
import { initializeModels } from './src/models/index.js';

// ============================================
// NEW: Import admin services
// ============================================
import envManager from './src/services/envManager.js';
import dataSourceManager from './src/services/dataSourceManager.js';
import pluginManager from './src/services/pluginManager.js';
import { startAccrualJob } from './src/jobs/accrualJob.js';

// ✅ ADD DRAWER MODEL IMPORT HERE
import Drawer from './src/models/Drawer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

// ✅ CHANGE PORT TO 3003 FOR ADMIN CONSOLE
const PORT = process.env.PORT || 3003;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🚀 Server configuration:');
console.log(`   PORT: ${PORT}`);
console.log(`   HOST: ${HOST}`);
console.log(`   NODE_ENV: ${NODE_ENV}`);

let server;

async function startServer() {
  console.log(`🔍 Starting server (single process) with PID ${process.pid}...`);

  try {
    // 1. Initialize Sequelize models (your existing ones)
    console.log('🚀 Initializing models...');
    await initializeModels();
    startAccrualJob();

    // ✅ ADD DRAWER SYNC HERE – creates the table if missing, does not alter data
    console.log('📦 Syncing Drawer table...');
    await Drawer.sync({ alter: false });
    console.log('✅ Drawer table synced (if it did not exist, it was created)');

    // ------------------------------------------------------------------
    // ✅ SAFE SYNC: Create missing tables WITHOUT dropping data
    // Set FIRST_RUN=true in .env only once to create the initial schema.
    // ------------------------------------------------------------------
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

    // ============================================
    // NEW: Load admin configuration & dynamic plugins
    // ============================================
    console.log('\n🔧 Initializing Admin Console components...');

    // Load environment variables from DB
    await envManager.loadAll();
    console.log('✅ Environment variables loaded');

    // Load data sources (connection pools)
    await dataSourceManager.loadFromDB();
    console.log('✅ Data sources loaded');

    // Load and start plugins (services/models) – pass the Express app
    await pluginManager.loadPluginsFromDB(app);
    console.log('✅ Plugins loaded and started');

    // ============================================
    // Start HTTP server
    // ============================================
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
    server.maxHeadersCount = 2000; // already there
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

// Graceful shutdown – enhanced to stop plugins and close data sources
const gracefulShutdown = async () => {
  console.log(`\n👋 Shutdown signal received`);
  
  if (server) {
    server.close(async () => {
      console.log(`✅ HTTP server closed`);
      
      // Stop all running plugins (clean up their resources)
      try {
        await pluginManager.stopAllPlugins();
        console.log(`✅ All plugins stopped`);
      } catch (err) {
        console.error(`⚠️ Error stopping plugins:`, err.message);
      }
      
      // Close all data source pools
      try {
        await dataSourceManager.closeAll();
        console.log(`✅ All data source pools closed`);
      } catch (err) {
        console.error(`⚠️ Error closing data sources:`, err.message);
      }
      
      // Close main database connection
      try {
        await sequelize.close();
        console.log(`✅ Database connection closed`);
      } catch (err) {
        console.error(`⚠️ Error closing DB:`, err.message);
      }
      
      process.exit(0);
    });
    
    setTimeout(() => {
      console.error(`❌ Forced shutdown after timeout`);
      process.exit(1);
    }, 30000);
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the server
startServer();

export default app;