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

// UPDATED: Match LoanAccount's Borrower_address field names exactly
const Borrower_addressSchema = new mongoose.Schema({
  street: {
    type: String,
    required: true,
    trim: true
  },
  state: {
    type: String,
    required: true,
    trim: true
  },
  city: {
    type: String,
    required: true,
    trim: true
  },
  zipCode: {
    type: String,
    required: true,
    trim: true
  },
  country: {
    type: String,
    required: true,
    default: 'Nigeria',
    trim: true
  }
});

// UPDATED: Match LoanAccount's guarantorDetails structure exactly
const guarantorDetailsSchema = new mongoose.Schema({
  guarantorId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Guarantor'
  },
  name: { type: String },
  phone: { type: String },
  relationship: { type: String },
  guarantorNumberId: { type: String },
  email: { type: String },
  address: { type: String },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'ACTIVE', 'REJECTED'],
    default: 'PENDING'
  },
  guaranteedAmount: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  }
});

const LoanDisbursementSchema = new mongoose.Schema({
  // Core Application Fields - MATCHING LoanAccount
  APPL_ID: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  CUST_ID: {
    type: Number, // CHANGED: Number to match LoanAccount
    required: true,
    index: true
  },
  ACCT_NO: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },

  // Loan Details - MATCHING LoanAccount
  AMOUNT: {
    type: mongoose.Types.Decimal128,
    required: true
  },
  TERM_CD: {
    type: String,
    required: true,
    enum: ['D', 'W', 'M', 'Q', 'Y'], // CHANGED: Removed 'BW' to match LoanAccount
    uppercase: true,
    trim: true
  },
  TERM_VALUE: {
    type: Number,
    required: true
  },
  INTEREST_RATE: {
    type: mongoose.Types.Decimal128,
    required: true
  },
  PROD_ID: {
    type: Number, // CHANGED: Number to match LoanAccount
    required: true,
    validate: {
      validator: function(v) {
        const validProdIds = [300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 399];
        return validProdIds.includes(v);
      },
      message: props => `${props.value} is not a valid PROD_ID!`
    }
  },
  INDEX_RATE_ID: {
    type: Number, // CHANGED: Number to match LoanAccount
    required: true
  },

  // Dates - MATCHING LoanAccount
  DISBURSEMENT_DATE: {
    type: Date,
    required: true,
    default: Date.now
  },
  START_DT: { // CHANGED: START_DATE to START_DT to match LoanAccount
    type: Date,
    required: true,
    default: Date.now
  },
  MATURITY_DT: { // CHANGED: MATURITY_DATE to MATURITY_DT to match LoanAccount
    type: Date,
    required: true
  },

  // Product Information - MATCHING LoanAccount
  PRODUCT_TYPE: {
    type: String,
    required: true,
    trim: true,
    enum: [
      'BUSINESS TERM LOAN',
      'INDIVIDUAL LOAN',
      'CONSUMER LOAN',
      'MORTGAGE',
      'AUTO LOAN',
      'PERSONAL LOAN',
      'EDUCATION LOAN',
      'CREDIT CARD',
      'LINE OF CREDIT',
      'SME LOAN',
      'GENERAL LOAN'
    ]
  },

  // Borrower Information - MATCHING LoanAccount
  borrower_name: {
    type: String,
    trim: true
  },
  // CHANGED: borrower_address to Borrower_address to match LoanAccount
  Borrower_address: Borrower_addressSchema,

  // Status and Workflow - MATCHING LoanAccount
  LOAN_STATUS: { // CHANGED: STATUS to LOAN_STATUS to match LoanAccount
    type: String,
    required: true,
    enum: ['ACTIVE', 'PENDING', 'APPROVED', 'REJECTED', 'CLOSED', 'WRITTEN_OFF', 'OVERDUE'],
    default: 'PENDING'
  },
  CREATED_BY: {
    type: String,
    required: true,
    trim: true
  },
  USER_ID: {
    type: String,
    required: true,
    trim: true
  },

  // Financial Details - MATCHING LoanAccount
  DISBURSEMENT_LIMIT: { // CHANGED: AMOUNT to DISBURSEMENT_LIMIT to match LoanAccount
    type: mongoose.Types.Decimal128,
    required: true
  },
  ACTUAL_DISBURSEMENT: { // CHANGED: NET_DISBURSEMENT_AMOUNT to ACTUAL_DISBURSEMENT
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  TOTAL_FEES: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  FEE_DETAILS: feeDetailsSchema,

  // Interest Options - MATCHING LoanAccount
  deductUpfrontInterest: {
    type: Boolean,
    default: false
  },
  partialUpfrontInterest: {
    type: Boolean,
    default: false
  },
  upfrontInterestPercentage: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  upfrontInterestAmount: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  remainingInterestAmount: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },

  // Guarantor Information - MATCHING LoanAccount
  GUARANTOR_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guarantor'
  },
  GUARANTEED_AMT: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  // CHANGED: Individual guarantor fields to match guarantorDetails structure
  guarantorDetails: guarantorDetailsSchema,
  HAS_GUARANTOR: {
    type: Boolean,
    default: true
  },

  // Repayment Information - MATCHING LoanAccount
  REPAYMENT_SCHEDULE: [repaymentScheduleSchema],
  EMI_AMOUNT: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  TOTAL_INTEREST: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  TOTAL_REPAYMENT: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },

  // Payment Information - MATCHING LoanAccount
  PAYMENT_FREQUENCY: {
    type: String,
    enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
    required: true,
    default: 'MONTHLY'
  },
  NEXT_PAYMENT_DATE: {
    type: Date
  },
  LAST_PAYMENT_DATE: {
    type: Date
  },

  // Customer Account Information
  customerAccountNo: {
    type: String,
    trim: true
  },
  REPAYMENT_SOURCE_ACCOUNT: { // ADDED: To match LoanAccount
    type: String
  },

  // Transaction Information - MATCHING LoanAccount
  TRANSACTION_ID: {
    type: String,
    trim: true
  },
  EVENT_ID: {
    type: String,
    trim: true
  },
  JOURNAL_ID: { // ADDED: To match LoanAccount
    type: String,
    required: true
  },

  // Workflow Information
  workItemId: { // CHANGED: WORK_ITEM_ID to workItemId to match LoanAccount
    type: Number,
    default: () => Date.now()
  },
  WORKFLOW_ID: {
    type: Number
  },

  // Loan Account Reference
  LOAN_ACCOUNT_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanAccount'
  },
  loanAccountId: { // ADDED: To match LoanAccount
    type: Number
  },

  // Additional Fields
  APPROVAL_DATE: {
    type: Date
  },
  DISBURSED_BY: {
    type: String,
    trim: true
  },
  NOTES: {
    type: String,
    trim: true
  },
  REJECTION_REASON: {
    type: String,
    trim: true
  },
  CANCELLATION_REASON: {
    type: String,
    trim: true
  },

  // Business Unit Information - MATCHING LoanAccount
  BU_ID: { // ADDED: To match LoanAccount
    type: String,
    required: true
  },
  CRNCY_ID: { // ADDED: To match LoanAccount
    type: String,
    required: true,
    default: 'NGN'
  },

  // Officer Information - MATCHING LoanAccount
  PRIMARY_OFFICER_ID: { // ADDED: To match LoanAccount
    type: String,
    required: true
  },
  SECONDARY_OFFICER_ID: { // ADDED: To match LoanAccount
    type: String
  },

  // Loan Performance Fields - MATCHING LoanAccount
  OUTSTANDING_PRINCIPAL: { // ADDED: To match LoanAccount
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  TOTAL_REPAID_AMOUNT: { // ADDED: To match LoanAccount
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  principalPaid: { // ADDED: To match LoanAccount
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  interestPaid: { // ADDED: To match LoanAccount
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },
  feesPaid: { // ADDED: To match LoanAccount
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00')
  },

  // Application Date - MATCHING LoanAccount
  applicationDate: { // ADDED: To match LoanAccount
    type: Date,
    default: Date.now
  },
  lastUpdated: { // ADDED: To match LoanAccount
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: {
    transform: function(doc, ret) {
      // Enhanced Decimal128 conversion to match LoanAccount
      const decimalFields = [
        'AMOUNT', 'DISBURSEMENT_LIMIT', 'ACTUAL_DISBURSEMENT', 'INTEREST_RATE', 
        'TOTAL_FEES', 'upfrontInterestPercentage', 'upfrontInterestAmount', 
        'remainingInterestAmount', 'GUARANTEED_AMT', 'EMI_AMOUNT', 
        'TOTAL_INTEREST', 'TOTAL_REPAYMENT', 'OUTSTANDING_PRINCIPAL',
        'TOTAL_REPAID_AMOUNT', 'principalPaid', 'interestPaid', 'feesPaid'
      ];
      
      decimalFields.forEach(field => {
        if (ret[field] && typeof ret[field] === 'object') {
          ret[field] = parseFloat(ret[field].toString());
        }
      });

      // Convert FEE_DETAILS Decimal128 values
      if (ret.FEE_DETAILS) {
        const feeDecimalFields = ['processingFee', 'totalFees', 'upfrontInterest', 'upfrontInterestPercentage'];
        feeDecimalFields.forEach(field => {
          if (ret.FEE_DETAILS[field] && typeof ret.FEE_DETAILS[field] === 'object') {
            ret.FEE_DETAILS[field] = parseFloat(ret.FEE_DETAILS[field].toString());
          }
        });

        if (ret.FEE_DETAILS.charges) {
          ret.FEE_DETAILS.charges = ret.FEE_DETAILS.charges.map(charge => ({
            ...charge,
            amount: charge.amount && typeof charge.amount === 'object' ? 
                   parseFloat(charge.amount.toString()) : charge.amount
          }));
        }
      }

      // Convert REPAYMENT_SCHEDULE Decimal128 values
      if (ret.REPAYMENT_SCHEDULE) {
        ret.REPAYMENT_SCHEDULE = ret.REPAYMENT_SCHEDULE.map(installment => ({
          ...installment,
          principal: installment.principal && typeof installment.principal === 'object' ? 
                    parseFloat(installment.principal.toString()) : installment.principal,
          interest: installment.interest && typeof installment.interest === 'object' ? 
                   parseFloat(installment.interest.toString()) : installment.interest,
          totalPayment: installment.totalPayment && typeof installment.totalPayment === 'object' ? 
                       parseFloat(installment.totalPayment.toString()) : installment.totalPayment,
          remainingBalance: installment.remainingBalance && typeof installment.remainingBalance === 'object' ? 
                          parseFloat(installment.remainingBalance.toString()) : installment.remainingBalance,
          amountPaid: installment.amountPaid && typeof installment.amountPaid === 'object' ? 
                     parseFloat(installment.amountPaid.toString()) : installment.amountPaid,
          principalPaid: installment.principalPaid && typeof installment.principalPaid === 'object' ? 
                        parseFloat(installment.principalPaid.toString()) : installment.principalPaid,
          interestPaid: installment.interestPaid && typeof installment.interestPaid === 'object' ? 
                       parseFloat(installment.interestPaid.toString()) : installment.interestPaid,
          lateFeeCharged: installment.lateFeeCharged && typeof installment.lateFeeCharged === 'object' ? 
                         parseFloat(installment.lateFeeCharged.toString()) : installment.lateFeeCharged
        }));
      }

      // Convert guarantorDetails Decimal128 values
      if (ret.guarantorDetails && ret.guarantorDetails.guaranteedAmount) {
        if (typeof ret.guarantorDetails.guaranteedAmount === 'object') {
          ret.guarantorDetails.guaranteedAmount = parseFloat(ret.guarantorDetails.guaranteedAmount.toString());
        }
      }

      // Format Borrower_address to match LoanAccount
      if (ret.Borrower_address) {
        ret.Borrower_address = {
          street: ret.Borrower_address.street,
          state: ret.Borrower_address.state,
          city: ret.Borrower_address.city,
          zipCode: ret.Borrower_address.zipCode,
          country: ret.Borrower_address.country
        };
      }

      return ret;
    }
  }
});

// Indexes for better query performance
LoanDisbursementSchema.index({ CUST_ID: 1, LOAN_STATUS: 1 });
LoanDisbursementSchema.index({ DISBURSEMENT_DATE: 1 });
LoanDisbursementSchema.index({ LOAN_STATUS: 1 });
LoanDisbursementSchema.index({ GUARANTOR_ID: 1 });
LoanDisbursementSchema.index({ WORKFLOW_ID: 1 });
LoanDisbursementSchema.index({ CREATED_BY: 1 });
LoanDisbursementSchema.index({ APPL_ID: 1 });
LoanDisbursementSchema.index({ USER_ID: 1 });
LoanDisbursementSchema.index({ ACCT_NO: 1 });
LoanDisbursementSchema.index({ LOAN_ACCOUNT_ID: 1 });
LoanDisbursementSchema.index({ PROD_ID: 1 });

// Virtual for formatted disbursement amount
LoanDisbursementSchema.virtual('formattedAmount').get(function() {
  return `₦${parseFloat(this.AMOUNT.toString()).toLocaleString()}`;
});

// Virtual for formatted disbursement limit
LoanDisbursementSchema.virtual('formattedDisbursementLimit').get(function() {
  return `₦${parseFloat(this.DISBURSEMENT_LIMIT.toString()).toLocaleString()}`;
});

// Virtual for loan duration description
LoanDisbursementSchema.virtual('loanDuration').get(function() {
  const termMap = {
    'D': 'Days',
    'W': 'Weeks',
    'M': 'Months',
    'Q': 'Quarters',
    'Y': 'Years'
  };
  return `${this.TERM_VALUE} ${termMap[this.TERM_CD] || this.TERM_CD}`;
});

// Virtual for days to maturity (matching LoanAccount)
LoanDisbursementSchema.virtual('daysToMaturity').get(function () {
  if (!this.MATURITY_DT || !(this.MATURITY_DT instanceof Date)) return null;
  return Math.ceil((this.MATURITY_DT - new Date()) / (1000 * 60 * 60 * 24));
});

// Static method to find by application ID
LoanDisbursementSchema.statics.findByApplicationId = function(applicId) {
  return this.find({ APPL_ID: applicId });
};

// Static method to find by customer ID
LoanDisbursementSchema.statics.findByCustomerId = function(custId) {
  return this.find({ CUST_ID: custId });
};

// Static method to find by user ID
LoanDisbursementSchema.statics.findByUserId = function(userId) {
  return this.find({ USER_ID: userId });
};

// Static method to find pending disbursements
LoanDisbursementSchema.statics.findPending = function() {
  return this.find({ LOAN_STATUS: 'PENDING' });
};

// Static method to find approved disbursements
LoanDisbursementSchema.statics.findApproved = function() {
  return this.find({ LOAN_STATUS: 'APPROVED' });
};

// Static method to find active loans
LoanDisbursementSchema.statics.findActive = function() {
  return this.find({ LOAN_STATUS: 'ACTIVE' });
};

// Static method to find by loan account ID
LoanDisbursementSchema.statics.findByLoanAccountId = function(loanAccountId) {
  return this.find({ LOAN_ACCOUNT_ID: loanAccountId });
};

// Instance method to check if disbursement can be approved
LoanDisbursementSchema.methods.canApprove = function() {
  return this.LOAN_STATUS === 'PENDING';
};

// Instance method to check if disbursement can be disbursed
LoanDisbursementSchema.methods.canDisburse = function() {
  return this.LOAN_STATUS === 'APPROVED';
};

// Instance method to calculate total paid amount
LoanDisbursementSchema.methods.getTotalPaid = function() {
  if (!this.REPAYMENT_SCHEDULE) return 0;
  return this.REPAYMENT_SCHEDULE.reduce((total, inst) => {
    return total + parseFloat(inst.amountPaid?.toString() || '0');
  }, 0);
};

// Instance method to get outstanding balance
LoanDisbursementSchema.methods.getOutstandingBalance = function() {
  const totalPaid = this.getTotalPaid();
  const totalRepayment = parseFloat(this.TOTAL_REPAYMENT?.toString() || '0');
  return Math.max(0, totalRepayment - totalPaid);
};

// Instance method to check if loan is overdue (matching LoanAccount)
LoanDisbursementSchema.methods.isOverdue = function() {
  if (!this.NEXT_PAYMENT_DATE || !(this.NEXT_PAYMENT_DATE instanceof Date) || this.LOAN_STATUS !== 'ACTIVE') {
    return false;
  }
  return this.NEXT_PAYMENT_DATE < new Date();
};

// Instance method to get days overdue (matching LoanAccount)
LoanDisbursementSchema.methods.getDaysOverdue = function() {
  if (!this.isOverdue() || !this.NEXT_PAYMENT_DATE) return 0;
  return Math.ceil((new Date() - this.NEXT_PAYMENT_DATE) / (1000 * 60 * 60 * 24));
};

// Pre-save middleware to align with LoanAccount calculations
LoanDisbursementSchema.pre('save', function(next) {
  // Calculate maturity date using same logic as LoanAccount
  if (!this.MATURITY_DT && this.START_DT && this.TERM_VALUE && this.TERM_CD) {
    const maturityDate = new Date(this.START_DT);
    
    switch (this.TERM_CD) {
      case 'D':
        maturityDate.setDate(maturityDate.getDate() + this.TERM_VALUE);
        break;
      case 'W':
        maturityDate.setDate(maturityDate.getDate() + (this.TERM_VALUE * 7));
        break;
      case 'M':
        maturityDate.setMonth(maturityDate.getMonth() + this.TERM_VALUE);
        break;
      case 'Q':
        maturityDate.setMonth(maturityDate.getMonth() + (this.TERM_VALUE * 3));
        break;
      case 'Y':
        maturityDate.setFullYear(maturityDate.getFullYear() + this.TERM_VALUE);
        break;
      default:
        break;
    }
    
    this.MATURITY_DT = maturityDate;
  }

  // Calculate actual disbursement using same logic as LoanAccount
  if ((!this.ACTUAL_DISBURSEMENT || parseFloat(this.ACTUAL_DISBURSEMENT.toString()) === 0) && this.DISBURSEMENT_LIMIT) {
    const amount = parseFloat(this.DISBURSEMENT_LIMIT.toString());
    const totalFees = parseFloat(this.TOTAL_FEES?.toString() || '0');
    const upfrontInterest = parseFloat(this.upfrontInterestAmount?.toString() || '0');
    const actualDisbursement = amount - totalFees - upfrontInterest;
    this.ACTUAL_DISBURSEMENT = mongoose.Types.Decimal128.fromString(Math.max(0, actualDisbursement).toFixed(2));
  }

  // Calculate upfront interest amount if percentage is provided
  if (this.partialUpfrontInterest && parseFloat(this.upfrontInterestPercentage.toString()) > 0 && this.DISBURSEMENT_LIMIT) {
    const amount = parseFloat(this.DISBURSEMENT_LIMIT.toString());
    const percentage = parseFloat(this.upfrontInterestPercentage.toString());
    const upfrontInterest = (amount * percentage) / 100;
    this.upfrontInterestAmount = mongoose.Types.Decimal128.fromString(upfrontInterest.toFixed(2));
  }

  // Set full upfront interest amount if deductUpfrontInterest is true
  if (this.deductUpfrontInterest && this.DISBURSEMENT_LIMIT && this.TOTAL_INTEREST) {
    const totalInterest = parseFloat(this.TOTAL_INTEREST.toString());
    this.upfrontInterestAmount = mongoose.Types.Decimal128.fromString(totalInterest.toFixed(2));
    this.upfrontInterestPercentage = mongoose.Types.Decimal128.fromString('100.00');
  }

  // Update lastUpdated field
  this.lastUpdated = new Date();

  next();
});

const LoanDisbursement = mongoose.model('LoanDisbursement', LoanDisbursementSchema);

export default LoanDisbursement;