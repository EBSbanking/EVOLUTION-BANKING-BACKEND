// pco_banking_backend/models/DepositAccountInterest_Tier.js
import mongoose from 'mongoose';

const depositAccountInterest_TierSchema = new mongoose.Schema({
  DEPOSIT_ACCT_INT_TIER_ID: { type: Number, required: true },
  DEPOSIT_ACCT_INT_ID: { type: Number, required: true },
  PROD_ID: { type: Number, required: true},
  MARGIN_RATE: { type: mongoose.Types.Decimal128, required: true },
  FROM_AMT: { type: mongoose.Types.Decimal128, required: false },
  TO_AMT: { type: mongoose.Types.Decimal128, required: true },
  REC_ST: { type: String, required: true, maxlength: 1 }, // CHAR(1 Byte)
  VERSION_NO: { type: Number, required: true },
  ROW_TS: { type: Date, required: true }, // TIMESTAMP(6)
  USER_ID: { type: String, required: true, maxlength: 24 }, // VARCHAR2(24 Byte)
  CREATE_DT: { type: Date, required: true }, // DATE
  CREATED_BY: { type: String, required: true, maxlength: 24 }, // VARCHAR2(24 Byte)
  SYS_CREATE_TS: { type: Date, required: true }, // TIMESTAMP(6)
  MARGIN_TY_CD: { type: String, required: true, maxlength: 10 }, // VARCHAR2(10 Byte)
  PENAL_MARGIN_RATE: { type: mongoose.Types.Decimal128, required: false },
  PENAL_MARGIN_TY_CD: { type: String, required: false, maxlength: 10 } // VARCHAR2(10 Byte)
}, { timestamps: true });

const DepositAccountInterest_Tier = mongoose.model('DepositAccountInterest_Tier', depositAccountInterest_TierSchema, 'deposit_account_interest_tier');

export default DepositAccountInterest_Tier;
