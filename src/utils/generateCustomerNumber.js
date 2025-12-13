import Counter from '../models/Counter.js';
import Customer from '../models/Customer.js';

// Constants
const CUST_ID_LENGTH = 10;               // CUST_ID will be 10 digits
const CUST_NO_LENGTH = 7;                // CUST_NO will be 7 digits
const MAX_RETRIES = 5;                   // Increased retries for repair scenarios
const RETRY_DELAY_MS = 200;              // Slightly longer delay
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
      let lastId = 0;
      
      if (lastCustomer && lastCustomer.CUST_ID) {
        lastId = parseInt(lastCustomer.CUST_ID, 10) || 0;
      }
      
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
    // Don't throw here, let the main function handle it
  }
}

/**
 * Verify and repair counter if out of sync with existing customers
 */
async function verifyAndRepairCounter() {
  try {
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
  } catch (error) {
    console.error('Error verifying counter:', error);
    return null;
  }
}

/**
 * Generates synchronized customer numbers with 10x pattern (7-digit CUST_NO)
 * @returns {Promise<{CUST_ID: string, CUST_NO: string}>}
 */
export async function generateCustomerNumber() {
  let retryCount = 0;
  let lastError = null;

  while (retryCount < MAX_RETRIES) {
    const session = await Customer.startSession();
    
    try {
      await session.startTransaction();

      // First, verify and repair counter if needed
      const repairedValue = await verifyAndRepairCounter();
      if (repairedValue === null) {
        throw new Error('Failed to verify counter');
      }

      // Get the current counter value
      const currentCounter = await Counter.findOne({ _id: 'customerId' }).session(session);
      if (!currentCounter) {
        // Initialize counter if it doesn't exist
        await initializeCounter();
        throw new Error('Counter not found after initialization');
      }

      let baseNumber = Number(currentCounter.seq);
      
      // Find the next available CUST_ID
      let foundAvailableId = false;
      let attempts = 0;
      const maxAttempts = 100; // Safety limit
      
      while (!foundAvailableId && attempts < maxAttempts) {
        // Increment for new attempt
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
        console.log(`Customer ID ${proposedCustId} exists, trying next...`);
      }
      
      if (!foundAvailableId) {
        throw new Error('Could not find available customer ID after maximum attempts');
      }

      // Verify the CUST_NO doesn't exceed 7 digits
      const custNo = baseNumber * MULTIPLIER;
      if (custNo.toString().length > CUST_NO_LENGTH) {
        throw new Error('Customer number overflow - reached maximum possible values');
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
      lastError = error;
      
      console.error(`Attempt ${retryCount + 1} failed:`, error.message);
      
      // Specific handling for counter issues
      if (error.message.includes('already exists') || 
          error.message.includes('Counter not found') ||
          error.message.includes('out of sync')) {
        
        // Force counter repair on next attempt
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (retryCount + 1)));
        
        // Try to repair the counter before retrying
        try {
          await verifyAndRepairCounter();
        } catch (repairError) {
          console.error('Counter repair failed:', repairError);
        }
      }
      
      retryCount++;
      
      if (retryCount >= MAX_RETRIES) {
        break;
      }
      
      // Exponential backoff
      const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
      await new Promise(resolve => setTimeout(resolve, delay));
      
    } finally {
      await session.endSession();
    }
  }

  // Final fallback: generate using timestamp if all else fails
  if (lastError) {
    console.error('All retries failed, using fallback generation');
    return generateFallbackCustomerNumber();
  }

  throw lastError || new Error('Failed to generate customer numbers');
}

/**
 * Fallback method using timestamp when counter system fails
 */
function generateFallbackCustomerNumber() {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(Math.random() * 1000);
  
  // Use last 8 digits of timestamp plus random suffix
  const baseNumber = parseInt(timestamp.toString().slice(-8) + randomSuffix.toString().padStart(3, '0'));
  
  // Ensure it's within 10-digit limit
  const custId = baseNumber % 10000000000; // Ensure 10 digits max
  const custNo = (custId * MULTIPLIER) % 10000000; // Ensure 7 digits max
  
  return {
    CUST_ID: String(custId).padStart(CUST_ID_LENGTH, '0'),
    CUST_NO: String(custNo).padStart(CUST_NO_LENGTH, '0'),
    isFallback: true,
    timestamp: new Date().toISOString()
  };
}

/**
 * Legacy generator - uses the same counter system but without transactions
 */
export const generateCustomerNumberLegacy = async () => {
  try {
    // First repair counter if needed
    await verifyAndRepairCounter();
    
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

    if (custNo.toString().length > CUST_NO_LENGTH) {
      throw new Error('Customer number overflow');
    }

    return {
      CUST_ID: String(baseNumber).padStart(CUST_ID_LENGTH, '0'),
      CUST_NO: String(custNo).padStart(CUST_NO_LENGTH, '0')
    };
  } catch (error) {
    console.error('Legacy generation error:', error);
    // Fallback to timestamp method
    return generateFallbackCustomerNumber();
  }
};

/**
 * Get current counter value
 */
export const getCurrentCounterValue = async () => {
  try {
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
      lastCustomer: lastCustomer ? lastCustomer.CUST_ID : 'none'
    };
  } catch (error) {
    console.error('Error getting counter status:', error);
    return { error: error.message };
  }
};

// Initialize counter when module loads
initializeCounter().catch(err => console.error('Failed to initialize counter:', err));

// Export debug function
export { verifyAndRepairCounter as debugVerifyCounter };

export default generateCustomerNumber;