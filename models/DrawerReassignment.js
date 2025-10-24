// models/DrawerReassignment.js
import mongoose from 'mongoose';

const DrawerReassignmentSchema = new mongoose.Schema({
  // Primary Identification
  DRAWER_REASSIGNMENT_ID: { 
    type: Number, 
    required: true, 
    unique: true 
  },
  
  // Drawer Reference
  DRAWER_ID: { 
    type: Number, 
    required: true,
    ref: 'Drawer' 
  },
  DRAWER_NO: {  // Denormalized for easier queries
    type: String, 
    maxlength: 20 
  },
  
  // Business Context
  BU_ID: { 
    type: Number, 
    required: true 
  },
  
  // Assignment Details
  CURRENT_ASSIGNEE_ID: { 
    type: Number, 
    required: true 
  },
  CURRENT_ASSIGNEE_NAME: {  // Denormalized for reporting
    type: String, 
    maxlength: 100 
  },
  NEW_ASSIGNEE_ID: { 
    type: Number, 
    required: true 
  },
  NEW_ASSIGNEE_NAME: {  // Denormalized for reporting
    type: String, 
    maxlength: 100 
  },
  
  // Reassignment Context
  REASSIGNMENT_TYPE: {
    type: String,
    enum: ['REGULAR', 'TEMPORARY', 'EMERGENCY', 'SHIFT_CHANGE', 'LOAD_BALANCE'],
    default: 'REGULAR'
  },
  RSN_ID: { 
    type: Number, 
    required: false 
  },
  REASON_CODE: {  // Additional reason categorization
    type: String,
    enum: ['SHIFT_CHANGE', 'BREAK_COVERAGE', 'ABSENCE', 'TERMINATION', 'SECURITY', 'OPERATIONAL'],
    default: 'OPERATIONAL'
  },
  REMARKS: { 
    type: String, 
    maxlength: 500,  // Increased for detailed explanations
    required: false 
  },
  
  // Status and Workflow
  STATUS: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'],
    default: 'COMPLETED'
  },
  APPROVED_BY: {
    type: String,
    maxlength: 24,
    required: false
  },
  APPROVAL_DATE: {
    type: Date,
    required: false
  },
  
  // Financial Context (for open drawer reassignments)
  DRAWER_STATUS_AT_REASSIGNMENT: {
    type: String,
    enum: ['OPEN', 'CLOSED'],
    required: true
  },
  BALANCE_AT_REASSIGNMENT: {
    type: mongoose.Schema.Types.Decimal128,
    required: false
  },
  TRANSFER_VERIFIED: {
    type: Boolean,
    default: false
  },
  VERIFIED_BY: {
    type: String,
    maxlength: 24,
    required: false
  },
  
  // Audit Fields
  REC_ST: { 
    type: String, 
    required: true, 
    enum: ['A', 'I', 'C'], // Active, Inactive, Closed
    default: 'A',
    maxlength: 1 
  },
  VERSION_NO: { 
    type: Number, 
    required: true,
    default: 1 
  },
  ROW_TS: { 
    type: Date, 
    required: true,
    default: Date.now 
  },
  USER_ID: { 
    type: String, 
    required: true, 
    maxlength: 24 
  },
  CREATE_DT: { 
    type: Date, 
    required: true,
    default: Date.now 
  },
  SYS_CREATE_TS: { 
    type: Date, 
    required: true,
    default: Date.now 
  },
  CREATED_BY: { 
    type: String, 
    required: true, 
    maxlength: 24 
  },
  
  // Effective Dates
  EFFECTIVE_FROM: {
    type: Date,
    required: true,
    default: Date.now
  },
  EFFECTIVE_TO: {
    type: Date,
    required: false
  },
  
  // Additional Audit Info
  IP_ADDRESS: {
    type: String,
    maxlength: 45
  },
  SESSION_ID: {
    type: String,
    maxlength: 100
  }

}, {
  timestamps: true, // Adds createdAt and updatedAt
  toJSON: { 
    transform: function(doc, ret) {
      if (ret.BALANCE_AT_REASSIGNMENT) {
        ret.BALANCE_AT_REASSIGNMENT = parseFloat(ret.BALANCE_AT_REASSIGNMENT.toString());
      }
      return ret;
    }
  }
});

// Indexes for better performance
DrawerReassignmentSchema.index({ DRAWER_ID: 1, CREATE_DT: -1 });
DrawerReassignmentSchema.index({ CURRENT_ASSIGNEE_ID: 1, CREATE_DT: -1 });
DrawerReassignmentSchema.index({ NEW_ASSIGNEE_ID: 1, CREATE_DT: -1 });
DrawerReassignmentSchema.index({ BU_ID: 1, STATUS: 1 });
DrawerReassignmentSchema.index({ REASSIGNMENT_TYPE: 1, CREATE_DT: -1 });

// Static method to find active reassignments for a drawer
DrawerReassignmentSchema.statics.findActiveByDrawer = function(drawerId) {
  return this.find({ 
    DRAWER_ID: drawerId,
    STATUS: 'COMPLETED',
    REC_ST: 'A',
    EFFECTIVE_TO: { $exists: false }
  }).sort({ CREATE_DT: -1 });
};

// Static method to find reassignment history for a user
DrawerReassignmentSchema.statics.findByUser = function(userId, options = {}) {
  const query = {
    $or: [
      { CURRENT_ASSIGNEE_ID: userId },
      { NEW_ASSIGNEE_ID: userId }
    ],
    REC_ST: 'A'
  };
  
  if (options.status) query.STATUS = options.status;
  if (options.reassignmentType) query.REASSIGNMENT_TYPE = options.reassignmentType;
  
  return this.find(query).sort({ CREATE_DT: -1 });
};

// Method to check if reassignment is currently effective
DrawerReassignmentSchema.methods.isEffective = function() {
  const now = new Date();
  return this.STATUS === 'COMPLETED' && 
         this.EFFECTIVE_FROM <= now && 
         (!this.EFFECTIVE_TO || this.EFFECTIVE_TO > now);
};

const DrawerReassignment = mongoose.model('DrawerReassignment', DrawerReassignmentSchema);

export default DrawerReassignment;