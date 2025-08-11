import mongoose from 'mongoose';


// Schema definition
const customerSchema = new mongoose.Schema({
  CUST_ID: { type: String, required: true},
  CUST_NO: { type: Number, required: true },
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
  NIN: { type: Number },
  BVN: {type: Number},
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
  PHONE_NO: { type: String },
  SMS: { type: String },
  REC_ST: { 
  type: String, 
  enum: ['Pending', 'Active', 'Approved', 'Inactive', 'Closed', 'Suspended', 'Cancelled', 'Rejected'], 
  default: 'Pending' 
},
EVENT_ID: { type: Number }

 
});

// Add virtual for AML relationship
customerSchema.virtual('aml', {
  ref: 'AML',
  localField: '_id',
  foreignField: 'customer',
  justOne: true
});

// Enable virtuals in output
customerSchema.set('toObject', { virtuals: true });
customerSchema.set('toJSON', { virtuals: true });

// Create the Customer model
const Customer = mongoose.model('Customer', customerSchema);

export default Customer;
