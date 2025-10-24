import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const GuarantorSchema = new mongoose.Schema(
  {
    GUARANTOR_ID: {
      type: String,
      required: [true, 'Guarantor ID is required'],
      unique: true,
      match: [/^\d{7}$/, 'Guarantor ID must be a 7-digit string'],
      immutable: true,
    },
    fullName: {
      type: String,
      required: [true, 'Full name is required'],
      trim: true,
      maxlength: [100, 'Full name cannot exceed 100 characters'],
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      match: [/^\+?\d{10,15}$/, 'Phone number must be 10-15 digits'],
    },
    relationshipToBorrower: {
      type: String,
      required: [true, 'Relationship to borrower is required'],
      enum: {
        values: [
          'Parent',
          'Sibling',
          'Spouse',
          'Business Partner',
          'Friend',
          'Relative',
          'Colleague',
          'Other',
        ],
        message: '{VALUE} is not a valid relationship type',
      },
    },
    GUARANTEED_AMT: {
      type: mongoose.Types.Decimal128,
      required: [true, 'Guaranteed amount is required'],
      min: [0, 'Guaranteed amount cannot be negative'],
      get: (v) => (v ? parseFloat(v.toString()) : v),
    },
    createdBy: {
      type: String,
      required: [true, 'Created by is required'],
    },
    relationshipOfficerName: {
      type: String,
      required: [true, 'Relationship officer name is required'],
    },
    loanId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanAccount',
      default: null,
      required: [
        function () {
          return this.createdBy !== 'system';
        },
        'Loan ID is required unless created by system',
      ],
    },
    
    // EXISTING FIELDS:
    guaranteedLoans: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanAccount'
    }],
    
    removedAt: {
      type: Date,
      default: null
    },
    
    removalReason: {
      type: String,
      default: null
    },
    
    updatedBy: {
      type: String,
      default: null
    },

    // UPDATED STATUS FIELD - ADD 'DEACTIVATED'
    status: {
      type: String,
      enum: {
        values: ['ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'DEACTIVATED'],
        message: '{VALUE} is not a valid status',
      },
      default: 'PENDING',
    },

    // ADD APPROVAL WORKFLOW FIELDS:
    removalRequest: {
      requestedAt: {
        type: Date,
        default: null
      },
      requestedBy: {
        type: String,
        default: null
      },
      reason: {
        type: String,
        default: null
      },
      notes: {
        type: String,
        default: null
      },
      loanAccountNumber: {
        type: String,
        default: null
      },
      status: {
        type: String,
        enum: ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'],
        default: 'PENDING'
      },
      approvedBy: {
        type: String,
        default: null
      },
      approvedAt: {
        type: Date,
        default: null
      }
    },

    email: {
      type: String,
      required: [
        function () {
          return this.verificationStatus === 'Verified';
        },
        'Email is required for verified guarantors',
      ],
      match: [/\S+@\S+\.\S+/, 'Invalid email format'],
      lowercase: true,
    },
    address: {
      type: String,
    },
    state: {
      type: String,
      required: [true, 'State is required'],
    },
    localGovernment: {
      type: String,
      default: null,
    },
    BU_ID: {
      type: String,
      required: [true, 'Business Unit ID is required'],
    },
    country: {
      type: String,
      default: 'Nigeria',
    },
    idType: {
      type: String,
    },
    idNumber: {
      type: String,
    },
    bvn: {
      type: String,
      match: [/^\d{11}$/, 'BVN must be 11 digits'],
    },
    dateOfBirth: {
      type: Date,
    },
    netWorth: {
      type: mongoose.Types.Decimal128,
      min: [0, 'Net worth cannot be negative'],
      get: (v) => (v ? parseFloat(v.toString()) : v),
    },
    annualIncome: {
      type: mongoose.Types.Decimal128,
      min: [0, 'Annual income cannot be negative'],
      get: (v) => (v ? parseFloat(v.toString()) : v),
    },
    occupation: {
      type: String,
    },
    employmentType: {
      type: String,
    },
    verificationStatus: {
      type: String,
      enum: {
        values: ['Pending', 'Verified', 'Rejected', 'Expired'],
        message: '{VALUE} is not a valid verification status',
      },
      default: 'Pending',
    },
    verifiedBy: {
      type: String,
    },
    verificationDate: {
      type: Date,
    },
    consentDate: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      transform: function (doc, ret) {
        ret.GUARANTEED_AMT = ret.GUARANTEED_AMT !== undefined ? parseFloat(ret.GUARANTEED_AMT.toString()) : null;
        ret.netWorth = ret.netWorth !== undefined ? parseFloat(ret.netWorth.toString()) : null;
        ret.annualIncome = ret.annualIncome !== undefined ? parseFloat(ret.annualIncome.toString()) : null;
        return ret;
      },
    },
  }
);

// Pre-save validation
GuarantorSchema.pre('save', function (next) {
  if (this.verificationStatus === 'Verified') {
    if (!this.verifiedBy) {
      throw new Error('Verifier must be specified when status is Verified');
    }
    if (!this.email) {
      throw new Error('Email is required for verified guarantors');
    }
    if (!this.consentDate) {
      this.consentDate = new Date();
    }
  }
  
  // Auto-set removal request status based on main status
  if (this.removalRequest && this.removalRequest.status === 'PENDING' && this.status === 'DEACTIVATED') {
    this.removalRequest.status = 'APPROVED';
    this.removalRequest.approvedAt = new Date();
  }
  
  next();
});

// Plugins
GuarantorSchema.plugin(mongoosePaginate);

// Indexes
GuarantorSchema.index({ fullName: 'text', idNumber: 'text' });
GuarantorSchema.index({ loanId: 1, isActive: 1 });
GuarantorSchema.index({ BU_ID: 1 });
GuarantorSchema.index({ 'removalRequest.status': 1 }); // New index for approval workflow

// Static methods for approval workflow
GuarantorSchema.statics.findActiveByLoan = function (loanId) {
  return this.find({ loanId, isActive: true });
};

// Find pending removal requests
GuarantorSchema.statics.findPendingRemovals = function () {
  return this.find({ 
    'removalRequest.status': 'PENDING',
    isActive: true 
  });
};

// Find by removal request status
GuarantorSchema.statics.findByRemovalStatus = function (status) {
  return this.find({ 'removalRequest.status': status });
};

const Guarantor = mongoose.models.Guarantor || mongoose.model('Guarantor', GuarantorSchema);
export default Guarantor;