import mongoose from 'mongoose';

const DepositAccountApplicationSchema = new mongoose.Schema({
  CUST_ID: { type: String, required: true, trim: true },
  ACCT_ID: { type: Number, required: true },
  ACCT_NO: { type: Number, required: true },
  ACCT_NM: { type: String, required: true },
  CRNCY_ID: { type: String, default: 'NGN' },
  PROD_ID: { type: String },
  BU_ID: { type: String, required: true },
  AVAIL_DT: { type: Date, required: true },
  OPENED_DT: { type: Date, required: true },
  NATIONALITY_NO: { type: String },
  CREATED_BY: { type: String, required: true },
  USER_ID: { type: String, required: true },
  BVN_NO: { type: Number, required: true },
  CREATED_AT: { type: Date, default: Date.now },
  IMAGE: { type: String, required: true },
  DOCUMENT: { type: String, required: true },
  DOCUMENT_TYPE: { type: String, required: true },
  DOCUMENT_NUMBER: { type: String, required: true },
  BANK_MANDATE: { type: String, required: true },
 STATUS: {
  type: String,
  enum: ['Pending', 'Approved', 'Rejected'],
  default: 'Pending',
},



});

export default mongoose.models.DepositAccountApplication ||
  mongoose.model('DepositAccountApplication', DepositAccountApplicationSchema);
