import mongoose from 'mongoose'; 
import GLAccount from '../models/GLAccount.js'; // Import GLAccount model
import CustomerAccount from './CustomerAccount.js';
import Deposit from '../models/Deposit.js';

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
    RECIPIENT_PHONE_NUMBER: {type: Number},
    RECIPIENT_PHONE_NUMBER: {type: Number},
    ACCT_NM: { type: String, required: true },
    GL_ACCT_NO: { type: String }, // Reference to GLAccount's ACCT_NO
    TRANSACTION_TYPE: { type: String, required: true },
    AMOUNT: { type: Number, required: true },
    TOTAL_CHARGES: { type: Number, default: 0 },
    TRANSACTION_DATE: { type: Date, default: Date.now },
    DESCRIPTION: { type: String, default: '' },
    BALANCE_AFTER_TRANSACTION: { type: Number },
    VALUE_DATE: { type: Date, required: true },
    TRANSACTION_REF_NO: { type: String, default: generateTransactionRefNo }, // Ensure correct default
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
    TOTAL_CURRENCY_COUNT: { type: Number, default: 0 }
}, {
    timestamps: true // Automatically add `createdAt` and `updatedAt` fields
});

// Before saving, ensure that GL Account exists for the given ACCT_NO
DepositTransactionSchema.pre('save', async function (next) {
    try {
        // Validate GL_ACCT_NO
        const glAccount = await GLAccount.findOne({ ACCT_NO: this.GL_ACCT_NO });
        if (!glAccount) {
            return next(new Error('GL Account not found for the provided GL_ACCT_NO'));
        }

        // Ensure that ACCT_NO is linked to the CustomerAccount and matches
        const customerAccount = await CustomerAccount.findOne({ ACCT_NO: this.ACCT_NO });
        if (!customerAccount) {
            // If no customer account is found, check the Deposit model
            const depositAccount = await Deposit.findOne({ ACCT_NO: this.ACCT_NO });
            if (!depositAccount) {
                return next(new Error('Customer or Deposit account not found for the provided ACCT_NO'));
            }
            this.ACCT_NM = depositAccount.ACCT_NM; // Set the account name from Deposit
        } else {
            this.ACCT_NM = customerAccount.CUST_NM; // Set the account name from CustomerAccount
        }

        // Adjust AMOUNT based on TOTAL_CHARGES
        if (this.TOTAL_CHARGES > 0) {
            this.AMOUNT -= this.TOTAL_CHARGES; // Subtract charges from the AMOUNT
        }

        // Calculate the balance after transaction
        const lastTransaction = await DepositTransaction.findOne({ ACCT_NO: this.ACCT_NO }).sort({ TRANSACTION_DATE: -1 });
        let balanceBeforeTransaction = 0;

        if (lastTransaction) {
            balanceBeforeTransaction = lastTransaction.BALANCE_AFTER_TRANSACTION;
        }

        this.BALANCE_AFTER_TRANSACTION = balanceBeforeTransaction + this.AMOUNT;

        // Update CustomerAccount balances after the deposit
        if (customerAccount) {
            customerAccount.LEDGER_BAL += this.AMOUNT;
            customerAccount.CLEARED_BAL += this.AMOUNT;
            customerAccount.AVAILABLE_BALANCE += this.AMOUNT;
            await customerAccount.save(); // Save the updated CustomerAccount
        }

        next();
    } catch (err) {
        next(err);
    }
});

// Create and export DepositTransaction model
const DepositTransaction = mongoose.model('DepositTransaction', DepositTransactionSchema);

export default DepositTransaction;
