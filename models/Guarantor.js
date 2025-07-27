import mongoose from 'mongoose';
import mongoosePaginate from 'mongoose-paginate-v2';

const GuarantorSchema = new mongoose.Schema({
  loanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanAccount',
    required: function () {
      return this.createdBy !== 'system';
    }
  },
  GUARANTOR_ID: {
    type: String,
    required: true,
    unique: true,
    immutable: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  status: {
    type: String,
    enum: ["ACTIVE", "PENDING", "REJECTED", "EXPIRED"]
  },
  phoneNumber: {
    type: String,
    required: true,
    match: [/^\+?\d{10,15}$/, 'Phone number must be 10-15 digits']
  },
  relationshipToBorrower: {
    type: String,
    required: true,
    enum: [
      "Parent", "Sibling", "Spouse", "Business Partner",
      "Friend", "Relative", "Colleague", "Other"
    ]
  },
  email: {
    type: String,
    required: function () {
      return this.verificationStatus === 'Verified';
    },
    match: [/\S+@\S+\.\S+/, 'Invalid email format'],
    lowercase: true
  },
  address: String,
  country: {
    type: String,
    default: "Nigeria"
  },
  idType: String,
  idNumber: String,
  bvn: {
    type: String,
    match: [/^\d{11}$/, 'BVN must be 11 digits']
  },
  dateOfBirth: Date,
  GUARANTEED_AMT: {
    type: mongoose.Types.Decimal128,
    required: true,
    min: 0
  },
  occupation: String,
  RELATIONSHIP_OFFICER_ID: String,
  verificationStatus: {
    type: String,
    enum: ["Pending", "Verified", "Rejected", "Expired"],
    default: "Pending"
  },
  verifiedBy: String,
  verificationDate: Date,
  consentDate: Date,
  createdBy: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function (doc, ret) {
      ret.GUARANTEED_AMT = parseFloat(ret.GUARANTEED_AMT?.toString());
      return ret;
    }
  }
});

// ✅ Plugins
GuarantorSchema.plugin(mongoosePaginate);

// ✅ Indexes
GuarantorSchema.index({ fullName: 'text', idNumber: 'text' }); // compound text index
GuarantorSchema.index({ loanId: 1, isActive: 1 });
GuarantorSchema.index({ RELATIONSHIP_OFFICER_ID: 1 });

// ✅ Pre-save validation
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
  next();
});

// ✅ Static method
GuarantorSchema.statics.findActiveByLoan = function (loanId) {
  return this.find({ loanId, isActive: true });
};

const Guarantor = mongoose.models.Guarantor || mongoose.model('Guarantor', GuarantorSchema);
export default Guarantor;
