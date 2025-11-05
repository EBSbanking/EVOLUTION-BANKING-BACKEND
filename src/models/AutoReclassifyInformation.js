// models/AutoReclassifyInformation.js
import mongoose from 'mongoose';

const autoReclassifyInformationSchema = new mongoose.Schema({
  reclassification_id: {
    type: Number,
    unique: true,
    required: true
  },
  prod_cd: {
    type: String,
    required: true,
    unique: true
  },
  prod_id: {
    type: Number,
    required: true
  },

  // Pre-Dominant Classification
  enable_pre_dominant_classification: {
    type: Boolean,
    default: false
  },
  pre_dominant_days: {
    type: Number,
    default: 0
  },
  dominant_days: {
    type: Number,
    default: 0
  },

  // Escheated Classification
  enable_escheated_classification: {
    type: Boolean,
    default: false
  },
  escheated_days: {
    type: Number,
    default: 0
  },
  non_accrual_days: {
    type: Number,
    default: 0
  },
  delinquent_days: {
    type: Number,
    default: 0
  },
  matured_days: {
    type: Number,
    default: 0
  },

  // Bad Debt Classification
  enable_bad_debt_classification: {
    type: Boolean,
    default: false
  },
  bad_debt_days: {
    type: Number,
    default: 0
  },

  // Account Closures
  inactive_account_closure_days: {
    type: Number,
    default: 0
  },
  zero_balance_account_closure_days: {
    type: Number,
    default: 0
  }

}, {
  timestamps: true // Adds createdAt and updatedAt
});

// Auto-increment reclassification_id
autoReclassifyInformationSchema.pre('save', async function (next) {
  if (!this.isNew) return next();

  const last = await mongoose.model('AutoReclassifyInformation')
    .findOne()
    .sort({ reclassification_id: -1 });

  this.reclassification_id = last ? last.reclassification_id + 1 : 1;
  next();
});

const AutoReclassifyInformation = mongoose.model('AutoReclassifyInformation', autoReclassifyInformationSchema);

export default AutoReclassifyInformation;
