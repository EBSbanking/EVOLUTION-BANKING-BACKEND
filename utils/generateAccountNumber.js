import Counter from '../models/Counter.js';
import Customer from '../models/Customer.js';
import { getProductTypeByProdId } from '../controllers/ProductTypeMappingController.js';
import LoanContractForm from '../models/LoanContractForm.js';

// Constants
const ACCOUNT_NUMBER_LENGTH = 10;
const ACCOUNT_ID_LENGTH = 6;
const CUSTOMER_ID_LENGTH = 10;
const CUSTOMER_NO_LENGTH = 10;
const NUBAN_SERIAL_LENGTH = 6;
const BANK_CODE = '011';
const CONTRACT_ID_LENGTH = 13;

/**
 * Generates a loan contract form ID starting with LC- followed by 13 digits
 */
export async function GenerateLoanContractFormId() {
  const session = await Counter.startSession();
  session.startTransaction();

  try {
    const lastContract = await LoanContractForm.findOne()
      .sort({ createdAt: -1 })
      .session(session);

    let lastNumber = 0;
    if (lastContract?.loan_contract_no) {
      const matches = lastContract.loan_contract_no.match(/\d+/);
      if (matches) {
        lastNumber = parseInt(matches[0], 10);
      }
    }

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
 * Generates customer numbers (CUST_ID and CUST_NO)
 */
export async function generateCustomerNumber(branchCode = '01') {
  const session = await Customer.startSession();
  session.startTransaction();

  try {
    const lastCustomer = await Customer.findOne().sort({ CUST_ID: -1 }).session(session);
    const lastCustId = lastCustomer ? parseInt(lastCustomer.CUST_ID, 10) : 0;
    const lastCustNoSerial = lastCustomer ? parseInt(lastCustomer.CUST_NO.slice(2), 10) : 0;

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

    const nextId = Math.max(lastCustId + 1, counter.seq);
    const nextSerial = lastCustNoSerial + 1;

    if (nextId > counter.seq) {
      await Counter.updateOne(
        { _id: 'CUSTOMER_NUMBER' },
        { $set: { seq: nextId } },
        { session }
      );
    }

    const CUST_ID = nextId.toString().padStart(CUSTOMER_ID_LENGTH, '0');
    const CUST_NO = branchCode + nextSerial.toString().padStart(8, '0');

    await session.commitTransaction();

    return {
      CUST_ID,
      CUST_NO,
      numericValue: nextId,
      formattedString: CUST_ID
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Generates an account number for a given account type
 */
export async function generateAccountNumber(accountType) {
  const prefixMap = {
    'ACCT_LOAN': '300',
    'ACCT_TERM_DEPOSIT': '200',
    'ACCT_SAVINGS': '100'
  };

  if (!prefixMap[accountType]) {
    throw new Error(`Invalid account type: ${accountType}`);
  }

  const counter = await Counter.findByIdAndUpdate(
    accountType,
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const prefix = prefixMap[accountType];
  const paddedSequence = String(counter.seq).padStart(7, '0'); // 3-digit prefix + 7 digits = 10-digit total
  return `${prefix}${paddedSequence}`;
}

/**
 * Generates a 6-digit unique ACCT_ID
 */
export async function generateAccountId() {
  const counter = await Counter.findByIdAndUpdate(
    'ACCT_ID_SEQ',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const idStr = counter.seq.toString().padStart(6, '0');

  if (idStr.length !== 6) {
    throw new Error(`Counter generated invalid ACCT_ID: ${idStr}`);
  }

  return parseInt(idStr, 10);
}

/**
 * NUBAN-compliant account number generator
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
 * Transaction ID generator
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

/**
 * Generates account number and ID from counter
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
 * Generate account number by product ID
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

  const result = await generateAccountNumber(`ACCT_${productType}`);
  return {
    numericValue: parseInt(result),
    formattedString: result
  };
}

// Legacy export
export const generateLoanAccountNumberByProdId = async (prodId) => {
  const { formattedString } = await generateAccountNumberByProdId(prodId);
  return formattedString;
};

export default {
  GenerateLoanContractFormId,
  generateCustomerNumber,
  generateAccountNumber,
  generateAccountId,
  generateNUBAN,
  generateTransactionIds,
  generateAccountIdentifiersFromCounter,
  generateAccountNumberByProdId,
  generateLoanAccountNumberByProdId
};
