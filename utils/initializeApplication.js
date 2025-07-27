import mongoose from 'mongoose';
import logger from './logger.js';

/**
 * Safely creates indexes for a collection
 */
const createCollectionIndexes = async (db, collectionName, indexes) => {
  try {
    // Check if collection exists first
    const collections = await db.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) {
      await db.createCollection(collectionName);
      logger.info(`Created collection: ${collectionName}`);
    }

    const collection = db.collection(collectionName);
    
    // Create each index with error handling
    for (const index of indexes) {
      try {
        await collection.createIndex(index.key, index.options || {});
        logger.debug(`Created index for ${collectionName}: ${JSON.stringify(index.key)}`);
      } catch (indexError) {
        if (indexError.codeName === 'IndexOptionsConflict') {
          logger.warn(`Index already exists: ${collectionName}.${Object.keys(index.key).join('_')}`);
        } else {
          logger.error(`Failed to create index for ${collectionName}`, {
            index,
            error: indexError.message
          });
          throw indexError;
        }
      }
    }
  } catch (error) {
    logger.error(`Failed to initialize collection: ${collectionName}`, {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Initializes all database collections and indexes
 */
const initializeCollections = async () => {
  try {
    const db = mongoose.connection.db;

    const collectionsConfig = {
      transactions: [
        { key: { transactionId: 1 }, options: { unique: true } },
        { key: { userId: 1, date: -1 } },
        { key: { accountId: 1 } }
      ],
      users: [
        { key: { email: 1 }, options: { unique: true } },
        { key: { status: 1 } }
      ],
      accounts: [
        { key: { accountNumber: 1 }, options: { unique: true } },
        { key: { userId: 1 } }
      ]
    };

    // Initialize collections in sequence to avoid race conditions
    for (const [collectionName, indexes] of Object.entries(collectionsConfig)) {
      await createCollectionIndexes(db, collectionName, indexes);
    }

    logger.info('✅ All collections and indexes initialized');
  } catch (error) {
    logger.error('❌ Database initialization failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

/**
 * Main initialization function
 */
const initializeApplication = async () => {
  try {
    logger.info('🚀 Starting application initialization');
    
    // Wait for MongoDB connection to be ready
    await mongoose.connection.asPromise();
    
    await initializeCollections();
    
    logger.info('✅ Application initialization completed');
  } catch (error) {
    logger.error('❌ Application initialization failed', {
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
};

export default initializeApplication;