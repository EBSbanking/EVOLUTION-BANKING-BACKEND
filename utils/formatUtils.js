import mongoose from 'mongoose';

/**
 * Converts a value to mongoose.Types.Decimal128 safely.
 * Returns null if the value is undefined or cannot be parsed.
 * @param {*} value - The input value (number, string, etc.)
 * @returns {mongoose.Types.Decimal128|null}
 */
export function toDecimal(value) {
  if (value === undefined || value === null || isNaN(value)) return null;

  try {
    return mongoose.Types.Decimal128.fromString(Number(value).toFixed(2));
  } catch (err) {
    console.error('Failed to convert to Decimal128:', value);
    return null;
  }
}

export default toDecimal;