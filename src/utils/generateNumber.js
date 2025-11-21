// src/utils/generateNumber.js
import Sequence from '../models/Sequence.js';

/**
 * Generates a sequential number for a specific collection
 * @param {number} length - Number of digits for the number (minimum 1)
 * @param {string} collectionName - Name of the collection (e.g., 'customer', 'transaction')
 * @param {string} prefix - Optional prefix for the number
 * @param {object} session - Optional MongoDB session for transactions
 * @returns {string} A sequential number of the given length
 */
export const generateNumber = async (length = 6, collectionName = 'default', prefix = '', session = null) => {
  try {
    if (length < 1) {
      throw new Error('Length must be at least 1');
    }

    // Get the next sequential value - FIX: Use Sequence (singular) not Sequences (plural)
    const nextValue = await Sequence.getNextValue(collectionName, session);
    
    // Combine prefix and padded number
    const numberPart = String(nextValue).padStart(length, '0');
    return prefix ? `${prefix}${numberPart}` : numberPart;

  } catch (error) {
    console.error('Error generating sequential number:', error);
    
    // Fallback: generate timestamp-based number
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000);
    const combined = timestamp + random;
    
    return combined.slice(-length).padStart(length, '0');
  }
};

export default generateNumber;