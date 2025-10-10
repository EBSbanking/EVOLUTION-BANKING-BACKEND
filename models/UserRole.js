import mongoose from 'mongoose';
import Permissions from '../models/Permissions.js';
import RoleMapping from '../models/RoleMapping.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';

const userRoleSchema = new mongoose.Schema({
  ROLE_NM: { type: String, required: true }, // Role name
  SYSUSER_ID: { type: String, required: true }, // System user ID
  Business_Unit: { type: String, required: true }, // Business unit name
  BU_ID: { type: String, required: true }, // Added BU_ID field to match payload
  USER_ROLE_ID: {
    type: Number,
    required: true,
    unique: true, // Ensure uniqueness to avoid duplicate key errors
    ref: 'RoleMapping', // Reference to RoleMapping model
  },
  EFF_FROM_DT: {
    type: Date,
    required: true,
    set: (value) => new Date(value), // Ensure proper date format
  },
  EFF_TO_DT: { type: Date, default: null },
  DEF_ROLE_FG: { type: String, enum: ['Y', 'N'], default: 'N', required: true },
  SUPERVISOR_FG: { type: String, enum: ['Y', 'N'], default: 'N', required: true },
  MULTI_CRNCY_FG: { type: String, enum: ['Y', 'N'], default: 'N', required: true },
  WF_ITEM_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  REC_ST: { type: String, enum: ['Y', 'N', 'A'], default: 'A', required: true },
  VERSION_NO: { type: Number, default: 1 },
  ROW_TS: { type: Date, default: Date.now },
  USER_ID: { type: String, required: true },
  CREATE_DT: { type: Date, default: Date.now },
  CREATED_BY: { type: String, required: true },
  permissions: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Permissions',
  },
  VAULT_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  DRAWER_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  TXN_ENQUIRY_ACCESS_LVL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  CREDIT_APPL_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  CUSTOMER_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  ACCOUNT_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  REPORT_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  CUST_POSTING_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  GL_POSTING_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  FIXED_ASSET_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  LOAN_FEE_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  LOAN_OPERATIONS_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  PERMISSION_MANAGEMENT_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  SYSTEM_ADMIN_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
  DASHBOARD_ACCESS_LEVEL: { 
    type: String, 
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: 'BU', 
    required: true 
  },
});

// Ensure unique index on BU_ID and USER_ROLE_ID combination
userRoleSchema.index({ BU_ID: 1, USER_ROLE_ID: 1 }, { unique: true });

// Virtual: Role Name + Business Unit
userRoleSchema.virtual('UserRoleName').get(function () {
  const roleName = this.ROLE_NM || ROLE_MAPPING[String(this.USER_ROLE_ID)]?.ROLE_NM || 'Unknown Role';
  return `${roleName}, ${this.Business_Unit}`;
});

const UserRole = mongoose.model('UserRole', userRoleSchema);

export default UserRole;