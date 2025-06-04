// utils/generateNumber.js

// Function to generate a random number with the specified number of digits
export const generateNumber = (length) => {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return Math.floor(Math.random() * (max - min + 1)) + min;
  };
  