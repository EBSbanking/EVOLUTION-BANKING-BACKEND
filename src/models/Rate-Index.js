import mongoose from 'mongoose';

const rateIndexSchema = new mongoose.Schema({
  INDEX_RATE_ID: {
    type: Number,
    required: true,
    unique: true
  },
  INDEX_CD: {
  type: String,  
  required: true,
  uppercase: true,
  trim: true
},

  INDEX_RATE: {
    type: Number,
    required: true,
    min: 0,
    description: "Annual interest rate (in percentage)"
  },
  INDEX_NM: {
    type: String,
    required: true,
    trim: true
  },
  CRNCY_ID: {
    type: String,
    required: true,
    uppercase: true
  },
  PRECISION: {
    type: Number,
    required: true,
    min: 2,
    max: 8,
    default: 4
  },
  EFFECTIVE_DT: {
    type: Date,
    required: true,
    validate: {
      validator: function(date) {
        return date <= new Date();
      },
      message: 'Effective date cannot be in the future'
    }
  },
  DAY_COUNT_CONVENTION: {
    type: String,
    enum: ['ACTUAL/360', 'ACTUAL/365', '30/360', 'BUSINESS/252'],
    default: 'ACTUAL/360',
    required: true
  },
  // ... other fields as in your original schema
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Remove calculation methods - they belong in the service
const RateIndex = mongoose.model('RateIndex', rateIndexSchema);

export default RateIndex;