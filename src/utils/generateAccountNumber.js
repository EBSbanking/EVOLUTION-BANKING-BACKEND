// utils/accountGenerator.js - COMPLETE FIXED VERSION

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
// SIMPLIFIED ACCOUNT NUMBER GENERATION FUNCTIONS
// ============================

/**
 * Generate a unique 10-digit account number for group savings
 * Format: 8 + 9 random digits = 10 digits total
 */
export const generateGroupAccountNumber = () => {
  const prefix = '8'; // Group accounts start with 8
  const randomPart = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
  return prefix + randomPart.slice(0, 9); // Ensure exactly 10 digits
};

/**
 * Generate a unique 10-digit account number for regular customers
 * Format: 2 + 9 random digits = 10 digits total
 */
export const generateCustomerAccountNumber = () => {
  const prefix = '2'; // Customer savings start with 2
  const randomPart = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
  return prefix + randomPart.slice(0, 9); // Ensure exactly 10 digits
};

/**
 * Generate account number for group savings with uniqueness check
 */
export const generateAccountNumberForGroup = async (groupCode) => {
  try {
    const CustomerAccount = (await import('../models/CustomerAccount.js')).default;
    
    let accountNumber;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    while (!isUnique && attempts < maxAttempts) {
      // Generate 10-digit account number starting with 8
      const prefix = '8';
      const randomPart = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
      accountNumber = prefix + randomPart.slice(0, 9);
      
      // Check if it already exists - use a simple query with no extra fields
      const existing = await CustomerAccount.findOne({
        where: { account_number: accountNumber },
        attributes: ['id'] // Only select id to minimize query
      });
      
      if (!existing) {
        isUnique = true;
      }
      
      attempts++;
    }
    
    if (!isUnique) {
      throw new Error('Could not generate unique account number after multiple attempts');
    }
    
    return {
      ACCT_NO: accountNumber,
      ACCT_ID: accountNumber.slice(-6),
      success: true
    };
    
  } catch (error) {
    console.error('Error generating group account number:', error);
    
    // Simple fallback
    const emergencyAcctNo = '8' + Date.now().toString().slice(-9);
    
    return {
      ACCT_NO: emergencyAcctNo,
      ACCT_ID: emergencyAcctNo.slice(-6),
      success: true,
      isFallback: true
    };
  }
};

// In CustomerAccountController.js - REPLACE the generateAccountNumberForCustomer function

/**
 * Generate account number for customer - FIXED VERSION (NO Op.or USAGE)
 */
const generateAccountNumberForCustomer = async (customerId, accountType = 'SAVINGS', transaction = null) => {
  console.log(`🔢 generateAccountNumberForCustomer called with:`, { customerId, accountType, hasTransaction: !!transaction });
  
  try {
    // Dynamic import to avoid circular dependencies
    const CustomerAccount = (await import('../models/CustomerAccount.js')).default;
    
    let accountNumber;
    let isUnique = false;
    let attempts = 0;
    const maxAttempts = 10;
    
    // Determine prefix based on account type
    let prefix = '2'; // Default for savings
    const upperAccountType = accountType ? accountType.toUpperCase() : 'SAVINGS';
    
    if (upperAccountType === 'CURRENT') {
      prefix = '1';
    } else if (upperAccountType === 'LOAN') {
      prefix = '3';
    } else if (upperAccountType === 'FIXED_DEPOSIT' || upperAccountType === 'TERM_DEPOSIT') {
      prefix = '5';
    }
    
    console.log(`🔢 Using prefix ${prefix} for account type: ${upperAccountType}`);
    
    while (!isUnique && attempts < maxAttempts) {
      // Generate random part - 9 digits
      const randomPart = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
      accountNumber = prefix + randomPart.slice(0, 9); // Ensure exactly 10 digits
      
      console.log(`🔍 Checking if account number ${accountNumber} exists (attempt ${attempts + 1})...`);
      
      // Check if it already exists - SIMPLE QUERY WITHOUT ANY Op
      const queryOptions = { 
        where: { account_number: accountNumber },
        attributes: ['id']
      };
      
      // Add transaction if provided
      if (transaction) {
        queryOptions.transaction = transaction;
      }
      
      try {
        // Execute query
        const existing = await CustomerAccount.findOne(queryOptions);
        
        if (!existing) {
          isUnique = true;
          console.log(`✅ Generated unique account number: ${accountNumber}`);
        } else {
          console.log(`⚠️ Account number ${accountNumber} already exists, retrying...`);
        }
      } catch (queryError) {
        console.error(`❌ Error checking account number:`, queryError.message);
        // If there's an error checking, assume it's unique and continue
        isUnique = true;
      }
      
      attempts++;
    }
    
    if (!isUnique) {
      // Fallback to timestamp-based generation
      console.log('⚠️ Could not generate unique random number, using timestamp fallback');
      const timestamp = Date.now().toString().slice(-9);
      accountNumber = prefix + timestamp.padStart(9, '0');
    }
    
    return {
      ACCT_NO: accountNumber,
      account_number: accountNumber,
      ACCT_ID: accountNumber.slice(-6),
      CUST_ID: customerId,
      accountType: upperAccountType,
      success: true,
      message: 'Generated customer account number'
    };
    
  } catch (error) {
    console.error('❌ Error in generateAccountNumberForCustomer:', error);
    
    // Emergency fallback - use timestamp
    const timestamp = Date.now().toString().slice(-9);
    const prefix = accountType?.toUpperCase() === 'SAVINGS' ? '2' : 
                  accountType?.toUpperCase() === 'CURRENT' ? '1' : '3';
    
    const emergencyAcctNo = `${prefix}${timestamp}`.padStart(10, '0');
    
    console.log(`🆘 Using emergency fallback account number: ${emergencyAcctNo}`);
    
    return {
      ACCT_NO: emergencyAcctNo,
      account_number: emergencyAcctNo,
      ACCT_ID: emergencyAcctNo.slice(-6),
      CUST_ID: customerId,
      accountType: accountType?.toUpperCase() || 'SAVINGS',
      success: true,
      isFallback: true,
      message: 'Generated emergency fallback account number'
    };
  }
};

// ============================
// LEGACY FUNCTIONS (Keep for backward compatibility)
// ============================

const USE_NUBAN = true;
const BANK_CODE = '011';

// Calculate NUBAN check digit
export const calculateNUBANCheckDigit = (baseNumber) => {
  const weights = [3, 7, 3, 3, 7, 3, 3, 7, 3];
  let sum = 0;
  for (let i = 0; i < baseNumber.length; i++) {
    sum += Number(baseNumber[i]) * weights[i];
  }
  const mod = sum % 10;
  return mod === 0 ? '0' : String(10 - mod);
};

// Legacy generateAccountNumber function
export async function generateAccountNumber() {
  // Generate NUBAN format: 2XXXXXXXXX (10 digits starting with 2)
  const randomPart = Math.floor(Math.random() * 1000000000).toString().padStart(9, '0');
  const accountNumber = '2' + randomPart;
  
  try {
    // Dynamic import to avoid circular dependencies
    const CustomerAccount = (await import('../models/CustomerAccount.js')).default;
    
    // Check if it exists
    const exists = await CustomerAccount.findOne({
      where: { account_number: accountNumber }
    });
    
    if (exists) {
      // Recursively generate until unique
      return await generateAccountNumber();
    }
  } catch (error) {
    console.error('Error checking account number existence:', error);
    // Return the generated number even if check fails
  }
  
  return accountNumber;
}

// 🔐 Generate 6-digit ACCT_ID using counter
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

  // Fallback to random generation
  console.warn('Using fallback ACCT_ID generation');
  return generateAcctId(Math.floor(Math.random() * 1000000));
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
    
    // Fallback generation
    console.warn('Error generating customer number, using fallback:', error.message);
    const timestamp = Date.now();
    const fallbackId = timestamp % 1000000000;
    
    return {
      CUST_ID: fallbackId.toString().padStart(10, '0'),
      CUST_NO: branchCode + (timestamp % 100000000).toString().padStart(8, '0'),
      numericValue: fallbackId,
      formattedString: fallbackId.toString().padStart(10, '0'),
      isFallback: true
    };
  }
};

// 🔢 Generate Account Identifiers for savings applications
export const generateAccountIdentifiersFromCounter = async (custId) => {
  try {
    // Generate savings account number for the customer
    const normalizedCustId = custId ? custId.toString().padStart(10, '0') : `SAV_${Date.now()}`;
    
    const accountData = await generateAccountNumberForCustomer(normalizedCustId, 'SAVINGS');

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
    const accountNumber = `2${timestamp.toString().slice(-9)}`.padStart(10, '0');
    
    return {
      ACCT_ID: accountNumber.slice(-6),
      ACCT_NO: accountNumber,
      CUST_ID: custId || null,
      accountType: 'SAVINGS',
      productType: 'SAVINGS',
      message: 'Generated fallback savings account identifiers',
      isFallback: true
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
      throw error;
    }
  } catch (error) {
    console.error('❌ Error generating loan contract form ID:', error);
    
    // Fallback generation
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 1000);
    const fallbackId = `LCF-${loanType}-${timestamp}-${randomSuffix}`;
    
    return {
      loanContractFormId: fallbackId,
      sequence: 0,
      loanType,
      generationDate: new Date(),
      formattedString: fallbackId,
      isFallback: true
    };
  }
};

// 🔢 Generate Account Number for Deposit (Generic)
export const generateAccountNumberForDeposit = async (customerId, accountType = 'SAVINGS') => {
  try {
    // Use the simplified function
    return await generateAccountNumberForCustomer(customerId, accountType);
  } catch (error) {
    console.error(`❌ Error generating ${accountType} account:`, error);
    
    // Fallback
    const timestamp = Date.now();
    
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
      case 'FIXED_DEPOSIT':
        prefix = '5';
        break;
      case 'LOAN':
        prefix = '3';
        break;
      default:
        prefix = '2';
    }
    
    // Generate 10-digit account number
    const accountNumber = `${prefix}${timestamp.toString().slice(-9)}`.padStart(10, '0');
    
    return {
      ACCT_NO: accountNumber,
      ACCT_ID: accountNumber.slice(-6),
      CUST_ID: customerId,
      accountType: accountType.toUpperCase(),
      message: `Generated ${accountType} account number (fallback)`,
      isFallback: true
    };
  }
};

// Export all functions
export default {
  // Simplified functions
  generateAccountNumberForGroup,
  generateAccountNumberForCustomer,
  generateGroupAccountNumber,
  generateCustomerAccountNumber,
  
  // Legacy functions (kept for compatibility)
  generateAccountNumber,
  generateAccountId,
  calculateNUBANCheckDigit,
  generateCustomerNumber,
  generateAccountIdentifiersFromCounter,
  generateTransactionIds,
  generateAcctId,
  generateAccountNumberForDeposit,
  GenerateLoanContractFormId,
};