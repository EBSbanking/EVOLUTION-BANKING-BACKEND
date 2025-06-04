import mongoose from 'mongoose';

// Define the CustomerAccount schema
const customerAccountSchema = new mongoose.Schema({
    ACCT_ID: { type: String, required: true },
    ACCT_NO: { type: String, required: true, unique: true },
    ACCT_NM: { type: String, required: true },
    BU_ID: { type: String, required: true },
    LEDGER_BAL: { type: Number, required: true },
    CLEARED_BAL: { type: Number, required: true },
    AVAILABLE_BALANCE: { type: Number, required: true },
    ACCOUNT_TYPE: {
        type: String,
        required: true,
        enum: ['SAVINGS', 'CURRENT', 'FIXED_DEPOSIT', 'LOAN', 'CREDIT_CARD']
    },
    PRODUCT_DESC: { type: String, required: true },
    REC_ST: {
        type: String,
        enum: ['ACTIVE', 'DORMANT', 'SUSPENDED', 'CLOSED', 'INACTIVE', 'LOCKED', 'CANCELLED', 'BLOCKED', 'PENDING', 'FROZEN', 'OVERDUE'],
        required: true,
    },
    CREATED_AT: { type: Date, default: Date.now },
    UPDATED_AT: { type: Date, default: Date.now },
}, { timestamps: true });

// ✅ Prevent OverwriteModelError by checking if model already exists
const CustomerAccount = mongoose.models.CustomerAccount || mongoose.model('CustomerAccount', customerAccountSchema);

export default CustomerAccount;
