import mongoose from 'mongoose';

const BusinessRoleSchema = new mongoose.Schema({
  ROLE_NM: { type: String, required: true },  // Name of the role
  REC_ST: { type: String, required: true },  // Record status (e.g., active, inactive)
  VERSION_NO: { type: Number, default: 1 },  // Version number for versioning
  USER_ID: { type: String, required: true },  // User ID associated with the role
  CREATE_DT: { type: Date, default: Date.now },  // Creation date
  SYS_CREATE_TS: { type: Date, default: Date.now },  // System timestamp of creation
  CREATED_BY: { type: String, required: true },  // Creator of the record
  ALLOW_TXN_POSTING_FG: { type: String },  // Flag for transaction posting
  ALLOW_EXCH_RATE_OVR_FG: { type: String },  // Flag for exchange rate override
  ROW_TS: { type: Date, default: Date.now },  // Timestamp for the record (defaults to now)
  ROLE_ID: { 
    type: String, 
    required: true, 
    enum: [
      "Administrator",
      "Head Banking Services",
      "Loan Processing Officer",
      "Senior Financial Accountant",
      "Internal Control Officer",
      "Internal Control Manager",
      "Head of Credit",
      "Head Human Resources",
      "Human Resource Officer",
      "IT Manager",
      "Financial Accountant",
      "Financial Accountant Manager",
      "Chief Financial Officer",
      "Chief Executive Officer",
      "Treasurer",
      "Loan Processing Supervisor",
      "Branch Manager",
      "Branch Operation Supervisor",
      "Chief Operation Officer",
      "Marketing Manager",
      "Payment and Reconciliation USD",
      "EOD Operator",
      "Recovery Officer",
      "Relationship Development Officer",
      "Customer Relationship Officer",
      "Customer Service Officer",
      "Teller",
      "Head Teller",
      "Customer Relationship Supervisor",
      "Recovery Team Lead",
      "Business Analyst",
      "Credit Risk Analyst",
      "Head of Digital Banking",
      "Agency Banking Officer",
      "Channel Manager"
    ]
  },
  BUSINESS_UNIT: { type: String, required: true },  // Corresponds to BU_ID in your database
  EFF_FROM_DT: { type: Date, required: true },  // Effective from date
  DEF_ROLE_FG: { type: String, required: true },  // Default role flag
  SUPERVISOR_FG: { type: String, required: true },  // Supervisor flag
  WF_ITEM_ACCESS_LEVEL: { type: String, required: true }  // Workflow item access level
});

const BusinessRole = mongoose.model('BusinessRole', BusinessRoleSchema);

export default BusinessRole;