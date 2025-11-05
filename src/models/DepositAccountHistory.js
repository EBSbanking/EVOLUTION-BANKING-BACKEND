import mongoose from 'mongoose';

const depositAccountHistorySchema = new mongoose.Schema({
  ACCT_HIST_ID: {
    type: Number,
    required: true
  },
  DEPOSIT_ACCT_ID: {
    type: Number,
    required: true
  },
  ACCT_NO: {
    type: String,
    required: true,
    maxlength: 60
  },
  CONTRA_ACCT_NO: {
    type: String,
    maxlength: 60
  },
  TRAN_DT: {
    type: Date,
    required: true
  },
  VALUE_DT: {
    type: Date
  },
  TOTAL_CHRG_AMT: {
    type: mongoose.Types.Decimal128
  },
  TOTAL_TAX_AMT: {
    type: mongoose.Types.Decimal128
  },
  EVENT_COST: {
    type: mongoose.Types.Decimal128
  },
  EXCH_RATE: {
    type: mongoose.Types.Decimal128
  },
  TRAN_REF_TXT: {
    type: String,
    maxlength: 100
  },
  CHQ_NO: {
    type: Number
  },
  TRAN_DESC: {
    type: String,
    maxlength: 300
  },
  SUPERVISOR_ID: {
    type: Number
  },
  STMNT_BAL: {
    type: mongoose.Types.Decimal128
  },
  DR_CR_IND: {
    type: String,
    maxlength: 2
  },
  PASSBOOK_UPDATED: {
    type: String,
    maxlength: 1
  },
  REC_ST: {
    type: String,
    maxlength: 1
  },
  VERSION_NO: {
    type: Number
  },
  ROW_TS: {
    type: Date
  },
  USER_ID: {
    type: String,
    maxlength: 24
  },
  ORIGIN_BU_ID: {
    type: Number
  },
  CREATE_DT: {
    type: Date
  },
  CREATED_BY: {
    type: String,
    maxlength: 24
  },
  SYS_CREATE_TS: {
    type: Date
  },
  CHRG_ID: {
    type: Number
  },
  TAX_ID: {
    type: Number
  },
  CHANNEL_ID: {
    type: Number
  },
  EVENT_ID: {
    type: Number
  },
  PARENT_EVENT_ID: {
    type: Number
  },
  TXN_CRNCY_ID: {
    type: Number
  },
  TXN_AMT: {
    type: mongoose.Types.Decimal128
  },
  ACCT_CRNCY_ID: {
    type: Number
  },
  ACCT_AMT: {
    type: mongoose.Types.Decimal128
  },
  CONTRA_ACCT_CRNCY_ID: {
    type: Number
  },
  CONTRA_ACCT_AMT: {
    type: mongoose.Types.Decimal128
  },
  CONTRA_ACCT_TY_ID: {
    type: Number
  },
  DEPOSITOR_PAYEE_NM: {
    type: String,
    maxlength: 50
  },
  SRC_OF_FUNDS_ID: {
    type: Number
  },
  TRAN_JOURNAL_ID: {
    type: Number
  },
  TXN_MEMO_TYPE_CD: {
    type: String,
    maxlength: 10
  },
  ORIGINATOR_ID: {
    type: Number
  },
  EVENT_JOURNAL_ID: {
    type: Number
  },
  STMNT_BAL2: {
    type: mongoose.Types.Decimal128
  },
  BACKDATE_PROCESSING_ST: {
    type: String,
    maxlength: 1
  },
  EVENT_CHRG_JOURNAL_ID: {
    type: Number
  },
  EVENT_TAX_JOURNAL_ID: {
    type: Number
  }
}, { timestamps: true });

// Create and export the DepositAccountHistory model
const DepositAccountHistory = mongoose.model('DepositAccountHistory', depositAccountHistorySchema);
export default DepositAccountHistory;
