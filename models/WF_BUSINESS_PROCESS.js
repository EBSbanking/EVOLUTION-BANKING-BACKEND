import mongoose from 'mongoose';

// Define the schema for WF_BUSINESS_PROCESS
const wfBusinessProcessSchema = new mongoose.Schema({
  BUS_PROC_ID: {
    type: Number,  // Adjust type based on your actual data type
    required: true,
    unique: true,  // Assuming the process ID should be unique
  },
  BUS_PROC_CD: {
    type: String,  // Process code
    required: true,
  },
  BUS_PROC_DESC: {
    type: String,  // Process description
    required: true,
  },
  WF_APPL_CAT_CD: {
    type: String,  // Application category code
    required: true,
  },
  REC_ST: {
    type: String,  // Record status (e.g., Active, Inactive)
    required: true,
  },
  VERSION: {
    type: String,  // Version of the process
    required: true,
  },
  ROW_TS: {
    type: Date,  // Timestamp for row
    required: true,
    default: Date.now,  // Default to current timestamp if not provided
  },
  USER_ID: {
    type: String,  // User ID associated with the process
    required: true,
  },
  CREATED_BY: {
    type: String,  // Who created the process record
    required: true,
  },
  SYS_CREATE_TS: {
    type: Date,  // System-created timestamp
    required: true,
    default: Date.now,  // Default to current system time
  },
  GRAPHICAL_DATA: {
    type: String,  // Could be a URL or some other form of graphical data
    required: false,  // Optional field
  },
  WF_EXPIRY_OPT: {
    type: String,  // Expiry option for the workflow
    required: false,  // Optional
  },
  WF_AUTO_EXP_FREQ_CD: {
    type: String,  // Frequency code for auto expiration (e.g., DAILY, WEEKLY)
    required: false,  // Optional
  },
  WF_AUTO_EXP_FREQ_VAL: {
    type: String,  // The value for frequency (e.g., number of days)
    required: false,  // Optional
  },

  // AUDIT FIELDS
  AUDIT_ACTION: {
    type: String,  // Action performed (e.g., CREATE, UPDATE, DELETE)
    required: false,  // Optional field
  },
  AUDIT_TS: {
    type: Date,  // Timestamp when the action was performed
    required: false,  // Optional field
    default: Date.now,  // Default to current timestamp if not provided
  },
  AUDIT_USER: {
    type: String,  // User who performed the action
    required: false,  // Optional field
  },
});

// Create and export the model
const WF_BUSINESS_PROCESS = mongoose.model('WF_BUSINESS_PROCESS', wfBusinessProcessSchema);

// Export the model using ES6 syntax.
export default WF_BUSINESS_PROCESS;
