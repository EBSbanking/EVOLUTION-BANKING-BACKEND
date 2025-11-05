import mongoose from 'mongoose';
import mongooseSequence from 'mongoose-sequence'; // Ensure you're importing the plugin correctly

// Define the schema
const depositAccountMonthlyStatSchema = new mongoose.Schema({
  MONTHLY_STAT_ID: { type: Number },  // Define the field for auto-increment
  DEPOSIT_ACCT_ID: { type: Number, required: true },
  ACCT_NO: { type: String, required: true, maxlength: 60 },
  START_DT: { type: Date, required: true },
  LEDGER_BAL_FWD: { type: mongoose.Types.Decimal128, required: true },
  CLEARED_BAL_FWD: { type: mongoose.Types.Decimal128, required: true },
  DR_INT_ACCRUED_FWD: { type: mongoose.Types.Decimal128, required: true },
  CR_INT_ACCRUED_FWD: { type: mongoose.Types.Decimal128, required: true },
  DR_INT_CHRGD: { type: mongoose.Types.Decimal128, required: true },
  CR_INT_PAID: { type: mongoose.Types.Decimal128, required: true },
  TOTAL_TAX: { type: mongoose.Types.Decimal128, required: true },
  CHRG_ACCRUED_FWD: { type: mongoose.Types.Decimal128, required: true },
  CHRG_APPLIED: { type: mongoose.Types.Decimal128, required: true },
  TOTAL_COST: { type: mongoose.Types.Decimal128, required: true },
  DOMESTIC_CHQ_COUNT: { type: Number, required: true },
  FOREIGN_CHQ_COUNT: { type: Number, required: true },
  AVG_LEDGER_BAL: { type: mongoose.Types.Decimal128, required: true },
  AVG_CLEARED_BAL: { type: mongoose.Types.Decimal128, required: true },
  AVG_DR_INT_RATE: { type: mongoose.Types.Decimal128, required: true },
  AVG_DR_INT_MARGIN: { type: mongoose.Types.Decimal128, required: true },
  AVG_CR_INT_RATE: { type: mongoose.Types.Decimal128, required: true },
  AVG_CR_INT_MARGIN: { type: mongoose.Types.Decimal128, required: true },
  DR_COUNT: { type: Number, required: true },
  CR_COUNT: { type: Number, required: true },
  DR_TURNOVER: { type: mongoose.Types.Decimal128, required: true },
  CR_TURNOVER: { type: mongoose.Types.Decimal128, required: true },
  CHQ_COUNT: { type: Number, required: true },
  MIN_LEDGER_BAL: { type: mongoose.Types.Decimal128, required: true },
  MIN_CLEARED_BAL: { type: mongoose.Types.Decimal128, required: true },
  MAX_LEDGER_BAL: { type: mongoose.Types.Decimal128, required: true },
  MAX_CLEARED_BAL: { type: mongoose.Types.Decimal128, required: true },
  REC_ST: { type: String, required: true, maxlength: 1 },
  VERSION_NO: { type: Number, required: true },
  ROW_TS: { type: Date, required: true },
  USER_ID: { type: String, required: true, maxlength: 24 },
  CREATE_DT: { type: Date, required: true },
  SYS_CREATE_TS: { type: Date, required: true },
  CREATED_BY: { type: String, required: true, maxlength: 24 },
  END_DT: { type: Date, required: true },
  MAX_LEDGER_BAL_DT: { type: Date, required: true },
  MAX_CLEARED_BAL_DT: { type: Date, required: true },
  MIN_LEDGER_BAL_DT: { type: Date, required: true },
  MIN_CLEARED_BAL_DT: { type: Date, required: true },
  AVG_BAL_DT: { type: Date, required: true }
}, { timestamps: true });

// Apply the auto-increment plugin to the MONTHLY_STAT_ID field, passing mongoose explicitly
depositAccountMonthlyStatSchema.plugin(mongooseSequence(mongoose), { inc_field: 'MONTHLY_STAT_ID' });

// Create the model
const DepositAccountMonthlyStat = mongoose.model('DepositAccountMonthlyStat', depositAccountMonthlyStatSchema, 'deposit_account_monthly_stat');

export default DepositAccountMonthlyStat;
