// GLTransactionQueue.js
import mongoose from 'mongoose';

const GLTransactionQueueSchema = new mongoose.Schema({
  GL_ACCT_NO: { type: String, required: true },
  TRANSACTION_TYPE: { type: String, required: true },
  AMOUNT: { type: Number, required: true },
  CREATED_BY: { type: String, required: true },
  JOURNAL_ID: { type: String, required: true },

  SUB_LEDGER_NO: { type: String, default: '0000' },
  SEG_NO: { type: Number, default: 1 },

  // 👇 System queue processing (tech status)
  QUEUE_STATUS: {
    type: String,
    enum: ['Pending', 'Processed', 'Failed', 'Rejected'],
    default: 'Pending',
  },

  // 👇 Business approval status
  APPROVAL_STATUS: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
  },
  APPROVED_BY: { type: String },
  APPROVED_AT: { type: Date },

  CREATED_AT: { type: Date, default: Date.now },
  PROCESSED_AT: Date,
});

export default mongoose.model('GLTransactionQueue', GLTransactionQueueSchema);
