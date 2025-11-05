import mongoose from 'mongoose';

const smsSchema = new mongoose.Schema({
  EXTERNAL_SMS_ID: { type: String, unique: true, required: true },
  RECIPIENT_PHONE_NUMBER: { type: String, required: true },
  REC_ST: { type: String, required: true },
  ROW_TS: { type: Date, required: true },
  USER_ID: { type: String, required: true },
  MESSAGE_CONTENT: { type: String, required: true },
  CREATE_DT: { type: Date, required: true },
  SYS_CREATE_TS: { type: Date, required: true },
  CREATED_BY: { type: String, required: true },
  ACCT_BALANCE: { type: Number, required: true },
  TXN_AMT: { type: Number, required: true }, // Transaction amount
  ACCT_NO: { type: String, required: true }, // Account number
  DR_CR_IND: { type: String, required: true }, // Debit/Credit indicator
  TXN_DATE: { type: Date, required: true }, // Transaction date
  DISP_AVAIL_BAL: { type: Number, required: true }, // Available balance
  DEPOSITOR_PAYEE_NM: { type: String, required: true } // Depositor/Payee name
});

const SMS = mongoose.model('SMS', smsSchema);

export default SMS;
