import mongoose from 'mongoose';

// Counter schema for generating serial numbers
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true }, // Counter name
  seq: { type: Number, default: 0 } // Sequence number
});

// Check if the Counter model already exists, if not, create it
const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

// Credit Application schema
const creditApplicationSchema = new mongoose.Schema({
  CUST_NM: { type: String, required: true },
  CUST_ID: { type: Number, required: true },
  PRODUCT: { type: String },
  ACCT_ID: { type: Number, required: true },
  ACCT_NO: { type: Number, required: true },
  APPL_DT: { type: Date, default: Date.now },
  APPL_ID: { type: String, unique: true },
  PROD_ID: { type: String, required: true },
  APPROVAL_DT: { type: Date, required: true },
  APPROVED_CRNCY_ID: { type: String },
  APPROVED_CR_REQD_DT: { type: Date },
  APPROVED_EXPIRY_DT: { type: Date },
  APPROVED_LIMIT_AMT: { type: Number, required: true },
  APPROVED_TERM_CD: { type: String },
  APPROVED_TERM_VALUE: { type: Number },
  BANK_OFFICER_ID: { type: String },
  BU_ID: { type: String, required: true },

  Borrower_address: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    zip: { type: String },
    country: { type: String }
  },

  COMMENTS: { type: String },
  CREATE_DT: { type: Date, default: Date.now },
  CREATED_BY: { type: String, required: true },
  CRNCY_ID: { type: String },
  CR_REQD_DT: { type: Date },
  CR_TY_ID: { type: String },
  CR_UTILISATION_MTHD_CD: { type: String },
  Credit_Type: { type: String, required: true },
  DECLINE_DT: { type: Date },
  EXPIRY_DT: { type: Date },
  INDUSTRY_ID: { type: String },
  LOAN_CYCLE: { type: Number, default: 1 },
  MULTI_CRNCY_FG: { type: Boolean, default: false },
  OVERDRAFT_ACCT_ID: { type: String },
  PORTFOLIO_ID: { type: String },
  PRIME_LIMIT_AMT: { type: String, required: true },
  Product_Combination: { type: String },
  PROD_COMB_OPTION: { type: String },
  Purpose_of_Credit: { type: String, required: true },
  REC_ST: { type: String, default: 'active' },
  REF_NO: { type: String },
  REPAY_SRC_ACCT_NO: { type: String, required: true },
  ROW_TS: { type: Date, default: Date.now },
  RSN_ID: { type: String },
  SECONDARY_BANK_OFFICER_ID: { type: String },
  INDEX_RATE_ID: { type: String },
  SYS_CREATE_TS: { type: Date, default: Date.now },
  TERM_CD: { type: String, required: true },
  TERM_VALUE: { type: Number, required: true },
  USER_ID: { type: String, required: true },
  VALIDITY_EXPIRATION_DT: { type: Date },
  VERSION_NO: { type: Number, default: 1 },
  TRANSACTION_TYPE: { type: String, required: true },
  LOAN_CYCLE_START_DT: { type: Date },
  STATUS: {
    type: String,
    default: 'Pending',
    required: true,
  }
});

// Static method to generate ACCT_NO
creditApplicationSchema.statics.generateAcctNo = async function () {
  const prefix = 3000000000;
  try {
    const counter = await Counter.findOneAndUpdate(
      { _id: 'acctNo' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return prefix + counter.seq;
  } catch (error) {
    throw new Error('Error generating ACCT_NO: ' + error.message);
  }
};

// Static method to generate APPL_ID
creditApplicationSchema.statics.generateApplId = async function () {
  try {
    const counter = await Counter.findOneAndUpdate(
      { _id: 'creditAppId' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const serialNumber = counter.seq.toString().padStart(4, '0');
    return `CRAPP/${serialNumber}`;
  } catch (error) {
    throw new Error('Error generating APPL_ID: ' + error.message);
  }
};

// Static method to generate REF_NO
creditApplicationSchema.statics.generateRefNo = async function () {
  try {
    const counter = await Counter.findOneAndUpdate(
      { _id: 'refNo' },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    return counter.seq.toString().padStart(8, '0');
  } catch (error) {
    throw new Error('Error generating REF_NO: ' + error.message);
  }
};

// Pre-save hook to auto-generate IDs if missing
creditApplicationSchema.pre('save', async function (next) {
  try {
    if (!this.CUST_ID) {
      const custCounter = await Counter.findOneAndUpdate(
        { _id: 'custId' },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      this.CUST_ID = custCounter.seq;
    }

    if (!this.ACCT_NO || !this.ACCT_ID) {
      const acctNo = await this.constructor.generateAcctNo();
      this.ACCT_NO = acctNo;
      this.ACCT_ID = acctNo; // You can separate logic if needed
    }

    if (!this.APPL_ID) {
      this.APPL_ID = await this.constructor.generateApplId();
    }

    if (!this.REF_NO) {
      this.REF_NO = await this.constructor.generateRefNo();
    }

    next();
  } catch (err) {
    next(err);
  }
});

const CreditApplication =
  mongoose.models.CreditApplication || mongoose.model('CreditApplication', creditApplicationSchema);

export default CreditApplication;
