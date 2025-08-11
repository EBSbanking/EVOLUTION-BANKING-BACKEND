// config/database.js
import mongoose from 'mongoose';
import { MongoClient } from 'mongodb';
import logger from '../utils/logger.js';
import os from 'os';

// Configuration
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000;
const CPU_CORES = os.cpus().length;
const CONNECTION_POOL_SIZE = Math.min(100, Math.max(10, CPU_CORES * 5));

let retryCount = 0;
let isConnected = false;

// Standard connection options (used in .connect())
const connectionOptions = {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  connectTimeoutMS: 15000,
  socketTimeoutMS: 60000,
  maxPoolSize: CONNECTION_POOL_SIZE,
  minPoolSize: 10,
  maxIdleTimeMS: 30000,
  retryWrites: true,
  w: 'majority',
  readPreference: 'primary', // ✅ changed from primaryPreferred
  heartbeatFrequencyMS: 10000,
  serverSelectionTimeoutMS: 30000,
  retryReads: true
};

// Transaction-safe client options
const transactionConnectionOptions = {
  ...connectionOptions,
  readPreference: 'primary',
  readConcern: { level: 'majority' },
  writeConcern: { w: 'majority', j: true }
};

const connectDB = async () => {
  if (isConnected) return mongoose.connection;

  if (!process.env.MONGODB_URI) {
    logger.error('❌ MONGODB_URI is not defined');
    process.exit(1);
  }

  try {
    logger.info(`🚀 Connecting to MongoDB (Attempt ${retryCount + 1}/${MAX_RETRIES})`);

    mongoose.connection.on('connected', () => {
      isConnected = true;
      logger.info('✅ MongoDB Connection Established', {
        host: mongoose.connection.host,
        db: mongoose.connection.name
      });
      initializeDatabase();
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('⚠️ MongoDB Disconnected');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('❌ MongoDB Connection Error', { error: err.message });
    });

    await mongoose.connect(process.env.MONGODB_URI, connectionOptions);

    if (process.env.NODE_ENV === 'development') {
      mongoose.set('debug', (collection, method, query, doc) => {
        logger.debug(`MongoDB ${collection}.${method}`, {
          query: JSON.stringify(query),
          doc: JSON.stringify(doc)
        });
      });
    }

    return mongoose.connection;

  } catch (error) {
    retryCount++;
    logger.error(`❌ MongoDB Connection Failed (Attempt ${retryCount})`, {
      error: error.message,
      stack: error.stack
    });

    if (retryCount >= MAX_RETRIES) {
      logger.error('💥 Maximum retries reached. Exiting...');
      process.exit(1);
    }

    const delay = RETRY_DELAY * Math.pow(2, retryCount);
    logger.warn(`⏳ Retrying in ${delay / 1000} seconds...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return connectDB();
  }
};

// Start session with correct transaction options
export const startTransactionSession = async () => {
  const session = await mongoose.connection.startSession({
    defaultTransactionOptions: {
      readPreference: 'primary',
      readConcern: { level: 'majority' },
      writeConcern: { w: 'majority' }
    }
  });
  session.startTransaction();
  return session;
};

// Setup counters & indexes
const initializeDatabase = async () => {
  try {
    logger.info('🏗️ Starting database initialization...');

    const initClient = new MongoClient(process.env.MONGODB_URI, transactionConnectionOptions);
    await initClient.connect();
    const db = initClient.db();

    const counters = [
      { _id: 'guarantorId', seq: 1000000 },
      { _id: 'transactionId', seq: 1000000000 },
      { _id: 'amlThresholdId', seq: 1000 }
    ];

    const counterCol = db.collection('counters');
    for (const counter of counters) {
      const exists = await counterCol.findOne({ _id: counter._id });
      if (!exists) {
        await counterCol.insertOne(counter);
        logger.info(`🔢 Initialized counter for ${counter._id}`);
      }
    }

    const indexes = {
      transactions: [
        { keys: { reference: 1 }, options: { unique: true } },
        { keys: { accountId: 1, date: -1 }, options: { background: true } },
        { keys: { amount: 1 }, options: { background: true } },
        { keys: { transactionId: 1 }, options: { unique: true } }
      ],
      amlthresholds: [
        { keys: { transaction_type: 1, currency: 1, active: 1 }, options: { unique: true } }
      ]
    };

    for (const [collection, collectionIndexes] of Object.entries(indexes)) {
      const col = db.collection(collection);
      const existing = await col.indexes();

      for (const { keys, options } of collectionIndexes) {
        const exists = existing.some(idx =>
          JSON.stringify(idx.key) === JSON.stringify(keys)
        );
        if (!exists) {
          await col.createIndex(keys, options);
          logger.info(`📌 Created index on ${collection}: ${JSON.stringify(keys)}`);
        }
      }
    }

    logger.info('🎉 Database initialization completed');
    await initClient.close();
  } catch (err) {
    logger.error('❌ Database initialization failed', {
      error: err.message,
      stack: err.stack
    });
    throw err;
  }
};

// Graceful shutdown
process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    logger.info('🛑 MongoDB connection closed due to app termination');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Failed to close MongoDB connection', {
      error: err.message,
      stack: err.stack
    });
    process.exit(1);
  }
});

export default connectDB;
