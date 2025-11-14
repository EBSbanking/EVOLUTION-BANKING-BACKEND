import mongoose from 'mongoose';

// Define embedded schema for transactions array in GLAccount (simplified subdocument version)
const EmbeddedTransactionSchema = new mongoose.Schema({
  JOURNAL_ID: { type: String, required: true },
  TRANSACTION_ID: { type: String, required: true },
  TYPE: { type: String, enum: ['DEBIT', 'CREDIT'], required: true },
  AMOUNT: { type: Number, required: true, min: 0 },
  NARRATION: { type: String, required: true },
  CREATED_BY: { type: String, required: true },
  CREATED_AT: { type: Date, default: Date.now, required: true },
}, { _id: false }); // Embedded subdocuments don't need _id

// GLAccount Schema
const GLAccountSchema = new mongoose.Schema({
  GL_ACCT_NO: { type: String, required: true, unique: true },
  GL_ACCT_ID: { type: String, required: true, unique: true },
  CREATED_BY: { type: String, required: true },
  categoryCode: { type: String },
  categoryName: { type: String, default: 'Default Category' },
  parentCode: { type: String, default: null },
  level: { type: Number, required: true },
  organizationName: { type: String, required: true },
  branchName: { type: String, required: true },
  branchCode: { type: String, required: true },
  LEDGER_NO: { type: String, required: true },
  PARENT_ID: { type: mongoose.Schema.Types.ObjectId, default: null },
  subfolderId: { type: String, required: true },
  BAL_CD: { type: String, required: true },
  SUB_LEDGER_NO: { type: String, required: true },
  SEG_NO: { type: Number, default: 1 },
  CHART_OF_ACCT_ID: { type: String, required: true },
  ACCT_DESC: { type: String, required: true },
  GL_ACCT_CAT: { type: String, required: true },
  JOURNAL_ID: { type: String, default: null },
  TRANSACTION_TYPE: { type: String, default: 'Asset Balance' },
  CR_ALLOWED: { type: Boolean, default: true },
  DR_ALLOWED: { type: Boolean, default: true },
  REC_ST: { type: String, default: 'Active', enum: ['Active', 'Inactive'] },
  POST_ALLOW: { type: Boolean, default: true },
  POST_FG: { type: Boolean, default: false },
  CONTROL_ACCT_FG: { type: Boolean, default: false },
  SUSPENSE_ACCT_FG: { type: Boolean, default: false },
  ALLOW_BAL_SWING_FG: { type: Boolean, default: false },
  SEG_VALUE: { type: String, default: '' },
  SEG_DESC: { type: String, default: 'Default Description' },
  SEG_TY_CD: { type: String, default: '' },
  SEG_PLACEHLDR_ID: { type: String, default: '' },
  DELAY_GL_POSTING: { type: Boolean, default: false },
  LEDGER_BALANCE: { type: Number, default: 0 },
  CURRENCY_CODE: { type: String, default: 'NGN' },
  transactions: [EmbeddedTransactionSchema], // Use embedded schema (local definition)
  SETTLEMENT_GL_ACCT_NO: { type: String, default: null },
  metadata: {
    accountType: { type: String },
    productType: { type: String },
    subBranchCode: { type: String },
    accountSuffix: { type: String },
    templateGenerated: { type: Boolean, default: false },
    dynamicAccount: { type: Boolean, default: false },
    bulkCreated: { type: Boolean, default: false },
  },
}, {
  timestamps: true,
  collection: 'gl_accounts',
});

// Add canPost method to GLAccountSchema
GLAccountSchema.methods.canPost = function (type) {
  if (type === 'DR') return this.DR_ALLOWED && this.POST_ALLOW && this.REC_ST === 'Active';
  if (type === 'CR') return this.CR_ALLOWED && this.POST_ALLOW && this.REC_ST === 'Active';
  return false;
};

export default mongoose.model('GLAccount', GLAccountSchema);