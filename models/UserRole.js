import mongoose from 'mongoose';
import Permissions from '../models/Permissions.js';
import RoleMapping from '../models/RoleMapping.js';


const userRoleSchema = new mongoose.Schema({
  ROLE_NM: { type: Number, required: true },
  SYSUSER_ID: { type: String, required: true },
  Business_Unit: {type: String, required: true},
  ROLE_ID: { 
    type: Number, 
    required: true,
    ref: 'RoleMapping', // Reference to RoleMapping model
  },
  EFF_FROM_DT: { 
    type: Date, 
    required: true,
    set: (value) => {
      // Ensure the date is parsed and stored correctly
      return new Date(value);
    }
  },
  EFF_TO_DT: { type: Date, default: null },
  DEF_ROLE_FG: { type: String, default: 'N', required: true },
  SUPERVISOR_FG: { type: String, default: 'N', required: true },
  MULTI_CRNCY_FG: { type: String, default: 'N', required: true },
  WF_ITEM_ACCESS_LEVEL: { type: String, default: 'BU', required: true },
  REC_ST: { type: String, default: 'Y', required: true },
  VERSION_NO: { type: Number, default: 1 },
  ROW_TS: { type: Date, default: Date.now },
  USER_ID: { type: String, required: true },
  CREATE_DT: { type: Date, default: Date.now },
  CREATED_BY: { type: String, required: true },
  permissions: { type: mongoose.Schema.Types.ObjectId, ref: 'Permissions' },
  VAULT_ACCESS_LEVEL: { type: String, default: 'BU', required: true },
  DRAWER_ACCESS_LEVEL: { type: String, default: 'BU', required: true },
  TXN_ENQUIRY_ACCESS_LVL: { type: String, default: 'BU', required: true },
  CREDIT_APPL_ACCESS_LEVEL: { type: String, default: 'BU', required: true },
  CUSTOMER_ACCESS_LEVEL: { type: String, default: 'BU', required: true },
  ACCOUNT_ACCESS_LEVEL: { type: String, default: 'BU', required: true },
});


// Add a virtual field for concatenating UserRole and Business_Unit
userRoleSchema.virtual('UserRoleName').get(function () {
  const roleName = ROLE_MAPPING[this.BU_ROLE_ID] || "Unknown Role"; // Assuming ROLE_MAPPING is imported or available
  return `${roleName}, ${this.Business_Unit}`;
});

const UserRole = mongoose.model('UserRole', userRoleSchema);

export default UserRole;
