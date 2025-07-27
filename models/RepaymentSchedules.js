import mongoose from 'mongoose';

// Define the schema for individual installment
const InstallmentSchema = new mongoose.Schema({
  installmentNo: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  principal: { type: Number, required: true },
  interest: { type: Number, required: true },
  totalPayment: { type: Number, required: true },
  amountPaid: { type: Number, default: 0 },
  remainingBalance: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['PENDING', 'PAID', 'PARTIAL', 'OVERDUE'],
    default: 'PENDING'
  },
  isFinalInstallment: { type: Boolean, default: false },
  fees: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  paymentDate: { type: Date }
});

// Define the overall repayment schedule schema
const RepaymentScheduleSchema = new mongoose.Schema({
  LOAN_ACCOUNT_ID: { type: String, required: true },
  ACCT_NO: { type: String, required: true },
  CUST_ID: { type: String, required: true },
  START_DATE: { type: Date, required: true },
  MATURITY_DATE: { type: Date, required: true },
  PRINCIPAL_AMOUNT: { type: Number, required: true },
  INTEREST_RATE: { type: Number, required: true },
  TERM: { type: Number, required: true },
  TERM_TYPE: {
    type: String,
    enum: ['D', 'W', 'M', 'Q', 'Y'],
    required: true
  },
  paymentFrequency: {
    type: String,
    enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
    default: 'MONTHLY',
    required: true
  },
  SCHEDULE: { type: [InstallmentSchema], required: true },
  TRANSACTION_ID: { type: String, required: true },
  EVENT_ID: { type: String, required: true },
  CREATED_BY: { type: String, required: true },
  STATUS: {
  type: String,
  enum: ['PENDING', 'ACTIVE', 'CLOSED', 'INACTIVE'], 
  default: 'ACTIVE'
},

  SCHEDULE_TYPE: { type: String, default: 'STANDARD' },
  GRACE_PERIOD_DAYS: { type: Number, default: 0 },
  LATE_FEE_RATE: { type: Number, default: 0 },
  EARLY_REPAYMENT_PENALTY: { type: Number, default: 0 },
}, { timestamps: true });

// Create model
const RepaymentSchedule = mongoose.model('RepaymentSchedule', RepaymentScheduleSchema);

// Helper: Convert term code to frequency
const convertTermCodeToFrequency = (termCode) => {
  switch (termCode.toUpperCase()) {
    case 'D': return 'DAILY';
    case 'W': return 'WEEKLY';
    case 'M': return 'MONTHLY';
    case 'Q': return 'QUARTERLY';
    case 'Y': return 'YEARLY';
    default: throw new Error(`Invalid term code: ${termCode}. Valid codes: D, W, M, Q, Y`);
  }
};

// Helper: Convert frequency to term code
const convertFrequencyToTermCode = (frequency) => {
  switch (frequency.toUpperCase()) {
    case 'DAILY': return 'D';
    case 'WEEKLY': return 'W';
    case 'MONTHLY': return 'M';
    case 'QUARTERLY': return 'Q';
    case 'YEARLY': return 'Y';
    default: throw new Error(`Invalid frequency: ${frequency}`);
  }
};

// Export
export {
  RepaymentSchedule as default,
  convertTermCodeToFrequency,
  convertFrequencyToTermCode
};
