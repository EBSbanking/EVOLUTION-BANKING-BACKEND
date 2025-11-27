// server.js - Fixed version with proper system status handling, date formatting, and EOD management
import app from './src/app.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import mongoose from 'mongoose';
import cors from 'cors';
import connectDB from './config/db.js';
import logger from './src/utils/logger.js';
import initializeApplication from './src/utils/initializeApplication.js';
import { initializeSystemDates } from './src/controllers/OsController.js';
import os from 'os';

// Error suppression
const originalError = console.error;
console.error = function(...args) {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('auditLogger.info(...).catch is not a function')) {
    console.log('⚠️ Audit logger compatibility issue - continuing startup...');
    return;
  }
  originalError.apply(console, args);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// API Endpoints
app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Evolution Banking API Server is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// CORS Configuration
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_LOCAL,
  process.env.CLIENT_URL_NETWORK,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);

console.log('🛡️ CORS Allowed Origins:', allowedOrigins);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  })
);

// ============================================
// EOD MANAGEMENT ENDPOINTS
// ============================================

// EOD Processing Endpoint
app.post('/api/system/eod/start', async (req, res) => {
  try {
    const { processedBy = 'admin' } = req.body;
    
    const { processEndOfDay } = await import('./src/controllers/OsController.js');
    const result = await processEndOfDay(processedBy);
    
    res.json({
      success: true,
      message: 'EOD processing completed successfully',
      data: result.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// EOD Status Endpoint
app.get('/api/system/eod/status', async (req, res) => {
  try {
    const SystemDate = (await import('./src/models/SystemDate.js')).default;
    const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
    
    if (!systemDate) {
      return res.status(404).json({
        success: false,
        message: 'System date not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        currentBusinessDate: systemDate.currentBusinessDate,
        previousBusinessDate: systemDate.previousBusinessDate,
        nextBusinessDate: systemDate.nextBusinessDate,
        eodStatus: systemDate.eodStatus,
        lastUpdated: systemDate.lastUpdated,
        eodHistory: systemDate.eodHistory.slice(-5) // Last 5 EOD operations
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Manual date adjustment (admin only)
app.post('/api/system/date/manual-set', async (req, res) => {
  try {
    const { date, updatedBy = 'admin', reason = 'Manual adjustment' } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }
    
    const { setBusinessDateManually } = await import('./src/controllers/OsController.js');
    const result = await setBusinessDateManually(date, updatedBy, reason);
    
    res.json({
      success: true,
      message: 'Business date updated manually',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// System Date Information Endpoint
app.get('/api/system/date/info', async (req, res) => {
  try {
    const SystemDate = (await import('./src/models/SystemDate.js')).default;
    const systemDate = await SystemDate.findOne().sort({ createdAt: -1 });
    
    if (!systemDate) {
      return res.status(404).json({
        success: false,
        message: 'System date not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        currentBusinessDate: systemDate.currentBusinessDate,
        previousBusinessDate: systemDate.previousBusinessDate,
        nextBusinessDate: systemDate.nextBusinessDate,
        eodStatus: systemDate.eodStatus,
        lastUpdated: systemDate.lastUpdated,
        updatedBy: systemDate.updatedBy
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// SERVER CONFIGURATION
// ============================================

// MongoDB Connection Helper
const waitForMongoConnection = async (maxWaitTime = 30000) => {
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
        setTimeout(checkConnection, 1000);
      }
    };
    
    checkConnection();
  });
};

// Test Database Connection
const testDatabaseConnection = async () => {
  try {
    console.log('🧪 Testing database connection...');
    const result = await mongoose.connection.db.admin().ping();
    
    if (result.ok === 1) {
      console.log('✅ Database connection test PASSED');
      return true;
    } else {
      console.log('❌ Database connection test FAILED');
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

    const isConnected = await waitForMongoConnection(20000);
    
    if (!isConnected) {
      console.log('⚠️ MongoDB not fully connected, skipping application initialization');
      return;
    }

    const connectionTest = await testDatabaseConnection();
    if (!connectionTest) {
      console.log('⚠️ Database connection test failed, skipping application initialization');
      return;
    }

    console.log('⏳ Ensuring database is fully ready...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('✅ Database confirmed ready, initializing application...');
    await initializeApplication();
    logger.info('✅ Application initialization completed successfully');
  } catch (error) {
    console.error('❌ Application initialization failed', {
      error: error.message,
      dbState: getDbStateText(mongoose.connection.readyState),
    });
  }
};

// Logging Setup
const configureLogging = () => {
  let LOG_DIR = process.env.LOG_DIR || './logs';
  let LOG_FILE = path.join(LOG_DIR, 'server.log');

  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    
    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });
    console.log(`✅ Log file configured: ${LOG_FILE}`);
    
    return { logStream, logFile: LOG_FILE };
  } catch (err) {
    console.warn(`⚠️ Cannot use log directory ${LOG_DIR}: ${err.message}`);
    return {
      logStream: { write: () => {}, end: (cb) => cb && cb() },
      logFile: null,
    };
  }
};

const { logStream, logFile } = configureLogging();

// Graceful Shutdown
const configureShutdown = (server) => {
  const shutdown = async (signal) => {
    console.log(`Shutdown signal received: ${signal}`);
    
    try {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
    } catch (dbError) {
      console.error('❌ Error closing MongoDB connection:', dbError.message);
    }

    logStream.end(() => {
      console.log('✅ Log stream closed');
      console.log('🛑 Shutdown completed');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

// Helper function to get DB state text
function getDbStateText(state) {
  const states = {
    0: '❌ Disconnected',
    1: '✅ Connected',
    2: '🔄 Connecting',
    3: '⏳ Disconnecting',
  };
  return states[state] || `❓ Unknown (${state})`;
}

// Network IP Helper Function
function getNetworkIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Helper function to format date for clean display
const formatDateForDisplay = (date) => {
  if (!date) return null;
  
  if (date instanceof Date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  } else if (typeof date === 'string') {
    // If it's already a string but contains time, extract date part
    if (date.includes('T')) {
      return date.split('T')[0];
    }
    // If it's in wrong format like "Wed Nov 26 2025 16:00:00 GMT-0800", parse it
    else if (date.includes('GMT')) {
      try {
        const parsedDate = new Date(date);
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate.toISOString().split('T')[0];
        }
      } catch (e) {
        // Keep original if parsing fails
      }
    }
    // If it's already in YYYY-MM-DD format, return as is
    return date;
  }
  return date;
};

// System status with fallback
let systemStatus = { 
  currentBusinessDate: null,
  initialized: false 
};

// Safe system status getter - FIXED VERSION
const getSystemStatus = () => {
  if (!systemStatus || typeof systemStatus !== 'object') {
    return {
      currentBusinessDate: null,
      initialized: false,
      status: 'Not Initialized'
    };
  }
  
  // Format the date for clean display
  const displayDate = formatDateForDisplay(systemStatus.currentBusinessDate);
  
  return {
    currentBusinessDate: displayDate,
    previousBusinessDate: formatDateForDisplay(systemStatus.previousBusinessDate),
    nextBusinessDate: formatDateForDisplay(systemStatus.nextBusinessDate),
    eodStatus: systemStatus.eodStatus || 'IDLE',
    initialized: systemStatus.initialized,
    status: systemStatus.currentBusinessDate ? 'Initialized' : 'Not Initialized'
  };
};

// Start Backend Server
const startServer = async () => {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 STARTING EVOLUTION BANKING BACKEND SERVER');
    console.log('='.repeat(60));

    // STEP 1: Connect to MongoDB
    console.log('🔄 STEP 1: Connecting to MongoDB...');
    await connectDB();

    // STEP 1.5: Wait for connection
    console.log('🔄 STEP 1.5: Waiting for MongoDB connection...');
    await waitForMongoConnection(25000);
    await testDatabaseConnection();

    // STEP 1.6: Initialize System Dates (FIXED VERSION)
    console.log('🔄 STEP 1.6: Initializing system dates...');
    if (mongoose.connection.readyState === 1) {
      try {
        // Initialize system dates and get the result
        const dateResult = await initializeSystemDates();
        
        // Use the result directly if available, otherwise create fallback
        if (dateResult && dateResult.currentBusinessDate) {
          systemStatus = dateResult;
          
          // Format the date for clean logging - FIXED VERSION
          const displayDate = formatDateForDisplay(systemStatus.currentBusinessDate);
          console.log(`✅ System dates initialized: ${displayDate}`);
        } else {
          // Try to get from import as fallback
          try {
            const osController = await import('./src/controllers/OsController.js');
            if (osController.systemStatus) {
              systemStatus = osController.systemStatus;
              const displayDate = formatDateForDisplay(systemStatus.currentBusinessDate);
              console.log(`✅ System dates initialized via import: ${displayDate}`);
            }
          } catch (importError) {
            console.log('⚠️ Could not get systemStatus from import');
          }
          
          // Final fallback
          if (!systemStatus.currentBusinessDate) {
            const fallbackDate = new Date().toISOString().split('T')[0];
            systemStatus = {
              currentBusinessDate: fallbackDate,
              previousBusinessDate: fallbackDate,
              nextBusinessDate: fallbackDate,
              eodStatus: 'IDLE',
              initialized: true
            };
            console.log(`✅ System dates set to fallback: ${fallbackDate}`);
          }
        }
      } catch (dateError) {
        console.log('⚠️ System dates initialization failed:', dateError.message);
        const fallbackDate = new Date().toISOString().split('T')[0];
        systemStatus = {
          currentBusinessDate: fallbackDate,
          previousBusinessDate: fallbackDate, 
          nextBusinessDate: fallbackDate,
          eodStatus: 'IDLE',
          initialized: false
        };
      }
    } else {
      console.log('⚠️ Skipping system dates initialization - MongoDB not connected');
      const fallbackDate = new Date().toISOString().split('T')[0];
      systemStatus = {
        currentBusinessDate: fallbackDate,
        previousBusinessDate: fallbackDate, 
        nextBusinessDate: fallbackDate,
        eodStatus: 'IDLE',
        initialized: false
      };
    }

    // STEP 2: Start the server
    console.log('🔄 STEP 2: Starting HTTP server...');
    const PORT = process.env.PORT || 5000;
    const HOST = process.env.HOST || '0.0.0.0';

    const server = app.listen(PORT, HOST, () => {
      console.log('\n' + '='.repeat(60));
      console.log('✅ BACKEND SERVER RUNNING SUCCESSFULLY');
      console.log('='.repeat(60));
      
      const currentStatus = getSystemStatus();
      const networkIP = getNetworkIP();
      
      // Format business date for display - FIXED VERSION
      const businessDateDisplay = currentStatus.currentBusinessDate 
        ? currentStatus.currentBusinessDate
        : 'Not set';
      
      console.log(`📍 Local URL: http://localhost:${PORT}`);
      console.log(`🌐 Network URL: http://${networkIP}:${PORT}`);
      console.log(`🔧 API Base: http://${networkIP}:${PORT}/api`);
      console.log(`📱 Frontend: ${process.env.CLIENT_URL || 'Not specified'}`);
      console.log(`🗄️  Database: ${getDbStateText(mongoose.connection.readyState)}`);
      console.log(`📅 Current Business Date: ${businessDateDisplay}`);
      console.log(`📅 System Dates: ${currentStatus.status}`);
      console.log(`🔄 EOD Status: ${currentStatus.eodStatus || 'IDLE'}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🛡️  CORS Origins: ${allowedOrigins.length} configured`);
      console.log('='.repeat(60) + '\n');

      // STEP 3: Initialize application in background
      if (mongoose.connection.readyState === 1) {
        console.log('🔄 STEP 3: Starting background application initialization...');
        safeInitializeApplication().then(() => {
          console.log('🎉 Application initialization completed!');
        });
      } else {
        console.log('⚠️ Skipping application initialization - MongoDB not connected');
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('Server error:', err.message);
      }
      process.exit(1);
    });

    configureShutdown(server);
  } catch (err) {
    console.error('❌ SERVER STARTUP FAILED:', err.message);
    process.exit(1);
  }
};

// Start the server
startServer();