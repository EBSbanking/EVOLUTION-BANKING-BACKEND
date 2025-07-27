import Permissions from '../models/Permissions.js';

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
      BU_ROLE_ID: 1
    }
  },
  {
    id: 29,
    ROLE_NM: 'Teller',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 29 }
  },
  {
    id: 34,
    ROLE_NM: 'Customer Service Officer',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 34 }
  },
  {
    id: 2,
    ROLE_NM: 'Head Banking Services',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 2 }
  },
  {
    id: 3,
    ROLE_NM: 'Loan Processing Officer',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 3 }
  },
  {
    id: 4,
    ROLE_NM: 'Senior Financial Accountant',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 4 }
  },
  {
    id: 5,
    ROLE_NM: 'Internal Control Officer',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 5 }
  },
  {
    id: 6,
    ROLE_NM: 'Internal Control Manager',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 6 }
  },
  {
    id: 7,
    ROLE_NM: 'Head of Credit',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 7 }
  },
  {
    id: 8,
    ROLE_NM: 'Internal Audit Manager',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 8 }
  },
  {
    id: 9,
    ROLE_NM: 'Head Human Resources',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 9 }
  },
  {
    id: 10,
    ROLE_NM: 'Human Resource Officer',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 10 }
  },
  {
    id: 11,
    ROLE_NM: 'IT Manager',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 11 }
  },
  {
    id: 12,
    ROLE_NM: 'Financial Accountant',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 12 }
  },
  {
    id: 13,
    ROLE_NM: 'Financial Accountant Manager',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 13 }
  },
  {
    id: 14,
    ROLE_NM: 'Chief Financial Officer',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 14 }
  },
  {
    id: 15,
    ROLE_NM: 'Chief Executive Officer',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 15 }
  },
  {
    id: 16,
    ROLE_NM: 'Treasurer',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 16 }
  },
  {
    id: 17,
    ROLE_NM: 'Loan Processing Supervisor',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 17 }
  },
  {
    id: 18,
    ROLE_NM: 'Senior Financial Accountant',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 18 }
  },
  {
    id: 19,
    ROLE_NM: 'Branch Manager',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 19 }
  },
  {
    id: 20,
    ROLE_NM: 'Branch Operation Supervisor',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 20 }
  },
  {
    id: 21,
    ROLE_NM: 'Chief Operation Officer',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 21 }
  },
  {
    id: 22,
    ROLE_NM: 'Marketing Manager',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 22 }
  },
  {
    id: 23,
    ROLE_NM: 'Payment and Reconciliation USD',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 23 }
  },
  {
    id: 24,
    ROLE_NM: 'EOD Operator',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 24 }
  },
  {
    id: 25,
    ROLE_NM: 'Recovery Officer',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 25 }
  },
  {
    id: 26,
    ROLE_NM: 'Relationship Development Officer',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 26 }
  },
  {
    id: 27,
    ROLE_NM: 'Customer Relationship Officer',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 27 }
  },
  {
    id: 28,
    ROLE_NM: 'Customer Service Officer',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 28 }
  },
  {
    id: 29,
    ROLE_NM: 'Teller',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 29 }
  },
  {
    id: 30,
    ROLE_NM: 'Head Teller',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 30 }
  },
  {
    id: 31,
    ROLE_NM: 'Customer Relationship Supervisor',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 31 }
  },
  {
    id: 32,
    ROLE_NM: 'Recovery Team Lead',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 32 }
  },
  {
    id: 33,
    ROLE_NM: 'Business Analyst',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 33 }
  },
  {
    id: 34,
    ROLE_NM: 'Credit Risk Analyst',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 34 }
  },
  {
    id: 35,
    ROLE_NM: 'Head of Digital Banking',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 35 }
  },
  {
    id: 36,
    ROLE_NM: 'Agency Banking Officer',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 36 }
  },
  {
    id: 37,
    ROLE_NM: 'Channel Manager',
    permissions: { ...defaultPermissions, BU_ROLE_ID: 37 }
  }
];

/// ✅ Convert userRoles into a lookup map
export const ROLE_MAPPING = userRoles.reduce((acc, role) => {
  acc[role.id.toString()] = role;
  return acc;
}, {});

/// ✅ Save all user roles dynamically (optional utility)
export async function saveUserRoles(USER_ID) {
  for (const role of userRoles) {
    const permissions = new Permissions(role.permissions);
    await permissions.save();

    const userRole = new UserRole({
      USER_ROLE_ID: role.id,
      ROLE_NM: role.ROLE_NM,
      SYSUSER_ID: '', // Replace with actual logic if needed
      BU_ROLE_ID: role.id,
      USER_ID: USER_ID,
      CREATED_BY: 'administrator',
      permissions: permissions._id,
      EFF_FROM_DT: new Date(),
      EFF_TO_DT: null,
      DEF_ROLE_FG: 'N',
      SUPERVISOR_FG: 'Y',
      MULTI_CRNCY_FG: 'N',
      WF_ITEM_ACCESS_LEVEL: defaultAccessLevels,
      VAULT_ACCESS_LEVEL: defaultAccessLevels,
      DRAWER_ACCESS_LEVEL: defaultAccessLevels,
      TXN_ENQUIRY_ACCESS_LVL: defaultAccessLevels,
      CREDIT_APPL_ACCESS_LEVEL: defaultAccessLevels,
      CUSTOMER_ACCESS_LEVEL: defaultAccessLevels,
      ACCOUNT_ACCESS_LEVEL: defaultAccessLevels,
      REC_ST: 'Y',
      VERSION_NO: 1,
      ROW_TS: new Date(),
      CREATE_DT: new Date()
    });

    await userRole.save();
  }
}

export default userRoles;
