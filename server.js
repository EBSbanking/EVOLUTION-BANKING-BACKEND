// server.js - FIXED VERSION WITH PROPER DATABASE WAITING AND UPDATED CORS
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

dotenv.config();

// ----------------------------
// Enhanced CORS Configuration
// ----------------------------
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_LOCAL,
  process.env.CLIENT_URL_NETWORK
].filter(Boolean); // Remove any undefined or null values

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin']
}));

// ----------------------------
// Database Connection Helper - IMPROVED
// ----------------------------
const waitForDatabaseConnection = async (maxWaitTime = 30000) => {
  const startTime = Date.now();
  
  logger.info('🔍 Checking MongoDB connection state...');
  logger.info(`📊 Current DB state: ${mongoose.connection.readyState}`);
  
  return new Promise((resolve, reject) => {
    const checkConnection = () => {
      const currentTime = Date.now();
      const elapsedTime = currentTime - startTime;
      
      logger.info(`🔄 DB Connection Check - State: ${mongoose.connection.readyState}, Elapsed: ${elapsedTime}ms`);
      
      if (mongoose.connection.readyState === 1) {
        logger.info('✅ MongoDB connection verified and READY for queries');
        resolve();
      } else if (mongoose.connection.readyState === 2) {
        // Still connecting
        if (elapsedTime >= maxWaitTime) {
          reject(new Error(`MongoDB connection timeout after ${maxWaitTime}ms. Current state: ${mongoose.connection.readyState}`));
        } else {
          setTimeout(checkConnection, 1000);
        }
      } else {
        // Connection failed or disconnected
        reject(new Error(`MongoDB connection failed. Current state: ${mongoose.connection.readyState}`));
      }
    };
    
    checkConnection();
  });
};

// ----------------------------
// Safe Application Initialization
// ----------------------------
const safeInitializeApplication = async () => {
  try {
    logger.info('🛡️ Starting SAFE application initialization...');
    
    // Double-check connection before proceeding
    if (mongoose.connection.readyState !== 1) {
      logger.warn('⚠️ Database not ready, waiting...');
      await waitForDatabaseConnection(15000);
    }
    
    logger.info('✅ Database confirmed ready, initializing application...');
    await initializeApplication();
    logger.info('✅ Application initialization completed successfully');
    
  } catch (error) {
    logger.error('❌ Application initialization failed', {
      error: error.message,
      dbState: mongoose.connection.readyState,
      stack: error.stack
    });
    
    // Don't crash the server, just log the error
    console.error('⚠️ Application initialization failed, but server will continue running');
    console.error('   Error:', error.message);
    console.error('   Database queries may fail until initialization completes');
  }
};

// ----------------------------
// Logging Setup
// ----------------------------
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
    logFile: LOG_FILE
  };
};

const { logStream, logFile } = configureLogging();

// ----------------------------
// Graceful Shutdown
// ----------------------------
const configureShutdown = (server) => {
  const shutdown = async (signal) => {
    logger.info(`Shutdown signal received: ${signal}`);
    try {
      await mongoose.connection.close();
      logger.info('✅ MongoDB connection closed');
      logStream.end(() => {
        logger.info('Shutdown completed');
        process.exit(0);
      });
    } catch (err) {
      logger.error('Error during shutdown', { error: err.message });
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

// ----------------------------
// Start Backend Server - UPDATED SEQUENCE
// ----------------------------
const startServer = async () => {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 STARTING EVOLUTION BANKING BACKEND SERVER');
    console.log('='.repeat(60));
    
    // STEP 1: Connect to MongoDB
    logger.info('🔄 STEP 1: Connecting to MongoDB...');
    console.log('📡 Connecting to MongoDB Atlas...');
    await connectDB();
    
    // STEP 2: Wait for connection to be fully ready
    logger.info('🔄 STEP 2: Verifying MongoDB connection...');
    console.log('⏳ Waiting for database connection...');
    await waitForDatabaseConnection();
    
    // STEP 3: Start the server FIRST
    logger.info('🔄 STEP 3: Starting HTTP server...');
    const PORT = process.env.PORT || 5000;

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log('\n' + '='.repeat(60));
      console.log('✅ BACKEND SERVER RUNNING SUCCESSFULLY');
      console.log('='.repeat(60));
      console.log(`📍 Local URL: http://localhost:${PORT}`);
      console.log(`🌐 Network URL: ${process.env.CLIENT_URL_NETWORK}:${PORT}`);
      console.log(`🔧 API Base: ${process.env.CLIENT_URL_NETWORK}:${PORT}/api`);
      console.log(`📱 Frontend: ${process.env.CLIENT_URL}`);
      console.log(`🗄️  Database: ${mongoose.connection.readyState === 1 ? '✅ Connected' : '❌ Disconnected'}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('='.repeat(60) + '\n');
    });

    // STEP 4: Initialize application in BACKGROUND (non-blocking)
    logger.info('🔄 STEP 4: Starting background application initialization...');
    console.log('⚙️  Initializing application services in background...');
    safeInitializeApplication().then(() => {
      console.log('🎉 Application initialization completed!');
    }).catch(err => {
      console.log('⚠️  Application initialization continuing in background...');
    });

    // Add port connection monitoring
    portStatusMonitor.onPortConnected(server, PORT);

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`❌ Port ${PORT} is already in use`, { error: err.message });
        console.error(`❌ Port ${PORT} is already occupied. Please use a different port.`);
        console.log(`💡 Try: PORT=${Number(PORT) + 1} npm start`);
      } else {
        logger.error('Server error', { error: err.message });
      }
      process.exit(1);
    });

    configureShutdown(server);

  } catch (err) {
    logger.error('❌ SERVER STARTUP FAILED', { 
      error: err.message,
      dbState: mongoose.connection.readyState,
      stack: err.stack
    });
    
    console.error('\n💥 SERVER STARTUP FAILED:');
    console.error('   Error:', err.message);
    console.error('   Database State:', getDbStateText(mongoose.connection.readyState));
    console.error('   Check: MongoDB connection string and network access');
    
    process.exit(1);
  }
};

// Helper function to get DB state text
function getDbStateText(state) {
  const states = {
    0: 'Disconnected',
    1: 'Connected', 
    2: 'Connecting',
    3: 'Disconnecting',
    99: 'Uninitialized'
  };
  return states[state] || `Unknown (${state})`;
}

// Start the server
startServer();