// src/utils/modelLoader.js
import { initializeModels } from '../models/index.js';

// Variables to hold initialized models
let models = null;
let modelsInitialized = false;

/**
 * Initialize models if not already initialized
 * Call this once at app startup
 */
export const initModels = async () => {
  if (!modelsInitialized) {
    console.log('🔄 Initializing models via modelLoader...');
    
    try {
      // Call initializeModels from the main models/index.js
      models = await initializeModels();
      modelsInitialized = true;
      console.log('✅ Models initialized via modelLoader');
      
      // Log what models we have
      if (models) {
        console.log('📊 Available models:');
        console.log('- Customer:', models.Customer ? '✓' : '✗');
        console.log('- Thrift:', models.Thrift ? '✓' : '✗');
        console.log('- Transaction:', models.Transaction ? '✓' : '✗');
        console.log('- User:', models.User ? '✓' : '✗');
        console.log('- sequelize:', models.sequelize ? '✓' : '✗');
      }
    } catch (error) {
      console.error('❌ Failed to initialize models:', error.message);
      throw error;
    }
  }
  return models;
};

/**
 * Get initialized models
 * Call this after initModels()
 */
export const getModels = () => {
  if (!modelsInitialized) {
    throw new Error('Models not initialized. Call initModels() first.');
  }
  return models;
};

/**
 * Get specific model
 */
export const getCustomer = () => {
  if (!modelsInitialized) throw new Error('Models not initialized');
  return models.Customer;
};

export const getThrift = () => {
  if (!modelsInitialized) throw new Error('Models not initialized');
  return models.Thrift;
};

export const getTransaction = () => {
  if (!modelsInitialized) throw new Error('Models not initialized');
  return models.Transaction;
};

export const getUser = () => {
  if (!modelsInitialized) throw new Error('Models not initialized');
  return models.User;
};

export const getSequelize = () => {
  if (!modelsInitialized) throw new Error('Models not initialized');
  return models.sequelize;
};

/**
 * Export a convenience function to check if models are initialized
 */
export const areModelsInitialized = () => modelsInitialized;

/**
 * Direct model exports (will be available after initModels is called)
 * These will be undefined until initModels() is called
 */
export let Customer, Thrift, Transaction, User, sequelize;

// Update the exports after initialization
export const updateModelExports = () => {
  if (models) {
    Customer = models.Customer;
    Thrift = models.Thrift;
    Transaction = models.Transaction;
    User = models.User;
    sequelize = models.sequelize;
  }
};