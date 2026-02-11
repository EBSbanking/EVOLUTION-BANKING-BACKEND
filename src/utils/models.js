// src/utils/models.js
import modelLoader from './modelLoader.js';
import logger from './logger.js';

// Re-export everything from modelLoader
export { default as modelLoader } from './modelLoader.js';
export { 
  initializeModels, 
  getModel, 
  areModelsInitialized, 
  getAllModels, 
  hasModel,
  getLoadedModelNames,
  getModelsByCategory 
} from './modelLoader.js';

// Initialize models on first import
let initialized = false;

export const ensureInitialized = async () => {
  if (!initialized) {
    try {
      await modelLoader.initialize();
      initialized = true;
      logger.info('✅ Models initialized via models.js');
    } catch (error) {
      logger.error('❌ Failed to initialize models:', error.message);
      throw error;
    }
  }
};

// Helper function to get any model with auto-initialization
export const getModelAsync = async (modelName) => {
  await ensureInitialized();
  return modelLoader.getModel(modelName);
};

// ==================== SPECIFIC MODEL GETTERS ====================

export const getCustomer = async () => {
  await ensureInitialized();
  return modelLoader.getModel('Customer');
};

export const getCustomerType = async () => {
  await ensureInitialized();
  return modelLoader.getModel('CustomerType');
};

export const getNextOfKin = async () => {
  await ensureInitialized();
  return modelLoader.getModel('NextOfKin');
};

export const getUser = async () => {
  await ensureInitialized();
  return modelLoader.getModel('User');
};

export const getBranch = async () => {
  await ensureInitialized();
  return modelLoader.getModel('Branch');
};

export const getBusinessUnit = async () => {
  await ensureInitialized();
  return modelLoader.getModel('BusinessUnit');
};

export const getLoanAccount = async () => {
  await ensureInitialized();
  return modelLoader.getModel('LoanAccount');
};

export const getLoanRepayment = async () => {
  await ensureInitialized();
  return modelLoader.getModel('LoanRepayment');
};

export const getCustomerAccount = async () => {
  await ensureInitialized();
  return modelLoader.getModel('CustomerAccount');
};

export const getDirectDebit = async () => {
  await ensureInitialized();
  return modelLoader.getModel('DirectDebit');
};

export const getDeposit = async () => {
  await ensureInitialized();
  return modelLoader.getModel('Deposit');
};

export const getAuditTrail = async () => {
  await ensureInitialized();
  return modelLoader.getModel('AuditTrail');
};

export const getGLAccount = async () => {
  await ensureInitialized();
  return modelLoader.getModel('GLAccount');
};

export const getTransaction = async () => {
  await ensureInitialized();
  return modelLoader.getModel('Transaction');
};

export const getLoanProduct = async () => {
  await ensureInitialized();
  return modelLoader.getModel('LoanProduct');
};

export const getRepaymentSchedule = async () => {
  await ensureInitialized();
  return modelLoader.getModel('RepaymentSchedule');
};

export const getCreditApplication = async () => {
  await ensureInitialized();
  return modelLoader.getModel('CreditApplication');
};

export const getGuarantor = async () => {
  await ensureInitialized();
  return modelLoader.getModel('Guarantor');
};

export const getAML = async () => {
  await ensureInitialized();
  return modelLoader.getModel('AML');
};

export const getAMLThreshold = async () => {
  await ensureInitialized();
  return modelLoader.getModel('AMLThreshold');
};

// ==================== UTILITY FUNCTIONS ====================

export const checkModelExists = async (modelName) => {
  await ensureInitialized();
  return modelLoader.hasModel(modelName);
};

export const listAllModels = () => {
  if (!initialized) {
    return [];
  }
  return modelLoader.getLoadedModelNames();
};

// For synchronous access (use with caution)
export const getModelSync = (modelName) => {
  if (!initialized) {
    throw new Error('Models not initialized. Call ensureInitialized() first.');
  }
  return modelLoader.getModel(modelName);
};

// Test function
export const testAllModels = async () => {
  try {
    await ensureInitialized();
    const models = listAllModels();
    
    console.log('✅ Models loaded successfully');
    console.log(`📊 Total models: ${models.length}`);
    console.log('Available models:', models);
    
    // Test a few critical models
    const testModels = ['User', 'Customer', 'LoanAccount', 'Deposit'];
    for (const modelName of testModels) {
      try {
        const model = await getModelAsync(modelName);
        const count = await model.count();
        console.log(`✅ ${modelName}: ${count} records`);
      } catch (error) {
        console.log(`⚠️ ${modelName}: ${error.message}`);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Model test failed:', error);
    return false;
  }
};

// Get all models
export const getAllModelsAsync = async () => {
  await ensureInitialized();
  return modelLoader.getAllModels();
};

// Get models by category
export const getModelsByCategoryAsync = async () => {
  await ensureInitialized();
  return modelLoader.getModelsByCategory();
};

// Auto-initialize in development
if (process.env.NODE_ENV === 'development') {
  setTimeout(async () => {
    try {
      await ensureInitialized();
      console.log('🔧 Auto-initialized models in development mode');
    } catch (error) {
      console.warn('⚠️ Auto-initialization failed:', error.message);
    }
  }, 1000);
}

// Export a default object for convenience
const models = {
  // Initialization
  ensureInitialized,
  areModelsInitialized: () => initialized,
  
  // Model getters
  getCustomer,
  getCustomerType,
  getNextOfKin,
  getUser,
  getBranch,
  getBusinessUnit,
  getLoanAccount,
  getLoanRepayment,
  getCustomerAccount,
  getDirectDebit,
  getDeposit,
  getAuditTrail,
  getGLAccount,
  getTransaction,
  getLoanProduct,
  getRepaymentSchedule,
  getCreditApplication,
  getGuarantor,
  getAML,
  getAMLThreshold,
  
  // Utility functions
  getModelAsync,
  getModelSync,
  checkModelExists,
  listAllModels,
  testAllModels,
  getAllModelsAsync,
  getModelsByCategoryAsync,
  
  // Direct access to loader
  loader: modelLoader
};

export default models;