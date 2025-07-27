import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: {
    type: String,
    required: true,
    validate: {
      validator: v => /^(ACCT|TRANS|CUST)_[A-Z0-9_]+$/.test(v),
      message: props => `${props.value} is not a valid counter ID! Must follow format: {PREFIX}_{TYPE}`
    }
  },
  seq: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: 999999999,
    validate: {
      validator: Number.isInteger,
      message: props => `${props.value} is not an integer value!`
    }
  },
  lastGeneratedNumber: {
    type: Number,
    required: false,
    min: 1000000000,
    max: 9999999999
  },
  description: {
    type: String,
    required: false
  },
  lastResetAt: {
    type: Date,
    required: false
  }
}, {
  timestamps: true
});

// Hook to update lastGeneratedNumber for ACCT_* only
counterSchema.pre('save', function (next) {
  if (this._id.startsWith('ACCT_') && this.isModified('seq')) {
    const prefixMap = {
      'ACCT_LOAN': 3,
      'ACCT_TERM_DEPOSIT': 2,
      'ACCT_SAVINGS': 1
    };
    const prefix = prefixMap[this._id] || 0;
    this.lastGeneratedNumber = prefix * 1000000000 + this.seq;
  }
  next();
});

// Static method for generating a new formatted account number
counterSchema.statics.generateAccountNumber = async function (productType) {
  const prefixMap = {
    'LOAN': 3,
    'TERM_DEPOSIT': 2,
    'SAVINGS': 1
  };

  const prefix = prefixMap[productType];
  if (!prefix) throw new Error(`Invalid product type: ${productType}`);

  const counterId = `ACCT_${productType}`;

  const counter = await this.findOneAndUpdate(
    { _id: counterId },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );

  const numericValue = prefix * 1000000000 + counter.seq;

  if (!/^\d{10}$/.test(String(numericValue))) {
    throw new Error(`Generated account number (${numericValue}) is not a valid 10-digit number`);
  }

  counter.lastGeneratedNumber = numericValue;
  await counter.save();

  return {
    numericValue,
    formattedString: `${prefix}${String(counter.seq).padStart(9, '0')}`
  };
};

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

export default Counter;
