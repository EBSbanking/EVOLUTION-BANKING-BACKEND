import mongoose from 'mongoose';
import Permissions from '../models/Permissions.js';
import RoleMapping from '../models/RoleMapping.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';

const userRoleSchema = new mongoose.Schema({
  ROLE_NM: { type: String, required: true }, // Role name
  SYSUSER_ID: { type: String, required: true }, // System user ID
  Business_Unit: { type: String, required: true }, // Business unit name
  BU_ID: { type: String, required: true },
  
  // ✅ Support multiple roles
  USER_ROLE_IDS: {
    type: [Number], // Array of role IDs
    required: true,
    ref: 'RoleMapping',
  },
  
  // ✅ Support multiple role names
  ROLE_NMS: {
    type: [String], // Array of role names
    required: true,
  },
  
  EFF_FROM_DT: {
    type: Date,
    required: true,
    set: (value) => new Date(value),
  },
  EFF_TO_DT: { type: Date, default: null },
  DEF_ROLE_FG: { type: String, enum: ['Y', 'N'], default: 'N', required: true },
  SUPERVISOR_FG: { type: String, enum: ['Y', 'N'], default: 'N', required: true },
  MULTI_CRNCY_FG: { type: String, enum: ['Y', 'N'], default: 'N', required: true },
  
  WF_ITEM_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  
  REC_ST: { type: String, enum: ['Y', 'N', 'A'], default: 'A', required: true },
  VERSION_NO: { type: Number, default: 1 },
  ROW_TS: { type: Date, default: Date.now },
  
  // ✅ FIXED: Changed from ObjectId to String to match your user identifiers
  USER_ID: { type: String, required: true },
  
  CREATE_DT: { type: Date, default: Date.now },
  CREATED_BY: { type: String, required: true },
  
  // ✅ Support multiple permissions references
  permissions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Permissions',
  }],
  
  // ✅ All access levels now support combined permissions from multiple roles
  VAULT_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  DRAWER_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  TXN_ENQUIRY_ACCESS_LVL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  CREDIT_APPL_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  CUSTOMER_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  ACCOUNT_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  REPORT_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  CUST_POSTING_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  GL_POSTING_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  FIXED_ASSET_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  LOAN_FEE_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  LOAN_OPERATIONS_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  PERMISSION_MANAGEMENT_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  SYSTEM_ADMIN_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
  DASHBOARD_ACCESS_LEVEL: { 
    type: [String],
    enum: ['BU', 'OWN BUSINESS UNIT', 'ALL BUSINESS UNIT', 'ASSIGNED'],
    default: ['BU'], 
    required: true 
  },
});

// ✅ FIXED: Updated unique index to use String USER_ID
userRoleSchema.index({ BU_ID: 1, USER_ID: 1 }, { unique: true });

// ✅ Virtual for multiple roles
userRoleSchema.virtual('UserRoleNames').get(function () {
  const roleNames = this.ROLE_NMS || this.USER_ROLE_IDS.map(roleId => 
    ROLE_MAPPING[String(roleId)]?.ROLE_NM || 'Unknown Role'
  );
  return roleNames.map(roleName => `${roleName}, ${this.Business_Unit}`).join(' | ');
});

// ✅ Method to get combined permissions from all roles
userRoleSchema.methods.getCombinedPermissions = async function() {
  try {
    const permissionsDocs = await Permissions.find({ 
      BU_ROLE_ID: { $in: this.USER_ROLE_IDS } 
    }).lean();
    
    const combinedPermissions = {};
    
    permissionsDocs.forEach(doc => {
      if (doc.permissions) {
        Object.keys(doc.permissions).forEach(category => {
          if (!combinedPermissions[category]) {
            combinedPermissions[category] = [];
          }
          // Merge permissions, avoiding duplicates
          combinedPermissions[category] = [
            ...new Set([...combinedPermissions[category], ...doc.permissions[category]])
          ];
        });
      }
    });
    
    return combinedPermissions;
  } catch (error) {
    console.error('Error getting combined permissions:', error);
    return {};
  }
};

// ✅ Method to check if user has any of the given roles
userRoleSchema.methods.hasAnyRole = function(roleNames) {
  const userRoleNames = this.ROLE_NMS || this.USER_ROLE_IDS.map(roleId => 
    ROLE_MAPPING[String(roleId)]?.ROLE_NM
  ).filter(Boolean);
  
  return roleNames.some(roleName => userRoleNames.includes(roleName));
};

// ✅ Method to check if user has all of the given roles
userRoleSchema.methods.hasAllRoles = function(roleNames) {
  const userRoleNames = this.ROLE_NMS || this.USER_ROLE_IDS.map(roleId => 
    ROLE_MAPPING[String(roleId)]?.ROLE_NM
  ).filter(Boolean);
  
  return roleNames.every(roleName => userRoleNames.includes(roleName));
};

// ✅ Static method to find users by role
userRoleSchema.statics.findByRole = function(roleName) {
  return this.find({
    $or: [
      { ROLE_NMS: roleName },
      { USER_ROLE_IDS: { $in: Object.keys(ROLE_MAPPING).filter(key => ROLE_MAPPING[key].ROLE_NM === roleName).map(Number) } }
    ]
  });
};

// ✅ Static method to find user roles by user ID (string)
userRoleSchema.statics.findByUserId = function(userId) {
  return this.find({ USER_ID: userId });
};

// ✅ Static method to find user roles by business unit and user ID
userRoleSchema.statics.findByBusinessUnitAndUserId = function(buId, userId) {
  return this.findOne({ BU_ID: buId, USER_ID: userId });
};

const UserRole = mongoose.model('UserRole', userRoleSchema);

export default UserRole;