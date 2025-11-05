import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true
  },
  // Primary sequence field for account generation
  seq: {
    type: Number,
    default: 100000, // Start from 6-digit for account IDs
    min: 0
  },
  // Alternative field name for compatibility
  sequence_value: {
    type: Number,
    default: 1000000000, // Start from 10-digit for account numbers
    min: 0
  },
  // Additional fields for enhanced functionality
  lastGeneratedAt: {
    type: Date,
    default: Date.now
  },
  description: {
    type: String,
    required: false
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// NO index({ _id: 1 }) - MongoDB auto-creates unique _id index

// Pre-save hook to sync seq and sequence_value
counterSchema.pre('save', function(next) {
  // If seq is modified and sequence_value exists, keep them in sync for account types
  if (this.isModified('seq') && this.sequence_value) {
    // For account counters, maintain relationship between seq and sequence_value
    if (this._id.includes('ACCT_') || this._id.includes('Account')) {
      this.sequence_value = 1000000000 + this.seq;
    }
  }
  
  // Update lastGeneratedAt when sequence changes
  if (this.isModified('seq') || this.isModified('sequence_value')) {
    this.lastGeneratedAt = new Date();
  }
  
  next();
});

// Static method for generating account numbers (compatible with your original logic)
counterSchema.statics.generateAccountNumber = async function (productType) {
  const counterMap = {
    'SAVINGS': 'savingsAccount',
    'LOAN': 'loanAccount',
    'TERM_DEPOSIT': 'termDepositAccount',
    'CREDIT_CARD': 'creditCardAccount'
  };

  const counterId = counterMap[productType] || 'savingsAccount';

  const counter = await this.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return {
    sequence: counter.seq,
    sequence_value: counter.sequence_value
  };
};

// Static method for NUBAN account generation
counterSchema.statics.generateNUBANSequence = async function (accountType) {
  const counterMap = {
    'SAVINGS': 'savingsAccount',
    'LOAN': 'loanAccount', 
    'TERM_DEPOSIT': 'termDepositAccount',
    'CREDIT_CARD': 'creditCardAccount'
  };

  const counterId = counterMap[accountType] || 'savingsAccount';

  const counter = await this.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  return counter.seq;
};

// Method to get current sequence without incrementing
counterSchema.statics.getCurrentSequence = async function (counterId) {
  const counter = await this.findOne({ _id: counterId });
  return counter ? counter.seq : null;
};

// Method to reset sequence
counterSchema.statics.resetSequence = async function (counterId, newValue = 100000) {
  const counter = await this.findOneAndUpdate(
    { _id: counterId },
    { 
      seq: newValue,
      sequence_value: 1000000000 + newValue,
      lastGeneratedAt: new Date()
    },
    { new: true, upsert: true }
  );
  return counter;
};

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

export default Counter;