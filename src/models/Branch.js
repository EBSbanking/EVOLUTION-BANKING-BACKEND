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
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
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
            branchManager: '$branch_manager'
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

export default mongoose.model('Branch', BranchSchema);