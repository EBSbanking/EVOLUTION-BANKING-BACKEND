import mongoose from 'mongoose';
import { PERMISSIONS } from '../constants/permissions.js';

const permissionsSchema = new mongoose.Schema({
  BU_ROLE_ID: {
    type: Number,
    required: true,
    unique: true,
    index: true,
  },
  ROLE_NAME: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100,
  },
  DESCRIPTION: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  IS_ACTIVE: {
    type: Boolean,
    default: true,
  },
  
  // ✅ CORRECTED: Store actual permission strings as arrays
  DRAWER_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.DRAWER || {})
  }],
  CUSTOMER_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.CUSTOMER || {})
  }],
  ACCOUNT_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.ACCOUNT || {})
  }],
  TRANSACTION_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.TRANSACTION || {})
  }],
  DASHBOARD_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.DASHBOARD || {})
  }],
  REPORT_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.REPORT || {})
  }],
  THRIFT_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.THRIFT || {})
  }],
  LOAN_OPERATIONS_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.LOAN_OPERATIONS || {})
  }],
  LOAN_FEE_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.LOAN_FEE || {})
  }],
  POSTING_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.POSTING || {})
  }],
  FIXED_ASSET_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.FIXED_ASSET || {})
  }],
  SYSTEM_ADMIN_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.SYSTEM_ADMIN || {})
  }],
  PERMISSION_MANAGEMENT_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.PERMISSION_MANAGEMENT || {})
  }],
  CREDIT_APPL_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.CREDIT_APPL || {})
  }],
  APPROVAL_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.APPROVAL || {})
  }],
  TREASURY_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.TREASURY || {})
  }],
  OPERATIONS_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.OPERATIONS || {})
  }],
  WORKFLOW_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.WORKFLOW || {})
  }],
  AML_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.AML || {})
  }],
  BUSINESS_UNIT_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.BUSINESS_UNIT || {})
  }],
  SECURITY_PROFILE_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.SECURITY_PROFILE || {})
  }],
  DEPOSIT_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.DEPOSIT || {})
  }],
  GUARANTOR_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.GUARANTOR || {})
  }],
  RATE_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.RATE || {})
  }],
  PRODUCT_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.PRODUCT || {})
  }],
  HOLIDAY_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.HOLIDAY || {})
  }],
  MARKETING_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.MARKETING || {})
  }],
  AGENCY_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.AGENCY || {})
  }],
  ANALYTICS_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.ANALYTICS || {})
  }],
  RISK_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.RISK || {})
  }],
  RECONCILIATION_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.RECONCILIATION || {})
  }],
  PERFORMANCE_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.PERFORMANCE || {})
  }],
  STATISTICS_ACCESS_LEVEL: [{
    type: String,
    enum: Object.values(PERMISSIONS.STATISTICS || {})
  }],

  // Remove the old permissions array since we're using the access level fields
  // permissions: [{
  //   type: String,
  //   enum: Object.values(PERMISSIONS).flatMap(category => Object.values(category)),
  // }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Add indexes for frequently queried fields
permissionsSchema.index({ BU_ROLE_ID: 1, IS_ACTIVE: 1 });

// Virtual for formatted permissions
permissionsSchema.virtual('formattedPermissions').get(function () {
  return {
    roleId: this.BU_ROLE_ID,
    roleName: this.ROLE_NAME,
    permissions: {
      drawer: this.DRAWER_ACCESS_LEVEL,
      customer: this.CUSTOMER_ACCESS_LEVEL,
      account: this.ACCOUNT_ACCESS_LEVEL,
      transactions: this.TRANSACTION_ACCESS_LEVEL,
      reports: this.REPORT_ACCESS_LEVEL,
      dashboard: this.DASHBOARD_ACCESS_LEVEL,
      posting: this.POSTING_ACCESS_LEVEL,
      fixedAsset: this.FIXED_ASSET_ACCESS_LEVEL,
      loans: {
        fees: this.LOAN_FEE_ACCESS_LEVEL,
        operations: this.LOAN_OPERATIONS_ACCESS_LEVEL,
      },
      creditApplication: this.CREDIT_APPL_ACCESS_LEVEL,
      system: {
        admin: this.SYSTEM_ADMIN_ACCESS_LEVEL,
        permissionManagement: this.PERMISSION_MANAGEMENT_ACCESS_LEVEL,
      },
      thrift: this.THRIFT_ACCESS_LEVEL,
      approval: this.APPROVAL_ACCESS_LEVEL,
      treasury: this.TREASURY_ACCESS_LEVEL,
      operations: this.OPERATIONS_ACCESS_LEVEL,
      workflow: this.WORKFLOW_ACCESS_LEVEL,
      aml: this.AML_ACCESS_LEVEL,
      businessUnit: this.BUSINESS_UNIT_ACCESS_LEVEL,
      securityProfile: this.SECURITY_PROFILE_ACCESS_LEVEL,
      deposit: this.DEPOSIT_ACCESS_LEVEL,
      guarantor: this.GUARANTOR_ACCESS_LEVEL,
      rate: this.RATE_ACCESS_LEVEL,
      product: this.PRODUCT_ACCESS_LEVEL,
      holiday: this.HOLIDAY_ACCESS_LEVEL,
      marketing: this.MARKETING_ACCESS_LEVEL,
      agency: this.AGENCY_ACCESS_LEVEL,
      analytics: this.ANALYTICS_ACCESS_LEVEL,
      risk: this.RISK_ACCESS_LEVEL,
      reconciliation: this.RECONCILIATION_ACCESS_LEVEL,
      performance: this.PERFORMANCE_ACCESS_LEVEL,
      statistics: this.STATISTICS_ACCESS_LEVEL,
    },
  };
});

const Permissions = mongoose.model('Permissions', permissionsSchema);
export default Permissions;