// utils/generateWorkflowIdentifiers.js - Sequelize Version
import Transaction from '../models/Transaction.js'; // Import Sequelize Transaction model

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
export async function generateWorkflowIdentifiers(transaction = null) {
  console.log('generateWorkflowIdentifiers: Generating workflow identifiers');
  
  const timestamp = Date.now();
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  
  try {
    // DIRECT DATABASE APPROACH - Find the highest TRANSACTION_ID and increment
    // Get the highest existing TRANSACTION_ID using Sequelize
    const lastTransaction = await Transaction.findOne({
      order: [['TRANSACTION_ID', 'DESC']],
      attributes: ['TRANSACTION_ID'],
      transaction
    });
    
    let nextTransactionId = 1;
    if (lastTransaction && lastTransaction.TRANSACTION_ID) {
      const lastId = parseInt(lastTransaction.TRANSACTION_ID);
      nextTransactionId = isNaN(lastId) ? 1 : lastId + 1;
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
export const generateTransactionReference = async (transaction = null) => {
  try {
    const identifiers = await generateWorkflowIdentifiers(transaction);
    return `TXN${identifiers.TRANSACTION_ID.toString().padStart(10, '0')}`;
  } catch (error) {
    // Fallback
    return `TXN${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
  }
};

// Alternative: Generate using a counter table approach
export const generateWorkflowIdentifiersWithCounter = async (transaction = null) => {
  try {
    // Import Counter model
    const Counter = (await import('../models/Counter.js')).default;
    
    // Use a counter for workflow IDs
    const [counter, created] = await Counter.findOrCreate({
      where: { _id: 'WORKFLOW_ID_COUNTER' },
      defaults: { seq: 1 },
      transaction
    });
    
    if (!created) {
      await Counter.increment('seq', {
        where: { _id: 'WORKFLOW_ID_COUNTER' },
        by: 1,
        transaction
      });
      
      const updatedCounter = await Counter.findOne({
        where: { _id: 'WORKFLOW_ID_COUNTER' },
        transaction
      });
      
      counter.seq = updatedCounter.seq;
    }
    
    const baseId = counter.seq;
    const timestamp = Date.now();
    
    return {
      TRANSACTION_ID: baseId,
      WORK_ITEM_ID: baseId,
      EVENT_ID: baseId,
      TRAN_JOURNAL_ID: `JRN${timestamp}${baseId}`.substring(0, 18),
      WORKFLOW_ID: `WF${timestamp}${baseId}`.substring(0, 20),
      BUS_PROC_ID: 1000 + Math.floor(Math.random() * 9000),
      SUB_PROC_ID: 1000 + Math.floor(Math.random() * 9000),
      QUEUE_ID: 1000 + Math.floor(Math.random() * 9000),
      JOURNAL_ID: `${timestamp}${baseId}`.padEnd(16, '0').substring(0, 16),
      glInterestPaymentTxnId: generateRandomDigits(),
      glSettlementTxnId: generateRandomDigits(),
      customerInterestPaymentTxnId: generateRandomDigits(),
      customerSettlementTxnId: generateRandomDigits(),
      timestamp: new Date().toISOString(),
      isCounterBased: true
    };
    
  } catch (error) {
    console.error('Counter-based generation failed:', error);
    return generateWorkflowIdentifiers(transaction);
  }
};

// Batch generation for multiple identifiers
export const generateBatchWorkflowIdentifiers = async (count = 10, transaction = null) => {
  const identifiers = [];
  
  for (let i = 0; i < count; i++) {
    try {
      const id = await generateWorkflowIdentifiers(transaction);
      identifiers.push(id);
    } catch (error) {
      console.error(`Failed to generate identifier ${i + 1}:`, error);
      // Use fallback for this item
      identifiers.push(generateFallbackWorkflowIdentifiers());
    }
  }
  
  return identifiers;
};

// Validate identifier format
export const validateWorkflowIdentifier = (identifier) => {
  const validations = {
    TRANSACTION_ID: id => !isNaN(id) && id > 0,
    WORK_ITEM_ID: id => !isNaN(id) && id > 0,
    EVENT_ID: id => !isNaN(id) && id > 0,
    TRAN_JOURNAL_ID: id => typeof id === 'string' && id.length <= 18,
    WORKFLOW_ID: id => typeof id === 'string' && id.length <= 20,
    JOURNAL_ID: id => typeof id === 'string' && id.length === 16
  };
  
  const errors = [];
  
  for (const [key, validator] of Object.entries(validations)) {
    if (identifier[key] !== undefined && !validator(identifier[key])) {
      errors.push(`${key} is invalid: ${identifier[key]}`);
    }
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// Test function for identifier generation
export const testWorkflowIdentifierGeneration = async (iterations = 5) => {
  console.log('🧪 Testing Workflow Identifier Generation');
  console.log('='.repeat(50));
  
  const results = [];
  
  for (let i = 0; i < iterations; i++) {
    try {
      console.log(`Test ${i + 1}/${iterations}:`);
      
      // Test main function
      const identifiers = await generateWorkflowIdentifiers();
      console.log(`  Main function: TRANSACTION_ID = ${identifiers.TRANSACTION_ID}`);
      
      // Validate
      const validation = validateWorkflowIdentifier(identifiers);
      
      results.push({
        testNumber: i + 1,
        success: true,
        identifiers,
        validation
      });
      
      if (!validation.isValid) {
        console.log(`  ⚠️ Validation errors:`, validation.errors);
      }
      
      // Test transaction reference
      const reference = await generateTransactionReference();
      console.log(`  Transaction Reference: ${reference}`);
      
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
      results.push({
        testNumber: i + 1,
        success: false,
        error: error.message
      });
    }
    
    // Small delay between tests
    if (i < iterations - 1) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  console.log(`\n📊 Test Results: ${successCount}/${iterations} successful`);
  
  return {
    total: iterations,
    successful: successCount,
    successRate: (successCount / iterations) * 100,
    results
  };
};

// Export individual functions
export { generateRandomDigits };

// Export the function as default
export default generateWorkflowIdentifiers;