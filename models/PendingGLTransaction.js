import mongoose from 'mongoose';

const PendingGLTransactionSchema = new mongoose.Schema({
  GL_ACCT_NO: {
    type: String,
    required: [true, 'GL_ACCT_NO is required'],
    trim: true,
    validate: {
      validator: (value) => /^\d-\d{2,3}-\d{3}-\d{3}-\d{3}-\d$/.test(value),
      message: 'GL_ACCT_NO must match format: 1-XX-XXX-XXX-XXX-X or 1-XXX-XXX-XXX-XXX-X',
    },
  },
  TRANSACTION_TYPE: {
    type: String,
    enum: {
      values: ['DR', 'CR'],
      message: 'TRANSACTION_TYPE must be DR or CR',
    },
    required: [true, 'TRANSACTION_TYPE is required'],
  },
  AMOUNT: {
    type: Number,
    required: [true, 'AMOUNT is required'],
    min: [0, 'AMOUNT must be non-negative'],
  },
  TRANSACTION_DATE: {
    type: Date,
    default: Date.now,
  },
  CREATED_BY: {
    type: String,
    required: [true, 'CREATED_BY is required'],
    trim: true,
  },
  JOURNAL_ID: {
    type: String,
    required: [true, 'JOURNAL_ID is required'],
    trim: true,
  },
  SUB_LEDGER_NO: {
    type: String,
    default: '0000',
    trim: true,
    validate: {
      validator: (value) => /^\d{3,4}$/.test(value),
      message: 'SUB_LEDGER_NO must be a 3 or 4-digit number',
    },
  },
  SEG_NO: {
    type: String,
    required: [true, 'SEG_NO is required'],
    trim: true,
    validate: {
      validator: (value) => /^\d$/.test(value),
      message: 'SEG_NO must be a single digit',
    },
  },
  ACCT_DESC: {
    type: String,
    required: [true, 'ACCT_DESC is required'],
    trim: true,
  },
  STATUS: {
    type: String,
    enum: ['PENDING', 'PROCESSED', 'FAILED'],
    default: 'PENDING',
  },
  errorMessage: {
    type: String,
    default: '',
  },
  processedAt: {
    type: Date,
  },
  debitAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ledger',
  },
  creditAccount: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Ledger',
  },
});

PendingGLTransactionSchema.index({ GL_ACCT_NO: 1, STATUS: 1, TRANSACTION_DATE: -1 });

export default mongoose.model('PendingGLTransaction', PendingGLTransactionSchema);