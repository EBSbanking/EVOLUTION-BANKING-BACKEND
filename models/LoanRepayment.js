import mongoose from 'mongoose';
import Customer from '../models/Customer.js'; // Assuming you have a Customer model to validate customer_id

const LoanRepaymentSchema = new mongoose.Schema({
    ACCT_NO: { 
        type: String, 
        required: true, 
        trim: true 
    },
    amount: { 
        type: Number, 
        required: true, 
        min: [1, 'Repayment amount must be greater than zero'] // Ensure amount is greater than zero
    },
    date: { 
        type: Date, 
        required: true, 
        validate: {
            validator: function(value) {
                return !isNaN(Date.parse(value)); // Validate that date is a valid date
            },
            message: props => `${props.value} is not a valid date!`
        }
    },
    CUST_ID: { 
        type: Number,
        required: false 
    },
}, { timestamps: true });

// Pre-save middleware to validate ACCT_NO and customer_id
LoanRepaymentSchema.pre('save', async function (next) {
    // Check if the account number exists in the system
    const accountExists = await mongoose.model('LoanAccount').findOne({ ACCT_NO: this.ACCT_NO });
    if (!accountExists) {
        return next(new Error('Account number does not exist.'));
    }

    // If a customer_id is provided, ensure that the customer exists in the database
    if (this.CUST_ID) {
        const customerExists = await Customer.findById(this.CUST_ID);
        if (!customerExists) {
            return next(new Error('Customer ID is not valid.'));
        }
    }

    // If validation passes, continue
    next();
});

export default mongoose.model('LoanRepayment', LoanRepaymentSchema);
