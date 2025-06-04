import mongoose from 'mongoose'; // Import mongoose

const loanAccountSchema = new mongoose.Schema(
    {
        JOURNAL_ID: {
            type: Number,
            required: true,
            default: () => Date.now(), // Automatically generates a timestamp-based ID
        },
        CUST_ID: {
            type: Number,
            required: true,
        },
        ACCT_NM: {
            type: String,
            required: true,
        },
        ACCT_NO: {
            type: Number,
            required: true,
        },
        APPL_ID: {
            type: String,
            required: true,
        },
        CRNCY_ID: {
            type: String,
            required: true,
        },
        BU_ID: {
            type: String,
            required: true,
        },
        PRIMARY_OFFICER_ID: {
            type: String,
            required: true,
        },
        SECONDARY_OFFICER_ID: {
            type: String,
        },
        DISBURSEMENT_LIMIT: {
            type: mongoose.Schema.Types.Decimal128,
            required: true,
        },
        START_DT: {
            type: Date,
            required: true,
        },
        TERM_CD: {
            type: String,
            required: true,
        },
        TERM_VALUE: {
            type: Number,
            required: true,
        },
        MATURITY_DT: {
            type: Date,
            required: true,
        },
        TRANSACTION_TYPE: {
            type: String,
            required: true,
             // Valid transaction types
        },
        CHART_OF_ACCT_ID: {
            type: Number,
        },
        CLEARED_BALANCE: {
            type: mongoose.Schema.Types.Decimal128,
            default: 0.0,
        },
        AVAILABLE_BALANCE: {
            type: mongoose.Schema.Types.Decimal128,
            default: 0.0,
        },
        LEDGER_BALANCE: {
            type: mongoose.Schema.Types.Decimal128,
            default: 0.0,
        },
        ACCT_DESC: {
            type: String,
        },
        LEDGER_NO: {
            type: Number,
        },
        PROD_ID: {
            type: Number,
            required: true,
        },
       
        LOAN_STATUS: {
  type: String,
  enum: ['Active', 'Closed', 'Overdue'],
  default: 'Active'
}

    },
    { timestamps: true }
);

// Middleware to auto-generate the LOAN_CYCLE and set CLOSED_DT
loanAccountSchema.pre('save', async function (next) {
    if (this.isNew) {
        try {
            const loanCycleCount = await mongoose
                .model('LoanAccount')
                .countDocuments({ CUST_ID: this.CUST_ID });
            this.LOAN_CYCLE = loanCycleCount + 1;
        } catch (error) {
            return next(error);
        }
    }

    if (this.START_DT && this.TERM_CD && this.TERM_VALUE) {
        const startDate = new Date(this.START_DT);
        let closeDate;

        if (this.TERM_CD === 'M') {
            closeDate = new Date(startDate.setMonth(startDate.getMonth() + this.TERM_VALUE));
        } else if (this.TERM_CD === 'W') {
            closeDate = new Date(startDate.setDate(startDate.getDate() + this.TERM_VALUE * 7));
        }

        this.CLOSED_DT = closeDate;
    }

    next();
});



const LoanAccount = mongoose.models.LoanAccount || mongoose.model('LoanAccount', loanAccountSchema);
export default LoanAccount;
