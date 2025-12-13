import mongoose from 'mongoose';

const loanAccountSchema = new mongoose.Schema({
  ACCT_NO: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  ACCT_NM: {
    type: String,
    required: true
  },
  CUST_ID: {
    type: String,
    required: true
  },
  LOAN_PRODUCT_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanProduct'
  },
  AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    required: true
  },
  DISBURSED_AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0
  },
  OUTSTANDING_PRINCIPAL: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0
  },
  INTEREST_RATE: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0
  },
  LOAN_STATUS: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'DISBURSED', 'ACTIVE', 'CLOSED', 'DEFAULTED', 'WRITTEN_OFF'],
    default: 'PENDING'
  },
  SERVICING_STATUS: {
    type: String,
    enum: ['SERVICED', 'UNSERVICED', 'NON_PERFORMING', 'DELINQUENT'],
    default: 'SERVICED'
  },
  APPLICATION_DATE: {
    type: Date,
    default: Date.now
  },
  APPROVAL_DATE: Date,
  DISBURSEMENT_DATE: Date,
  CLOSURE_DATE: Date,
  LAST_PAYMENT_DATE: Date,
  LAST_SERVICING_UPDATE: Date,
  LAST_UPDATED: {
    type: Date,
    default: Date.now
  },
  TOTAL_REPAID_AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0
  },
  LAST_PAYMENT_AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    default: 0
  },
  LAST_PAYMENT_METHOD: String,
  REPAYMENT_SCHEDULE_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RepaymentSchedule'
  },
  paymentHistory: [{
    date: Date,
    amount: mongoose.Schema.Types.Decimal128,
    installmentNo: Number,
    principal: mongoose.Schema.Types.Decimal128,
    interest: mongoose.Schema.Types.Decimal128,
    fees: mongoose.Schema.Types.Decimal128,
    paymentMethod: String,
    reference: String,
    description: String
  }],
  TERM_CD: {
    type: String,
    enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
    default: 'MONTHLY'
  },
  TERM_VALUE: {
    type: Number,
    default: 12
  },
  hasRepaymentSchedule: {
    type: Boolean,
    default: false
  },
  repaymentScheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RepaymentSchedule'
  }
}, {
  timestamps: true
});

// Create indexes (remove duplicate index definitions)
loanAccountSchema.index({ ACCT_NO: 1 }, { unique: true });
loanAccountSchema.index({ CUST_ID: 1 });
loanAccountSchema.index({ LOAN_STATUS: 1 });
loanAccountSchema.index({ LOAN_PRODUCT_ID: 1 });

// Export the model
const LoanAccount = mongoose.model('LoanAccount', loanAccountSchema);
export default LoanAccount;