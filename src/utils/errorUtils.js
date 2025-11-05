// utils/errorUtils.js

// Standard error codes
export const ERROR_CODES = {
  // Validation errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_REQUIRED_FIELDS: 'MISSING_REQUIRED_FIELDS',
  INVALID_FORMAT: 'INVALID_FORMAT',
  
  // Business logic errors
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  WORK_ITEM_NOT_FOUND: 'WORK_ITEM_NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  OPERATION_NOT_ALLOWED: 'OPERATION_NOT_ALLOWED',
  
  // Authentication/Authorization errors
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  
  // System errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR'
};

/**
 * Creates a standardized error object
 * @param {string} code - Error code from ERROR_CODES
 * @param {string} message - Human-readable error message
 * @param {object} details - Additional error details
 * @returns {Error} Custom error object
 */
export function createError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.details = details;
  error.timestamp = new Date().toISOString();
  return error;
}

/**
 * Gets user-friendly error message
 * @param {Error} error - Error object
 * @param {string} context - Additional context for the error
 * @returns {string} Formatted error message
 */
export function getErrorMessage(error, context = '') {
  if (!error) return 'An unknown error occurred';
  
  if (error.code) {
    switch(error.code) {
      case ERROR_CODES.MISSING_REQUIRED_FIELDS:
        return `Required fields missing: ${error.message}`;
      case ERROR_CODES.INSUFFICIENT_FUNDS:
        return `Insufficient funds in account ${context}`;
      case ERROR_CODES.WORK_ITEM_NOT_FOUND:
        return error.message || 'The requested work item was not found';
      case ERROR_CODES.RESOURCE_NOT_FOUND:
        return error.message || 'The requested resource was not found';
      case ERROR_CODES.INVALID_CREDENTIALS:
        return 'Invalid login credentials';
      case ERROR_CODES.UNAUTHORIZED:
        return 'Authentication required';
      case ERROR_CODES.FORBIDDEN:
        return 'You are not authorized to perform this action';
      // Add other specific error cases as needed
      default:
        return error.message || 'An unexpected error occurred';
    }
  }
  return error.message || 'An unexpected error occurred';
}

/**
 * Checks if error is a client error (4xx)
 * @param {Error} error 
 * @returns {boolean}
 */
export function isClientError(error) {
  if (!error?.code) return false;
  
  const clientErrorCodes = [
    ERROR_CODES.VALIDATION_ERROR,
    ERROR_CODES.MISSING_REQUIRED_FIELDS,
    ERROR_CODES.INVALID_FORMAT,
    ERROR_CODES.INSUFFICIENT_FUNDS,
    ERROR_CODES.WORK_ITEM_NOT_FOUND,
    ERROR_CODES.RESOURCE_NOT_FOUND,
    ERROR_CODES.UNAUTHORIZED,
    ERROR_CODES.FORBIDDEN,
    ERROR_CODES.INVALID_CREDENTIALS,
    ERROR_CODES.OPERATION_NOT_ALLOWED
  ];
  
  return clientErrorCodes.includes(error.code);
}

/**
 * Formats error for API response
 * @param {Error} error 
 * @returns {object} Standardized error response
 */
export function formatErrorResponse(error) {
  return {
    success: false,
    error: {
      code: error.code || ERROR_CODES.INTERNAL_SERVER_ERROR,
      message: getErrorMessage(error),
      ...(error.details && { details: error.details }),
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    }
  };
}

export default {
  ERROR_CODES,
  createError,
  getErrorMessage,
  isClientError,
  formatErrorResponse
};