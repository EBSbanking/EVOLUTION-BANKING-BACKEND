import mongoose from 'mongoose';
import AuditTrail from './AuditTrail.js';
import CustomerAccount from './CustomerAccount.js'; // Import the CustomerAccount model

// Helper function to generate a deposit account number
const generateDepositAccountNumber = () => `10000000${Math.floor(Math.random() * 100)}`;

// Helper function to generate deposit account details (ACCT_ID, ACCT_NO)
const generateDepositAccountDetails = async () => {
    try {
        const ACCT_ID = `00000${Math.floor(Math.random() * 1000)}`; // Generate random account ID
        const ACCT_NO = generateDepositAccountNumber(); // Generate deposit account number

        return {
            ACCT_ID,
            ACCT_NO,
        };
    } catch (error) {
        console.error('Error generating deposit account details:', error.message);
        throw new Error('Error generating deposit account details');
    }
};

// Deposit Schema Definition
const depositSchema = new mongoose.Schema({
    CUST_ID: { type: String, required: true },
    ACCT_ID: { type: String, required: false },
    ACCT_NM: { type: String, required: true },
    ACCT_NO: { type: String, required: true }, // This should be linked to CustomerAccount
    BU_ID: { type: String, required: true },
    RSM_ID: { type: String, required: true },
    OPENED_DT: { type: Date, required: true },
    AVAIL_DT: { type: Date, required: true },
    PROD_ID: { type: String, required: true },
});

// Middleware to auto-generate the deposit account details (ACCT_ID, ACCT_NO)
depositSchema.pre('save', async function (next) {
    if (this.isNew) {
        try {
            // Fetch the customer account to get the ACCT_NO
            const customerAccount = await CustomerAccount.findOne({ CUST_ID: this.CUST_ID });
            if (customerAccount) {
                this.ACCT_NO = customerAccount.ACCT_NO; // Use the same ACCT_NO as in the CustomerAccount
                this.ACCT_ID = customerAccount.ACCT_ID; // You can also link ACCT_ID if needed
            } else {
                // If no customer account is found, generate a random deposit account number
                this.ACCT_NO = generateDepositAccountNumber(); // Generate a new account number for the deposit
                this.ACCT_ID = `00000${Math.floor(Math.random() * 1000)}`; // Generate a random ACCT_ID for the deposit
            }
        } catch (error) {
            console.error('Error generating account details:', error.message);
            next(error); // Pass the error to next() to prevent saving
            return;
        }
    }
    next();
});

// Define and export the Deposit model
const Deposit = mongoose.models.Deposit || mongoose.model('Deposit', depositSchema);

// Export the function
export { generateDepositAccountDetails };

export default Deposit;
