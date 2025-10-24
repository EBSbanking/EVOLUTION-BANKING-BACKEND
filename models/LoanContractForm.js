import mongoose from 'mongoose';

const LoanContractFormSchema = new mongoose.Schema({
  loan_contract_no: {
    type: String,
    required: true,
    unique: true
  },
  customer_id: {
    type: String,
    required: true
  },
  borrower_name: {
    type: String,
    required: true
  },
  co_signatory_name: {
    type: String,
    default: ''
  },
  borrower_address: {
    type: String,
    default: 'Address Not Provided'
  },
  loan_purpose: {
    type: String,
    required: true
  },
  loan_amount: {
    type: String,
    required: true
  },
  loan_term: {
    type: Number,
    required: true
  },
  TERM_CD: {
    type: String,
    enum: ['M', 'Y'],  // Only allows 'M' or 'Y'
    default: 'M',      // Default to months if not provided
    required: true,
    uppercase: true    // Automatically converts to uppercase
  },
  interest_rate: {
    type: Number,
    required: true
  },
  interest_rate_id: {
    type: Number,
    default: 101       // Default value if not provided
  },
  guarantor_name: {
    type: String,
    default: ''
  },
  bank_name: {
    type: String,
    required: true
  },
  bank_short: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'DISBURSED', 'ACTIVE', 'CLOSED'],
    default: 'PENDING'
  },
  contract_text: {
    type: String,
    default: ''
  },
  USER_ID: {
    type: String,
    required: true
  },
  applicationId: {
    type: String,
    required: true
  },
  loanAccountNo: {
    type: String,
    required: true
  },
  fundingAccountNo: {
    type: String,
    required: true
  },
  workflowId: {
    type: Number,
    unique: true
  },
  fees: {
    processingFee: {
      type: Number,
      required: true
    },
    latePaymentFee: {
      type: Number,
      default: 0
    },
    earlyRepaymentFee: {
      type: Number,
      default: 0
    }
  },
  signatureRequirements: {
    customerSignatureRequired: {
      type: Boolean,
      default: true
    },
    witnessSignatureRequired: {
      type: Boolean,
      default: false
    },
    bankOfficerSignatureRequired: {
      type: Boolean,
      default: true
    }
  },
  metadata: {
    productId: String,
    rateIndexId: String,
    applicationSource: String
  },
  disbursementDate: {
    type: Date,
    default: null
  },
  maturityDate: {
    type: Date,
    default: null
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Enhanced pre-save hook
LoanContractFormSchema.pre('save', function(next) {
  // Generate workflowId if not provided
  if (!this.workflowId) {
    this.workflowId = Number(`${Date.now()}${Math.floor(Math.random() * 1000)}`);
  }

  // Ensure TERM_CD is valid and uppercase
  if (!this.TERM_CD) {
    this.TERM_CD = 'M';
  }
  this.TERM_CD = this.TERM_CD.toUpperCase();
  if (!['M', 'Y'].includes(this.TERM_CD)) {
    this.TERM_CD = 'M';
  }

  // Ensure interest_rate_id is valid
  if (!this.interest_rate_id || isNaN(this.interest_rate_id)) {
    this.interest_rate_id = 101;
  }

  next();
});

// // Add indexes for frequently queried fields
// LoanContractFormSchema.index({ loan_contract_no: 1 });
// LoanContractFormSchema.index({ customer_id: 1 });
// LoanContractFormSchema.index({ status: 1 });
// LoanContractFormSchema.index({ applicationId: 1 });
// LoanContractFormSchema.index({ workflowId: 1 });
// LoanContractFormSchema.index({ loanAccountNo: 1 });
// LoanContractFormSchema.index({ TERM_CD: 1 }); // Added index for TERM_CD

const LoanContractForm = mongoose.model('LoanContractForm', LoanContractFormSchema);

export default LoanContractForm;