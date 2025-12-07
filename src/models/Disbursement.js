import mongoose from 'mongoose';
import logger from '../utils/logger.js';

// Loan Disbursement schema
const loanDisbursementSchema = new mongoose.Schema({
  APPL_ID: { 
    type: String, 
    unique: true, 
    required: true,
    trim: true 
  },
  CUST_ID: { 
    type: Number, 
    required: true,
    index: true 
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
  TERM_CD: { 
    type: String, 
    required: true,
    enum: ['monthly', 'quarterly', 'M', 'Q', 'W', 'D', 'Y', 'MONTHLY', 'QUARTERLY', 'WEEKLY', 'DAILY', 'YEARLY'],
    uppercase: true
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
    enum: ['PENDING', 'APPROVED', 'DISBURSED', 'REJECTED', 'FAILED', 'CANCELLED'],
    uppercase: true
  },
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
  DISBURSEMENT_METHOD: {
    type: String,
    enum: ['CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE'],
    default: 'BANK_TRANSFER'
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
  }
}, {
  timestamps: true,
  toJSON: {
    getters: true,
    transform: function(doc, ret) {
      // Convert Decimal128 fields to numbers
      if (ret.AMOUNT && typeof ret.AMOUNT === 'object') {
        try {
          ret.AMOUNT = parseFloat(ret.AMOUNT.toString());
        } catch (error) {
          ret.AMOUNT = 0;
        }
      }
      
      if (ret.INTEREST_RATE && typeof ret.INTEREST_RATE === 'object') {
        try {
          ret.INTEREST_RATE = parseFloat(ret.INTEREST_RATE.toString());
        } catch (error) {
          ret.INTEREST_RATE = 0;
        }
      }
      
      // Format dates
      if (ret.DISBURSEMENT_DATE) {
        ret.DISBURSEMENT_DATE = ret.DISBURSEMENT_DATE.toISOString();
      }
      
      if (ret.REPAYMENT_SCHEDULE && Array.isArray(ret.REPAYMENT_SCHEDULE)) {
        ret.REPAYMENT_SCHEDULE = ret.REPAYMENT_SCHEDULE.map(item => ({
          ...item,
          dueDate: item.dueDate ? item.dueDate.toISOString() : null
        }));
      }
      
      return ret;
    }
  }
});

// Indexes for better query performance
loanDisbursementSchema.index({ CUST_ID: 1, STATUS: 1 });
loanDisbursementSchema.index({ DISBURSEMENT_DATE: -1 });
loanDisbursementSchema.index({ APPL_ID: 1 }, { unique: true });
loanDisbursementSchema.index({ ACCT_NO: 1, STATUS: 1 });

// Middleware to generate repayment schedule
loanDisbursementSchema.pre('save', async function (next) {
  try {
    if (this.isNew || this.isModified('TERM_CD') || this.isModified('TERM_VALUE') || this.isModified('DISBURSEMENT_DATE')) {
      const schedule = [];
      const due = new Date(this.DISBURSEMENT_DATE || new Date());
      
      // Convert term code to standard format
      const termCode = this.TERM_CD.toUpperCase();
      
      for (let i = 1; i <= this.TERM_VALUE; i++) {
        const installmentDue = new Date(due);
        
        switch (termCode) {
          case 'M':
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
          amountDue: this.AMOUNT ? parseFloat(this.AMOUNT.toString()) / this.TERM_VALUE : 0,
          status: 'PENDING'
        });
      }
      
      this.REPAYMENT_SCHEDULE = schedule;
    }
    
    // Ensure status is uppercase
    if (this.STATUS) {
      this.STATUS = this.STATUS.toUpperCase();
    }
    
    // Generate transaction reference if not provided
    if (!this.TRANSACTION_REFERENCE && this.isNew) {
      const timestamp = Date.now();
      const random = Math.floor(Math.random() * 1000);
      this.TRANSACTION_REFERENCE = `DISB-${timestamp}-${random}`;
    }
    
    next();
  } catch (err) {
    logger.error('Error in loan disbursement pre-save hook:', {
      error: err.message,
      stack: err.stack,
      APPL_ID: this.APPL_ID,
      ACCT_NO: this.ACCT_NO
    });
    next(err);
  }
});

// Instance methods
loanDisbursementSchema.methods.markAsDisbursed = function(transactionRef, disbursedBy = null) {
  this.STATUS = 'DISBURSED';
  this.TRANSACTION_REFERENCE = transactionRef;
  this.DISBURSED_BY = disbursedBy;
  this.DISBURSEMENT_DATE = new Date();
  return this.save();
};

loanDisbursementSchema.methods.markAsFailed = function(reason) {
  this.STATUS = 'FAILED';
  this.FAILURE_REASON = reason;
  return this.save();
};

loanDisbursementSchema.methods.markAsCancelled = function(reason) {
  this.STATUS = 'CANCELLED';
  this.CANCELLATION_REASON = reason;
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

// Static methods
loanDisbursementSchema.statics.findByCustomerId = async function(customerId, status = null) {
  try {
    const query = { CUST_ID: customerId };
    if (status) {
      query.STATUS = status.toUpperCase();
    }
    return await this.find(query).sort({ DISBURSEMENT_DATE: -1 });
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
    return await this.find(query).sort({ DISBURSEMENT_DATE: -1 });
  } catch (error) {
    logger.error('Error finding disbursements by account:', {
      error: error.message,
      accountNumber
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

// Virtual field
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

loanDisbursementSchema.virtual('isDisbursable').get(function() {
  return this.STATUS === 'APPROVED';
});

const LoanDisbursement = mongoose.models.LoanDisbursement || 
  mongoose.model('LoanDisbursement', loanDisbursementSchema);

export default LoanDisbursement;