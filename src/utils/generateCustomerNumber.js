// utils/generateCustomerNumber.js - COMPLETE FIXED VERSION
import { initializeModels, getCustomer, getSequelize } from '../models/index.js';

// Constants
const CUST_ID_LENGTH = 10;
const CUST_NO_LENGTH = 9; // Updated to match your example "000000003"
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 100;

// Global variables for models
let Customer = null;
let sequelize = null;
let modelsInitialized = false;

// Initialize models for this utility
const initModelsForUtility = async () => {
  if (modelsInitialized) {
    return { Customer, sequelize };
  }
  
  try {
    console.log('🔄 Initializing models for generateCustomerNumber...');
    
    // Initialize models from models/index.js
    const models = await initializeModels();
    
    // Get models using getter functions
    Customer = getCustomer();
    sequelize = getSequelize();
    
    if (!Customer || !sequelize) {
      throw new Error('Customer model or Sequelize not loaded');
    }
    
    // Check if Customer has Sequelize model methods
    if (typeof Customer.findOne !== 'function') {
      console.error('❌ Customer is not a valid Sequelize model in generateCustomerNumber');
      throw new Error('Customer model is not properly initialized');
    }
    
    console.log('✅ Models initialized for generateCustomerNumber');
    modelsInitialized = true;
    
    return { Customer, sequelize };
  } catch (error) {
    console.error('❌ Failed to initialize models for generateCustomerNumber:', error);
    throw error;
  }
};

// Safe database operation with retry logic
const safeDbOperation = async (operation, maxRetries = 3, delay = 100) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Initialize models before each attempt
      await initModelsForUtility();
      
      if (!Customer) {
        throw new Error('Customer model not initialized');
      }
      
      return await operation();
    } catch (error) {
      console.warn(`⚠️ Database operation attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Exponential backoff
      const backoffDelay = delay * Math.pow(2, attempt - 1);
      console.log(`🔄 Retrying in ${backoffDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffDelay));
      
      // Reset models for next attempt
      modelsInitialized = false;
    }
  }
};

// Verify and repair counter table
const verifyAndRepairCounter = async () => {
  try {
    console.log('🔍 Verifying counter table...');
    
    // Check if counter table exists
    const [tables] = await sequelize.query(`
      SELECT TABLE_NAME 
      FROM INFORMATION_SCHEMA.TABLES 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'customer_counter'
    `);
    
    if (tables.length === 0) {
      console.log('🔄 Creating counter table...');
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS customer_counter (
          id INT AUTO_INCREMENT PRIMARY KEY,
          counter_type VARCHAR(50) NOT NULL UNIQUE,
          last_used_id VARCHAR(50) NOT NULL,
          last_used_number VARCHAR(50) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      // Insert default counter
      await sequelize.query(`
        INSERT INTO customer_counter (counter_type, last_used_id, last_used_number) 
        VALUES ('customer', '0000000000', '000000000')
      `);
      
      console.log('✅ Counter table created and initialized');
    } else {
      console.log('✅ Counter table exists');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Failed to verify/repair counter table:', error.message);
    return false;
  }
};

// Get last used numbers from database
const getLastUsedNumbers = async () => {
  return await safeDbOperation(async () => {
    // Verify counter table exists
    await verifyAndRepairCounter();
    
    const [results] = await sequelize.query(`
      SELECT last_used_id, last_used_number 
      FROM customer_counter 
      WHERE counter_type = 'customer' 
      LIMIT 1
    `);
    
    if (results.length > 0) {
      return {
        lastCUST_ID: results[0].last_used_id,
        lastCUST_NO: results[0].last_used_number
      };
    }
    
    // Default values
    return {
      lastCUST_ID: '0000000000',
      lastCUST_NO: '000000000'
    };
  });
};

// Update last used numbers in database
const updateLastUsedNumbers = async (custId, custNo) => {
  return await safeDbOperation(async () => {
    await sequelize.query(`
      UPDATE customer_counter 
      SET last_used_id = ?, last_used_number = ?, updated_at = NOW()
      WHERE counter_type = 'customer'
    `, {
      replacements: [custId, custNo]
    });
    
    console.log(`📊 Counter updated: CUST_ID=${custId}, CUST_NO=${custNo}`);
  });
};

// Check if customer ID already exists
const customerIdExists = async (custId) => {
  return await safeDbOperation(async () => {
    const existingCustomer = await Customer.findOne({
      where: { CUST_ID: custId },
      attributes: ['id']
    });
    
    return !!existingCustomer;
  });
};

// Find the next available customer ID
const findNextAvailableId = async (lastId) => {
  let baseNumber = parseInt(lastId, 10) + 1;
  let attempts = 0;
  const maxAttempts = 1000; // Safety limit
  
  while (attempts < maxAttempts) {
    const proposedId = String(baseNumber).padStart(CUST_ID_LENGTH, '0');
    
    // Check if this ID already exists
    const exists = await customerIdExists(proposedId);
    
    if (!exists) {
      return {
        id: proposedId,
        baseNumber: baseNumber
      };
    }
    
    // ID exists, try next one
    baseNumber++;
    attempts++;
  }
  
  throw new Error(`Could not find available customer ID after ${maxAttempts} attempts`);
};

// Generate customer number with retry logic
const generateCustomerNumber = async () => {
  try {
    // Initialize models
    await initModelsForUtility();
    
    // Get last used numbers
    const { lastCUST_ID, lastCUST_NO } = await getLastUsedNumbers();
    console.log(`📊 Last used: CUST_ID=${lastCUST_ID}, CUST_NO=${lastCUST_NO}`);
    
    // Find next available ID
    const { id: newCUST_ID, baseNumber } = await findNextAvailableId(lastCUST_ID);
    
    // Generate customer number (baseNumber * 1, but we can use a different logic)
    const custNoNumber = baseNumber; // Simple 1:1 mapping
    const newCUST_NO = String(custNoNumber).padStart(CUST_NO_LENGTH, '0');
    
    // Update counter
    await updateLastUsedNumbers(newCUST_ID, newCUST_NO);
    
    console.log(`✅ Generated: CUST_ID=${newCUST_ID}, CUST_NO=${newCUST_NO}`);
    
    return {
      CUST_ID: newCUST_ID,
      CUST_NO: newCUST_NO,
      lastCUST_ID,
      lastCUST_NO
    };
    
  } catch (error) {
    console.error('❌ Failed to generate customer number:', error);
    
    // Fallback: Use timestamp-based generation
    return generateFallbackCustomerNumber();
  }
};

// Fallback generation using timestamp
const generateFallbackCustomerNumber = () => {
  console.log('⚠️ Using fallback customer number generation');
  
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  
  // Use last 6 digits of timestamp + random 3 digits
  const timestampPart = timestamp.toString().slice(-6);
  const randomPart = random.toString().padStart(3, '0');
  const baseNumber = parseInt(timestampPart + randomPart, 10);
  
  // Ensure it's within 10 digits
  const custIdNumber = baseNumber % 10000000000;
  const custNoNumber = custIdNumber; // Same for fallback
  
  const CUST_ID = String(custIdNumber).padStart(CUST_ID_LENGTH, '0');
  const CUST_NO = String(custNoNumber).padStart(CUST_NO_LENGTH, '0');
  
  console.log(`⚠️ Fallback generated: CUST_ID=${CUST_ID}, CUST_NO=${CUST_NO}`);
  
  return {
    CUST_ID,
    CUST_NO,
    isFallback: true,
    timestamp: new Date().toISOString()
  };
};

// =============================================
// EXPORTS SECTION - CORRECTED (NO DUPLICATES)
// =============================================

// Export the main function as a named export
// This allows: import { generateCustomerNumber } from './utils/generateCustomerNumber.js'
export { generateCustomerNumber };

// Legacy function for compatibility
export const generateCustomerNumberLegacy = async () => {
  return await generateCustomerNumber();
};

// Get current counter status
export const getCurrentCounterStatus = async () => {
  try {
    await initModelsForUtility();
    
    const { lastCUST_ID, lastCUST_NO } = await getLastUsedNumbers();
    
    // Count total customers
    const customerCount = await safeDbOperation(async () => {
      return await Customer.count();
    });
    
    // Get highest customer ID from database
    const highestCustomer = await safeDbOperation(async () => {
      return await Customer.findOne({
        order: [['CUST_ID', 'DESC']],
        attributes: ['CUST_ID', 'CUST_NO', 'CUST_NM']
      });
    });
    
    return {
      counter: {
        lastCUST_ID,
        lastCUST_NO
      },
      database: {
        customerCount,
        highestCustomer: highestCustomer ? {
          CUST_ID: highestCustomer.CUST_ID,
          CUST_NO: highestCustomer.CUST_NO,
          name: highestCustomer.CUST_NM
        } : null
      },
      isInSync: highestCustomer ? lastCUST_ID === highestCustomer.CUST_ID : true,
      modelsInitialized: modelsInitialized,
      CustomerModel: Customer ? '✅ Loaded' : '❌ Not loaded',
      sequelize: sequelize ? '✅ Loaded' : '❌ Not loaded'
    };
  } catch (error) {
    console.error('Error getting counter status:', error);
    return {
      error: error.message,
      modelsInitialized,
      CustomerModel: Customer ? '✅ Loaded' : '❌ Not loaded',
      sequelize: sequelize ? '✅ Loaded' : '❌ Not loaded'
    };
  }
};

// Reset counter to a specific value
export const resetCounter = async (newCustId = '0000000000') => {
  try {
    await initModelsForUtility();
    
    // Validate input
    if (!/^\d{10}$/.test(newCustId)) {
      throw new Error('CUST_ID must be exactly 10 digits');
    }
    
    const custIdNumber = parseInt(newCustId, 10);
    const custNoNumber = custIdNumber; // Same for reset
    
    const newCUST_NO = String(custNoNumber).padStart(CUST_NO_LENGTH, '0');
    
    // Update counter
    await safeDbOperation(async () => {
      await sequelize.query(`
        UPDATE customer_counter 
        SET last_used_id = ?, last_used_number = ?, updated_at = NOW()
        WHERE counter_type = 'customer'
      `, {
        replacements: [newCustId, newCUST_NO]
      });
    });
    
    console.log(`🔄 Counter reset to: CUST_ID=${newCustId}, CUST_NO=${newCUST_NO}`);
    
    return {
      success: true,
      message: 'Counter reset successfully',
      newCUST_ID: newCustId,
      newCUST_NO: newCUST_NO
    };
    
  } catch (error) {
    console.error('Error resetting counter:', error);
    return {
      success: false,
      message: error.message
    };
  }
};

// Simple synchronous fallback for testing
export const generateSimpleCustomerNumber = () => {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  const base = parseInt(timestamp.toString().slice(-6) + random.toString().padStart(4, '0'), 10) % 10000000000;
  
  return {
    CUST_ID: String(base).padStart(CUST_ID_LENGTH, '0'),
    CUST_NO: String(base).padStart(CUST_NO_LENGTH, '0'),
    isSimple: true
  };
};

// Export main function as default export
// This allows: import generateCustomerNumber from './utils/generateCustomerNumber.js'
export default generateCustomerNumber;