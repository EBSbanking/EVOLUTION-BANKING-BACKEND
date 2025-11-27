import mongoose from 'mongoose';

const ChartofAccountSchema = new mongoose.Schema({
  // Primary identifier matching your table structure
  name: { 
    type: String, 
    required: true,
    maxlength: 225
  },
  
  glcode: { 
    type: String, 
    maxlength: 225,
    sparse: true // Allows null but ensures uniqueness for non-null values
  },
  
  type: { 
    type: String, 
    required: true,
    maxlength: 225,
    index: true
  },
  
  account_usage: { 
    type: String, 
    required: true,
    maxlength: 225,
    index: true
  },
  
  gl_group: { 
    type: String, 
    maxlength: 225,
    index: true,
    sparse: true // Allows null but ensures uniqueness for non-null values
  },
  
  balance: { 
    type: Number, 
    required: true,
    default: 0
  },
  
  unreconciled_balance: { 
    type: Number, 
    required: true,
    default: 0
  },
  
  manual_entries: { 
    type: String, 
    required: true,
    maxlength: 3,
    enum: ['YES', 'NO', 'yes', 'no'] // Common values for manual entries flag
  },
  
  description: { 
    type: String, 
    required: true,
    maxlength: 225
  },
  
  status: { 
    type: String, 
    required: true,
    maxlength: 225,
    enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED', 'DELETED', 'active', 'inactive', 'suspended', 'deleted'],
    default: 'ACTIVE'
  },
  
  // Enhanced fields for integration with your GL system
  organizationCode: { 
    type: Number, 
    required: true,
    index: true
  },
  
  branchCode: { 
    type: String, 
    required: true,
    index: true
  },
  
  // Integration with GLAccount system
  glAccountReference: {
    glAccountId: { type: mongoose.Schema.Types.ObjectId, ref: 'GLAccount' },
    glAccountNo: String,
    mappedAt: { type: Date, default: Date.now },
    mappingStatus: {
      type: String,
      enum: ['PENDING', 'MAPPED', 'FAILED', 'SYNCED'],
      default: 'PENDING'
    },
    lastSyncDate: Date,
    syncError: String
  },
  
  // Legacy system compatibility (if this is from legacy system)
  legacyReference: {
    originalId: { type: Number }, // The bigint(20) id from your table
    sourceSystem: String,
    migrationBatch: String,
    migratedAt: { type: Date, default: Date.now }
  },
  
  // Enhanced metadata for better categorization
  metadata: {
    category: String,
    subCategory: String,
    isControlAccount: { type: Boolean, default: false },
    isSuspenseAccount: { type: Boolean, default: false },
    allowNegativeBalance: { type: Boolean, default: false },
    postingRules: mongoose.Schema.Types.Mixed, // Flexible field for account-specific rules
    taxImplications: String,
    regulatoryRequirements: [String],
    reportingCategory: String
  },
  
  // Audit and version tracking
  version: { type: Number, default: 1 },
  createdBy: { type: String, required: true },
  updatedBy: String,
  
  // Soft delete support
  isDeleted: { type: Boolean, default: false },
  deletedAt: Date,
  deletedBy: String

}, {
  timestamps: true,
  collection: 'chart_of_accounts'
});

// ==================== INDEXES ====================

// Primary query indexes
ChartofAccountSchema.index({ organizationCode: 1, branchCode: 1 });
ChartofAccountSchema.index({ glcode: 1, organizationCode: 1 }, { sparse: true });
ChartofAccountSchema.index({ type: 1, account_usage: 1 });
ChartofAccountSchema.index({ gl_group: 1, status: 1 }, { sparse: true });

// Integration indexes
ChartofAccountSchema.index({ 'glAccountReference.glAccountId': 1 });
ChartofAccountSchema.index({ 'glAccountReference.mappingStatus': 1 });
ChartofAccountSchema.index({ organizationCode: 1, 'glAccountReference.mappingStatus': 1 });

// Legacy system indexes
ChartofAccountSchema.index({ 'legacyReference.originalId': 1 });
ChartofAccountSchema.index({ 'legacyReference.sourceSystem': 1 });

// Status and operational indexes
ChartofAccountSchema.index({ status: 1, isDeleted: 1 });
ChartofAccountSchema.index({ organizationCode: 1, status: 1, isDeleted: 1 });

// Compound indexes for common queries
ChartofAccountSchema.index({ 
  organizationCode: 1, 
  branchCode: 1, 
  type: 1, 
  status: 1 
});

ChartofAccountSchema.index({ 
  organizationCode: 1, 
  gl_group: 1, 
  account_usage: 1 
});

// Text search index for name and description
ChartofAccountSchema.index({ 
  name: 'text', 
  description: 'text',
  glcode: 'text'
});

// ==================== STATIC METHODS ====================

ChartofAccountSchema.statics.findByOrganization = function(organizationCode, includeInactive = false) {
  const query = { 
    organizationCode, 
    isDeleted: false 
  };
  
  if (!includeInactive) {
    query.status = 'ACTIVE';
  }
  
  return this.find(query);
};

ChartofAccountSchema.statics.findByBranch = function(organizationCode, branchCode) {
  return this.find({ 
    organizationCode, 
    branchCode, 
    status: 'ACTIVE', 
    isDeleted: false 
  });
};

ChartofAccountSchema.statics.findByType = function(organizationCode, type) {
  return this.find({ 
    organizationCode, 
    type, 
    status: 'ACTIVE', 
    isDeleted: false 
  });
};

ChartofAccountSchema.statics.findByGLGroup = function(organizationCode, glGroup) {
  return this.find({ 
    organizationCode, 
    gl_group: glGroup, 
    status: 'ACTIVE', 
    isDeleted: false 
  });
};

ChartofAccountSchema.statics.findUnmappedAccounts = function(organizationCode) {
  return this.find({ 
    organizationCode,
    'glAccountReference.mappingStatus': { $in: ['PENDING', 'FAILED'] },
    isDeleted: false 
  });
};

ChartofAccountSchema.statics.findByAccountUsage = function(organizationCode, accountUsage) {
  return this.find({ 
    organizationCode, 
    account_usage: accountUsage, 
    status: 'ACTIVE', 
    isDeleted: false 
  });
};

// Integration with GLAccount system
ChartofAccountSchema.statics.findByGLAccountId = function(glAccountId) {
  return this.findOne({ 
    'glAccountReference.glAccountId': glAccountId,
    isDeleted: false 
  });
};

ChartofAccountSchema.statics.getBalanceSummary = async function(organizationCode, branchCode = null) {
  const matchStage = {
    organizationCode,
    status: 'ACTIVE',
    isDeleted: false
  };
  
  if (branchCode) {
    matchStage.branchCode = branchCode;
  }
  
  return this.aggregate([
    {
      $match: matchStage
    },
    {
      $group: {
        _id: {
          type: '$type',
          accountUsage: '$account_usage',
          glGroup: '$gl_group'
        },
        totalBalance: { $sum: '$balance' },
        totalUnreconciledBalance: { $sum: '$unreconciled_balance' },
        accountCount: { $sum: 1 },
        averageBalance: { $avg: '$balance' },
        maxBalance: { $max: '$balance' },
        minBalance: { $min: '$balance' }
      }
    },
    {
      $project: {
        type: '$_id.type',
        accountUsage: '$_id.accountUsage',
        glGroup: '$_id.glGroup',
        totalBalance: 1,
        totalUnreconciledBalance: 1,
        reconciledBalance: { $subtract: ['$totalBalance', '$totalUnreconciledBalance'] },
        accountCount: 1,
        averageBalance: 1,
        maxBalance: 1,
        minBalance: 1
      }
    },
    {
      $sort: { totalBalance: -1 }
    }
  ]);
};

ChartofAccountSchema.statics.getMappingStatistics = async function(organizationCode) {
  return this.aggregate([
    {
      $match: {
        organizationCode,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: '$glAccountReference.mappingStatus',
        count: { $sum: 1 },
        totalBalance: { $sum: '$balance' },
        averageBalance: { $avg: '$balance' }
      }
    },
    {
      $project: {
        mappingStatus: '$_id',
        count: 1,
        totalBalance: 1,
        averageBalance: 1
      }
    }
  ]);
};

ChartofAccountSchema.statics.findDuplicateGLCodes = async function(organizationCode) {
  return this.aggregate([
    {
      $match: {
        organizationCode,
        glcode: { $ne: null },
        isDeleted: false
      }
    },
    {
      $group: {
        _id: {
          glcode: '$glcode',
          branchCode: '$branchCode'
        },
        count: { $sum: 1 },
        accounts: { 
          $push: {
            _id: '$_id',
            name: '$name',
            type: '$type',
            balance: '$balance',
            status: '$status'
          }
        }
      }
    },
    {
      $match: {
        count: { $gt: 1 }
      }
    },
    {
      $project: {
        glcode: '$_id.glcode',
        branchCode: '$_id.branchCode',
        count: 1,
        accounts: 1
      }
    }
  ]);
};

// ==================== INSTANCE METHODS ====================

ChartofAccountSchema.methods.updateBalance = async function(newBalance, transactionData = {}) {
  const previousBalance = this.balance;
  const balanceChange = newBalance - previousBalance;
  
  this.balance = newBalance;
  
  // Update unreconciled balance if this is an unreconciled transaction
  if (transactionData.reconciled === false) {
    this.unreconciled_balance += balanceChange;
  }
  
  await this.save();
  
  return {
    previousBalance,
    newBalance,
    balanceChange,
    unreconciledBalance: this.unreconciled_balance
  };
};

ChartofAccountSchema.methods.mapToGLAccount = async function(glAccountId, glAccountNo) {
  this.glAccountReference = {
    glAccountId: glAccountId,
    glAccountNo: glAccountNo,
    mappedAt: new Date(),
    mappingStatus: 'MAPPED'
  };
  
  return await this.save();
};

ChartofAccountSchema.methods.unmapGLAccount = async function() {
  this.glAccountReference.mappingStatus = 'PENDING';
  this.glAccountReference.glAccountId = undefined;
  this.glAccountReference.glAccountNo = undefined;
  this.glAccountReference.lastSyncDate = undefined;
  this.glAccountReference.syncError = 'Manually unlinked';
  
  return await this.save();
};

ChartofAccountSchema.methods.syncWithGLAccount = async function(glAccountData) {
  try {
    if (glAccountData.LEDGER_BALANCE !== undefined) {
      await this.updateBalance(glAccountData.LEDGER_BALANCE, {
        reconciled: true,
        description: 'Synced with GL Account system'
      });
    }
    
    this.glAccountReference.lastSyncDate = new Date();
    this.glAccountReference.syncError = undefined;
    
    await this.save();
    return true;
  } catch (error) {
    this.glAccountReference.syncError = error.message;
    await this.save();
    return false;
  }
};

ChartofAccountSchema.methods.allowManualEntries = function() {
  return this.manual_entries.toLowerCase() === 'yes';
};

ChartofAccountSchema.methods.isActive = function() {
  return this.status.toUpperCase() === 'ACTIVE' && !this.isDeleted;
};

ChartofAccountSchema.methods.softDelete = async function(deletedBy = 'system') {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = deletedBy;
  this.status = 'DELETED';
  
  return await this.save();
};

ChartofAccountSchema.methods.restore = async function(restoredBy = 'system') {
  this.isDeleted = false;
  this.deletedAt = undefined;
  this.deletedBy = undefined;
  this.status = 'ACTIVE';
  
  return await this.save();
};

ChartofAccountSchema.methods.getAccountInfo = function() {
  return {
    id: this._id,
    name: this.name,
    glcode: this.glcode,
    type: this.type,
    accountUsage: this.account_usage,
    glGroup: this.gl_group,
    balance: this.balance,
    unreconciledBalance: this.unreconciled_balance,
    manualEntries: this.manual_entries,
    status: this.status,
    organization: {
      code: this.organizationCode,
      branch: this.branchCode
    },
    glAccountMapping: this.glAccountReference.mappingStatus,
    isMapped: this.glAccountReference.mappingStatus === 'MAPPED'
  };
};

// ==================== MIDDLEWARE ====================

ChartofAccountSchema.pre('save', function(next) {
  // Convert manual_entries to uppercase for consistency
  if (this.manual_entries) {
    this.manual_entries = this.manual_entries.toUpperCase();
  }
  
  // Convert status to uppercase for consistency
  if (this.status && this.status !== 'DELETED') {
    this.status = this.status.toUpperCase();
  }
  
  // Validate balance constraints
  if (this.balance < 0 && !this.metadata.allowNegativeBalance) {
    return next(new Error('Negative balance not allowed for this account'));
  }
  
  // Ensure unreconciled_balance doesn't exceed balance
  if (this.unreconciled_balance > this.balance) {
    this.unreconciled_balance = this.balance;
  }
  
  // Increment version on update
  if (this.isModified()) {
    this.version += 1;
  }
  
  next();
});

ChartofAccountSchema.post('save', function(doc) {
  console.log(`ChartofAccount ${doc.name} (${doc.glcode || 'No GL Code'}) saved for organization ${doc.organizationCode}`);
});

ChartofAccountSchema.pre('remove', function(next) {
  console.warn(`Deleting ChartofAccount ${this.name} (${this._id}) permanently`);
  next();
});

// ==================== VIRTUAL FIELDS ====================

ChartofAccountSchema.virtual('reconciledBalance').get(function() {
  return this.balance - this.unreconciled_balance;
});

ChartofAccountSchema.virtual('isMappedToGL').get(function() {
  return this.glAccountReference && 
         this.glAccountReference.mappingStatus === 'MAPPED' && 
         this.glAccountReference.glAccountId;
});

ChartofAccountSchema.virtual('requiresMapping').get(function() {
  return !this.glAccountReference || 
         this.glAccountReference.mappingStatus === 'PENDING' || 
         this.glAccountReference.mappingStatus === 'FAILED';
});

// Include virtuals in JSON output
ChartofAccountSchema.set('toJSON', { virtuals: true });
ChartofAccountSchema.set('toObject', { virtuals: true });

export default mongoose.model('ChartofAccount', ChartofAccountSchema);