// config/userRole.js - FULLY CORRECTED VERSION
// This file seeds initial user role data into the database

import { Op } from 'sequelize';
import Permissions from '../models/Permissions.js';
import UserRole from '../models/UserRole.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';

const allBusinessUnitOnly = ['ALL BUSINESS UNIT'];
const defaultAccessLevels = [
  'ALL BUSINESS UNIT',
  'OWN BUSINESS UNIT',
  'PARENT BUSINESS UNIT STRUCTURE'
];

const defaultPermissions = {
  DRAWER_ACCESS_LEVEL: defaultAccessLevels,
  CUST_POSTING_ACCESS_LEVEL: defaultAccessLevels,
  GL_POSTING_ACCESS_LEVEL: defaultAccessLevels,
  TXN_ENQUIRY_ACCESS_LVL: defaultAccessLevels,
  FIXED_ASSET_ACCESS_LEVEL: defaultAccessLevels,
  REPORT_ACCESS_LEVEL: defaultAccessLevels,
  DASHBOARD_ACCESS_LEVEL: defaultAccessLevels,
  CREDIT_APPL_ACCESS_LEVEL: defaultAccessLevels,
  CUSTOMER_ACCESS_LEVEL: defaultAccessLevels,
  ACCOUNT_ACCESS_LEVEL: defaultAccessLevels
};

export const userRoles = [
  {
    id: 1,
    ROLE_NM: 'Administrator',
    SUPERVISOR_FG: 'Y',
    permissions: {
      DRAWER_ACCESS_LEVEL: allBusinessUnitOnly,
      CUST_POSTING_ACCESS_LEVEL: allBusinessUnitOnly,
      GL_POSTING_ACCESS_LEVEL: allBusinessUnitOnly,
      TXN_ENQUIRY_ACCESS_LVL: allBusinessUnitOnly,
      FIXED_ASSET_ACCESS_LEVEL: allBusinessUnitOnly,
      REPORT_ACCESS_LEVEL: allBusinessUnitOnly,
      DASHBOARD_ACCESS_LEVEL: allBusinessUnitOnly,
      CREDIT_APPL_ACCESS_LEVEL: allBusinessUnitOnly,
      CUSTOMER_ACCESS_LEVEL: allBusinessUnitOnly,
      ACCOUNT_ACCESS_LEVEL: allBusinessUnitOnly,
      // ✅ Changed from BU_ROLE_ID to role_id
      role_id: 1,
      ...ROLE_MAPPING[1].permissions
    }
  },
  {
    id: 29,
    ROLE_NM: 'Teller',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 29, ...ROLE_MAPPING[29].permissions }
  },
  {
    id: 34,
    ROLE_NM: 'Customer Service Officer',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 34, ...ROLE_MAPPING[34].permissions }
  },
  {
    id: 2,
    ROLE_NM: 'Head Banking Services',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 2, ...ROLE_MAPPING[2].permissions }
  },
  {
    id: 3,
    ROLE_NM: 'Loan Processing Officer',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 3, ...ROLE_MAPPING[3].permissions }
  },
  {
    id: 4,
    ROLE_NM: 'Senior Financial Accountant',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 4, ...ROLE_MAPPING[4].permissions }
  },
  {
    id: 5,
    ROLE_NM: 'Internal Control Officer',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 5, ...ROLE_MAPPING[5].permissions }
  },
  {
    id: 6,
    ROLE_NM: 'Internal Control Manager',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 6, ...ROLE_MAPPING[6].permissions }
  },
  {
    id: 7,
    ROLE_NM: 'Head of Credit',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 7, ...ROLE_MAPPING[7].permissions }
  },
  {
    id: 8,
    ROLE_NM: 'Internal Audit Manager',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 8, ...ROLE_MAPPING[8].permissions }
  },
  {
    id: 9,
    ROLE_NM: 'Head Human Resources',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 9, ...ROLE_MAPPING[9].permissions }
  },
  {
    id: 10,
    ROLE_NM: 'Human Resource Officer',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 10, ...ROLE_MAPPING[10].permissions }
  },
  {
    id: 11,
    ROLE_NM: 'IT Manager',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 11, ...ROLE_MAPPING[11].permissions }
  },
  {
    id: 12,
    ROLE_NM: 'Financial Accountant',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 12, ...ROLE_MAPPING[12].permissions }
  },
  {
    id: 13,
    ROLE_NM: 'Financial Accountant Manager',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 13, ...ROLE_MAPPING[13].permissions }
  },
  {
    id: 14,
    ROLE_NM: 'Chief Financial Officer',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 14, ...ROLE_MAPPING[14].permissions }
  },
  {
    id: 15,
    ROLE_NM: 'Chief Executive Officer',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 15, ...ROLE_MAPPING[15].permissions }
  },
  {
    id: 16,
    ROLE_NM: 'Treasurer',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 16, ...ROLE_MAPPING[16].permissions }
  },
  {
    id: 17,
    ROLE_NM: 'Loan Processing Supervisor',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 17, ...ROLE_MAPPING[17].permissions }
  },
  {
    id: 18,
    ROLE_NM: 'Senior Financial Accountant',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 18, ...ROLE_MAPPING[18].permissions }
  },
  {
    id: 19,
    ROLE_NM: 'Branch Manager',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 19, ...ROLE_MAPPING[19].permissions }
  },
  {
    id: 20,
    ROLE_NM: 'Branch Operation Supervisor',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 20, ...ROLE_MAPPING[20].permissions }
  },
  {
    id: 21,
    ROLE_NM: 'Chief Operation Officer',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 21, ...ROLE_MAPPING[21].permissions }
  },
  {
    id: 22,
    ROLE_NM: 'Marketing Manager',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 22, ...ROLE_MAPPING[22].permissions }
  },
  {
    id: 23,
    ROLE_NM: 'Payment and Reconciliation USD',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 23, ...ROLE_MAPPING[23].permissions }
  },
  {
    id: 24,
    ROLE_NM: 'EOD Operator',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 24, ...ROLE_MAPPING[24].permissions }
  },
  {
    id: 25,
    ROLE_NM: 'Recovery Officer',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 25, ...ROLE_MAPPING[25].permissions }
  },
  {
    id: 26,
    ROLE_NM: 'Relationship Development Officer',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 26, ...ROLE_MAPPING[26].permissions }
  },
  {
    id: 27,
    ROLE_NM: 'Customer Relationship Officer',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 27, ...ROLE_MAPPING[27].permissions }
  },
  {
    id: 28,
    ROLE_NM: 'Customer Service Officer',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 28, ...ROLE_MAPPING[28].permissions }
  },
  {
    id: 30,
    ROLE_NM: 'Head Teller',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 30, ...ROLE_MAPPING[30].permissions }
  },
  {
    id: 31,
    ROLE_NM: 'Customer Relationship Supervisor',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 31, ...ROLE_MAPPING[31].permissions }
  },
  {
    id: 32,
    ROLE_NM: 'Recovery Team Lead',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 32, ...ROLE_MAPPING[32].permissions }
  },
  {
    id: 33,
    ROLE_NM: 'Business Analyst',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 33, ...ROLE_MAPPING[33].permissions }
  },
  {
    id: 34,
    ROLE_NM: 'Credit Risk Analyst',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 34, ...ROLE_MAPPING[34].permissions }
  },
  {
    id: 35,
    ROLE_NM: 'Head of Digital Banking',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 35, ...ROLE_MAPPING[35].permissions }
  },
  {
    id: 36,
    ROLE_NM: 'Agency Banking Officer',
    SUPERVISOR_FG: 'N',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 36, ...ROLE_MAPPING[36].permissions }
  },
  {
    id: 37,
    ROLE_NM: 'Channel Manager',
    SUPERVISOR_FG: 'Y',
    // ✅ Changed from BU_ROLE_ID to role_id
    permissions: { ...defaultPermissions, role_id: 37, ...ROLE_MAPPING[37].permissions }
  }
];

export const ROLE_MAPPING_LOCAL = userRoles.reduce((acc, role) => {
  acc[role.id.toString()] = role;
  return acc;
}, {});

export async function saveUserRoles(USER_ID, BU_ID = 'BU001', Business_Unit = 'BRANCH_001') {
  for (const role of userRoles) {
    const existingRole = await UserRole.findOne({ 
      where: { 
        ROLE_NM: role.ROLE_NM, 
        Business_Unit: Business_Unit 
      } 
    });
    
    if (existingRole) {
      continue;
    }
    
    // ✅ Changed from BU_ROLE_ID to role_id
    const permissions = new Permissions({
      role_id: role.id,  // Changed from BU_ROLE_ID
      ROLE_NAME: role.ROLE_NM,
      ...role.permissions
    });
    await permissions.save();
    
    const userRole = new UserRole({
      role_id: role.id,  // Changed from USER_ROLE_ID to role_id
      ROLE_NM: role.ROLE_NM,
      SYSUSER_ID: await generateSysUserId(),
      Business_Unit: Business_Unit,
      BU_ID: BU_ID,
      user_id: USER_ID,  // Changed from USER_ID to user_id
      CREATED_BY: 'administrator',
      // permissions: permissions._id, // Remove if not in your schema
      EFF_FROM_DT: new Date(),
      EFF_TO_DT: null,
      DEF_ROLE_FG: 'N',
      SUPERVISOR_FG: role.SUPERVISOR_FG || 'N',
      MULTI_CRNCY_FG: 'N',
      WF_ITEM_ACCESS_LEVEL: defaultAccessLevels,
      VAULT_ACCESS_LEVEL: defaultAccessLevels,
      DRAWER_ACCESS_LEVEL: defaultAccessLevels,
      TXN_ENQUIRY_ACCESS_LVL: defaultAccessLevels,
      CREDIT_APPL_ACCESS_LEVEL: defaultAccessLevels,
      CUSTOMER_ACCESS_LEVEL: defaultAccessLevels,
      ACCOUNT_ACCESS_LEVEL: defaultAccessLevels,
      REC_ST: 'A',  // Changed from 'Y' to 'A' to match schema
      VERSION_NO: 1,
      ROW_TS: new Date(),
      CREATE_DT: new Date()
    });
    await userRole.save();
  }
}

async function generateSysUserId() {
  const lastEntry = await UserRole.findOne({
    order: [['SYSUSER_ID', 'DESC']],
    attributes: ['SYSUSER_ID']
  });
  
  let nextId = 1;
  if (lastEntry && lastEntry.SYSUSER_ID) {
    const parsed = parseInt(lastEntry.SYSUSER_ID, 10);
    if (!isNaN(parsed)) {
      nextId = parsed + 1;
    }
  }
  if (nextId > 999) {
    throw new Error("SYSUSER_ID limit reached (max 999).");
  }
  return String(nextId).padStart(3, "0");
}

export default userRoles;