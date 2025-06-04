import mongoose from 'mongoose';

const TransactionSchema = new mongoose.Schema({
  ACCT_ID: {
  type: mongoose.Schema.Types.ObjectId,
  ref: 'CustomerAccount', // or the related model name
  required: true
},
  TRAN_JOURNAL_ID: { type: String, required: true },
  EVENT_ID: { type: String, required: true },
  TRANSACTION_ID: { type: String, required: true },
  OPENED_DATE: { type: Date, default: Date.now },
  BU_ID: { type: Number, required: true },
  CUST_ID: { type: Number, required: true },
  ACCT_NM: { type: String, required: true },
  AMOUNT: { type: Number, required: true },
  TRANSACTIONDATE: { type: Date, default: Date.now },
  TRANSACTION_TYPE: { 
    type: String, 
    enum: ['Debit', 'Credit'],  
    required: true
  },
});

// Indexes
TransactionSchema.index({ TRANSACTION_ID: 1 });
TransactionSchema.index({ ACCT_ID: 1 });

const Transaction = mongoose.model('Transaction', TransactionSchema);
export default Transaction;
