// models/GroupSavings.js - FIXED VERSION
import mongoose from 'mongoose';

// SAFE UTILITY FUNCTIONS FOR THE MODEL
const safeDecimalToString = (value, defaultValue = '0.00') => {
  if (!value) return defaultValue;
  try {
    if (typeof value === 'object' && value.toString) {
      return value.toString();
    }
    return String(value || defaultValue);
  } catch (error) {
    return defaultValue;
  }
};

const safeParseFloat = (value, defaultValue = 0) => {
  if (!value) return defaultValue;
  try {
    if (typeof value === 'object' && value.toString) {
      return parseFloat(value.toString()) || defaultValue;
    }
    return parseFloat(value) || defaultValue;
  } catch (error) {
    return defaultValue;
  }
};

const groupSavingsSchema = new mongoose.Schema({
  // ✅ GROUP IDENTIFICATION
  group: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true
  },
  groupCode: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  groupName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  // ✅ SAVINGS CONFIGURATION
  savingsType: {
    type: String,
    enum: ['union_purse', 'emergency_fund', 'project_fund', 'general_savings', 'project_savings'],
    default: 'union_purse',
    required: true
  },
  
  // ✅ ACCOUNT INFORMATION
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
  
  // ✅ FINANCIAL FIELDS - WITH SAFE DEFAULTS
  targetAmount: {
    type: mongoose.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString("0.00"),
    get: function(v) {
      return safeParseFloat(v, 0);
    }
  },
  minimumContribution: {
    type: mongoose.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString("0.00"),
    get: function(v) {
      return safeParseFloat(v, 0);
    }
  },
  
  // ✅ BALANCE FIELDS - COMPREHENSIVE WITH SAFE HANDLING
  LEDGER_BAL: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00'),
    get: function(v) {
      return safeParseFloat(v, 0);
    }
  },
  CLEARED_BAL: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00'),
    get: function(v) {
      return safeParseFloat(v, 0);
    }
  },
  AVAILABLE_BALANCE: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00'),
    get: function(v) {
      return safeParseFloat(v, 0);
    }
  },
  // Backward compatibility field
  currentBalance: {
    type: Number,
    default: 0,
    get: function(v) {
      return safeParseFloat(v, 0);
    }
  },
  
  // ✅ CONTRIBUTION SETTINGS
  contributionFrequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'quarterly', 'custom'],
    required: true,
    default: 'monthly'
  },
  nextContributionDate: {
    type: Date,
    default: function() {
      const now = new Date();
      const freq = this.contributionFrequency || 'monthly';
      let futureDate = new Date(now);
      switch (freq) {
        case 'daily': 
          futureDate.setDate(now.getDate() + 1);
          break;
        case 'weekly': 
          futureDate.setDate(now.getDate() + 7);
          break;
        case 'monthly': 
          futureDate.setMonth(now.getMonth() + 1);
          break;
        case 'quarterly': 
          futureDate.setMonth(now.getMonth() + 3);
          break;
        default: 
          futureDate.setMonth(now.getMonth() + 1);
      }
      return futureDate;
    }
  },
  
  // ✅ MANAGEMENT & ACCESS CONTROL
  managedBy: {
    type: [String],
    required: [true, 'At least one manager is required'],
    validate: [
      {
        validator: function(v) {
          return v && Array.isArray(v) && v.length >= 1 && v.length <= 50;
        },
        message: 'ManagedBy must have 1-50 managers'
      },
      {
        validator: function(v) {
          return v.every(id => /^\d{10}$/.test(id));
        },
        message: 'All manager IDs must be 10-digit numbers'
      }
    ]
  },
  members: {
    type: [String],
    required: [true, 'At least one member is required'],
    validate: [
      {
        validator: function(v) {
          return v && Array.isArray(v) && v.length >= 1 && v.length <= 100;
        },
        message: 'Members must have 1-100 members'
      },
      {
        validator: function(v) {
          return v.every(id => /^\d{10}$/.test(id));
        },
        message: 'All member IDs must be 10-digit numbers'
      }
    ]
  },
  
  // ✅ WITHDRAWAL RULES
  withdrawalRules: {
    minWithdrawal: {
      type: mongoose.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
      get: function(v) {
        return safeParseFloat(v, 0);
      }
    },
    maxWithdrawal: {
      type: mongoose.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'),
      get: function(v) {
        return safeParseFloat(v, 0);
      }
    },
    approvalRequired: {
      type: Boolean,
      default: true
    },
    minApprovers: {
      type: Number,
      default: 1,
      min: 1
    },
    withdrawalFrequency: {
      type: String,
      enum: ['anytime', 'weekly', 'monthly', 'quarterly'],
      default: 'anytime'
    }
  },
  
  // ✅ PRODUCT LINKING (OPTIONAL)
  linkedProductId: {
    type: Number,
    ref: 'SavingsProduct',
    validate: {
      validator: function(v) {
        return v === undefined || (Number.isInteger(v) && v > 0);
      },
      message: 'linkedProductId must be a positive integer or omitted'
    }
  },
  linkedProductCode: {
    type: String,
    trim: true
  },
  
  // ✅ STATUS & AUDIT FIELDS
  status: {
    type: String,
    enum: ['active', 'inactive', 'closed', 'suspended'],
    default: 'active',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  
  // ✅ AUDIT FIELDS
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
  },
  closedAt: {
    type: Date
  },
  closedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  closureReason: {
    type: String,
    trim: true
  }

}, {
  timestamps: true,
  toJSON: { 
    getters: true,
    virtuals: true,
    transform: function(doc, ret) {
      // Apply safe transformation to prevent virtual field errors
      return applySafeTransformation(ret);
    }
  },
  toObject: { 
    getters: true,
    virtuals: true,
    transform: function(doc, ret) {
      // Apply safe transformation to prevent virtual field errors
      return applySafeTransformation(ret);
    }
  }
});

// ✅ SAFE TRANSFORMATION FUNCTION
function applySafeTransformation(ret) {
  try {
    // Ensure all balance fields have safe values
    const balanceFields = [
      'targetAmount', 'minimumContribution', 'LEDGER_BAL', 
      'CLEARED_BAL', 'AVAILABLE_BALANCE', 'currentBalance'
    ];
    
    balanceFields.forEach(field => {
      if (ret[field] === undefined || ret[field] === null) {
        ret[field] = 0;
      } else if (typeof ret[field] === 'object') {
        try {
          ret[field] = safeParseFloat(ret[field]);
        } catch (error) {
          ret[field] = 0;
        }
      }
    });
    
    // Handle withdrawal rules
    if (ret.withdrawalRules) {
      ['minWithdrawal', 'maxWithdrawal'].forEach(field => {
        if (ret.withdrawalRules[field] === undefined || ret.withdrawalRules[field] === null) {
          ret.withdrawalRules[field] = 0;
        } else if (typeof ret.withdrawalRules[field] === 'object') {
          try {
            ret.withdrawalRules[field] = safeParseFloat(ret.withdrawalRules[field]);
          } catch (error) {
            ret.withdrawalRules[field] = 0;
          }
        }
      });
    }
    
    // Ensure virtual fields have safe defaults
    if (ret.ledgerBalanceVirtual === undefined || ret.ledgerBalanceVirtual === null) {
      ret.ledgerBalanceVirtual = '0.00';
    }
    if (ret.availableBalanceVirtual === undefined || ret.availableBalanceVirtual === null) {
      ret.availableBalanceVirtual = '0.00';
    }
    
  } catch (error) {
    console.error('Error in safe transformation:', error);
    // Ensure critical fields have defaults
    ret.LEDGER_BAL = 0;
    ret.AVAILABLE_BALANCE = 0;
    ret.currentBalance = 0;
  }
  
  return ret;
}

// ✅ PRE-SAVE MIDDLEWARE WITH ENHANCED SAFETY
groupSavingsSchema.pre('save', function(next) {
  try {
    // Sync status with isActive
    if (this.status === 'active') {
      this.isActive = true;
    } else if (['inactive', 'closed', 'suspended'].includes(this.status)) {
      this.isActive = false;
    }
    
    // SAFE BALANCE INITIALIZATION
    const currentBal = safeParseFloat(this.currentBalance, 0);
    const defaultBalance = currentBal.toFixed(2);
    
    // Initialize balance fields safely
    if (!this.LEDGER_BAL || this.isModified('currentBalance')) {
      try {
        this.LEDGER_BAL = mongoose.Types.Decimal128.fromString(defaultBalance);
      } catch (error) {
        this.LEDGER_BAL = mongoose.Types.Decimal128.fromString('0.00');
      }
    }
    
    if (!this.CLEARED_BAL || this.isModified('currentBalance')) {
      try {
        this.CLEARED_BAL = mongoose.Types.Decimal128.fromString(defaultBalance);
      } catch (error) {
        this.CLEARED_BAL = mongoose.Types.Decimal128.fromString('0.00');
      }
    }
    
    if (!this.AVAILABLE_BALANCE || this.isModified('currentBalance')) {
      try {
        this.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(defaultBalance);
      } catch (error) {
        this.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString('0.00');
      }
    }
    
    // Sync currentBalance with AVAILABLE_BALANCE for backward compatibility
    if (this.AVAILABLE_BALANCE && this.isModified('AVAILABLE_BALANCE')) {
      try {
        this.currentBalance = safeParseFloat(this.AVAILABLE_BALANCE);
      } catch (error) {
        this.currentBalance = 0;
      }
    }
    
    // Set closure timestamp if status changed to closed
    if (this.isModified('status') && this.status === 'closed' && !this.closedAt) {
      this.closedAt = new Date();
    }
    
    // Deduplicate arrays
    if (this.managedBy) {
      this.managedBy = [...new Set(this.managedBy)];
    }
    if (this.members) {
      this.members = [...new Set(this.members)];
    }
    
    // Generate accountNumber if not provided
    if (!this.accountNumber) {
      this.accountNumber = `GS${Date.now() % 1000000000}`.padStart(10, '0').slice(-10);
    }
    
    next();
  } catch (error) {
    console.error('Error in pre-save middleware:', error);
    // Ensure we don't block the save operation
    next();
  }
});

// ✅ STATIC METHODS WITH ERROR HANDLING
groupSavingsSchema.statics.initializeBalances = async function() {
  try {
    const docs = await this.find({
      $or: [
        { LEDGER_BAL: { $exists: false } },
        { CLEARED_BAL: { $exists: false } },
        { AVAILABLE_BALANCE: { $exists: false } }
      ]
    });
    
    for (const doc of docs) {
      try {
        const balance = safeParseFloat(doc.currentBalance, 0);
        doc.LEDGER_BAL = mongoose.Types.Decimal128.fromString(balance.toFixed(2));
        doc.CLEARED_BAL = mongoose.Types.Decimal128.fromString(balance.toFixed(2));
        doc.AVAILABLE_BALANCE = mongoose.Types.Decimal128.fromString(balance.toFixed(2));
        await doc.save();
      } catch (docError) {
        console.error(`Error initializing balances for doc ${doc._id}:`, docError);
        continue;
      }
    }
    
    return docs.length;
  } catch (error) {
    console.error('Error in initializeBalances:', error);
    return 0;
  }
};

groupSavingsSchema.statics.findByGroupCode = function(groupCode) {
  return this.findOne({ groupCode, status: 'active' });
};

groupSavingsSchema.statics.findActiveSavings = function() {
  return this.find({ status: 'active' });
};

groupSavingsSchema.statics.findBySavingsType = function(savingsType) {
  return this.find({ savingsType, status: 'active' });
};

// ✅ INSTANCE METHODS WITH SAFE HANDLING
groupSavingsSchema.methods.updateBalance = async function(amount, balanceType = 'AVAILABLE_BALANCE') {
  try {
    const currentBalance = safeParseFloat(this[balanceType], 0);
    const newBalance = currentBalance + safeParseFloat(amount, 0);
    
    this[balanceType] = mongoose.Types.Decimal128.fromString(newBalance.toFixed(2));
    
    // Sync all balances if updating available balance
    if (balanceType === 'AVAILABLE_BALANCE') {
      this.LEDGER_BAL = mongoose.Types.Decimal128.fromString(newBalance.toFixed(2));
      this.CLEARED_BAL = mongoose.Types.Decimal128.fromString(newBalance.toFixed(2));
      this.currentBalance = newBalance;
    }
    
    return await this.save();
  } catch (error) {
    console.error('Error in updateBalance:', error);
    throw new Error(`Failed to update balance: ${error.message}`);
  }
};

groupSavingsSchema.methods.canWithdraw = function(amount) {
  try {
    const availableBalance = safeParseFloat(this.AVAILABLE_BALANCE, 0);
    const minWithdrawal = safeParseFloat(this.withdrawalRules?.minWithdrawal, 0);
    const maxWithdrawal = safeParseFloat(this.withdrawalRules?.maxWithdrawal, 0);
    
    if (amount > availableBalance) return false;
    if (minWithdrawal > 0 && amount < minWithdrawal) return false;
    if (maxWithdrawal > 0 && amount > maxWithdrawal) return false;
    
    return true;
  } catch (error) {
    console.error('Error in canWithdraw:', error);
    return false;
  }
};

groupSavingsSchema.methods.closeAccount = async function(userId, reason = '') {
  try {
    this.status = 'closed';
    this.closedAt = new Date();
    this.closedBy = userId;
    this.closureReason = reason;
    this.isActive = false;
    return await this.save();
  } catch (error) {
    console.error('Error in closeAccount:', error);
    throw new Error(`Failed to close account: ${error.message}`);
  }
};

groupSavingsSchema.methods.getSafeBalance = function() {
  return {
    ledgerBalance: safeParseFloat(this.LEDGER_BAL, 0),
    clearedBalance: safeParseFloat(this.CLEARED_BAL, 0),
    availableBalance: safeParseFloat(this.AVAILABLE_BALANCE, 0),
    currentBalance: safeParseFloat(this.currentBalance, 0)
  };
};

// ✅ VIRTUAL FIELDS WITH SAFE HANDLING
groupSavingsSchema.virtual('ledgerBalanceVirtual').get(function() {
  try {
    if (!this.LEDGER_BAL) return '0.00';
    
    if (typeof this.LEDGER_BAL.toString === 'function') {
      return this.LEDGER_BAL.toString();
    }
    
    return String(safeParseFloat(this.LEDGER_BAL, 0).toFixed(2));
  } catch (error) {
    console.error('Error in ledgerBalanceVirtual:', error);
    return '0.00';
  }
});

groupSavingsSchema.virtual('availableBalanceVirtual').get(function() {
  try {
    if (!this.AVAILABLE_BALANCE) return '0.00';
    
    if (typeof this.AVAILABLE_BALANCE.toString === 'function') {
      return this.AVAILABLE_BALANCE.toString();
    }
    
    return String(safeParseFloat(this.AVAILABLE_BALANCE, 0).toFixed(2));
  } catch (error) {
    console.error('Error in availableBalanceVirtual:', error);
    return '0.00';
  }
});

groupSavingsSchema.virtual('formattedBalances').get(function() {
  return {
    ledgerBalance: safeParseFloat(this.LEDGER_BAL, 0),
    clearedBalance: safeParseFloat(this.CLEARED_BAL, 0),
    availableBalance: safeParseFloat(this.AVAILABLE_BALANCE, 0),
    currentBalance: safeParseFloat(this.currentBalance, 0)
  };
});

groupSavingsSchema.virtual('progressToTarget').get(function() {
  try {
    const currentBalance = safeParseFloat(this.AVAILABLE_BALANCE, 0);
    const target = safeParseFloat(this.targetAmount, 0);
    return target > 0 ? (currentBalance / target) * 100 : 0;
  } catch (error) {
    console.error('Error in progressToTarget:', error);
    return 0;
  }
});

groupSavingsSchema.virtual('isTargetAchieved').get(function() {
  try {
    const currentBalance = safeParseFloat(this.AVAILABLE_BALANCE, 0);
    const target = safeParseFloat(this.targetAmount, 0);
    return currentBalance >= target;
  } catch (error) {
    console.error('Error in isTargetAchieved:', error);
    return false;
  }
});

// ✅ INDEXES FOR PERFORMANCE
groupSavingsSchema.index({ groupCode: 1 });
groupSavingsSchema.index({ accountNumber: 1 }, { unique: true });
groupSavingsSchema.index({ status: 1 });
groupSavingsSchema.index({ savingsType: 1 });
groupSavingsSchema.index({ 'managedBy': 1 });
groupSavingsSchema.index({ 'members': 1 });
groupSavingsSchema.index({ createdAt: -1 });
groupSavingsSchema.index({ group: 1, savingsType: 1 });

// Clear any existing model and create new one
if (mongoose.models.GroupSavings) {
  delete mongoose.models.GroupSavings;
}

const GroupSavings = mongoose.model('GroupSavings', groupSavingsSchema);
export default GroupSavings;