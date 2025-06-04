import mongoose from 'mongoose';

const ledgerSchema = new mongoose.Schema({
  JOURNAL_ID: { type: String, required: true },
  LEDGER_NO: { type: String, required: true },
  AMOUNT: { type: Number, required: true },
  TRANSACTION_TYPE: {
    type: String,
    enum: [
      'Credit', 'Debit', 'Transfer', 'Adjustment', 'Reversal',
      'Fee', 'Interest', 'Charges', 'Refund', 'Payment',
      'Withdrawal', 'Deposit', 'Opening Balance', 'Closing Balance',
      'Correction', 'Write-off', 'Reconciliation', 'Others'
    ],
    required: true,
  },
  CHART_OF_ACCT_ID: { type: Number, required: true },
  LEDGER_BALANCE: { type: Number, required: true },
  ACCT_DESC: { type: String, required: true },
  GL_ACCT_NO: { type: String, required: true },
  GL_ACCT_ID: { type: Number, required: true },
  GL_ACCT_STRUCT_ID: { type: Number, required: false },
  GL_ACCT_CAT_CD: { type: String, required: true, maxlength: 10 },
  BAL_CD: { type: String, required: true },
  SUB_LEDGER_NO: { type: Number, required: true },
  BU_ID: { type: Number, required: true },
  SEG_NO: { type: String, required: true },
  CREATED_BY: { type: String, required: true },
  CREATE_DT: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model('Ledger', ledgerSchema);
