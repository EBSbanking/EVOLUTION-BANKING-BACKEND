// models/DrawerCloseOut.js
import mongoose from 'mongoose';

const DrawerCloseOutSchema = new mongoose.Schema({
  // Primary Identification
  DRAWER_CLOSEOUT_ID: {
    type: Number,
    required: true,
    unique: true,
  },
  
  // Drawer Reference
  DRAWER_ID: {
    type: Number,
    required: true,
    ref: 'Drawer'
  },
  DRAWER_NO: { // Denormalized for easier queries
    type: String,
    required: true,
    maxlength: 20
  },
  
  // Session Information
  SESSION_START_DT: {
    type: Date,
    required: true
  },
  SESSION_END_DT: {
    type: Date,
    required: true,
    default: Date.now
  },
  SESSION_DURATION: { // Calculated duration in minutes
    type: Number,
    required: true
  },
  
  // Financial Summary
  OPENING_BALANCE: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  CLOSING_BALANCE: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  EXPECTED_BALANCE: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  
  // Transaction Totals
  TOTAL_DEPOSITS: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  TOTAL_WITHDRAWALS: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  TOTAL_CASH_RECEIPTS: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  TOTAL_CASH_DISBURSEMENTS: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  
  // Transaction Counts
  DEPOSIT_COUNT: {
    type: Number,
    required: true,
    default: 0
  },
  WITHDRAWAL_COUNT: {
    type: Number,
    required: true,
    default: 0
  },
  CASH_RECEIPT_COUNT: {
    type: Number,
    required: true,
    default: 0
  },
  CASH_DISBURSEMENT_COUNT: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Settlement Information
  OVERAGE_AMT: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  SHORTAGE_AMT: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  DIFFERENCE_AMT: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  
  // Currency Information
  CURRENCY_ID: {
    type: Number,
    required: true
  },
  CURRENCY_DENOMINATIONS: {
    OneThousandNaira: { type: Number, default: 0 },
    FiveHundredNaira: { type: Number, default: 0 },
    TwoHundredNaira: { type: Number, default: 0 },
    OneHundredNaira: { type: Number, default: 0 },
    FiftyNaira: { type: Number, default: 0 },
    TwentyNaira: { type: Number, default: 0 },
    TenNaira: { type: Number, default: 0 },
    FiveNaira: { type: Number, default: 0 },
    TOTAL_CURRENCY_COUNT: { type: Number, default: 0 },
    CALCULATED_AMOUNT: { type: mongoose.Schema.Types.Decimal128, default: mongoose.Types.Decimal128.fromString('0.00') }
  },
  
  // Verification Details
  VERIFIED_BY: {
    type: String,
    required: true,
    maxlength: 24
  },
  COUNTED_BY: {
    type: String,
    maxlength: 24
  },
  SUPERVISOR_APPROVAL: {
    type: String,
    maxlength: 24
  },
  VERIFICATION_NOTES: {
    type: String,
    maxlength: 500
  },
  
  // Closeout Status
  CLOSEOUT_STATUS: {
    type: String,
    required: true,
    enum: ['PENDING', 'VERIFIED', 'APPROVED', 'DISPUTED', 'ADJUSTED'],
    default: 'PENDING'
  },
  FORCE_CLOSED: {
    type: Boolean,
    default: false
  },
  FORCE_CLOSE_REASON: {
    type: String,
    maxlength: 200
  },
  
  // Business Context
  BU_ID: {
    type: Number,
    required: true
  },
  USER_ID: { // Teller who operated the drawer
    type: String,
    required: true,
    maxlength: 24
  },
  CURRENT_ASSIGNEE_ID: { // For assignment tracking
    type: Number,
    required: true
  },
  
  // Audit Fields
  REC_ST: {
    type: String,
    required: true,
    enum: ['A', 'I', 'C'],
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
  }

}, {
  timestamps: true, // Adds createdAt and updatedAt
  toJSON: { 
    transform: function(doc, ret) {
      // Convert Decimal128 to string for JSON response
      const decimalFields = [
        'OPENING_BALANCE', 'CLOSING_BALANCE', 'EXPECTED_BALANCE',
        'TOTAL_DEPOSITS', 'TOTAL_WITHDRAWALS', 'TOTAL_CASH_RECEIPTS', 'TOTAL_CASH_DISBURSEMENTS',
        'OVERAGE_AMT', 'SHORTAGE_AMT', 'DIFFERENCE_AMT'
      ];
      
      decimalFields.forEach(field => {
        if (ret[field]) ret[field] = parseFloat(ret[field].toString());
      });
      
      if (ret.CURRENCY_DENOMINATIONS && ret.CURRENCY_DENOMINATIONS.CALCULATED_AMOUNT) {
        ret.CURRENCY_DENOMINATIONS.CALCULATED_AMOUNT = parseFloat(ret.CURRENCY_DENOMINATIONS.CALCULATED_AMOUNT.toString());
      }
      
      return ret;
    }
  }
});

// Indexes for better performance
DrawerCloseOutSchema.index({ DRAWER_ID: 1, SESSION_END_DT: -1 });
DrawerCloseOutSchema.index({ USER_ID: 1, SESSION_END_DT: -1 });
DrawerCloseOutSchema.index({ BU_ID: 1, SESSION_END_DT: -1 });
DrawerCloseOutSchema.index({ SESSION_END_DT: -1 });
DrawerCloseOutSchema.index({ CLOSEOUT_STATUS: 1 });

// Virtual for net cash movement
DrawerCloseOutSchema.virtual('netCashMovement').get(function() {
  const deposits = parseFloat(this.TOTAL_DEPOSITS.toString());
  const withdrawals = parseFloat(this.TOTAL_WITHDRAWALS.toString());
  const receipts = parseFloat(this.TOTAL_CASH_RECEIPTS.toString());
  const disbursements = parseFloat(this.TOTAL_CASH_DISBURSEMENTS.toString());
  
  return (deposits + receipts) - (withdrawals + disbursements);
});

// Virtual for total transactions
DrawerCloseOutSchema.virtual('totalTransactions').get(function() {
  return this.DEPOSIT_COUNT + this.WITHDRAWAL_COUNT + this.CASH_RECEIPT_COUNT + this.CASH_DISBURSEMENT_COUNT;
});

// Static method to find closeouts by drawer
DrawerCloseOutSchema.statics.findByDrawer = function(drawerId, limit = 50) {
  return this.find({ 
    DRAWER_ID: drawerId,
    REC_ST: 'A'
  })
  .sort({ SESSION_END_DT: -1 })
  .limit(limit);
};

// Static method to find closeouts by date range
DrawerCloseOutSchema.statics.findByDateRange = function(startDate, endDate, businessUnitId = null) {
  const query = {
    SESSION_END_DT: {
      $gte: startDate,
      $lte: endDate
    },
    REC_ST: 'A'
  };
  
  if (businessUnitId) {
    query.BU_ID = businessUnitId;
  }
  
  return this.find(query).sort({ SESSION_END_DT: -1 });
};

// Static method to find pending closeouts
DrawerCloseOutSchema.statics.findPendingCloseouts = function(businessUnitId = null) {
  const query = {
    CLOSEOUT_STATUS: 'PENDING',
    REC_ST: 'A'
  };
  
  if (businessUnitId) {
    query.BU_ID = businessUnitId;
  }
  
  return this.find(query).sort({ SESSION_END_DT: -1 });
};

// Method to verify closeout
DrawerCloseOutSchema.methods.verifyCloseout = function(verifiedBy, notes = '') {
  this.CLOSEOUT_STATUS = 'VERIFIED';
  this.VERIFIED_BY = verifiedBy;
  this.VERIFICATION_NOTES = notes;
  this.VERSION_NO += 1;
};

// Method to approve closeout
DrawerCloseOutSchema.methods.approveCloseout = function(approvedBy) {
  this.CLOSEOUT_STATUS = 'APPROVED';
  this.SUPERVISOR_APPROVAL = approvedBy;
  this.VERSION_NO += 1;
};

// Method to flag as disputed
DrawerCloseOutSchema.methods.flagAsDisputed = function(reason) {
  this.CLOSEOUT_STATUS = 'DISPUTED';
  this.VERIFICATION_NOTES = reason;
  this.VERSION_NO += 1;
};

// Pre-save middleware to calculate derived fields
DrawerCloseOutSchema.pre('save', function(next) {
  if (this.isModified()) {
    this.VERSION_NO += 1;
    this.ROW_TS = new Date();
  }
  
  // Calculate difference
  const closing = parseFloat(this.CLOSING_BALANCE.toString());
  const expected = parseFloat(this.EXPECTED_BALANCE.toString());
  this.DIFFERENCE_AMT = mongoose.Types.Decimal128.fromString((closing - expected).toFixed(2));
  
  // Calculate session duration in minutes
  if (this.SESSION_START_DT && this.SESSION_END_DT) {
    const durationMs = this.SESSION_END_DT - this.SESSION_START_DT;
    this.SESSION_DURATION = Math.floor(durationMs / (1000 * 60)); // Convert to minutes
  }
  
  next();
});

const DrawerCloseOut = mongoose.model('DrawerCloseOut', DrawerCloseOutSchema);

export default DrawerCloseOut;