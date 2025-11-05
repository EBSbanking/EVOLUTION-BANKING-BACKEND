import mongoose from 'mongoose';

// Schema definition
const customerSchema = new mongoose.Schema({
  CUST_ID: { type: String, required: true, unique: true }, // Unique index
  CUST_NO: { type: String, required: true, unique: true }, // Unique index
  TITLE_ID: { type: String },
  FIRST_NAME: { type: String },
  MIDDLE_NAME: { type: String },
  LAST_NAME: { type: String },
  CUST_NM: { type: String },
  HOME_ADDRESS: { type: String, required: true },
  EMAIL_ADDRESS: { type: String, lowercase: true, trim: true },
  BU_ID: { type: String, required: true },
  MAIDEN_NM: { type: String },
  BIRTH_DT: { type: Date },
  CNTRY_OF_BIRTH_ID: { type: String, default: 'NGA' },
  CUST_CAT: { type: String },
  CAMPAIGN_ID: { type: String },
  GENDER_TY: { type: String },
  NIN: { type: String, match: /^\d{11}$/ }, // No index unless needed
  BVN: { type: String, match: /^\d{11}$/ }, // No index unless needed
  COUNTRY_NM: { type: String, default: 'Nigeria' },
  STATE: { type: String },
  LOCAL_GOV: { type: String },
  OPENING_RSN_ID: { type: String },
  OPENED_DT: { type: Date },
  RESIDENT_CNTRY_ID: { type: String, default: 'NGA' },
  RISK_CLASS: { type: String },
  STMNT_FREQ_CD: { type: String },
  STMNT_FREQ_VALUE: { type: Number },
  CREATED_BY: { type: String },
  USER_ID: { type: String }, // No index unless needed
  CREATE_DT: { type: Date, default: Date.now },
  INDUSTRY_ID: { type: String },
  INDUSTRY_CD: { type: String },
  TAX_STATUS: { type: String },
  MARITAL_ST: { type: String },
  TAX_GRP_ID: { type: String },
  OPERATIONS_CRNCY_ID: { type: String, default: 'NGN' },
  EMP_ST: { type: String },
  ORGANISATION_NM: { type: String },
  REGISTRATION_ADDRESS: { type: String },
  REGISTRATION_DT: { type: Date },
  ALERT_DELIVERY_METHOD: { type: String },
  KYC_LEVEL: { type: String },
  PHONE_NO: { type: String },
  SMS: { type: String },
  REC_ST: { 
    type: String, 
    enum: [
      'Pending', 'Active', 'Approved', 
      'Inactive', 'Closed', 'Suspended', 
      'Cancelled', 'Rejected'
    ], 
    default: 'Pending' 
  },
  EVENT_ID: { type: String }, // No index unless needed
  IS_PEP: { type: Boolean, default: false },
  SANCTION_SCORE: { type: Number },
  DOCUMENT_VERIFICATION_STATUS: { type: String, default: 'Pending' },
  // ✅ ADDED: Next of Kin section (supports multiple next of kin)
  nextOfKin: [{
    NEXTOF_KIN_NM: { type: String, required: true }, // Full name
    RELATIONSHIP: { type: String, required: true }, // e.g., Spouse, Parent, Sibling
    PHONE_NO: { type: String, required: true }, // Contact phone
    EMAIL: { type: String, lowercase: true }, // Optional email
    ADDRESS: { type: String, required: true }, // Address
    IS_PRIMARY: { type: Boolean, default: false }, // Flag for primary next of kin
    CREATED_DT: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

// Virtual for AML relationship
customerSchema.virtual('aml', {
  ref: 'AML',
  localField: '_id',
  foreignField: 'customer',
  justOne: true
});

// Enable virtuals in output
customerSchema.set('toObject', { virtuals: true });
customerSchema.set('toJSON', { virtuals: true });

// ✅ NO explicit schema.index() calls - all indexes handled via unique: true or index: true in schema fields
// This eliminates duplicate index warnings for CUST_ID, CUST_NO, BVN, NIN, EVENT_ID, USER_ID

// Create the Customer model
const Customer = mongoose.model('Customer', customerSchema);

export default Customer;