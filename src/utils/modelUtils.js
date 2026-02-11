// src/utils/modelUtils.js
import { getModel, ensureModelsInitialized } from './modelHelper.js';
import logger from './logger.js';

/**
 * Middleware to ensure models are initialized before route handlers
 */
export const withModels = (handler) => {
  return async (req, res, next) => {
    try {
      await ensureModelsInitialized();
      return handler(req, res, next);
    } catch (error) {
      logger.error('Model initialization failed in route handler:', error);
      return res.status(500).json({
        success: false,
        message: 'Server initialization error',
        error: error.message
      });
    }
  };
};

/**
 * Get a model with error handling for routes
 */
export const getModelForRoute = async (modelName) => {
  try {
    await ensureModelsInitialized();
    return await getModel(modelName);
  } catch (error) {
    logger.error(`Failed to get model ${modelName} for route:`, error);
    throw new Error(`Model ${modelName} not available: ${error.message}`);
  }
};

/**
 * Safe database operation wrapper
 */
export const safeDbOperation = async (operation, errorMessage = 'Database operation failed') => {
  try {
    await ensureModelsInitialized();
    return await operation();
  } catch (error) {
    logger.error(`${errorMessage}:`, error);
    throw error;
  }
};

// Export commonly used model getters for convenience
export {
  getLoanAccount,
  getCustomer,
  getUser,
  getDeposit,
  getTransaction,
  getAuditTrail
} from './modelHelper.js';