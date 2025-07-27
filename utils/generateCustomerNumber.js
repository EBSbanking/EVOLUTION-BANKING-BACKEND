import Counter from '../models/Counter.js';
import Customer from '../models/Customer.js';

// Constants
const CUSTOMER_ID_LENGTH = 10; // 10-digit CUST_ID
const CUSTOMER_NO_SERIAL_LENGTH = 8; // 8-digit serial portion of CUST_NO

/**
 * Generates synchronized customer numbers checking both Customer collection and Counter
 * @param {string} branchCode - Branch code (default: '01')
 * @returns {Promise<{CUST_ID: string, CUST_NO: string}>}
 */
export async function generateCustomerNumber(branchCode = '01') {
  const session = await Customer.startSession();
  session.startTransaction();

  try {
    // 1. Get the highest existing customer ID from both sources
    const [lastCustomer, counter] = await Promise.all([
      Customer.findOne().sort({ CUST_ID: -1 }).session(session),
      Counter.findOne({ _id: 'CUSTOMER_NUMBER' }).session(session)
    ]);

    // 2. Determine last used numbers
    const lastCustId = lastCustomer ? parseInt(lastCustomer.CUST_ID, 10) : 0;
    const lastCustNoSerial = lastCustomer ? parseInt(lastCustomer.CUST_NO.slice(2), 10) : 0;
    const lastCounterValue = counter?.seq || 0;

    // 3. Calculate next values (using the highest + 1)
    const nextId = Math.max(lastCustId, lastCounterValue) + 1;
    const nextSerial = lastCustNoSerial + 1;

    // 4. Update counter atomically
    await Counter.findOneAndUpdate(
      { _id: 'CUSTOMER_NUMBER' },
      { $set: { seq: nextId } },
      { upsert: true, session }
    );

    // 5. Generate the numbers
    const CUST_ID = nextId.toString().padStart(CUSTOMER_ID_LENGTH, '0');
    const CUST_NO = branchCode + nextSerial.toString().padStart(CUSTOMER_NO_SERIAL_LENGTH, '0');

    await session.commitTransaction();
    
    return { CUST_ID, CUST_NO };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

// Legacy stand-alone version (for backward compatibility)
export const generateCustomerNumberLegacy = async (branchCode = '01') => {
  const lastCustomer = await Customer.findOne().sort({ CUST_ID: -1 });

  let lastCustId = 0;
  let lastCustNoSerial = 0;

  if (lastCustomer) {
    lastCustId = parseInt(lastCustomer.CUST_ID, 10) || 0;
    lastCustNoSerial = parseInt(lastCustomer.CUST_NO.slice(2), 10) || 0;
  }

  const newCustId = (lastCustId + 1).toString().padStart(10, '0');
  const newCustNo = branchCode + (lastCustNoSerial + 1).toString().padStart(8, '0');

  return { CUST_ID: newCustId, CUST_NO: newCustNo };
};

export default generateCustomerNumber;