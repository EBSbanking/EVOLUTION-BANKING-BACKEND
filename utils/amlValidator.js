// validators/amlValidator.js
import validator from 'validator';
import { isValidDate, isFutureDate } from './dateUtils.js';

export const validateAMLInput = (input) => {
  const errors = [];
  
  // Required fields validation
  if (!input.CUST_ID) errors.push('Customer ID is required');
  if (!input.BVN) errors.push('BVN is required');
  if (!input.NIN) errors.push('NIN is required');
  if (!input.USER_ID) errors.push('USER_ID is required');

  // Format validation
  if (input.BVN && !/^\d{11}$/.test(input.BVN)) {
    errors.push('BVN must be 11 digits');
  }
  
  if (input.NIN && !/^\d{11}$/.test(input.NIN)) {
    errors.push('NIN must be 11 digits');
  }

  // Sanction score validation
  if (input.SANCTION_SCORE !== undefined && 
      (isNaN(input.SANCTION_SCORE) || 
      input.SANCTION_SCORE < 0 || 
      input.SANCTION_SCORE > 100)) {
    errors.push('Sanction score must be between 0 and 100');
  }

  // Date validation
  if (input.LAST_RISK_ASSESSMENT_DT && !isValidDate(input.LAST_RISK_ASSESSMENT_DT)) {
    errors.push('Invalid last risk assessment date');
  }

  if (input.NEXT_REVIEW_DATE && !isValidDate(input.NEXT_REVIEW_DATE)) {
    errors.push('Invalid next review date');
  }

  // Document validation
  // Document validation
if (input.ID_DOCUMENTS && Array.isArray(input.ID_DOCUMENTS)) {
  input.ID_DOCUMENTS.forEach((doc, index) => {
    if (!doc.documentType) errors.push(`Document ${index + 1}: documentType is required`);
    if (!doc.documentNumber) errors.push(`Document ${index + 1}: documentNumber is required`);
    if (doc.expiryDate && !isValidDate(doc.expiryDate)) {
      errors.push(`Document ${index + 1}: Invalid expiry date`);
    }
  });
}


  // Status validation
  const validStatuses = ['Pending', 'Approved', 'Rejected', 'Suspended', 'Deleted'];
  if (input.AML_STATUS && !validStatuses.includes(input.AML_STATUS)) {
    errors.push(`Invalid AML status. Must be one of: ${validStatuses.join(', ')}`);
  }

  // Risk rating validation
  const validRatings = ['Low', 'Medium', 'High'];
  if (input.CUSTOMER_RISK_RATING && !validRatings.includes(input.CUSTOMER_RISK_RATING)) {
    errors.push(`Invalid risk rating. Must be one of: ${validRatings.join(', ')}`);
  }

  return errors.length > 0 ? errors.join('; ') : null;
};

export const validateApprovalInput = (input) => {
  const errors = [];
  
  if (!input.CUST_ID) errors.push('Customer ID is required');
  if (!input.USER_ID) errors.push('USER_ID is required');
  if (!input.comments) errors.push('Approval comments are required');
  
  return errors.length > 0 ? errors.join('; ') : null;
};

export const validateRejectionInput = (input) => {
  const errors = [];
  
  if (!input.CUST_ID) errors.push('Customer ID is required');
  if (!input.USER_ID) errors.push('USER_ID is required');
  if (!input.rejectionReason) errors.push('Rejection reason is required');
  
  return errors.length > 0 ? errors.join('; ') : null;
};

// Additional validators for different operations
export const validateAMLScreeningInput = (input) => {
  const errors = [];
  
  if (!input.bvn && !input.nin && !input.customerName) {
    errors.push('At least one of BVN, NIN, or customer name is required for screening');
  }
  
  return errors.length > 0 ? errors.join('; ') : null;
};