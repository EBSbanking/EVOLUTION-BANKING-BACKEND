import mongoose from 'mongoose';

const depositAccountInterestOptionSchema = new mongoose.Schema({
  DEPOSIT_ACCT_ID: { type: Number, required: true },
  DR_SETLMNT_ACCT_ID: { type: Number, required: true },
  CR_SETLMNT_ACCT_ID: { type: Number, required: true },
  CR_SETLMNT_OPTION_CD: { type: String, required: true },
  DR_SETLMNT_OPTION_CD: { type: String, required: true },
  CR_SETLMNT_ACCT_NO: { type: String, required: true },
  DR_SETLMNT_ACCT_NO: { type: String, required: true },
  CR_SETLMNT_CUST_NM: { type: String, required: true },
  DR_SETLMNT_CUST_NM: { type: String, required: true },
  CR_SETLMNT_BIC_ID: { type: Number, required: true },
  DR_SETLMNT_BIC_ID: { type: Number, required: true },
  CREATED_BY: { type: String, required: true },
  CREATE_DT: { type: Date, required: true },
  REC_ST: { type: String, required: true },
  ROW_TS: { type: Date, required: true },
  USER_ID: { type: String, required: true },
  VERSION_NO: { type: Number, required: true },
  SYS_CREATE_TS: { type: Date, required: true },
  CHRG_SETLMNT_ACCT_ID: { type: Number, required: true },
  CHRG_SETLMNT_OPTN_CD: { type: String, required: true },
  CHRG_SETLMNT_ACCT_NO: { type: String, required: true },
  CHRG_SETLMNT_CUST_NM: { type: String, required: true },
  CHRG_SETLMNT_BIC_ID: { type: Number, required: true },
}, { timestamps: true });

const DepositAccountInterestOption = mongoose.model('DepositAccountInterestOption', depositAccountInterestOptionSchema);

export default DepositAccountInterestOption;
