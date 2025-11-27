// utils/dbInitializer.js
import mongoose from 'mongoose';
import logger from './logger.js';
import { createError, ERROR_CODES } from './errorUtils.js';

// utils/dbInitializer.js
export async function initializeCollections() {
  const collections = [
    'systemdates',
    'holidays',
    'accounts', 
    'loans',
    'transactions',
    'thrifts',
    'customers',
    'ledgers',
    'gltransactionqueues',
    'reconciliations'
  ];

  try {
    for (const collectionName of collections) {
      try {
        const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
        if (collections.length === 0) {
          await mongoose.connection.db.createCollection(collectionName);
          logger.info(`Created collection: ${collectionName}`);
          
          // Add a sample holiday if it's the holidays collection
          if (collectionName === 'holidays') {
            const Holiday = mongoose.model('Holiday');
            const sampleHoliday = new Holiday({
              date: new Date(new Date().getFullYear() + 1, 0, 1), // Next year Jan 1
              description: 'New Year Day',
              recurring: true,
              country: 'NG',
              createdBy: 'system'
            });
            await sampleHoliday.save();
            logger.info('Added sample holiday for testing');
          }
        }
      } catch (error) {
        logger.warn(`Collection ${collectionName} initialization issue:`, { error: error.message });
      }
    }
  } catch (error) {
    logger.error('Failed to initialize collections', { error });
    throw error;
  }
}