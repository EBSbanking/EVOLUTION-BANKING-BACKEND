// utils/generateLoanAccountId.js - UPDATED FOR NATURAL SEQUENCE
import Counter from '../models/Counter.js';
import Transaction from '../models/Transaction.js';
import generateSerialNumber from './generateSerialNumber.js';
import { getProductTypeByProdIdInternal } from '../Services/productService.js';
import mongoose from 'mongoose';

// ✅ Account prefix logic based on product type
export function getPrefixForProductType(productType) {
  const typeStr = String(productType).toUpperCase().trim();

  switch (typeStr) {
    case 'BUSINESS TERM LOAN':
    case 'BUSINESS_TERM_LOAN':
      return '300';
    case 'INDIVIDUAL LOAN':
    case 'INDIVIDUAL_LOAN':
      return '301';
    case 'CONSUMER LOAN':
    case 'CONSUMER_LOAN':
      return '302';
    case 'MORTGAGE':
      return '303';
    case 'AUTO LOAN':
    case 'AUTO_LOAN':
      return '304';
    case 'PERSONAL LOAN':
    case 'PERSONAL_LOAN':
      return '305';
    case 'EDUCATION LOAN':
    case 'EDUCATION_LOAN':
      return '306';
    case 'CREDIT CARD':
    case 'CREDIT_CARD':
      return '307';
    case 'LINE OF CREDIT':
    case 'LINE_OF_CREDIT':
      return '308';
    case 'SME LOAN':
    case 'SME_LOAN':
      return '309';
    case 'GROUP_LOAN':
      return '310';
    case 'GENERAL LOAN':
    case 'GENERAL_LOAN':
      return '399';
    default:
      throw new Error(`Invalid product type: ${productType}. Cannot generate loan account number.`);
  }
}

// ✅ UPDATED: Generate natural sequence 2000000011, 2000000012, 2000000013, etc.
export const generateDepositAccountNumber = async (PROD_ID, session = null) => {
  let localSession = session;
  let shouldEndSession = false;
  
  try {
    console.log(`🔢 Generating deposit account number for PROD_ID: ${PROD_ID}`);
    
    if (!localSession) {
      localSession = await mongoose.startSession();
      localSession.startTransaction();
      shouldEndSession = true;
    }
    
    const counterName = 'DEPOSIT_ACCOUNT_NUMBER';
    
    // ✅ UPDATED: Start from 11 to continue natural sequence 2000000011, 2000000012, etc.
    const result = await Counter.findOneAndUpdate(
      { _id: counterName },
      { 
        $inc: { seq: 1 },
        $setOnInsert: {
          name: 'Deposit Account Number Counter',
          description: 'Generates deposit account numbers starting with 20',
          createdAt: new Date(),
          seq: 11 // ✅ START FROM 11 to continue from 2000000011
        }
      },
      { 
        new: true, 
        upsert: true,
        setDefaultsOnInsert: true,
        session: localSession
      }
    );

    if (!result) {
      throw new Error('Deposit counter update failed');
    }

    console.log(`📊 Deposit counter sequence: ${result.seq}`);

    // ✅ UPDATED: Simple natural sequence - 20000000 + sequence (11, 12, 13, etc.)
    const sequenceNumber = result.seq;
    
    // Format: "20000000" + sequence number (padded to 2 digits)
    const accountNumber = `20000000${String(sequenceNumber).padStart(2, '0')}`;

    // ✅ VALIDATION: Must be exactly 10 digits
    if (accountNumber.length !== 10) {
      throw new Error(`Invalid account number length: ${accountNumber} (${accountNumber.length} digits)`);
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      throw new Error(`Invalid account number format: ${accountNumber}`);
    }

    // Commit if we started the session
    if (shouldEndSession) {
      await localSession.commitTransaction();
    }

    console.log(`✅ Generated deposit account number: ${accountNumber} (sequence: ${sequenceNumber})`);
    
    return accountNumber;

  } catch (error) {
    if (shouldEndSession && localSession) {
      await localSession.abortTransaction();
    }
    
    console.error('❌ Error generating deposit account number:', error);
    
    // Fallback that continues the pattern
    const timestamp = Date.now().toString();
    const fallbackNumber = `20000000${timestamp.slice(-2)}`;
    console.log(`🔄 Using deposit fallback: ${fallbackNumber}`);
    return fallbackNumber;
  } finally {
    if (shouldEndSession && localSession) {
      await localSession.endSession();
    }
  }
};

// ✅ FIXED: Generate 10-digit loan account number
export const generateLoanAccountNumberByProdId = async (PROD_ID, session = null) => {
  let localSession = session;
  let shouldEndSession = false;
  
  try {
    console.log(`🔢 Generating loan account number for PROD_ID: ${PROD_ID}`);
    
    if (!localSession) {
      localSession = await mongoose.startSession();
      localSession.startTransaction();
      shouldEndSession = true;
    }
    
    const productMapping = await getProductTypeByProdIdInternal(PROD_ID);
    const productType = productMapping.PROD_CAT_TY || productMapping.PRODUCT_TYPE || productMapping.PROD_DESC || '';
    
    if (!productType) {
      throw new Error(`Could not determine product type for PROD_ID: ${PROD_ID}`);
    }
    
    const prefix = getPrefixForProductType(productType);
    console.log(`✅ Using prefix: ${prefix} for product type: ${productType}`);

    const counterName = `LOAN_ACCT_${prefix}`;

    const result = await Counter.findOneAndUpdate(
      { _id: counterName },
      { 
        $inc: { seq: 1 },
        $setOnInsert: {
          name: `Loan Account Counter for prefix ${prefix}`,
          description: `Generates loan account numbers starting with ${prefix}`,
          createdAt: new Date(),
          seq: 100000 // Start sequence for loans
        }
      },
      { 
        new: true, 
        upsert: true,
        setDefaultsOnInsert: true,
        session: localSession
      }
    );

    if (!result) {
      throw new Error('Counter update failed');
    }

    console.log(`📊 Loan counter ${counterName} sequence: ${result.seq}`);

    // ✅ FIXED: Proper 10-digit calculation for loans
    // Loans have 3-digit prefix + 7-digit sequence = 10 digits total
    const sequenceNumber = result.seq;
    const sequenceDigits = String(sequenceNumber).padStart(7, '0');
    
    // Take only the last 7 digits to prevent overflow
    const finalSequence = sequenceDigits.slice(-7);
    const accountNumber = `${prefix}${finalSequence}`;

    // ✅ VALIDATION: Must be exactly 10 digits
    if (accountNumber.length !== 10) {
      throw new Error(`Invalid loan account number length: ${accountNumber} (${accountNumber.length} digits)`);
    }

    if (!/^\d{10}$/.test(accountNumber)) {
      throw new Error(`Invalid loan account number format: ${accountNumber}`);
    }

    if (shouldEndSession) {
      await localSession.commitTransaction();
    }

    console.log(`✅ Generated loan account number: ${accountNumber} (from sequence: ${sequenceNumber})`);
    
    return accountNumber;

  } catch (error) {
    if (shouldEndSession && localSession) {
      await localSession.abortTransaction();
    }
    
    console.error('❌ Error in generateLoanAccountNumberByProdId:', error);
    return await generateFallbackLoanAccountNumber(PROD_ID);
  } finally {
    if (shouldEndSession && localSession) {
      await localSession.endSession();
    }
  }
};

// ✅ NEW: Universal account number generator that routes correctly
export const generateAccountNumberByProdId = async (PROD_ID, productType, session = null) => {
  const normalizedType = String(productType).toUpperCase().trim();
  
  if (['SAVINGS', 'TERM_DEPOSIT', 'CURRENT'].includes(normalizedType)) {
    // Deposit accounts: 2000000011, 2000000012, etc.
    return await generateDepositAccountNumber(PROD_ID, session);
  } else if (['INDIVIDUAL_LOAN', 'GROUP_LOAN', 'BUSINESS_TERM_LOAN'].includes(normalizedType)) {
    // Loan accounts: 3010000001, 3100000001, etc.
    return await generateLoanAccountNumberByProdId(PROD_ID, session);
  } else {
    // Default to deposit accounts
    console.log(`⚠️ Unknown product type "${productType}", defaulting to deposit account`);
    return await generateDepositAccountNumber(PROD_ID, session);
  }
};

// ✅ UPDATED: Enhanced debugging with natural sequence analysis
export const debugAccountNumberGeneration = async () => {
  try {
    const counters = await Counter.find({});
    
    console.log('🔍 ACCOUNT NUMBER GENERATION ANALYSIS:');
    
    counters.forEach(counter => {
      console.log(`\n📊 Counter: ${counter._id}`);
      console.log(`   Current sequence: ${counter.seq}`);
      
      if (counter._id === 'DEPOSIT_ACCOUNT_NUMBER') {
        // ✅ UPDATED: Show natural sequence for deposit accounts
        console.log(`   → Current deposit account: 20000000${String(counter.seq).padStart(2, '0')}`);
        console.log(`   → Next 5 deposit accounts:`);
        for (let i = 1; i <= 5; i++) {
          const nextAccount = `20000000${String(counter.seq + i).padStart(2, '0')}`;
          console.log(`      ${nextAccount}`);
        }
      } else if (counter._id.startsWith('LOAN_ACCT_')) {
        // Show what the next loan account number would be
        const prefix = counter._id.replace('LOAN_ACCT_', '');
        const nextSeq = counter.seq + 1;
        const sequenceDigits = String(nextSeq).padStart(7, '0');
        const finalSequence = sequenceDigits.slice(-7);
        const nextAccount = `${prefix}${finalSequence}`;
        console.log(`   → Next loan account: ${nextAccount}`);
        console.log(`   → Calculation: ${prefix} + ${finalSequence} = ${nextAccount}`);
      }
    });
    
    if (counters.length === 0) {
      console.log('   No counters found in database');
      console.log('   Deposit accounts will start from: 2000000011');
      console.log('   Loan accounts will start from: 3010000001, 3100000001, etc.');
    }
    
    return counters;
  } catch (error) {
    console.error('❌ Error debugging account generation:', error);
    return { error: error.message };
  }
};

// ✅ UPDATED: Reset deposit account counter for natural sequence
export const resetDepositAccountCounter = async (startFrom = 11) => {
  try {
    const counterName = 'DEPOSIT_ACCOUNT_NUMBER';
    
    const result = await Counter.findOneAndUpdate(
      { _id: counterName },
      { 
        seq: startFrom,
        name: 'Deposit Account Number Counter',
        description: 'Generates deposit account numbers starting with 20',
        updatedAt: new Date()
      },
      { 
        upsert: true,
        new: true 
      }
    );
    
    const nextNumber = `20000000${String(result.seq + 1).padStart(2, '0')}`;
    console.log(`✅ Reset deposit counter to: ${result.seq}`);
    console.log(`   Current account number: 20000000${String(result.seq).padStart(2, '0')}`);
    console.log(`   Next account number will be: ${nextNumber}`);
    
    return result;
  } catch (error) {
    console.error('❌ Error resetting deposit counter:', error);
    throw error;
  }
};

// ✅ UPDATED: Reset loan account counter
export const resetLoanAccountCounter = async (prefix, startFrom = 100000) => {
  try {
    const counterName = `LOAN_ACCT_${prefix}`;
    
    const result = await Counter.findOneAndUpdate(
      { _id: counterName },
      { 
        seq: startFrom,
        name: `Loan Account Counter for prefix ${prefix}`,
        description: `Generates loan account numbers starting with ${prefix}`,
        updatedAt: new Date()
      },
      { 
        upsert: true,
        new: true 
      }
    );
    
    const nextNumber = `${prefix}${String(result.seq + 1).padStart(7, '0')}`;
    console.log(`✅ Reset loan counter ${counterName} to: ${result.seq}`);
    console.log(`   Next loan account will be: ${nextNumber}`);
    
    return result;
  } catch (error) {
    console.error('❌ Error resetting loan counter:', error);
    throw error;
  }
};

// ✅ Fallback account number generator
export const generateFallbackLoanAccountNumber = async (PROD_ID) => {
  try {
    const productMapping = await getProductTypeByProdIdInternal(PROD_ID);
    const productType = productMapping.PROD_CAT_TY || productMapping.PRODUCT_TYPE || productMapping.PROD_DESC || 'GENERAL_LOAN';
    const prefix = getPrefixForProductType(productType);
    
    const timestamp = Date.now().toString();
    const uniqueSuffix = timestamp.slice(-7);
    const accountNumber = `${prefix}${uniqueSuffix}`;
    
    console.log(`🔄 Generated fallback loan account number: ${accountNumber}`);
    
    return accountNumber;
  } catch (fallbackError) {
    console.error('❌ Fallback generation failed:', fallbackError);
    const ultimateFallback = `301${Date.now().toString().slice(-7)}`;
    console.log(`🚨 Using ultimate fallback: ${ultimateFallback}`);
    return ultimateFallback;
  }
};

// ✅ Fallback account number (timestamp-based, guaranteed 10-digit string)
export const generateAccountNumber = () => {
  const now = Date.now().toString();
  return now.slice(-10).padStart(10, '0');
};

// ✅ Generate unique 13-digit transaction ID (with session check)
export const generateTransactionId = async (session) => {
  let TRANSACTION_ID = generateSerialNumber(13);

  while (await Transaction.findOne({ TRANSACTION_ID }).session(session)) {
    TRANSACTION_ID = generateSerialNumber(13);
  }

  return TRANSACTION_ID;
};

// Export all functions
export default {
  getPrefixForProductType,
  generateLoanAccountNumberByProdId,
  generateDepositAccountNumber,
  generateAccountNumberByProdId,
  generateAccountNumber,
  generateTransactionId,
  debugAccountNumberGeneration,
  resetLoanAccountCounter,
  resetDepositAccountCounter,
  generateFallbackLoanAccountNumber
};