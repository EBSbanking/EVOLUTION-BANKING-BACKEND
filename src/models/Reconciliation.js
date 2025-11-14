import mongoose from 'mongoose';

// Reconciliation Schema
const ReconciliationSchema = new mongoose.Schema({
  JOURNAL_ID: { type: String, required: true },
  GL_ACCT_NO: { type: String, required: true },
  TRANSACTION_ID: { type: String, required: true, unique: true },
  AMOUNT: { type: Number, required: true, min: 0 },
  CURRENCY_CODE: { type: String, default: 'NGN' },
  EXTERNAL_REF: { type: String, default: '' },
  STATUS: { type: String, enum: ['Pending', 'Reconciled', 'Discrepancy'], default: 'Pending' },
  CREATED_AT: { type: Date, default: Date.now },
  // Additional fields for reconciliation details
}, {
  timestamps: true,
  collection: 'reconciliations',
});

// Prevent model overwrite by checking if model exists
const Reconciliation = mongoose.models.Reconciliation || mongoose.model('Reconciliation', ReconciliationSchema);

export default Reconciliation;