import mongoose from 'mongoose';

const LoanInterestRateSchema = new mongoose.Schema({
    PROD_ID: { type: Number, required: true },
    INDEX_RATE_ID: { type: Number, required: true },
    ACCRUAL_BASIS_TY: { type: String, required: true },
    MATURITY_INT_INDEX_ID: { type: String, required: true },
    MATURITY_MARGIN_RATE: { type: Number },
    RATE_CHANGE_ALLOWED: { type: Boolean, required: true, default: false },
    RATE_TY: { type: String, required: true },
    LOAN_PROUD_INT_ID: { type: String, unique: true, required: true },
    VERSION: { type: Number, required: true, default: 1 },
    RES_ST: { type: String },
    ROW_TS: { type: Date, default: Date.now },
    USER_ID: { type: String, required: true },
    CREATED_DT: { type: Date, default: Date.now },
    SYS_CREATE_TS: { type: Date, default: Date.now },
    CREATED_BY: { type: String, required: true },
    ACCRUAL_BAL_BASIS_TY: { type: String },
    MARGIN_BAL_BASIS_TY: { type: String },
    ACCRUAL_FREQ_CD: { type: String, required: true },
    ACCRUAL_FREQ_VALUE: { type: Number, required: true },
    DR_CR_IND: { type: String, enum: ['DR', 'CR'], required: true },
    CAPITALIZE_INT_FG: { type: Boolean, default: false },
    INT_TY: { type: String, required: true },
    EFFECTIVE_DT: { type: Date, required: true },
    FIXED_RATE: { type: Number, required: true },
    ABSOLUTE_RATE: { type: Number, required: true },
    CAPITALIZE_ACCT_ST: { type: String },
    MATURITY_ACCRUAL_BAL_TY: { type: String },
    AMORTIZED: { type: Boolean, default: false },
    RATE: { type: String },
    TIME: { type: Number },
}, { timestamps: true });

// ✅ Safe model definition
const LoanInterestRate = mongoose.models.InterestRate || mongoose.model('InterestRate', LoanInterestRateSchema);

export default LoanInterestRate;
