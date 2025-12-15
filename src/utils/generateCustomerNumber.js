// src/utils/generateCustomerNumber.js - UPDATED with better connection handling
import Counter from '../models/Counter.js';
import Customer from '../models/Customer.js';
import mongoose from 'mongoose';

// Constants
const CUST_ID_LENGTH = 10;
const CUST_NO_LENGTH = 7;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;
const MULTIPLIER = 10;

// Global state
let isInitializing = false;
let initializationPromise = null;

/**
 * Wait for MongoDB connection to be ready
 */
async function waitForConnection() {
  const maxWaitTime = 30000; // 30 seconds max
  const checkInterval = 100; // Check every 100ms
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkConnection = () => {
      const elapsed = Date.now() - startTime;
      
      if (mongoose.connection.readyState === 1) {
        // Connected
        resolve();
      } else if (elapsed > maxWaitTime) {
        // Timeout
        reject(new Error('MongoDB connection timeout after 30 seconds'));
      } else if (mongoose.connection.readyState === 2) {
        // Connecting, wait and check again
        setTimeout(checkConnection, checkInterval);
      } else if (mongoose.connection.readyState === 3) {
        // Disconnecting, wait and check again
        setTimeout(checkConnection, checkInterval);
      } else {
        // Disconnected or 0 (initializing)
        reject(new Error('MongoDB is not connected'));
      }
    };
    
    checkConnection();
  });
}

/**
 * Safely initialize counter with retry logic
 */
async function initializeCounter() {
  // Prevent multiple initializations
  if (isInitializing && initializationPromise) {
    return initializationPromise;
  }
  
  isInitializing = true;
  initializationPromise = (async () => {
    let retryCount = 0;
    
    while (retryCount < MAX_RETRIES) {
      try {
        console.log(`Initializing counter (attempt ${retryCount + 1}/${MAX_RETRIES})...`);
        
        // Wait for connection
        await waitForConnection();
        
        // Check if counter exists
        const existingCounter = await Counter.findOne({ _id: 'customerId' });
        if (existingCounter) {
          console.log('Counter already exists, value:', existingCounter.seq);
          isInitializing = false;
          return existingCounter.seq;
        }
        
        // Find the highest existing CUST_ID
        const lastCustomer = await Customer.findOne().sort({ CUST_ID: -1 }).lean();
        let lastId = 0;
        
        if (lastCustomer && lastCustomer.CUST_ID) {
          lastId = parseInt(lastCustomer.CUST_ID, 10) || 0;
        }
        
        // Set initial value
        const initialValue = Math.max(1, lastId);
        
        // Create counter
        await Counter.create({
          _id: 'customerId',
          seq: initialValue,
          lastUpdated: new Date()
        });
        
        console.log(`Counter initialized with value: ${initialValue}`);
        isInitializing = false;
        return initialValue;
        
      } catch (error) {
        retryCount++;
        console.error(`Counter initialization attempt ${retryCount} failed:`, error.message);
        
        if (retryCount >= MAX_RETRIES) {
          isInitializing = false;
          console.warn('All counter initialization attempts failed, using fallback mode');
          return 0;
        }
        
        // Exponential backoff
        const delay = RETRY_DELAY_MS * Math.pow(2, retryCount - 1);
        console.log(`Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  })();
  
  return initializationPromise;
}

/**
 * Safe database operation with retry
 */
async function safeDbOperation(operation, operationName = 'database operation') {
  let retryCount = 0;
  
  while (retryCount < MAX_RETRIES) {
    try {
      await waitForConnection();
      return await operation();
    } catch (error) {
      retryCount++;
      console.error(`${operationName} attempt ${retryCount} failed:`, error.message);
      
      if (retryCount >= MAX_RETRIES) {
        throw error;
      }
      
      // Exponential backoff
      const delay = RETRY_DELAY_MS * Math.pow(2, retryCount - 1);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/**
 * Verify and repair counter if out of sync
 */
async function verifyAndRepairCounter() {
  return safeDbOperation(async () => {
    // Get highest CUST_ID from customers
    const lastCustomer = await Customer.findOne().sort({ CUST_ID: -1 }).lean();
    let highestCustomerId = 0;
    
    if (lastCustomer && lastCustomer.CUST_ID) {
      highestCustomerId = parseInt(lastCustomer.CUST_ID, 10) || 0;
    }
    
    // Get current counter value
    const counter = await Counter.findOne({ _id: 'customerId' });
    let currentCounter = 0;
    
    if (counter) {
      currentCounter = Number(counter.seq) || 0;
    }
    
    // If counter is behind, update it to highest + 1
    if (currentCounter <= highestCustomerId) {
      console.log(`Counter out of sync. Customer max: ${highestCustomerId}, Counter: ${currentCounter}. Repairing...`);
      
      const newCounterValue = highestCustomerId + 1;
      
      await Counter.findOneAndUpdate(
        { _id: 'customerId' },
        { 
          $set: { 
            seq: newCounterValue, 
            lastUpdated: new Date() 
          } 
        },
        { 
          upsert: true,
          new: true 
        }
      );
      
      console.log(`Counter repaired and set to: ${newCounterValue}`);
      return newCounterValue;
    }
    
    return currentCounter;
  }, 'verifyAndRepairCounter');
}

/**
 * Generates synchronized customer numbers
 */
export async function generateCustomerNumber() {
  try {
    // Ensure connection is ready
    await waitForConnection();
    
    // Verify and repair counter first
    const repairedValue = await verifyAndRepairCounter();
    
    const session = await mongoose.startSession();
    
    try {
      await session.startTransaction();
      
      // Get the current counter value
      const currentCounter = await Counter.findOne({ _id: 'customerId' }).session(session);
      if (!currentCounter) {
        throw new Error('Counter not found');
      }
      
      let baseNumber = Number(currentCounter.seq);
      let foundAvailableId = false;
      let attempts = 0;
      const maxAttempts = 100;
      
      while (!foundAvailableId && attempts < maxAttempts) {
        if (attempts > 0) {
          baseNumber++;
        }
        
        const proposedCustId = String(baseNumber).padStart(CUST_ID_LENGTH, '0');
        
        // Check if this CUST_ID already exists
        const existingCustomer = await Customer.findOne({ 
          CUST_ID: proposedCustId 
        }).session(session);
        
        if (!existingCustomer) {
          foundAvailableId = true;
          break;
        }
        
        attempts++;
      }
      
      if (!foundAvailableId) {
        throw new Error('Could not find available customer ID');
      }
      
      // Verify the CUST_NO doesn't exceed 7 digits
      const custNo = baseNumber * MULTIPLIER;
      if (custNo.toString().length > CUST_NO_LENGTH) {
        throw new Error('Customer number overflow');
      }
      
      const result = {
        CUST_ID: String(baseNumber).padStart(CUST_ID_LENGTH, '0'),
        CUST_NO: String(custNo).padStart(CUST_NO_LENGTH, '0'),
        rawValue: baseNumber
      };
      
      // Update the counter with the used value
      await Counter.findOneAndUpdate(
        { _id: 'customerId' },
        { 
          $set: { 
            seq: baseNumber, 
            lastUpdated: new Date() 
          } 
        },
        { session }
      );
      
      await session.commitTransaction();
      return result;
      
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      await session.endSession();
    }
    
  } catch (error) {
    console.error('Failed to generate customer number from counter:', error);
    // Fallback to timestamp method
    return generateFallbackCustomerNumber();
  }
}

/**
 * Fallback method using timestamp
 */
function generateFallbackCustomerNumber() {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);
  
  // Use last 8 digits of timestamp plus random suffix
  const timestampPart = timestamp.toString().slice(-8);
  const randomPart = randomSuffix.toString().padStart(3, '0');
  const baseNumber = parseInt(timestampPart + randomPart, 10);
  
  // Ensure it's within limits
  const custId = baseNumber % 10000000000;
  const custNo = (custId * MULTIPLIER) % 10000000;
  
  return {
    CUST_ID: String(custId).padStart(CUST_ID_LENGTH, '0'),
    CUST_NO: String(custNo).padStart(CUST_NO_LENGTH, '0'),
    isFallback: true,
    timestamp: new Date().toISOString()
  };
}

/**
 * Legacy generator
 */
export const generateCustomerNumberLegacy = async () => {
  try {
    await waitForConnection();
    await verifyAndRepairCounter();
    
    const counter = await Counter.findOneAndUpdate(
      { _id: 'customerId' },
      { $inc: { seq: 1 }, $set: { lastUpdated: new Date() } },
      { new: true }
    );
    
    if (!counter) {
      throw new Error('Counter not found');
    }
    
    const baseNumber = Number(counter.seq);
    const custNo = baseNumber * MULTIPLIER;
    
    if (custNo.toString().length > CUST_NO_LENGTH) {
      throw new Error('Customer number overflow');
    }
    
    return {
      CUST_ID: String(baseNumber).padStart(CUST_ID_LENGTH, '0'),
      CUST_NO: String(custNo).padStart(CUST_NO_LENGTH, '0')
    };
  } catch (error) {
    console.error('Legacy generation error:', error);
    return generateFallbackCustomerNumber();
  }
};

/**
 * Get current counter value
 */
export const getCurrentCounterValue = async () => {
  try {
    await waitForConnection();
    await verifyAndRepairCounter();
    const counter = await Counter.findOne({ _id: 'customerId' });
    return counter ? Number(counter.seq) : 0;
  } catch (error) {
    console.error('Error getting counter value:', error);
    return 0;
  }
};

/**
 * Reset counter to a specific value
 */
export const resetCounter = async (value = 0) => {
  if (value < 0) throw new Error('Counter value cannot be negative');
  
  await waitForConnection();
  
  // Check if any customer exists with ID >= value
  const existingCustomer = await Customer.findOne({
    CUST_ID: { $gte: String(value).padStart(CUST_ID_LENGTH, '0') }
  }).sort({ CUST_ID: -1 });
  
  if (existingCustomer) {
    throw new Error(`Cannot reset to ${value}. Customer with ID ${existingCustomer.CUST_ID} already exists.`);
  }
  
  await Counter.findOneAndUpdate(
    { _id: 'customerId' },
    { $set: { seq: value, lastUpdated: new Date() } },
    { upsert: true }
  );
  
  console.log(`Counter reset to: ${value}`);
  return value;
};

/**
 * Get counter status for debugging
 */
export const getCounterStatus = async () => {
  try {
    await waitForConnection();
    
    const counter = await Counter.findOne({ _id: 'customerId' });
    const lastCustomer = await Customer.findOne().sort({ CUST_ID: -1 }).lean();
    
    const counterValue = counter ? Number(counter.seq) : 0;
    const highestCustomerId = lastCustomer ? parseInt(lastCustomer.CUST_ID, 10) || 0 : 0;
    
    return {
      counterValue,
      highestCustomerId,
      isInSync: counterValue > highestCustomerId,
      difference: counterValue - highestCustomerId,
      counterExists: !!counter,
      lastCustomer: lastCustomer ? lastCustomer.CUST_ID : 'none',
      connectionStatus: mongoose.connection.readyState,
      connectionState: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoose.connection.readyState] || 'unknown'
    };
  } catch (error) {
    console.error('Error getting counter status:', error);
    return { 
      error: error.message,
      connectionStatus: mongoose.connection.readyState 
    };
  }
};

// Initialize counter after connection is ready, but don't block
let initializationTimeout = null;

// Delayed initialization to allow main connection
if (typeof window === 'undefined') {
  // Server-side only
  initializationTimeout = setTimeout(async () => {
    try {
      console.log('Starting delayed counter initialization...');
      await initializeCounter();
      console.log('Counter initialization completed');
    } catch (error) {
      console.warn('Counter initialization failed:', error.message);
    }
  }, 5000); // 5 second delay
}

// Clean up on exit
if (typeof process !== 'undefined') {
  process.on('exit', () => {
    if (initializationTimeout) {
      clearTimeout(initializationTimeout);
    }
  });
}

// Export debug function
export { verifyAndRepairCounter as debugVerifyCounter };

export default generateCustomerNumber;