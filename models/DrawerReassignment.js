import mongoose from 'mongoose';

// Define the schema for DrawerReassignment
const DrawerReassignmentSchema = new mongoose.Schema({
  DRAWER_REASSIGNMENT_ID: { type: Number, required: true },
  DRAWER_ID: { type: Number, required: true },
  BU_ID: { type: Number, required: true },
  CURRENT_ASSIGNEE_ID: { type: Number, required: true },
  NEW_ASSIGNEE_ID: { type: Number, required: true },
  RSN_ID: { type: Number, required: false }, // This field is not required based on your input
  REMARKS: { type: String, maxlength: 255, required: false },
  REC_ST: { type: String, required: true, maxlength: 1 },
  VERSION_NO: { type: Number, required: true },
  ROW_TS: { type: Date, required: true },  // Timestamp, can be stored as Date in MongoDB
  USER_ID: { type: String, required: true, maxlength: 24 },
  CREATE_DT: { type: Date, required: true },
  SYS_CREATE_TS: { type: Date, required: true }, // Timestamp, can be stored as Date in MongoDB
  CREATED_BY: { type: String, required: true, maxlength: 24 },
});

// Create the model
const DrawerReassignment = mongoose.model('DrawerReassignment', DrawerReassignmentSchema);

export default DrawerReassignment;
