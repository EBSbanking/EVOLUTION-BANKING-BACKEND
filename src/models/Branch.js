import mongoose from 'mongoose';

const branchSchema = new mongoose.Schema({
  // Core new fields (required for new creates)
  organizationName: {
    type: String,
    trim: true,
    uppercase: true, // Auto-uppercase for consistency
    required: false // Make optional for legacy data; enforce in controller if needed
  },
  branchName: {
    type: String,
    required: true, // Always required; map from 'name' in legacy
    trim: true,
    uppercase: true // Auto-uppercase
  },
  branchCode: {
    type: String,
    required: false, // Optional for legacy; generate in migration/controller (e.g., '000' for Head Office)
    trim: true,
    match: [/^\d{3}$/, 'Branch code must be a 3-digit number'],
    index: true // For fast lookups
  },

  // Address field (aligned with BusinessUnit's ADDRESS; optional for legacy)
  address: {
    type: String,
    trim: true,
    default: ''
  },

  // Legacy migrated fields (optional; populate from existing data)
  external_id: {
    type: String,
    default: '',
    trim: true
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId, // Or Number if legacy is int (e.g., 1)
    ref: 'ParentModel', // Adjust if parent is another model
    default: null
  },
  office_address: {
    type: String,
    trim: true,
    default: ''
  },
  country: {
    type: Number, // Or ref to Country model
    default: null
  },
  state: {
    type: Number, // Or ref
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
    enum: ['Yes', 'No'], // Based on legacy example
    default: 'No'
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'INACTIVE'], // All caps to match uppercase: true
    default: 'ACTIVE',  // All caps default
    uppercase: true
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId, // Or Number (legacy 1)
    ref: 'User',
    default: null
  },
  operational_model: {
    type: String,
    default: 'Cash' // Legacy example
  },
  approved_by: {
    type: mongoose.Schema.Types.ObjectId, // Or Number (legacy 1)
    ref: 'User',
    default: null
  },
  migration_id: {
    type: mongoose.Schema.Types.ObjectId, // For tracking original legacy _id
    default: null,
    index: true // Unique if needed for dedup
  },

  // Timestamps (for both new and legacy)
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  strict: 'throw', // Strict mode, but legacy docs can be fetched; use migration to update
  timestamps: false // Manual control via createdAt/updatedAt
});

// Indexes for performance (align with queries in controller)
branchSchema.index({ organizationName: 1, branchName: 1 });
branchSchema.index({ branchCode: 1 });
branchSchema.index({ status: 1 });
branchSchema.index({ migration_id: 1 }); // For legacy lookup

// Virtual or method to generate branchCode if missing (e.g., for Head Office)
branchSchema.methods.generateBranchCode = function() {
  if (this.branchCode) return this.branchCode;
  // Simple mapping based on name (customize as needed)
  const codeMap = {
    'HEAD OFFICE': '000',
    // Add more: 'FINANCE': '002', etc.
  };
  return codeMap[this.branchName.toUpperCase()] || '999'; // Fallback
};

// Pre-save hook to auto-generate branchCode if missing and set organizationName default
branchSchema.pre('save', function(next) {
  if (!this.organizationName) {
    this.organizationName = 'DEFAULT_ORG'; // Or derive from other fields/context
  }
  if (!this.branchCode) {
    this.branchCode = this.generateBranchCode();
  }
  // Optional: Sync address from office_address if address is empty
  if (!this.address && this.office_address) {
    this.address = this.office_address.trim();
  }
  if (this.isModified()) {
    this.updatedAt = new Date();
  }
  next();
});

export default mongoose.model('Branch', branchSchema);