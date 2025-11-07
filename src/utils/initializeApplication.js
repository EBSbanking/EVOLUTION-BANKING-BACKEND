import mongoose from 'mongoose';
import logger from './logger.js';

/**
 * Safely creates indexes for a collection with enhanced error handling and idempotency
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
    
    // Check existing indexes for idempotency
    const existingIndexes = await collection.indexes();
    const existingKeys = existingIndexes.map(idx => 
      JSON.stringify(idx.key || { _id: 1 }) // Normalize for comparison
    );
    
    let createdCount = 0;
    
    // Create each index only if it doesn't exist
    for (const index of indexes) {
      const indexKeyStr = JSON.stringify(index.key);
      if (existingKeys.includes(indexKeyStr)) {
        logger.debug(`Index already exists for ${collectionName}: ${indexKeyStr}`);
        continue;
      }
      
      try {
        await collection.createIndex(index.key, index.options || {});
        logger.debug(`Created index for ${collectionName}: ${indexKeyStr}`);
        createdCount++;
      } catch (indexError) {
        // Handle different types of index errors
        if (indexError.codeName === 'IndexOptionsConflict' || indexError.codeName === 'IndexAlreadyExists') {
          logger.warn(`Index already exists (race?): ${collectionName}.${Object.keys(index.key).join('_')}`);
        } else if (indexError.code === 11000 || indexError.codeName === 'DuplicateKey') {
          logger.warn(`Duplicate key error creating index for ${collectionName}, attempting to fix...`);
          
          // For unique index errors, try to create sparse index instead
          if (index.options?.unique) {
            const indexName = index.options.name || Object.keys(index.key).map(k => `${k}_${index.key[k]}`).join('_');
            try {
              // First, drop the problematic index if it exists
              await collection.dropIndex(indexName);
              logger.debug(`Dropped problematic index: ${indexName}`);
            } catch (dropError) {
              if (dropError.codeName !== 'IndexNotFound') {
                logger.debug(`Could not drop index ${indexName}: ${dropError.message}`);
              }
            }
            
            // Create sparse unique index
            await collection.createIndex(index.key, { 
              ...index.options, 
              sparse: true,
              name: indexName
            });
            logger.debug(`Created sparse unique index for ${collectionName}: ${indexKeyStr}`);
            createdCount++;
          } else {
            throw indexError;
          }
        } else {
          logger.error(`Failed to create index for ${collectionName}`, {
            index: indexKeyStr,
            error: indexError.message,
            code: indexError.code,
            codeName: indexError.codeName
          });
          throw indexError; // Critical—bubble up
        }
      }
    }
    
    logger.info(`✅ Initialized ${collectionName}: Created ${createdCount} new indexes`);
  } catch (error) {
    logger.error(`Failed to initialize collection: ${collectionName}`, {
      error: error.message,
      stack: error.stack
    });
    throw error; // Re-throw for collection-level failures
  }
};

/**
 * Clean up duplicate null values in collections using batched updates
 */
const cleanupDuplicateNulls = async (db) => {
  try {
    logger.info('🧹 Starting duplicate null values cleanup...');
    
    const collectionsToClean = [
      {
        name: 'transactions',
        field: 'transactionId',
        uniqueField: '_id'
      },
      {
        name: 'users', 
        field: 'email',
        uniqueField: '_id'
      },
      {
        name: 'accounts',
        field: 'accountNumber',
        uniqueField: '_id'
      }
    ];

    let totalUpdated = 0;

    for (const { name, field, uniqueField } of collectionsToClean) {
      try {
        const collection = db.collection(name);
        
        // Count documents with null field values
        const nullCount = await collection.countDocuments({ [field]: null });
        
        if (nullCount === 0) {
          logger.debug(`No null ${field} values in ${name}`);
          continue;
        }
        
        logger.warn(`Found ${nullCount} documents with null ${field} in ${name}`);
        
        // Batch fetch null docs (limit 1000 per batch for perf)
        const nullDocs = await collection.find({ [field]: null }).limit(1000).toArray();
        
        if (nullDocs.length === 0) continue;
        
        // Prepare bulk operations
        const bulkOps = nullDocs.map(doc => ({
          updateOne: {
            filter: { [uniqueField]: doc[uniqueField] },
            update: { $set: { [field]: `temp_${doc[uniqueField]}_${Date.now()}` } }
          }
        }));
        
        const result = await collection.bulkWrite(bulkOps, { ordered: false });
        const updatedCount = result.modifiedCount || 0;
        
        logger.info(`Updated ${updatedCount} documents in ${name} with temporary ${field} values`);
        totalUpdated += updatedCount;
        
        // If more than 1000, log warning (manual cleanup needed for very large sets)
        if (nullCount > 1000) {
          logger.warn(`Large null set in ${name} (${nullCount - updatedCount} remaining)—consider manual cleanup`);
        }
      } catch (cleanupError) {
        logger.warn(`Could not cleanup ${name}.${field}: ${cleanupError.message}`);
        // Continue with other collections
      }
    }
    
    logger.info(`✅ Null values cleanup completed: ${totalUpdated} total updates`);
  } catch (error) {
    logger.error('❌ Failed to cleanup duplicate null values', {
      error: error.message
    });
    // Don't throw, continue with initialization
  }
};

/**
 * Initializes all database collections and indexes
 */
const initializeCollections = async () => {
  try {
    const db = mongoose.connection.db;

    // Clean up duplicate null values before creating indexes
    await cleanupDuplicateNulls(db);

    const collectionsConfig = {
      transactions: [
        { 
          key: { transactionId: 1 }, 
          options: { 
            unique: true, 
            sparse: true,
            name: "transactionId_unique"
          } 
        },
        { 
          key: { userId: 1, date: -1 }, 
          options: { name: "userId_date_desc" } 
        },
        { 
          key: { accountId: 1 }, 
          options: { name: "accountId_index" } 
        }
      ],
      users: [
        { 
          key: { email: 1 }, 
          options: { 
            unique: true, 
            sparse: true,
            name: "email_unique" 
          } 
        },
        { 
          key: { status: 1 }, 
          options: { name: "status_index" } 
        }
      ],
      accounts: [
        { 
          key: { accountNumber: 1 }, 
          options: { 
            unique: true, 
            sparse: true,
            name: "accountNumber_unique" 
          } 
        },
        { 
          key: { userId: 1 }, 
          options: { name: "userId_index" } 
        }
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
 * Helper: Retry wrapper for DB ops
 */
const retryDBOperation = async (operation, maxRetries = 5, baseDelay = 2000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      logger.info(`✅ DB operation succeeded on attempt ${attempt}`);
      return result;
    } catch (error) {
      if (error.message.includes('buffering timed out') && attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
        logger.warn(`⚠️ DB operation failed (attempt ${attempt}/${maxRetries}): ${error.message}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        logger.error(`❌ DB operation failed after ${maxRetries} attempts:`, error.message);
        throw error;
      }
    }
  }
};

/**
 * Initialize system dates with retry logic
 */
const initializeSystemDates = async () => {
  try {
    logger.info('📅 Initializing system dates...');
    
    // Import model dynamically to avoid early load
    const { default: SystemDate } = await import('../models/SystemDate.js'); // Adjust path as needed
    
    const systemDate = await retryDBOperation(async () => {
      return await SystemDate.findOne({}).lean(); // Your original query; add filter if needed
    });

    if (!systemDate) {
      logger.warn('⚠️ No system date found—creating default');
      // Fallback: Create default (adjust schema)
      await retryDBOperation(async () => {
        const defaultDate = new SystemDate({
          date: new Date(),
          timezone: 'WAT', // Or from env
          // Add other fields as per your schema
        });
        await defaultDate.save();
        return defaultDate;
      });
      logger.info('✅ Default system date created');
    } else {
      logger.info(`✅ System date loaded: ${systemDate.date}`);
    }
  } catch (error) {
    logger.error('❌ System dates initialization failed:', {
      error: error.message,
      stack: error.stack
    });
    // Graceful fallback
    logger.warn('⚠️ System dates init failed, using current date as fallback');
  }
};

/**
 * Main initialization function
 */
const initializeApplication = async () => {
  try {
    logger.info('🚀 Starting application initialization');
    
    // Enhanced: Wait for MongoDB connection to be ready (with timeout) - Fix deprecated asPromise()
    await new Promise((resolve, reject) => {
      if (mongoose.connection.readyState === 1) {
        return resolve();
      }
      
      const timeout = setTimeout(() => {
        reject(new Error('DB connection timeout in init'));
      }, 30000); // Increased to 30s for Render cold starts
      
      mongoose.connection.once('connected', () => {
        clearTimeout(timeout);
        resolve();
      });
      
      mongoose.connection.once('error', reject);
    });
    
    // Initialize system dates first (critical for app)
    await initializeSystemDates();
    
    // Then collections/indexes
    await initializeCollections();
    
    logger.info('✅ Application initialization completed');
  } catch (error) {
    logger.error('❌ Application initialization failed', {
      error: error.message,
      stack: error.stack
    });
    
    // Don't throw the error to allow server to continue running
    // but log it as a warning for monitoring
    logger.warn('⚠️ Application initialization failed, but server will continue running');
    logger.warn('   Database queries may fail until initialization completes');
  }
};

export default initializeApplication;