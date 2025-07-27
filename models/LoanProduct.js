import mongoose from 'mongoose';

const loanProductSchema = new mongoose.Schema({
  productCode: {
    type: Number,
    required: true,
    unique: true
  },
  PROD_ID: {
    type: Number,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  description: String,
  minAmount: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? parseFloat(v.toString()) : 0
  },
  maxAmount: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? parseFloat(v.toString()) : 0
  },
  minTerm: Number,
  maxTerm: Number,
  interestRate: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? parseFloat(v.toString()) : 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: String,
  allowedCurrencies: [String],
  feeStructure: [{
    feeType: {
      type: String,
      required: true,
      enum: ['PROCESSING', 'INSURANCE', 'LATE_PAYMENT', 'OTHER']
    },
    name: {
      type: String,
      required: true
    },
    amount: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: (v) => v ? parseFloat(v.toString()) : 0
    },
    isPercentage: {
      type: Boolean,
      required: true
    },
    glAccountCode: {
      type: String,
      required: true
    },
    appliesTo: {
      type: String,
      enum: ['DISBURSEMENT', 'REPAYMENT', 'BOTH'],
      default: 'DISBURSEMENT'
    },
    isActive: {
      type: Boolean,
      default: true
    }
  }],
  processingFeeRate: {
    type: mongoose.Schema.Types.Decimal128,
    get: (v) => v ? parseFloat(v.toString()) : 0,
    default: 0
  },
  processingFeeGLCode: String
}, {
  timestamps: true,
  toJSON: { 
    getters: true,
    virtuals: true 
  },
  toObject: { 
    getters: true,
    virtuals: true 
  }
});

// Indexes
loanProductSchema.index({ PROD_ID: 1 }, { unique: true });
loanProductSchema.index({ productCode: 1 }, { unique: true });

// Virtual
loanProductSchema.virtual('productId').get(function() {
  return this.PROD_ID;
});

// Pre-save hook
loanProductSchema.pre('save', function(next) {
  if (!this.isModified('PROD_ID') && this.productCode) {
    this.PROD_ID = this.productCode;
  }
  next();
});

const LoanProduct = mongoose.models.LoanProduct || mongoose.model('LoanProduct', loanProductSchema);

export default LoanProduct;