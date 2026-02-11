// src/utils/modelHelper.js
// Re-export everything from modelLoader.js
export * from './modelLoader.js';


// Additional helper functions
import logger from './logger.js';

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
  getDataTypes
};

export default modelHelper;