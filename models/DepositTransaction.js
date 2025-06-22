import mongoose from 'mongoose'; 
import GLAccount from '../models/GLAccount.js'; // Import GLAccount model

// Helper function to generate a random 18-digit transaction reference number
const generateTransactionRefNo = () => {
    const serialPrefix = 'TRX';
    const randomDigits = Math.floor(Math.random() * 1000000000000000000); // 18-digit number
    return `${serialPrefix}${randomDigits}`;
};

// Define the DepositTransaction schema
const DepositTransactionSchema = new mongoose.Schema({
    ACCT_ID: { type: Number },
    ACCT_NO: { type: Number, required: true },
    RECIPIENT_PHONE_NUMBER: { type: Number },
    ACCT_NM: { type: String, required: true },
    GL_ACCT_NO: { type: String }, // Reference to GLAccount's ACCT_NO
    TRANSACTION_TYPE: { type: String, required: true },
    AMOUNT: { type: Number, required: true },
    TOTAL_CHARGES: { type: Number, default: 0 },
    TRANSACTION_DATE: { type: Date, default: Date.now },
    DESCRIPTION: { type: String, default: '' },
    BALANCE_AFTER_TRANSACTION: { type: Number },
    VALUE_DATE: { type: Date, required: true },
    TRANSACTION_REF_NO: { type: String, default: generateTransactionRefNo },
    DEPOSITOR_NAME: { type: String, required: true },
    BUSINESS_UNIT: { type: String, required: true },
    CURRENCY_COUNT: {
        OneThousandNaira: { type: Number, default: 0 },
        FiveHundredNaira: { type: Number, default: 0 },
        TwoHundredNaira: { type: Number, default: 0 },
        OneHundredNaira: { type: Number, default: 0 },
        FiftyNaira: { type: Number, default: 0 },
        TwentyNaira: { type: Number, default: 0 },
        TenNaira: { type: Number, default: 0 },
        FiveNaira: { type: Number, default: 0 },
        TOTAL_CURRENCY_COUNT: { type: Number, default: 0 },
    },
    REC_ST: {
        type: String,
        enum: [
            'Active', 'Pending'
        ],
        default: 'Active',
        required: true,
        set: val => val.charAt(0).toUpperCase() + val.slice(1).toLowerCase() // ✅ Fix applied here
    },
    TOTAL_CURRENCY_COUNT: { type: Number, default: 0 }
}, {
    timestamps: true // Automatically adds createdAt and updatedAt
});

// Create and export DepositTransaction model
const DepositTransaction = mongoose.model('DepositTransaction', DepositTransactionSchema);
export default DepositTransaction;
