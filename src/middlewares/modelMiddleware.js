// middlewares/modelMiddleware.js
import { initializeModels, getCustomer } from '../models/index.js';

let modelsInitialized = false;

export const ensureModelsInitialized = async (req, res, next) => {
  try {
    if (!modelsInitialized) {
      console.log('🔄 Initializing models in middleware...');
      await initializeModels();
      modelsInitialized = true;
      console.log('✅ Models initialized in middleware');
    }
    
    // Attach model getters to request object for easy access
    req.getModel = (modelName) => {
      const modelGetters = {
        'Customer': getCustomer,
        'User': getUser,
        // Add other models as needed
      };
      
      const getter = modelGetters[modelName];
      return getter ? getter() : null;
    };
    
    next();
  } catch (error) {
    console.error('❌ Failed to initialize models in middleware:', error);
    res.status(500).json({
      success: false,
      message: 'Database models initialization failed',
      error: error.message
    });
  }
};