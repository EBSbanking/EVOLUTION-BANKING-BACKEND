// utils/accountHelper.js - UPDATED & FIXED VERSION
import retry from "async-retry";
import Counter from "../models/Counter.js";

// Simple 10-digit account number system
// Format: Prefix (2 digits) + Sequence (8 digits)
// Prefixes based on your requirements:
// - Savings: 20xxxxxxx
// - Loan: 30xxxxxxx
// - Current: 31xxxxxxx (different from loan)
// - Deposit: 40xxxxxxx

const SIMPLE_ACCOUNT_PREFIXES = {
  LOAN: "30",         // Loan accounts start with 30 (as you specified)
  SAVINGS: "20",      // Savings: 20 + 8 digits
  CURRENT: "31",      // Current: 31 + 8 digits (distinct from loan)
  DEPOSIT: "40",      // Deposit: 40 + 8 digits
  TERM_DEPOSIT: "41",
  FIXED_DEPOSIT: "42",
  INVESTMENT: "50",
  CORPORATE: "70"
};

// ============================================
// CORE ACCOUNT NUMBER GENERATOR
// ============================================

/**
 * Generate a 10-digit account number using Counter.getNextSequence
 * Relies on Counter model having getNextSequence static method
 */
export const generateAccountNumber = async (accountType = 'SAVINGS') => {
  return retry(
    async () => {
      try {
        console.log(`🔢 Generating ${accountType} account number`);

        const prefix = SIMPLE_ACCOUNT_PREFIXES[accountType.toUpperCase()] || "20";
        const counterName = `${accountType.toLowerCase()}Account`; // e.g., 'savingsAccount'

        // This will increment and return the next sequence
        const sequence = await Counter.getNextSequence(counterName);

        const sequencePadded = sequence.toString().padStart(8, '0');
        const accountNumber = `${prefix}${sequencePadded}`;

        console.log(`✅ Generated ${accountType} account: ${accountNumber} (seq: ${sequence})`);
        return accountNumber;

      } catch (error) {
        console.error(`❌ Error generating ${accountType} account:`, error.message);
        throw error; // Let retry handle it
      }
    },
    {
      retries: 5,
      factor: 2,
      minTimeout: 500,
      maxTimeout: 3000,
      onRetry: (error, attempt) => {
        console.warn(`🔄 Retry ${attempt}/5 for ${accountType} account generation: ${error.message}`);
      }
    }
  );
};

// Convenience functions
export const generateLoanAccountNumber = async () => generateAccountNumber('LOAN');
export const generateSavingsAccountNumber = async () => generateAccountNumber('SAVINGS');
export const generateCurrentAccountNumber = async () => generateAccountNumber('CURRENT');
export const generateDepositAccountNumber = async () => generateAccountNumber('DEPOSIT');

// ============================================
// EMERGENCY FALLBACK (if counter fails)
// ============================================

export const generateEmergencyAccountNumber = (accountType = 'SAVINGS') => {
  console.warn(`⚠️ Using emergency generator for ${accountType}`);

  const prefix = SIMPLE_ACCOUNT_PREFIXES[accountType.toUpperCase()] || "20";
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(Math.random() * 100).toString().padStart(2, '0');

  let accountNumber = `${prefix}${timestamp}${random}`;
  accountNumber = accountNumber.slice(0, 10); // Ensure 10 digits

  console.warn(`⚠️ Emergency account generated: ${accountNumber}`);
  return accountNumber;
};

// ============================================
// UNIQUENESS CHECK (optional extra safety)
// ============================================

export const isAccountNumberUnique = async (accountNumber, Model) => {
  try {
    const existing = await Model.findOne({
      $or: [
        { ACCT_NO: accountNumber },
        { account_number: accountNumber },
        { accountNumber: accountNumber }
      ]
    }).lean();

    return !existing;
  } catch (error) {
    console.error('Uniqueness check failed:', error);
    return false;
  }
};

// ============================================
// GUARANTEED UNIQUE GENERATOR (recommended for production)
// ============================================

export const generateUniqueAccountNumber = async (Model, accountType = 'SAVINGS', maxAttempts = 10) => {
  console.log(`🏦 Generating unique ${accountType} account (up to ${maxAttempts} attempts)`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const accountNumber = await generateAccountNumber(accountType);

      const unique = await isAccountNumberUnique(accountNumber, Model);
      if (unique) {
        console.log(`🎉 Unique ${accountType} account generated: ${accountNumber}`);
        return accountNumber;
      }

      console.warn(`Attempt ${attempt}: ${accountNumber} already exists, retrying...`);
    } catch (error) {
      console.warn(`Attempt ${attempt} failed: ${error.message}`);
    }

    // Small delay to avoid thundering herd
    if (attempt < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  }

  // Final fallback
  const emergency = generateEmergencyAccountNumber(accountType);
  console.warn(`⚠️ All attempts failed, using emergency: ${emergency}`);
  return emergency;
};

// Specific wrappers
export const generateUniqueSavingsAccountNumber = async (Model) => 
  generateUniqueAccountNumber(Model, 'SAVINGS');

export const generateUniqueLoanAccountNumber = async (Model) => 
  generateUniqueAccountNumber(Model, 'LOAN');

export const generateUniqueCurrentAccountNumber = async (Model) => 
  generateUniqueAccountNumber(Model, 'CURRENT');

// ============================================
// COUNTER INITIALIZATION (run once at startup)
// ============================================

export const initializeCounters = async () => {
  try {
    const counters = [
      { _id: 'savingsAccount', seq: 80 },        // Continues from your existing 2000000080
      { _id: 'loanAccount', seq: 10000000 },
      { _id: 'currentAccount', seq: 10000000 },
      { _id: 'depositAccount', seq: 10000000 }
    ];

    for (const { _id, seq } of counters) {
      await Counter.findOneAndUpdate(
        { _id },
        { $setOnInsert: { seq } },
        { upsert: true }
      );
    }

    console.log('✅ Account counters initialized/verified');
  } catch (error) {
    console.error('❌ Failed to initialize counters:', error);
    throw error;
  }
};

// ============================================
// UTILITIES
// ============================================

export const getAccountTypeFromNumber = (accountNumber) => {
  if (!accountNumber || accountNumber.length < 2) return 'UNKNOWN';

  const prefix = accountNumber.toString().slice(0, 2);
  for (const [type, p] of Object.entries(SIMPLE_ACCOUNT_PREFIXES)) {
    if (p === prefix) return type;
  }
  return 'UNKNOWN';
};

export const validateAccountNumber = (accountNumber) => {
  const str = accountNumber.toString();
  if (str.length !== 10) return false;
  if (!/^\d{10}$/.test(str)) return false;

  const prefix = str.slice(0, 2);
  return Object.values(SIMPLE_ACCOUNT_PREFIXES).includes(prefix);
};

// Legacy compatibility (if still needed elsewhere)
export const generateAccountIdentifiersFromCounter = async (productType = 'SAVINGS') => {
  let accountType = 'SAVINGS';
  const upper = productType.toUpperCase();

  if (upper.includes('LOAN')) accountType = 'LOAN';
  else if (upper.includes('CURRENT')) accountType = 'CURRENT';
  else if (upper.includes('DEPOSIT')) accountType = 'DEPOSIT';

  const ACCT_NO = await generateAccountNumber(accountType);
  return {
    ACCT_NO,
    ACCT_ID: ACCT_NO.slice(-6),
    sequence: parseInt(ACCT_NO.slice(-8), 10)
  };
};
