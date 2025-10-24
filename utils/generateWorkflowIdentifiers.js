import mongoose from 'mongoose';
import Workflow from '../models/WF_WORK_ITEM.js';
import { generateNumber } from '../utils/generateNumber.js';

// Define Sequence schema - Use targetCollection to match your database index
const SequenceSchema = new mongoose.Schema({
  targetCollection: { 
    type: String, 
    required: true, 
    unique: true,
    default: 'default'
  },
  value: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const Sequence = mongoose.model('Sequence', SequenceSchema, 'sequences');

// Helper to generate a random number with 8 to 12 digits
const generateRandomDigits = (minDigits = 8, maxDigits = 12) => {
  try {
    const digits = generateNumber(maxDigits);
    const value = parseInt(digits.toString().substring(0, maxDigits));
    
    const min = Math.pow(10, minDigits - 1);
    const max = Math.pow(10, maxDigits) - 1;
    
    if (!value || typeof value !== 'number' || value < min || value > max) {
      throw new Error(`Invalid random digits generated: ${value}`);
    }
    return value.toString();
  } catch (error) {
    console.error('generateRandomDigits error:', error.message);
    throw new Error(`Failed to generate random digits: ${error.message}`);
  }
};

// Helper function to generate random numbers (if not imported properly)
const generateLocalNumber = (length) => {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += Math.floor(Math.random() * 10);
  }
  return result;
};

// Simple version of generateRandomDigits as fallback
const generateSimpleRandomDigits = () => {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
};

export async function generateWorkflowIdentifiers(session = null) {
  console.log('generateWorkflowIdentifiers: Using timestamp-based identifier generation');
  
  const timestamp = Date.now();
  const randomSuffix = Math.floor(100000 + Math.random() * 900000);
  
  // Use local fallback if imported generateNumber fails
  let numberGenerator;
  try {
    // Test if the imported generateNumber works
    const testNumber = generateNumber(1);
    if (testNumber && typeof testNumber === 'string') {
      numberGenerator = generateNumber;
    } else {
      throw new Error('Imported generateNumber not working');
    }
  } catch (error) {
    console.log('Using local number generator as fallback');
    numberGenerator = generateLocalNumber;
  }
  
  // Generate IDs based on timestamp and random numbers
  const TRANSACTION_ID = parseInt(`${timestamp}${randomSuffix}`.substring(5, 15));
  const WORK_ITEM_ID = parseInt(`${timestamp}${randomSuffix + 1}`.substring(5, 15));
  const EVENT_ID = parseInt(`${timestamp}${randomSuffix + 2}`.substring(5, 15));
  
  // Generate other IDs with proper error handling
  let glInterestPaymentTxnId, glSettlementTxnId, customerInterestPaymentTxnId, customerSettlementTxnId;
  
  try {
    glInterestPaymentTxnId = generateRandomDigits();
    glSettlementTxnId = generateRandomDigits();
    customerInterestPaymentTxnId = generateRandomDigits();
    customerSettlementTxnId = generateRandomDigits();
  } catch (error) {
    console.log('Using simple random digits as fallback');
    glInterestPaymentTxnId = generateSimpleRandomDigits();
    glSettlementTxnId = generateSimpleRandomDigits();
    customerInterestPaymentTxnId = generateSimpleRandomDigits();
    customerSettlementTxnId = generateSimpleRandomDigits();
  }
  
  const identifiers = {
    TRANSACTION_ID,
    WORK_ITEM_ID,
    EVENT_ID,
    TRAN_JOURNAL_ID: `JRN${timestamp}${randomSuffix}`.substring(0, 18),
    WORKFLOW_ID: `WF${timestamp}${randomSuffix}`.substring(0, 20),
    BUS_PROC_ID: 1000 + Math.floor(Math.random() * 9000),
    SUB_PROC_ID: 1000 + Math.floor(Math.random() * 9000),
    QUEUE_ID: 1000 + Math.floor(Math.random() * 9000),
    JOURNAL_ID: numberGenerator(16),
    glInterestPaymentTxnId,
    glSettlementTxnId,
    customerInterestPaymentTxnId,
    customerSettlementTxnId
  };

  console.log('generateWorkflowIdentifiers: Generated timestamp-based identifiers:', identifiers);
  return identifiers;
}

// Export the function as default
export default generateWorkflowIdentifiers;