// src/utils/modelLoader.js
import { initializeModels } from '../models/index.js';

let modelsInitialized = false;

/**
 * Initialize models if not already initialized
 * Call this once at app startup
 */
export const initModels = async () => {
  if (!modelsInitialized) {
    await initializeModels();
    modelsInitialized = true;
    console.log('✅ Models initialized via modelLoader');
  }
};

// Re-export all getter functions and models
export * from '../models/index.js';

// Export a convenience function to check if models are initialized
export const areModelsInitialized = () => modelsInitialized;