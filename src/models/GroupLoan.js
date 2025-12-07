// models/GroupLoan.js - Updated with Decimal128 for monetary fields, safe handling, and unified structure
import mongoose from 'mongoose';

// Safe decimal utility function
const safeDecimal = (value, defaultValue = '0.00') => {
  if (value === null || value === undefined) return mongoose.Types.Decimal128.fromString(defaultValue);
  if (typeof value === 'object' && value.toString) {
    // Handle existing Decimal128 or other numeric objects
    return mongoose.Types.Decimal128.fromString(value.toString());
  }
  const numStr = Number(value).toFixed(2);
  return mongoose.Types.Decimal128.fromString(isNaN(Number(numStr)) ? defaultValue : numStr);
};

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
    type: mongoose.Schema.Types.Decimal128,
    required: [true, 'Total amount is required'],
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => safeDecimal(v),
    min: [0, 'Total amount must be positive'],
  },
  individualShare: {
    type: mongoose.Schema.Types.Decimal128,
    required: [true, 'Individual share is required (auto-calculated)'],
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => safeDecimal(v),
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
      type: mongoose.Schema.Types.Decimal128,
      required: true, 
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => safeDecimal(v),
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
  
  // NEW: Collection tracking fields
  lastCollectionDate: {
    type: Date,
    default: null
  },
  collectionHistory: [{
    collectionDate: { type: Date, default: Date.now },
    collectedBy: { type: String, required: true },
    loanCollections: [{
      accountNo: String,
      amount: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => v ? parseFloat(v.toString()) : 0,
        set: v => safeDecimal(v),
      },
      receiptNo: String,
      installmentNo: Number
    }],
    savingsCollections: [{
      accountNo: String,
      amount: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => v ? parseFloat(v.toString()) : 0,
        set: v => safeDecimal(v),
      },
      type: String // 'GROUP_SAVINGS' or 'INDIVIDUAL_SAVINGS'
    }],
    successfulCollections: { type: Number, default: 0 },
    failedCollections: { type: Number, default: 0 },
    savingsProcessed: { type: Number, default: 0 },
    totalLoanCollected: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => safeDecimal(v),
      default: '0.00'
    },
    totalSavingsCollected: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => safeDecimal(v),
      default: '0.00'
    },
    repaymentSchedulesUpdated: { type: Number, default: 0 },
    paymentMethod: { type: String, default: 'CASH' },
    transactionReference: String
  }],
  
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
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => safeDecimal(v),
    min: 0,
    default: '0.00' 
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
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => safeDecimal(v),
    default: '0.00' 
  },
  
  // Financial fields with proper defaults
  individualLoanAccounts: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanAccount',
  }],
  totalInterest: { 
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => safeDecimal(v),
    default: '0.00' 
  },
  totalRepayable: { 
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => safeDecimal(v),
    default: '0.00' 
  },
  totalRepaid: { 
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => safeDecimal(v),
    default: '0.00' 
  },
  remainingBalance: { 
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => safeDecimal(v),
    default: '0.00' 
  },
  installmentAmount: { 
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => safeDecimal(v),
    default: '0.00' 
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
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => safeDecimal(v),
    default: '0.00' 
  },
  totalFees: { 
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => safeDecimal(v),
    default: '0.00' 
  },
  upfrontInterestAmount: { 
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => safeDecimal(v),
    default: '0.00' 
  },
  remainingInterestAmount: { 
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => safeDecimal(v),
    default: '0.00' 
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
      totalDisbursed: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => v ? parseFloat(v.toString()) : 0,
        set: v => safeDecimal(v),
        default: '0.00'
      },
      totalFeesCollected: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => v ? parseFloat(v.toString()) : 0,
        set: v => safeDecimal(v),
        default: '0.00'
      },
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
        loanAmount: {
          type: mongoose.Schema.Types.Decimal128,
          get: v => v ? parseFloat(v.toString()) : 0,
          set: v => safeDecimal(v),
          default: '0.00'
        },
        feesPaid: {
          type: mongoose.Schema.Types.Decimal128,
          get: v => v ? parseFloat(v.toString()) : 0,
          set: v => safeDecimal(v),
          default: '0.00'
        },
        netReceived: {
          type: mongoose.Schema.Types.Decimal128,
          get: v => v ? parseFloat(v.toString()) : 0,
          set: v => safeDecimal(v),
          default: '0.00'
        },
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
        totalFees: {
          type: mongoose.Schema.Types.Decimal128,
          get: v => v ? parseFloat(v.toString()) : 0,
          set: v => safeDecimal(v),
          default: '0.00'
        },
        feeBreakdown: {
          processingFee: {
            type: mongoose.Schema.Types.Decimal128,
            get: v => v ? parseFloat(v.toString()) : 0,
            set: v => safeDecimal(v),
            default: '0.00'
          },
          adminFee: {
            type: mongoose.Schema.Types.Decimal128,
            get: v => v ? parseFloat(v.toString()) : 0,
            set: v => safeDecimal(v),
            default: '0.00'
          },
          insuranceFee: {
            type: mongoose.Schema.Types.Decimal128,
            get: v => v ? parseFloat(v.toString()) : 0,
            set: v => safeDecimal(v),
            default: '0.00'
          },
          otherFees: {
            type: mongoose.Schema.Types.Decimal128,
            get: v => v ? parseFloat(v.toString()) : 0,
            set: v => safeDecimal(v),
            default: '0.00'
          },
          upfrontInterest: {
            type: mongoose.Schema.Types.Decimal128,
            get: v => v ? parseFloat(v.toString()) : 0,
            set: v => safeDecimal(v),
            default: '0.00'
          }
        },
        accountDebited: { type: String, default: '' },
        previousBalance: {
          type: mongoose.Schema.Types.Decimal128,
          get: v => v ? parseFloat(v.toString()) : 0,
          set: v => safeDecimal(v),
          default: '0.00'
        },
        newBalance: {
          type: mongoose.Schema.Types.Decimal128,
          get: v => v ? parseFloat(v.toString()) : 0,
          set: v => safeDecimal(v),
          default: '0.00'
        }
      }],
      insuranceActivated: [{
        custId: { type: String, default: '' },
        name: { type: String, default: '' },
        loanAccountNumber: { type: String, default: '' },
        premium: {
          type: mongoose.Schema.Types.Decimal128,
          get: v => v ? parseFloat(v.toString()) : 0,
          set: v => safeDecimal(v),
          default: '0.00'
        },
        coverage: {
          type: mongoose.Schema.Types.Decimal128,
          get: v => v ? parseFloat(v.toString()) : 0,
          set: v => safeDecimal(v),
          default: '0.00'
        },
        policyNumber: { type: String, default: '' }
      }],
      insufficientFunds: [{
        custId: { type: String, default: '' },
        name: { type: String, default: '' },
        loanAccountNumber: { type: String, default: '' },
        requiredFees: {
          type: mongoose.Schema.Types.Decimal128,
          get: v => v ? parseFloat(v.toString()) : 0,
          set: v => safeDecimal(v),
          default: '0.00'
        },
        availableBalance: {
          type: mongoose.Schema.Types.Decimal128,
          get: v => v ? parseFloat(v.toString()) : 0,
          set: v => safeDecimal(v),
          default: '0.00'
        },
        shortfall: {
          type: mongoose.Schema.Types.Decimal128,
          get: v => v ? parseFloat(v.toString()) : 0,
          set: v => safeDecimal(v),
          default: '0.00'
        },
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
    processingFee: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => safeDecimal(v),
      default: '0.00'
    },
    adminFee: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => safeDecimal(v),
      default: '0.00'
    },
    insuranceFee: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => safeDecimal(v),
      default: '0.00'
    },
    otherFees: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => safeDecimal(v),
      default: '0.00'
    },
    totalCharges: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => safeDecimal(v),
      default: '0.00'
    },
    totalFees: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => safeDecimal(v),
      default: '0.00'
    },
    charges: [{
      chargeId: { type: Number, default: 0 },
      chargeCode: { type: String, default: '' },
      name: { type: String, default: '' },
      amount: {
        type: mongoose.Schema.Types.Decimal128,
        get: v => v ? parseFloat(v.toString()) : 0,
        set: v => safeDecimal(v),
        default: '0.00'
      },
      glAccountCode: { type: String, default: '' },
      chargeType: { type: String, default: '' },
      isUpfront: { type: Boolean, default: false }
    }],
    upfrontInterestPercentage: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => safeDecimal(v),
      default: '0.00'
    },
    processingFeePercentage: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => safeDecimal(v),
      default: '0.00'
    },
    adminFeeAmount: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => safeDecimal(v),
      default: '0.00'
    }
  },
  
  // Insurance details with defaults
  insuranceDetails: {
    totalPremium: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => safeDecimal(v),
      default: '0.00'
    },
    totalCoverage: {
      type: mongoose.Schema.Types.Decimal128,
      get: v => v ? parseFloat(v.toString()) : 0,
      set: v => safeDecimal(v),
      default: '0.00'
    },
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
  upfrontInterestPercentage: {
    type: mongoose.Schema.Types.Decimal128,
    get: v => v ? parseFloat(v.toString()) : 0,
    set: v => safeDecimal(v),
    default: '0.00'
  }
}, {
  timestamps: false,
  toJSON: {
    getters: true,
    virtuals: true,
    transform: function (doc, ret) {
      // Transform Decimal128 fields to floats
      const decimalFields = [
        'totalAmount', 'individualShare', 'interestRate', 'savingsCollateral',
        'totalInterest', 'totalRepayable', 'totalRepaid', 'remainingBalance',
        'installmentAmount', 'netDisbursementAmount', 'totalFees', 'upfrontInterestAmount',
        'remainingInterestAmount'
      ];

      decimalFields.forEach(field => {
        if (ret[field] && typeof ret[field] === 'object') {
          ret[field] = parseFloat(ret[field].toString());
        }
      });

      // Handle nested Decimal128 in members
      if (ret.members) {
        ret.members = ret.members.map(member => ({
          ...member,
          individualAmount: member.individualAmount && typeof member.individualAmount === 'object' 
            ? parseFloat(member.individualAmount.toString()) 
            : member.individualAmount
        }));
      }

      // Handle collectionHistory Decimal128
      if (ret.collectionHistory) {
        ret.collectionHistory = ret.collectionHistory.map(record => ({
          ...record,
          totalLoanCollected: record.totalLoanCollected && typeof record.totalLoanCollected === 'object' 
            ? parseFloat(record.totalLoanCollected.toString()) 
            : record.totalLoanCollected,
          totalSavingsCollected: record.totalSavingsCollected && typeof record.totalSavingsCollected === 'object' 
            ? parseFloat(record.totalSavingsCollected.toString()) 
            : record.totalSavingsCollected,
          loanCollections: record.loanCollections?.map(coll => ({
            ...coll,
            amount: coll.amount && typeof coll.amount === 'object' 
              ? parseFloat(coll.amount.toString()) 
              : coll.amount
          })) || [],
          savingsCollections: record.savingsCollections?.map(sav => ({
            ...sav,
            amount: sav.amount && typeof sav.amount === 'object' 
              ? parseFloat(sav.amount.toString()) 
              : sav.amount
          })) || []
        }));
      }

      // Handle disbursementResults Decimal128
      if (ret.disbursementResults) {
        const dr = ret.disbursementResults;
        if (dr.summary) {
          dr.summary.totalDisbursed = dr.summary.totalDisbursed && typeof dr.summary.totalDisbursed === 'object' 
            ? parseFloat(dr.summary.totalDisbursed.toString()) 
            : dr.summary.totalDisbursed;
          dr.summary.totalFeesCollected = dr.summary.totalFeesCollected && typeof dr.summary.totalFeesCollected === 'object' 
            ? parseFloat(dr.summary.totalFeesCollected.toString()) 
            : dr.summary.totalFeesCollected;
        }
        if (dr.details) {
          const details = dr.details;
          if (details.successful) {
            details.successful = details.successful.map(s => ({
              ...s,
              loanAmount: s.loanAmount && typeof s.loanAmount === 'object' ? parseFloat(s.loanAmount.toString()) : s.loanAmount,
              feesPaid: s.feesPaid && typeof s.feesPaid === 'object' ? parseFloat(s.feesPaid.toString()) : s.feesPaid,
              netReceived: s.netReceived && typeof s.netReceived === 'object' ? parseFloat(s.netReceived.toString()) : s.netReceived
            }));
          }
          if (details.feesCollected) {
            details.feesCollected = details.feesCollected.map(f => ({
              ...f,
              totalFees: f.totalFees && typeof f.totalFees === 'object' ? parseFloat(f.totalFees.toString()) : f.totalFees,
              feeBreakdown: {
                ...f.feeBreakdown,
                processingFee: f.feeBreakdown.processingFee && typeof f.feeBreakdown.processingFee === 'object' 
                  ? parseFloat(f.feeBreakdown.processingFee.toString()) : f.feeBreakdown.processingFee,
                adminFee: f.feeBreakdown.adminFee && typeof f.feeBreakdown.adminFee === 'object' 
                  ? parseFloat(f.feeBreakdown.adminFee.toString()) : f.feeBreakdown.adminFee,
                insuranceFee: f.feeBreakdown.insuranceFee && typeof f.feeBreakdown.insuranceFee === 'object' 
                  ? parseFloat(f.feeBreakdown.insuranceFee.toString()) : f.feeBreakdown.insuranceFee,
                otherFees: f.feeBreakdown.otherFees && typeof f.feeBreakdown.otherFees === 'object' 
                  ? parseFloat(f.feeBreakdown.otherFees.toString()) : f.feeBreakdown.otherFees,
                upfrontInterest: f.feeBreakdown.upfrontInterest && typeof f.feeBreakdown.upfrontInterest === 'object' 
                  ? parseFloat(f.feeBreakdown.upfrontInterest.toString()) : f.feeBreakdown.upfrontInterest
              },
              previousBalance: f.previousBalance && typeof f.previousBalance === 'object' 
                ? parseFloat(f.previousBalance.toString()) : f.previousBalance,
              newBalance: f.newBalance && typeof f.newBalance === 'object' 
                ? parseFloat(f.newBalance.toString()) : f.newBalance
            }));
          }
          if (details.insuranceActivated) {
            details.insuranceActivated = details.insuranceActivated.map(i => ({
              ...i,
              premium: i.premium && typeof i.premium === 'object' ? parseFloat(i.premium.toString()) : i.premium,
              coverage: i.coverage && typeof i.coverage === 'object' ? parseFloat(i.coverage.toString()) : i.coverage
            }));
          }
          if (details.insufficientFunds) {
            details.insufficientFunds = details.insufficientFunds.map(ifund => ({
              ...ifund,
              requiredFees: ifund.requiredFees && typeof ifund.requiredFees === 'object' 
                ? parseFloat(ifund.requiredFees.toString()) : ifund.requiredFees,
              availableBalance: ifund.availableBalance && typeof ifund.availableBalance === 'object' 
                ? parseFloat(ifund.availableBalance.toString()) : ifund.availableBalance,
              shortfall: ifund.shortfall && typeof ifund.shortfall === 'object' 
                ? parseFloat(ifund.shortfall.toString()) : ifund.shortfall
            }));
          }
        }
      }

      // Handle feeSummary Decimal128
      if (ret.feeSummary) {
        const fs = ret.feeSummary;
        ['processingFee', 'adminFee', 'insuranceFee', 'otherFees', 'totalCharges', 'totalFees', 
         'upfrontInterestPercentage', 'processingFeePercentage', 'adminFeeAmount'].forEach(key => {
          if (fs[key] && typeof fs[key] === 'object') {
            fs[key] = parseFloat(fs[key].toString());
          }
        });
        if (fs.charges) {
          fs.charges = fs.charges.map(charge => ({
            ...charge,
            amount: charge.amount && typeof charge.amount === 'object' 
              ? parseFloat(charge.amount.toString()) : charge.amount
          }));
        }
      }

      // Handle insuranceDetails Decimal128
      if (ret.insuranceDetails) {
        const id = ret.insuranceDetails;
        id.totalPremium = id.totalPremium && typeof id.totalPremium === 'object' 
          ? parseFloat(id.totalPremium.toString()) : id.totalPremium;
        id.totalCoverage = id.totalCoverage && typeof id.totalCoverage === 'object' 
          ? parseFloat(id.totalCoverage.toString()) : id.totalCoverage;
      }

      // Handle upfrontInterestPercentage
      if (ret.upfrontInterestPercentage && typeof ret.upfrontInterestPercentage === 'object') {
        ret.upfrontInterestPercentage = parseFloat(ret.upfrontInterestPercentage.toString());
      }

      if (ret._id) {
        ret._id = ret._id.toString();
      }

      return ret;
    }
  },
  toObject: { getters: true, virtuals: true }
});

// Pre-save hook with safe calculations and status validation - FIXED
groupLoanSchema.pre('save', function (next) {
  // Set timestamps
  if (this.isNew) {
    // Safe calculation of individualShare
    if (!this.individualShare && this.memberCount > 0 && this.totalAmount) {
      const total = parseFloat(this.totalAmount.toString());
      this.individualShare = mongoose.Types.Decimal128.fromString((total / this.memberCount).toFixed(2));
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
  
  // Safe calculations for financial fields using Decimal128
  const totalAmountNum = parseFloat(this.totalAmount?.toString() || '0');
  const totalInterestNum = parseFloat(this.totalInterest?.toString() || '0');
  const totalRepaidNum = parseFloat(this.totalRepaid?.toString() || '0');
  
  this.totalRepayable = mongoose.Types.Decimal128.fromString((totalAmountNum + totalInterestNum).toFixed(2));
  const repayableNum = totalAmountNum + totalInterestNum;
  const remainingNum = Math.max(0, repayableNum - totalRepaidNum);
  this.remainingBalance = mongoose.Types.Decimal128.fromString(remainingNum.toFixed(2));
  
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

// ==================== COLLECTION-RELATED METHODS ====================

// Method to update collection totals - Updated for Decimal128
groupLoanSchema.methods.updateCollectionTotals = function(loanAmount, savingsAmount = '0.00') {
  const currentRepaid = parseFloat(this.totalRepaid?.toString() || '0');
  const loanNum = parseFloat(loanAmount?.toString() || '0');
  const newRepaidNum = currentRepaid + loanNum;
  this.totalRepaid = mongoose.Types.Decimal128.fromString(newRepaidNum.toFixed(2));
  
  const repayableNum = parseFloat(this.totalRepayable?.toString() || '0');
  const remainingNum = Math.max(0, repayableNum - newRepaidNum);
  this.remainingBalance = mongoose.Types.Decimal128.fromString(remainingNum.toFixed(2));
  
  // Update last collection date
  this.lastCollectionDate = new Date();
  
  return this.save();
};

// Method to get collection summary - Updated for Decimal128
groupLoanSchema.methods.getCollectionSummary = function() {
  const totalExpected = parseFloat(this.totalRepayable?.toString() || '0');
  const totalCollected = parseFloat(this.totalRepaid?.toString() || '0');
  const collectionRate = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;
  
  return {
    totalExpected,
    totalCollected,
    remainingBalance: parseFloat(this.remainingBalance?.toString() || '0'),
    collectionRate: Math.round(collectionRate * 100) / 100,
    installmentsPaid: this.installmentsPaid || 0,
    lastCollectionDate: this.lastCollectionDate,
    totalMembers: this.memberCount,
    disbursedMembers: this.disbursedToMembers?.length || 0,
    repaidMembers: this.repaidToMembers?.length || 0
  };
};

// Method to add collection record to history - Updated for Decimal128
groupLoanSchema.methods.addCollectionRecord = function(collectionData) {
  if (!this.collectionHistory) {
    this.collectionHistory = [];
  }
  
  this.collectionHistory.push({
    collectionDate: collectionData.collectionDate || new Date(),
    collectedBy: collectionData.collectedBy,
    loanCollections: collectionData.loanCollections || [],
    savingsCollections: collectionData.savingsCollections || [],
    successfulCollections: collectionData.successfulCollections || 0,
    failedCollections: collectionData.failedCollections || 0,
    savingsProcessed: collectionData.savingsProcessed || 0,
    totalLoanCollected: safeDecimal(collectionData.totalLoanCollected),
    totalSavingsCollected: safeDecimal(collectionData.totalSavingsCollected),
    repaymentSchedulesUpdated: collectionData.repaymentSchedulesUpdated || 0,
    paymentMethod: collectionData.paymentMethod || 'CASH',
    transactionReference: collectionData.transactionReference
  });
  
  // Update last collection date
  this.lastCollectionDate = new Date();
  
  return this.save();
};

// Method to get collection performance - Updated for Decimal128
groupLoanSchema.methods.getCollectionPerformance = function() {
  const totalCollections = this.collectionHistory?.length || 0;
  const totalLoanCollected = this.collectionHistory?.reduce((sum, record) => 
    sum + parseFloat(record.totalLoanCollected?.toString() || '0'), 0) || 0;
  const totalSavingsCollected = this.collectionHistory?.reduce((sum, record) => 
    sum + parseFloat(record.totalSavingsCollected?.toString() || '0'), 0) || 0;
  
  const successfulCollections = this.collectionHistory?.reduce((sum, record) => 
    sum + (record.successfulCollections || 0), 0) || 0;
  const failedCollections = this.collectionHistory?.reduce((sum, record) => 
    sum + (record.failedCollections || 0), 0) || 0;
  const totalAttempted = successfulCollections + failedCollections;
  
  const successRate = totalAttempted > 0 ? (successfulCollections / totalAttempted) * 100 : 0;
  
  return {
    totalCollections,
    totalLoanCollected,
    totalSavingsCollected,
    successfulCollections,
    failedCollections,
    successRate: Math.round(successRate * 100) / 100,
    averageLoanCollection: totalCollections > 0 ? totalLoanCollected / totalCollections : 0,
    averageSavingsCollection: totalCollections > 0 ? totalSavingsCollected / totalCollections : 0
  };
};

// Method to mark member as repaid
groupLoanSchema.methods.markMemberAsRepaid = function(loanAccountId) {
  if (!this.repaidToMembers) {
    this.repaidToMembers = [];
  }
  
  // Add to repaid members if not already there
  if (!this.repaidToMembers.includes(loanAccountId)) {
    this.repaidToMembers.push(loanAccountId);
  }
  
  return this.save();
};

// Method to check if all members have repaid
groupLoanSchema.methods.allMembersRepaid = function() {
  const disbursedCount = this.disbursedToMembers?.length || 0;
  const repaidCount = this.repaidToMembers?.length || 0;
  
  return disbursedCount > 0 && disbursedCount === repaidCount;
};

// ==================== STATIC METHODS ====================

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

// Static method to find groups with overdue collections
groupLoanSchema.statics.findGroupsWithOverdueCollections = function(daysOverdue = 7) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOverdue);
  
  return this.find({
    status: { $in: ['active', 'disbursed', 'partially_disbursed'] },
    $or: [
      { lastCollectionDate: { $lt: cutoffDate } },
      { lastCollectionDate: { $exists: false } }
    ]
  }).populate('individualLoanAccounts');
};

// Static method to find groups by collection performance
groupLoanSchema.statics.findByCollectionPerformance = function(minSuccessRate = 80) {
  return this.aggregate([
    {
      $match: {
        status: { $in: ['active', 'disbursed', 'partially_disbursed'] }
      }
    },
    {
      $addFields: {
        collectionPerformance: {
          $cond: {
            if: { $gt: [{ $size: '$collectionHistory' }, 0] },
            then: {
              totalCollections: { $size: '$collectionHistory' },
              totalLoanCollected: { 
                $sum: '$collectionHistory.totalLoanCollected' 
              },
              successRate: {
                $multiply: [
                  {
                    $divide: [
                      { $sum: '$collectionHistory.successfulCollections' },
                      { $add: [
                        { $sum: '$collectionHistory.successfulCollections' },
                        { $sum: '$collectionHistory.failedCollections' }
                      ]}
                    ]
                  },
                  100
                ]
              }
            },
            else: {
              totalCollections: 0,
              totalLoanCollected: mongoose.Types.Decimal128.fromString('0.00'),
              successRate: 0
            }
          }
        }
      }
    },
    {
      $match: {
        'collectionPerformance.successRate': { $gte: minSuccessRate }
      }
    },
    {
      $sort: { 'collectionPerformance.successRate': -1 }
    }
  ]);
};

// ==================== VIRTUAL FIELDS ====================

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

// Virtual for collection progress - Updated for Decimal128
groupLoanSchema.virtual('collectionProgress').get(function() {
  const totalExpected = parseFloat(this.totalRepayable?.toString() || '0');
  const totalCollected = parseFloat(this.totalRepaid?.toString() || '0');
  const progress = totalExpected > 0 ? (totalCollected / totalExpected) * 100 : 0;
  
  return {
    percentage: Math.round(progress * 100) / 100,
    amountCollected: totalCollected,
    amountRemaining: Math.max(0, totalExpected - totalCollected),
    isComplete: totalCollected >= totalExpected
  };
});

// Virtual for days since last collection
groupLoanSchema.virtual('daysSinceLastCollection').get(function() {
  if (!this.lastCollectionDate) return null;
  const today = new Date();
  const lastCollection = new Date(this.lastCollectionDate);
  const diffTime = Math.abs(today - lastCollection);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for collection frequency (average days between collections)
groupLoanSchema.virtual('averageCollectionFrequency').get(function() {
  if (!this.collectionHistory || this.collectionHistory.length < 2) return null;
  
  const sortedDates = this.collectionHistory
    .map(record => new Date(record.collectionDate))
    .sort((a, b) => a - b);
  
  let totalDays = 0;
  for (let i = 1; i < sortedDates.length; i++) {
    const diffTime = Math.abs(sortedDates[i] - sortedDates[i - 1]);
    totalDays += Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }
  
  return Math.round(totalDays / (sortedDates.length - 1));
});

// ==================== INDEXES FOR PERFORMANCE ====================

groupLoanSchema.index({ status: 1 });
groupLoanSchema.index({ approvedAt: 1 });
groupLoanSchema.index({ rejectedAt: 1 });
groupLoanSchema.index({ disbursedAt: 1 });
groupLoanSchema.index({ createdBy: 1 });
groupLoanSchema.index({ groupCode: 1, status: 1 });
groupLoanSchema.index({ lastCollectionDate: 1 });
groupLoanSchema.index({ totalRepaid: 1 });
groupLoanSchema.index({ remainingBalance: 1 });

export default mongoose.models.GroupLoan || mongoose.model('GroupLoan', groupLoanSchema);