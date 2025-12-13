// utils/generateWorkflowIdentifiers.js - FIXED VERSION
import mongoose from 'mongoose';

// Helper to generate a random number with 8 to 12 digits
const generateRandomDigits = (minDigits = 8, maxDigits = 12) => {
  try {
    const min = Math.pow(10, minDigits - 1);
    const max = Math.pow(10, maxDigits) - 1;
    const value = Math.floor(min + Math.random() * (max - min + 1));
    
    if (!value || typeof value !== 'number' || value < min || value > max) {
      throw new Error(`Invalid random digits generated: ${value}`);
    }
    return value.toString();
  } catch (error) {
    console.error('generateRandomDigits error:', error.message);
    // Fallback
    return Math.floor(1000000000 + Math.random() * 9000000000).toString();
  }
};

// SIMPLIFIED VERSION - Use database to get next transaction ID
export async function generateWorkflowIdentifiers(session = null) {
  console.log('generateWorkflowIdentifiers: Generating workflow identifiers');
  
  const timestamp = Date.now();
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  
  try {
    // DIRECT DATABASE APPROACH - Find the highest TRANSACTION_ID and increment
    const Transaction = mongoose.model('Transaction');
    
    // Get the highest existing TRANSACTION_ID
    const lastTransaction = await Transaction.findOne({})
      .sort({ TRANSACTION_ID: -1 })
      .select('TRANSACTION_ID')
      .lean();
    
    let nextTransactionId = 1;
    if (lastTransaction && lastTransaction.TRANSACTION_ID) {
      nextTransactionId = Number(lastTransaction.TRANSACTION_ID) + 1;
      console.log(`Found last TRANSACTION_ID: ${lastTransaction.TRANSACTION_ID}, next: ${nextTransactionId}`);
    } else {
      console.log('No existing transactions found, starting from 1');
    }
    
    const TRANSACTION_ID = nextTransactionId;
    const WORK_ITEM_ID = nextTransactionId;
    const EVENT_ID = nextTransactionId;

    // Generate other IDs
    const glInterestPaymentTxnId = generateRandomDigits();
    const glSettlementTxnId = generateRandomDigits();
    const customerInterestPaymentTxnId = generateRandomDigits();
    const customerSettlementTxnId = generateRandomDigits();
    
    const identifiers = {
      TRANSACTION_ID,
      WORK_ITEM_ID,
      EVENT_ID,
      TRAN_JOURNAL_ID: `JRN${timestamp}${randomSuffix}`.substring(0, 18),
      WORKFLOW_ID: `WF${timestamp}${randomSuffix}`.substring(0, 20),
      BUS_PROC_ID: 1000 + Math.floor(Math.random() * 9000),
      SUB_PROC_ID: 1000 + Math.floor(Math.random() * 9000),
      QUEUE_ID: 1000 + Math.floor(Math.random() * 9000),
      JOURNAL_ID: generateRandomDigits(16, 16),
      glInterestPaymentTxnId,
      glSettlementTxnId,
      customerInterestPaymentTxnId,
      customerSettlementTxnId,
      timestamp: new Date().toISOString()
    };

    console.log('generateWorkflowIdentifiers: Generated identifiers:', identifiers);
    return identifiers;

  } catch (error) {
    console.error('Error in generateWorkflowIdentifiers, using fallback:', error);
    
    // Fallback: generate timestamp-based identifiers
    return generateFallbackWorkflowIdentifiers();
  }
}

// Fallback function without database dependency
function generateFallbackWorkflowIdentifiers() {
  const timestamp = Date.now();
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  const microtime = process.hrtime?.bigint?.()?.toString()?.slice(-6) || '000000';
  
  // Use timestamp for unique IDs
  const TRANSACTION_ID = parseInt(`${timestamp}${randomSuffix}`.substring(0, 10));
  const WORK_ITEM_ID = parseInt(`${timestamp}${randomSuffix + 1}`.substring(0, 10));
  const EVENT_ID = parseInt(`${timestamp}${randomSuffix + 2}`.substring(0, 10));
  
  const identifiers = {
    TRANSACTION_ID,
    WORK_ITEM_ID,
    EVENT_ID,
    TRAN_JOURNAL_ID: `JRN${timestamp}${microtime}`.substring(0, 18),
    WORKFLOW_ID: `WF${timestamp}${microtime}`.substring(0, 20),
    BUS_PROC_ID: 1000 + Math.floor(Math.random() * 9000),
    SUB_PROC_ID: 1000 + Math.floor(Math.random() * 9000),
    QUEUE_ID: 1000 + Math.floor(Math.random() * 9000),
    JOURNAL_ID: `${timestamp}${microtime}`.padEnd(16, '0').substring(0, 16),
    glInterestPaymentTxnId: generateRandomDigits(),
    glSettlementTxnId: generateRandomDigits(),
    customerInterestPaymentTxnId: generateRandomDigits(),
    customerSettlementTxnId: generateRandomDigits(),
    timestamp: new Date().toISOString(),
    isFallback: true
  };

  console.log('generateWorkflowIdentifiers: Generated fallback identifiers:', identifiers);
  return identifiers;
}

// Simple version for transaction references only
export const generateTransactionReference = async (session = null) => {
  try {
    const identifiers = await generateWorkflowIdentifiers(session);
    return `TXN${identifiers.TRANSACTION_ID.toString().padStart(10, '0')}`;
  } catch (error) {
    // Fallback
    return `TXN${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  }
};

// Export individual functions
export { generateRandomDigits };

// Export the function as default
export default generateWorkflowIdentifiers;