import mongoose from 'mongoose';

// Define schema for DepositAccountApplication (form submission)
const DepositAccountApplicationSchema = new mongoose.Schema({
  CUST_ID: { type: Number, required: true },
  ACCT_ID: { type: Number, required: true }, // Account ID, required
  ACCT_NO: { type: Number, required: true }, // Account Number, unique and required
  ACCT_NM: { type: String, required: true }, // Account Name, required
  CRNCY_ID: { 
    type: String, 
    required: false, // Optional field
    default: 'NGN' // Default currency ID (can be modified based on your logic)
  },
  PROD_ID: { 
    type: String, 
    required: false // Optional field
  },
  BU_ID: { type: String, required: true }, // Business Unit ID, required
  AVAIL_DT: { type: Date, required: true }, // Availability Date, required
  OPENED_DT: { type: Date, required: true }, // Opened Date, required
  NATIONALITY_NO: { type: String, required: false }, // Nationality Number, optional
  CREATED_BY: { type: String, required: true },
  BVN_NO: { type: Number, required: true },
  CREATED_AT: { type: Date, default: Date.now }, // Date of record creation, default to now
  IMAGE: { type: String, required: true}, // image url
  DOCUMENT: { type: String, required: true}, // customer document url
  DOCUMENT_TYPE: { type: String, required: true}, // document type
  DOCUMENT_NUMBER: { type: String, required: true}, // document number
  BANK_MANDATE: { type: String, required: true}, // bank mandate form url
  STATUS: { type: String, default: 'pending'} // status of the application
 
});

// Check if the model is already registered to avoid OverwriteModelError
const DepositAccountApplication = mongoose.models.DepositAccountApplication || mongoose.model('DepositAccountApplication', DepositAccountApplicationSchema);

export default DepositAccountApplication;
