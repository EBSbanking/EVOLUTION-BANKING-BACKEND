import mongoose from 'mongoose';

// Loan Disbursement schema
const loanDisbursementSchema = new mongoose.Schema({
  APPL_ID: { type: String, unique: true, required: true },
  CUST_ID: { type: Number, required: true },
  DISBURSEMENT_DATE: { type: Date, default: Date.now },
  AMOUNT: { type: Number, required: true },
  TERM_CD: { type: String, required: true },
  TERM_VALUE: { type: Number, required: true },
  INTEREST_RATE: { type: Number, required: true },
  REPAYMENT_SCHEDULE: { type: Array, default: [] },
  STATUS: { type: String, default: 'pending' },
  ACCT_NO: { type: Number, required: true },
});

// Middleware to generate repayment schedule
loanDisbursementSchema.pre('save', async function (next) {
  if (this.isNew) {
    try {
      const schedule = [];
      const termMonths = this.TERM_CD === 'monthly' ? 1 : this.TERM_CD === 'quarterly' ? 3 : 0;
      let due = new Date(this.DISBURSEMENT_DATE);

      for (let i = 1; i <= this.TERM_VALUE; i++) {
        due.setMonth(due.getMonth() + termMonths);
        schedule.push({ installmentNo: i, dueDate: new Date(due) });
      }

      this.REPAYMENT_SCHEDULE = schedule;
    } catch (err) {
      return next(err);
    }
  }
  next();
});

const LoanDisbursement = mongoose.models.LoanDisbursement || mongoose.model('LoanDisbursement', loanDisbursementSchema);
export default LoanDisbursement;
