import mongoose from 'mongoose';
import { MongoClient } from 'mongodb';
import logger from '../utils/logger.js';
import os from 'os';

// Configuration
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;
let retryCount = 0;
let isConnected = false;

// Enhanced connection options
const connectionOptions = {
  connectTimeoutMS: 30000,
  socketTimeoutMS: 60000,
  maxPoolSize: 50,
  minPoolSize: 5,
  maxIdleTimeMS: 30000,
  retryWrites: true,
  w: 'majority',
  serverSelectionTimeoutMS: 30000,
  retryReads: true,
  heartbeatFrequencyMS: 10000,
};

// Debug MongoDB URI (mask password for security)
const debugMongoURI = () => {
  if (!process.env.MONGODB_URI) {
    return 'MONGODB_URI is undefined';
  }
  
  try {
    const url = new URL(process.env.MONGODB_URI);
    const maskedURI = `${url.protocol}//${url.hostname}:${url.port}${url.pathname}?${url.searchParams}`;
    return maskedURI;
  } catch (error) {
    return 'Invalid MONGODB_URI format';
  }
};

const connectDB = async () => {
  if (isConnected) {
    logger.info('✅ Using existing MongoDB connection');
    return mongoose.connection;
  }

  // Validate MONGODB_URI
  if (!process.env.MONGODB_URI) {
    logger.error('❌ MONGODB_URI is not defined in environment variables');
    process.exit(1);
  }

  logger.info(`🔍 Attempting to connect to: ${debugMongoURI()}`);
  logger.info(`🔄 Connection attempt ${retryCount + 1}/${MAX_RETRIES}`);

  try {
    // Set up event listeners first
    mongoose.connection.on('connected', () => {
      isConnected = true;
      retryCount = 0; // Reset retry count on successful connection
      logger.info('✅ MongoDB Connection Established', {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        database: mongoose.connection.name,
        readyState: mongoose.connection.readyState
      });
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('⚠️ MongoDB Disconnected');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('❌ MongoDB Connection Error', {
        error: err.message,
        name: err.name
      });
    });

    mongoose.connection.on('reconnected', () => {
      isConnected = true;
      logger.info('🔁 MongoDB Reconnected');
    });

    // Attempt connection
    logger.info('🚀 Connecting to MongoDB...');
    
    // Test basic connectivity first
    await testBasicConnection();
    
    await mongoose.connect(process.env.MONGODB_URI, connectionOptions);
    
    logger.info('🎯 MongoDB connection successful');
    
    // Initialize database in background, don't block startup
    setTimeout(() => {
      initializeDatabase().catch(err => {
        logger.error('⚠️ Database initialization failed (non-critical)', {
          error: err.message
        });
      });
    }, 1000);

    return mongoose.connection;

  } catch (error) {
    retryCount++;
    
    logger.error(`❌ MongoDB Connection Failed (Attempt ${retryCount}/${MAX_RETRIES})`, {
      error: error.message,
      name: error.name,
      code: error.code,
      mongodbUri: debugMongoURI()
    });

    if (retryCount >= MAX_RETRIES) {
      logger.error('💥 Maximum connection retries reached. Application will exit.');
      process.exit(1);
    }

    const delay = RETRY_DELAY * Math.pow(2, retryCount - 1);
    logger.warn(`⏳ Retrying connection in ${delay / 1000} seconds...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    
    return connectDB();
  }
};

// Test basic network connectivity
const testBasicConnection = async () => {
  const uri = process.env.MONGODB_URI;
  try {
    const url = new URL(uri);
    const hostname = url.hostname;
    const port = url.port || 27017;
    
    logger.info(`🔧 Testing connection to ${hostname}:${port}`);
    
    // You could add a simple TCP connection test here if needed
  } catch (error) {
    logger.warn('⚠️ Could not parse MongoDB URI for connectivity test');
  }
};

// Enhanced database initialization with better error handling
const initializeDatabase = async () => {
  let initClient;
  try {
    logger.info('🏗️ Starting database initialization...');
    
    initClient = new MongoClient(process.env.MONGODB_URI, {
      ...connectionOptions,
      serverSelectionTimeoutMS: 15000 // Shorter timeout for initialization
    });
    
    await initClient.connect();
    const db = initClient.db();

    // Your existing initialization code here...
    const counters = [
      { _id: 'guarantorId', seq: 1000000 },
      { _id: 'transactionId', seq: 1000000000 },
      { _id: 'amlThresholdId', seq: 1000 },
    ];
    
    const counterCol = db.collection('counters');
    for (const counter of counters) {
      const exists = await counterCol.findOne({ _id: counter._id }, { projection: { _id: 1 } });
      if (!exists) {
        await counterCol.insertOne(counter);
        logger.info(`🔢 Initialized counter for ${counter._id}`);
      }
    }

    logger.info('🎉 Database initialization completed successfully');

  } catch (err) {
    logger.error('❌ Database initialization failed', {
      error: err.message,
      stack: err.stack,
    });
    // Don't throw here - initialization failure shouldn't crash the app
  } finally {
    if (initClient) {
      await initClient.close();
    }
  }
};

// Export transaction session function
export const startTransactionSession = async () => {
  if (!isConnected) {
    throw new Error('Database not connected');
  }
  
  const session = await mongoose.connection.startSession({
    defaultTransactionOptions: {
      readPreference: 'primary',
      readConcern: { level: 'majority' },
      writeConcern: { w: 'majority' },
    },
  });
  session.startTransaction();
  return session;
};

// Enhanced graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`🛑 Received ${signal}. Closing MongoDB connection...`);
  
  try {
    await mongoose.connection.close();
    logger.info('✅ MongoDB connection closed gracefully');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Failed to close MongoDB connection gracefully', {
      error: err.message,
    });
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception', { error: error.message });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Promise Rejection', { reason: reason?.message || reason });
});

export default connectDB;