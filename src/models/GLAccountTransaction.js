import mongoose from 'mongoose';

const generateTransactionId = () => {
  const base = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000);
  return parseInt(base + random);
};

const GLAccountTransactionSchema = new mongoose.Schema({
  GL_ACCT_NO: { type: String, required: true, index: true },
  AMOUNT: { type: Number, required: true, min: 0 },
  TRANSACTION_TYPE: { type: String, required: true, enum: ['DR', 'CR'] },
  CURRENCY_CODE: { type: String, default: 'NGN' },
  EXCHANGE_RATE: { type: Number, default: 1 },
  CREATED_BY: { type: String, required: true },
  CREATE_DT: { type: Date, default: Date.now },
  ROW_TS: { type: Date, default: Date.now },
  SYS_CREATE_TS: { type: Date, default: Date.now },
  REC_ST: { type: String, default: 'A' },
  VERSION_NO: { type: Number, default: 1 },
  USER_ID: { type: String, required: true },
  LEDGER_NO: { type: String },
  SUB_LEDGER_NO: { type: String, default: '0000' },
  SEG_NO: { type: Number, default: 1 },
  BAL_CD: { type: String },
  ACCT_DESC: { type: String },
  GL_ACCT_CAT: { type: String },
  GL_ACCT_ID: { type: String },
  CHART_OF_ACCT_ID: { type: String },
  BU_ID: { type: String },
  POST_FG: { type: String, default: 'Y' },
  CONTROL_ACCT_FG: { type: String, default: 'N' },
  DESCRIPTION: { type: String },
  TransactionId: {
    type: Number,
    unique: true,
    default: generateTransactionId,
  },
  QueueTransactionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GLTransactionQueue',
  },
  JOURNAL_ID: { type: String, required: true }, // Link to original journal
  REFERENCE_ID: { type: String }, // Link to source module
});

export default mongoose.model('GLAccountTransaction', GLAccountTransactionSchema);