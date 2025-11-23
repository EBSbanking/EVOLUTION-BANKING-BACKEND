import mongoose from 'mongoose';

const loanEventSchema = new mongoose.Schema({
  // Core References
  ACCT_NO: { 
    type: String, 
    required: true,
    index: true 
  },
  LOAN_ACCOUNT_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanAccount',
    required: true
  },
  CUST_ID: {
    type: Number,
    required: true
  },
  
  // Event Information
  eventType: { 
    type: String, 
    required: true,
    enum: [
      'SERVICING_UPDATE',
      'INSTALLMENT_PAID',
      'INSTALLMENT_DUE',
      'INSTALLMENT_OVERDUE',
      'LOAN_DISBURSEMENT',
      'LOAN_CLOSURE',
      'INTEREST_ACCRUAL',
      'FEE_CHARGE',
      'STATUS_CHANGE',
      'GUARANTOR_UPDATE',
      'GROUP_COLLECTION'
    ]
  },
  
  status: { 
    type: String, 
    required: true,
    enum: ['SERVICED', 'UNSERVICED', 'PROCESSED', 'FAILED', 'PENDING']
  },
  
  // Installment Details
  installmentNumber: { type: Number },
  dueDate: { type: Date },
  paymentDate: { type: Date },
  
  // Financial Details
  amount: {
    type: mongoose.Schema.Types.Decimal128,
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString()),
    default: '0.00'
  },
  principalAmount: {
    type: mongoose.Schema.Types.Decimal128,
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString()),
    default: '0.00'
  },
  interestAmount: {
    type: mongoose.Schema.Types.Decimal128,
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString()),
    default: '0.00'
  },
  
  // Transaction References
  transactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  repaymentScheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RepaymentSchedule'
  },
  
  // Enhanced Details
  details: { 
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Metadata
  timestamp: { 
    type: Date, 
    default: Date.now,
    index: true 
  },
  effectiveDate: { 
    type: Date, 
    default: Date.now 
  },
  createdBy: { 
    type: String, 
    required: true 
  },
  branchId: { 
    type: String 
  },
  
  // Error Handling
  errorMessage: { type: String },
  retryCount: { type: Number, default: 0 },
  lastRetryAt: { type: Date }
  
}, {
  timestamps: true,
  toJSON: { getters: true },
  toObject: { getters: true }
});

// Indexes
loanEventSchema.index({ ACCT_NO: 1, eventType: 1, timestamp: -1 });
loanEventSchema.index({ LOAN_ACCOUNT_ID: 1, status: 1 });
loanEventSchema.index({ CUST_ID: 1, timestamp: -1 });
loanEventSchema.index({ timestamp: -1, status: 1 });

// Static Methods
loanEventSchema.statics.findByAccountNumber = function(accountNo, options = {}) {
  const query = { ACCT_NO: accountNo };
  if (options.eventType) query.eventType = options.eventType;
  if (options.status) query.status = options.status;
  
  return this.find(query)
    .sort({ timestamp: -1 })
    .limit(options.limit || 100);
};

loanEventSchema.statics.findRecentEvents = function(days = 7) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  
  return this.find({
    timestamp: { $gte: date }
  }).sort({ timestamp: -1 });
};

loanEventSchema.statics.createServicingEvent = async function(data) {
  const event = new this({
    ACCT_NO: data.ACCT_NO,
    LOAN_ACCOUNT_ID: data.LOAN_ACCOUNT_ID,
    CUST_ID: data.CUST_ID,
    eventType: data.eventType || 'SERVICING_UPDATE',
    status: data.status || 'PROCESSED',
    installmentNumber: data.installmentNumber,
    dueDate: data.dueDate,
    paymentDate: data.paymentDate,
    amount: data.amount,
    principalAmount: data.principalAmount,
    interestAmount: data.interestAmount,
    transactionId: data.transactionId,
    repaymentScheduleId: data.repaymentScheduleId,
    details: data.details || {},
    createdBy: data.createdBy,
    branchId: data.branchId
  });
  
  return await event.save();
};

// Instance Methods
loanEventSchema.methods.markAsProcessed = function() {
  this.status = 'PROCESSED';
  this.timestamp = new Date();
  return this.save();
};

loanEventSchema.methods.markAsFailed = function(errorMessage) {
  this.status = 'FAILED';
  this.errorMessage = errorMessage;
  this.retryCount += 1;
  this.lastRetryAt = new Date();
  return this.save();
};

// Virtuals
loanEventSchema.virtual('isSuccessful').get(function() {
  return this.status === 'PROCESSED' || this.status === 'SERVICED';
});

loanEventSchema.virtual('canRetry').get(function() {
  return this.status === 'FAILED' && this.retryCount < 3;
});

export default mongoose.model('LoanEvent', loanEventSchema);