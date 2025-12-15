// models/Rate-Index.js - UPDATED COMPLETE VERSION
import mongoose from 'mongoose';

const rateIndexSchema = new mongoose.Schema({
  // Required fields from your frontend
  INDEX_RATE_ID: {
    type: Number,
    required: [true, 'Rate Index ID is required'],
    unique: true,
    index: true
  },
  INDEX_CD: {
    type: String,
    required: [true, 'Rate Code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    index: true
  },
  INDEX_RATE: {
    type: Number,
    required: [true, 'Rate value is required'],
    min: [0, 'Rate cannot be negative'],
    max: [1000, 'Rate cannot exceed 1000%'],
    description: "Annual interest rate (in percentage)"
  },
  INDEX_NM: {
    type: String,
    required: [true, 'Rate Name is required'],
    trim: true
  },
  
  // New fields needed for your frontend
  RATE_TYPE: {
    type: String,
    enum: ['FIXED', 'VARIABLE', 'PRIME', 'INTERBANK', 'TREASURY_BILL', 'OTHER'],
    default: 'FIXED',
    required: true
  },
  CRNCY_ID: {
    type: String,
    required: [true, 'Currency is required'],
    uppercase: true,
    default: 'NGN'
  },
  PRECISION: {
    type: Number,
    required: true,
    min: [2, 'Precision must be at least 2'],
    max: [8, 'Precision cannot exceed 8'],
    default: 4
  },
  EFFECTIVE_DT: {
    type: Date,
    required: [true, 'Effective date is required'],
    default: Date.now
  },
  DAY_COUNT_CONVENTION: {
    type: String,
    enum: ['ACTUAL/360', 'ACTUAL/365', '30/360', 'BUSINESS/252', 'ACTUAL/ACTUAL'],
    default: 'ACTUAL/360',
    required: true
  },
  IS_DEFAULT: {
    type: Boolean,
    default: false,
    index: true
  },
  STATUS: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE', 'PENDING', 'ARCHIVED', 'DRAFT'],
    default: 'ACTIVE',
    required: true
  },
  DESCRIPTION: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  
  // System fields
  CREATED_BY: {
    type: String,
    required: true,
    default: 'SYSTEM'
  },
  UPDATED_BY: {
    type: String,
    required: true,
    default: 'SYSTEM'
  },
  CREATED_AT: {
    type: Date,
    default: Date.now
  },
  UPDATED_AT: {
    type: Date,
    default: Date.now
  },
  
  // Additional optional fields
  EXPIRY_DT: {
    type: Date,
    validate: {
      validator: function(date) {
        return !date || date > this.EFFECTIVE_DT;
      },
      message: 'Expiry date must be after effective date'
    }
  },
  SOURCE: {
    type: String,
    enum: ['CENTRAL_BANK', 'INTERBANK', 'MARKET', 'MANUAL', 'SYSTEM'],
    default: 'MANUAL'
  },
  VALIDITY_PERIOD: {
    type: Number,
    min: 1,
    description: "Validity period in days"
  },
  NOTES: {
    type: String,
    trim: true
  },
  VERSION: {
    type: String,
    default: '1.0'
  },
  IS_ACTIVE: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      delete ret._id;
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Virtual for display name
rateIndexSchema.virtual('displayName').get(function() {
  return `${this.INDEX_NM} (${this.INDEX_CD})`;
});

// Virtual for formatted rate
rateIndexSchema.virtual('formattedRate').get(function() {
  const precision = this.INDEX_RATE < 1 ? 4 : 2;
  return `${this.INDEX_RATE.toFixed(precision)}%`;
});

// Pre-save middleware to handle default rate logic
rateIndexSchema.pre('save', async function(next) {
  if (this.IS_DEFAULT === true) {
    try {
      // Unset other defaults
      await mongoose.model('RateIndex').updateMany(
        { 
          _id: { $ne: this._id },
          IS_DEFAULT: true 
        },
        { IS_DEFAULT: false }
      );
    } catch (error) {
      return next(error);
    }
  }
  
  // Update timestamp
  this.UPDATED_AT = new Date();
  next();
});

// Indexes for better query performance
rateIndexSchema.index({ STATUS: 1, IS_ACTIVE: 1 });
rateIndexSchema.index({ CRNCY_ID: 1, STATUS: 1 });
rateIndexSchema.index({ EFFECTIVE_DT: -1 });
rateIndexSchema.index({ RATE_TYPE: 1, STATUS: 1 });

// Static method to get default rate
rateIndexSchema.statics.getDefaultRate = function() {
  return this.findOne({ IS_DEFAULT: true, STATUS: 'ACTIVE', IS_ACTIVE: true });
};

// Static method to get active rates by currency
rateIndexSchema.statics.getActiveRatesByCurrency = function(currency) {
  return this.find({ 
    CRNCY_ID: currency.toUpperCase(), 
    STATUS: 'ACTIVE', 
    IS_ACTIVE: true,
    EFFECTIVE_DT: { $lte: new Date() }
  }).sort({ EFFECTIVE_DT: -1 });
};

// Instance method to check if rate is current
rateIndexSchema.methods.isCurrent = function() {
  const now = new Date();
  return this.STATUS === 'ACTIVE' && 
         this.IS_ACTIVE === true &&
         this.EFFECTIVE_DT <= now &&
         (!this.EXPIRY_DT || this.EXPIRY_DT >= now);
};

const RateIndex = mongoose.model('RateIndex', rateIndexSchema);

export default RateIndex;