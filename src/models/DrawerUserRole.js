import mongoose from 'mongoose';

// Define the schema for DrawerUserRole
const drawerUserRoleSchema = new mongoose.Schema({
  drawerUserRoleId: {
    type: Number,
    required: true, // The field is mandatory
    unique: true, // Ensures uniqueness of this field
  },
  drawerId: {
    type: Number,
    required: true, // The field is mandatory
  },
  recSt: {
    type: String,
    required: true,
    enum: ['A', 'I'], // Assuming 'A' for Active and 'I' for Inactive
    default: 'A', // Default value 'A' (Active)
  },
  versionNo: {
    type: Number,
    required: true,
    default: 1, // Default version number
  },
  rowTs: {
    type: Date,
    required: true,
    default: Date.now, // Timestamp when the row is created
  },
  userId: {
    type: String,
    required: true,
    maxlength: 24, // VARCHAR2 (24 Byte) corresponds to max length of 24 characters
  },
  createDt: {
    type: Date,
    required: true,
    default: Date.now, // Creation date of the record
  },
  sysCreateTs: {
    type: Date,
    required: true,
    default: Date.now, // System creation timestamp
  },
  createdBy: {
    type: String,
    required: true,
    maxlength: 24, // VARCHAR2 (24 Byte) corresponds to max length of 24 characters
  },
  userRoleId: {
    type: Number,
    required: false, // This field is optional
  },
});

// Create the model using the schema
const DrawerUserRole = mongoose.model('DrawerUserRole', drawerUserRoleSchema);

// Export the model for use in other parts of the application
export default DrawerUserRole;
