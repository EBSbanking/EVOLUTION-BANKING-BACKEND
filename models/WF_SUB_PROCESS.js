import mongoose from 'mongoose';

// Define the schema for WF_SUB_PROCESS
const wfSubProcessSchema = new mongoose.Schema({
  SUB_PROC_ID: {
    type: String, // Unique ID for the subprocess
    required: true,
    unique: true, // Ensures no duplicate subprocess IDs
  },
  BUS_PROC_ID: {
    type: String, // ID of the parent business process
    required: true,
  },
  SRC_QUEUE_ID: {
    type: String, // Source queue ID
    required: false, // Optional if not always applicable
  },
  EVENT_ID: {
    type: String, // Event ID triggering the subprocess
    required: false, // Optional
  },
  PATH_NO: {
    type: Number, // Path number within the process
    required: true,
  },
  SUB_PROC_TY: {
    type: String, // Type of the subprocess (e.g., reusable, embedded)
    required: true,
  },
  REC_ST: {
    type: String, // Record status (e.g., Active, Inactive)
    required: true,
  },
  VERSION_NO: {
    type: String, // Version of the subprocess
    required: true,
  },
  ROW_TS: {
    type: Date, // Row timestamp
    required: true,
    default: Date.now, // Default to current time
  },
  USER_ID: {
    type: String, // User ID associated with the subprocess
    required: true,
  },
  CREATED_BY: {
    type: String, // User or system that created the subprocess
    required: true,
  },
  CREATED_DT: {
    type: Date, // Date the subprocess was created
    required: true,
    default: Date.now, // Default to current date
  },
  SYS_CREATE_TS: {
    type: Date, // System-created timestamp
    required: true,
    default: Date.now, // Default to current timestamp
  },
  SUB_PROC_NM: {
    type: String, // Name of the subprocess
    required: true,
  },
});

// Create and export the model
const WF_SUB_PROCESS = mongoose.model('WF_SUB_PROCESS', wfSubProcessSchema);

export default WF_SUB_PROCESS;
