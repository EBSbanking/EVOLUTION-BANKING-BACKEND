// Use ES6 `import` syntax for modern module systems
import mongoose from 'mongoose';

// Define the CashWithdrawalTransaction schema
const cashWithdrawalTransactionSchema = new mongoose.Schema({
  CUST_ID: { type: Number, required: true },
  ACCT_ID: { type: mongoose.Schema.Types.ObjectId, required: true }, // ObjectId for referencing Account
  ACCT_NO: { type: String, required: true },
  ACCT_NM: { type: String, required: true },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount must be a positive number'],
  },
  TOTAL_CHARGES: { type: Number, default: 0 }, // Default to 0
  VALUE_DATE: { type: Date, required: true },
  WITHDRAWER_NAME: { type: String, required: true },
  BUSINESS_UNIT: { type: String, required: true },
  DESCRIPTION: { type: String, default: '' },
  SOURCE_OF_FUNDS: { type: String, required: true },
  CURRENCY_COUNT: { type: Object, default: {} },
  TOTAL_CURRENCY_COUNT: { type: Number, default: 0 },
  TRANSACTION_REF_NO: { type: String, required: true, unique: true }, // Unique reference number for each transaction
  BALANCE_BEFORE_TRANSACTION: { type: Number, required: true },
  BALANCE_AFTER_TRANSACTION: { type: Number, required: true },
  WORK_ITEM_ID: { type: Number, required: true }, // To track workflow item
  transactionStatus: { type: String, default: 'Pending Authorization' }, // Default status set to "Pending Authorization"
}, { timestamps: true }); // Automatically add createdAt and updatedAt timestamps

// Pre-save middleware for validation and business logic
cashWithdrawalTransactionSchema.pre('save', async function (next) {
  try {
    // Validate that the amount is positive
    if (!this.amount || this.amount <= 0) {
      return next(new Error('Amount must be a positive number.'));
    }

    // If no other issues, proceed with the save
    next();
  } catch (err) {
    next(err); // Handle error in the next middleware
  }
});

// Create and export CashWithdrawalTransaction model
const CashWithdrawalTransaction = mongoose.model('CashWithdrawalTransaction', cashWithdrawalTransactionSchema);

export default CashWithdrawalTransaction;
