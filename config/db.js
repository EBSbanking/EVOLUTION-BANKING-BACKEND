// config/database.js
import mongoose from 'mongoose';
import { MongoClient } from 'mongodb';
import logger from '../utils/logger.js';
import cluster from 'cluster';
import os from 'os';

// Configuration
const MAX_RETRIES = 5;
const RETRY_DELAY = 5000; // 5 seconds
const CPU_CORES = os.cpus().length;
const CONNECTION_POOL_SIZE = Math.min(100, Math.max(10, CPU_CORES * 5)); // Dynamic pool sizing

let retryCount = 0;
let isConnected = false;

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
  readPreference: 'secondaryPreferred',
  heartbeatFrequencyMS: 10000,
  serverSelectionTimeoutMS: 30000
};

const connectDB = async () => {
  if (isConnected) return mongoose.connection;

  if (!process.env.MONGODB_URI) {
    logger.error('❌ MONGODB_URI is not defined', { pid: process.pid });
    process.exit(1);
  }

  try {
    logger.info(`🚀 Connecting to MongoDB (Attempt ${retryCount + 1}/${MAX_RETRIES})`, {
      pid: process.pid,
      poolSize: CONNECTION_POOL_SIZE
    });

    mongoose.connection.on('connected', () => {
      isConnected = true;
      logger.info('✅ MongoDB Connection Established', {
        pid: process.pid,
        host: mongoose.connection.host,
        db: mongoose.connection.name
      });
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('⚠️ MongoDB Disconnected', { pid: process.pid });
    });

    mongoose.connection.on('error', (err) => {
      logger.error('❌ MongoDB Connection Error', {
        pid: process.pid,
        error: err.message
      });
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

    if (cluster.isPrimary) {
      await createIndexes();
      await initializeCollections();
    }

    return mongoose.connection;

  } catch (error) {
    retryCount++;
    logger.error(`❌ MongoDB Connection Failed (Attempt ${retryCount})`, {
      pid: process.pid,
      error: error.message
    });

    if (retryCount >= MAX_RETRIES) {
      logger.error('💥 Maximum retries reached. Exiting...', { pid: process.pid });
      process.exit(1);
    }

    const delay = RETRY_DELAY * Math.pow(2, retryCount);
    logger.warn(`⏳ Retrying in ${delay / 1000} seconds...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return connectDB();
  }
};

// Index Creation with Conflict Handling
const createIndexes = async () => {
  const client = new MongoClient(process.env.MONGODB_URI, {
    connectTimeoutMS: 30000,
    socketTimeoutMS: 120000
  });

  try {
    await client.connect();
    const db = client.db();

    const indexes = {
    
      transactions: [
        { keys: { reference: 1 }, options: { unique: true } },
        { keys: { accountId: 1, date: -1 }, options: { background: true } },
        { keys: { amount: 1 }, options: { background: true } }
      ]
    };

    for (const [collection, collectionIndexes] of Object.entries(indexes)) {
      const col = db.collection(collection);
      const existing = await col.indexes();

      for (const { keys, options } of collectionIndexes) {
        const indexName = options?.name;
        const conflictingIndex = existing.find(idx =>
          idx.name === indexName && JSON.stringify(idx.key) !== JSON.stringify(keys)
        );

        if (conflictingIndex) {
          logger.warn(`⚠️ Dropping conflicting index ${conflictingIndex.name} on ${collection}`);
          await col.dropIndex(conflictingIndex.name);
        }

        const exists = existing.some(idx =>
          idx.name === indexName || JSON.stringify(idx.key) === JSON.stringify(keys)
        );

        if (!exists) {
          const result = await col.createIndex(keys, options);
          logger.info(`📌 Created index on ${collection}: ${JSON.stringify(keys)}`, {
            result,
            options
          });
        } else {
          logger.info(`ℹ️ Index already exists on ${collection}: ${indexName || JSON.stringify(keys)}`);
        }
      }
    }
  } catch (err) {
    logger.error('❌ Index creation failed', {
      error: err.message,
      stack: err.stack
    });
  } finally {
    await client.close();
  }
};

const initializeCollections = async () => {
  try {
    const counters = [
      { _id: 'guarantorId', seq: 1000000 },
      { _id: 'transactionId', seq: 1000000000 }
    ];

    const counterCol = mongoose.connection.db.collection('counters');
    for (const counter of counters) {
      const exists = await counterCol.findOne({ _id: counter._id });
      if (!exists) {
        await counterCol.insertOne(counter);
        logger.info(`🔢 Initialized counter for ${counter._id}`);
      }
    }
  } catch (err) {
    logger.error('❌ Failed to initialize collections', {
      error: err.message
    });
  }
};

process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    logger.info('🛑 MongoDB connection closed due to app termination');
    process.exit(0);
  } catch (err) {
    logger.error('❌ Failed to close MongoDB connection', {
      error: err.message
    });
    process.exit(1);
  }
});

export default connectDB;
