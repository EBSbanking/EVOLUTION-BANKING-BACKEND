import Counter from '../models/Counter.js';
import Customer from '../models/Customer.js';
import { getProductTypeByProdId } from '../controllers/ProductTypeMappingController.js';
import LoanContractForm from '../models/LoanContractForm.js';

// Constants
const ACCOUNT_NUMBER_LENGTH = 10;
const CUSTOMER_ID_LENGTH = 10; // 10-digit CUST_ID
const CUSTOMER_NO_LENGTH = 10; // 2-digit branch + 8-digit serial
const ACCOUNT_ID_LENGTH = 6;
const NUBAN_SERIAL_LENGTH = 6;
const BANK_CODE = '011';
const CONTRACT_ID_LENGTH = 13;

/**
 * Generates a loan contract form ID starting with LC- followed by 13 digits
 * @returns {Promise<string>} Formatted contract ID (LC-XXXXXXXXXXXXX)
 */
export async function GenerateLoanContractFormId() {
  const session = await Counter.startSession();
  session.startTransaction();

  try {
    // Get the last used contract ID from the database
    const lastContract = await LoanContractForm.findOne()
      .sort({ createdAt: -1 })
      .session(session);
    
    // Extract the numeric part from the last contract ID or start from 0
    let lastNumber = 0;
    if (lastContract && lastContract.loan_contract_no) {
      const matches = lastContract.loan_contract_no.match(/\d+/);
      if (matches) {
        lastNumber = parseInt(matches[0], 10);
      }
    }

    // Update the counter to ensure we don't have duplicates
    const counter = await Counter.findOneAndUpdate(
      { _id: 'LOAN_CONTRACT' },
      { $inc: { seq: 1 } },
      { 
        new: true,
        upsert: true,
        session,
        setDefaultsOnInsert: { seq: lastNumber }
      }
    );

    // Generate the new contract ID
    const paddedNumber = counter.seq.toString().padStart(CONTRACT_ID_LENGTH, '0');
    const contractId = `LC-${paddedNumber}`;

    await session.commitTransaction();
    return contractId;
  } catch (error) {
    await session.abortTransaction();
    console.error('Error generating loan contract ID:', error);
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Generates synchronized customer numbers using both Counter and Customer collection
 * @param {string} branchCode - Branch code (default: '01')
 * @returns {Promise<{CUST_ID: string, CUST_NO: string, numericValue: number, formattedString: string}>}
 */
export async function generateCustomerNumber(branchCode = '01') {
  const session = await Customer.startSession();
  session.startTransaction();

  try {
    // 1. Get the highest existing customer ID
    const lastCustomer = await Customer.findOne()
      .sort({ CUST_ID: -1 })
      .session(session);
    
    const lastCustId = lastCustomer ? parseInt(lastCustomer.CUST_ID, 10) : 0;
    const lastCustNoSerial = lastCustomer ? parseInt(lastCustomer.CUST_NO.slice(2), 10) : 0;

    // 2. Get the current counter value
    const counter = await Counter.findOneAndUpdate(
      { _id: 'CUSTOMER_NUMBER' },
      { $inc: { seq: 1 } },
      { 
        new: true,
        upsert: true,
        session,
        setDefaultsOnInsert: { seq: lastCustId }
      }
    );

    // 3. Determine the next available ID (use the higher value)
    const nextId = Math.max(lastCustId + 1, counter.seq);
    const nextSerial = lastCustNoSerial + 1;

    // 4. Update counter if it was behind
    if (nextId > counter.seq) {
      await Counter.updateOne(
        { _id: 'CUSTOMER_NUMBER' },
        { $set: { seq: nextId } },
        { session }
      );
    }

    // 5. Generate all number formats
    const CUST_ID = nextId.toString().padStart(CUSTOMER_ID_LENGTH, '0');
    const CUST_NO = branchCode + nextSerial.toString().padStart(8, '0');
    const numericValue = nextId;
    const formattedString = CUST_ID;

    await session.commitTransaction();
    
    return {
      CUST_ID,
      CUST_NO,
      numericValue,
      formattedString
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Generates account identifiers using a counter
 * @param {string} prefix - The prefix for the account
 * @returns {Promise<{ACCT_NO: number, ACCT_ID: string}>}
 */
export async function generateAccountIdentifiersFromCounter(prefix = '') {
  const counter = await Counter.findOneAndUpdate(
    { _id: `${prefix}_ACCOUNT` },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const paddedSeq = counter.seq.toString().padStart(ACCOUNT_NUMBER_LENGTH - prefix.length, '0');
  const ACCT_NO = parseInt(`${prefix}${paddedSeq}`);
  const ACCT_ID = `${prefix}${counter.seq.toString().padStart(ACCOUNT_ID_LENGTH, '0')}`;

  return { ACCT_NO, ACCT_ID };
}

/**
 * Generates account number by product ID
 * @param {string} prodId - Product ID
 * @returns {Promise<{numericValue: number, formattedString: string}>}
 */
export async function generateAccountNumberByProdId(prodId) {
  const productType = await getProductTypeByProdId(prodId);

  const productConfig = {
    'LOAN': { prefix: 3 },
    'TERM_DEPOSIT': { prefix: 2 },
    'SAVINGS': { prefix: 1 }
  };

  const config = productConfig[productType];
  if (!config) {
    throw new Error(`Invalid product type: ${productType}`);
  }

  const result = await Counter.generateAccountNumber(productType);
  return {
    numericValue: result.numericValue,
    formattedString: result.formattedString
  };
}

// Legacy function for backward compatibility
export const generateLoanAccountNumberByProdId = async (prodId) => {
  const { formattedString } = await generateAccountNumberByProdId(prodId);
  return formattedString;
};

/**
 * Generates NUBAN-compliant account number
 * @param {string} bankCode - Bank code (default: '011')
 * @param {number|null} serial - Optional serial number
 * @returns {string} NUBAN account number
 */
export function generateNUBAN(bankCode = BANK_CODE, serial = null) {
  const serialNumber = serial || Math.floor(100000 + Math.random() * 900000);
  const nubanSerial = serialNumber.toString().padStart(NUBAN_SERIAL_LENGTH, '0');
  const fullNumber = bankCode + nubanSerial;

  const weights = [3, 7, 3, 3, 7, 3, 3, 7, 3];
  const sum = fullNumber.split('').reduce((acc, digit, index) => {
    return acc + (parseInt(digit)) * weights[index];
  }, 0);

  const checksum = (10 - (sum % 10)) % 10;
  return nubanSerial + checksum;
}

/**
 * Generates transaction IDs
 * @returns {{
 *   TRANSACTION_ID: string,
 *   EVENT_ID: string,
 *   TRAN_JOURNAL_ID: string
 * }}
 */
export function generateTransactionIds() {
  const generateSerial = (length) => {
    return Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
  };

  return {
    TRANSACTION_ID: generateSerial(13),
    EVENT_ID: generateSerial(7),
    TRAN_JOURNAL_ID: generateSerial(13)
  };
}

export default {
  GenerateLoanContractFormId,
  generateCustomerNumber,
  generateAccountIdentifiersFromCounter,
  generateAccountNumberByProdId,
  generateLoanAccountNumberByProdId,
  generateNUBAN,
  generateTransactionIds
};