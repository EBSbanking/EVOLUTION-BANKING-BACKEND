// models/Customer.js - UPDATED VERSION
import mongoose from 'mongoose';

// Schema definition
const customerSchema = new mongoose.Schema({
  CUST_ID: { type: String, required: true, unique: true },
  CUST_NO: { type: String, required: true, unique: true },
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
  NIN: { type: String, match: /^\d{11}$/ },
  BVN: { type: String, match: /^\d{11}$/ },
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
  USER_ID: { type: String },
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
  
  // CRITICAL FIX: Use uppercase enum values to match other models
  REC_ST: { 
    type: String, 
    enum: [
      'PENDING', 'ACTIVE', 'APPROVED', 
      'INACTIVE', 'CLOSED', 'SUSPENDED', 
      'CANCELLED', 'REJECTED'
    ], 
    default: 'PENDING',
    uppercase: true // Ensure values are stored as uppercase
  },
  
  // Also add a lowercase status field for compatibility
  status: {
    type: String,
    enum: ["Active", "Inactive", "Pending", "Suspended", "Closed", "Cancelled", "Rejected"],
    default: "Pending",
  },
  
  EVENT_ID: { type: String },
  IS_PEP: { type: Boolean, default: false },
  SANCTION_SCORE: { type: Number },
  DOCUMENT_VERIFICATION_STATUS: { type: String, default: 'Pending' },
  
  // Next of Kin section
  nextOfKin: [{
    NEXTOF_KIN_NM: { type: String, required: true },
    RELATIONSHIP: { type: String, required: true },
    PHONE_NO: { type: String, required: true },
    EMAIL: { type: String, lowercase: true },
    ADDRESS: { type: String, required: true },
    IS_PRIMARY: { type: Boolean, default: false },
    CREATED_DT: { type: Date, default: Date.now },
  }],
}, { 
  timestamps: true,
  // Add this to ensure both status fields are in sync
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Pre-save hook to sync status fields
customerSchema.pre('save', function(next) {
  // If REC_ST is set, update status to match (lowercase)
  if (this.isModified('REC_ST')) {
    switch(this.REC_ST) {
      case 'PENDING': this.status = 'Pending'; break;
      case 'ACTIVE': this.status = 'Active'; break;
      case 'APPROVED': this.status = 'Approved'; break;
      case 'INACTIVE': this.status = 'Inactive'; break;
      case 'CLOSED': this.status = 'Closed'; break;
      case 'SUSPENDED': this.status = 'Suspended'; break;
      case 'CANCELLED': this.status = 'Cancelled'; break;
      case 'REJECTED': this.status = 'Rejected'; break;
      default: this.status = 'Pending';
    }
  }
  // If status is set, update REC_ST to match (uppercase)
  if (this.isModified('status')) {
    switch(this.status) {
      case 'Pending': this.REC_ST = 'PENDING'; break;
      case 'Active': this.REC_ST = 'ACTIVE'; break;
      case 'Approved': this.REC_ST = 'APPROVED'; break;
      case 'Inactive': this.REC_ST = 'INACTIVE'; break;
      case 'Closed': this.REC_ST = 'CLOSED'; break;
      case 'Suspended': this.REC_ST = 'SUSPENDED'; break;
      case 'Cancelled': this.REC_ST = 'CANCELLED'; break;
      case 'Rejected': this.REC_ST = 'REJECTED'; break;
      default: this.REC_ST = 'PENDING';
    }
  }
  next();
});

// Virtual for AML relationship
customerSchema.virtual('aml', {
  ref: 'AML',
  localField: '_id',
  foreignField: 'customer',
  justOne: true
});

// Create the Customer model
const Customer = mongoose.model('Customer', customerSchema);

export default Customer;