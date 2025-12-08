import Counter from '../models/Counter.js';
import Customer from '../models/Customer.js';

// Constants
const CUST_ID_LENGTH = 10;               // CUST_ID will be 10 digits
const CUST_NO_LENGTH = 7;                // CUST_NO will be 7 digits
const MAX_RETRIES = 3;                   // Maximum retries for transaction conflicts
const RETRY_DELAY_MS = 100;              // Initial delay between retries in milliseconds
const MULTIPLIER = 10;                   // Multiplier for CUST_NO generation

/**
 * Safely initialize counter if it doesn't exist
 */
async function initializeCounter() {
  try {
    const existingCounter = await Counter.findOne({ _id: 'customerId' });
    if (!existingCounter) {
      // Find the highest existing CUST_ID from customers collection
      const lastCustomer = await Customer.findOne().sort({ CUST_ID: -1 }).lean();
      const lastId = lastCustomer ? parseInt(lastCustomer.CUST_ID, 10) || 0 : 0;
      
      // Set counter to last ID + 1 (or 1 if no customers exist)
      const initialValue = lastId > 0 ? lastId : 0;
      
      await Counter.create({
        _id: 'customerId',
        seq: initialValue,
        lastUpdated: new Date()
      });
      
      console.log(`Counter initialized with value: ${initialValue}`);
    }
  } catch (error) {
    console.error('Error initializing counter:', error);
  }
}

/**
 * Generates synchronized customer numbers with 10x pattern (7-digit CUST_NO)
 * @returns {Promise<{CUST_ID: string, CUST_NO: string}>}
 */
export async function generateCustomerNumber() {
  // Initialize counter if needed
  await initializeCounter();
  
  let retryCount = 0;
  let lastError = null;

  while (retryCount < MAX_RETRIES) {
    const session = await Customer.startSession();
    
    try {
      await session.startTransaction();

      // Get and increment the counter atomically
      const counter = await Counter.findOneAndUpdate(
        { _id: 'customerId' },
        { $inc: { seq: 1 }, $set: { lastUpdated: new Date() } },
        { 
          new: true,
          upsert: false, // Don't upsert, should exist after initialization
          session,
          returnDocument: 'after'
        }
      );

      if (!counter) {
        throw new Error('Counter not found. Please initialize the counter first.');
      }

      const baseNumber = Number(counter.seq);
      if (isNaN(baseNumber) || baseNumber <= 0) {
        throw new Error(`Invalid counter value: ${baseNumber}`);
      }

      // Generate numbers with 10x pattern
      const custId = baseNumber;
      const custNo = baseNumber * MULTIPLIER;

      // Verify CUST_NO doesn't exceed 7 digits
      if (custNo.toString().length > CUST_NO_LENGTH) {
        throw new Error('Customer number overflow - reached maximum possible values');
      }

      const result = {
        CUST_ID: String(custId).padStart(CUST_ID_LENGTH, '0'),      // 10-digit e.g. "0000000001"
        CUST_NO: String(custNo).padStart(CUST_NO_LENGTH, '0'),      // 7-digit e.g. "0000010"
        rawValue: baseNumber
      };

      // Optional: Verify this CUST_ID doesn't already exist
      const existingCustomer = await Customer.findOne({ CUST_ID: result.CUST_ID }).session(session);
      if (existingCustomer) {
        throw new Error(`Customer ID ${result.CUST_ID} already exists`);
      }

      await session.commitTransaction();
      return result;

    } catch (error) {
      await session.abortTransaction();
      lastError = error;

      // Check if it's a counter initialization issue
      if (error.message.includes('Counter not found') || error.message.includes('upsert')) {
        // Re-initialize and retry
        await initializeCounter();
        retryCount++;
        const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Retry only on transaction conflicts
      if (error.message.includes('WriteConflict') && retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;
        continue;
      }

      throw new Error(`Failed to generate customer number: ${error.message}`);

    } finally {
      await session.endSession();
    }
  }

  throw lastError || new Error('Failed to generate customer numbers after retries');
}

/**
 * Legacy generator - uses the same counter system but without transactions
 * For backward compatibility
 * @returns {Promise<{CUST_ID: string, CUST_NO: string}>}
 */
export const generateCustomerNumberLegacy = async () => {
  try {
    // Initialize counter if needed
    await initializeCounter();
    
    // Use the counter but without transaction for legacy compatibility
    const counter = await Counter.findOneAndUpdate(
      { _id: 'customerId' },
      { $inc: { seq: 1 }, $set: { lastUpdated: new Date() } },
      { new: true, upsert: false }
    );

    if (!counter) {
      throw new Error('Counter not found');
    }

    const baseNumber = Number(counter.seq);
    const custNo = baseNumber * MULTIPLIER;

    // Verify CUST_NO doesn't exceed 7 digits
    if (custNo.toString().length > CUST_NO_LENGTH) {
      throw new Error('Customer number overflow');
    }

    return {
      CUST_ID: String(baseNumber).padStart(CUST_ID_LENGTH, '0'),
      CUST_NO: String(custNo).padStart(CUST_NO_LENGTH, '0')
    };
  } catch (error) {
    console.error('Legacy generation error:', error);
    throw new Error(`Failed to generate legacy customer numbers: ${error.message}`);
  }
};

/**
 * Get current counter value without incrementing
 * @returns {Promise<number>}
 */
export const getCurrentCounterValue = async () => {
  try {
    const counter = await Counter.findOne({ _id: 'customerId' });
    return counter ? Number(counter.seq) : 0;
  } catch (error) {
    console.error('Error getting counter value:', error);
    return 0;
  }
};

/**
 * Reset counter to a specific value (for testing/emergencies)
 * @param {number} value - The value to reset to
 * @returns {Promise<void>}
 */
export const resetCounter = async (value = 0) => {
  if (value < 0) throw new Error('Counter value cannot be negative');
  
  await Counter.findOneAndUpdate(
    { _id: 'customerId' },
    { $set: { seq: value, lastUpdated: new Date() } },
    { upsert: true }
  );
  
  console.log(`Counter reset to: ${value}`);
};

/**
 * Verify and repair counter if out of sync with existing customers
 * @returns {Promise<boolean>} - Returns true if repair was needed
 */
export const verifyAndRepairCounter = async () => {
  try {
    // Get highest CUST_ID from customers
    const lastCustomer = await Customer.findOne().sort({ CUST_ID: -1 }).lean();
    const highestCustomerId = lastCustomer ? parseInt(lastCustomer.CUST_ID, 10) || 0 : 0;
    
    // Get current counter value
    const counter = await Counter.findOne({ _id: 'customerId' });
    const currentCounter = counter ? Number(counter.seq) : 0;
    
    // If counter is behind, update it
    if (currentCounter < highestCustomerId) {
      console.log(`Counter out of sync. Customer max: ${highestCustomerId}, Counter: ${currentCounter}`);
      await resetCounter(highestCustomerId);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error verifying counter:', error);
    return false;
  }
};

// Initialize counter when module loads (optional)
initializeCounter().catch(err => console.error('Failed to initialize counter:', err));

export default generateCustomerNumber;