import mongoose from 'mongoose';
import moment from 'moment-timezone';

const amlThresholdSchema = new mongoose.Schema({
  transaction_type: {
    type: String,
    required: true,
    enum: ['WITHDRAWAL', 'DEPOSIT', 'TRANSFER', 'DEFAULT'], // Explicit allowed values
    default: 'DEFAULT',
    index: true // For faster querying
  },
  threshold_amount: {
    type: Number,
    required: true,
    min: 0 // Prevent negative thresholds
  },
  currency: {
    type: String,
    required: true,
    default: 'NGN',
    enum: ['NGN', 'USD', 'EUR', 'GBP'], // Supported currencies
    uppercase: true,
    index: true // For faster querying
  },
  active: {
    type: Boolean,
    default: true,
    index: true // For faster filtering of active thresholds
  },
  description: {
    type: String,
    required: false,
    maxlength: 255 // Optional description of the threshold
  },
  applies_to: {
    type: [String],
    required: false,
    default: [],
    enum: ['INDIVIDUAL', 'BUSINESS', 'GOVERNMENT', 'ALL'] // Account types this applies to
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Track who created the threshold
  },
  updated_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Track who last updated
  },
  created_at: {
    type: Date,
    default: () => moment().tz('Africa/Lagos').toDate(),
    immutable: true // Prevent modification after creation
  },
  updated_at: {
    type: Date,
    default: () => moment().tz('Africa/Lagos').toDate()
  }
}, {
  // Schema options
  versionKey: '__v',
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index for efficient querying
amlThresholdSchema.index(
  { transaction_type: 1, currency: 1, active: 1 }, 
  { unique: true } // Ensure only one active threshold per type/currency
);

// Automatically update updated_at on save
amlThresholdSchema.pre('save', function (next) {
  this.updated_at = moment().tz('Africa/Lagos').toDate();
  next();
});

// Add a pre-update hook for findOneAndUpdate operations
amlThresholdSchema.pre('findOneAndUpdate', function (next) {
  this.set({ updated_at: moment().tz('Africa/Lagos').toDate() });
  next();
});

// Virtual for formatted threshold amount
amlThresholdSchema.virtual('formatted_threshold').get(function() {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: this.currency
  }).format(this.threshold_amount);
});

const AMLThreshold = mongoose.model('AMLThreshold', amlThresholdSchema);

export default AMLThreshold;