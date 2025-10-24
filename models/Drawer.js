// models/Drawer.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const DrawerSchema = new Schema({
  // Core Identification
  DRAWER_ID: { 
    type: Number, 
    required: true, 
    unique: true 
  },
  DRAWER_NO: { 
    type: String, 
    required: true, 
    maxlength: 20,
    unique: true 
  },
  DRAWER_NM: { 
    type: String, 
    required: true, 
    maxlength: 60 
  },

  // Balance Information
  CURRENT_BALANCE: { 
    type: Schema.Types.Decimal128, 
    required: true, 
    default: mongoose.Types.Decimal128.fromString('0.00') 
  },
  MIN_BAL: { 
    type: Schema.Types.Decimal128, 
    required: true, 
    default: mongoose.Types.Decimal128.fromString('0.00') 
  },
  MAX_BAL: { 
    type: Schema.Types.Decimal128, 
    required: true, 
    default: mongoose.Types.Decimal128.fromString('0.00') 
  },
  TOTAL_INSURED_AMT: { 
    type: Schema.Types.Decimal128, 
    required: true, 
    default: mongoose.Types.Decimal128.fromString('0.00') 
  },

  // Status and Workflow
  WF_STATUS: { 
    type: String, 
    required: true, 
    enum: ['OPEN', 'CLOSED', 'SUSPENDED'],
    default: 'CLOSED' 
  },
  REC_ST: { 
    type: String, 
    required: true, 
    enum: ['A', 'I', 'C'], // Active, Inactive, Closed
    default: 'A' 
  },
  DRAWER_TY_CD: { 
    type: String, 
    required: true, 
    maxlength: 10,
    enum: ['TELLER', 'VAULT', 'ATM', 'BRANCH'] 
  },

  // Session Management
  LAST_DRAWER_OPEN_DT: { 
    type: Date 
  },
  LAST_DRAWER_CLOSE_DT: { 
    type: Date 
  },
  SESSION_START_BALANCE: { 
    type: Schema.Types.Decimal128, 
    default: mongoose.Types.Decimal128.fromString('0.00') 
  },
  SESSION_END_BALANCE: { 
    type: Schema.Types.Decimal128, 
    default: mongoose.Types.Decimal128.fromString('0.00') 
  },

  // Settlement Information
  OVERAGE_AMT: { 
    type: Schema.Types.Decimal128, 
    required: true, 
    default: mongoose.Types.Decimal128.fromString('0.00') 
  },
  SHORTAGE_AMT: { 
    type: Schema.Types.Decimal128, 
    required: true, 
    default: mongoose.Types.Decimal128.fromString('0.00') 
  },

  // Limit Controls
  DRAWER_CASH_LIMIT_FG: { 
    type: String, 
    enum: ['Y', 'N'], 
    default: 'N' 
  },
  DRAWER_LIMIT_EXCEED_TM: { 
    type: Number, 
    default: 0 
  },
  DRAWER_INSURED_LIMIT_FG: { 
    type: String, 
    enum: ['Y', 'N'], 
    default: 'N' 
  },

  // Currency Tracking
  OPENING_CURRENCY: {
    OneThousandNaira: { type: Number, default: 0 },
    FiveHundredNaira: { type: Number, default: 0 },
    TwoHundredNaira: { type: Number, default: 0 },
    OneHundredNaira: { type: Number, default: 0 },
    FiftyNaira: { type: Number, default: 0 },
    TwentyNaira: { type: Number, default: 0 },
    TenNaira: { type: Number, default: 0 },
    FiveNaira: { type: Number, default: 0 },
    TOTAL_CURRENCY_COUNT: { type: Number, default: 0 }
  },
  CLOSING_CURRENCY: {
    OneThousandNaira: { type: Number, default: 0 },
    FiveHundredNaira: { type: Number, default: 0 },
    TwoHundredNaira: { type: Number, default: 0 },
    OneHundredNaira: { type: Number, default: 0 },
    FiftyNaira: { type: Number, default: 0 },
    TwentyNaira: { type: Number, default: 0 },
    TenNaira: { type: Number, default: 0 },
    FiveNaira: { type: Number, default: 0 },
    TOTAL_CURRENCY_COUNT: { type: Number, default: 0 }
  },

  // ADDED: Currency Denomination References
  OPENING_CURRENCY_DENOMINATION: { 
    type: Schema.Types.ObjectId, 
    ref: 'DrawerCurrencyDenomination' 
  },
  CLOSING_CURRENCY_DENOMINATION: { 
    type: Schema.Types.ObjectId, 
    ref: 'DrawerCurrencyDenomination' 
  },
  CLOSING_DENOMINATION_REFERENCE: { 
    type: Schema.Types.ObjectId, 
    ref: 'DrawerCurrencyDenomination' 
  },

  // Closing Details
  CLOSING_NOTES: { 
    type: String, 
    maxlength: 500 
  },
  CLOSING_VERIFIED_BY: { 
    type: String, 
    maxlength: 24 
  },

  // Force Close Information
  FORCE_CLOSED: { 
    type: Boolean, 
    default: false 
  },
  FORCE_CLOSE_REASON: { 
    type: String, 
    maxlength: 200 
  },
  FORCE_CLOSED_BY: { 
    type: String, 
    maxlength: 24 
  },

  // Account References
  GL_ACCT_NO: { 
    type: String, 
    required: true, 
    maxlength: 60 
  },
  SP_ACCT_NO: { 
    type: String, 
    maxlength: 60 
  },
  SP_ACCT_FG: { 
    type: String, 
    enum: ['Y', 'N'], 
    default: 'N' 
  },

  // Business Context
  BU_ID: { 
    type: Number, 
    required: true 
  },
  USER_ID: {  // Legacy user ID field (string)
    type: String, 
    required: true, 
    maxlength: 24 
  },

  // === UPDATED: Assignment Management Fields ===
  
  // Current Assignment (using Number to match DrawerReassignment schema)
  CURRENT_ASSIGNEE_ID: { 
    type: Number, 
    required: true,
    default: 0
  },
  CURRENT_ASSIGNEE_NAME: { 
    type: String, 
    maxlength: 100 
  },
  
  // Temporary Assignment Support (minimal - detailed history in DrawerReassignment)
  TEMP_ASSIGNEE_ID: { 
    type: Number 
  },
  TEMP_ASSIGNEE_NAME: { 
    type: String, 
    maxlength: 100 
  },
  TEMP_ASSIGNMENT_START: { 
    type: Date 
  },
  TEMP_ASSIGNMENT_END: { 
    type: Date 
  },
  TEMP_ASSIGNMENT_REASON: {
    type: String,
    maxlength: 200
  },
  
  // Last Reassignment Reference (links to DrawerReassignment collection)
  LAST_REASSIGNMENT_ID: { 
    type: Number  // References DRAWER_REASSIGNMENT_ID in DrawerReassignment schema
  },
  LAST_REASSIGNMENT_DATE: { 
    type: Date 
  },
  
  // Assignment Summary (denormalized for quick access)
  TOTAL_REASSIGNMENTS: { 
    type: Number, 
    default: 0 
  },
  CURRENT_ASSIGNMENT_START: { 
    type: Date,
    default: Date.now 
  },

  // Assignment Audit
  ASSIGNED_BY: {
    type: String,
    maxlength: 24
  },
  REASSIGNED_BY: {
    type: String,
    maxlength: 24
  },

  // REMOVED: Assignment History Arrays - Using separate DrawerReassignment schema instead
  // ASSIGNMENT_HISTORY: [...]
  // TEMPORARY_ASSIGNMENTS: [...]

  // Audit Fields
  CREATED_BY: { 
    type: String, 
    required: true, 
    maxlength: 24 
  },
  CREATE_DT: { 
    type: Date, 
    default: Date.now 
  },
  SYS_CREATE_TS: { 
    type: Date, 
    default: Date.now 
  },
  EFF_FROM_DT: { 
    type: Date, 
    default: Date.now 
  },
  EFF_TO_DT: { 
    type: Date 
  },
  VERSION_NO: { 
    type: Number, 
    default: 1 
  },
  ROW_TS: { 
    type: Date, 
    default: Date.now 
  }

}, {
  timestamps: true,
  toJSON: { 
    transform: function(doc, ret) {
      // Convert Decimal128 to string for JSON response
      if (ret.CURRENT_BALANCE) ret.CURRENT_BALANCE = parseFloat(ret.CURRENT_BALANCE.toString());
      if (ret.MIN_BAL) ret.MIN_BAL = parseFloat(ret.MIN_BAL.toString());
      if (ret.MAX_BAL) ret.MAX_BAL = parseFloat(ret.MAX_BAL.toString());
      if (ret.TOTAL_INSURED_AMT) ret.TOTAL_INSURED_AMT = parseFloat(ret.TOTAL_INSURED_AMT.toString());
      if (ret.OVERAGE_AMT) ret.OVERAGE_AMT = parseFloat(ret.OVERAGE_AMT.toString());
      if (ret.SHORTAGE_AMT) ret.SHORTAGE_AMT = parseFloat(ret.SHORTAGE_AMT.toString());
      if (ret.SESSION_START_BALANCE) ret.SESSION_START_BALANCE = parseFloat(ret.SESSION_START_BALANCE.toString());
      if (ret.SESSION_END_BALANCE) ret.SESSION_END_BALANCE = parseFloat(ret.SESSION_END_BALANCE.toString());
      return ret;
    }
  }
});

// Indexes for better performance
DrawerSchema.index({ USER_ID: 1, WF_STATUS: 1 });
DrawerSchema.index({ BU_ID: 1, WF_STATUS: 1 });
DrawerSchema.index({ WF_STATUS: 1 });
DrawerSchema.index({ LAST_DRAWER_OPEN_DT: -1 });

// Currency denomination indexes
DrawerSchema.index({ OPENING_CURRENCY_DENOMINATION: 1 });
DrawerSchema.index({ CLOSING_CURRENCY_DENOMINATION: 1 });

// Assignment indexes
DrawerSchema.index({ CURRENT_ASSIGNEE_ID: 1, WF_STATUS: 1 });
DrawerSchema.index({ TEMP_ASSIGNEE_ID: 1 });
DrawerSchema.index({ BU_ID: 1, CURRENT_ASSIGNEE_ID: 1 });
DrawerSchema.index({ LAST_REASSIGNMENT_DATE: -1 });
DrawerSchema.index({ CURRENT_ASSIGNMENT_START: -1 });

// Virtual for session duration
DrawerSchema.virtual('sessionDuration').get(function() {
  if (!this.LAST_DRAWER_OPEN_DT || !this.LAST_DRAWER_CLOSE_DT) return null;
  
  const durationMs = this.LAST_DRAWER_CLOSE_DT - this.LAST_DRAWER_OPEN_DT;
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
});

// Virtual for available balance (current - min)
DrawerSchema.virtual('availableBalance').get(function() {
  const current = parseFloat(this.CURRENT_BALANCE.toString());
  const min = parseFloat(this.MIN_BAL.toString());
  return Math.max(0, current - min);
});

// Assignment Virtuals
DrawerSchema.virtual('currentAssignee').get(function() {
  if (this.TEMP_ASSIGNEE_ID) {
    return {
      id: this.TEMP_ASSIGNEE_ID,
      name: this.TEMP_ASSIGNEE_NAME,
      isTemporary: true,
      assignmentStart: this.TEMP_ASSIGNMENT_START,
      assignmentEnd: this.TEMP_ASSIGNMENT_END,
      reason: this.TEMP_ASSIGNMENT_REASON
    };
  }
  return {
    id: this.CURRENT_ASSIGNEE_ID,
    name: this.CURRENT_ASSIGNEE_NAME,
    isTemporary: false,
    assignmentStart: this.CURRENT_ASSIGNMENT_START
  };
});

DrawerSchema.virtual('assignmentDuration').get(function() {
  const startDate = this.TEMP_ASSIGNEE_ID ? this.TEMP_ASSIGNMENT_START : this.CURRENT_ASSIGNMENT_START;
  if (!startDate) return null;
  
  const durationMs = new Date() - startDate;
  const hours = Math.floor(durationMs / (1000 * 60 * 60));
  const minutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
  
  return `${hours}h ${minutes}m`;
});

DrawerSchema.virtual('hasTemporaryAssignment').get(function() {
  return !!this.TEMP_ASSIGNEE_ID;
});

DrawerSchema.virtual('isAssigned').get(function() {
  return !!this.CURRENT_ASSIGNEE_ID || !!this.TEMP_ASSIGNEE_ID;
});

// Method to check if drawer can process transaction
DrawerSchema.methods.canProcessTransaction = function(amount, transactionType) {
  if (this.WF_STATUS !== 'OPEN') {
    return { canProcess: false, reason: 'Drawer is not open' };
  }
  
  if (this.REC_ST !== 'A') {
    return { canProcess: false, reason: 'Drawer is not active' };
  }

  // Check if drawer has a current assignee
  if (!this.CURRENT_ASSIGNEE_ID && !this.TEMP_ASSIGNEE_ID) {
    return { canProcess: false, reason: 'Drawer has no assigned user' };
  }

  const currentBalance = parseFloat(this.CURRENT_BALANCE.toString());
  
  // For withdrawals/debits, check sufficient balance
  if (transactionType === 'WITHDRAWAL' || transactionType === 'CASH_DISBURSEMENT') {
    if (currentBalance < amount) {
      return { 
        canProcess: false, 
        reason: `Insufficient drawer balance. Available: ${currentBalance}, Required: ${amount}` 
      };
    }
  }

  // Check if transaction would exceed max balance for deposits
  if (transactionType === 'DEPOSIT' || transactionType === 'CASH_RECEIPT') {
    const newBalance = currentBalance + amount;
    const maxBalance = parseFloat(this.MAX_BAL.toString());
    if (newBalance > maxBalance) {
      return { 
        canProcess: true, 
        reason: 'Transaction would exceed maximum balance limit',
        wouldExceedLimit: true
      };
    }
  }

  return { canProcess: true };
};

// === UPDATED: Assignment Methods (simplified - detailed logic in controller) ===

DrawerSchema.methods.assignToUser = function(userId, userName, assignedBy) {
  this.CURRENT_ASSIGNEE_ID = userId;
  this.CURRENT_ASSIGNEE_NAME = userName;
  this.ASSIGNED_BY = assignedBy;
  this.CURRENT_ASSIGNMENT_START = new Date();
  this.TOTAL_REASSIGNMENTS += 1;
};

DrawerSchema.methods.temporaryAssign = function(tempUserId, tempUserName, assignedBy, reason) {
  this.TEMP_ASSIGNEE_ID = tempUserId;
  this.TEMP_ASSIGNEE_NAME = tempUserName;
  this.TEMP_ASSIGNMENT_START = new Date();
  this.TEMP_ASSIGNMENT_REASON = reason;
};

DrawerSchema.methods.endTemporaryAssignment = function() {
  this.TEMP_ASSIGNEE_ID = null;
  this.TEMP_ASSIGNEE_NAME = null;
  this.TEMP_ASSIGNMENT_START = null;
  this.TEMP_ASSIGNMENT_END = new Date();
  this.TEMP_ASSIGNMENT_REASON = null;
};

DrawerSchema.methods.canReassign = function() {
  if (this.WF_STATUS === 'OPEN' && parseFloat(this.CURRENT_BALANCE.toString()) > 0) {
    return {
      canReassign: false,
      reason: 'Cannot reassign open drawer with balance. Close drawer first or use temporary assignment.',
      currentBalance: parseFloat(this.CURRENT_BALANCE.toString())
    };
  }
  
  if (this.TEMP_ASSIGNEE_ID) {
    return {
      canReassign: false,
      reason: 'Cannot reassign while temporary assignment is active. End temporary assignment first.',
      tempAssignee: this.TEMP_ASSIGNEE_NAME
    };
  }
  
  return { canReassign: true };
};

// Static method to find open drawers for a user
DrawerSchema.statics.findOpenByUser = function(userId) {
  return this.find({ 
    $or: [
      { CURRENT_ASSIGNEE_ID: userId },
      { TEMP_ASSIGNEE_ID: userId }
    ],
    WF_STATUS: 'OPEN',
    REC_ST: 'A'
  });
};

// Static method to find all open drawers
DrawerSchema.statics.findAllOpen = function() {
  return this.find({ 
    WF_STATUS: 'OPEN',
    REC_ST: 'A'
  });
};

// Assignment Static Methods
DrawerSchema.statics.findByAssignee = function(assigneeId, includeTemporary = true) {
  const query = {
    $or: [
      { CURRENT_ASSIGNEE_ID: assigneeId }
    ],
    REC_ST: 'A'
  };
  
  if (includeTemporary) {
    query.$or.push({ TEMP_ASSIGNEE_ID: assigneeId });
  }
  
  return this.find(query);
};

DrawerSchema.statics.findAssignedDrawers = function(businessUnitId = null) {
  const query = {
    $or: [
      { CURRENT_ASSIGNEE_ID: { $ne: null } },
      { TEMP_ASSIGNEE_ID: { $ne: null } }
    ],
    REC_ST: 'A'
  };
  
  if (businessUnitId) {
    query.BU_ID = businessUnitId;
  }
  
  return this.find(query);
};

DrawerSchema.statics.findUnassignedDrawers = function(businessUnitId = null) {
  const query = {
    CURRENT_ASSIGNEE_ID: 0,
    TEMP_ASSIGNEE_ID: null,
    REC_ST: 'A'
  };
  
  if (businessUnitId) {
    query.BU_ID = businessUnitId;
  }
  
  return this.find(query);
};

DrawerSchema.statics.findTemporaryAssignments = function() {
  return this.find({
    TEMP_ASSIGNEE_ID: { $ne: null },
    REC_ST: 'A'
  });
};

// Pre-save middleware to update version number
DrawerSchema.pre('save', function(next) {
  if (this.isModified()) {
    this.VERSION_NO += 1;
    this.ROW_TS = new Date();
  }
  
  // Ensure USER_ID is populated for backward compatibility
  if (!this.USER_ID && this.CURRENT_ASSIGNEE_ID) {
    this.USER_ID = this.CURRENT_ASSIGNEE_ID.toString();
  }
  
  next();
});

// Post-save middleware to maintain data consistency
DrawerSchema.post('save', function(doc) {
  // If temporary assignment has ended, clear temp fields
  if (doc.TEMP_ASSIGNEE_ID && doc.TEMP_ASSIGNMENT_END) {
    const now = new Date();
    if (doc.TEMP_ASSIGNMENT_END < now) {
      doc.TEMP_ASSIGNEE_ID = null;
      doc.TEMP_ASSIGNEE_NAME = null;
      doc.TEMP_ASSIGNMENT_START = null;
      doc.TEMP_ASSIGNMENT_END = null;
      doc.TEMP_ASSIGNMENT_REASON = null;
      doc.save();
    }
  }
});

const Drawer = mongoose.model('Drawer', DrawerSchema);

export default Drawer;