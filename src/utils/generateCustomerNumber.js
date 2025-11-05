import Counter from '../models/Counter.js';
import Customer from '../models/Customer.js';

// Constants
const CUST_ID_LENGTH = 10;               // CUST_ID will be 10 digits
const CUST_NO_LENGTH = 7;                 // CUST_NO will be 7 digits
const MAX_RETRIES = 3;                    // Maximum retries for transaction conflicts
const RETRY_DELAY_MS = 100;               // Initial delay between retries in milliseconds
const MULTIPLIER = 10;                    // Multiplier for CUST_NO generation

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

      // Get the next base number atomically
      const counter = await Counter.findOneAndUpdate(
        { _id: 'customerId' },
        { $inc: { seq: 1 } },
        { 
          new: true,
          upsert: true,
          session,
          returnDocument: 'after'
        }
      );

      const baseNumber = Number(counter?.seq);
      if (isNaN(baseNumber)) {
        throw new Error('Invalid counter value');
      }

      // Generate numbers with 10x pattern
      const custId = baseNumber;
      const custNo = baseNumber * MULTIPLIER;

      const result = {
        CUST_ID: String(custId).padStart(CUST_ID_LENGTH, '0'),      // 10-digit e.g. "0000000001"
        CUST_NO: String(custNo).padStart(CUST_NO_LENGTH, '0')       // 7-digit e.g. "0000010"
      };

      // Verify CUST_NO doesn't exceed 7 digits
      if (custNo.toString().length > CUST_NO_LENGTH) {
        throw new Error('Customer number overflow - reached maximum possible values');
      }

      await session.commitTransaction();
      return result;

    } catch (error) {
      await session.abortTransaction();
      lastError = error;

      // Retry only on transaction conflicts
      if (error.message.includes('WriteConflict') && retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAY_MS * Math.pow(2, retryCount);
        await new Promise(resolve => setTimeout(resolve, delay));
        retryCount++;
        continue;
      }

      throw new Error(error.message);

    } finally {
      await session.endSession();
    }
  }

  throw lastError || new Error('Failed to generate customer numbers after retries');
}

/**
 * Legacy generator without transactions
 * @returns {Promise<{CUST_ID: string, CUST_NO: string}>}
 */
export const generateCustomerNumberLegacy = async () => {
  try {
    const lastCustomer = await Customer.findOne().sort({ CUST_ID: -1 }).lean();
    const lastId = lastCustomer ? parseInt(lastCustomer.CUST_ID, 10) || 0 : 0;
    const nextId = lastId + 1;
    
    return {
      CUST_ID: String(nextId).padStart(CUST_ID_LENGTH, '0'),      // e.g. "0000000001"
      CUST_NO: String(nextId * MULTIPLIER).padStart(CUST_NO_LENGTH, '0')  // e.g. "0000010"
    };
  } catch (error) {
    throw new Error(`Failed to generate legacy customer numbers: ${error.message}`);
  }
};

export default generateCustomerNumber;