import mongoose from 'mongoose';

// Define the schema for DirectDebitRequest
const directDebitRequestSchema = new mongoose.Schema(
  {
    DIRECT_DR_REQ_ID: {
      type: Number,
      required: true,
      unique: true,
    },
    DIRECT_DR_REQ_DESC: {
      type: String,
      maxlength: 100,
    },
    FROM_ACCT_ID: {
      type: Number,
      required: true,
    },
    DIRECT_DR_MANDATE_TY_CD: {
      type: String,
      maxlength: 10,
      required: true,
    },
    SCHED_TY_CD: {
      type: String,
      maxlength: 10,
      required: true,
    },
    FIRST_PAY_CRNCY_ID: Number,
    LAST_PAY_CRNCY_ID: Number,
    REGULAR_PAY_CRNCY_ID: Number,
    FIRST_PAY_AMT: mongoose.Schema.Types.Decimal128,
    REGULAR_PAY_AMT: mongoose.Schema.Types.Decimal128,
    LAST_PAY_AMT: mongoose.Schema.Types.Decimal128,
    NEXT_REQ_DT: {
      type: Date,
      required: true,
    },
    NO_OF_PAYMENTS: {
      type: Number,
      default: 0,
    },
    PAY_FREQ_CD: {
      type: String,
      maxlength: 10,
      required: true,
    },
    PAY_FREQ_VALUE: {
      type: Number,
      default: 0,
    },
    EXPIRY_DT: Date,
    NON_BUS_DT_OPTN_CD: {
      type: String,
      maxlength: 10,
    },
    REQUEST_MTHD_CD: {
      type: String,
      maxlength: 10,
    },
    BIC_ID: Number,
    BANK_CD: {
      type: String,
      maxlength: 10,
      required: true,
    },
    BANK_NM: {
      type: String,
      maxlength: 50,
      required: true,
    },
    BRANCH_NM: {
      type: String,
      maxlength: 50,
      required: true,
    },
    BRANCH_CITY: {
      type: String,
      maxlength: 60,
    },
    BRANCH_CNTRY_ID: Number,
    SUPPLEMENTARY_INSTR: {
      type: String,
      maxlength: 255,
    },
    PAYEE_NM: {
      type: String,
      maxlength: 100,
      required: true,
    },
    PAYEE_ACCT_NO: {
      type: String,
      maxlength: 60,
      required: true,
    },
    PAYEE_ACCT_ID: Number,
    REC_ST: {
      type: String,
      maxlength: 1,
      required: true,
    },
    VERSION_NO: {
      type: Number,
      required: true,
    },
    ROW_TS: {
      type: Date,
      default: Date.now,
    },
    USER_ID: {
      type: String,
      maxlength: 24,
      required: true,
    },
    CREATE_DT: {
      type: Date,
      required: true,
    },
    CREATED_BY: {
      type: String,
      maxlength: 24,
      required: true,
    },
    SYS_CREATE_TS: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: { createdAt: 'SYS_CREATE_TS', updatedAt: 'ROW_TS' },
  }
);

// Create the model using the schema
const DirectDebitRequest = mongoose.model('DirectDebitRequest', directDebitRequestSchema);

export default DirectDebitRequest;
