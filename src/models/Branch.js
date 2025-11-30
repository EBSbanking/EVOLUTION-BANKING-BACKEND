import mongoose from 'mongoose';

const BranchSchema = new mongoose.Schema({
  // === NEW REQUIRED FIELDS ===
  organizationName: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  organizationCode: {
    type: Number,
    required: true
  },
  branchName: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  branchCode: {
    type: String,
    required: true,
    trim: true,
    match: [/^\d{3}$/, 'Branch code must be a 3-digit number'],
    index: true
  },
  branchType: {
    type: String,
    enum: ['MAIN', 'REGIONAL', 'SUB', 'MOBILE'],
    default: 'MAIN'
  },

  // === CREATOR FIELDS - SUPPORT BOTH FORMATS ===
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  createdBy: {  // ← ADDED: Support camelCase for compatibility
    type: String,
    default: null,
    trim: true
  },

  // === LEGACY FIELDS ===
  legacyId: {
    type: Number,
    unique: true,
    sparse: true,
    index: true
  },
  address: {
    type: String,
    trim: true,
    default: ''
  },
  external_id: {
    type: String,
    default: '',
    trim: true
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ParentModel',
    default: null
  },
  office_address: {
    type: String,
    trim: true,
    default: ''
  },
  country: {
    type: Number,
    default: null
  },
  state: {
    type: Number,
    default: null
  },
  city: {
    type: String,
    default: ''
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  branch_manager: {
    type: String,
    trim: true,
    default: ''
  },
  opening_date: {
    type: Date,
    default: null
  },
  branch_type: {
    type: String,
    enum: ['Yes', 'No'],
    default: 'No'
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'],
    default: 'ACTIVE',
    uppercase: true
  },
  operational_model: {
    type: String,
    default: 'Cash'
  },
  approved_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  migration_id: {
    type: mongoose.Schema.Types.ObjectId,
    default: null,
    index: true
  },

  // === TIMESTAMPS ===
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true, // Enable automatic timestamp management
  collection: 'branches',
  strict: 'throw' // Throw errors for fields not in schema
});

// === COMPREHENSIVE INDEXES ===
BranchSchema.index({ organizationCode: 1, branchCode: 1 }, { unique: true });
BranchSchema.index({ organizationName: 1 });
BranchSchema.index({ branchCode: 1 });
BranchSchema.index({ organizationCode: 1 });
BranchSchema.index({ status: 1 });
BranchSchema.index({ legacyId: 1 });
BranchSchema.index({ migration_id: 1 });
BranchSchema.index({ organizationCode: 1, status: 1 });
BranchSchema.index({ branchName: 1, organizationCode: 1 });
BranchSchema.index({ created_by: 1 }); // Index for creator field
BranchSchema.index({ createdBy: 1 });  // Index for camelCase creator field

// === PRE-SAVE HOOKS ===
BranchSchema.pre('save', function(next) {
  // Auto-uppercase organizationName and branchName
  if (this.organizationName) {
    this.organizationName = this.organizationName.toUpperCase().trim();
  }
  if (this.branchName) {
    this.branchName = this.branchName.toUpperCase().trim();
  }
  
  // Validate branchCode format
  if (this.branchCode && !/^\d{3}$/.test(this.branchCode)) {
    return next(new Error('Branch code must be a 3-digit number'));
  }
  
  // Sync address from office_address if address is empty
  if (!this.address && this.office_address) {
    this.address = this.office_address.trim();
  }
  
  // Sync creator fields - ensure both formats are populated
  if (this.createdBy && !this.created_by) {
    // If createdBy is set but created_by is not, we can't convert string to ObjectId
    // So we'll keep them separate but log it
    console.log(`Branch ${this.branchCode}: createdBy set to "${this.createdBy}" (string)`);
  } else if (this.created_by && !this.createdBy) {
    // If created_by (ObjectId) is set but createdBy is not, we can set a string representation
    this.createdBy = `User:${this.created_by}`;
  }
  
  // Update timestamp
  if (this.isModified()) {
    this.updatedAt = new Date();
  }
  
  next();
});

// === VIRTUAL METHODS ===
BranchSchema.virtual('fullBranchInfo').get(function() {
  return {
    organization: this.organizationName,
    code: this.organizationCode,
    branch: this.branchName,
    branchCode: this.branchCode,
    type: this.branchType
  };
});

BranchSchema.virtual('creatorInfo').get(function() {
  return {
    created_by: this.created_by,    // ObjectId reference
    createdBy: this.createdBy,      // String representation
    createdAt: this.createdAt
  };
});

// === INSTANCE METHODS ===
BranchSchema.methods.generateBranchCode = function() {
  if (this.branchCode) return this.branchCode;
  
  const codeMap = {
    'HEAD OFFICE': '000',
    'MAIN BRANCH': '001',
    'FINANCE': '002',
  };
  
  return codeMap[this.branchName.toUpperCase()] || '999';
};

BranchSchema.methods.isActive = function() {
  return this.status === 'ACTIVE';
};

BranchSchema.methods.getContactInfo = function() {
  return {
    phone: this.phone,
    email: this.email,
    address: this.address || this.office_address,
    city: this.city,
    branchManager: this.branch_manager
  };
};

BranchSchema.methods.getCreator = function() {
  // Return the most appropriate creator field
  return this.createdBy || (this.created_by ? `User:${this.created_by}` : 'System');
};

// === STATIC METHODS ===
BranchSchema.statics.findByOrganization = function(organizationCode) {
  return this.find({ 
    organizationCode, 
    status: 'ACTIVE' 
  }).sort({ branchCode: 1 });
};

BranchSchema.statics.findByOrganizationAndBranch = function(organizationCode, branchCode) {
  return this.findOne({ 
    organizationCode, 
    branchCode,
    status: 'ACTIVE' 
  });
};

BranchSchema.statics.findByCreator = function(creatorIdOrName) {
  // Support both ObjectId and string creator lookup
  if (mongoose.Types.ObjectId.isValid(creatorIdOrName)) {
    return this.find({ created_by: creatorIdOrName });
  } else {
    return this.find({ createdBy: creatorIdOrName });
  }
};

BranchSchema.statics.getBranchSummary = async function(organizationCode) {
  return this.aggregate([
    {
      $match: {
        organizationCode,
        status: 'ACTIVE'
      }
    },
    {
      $group: {
        _id: '$branchType',
        count: { $sum: 1 },
        branches: {
          $push: {
            branchName: '$branchName',
            branchCode: '$branchCode',
            branchManager: '$branch_manager',
            createdBy: '$createdBy',
            createdAt: '$createdAt'
          }
        }
      }
    },
    {
      $project: {
        branchType: '$_id',
        count: 1,
        branches: 1,
        _id: 0
      }
    },
    {
      $sort: { branchType: 1 }
    }
  ]);
};

BranchSchema.statics.getCreatorSummary = async function(organizationCode) {
  return this.aggregate([
    {
      $match: {
        organizationCode,
        status: 'ACTIVE'
      }
    },
    {
      $group: {
        _id: {
          createdBy: '$createdBy',
          created_by: '$created_by'
        },
        branchCount: { $sum: 1 },
        branches: {
          $push: {
            branchName: '$branchName',
            branchCode: '$branchCode'
          }
        }
      }
    },
    {
      $project: {
        creator: {
          $cond: {
            if: { $ne: ['$_id.createdBy', null] },
            then: '$_id.createdBy',
            else: { $concat: ['User:', { $toString: '$_id.created_by' }] }
          }
        },
        branchCount: 1,
        branches: { $slice: ['$branches', 5] }, // Limit to 5 branches per creator
        _id: 0
      }
    },
    {
      $sort: { branchCount: -1 }
    }
  ]);
};

// === QUERY HELPERS ===
BranchSchema.query.active = function() {
  return this.where({ status: 'ACTIVE' });
};

BranchSchema.query.byOrganization = function(organizationCode) {
  return this.where({ organizationCode });
};

BranchSchema.query.byBranchType = function(branchType) {
  return this.where({ branchType });
};

BranchSchema.query.byCreator = function(creator) {
  // Support querying by either created_by (ObjectId) or createdBy (String)
  if (mongoose.Types.ObjectId.isValid(creator)) {
    return this.where({ created_by: creator });
  } else {
    return this.where({ createdBy: creator });
  }
};

export default mongoose.model('Branch', BranchSchema);