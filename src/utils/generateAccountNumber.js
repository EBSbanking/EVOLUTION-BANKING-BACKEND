// utils/accountGenerator.js
import { Op } from 'sequelize';
import Counter from '../models/Counter.js';
import Customer from '../models/Customer.js';
import sequelize from '../../config/db.js';


const ACCOUNT_NUMBER_LENGTH = 10;
const ACCOUNT_ID_LENGTH = 6;
const CUSTOMER_ID_LENGTH = 10;
const CUSTOMER_NO_LENGTH = 10;

// ✅ SAFE ID HELPERS
function generateAcctId(seq) {
  return String(seq).padStart(ACCOUNT_ID_LENGTH, '0'); // Always 6 digits
}

// ============================
// ACCOUNT NUMBER GENERATION FUNCTIONS - FIXED VERSION
// ============================

const USE_NUBAN = true;
const BANK_CODE = '011';

// Calculate NUBAN check digit
const calculateNUBANCheckDigit = (baseNumber) => {
  const weights = [3, 7, 3, 3, 7, 3, 3, 7, 3];
  let sum = 0;
  for (let i = 0; i < baseNumber.length; i++) {
    sum += Number(baseNumber[i]) * weights[i];
  }
  const mod = sum % 10;
  return mod === 0 ? '0' : String(10 - mod);
};

// utils/accountNumberGenerator.js
export async function generateAccountNumber() {
  // Generate NUBAN format: 2XXXXXXXXX (10 digits starting with 2)
  const randomPart = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
  const accountNumber = '2' + randomPart;
  
  // Check if it exists (optional but recommended)
  const exists = await AccountApplication.findOne({
    where: { account_number: accountNumber }
  });
  
  if (exists) {
    // Recursively generate until unique
    return await generateAccountNumber();
  }
  
  return accountNumber;
}

// Generate Account Number for Customer - FIXED VERSION
// Replace the generateAccountNumberForCustomer function in your controller
const generateAccountNumberForCustomer = async (customerId, accountType = 'SAVINGS', transaction = null) => {
  try {
    console.log(`🔢 Generating account number for customer: ${customerId}, type: ${accountType}`);
    
    // Determine counter name
    const counterName = accountType.toUpperCase() === 'SAVINGS' ? 'ACCT_SAVINGS' : 
                       accountType.toUpperCase() === 'CURRENT' ? 'ACCT_CURRENT' : 'ACCT_LOAN';
    
    let currentSeq = 1001; // Default starting sequence
    
    try {
      // First, check what columns exist in the counters table
      const [columns] = await sequelize.query(
        "SHOW COLUMNS FROM counters",
        { type: sequelize.QueryTypes.SELECT, transaction }
      );
      
      console.log('📋 Counters table columns:', columns.map(c => c.Field));
      
      // Find the correct column name for counter identifier
      const possibleIdColumns = ['name', 'counter_name', 'type', 'counter_type', 'counter_cd'];
      const idColumn = columns.find(col => 
        possibleIdColumns.includes(col.Field.toLowerCase())
      )?.Field || 'name'; // Default to 'name'
      
      // Find the correct column name for sequence
      const possibleSeqColumns = ['seq', 'sequence', 'counter_val', 'value'];
      const seqColumn = columns.find(col => 
        possibleSeqColumns.includes(col.Field.toLowerCase())
      )?.Field || 'seq'; // Default to 'seq'
      
      console.log(`📝 Using columns: id=${idColumn}, seq=${seqColumn}`);
      
      // Try to get existing counter
      const [results] = await sequelize.query(
        `SELECT * FROM counters WHERE ${idColumn} = ? LIMIT 1`,
        {
          replacements: [counterName],
          type: sequelize.QueryTypes.SELECT,
          transaction
        }
      );
      
      if (results && results[0]) {
        const counter = results[0];
        currentSeq = (counter[seqColumn] || counter['seq'] || 0) + 1;
        
        // Update the counter
        await sequelize.query(
          `UPDATE counters SET ${seqColumn} = ?, updated_at = NOW() WHERE ${idColumn} = ?`,
          {
            replacements: [currentSeq, counterName],
            transaction
          }
        );
        
        console.log(`✅ Updated counter ${counterName} to sequence: ${currentSeq}`);
      } else {
        // Create new counter
        console.log(`🆕 Creating new counter for ${counterName} with sequence: ${currentSeq}`);
        
        await sequelize.query(
          `INSERT INTO counters (${idColumn}, ${seqColumn}, created_at, updated_at) 
           VALUES (?, ?, NOW(), NOW())`,
          {
            replacements: [counterName, currentSeq],
            transaction
          }
        );
      }
    } catch (error) {
      console.error('❌ Error accessing counters table:', error.message);
      
      // Fallback sequence
      const timestamp = Date.now();
      currentSeq = (parseInt(customerId.slice(-4)) || 0) + (timestamp % 10000);
      console.log(`🔄 Using fallback sequence: ${currentSeq}`);
    }
    
    // Generate ACCT_ID
    let acctIdSeq = 1001;
    
    // Format account number (simple format for now)
    const customerSuffix = customerId.toString().slice(-4).padStart(4, '0');
    const sequenceStr = currentSeq.toString().padStart(6, '0');
    const accountNumber = `10${customerSuffix}${sequenceStr}`.slice(-10);
    
    const ACCT_ID = acctIdSeq.toString().padStart(6, '0');
    
    console.log(`✅ Generated Account: ACCT_NO=${accountNumber}, ACCT_ID=${ACCT_ID}`);
    
    return {
      ACCT_NO: accountNumber,
      ACCT_ID,
      CUST_ID: customerId,
      accountType: accountType.toUpperCase(),
      sequence: currentSeq
    };
    
  } catch (error) {
    console.error('❌ Error in generateAccountNumberForCustomer:', error);
    
    // Emergency fallback
    const timestamp = Date.now();
    const emergencyAcctNo = `99${timestamp.toString().slice(-8)}`.padStart(10, '0');
    const emergencyAcctId = (timestamp % 1000000).toString().padStart(6, '0');
    
    return {
      ACCT_NO: emergencyAcctNo,
      ACCT_ID: emergencyAcctId,
      CUST_ID: customerId,
      accountType: accountType.toUpperCase(),
      sequence: 1
    };
  }
};

// 🔢 Generate Account Number for Group Savings
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
  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const transaction = await Counter.sequelize.transaction();

      try {
        const [counter, created] = await Counter.findOrCreate({
          where: { _id: 'ACCT_ID_SEQ' },
          defaults: { seq: 1 },
          transaction
        });

        if (!created) {
          await Counter.increment('seq', {
            where: { _id: 'ACCT_ID_SEQ' },
            by: 1,
            transaction
          });

          const updatedCounter = await Counter.findOne({
            where: { _id: 'ACCT_ID_SEQ' },
            transaction
          });
          
          counter.seq = updatedCounter.seq;
        }

        await transaction.commit();

        if (!counter || typeof counter.seq !== 'number') {
          throw new Error('Failed to generate ACCT_ID');
        }

        return generateAcctId(counter.seq);
      } catch (error) {
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
    }
  }

  throw lastError || new Error('Failed to generate ACCT_ID after retries');
};

// 🔢 Generate Customer Numbers
export const generateCustomerNumber = async (branchCode = '01') => {
  const transaction = await Customer.sequelize.transaction();

  try {
    // Get last customer
    const lastCustomer = await Customer.findOne({
      order: [['CUST_ID', 'DESC']],
      transaction
    });

    const lastCustId = lastCustomer ? parseInt(lastCustomer.CUST_ID, 10) || 0 : 0;
    const lastCustNoSerial = lastCustomer && lastCustomer.CUST_NO
      ? parseInt(lastCustomer.CUST_NO.slice(2), 10) || 0
      : 0;

    // Get or create customer number counter
    const [counter, created] = await Counter.findOrCreate({
      where: { _id: 'CUSTOMER_NUMBER' },
      defaults: { seq: Math.max(1, lastCustId + 1) },
      transaction
    });

    if (!created && counter.seq <= lastCustId) {
      await Counter.update(
        { seq: lastCustId + 1 },
        { where: { _id: 'CUSTOMER_NUMBER' }, transaction }
      );
      counter.seq = lastCustId + 1;
    }

    // Format IDs
    const nextId = counter.seq;
    const nextSerial = lastCustNoSerial + 1;

    // Increment counter for next use
    await Counter.increment('seq', {
      where: { _id: 'CUSTOMER_NUMBER' },
      by: 1,
      transaction
    });

    const CUST_ID = nextId.toString().padStart(CUSTOMER_ID_LENGTH, '0');
    const CUST_NO = branchCode + nextSerial.toString().padStart(8, '0');

    await transaction.commit();

    return {
      CUST_ID,
      CUST_NO,
      numericValue: nextId,
      formattedString: CUST_ID,
    };
  } catch (error) {
    await transaction.rollback();
    throw new Error(`Failed to generate customer number: ${error.message}`);
  }
};

// 🔢 Generate Account Identifiers for savings applications
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
  const transaction = await Counter.sequelize.transaction();

  try {
    // Get or create loan contract form ID counter
    const [counter, created] = await Counter.findOrCreate({
      where: { _id: 'LOAN_CONTRACT_FORM_ID' },
      defaults: { seq: 1 },
      transaction
    });

    if (!created) {
      await Counter.increment('seq', {
        where: { _id: 'LOAN_CONTRACT_FORM_ID' },
        by: 1,
        transaction
      });

      const updatedCounter = await Counter.findOne({
        where: { _id: 'LOAN_CONTRACT_FORM_ID' },
        transaction
      });
      
      counter.seq = updatedCounter.seq;
    }

    // Format: LCF-[TYPE]-[YYYYMMDD]-[6-digit sequence]
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const sequence = counter.seq.toString().padStart(6, '0');
    const loanContractFormId = `LCF-${loanType}-${dateStr}-${sequence}`;

    await transaction.commit();

    console.log(`✅ Generated Loan Contract Form ID: ${loanContractFormId}`);

    return {
      loanContractFormId,
      sequence: counter.seq,
      loanType,
      generationDate: now,
      formattedString: loanContractFormId
    };
  } catch (error) {
    await transaction.rollback();
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

// // 🔢 Generate Account Number for Term Deposit
// export const generateAccountNumber = async (customerId, accountType = 'TERM_DEPOSIT') => {
//   const transaction = await Customer.sequelize.transaction();

//   try {
//     // First, get the customer to ensure they exist
//     const customer = await Customer.findOne({ 
//       where: { CUST_ID: customerId },
//       transaction
//     });
//     if (!customer) {
//       throw new Error(`Customer ${customerId} not found`);
//     }

//     // Use different counter for term deposits
//     const counterType = 'ACCT_TERM_DEPOSIT';

//     // Get or create counter for term deposits
//     const [counter, created] = await Counter.findOrCreate({
//       where: { _id: counterType },
//       defaults: { seq: 1 },
//       transaction
//     });

//     if (!created) {
//       await Counter.increment('seq', {
//         where: { _id: counterType },
//         by: 1,
//         transaction
//       });

//       const updatedCounter = await Counter.findOne({
//         where: { _id: counterType },
//         transaction
//       });
      
//       counter.seq = updatedCounter.seq;
//     }

//     // Generate account number - different prefix for term deposits
//     let accountNumber;
//     if (USE_NUBAN) {
//       // NUBAN format for term deposits: [5][7-digit serial][check digit]
//       const typePrefix = '5'; // Term deposit account prefix
//       const serial = counter.seq.toString().padStart(7, '0');
//       const baseNumber = `${typePrefix}${serial}`;
      
//       if (baseNumber.length !== 8) {
//         throw new Error(`Base account number ${baseNumber} is not 8 digits`);
//       }
      
//       const checkDigit = calculateNUBANCheckDigit(baseNumber);
//       accountNumber = `${baseNumber}${checkDigit}`;
//     } else {
//       // Legacy format for term deposits
//       const prefix = '500';
//       const sequence = counter.seq.toString().padStart(7, '0');
//       accountNumber = `${prefix}${sequence}`;
//     }

//     // Verify account number length
//     if (USE_NUBAN && !/^\d{9}$/.test(accountNumber)) {
//       throw new Error(`Generated NUBAN account number ${accountNumber} is not 9 digits`);
//     }
//     if (!USE_NUBAN && !/^\d{10}$/.test(accountNumber)) {
//       throw new Error(`Generated account number ${accountNumber} is not 10 digits`);
//     }

//     // Generate ACCT_ID (6 digits)
//     const [acctIdCounter, acctIdCreated] = await Counter.findOrCreate({
//       where: { _id: 'ACCT_ID_SEQ' },
//       defaults: { seq: 1 },
//       transaction
//     });

//     if (!acctIdCreated) {
//       await Counter.increment('seq', {
//         where: { _id: 'ACCT_ID_SEQ' },
//         by: 1,
//         transaction
//       });

//       const updatedAcctIdCounter = await Counter.findOne({
//         where: { _id: 'ACCT_ID_SEQ' },
//         transaction
//       });
      
//       acctIdCounter.seq = updatedAcctIdCounter.seq;
//     }

//     const ACCT_ID = acctIdCounter.seq.toString().padStart(ACCOUNT_ID_LENGTH, '0');

//     await transaction.commit();

//     console.log(`✅ Generated ${accountType} Account for Customer ${customerId}: ACCT_NO=${accountNumber}, ACCT_ID=${ACCT_ID}`);

//     return {
//       ACCT_NO: accountNumber,
//       ACCT_ID,
//       CUST_ID: customerId,
//       accountType,
//       sequence: counter.seq,
//       formattedString: accountNumber
//     };
//   } catch (error) {
//     await transaction.rollback();
//     console.error(`❌ Error generating ${accountType} account number:`, error);
//     throw new Error(`Failed to generate ${accountType} account number: ${error.message}`);
//   }
// };

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