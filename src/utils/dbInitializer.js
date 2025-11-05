// utils/dbInitializer.js
import mongoose from 'mongoose';
import logger from './logger.js';
import { createError, ERROR_CODES } from './errorUtils.js';

export async function initializeCollections() {
  const collections = [
    'SystemDate',
    'Holiday',
    'Account',
    'Loan',
    'Transaction'
    // Add all your collections here
  ];

  try {
    await Promise.all(collections.map(async (collectionName) => {
      if (!mongoose.connection.collections[collectionName]) {
        await mongoose.connection.createCollection(collectionName);
        logger.info(`Created collection: ${collectionName}`);
      }
    }));
  } catch (error) {
    logger.error('Failed to initialize collections', { error });
    throw createError(
      ERROR_CODES.DATABASE_ERROR,
      'Collection initialization failed',
      { details: error.message }
    );
  }
}