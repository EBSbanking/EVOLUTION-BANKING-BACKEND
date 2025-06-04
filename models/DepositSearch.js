import mongoose from 'mongoose';

const { Schema } = mongoose;

const DepositSearchSchema = new Schema({
  ACCT_NO: { type: String, required: true, maxlength: 20 },          // Account Number
  ACCT_NM: { type: String, required: true, maxlength: 50 },          // Account Name
  PROD_CD: { type: String, required: true, maxlength: 50 },          // Product Code
  OPENED_DT: { type: String, required: true, maxlength: 8 },         // Opened Date (Format: YYYYMMDD)
  LEDGER_BAL: { type: Schema.Types.Decimal128, required: true },    // Ledger Balance (using Decimal128 for precision)
  BU_CD: { type: Number, required: true },                           // Business Unit Code (Integer)
  PRIMARY_CUST_ID: { type: String, required: true, maxlength: 20 },  // Primary Customer ID
}, {
  timestamps: true // Automatically adds createdAt and updatedAt fields
});

const DepositSearch = mongoose.model('DepositSearch', DepositSearchSchema);

export default DepositSearch;
