// validators.js

// Existing validators
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

// New middleware-style validator
export const validateRequest = (requiredFields) => {
  return (req, res, next) => {
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`,
        errors: missingFields.map(field => ({ field, error: `${field} is required` }))
      });
    }
    
    // Additional validation for specific fields if needed
    if (requiredFields.includes('amount') && req.body.amount && isNaN(req.body.amount)) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be a valid number',
        errors: [{ field: 'amount', error: 'Must be a valid number' }]
      });
    }
    
    next();
  };
};

// Optional: Combine both approaches for deposit validation
export const validateDepositRequest = validateRequest(['ACCT_ID', 'ACCT_NO', 'amount']);