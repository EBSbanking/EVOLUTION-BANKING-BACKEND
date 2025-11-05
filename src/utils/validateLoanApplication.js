// middleware/validateLoanApplication.js
export const validateLoanApplication = (req, res, next) => {
  // Validate required fields
  const requiredFields = ['GUARANTOR_ID', 'GUARANTEED_AMT', /* other fields */];
  const missingFields = requiredFields.filter(field => !req.body[field]);
  
  if (missingFields.length > 0) {
    return res.status(400).json({
      success: false,
      message: 'Missing required fields',
      missingFields,
      code: 'MISSING_FIELDS'
    });
  }
  
  next();
};
