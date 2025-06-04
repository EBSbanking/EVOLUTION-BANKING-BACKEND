import mongoose from 'mongoose';

// Define the schema for WF_Sub_Process_Policy
const wfSubProcessPolicySchema = new mongoose.Schema({
  SUB_PROC_POLICY_ID: {
    type: Number, // Assuming this is a unique identifier
    required: true,
    unique: true,
  },
  SUB_PROC_ID: {
    type: Number, // Reference to a specific subprocess
    required: true,
  },
  BUS_PROC_POLICY_ID: {
    type: Number, // Reference to a business process policy
    required: true,
  },
  SEQ_NO: {
    type: Number, // Sequence number for ordering purposes
    required: true,
  },
  REC_ST: {
    type: String, // Record status (e.g., Active, Inactive)
    required: true,
  },
  VERSION_NO: {
    type: Number, // Version number for the policy
    required: true,
  },
  ROW_TS: {
    type: Date, // Timestamp when the record was last updated
    required: true,
    default: Date.now, // Default to current timestamp
  },
  USER_ID: {
    type: String, // User ID associated with the policy
    required: true,
  },
  CREATE_DT: {
    type: Date, // Date when the policy was created
    required: true,
    default: Date.now, // Default to current date
  },
  CREATED_BY: {
    type: String, // Who created the policy record
    required: true,
  },
  SYS_CREATE_TS: {
    type: Date, // System-created timestamp
    required: true,
    default: Date.now, // Default to current system time
  },
});

// Create and export the model
const WF_SUB_PROCESS_POLICY = mongoose.model('WF_SUB_PROCESS_POLICY', wfSubProcessPolicySchema);

export default WF_SUB_PROCESS_POLICY;
