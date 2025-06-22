import mongoose from 'mongoose';
import AuditTrail from './AuditTrail.js';
import CustomerAccount from './CustomerAccount.js';
import DepositAccountApplication from './DepositAccountApplication.js';

// Helper function to generate a deposit account number
const generateDepositAccountNumber = () => `10000000${Math.floor(Math.random() * 100)}`;

// Helper function to generate deposit account details (ACCT_ID, ACCT_NO)
export const generateDepositAccountDetails = async () => {
    try {
        const ACCT_ID = `00000${Math.floor(Math.random() * 1000)}`;
        const ACCT_NO = generateDepositAccountNumber();

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
    CUST_ID: { 
        type: String, 
        required: true,
        validate: {
            validator: async function(CUST_ID) {
                const customerAccount = await CustomerAccount.findOne({ CUST_ID });
                const application = await DepositAccountApplication.findOne({ CUST_ID });
                return customerAccount || application;
            },
            message: 'Customer ID does not exist in either CustomerAccount or DepositAccountApplication'
        }
    },
    ACCT_ID: { type: String, required: false },
    ACCT_NM: { type: String, required: true },
    ACCT_NO: { type: String, required: true },
    BU_ID: { type: String, required: true },
    RSM_ID: { type: String, required: true },
    OPENED_DT: { type: Date, required: true },
    AVAIL_DT: { type: Date, required: true },
    PROD_ID: { type: String, required: true },
});

// Middleware to auto-generate and validate deposit account details
depositSchema.pre('save', async function (next) {
    if (this.isNew) {
        try {
            let customerAccount = await CustomerAccount.findOne({ CUST_ID: this.CUST_ID });
            
            if (!customerAccount) {
                const application = await DepositAccountApplication.findOne({ CUST_ID: this.CUST_ID });
                if (application) {
                    customerAccount = new CustomerAccount({
                        CUST_ID: application.CUST_ID,
                        ACCT_ID: application.ACCT_ID,
                        ACCT_NO: application.ACCT_NO,
                        ACCT_NM: application.ACCT_NM,
                        BU_ID: application.BU_ID,
                        LEDGER_BAL: 0.0,
                        CLEARED_BAL: 0.0,
                        AVAILABLE_BALANCE: 0.0,
                        ACCOUNT_TYPE: 'SAVINGS',
                        PRODUCT_DESC: 'Regular savings account',
                        REC_ST: 'ACTIVE'
                    });
                    await customerAccount.save();
                }
            }

            if (customerAccount) {
                this.ACCT_NO = customerAccount.ACCT_NO;
                this.ACCT_ID = customerAccount.ACCT_ID;
                this.ACCT_NM = customerAccount.ACCT_NM;
                this.BU_ID = customerAccount.BU_ID;
            } else {
                const { ACCT_ID, ACCT_NO } = await generateDepositAccountDetails();
                this.ACCT_NO = ACCT_NO;
                this.ACCT_ID = ACCT_ID;
            }
        } catch (error) {
            console.error('Error generating account details:', error.message);
            next(error);
            return;
        }
    }
    next();
});

// Add post-save hook to update application status if it exists
depositSchema.post('save', async function(doc, next) {
    try {
        await DepositAccountApplication.findOneAndUpdate(
            { CUST_ID: doc.CUST_ID },
            { STATUS: 'ACTIVE' },
            { new: true }
        );
    } catch (error) {
        console.error('Error updating application status:', error);
    }
    next();
});

const Deposit = mongoose.models.Deposit || mongoose.model('Deposit', depositSchema);

export default Deposit;