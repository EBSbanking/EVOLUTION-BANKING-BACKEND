import mongoose from 'mongoose';

const DrawerCurrencySchema = new mongoose.Schema({
  DRAWER_CRNCY_ID: {
    type: Number,
    required: true,
    unique: true,
  },
  DRAWER_ID: {
    type: Number,
    required: true,
  },
  CRNCY_ID: {
    type: Number,
    required: true,
  },
  CUR_BAL: {
    type: mongoose.Types.Decimal128,
    required: true,
  },
  OPEN_BAL: {
    type: mongoose.Types.Decimal128,
    required: true,
  },
  END_BAL: {
    type: mongoose.Types.Decimal128,
    required: true,
  },
  REC_ST: {
    type: String,
    required: true,
    default: 'C',
    maxlength: 1,
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
  },
  SYS_CREATE_TS: {
    type: Date,
    required: true,
    default: Date.now,
  },
  CREATED_BY: {
    type: String,
    required: true,
    maxlength: 24,
  },
  TOTAL_CASH_IN: {
    type: mongoose.Types.Decimal128,
    default: 0,
  },
  TOTAL_CASH_OUT: {
    type: mongoose.Types.Decimal128,
    default: 0,
  },
  TOTAL_CASH_SALE: {
    type: mongoose.Types.Decimal128,
    default: 0,
  },
  TOTAL_CASH_BOUGHT: {
    type: mongoose.Types.Decimal128,
    default: 0,
  },
  SHORTAGE_AMT: {
    type: mongoose.Types.Decimal128,
    required: true,
  },
  OVERAGE_AMT: {
    type: mongoose.Types.Decimal128,
    required: true,
  },
  CASH_IN_COUNT: {
    type: Number,
    default: 0,
  },
  CASH_OUT_COUNT: {
    type: Number,
    default: 0,
  },
  CASH_BOUGHT_COUNT: {
    type: Number,
    default: 0,
  },
  CASH_SALE_COUNT: {
    type: Number,
    default: 0,
  },
  REFUND_AMT: {
    type: mongoose.Types.Decimal128,
  },
});

export default mongoose.model('DrawerCurrency', DrawerCurrencySchema);
