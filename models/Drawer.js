// models/Drawer.js
import mongoose from 'mongoose';

const { Schema } = mongoose;

const DrawerSchema = new Schema({
  DRAWER_ID: { type: Number, required: true, unique: true }, // Unique Drawer ID
  DRAWER_NO: { type: String, required: true, maxlength: 20 }, // Drawer number
  TOTAL_INSURED_AMT: { type: Schema.Types.Decimal128, required: true, default: 0 }, // Total insured amount
  MIN_BAL: { type: Schema.Types.Decimal128, default: 0 }, // Minimum balance
  MAX_BAL: { type: Schema.Types.Decimal128, default: 0 }, // Maximum balance
  EFF_FROM_DT: { type: Date, required: true, default: Date.now }, // Effective from date
  EFF_TO_DT: { type: Date, required: false, default: Date.now }, // Effective to date
  DRAWER_TY_CD: { type: String, required: true, maxlength: 10 }, // Drawer type code
  REC_ST: { type: String, required: true, default: 'C', maxlength: 1 }, // Record status
  VERSION_NO: { type: Number, required: true, default: 1 }, // Version number
  ROW_TS: { type: Date, required: true, default: Date.now }, // Timestamp
  USER_ID: { type: String, required: true, maxlength: 24 }, // User ID
  BU_ID: { type: Number, required: true }, // Business Unit ID
  CREATE_DT: { type: Date, required: true, default: Date.now }, // Create date
  SYS_CREATE_TS: { type: Date, required: true, default: Date.now }, // System creation timestamp
  CREATED_BY: { type: String, required: true, maxlength: 24 }, // Created by
  OVERAGE_AMT: { type: Schema.Types.Decimal128, required: true, default: 0 }, // Overage amount
  SHORTAGE_AMT: { type: Schema.Types.Decimal128, required: true, default: 0 }, // Shortage amount
  DRAWER_CASH_LIMIT_FG: { type: String, default: 'N', maxlength: 1 }, // Cash limit flag
  DRAWER_LIMIT_EXCEED_TM: { type: Date, default: Date.now }, // Drawer limit exceed time
  DRAWER_INSURED_LIMIT_FG: { type: String, default: 'N', maxlength: 1 }, // Insured limit flag
  LAST_DRAWER_CLOSE_DT: { type: Date, default: Date.now }, // Last drawer close date
  LAST_DRAWER_OPEN_DT: { type: Date, default: Date.now }, // Last drawer open date
  GL_ACCT_NO: { type: String, required: true, maxlength: 60 }, // GL account number
  SP_ACCT_NO: { type: String, default: '', maxlength: 60 }, // Special account number
  SP_ACCT_FG: { type: String, default: 'N', maxlength: 1 }, // Special account flag
  WF_STATUS: { type: String, default: '', maxlength: 1 }, // Workflow status
  DRAWER_NM: { type: String, default: '', maxlength: 60 }, // Drawer name
}, {
  timestamps: true // Automatically adds createdAt and updatedAt fields
});

const Drawer = mongoose.model('Drawer', DrawerSchema);

export default Drawer;
