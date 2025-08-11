import mongoose from 'mongoose';
import { generateAccountNumber, generateAccountId } from '../utils/accountHelper.js';
import logger from '../utils/logger.js';

const customerAccountSchema = new mongoose.Schema(
  {
    // Core Account Information
    CUST_ID: {
      type: Number,
      required: true,
      index: true
    },
    ACCT_ID: {
      type: Number,
      unique: true,
      validate: {
        validator: function(v) {
          return v.toString().length === 6;
        },
        message: 'ACCT_ID must be exactly 6 digits'
      }
    },
    ACCT_NO: {
      type: String,
      unique: true, 
      trim: true,
      validate: {
        validator: function(v) {
          return /^100\d{7}$/.test(v);
        },
        message: props => `${props.value} is not a valid savings account number! Must match /^100\\d{7}$/`
      }
    },
    ACCT_NM: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    BU_ID: {
      type: String,
      required: true
    },

    // Financial Fields
    LEDGER_BAL: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00'),
      min: 0
    },
    CLEARED_BAL: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00'),
      min: 0
    },
    AVAILABLE_BALANCE: {
      type: mongoose.Schema.Types.Decimal128,
      required: true,
      get: v => v ? parseFloat(v.toString()) : 0,
      default: mongoose.Types.Decimal128.fromString('0.00'),
      min: 0
    },

    // Account Type Information
    ACCOUNT_TYPE: {
      type: String,
      required: true,
      enum: ['SAVINGS', 'CURRENT', 'FIXED_DEPOSIT', 'LOAN', 'CREDIT_CARD'],
      uppercase: true
    },
    PRODUCT_DESC: {
      type: String,
      required: true,
      trim: true
    },

    // Status Fields
    REC_ST: {
      type: String,
      enum: ['ACTIVE', 'DORMANT', 'SUSPENDED', 'CLOSED', 'INACTIVE'],
      default: 'ACTIVE',
      uppercase: true,
      required: true
    },

    // Activity Tracking
    lastActivityDate: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true,
    toJSON: {
      getters: true,
      virtuals: true,
      transform: function(doc, ret) {
        const decimalFields = ['LEDGER_BAL', 'CLEARED_BAL', 'AVAILABLE_BALANCE'];
        decimalFields.forEach(field => {
          if (ret[field] && typeof ret[field] === 'object') {
            ret[field] = parseFloat(ret[field].toString());
          }
        });
        if (ret._id) ret._id = ret._id.toString();
        if (ret.ACCT_ID) ret.ACCT_ID = ret.ACCT_ID.toString().padStart(6, '0');
        return ret;
      }
    },
    toObject: { getters: true, virtuals: true },
    id: false
  }
);

// ========== PRE-SAVE HOOK ==========
customerAccountSchema.pre('save', async function(next) {
  try {
    // Normalize REC_ST
    this.REC_ST = (this.REC_ST || 'ACTIVE').toUpperCase();
    if (!this.constructor.schema.path('REC_ST').enumValues.includes(this.REC_ST)) {
      logger.warn(`Invalid status ${this.REC_ST} for account ${this.ACCT_NO}, resetting to ACTIVE`);
      this.REC_ST = 'ACTIVE';
    }

    // Generate ACCT_NO if not present
    if (!this.ACCT_NO) {
      this.ACCT_NO = await generateAccountNumber('ACCT_SAVINGS');
    }

    
   // Generate independent 6-digit ACCT_ID if not present
if (!this.ACCT_ID) {
  this.ACCT_ID = await generateAccountId(); // Already 6-digit guaranteed
}



    // Ensure AVAILABLE_BALANCE ≤ LEDGER_BAL
    if (this.isModified('AVAILABLE_BALANCE') || this.isModified('LEDGER_BAL')) {
      const available = parseFloat(this.AVAILABLE_BALANCE.toString());
      const ledger = parseFloat(this.LEDGER_BAL.toString());

      if (available > ledger) {
        throw new Error('Available balance cannot exceed ledger balance');
      }
    }

    next();
  } catch (err) {
    logger.error('Error in pre-save hook:', {
      error: err.message,
      stack: err.stack,
      account: this.ACCT_NO,
      timestamp: new Date()
    });
    next(err);
  }
});

// POST-SAVE LOGGING
customerAccountSchema.post('save', function(doc, next) {
  logger.info(`Account ${doc.ACCT_NO} was saved`, {
    account: doc.ACCT_NO,
    status: doc.REC_ST,
    balance: parseFloat(doc.LEDGER_BAL.toString()),
    timestamp: new Date()
  });
  next();
});

// VIRTUALS
customerAccountSchema.virtual('isOperational').get(function() {
  return ['ACTIVE', 'PENDING'].includes(this.REC_ST);
});

customerAccountSchema.virtual('isBlocked').get(function() {
  return ['SUSPENDED', 'LOCKED', 'BLOCKED', 'FROZEN'].includes(this.REC_ST);
});

customerAccountSchema.virtual('daysSinceLastActivity').get(function() {
  if (!this.lastActivityDate) return 0;
  return Math.floor((new Date() - this.lastActivityDate) / (1000 * 60 * 60 * 24));
});

// INSTANCE METHODS
customerAccountSchema.methods.hasSufficientBalance = function(amount) {
  return parseFloat(this.AVAILABLE_BALANCE.toString()) >= amount;
};

customerAccountSchema.methods.canWithdraw = function(amount) {
  return this.isOperational && this.hasSufficientBalance(amount);
};

// STATIC METHODS
customerAccountSchema.statics.findDormantAccounts = async function(daysThreshold = 90) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

    return await this.find({
      REC_ST: 'ACTIVE',
      lastActivityDate: { $lt: cutoffDate }
    });
  } catch (error) {
    logger.error('Error finding dormant accounts:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date()
    });
    throw error;
  }
};

customerAccountSchema.statics.markAccountsAsDormant = async function(daysThreshold = 90) {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

    const result = await this.updateMany(
      {
        REC_ST: 'ACTIVE',
        lastActivityDate: { $lt: cutoffDate }
      },
      { $set: { REC_ST: 'DORMANT' } }
    );
    return result;
  } catch (error) {
    logger.error('Error marking accounts as dormant:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date()
    });
    throw error;
  }
};

const CustomerAccount = mongoose.models.CustomerAccount || 
  mongoose.model('CustomerAccount', customerAccountSchema);

export default CustomerAccount;