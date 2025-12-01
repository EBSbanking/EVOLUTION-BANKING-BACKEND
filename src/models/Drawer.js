// models/Drawer.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const DrawerSchema = new Schema({
  // =============================================
  // CORE IDENTIFICATION
  // =============================================
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

  // =============================================
  // DRAWER TYPE & CLASSIFICATION
  // =============================================
  DRAWER_TY_CD: { 
    type: String, 
    required: true, 
    maxlength: 10,
    enum: ['TELLER', 'VAULT', 'ATM', 'BRANCH', 'CASH_CENTER'] 
  },
  
  // VAULT-SPECIFIC FIELDS - UPDATED ENUM VALUES
  VAULT_TYPE: { 
    type: String, 
    enum: ['MAIN_VAULT', 'BRANCH_VAULT', 'TEMPORARY_VAULT', 'CASH_VAULT', 'BULLION_VAULT', 'HIGH_SECURITY_VAULT'],
    default: 'BRANCH_VAULT'
  },
  SECURITY_LEVEL: {
    type: String,
    enum: ['LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4', 'LEVEL_5'], // UPDATED TO MATCH VAULT LEVELS
    default: 'LEVEL_2'
  },
  REQUIRES_DUAL_CONTROL: {
    type: Boolean,
    default: true
  },
  VAULT_CAPACITY: {
    type: Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  IS_HIGH_VALUE_VAULT: {
    type: Boolean,
    default: false
  },

  // =============================================
  // BALANCE INFORMATION
  // =============================================
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

  // =============================================
  // STATUS AND WORKFLOW
  // =============================================
  WF_STATUS: { 
    type: String, 
    required: true, 
    enum: ['OPEN', 'CLOSED', 'SUSPENDED', 'UNDER_MAINTENANCE', 'COUNT_IN_PROGRESS'],
    default: 'CLOSED' 
  },
  REC_ST: { 
    type: String, 
    required: true, 
    enum: ['A', 'I', 'C'], // Active, Inactive, Closed
    default: 'A' 
  },

  // =============================================
  // SESSION MANAGEMENT
  // =============================================
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

  // =============================================
  // ENHANCED OVERAGE & SHORTAGE TRACKING
  // =============================================
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
  LAST_CLOSING_DIFFERENCE: {
    type: Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  LAST_CLOSING_EXPECTED_BALANCE: {
    type: Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  LAST_CLOSING_ACTUAL_BALANCE: {
    type: Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  ALLOWABLE_VARIANCE_PERCENT: {
    type: Number,
    default: 0.1  // 0.1% allowable variance
  },
  ALLOWABLE_VARIANCE_AMOUNT: {
    type: Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('100.00') // ₦100 tolerance
  },
  TOTAL_OVERAGE_COUNT: {
    type: Number,
    default: 0
  },
  TOTAL_SHORTAGE_COUNT: {
    type: Number,
    default: 0
  },
  TOTAL_OVERAGE_AMOUNT: {
    type: Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  TOTAL_SHORTAGE_AMOUNT: {
    type: Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  OVERAGE_ALERT_FLAG: {
    type: String,
    enum: ['NONE', 'WARNING', 'CRITICAL'],
    default: 'NONE'
  },
  SHORTAGE_ALERT_FLAG: {
    type: String,
    enum: ['NONE', 'WARNING', 'CRITICAL'],
    default: 'NONE'
  },
  OVERAGE_APPROVED_BY: {
    type: String,
    maxlength: 24
  },
  SHORTAGE_APPROVED_BY: {
    type: String,
    maxlength: 24
  },
  OVERAGE_APPROVAL_DATE: {
    type: Date
  },
  SHORTAGE_APPROVAL_DATE: {
    type: Date
  },
  OVERAGE_APPROVAL_NOTES: {
    type: String,
    maxlength: 500
  },
  SHORTAGE_APPROVAL_NOTES: {
    type: String,
    maxlength: 500
  },

  // =============================================
  // LIMIT CONTROLS
  // =============================================
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

  // =============================================
  // CURRENCY TRACKING
  // =============================================
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

  // =============================================
  // CURRENCY DENOMINATION REFERENCES
  // =============================================
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

  // =============================================
  // CLOSING DETAILS
  // =============================================
  CLOSING_NOTES: { 
    type: String, 
    maxlength: 500 
  },
  CLOSING_VERIFIED_BY: { 
    type: String, 
    maxlength: 24 
  },
  CLOSING_COUNTED_BY: {
    type: String,
    maxlength: 24
  },

  // =============================================
  // FORCE CLOSE INFORMATION
  // =============================================
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

  // =============================================
  // TRANSFER TRACKING
  // =============================================
  LAST_TRANSFER_REFERENCE: {
    type: String,
    maxlength: 50
  },
  LAST_TRANSFER_AMOUNT: {
    type: Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  LAST_TRANSFER_DATE: {
    type: Date
  },
  LAST_TRANSFER_TYPE: {
    type: String,
    enum: ['DRAWER_TO_DRAWER', 'DRAWER_TO_VAULT', 'VAULT_TO_DRAWER', 'EXTERNAL']
  },
  DAILY_TRANSFER_COUNT: {
    type: Number,
    default: 0
  },
  DAILY_TRANSFER_AMOUNT: {
    type: Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },

  // =============================================
  // ACCOUNT REFERENCES
  // =============================================
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

  // =============================================
  // BUSINESS CONTEXT
  // =============================================
  BU_ID: { 
    type: Number, 
    required: true 
  },
  BRANCH_CODE: {
    type: String,
    maxlength: 10
  },
  LOCATION_CODE: {
    type: String,
    maxlength: 20
  },

  // =============================================
  // ASSIGNMENT MANAGEMENT
  // =============================================
  USER_ID: { 
    type: String, 
    required: true, 
    maxlength: 24 
  },
  CURRENT_ASSIGNEE_ID: { 
    type: Number, 
    required: true,
    default: 0
  },
  CURRENT_ASSIGNEE_NAME: { 
    type: String, 
    maxlength: 100 
  },
  CURRENT_ASSIGNEE_ROLE: {
    type: String,
    enum: ['TELLER', 'SUPERVISOR', 'MANAGER', 'VAULT_MANAGER', 'CASHIER'],
    default: 'TELLER'
  },
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
  SECONDARY_APPROVER_ID: {
    type: Number
  },
  SECONDARY_APPROVER_NAME: {
    type: String,
    maxlength: 100
  },
  LAST_REASSIGNMENT_ID: { 
    type: Number
  },
  LAST_REASSIGNMENT_DATE: { 
    type: Date 
  },
  TOTAL_REASSIGNMENTS: { 
    type: Number, 
    default: 0 
  },
  CURRENT_ASSIGNMENT_START: { 
    type: Date,
    default: Date.now 
  },
  ASSIGNED_BY: {
    type: String,
    maxlength: 24
  },
  REASSIGNED_BY: {
    type: String,
    maxlength: 24
  },

  // =============================================
  // OPERATIONAL METRICS
  // =============================================
  TOTAL_TRANSACTIONS_TODAY: {
    type: Number,
    default: 0
  },
  TOTAL_DEPOSITS_TODAY: {
    type: Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  TOTAL_WITHDRAWALS_TODAY: {
    type: Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  LAST_TRANSACTION_DATE: {
    type: Date
  },

  // =============================================
  // AUDIT FIELDS
  // =============================================
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
      const decimalFields = [
        'CURRENT_BALANCE', 'MIN_BAL', 'MAX_BAL', 'TOTAL_INSURED_AMT',
        'OVERAGE_AMT', 'SHORTAGE_AMT', 'SESSION_START_BALANCE', 
        'SESSION_END_BALANCE', 'LAST_TRANSFER_AMOUNT', 'DAILY_TRANSFER_AMOUNT',
        'TOTAL_DEPOSITS_TODAY', 'TOTAL_WITHDRAWALS_TODAY', 'VAULT_CAPACITY',
        'LAST_CLOSING_DIFFERENCE', 'LAST_CLOSING_EXPECTED_BALANCE', 
        'LAST_CLOSING_ACTUAL_BALANCE', 'ALLOWABLE_VARIANCE_AMOUNT',
        'TOTAL_OVERAGE_AMOUNT', 'TOTAL_SHORTAGE_AMOUNT'
      ];
      
      decimalFields.forEach(field => {
        if (ret[field]) ret[field] = parseFloat(ret[field].toString());
      });
      
      return ret;
    }
  }
});

// =============================================
// INDEXES FOR PERFORMANCE
// =============================================
DrawerSchema.index({ USER_ID: 1, WF_STATUS: 1 });
DrawerSchema.index({ BU_ID: 1, WF_STATUS: 1 });
DrawerSchema.index({ WF_STATUS: 1 });
DrawerSchema.index({ LAST_DRAWER_OPEN_DT: -1 });
DrawerSchema.index({ DRAWER_TY_CD: 1, WF_STATUS: 1 });
DrawerSchema.index({ VAULT_TYPE: 1 });
DrawerSchema.index({ OPENING_CURRENCY_DENOMINATION: 1 });
DrawerSchema.index({ CLOSING_CURRENCY_DENOMINATION: 1 });
DrawerSchema.index({ CURRENT_ASSIGNEE_ID: 1, WF_STATUS: 1 });
DrawerSchema.index({ TEMP_ASSIGNEE_ID: 1 });
DrawerSchema.index({ BU_ID: 1, CURRENT_ASSIGNEE_ID: 1 });
DrawerSchema.index({ LAST_REASSIGNMENT_DATE: -1 });
DrawerSchema.index({ CURRENT_ASSIGNMENT_START: -1 });
DrawerSchema.index({ LAST_TRANSFER_DATE: -1 });
DrawerSchema.index({ DAILY_TRANSFER_COUNT: -1 });
DrawerSchema.index({ LAST_TRANSACTION_DATE: -1 });
DrawerSchema.index({ TOTAL_TRANSACTIONS_TODAY: -1 });

// =============================================
// VIRTUAL FIELDS
// =============================================

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

// Virtual for vault utilization percentage
DrawerSchema.virtual('vaultUtilization').get(function() {
  if (this.DRAWER_TY_CD !== 'VAULT') return null;
  
  const current = parseFloat(this.CURRENT_BALANCE.toString());
  const capacity = parseFloat(this.VAULT_CAPACITY.toString());
  
  if (capacity === 0) return 0;
  return ((current / capacity) * 100).toFixed(2);
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
    role: this.CURRENT_ASSIGNEE_ROLE,
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

DrawerSchema.virtual('requiresDualAuthorization').get(function() {
  return this.DRAWER_TY_CD === 'VAULT' && this.REQUIRES_DUAL_CONTROL;
});

// Virtual for current variance status
DrawerSchema.virtual('varianceStatus').get(function() {
  const overage = parseFloat(this.OVERAGE_AMT.toString());
  const shortage = parseFloat(this.SHORTAGE_AMT.toString());
  
  if (overage > 0 && shortage > 0) {
    return 'BOTH';
  } else if (overage > 0) {
    return 'OVERAGE';
  } else if (shortage > 0) {
    return 'SHORTAGE';
  } else {
    return 'BALANCED';
  }
});

// =============================================
// SCHEMA METHODS
// =============================================

// Method to calculate overage/shortage during closing
DrawerSchema.methods.calculateOverageShortage = function(expectedBalance, actualBalance) {
  const difference = actualBalance - expectedBalance;
  const overageAmt = Math.max(0, difference);
  const shortageAmt = Math.max(0, -difference);
  
  // Store the calculation details
  this.LAST_CLOSING_DIFFERENCE = mongoose.Types.Decimal128.fromString(difference.toFixed(2));
  this.LAST_CLOSING_EXPECTED_BALANCE = mongoose.Types.Decimal128.fromString(expectedBalance.toFixed(2));
  this.LAST_CLOSING_ACTUAL_BALANCE = mongoose.Types.Decimal128.fromString(actualBalance.toFixed(2));
  this.OVERAGE_AMT = mongoose.Types.Decimal128.fromString(overageAmt.toFixed(2));
  this.SHORTAGE_AMT = mongoose.Types.Decimal128.fromString(shortageAmt.toFixed(2));
  
  // Update historical counts
  if (overageAmt > 0) {
    this.TOTAL_OVERAGE_COUNT += 1;
    const totalOverage = parseFloat(this.TOTAL_OVERAGE_AMOUNT.toString());
    this.TOTAL_OVERAGE_AMOUNT = mongoose.Types.Decimal128.fromString((totalOverage + overageAmt).toFixed(2));
  }
  
  if (shortageAmt > 0) {
    this.TOTAL_SHORTAGE_COUNT += 1;
    const totalShortage = parseFloat(this.TOTAL_SHORTAGE_AMOUNT.toString());
    this.TOTAL_SHORTAGE_AMOUNT = mongoose.Types.Decimal128.fromString((totalShortage + shortageAmt).toFixed(2));
  }
  
  // Set alert flags
  this.setOverageShortageAlerts(overageAmt, shortageAmt);
  
  return {
    difference,
    overageAmt,
    shortageAmt,
    isWithinTolerance: this.isWithinTolerance(difference)
  };
};

// Method to check if variance is within tolerance
DrawerSchema.methods.isWithinTolerance = function(difference) {
  const allowableAmount = parseFloat(this.ALLOWABLE_VARIANCE_AMOUNT.toString());
  const allowablePercent = this.ALLOWABLE_VARIANCE_PERCENT;
  
  const expectedBalance = parseFloat(this.LAST_CLOSING_EXPECTED_BALANCE.toString());
  const percentVariance = Math.abs(difference) / expectedBalance * 100;
  
  return Math.abs(difference) <= allowableAmount && percentVariance <= allowablePercent;
};

// Method to set alert flags based on severity
DrawerSchema.methods.setOverageShortageAlerts = function(overageAmt, shortageAmt) {
  const allowableAmount = parseFloat(this.ALLOWABLE_VARIANCE_AMOUNT.toString());
  
  // Overage alerts
  if (overageAmt === 0) {
    this.OVERAGE_ALERT_FLAG = 'NONE';
  } else if (overageAmt <= allowableAmount) {
    this.OVERAGE_ALERT_FLAG = 'WARNING';
  } else {
    this.OVERAGE_ALERT_FLAG = 'CRITICAL';
  }
  
  // Shortage alerts
  if (shortageAmt === 0) {
    this.SHORTAGE_ALERT_FLAG = 'NONE';
  } else if (shortageAmt <= allowableAmount) {
    this.SHORTAGE_ALERT_FLAG = 'WARNING';
  } else {
    this.SHORTAGE_ALERT_FLAG = 'CRITICAL';
  }
};

// Method to approve overage/shortage
DrawerSchema.methods.approveOverageShortage = function(approvedBy, notes, approvalType) {
  const now = new Date();
  
  if (approvalType === 'OVERAGE' && parseFloat(this.OVERAGE_AMT.toString()) > 0) {
    this.OVERAGE_APPROVED_BY = approvedBy;
    this.OVERAGE_APPROVAL_DATE = now;
    this.OVERAGE_APPROVAL_NOTES = notes;
    this.OVERAGE_ALERT_FLAG = 'NONE';
  }
  
  if (approvalType === 'SHORTAGE' && parseFloat(this.SHORTAGE_AMT.toString()) > 0) {
    this.SHORTAGE_APPROVED_BY = approvedBy;
    this.SHORTAGE_APPROVAL_DATE = now;
    this.SHORTAGE_APPROVAL_NOTES = notes;
    this.SHORTAGE_ALERT_FLAG = 'NONE';
  }
};

// Method to get overage/shortage summary
DrawerSchema.methods.getOverageShortageSummary = function() {
  const overageAmt = parseFloat(this.OVERAGE_AMT.toString());
  const shortageAmt = parseFloat(this.SHORTAGE_AMT.toString());
  const difference = parseFloat(this.LAST_CLOSING_DIFFERENCE.toString());
  const expected = parseFloat(this.LAST_CLOSING_EXPECTED_BALANCE.toString());
  const actual = parseFloat(this.LAST_CLOSING_ACTUAL_BALANCE.toString());
  
  return {
    expectedBalance: expected,
    actualBalance: actual,
    difference: difference,
    overageAmount: overageAmt,
    shortageAmount: shortageAmt,
    isWithinTolerance: this.isWithinTolerance(difference),
    overageAlert: this.OVERAGE_ALERT_FLAG,
    shortageAlert: this.SHORTAGE_ALERT_FLAG,
    variancePercentage: expected > 0 ? ((Math.abs(difference) / expected) * 100).toFixed(2) : 0,
    requiresApproval: (overageAmt > 0 || shortageAmt > 0) && 
                     !this.isWithinTolerance(difference)
  };
};

// Method to check if drawer can process transaction
DrawerSchema.methods.canProcessTransaction = function(amount, transactionType) {
  const currentBalance = parseFloat(this.CURRENT_BALANCE.toString());
  const minBalance = parseFloat(this.MIN_BAL.toString());
  const maxBalance = parseFloat(this.MAX_BAL.toString());
  
  // Check if drawer is open and active
  if (this.WF_STATUS !== 'OPEN' || this.REC_ST !== 'A') {
    return { canProcess: false, reason: 'Drawer is not open or active' };
  }
  
  // Check for withdrawals
  if (transactionType === 'WITHDRAWAL') {
    const availableBalance = currentBalance - minBalance;
    if (amount > availableBalance) {
      return { 
        canProcess: false, 
        reason: `Insufficient funds. Available: ${availableBalance}, Requested: ${amount}` 
      };
    }
  }
  
  // Check for deposits
  if (transactionType === 'DEPOSIT') {
    const projectedBalance = currentBalance + amount;
    if (projectedBalance > maxBalance) {
      return { 
        canProcess: false, 
        reason: `Deposit would exceed maximum balance. Max: ${maxBalance}, Projected: ${projectedBalance}` 
      };
    }
  }
  
  return { canProcess: true };
};

// Enhanced transfer validation method
DrawerSchema.methods.canProcessTransfer = function(amount, targetDrawerType, transferType) {
  const currentBalance = parseFloat(this.CURRENT_BALANCE.toString());
  const minBalance = parseFloat(this.MIN_BAL.toString());
  
  // Check basic availability
  if (this.WF_STATUS !== 'OPEN' || this.REC_ST !== 'A') {
    return { canTransfer: false, reason: 'Drawer is not open or active' };
  }
  
  // Check balance for outgoing transfers
  if (transferType === 'OUTGOING') {
    const availableBalance = currentBalance - minBalance;
    if (amount > availableBalance) {
      return { 
        canTransfer: false, 
        reason: `Insufficient funds for transfer. Available: ${availableBalance}, Requested: ${amount}` 
      };
    }
  }
  
  // Check if dual authorization required for vault transfers
  if (this.DRAWER_TY_CD === 'VAULT' && this.REQUIRES_DUAL_CONTROL && !this.SECONDARY_APPROVER_ID) {
    return { 
      canTransfer: false, 
      reason: 'Dual authorization required for vault transfers' 
    };
  }
  
  return { canTransfer: true };
};

// Method to update transfer metrics
DrawerSchema.methods.updateTransferMetrics = function(amount, transferType) {
  const transferAmount = parseFloat(amount);
  
  this.LAST_TRANSFER_AMOUNT = mongoose.Types.Decimal128.fromString(transferAmount.toFixed(2));
  this.LAST_TRANSFER_DATE = new Date();
  this.DAILY_TRANSFER_COUNT += 1;
  
  const currentDailyAmount = parseFloat(this.DAILY_TRANSFER_AMOUNT.toString());
  this.DAILY_TRANSFER_AMOUNT = mongoose.Types.Decimal128.fromString(
    (currentDailyAmount + transferAmount).toFixed(2)
  );
  
  // Update balance based on transfer type
  const currentBalance = parseFloat(this.CURRENT_BALANCE.toString());
  if (transferType === 'OUTGOING') {
    this.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString(
      (currentBalance - transferAmount).toFixed(2)
    );
  } else if (transferType === 'INCOMING') {
    this.CURRENT_BALANCE = mongoose.Types.Decimal128.fromString(
      (currentBalance + transferAmount).toFixed(2)
    );
  }
};

// Method to reset daily metrics
DrawerSchema.methods.resetDailyMetrics = function() {
  this.TOTAL_TRANSACTIONS_TODAY = 0;
  this.TOTAL_DEPOSITS_TODAY = mongoose.Types.Decimal128.fromString('0.00');
  this.TOTAL_WITHDRAWALS_TODAY = mongoose.Types.Decimal128.fromString('0.00');
  this.DAILY_TRANSFER_COUNT = 0;
  this.DAILY_TRANSFER_AMOUNT = mongoose.Types.Decimal128.fromString('0.00');
};

// Assignment Methods
DrawerSchema.methods.assignToUser = function(userId, userName, userRole, assignedBy) {
  this.CURRENT_ASSIGNEE_ID = userId;
  this.CURRENT_ASSIGNEE_NAME = userName;
  this.CURRENT_ASSIGNEE_ROLE = userRole;
  this.CURRENT_ASSIGNMENT_START = new Date();
  this.ASSIGNED_BY = assignedBy;
  this.USER_ID = userId.toString();
  this.TOTAL_REASSIGNMENTS += 1;
  this.LAST_REASSIGNMENT_DATE = new Date();
  this.REASSIGNED_BY = assignedBy;
};

DrawerSchema.methods.temporaryAssign = function(tempUserId, tempUserName, assignedBy, reason, durationHours = 8) {
  this.TEMP_ASSIGNEE_ID = tempUserId;
  this.TEMP_ASSIGNEE_NAME = tempUserName;
  this.TEMP_ASSIGNMENT_START = new Date();
  this.TEMP_ASSIGNMENT_END = new Date(Date.now() + durationHours * 60 * 60 * 1000);
  this.TEMP_ASSIGNMENT_REASON = reason;
  this.ASSIGNED_BY = assignedBy;
};

DrawerSchema.methods.endTemporaryAssignment = function() {
  this.TEMP_ASSIGNEE_ID = null;
  this.TEMP_ASSIGNEE_NAME = null;
  this.TEMP_ASSIGNMENT_START = null;
  this.TEMP_ASSIGNMENT_END = null;
  this.TEMP_ASSIGNMENT_REASON = null;
};

DrawerSchema.methods.canReassign = function() {
  // Cannot reassign if drawer is open
  if (this.WF_STATUS === 'OPEN') {
    return { canReassign: false, reason: 'Cannot reassign open drawer' };
  }
  
  // Check if temporary assignment is active
  if (this.TEMP_ASSIGNEE_ID && this.TEMP_ASSIGNMENT_END > new Date()) {
    return { canReassign: false, reason: 'Temporary assignment is still active' };
  }
  
  return { canReassign: true };
};

// =============================================
// STATIC METHODS
// =============================================

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

// Static method to find vaults
DrawerSchema.statics.findVaults = function(businessUnitId = null) {
  const query = {
    DRAWER_TY_CD: 'VAULT',
    REC_ST: 'A'
  };
  
  if (businessUnitId) {
    query.BU_ID = businessUnitId;
  }
  
  return this.find(query);
};

// Static method to find teller drawers
DrawerSchema.statics.findTellerDrawers = function(businessUnitId = null) {
  const query = {
    DRAWER_TY_CD: 'TELLER',
    REC_ST: 'A'
  };
  
  if (businessUnitId) {
    query.BU_ID = businessUnitId;
  }
  
  return this.find(query);
};

// Assignment Static Methods
DrawerSchema.statics.findByAssignee = function(assigneeId, includeTemporary = true) {
  const query = {
    REC_ST: 'A'
  };
  
  if (includeTemporary) {
    query.$or = [
      { CURRENT_ASSIGNEE_ID: assigneeId },
      { TEMP_ASSIGNEE_ID: assigneeId }
    ];
  } else {
    query.CURRENT_ASSIGNEE_ID = assigneeId;
  }
  
  return this.find(query);
};

DrawerSchema.statics.findAssignedDrawers = function(businessUnitId = null) {
  const query = {
    $or: [
      { CURRENT_ASSIGNEE_ID: { $ne: 0 } },
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
    TEMP_ASSIGNMENT_END: { $gt: new Date() },
    REC_ST: 'A'
  });
};

// Static method to get drawers exceeding limits
DrawerSchema.statics.findDrawersExceedingLimits = function() {
  return this.aggregate([
    {
      $match: {
        REC_ST: 'A',
        WF_STATUS: 'OPEN'
      }
    },
    {
      $project: {
        DRAWER_ID: 1,
        DRAWER_NO: 1,
        DRAWER_NM: 1,
        CURRENT_BALANCE: 1,
        MAX_BAL: 1,
        MIN_BAL: 1,
        currentBalanceValue: { $toDouble: '$CURRENT_BALANCE' },
        maxBalanceValue: { $toDouble: '$MAX_BAL' },
        minBalanceValue: { $toDouble: '$MIN_BAL' }
      }
    },
    {
      $match: {
        $or: [
          { currentBalanceValue: { $gt: '$maxBalanceValue' } },
          { currentBalanceValue: { $lt: '$minBalanceValue' } }
        ]
      }
    }
  ]);
};

// Static method to find drawers with unresolved overage/shortage
DrawerSchema.statics.findDrawersWithVariance = function() {
  return this.find({
    $or: [
      { OVERAGE_ALERT_FLAG: { $in: ['WARNING', 'CRITICAL'] } },
      { SHORTAGE_ALERT_FLAG: { $in: ['WARNING', 'CRITICAL'] } }
    ],
    REC_ST: 'A'
  });
};

// Static method to find drawers requiring approval
DrawerSchema.statics.findDrawersRequiringApproval = function() {
  return this.find({
    $and: [
      {
        $or: [
          { OVERAGE_AMT: { $gt: mongoose.Types.Decimal128.fromString('0.00') } },
          { SHORTAGE_AMT: { $gt: mongoose.Types.Decimal128.fromString('0.00') } }
        ]
      },
      {
        $or: [
          { OVERAGE_APPROVED_BY: null },
          { SHORTAGE_APPROVED_BY: null }
        ]
      }
    ],
    REC_ST: 'A'
  });
};

// =============================================
// MIDDLEWARE
// =============================================

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
  
  // Set default vault capacity if not set
  if (this.DRAWER_TY_CD === 'VAULT' && !this.VAULT_CAPACITY) {
    this.VAULT_CAPACITY = mongoose.Types.Decimal128.fromString('10000000.00'); // 10 million default
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