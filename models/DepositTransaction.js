import mongoose from 'mongoose';

// Validate GL account number format: 6 groups of 1-3 digits separated by '-'
const isValidGLAcctNo = (glAcctNo) => {
  const regex = /^(\d{1,3}-){5}\d{1,3}$/;
  return regex.test(glAcctNo);
};

const DepositTransactionSchema = new mongoose.Schema({
  // ✅ EXISTING FIELDS
  ACCT_ID: { type: String },
  ACCT_NO: { type: String, required: true, index: true },
  ACCT_NM: { type: String },
  GL_ACCT_NO: {
    type: String,
    required: true,
    validate: {
      validator: isValidGLAcctNo,
      message: 'Invalid GL_ACCT_NO format. It should be in the format xx-xx-xx-xx-xx-xx (e.g., 2-400-100-200-101-1)',
    },
  },
  TRANSACTION_TYPE: { type: String, required: true, enum: ['Deposit'] },
  AMOUNT: { type: Number, required: true, min: [0, 'Amount must be a positive number'] },
  TRANSACTION_REF_NO: { type: String, required: true, unique: true, index: true },
  BALANCE_AFTER_TRANSACTION: { type: Number, min: 0 },
  VALUE_DATE: { type: Date, required: true },
  TRANSACTION_DATE: { type: Date, required: true },
  BUSINESS_UNIT: { type: String, default: '001' },
  DEPOSITOR_NAME: { type: String, required: true },
  CURRENCY_COUNT: {
    type: {
      OneThousandNaira: { type: Number, default: 0, min: [0, 'OneThousandNaira count cannot be negative'] },
      FiveHundredNaira: { type: Number, default: 0, min: [0, 'FiveHundredNaira count cannot be negative'] },
      TwoHundredNaira: { type: Number, default: 0, min: [0, 'TwoHundredNaira count cannot be negative'] },
      OneHundredNaira: { type: Number, default: 0, min: [0, 'OneHundredNaira count cannot be negative'] },
      FiftyNaira: { type: Number, default: 0, min: [0, 'FiftyNaira count cannot be negative'] },
      TwentyNaira: { type: Number, default: 0, min: [0, 'TwentyNaira count cannot be negative'] },
      TenNaira: { type: Number, default: 0, min: [0, 'TenNaira count cannot be negative'] },
      FiveNaira: { type: Number, default: 0, min: [0, 'FiveNaira count cannot be negative'] },
      TOTAL_CURRENCY_COUNT: { type: Number, default: 0, min: [0, 'Total currency count cannot be negative'] },
    },
    default: () => ({
      OneThousandNaira: 0,
      FiveHundredNaira: 0,
      TwoHundredNaira: 0,
      OneHundredNaira: 0,
      FiftyNaira: 0,
      TwentyNaira: 0,
      TenNaira: 0,
      FiveNaira: 0,
      TOTAL_CURRENCY_COUNT: 0,
    }),
  },
  REC_ST: { type: String, default: 'Pending', enum: ['Pending', 'Active', 'Inactive'] },
  STATUS: { type: String, default: 'Pending', enum: ['Pending', 'Approved', 'Rejected'] },
  DESCRIPTION: { type: String },
  CUST_ID: { type: String, required: true, index: true },
  USER_ID: { type: String, required: true },
  APPROVED_BY: { type: String },
  APPROVED_DATE: { type: Date },
  REJECTED_BY: { type: String },
  REJECTED_DATE: { type: Date },
  GL_TransactionId: { type: Number },
  QueueTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'GLTransactionQueue' },

  // ✅ NEW FIELDS FOR TELLER DASHBOARD STATISTICS
  tellerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  responsibility_centre: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'transfer'],
    required: true,
    index: true
  },
  // Alias field for AMOUNT to maintain consistency
  amount: {
    type: Number,
    required: true,
    min: [0, 'Amount must be a positive number']
  },
  // Alias field for TRANSACTION_DATE for consistency
  transactionDate: {
    type: Date,
    required: true,
    index: true
  }
}, {
  timestamps: true // Adds createdAt and updatedAt automatically
});

// ✅ Virtual to sync amount with AMOUNT field
DepositTransactionSchema.virtual('syncAmount').get(function() {
  return this.AMOUNT;
}).set(function(value) {
  this.AMOUNT = value;
  this.amount = value;
});

// ✅ Virtual to sync transactionDate with TRANSACTION_DATE field
DepositTransactionSchema.virtual('syncTransactionDate').get(function() {
  return this.TRANSACTION_DATE;
}).set(function(value) {
  this.TRANSACTION_DATE = value;
  this.transactionDate = value;
});

// ✅ Pre-save middleware to sync fields
DepositTransactionSchema.pre('save', function(next) {
  // Sync amount with AMOUNT
  if (this.AMOUNT !== undefined && this.amount !== this.AMOUNT) {
    this.amount = this.AMOUNT;
  } else if (this.amount !== undefined && this.AMOUNT !== this.amount) {
    this.AMOUNT = this.amount;
  }
  
  // Sync transactionDate with TRANSACTION_DATE
  if (this.TRANSACTION_DATE !== undefined && this.transactionDate !== this.TRANSACTION_DATE) {
    this.transactionDate = this.TRANSACTION_DATE;
  } else if (this.transactionDate !== undefined && this.TRANSACTION_DATE !== this.transactionDate) {
    this.TRANSACTION_DATE = this.transactionDate;
  }
  
  // Set type based on TRANSACTION_TYPE if not provided
  if (!this.type && this.TRANSACTION_TYPE) {
    this.type = this.TRANSACTION_TYPE.toLowerCase();
  }
  
  next();
});

// ✅ Validate that AMOUNT matches the sum of denomination counts
DepositTransactionSchema.pre('validate', function (next) {
  if (this.CURRENCY_COUNT) {
    const {
      OneThousandNaira = 0,
      FiveHundredNaira = 0,
      TwoHundredNaira = 0,
      OneHundredNaira = 0,
      FiftyNaira = 0,
      TwentyNaira = 0,
      TenNaira = 0,
      FiveNaira = 0,
    } = this.CURRENCY_COUNT;

    // Calculate total amount from denominations
    const calculatedAmount =
      OneThousandNaira * 1000 +
      FiveHundredNaira * 500 +
      TwoHundredNaira * 200 +
      OneHundredNaira * 100 +
      FiftyNaira * 50 +
      TwentyNaira * 20 +
      TenNaira * 10 +
      FiveNaira * 5;

    // Update TOTAL_CURRENCY_COUNT
    this.CURRENCY_COUNT.TOTAL_CURRENCY_COUNT =
      OneThousandNaira +
      FiveHundredNaira +
      TwoHundredNaira +
      OneHundredNaira +
      FiftyNaira +
      TwentyNaira +
      TenNaira +
      FiveNaira;

    // Validate AMOUNT matches calculated amount
    if (this.AMOUNT !== calculatedAmount) {
      return next(new Error('AMOUNT must match the sum of currency denominations'));
    }
  }
  
  // Ensure required fields are set
  if (!this.tellerId) {
    return next(new Error('tellerId is required'));
  }
  if (!this.responsibility_centre) {
    return next(new Error('responsibility_centre is required'));
  }
  if (!this.type) {
    return next(new Error('type is required'));
  }
  
  next();
});

// ✅ Ensure indexes are created for better query performance
DepositTransactionSchema.index({ ACCT_NO: 1 });
DepositTransactionSchema.index({ TRANSACTION_REF_NO: 1 });
DepositTransactionSchema.index({ CUST_ID: 1 });
DepositTransactionSchema.index({ tellerId: 1 });
DepositTransactionSchema.index({ responsibility_centre: 1 });
DepositTransactionSchema.index({ transactionDate: 1 });
DepositTransactionSchema.index({ type: 1 });
DepositTransactionSchema.index({ 
  tellerId: 1, 
  responsibility_centre: 1, 
  transactionDate: 1 
});
DepositTransactionSchema.index({ 
  responsibility_centre: 1, 
  transactionDate: 1,
  type: 1 
});

// ✅ Method to get transaction stats for teller dashboard
DepositTransactionSchema.statics.getTellerStats = async function(tellerId, responsibilityCentre, startDate, endDate) {
  return await this.aggregate([
    {
      $match: {
        tellerId: new mongoose.Types.ObjectId(tellerId),
        responsibility_centre: responsibilityCentre,
        transactionDate: { $gte: startDate, $lt: endDate },
        STATUS: 'Approved' // Only count approved transactions
      }
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        totalAmount: { $sum: '$amount' }
      }
    }
  ]);
};

// ✅ Method to get daily transaction summary
DepositTransactionSchema.statics.getDailySummary = async function(tellerId, responsibilityCentre, date) {
  const startDate = new Date(date);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(date);
  endDate.setDate(endDate.getDate() + 1);
  
  return await this.aggregate([
    {
      $match: {
        tellerId: new mongoose.Types.ObjectId(tellerId),
        responsibility_centre: responsibilityCentre,
        transactionDate: { $gte: startDate, $lt: endDate },
        STATUS: 'Approved'
      }
    },
    {
      $group: {
        _id: null,
        totalTransactions: { $sum: 1 },
        totalDeposits: {
          $sum: {
            $cond: [{ $eq: ['$type', 'deposit'] }, '$amount', 0]
          }
        },
        totalWithdrawals: {
          $sum: {
            $cond: [{ $eq: ['$type', 'withdrawal'] }, '$amount', 0]
          }
        },
        totalTransfers: {
          $sum: {
            $cond: [{ $eq: ['$type', 'transfer'] }, '$amount', 0]
          }
        }
      }
    }
  ]);
};

export default mongoose.model('DepositTransaction', DepositTransactionSchema);