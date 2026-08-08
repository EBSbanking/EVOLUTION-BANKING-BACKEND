// src/utils/modelHelper.js

// Re-export everything from modelLoader.js
export * from './modelLoader.js';

// Additional helper functions
import logger from './logger.js';
import sequelize from '../../config/db.js';

// Backward compatibility function
export const ensureModelsInitialized = async () => {
  const { initializeModels, areModelsInitialized } = await import('./modelLoader.js');
  if (!areModelsInitialized()) {
    logger.info('⚡ Auto-initializing models on demand...');
    await initializeModels();
  }
};

// Convenience function to get Op operators
export const getOp = () => {
  const { getOp } = require('./modelLoader.js');
  return getOp();
};

// Convenience function to get DataTypes
export const getDataTypes = () => {
  const { getDataTypes } = require('./modelLoader.js');
  return getDataTypes();
};

// ============================================
// ✅ MODEL INITIALIZATION FUNCTIONS
// ============================================

/**
 * Initialize a model that's exported as a factory function
 */
export function initModel(modelFactory) {
  if (typeof modelFactory === 'function') {
    try {
      const result = modelFactory(sequelize);
      if (result && typeof result === 'object') {
        return result;
      }
    } catch (error) {
      console.warn('⚠️ Failed to initialize model:', error.message);
    }
  }
  return modelFactory;
}

/**
 * Initialize multiple models
 */
export function initModels(modelMap) {
  const initialized = {};
  for (const [key, modelFactory] of Object.entries(modelMap)) {
    initialized[key] = initModel(modelFactory);
  }
  return initialized;
}

// Test function
export const testModelLoading = async () => {
  try {
    await ensureModelsInitialized();
    const { getLoadedModelNames, getModel } = await import('./modelLoader.js');
    const models = getLoadedModelNames();
    
    logger.info('✅ Model helper test passed');
    logger.info(`📊 Models available: ${models.length}`);
    
    // Test a critical model
    try {
      const LoanAccount = await getModel('LoanAccount');
      const count = await LoanAccount.count();
      logger.info(`✅ LoanAccount model works. Count: ${count}`);
    } catch (error) {
      logger.warn(`⚠️ LoanAccount test failed: ${error.message}`);
    }
    
    return {
      success: true,
      modelCount: models.length,
      models: models
    };
  } catch (error) {
    logger.error('❌ Model helper test failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
};

// Default export
const modelHelper = {
  ensureModelsInitialized,
  testModelLoading,
  getOp,
  getDataTypes,
  initModel,
  initModels
};

export default modelHelper;