// models/LoanRepayment.js - UPDATED VERSION
import mongoose from 'mongoose';
import LoanAccount from './LoanAccount.js';

const LoanRepaymentSchema = new mongoose.Schema({
    ACCT_NO: { 
        type: String, // Changed from Number to String for consistency
        required: true, 
        trim: true,
        index: true
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
        type: String, // Changed from Number to String for consistency
        required: false,
        trim: true
    },
    customerAccountNo: {
        type: String,
        required: false,
        trim: true
    },
    paymentMethod: {
        type: String,
        enum: ['CASH_DEPOSIT', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE_PAYMENT', 'MOBILE_MONEY'],
        default: 'BANK_TRANSFER'
    },
    reference: {
        type: String,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED'],
        default: 'COMPLETED'
    },
    loanAccountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'LoanAccount'
    },
    customerAccountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CustomerAccount'
    },
    details: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
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
        },
        installmentNumber: {
            type: Number
        },
        principal: {
            type: mongoose.Schema.Types.Decimal128,
            get: v => parseFloat(v.toString()),
            set: v => mongoose.Types.Decimal128.fromString(v.toString())
        },
        interest: {
            type: mongoose.Schema.Types.Decimal128,
            get: v => parseFloat(v.toString()),
            set: v => mongoose.Types.Decimal128.fromString(v.toString())
        },
        fees: {
            type: mongoose.Schema.Types.Decimal128,
            get: v => parseFloat(v.toString()),
            set: v => mongoose.Types.Decimal128.fromString(v.toString())
        },
        reference: String,
        paymentMethod: String
    }],
    createdBy: {
        type: String,
        default: 'SYSTEM'
    },
    updatedBy: {
        type: String,
        default: 'SYSTEM'
    }
}, { 
    timestamps: true,
    toJSON: { getters: true, virtuals: true },
    toObject: { getters: true, virtuals: true }
});

// Add indexes
LoanRepaymentSchema.index({ date: -1 });
LoanRepaymentSchema.index({ ACCT_NO: 1, date: -1 });
LoanRepaymentSchema.index({ CUST_ID: 1 });
LoanRepaymentSchema.index({ status: 1 });
LoanRepaymentSchema.index({ paymentMethod: 1 });

// Virtual for formatted amount
LoanRepaymentSchema.virtual('amountFormatted').get(function() {
    return parseFloat(this.amount.toString()).toFixed(2);
});

// Virtual for formatted date
LoanRepaymentSchema.virtual('dateFormatted').get(function() {
    return this.date.toISOString().split('T')[0];
});

// Pre-save middleware - FIXED VERSION
LoanRepaymentSchema.pre('save', async function (next) {
    try {
        // Validate date
        if (isNaN(new Date(this.date).getTime())) {
            return next(new Error('Invalid repayment date.'));
        }

        // Validate loan account exists
        const loanAccount = await LoanAccount.findOne({ ACCT_NO: String(this.ACCT_NO).trim() });
        if (!loanAccount) {
            return next(new Error(`Account number ${this.ACCT_NO} does not exist.`));
        }

        // FIXED: Compare CUST_ID as strings to handle type mismatches
        if (this.CUST_ID && this.CUST_ID.toString().trim() !== '' && 
            loanAccount.CUST_ID && loanAccount.CUST_ID.toString().trim() !== '') {
            
            const repaymentCustId = String(this.CUST_ID).trim();
            const loanCustId = String(loanAccount.CUST_ID).trim();
            
            if (repaymentCustId !== loanCustId) {
                console.warn(`Customer ID mismatch for repayment: Loan=${loanCustId}, Repayment=${repaymentCustId}`);
                // Allow to proceed but log warning
                // If you want to block it, uncomment next line:
                // return next(new Error(`Customer ID does not match account. Loan: ${loanCustId}, Repayment: ${repaymentCustId}`));
            }
        }

        // Auto-populate loanAccountId if not set
        if (!this.loanAccountId && loanAccount._id) {
            this.loanAccountId = loanAccount._id;
        }

        // Auto-populate CUST_ID from loan account if not set
        if ((!this.CUST_ID || this.CUST_ID.toString().trim() === '') && loanAccount.CUST_ID) {
            this.CUST_ID = String(loanAccount.CUST_ID).trim();
        }

        // Update repayment history
        this.REPAYMENT_HISTORY = this.REPAYMENT_HISTORY || [];
        
        // Only add to history if this is a new repayment
        if (this.isNew) {
            this.REPAYMENT_HISTORY.push({
                amount: this.amount,
                date: this.date,
                reference: this.reference,
                paymentMethod: this.paymentMethod
            });
        }

        // Generate reference if not provided
        if (!this.reference || this.reference.trim() === '') {
            this.reference = `REPAY-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
        }

        next();
    } catch (error) {
        console.error('Error in LoanRepayment pre-save hook:', error);
        next(error);
    }
});

// Post-save middleware to update related loan account
LoanRepaymentSchema.post('save', async function(doc, next) {
    try {
        // Update the loan account's last payment date
        await LoanAccount.updateOne(
            { ACCT_NO: doc.ACCT_NO },
            { 
                $set: { 
                    LAST_PAYMENT_DATE: doc.date,
                    LAST_PAYMENT_AMOUNT: doc.amount,
                    LAST_PAYMENT_METHOD: doc.paymentMethod
                },
                $push: {
                    paymentHistory: {
                        date: doc.date,
                        amount: doc.amount,
                        reference: doc.reference,
                        description: doc.description || 'Loan repayment'
                    }
                }
            }
        );
        next();
    } catch (error) {
        console.error('Error in LoanRepayment post-save hook:', error);
        next();
    }
});

// Static method to find repayments by account
LoanRepaymentSchema.statics.findByAccount = function(ACCT_NO) {
    return this.find({ ACCT_NO: String(ACCT_NO).trim() })
        .sort({ date: -1 })
        .populate('loanAccountId', 'ACCT_NO ACCT_NM LOAN_STATUS')
        .populate('customerAccountId', 'account_number customer_name');
};

// Static method to get repayment summary
LoanRepaymentSchema.statics.getRepaymentSummary = async function(ACCT_NO) {
    const repayments = await this.find({ ACCT_NO: String(ACCT_NO).trim(), status: 'COMPLETED' });
    
    const totalRepaid = repayments.reduce((sum, repayment) => {
        return sum + parseFloat(repayment.amount.toString());
    }, 0);
    
    const firstRepayment = repayments[repayments.length - 1];
    const lastRepayment = repayments[0];
    
    return {
        totalRepayments: repayments.length,
        totalAmount: totalRepaid,
        firstRepaymentDate: firstRepayment ? firstRepayment.date : null,
        lastRepaymentDate: lastRepayment ? lastRepayment.date : null,
        averageRepayment: repayments.length > 0 ? totalRepaid / repayments.length : 0
    };
};

// Instance method to format repayment data
LoanRepaymentSchema.methods.formatForResponse = function() {
    return {
        id: this._id,
        accountNumber: this.ACCT_NO,
        amount: parseFloat(this.amount.toString()),
        amountFormatted: this.amountFormatted,
        date: this.date,
        dateFormatted: this.dateFormatted,
        customerId: this.CUST_ID,
        paymentMethod: this.paymentMethod,
        reference: this.reference,
        description: this.description,
        status: this.status,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt,
        repaymentHistory: (this.REPAYMENT_HISTORY || []).map(item => ({
            amount: parseFloat(item.amount.toString()),
            date: item.date,
            installmentNumber: item.installmentNumber,
            principal: item.principal ? parseFloat(item.principal.toString()) : null,
            interest: item.interest ? parseFloat(item.interest.toString()) : null,
            fees: item.fees ? parseFloat(item.fees.toString()) : null,
            reference: item.reference,
            paymentMethod: item.paymentMethod
        }))
    };
};

// Export the model
const LoanRepayment = mongoose.model('LoanRepayment', LoanRepaymentSchema);
export default LoanRepayment;