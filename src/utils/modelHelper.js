// src/utils/modelHelper.js
export const getCustomerType = () => {
  if (!global.modelLoader) {
    throw new Error('Server not initialized. Models not available.');
  }
  
  if (!global.modelLoader.areModelsInitialized()) {
    throw new Error('Models not initialized. Call initModels() first.');
  }
  
  return global.modelLoader.getModel('CustomerType');
};

export const getNextOfKin = () => {
  if (!global.modelLoader) {
    throw new Error('Server not initialized. Models not available.');
  }
  
  if (!global.modelLoader.areModelsInitialized()) {
    throw new Error('Models not initialized. Call initModels() first.');
  }
  
  return global.modelLoader.getModel('NextOfKin');
};

// Add other model getters as needed...
export const getCustomer = () => global.modelLoader?.getModel('Customer');
export const getUser = () => global.modelLoader?.getModel('User');
export const getBranch = () => global.modelLoader?.getModel('Branch');
export const getBusinessUnit = () => global.modelLoader?.getModel('BusinessUnit');