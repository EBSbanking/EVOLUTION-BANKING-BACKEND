
import mongoose from 'mongoose';

const PendingGLTransactionSchema = new mongoose.Schema({
  INWD_FUNDS_XFER_ID: {
    type: Number,
    required: true,
  },
  XFER_REF: {
    type: String,
    required: true,
    maxlength: 100,
  },
  GL_ACCT_NO: {
    type: String,
    required: true,
    maxlength: 60,
  },
  TRANSACTION_TYPE: {
    type: String,
    required: true,
    enum: ['DEBIT', 'CREDIT'],
  },
  AMOUNT: {
    type: mongoose.Types.Decimal128,
    required: true,
  },
  CRNCY_ID: {
    type: Number,
    required: true,
  },
  TRANSACTION_DATE: {
    type: Date,
    required: true,
  },
  CREATED_BY: {
    type: String,
    required: true,
    maxlength: 24,
  },
  JOURNAL_ID: {
    type: Number,
  },
  STATUS: {
    type: String,
    required: true,
    enum: ['PENDING', 'PROCESSED', 'FAILED'],
    default: 'PENDING',
  },
  processedAt: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    required: true,
  },
  errorMessage: {
    type: String,
    maxlength: 4000,
  },
}, {
  timestamps: false,
  toJSON: { getters: true },
});

const PendingGLTransaction = mongoose.model ('PendingGLTransaction', PendingGLTransactionSchema);

export default PendingGLTransaction;