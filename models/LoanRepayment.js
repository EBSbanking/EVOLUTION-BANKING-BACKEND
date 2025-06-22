// models/LoanRepayment.js
import mongoose from 'mongoose';
import LoanAccount from './LoanAccount.js';

const LoanRepaymentSchema = new mongoose.Schema({
    ACCT_NO: { 
        type: Number, 
        required: true, 
        trim: true 
    },
    amount: { 
        type: mongoose.Schema.Types.Decimal128, 
        required: true,
        get: v => parseFloat(v.toString()),
        set: v => mongoose.Types.Decimal128.fromString(v.toString()),
        validate: {
            validator: function(value) {
                return parseFloat(value.toString()) > 0;
            },
            message: 'Repayment amount must be greater than zero'
        }
    },
    date: { 
        type: Date, 
        required: true,
        default: Date.now,
        validate: {
            validator: function(value) {
                return !isNaN(new Date(value).getTime());
            },
            message: props => `${props.value} is not a valid date!`
        }
    },
    CUST_ID: { 
        type: Number,
        required: false 
    },
    REPAYMENT_HISTORY: [{
        amount: {
            type: mongoose.Schema.Types.Decimal128,
            get: v => parseFloat(v.toString()),
            set: v => mongoose.Types.Decimal128.fromString(v.toString())
        },
        date: {
            type: Date,
            validate: {
                validator: function(value) {
                    return !isNaN(new Date(value).getTime());
                },
                message: props => `${props.value} is not a valid date!`
            }
        }
    }]
}, { 
    timestamps: true,
    toJSON: { getters: true } 
});

LoanRepaymentSchema.pre('save', async function (next) {
    if (isNaN(new Date(this.date).getTime())) {
        return next(new Error('Invalid repayment date.'));
    }

    const loanAccount = await LoanAccount.findOne({ ACCT_NO: this.ACCT_NO });
    if (!loanAccount) {
        return next(new Error('Account number does not exist.'));
    }

    if (this.CUST_ID && this.CUST_ID !== loanAccount.CUST_ID) {
        return next(new Error('Customer ID does not match account.'));
    }

    // Update repayment history
    this.REPAYMENT_HISTORY = this.REPAYMENT_HISTORY || [];
    this.REPAYMENT_HISTORY.push({
        amount: this.amount,
        date: this.date
    });

    next();
});

export default mongoose.model('LoanRepayment', LoanRepaymentSchema);