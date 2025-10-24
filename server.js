// server.js
import app from './app.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import mongoose from 'mongoose';
import cors from 'cors';
import connectDB from './config/db.js';
import logger from './utils/logger.js';
import { createError } from './utils/errorUtils.js';
import initializeApplication from './utils/initializeApplication.js';
import portStatusMonitor from './utils/portStatus.js';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Enhanced CORS Configuration
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_LOCAL,
  process.env.CLIENT_URL_NETWORK,
].filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  })
);

// Global Unhandled Rejection Handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    promise,
  });
});

// Database Connection Helper
const waitForDatabaseConnection = async (maxWaitTime = 30000) => {
  const startTime = Date.now();

  console.log('🔍 Checking MongoDB connection state...');
  console.log(`📊 Current DB state: ${getDbStateText(mongoose.connection.readyState)}`);

  return new Promise((resolve, reject) => {
    const checkConnection = () => {
      const currentTime = Date.now();
      const elapsedTime = currentTime - startTime;

      console.log(
        `🔄 DB Connection Check - State: ${getDbStateText(mongoose.connection.readyState)}, Elapsed: ${elapsedTime}ms`
      );

      if (mongoose.connection.readyState === 1) {
        console.log('✅ MongoDB connection verified and READY for queries');
        resolve();
      } else if (elapsedTime >= maxWaitTime) {
        reject(
          new Error(
            `MongoDB connection timeout after ${maxWaitTime}ms. Current state: ${getDbStateText(
              mongoose.connection.readyState
            )}`
          )
        );
      } else {
        setTimeout(checkConnection, 1000);
      }
    };

    checkConnection();
  });
};

// Test Database Connection
const testDatabaseConnection = async () => {
  try {
    console.log('🧪 Testing database connection with a simple query...');
    const result = await mongoose.connection.db.admin().ping();

    if (result.ok === 1) {
      console.log('✅ Database connection test PASSED - MongoDB is responsive');
      return true;
    } else {
      console.log('❌ Database connection test FAILED - MongoDB not responsive');
      return false;
    }
  } catch (error) {
    console.log('❌ Database connection test FAILED - Error:', error.message);
    return false;
  }
};

// Safe Application Initialization
const safeInitializeApplication = async () => {
  try {
    console.log('🛡️ Starting SAFE application initialization...');

    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ Database not ready, waiting...');
      await waitForDatabaseConnection(15000);
    }

    const connectionTest = await testDatabaseConnection();
    if (!connectionTest) {
      throw new Error('Database connection test failed');
    }

    console.log('⏳ Ensuring database is fully ready...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('✅ Database confirmed ready, initializing application...');
    await initializeApplication();
    console.log('✅ Application initialization completed successfully');
  } catch (error) {
    console.error('❌ Application initialization failed', {
      error: error.message,
      dbState: getDbStateText(mongoose.connection.readyState),
    });
    console.error('⚠️ Application initialization failed, but server will continue running');
  }
};

// Delayed Audit Logging
const logServerStartupAudit = async () => {
  try {
    console.log('📝 Attempting to log server startup audit...');

    if (mongoose.connection.readyState !== 1) {
      console.log('⏳ Waiting for database connection...');
      await waitForDatabaseConnection(10000);
    }

    const connectionTest = await testDatabaseConnection();
    if (!connectionTest) {
      throw new Error('Database not responsive, skipping audit log');
    }

    console.log('⏳ Final safety delay before audit logging...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const { logAuditTrail } = await import('./utils/AuditLogger.js');

    console.log('📝 Logging server startup audit...');
    const auditResult = await logAuditTrail(
      'system',
      'server_startup',
      'system',
      'server_start',
      null,
      {
        status: 'started',
        port: process.env.PORT || 5000,
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        dbState: getDbStateText(mongoose.connection.readyState),
      },
      'internal',
      'SYSTEM_START',
      { startup: true, outcome: 'success' }
    );

    if (auditResult) {
      console.log('✅ Server startup audit logged successfully');
    } else {
      console.log('⚠️ Server startup audit returned null (may be skipped)');
    }
  } catch (error) {
    console.warn('⚠️ Could not log server startup audit:', error.message);
  }
};

// Logging Setup
const configureLogging = () => {
  const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, 'logs');
  const LOG_FILE = path.join(LOG_DIR, 'server.log');

  try {
    if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.accessSync(LOG_DIR, fs.constants.W_OK | fs.constants.R_OK);
  } catch (err) {
    logger.error('Log directory setup failed', { error: err.message });
    throw createError('Log directory initialization failed', 'INITIALIZATION_ERROR');
  }

  return {
    logStream: fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8', mode: 0o666 }),
    logFile: LOG_FILE,
  };
};

const { logStream, logFile } = configureLogging();

// Graceful Shutdown
const configureShutdown = (server) => {
  const shutdown = async (signal) => {
    console.log(`Shutdown signal received: ${signal}`);
    try {
      const { logAuditTrail } = await import('./utils/AuditLogger.js');
      await logAuditTrail(
        'system',
        'server_shutdown',
        'system',
        'server_stop',
        null,
        {
          status: 'stopped',
          signal: signal,
          timestamp: new Date().toISOString(),
        },
        'internal',
        'SYSTEM_STOP',
        { shutdown: true }
      );
    } catch (auditError) {
      console.warn('⚠️ Could not log shutdown audit:', auditError.message);
    }

    await mongoose.connection.close();
    console.log('✅ MongoDB connection closed');
    logStream.end(() => {
      console.log('Shutdown completed');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

// Start Backend Server
const startServer = async () => {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 STARTING EVOLUTION BANKING BACKEND SERVER');
    console.log('='.repeat(60));

    // STEP 1: Connect to MongoDB
    console.log('🔄 STEP 1: Connecting to MongoDB...');
    console.log('📡 Connecting to MongoDB Atlas...');
    await connectDB();

    // STEP 2: Test the connection with actual query
    console.log('🔄 STEP 2: Testing database responsiveness...');
    const connectionTest = await testDatabaseConnection();
    if (!connectionTest) {
      throw new Error('Database connection test failed - MongoDB not responsive');
    }

    // STEP 3: Start the server
    console.log('🔄 STEP 3: Starting HTTP server...');
    const PORT = process.env.PORT || 5000;

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('\n' + '='.repeat(60));
      console.log('✅ BACKEND SERVER RUNNING SUCCESSFULLY');
      console.log('='.repeat(60));
      console.log(`📍 Local URL: http://localhost:${PORT}`);
      console.log(`🌐 Network URL: ${process.env.CLIENT_URL_NETWORK}:${PORT}`);
      console.log(`🔧 API Base: ${process.env.CLIENT_URL_NETWORK}:${PORT}/api`);
      console.log(`📱 Frontend: ${process.env.CLIENT_URL}`);
      console.log(`🗄️  Database: ${getDbStateText(mongoose.connection.readyState)}`);
      console.log(`🧪 DB Test: ${connectionTest ? '✅ Responsive' : '❌ Not Responsive'}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('='.repeat(60) + '\n');

      // STEP 4: Log server startup audit
      logServerStartupAudit().then(() => {
        console.log('🎉 Server startup sequence completed!');
      }).catch(err => {
        console.log('⚠️  Startup audit skipped, server continues running...');
      });
    });

    // STEP 5: Initialize application in background
    console.log('🔄 STEP 5: Starting background application initialization...');
    safeInitializeApplication().then(() => {
      console.log('🎉 Application initialization completed!');
    }).catch(err => {
      console.log('⚠️  Application initialization continuing in background...');
    });

    // Add port connection monitoring
    portStatusMonitor.onPortConnected(server, PORT);

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`, { error: err.message });
        console.error(`❌ Port ${PORT} is already occupied. Please use a different port.`);
        console.log(`💡 Try: PORT=${Number(PORT) + 1} npm start`);
      } else {
        console.error('Server error', { error: err.message });
      }
      process.exit(1);
    });

    configureShutdown(server);
  } catch (err) {
    console.error('❌ SERVER STARTUP FAILED', {
      error: err.message,
      dbState: getDbStateText(mongoose.connection.readyState),
    });
    console.error('\n💥 SERVER STARTUP FAILED:');
    console.error('   Error:', err.message);
    console.error('   Database State:', getDbStateText(mongoose.connection.readyState));
    console.error('   Check: MongoDB connection string and network access');
    console.error('   Check: MongoDB Atlas IP whitelist and credentials');
    process.exit(1);
  }
};

// Helper function to get DB state text
function getDbStateText(state) {
  const states = {
    0: '❌ Disconnected',
    1: '✅ Connected',
    2: '🔄 Connecting',
    3: '⏳ Disconnecting',
    99: '❓ Uninitialized',
  };
  return states[state] || `❓ Unknown (${state})`;
}

// Start the server
startServer();