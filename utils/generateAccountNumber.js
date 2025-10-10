import mongoose from 'mongoose';
import retry from 'async-retry';
import Counter from '../models/Counter.js';
import Customer from '../models/Customer.js';
import LoanContractForm from '../models/LoanContractForm.js';
import { getProductTypeByProdIdInternal } from '../services/productService.js';

const USE_NUBAN = true; // Enforce NUBAN-compliant account numbers
const ACCOUNT_NUMBER_LENGTH = 10;
const ACCOUNT_ID_LENGTH = 6;
const CUSTOMER_ID_LENGTH = 10;
const CUSTOMER_NO_LENGTH = 10;
const NUBAN_SERIAL_LENGTH = 6;
const BANK_CODE = '011';
const CONTRACT_ID_LENGTH = 13;

// ✅ SAFE ID HELPERS
function generateAcctId(seq) {
  return String(seq).padStart(ACCOUNT_ID_LENGTH, '0'); // Always 6 digits
}

function generateAcctNo(accountType, seq) {
  let prefix;
  if (accountType === 'SAVINGS') {
    prefix = '2';
  } else if (accountType === 'CURRENT') {
    prefix = '3';
  } else {
    throw new Error(`Unsupported account type: ${accountType}`);
  }
  const padded = String(seq).padStart(9, '0');
  return prefix + padded.slice(-9); // Always 10 digits
}

// 🔢 Generate 10-digit Account Number
const generateAccountNumber = async (accountType) => {
  const prefixMap = {
    'ACCT_SAVINGS': USE_NUBAN ? '2' : '100',
    'ACCT_CURRENT': USE_NUBAN ? '3' : '310',
    'ACCT_LOAN': USE_NUBAN ? '1' : '300',
    'ACCT_TERM_DEPOSIT': USE_NUBAN ? '1' : '200',
    'ACCT_CREDIT_CARD': USE_NUBAN ? '1' : '320',
  };

  if (!prefixMap[accountType]) {
    throw new Error(`Invalid account type: ${accountType}`);
  }

  return retry(
    async () => {
      if (mongoose.connection.readyState !== 1) {
        throw new Error('MongoDB not connected');
      }

      const counter = await Counter.findByIdAndUpdate(
        accountType,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      ).exec();

      if (!counter || typeof counter.seq !== 'number') {
        throw new Error(`Invalid seq for ${accountType}`);
      }

      const prefix = prefixMap[accountType];
      const sequence = String(counter.seq).padStart(USE_NUBAN ? 8 : 7, '0');
      const baseNumber = `${prefix}${sequence}`;

      if (USE_NUBAN) {
        const checkDigit = calculateNUBANCheckDigit(baseNumber);
        const accountNumber = `${baseNumber}${checkDigit}`;
        if (!/^\d{10}$/.test(accountNumber)) {
          throw new Error(`Generated account number ${accountNumber} is not 10 digits`);
        }
        return { formattedString: accountNumber, sequence: counter.seq };
      }

      return { formattedString: baseNumber, sequence: counter.seq };
    },
    { retries: 3, factor: 2, minTimeout: 1000, maxTimeout: 5000 }
  );
};

// 🔢 Generate 10-digit Account Number by PROD_ID
const generateAccountNumberByProdId = async (prodId) => {
  const product = await retry(
    async () => await getProductTypeByProdIdInternal(prodId),
    { retries: 3, factor: 2, minTimeout: 1000, maxTimeout: 5000 }
  );
  if (!product) throw new Error(`No product found for PROD_ID ${prodId}`);

  const productType = (product.PRODUCT_TYPE || product.PROD_CAT_TY || product.PROD_DESC || '').toUpperCase();
  const accountTypeMap = {
    'SAVINGS': 'ACCT_SAVINGS',
    'CURRENT': 'ACCT_CURRENT',
    'LOAN': 'ACCT_LOAN',
    'TERM_DEPOSIT': 'ACCT_TERM_DEPOSIT',
    'BUSINESS_TERM_LOAN': 'ACCT_LOAN',
    'CREDIT_CARD': 'ACCT_CREDIT_CARD',
  };
  const accountType = accountTypeMap[productType] || 'ACCT_SAVINGS';
  return generateAccountNumber(accountType);
};

// 🔢 Generate Account Identifiers (ACCT_NO and ACCT_ID)
const generateAccountIdentifiersFromCounter = async (prefix) => {
  return retry(
    async () => {
      const counter = await Counter.findByIdAndUpdate(
        `ACCT_${prefix}`,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      ).exec();

      if (!counter || typeof counter.seq !== 'number') {
        throw new Error(`Failed to generate identifiers for prefix ${prefix}`);
      }

      const sequence = String(counter.seq).padStart(8, '0');
      const baseNumber = `${prefix}${sequence}`;

      if (USE_NUBAN) {
        const checkDigit = calculateNUBANCheckDigit(baseNumber);
        const accountNumber = `${baseNumber}${checkDigit}`;
        if (!/^\d{10}$/.test(accountNumber)) {
          throw new Error(`Generated ACCT_NO ${accountNumber} is not 10 digits`);
        }
        return {
          ACCT_NO: accountNumber,
          ACCT_ID: generateAcctId(counter.seq), // ✅ always 6-digit string
          sequence: counter.seq,
        };
      }

      return {
        ACCT_NO: baseNumber,
        ACCT_ID: generateAcctId(counter.seq), // ✅ always 6-digit string
        sequence: counter.seq,
      };
    },
    { retries: 3, factor: 2, minTimeout: 1000, maxTimeout: 5000 }
  );
};

// 🔐 Generate 6-digit ACCT_ID
const generateAccountId = async () => {
  return retry(
    async () => {
      const counter = await Counter.findByIdAndUpdate(
        'ACCT_ID_SEQ',
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      ).exec();
      if (!counter || typeof counter.seq !== 'number') {
        throw new Error('Failed to generate ACCT_ID');
      }
      return generateAcctId(counter.seq); // ✅ safe helper
    },
    { retries: 3, factor: 2, minTimeout: 1000, maxTimeout: 5000 }
  );
};

// 🔢 Calculate NUBAN Check Digit
const calculateNUBANCheckDigit = (accountNumber) => {
  const weights = [3, 7, 3, 3, 7, 3, 3, 7, 3];
  let sum = 0;
  for (let i = 0; i < accountNumber.length; i++) {
    sum += Number(accountNumber[i]) * weights[i];
  }
  const mod = sum % 10;
  return mod === 0 ? '0' : String(10 - mod);
};

// 🔢 Generate Loan Contract Form ID
const GenerateLoanContractFormId = async () => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const lastContract = await LoanContractForm.findOne().sort({ createdAt: -1 }).session(session);
    let lastNumber = 0;
    if (lastContract?.loan_contract_no) {
      const matches = lastContract.loan_contract_no.match(/\d+/);
      if (matches) lastNumber = parseInt(matches[0], 10);
    }

    const counter = await Counter.findOneAndUpdate(
      { _id: 'LOAN_CONTRACT' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );

    const paddedNumber = counter.seq.toString().padStart(CONTRACT_ID_LENGTH, '0');
    const contractId = `LC-${paddedNumber}`;

    await session.commitTransaction();
    return contractId;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

// 🔢 Generate Customer Numbers
const generateCustomerNumber = async (branchCode = '01') => {
  const session = await Customer.startSession();
  session.startTransaction();

  try {
    // Get last customer (lean for performance)
    const lastCustomer = await Customer.findOne().sort({ CUST_ID: -1 }).lean().session(session);

    const lastCustId = lastCustomer ? parseInt(lastCustomer.CUST_ID, 10) || 0 : 0;
    const lastCustNoSerial = lastCustomer && lastCustomer.CUST_NO
      ? parseInt(lastCustomer.CUST_NO.slice(2), 10) || 0
      : 0;

    // Increment counter atomically
    const counter = await Counter.findOneAndUpdate(
      { _id: 'CUSTOMER_NUMBER' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );

    if (!counter || typeof counter.seq !== 'number') {
      throw new Error('Failed to fetch valid CUSTOMER_NUMBER counter');
    }

    const nextId = Math.max(lastCustId + 1, counter.seq);
    const nextSerial = lastCustNoSerial + 1;

    // Sync counter if needed
    if (nextId > counter.seq) {
      await Counter.updateOne(
        { _id: 'CUSTOMER_NUMBER' },
        { $set: { seq: nextId } },
        { session }
      );
    }

    // Format IDs
    const CUST_ID = nextId.toString().padStart(CUSTOMER_ID_LENGTH, '0'); // always 10 digits
    const CUST_NO = branchCode + nextSerial.toString().padStart(8, '0'); // branch + 8 digits

    // Commit transaction
    await session.commitTransaction();

    return {
      CUST_ID,
      CUST_NO,
      numericValue: nextId,
      formattedString: CUST_ID,
    };
  } catch (error) {
    await session.abortTransaction();
    throw new Error(`Failed to generate customer number: ${error.message}`);
  } finally {
    await session.endSession();
  }
};


// 🔢 Generate Transaction IDs
const generateTransactionIds = () => {
  const generateSerial = (length) => Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
  return {
    TRANSACTION_ID: generateSerial(13),
    EVENT_ID: generateSerial(7),
    TRAN_JOURNAL_ID: generateSerial(13),
  };
};

// 🔢 NUBAN-compliant generator (alt)
const generateNUBAN = (bankCode = BANK_CODE, serial = null) => {
  const serialNumber = serial || Math.floor(100000 + Math.random() * 900000);
  const nubanSerial = serialNumber.toString().padStart(NUBAN_SERIAL_LENGTH, '0');
  const fullNumber = bankCode + nubanSerial;
  const weights = [3, 7, 3, 3, 7, 3, 3, 7, 3];
  const sum = fullNumber.split('').reduce((acc, digit, index) => acc + parseInt(digit) * weights[index], 0);
  const checksum = (10 - (sum % 10)) % 10;
  return nubanSerial + checksum.toString();
};

// 🔢 Legacy loan account generator
const generateLoanAccountNumberByProdId = async (prodId) => {
  const { formattedString } = await generateAccountNumberByProdId(prodId);
  return formattedString;
};

export {
  generateAccountNumber,
  generateAccountNumberByProdId,
  generateAccountIdentifiersFromCounter,
  generateAccountId,
  calculateNUBANCheckDigit,
  GenerateLoanContractFormId,
  generateCustomerNumber,
  generateNUBAN,
  generateTransactionIds,
  generateLoanAccountNumberByProdId,
  // safe helpers
  generateAcctId,
  generateAcctNo,
};
