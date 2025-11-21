import mongoose from 'mongoose';

const EmbeddedTransactionSchema = new mongoose.Schema({
  JOURNAL_ID: { type: String, required: true },
  TRANSACTION_ID: { type: String, required: true },
  TYPE: { type: String, enum: ['DEBIT', 'CREDIT'], required: true },
  AMOUNT: { type: Number, required: true, min: 0 },
  NARRATION: { type: String, required: true },
  CREATED_BY: { type: String, required: true },
  CREATED_AT: { type: Date, default: Date.now, required: true },
  branchCode: { type: String, required: true },
  organizationCode: { type: Number, required: true }, // ADDED organizationCode to transactions
}, { _id: false });

const GLAccountSchema = new mongoose.Schema({
  GL_ACCT_NO: { 
    type: String, 
    required: true, 
    unique: true,
  },
  GL_ACCT_ID: { 
    type: String, 
    required: true, 
    unique: true,
  },
  CREATED_BY: { type: String, required: true },
  
  // Branch & Organization Information
  organizationName: { 
    type: String, 
    required: true,
  },
  organizationCode: { 
    type: Number, 
    required: true,
  },
  branchName: { 
    type: String, 
    required: true,
  },
  branchCode: { 
    type: String, 
    required: true,
  },
  branchType: {
    type: String,
    enum: ['MAIN', 'REGIONAL', 'SUB', 'MOBILE'],
    default: 'MAIN'
  },
  
  // Account Classification
  categoryCode: { type: String },
  categoryName: { type: String, default: 'Default Category' },
  parentCode: { type: String, default: null },
  level: { type: Number, required: true },
  
  // Account Structure
  LEDGER_NO: { type: String, required: true },
  PARENT_ID: { type: mongoose.Schema.Types.ObjectId, default: null },
  subfolderId: { type: String, required: true },
  BAL_CD: { type: String, required: true },
  SUB_LEDGER_NO: { type: String, required: true },
  SEG_NO: { type: Number, default: 1 },
  CHART_OF_ACCT_ID: { type: String, required: true },
  ACCT_DESC: { type: String, required: true },
  GL_ACCT_CAT: { type: String, required: true },
  
  // Transaction & Posting Controls
  JOURNAL_ID: { type: String, default: null },
  TRANSACTION_TYPE: { type: String, default: 'Asset Balance' },
  CR_ALLOWED: { type: Boolean, default: true },
  DR_ALLOWED: { type: Boolean, default: true },
  REC_ST: { 
    type: String, 
    default: 'Active', 
    enum: ['Active', 'Inactive', 'Suspended', 'Closed'],
  },
  POST_ALLOW: { type: Boolean, default: true },
  POST_FG: { type: Boolean, default: false },
  CONTROL_ACCT_FG: { type: Boolean, default: false },
  SUSPENSE_ACCT_FG: { type: Boolean, default: false },
  ALLOW_BAL_SWING_FG: { type: Boolean, default: false },
  
  // Segmentation
  SEG_VALUE: { type: String, default: '' },
  SEG_DESC: { type: String, default: 'Default Description' },
  SEG_TY_CD: { type: String, default: '' },
  SEG_PLACEHLDR_ID: { type: String, default: '' },
  DELAY_GL_POSTING: { type: Boolean, default: false },
  
  // Financial Data
  LEDGER_BALANCE: { type: Number, default: 0 },
  AVAILABLE_BALANCE: { type: Number, default: 0 },
  CURRENCY_CODE: { type: String, default: 'NGN' },
  
  // Transactions with branch tracking
  transactions: [EmbeddedTransactionSchema],
  
  // Settlement & References
  SETTLEMENT_GL_ACCT_NO: { type: String, default: null },
  INTER_BRANCH_ACCOUNT: { type: Boolean, default: false },
  
  metadata: {
    accountType: { 
      type: String, 
      required: true,
      enum: [
        'LOAN_ASSET',
        'PROCESSING_FEE',
        'INSURANCE_FEE',
        'UPFRONT_INTEREST',
        'OTHER_FEES',
        'CUSTOMER_ACCOUNT',
        'LIABILITY_ACCOUNT',
        'DEPOSITS_LIABILITY',
        'EQUITY_ACCOUNT',
        'CAPITAL_ACCOUNT',
        'EXPENSE_ACCOUNT',
        'OPERATING_EXPENSE',
        'REVENUE_ACCOUNT',
        'INTEREST_INCOME',
        'FIXED_ASSET',
        'PROPERTY_PLANT_EQUIPMENT',
        'INTER_BRANCH'
      ]
    },
    productType: { 
      type: String,
      enum: [
        'PERSONAL_LOAN',
        'BUSINESS_LOAN', 
        'MORTGAGE_LOAN',
        'AUTO_LOAN',
        'EDUCATION_LOAN',
        'CONSUMER_LOAN',
        'SME_LOAN',
        'AGRICULTURAL_LOAN'
      ]
    },
    subBranchCode: { type: String },
    accountSuffix: { type: String },
    templateGenerated: { type: Boolean, default: false },
    dynamicAccount: { type: Boolean, default: false },
    bulkCreated: { type: Boolean, default: false },
    branchSpecific: { type: Boolean, default: true },
    consolidationRequired: { type: Boolean, default: false },
  },
  
  branchTimezone: { type: String, default: 'Africa/Lagos' },
  
}, {
  timestamps: true,
  collection: 'gl_accounts',
});

// ENHANCED INDEXES WITH ORGANIZATIONCODE
GLAccountSchema.index({ GL_ACCT_NO: 1 });
GLAccountSchema.index({ GL_ACCT_ID: 1 });
GLAccountSchema.index({ organizationName: 1, branchCode: 1, GL_ACCT_NO: 1 });
GLAccountSchema.index({ organizationCode: 1, branchCode: 1 });
GLAccountSchema.index({ organizationCode: 1, branchCode: 1, 'metadata.accountType': 1 }); // ENHANCED
GLAccountSchema.index({ organizationCode: 1, branchCode: 1, REC_ST: 1 }); // ENHANCED
GLAccountSchema.index({ organizationCode: 1, branchCode: 1, categoryCode: 1 });
GLAccountSchema.index({ organizationCode: 1, 'metadata.branchSpecific': 1 }); // ENHANCED
GLAccountSchema.index({ organizationCode: 1, GL_ACCT_NO: 1, branchCode: 1 }); // ENHANCED

// NEW ORGANIZATION-LEVEL INDEXES
GLAccountSchema.index({ organizationCode: 1, REC_ST: 1 });
GLAccountSchema.index({ organizationCode: 1, 'metadata.accountType': 1 });
GLAccountSchema.index({ organizationCode: 1, LEDGER_BALANCE: 1 });

// Compound index for common query patterns
GLAccountSchema.index({ 
  organizationCode: 1, 
  branchCode: 1, 
  'metadata.accountType': 1,
  REC_ST: 1 
});

// NEW: Cross-organization indexes for reporting
GLAccountSchema.index({ 
  organizationCode: 1,
  branchCode: 1,
  GL_ACCT_CAT: 1,
  REC_ST: 1 
});

// NEW: For financial reporting across organization
GLAccountSchema.index({ 
  organizationCode: 1,
  'metadata.accountType': 1,
  REC_ST: 1,
  LEDGER_BALANCE: 1 
});

// ENHANCED Static Methods for Multi-Branch Operations with OrganizationCode
GLAccountSchema.statics.findByBranch = function(organizationCode, branchCode) {
  return this.find({ organizationCode, branchCode, REC_ST: 'Active' });
};

GLAccountSchema.statics.findByOrganization = function(organizationCode) {
  return this.find({ organizationCode, REC_ST: 'Active' });
};

GLAccountSchema.statics.findInterBranchAccounts = function(organizationCode) {
  return this.find({ 
    organizationCode, 
    'metadata.accountType': 'INTER_BRANCH',
    REC_ST: 'Active' 
  });
};

// NEW: Find accounts by organization and account type
GLAccountSchema.statics.findByOrganizationAndType = function(organizationCode, accountType) {
  return this.find({ 
    organizationCode, 
    'metadata.accountType': accountType,
    REC_ST: 'Active' 
  });
};

// NEW: Get organization-wide balance summary
GLAccountSchema.statics.getOrganizationBalanceSummary = async function(organizationCode) {
  return this.aggregate([
    {
      $match: {
        organizationCode,
        REC_ST: 'Active'
      }
    },
    {
      $group: {
        _id: {
          branchCode: '$branchCode',
          accountType: '$metadata.accountType'
        },
        totalBalance: { $sum: '$LEDGER_BALANCE' },
        accountCount: { $sum: 1 },
        branchName: { $first: '$branchName' }
      }
    },
    {
      $group: {
        _id: '$_id.branchCode',
        branchName: { $first: '$branchName' },
        totalBalance: { $sum: '$totalBalance' },
        accountCount: { $sum: '$accountCount' },
        breakdown: {
          $push: {
            accountType: '$_id.accountType',
            balance: '$totalBalance',
            count: '$accountCount'
          }
        }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
};

// ENHANCED: Get branch balance summary with organizationCode
GLAccountSchema.statics.getBranchBalanceSummary = async function(organizationCode, branchCode) {
  return this.aggregate([
    {
      $match: {
        organizationCode,
        branchCode,
        REC_ST: 'Active'
      }
    },
    {
      $group: {
        _id: '$metadata.accountType',
        totalBalance: { $sum: '$LEDGER_BALANCE' },
        availableBalance: { $sum: '$AVAILABLE_BALANCE' },
        accountCount: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
};

// NEW: Get cross-branch consolidated view
GLAccountSchema.statics.getConsolidatedView = async function(organizationCode, accountTypes = []) {
  const matchStage = {
    organizationCode,
    REC_ST: 'Active'
  };
  
  if (accountTypes.length > 0) {
    matchStage['metadata.accountType'] = { $in: accountTypes };
  }
  
  return this.aggregate([
    {
      $match: matchStage
    },
    {
      $group: {
        _id: {
          accountType: '$metadata.accountType',
          branchCode: '$branchCode'
        },
        totalBalance: { $sum: '$LEDGER_BALANCE' },
        availableBalance: { $sum: '$AVAILABLE_BALANCE' },
        accountCount: { $sum: 1 },
        branchName: { $first: '$branchName' }
      }
    },
    {
      $group: {
        _id: '$_id.accountType',
        totalBalance: { $sum: '$totalBalance' },
        availableBalance: { $sum: '$availableBalance' },
        accountCount: { $sum: '$accountCount' },
        branches: {
          $push: {
            branchCode: '$_id.branchCode',
            branchName: '$branchName',
            balance: '$totalBalance',
            availableBalance: '$availableBalance',
            count: '$accountCount'
          }
        }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);
};

// NEW: Find duplicate accounts across organization
GLAccountSchema.statics.findDuplicateAccounts = async function(organizationCode) {
  return this.aggregate([
    {
      $match: {
        organizationCode,
        REC_ST: 'Active'
      }
    },
    {
      $group: {
        _id: {
          GL_ACCT_NO: '$GL_ACCT_NO',
          branchCode: '$branchCode'
        },
        count: { $sum: 1 },
        accounts: { $push: '$$ROOT' }
      }
    },
    {
      $match: {
        count: { $gt: 1 }
      }
    },
    {
      $project: {
        GL_ACCT_NO: '$_id.GL_ACCT_NO',
        branchCode: '$_id.branchCode',
        count: 1,
        accounts: {
          $map: {
            input: '$accounts',
            as: 'account',
            in: {
              _id: '$$account._id',
              GL_ACCT_ID: '$$account.GL_ACCT_ID',
              branchName: '$$account.branchName'
            }
          }
        }
      }
    }
  ]);
};

// ENHANCED Instance Methods
GLAccountSchema.methods.canPost = function (type) {
  if (type === 'DR') return this.DR_ALLOWED && this.POST_ALLOW && this.REC_ST === 'Active';
  if (type === 'CR') return this.CR_ALLOWED && this.POST_ALLOW && this.REC_ST === 'Active';
  return false;
};

GLAccountSchema.methods.isBranchSpecific = function () {
  return this.metadata.branchSpecific;
};

GLAccountSchema.methods.getBranchInfo = function () {
  return {
    organizationCode: this.organizationCode,
    organizationName: this.organizationName,
    branchCode: this.branchCode,
    branchName: this.branchName,
    branchType: this.branchType
  };
};

// NEW: Get organization info
GLAccountSchema.methods.getOrganizationInfo = function () {
  return {
    organizationCode: this.organizationCode,
    organizationName: this.organizationName
  };
};

// NEW: Check if account belongs to specific organization
GLAccountSchema.methods.belongsToOrganization = function (organizationCode) {
  return this.organizationCode === organizationCode;
};

// NEW: Check if account can be used for inter-branch transactions
GLAccountSchema.methods.canUseForInterBranch = function () {
  return !this.metadata.branchSpecific || this.metadata.accountType === 'INTER_BRANCH';
};

// ENHANCED Pre-save middleware with organization validation
GLAccountSchema.pre('save', function(next) {
  // Validate organization code format
  if (this.organizationCode && typeof this.organizationCode !== 'number') {
    return next(new Error('Organization code must be a number'));
  }
  
  // Ensure branch code is included in GL account number for branch-specific accounts
  if (this.metadata.branchSpecific && !this.GL_ACCT_NO.includes(this.branchCode)) {
    // You can implement branch encoding logic here if needed
    console.warn(`Branch-specific account ${this.GL_ACCT_NO} may not include branch code ${this.branchCode}`);
  }
  
  // Validate organization and branch code consistency for inter-branch accounts
  if (this.metadata.accountType === 'INTER_BRANCH' && this.metadata.branchSpecific) {
    console.warn(`Inter-branch account ${this.GL_ACCT_NO} should not be branch-specific`);
  }
  
  next();
});

// NEW: Post-save middleware for organization-level updates
GLAccountSchema.post('save', function(doc) {
  // You can add hooks here for organization-level cache updates or notifications
  console.log(`GL Account ${doc.GL_ACCT_NO} saved for organization ${doc.organizationCode}`);
});

export default mongoose.model('GLAccount', GLAccountSchema);