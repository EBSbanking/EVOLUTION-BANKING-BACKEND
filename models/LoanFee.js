import mongoose from 'mongoose';

const LoanFeeSchema = new mongoose.Schema({
  PROD_ID: {
    type: Number,
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  type: {
    type: String,
    required: true,
    enum: [
      'PROCESSING_FEE',
      'INSURANCE_FEE', 
      'DOCUMENTATION_FEE',
      'LATE_PAYMENT_FEE',
      'EARLY_REPAYMENT_FEE',
      'UPFRONT_FEE',
      'ONGOING_FEE',
      'OTHER'
    ],
    uppercase: true,
    default: 'PROCESSING_FEE'
  },
  isPercentage: {
    type: Boolean,
    required: true,
    default: false
  },
  value: {
    type: Number,
    required: true,
    min: 0
  },
  minAmount: {
    type: Number,
    min: 0,
    default: 0,
    validate: {
      validator: function(v) {
        return !this.isPercentage || v <= this.maxAmount || !this.maxAmount;
      },
      message: 'Minimum amount cannot be greater than maximum amount'
    }
  },
  maxAmount: {
    type: Number,
    min: 0,
    default: 0
  },
  glAccountCode: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        return /^(?:\d{6,10}|\d{1,3}(?:-\d{1,3}){5})$/.test(v);
      },
      message: 'GL Account Code must be 6-10 digits or XX-XX-XX-XX-XX-XX format'
    }
  },
  taxable: {
    type: Boolean,
    default: false
  },
  taxRate: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
    required: function() { return this.taxable; }
  },
  appliesToDisbursement: {
    type: Boolean,
    default: true
  },
  appliesToRepayment: {
    type: Boolean,
    default: false
  },
  active: {
    type: Boolean,
    default: true,
    index: true
  },
  createdBy: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    validate: {
      validator: function(v) {
        return v === 'system' || mongoose.isValidObjectId(v);
      },
      message: 'createdBy must be "system" or a valid ObjectId'
    }
  },
  workflowMetadata: {
    workItemId: String,
    processId: String
  }
}, {
  timestamps: true,
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      delete ret.__v;
      return ret;
    }
  }
});

// Indexes
LoanFeeSchema.index({ PROD_ID: 1, type: 1, active: 1 });

// Virtuals
LoanFeeSchema.virtual('feeDescription').get(function() {
  return this.isPercentage 
    ? `${this.name} (${this.value}%${this.minAmount ? ', min ' + this.minAmount : ''}${this.maxAmount ? ', max ' + this.maxAmount : ''})`
    : `${this.name} (Fixed: ${this.value})`;
});

// Static Methods - Updated and consolidated version
LoanFeeSchema.statics.calculateFees = async function(PROD_ID, loanAmount) {
  if (isNaN(loanAmount)) {
    throw new Error('Loan amount must be a number');
  }
  if (loanAmount <= 0) {
    throw new Error('Loan amount must be positive');
  }

  const fees = await this.find({ 
    PROD_ID, 
    active: true,
    $or: [
      { appliesToDisbursement: true },
      { appliesToRepayment: true }
    ]
  });

  return fees.map(fee => {
    let amount = fee.isPercentage 
      ? loanAmount * (fee.value / 100)
      : fee.value;

    if (fee.isPercentage) {
      if (fee.minAmount) amount = Math.max(amount, fee.minAmount);
      if (fee.maxAmount) amount = Math.min(amount, fee.maxAmount);
    }

    return {
      feeId: fee._id,
      name: fee.name,
      type: fee.type,
      amount: parseFloat(amount.toFixed(2)),
      taxable: fee.taxable,
      taxAmount: fee.taxable ? parseFloat((amount * fee.taxRate / 100).toFixed(2)) : 0
    };
  });
};

LoanFeeSchema.statics.calculateProcessingFees = async function(PROD_ID, loanAmount) {
  const allFees = await this.calculateFees(PROD_ID, loanAmount);
  const processingFees = allFees.filter(fee => fee.type === 'PROCESSING_FEE');
  return {
    fees: processingFees,
    total: processingFees.reduce((sum, fee) => sum + fee.amount, 0)
  };
};

LoanFeeSchema.statics.getProcessingFee = async function(PROD_ID, loanAmount) {
  const { total } = await this.calculateProcessingFees(PROD_ID, loanAmount);
  return total;
};

const LoanFee = mongoose.model('LoanFee', LoanFeeSchema);
export default LoanFee;