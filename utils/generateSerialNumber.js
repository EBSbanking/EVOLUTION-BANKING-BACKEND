// utils/generateSerialNumber.js

/**
 * Generates a random numeric serial number of specified length.
 * @param {number} length - Length of the serial number to generate.
 * @returns {string} - A numeric serial number as a string.
 */
export function generateSerialNumber(length) {
  if (!Number.isInteger(length) || length <= 0) {
    throw new Error('Length must be a positive integer');
  }

  let serial = '';
  while (serial.length < length) {
    serial += Math.floor(Math.random() * 10); // Append a random digit (0–9)
  }

  return serial;
}

export default generateSerialNumber;