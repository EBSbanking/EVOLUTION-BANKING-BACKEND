import mongoose from 'mongoose';

// Define the GLAccount Schema
const GLAccountSchema = new mongoose.Schema({
    GL_ACCT_NO: { type: String, required: true, unique: true },
    GL_ACCT_ID: { type: String, required: true },
    CHART_OF_ACCT_ID: { type: Number, required: true },
    BAL_CD: { type: Number, required: true },
    SUB_LEDGER_NO: { type: Number, required: true },
    ACCT_DESC: { type: String, required: true },
    LEDGER_NO: { type: Number, required: true },
    BU_ID: { type: Number, required: true },
    GL_ACCT_CAT: { type: String, required: true },
    CR_ALLOWED: { type: Boolean, required: true },
    DR_ALLOWED: { type: Boolean, required: true },
    REC_ST: { type: String, required: true },
    ROW_TS: { type: Date, default: Date.now },
    POST_ALLOW: { type: Boolean, required: true },
    POST_FG: { type: Boolean, required: true },
    CONTROL_ACCT_FG: { type: Boolean, required: true },
    CREATED_BY: { type: String, required: true },
    SUPENSE_ACCT_FG: { type: Boolean, required: true },
    ALLOW_BAL_SWING_FG: { type: Boolean, required: true },
    PARENT_ID: { type: Number, required: true },
    SEG_VALUE: { type: Number, required: true, minlength: 2, maxlength: 2 },
    SEG_DESC: { type: String, required: true },
    SEG_NO: { type: Number, required: true },
    subfolderId: { type: Number, ref: 'Subfolder', required: true },
});

// ✅ Use safe model registration to prevent OverwriteModelError
const GLAccount = mongoose.models.GLAccount || mongoose.model('GLAccount', GLAccountSchema);

export default GLAccount;
