import mongoose from 'mongoose';

const depositAccountInterestAuditSchema = new mongoose.Schema({
  DEPOSIT_ACCT_INT_ID: { type: Number, required: true },
  DEPOSIT_ACCT_ID: { type: Number, required: true },
  DEPOSIT_PROD_INT_ID: { type: Number, required: true },
  INT_RATE_TY: { type: String, required: true },
  INDEX_RATE_ID: { type: Number, required: true },
  RATE_STRUCT_CD: { type: String, required: true },
  MARGIN_RATE: { type: mongoose.Types.Decimal128, required: true },
  MIN_RATE: { type: mongoose.Types.Decimal128, required: true },
  MAX_RATE: { type: mongoose.Types.Decimal128, required: true },
  ABSOLUTE_RATE: { type: mongoose.Types.Decimal128, required: true },
  ACCRUAL_BASIS_TY: { type: String, required: true },
  ACCRUAL_BAL_BASIS_TY: { type: String, required: true },
  MARGIN_TY_CD: { type: String, required: true },
  MARGIN_BAL_BASIS_TY: { type: String, required: true },
  RATE_CHANGE_FREQ_CD: { type: String, required: true },
  MAX_NO_OF_RATE_CHANGES: { type: Number, required: true },
  RATE_CHANGE_FREQ_VALUE: { type: Number, required: true },
  SETLMNT_FREQ_CD: { type: String, required: true },
  SETLMNT_FREQ_VALUE: { type: Number, required: true },
  WAIVER_AMT: { type: mongoose.Types.Decimal128, required: true },
  MIN_INT_AMT: { type: mongoose.Types.Decimal128, required: true },
  OVR_FG: { type: String, required: true },
  REC_ST: { type: String, required: true },
  VERSION_NO: { type: Number, required: true },
  ROW_TS: { type: Date, required: true },
  USER_ID: { type: String, required: true },
  CREATE_DT: { type: Date, required: true },
  CREATED_BY: { type: String, required: true },
  SYS_CREATE_TS: { type: Date, required: true },
  LAST_SETLMNT_DT: { type: Date, required: true },
  NEXT_SETLMNT_DT: { type: Date, required: true },
  FIXED_RATE: { type: mongoose.Types.Decimal128, required: true },
  EFFECTIVE_DT: { type: Date, required: true },
  PENAL_MARGIN_RATE: { type: mongoose.Types.Decimal128, required: true },
  PENAL_MARGIN_TY_CD: { type: String, required: true },
  AUDIT_ACTION: { type: String, required: true },
  AUDIT_USER: { type: String, required: true },
  AUDIT_TS: { type: Date, required: true }
}, { timestamps: true });

// Define the model with a valid collection name
const Deposit_Account_INTEREST$AUD = mongoose.model('Deposit_Account_INTEREST$AUD', Deposit_Account_INTEREST$AUDSchema, 'deposit_account_interest_aud');  // Updated collection name

export default Deposit_Account_INTEREST$AUD;
