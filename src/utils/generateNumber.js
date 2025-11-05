// utils/generateNumber.js

/**
 * Generates a random number with the specified number of digits.
 * @param {number} length - Number of digits for the random number (minimum 1).
 * @returns {number} A random number of the given length.
 */
// In your utils/generateNumber.js file
export const generateNumber = async (length = 6, collectionName = 'default') => {
  // ... existing code ...
  
  const sequence = await Sequences.findOneAndUpdate(
    { 
      targetCollection: collectionName || 'default' // Change to targetCollection
    },
    { 
      $inc: { value: 1 },
      $setOnInsert: { 
        targetCollection: collectionName || 'default', // Change to targetCollection
        createdAt: new Date()
      }
    },
    { 
      upsert: true, 
      new: true, 
      session,
      hint: { targetCollection: 1 } // Update hint
    }
  );
  
  // ... rest of function ...
};
export default generateNumber;