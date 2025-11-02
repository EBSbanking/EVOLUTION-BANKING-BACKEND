// models/GroupSavings.js - UPDATED WITH CORRECT BALANCE FIELDS
import mongoose from 'mongoose';

const groupSavingsSchema = new mongoose.Schema({
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  groupCode: {
    type: String,
    required: true
  },
  groupName: {
    type: String,
    required: true
  },
  savingsType: {
    type: String,
    enum: ['union_purse', 'emergency_fund', 'project_fund', 'general_savings'],
    default: 'union_purse'
  },
  accountNumber: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function(v) {
        return /^\d{10}$/.test(v); // Ensure 10-digit account number
      },
      message: 'Account number must be a 10-digit number'
    }
  },
  targetAmount: {
    type: Number,
    default: 0
  },
  // CORRECT BALANCE FIELDS - ADDED
  LEDGER_BAL: {
    type: mongoose.Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00'),
    get: (v) => parseFloat(v.toString())
  },
  CLEARED_BAL: {
    type: mongoose.Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00'),
    get: (v) => parseFloat(v.toString())
  },
  AVAILABLE_BALANCE: {
    type: mongoose.Schema.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00'),
    get: (v) => parseFloat(v.toString())
  },
  // Keep currentBalance for backward compatibility
  currentBalance: {
    type: Number,
    default: 0
  },
  minimumContribution: {
    type: Number,
    default: 0
  },
  contributionFrequency: {
    type: String,
    enum: ['weekly', 'monthly', 'quarterly', 'custom'],
    default: 'monthly'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  managedBy: [{
    type: String, // CUST_ID of group members who can manage
    required: true
  }],
  withdrawalRules: {
    minWithdrawal: {
      type: Number,
      default: 0
    },
    maxWithdrawal: {
      type: Number,
      default: 0 // 0 means no limit
    },
    approvalRequired: {
      type: Boolean,
      default: true
    },
    minApprovers: {
      type: Number,
      default: 1
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { getters: true }, // Ensure getters are applied when converting to JSON
  toObject: { getters: true } // Ensure getters are applied when converting to objects
});

// Pre-save middleware to sync currentBalance with AVAILABLE_BALANCE
groupSavingsSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Sync currentBalance with AVAILABLE_BALANCE for backward compatibility
  if (this.AVAILABLE_BALANCE && this.isModified('AVAILABLE_BALANCE')) {
    this.currentBalance = parseFloat(this.AVAILABLE_BALANCE.toString());
  }
  
  // Initialize balance fields if they don't exist
  if (!this.LEDGER_BAL) {
    this.LEDGER_BAL = mongoose.Types.Decimal128.fromString((this.currentBalance || 0).toFixed(2));
  }
  if (!this.CLEARED_BAL) {
    this.CLEARED_BAL = mongoose.Types.Decimal128.fromString((this.currentBalance || 0).toFixed(2));
  }
  if (!this.AVAILABLE_BALANCE) {
    this.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString((this.currentBalance || 0).toFixed(2));
  }
  
  next();
});

// Static method to initialize balance fields for existing documents
groupSavingsSchema.statics.initializeBalances = async function() {
  const docs = await this.find({
    $or: [
      { LEDGER_BAL: { $exists: false } },
      { CLEARED_BAL: { $exists: false } },
      { AVAILABLE_BALANCE: { $exists: false } }
    ]
  });
  
  for (const doc of docs) {
    const balance = doc.currentBalance || 0;
    doc.LEDGER_BAL = mongoose.Types.Decimal128.fromString(balance.toFixed(2));
    doc.CLEARED_BAL = mongoose.Types.Decimal128.fromString(balance.toFixed(2));
    doc.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(balance.toFixed(2));
    await doc.save();
  }
  
  return docs.length;
};

// Virtual for formatted balance display
groupSavingsSchema.virtual('formattedBalances').get(function() {
  return {
    ledgerBalance: parseFloat(this.LEDGER_BAL.toString()),
    clearedBalance: parseFloat(this.CLEARED_BAL.toString()),
    availableBalance: parseFloat(this.AVAILABLE_BALANCE.toString()),
    currentBalance: this.currentBalance
  };
});

// Index for efficient queries
groupSavingsSchema.index({ groupCode: 1, savingsType: 1 });
groupSavingsSchema.index({ accountNumber: 1 });
groupSavingsSchema.index({ isActive: 1 });
groupSavingsSchema.index({ 'managedBy': 1 });

export default mongoose.model('GroupSavings', groupSavingsSchema);