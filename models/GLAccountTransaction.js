import mongoose from 'mongoose';
import express from 'express';
import GLAccount from '../models/GLAccountTransaction.js';

const { Schema } = mongoose;

const GLAccountTransactionSchema = new Schema({
  GL_ACCT_ID: { type: Number, required: true },
  GL_ACCT_STRUCT_ID: { type: Number, required: true },
  GL_ACCT_NO: { type: String, required: true, maxlength: 60 },
  BAL_CD: { type: String, maxlength: 20 },
  LEDGER_NO: { type: String, required: true, maxlength: 20 },
  ACCT_DESC: { type: String, required: true, maxlength: 100 },
  GL_ACCT_CAT_CD: { type: String, required: true, maxlength: 10 },
  POST_FG: { type: String, maxlength: 1 },
  CONTROL_ACCT_FG: { type: String, maxlength: 1 },
  CRS_ALLOWED_FG: { type: String, maxlength: 1 },
  DRS_ALLOWED_FG: { type: String, maxlength: 1 },
  REC_ST: { type: String, required: true, maxlength: 1 },
  VERSION_NO: { type: Number, required: true },
  ROW_TS: { type: Date, required: true },
  USER_ID: { type: String, required: true, maxlength: 24 },
  CHART_OF_ACCT_ID: { type: Number },
  BU_ID: { type: Number },
  CREATE_DT: { type: Date, required: true },
  SYS_CREATE_TS: { type: Date, required: true },
  CREATED_BY: { type: String, required: true, maxlength: 24 }
});

export default mongoose.model('GLAccountTransaction', GLAccountTransactionSchema);
