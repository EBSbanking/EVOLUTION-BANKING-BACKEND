import mongoose from 'mongoose';

const ledgerSchema = new mongoose.Schema({
  GL_ACCT_NO: {
    type: String,
    required: [true, 'GL_ACCT_NO is required'],
    unique: true,
    trim: true,
  },
  GL_ACCT_ID: { type: String, required: [true, 'GL_ACCT_ID is required'], unique: true },
  CHART_OF_ACCT_ID: {
    type: String,
    required: [true, 'CHART_OF_ACCT_ID is required'],
    default: '10001',
  },
  BAL_CD: {
    type: String,
    required: [true, 'BAL_CD is required'],
    trim: true,
    minlength: [1, 'BAL_CD must be a non-empty string'],
  },
  SUB_LEDGER_NO: {
    type: String,
    required: [true, 'SUB_LEDGER_NO is required'],
    trim: true,
    minlength: [1, 'SUB_LEDGER_NO must be a non-empty string'],
  },
  ACCT_DESC: {
    type: String,
    required: [true, 'ACCT_DESC is required'],
    trim: true,
    default: 'GL Account',
  },
  LEDGER_NO: {
    type: String,
    required: [true, 'LEDGER_NO is required'],
    trim: true,
    minlength: [1, 'LEDGER_NO must be a non-empty string'],
  },
  BU_ID: {
    type: String,
    required: [true, 'BU_ID is required'],
    trim: true,
    validate: {
      validator: (value) => /^\d{3}$/.test(value),
      message: 'BU_ID must be a 3-digit number',
    },
  },
  GL_ACCT_CAT: {
    type: String,
    required: [true, 'GL_ACCT_CAT is required'],
    enum: {
      values: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'],
      message: 'GL_ACCT_CAT must be one of: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE',
    },
  },
  CR_ALLOWED: {
    type: Boolean,
    default: true,
  },
  DR_ALLOWED: {
    type: Boolean,
    default: true,
  },
  REC_ST: {
    type: String,
    default: 'Active',
    enum: {
      values: ['Active', 'Inactive', 'Closed'],
      message: 'REC_ST must be one of: Active, Inactive, Closed',
    },
  },
  POST_ALLOW: {
    type: Boolean,
    default: true,
  },
  POST_FG: {
    type: Boolean,
    default: false,
  },
  CONTROL_ACCT_FG: {
    type: Boolean,
    default: false,
  },
  CREATED_BY: {
    type: String,
    required: [true, 'CREATED_BY is required'],
    trim: true,
  },
  SUSPENSE_ACCT_FG: {
    type: Boolean,
    default: false,
  },
  ALLOW_BAL_SWING_FG: {
    type: Boolean,
    default: false,
  },
  PARENT_ID: {
    type: String,
    default: '1',
  },
  SEG_VALUE: {
    type: String,
    default: '',
  },
  SEG_DESC: {
    type: String,
    default: '',
  },
  SEG_NO: {
    type: String,
    required: [true, 'SEG_NO is required'],
    trim: true,
    minlength: [1, 'SEG_NO must be a non-empty string'],
  },
  subfolderId: {
    type: String,
    default: '1',
  },
  DELAY_GL_POSTING: {
    type: Boolean,
    default: false,
  },
  ROW_TS: {
    type: Date,
    default: Date.now,
  },
  LEDGER_BALANCE: {
    type: Number,
    default: 0,
  },
  transactions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'GLTransaction',
  }],
  organizationName: {
    type: String,
    required: [true, 'organizationName is required'],
    trim: true,
  },
  branchName: {
    type: String,
    required: [true, 'branchName is required'],
    trim: true,
  },
}, { timestamps: true });

// Helper method to check if posting is allowed
ledgerSchema.methods.canPost = function (txnType) {
  const normalizedTxnType = txnType.toUpperCase();
  return (normalizedTxnType === 'DR' && this.DR_ALLOWED) || (normalizedTxnType === 'CR' && this.CR_ALLOWED);
};

const Ledger = mongoose.models.Ledger || mongoose.model('Ledger', ledgerSchema);
export default Ledger;