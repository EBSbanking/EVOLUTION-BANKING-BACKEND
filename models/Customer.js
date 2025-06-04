import mongoose from 'mongoose';

// Function to generate a 7-digit number (you can keep or remove if you don't need it here)
const generateNumber = (length) => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Updated schema including new fields and proper types
const customerSchema = new mongoose.Schema({
  CUST_ID: { type: String, required: true, unique: true },  // Changed to String as "" was empty string
  CUST_NO: { type: String, required: true, unique: true },
  TITLE_ID: { type: String },
  FIRST_NAME: { type: String },
  MIDDLE_NAME: { type: String },
  LAST_NAME: { type: String },
  CUST_NM: { type: String },
  HOME_ADDRESS: { type: String, required: true },
  EMAIL_ADDRESS: { type: String },
  BU_ID: { type: String, required: true },
  MAIDEN_NM: { type: String },
  BIRTH_DT: { type: Date },
  CNTRY_OF_BIRTH_ID: { type: String },
  CUST_CAT: { type: String },
  CAMPAIGN_ID: { type: String },
  GENDER_TY: { type: String },
  NATIONALITY_NO: { type: String },
  COUNTRY_NM: { type: String, default: "Nigeria" },
  STATE: { type: String },
  LOCAL_GOV: { type: String },
  OPENING_RSN_ID: { type: String },
  OPENED_DT: { type: Date },
  RESIDENT_CNTRY_ID: { type: String },
  RISK_CLASS: { type: String },
  STMNT_FREQ_CD: { type: String },
  STMNT_FREQ_VALUE: { type: Number },
  CREATED_BY: { type: String },
  USER_ID: { type: String },
  CREATE_DT: { type: Date, default: Date.now },
  INDUSTRY_ID: { type: String },
  INDUSTRY_CD: { type: String },
  TAX_STATUS: { type: String },
  MARITAL_ST: { type: String },
  TAX_GRP_ID: { type: String },
  OPERATIONS_CRNCY_ID: { type: String, default: "NGN" },
  EMP_ST: { type: String },
  ORGANISATION_NM: { type: String },
  REGISTRATION_ADDRESS: { type: String },
  REGISTRATION_DT: { type: Date },
  ALERT_DELIVERY_METHOD: { type: String },
  KYC_LEVEL: { type: String },
  PHONE_NO: { type: String }, // Changed to String to support numbers with leading zeros or international codes
  SMS: { type: String },

  // Optional: Add EVENT_ID if still needed
  EVENT_ID: { type: Number }
});

// Create the Customer model
const Customer = mongoose.model('Customer', customerSchema);

export default Customer;
