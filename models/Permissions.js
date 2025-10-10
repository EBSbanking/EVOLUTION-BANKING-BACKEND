import mongoose from 'mongoose';
import { PERMISSIONS } from '../constants/permissions.js'; // Import PERMISSIONS constant

const permissionsSchema = new mongoose.Schema({
  BU_ROLE_ID: {
    type: Number,
    required: true,
    unique: true, // Enforces unique BU_ROLE_ID
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
  VAULT_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  DRAWER_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  TXN_ENQUIRY_ACCESS_LVL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  CREDIT_APPL_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  CUSTOMER_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  ACCOUNT_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  REPORT_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  WF_ITEM_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  CUST_POSTING_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  GL_POSTING_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  FIXED_ASSET_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  LOAN_FEE_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  LOAN_OPERATIONS_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  PERMISSION_MANAGEMENT_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  SYSTEM_ADMIN_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  DASHBOARD_ACCESS_LEVEL: {
    type: String,
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU',
    required: true,
  },
  permissions: [{
    type: String,
    enum: Object.values(PERMISSIONS).flatMap(category => Object.values(category)),
  }],
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
      transactions: this.TXN_ENQUIRY_ACCESS_LVL,
      reports: this.REPORT_ACCESS_LEVEL,
      dashboard: this.DASHBOARD_ACCESS_LEVEL,
      customerPosting: this.CUST_POSTING_ACCESS_LEVEL,
      glPosting: this.GL_POSTING_ACCESS_LEVEL,
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
      workflow: this.WF_ITEM_ACCESS_LEVEL,
      granularPermissions: this.permissions,
    },
  };
});

const Permissions = mongoose.model('Permissions', permissionsSchema);
export default Permissions;