import mongoose from 'mongoose';
import retry from 'async-retry';
import Counter from '../models/Counter.js';
import Customer from '../models/Customer.js';

const USE_NUBAN = true; // Enforce NUBAN-compliant account numbers
const ACCOUNT_NUMBER_LENGTH = 10;
const ACCOUNT_ID_LENGTH = 6;
const CUSTOMER_ID_LENGTH = 10;
const CUSTOMER_NO_LENGTH = 10;

// ✅ SAFE ID HELPERS
function generateAcctId(seq) {
  return String(seq).padStart(ACCOUNT_ID_LENGTH, '0'); // Always 6 digits
}

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

// 🔢 Generate Account Number for Customer - SAVINGS ONLY (FIXED NUBAN LENGTH)
export const generateAccountNumberForCustomer = async (customerId, accountType = 'SAVINGS') => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // FIX: Handle both regular customers and group pseudo-customers
    // If customerId is a number or looks like a regular CUST_ID, check for customer
    // If it's a group ID (like 99999 or group code), skip customer check
    
    const isGroupCustomer = customerId > 100000 || 
                           (typeof customerId === 'string' && customerId.length >= 6) ||
                           (typeof customerId === 'number' && customerId >= 99999);
    
    if (!isGroupCustomer) {
      // For regular customers, check they exist
      const customer = await Customer.findOne({ CUST_ID: customerId }).session(session);
      if (!customer) {
        throw new Error(`Customer ${customerId} not found`);
      }
    }

    // For savings accounts only
    const counterType = 'ACCT_SAVINGS';

    // Get counter for savings accounts
    const counter = await Counter.findOneAndUpdate(
      { _id: counterType },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );

    if (!counter || typeof counter.seq !== 'number') {
      throw new Error('Failed to generate account number for savings account');
    }

    // Generate account number - FIXED: Ensure proper length
    let accountNumber;
    if (USE_NUBAN) {
      // NUBAN format for savings: [2][7-digit serial][check digit]
      const typePrefix = '2'; // Savings account prefix
      const serial = counter.seq.toString().padStart(7, '0');
      const baseNumber = `${typePrefix}${serial}`;
      
      // Verify base number is exactly 8 digits before calculating check digit
      if (baseNumber.length !== 8) {
        throw new Error(`Base account number ${baseNumber} is not 8 digits`);
      }
      
      const checkDigit = calculateNUBANCheckDigit(baseNumber);
      accountNumber = `${baseNumber}${checkDigit}`; // Total should be 9 digits
    } else {
      // Legacy format for savings
      const prefix = '100';
      const sequence = counter.seq.toString().padStart(7, '0');
      accountNumber = `${prefix}${sequence}`;
    }

    // Verify account number is correct length
    // NUBAN savings accounts should be 9 digits (prefix 2 + 7-digit serial + check digit)
    if (!/^\d{9}$/.test(accountNumber) && USE_NUBAN) {
      throw new Error(`Generated NUBAN account number ${accountNumber} is not 9 digits`);
    }
    
    // Legacy accounts should be 10 digits
    if (!/^\d{10}$/.test(accountNumber) && !USE_NUBAN) {
      throw new Error(`Generated account number ${accountNumber} is not 10 digits`);
    }

    // Also generate ACCT_ID (6 digits)
    const acctIdCounter = await Counter.findOneAndUpdate(
      { _id: 'ACCT_ID_SEQ' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );
    const ACCT_ID = acctIdCounter.seq.toString().padStart(ACCOUNT_ID_LENGTH, '0');

    await session.commitTransaction();

    console.log(`✅ Generated Savings Account for ${isGroupCustomer ? 'Group/Pseudo-Customer' : 'Customer'} ${customerId}: ACCT_NO=${accountNumber}, ACCT_ID=${ACCT_ID}`);

    return {
      ACCT_NO: accountNumber,
      ACCT_ID,
      CUST_ID: customerId,
      accountType: 'SAVINGS',
      sequence: counter.seq,
      formattedString: accountNumber
    };
  } catch (error) {
    await session.abortTransaction();
    console.error('❌ Error generating savings account number:', error);
    throw new Error(`Failed to generate savings account number: ${error.message}`);
  } finally {
    await session.endSession();
  }
};

// 🔢 Generate Account Number for Group Savings (IMPROVED FALLBACK)
export const generateAccountNumberForGroup = async (groupCode) => {
  try {
    // Extract numeric part from group code for use as pseudo-customer ID
    const numericGroupCode = groupCode.replace(/^GRP/i, '');
    const groupCustId = numericGroupCode && !isNaN(numericGroupCode) ? 
                       Number(numericGroupCode) : 
                       Date.now() % 1000000;
    
    console.log(`🔢 Generating account for group ${groupCode} with pseudo-customer ID: ${groupCustId}`);
    
    // Try to use the customer function with group customer ID
    try {
      const result = await generateAccountNumberForCustomer(groupCustId, 'SAVINGS');
      return result;
    } catch (customerError) {
      console.warn('Primary generation failed, using fallback:', customerError.message);
      
      // Fallback: Generate proper 10-digit account number
      const timestamp = Date.now();
      const randomPart = Math.floor(Math.random() * 10000);
      
      // Generate 10-digit account number
      const accountNumber = generateFallbackAccountNumber(timestamp, randomPart);
      
      return {
        ACCT_NO: accountNumber,
        ACCT_ID: generateAcctId(Math.floor(Math.random() * 1000000)),
        CUST_ID: groupCustId,
        accountType: 'SAVINGS',
        message: 'Generated fallback group savings account number',
        isFallback: true
      };
    }
  } catch (error) {
    console.error('❌ Error generating group account number:', error);
    
    // Emergency fallback
    const timestamp = Date.now();
    const randomPart = Math.floor(Math.random() * 10000);
    const accountNumber = generateFallbackAccountNumber(timestamp, randomPart);
    
    return {
      ACCT_NO: accountNumber,
      ACCT_ID: generateAcctId(Math.floor(Math.random() * 1000000)),
      CUST_ID: groupCode,
      accountType: 'SAVINGS',
      message: 'Emergency fallback group savings account number',
      isEmergencyFallback: true
    };
  }
};

// Helper function for fallback account number generation
const generateFallbackAccountNumber = (timestamp, randomPart) => {
  // Generate a proper 10-digit account number
  const timestampStr = timestamp.toString();
  const last6 = timestampStr.slice(-6); // Last 6 digits of timestamp
  const randomStr = randomPart.toString().padStart(4, '0'); // 4-digit random
  
  // Combine: 2 (savings prefix) + last6 timestamp + random4 = 1+6+4 = 11, then take first 10
  const fullNumber = `2${last6}${randomStr}`;
  return fullNumber.slice(0, 10);
};

// 🔐 Generate 6-digit ACCT_ID
export const generateAccountId = async () => {
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
      return generateAcctId(counter.seq);
    },
    { retries: 3, factor: 2, minTimeout: 1000, maxTimeout: 5000 }
  );
};

// 🔢 Generate Customer Numbers
export const generateCustomerNumber = async (branchCode = '01') => {
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

// 🔢 Generate Account Identifiers for savings applications (SIMPLIFIED)
export const generateAccountIdentifiersFromCounter = async (custId) => {
  try {
    // Generate savings account number for the customer
    const normalizedCustId = custId ? custId.toString().padStart(10, '0') : `SAV_${Date.now()}`;
    
    const accountData = await generateAccountNumberForCustomer(normalizedCustId);

    return {
      ACCT_ID: accountData.ACCT_ID,
      ACCT_NO: accountData.ACCT_NO,
      CUST_ID: normalizedCustId,
      accountType: 'SAVINGS',
      productType: 'SAVINGS',
      message: 'Savings account identifiers generated successfully'
    };
  } catch (error) {
    console.error('Error generating savings account identifiers:', error);
    
    // Fallback
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 10000);
    const accountNumber = generateFallbackAccountNumber(timestamp, randomSuffix);
    
    return {
      ACCT_ID: generateAcctId(Math.floor(Math.random() * 1000000)),
      ACCT_NO: accountNumber,
      CUST_ID: custId || null,
      accountType: 'SAVINGS',
      productType: 'SAVINGS',
      message: 'Generated fallback savings account identifiers'
    };
  }
};

// 🔢 Generate Transaction IDs
export const generateTransactionIds = () => {
  const generateSerial = (length) => Array.from({ length }, () => Math.floor(Math.random() * 10)).join('');
  return {
    TRANSACTION_ID: generateSerial(13),
    EVENT_ID: generateSerial(7),
    TRAN_JOURNAL_ID: generateSerial(13),
  };
};

// 📄 Generate Loan Contract Form ID
export const GenerateLoanContractFormId = async (loanType = 'PERSONAL') => {
  try {
    const session = await mongoose.startSession();
    session.startTransaction();

    // Generate a unique loan contract form ID
    const counter = await Counter.findOneAndUpdate(
      { _id: 'LOAN_CONTRACT_FORM_ID' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );

    if (!counter || typeof counter.seq !== 'number') {
      throw new Error('Failed to generate loan contract form ID');
    }

    // Format: LCF-[TYPE]-[YYYYMMDD]-[6-digit sequence]
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const sequence = counter.seq.toString().padStart(6, '0');
    const loanContractFormId = `LCF-${loanType}-${dateStr}-${sequence}`;

    await session.commitTransaction();
    await session.endSession();

    console.log(`✅ Generated Loan Contract Form ID: ${loanContractFormId}`);

    return {
      loanContractFormId,
      sequence: counter.seq,
      loanType,
      generationDate: now,
      formattedString: loanContractFormId
    };
  } catch (error) {
    console.error('❌ Error generating loan contract form ID:', error);
    
    // Fallback generation
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 1000);
    return {
      loanContractFormId: `LCF-${loanType}-${timestamp}-${randomSuffix}`,
      sequence: 0,
      loanType,
      generationDate: new Date(),
      formattedString: `LCF-${loanType}-${timestamp}-${randomSuffix}`
    };
  }
};

// 🔢 Generate Account Number for Term Deposit
export const generateAccountNumber = async (customerId, accountType = 'TERM_DEPOSIT') => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // First, get the customer to ensure they exist
    const customer = await Customer.findOne({ CUST_ID: customerId }).session(session);
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    // Use different counter for term deposits
    const counterType = 'ACCT_TERM_DEPOSIT';

    // Get counter for term deposits
    const counter = await Counter.findOneAndUpdate(
      { _id: counterType },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );

    if (!counter || typeof counter.seq !== 'number') {
      throw new Error('Failed to generate account number for term deposit');
    }

    // Generate account number - different prefix for term deposits
    let accountNumber;
    if (USE_NUBAN) {
      // NUBAN format for term deposits: [5][7-digit serial][check digit]
      const typePrefix = '5'; // Term deposit account prefix
      const serial = counter.seq.toString().padStart(7, '0');
      const baseNumber = `${typePrefix}${serial}`;
      
      if (baseNumber.length !== 8) {
        throw new Error(`Base account number ${baseNumber} is not 8 digits`);
      }
      
      const checkDigit = calculateNUBANCheckDigit(baseNumber);
      accountNumber = `${baseNumber}${checkDigit}`;
    } else {
      // Legacy format for term deposits
      const prefix = '500';
      const sequence = counter.seq.toString().padStart(7, '0');
      accountNumber = `${prefix}${sequence}`;
    }

    // Verify account number length
    if (USE_NUBAN && !/^\d{9}$/.test(accountNumber)) {
      throw new Error(`Generated NUBAN account number ${accountNumber} is not 9 digits`);
    }
    if (!USE_NUBAN && !/^\d{10}$/.test(accountNumber)) {
      throw new Error(`Generated account number ${accountNumber} is not 10 digits`);
    }

    // Generate ACCT_ID (6 digits)
    const acctIdCounter = await Counter.findOneAndUpdate(
      { _id: 'ACCT_ID_SEQ' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );
    const ACCT_ID = acctIdCounter.seq.toString().padStart(ACCOUNT_ID_LENGTH, '0');

    await session.commitTransaction();

    console.log(`✅ Generated ${accountType} Account for Customer ${customerId}: ACCT_NO=${accountNumber}, ACCT_ID=${ACCT_ID}`);

    return {
      ACCT_NO: accountNumber,
      ACCT_ID,
      CUST_ID: customerId,
      accountType,
      sequence: counter.seq,
      formattedString: accountNumber
    };
  } catch (error) {
    await session.abortTransaction();
    console.error(`❌ Error generating ${accountType} account number:`, error);
    throw new Error(`Failed to generate ${accountType} account number: ${error.message}`);
  } finally {
    await session.endSession();
  }
};

// 🔢 Generate Account Number (Generic)
export const generateAccountNumberForDeposit = async (customerId, accountType = 'SAVINGS') => {
  try {
    // Determine which function to use based on account type
    if (accountType.toUpperCase() === 'TERM_DEPOSIT') {
      return await generateAccountNumber(customerId, accountType);
    } else {
      // Default to savings for SAVINGS and CURRENT
      return await generateAccountNumberForCustomer(customerId, accountType);
    }
  } catch (error) {
    console.error(`❌ Error generating ${accountType} account:`, error);
    
    // Fallback
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 10000);
    
    // Determine prefix based on account type
    let prefix;
    switch(accountType.toUpperCase()) {
      case 'SAVINGS':
        prefix = '2';
        break;
      case 'CURRENT':
        prefix = '1';
        break;
      case 'TERM_DEPOSIT':
        prefix = '5';
        break;
      default:
        prefix = '2';
    }
    
    // Generate 10-digit account number
    const timestampPart = timestamp.toString().slice(-7);
    const accountNumber = `${prefix}${timestampPart}${randomSuffix.toString().padStart(2, '0')}`.slice(0, 10);
    
    return {
      ACCT_NO: accountNumber,
      ACCT_ID: generateAcctId(Math.floor(Math.random() * 1000000)),
      CUST_ID: customerId,
      accountType: accountType.toUpperCase(),
      message: `Generated ${accountType} account number`
    };
  }
};

// Export all functions
export default {
  generateAccountNumberForCustomer,
  generateAccountNumberForGroup,
  generateAccountIdentifiersFromCounter,
  generateAccountId,
  calculateNUBANCheckDigit,
  generateCustomerNumber,
  generateTransactionIds,
  generateAcctId,
  generateAccountNumber,
  generateAccountNumberForDeposit,
  GenerateLoanContractFormId,
};