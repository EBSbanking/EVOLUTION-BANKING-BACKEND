
import mongoose from 'mongoose';

const InwardFundsTransferSchema = new mongoose.Schema({
  INWD_FUNDS_XFER_ID: {
    type: Number,
    required: true,
    unique: true,
  },
  XFER_REF: {
    type: String,
    required: true,
    maxlength: 100,
  },
  PAYMENT_MTD_CD: {
    type: String,
    maxlength: 10,
  },
  CHARGES_PAYER_CD: {
    type: String,
    maxlength: 10,
  },
  XFER_CRNCY_ID: {
    type: Number,
    required: true,
  },
  XFER_AMT: {
    type: mongoose.Types.Decimal128,
    required: true,
    default: '0',
  },
  SENDING_BANK_CHRG: {
    type: mongoose.Types.Decimal128,
  },
  RECIEVING_BANK_CHRG: {
    type: mongoose.Types.Decimal128,
  },
  TOTAL_CHRG: {
    type: mongoose.Types.Decimal128,
  },
  NET_AMT_XFERED: {
    type: mongoose.Types.Decimal128,
  },
  PAY_CRNCY_ID: {
    type: Number,
    required: true,
  },
  PAY_EXCH_RATE: {
    type: mongoose.Types.Decimal128,
    required: true,
  },
  PAY_AMT: {
    type: mongoose.Types.Decimal128,
  },
  LCY_EQIVALENT: {
    type: mongoose.Types.Decimal128,
  },
  VALUE_DT: {
    type: Date,
    required: true,
  },
  PRIORITY_LEVEL_CD: {
    type: String,
    required: true,
    maxlength: 10,
  },
  SUPPLEMENTARY_REF: {
    type: String,
    maxlength: 100,
  },
  XFER_PURPOSE_ID: {
    type: Number,
  },
  PAY_DETAILS: {
    type: String,
    maxlength: 4000,
  },
  FUNDS_XFER_TY_ID: {
    type: Number,
  },
  BU_ID: {
    type: Number,
  },
  BENEFICIARY_NM: {
    type: String,
    maxlength: 60,
  },
  BENEFICIARY_ACCT: {
    type: String,
    required: true,
    maxlength: 60,
  },
  BENEFICIARY_ADDR_LINE1: {
    type: String,
    maxlength: 35,
  },
  BENEFICIARY_ADDR_LINE2: {
    type: String,
    maxlength: 35,
  },
  BENEFICIARY_ADDR_LINE3: {
    type: String,
    maxlength: 35,
  },
  BENEFICIARY_ADDR_LINE4: {
    type: String,
    maxlength: 35,
  },
  BENEFICIARY_TEL_NO: {
    type: String,
    maxlength: 60,
  },
  BENEFICIARY_BIC_ID: {
    type: Number,
    required: true,
  },
  BENEFICIARY_BANK_NM: {
    type: String,
    required: true,
    maxlength: 60,
  },
  BENEFICIARY_BRANCH: {
    type: String,
    maxlength: 60,
  },
  BENEFICIARY_BANK_CITY_ID: {
    type: Number,
  },
  BENEFICIARY_BANK_STATE_COUNTY: {
    type: String,
    maxlength: 60,
  },
  BENEFICIARY_BANK_CNTRY_ID: {
    type: Number,
    required: true,
  },
  BENEFICIARY_BANK_TEL_NO: {
    type: String,
    maxlength: 60,
  },
  REMITTER_NM: {
    type: String,
    required: true,
    maxlength: 100,
  },
  REMITTER_ACCT_NO: {
    type: String,
    maxlength: 60,
  },
  REMITTER_ADDR_LINE1: {
    type: String,
    maxlength: 35,
  },
  REMITTER_ADDR_LINE2: {
    type: String,
    maxlength: 35,
  },
  REMITTER_ADDR_LINE3: {
    type: String,
    maxlength: 35,
  },
  REMITTER_ADDR_LINE4: {
    type: String,
    maxlength: 35,
  },
  REMITTER_TEL_NO: {
    type: String,
    maxlength: 60,
  },
  BENEFICIARY_IDENT_TY_ID: {
    type: Number,
  },
  REMITTER_IDENT_TY_ID: {
    type: Number,
  },
  REMITTER_IDENT_NO: {
    type: String,
    maxlength: 60,
  },
  REMITTER_BIC_ID: {
    type: Number,
  },
  REMITTER_BANK_NM: {
    type: String,
    maxlength: 60,
  },
  REMITTER_BRANCH_NM: {
    type: String,
    maxlength: 60,
  },
  REMITTER_BANK_CITY_ID: {
    type: Number,
  },
  REMITTER_BANK_STATE_COUNTY: {
    type: String,
    maxlength: 60,
  },
  REMITTER_BANK_TEL_NO: {
    type: String,
    maxlength: 60,
  },
  REMITTER_BANK_CNTRY_ID: {
    type: Number,
  },
  SENDING_INSTITUTION_BANK_ID: {
    type: Number,
  },
  ORDERING_INSTITUTION_BANK_ID: {
    type: Number,
  },
  SENDER_CORRESPONDENT_BANK_ID: {
    type: Number,
  },
  RECIEVER_CORRESPONDENT_BANK_ID: {
    type: Number,
  },
  THIRD_REIMBURSEMENT_BANK_ID: {
    type: Number,
  },
  INTERMEDIARY_BANK_ID: {
    type: Number,
  },
  REC_ST: {
    type: String,
    required: true,
    enum: ['A', 'I', 'P'],
    default: 'P',
  },
  VERSION_NO: {
    type: Number,
    required: true,
  },
  ROW_TS: {
    type: Date,
    required: true,
    default: Date.now,
  },
  USER_ID: {
    type: String,
    required: true,
    maxlength: 24,
  },
  CREATE_DT: {
    type: Date,
    required: true,
    default: Date.now,
  },
  CREATED_BY: {
    type: String,
    required: true,
    maxlength: 24,
  },
  SYS_CREATE_TS: {
    type: Date,
    required: true,
    default: Date.now,
  },
  ADDTL_INSTRUCTION1: {
    type: String,
    maxlength: 256,
  },
  ADDTL_INSTRUCTION2: {
    type: String,
    maxlength: 256,
  },
  ADDTL_INSTRUCTION3: {
    type: String,
    maxlength: 256,
  },
  ADDTL_INSTRUCTION4: {
    type: String,
    maxlength: 256,
  },
  BENEFICIARY_SECRET_QA: {
    type: String,
    maxlength: 256,
  },
  SPEC_INSTRUCTION: {
    type: String,
    maxlength: 4000,
  },
  EXT_INWD_FUNDS_XFER_ID: {
    type: Number,
  },
  BENEFICIARY_ID: {
    type: Number,
  },
  REPAIR_FG: {
    type: String,
    required: true,
    enum: ['Y', 'N'],
    default: 'N',
  },
  FOREIGN_IFT_FG: {
    type: String,
    required: true,
    enum: ['Y', 'N'],
    default: 'N',
  },
  ADDTL_INSTR1_CD: {
    type: String,
    maxlength: 10,
  },
  ADDTL_INSTR2_CD: {
    type: String,
    maxlength: 10,
  },
  ADDTL_INSTR3_CD: {
    type: String,
    maxlength: 10,
  },
  ADDTL_INSTR4_CD: {
    type: String,
    maxlength: 10,
  },
}, {
  timestamps: false,
  toJSON: { getters: true },
});

InwardFundsTransferSchema.pre('save', async function (next) {
  if (this.isModified('REC_ST') && this.REC_ST === 'A') {
    try {
      const CustomerAccount = mongoose.model('CustomerAccount');
      const PendingGLTransaction = mongoose.model('PendingGLTransaction');
      const account = await CustomerAccount.findOne({ ACCT_NO: this.BENEFICIARY_ACCT });
      if (!account) {
        throw new Error(`CustomerAccount with ACCT_NO ${this.BENEFICIARY_ACCT} not found`);
      }
      const netAmount = this.NET_AMT_XFERED ? Number(this.NET_AMT_XFERED) : Number(this.XFER_AMT);
      if (netAmount <= 0) {
        throw new Error('Net amount must be positive');
      }
      account.LEDGER_BAL = mongoose.Types.Decimal128.fromString((Number(account.LEDGER_BAL) + netAmount).toFixed(10));
      account.CLEARED_BAL = mongoose.Types.Decimal128.fromString((Number(account.CLEARED_BAL) + netAmount).toFixed(10));
      account.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString((Number(account.AVAILABLE_BALANCE) + netAmount).toFixed(10));
      account.lastActivityDate = new Date();
      await account.save();
      const creditEntry = new PendingGLTransaction({
        INWD_FUNDS_XFER_ID: this.INWD_FUNDS_XFER_ID,
        XFER_REF: this.XFER_REF,
        GL_ACCT_NO: this.BENEFICIARY_ACCT,
        TRANSACTION_TYPE: 'CREDIT',
        AMOUNT: mongoose.Types.Decimal128.fromString(netAmount.toFixed(10)),
        CRNCY_ID: this.XFER_CRNCY_ID,
        TRANSACTION_DATE: this.VALUE_DT,
        CREATED_BY: this.CREATED_BY,
        JOURNAL_ID: this.INWD_FUNDS_XFER_ID,
        STATUS: 'PENDING',
      });
      await creditEntry.save();
      const debitEntry = new PendingGLTransaction({
        INWD_FUNDS_XFER_ID: this.INWD_FUNDS_XFER_ID,
        XFER_REF: this.XFER_REF,
        GL_ACCT_NO: 'SUSPENSE_GL_ACCOUNT', // Replace with actual GL account number
        TRANSACTION_TYPE: 'DEBIT',
        AMOUNT: mongoose.Types.Decimal128.fromString(netAmount.toFixed(10)),
        CRNCY_ID: this.XFER_CRNCY_ID,
        TRANSACTION_DATE: this.VALUE_DT,
        CREATED_BY: this.CREATED_BY,
        JOURNAL_ID: this.INWD_FUNDS_XFER_ID,
        STATUS: 'PENDING',
      });
      await debitEntry.save();
    } catch (err) {
      return next(err);
    }
  }
  next();
});

export default mongoose.model('InwardFundsTransfer', InwardFundsTransferSchema);