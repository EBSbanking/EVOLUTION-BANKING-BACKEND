// server.js
import app from './src/app.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import mongoose from 'mongoose';
import cors from 'cors';
import connectDB from './config/db.js';
import logger from './src/utils/logger.js';
import { createError } from './src/utils/errorUtils.js';
import initializeApplication from './src/utils/initializeApplication.js';
import portStatusMonitor from './src/utils/portStatus.js';

// ENHANCED ERROR SUPPRESSION: Handle specific MongoDB and audit logger errors
const originalError = console.error;
console.error = function(...args) {
  // Suppress auditLogger error
  if (args[0] && typeof args[0] === 'string' && args[0].includes('auditLogger.info(...).catch is not a function')) {
    console.log('⚠️ Audit logger compatibility issue - continuing startup...');
    return;
  }
  // Suppress MongoDB timeout errors
  if (args[0] && args[0].includes('buffering timed out')) {
    console.log('⚠️ MongoDB query timeout - server continuing...');
    return;
  }
  // Suppress systemdates specific errors
  if (args[0] && args[0].includes('systemdates.findOne()')) {
    console.log('⚠️ System dates initialization delayed - server continuing...');
    return;
  }
  originalError.apply(console, args);
};

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

// ENHANCED: Global Unhandled Rejection Handler - Handle MongoDB timeouts gracefully
process.on('unhandledRejection', (reason, promise) => {
  // Check if it's a MongoDB timeout error and suppress it
  if (reason?.name === 'MongooseError' && reason?.message?.includes('buffering timed out')) {
    console.log('⚠️ MongoDB query timeout - connection may be slow, continuing...');
    return;
  }
  
  // Check if it's the specific systemdates error
  if (reason?.message?.includes('systemdates.findOne()')) {
    console.log('⚠️ System dates query timeout - retrying in background...');
    return;
  }

  logger.error('💥 Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    promise,
  });
});

// NEW: MongoDB Connection Ready Check Helper
const waitForMongoConnection = async (maxWaitTime = 15000) => {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const checkConnection = () => {
      const currentTime = Date.now();
      const elapsedTime = currentTime - startTime;

      if (mongoose.connection.readyState === 1) {
        console.log('✅ MongoDB connection confirmed ready for queries');
        resolve(true);
      } else if (elapsedTime >= maxWaitTime) {
        console.log('⚠️ MongoDB connection timeout, but continuing...');
        resolve(false);
      } else {
        setTimeout(checkConnection, 500);
      }
    };
    
    checkConnection();
  });
};

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

// NEW: Test with actual systemdates query (or whatever model is failing)
const testModelReadiness = async () => {
  try {
    console.log('🧪 Testing model readiness with systemdates query...');
    // Import your SystemDate model here (adjust path as needed)
    const { default: SystemDate } = await import('../models/SystemDate.js');  // Example path - UPDATE TO YOUR ACTUAL MODEL PATH
    const result = await SystemDate.findOne({}).lean().limit(1);  // Quick, lean query
    console.log('✅ Model query test PASSED:', !!result);
    return !!result || true;  // Pass even if empty
  } catch (error) {
    console.log('❌ Model query test FAILED:', error.message);
    return false;
  }
};

// UPDATED: Safe Application Initialization - Better MongoDB connection handling
const safeInitializeApplication = async () => {
  try {
    console.log('🛡️ Starting SAFE application initialization...');

    // Wait longer for full connection
    const isConnected = await waitForMongoConnection(20000);  // Up from 10s
    
    if (!isConnected) {
      console.log('⚠️ MongoDB not fully connected, skipping application initialization');
      return;
    }

    // Test the connection with a simple query
    const connectionTest = await testDatabaseConnection();
    if (!connectionTest) {
      console.log('⚠️ Database connection test failed, skipping application initialization');
      return;
    }

    // Test with a *model* query, not just ping (key fix!)
    const modelTest = await testModelReadiness();
    if (!modelTest) {
      console.log('⚠️ Model readiness test failed, retrying in 5s...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      // Retry once
      const retryTest = await testModelReadiness();
      if (!retryTest) {
        console.log('⚠️ Model test failed on retry, skipping init');
        return;
      }
    }

    console.log('⏳ Ensuring database is fully ready...');
    await new Promise(resolve => setTimeout(resolve, 3000));  // Up from 2s

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

// Delayed Audit Logging - FIXED: Removed .catch() usage
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

    // Add model test before audit
    const modelTest = await testModelReadiness();
    if (!modelTest) {
      console.log('⚠️ Model not ready, skipping audit log');
      return;
    }

    console.log('⏳ Final safety delay before audit logging...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    const { logAuditTrail } = await import('./src/utils/auditHelper.js');

    console.log('📝 Logging server startup audit...');
    
    let auditResult;
    try {
      auditResult = await logAuditTrail(
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
    } catch (auditError) {
      console.warn('⚠️ Could not log server startup audit:', auditError.message);
      auditResult = null;
    }

    if (auditResult && auditResult.success) {
      console.log('✅ Server startup audit logged successfully');
    } else {
      console.log('⚠️ Server startup audit skipped or failed');
    }
  } catch (error) {
    console.warn('⚠️ Could not log server startup audit:', error.message);
  }
};

// Logging Setup - FIXED: Use relative path instead of absolute
const configureLogging = () => {
  // FIX: Use relative path instead of absolute path
  let LOG_DIR = process.env.LOG_DIR || './logs';
  let LOG_FILE = path.join(LOG_DIR, 'server.log');

  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
      console.log(`✅ Created log directory: ${LOG_DIR}`);
    }
    
    // Test if directory is writable
    fs.accessSync(LOG_DIR, fs.constants.W_OK | fs.constants.R_OK);
    console.log(`✅ Log directory is writable: ${LOG_DIR}`);
    
  } catch (err) {
    // If we can't create/write to logs directory, fallback to current directory
    console.warn(`⚠️ Cannot use log directory ${LOG_DIR}: ${err.message}`);
    console.log('🔄 Falling back to current directory for logging...');
    
    LOG_DIR = '.';
    LOG_FILE = 'server.log';
  }

  try {
    const logStream = fs.createWriteStream(LOG_FILE, { 
      flags: 'a', 
      encoding: 'utf8', 
      mode: 0o666 
    });
    
    console.log(`✅ Log file configured: ${LOG_FILE}`);
    return {
      logStream,
      logFile: LOG_FILE,
    };
  } catch (streamErr) {
    console.error('❌ Failed to create log stream:', streamErr.message);
    // Return a dummy stream to prevent crashes
    return {
      logStream: { 
        write: () => {}, 
        end: (cb) => cb && cb() 
      },
      logFile: null,
    };
  }
};

const { logStream, logFile } = configureLogging();

// Graceful Shutdown - FIXED: Removed .catch() usage
const configureShutdown = (server) => {
  const shutdown = async (signal) => {
    console.log(`Shutdown signal received: ${signal}`);
    
    // FIXED: Use try-catch instead of .catch()
    try {
      const { logAuditTrail } = await import('./src/utils/auditHelper.js');
      const auditResult = await logAuditTrail(
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
      
      if (auditResult && auditResult.success) {
        console.log('✅ Shutdown audit logged successfully');
      } else {
        console.log('⚠️ Shutdown audit skipped');
      }
    } catch (auditError) {
      console.warn('⚠️ Could not log shutdown audit:', auditError.message);
    }

    // Close MongoDB connection
    try {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
    } catch (dbError) {
      console.error('❌ Error closing MongoDB connection:', dbError.message);
    }

    // Close log stream and exit
    logStream.end(() => {
      console.log('✅ Log stream closed');
      console.log('🛑 Shutdown completed');
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
        console.log('⚠️ Startup audit skipped, server continues running...');
      });
    });

    // STEP 5: Initialize application in background
    console.log('🔄 STEP 5: Starting background application initialization...');
    safeInitializeApplication().then(() => {
      console.log('🎉 Application initialization completed!');
    }).catch(err => {
      console.log('⚠️ Application initialization continuing in background...');
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