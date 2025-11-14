// models/GroupSavings.js - CONSOLIDATED MODEL
import mongoose from 'mongoose';

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
  
  // ✅ FINANCIAL FIELDS
  targetAmount: {
    type: mongoose.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString("0.00"),
    get: v => v ? parseFloat(v.toString()) : 0
  },
  minimumContribution: {
    type: mongoose.Types.Decimal128,
    required: true,
    default: mongoose.Types.Decimal128.fromString("0.00"),
    get: v => v ? parseFloat(v.toString()) : 0
  },
  
  // ✅ BALANCE FIELDS - COMPREHENSIVE
  LEDGER_BAL: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00'),
    get: (v) => parseFloat(v.toString())
  },
  CLEARED_BAL: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00'),
    get: (v) => parseFloat(v.toString())
  },
  AVAILABLE_BALANCE: {
    type: mongoose.Types.Decimal128,
    default: mongoose.Types.Decimal128.fromString('0.00'),
    get: (v) => parseFloat(v.toString())
  },
  // Backward compatibility field
  currentBalance: {
    type: Number,
    default: 0
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
      const freq = this.contributionFrequency || 'monthly'; // Fallback to default
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
      get: v => v ? parseFloat(v.toString()) : 0
    },
    maxWithdrawal: {
      type: mongoose.Types.Decimal128,
      default: mongoose.Types.Decimal128.fromString('0.00'), // 0 means no limit
      get: v => v ? parseFloat(v.toString()) : 0
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
  
  // ✅ PRODUCT LINKING (OPTIONAL) - Now with validation to prevent invalid refs
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
  timestamps: true, // This will automatically manage createdAt and updatedAt
  toJSON: { 
    getters: true, // Ensure getters are applied when converting to JSON
    virtuals: true 
  },
  toObject: { 
    getters: true, // Ensure getters are applied when converting to objects
    virtuals: true 
  }
});

// ✅ PRE-SAVE MIDDLEWARE FOR BALANCE SYNCHRONIZATION AND ARRAY DEDUPING
groupSavingsSchema.pre('save', function(next) {
  // Let timestamps: true handle updatedAt automatically
  
  // Sync status with isActive
  if (this.status === 'active') {
    this.isActive = true;
  } else if (['inactive', 'closed', 'suspended'].includes(this.status)) {
    this.isActive = false;
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
  
  // Sync currentBalance with AVAILABLE_BALANCE for backward compatibility
  if (this.AVAILABLE_BALANCE && this.isModified('AVAILABLE_BALANCE')) {
    this.currentBalance = parseFloat(this.AVAILABLE_BALANCE.toString());
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
  
  // Generate accountNumber if not provided (fallback - adjust as needed)
  if (!this.accountNumber) {
    this.accountNumber = `GS${Date.now() % 1000000000}`.slice(-10); // Simple 10-digit gen
    // TODO: Use a proper unique generator (e.g., via counter)
  }
  
  next();
});

// ✅ TRANSFORM FOR JSON OUTPUT
groupSavingsSchema.set('toJSON', {
  transform: function(doc, ret) {
    // Convert Decimal128 to numbers in JSON output
    const decimalFields = [
      'targetAmount', 'minimumContribution', 'LEDGER_BAL', 
      'CLEARED_BAL', 'AVAILABLE_BALANCE'
    ];
    
    decimalFields.forEach(field => {
      if (ret[field] && typeof ret[field] === 'object') {
        ret[field] = parseFloat(ret[field].toString());
      }
    });
    
    // Convert withdrawal rule decimals
    if (ret.withdrawalRules) {
      ['minWithdrawal', 'maxWithdrawal'].forEach(field => {
        if (ret.withdrawalRules[field] && typeof ret.withdrawalRules[field] === 'object') {
          ret.withdrawalRules[field] = parseFloat(ret.withdrawalRules[field].toString());
        }
      });
    }
    
    return ret;
  }
});

// ✅ STATIC METHODS (unchanged)
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

groupSavingsSchema.statics.findByGroupCode = function(groupCode) {
  return this.findOne({ groupCode, status: 'active' });
};

groupSavingsSchema.statics.findActiveSavings = function() {
  return this.find({ status: 'active' });
};

groupSavingsSchema.statics.findBySavingsType = function(savingsType) {
  return this.find({ savingsType, status: 'active' });
};

// ✅ INSTANCE METHODS (unchanged)
groupSavingsSchema.methods.updateBalance = function(amount, balanceType = 'AVAILABLE_BALANCE') {
  const currentBalance = parseFloat(this[balanceType].toString());
  const newBalance = currentBalance + amount;
  this[balanceType] = mongoose.Types.Decimal128.fromString(newBalance.toFixed(2));
  
  // Sync all balances if updating available balance
  if (balanceType === 'AVAILABLE_BALANCE') {
    this.LEDGER_BAL = mongoose.Types.Decimal128.fromString(newBalance.toFixed(2));
    this.CLEARED_BAL = mongoose.Types.Decimal128.fromString(newBalance.toFixed(2));
    this.currentBalance = newBalance;
  }
  
  return this.save();
};

groupSavingsSchema.methods.canWithdraw = function(amount) {
  const availableBalance = parseFloat(this.AVAILABLE_BALANCE.toString());
  const minWithdrawal = parseFloat(this.withdrawalRules.minWithdrawal.toString());
  const maxWithdrawal = parseFloat(this.withdrawalRules.maxWithdrawal.toString());
  
  if (amount > availableBalance) return false;
  if (minWithdrawal > 0 && amount < minWithdrawal) return false;
  if (maxWithdrawal > 0 && amount > maxWithdrawal) return false;
  
  return true;
};

groupSavingsSchema.methods.closeAccount = function(userId, reason = '') {
  this.status = 'closed';
  this.closedAt = new Date();
  this.closedBy = userId;
  this.closureReason = reason;
  this.isActive = false;
  return this.save();
};

// ✅ VIRTUAL FIELDS (unchanged)
groupSavingsSchema.virtual('formattedBalances').get(function() {
  return {
    ledgerBalance: parseFloat(this.LEDGER_BAL.toString()),
    clearedBalance: parseFloat(this.CLEARED_BAL.toString()),
    availableBalance: parseFloat(this.AVAILABLE_BALANCE.toString()),
    currentBalance: this.currentBalance
  };
});

groupSavingsSchema.virtual('progressToTarget').get(function() {
  const currentBalance = parseFloat(this.AVAILABLE_BALANCE.toString());
  const target = parseFloat(this.targetAmount.toString());
  return target > 0 ? (currentBalance / target) * 100 : 0;
});

groupSavingsSchema.virtual('isTargetAchieved').get(function() {
  const currentBalance = parseFloat(this.AVAILABLE_BALANCE.toString());
  const target = parseFloat(this.targetAmount.toString());
  return currentBalance >= target;
});

// ✅ INDEXES FOR PERFORMANCE (unchanged)
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