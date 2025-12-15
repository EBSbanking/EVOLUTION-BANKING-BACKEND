import mongoose from 'mongoose';

const repaymentScheduleSchema = new mongoose.Schema({
  installmentNo: {
    type: Number,
    required: true
  },
  dueDate: {
    type: Date,
    required: true
  },
  principal: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  interest: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  totalPayment: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  remainingBalance: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  status: {
    type: String,
    enum: ['PENDING', 'PAID', 'OVERDUE', 'PARTIALLY_PAID'],
    default: 'PENDING'
  },
  amountPaid: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  principalPaid: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  interestPaid: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  paymentDate: {
    type: Date
  },
  isEarlyPayment: {
    type: Boolean,
    default: false
  },
  isOverduePayment: {
    type: Boolean,
    default: false
  },
  lateFeeCharged: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  }
});

const feeDetailsSchema = new mongoose.Schema({
  processingFee: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  totalFees: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  charges: [{
    chargeId: { type: Number },
    chargeCode: { type: String },
    amount: {
      type: mongoose.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00')
    },
    name: { type: String },
    glAccountCode: { type: String }
  }],
  upfrontInterest: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  upfrontInterestPercentage: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  processingFeeGLCode: {
    type: String,
    trim: true
  }
});

const Borrower_addressSchema = new mongoose.Schema({
  street: {
    type: String,
    trim: true
  },
  state: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  zipCode: {
    type: String,
    trim: true
  },
  country: {
    type: String,
    default: 'Nigeria',
    trim: true
  }
});

const guarantorDetailsSchema = new mongoose.Schema({
  name: { type: String },
  phone: { type: String },
  relationship: { type: String },
  guarantorNumberId: { type: String },
  email: { type: String },
  address: { type: String },
  existingGuarantees: {
    type: {
      totalExistingLoans: { type: Number },
      totalGuaranteedAmount: { type: mongoose.Types.Decimal128 }
    },
    default: null
  }
});

// Interest rate details schema
const interestRateDetailsSchema = new mongoose.Schema({
  rateType: { type: String },
  interestType: { type: String },
  calculationMethod: { type: String },
  loanInterestRateId: { type: mongoose.Schema.Types.Mixed },
  source: { type: String },
  annualRate: { type: Number },
  monthlyRate: { type: Number },
  isTermBasedRate: { type: Boolean },
  note: { type: String },
  overrideDetails: {
    forcedRate: { type: Number },
    reason: { type: String }
  }
});

const LoanDisbursementSchema = new mongoose.Schema({
  // Core Identification Fields
  ACCT_NO: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  APPL_ID: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  CUST_ID: {
    type: mongoose.Schema.Types.Mixed, // Can be String or Number
    required: true,
    index: true
  },
  
  // Loan Details
  INTEREST_RATE: {
    type: mongoose.Types.Decimal128,
    required: true
  },
  TERM_VALUE: {
    type: Number,
    required: true
  },
  TERM_CD: {
    type: String,
    required: true,
    trim: true
  },
  AMOUNT: {
    type: mongoose.Types.Decimal128,
    required: true
  },
  CALCULATION_METHOD: {
    type: String,
    required: true,
    enum: ['FLAT_RATE', 'DECLINING_BALANCE'],
    default: 'FLAT_RATE'
  },
  PAYMENT_FREQUENCY: {
    type: String,
    required: true
  },
  
  // Financial Summary
  EMI_AMOUNT: {
    type: mongoose.Types.Decimal128,
    required: true
  },
  TOTAL_INTEREST: {
    type: mongoose.Types.Decimal128,
    required: true
  },
  TOTAL_REPAYMENT: {
    type: mongoose.Types.Decimal128,
    required: true
  },
  
  // References to other documents
  LOAN_ACCOUNT_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanAccount',
    required: true
  },
  CREDIT_APPLICATION_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CreditApplication'
  },
  REPAYMENT_SCHEDULE_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RepaymentSchedule',
    required: true
  },
  GUARANTOR_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guarantor',
    required: true
  },
  
  // Transaction and Workflow IDs
  TRANSACTION_ID: {
    type: String,
    required: true,
    trim: true
  },
  EVENT_ID: {
    type: String,
    required: true,
    trim: true
  },
  JOURNAL_ID: {
    type: String,
    required: true,
    trim: true
  },
  
  // Product Information
  PROD_ID: {
    type: mongoose.Schema.Types.Mixed, // Can be String or Number
    required: true
  },
  PRODUCT_TYPE: {
    type: String,
    required: true,
    trim: true
  },
  
  // Account Information
  ACCT_NM: {
    type: String,
    required: true,
    trim: true
  },
  CRNCY_ID: {
    type: String,
    required: true,
    default: 'NGN'
  },
  BU_ID: {
    type: mongoose.Schema.Types.Mixed, // Can be String or Number
    required: true
  },
  
  // Officer Information
  PRIMARY_OFFICER_ID: {
    type: mongoose.Schema.Types.Mixed, // Can be String or Number
    required: true
  },
  REPAY_SRC_ACCT_NO: {
    type: String,
    required: true,
    trim: true
  },
  
  // Dates
  START_DT: {
    type: Date,
    required: true
  },
  MATURITY_DT: {
    type: Date,
    required: true
  },
  
  // Address Information
  Borrower_address: {
    type: Borrower_addressSchema,
    default: null
  },
  
  // Guarantor Details
  guarantorDetails: {
    type: guarantorDetailsSchema,
    default: null
  },
  
  // Interest Rate Details
  interestRateDetails: {
    type: interestRateDetailsSchema,
    default: null
  },
  
  // Status and Metadata
  STATUS: {
    type: String,
    required: true,
    enum: ['PENDING', 'APPROVED', 'ACTIVE', 'REJECTED', 'DISBURSED', 'COMPLETED'],
    default: 'PENDING'
  },
  CREATED_BY: {
    type: String,
    required: true,
    trim: true
  },
  
  // Disbursement Details
  DISBURSEMENT_TYPE: {
    type: String,
    required: true,
    enum: ['CUSTOMER_ACCOUNT', 'CASH', 'BANK_TRANSFER'],
    default: 'CUSTOMER_ACCOUNT'
  },
  FEES_AMOUNT: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  UPFRONT_INTEREST_AMOUNT: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  NET_DISBURSEMENT_AMOUNT: {
    type: mongoose.Types.Decimal128,
    required: true
  },
  
  // Additional Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Version tracking
  __v: {
    type: Number,
    select: false
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      // Convert Decimal128 fields to numbers
      const decimalFields = [
        'INTEREST_RATE', 'AMOUNT', 'EMI_AMOUNT', 'TOTAL_INTEREST', 
        'TOTAL_REPAYMENT', 'FEES_AMOUNT', 'UPFRONT_INTEREST_AMOUNT', 
        'NET_DISBURSEMENT_AMOUNT'
      ];
      
      decimalFields.forEach(field => {
        if (ret[field] && typeof ret[field] === 'object') {
          ret[field] = parseFloat(ret[field].toString());
        }
      });
      
      // Convert interestRateDetails Decimal128
      if (ret.interestRateDetails && ret.interestRateDetails.overrideDetails) {
        if (ret.interestRateDetails.overrideDetails.forcedRate && typeof ret.interestRateDetails.overrideDetails.forcedRate === 'object') {
          ret.interestRateDetails.overrideDetails.forcedRate = parseFloat(ret.interestRateDetails.overrideDetails.forcedRate.toString());
        }
      }
      
      // Convert guarantorDetails Decimal128
      if (ret.guarantorDetails && ret.guarantorDetails.existingGuarantees && ret.guarantorDetails.existingGuarantees.totalGuaranteedAmount) {
        if (typeof ret.guarantorDetails.existingGuarantees.totalGuaranteedAmount === 'object') {
          ret.guarantorDetails.existingGuarantees.totalGuaranteedAmount = parseFloat(ret.guarantorDetails.existingGuarantees.totalGuaranteedAmount.toString());
        }
      }
      
      // Remove mongoose internal fields
      delete ret.__v;
      delete ret._id;
      
      return ret;
    }
  }
});

// Indexes for better query performance
LoanDisbursementSchema.index({ ACCT_NO: 1 });
LoanDisbursementSchema.index({ APPL_ID: 1 });
LoanDisbursementSchema.index({ CUST_ID: 1 });
LoanDisbursementSchema.index({ LOAN_ACCOUNT_ID: 1 });
LoanDisbursementSchema.index({ GUARANTOR_ID: 1 });
LoanDisbursementSchema.index({ TRANSACTION_ID: 1 });
LoanDisbursementSchema.index({ EVENT_ID: 1 });
LoanDisbursementSchema.index({ PROD_ID: 1 });
LoanDisbursementSchema.index({ STATUS: 1 });
LoanDisbursementSchema.index({ CREATED_BY: 1 });
LoanDisbursementSchema.index({ createdAt: 1 });

// Virtual for formatted amounts
LoanDisbursementSchema.virtual('formattedAmount').get(function() {
  return `₦${parseFloat(this.AMOUNT?.toString() || '0').toLocaleString()}`;
});

LoanDisbursementSchema.virtual('formattedInterestRate').get(function() {
  return `${parseFloat(this.INTEREST_RATE?.toString() || '0').toFixed(2)}%`;
});

LoanDisbursementSchema.virtual('formattedEMI').get(function() {
  return `₦${parseFloat(this.EMI_AMOUNT?.toString() || '0').toLocaleString()}`;
});

// Static methods
LoanDisbursementSchema.statics.findByAccountNumber = function(accountNumber) {
  return this.findOne({ ACCT_NO: accountNumber });
};

LoanDisbursementSchema.statics.findByApplicationId = function(applicationId) {
  return this.find({ APPL_ID: applicationId });
};

LoanDisbursementSchema.statics.findByCustomerId = function(customerId) {
  return this.find({ CUST_ID: customerId });
};

LoanDisbursementSchema.statics.findByStatus = function(status) {
  return this.find({ STATUS: status });
};

// Instance methods
LoanDisbursementSchema.methods.updateStatus = function(newStatus) {
  this.STATUS = newStatus;
  this.updatedAt = new Date();
  return this.save();
};

// Pre-save middleware
LoanDisbursementSchema.pre('save', function(next) {
  // Ensure NET_DISBURSEMENT_AMOUNT is calculated
  if (!this.NET_DISBURSEMENT_AMOUNT) {
    const amount = parseFloat(this.AMOUNT?.toString() || '0');
    const fees = parseFloat(this.FEES_AMOUNT?.toString() || '0');
    const upfrontInterest = parseFloat(this.UPFRONT_INTEREST_AMOUNT?.toString() || '0');
    const netAmount = amount - fees - upfrontInterest;
    this.NET_DISBURSEMENT_AMOUNT = mongoose.Types.Decimal128.fromString(Math.max(0, netAmount).toFixed(2));
  }
  
  // Update timestamps
  this.updatedAt = new Date();
  
  next();
});

const LoanDisbursement = mongoose.models.LoanDisbursement || 
                         mongoose.model('LoanDisbursement', LoanDisbursementSchema);

export default LoanDisbursement;