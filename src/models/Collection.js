import mongoose from 'mongoose';

const collectionSchema = new mongoose.Schema({
  // Primary identifiers
  collectionId: {
    type: String,
    unique: true,
    required: true,
    default: function() {
      return `COL${Date.now()}${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
    }
  },
  
  // Relationships
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
    index: true
  },
  groupCode: {
    type: String,
    required: true,
    index: true
  },
  groupLoanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GroupLoan',
    index: true
  },
  loanId: {
    type: String,
    index: true
  },
  
  // Collection details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    required: true,
    default: 'NGN',
    enum: ['NGN', 'USD', 'EUR', 'GBP'],
    index: true
  },
  collectionDate: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    required: true,
    enum: ['pending', 'approved', 'rejected', 'processed', 'cancelled', 'partially_processed'],
    default: 'pending',
    index: true
  },
  
  // NEW: Loan repayment tracking
  repaymentType: {
    type: String,
    enum: ['loan_repayment', 'savings', 'insurance', 'fees', 'mixed'],
    default: 'loan_repayment',
    index: true
  },
  loanRepayments: [{
    loanAccountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanAccount',
      required: true
    },
    loanAccountNumber: String,
    customerId: String,
    customerName: String,
    principalAmount: { type: Number, default: 0 },
    interestAmount: { type: Number, default: 0 },
    penaltyAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    installmentNumber: Number,
    repaymentDate: { type: Date, default: Date.now },
    transactionReference: String,
    status: {
      type: String,
      enum: ['pending', 'processed', 'failed', 'reversed'],
      default: 'pending'
    }
  }],
  
  // Savings collections
  savingsCollections: [{
    accountNumber: String,
    customerId: String,
    customerName: String,
    amount: { type: Number, default: 0 },
    savingsType: {
      type: String,
      enum: ['GROUP_SAVINGS', 'INDIVIDUAL_SAVINGS', 'SPECIAL_SAVINGS'],
      default: 'GROUP_SAVINGS'
    },
    transactionReference: String,
    status: {
      type: String,
      enum: ['pending', 'processed', 'failed'],
      default: 'pending'
    }
  }],
  
  // Processing summary
  processingSummary: {
    totalLoanAmount: { type: Number, default: 0 },
    totalSavingsAmount: { type: Number, default: 0 },
    totalFeesAmount: { type: Number, default: 0 },
    successfulLoanRepayments: { type: Number, default: 0 },
    failedLoanRepayments: { type: Number, default: 0 },
    successfulSavings: { type: Number, default: 0 },
    failedSavings: { type: Number, default: 0 },
    repaymentSchedulesUpdated: { type: Number, default: 0 },
    totalProcessedAmount: { type: Number, default: 0 }
  },
  
  // Branch and relationship info
  branch: {
    type: Number,
    required: true,
    index: true
  },
  branchName: {
    type: String,
    required: false
  },
  relationshipManager: {
    type: Number,
    required: true,
    index: true
  },
  relationshipManagerName: {
    type: String,
    required: false
  },
  
  // Channel information
  channel: {
    type: Number,
    required: true,
    default: 6,
    index: true
  },
  channelName: {
    type: String,
    required: false
  },
  
  // Payment method
  paymentMethod: {
    type: String,
    enum: ['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'POS'],
    default: 'CASH',
    index: true
  },
  transactionReference: {
    type: String,
    unique: true,
    sparse: true
  },
  
  // Audit fields
  createdBy: {
    type: String,
    required: true
  },
  createdByName: {
    type: String,
    required: false
  },
  processedBy: {
    type: String,
    default: null
  },
  processedAt: {
    type: Date,
    default: null
  },
  offlineId: {
    type: Number,
    required: false
  },
  
  // Rejection details
  rejectionReason: {
    type: String,
    default: ''
  },
  rejectedBy: {
    type: String,
    default: null
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  
  // Legacy system reference
  mysqlId: {
    type: Number,
    unique: true,
    sparse: true
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for formatted amount
collectionSchema.virtual('formattedAmount').get(function() {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: this.currency
  }).format(this.amount);
});

// Virtual for processing status
collectionSchema.virtual('isProcessed').get(function() {
  return this.status === 'processed' || this.status === 'partially_processed';
});

// Virtual for total loan repayments
collectionSchema.virtual('totalLoanRepayments').get(function() {
  return this.loanRepayments.reduce((sum, repayment) => sum + (repayment.totalAmount || 0), 0);
});

// Virtual for total savings
collectionSchema.virtual('totalSavings').get(function() {
  return this.savingsCollections.reduce((sum, savings) => sum + (savings.amount || 0), 0);
});

// Index for better query performance
collectionSchema.index({ groupId: 1, collectionDate: -1 });
collectionSchema.index({ groupLoanId: 1, collectionDate: -1 });
collectionSchema.index({ branch: 1, status: 1 });
collectionSchema.index({ collectionDate: 1, status: 1 });
collectionSchema.index({ relationshipManager: 1, collectionDate: -1 });
collectionSchema.index({ repaymentType: 1, status: 1 });
collectionSchema.index({ 'loanRepayments.loanAccountId': 1 });

// Pre-save middleware
collectionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Auto-calculate processing summary
  if (this.loanRepayments && this.savingsCollections) {
    this.processingSummary.totalLoanAmount = this.loanRepayments.reduce((sum, r) => sum + (r.totalAmount || 0), 0);
    this.processingSummary.totalSavingsAmount = this.savingsCollections.reduce((sum, s) => sum + (s.amount || 0), 0);
    this.processingSummary.successfulLoanRepayments = this.loanRepayments.filter(r => r.status === 'processed').length;
    this.processingSummary.failedLoanRepayments = this.loanRepayments.filter(r => r.status === 'failed').length;
    this.processingSummary.successfulSavings = this.savingsCollections.filter(s => s.status === 'processed').length;
    this.processingSummary.failedSavings = this.savingsCollections.filter(s => s.status === 'failed').length;
    this.processingSummary.totalProcessedAmount = this.processingSummary.totalLoanAmount + this.processingSummary.totalSavingsAmount;
  }
  
  next();
});

// Static methods
collectionSchema.statics.findByGroupLoan = function(groupLoanId) {
  return this.find({ groupLoanId })
    .populate('loanRepayments.loanAccountId')
    .sort({ collectionDate: -1 });
};

collectionSchema.statics.findByLoanAccount = function(loanAccountId) {
  return this.find({ 
    'loanRepayments.loanAccountId': loanAccountId,
    status: { $in: ['processed', 'partially_processed'] }
  }).sort({ collectionDate: -1 });
};

collectionSchema.statics.getLoanRepaymentSummary = function(groupLoanId) {
  return this.aggregate([
    { $match: { groupLoanId, status: { $in: ['processed', 'partially_processed'] } } },
    { $unwind: '$loanRepayments' },
    { $match: { 'loanRepayments.status': 'processed' } },
    {
      $group: {
        _id: '$groupLoanId',
        totalCollections: { $sum: 1 },
        totalPrincipal: { $sum: '$loanRepayments.principalAmount' },
        totalInterest: { $sum: '$loanRepayments.interestAmount' },
        totalPenalty: { $sum: '$loanRepayments.penaltyAmount' },
        totalRepaid: { $sum: '$loanRepayments.totalAmount' },
        uniqueLoanAccounts: { $addToSet: '$loanRepayments.loanAccountId' }
      }
    },
    {
      $project: {
        totalCollections: 1,
        totalPrincipal: 1,
        totalInterest: 1,
        totalPenalty: 1,
        totalRepaid: 1,
        uniqueLoanAccountsCount: { $size: '$uniqueLoanAccounts' }
      }
    }
  ]);
};

// Instance methods
collectionSchema.methods.addLoanRepayment = function(repaymentData) {
  this.loanRepayments.push({
    ...repaymentData,
    status: 'pending'
  });
  return this.save();
};

collectionSchema.methods.addSavingsCollection = function(savingsData) {
  this.savingsCollections.push({
    ...savingsData,
    status: 'pending'
  });
  return this.save();
};

collectionSchema.methods.processRepayments = async function() {
  const GroupLoan = mongoose.model('GroupLoan');
  
  // Update repayment statuses
  let successfulRepayments = 0;
  let totalLoanCollected = 0;
  
  for (let repayment of this.loanRepayments) {
    if (repayment.status === 'pending') {
      try {
        // Update GroupLoan collection history
        if (this.groupLoanId) {
          const groupLoan = await GroupLoan.findById(this.groupLoanId);
          if (groupLoan) {
            await groupLoan.updateCollectionTotals(repayment.totalAmount || 0);
            await groupLoan.markMemberAsRepaid(repayment.loanAccountId);
            
            // Add to collection history
            await groupLoan.addCollectionRecord({
              collectedBy: this.createdBy,
              loanCollections: [{
                accountNo: repayment.loanAccountNumber,
                amount: repayment.totalAmount,
                receiptNo: this.transactionReference,
                installmentNo: repayment.installmentNumber
              }],
              successfulCollections: 1,
              totalLoanCollected: repayment.totalAmount,
              paymentMethod: this.paymentMethod,
              transactionReference: this.transactionReference
            });
          }
        }
        
        repayment.status = 'processed';
        successfulRepayments++;
        totalLoanCollected += repayment.totalAmount || 0;
        
      } catch (error) {
        repayment.status = 'failed';
        console.error(`Failed to process repayment for loan account ${repayment.loanAccountId}:`, error);
      }
    }
  }
  
  // Update collection status
  if (successfulRepayments > 0) {
    this.status = this.loanRepayments.length === successfulRepayments ? 'processed' : 'partially_processed';
    this.processedAt = new Date();
    this.processedBy = this.createdBy;
    
    this.processingSummary.successfulLoanRepayments = successfulRepayments;
    this.processingSummary.totalLoanAmount = totalLoanCollected;
    this.processingSummary.repaymentSchedulesUpdated = successfulRepayments;
  }
  
  return this.save();
};

collectionSchema.methods.getRepaymentBreakdown = function() {
  const breakdown = {
    principal: 0,
    interest: 0,
    penalty: 0,
    total: 0,
    byLoanAccount: {}
  };
  
  this.loanRepayments.forEach(repayment => {
    breakdown.principal += repayment.principalAmount || 0;
    breakdown.interest += repayment.interestAmount || 0;
    breakdown.penalty += repayment.penaltyAmount || 0;
    breakdown.total += repayment.totalAmount || 0;
    
    if (repayment.loanAccountNumber) {
      if (!breakdown.byLoanAccount[repayment.loanAccountNumber]) {
        breakdown.byLoanAccount[repayment.loanAccountNumber] = {
          principal: 0,
          interest: 0,
          penalty: 0,
          total: 0
        };
      }
      breakdown.byLoanAccount[repayment.loanAccountNumber].principal += repayment.principalAmount || 0;
      breakdown.byLoanAccount[repayment.loanAccountNumber].interest += repayment.interestAmount || 0;
      breakdown.byLoanAccount[repayment.loanAccountNumber].penalty += repayment.penaltyAmount || 0;
      breakdown.byLoanAccount[repayment.loanAccountNumber].total += repayment.totalAmount || 0;
    }
  });
  
  return breakdown;
};

const Collection = mongoose.model('Collection', collectionSchema);

export default Collection;