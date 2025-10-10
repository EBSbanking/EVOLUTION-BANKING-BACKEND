
import mongoose from 'mongoose';

const RepaymentScheduleSchema = new mongoose.Schema({
  ACCT_NO: { type: String, required: true },
  LOAN_ACCOUNT_ID: { type: mongoose.Schema.Types.ObjectId, required: true },
  CUST_ID: { type: Number, required: true },
  installmentNo: { type: Number, required: true },
  dueDate: { type: Date, required: true },
  principal: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  },
  interest: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  },
  totalPayment: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  },
  amountPaid: {
    type: mongoose.Schema.Types.Decimal128,
    default: '0.00',
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  },
  principalPaid: {
    type: mongoose.Schema.Types.Decimal128,
    default: '0.00',
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  },
  interestPaid: {
    type: mongoose.Schema.Types.Decimal128,
    default: '0.00',
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  },
  feesPaid: {
    type: mongoose.Schema.Types.Decimal128,
    default: '0.00',
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  },
  remainingBalance: {
    type: mongoose.Schema.Types.Decimal128,
    default: '0.00',
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  },
  status: {
    type: String,
    enum: ['PENDING', 'PARTIAL', 'PAID', 'OVERDUE'],
    default: 'PENDING'
  },
  termCode: {
    type: String,
    enum: ['D', 'W', 'M', 'Q', 'Y'],
    required: true
  },
  paymentFrequency: {
    type: String,
    enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
    required: true
  },
  paymentDate: { type: Date },
  paymentMethod: { type: String },
  isEarlyPayment: { type: Boolean, default: false },
  isOverduePayment: { type: Boolean, default: false },
  lateFeeCharged: {
    type: mongoose.Schema.Types.Decimal128,
    default: '0.00',
    get: v => parseFloat(v.toString()),
    set: v => mongoose.Types.Decimal128.fromString(v.toString())
  },
  isFinalInstallment: { type: Boolean, default: false },
  TRANSACTION_ID: { type: String, required: true },
  EVENT_ID: { type: String, required: true },
  CREATED_BY: { type: String, required: true }
}, { timestamps: true, toJSON: { getters: true } });

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

export default mongoose.model('RepaymentSchedule', RepaymentScheduleSchema);
export { convertTermCodeToFrequency, convertFrequencyToTermCode };
