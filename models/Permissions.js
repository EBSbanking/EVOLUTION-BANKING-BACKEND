// models/Permissions.js
import mongoose from 'mongoose';

const PermissionsSchema = new mongoose.Schema({
  // Core system permissions
  DRAWER_ACCESS_LEVEL: [String],
  CUST_POSTING_ACCESS_LEVEL: [String],
  GL_POSTING_ACCESS_LEVEL: [String],
  TXN_ENQUIRY_ACCESS_LVL: [String],
  FIXED_ASSET_ACCESS_LEVEL: [String],
  REPORT_ACCESS_LEVEL: [String],
  DASHBOARD_ACCESS_LEVEL: [String],
  CREDIT_APPL_ACCESS_LEVEL: [String],
  CUSTOMER_ACCESS_LEVEL: [String],
  ACCOUNT_ACCESS_LEVEL: [String],
  
  // Loan operations
  LOAN_FEE_ACCESS_LEVEL: [String],
  LOAN_OPERATIONS_ACCESS_LEVEL: [String],
  
  // Permission management
  PERMISSION_MANAGEMENT_ACCESS_LEVEL: [String],
  
  // System administration
  SYSTEM_ADMIN_ACCESS_LEVEL: [String],
  
  // Role identification
  BU_ROLE_ID: {
    type: Number,
    required: true,
    unique: true,
    index: true
  },
  
  // Role metadata
  ROLE_NAME: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  
  DESCRIPTION: {
    type: String,
    trim: true,
    maxlength: 500
  },
  
  IS_ACTIVE: {
    type: Boolean,
    default: true
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Add index for frequently queried fields
PermissionsSchema.index({ BU_ROLE_ID: 1, IS_ACTIVE: 1 });

// Virtual for formatted permissions
PermissionsSchema.virtual('formattedPermissions').get(function() {
  return {
    roleId: this.BU_ROLE_ID,
    roleName: this.ROLE_NAME,
    permissions: {
      drawer: this.DRAWER_ACCESS_LEVEL,
      customer: this.CUSTOMER_ACCESS_LEVEL,
      loans: {
        fees: this.LOAN_FEE_ACCESS_LEVEL,
        operations: this.LOAN_OPERATIONS_ACCESS_LEVEL
      },
      system: {
        admin: this.SYSTEM_ADMIN_ACCESS_LEVEL,
        permissionManagement: this.PERMISSION_MANAGEMENT_ACCESS_LEVEL
      }
    }
  };
});

const Permissions = mongoose.model('Permissions', PermissionsSchema);

export default Permissions;