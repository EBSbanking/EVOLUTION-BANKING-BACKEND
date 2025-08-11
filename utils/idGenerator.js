// utils/idGenerator.js

/**
 * Generates a secure random ID with optional prefix
 * @param {string} prefix - Prefix for the ID (default: '')
 * @param {number} length - Length of the random part (default: 8)
 * @returns {string} Generated secure ID
 */
export const generateSecureId = (prefix = '', length = 8) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = prefix;
  
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  return result;
};

/**
 * Generates a secure random number string
 * @param {number} length - Length of the number (default: 8)
 * @returns {string} Generated numeric string
 */
export const generateSecureNumericId = (length = 8) => {
  const numbers = '0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    result += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  
  return result;
};

/**
 * Generate numeric workflow item ID
 * @returns {number} Random 8-digit number
 */
export const generateNumericWorkflowId = () => {
  const min = 10000000;
  const max = 99999999;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Generate configurable-length numeric transaction ID for bank systems
 * @param {number} [digits=16] - Number of digits (12-20)
 * @returns {number} Random n-digit number
 */
export const generateBankTransactionId = (digits = 16) => {
  const validatedDigits = Math.min(Math.max(digits, 12), 20);
  const min = Math.pow(10, validatedDigits - 1);
  const max = Math.pow(10, validatedDigits) - 1;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// ID Generator methods
export const IdGenerator = {
  /**
   * Generate transaction ID for bank systems
   * @param {number} [digits=16] - Number of digits (12-20, defaults to 16)
   * @returns {number} Random n-digit transaction ID
   */
  transactionId: (digits = 16) => generateBankTransactionId(digits),
  
  /**
   * Generate event ID
   * @returns {string} EV-{random 8 chars}
   */
  eventId: () => generateSecureId( 8),
  
  /**
   * Generate journal ID
   * @returns {string} JN-{random 10 chars}
   */
  journalId: () => generateSecureId( 10),
  
  /**
   * Generate workflow item ID (numeric version)
   * @returns {number} Random 8-digit number
   */
  workflowItemId: () => generateNumericWorkflowId(),
  
  /**
   * Generate workflow item ID (string version - kept for backward compatibility)
   * @returns {string} WI-{random 6 chars}
   */
  workflowItemIdString: () => generateSecureId( 6),
  
  /**
   * Generate long numeric reference ID (backward compatible alias)
   * @returns {number} 16-digit number (default)
   */
  referenceId: () => generateBankTransactionId(16)
};

export default {
  generateSecureId,
  generateSecureNumericId,
  generateNumericWorkflowId,
  generateBankTransactionId,
  IdGenerator
};