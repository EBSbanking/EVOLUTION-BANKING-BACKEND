import mongoose from 'mongoose';
import Decimal from 'decimal.js';

const chargeSchema = new mongoose.Schema({
  // Oracle fields (main structure)
  CHRG_ID: {
    type: Number,
    required: true,
    unique: true
  },
  CHRG_CD: {
    type: String,
    required: true,
    maxlength: 10,
    unique: true
  },
  CHRG_TY: {
    type: String,
    required: true,
    maxlength: 10,
    enum: ['FLAT', 'PERCENTAGE', 'TIERED', 'VOLUME', 'TIME_BASED']
  },
  CHRG_NM: {
    type: String,
    maxlength: 100,
    // Removed unique: true constraint
  },
  TIER_TY: {
    type: String,
    required: true,
    maxlength: 10,
    enum: ['STANDARD', 'PREMIUM', 'ENTERPRISE', 'CUSTOM']
  },
  CALC_BASIS_TY: {
    type: String,
    maxlength: 10,
    enum: ['AMOUNT', 'BALANCE', 'TRANSACTION', 'VOLUME', 'TIME']
  },
  CHRG_AMT: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? new Decimal(v.toString()) : null,
    set: (v) => v !== null && v !== undefined ? mongoose.Types.Decimal128.fromString(v.toString()) : null
  },
  CHRG_PCT: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? new Decimal(v.toString()) : null,
    set: (v) => v !== null && v !== undefined ? mongoose.Types.Decimal128.fromString(v.toString()) : null
  },
  SETLMNT_OPTN: {
    type: String,
    maxlength: 1,
    enum: ['O', 'C']
  },
  FREQ_NO: {
    type: Number,
    min: 0
  },
  FREQ_DD: {
    type: Number,
    min: 1,
    max: 31
  },
  FREQ_MM: {
    type: Number,
    min: 1,
    max: 12
  },
  SETLMNT_OPTN1_TY: {
    type: String,
    maxlength: 10
  },
  SETLMNT_OPTN2_TY: {
    type: String,
    maxlength: 10
  },
  DEF_SETLMNT_OPTN_TY: {
    type: String,
    maxlength: 10
  },
  MIN_BAL_WAIVER_AMT: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? new Decimal(v.toString()) : null,
    set: (v) => v !== null && v !== undefined ? mongoose.Types.Decimal128.fromString(v.toString()) : null
  },
  BAL_BASIS_TY: {
    type: String,
    maxlength: 10
  },
  BANK_COST: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? new Decimal(v.toString()) : null,
    set: (v) => v !== null && v !== undefined ? mongoose.Types.Decimal128.fromString(v.toString()) : null
  },
  EFFECTIVE_DT: {
    type: Date,
    required: true,
    default: Date.now
  },
  REC_ST: {
    type: String,
    required: true,
    maxlength: 1,
    enum: ['A', 'I'],
    default: 'A'
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
    maxlength: 24,
    default: 'system'
  },
  FREQ_CD: {
    type: String,
    maxlength: 10,
    enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ON_DEMAND']
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
    maxlength: 24,
    default: 'system'
  },
  MIN_AMT_PER_OCCURRENCE: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? new Decimal(v.toString()) : null,
    set: (v) => v !== null && v !== undefined ? mongoose.Types.Decimal128.fromString(v.toString()) : null
  },
  MAX_AMT_PER_OCCURRENCE: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? new Decimal(v.toString()) : null,
    set: (v) => v !== null && v !== undefined ? mongoose.Types.Decimal128.fromString(v.toString()) : null
  },
  MIN_AMT_PER_PD: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? new Decimal(v.toString()) : null,
    set: (v) => v !== null && v !== undefined ? mongoose.Types.Decimal128.fromString(v.toString()) : null
  },
  MAX_AMT_PER_PD: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? new Decimal(v.toString()) : null,
    set: (v) => v !== null && v !== undefined ? mongoose.Types.Decimal128.fromString(v.toString()) : null
  },
  ABSOLUTE_MAX_AMT: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? new Decimal(v.toString()) : null,
    set: (v) => v !== null && v !== undefined ? mongoose.Types.Decimal128.fromString(v.toString()) : null
  },
  RATEQUOT_METHOD_CD: {
    type: String,
    maxlength: 10,
    default: 'ANNUL',
    enum: ['ANNUL', 'MONTHLY', 'QUARTERLY', 'DAILY']
  },
  CRNCY_ID: {
    type: Number,
    required: true,
    default: 3
  },
  CALC_TRIGGER_CD: {
    type: String,
    maxlength: 10,
    default: 'EVENT',
    enum: ['EVENT', 'SCHEDULE', 'MANUAL', 'AUTO']
  },
  CALC_FREQ_CD: {
    type: String,
    maxlength: 10
  },
  CALC_FREQ_NO: {
    type: Number,
    min: 0
  },
  EARN_METHOD_CD: {
    type: String,
    maxlength: 10,
    default: 'IMM',
    enum: ['IMM', 'DEFERRED', 'AMORTIZED']
  },
  INCOME_GL_ACCT_NO: {
    type: String,
    maxlength: 60,
    default: 'NONE'
  },
  UNEARN_GL_ACCT_NO: {
    type: String,
    maxlength: 60
  },
  PERIOD_TY_FREQ_CD: {
    type: String,
    maxlength: 10
  },
  PERIOD_TY_FREQ_NO: {
    type: Number,
    min: 0
  },
  SETLMNT_OPTN_CD: {
    type: String,
    maxlength: 10,
    default: 'OWN',
    enum: ['OWN', 'THIRD_PARTY', 'SPLIT']
  },
// In your Charge model, update the BAL_ACTION_CD enum:
BAL_ACTION_CD: {
  type: String,
  required: true,
  maxlength: 10,
  enum: ['DEBIT', 'CREDIT', 'BOTH', 'NONE'] // Make sure 'DEBIT' is included
},

  POSTING_FREQ_CD: {
    type: String,
    maxlength: 10
  },
  POSTING_FREQ_NO: {
    type: Number,
    min: 0
  },
  MAX_AMT_YTD: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? new Decimal(v.toString()) : null,
    set: (v) => v !== null && v !== undefined ? mongoose.Types.Decimal128.fromString(v.toString()) : null
  },
  FREE_ITEMS_PER_DAY: {
    type: Number,
    min: 0
  },
  EXCESS_PER_DAY_OPTN_CD: {
    type: String,
    maxlength: 10
  },
  FREE_ITEMS_PER_PD: {
    type: Number,
    min: 0
  },
  EXCESS_PER_PD_OPTN_CD: {
    type: String,
    maxlength: 10
  },
  GRACE_DAYS: {
    type: Number,
    min: 0
  },
  COMNCMNT_DT_OPTN_CD: {
    type: String,
    maxlength: 10
  },
  COMNCMNT_FROM_DT: {
    type: Date
  },
  COMNCMNT_TO_DT: {
    type: Date
  },
  EXEMP_BAL_BASIS_CD: {
    type: String,
    maxlength: 10
  },
  EXEMP_BAL_THRESHOLD: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? new Decimal(v.toString()) : null,
    set: (v) => v !== null && v !== undefined ? mongoose.Types.Decimal128.fromString(v.toString()) : null
  },
  PERIOD_TY_CD: {
    type: String,
    maxlength: 10
  },
  WAIVE_OPTION_CD: {
    type: String,
    maxlength: 10,
    default: 'NO',
    enum: ['YES', 'NO', 'CONDITIONAL']
  },
  CHRG_DESC: {
    type: String,
    maxlength: 100,
    default: 'description'
  },
  INCLUDE_STRT_DT_FG: {
    type: String,
    maxlength: 1,
    default: 'N',
    enum: ['Y', 'N']
  },
  MIN_PREIOD_DAY: {
    type: Number,
    min: 0
  },
  DAYS_IN_YR: {
    type: Number,
    min: 360,
    max: 365
  },
  FEE_CYCLE_PERIOD: {
    type: Number,
    min: 0
  },
  INCOME_SUSP_GL_ACCT_NO: {
    type: String,
    maxlength: 60
  },
  CHRG_SCOPE: {
    type: String,
    maxlength: 10,
    enum: ['GLOBAL', 'PRODUCT', 'CUSTOMER', 'ACCOUNT']
  },
  CHANNEL_ID: {
    type: Number
  },
  TENOR_FREQ_CD: {
    type: String,
    maxlength: 10
  },
  AMORTISATION_METH_CD: {
    type: String,
    maxlength: 10,
    enum: ['STRAIGHT', 'DECLINING', 'BALLOON']
  },
  EXT_RULE_SET_ID: {
    type: Number
  },

  // Simplified fields for chargesSetup compatibility
  chargeType: {
    type: String,
    maxlength: 10,
    enum: ['FLAT', 'PERCENTAGE', 'TIERED', 'VOLUME', 'TIME_BASED']
  },
  chargeAmount: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? new Decimal(v.toString()) : null,
    set: (v) => v !== null && v !== undefined ? mongoose.Types.Decimal128.fromString(v.toString()) : null
  },
  chargeGLAccountNo: {
    type: String,
    maxlength: 60
  }
}, {
  timestamps: false,
  toJSON: { 
    getters: true,
    virtuals: true,
    transform: function(doc, ret) {
      // Remove internal fields when converting to JSON
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  },
  toObject: { 
    getters: true,
    virtuals: true 
  }
});



// Pre-save middleware to handle automatic fields and synchronization
chargeSchema.pre('save', function(next) {
  const now = new Date();
  
  if (this.isNew) {
    if (!this.CREATE_DT) this.CREATE_DT = now;
    if (!this.SYS_CREATE_TS) this.SYS_CREATE_TS = now;
    if (!this.ROW_TS) this.ROW_TS = now;
    if (!this.EFFECTIVE_DT) this.EFFECTIVE_DT = now;
    if (!this.USER_ID) this.USER_ID = 'system';
    if (!this.CREATED_BY) this.CREATED_BY = 'system';
    if (!this.VERSION_NO) this.VERSION_NO = 1;
  }
  
  this.ROW_TS = now; // Update row timestamp on every save

  // Synchronize simplified fields with Oracle fields
  if (this.chargeType && !this.CHRG_TY) {
    this.CHRG_TY = this.chargeType;
  } else if (this.CHRG_TY && !this.chargeType) {
    this.chargeType = this.CHRG_TY;
  }

  if (this.chargeAmount !== undefined && this.chargeAmount !== null && !this.CHRG_AMT) {
    this.CHRG_AMT = this.chargeAmount;
  } else if (this.CHRG_AMT !== undefined && this.CHRG_AMT !== null && !this.chargeAmount) {
    this.chargeAmount = this.CHRG_AMT;
  }

  if (this.chargeGLAccountNo && !this.INCOME_GL_ACCT_NO) {
    this.INCOME_GL_ACCT_NO = this.chargeGLAccountNo;
  } else if (this.INCOME_GL_ACCT_NO && !this.chargeGLAccountNo) {
    this.chargeGLAccountNo = this.INCOME_GL_ACCT_NO;
  }

  next();
});

// Virtual for formatted charge amount
chargeSchema.virtual('formattedChargeAmount').get(function() {
  return this.CHRG_AMT ? new Decimal(this.CHRG_AMT.toString()).toFixed(2) : '0.00';
});

// Virtual for simplified response
chargeSchema.virtual('simplified').get(function() {
  return {
    chargeId: this.CHRG_ID,
    chargeCode: this.CHRG_CD,
    chargeType: this.CHRG_TY,
    chargeName: this.CHRG_NM,
    chargeAmount: this.CHRG_AMT ? parseFloat(this.CHRG_AMT.toString()) : null,
    chargePercentage: this.CHRG_PCT ? parseFloat(this.CHRG_PCT.toString()) : null,
    chargeGLAccountNo: this.INCOME_GL_ACCT_NO,
    status: this.REC_ST,
    description: this.CHRG_DESC,
    tierType: this.TIER_TY,
    calculationBasis: this.CALC_BASIS_TY,
    settlementOption: this.SETLMNT_OPTN,
    currencyId: this.CRNCY_ID,
    effectiveDate: this.EFFECTIVE_DT,
    version: this.VERSION_NO
  };
});

// Static method to find active charges
chargeSchema.statics.findActive = function() {
  return this.find({ REC_ST: 'A' });
};

// Static method to find by charge type
chargeSchema.statics.findByType = function(type) {
  return this.find({ 
    CHRG_TY: type.toUpperCase(),
    REC_ST: 'A'
  });
};

// Instance method to check if charge is active
chargeSchema.methods.isActive = function() {
  return this.REC_ST === 'A';
};

// Instance method to convert to simplified format
chargeSchema.methods.toSimplified = function() {
  return this.simplified;
};

const Charge = mongoose.model('Charge', chargeSchema);

export default Charge;