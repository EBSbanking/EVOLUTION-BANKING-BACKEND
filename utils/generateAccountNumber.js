// utils/generateAccountNumber.js

// Function to generate a new ACCT_NO and ACCT_ID
export const generateAccountIdentifiers = () => {
    // Generate ACCT_NO starting from 10000000000 and incrementing
    const ACCT_NO = (1000000000 + Math.floor(Math.random() * 1000)).toString();
  
    // Generate ACCT_ID starting from 100000 and incrementing
    const ACCT_ID = (100000 + Math.floor(Math.random() * 1000)).toString();
  
    return { ACCT_NO, ACCT_ID };
  };
  