// In validators.js (or validator.js)

export const validateDeposit = (depositData) => {
    const errors = [];
  
    if (!depositData || !depositData.ACCT_ID) {
      errors.push('Account ID is required');
    }
  
    if (!depositData || !depositData.ACCT_NO) {
      errors.push('Account Number is required');
    }
  
    if (!depositData || !depositData.amount || isNaN(depositData.amount)) {
      errors.push('Amount must be a valid number');
    }
  
    return errors;
  };
  
  export const handleValidationErrors = (errors) => {
    return errors.map(error => ({ error }));
  };
  