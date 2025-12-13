import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// Loan Disbursement schema - UPDATED TO MATCH CONTROLLER REQUIREMENTS
const loanDisbursementSchema = new mongoose.Schema({
  // REQUIRED FIELDS FROM CONTROLLER
  ACCT_NO: {
    type: String,
    required: true,
    index: true,
    validate: {
      validator: function(v) {
        return v && typeof v === 'string' && v.length >= 10;
      },
      message: 'Account number must be a string with at least 10 characters'
    }
  },
  INTEREST_RATE: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: function(v) {
      if (!v) return 0;
      try {
        return typeof v === 'object' && v.toString ? parseFloat(v.toString()) : parseFloat(v);
      } catch (error) {
        logger.warn(`Error in interest rate getter: ${error.message}`);
        return 0;
      }
    },
    set: function(v) {
      if (!v && v !== 0) return mongoose.Types.Decimal128.fromString('0.00');
      try {
        return mongoose.Types.Decimal128.fromString(v.toString());
      } catch (error) {
        logger.warn(`Error in interest rate setter: ${error.message}`);
        return mongoose.Types.Decimal128.fromString('0.00');
      }
    },
    min: 0,
    max: 100
  },
  TERM_VALUE: {
    type: Number,
    required: true,
    min: 1,
    validate: {
      validator: Number.isInteger,
      message: 'Term value must be an integer'
    }
  },
  TERM_CD: {
    type: String,
    required: true,
    enum: ['MONTH', 'MONTHLY', 'QUARTERLY', 'WEEKLY', 'DAILY', 'YEARLY', 'M', 'Q', 'W', 'D', 'Y'],
    uppercase: true
  },
  AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    required: true,
    get: function(v) {
      if (!v) return 0;
      try {
        return typeof v === 'object' && v.toString ? parseFloat(v.toString()) : parseFloat(v);
      } catch (error) {
        logger.warn(`Error in disbursement amount getter: ${error.message}`);
        return 0;
      }
    },
    set: function(v) {
      if (!v && v !== 0) return mongoose.Types.Decimal128.fromString('0.00');
      try {
        return mongoose.Types.Decimal128.fromString(v.toString());
      } catch (error) {
        logger.warn(`Error in disbursement amount setter: ${error.message}`);
        return mongoose.Types.Decimal128.fromString('0.00');
      }
    },
    min: 0
  },
  CUST_ID: {
    type: String,
    required: true,
    index: true
  },
  APPL_ID: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  
  // INTEREST CONFIGURATION (REQUIRED)
  INTEREST_CONFIGURATION: {
    INTEREST_TYPE: {
      type: String,
      enum: ['FIXED', 'VARIABLE', 'TIERED', 'FIXED_RATE', 'VARIABLE_RATE', 'SIMPLE', 'COMPOUND'],
      default: 'FIXED',
      required: true
    },
    CALCULATION_METHOD: {
      type: String,
      enum: ['DECLINING_BALANCE', 'FLAT_RATE', 'COMPOUND', 'DAILY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'],
      default: 'DECLINING_BALANCE',
      required: true
    },
    INTEREST_RATE: {
      type: mongoose.Schema.Types.Decimal128,
      get: function(v) {
        if (!v) return 0;
        try {
          return typeof v === 'object' && v.toString ? parseFloat(v.toString()) : parseFloat(v);
        } catch (error) {
          logger.warn(`Error in interest configuration rate getter: ${error.message}`);
          return 0;
        }
      },
      set: function(v) {
        if (!v && v !== 0) return mongoose.Types.Decimal128.fromString('0.00');
        try {
          return mongoose.Types.Decimal128.fromString(v.toString());
        } catch (error) {
          logger.warn(`Error in interest configuration rate setter: ${error.message}`);
          return mongoose.Types.Decimal128.fromString('0.00');
        }
      }
    },
    // Optional fields
    PROD_ID: {
      type: Number,
      required: false
    },
    INDEX_RATE_ID: {
      type: Number,
      required: false
    },
    LOAN_INTEREST_RATE_ID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'LoanInterestRate'
    },
    RATE_TYPE: {
      type: String,
      enum: ['FIXED', 'FLOATING', 'TIERED']
    }
  },
  
  // EXISTING FIELDS FROM YOUR SCHEMA
  LOAN_ACCOUNT_ID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanAccount',
    required: true
  },
  DISBURSEMENT_DATE: {
    type: Date,
    default: Date.now,
    validate: {
      validator: function(v) {
        return v instanceof Date && !isNaN(v.getTime());
      },
      message: 'Invalid disbursement date'
    }
  },
  FEES_AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    default: () => mongoose.Types.Decimal128.fromString('0.00'),
    get: function(v) {
      if (!v) return 0;
      try {
        return typeof v === 'object' && v.toString ? parseFloat(v.toString()) : parseFloat(v);
      } catch (error) {
        logger.warn(`Error in fees amount getter: ${error.message}`);
        return 0;
      }
    },
    set: function(v) {
      if (!v && v !== 0) return mongoose.Types.Decimal128.fromString('0.00');
      try {
        return mongoose.Types.Decimal128.fromString(v.toString());
      } catch (error) {
        logger.warn(`Error in fees amount setter: ${error.message}`);
        return mongoose.Types.Decimal128.fromString('0.00');
      }
    },
    min: 0
  },
  UPFRONT_INTEREST_AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    default: () => mongoose.Types.Decimal128.fromString('0.00'),
    get: function(v) {
      if (!v) return 0;
      try {
        return typeof v === 'object' && v.toString ? parseFloat(v.toString()) : parseFloat(v);
      } catch (error) {
        logger.warn(`Error in upfront interest getter: ${error.message}`);
        return 0;
      }
    },
    set: function(v) {
      if (!v && v !== 0) return mongoose.Types.Decimal128.fromString('0.00');
      try {
        return mongoose.Types.Decimal128.fromString(v.toString());
      } catch (error) {
        logger.warn(`Error in upfront interest setter: ${error.message}`);
        return mongoose.Types.Decimal128.fromString('0.00');
      }
    },
    min: 0
  },
  NET_DISBURSEMENT_AMOUNT: {
    type: mongoose.Schema.Types.Decimal128,
    get: function(v) {
      if (!v) return 0;
      try {
        return typeof v === 'object' && v.toString ? parseFloat(v.toString()) : parseFloat(v);
      } catch (error) {
        logger.warn(`Error in net disbursement getter: ${error.message}`);
        return 0;
      }
    },
    set: function(v) {
      if (!v && v !== 0) return mongoose.Types.Decimal128.fromString('0.00');
      try {
        return mongoose.Types.Decimal128.fromString(v.toString());
      } catch (error) {
        logger.warn(`Error in net disbursement setter: ${error.message}`);
        return mongoose.Types.Decimal128.fromString('0.00');
      }
    },
    min: 0
  },
  REPAYMENT_SCHEDULE: {
    type: Array,
    default: [],
    validate: {
      validator: function(v) {
        if (!Array.isArray(v)) return false;
        return v.every(item =>
          item &&
          typeof item === 'object' &&
          Number.isInteger(item.installmentNo) &&
          item.dueDate instanceof Date &&
          !isNaN(item.dueDate.getTime())
        );
      },
      message: 'Invalid repayment schedule format'
    }
  },
  STATUS: {
    type: String,
    default: 'PENDING',
    enum: ['PENDING', 'APPROVED', 'EXECUTED', 'DISBURSED', 'REJECTED', 'FAILED', 'CANCELLED'],
    uppercase: true
  },
  DISBURSEMENT_TYPE: {
    type: String,
    enum: ['CUSTOMER_ACCOUNT', 'CASH', 'CHEQUE', 'BANK_TRANSFER', 'MOBILE_MONEY'],
    default: 'CUSTOMER_ACCOUNT'
  },
  PROD_ID: {
    type: Number,
    required: false,
    validate: {
      validator: function(v) {
        const validProdIds = [
          1, 300, 301, 302, 303, 304, 305, 306, 307, 308, 309,
          310, 311, 312, 313, 314, 315, 316, 317, 318, 319, 399, 400
        ];
        return validProdIds.includes(v);
      },
      message: props => `${props.value} is not a valid PROD_ID!`
    }
  },
  TRANSACTION_REFERENCE: {
    type: String,
    unique: true,
    sparse: true
  },
  REMARKS: {
    type: String,
    trim: true,
    maxlength: 500
  },
  CREATED_BY: {
    type: String,
    required: true,
    trim: true
  },
  APPROVED_BY: {
    type: String,
    trim: true
  },
  APPROVAL_DATE: {
    type: Date
  },
  EXECUTED_BY: {
    type: String,
    trim: true
  },
  EXECUTION_DATE: {
    type: Date
  },
  DISBURSED_BY: {
    type: String,
    trim: true
  },
  FAILURE_REASON: {
    type: String,
    trim: true
  },
  CANCELLATION_REASON: {
    type: String,
    trim: true
  },
  TRANSACTION_NOTES: {
    type: String,
    trim: true,
    maxlength: 1000
  }
}, {
  timestamps: true,
  toJSON: {
    getters: true,
    transform: function(doc, ret) {
      // Convert Decimal128 fields to numbers
      const decimalFields = ['AMOUNT', 'FEES_AMOUNT', 'UPFRONT_INTEREST_AMOUNT',
                            'NET_DISBURSEMENT_AMOUNT', 'INTEREST_RATE'];

      decimalFields.forEach(field => {
        if (ret[field] && typeof ret[field] === 'object') {
          try {
            ret[field] = parseFloat(ret[field].toString());
          } catch (error) {
            ret[field] = 0;
          }
        }
      });

      // Handle interest configuration decimal field
      if (ret.INTEREST_CONFIGURATION && ret.INTEREST_CONFIGURATION.INTEREST_RATE &&
          typeof ret.INTEREST_CONFIGURATION.INTEREST_RATE === 'object') {
        try {
          ret.INTEREST_CONFIGURATION.INTEREST_RATE =
            parseFloat(ret.INTEREST_CONFIGURATION.INTEREST_RATE.toString());
        } catch (error) {
          ret.INTEREST_CONFIGURATION.INTEREST_RATE = 0;
        }
      }

      // Format dates
      const dateFields = ['DISBURSEMENT_DATE', 'APPROVAL_DATE', 'EXECUTION_DATE'];
      dateFields.forEach(field => {
        if (ret[field]) {
          ret[field] = ret[field].toISOString();
        }
      });

      if (ret.REPAYMENT_SCHEDULE && Array.isArray(ret.REPAYMENT_SCHEDULE)) {
        ret.REPAYMENT_SCHEDULE = ret.REPAYMENT_SCHEDULE.map(item => ({
          ...item,
          dueDate: item.dueDate ? item.dueDate.toISOString() : null
        }));
      }

      // Remove sensitive/internal fields
      delete ret.__v;
      delete ret.updatedAt;

      return ret;
    }
  }
});

// Indexes for better query performance
loanDisbursementSchema.index({ CUST_ID: 1, STATUS: 1 });
loanDisbursementSchema.index({ DISBURSEMENT_DATE: -1 });
loanDisbursementSchema.index({ APPL_ID: 1 }, { unique: true });
loanDisbursementSchema.index({ ACCT_NO: 1, STATUS: 1 });
loanDisbursementSchema.index({ LOAN_ACCOUNT_ID: 1 });
loanDisbursementSchema.index({ STATUS: 1, APPROVAL_DATE: -1 });
loanDisbursementSchema.index({ CREATED_BY: 1, created_at: -1 });

// Middleware to calculate net disbursement and generate repayment schedule
loanDisbursementSchema.pre('save', async function (next) {
  try {
    // Calculate net disbursement amount
    if (this.isModified('AMOUNT') || this.isModified('FEES_AMOUNT') ||
        this.isModified('UPFRONT_INTEREST_AMOUNT') || this.isNew) {

      const amount = this.AMOUNT ? parseFloat(this.AMOUNT.toString()) : 0;
      const fees = this.FEES_AMOUNT ? parseFloat(this.FEES_AMOUNT.toString()) : 0;
      const upfrontInterest = this.UPFRONT_INTEREST_AMOUNT ?
        parseFloat(this.UPFRONT_INTEREST_AMOUNT.toString()) : 0;

      const netAmount = amount - fees - upfrontInterest;
      this.NET_DISBURSEMENT_AMOUNT = mongoose.Types.Decimal128.fromString(netAmount.toString());
    }

    // Generate repayment schedule only if term values are provided
    if ((this.isNew || this.isModified('TERM_CD') || this.isModified('TERM_VALUE') ||
        this.isModified('DISBURSEMENT_DATE') || this.isModified('AMOUNT')) &&
        this.TERM_CD && this.TERM_VALUE && this.AMOUNT) {

      const schedule = [];
      const due = new Date(this.DISBURSEMENT_DATE || new Date());

      // Convert term code to standard format
      const termCode = this.TERM_CD.toUpperCase();

      // Calculate principal per installment (excluding upfront interest)
      const principalAmount = this.AMOUNT ? parseFloat(this.AMOUNT.toString()) : 0;
      const feesAmount = this.FEES_AMOUNT ? parseFloat(this.FEES_AMOUNT.toString()) : 0;
      const totalPrincipal = principalAmount - feesAmount;
      const principalPerInstallment = totalPrincipal / this.TERM_VALUE;

      // Calculate interest per installment if interest rate is provided
      const interestRate = this.INTEREST_RATE ? parseFloat(this.INTEREST_RATE.toString()) / 100 : 0;
      const interestPerInstallment = interestRate > 0 ? (totalPrincipal * interestRate) / this.TERM_VALUE : 0;

      for (let i = 1; i <= this.TERM_VALUE; i++) {
        const installmentDue = new Date(due);

        switch (termCode) {
          case 'M':
          case 'MONTH':
          case 'MONTHLY':
            installmentDue.setMonth(installmentDue.getMonth() + i);
            break;
          case 'Q':
          case 'QUARTERLY':
            installmentDue.setMonth(installmentDue.getMonth() + (i * 3));
            break;
          case 'W':
          case 'WEEKLY':
            installmentDue.setDate(installmentDue.getDate() + (i * 7));
            break;
          case 'D':
          case 'DAILY':
            installmentDue.setDate(installmentDue.getDate() + i);
            break;
          case 'Y':
          case 'YEARLY':
            installmentDue.setFullYear(installmentDue.getFullYear() + i);
            break;
          default:
            // Default to monthly
            installmentDue.setMonth(installmentDue.getMonth() + i);
        }

        schedule.push({
          installmentNo: i,
          dueDate: new Date(installmentDue),
          principalAmount: principalPerInstallment,
          interestAmount: interestPerInstallment,
          totalAmountDue: principalPerInstallment + interestPerInstallment,
          status: 'PENDING',
          paidAmount: 0,
          paymentDate: null
        });
      }

      this.REPAYMENT_SCHEDULE = schedule;
    }

    // Ensure status is uppercase
    if (this.STATUS) {
      this.STATUS = this.STATUS.toUpperCase();
    }

    // Ensure interest configuration fields are uppercase
    if (this.INTEREST_CONFIGURATION) {
      if (this.INTEREST_CONFIGURATION.INTEREST_TYPE) {
        this.INTEREST_CONFIGURATION.INTEREST_TYPE = this.INTEREST_CONFIGURATION.INTEREST_TYPE.toUpperCase();
      }
      if (this.INTEREST_CONFIGURATION.CALCULATION_METHOD) {
        this.INTEREST_CONFIGURATION.CALCULATION_METHOD = this.INTEREST_CONFIGURATION.CALCULATION_METHOD.toUpperCase();
      }
    }

    // Generate transaction reference if not provided
    if (!this.TRANSACTION_REFERENCE && this.isNew) {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      this.TRANSACTION_REFERENCE = `DISB-${timestamp}-${random}`;
    }

    // Set approval/execution dates based on status changes
    if (this.isModified('STATUS')) {
      const now = new Date();

      if (this.STATUS === 'APPROVED' && !this.APPROVAL_DATE) {
        this.APPROVAL_DATE = now;
      }

      if ((this.STATUS === 'EXECUTED' || this.STATUS === 'DISBURSED') && !this.EXECUTION_DATE) {
        this.EXECUTION_DATE = now;
        this.DISBURSEMENT_DATE = now;
      }
    }

    next();
  } catch (err) {
    logger.error('Error in loan disbursement pre-save hook:', {
      error: err.message,
      stack: err.stack,
      APPL_ID: this.APPL_ID,
      ACCT_NO: this.ACCT_NO,
      LOAN_ACCOUNT_ID: this.LOAN_ACCOUNT_ID
    });
    next(err);
  }
});

// Instance methods (keep your existing instance methods)
loanDisbursementSchema.methods.markAsExecuted = function(executedBy, transactionRef, notes = null) {
  this.STATUS = 'EXECUTED';
  this.EXECUTED_BY = executedBy;
  this.EXECUTION_DATE = new Date();
  this.DISBURSEMENT_DATE = new Date();
  this.TRANSACTION_REFERENCE = transactionRef;
  this.TRANSACTION_NOTES = notes;
  return this.save();
};

loanDisbursementSchema.methods.markAsDisbursed = function(disbursedBy, transactionRef, notes = null) {
  this.STATUS = 'DISBURSED';
  this.DISBURSED_BY = disbursedBy;
  this.EXECUTED_BY = disbursedBy;
  this.EXECUTION_DATE = new Date();
  this.DISBURSEMENT_DATE = new Date();
  this.TRANSACTION_REFERENCE = transactionRef;
  this.TRANSACTION_NOTES = notes;
  return this.save();
};

loanDisbursementSchema.methods.markAsApproved = function(approvedBy) {
  this.STATUS = 'APPROVED';
  this.APPROVED_BY = approvedBy;
  this.APPROVAL_DATE = new Date();
  return this.save();
};

loanDisbursementSchema.methods.markAsFailed = function(reason, notes = null) {
  this.STATUS = 'FAILED';
  this.FAILURE_REASON = reason;
  this.TRANSACTION_NOTES = notes;
  return this.save();
};

loanDisbursementSchema.methods.markAsCancelled = function(reason, cancelledBy = null) {
  this.STATUS = 'CANCELLED';
  this.CANCELLATION_REASON = reason;
  this.DISBURSED_BY = cancelledBy;
  return this.save();
};

loanDisbursementSchema.methods.getNextInstallment = function() {
  if (!this.REPAYMENT_SCHEDULE || !Array.isArray(this.REPAYMENT_SCHEDULE)) {
    return null;
  }

  const today = new Date();
  return this.REPAYMENT_SCHEDULE.find(item =>
    item.status === 'PENDING' &&
    new Date(item.dueDate) > today
  ) || this.REPAYMENT_SCHEDULE[0] || null;
};

loanDisbursementSchema.methods.getTotalFees = function() {
  try {
    const fees = this.FEES_AMOUNT ? parseFloat(this.FEES_AMOUNT.toString()) : 0;
    const upfrontInterest = this.UPFRONT_INTEREST_AMOUNT ?
      parseFloat(this.UPFRONT_INTEREST_AMOUNT.toString()) : 0;
    return fees + upfrontInterest;
  } catch (error) {
    return 0;
  }
};

// Static methods (keep your existing static methods)
loanDisbursementSchema.statics.findByCustomerId = async function(customerId, status = null) {
  try {
    const query = { CUST_ID: customerId };
    if (status) {
      query.STATUS = status.toUpperCase();
    }
    return await this.find(query)
      .populate('LOAN_ACCOUNT_ID', 'accountNumber loanType')
      .sort({ DISBURSEMENT_DATE: -1 });
  } catch (error) {
    logger.error('Error finding disbursements by customer:', {
      error: error.message,
      customerId
    });
    throw error;
  }
};

loanDisbursementSchema.statics.findByAccountNumber = async function(accountNumber, status = null) {
  try {
    const query = { ACCT_NO: accountNumber };
    if (status) {
      query.STATUS = status.toUpperCase();
    }
    return await this.find(query)
      .populate('LOAN_ACCOUNT_ID', 'accountNumber loanType')
      .sort({ DISBURSEMENT_DATE: -1 });
  } catch (error) {
    logger.error('Error finding disbursements by account:', {
      error: error.message,
      accountNumber
    });
    throw error;
  }
};

loanDisbursementSchema.statics.findByLoanAccountId = async function(loanAccountId) {
  try {
    return await this.find({ LOAN_ACCOUNT_ID: loanAccountId })
      .sort({ created_at: -1 });
  } catch (error) {
    logger.error('Error finding disbursements by loan account:', {
      error: error.message,
      loanAccountId
    });
    throw error;
  }
};

loanDisbursementSchema.statics.updateStatus = async function(applId, newStatus, options = {}) {
  try {
    const updateData = {
      STATUS: newStatus.toUpperCase(),
      ...options
    };

    // Add timestamps based on status
    const now = new Date();
    if (newStatus.toUpperCase() === 'APPROVED' && !options.APPROVAL_DATE) {
      updateData.APPROVAL_DATE = now;
    }

    if ((newStatus.toUpperCase() === 'EXECUTED' || newStatus.toUpperCase() === 'DISBURSED') &&
        !options.EXECUTION_DATE) {
      updateData.EXECUTION_DATE = now;
      updateData.DISBURSEMENT_DATE = now;
    }

    return await this.findOneAndUpdate(
      { APPL_ID: applId },
      updateData,
      { new: true, runValidators: true }
    );
  } catch (error) {
    logger.error('Error updating disbursement status:', {
      error: error.message,
      applId,
      newStatus
    });
    throw error;
  }
};

loanDisbursementSchema.statics.getPendingDisbursements = async function() {
  try {
    return await this.find({
      STATUS: { $in: ['APPROVED', 'PENDING'] }
    })
    .populate('LOAN_ACCOUNT_ID', 'accountNumber customerName')
    .sort({ APPROVAL_DATE: 1, created_at: 1 });
  } catch (error) {
    logger.error('Error fetching pending disbursements:', {
      error: error.message
    });
    throw error;
  }
};

// Virtual fields
loanDisbursementSchema.virtual('formattedAmount').get(function() {
  try {
    const amount = this.AMOUNT ? parseFloat(this.AMOUNT.toString()) : 0;
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(amount);
  } catch (error) {
    return '₦0.00';
  }
});

loanDisbursementSchema.virtual('formattedNetAmount').get(function() {
  try {
    const netAmount = this.NET_DISBURSEMENT_AMOUNT ?
      parseFloat(this.NET_DISBURSEMENT_AMOUNT.toString()) : 0;
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN'
    }).format(netAmount);
  } catch (error) {
    return '₦0.00';
  }
});

loanDisbursementSchema.virtual('isDisbursable').get(function() {
  return this.STATUS === 'APPROVED';
});

loanDisbursementSchema.virtual('isExecutable').get(function() {
  return this.STATUS === 'APPROVED';
});

loanDisbursementSchema.virtual('totalInterest').get(function() {
  try {
    const principal = this.AMOUNT ? parseFloat(this.AMOUNT.toString()) : 0;
    const fees = this.FEES_AMOUNT ? parseFloat(this.FEES_AMOUNT.toString()) : 0;
    const netPrincipal = principal - fees;
    const rate = this.INTEREST_RATE ? parseFloat(this.INTEREST_RATE.toString()) / 100 : 0;
    return netPrincipal * rate;
  } catch (error) {
    return 0;
  }
});

const LoanDisbursement = mongoose.models.LoanDisbursement ||
  mongoose.model('LoanDisbursement', loanDisbursementSchema);

export default LoanDisbursement;