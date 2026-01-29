// middleware/asyncHandler.js - ESM-Compatible Async Error Handler for Express

/**
 * Async handler wrapper for Express routes.
 * Catches errors in async functions and passes them to Express error middleware.
 * 
 * @param {Function} fn - The async function to wrap.
 * @returns {Function} - Wrapped function that handles errors.
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Also export as default for convenience
export default asyncHandler;