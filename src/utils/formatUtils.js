import Decimal from 'decimal.js';

/**
 * Converts a value to a Decimal.js instance for precise decimal arithmetic.
 * Returns null if the value is undefined or cannot be parsed.
 * @param {*} value - The input value (number, string, etc.)
 * @returns {Decimal|null}
 */
export function toDecimal(value) {
  if (value === undefined || value === null) return null;

  try {
    // Try to convert to Decimal
    const decimalValue = new Decimal(value);
    
    // Validate it's a number
    if (decimalValue.isNaN()) {
      console.warn('Invalid decimal value:', value);
      return null;
    }
    
    return decimalValue;
  } catch (err) {
    console.error('Failed to convert to Decimal:', value, err.message);
    return null;
  }
}

/**
 * Formats a decimal value to a string with 2 decimal places
 * @param {Decimal|number|string} value - The decimal value
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string}
 */
export function formatDecimal(value, decimals = 2) {
  if (!value) return '0.00';
  
  try {
    const decimalValue = value instanceof Decimal ? value : new Decimal(value);
    return decimalValue.toFixed(decimals);
  } catch (err) {
    console.error('Failed to format decimal:', value);
    return '0.00';
  }
}

/**
 * Adds two decimal values safely
 * @param {*} a - First value
 * @param {*} b - Second value
 * @returns {Decimal|null}
 */
export function addDecimals(a, b) {
  try {
    const decA = toDecimal(a);
    const decB = toDecimal(b);
    
    if (!decA || !decB) return null;
    
    return decA.plus(decB);
  } catch (err) {
    console.error('Failed to add decimals:', a, b, err.message);
    return null;
  }
}

/**
 * Subtracts two decimal values safely
 * @param {*} a - First value (minuend)
 * @param {*} b - Second value (subtrahend)
 * @returns {Decimal|null}
 */
export function subtractDecimals(a, b) {
  try {
    const decA = toDecimal(a);
    const decB = toDecimal(b);
    
    if (!decA || !decB) return null;
    
    return decA.minus(decB);
  } catch (err) {
    console.error('Failed to subtract decimals:', a, b, err.message);
    return null;
  }
}

/**
 * Multiplies two decimal values safely
 * @param {*} a - First value
 * @param {*} b - Second value
 * @returns {Decimal|null}
 */
export function multiplyDecimals(a, b) {
  try {
    const decA = toDecimal(a);
    const decB = toDecimal(b);
    
    if (!decA || !decB) return null;
    
    return decA.times(decB);
  } catch (err) {
    console.error('Failed to multiply decimals:', a, b, err.message);
    return null;
  }
}

/**
 * Divides two decimal values safely
 * @param {*} a - Dividend
 * @param {*} b - Divisor
 * @returns {Decimal|null}
 */
export function divideDecimals(a, b) {
  try {
    const decA = toDecimal(a);
    const decB = toDecimal(b);
    
    if (!decA || !decB) return null;
    
    // Check for division by zero
    if (decB.equals(0)) {
      console.error('Division by zero');
      return null;
    }
    
    return decA.div(decB);
  } catch (err) {
    console.error('Failed to divide decimals:', a, b, err.message);
    return null;
  }
}

/**
 * Compares two decimal values
 * @param {*} a - First value
 * @param {*} b - Second value
 * @returns {number} - -1 if a < b, 0 if a == b, 1 if a > b, null on error
 */
export function compareDecimals(a, b) {
  try {
    const decA = toDecimal(a);
    const decB = toDecimal(b);
    
    if (!decA || !decB) return null;
    
    if (decA.lessThan(decB)) return -1;
    if (decA.equals(decB)) return 0;
    return 1;
  } catch (err) {
    console.error('Failed to compare decimals:', a, b, err.message);
    return null;
  }
}

/**
 * Converts a decimal to a MySQL-safe numeric value
 * @param {Decimal|number|string} value - The decimal value
 * @returns {number|null}
 */
export function toMySQLDecimal(value) {
  try {
    const decimalValue = toDecimal(value);
    if (!decimalValue) return null;
    
    // Convert to number with proper rounding for MySQL DECIMAL type
    return parseFloat(decimalValue.toFixed(2));
  } catch (err) {
    console.error('Failed to convert to MySQL decimal:', value);
    return null;
  }
}

/**
 * Validates if a value is a valid decimal
 * @param {*} value - The value to validate
 * @returns {boolean}
 */
export function isValidDecimal(value) {
  if (value === undefined || value === null) return false;
  
  try {
    const decimalValue = new Decimal(value);
    return !decimalValue.isNaN();
  } catch (err) {
    return false;
  }
}

// Keep default export for backward compatibility
export default toDecimal;