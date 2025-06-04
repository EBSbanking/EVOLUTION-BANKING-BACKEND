import mongoose from 'mongoose';

// Define the schema for the DirectDebit model
const directDebitSchema = new mongoose.Schema(
  {
    DIRECT_DR_ID: {
      type: String,  // Changed from Number to String (as the error indicated an issue with casting "DD001")
      required: true,
    },
    FROM_DEPOSIT_ACCT_NO: {  // Changed to FROM_DEPOSIT_ACCT_NO for account number
      type: String,  // Changed from Number to String
      required: true,
    },
    DIRECT_DR_DESC: {
      type: String,
      required: true,
      maxlength: 100, // Limit to 100 characters
    },
    DIRECT_DR_MANDATE_TY_CD: {
      type: String,
      required: true,
      maxlength: 10,
    },
    XFER_MTHD_CD: {
      type: String,
      required: true,
      maxlength: 8,
    },
    PAY_CRNCY_ID: {
      type: String,  // Changed from Number to String (based on the validation error with USD)
      required: true,
    },
    PAY_AMT: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
    TO_DEPOSIT_ACCT_NO: {  // Changed to TO_DEPOSIT_ACCT_NO for account number
      type: String,  // Changed from Number to String
      required: true,
    },
    MAX_PAY_AMT: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
    },
    SCHED_TY_CD: {
      type: String,
      required: true,
      maxlength: 10,
    },
    NEXT_PAY_DT: {
      type: Date,
      required: true,
    },
    NO_OF_PAYMENTS: {
      type: Number,
      required: true,
    },
    PAY_FREQ_CD: {
      type: String,
      required: true,
      maxlength: 10,
    },
    PAY_FREQ_VALUE: {
      type: Number,
      required: true,
    },
    EXPIRY_DT: {
      type: Date,
      required: true,
    },
    NON_BUS_DUE_DT_OPTN_CD: {
      type: String,
      required: true,
      maxlength: 10,
    },
    REF_TXT: {
      type: String,
      required: true,
      maxlength: 50,
    },
    SUPPLEMENTARY_REF_TXT: {
      type: String,
      required: true,
      maxlength: 50,
    },
    PAY_RSN_ID: {
      type: Number,
      required: true,
    },
    SVCE_PROVIDER_ID: {
      type: String,  // Changed from Number to String
      required: true,
    },
    BENEFICIARY_ID: {
      type: String,  // Changed from Number to String
      required: true,
    },
    SUPPLEMENTARY_INSTRUCTION: {
      type: String,
      required: true,
      maxlength: 255,
    },
    REC_ST: {
      type: String,
      required: true,
      enum: ['Y', 'N'], // Assuming 'Y' for active, 'N' for inactive
    },
    VERSION_NO: {
      type: Number,
      required: true,
    },
    ROW_TS: {
      type: Date,
      required: true,
    },
    USER_ID: {
      type: String,
      required: true,
      maxlength: 24,
    },
    CREATE_DT: {
      type: Date,
      required: true,
    },
    CREATED_BY: {
      type: String,
      required: true,
      maxlength: 24,
    },
    SYS_CREATE_TS: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt fields automatically
  }
);

// Create the model using the schema
const DirectDebit = mongoose.model('DirectDebit', directDebitSchema);

export default DirectDebit;
