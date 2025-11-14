// models/InsurancePolicy.js
import mongoose from 'mongoose';

const insurancePolicySchema = new mongoose.Schema({
  // Core Policy Information
  policyNumber: {
    type: String,
    required: true,
    unique: true
  },
  policyType: {
    type: String,
    required: true,
    enum: ['LOAN_PROTECTION', 'LIFE', 'HEALTH', 'AUTO', 'PROPERTY', 'TRAVEL', 'BUSINESS'],
    default: 'LOAN_PROTECTION'
  },
  
  // Financial Details
  premiumAmount: {
    type: Number,
    required: true
  },
  insuredAmount: {
    type: Number,
    required: true
  },
  coverageAmount: {
    type: Number,
    required: true
  },
  
  // Dates
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  coverageDuration: {
    type: Number, // in days
    required: true
  },
  
  // Status
  status: {
    type: String,
    enum: ['ACTIVE', 'PENDING', 'EXPIRED', 'CANCELLED', 'CLAIMED'],
    default: 'ACTIVE'
  },
  
  // Relationships
  loanAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanAccount',
    required: true
  },
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  customerName: {
    type: String,
    required: true
  },
  
  // Insurance Provider
  provider: {
    type: String,
    required: true,
    default: 'DEFAULT_INSURER'
  },
  providerCode: {
    type: String
  },
  
  // Branch Information (aligned with your GL structure)
  branchCode: {
    type: String,
    required: true
  },
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Branch',
    required: true
  },
  
  // Payment Information
  premiumPaid: {
    type: Boolean,
    default: false
  },
  paymentDate: {
    type: Date
  },
  paymentMethod: {
    type: String,
    enum: ['LOAN_DISBURSEMENT', 'CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'DIRECT_DEBIT'],
    default: 'LOAN_DISBURSEMENT'
  },
  
  // GL Account Integration
  glAccountCode: {
    type: String // Links to INSURANCE_FEE GL account
  },
  transactionReference: {
    type: String // Reference to the ledger transaction
  },
  
  // Coverage Details
  coverageType: {
    type: String,
    enum: ['FULL_LOAN_COVERAGE', 'PARTIAL_COVERAGE', 'LIFE_COVERAGE', 'ASSET_COVERAGE'],
    default: 'FULL_LOAN_COVERAGE'
  },
  beneficiaries: [{
    name: String,
    relationship: String,
    allocation: Number, // percentage
    idNumber: String
  }],
  
  // Claim Information
  claimHistory: [{
    claimDate: Date,
    claimAmount: Number,
    claimReason: String,
    status: String,
    settledAmount: Number,
    settlementDate: Date
  }],
  
  // Audit Fields
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Metadata for integration with your GL system
  metadata: {
    loanAmount: Number,
    loanTerm: String,
    termValue: Number,
    productType: String,
    insuranceFeeIncluded: {
      type: Boolean,
      default: false
    },
    glTransactionId: mongoose.Schema.Types.ObjectId
  }
});

// Indexes for better query performance
insurancePolicySchema.index({ policyNumber: 1 });
insurancePolicySchema.index({ loanAccount: 1 });
insurancePolicySchema.index({ customerId: 1 });
insurancePolicySchema.index({ branchCode: 1 });
insurancePolicySchema.index({ status: 1 });
insurancePolicySchema.index({ endDate: 1 });

// Update the updatedAt field before saving
insurancePolicySchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Virtual for checking if policy is active
insurancePolicySchema.virtual('isActive').get(function() {
  const now = new Date();
  return this.status === 'ACTIVE' && this.endDate > now;
});

// Method to check if policy is expiring soon (within 30 days)
insurancePolicySchema.methods.isExpiringSoon = function() {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  return this.endDate <= thirtyDaysFromNow && this.status === 'ACTIVE';
};

// Static method to find active policies by branch
insurancePolicySchema.statics.findActiveByBranch = function(branchCode) {
  return this.find({
    branchCode: branchCode,
    status: 'ACTIVE',
    endDate: { $gt: new Date() }
  });
};

// Static method to calculate total insured amount by branch
insurancePolicySchema.statics.getTotalInsuredByBranch = function(branchCode) {
  return this.aggregate([
    {
      $match: {
        branchCode: branchCode,
        status: 'ACTIVE',
        endDate: { $gt: new Date() }
      }
    },
    {
      $group: {
        _id: '$branchCode',
        totalInsuredAmount: { $sum: '$insuredAmount' },
        totalPremium: { $sum: '$premiumAmount' },
        policyCount: { $sum: 1 }
      }
    }
  ]);
};

const InsurancePolicy = mongoose.model('InsurancePolicy', insurancePolicySchema);

export default InsurancePolicy;