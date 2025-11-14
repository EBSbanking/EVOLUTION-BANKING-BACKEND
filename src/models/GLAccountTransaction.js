import mongoose from 'mongoose';

const generateTransactionId = () => {
  const base = Date.now().toString();
  const random = Math.floor(1000 + Math.random() * 9000);
  return parseInt(base + random);
};

const GLAccountTransactionSchema = new mongoose.Schema({
  JOURNAL_ID: { type: String, required: true },
  TRANSACTION_ID: { type: String, required: true, unique: true },
  DR_ACCT_NO: { type: String, required: true },
  CR_ACCT_NO: { type: String, required: true },
  AMOUNT: { type: Number, required: true, min: 0 },
  NARRATION: { type: String, required: true },
  CREATED_BY: { type: String, required: true },
  TRANSACTION_TYPE: { type: String },
  CURRENCY_CODE: { type: String, default: 'NGN' },
  STATUS: { type: String, default: 'POSTED', enum: ['POSTED', 'PENDING', 'REVERSED'] },
  TransactionId: {
    type: Number,
    unique: true,
    default: generateTransactionId,
  },
}, {
  timestamps: true,
  collection: 'gl_account_transactions',
});

export default mongoose.model('GLAccountTransaction', GLAccountTransactionSchema);