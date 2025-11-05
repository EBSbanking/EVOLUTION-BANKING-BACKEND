import mongoose from 'mongoose';

// Define the collection type enum
const COLLECTION_TYPES = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY', 
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY'
};

// Define account status enum
const ACCOUNT_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  SUSPENDED: 'suspended',
  CLOSED: 'closed'
};

const thriftSchema = new mongoose.Schema({
  CUST_ID: {
    type: String,
    required: [true, 'Customer ID is required'],
    trim: true,
    index: true
  },
  ACCT_NO: {
    type: String,
    required: [true, 'Account number is required'],
    unique: true,
    trim: true,
    index: true
  },
  ACCT_ID: {
    type: String,
    required: [true, 'Account ID is required'],
    unique: true,
    trim: true,
    index: true
  },
  FIRST_NAME: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [100, 'First name cannot exceed 100 characters']
  },
  LASTNAME: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [100, 'Last name cannot exceed 100 characters']
  },
  FULL_NAME: {
    type: String,
    required: [true, 'Full name is required'],
    trim: true,
    maxlength: [200, 'Full name cannot exceed 200 characters'],
    index: true
  },
  RELATIONSHIP_MANAGER: {
    type: String,
    required: false,
    trim: true,
    maxlength: [50, 'Relationship manager code cannot exceed 50 characters'],
    index: true
  },
  AMOUNT: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount cannot be negative'],
    set: value => parseFloat(value.toFixed(2)) // Store with 2 decimal places
  },
  ADDRESS: {
    street: {
      type: String,
      trim: true,
      maxlength: [200, 'Street address cannot exceed 200 characters']
    },
    city: {
      type: String,
      trim: true,
      maxlength: [100, 'City cannot exceed 100 characters']
    },
    state: {
      type: String,
      trim: true,
      maxlength: [100, 'State cannot exceed 100 characters']
    },
    zipCode: {
      type: String,
      trim: true,
      maxlength: [20, 'ZIP code cannot exceed 20 characters']
    },
    country: {
      type: String,
      trim: true,
      default: 'Nigeria',
      maxlength: [100, 'Country cannot exceed 100 characters']
    }
  },
  COLLECTION_TYPE: {
    type: String,
    required: [true, 'Collection type is required'],
    enum: {
      values: Object.values(COLLECTION_TYPES),
      message: 'Collection type must be DAILY, WEEKLY, MONTHLY, or QUARTERLY'
    },
    uppercase: true,
    trim: true
  },
  // New fields for transaction and opening dates
  OPENED_DT: {
    type: Date,
    required: [true, 'Opening date is required'],
    default: Date.now
  },
  TRANSACTION_DATE: {
    type: Date,
    required: false // Optional, will be used for specific transactions
  },
  status: {
    type: String,
    required: [true, 'Account status is required'],
    enum: {
      values: Object.values(ACCOUNT_STATUS),
      message: 'Status must be active, inactive, suspended, or closed'
    },
    default: ACCOUNT_STATUS.ACTIVE
  },
  openingDate: {
    type: Date,
    required: [true, 'Opening date is required'],
    default: Date.now
  },
  lastCollectionDate: {
    type: Date,
    required: false
  },
  initialAmount: {
    type: Number,
    required: false,
    min: [0, 'Initial amount cannot be negative'],
    set: value => value ? parseFloat(value.toFixed(2)) : undefined
  },
  accountType: {
    type: String,
    required: [true, 'Account type is required'],
    default: 'SAVINGS',
    enum: {
      values: ['SAVINGS', 'CURRENT', 'FIXED_DEPOSIT', 'THRIFT'],
      message: 'Account type must be SAVINGS, CURRENT, FIXED_DEPOSIT, or THRIFT'
    }
  },
  // Additional fields for enhanced functionality
  nextCollectionDate: {
    type: Date,
    required: false
  },
  totalContributions: {
    type: Number,
    default: 0,
    min: [0, 'Total contributions cannot be negative'],
    set: value => parseFloat(value.toFixed(2))
  },
  totalWithdrawals: {
    type: Number,
    default: 0,
    min: [0, 'Total withdrawals cannot be negative'],
    set: value => parseFloat(value.toFixed(2))
  },
  lastTransactionDate: {
    type: Date,
    required: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  notes: {
    type: String,
    maxlength: [500, 'Notes cannot exceed 500 characters'],
    trim: true
  }
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  toJSON: { 
    virtuals: true,
    transform: function(doc, ret) {
      // Format dates for JSON output
      if (ret.OPENED_DT) ret.OPENED_DT = ret.OPENED_DT.toISOString().split('T')[0];
      if (ret.TRANSACTION_DATE) ret.TRANSACTION_DATE = ret.TRANSACTION_DATE.toISOString().split('T')[0];
      if (ret.openingDate) ret.openingDate = ret.openingDate.toISOString().split('T')[0];
      if (ret.lastCollectionDate) ret.lastCollectionDate = ret.lastCollectionDate.toISOString().split('T')[0];
      if (ret.nextCollectionDate) ret.nextCollectionDate = ret.nextCollectionDate.toISOString().split('T')[0];
      if (ret.lastTransactionDate) ret.lastTransactionDate = ret.lastTransactionDate.toISOString().split('T')[0];
      return ret;
    }
  },
  toObject: { virtuals: true }
});

// Virtual for full name (kept for backward compatibility, but FULL_NAME is now stored)
thriftSchema.virtual('fullName').get(function() {
  return this.FULL_NAME;
});

// Virtual for account age in days
thriftSchema.virtual('accountAgeInDays').get(function() {
  const today = new Date();
  const openedDate = this.OPENED_DT || this.openingDate || this.createdAt;
  const diffTime = Math.abs(today - openedDate);
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Virtual for net balance (contributions - withdrawals)
thriftSchema.virtual('netBalance').get(function() {
  return parseFloat((this.totalContributions - this.totalWithdrawals).toFixed(2));
});

// Virtual for formatted opening date
thriftSchema.virtual('formattedOpeningDate').get(function() {
  const date = this.OPENED_DT || this.openingDate;
  return date ? date.toLocaleDateString() : 'N/A';
});

// // Index for better query performance
// thriftSchema.index({ CUST_ID: 1, ACCT_NO: 1 });
// thriftSchema.index({ COLLECTION_TYPE: 1 });
// thriftSchema.index({ createdAt: -1 });
// thriftSchema.index({ RELATIONSHIP_MANAGER: 1 }); // Added index for relationship manager queries
// thriftSchema.index({ FULL_NAME: 1 }); // Index for full name queries
// thriftSchema.index({ OPENED_DT: -1 }); // Index for opening date queries
// thriftSchema.index({ status: 1 }); // Index for status queries
// thriftSchema.index({ accountType: 1 }); // Index for account type queries
// thriftSchema.index({ lastCollectionDate: -1 }); // Index for last collection date

// // Compound indexes for common query patterns
// thriftSchema.index({ RELATIONSHIP_MANAGER: 1, status: 1 });
// thriftSchema.index({ COLLECTION_TYPE: 1, status: 1 });
// thriftSchema.index({ CUST_ID: 1, status: 1 });

// Static method to find by customer ID
thriftSchema.statics.findByCustomerId = function(customerId) {
  return this.find({ CUST_ID: customerId });
};

// Static method to find by collection type
thriftSchema.statics.findByCollectionType = function(collectionType) {
  return this.find({ COLLECTION_TYPE: collectionType.toUpperCase() });
};

// Static method to find by relationship manager
thriftSchema.statics.findByRelationshipManager = function(managerId) {
  return this.find({ RELATIONSHIP_MANAGER: managerId });
};

// Static method to find by full name (partial match)
thriftSchema.statics.findByFullName = function(fullName) {
  return this.find({ FULL_NAME: { $regex: fullName, $options: 'i' } });
};

// Static method to find active accounts
thriftSchema.statics.findActiveAccounts = function() {
  return this.find({ status: ACCOUNT_STATUS.ACTIVE, isActive: true });
};

// Static method to find accounts by date range
thriftSchema.statics.findByOpeningDateRange = function(startDate, endDate) {
  return this.find({
    OPENED_DT: {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    }
  });
};

// Static method to get accounts summary by relationship manager
thriftSchema.statics.getSummaryByRelationshipManager = function(managerId) {
  return this.aggregate([
    { $match: { RELATIONSHIP_MANAGER: managerId } },
    {
      $group: {
        _id: '$status',
        totalAccounts: { $sum: 1 },
        totalAmount: { $sum: '$AMOUNT' },
        totalContributions: { $sum: '$totalContributions' },
        averageBalance: { $avg: '$AMOUNT' }
      }
    }
  ]);
};

// Instance method to get account summary
thriftSchema.methods.getAccountSummary = function() {
  return {
    accountNumber: this.ACCT_NO,
    customerId: this.CUST_ID,
    customerName: this.FULL_NAME,
    relationshipManager: this.RELATIONSHIP_MANAGER,
    amount: this.AMOUNT,
    collectionType: this.COLLECTION_TYPE,
    accountCreated: this.createdAt,
    openedDate: this.OPENED_DT,
    status: this.status,
    accountType: this.accountType,
    totalContributions: this.totalContributions,
    totalWithdrawals: this.totalWithdrawals,
    netBalance: this.netBalance,
    accountAgeInDays: this.accountAgeInDays,
    lastCollectionDate: this.lastCollectionDate,
    nextCollectionDate: this.nextCollectionDate
  };
};

// Instance method to update last transaction
thriftSchema.methods.updateLastTransaction = function(amount, transactionType) {
  this.lastTransactionDate = new Date();
  
  if (transactionType === 'CONTRIBUTION' || transactionType === 'THRIFT_COLLECTION') {
    this.totalContributions += amount;
    this.AMOUNT += amount;
  } else if (transactionType === 'WITHDRAWAL' || transactionType === 'THRIFT_WITHDRAWAL') {
    this.totalWithdrawals += amount;
    this.AMOUNT -= amount;
  }
  
  return this.save();
};

// Instance method to calculate next collection date
thriftSchema.methods.calculateNextCollectionDate = function() {
  const today = new Date();
  let nextDate = new Date(today);
  
  switch (this.COLLECTION_TYPE) {
    case COLLECTION_TYPES.DAILY:
      nextDate.setDate(today.getDate() + 1);
      break;
    case COLLECTION_TYPES.WEEKLY:
      nextDate.setDate(today.getDate() + 7);
      break;
    case COLLECTION_TYPES.MONTHLY:
      nextDate.setMonth(today.getMonth() + 1);
      break;
    case COLLECTION_TYPES.QUARTERLY:
      nextDate.setMonth(today.getMonth() + 3);
      break;
    default:
      nextDate = null;
  }
  
  this.nextCollectionDate = nextDate;
  return nextDate;
};

// Pre-save middleware to validate data and compute FULL_NAME
thriftSchema.pre('save', function(next) {
  // Ensure COLLECTION_TYPE is uppercase
  if (this.COLLECTION_TYPE) {
    this.COLLECTION_TYPE = this.COLLECTION_TYPE.toUpperCase();
  }
  
  // Validate that COLLECTION_TYPE is one of the allowed values
  if (!Object.values(COLLECTION_TYPES).includes(this.COLLECTION_TYPE)) {
    return next(new Error(`Invalid collection type: ${this.COLLECTION_TYPE}`));
  }

  // Compute FULL_NAME from FIRST_NAME and LASTNAME
  if (this.isModified('FIRST_NAME') || this.isModified('LASTNAME')) {
    this.FULL_NAME = `${this.FIRST_NAME} ${this.LASTNAME}`.trim();
  }
  
  // Set isActive based on status
  if (this.isModified('status')) {
    this.isActive = this.status === ACCOUNT_STATUS.ACTIVE;
  }
  
  // Ensure OPENED_DT and openingDate are synchronized
  if (this.isModified('OPENED_DT') && !this.isModified('openingDate')) {
    this.openingDate = this.OPENED_DT;
  } else if (this.isModified('openingDate') && !this.isModified('OPENED_DT')) {
    this.OPENED_DT = this.openingDate;
  }
  
  next();
});

// Post-save middleware to update related data if needed
thriftSchema.post('save', function(doc, next) {
  // You can add any post-save operations here, like updating related collections
  console.log(`Thrift account ${doc.ACCT_NO} saved/updated for customer ${doc.CUST_ID}`);
  next();
});

// Create and export the model
const Thrift = mongoose.model('Thrift', thriftSchema);

// Default export
export default Thrift;

// Named exports
export { COLLECTION_TYPES, ACCOUNT_STATUS, Thrift };