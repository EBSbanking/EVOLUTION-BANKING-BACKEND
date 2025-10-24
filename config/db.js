// config/db.js
import mongoose from 'mongoose';
import logger from '../utils/logger.js';
import os from 'os';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

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
  bufferCommands: false,
};

// Debug MongoDB URI (mask password for security)
const debugMongoURI = () => {
  if (!process.env.MONGODB_URI) {
    return 'MONGODB_URI is undefined';
  }
  try {
    const url = new URL(process.env.MONGODB_URI);
    return `${url.protocol}//${url.hostname}:${url.port}${url.pathname}?${url.searchParams}`;
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
    throw new Error('MONGODB_URI missing');
  }

  logger.info(`🔍 Attempting to connect to: ${debugMongoURI()}`);
  logger.info(`🔄 Connection attempt ${retryCount + 1}/${MAX_RETRIES}`);

  // Wrap connect in timeout
  const connectWithTimeout = () => Promise.race([
    mongoose.connect(process.env.MONGODB_URI, connectionOptions),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connect timeout: 30s exceeded')), 30000)
    ),
  ]);

  try {
    // Set up event listeners
    const setupListeners = () => {
      mongoose.connection.once('connected', () => {
        isConnected = true;
        retryCount = 0;
        logger.info('✅ MongoDB Connection Established', {
          host: mongoose.connection.host,
          port: mongoose.connection.port,
          database: mongoose.connection.name,
          readyState: mongoose.connection.readyState,
        });
      });

      mongoose.connection.once('disconnected', () => {
        isConnected = false;
        logger.warn('⚠️ MongoDB Disconnected');
      });

      mongoose.connection.on('error', (err) => {
        logger.error('❌ MongoDB Connection Error', {
          error: err.message,
          name: err.name,
        });
      });

      mongoose.connection.once('reconnected', () => {
        isConnected = true;
        logger.info('🔁 MongoDB Reconnected');
      });
    };
    setupListeners();

    // Attempt connection
    logger.info('🚀 Connecting to MongoDB...');
    await connectWithTimeout();

    // Wait for connection to be ready before initializing
    await new Promise((resolve, reject) => {
      if (mongoose.connection.readyState === 1) {
        return resolve();
      }
      mongoose.connection.once('connected', resolve);
      mongoose.connection.once('error', reject);
      setTimeout(() => reject(new Error('Connection not ready after 30s')), 30000);
    });

    logger.info('🎯 MongoDB connection successful');

    // Initialize database
    await initializeDatabase();

    return mongoose.connection;
  } catch (error) {
    retryCount++;
    logger.error(`❌ MongoDB Connection Failed (Attempt ${retryCount}/${MAX_RETRIES})`, {
      error: error.message,
      name: error.name,
      code: error.code,
      mongodbUri: debugMongoURI(),
    });

    if (retryCount >= MAX_RETRIES) {
      logger.error('💥 Maximum connection retries reached—failing open.');
      throw error;
    }

    const delay = RETRY_DELAY * Math.pow(2, retryCount - 1);
    logger.warn(`⏳ Retrying connection in ${delay / 1000} seconds...`);
    await new Promise(resolve => setTimeout(resolve, delay));

    return connectDB();
  }
};

// Enhanced database initialization
const initializeDatabase = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      throw new Error('Connection not ready for init');
    }

    logger.info('🏗️ Starting database initialization...');
    const db = mongoose.connection.db;

    // Counters with upsert
    const counters = [
      { _id: 'guarantorId', seq: 1000000 },
      { _id: 'transactionId', seq: 1000000000 },
      { _id: 'amlThresholdId', seq: 1000 },
    ];

    const counterCol = db.collection('counters');

    // Ensure unique index on _id
    try {
      await counterCol.createIndex({ _id: 1 }, { unique: true });
      logger.debug('✅ Counters unique index ensured');
    } catch (idxErr) {
      if (idxErr.codeName !== 'IndexAlreadyExists') {
        logger.warn('⚠️ Could not ensure counters index:', idxErr.message);
      }
    }

    let initCount = 0;
    for (const counter of counters) {
      const result = await counterCol.updateOne(
        { _id: counter._id },
        { $setOnInsert: { seq: counter.seq } },
        { upsert: true }
      );
      if (result.upsertedCount > 0) {
        logger.info(`🔢 Initialized counter for ${counter._id}`);
        initCount++;
      }
    }

    logger.info(`🎉 Database initialization completed: ${initCount} new counters`);
  } catch (err) {
    logger.error('❌ Database initialization failed', {
      error: err.message,
      stack: err.stack,
    });
    throw err;
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
    await mongoose.connection.close({ force: false });
    logger.info('✅ MongoDB connection closed gracefully');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Failed to close MongoDB connection gracefully', { error: err.message });
    process.exit(1);
  }
};

// Register shutdown handlers
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
  logger.error('💥 Uncaught Exception', { error: error.message });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('💥 Unhandled Promise Rejection', { reason: reason?.message || reason });
});

export default connectDB;