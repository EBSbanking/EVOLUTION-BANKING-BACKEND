// utils/generateNumber.js

/**
 * Generates a random number with the specified number of digits.
 * @param {number} length - Number of digits for the random number (minimum 1).
 * @returns {number} A random number of the given length.
 */
export const generateNumber = (length) => {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Length must be a positive integer.');
  }

  const min = 10 ** (length - 1);
  const max = 10 ** length - 1;

  return Math.floor(Math.random() * (max - min + 1)) + min;
};
export default generateNumber;