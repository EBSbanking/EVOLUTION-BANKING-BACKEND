// models/GroupLoan.js - Updated with safe field handling including approval/rejection
import mongoose from 'mongoose';

const groupLoanSchema = new mongoose.Schema({
  // Add loanId field for human-readable ID
  loanId: {
    type: String,
    unique: true,
    required: true,
    index: true,
    trim: true,
    uppercase: true
  },
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
  },
  groupCode: {
    type: String,
    required: [true, 'Group code is required for quick lookup'],
    trim: true,
    uppercase: true,
    maxlength: [20, 'Group code too long'],
  },
  groupName: {
    type: String,
    required: [true, 'Group name is required'],
    trim: true,
  },
  totalAmount: {
    type: Number,
    required: [true, 'Total amount is required'],
    min: [0, 'Total amount must be positive'],
  },
  individualShare: {
    type: Number,
    required: [true, 'Individual share is required (auto-calculated)'],
    min: [0, 'Individual share must be positive'],
  },
  memberCount: {
    type: Number,
    required: [true, 'Member count is required'],
    min: [1, 'At least one member required'],
  },
  members: [{
    memberId: { 
      type: String, 
      required: true,
      trim: true 
    },
    name: { 
      type: String, 
      required: true,
      trim: true 
    },
    individualAmount: { 
      type: Number, 
      required: true, 
      min: 0 
    },
  }],
  
  // Match Group schema field types - ADDED DEFAULT VALUES
  branch: {
    type: Number,
    required: true,
    default: 0 // Added default to prevent undefined
  },
  primaryRelationshipManager: { 
    type: String,
    required: true,
    default: '' // Added default
  },
  secondaryRelationshipManager: { 
    type: String,
    default: null 
  },
  
  // Approval and Rejection tracking - UPDATED to accept both ObjectId and String/Number
  approvedAt: {
    type: Date,
    default: null
  },
  approvedBy: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String/Number
    ref: 'User',
    default: null
  },
  approvalNotes: {
    type: String,
    default: '',
    trim: true,
    maxlength: [500, 'Approval notes too long']
  },
  rejectedAt: {
    type: Date,
    default: null
  },
  rejectedBy: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String/Number
    ref: 'User',
    default: null
  },
  rejectionReason: {
    type: String,
    default: '',
    trim: true,
    maxlength: [500, 'Rejection reason too long']
  },
  
  // Status and timeline fields
  applicationDate: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    enum: ['applied', 'approved', 'disbursed', 'rejected', 'active', 'closed', 'partially_disbursed'],
    default: 'applied',
  },
  disbursedAt: {
    type: Date,
    default: null
  },
  actualDisbursementDate: {
    type: Date,
    default: null
  },
  closedAt: {
    type: Date,
    default: null
  },
  closedBy: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String/Number
    ref: 'User',
    default: null
  },
  
  // Member tracking
  disbursedToMembers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanAccount',
  }],
  repaidToMembers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanAccount',
  }],
  
  // Audit fields - UPDATED to accept both ObjectId and String/Number
  createdBy: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String/Number
    ref: 'User',
    required: true,
  },
  lastUpdatedBy: {
    type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String/Number
    ref: 'User',
    default: null
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  
  // Loan-specific fields with defaults
  loanPurpose: { 
    type: String, 
    trim: true, 
    maxlength: 255,
    default: '' 
  },
  savingsAccount: { 
    type: String, 
    trim: true,
    default: '' 
  },
  interestRate: { 
    type: Number, 
    min: 0,
    default: 0 
  },
  loanTerm: {
    type: String,
    enum: ['weekly', 'monthly', 'yearly'],
    default: 'monthly'
  },
  termValue: { 
    type: Number, 
    min: 1,
    default: 1 
  },
  disbursementMethod: {
    type: String,
    enum: ['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE'],
    default: 'CASH',
  },
  useSavingsAsCollateral: { 
    type: Boolean, 
    default: false 
  },
  groupSavings: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'GroupSavings',
    default: null 
  },
  savingsCollateral: { 
    type: Number, 
    default: 0 
  },
  
  // Financial fields with proper defaults
  individualLoanAccounts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanAccount',
  }],
  totalInterest: { 
    type: Number, 
    default: 0 
  },
  totalRepayable: { 
    type: Number, 
    default: 0 
  },
  totalRepaid: { 
    type: Number, 
    default: 0 
  },
  remainingBalance: { 
    type: Number, 
    default: 0 
  },
  installmentAmount: { 
    type: Number, 
    default: 0 
  },
  numPeriods: { 
    type: Number, 
    default: 0 
  },
  installmentsPaid: { 
    type: Number, 
    default: 0 
  },
  netDisbursementAmount: { 
    type: Number, 
    default: 0 
  },
  totalFees: { 
    type: Number, 
    default: 0 
  },
  upfrontInterestAmount: { 
    type: Number, 
    default: 0 
  },
  remainingInterestAmount: { 
    type: Number, 
    default: 0 
  },
  feesCollected: { 
    type: Boolean, 
    default: false 
  },
  
  // Disbursement tracking with proper nested defaults
  disbursementResults: {
    summary: {
      totalMembers: { type: Number, default: 0 },
      successful: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      insufficientFunds: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      validationErrors: { type: Number, default: 0 },
      totalDisbursed: { type: Number, default: 0 },
      totalFeesCollected: { type: Number, default: 0 },
      disbursementDate: { type: Date, default: null },
      processedBy: { 
        type: mongoose.Schema.Types.Mixed, // Allow both ObjectId and String/Number
        ref: 'User', 
        default: null 
      }
    },
    details: {
      successful: [{
        custId: { type: String, default: '' },
        name: { type: String, default: '' },
        loanAccountId: { type: mongoose.Schema.Types.ObjectId, default: null },
        loanAccountNumber: { type: String, default: '' },
        loanAmount: { type: Number, default: 0 },
        feesPaid: { type: Number, default: 0 },
        netReceived: { type: Number, default: 0 },
        accountNumber: { type: String, default: '' },
        customerAccount: { type: String, default: '' },
        disbursementDate: { type: Date, default: null },
        transactionReferences: {
          feeTransaction: { type: String, default: '' },
          disbursementTransaction: { type: String, default: '' }
        }
      }],
      failed: [{
        custId: { type: String, default: '' },
        name: { type: String, default: '' },
        reason: { type: String, default: '' },
        loanAccountId: { type: mongoose.Schema.Types.ObjectId, default: null },
        loanAccountNumber: { type: String, default: '' },
        errorDetails: { type: String, default: '' }
      }],
      feesCollected: [{
        custId: { type: String, default: '' },
        name: { type: String, default: '' },
        loanAccountNumber: { type: String, default: '' },
        totalFees: { type: Number, default: 0 },
        feeBreakdown: {
          processingFee: { type: Number, default: 0 },
          adminFee: { type: Number, default: 0 },
          insuranceFee: { type: Number, default: 0 },
          otherFees: { type: Number, default: 0 },
          upfrontInterest: { type: Number, default: 0 }
        },
        accountDebited: { type: String, default: '' },
        previousBalance: { type: Number, default: 0 },
        newBalance: { type: Number, default: 0 }
      }],
      insuranceActivated: [{
        custId: { type: String, default: '' },
        name: { type: String, default: '' },
        loanAccountNumber: { type: String, default: '' },
        premium: { type: Number, default: 0 },
        coverage: { type: Number, default: 0 },
        policyNumber: { type: String, default: '' }
      }],
      insufficientFunds: [{
        custId: { type: String, default: '' },
        name: { type: String, default: '' },
        loanAccountNumber: { type: String, default: '' },
        requiredFees: { type: Number, default: 0 },
        availableBalance: { type: Number, default: 0 },
        shortfall: { type: Number, default: 0 },
        customerAccount: { type: String, default: '' }
      }],
      skipped: [{
        custId: { type: String, default: '' },
        name: { type: String, default: '' },
        loanAccountNumber: { type: String, default: '' },
        reason: { type: String, default: '' }
      }],
      validationErrors: [{
        custId: { type: String, default: '' },
        name: { type: String, default: '' },
        loanAccountNumber: { type: String, default: '' },
        reason: { type: String, default: '' }
      }]
    }
  },
  
  // Fee summary structure with defaults
  feeSummary: {
    processingFee: { type: Number, default: 0 },
    adminFee: { type: Number, default: 0 },
    insuranceFee: { type: Number, default: 0 },
    otherFees: { type: Number, default: 0 },
    totalCharges: { type: Number, default: 0 },
    totalFees: { type: Number, default: 0 },
    charges: [{
      chargeId: { type: Number, default: 0 },
      chargeCode: { type: String, default: '' },
      name: { type: String, default: '' },
      amount: { type: Number, default: 0 },
      glAccountCode: { type: String, default: '' },
      chargeType: { type: String, default: '' },
      isUpfront: { type: Boolean, default: false }
    }],
    upfrontInterestPercentage: { type: Number, default: 0 },
    processingFeePercentage: { type: Number, default: 0 },
    adminFeeAmount: { type: Number, default: 0 }
  },
  
  // Insurance details with defaults
  insuranceDetails: {
    totalPremium: { type: Number, default: 0 },
    totalCoverage: { type: Number, default: 0 },
    coverageType: { type: String, default: 'LOAN_PROTECTION' },
    provider: { type: String, default: 'DEFAULT_INSURER' },
    policyNumber: { type: String, default: '' },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    premiumCollected: { type: Boolean, default: false },
    policyActive: { type: Boolean, default: false },
    collectionDate: { type: Date, default: null }
  },
  
  // Interest configuration with defaults
  rateType: { type: String, default: 'FIXED' },
  interestType: { type: String, default: 'COMPOUND' },
  accrualBasisType: { type: String, default: '' },
  accrualFrequency: { type: String, default: 'DAILY' },
  accrualFrequencyValue: { type: Number, default: 1 },
  fixedRate: { type: Boolean, default: true },
  capitalizeInterest: { type: Boolean, default: false },
  amortized: { type: Boolean, default: false },
  rateChangeAllowed: { type: Boolean, default: false },
  rateChangeNoticeDays: { type: Number, default: 30 },
  upfrontInterest: { type: Boolean, default: false },
  upfrontInterestPercentage: { type: Number, default: 0 }
}, {
  timestamps: false
});

// Pre-save hook with safe calculations and status validation - FIXED
groupLoanSchema.pre('save', function (next) {
  // Set timestamps
  if (this.isNew) {
    // Safe calculation of individualShare
    if (!this.individualShare && this.memberCount > 0 && this.totalAmount > 0) {
      this.individualShare = this.totalAmount / this.memberCount;
    }
    
    // Ensure application date is set
    this.applicationDate = new Date();
    
    // Store original status for new documents
    this._originalStatus = this.status;
  } else {
    // For existing documents, store the original status before modification
    if (this.isModified('status')) {
      this._originalStatus = this.constructor.hydrate(this._doc).status;
    }
  }
  
  // Always update updatedAt safely
  this.updatedAt = new Date();
  
  // Safe calculations for financial fields
  this.totalRepayable = Number(this.totalAmount || 0) + Number(this.totalInterest || 0);
  this.remainingBalance = Number(this.totalRepayable || 0) - Number(this.totalRepaid || 0);
  
  // Status validation logic - ONLY for existing documents with status changes
  if (!this.isNew && this.isModified('status')) {
    try {
      this.validateStatusTransition();
    } catch (error) {
      return next(error);
    }
  }
  
  next();
});

// Instance method for safe string conversion
groupLoanSchema.methods.safeToString = function(field) {
  const value = this[field];
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
};

// Instance method to validate status transitions - FIXED
// In your GroupLoan model - update the validateStatusTransition method
groupLoanSchema.methods.validateStatusTransition = function() {
  const allowedTransitions = {
    'applied': ['approved', 'rejected', 'applied'], // Allow same status
    'approved': ['disbursed', 'rejected', 'partially_disbursed', 'approved'], // Allow same status
    'disbursed': ['active', 'partially_disbursed', 'disbursed'], // Allow same status
    'partially_disbursed': ['active', 'disbursed', 'partially_disbursed'], // Allow same status
    'active': ['closed', 'active'], // Allow same status
    'rejected': ['rejected'], // Allow same status
    'closed': ['closed'] // Allow same status
  };

  const currentStatus = this._originalStatus;
  const newStatus = this.status;

  // ✅ FIX: Allow same status transitions (idempotent operations)
  if (currentStatus === newStatus) {
    console.log(`🔄 Status unchanged: ${currentStatus} -> ${newStatus} (allowed for idempotency)`);
    return;
  }

  // Check if transition is allowed
  if (!allowedTransitions[currentStatus]?.includes(newStatus)) {
    throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
  }
};

// Static method to safely update status
groupLoanSchema.statics.safeStatusUpdate = async function(loanId, newStatus, userId = null) {
  const groupLoan = await this.findOne({ loanId });
  if (!groupLoan) {
    throw new Error('Group loan not found');
  }

  const currentStatus = groupLoan.status;
  
  // Validate transition
  const allowedTransitions = {
    'applied': ['approved', 'rejected'],
    'approved': ['disbursed', 'rejected', 'partially_disbursed'],
    'disbursed': ['active', 'partially_disbursed'],
    'partially_disbursed': ['active', 'disbursed'],
    'active': ['closed'],
    'rejected': [],
    'closed': []
  };

  if (!allowedTransitions[currentStatus]?.includes(newStatus)) {
    throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
  }

  // Update status and relevant timestamps
  groupLoan.status = newStatus;
  groupLoan.lastUpdatedBy = userId;

  switch (newStatus) {
    case 'approved':
      groupLoan.approvedAt = new Date();
      groupLoan.approvedBy = userId;
      break;
    case 'rejected':
      groupLoan.rejectedAt = new Date();
      groupLoan.rejectedBy = userId;
      break;
    case 'disbursed':
    case 'partially_disbursed':
      groupLoan.disbursedAt = new Date();
      groupLoan.actualDisbursementDate = new Date();
      break;
    case 'closed':
      groupLoan.closedAt = new Date();
      groupLoan.closedBy = userId;
      break;
  }

  return await groupLoan.save();
};

// Static method to get status history
groupLoanSchema.statics.getStatusHistory = function(loanId) {
  return this.aggregate([
    { $match: { loanId } },
    {
      $project: {
        statusHistory: {
          applied: '$applicationDate',
          approved: '$approvedAt',
          rejected: '$rejectedAt',
          disbursed: '$disbursedAt',
          closed: '$closedAt'
        }
      }
    }
  ]);
};

// Virtual for status timeline
groupLoanSchema.virtual('statusTimeline').get(function() {
  return {
    applied: this.applicationDate,
    approved: this.approvedAt,
    rejected: this.rejectedAt,
    disbursed: this.disbursedAt,
    closed: this.closedAt
  };
});

// Indexes for better performance
groupLoanSchema.index({ status: 1 });
groupLoanSchema.index({ approvedAt: 1 });
groupLoanSchema.index({ rejectedAt: 1 });
groupLoanSchema.index({ disbursedAt: 1 });
groupLoanSchema.index({ createdBy: 1 });
groupLoanSchema.index({ groupCode: 1, status: 1 });

export default mongoose.model('GroupLoan', groupLoanSchema);