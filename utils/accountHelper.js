// utils/accountHelper.js
import retry from "async-retry";
import Counter from "../models/Counter.js";

const USE_NUBAN = true;
const ACCOUNT_ID_LENGTH = 6;

// Numeric prefixes for NUBAN (first digit)
const PREFIX_MAP = {
  SAVINGS: "2",
  CURRENT: "3", 
  LOAN: "1",
  TERM_DEPOSIT: "1",
  CREDIT_CARD: "1",
};

// Counter name mapping
const COUNTER_MAP = {
  SAVINGS: 'savingsAccount',
  LOAN: 'loanAccount', 
  TERM_DEPOSIT: 'termDepositAccount',
  CREDIT_CARD: 'creditCardAccount'
};

// 🔢 Calculate NUBAN Check Digit (Nigerian banking standard)
const calculateNUBANCheckDigit = (baseNumber) => {
  const weights = [3, 7, 3, 3, 7, 3, 3, 7, 3];
  let sum = 0;
  
  for (let i = 0; i < baseNumber.length; i++) {
    sum += parseInt(baseNumber[i]) * weights[i];
  }
  
  const mod = sum % 10;
  return mod === 0 ? "0" : String(10 - mod);
};

// 🔢 Generate Account Identifiers (ACCT_NO + ACCT_ID)
export const generateAccountIdentifiersFromCounter = async (productType) => {
  return retry(
    async () => {
      try {
        console.log(`🔄 Generating account identifiers for: ${productType}`);
        
        // Determine counter name based on product type
        const counterName = COUNTER_MAP[productType.toUpperCase()] || 'savingsAccount';
        console.log(`📊 Using counter: ${counterName}`);
        
        // Get numeric prefix for NUBAN
        const numericPrefix = PREFIX_MAP[productType.toUpperCase()] || "2"; // default savings
        console.log(`🔢 Using NUBAN prefix: ${numericPrefix}`);
        
        // Get sequence number using the Counter model method
        const sequence = await Counter.generateNUBANSequence(productType.toUpperCase());
        console.log(`🔢 Sequence number: ${sequence}`);

        let accountNumber;
        
        if (USE_NUBAN) {
          // Generate NUBAN-compliant account number
          const sequencePadded = String(sequence).padStart(8, "0");
          const baseNumber = `${numericPrefix}${sequencePadded}`; // 9 digits (prefix + 8 seq)
          const checkDigit = calculateNUBANCheckDigit(baseNumber);
          accountNumber = `${baseNumber}${checkDigit}`; // final 10 digits
        } else {
          // Simple sequential numbering
          accountNumber = String(sequence).padStart(10, '0');
        }

        // Validate account number format
        if (!/^\d{10}$/.test(accountNumber)) {
          throw new Error(`Generated ACCT_NO ${accountNumber} is not 10 digits`);
        }

        // Generate account ID (6 digits)
        const accountId = String(sequence).padStart(ACCOUNT_ID_LENGTH, "0");

        console.log(`✅ Generated identifiers - ACCT_NO: ${accountNumber}, ACCT_ID: ${accountId}`);

        return {
          ACCT_NO: accountNumber,
          ACCT_ID: accountId,
          sequence: sequence
        };
        
      } catch (error) {
        console.error('❌ Error in generateAccountIdentifiersFromCounter:', error);
        throw error; // Let retry handle it
      }
    },
    { 
      retries: 3,
      onRetry: (error, attempt) => {
        console.log(`🔄 Retry attempt ${attempt} for account generation:`, error.message);
      }
    }
  );
};

// Fallback function for emergency use
export const generateFallbackAccountIdentifiers = (productType) => {
  console.log('🔄 Using fallback account generation');
  
  const numericPrefix = PREFIX_MAP[productType.toUpperCase()] || "2";
  const randomSeq = Math.floor(Math.random() * 900000) + 100000; // 6-digit random
  
  let accountNumber;
  if (USE_NUBAN) {
    const sequencePadded = String(randomSeq).padStart(8, "0");
    const baseNumber = `${numericPrefix}${sequencePadded}`;
    const checkDigit = calculateNUBANCheckDigit(baseNumber);
    accountNumber = `${baseNumber}${checkDigit}`;
  } else {
    accountNumber = String(randomSeq).padStart(10, '0');
  }
  
  const accountId = String(randomSeq).padStart(6, "0");
  
  return {
    ACCT_NO: accountNumber,
    ACCT_ID: accountId
  };
};

// Initialize counters on startup
export const initializeCounters = async () => {
  try {
    const counters = [
      { _id: 'savingsAccount', description: 'Savings account sequence' },
      { _id: 'loanAccount', description: 'Loan account sequence' },
      { _id: 'termDepositAccount', description: 'Term deposit account sequence' },
      { _id: 'creditCardAccount', description: 'Credit card account sequence' }
    ];

    for (const counterData of counters) {
      await Counter.findOneAndUpdate(
        { _id: counterData._id },
        { ...counterData },
        { upsert: true }
      );
    }
    
    console.log('✅ Counters initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing counters:', error);
  }
};