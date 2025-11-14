import mongoose from 'mongoose';

// PendingGLTransaction Schema
const PendingGLTransactionSchema = new mongoose.Schema({
  JOURNAL_ID: { type: String, required: true },
  TRANSACTION_ID: { type: String, required: true, unique: true },
  GL_ACCT_NO: { type: String, required: true },
  TRANSACTION_TYPE: { type: String, enum: ['DR', 'CR'], required: true },
  AMOUNT: { type: Number, required: true, min: 0 },
  CREATED_BY: { type: String, required: true },
  SUB_LEDGER_NO: { type: String, default: '000' },
  SEG_NO: { type: Number, default: 1 },
  ACCT_DESC: { type: String },
  BAL_CD: { type: String, default: '01' },
  GL_ACCT_CAT: { type: String, required: true },
  CURRENCY_CODE: { type: String, default: 'NGN' },
  EXCHANGE_RATE: { type: Number, default: 1 },
  REFERENCE_ID: { type: String },
  STATUS: { 
    type: String, 
    enum: ['PENDING', 'PROCESSED', 'FAILED', 'APPROVED'], 
    default: 'PENDING' 
  },
  errorMessage: { type: String },
  processedAt: { type: Date },
  APPROVED_BY: { type: String },
  APPROVED_DATE: { type: Date },
  TRANSACTION_DATE: { type: Date, default: Date.now },
  debitAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'GLAccount' },
  creditAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'GLAccount' },
}, {
  timestamps: true,
  collection: 'pending_gl_transactions',
});

export default mongoose.model('PendingGLTransaction', PendingGLTransactionSchema);