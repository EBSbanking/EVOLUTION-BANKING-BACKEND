import mongoose from 'mongoose';
import BusinessUnit from '../models/BusinessUnit.js';
import Permissions from '../models/Permissions.js';
import CustomerAccount from '../models/CustomerAccount.js';
import PERMISSIONS from '../constants/permissions.js';
import logger from '../utils/logger.js';

// ======================
// HELPER FUNCTIONS
// ======================
function safeGetPermissions(permissionGroup) {
  return permissionGroup && typeof permissionGroup === 'object' ? Object.values(permissionGroup).filter(p => typeof p === 'string') : [];
}

// ======================
// ROLE PERMISSION MAPPING
// ======================
export const ROLE_PERMISSION_MAPPING = {
  // 1. Administrator - Full access to ALL permissions
  1: {
    permissions: Object.keys(PERMISSIONS).reduce((acc, key) => {
      const permissionGroup = PERMISSIONS[key];
      if (typeof permissionGroup === 'object') {
        acc[`${key}_ACCESS_LEVEL`] = safeGetPermissions(permissionGroup);
      }
      return acc;
    }, {}),
  },
  // 2. Head Banking Services
  2: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.ACCOUNT),
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.APPROVE,
        PERMISSIONS.LOAN_OPERATIONS.REJECT,
      ],
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      RATE_ACCESS_LEVEL: [
        PERMISSIONS.RATE.DEPOSIT_INTEREST,
        PERMISSIONS.RATE.LOAN_INTEREST,
      ],
    },
  },
  // 3. Loan Processing Officer
  3: {
    permissions: {
      LOAN_FEE_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_FEE.VIEW,
        PERMISSIONS.LOAN_FEE.TOGGLE_STATUS,
      ],
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.DISBURSE,
        PERMISSIONS.LOAN_OPERATIONS.COLLECT,
      ],
    },
  },
  // 4. Senior Financial Accountant
  4: {
    permissions: {
      POSTING_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.POSTING),
      REPORT_ACCESS_LEVEL: [PERMISSIONS.REPORT.VIEW, PERMISSIONS.REPORT.EXPORT],
      FIXED_ASSET_ACCESS_LEVEL: [
        PERMISSIONS.FIXED_ASSET.REGISTER,
        PERMISSIONS.FIXED_ASSET.DEPRECIATE,
      ],
      RATE_ACCESS_LEVEL: [
        PERMISSIONS.RATE.DEPOSIT_INTEREST,
      ],
    },
  },
  // 5. Internal Control Officer
  5: {
    permissions: {
      REPORT_ACCESS_LEVEL: [PERMISSIONS.REPORT.VIEW],
      SYSTEM_ADMIN_ACCESS_LEVEL: [PERMISSIONS.SYSTEM_ADMIN.AUDIT_LOGS],
    },
  },
  // 6. Internal Control Manager
  6: {
    permissions: {
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      SYSTEM_ADMIN_ACCESS_LEVEL: [PERMISSIONS.SYSTEM_ADMIN.AUDIT_LOGS],
      PERMISSION_MANAGEMENT_ACCESS_LEVEL: [
        PERMISSIONS.PERMISSION_MANAGEMENT.VIEW_PERMISSIONS,
      ],
    },
  },
  // 7. Head of Credit
  7: {
    permissions: {
      LOAN_FEE_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.LOAN_FEE),
      LOAN_OPERATIONS_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.LOAN_OPERATIONS),
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      CREDIT_APPL_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CREDIT_APPL),
      RATE_ACCESS_LEVEL: [
        PERMISSIONS.RATE.LOAN_INTEREST,
        PERMISSIONS.RATE.DEPOSIT_INTEREST,
      ],
    },
  },
  // 8. Internal Audit Manager
  8: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: [PERMISSIONS.SYSTEM_ADMIN.AUDIT_LOGS],
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      PERMISSION_MANAGEMENT_ACCESS_LEVEL: [
        PERMISSIONS.PERMISSION_MANAGEMENT.VIEW_PERMISSIONS,
      ],
    },
  },
  // 9. Head Human Resources
  9: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: [PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS],
      PERMISSION_MANAGEMENT_ACCESS_LEVEL: [
        PERMISSIONS.PERMISSION_MANAGEMENT.ASSIGN_ROLES,
      ],
    },
  },
  // 10. Human Resource Officer
  10: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: [PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS],
    },
  },
  // 11. IT Manager
  11: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: [
        PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS,
        PERMISSIONS.SYSTEM_ADMIN.SYSTEM_CONFIG,
      ],
      REPORT_ACCESS_LEVEL: [PERMISSIONS.REPORT.VIEW, PERMISSIONS.REPORT.EXPORT],
    },
  },
  // 12. Financial Accountant
  12: {
    permissions: {
      POSTING_ACCESS_LEVEL: [PERMISSIONS.POSTING.CUSTOMER_POSTING, PERMISSIONS.POSTING.GL_POSTING],
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      DASHBOARD_ACCESS_LEVEL: [PERMISSIONS.DASHBOARD.VIEW],
      FIXED_ASSET_ACCESS_LEVEL: [PERMISSIONS.FIXED_ASSET.VIEW],
      RATE_ACCESS_LEVEL: [
        PERMISSIONS.RATE.DEPOSIT_INTEREST,
      ],
    },
  },
  // 13. Financial Accountant Manager
  13: {
    permissions: {
      POSTING_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.POSTING),
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      FIXED_ASSET_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.FIXED_ASSET),
      APPROVAL_ACCESS_LEVEL: [PERMISSIONS.APPROVAL.FINANCIAL],
      RATE_ACCESS_LEVEL: [
        PERMISSIONS.RATE.DEPOSIT_INTEREST,
        PERMISSIONS.RATE.INDEX,
      ],
    },
  },
  // 14. Chief Financial Officer
  14: {
    permissions: {
      POSTING_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.POSTING),
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      FIXED_ASSET_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.FIXED_ASSET),
      RATE_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.RATE),
      PERFORMANCE_ACCESS_LEVEL: [PERMISSIONS.PERFORMANCE.VIEW_METRICS], // ✅ NEW
    },
  },
  // 15. Chief Executive Officer
  15: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.SYSTEM_ADMIN),
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      APPROVAL_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.APPROVAL),
      RATE_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.RATE),
      PERFORMANCE_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.PERFORMANCE), // ✅ NEW
    },
  },
  // 16. Treasurer
  16: {
    permissions: {
      POSTING_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.POSTING),
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      TREASURY_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.TREASURY),
      RATE_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.RATE),
      PERFORMANCE_ACCESS_LEVEL: [PERMISSIONS.PERFORMANCE.VIEW_METRICS], // ✅ NEW
    },
  },
  // 17. Loan Processing Supervisor
  17: {
    permissions: {
      LOAN_OPERATIONS_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.LOAN_OPERATIONS),
      CUSTOMER_ACCESS_LEVEL: [PERMISSIONS.CUSTOMER.VIEW, PERMISSIONS.CUSTOMER.UPDATE],
      REPORT_ACCESS_LEVEL: [PERMISSIONS.REPORT.VIEW, PERMISSIONS.REPORT.EXPORT],
      RATE_ACCESS_LEVEL: [
        PERMISSIONS.RATE.LOAN_INTEREST,
      ],
    },
  },
  // 18. Senior Financial Accountant
  18: {
    permissions: {
      POSTING_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.POSTING),
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      FIXED_ASSET_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.FIXED_ASSET),
      APPROVAL_ACCESS_LEVEL: [PERMISSIONS.APPROVAL.FINANCIAL],
      RATE_ACCESS_LEVEL: [
        PERMISSIONS.RATE.DEPOSIT_INTEREST,
      ],
    },
  },
  // 19. Branch Manager
  19: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.ACCOUNT),
      LOAN_OPERATIONS_ACCESS_LEVEL: [PERMISSIONS.LOAN_OPERATIONS.APPROVE],
      APPROVAL_ACCESS_LEVEL: [PERMISSIONS.APPROVAL.CUSTOMER_RELATED],
      DASHBOARD_ACCESS_LEVEL: [
        PERMISSIONS.DASHBOARD.VIEW,
        PERMISSIONS.DASHBOARD.TRANSACTION_OVERVIEW,
        PERMISSIONS.DASHBOARD.MANAGER_DASHBOARD,
        PERMISSIONS.DASHBOARD.QUICK_ACTIONS,
        PERMISSIONS.DASHBOARD.BU_PERFORMANCE, // ✅ NEW
      ],
      DEPOSIT_ACCESS_LEVEL: [PERMISSIONS.DEPOSIT.APPROVAL],
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW,
        PERMISSIONS.REPORT.PERFORMANCE_METRICS, // ✅ NEW
      ],
      RATE_ACCESS_LEVEL: [
        PERMISSIONS.RATE.DEPOSIT_INTEREST,
      ],
      PERFORMANCE_ACCESS_LEVEL: [PERMISSIONS.PERFORMANCE.VIEW_METRICS], // ✅ NEW
    },
  },
  // 20. Branch Operation Supervisor
  20: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.ACCOUNT),
      DRAWER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DRAWER),
      APPROVAL_ACCESS_LEVEL: [PERMISSIONS.APPROVAL.CUSTOMER_RELATED],
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.VIEW,
        PERMISSIONS.LOAN_OPERATIONS.PROCESS,
      ],
      DASHBOARD_ACCESS_LEVEL: [
        PERMISSIONS.DASHBOARD.VIEW,
        PERMISSIONS.DASHBOARD.BU_PERFORMANCE, // ✅ NEW
      ],
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW,
        PERMISSIONS.REPORT.PERFORMANCE_METRICS, // ✅ NEW
      ],
    },
  },
  // 21. Chief Operation Officer
  21: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: [PERMISSIONS.SYSTEM_ADMIN.SYSTEM_CONFIG],
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      OPERATIONS_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.OPERATIONS),
      RATE_ACCESS_LEVEL: [
        PERMISSIONS.RATE.DEPOSIT_INTEREST,
        PERMISSIONS.RATE.INDEX,
      ],
      PERFORMANCE_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.PERFORMANCE), // ✅ NEW
    },
  },
  // 22. Marketing Manager
  22: {
    permissions: {
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      MARKETING_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.MARKETING),
    },
  },
  // 23. Payment and Reconciliation USD
  23: {
    permissions: {
      POSTING_ACCESS_LEVEL: [PERMISSIONS.POSTING.CUSTOMER_POSTING, PERMISSIONS.POSTING.GL_POSTING],
      RECONCILIATION_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.RECONCILIATION),
    },
  },
  // 24. EOD Operator
  24: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: [PERMISSIONS.SYSTEM_ADMIN.OS_TRIGGER],
      REPORT_ACCESS_LEVEL: [PERMISSIONS.REPORT.VIEW],
    },
  },
  // 25. Recovery Officer
  25: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: [PERMISSIONS.CUSTOMER.VIEW],
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.VIEW,
        PERMISSIONS.LOAN_OPERATIONS.COLLECT,
      ],
    },
  },
  // 26. Relationship Development Officer
  26: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      REPORT_ACCESS_LEVEL: [PERMISSIONS.REPORT.VIEW],
    },
  },
  // 27. Customer Relationship Officer
  27: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: [PERMISSIONS.ACCOUNT.VIEW_BALANCE],
    },
  },
  // 28. Customer Service Officer
  28: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: [
        PERMISSIONS.CUSTOMER.CREATE,
        PERMISSIONS.CUSTOMER.VIEW,
        PERMISSIONS.CUSTOMER.UPDATE,
        PERMISSIONS.CUSTOMER.KYC_VERIFY,
      ],
      ACCOUNT_ACCESS_LEVEL: [
        PERMISSIONS.ACCOUNT.OPEN,
        PERMISSIONS.ACCOUNT.FREEZE,
      ],
      LOAN_FEE_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_FEE.VIEW,
        PERMISSIONS.LOAN_FEE.CREATE,
        PERMISSIONS.LOAN_FEE.UPDATE,
      ],
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW,
      ],
      DASHBOARD_ACCESS_LEVEL: [
        PERMISSIONS.DASHBOARD.CREDIT_OFFICER_DASHBOARD,
      ],
      PRODUCT_ACCESS_LEVEL: [
        PERMISSIONS.PRODUCT.VIEW,
      ],
      // ADDED: Loan Operations Permissions
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.CREDIT_APPLICATION,
        PERMISSIONS.LOAN_OPERATIONS.DISBURSE,
        PERMISSIONS.LOAN_OPERATIONS.VIEW,
        PERMISSIONS.LOAN_OPERATIONS.PROCESS,
      ],
      // ADDED: Thrift Permissions for CSO fallback consistency
      THRIFT_ACCESS_LEVEL: [
        PERMISSIONS.THRIFT.CREATE,
        PERMISSIONS.THRIFT.COLLECTION,
        PERMISSIONS.THRIFT.WITHDRAWAL,
      ],
      // ADDED: Comprehensive Guarantor Permissions for CSO
      GUARANTOR_ACCESS_LEVEL: [
        PERMISSIONS.GUARANTOR.CREATE,
        PERMISSIONS.GUARANTOR.VIEW,
        PERMISSIONS.GUARANTOR.VIEW_DETAILS,
        PERMISSIONS.GUARANTOR.SEARCH,
        PERMISSIONS.GUARANTOR.UPDATE,
        PERMISSIONS.GUARANTOR.VERIFY,
        PERMISSIONS.GUARANTOR.REMOVAL_REQUEST,
        PERMISSIONS.GUARANTOR.REPORTS,
        PERMISSIONS.GUARANTOR.DASHBOARD,
        PERMISSIONS.GUARANTOR.EXPORT,
      ],
    },
  },
  
// 29. Teller - UPDATED PERMISSIONS (ensure REAL_TIME_STATS is included)
29: {
  permissions: {
    DRAWER_ACCESS_LEVEL: [
      PERMISSIONS.DRAWER.VIEW,
      PERMISSIONS.DRAWER.MANAGE,
      PERMISSIONS.DRAWER.RECONCILE,
    ],
    CUSTOMER_ACCESS_LEVEL: [
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.CUSTOMER.UPDATE,
      PERMISSIONS.CUSTOMER.PROFILE,
    ],
    ACCOUNT_ACCESS_LEVEL: [
      PERMISSIONS.ACCOUNT.DEPOSIT_101,
      PERMISSIONS.ACCOUNT.WITHDRAWAL_102,
      PERMISSIONS.ACCOUNT.VIEW_BALANCE,
      PERMISSIONS.ACCOUNT.VIEW_STATEMENT,
    ],
    TRANSACTION_ACCESS_LEVEL: [
      PERMISSIONS.TRANSACTION.DEPOSIT,
      PERMISSIONS.TRANSACTION.WITHDRAWAL,
      PERMISSIONS.TRANSACTION.TRANSFER,
      PERMISSIONS.TRANSACTION.OPENING_DEPOSIT,
      PERMISSIONS.TRANSACTION.VIEW_HISTORY,
      PERMISSIONS.TRANSACTION.VIEW_RECENT,
      PERMISSIONS.TRANSACTION.VIEW_STATS,
    ],
    DASHBOARD_ACCESS_LEVEL: [
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.DASHBOARD.TRANSACTION_OVERVIEW,
      PERMISSIONS.DASHBOARD.TELLER_DASHBOARD,
      PERMISSIONS.DASHBOARD.QUICK_ACTIONS,
      PERMISSIONS.DASHBOARD.REAL_TIME_STATS, // ✅ THIS IS CRITICAL FOR today-stats ENDPOINT
    ],
    REPORT_ACCESS_LEVEL: [
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.REPORT.TELLER_SUMMARY,
    ],
    THRIFT_ACCESS_LEVEL: [
      PERMISSIONS.THRIFT.WITHDRAWAL,
    ],
  },
},
  // 30. Head Teller - UPDATED PERMISSIONS
  30: {
    permissions: {
      DRAWER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DRAWER),
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: [
        PERMISSIONS.ACCOUNT.VIEW_BALANCE,
        PERMISSIONS.ACCOUNT.VIEW_STATEMENT,
        PERMISSIONS.ACCOUNT.FREEZE,
      ],
      APPROVAL_ACCESS_LEVEL: [PERMISSIONS.APPROVAL.TRANSACTION],
      DEPOSIT_ACCESS_LEVEL: [PERMISSIONS.DEPOSIT.APPROVAL],
      DASHBOARD_ACCESS_LEVEL: [
        PERMISSIONS.DASHBOARD.VIEW,
        PERMISSIONS.DASHBOARD.TELLER_DASHBOARD,
        PERMISSIONS.DASHBOARD.BU_PERFORMANCE, // ✅ NEW
      ],
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW,
        PERMISSIONS.REPORT.TELLER_SUMMARY,
        PERMISSIONS.REPORT.PERFORMANCE_METRICS, // ✅ NEW
      ],
      PERFORMANCE_ACCESS_LEVEL: [PERMISSIONS.PERFORMANCE.VIEW_TELLER_PERFORMANCE], // ✅ NEW
    },
  },
  // 31. Customer Relationship Supervisor
  31: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.ACCOUNT),
      APPROVAL_ACCESS_LEVEL: [PERMISSIONS.APPROVAL.CUSTOMER_RELATED],
    },
  },
  // 32. Recovery Team Lead
  32: {
    permissions: {
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.VIEW,
        PERMISSIONS.LOAN_OPERATIONS.COLLECT,
        PERMISSIONS.LOAN_OPERATIONS.APPROVE,
      ],
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
    },
  },
  // 33. Business Analyst
  33: {
    permissions: {
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      ANALYTICS_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.ANALYTICS),
      RATE_ACCESS_LEVEL: [
        PERMISSIONS.RATE.DEPOSIT_INTEREST,
      ],
      PERFORMANCE_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.PERFORMANCE), // ✅ NEW
      STATISTICS_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.STATISTICS), // ✅ NEW
    },
  },
  // 34. Credit Risk Analyst
  34: {
    permissions: {
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      RISK_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.RISK),
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.VIEW,
        PERMISSIONS.LOAN_OPERATIONS.PROCESS,
      ],
      RATE_ACCESS_LEVEL: [
        PERMISSIONS.RATE.LOAN_INTEREST,
        PERMISSIONS.RATE.DEPOSIT_INTEREST,
      ],
      PERFORMANCE_ACCESS_LEVEL: [PERMISSIONS.PERFORMANCE.VIEW_METRICS], // ✅ NEW
    },
  },
  // 35. Head of Digital Banking
  35: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: [
        PERMISSIONS.SYSTEM_ADMIN.SYSTEM_CONFIG,
        PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS,
      ],
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      RATE_ACCESS_LEVEL: [
        PERMISSIONS.RATE.DEPOSIT_INTEREST,
      ],
      PERFORMANCE_ACCESS_LEVEL: [PERMISSIONS.PERFORMANCE.VIEW_METRICS], // ✅ NEW
    },
  },
  // 36. Agency Banking Officer
  36: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: [PERMISSIONS.CUSTOMER.VIEW, PERMISSIONS.CUSTOMER.CREATE],
      AGENCY_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.AGENCY),
      REPORT_ACCESS_LEVEL: [PERMISSIONS.REPORT.VIEW],
    },
  },
  // 37. Channel Manager
  37: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: [PERMISSIONS.CUSTOMER.VIEW, PERMISSIONS.CUSTOMER.UPDATE],
      REPORT_ACCESS_LEVEL: [PERMISSIONS.REPORT.VIEW],
      RATE_ACCESS_LEVEL: [
        PERMISSIONS.RATE.DEPOSIT_INTEREST,
      ],
    },
  },
};

// Complete Role Mapping with Permissions
export const ROLE_MAPPING = Object.fromEntries(
  Object.entries({
    1: { id: 1, ROLE_NM: 'Administrator' },
    2: { id: 2, ROLE_NM: 'Head Banking Services' },
    3: { id: 3, ROLE_NM: 'Loan Processing Officer' },
    4: { id: 4, ROLE_NM: 'Senior Financial Accountant' },
    5: { id: 5, ROLE_NM: 'Internal Control Officer' },
    6: { id: 6, ROLE_NM: 'Internal Control Manager' },
    7: { id: 7, ROLE_NM: 'Head of Credit' },
    8: { id: 8, ROLE_NM: 'Internal Audit Manager' },
    9: { id: 9, ROLE_NM: 'Head Human Resources' },
    10: { id: 10, ROLE_NM: 'Human Resource Officer' },
    11: { id: 11, ROLE_NM: 'IT Manager' },
    12: { id: 12, ROLE_NM: 'Financial Accountant' },
    13: { id: 13, ROLE_NM: 'Financial Accountant Manager' },
    14: { id: 14, ROLE_NM: 'Chief Financial Officer' },
    15: { id: 15, ROLE_NM: 'Chief Executive Officer' },
    16: { id: 16, ROLE_NM: 'Treasurer' },
    17: { id: 17, ROLE_NM: 'Loan Processing Supervisor' },
    18: { id: 18, ROLE_NM: 'Senior Financial Accountant' },
    19: { id: 19, ROLE_NM: 'Branch Manager' },
    20: { id: 20, ROLE_NM: 'Branch Operation Supervisor' },
    21: { id: 21, ROLE_NM: 'Chief Operation Officer' },
    22: { id: 22, ROLE_NM: 'Marketing Manager' },
    23: { id: 23, ROLE_NM: 'Payment and Reconciliation USD' },
    24: { id: 24, ROLE_NM: 'EOD Operator' },
    25: { id: 25, ROLE_NM: 'Recovery Officer' },
    26: { id: 26, ROLE_NM: 'Relationship Development Officer' },
    27: { id: 27, ROLE_NM: 'Customer Relationship Officer' },
    28: { id: 28, ROLE_NM: 'Customer Service Officer' },
    29: { id: 29, ROLE_NM: 'Teller' },
    30: { id: 30, ROLE_NM: 'Head Teller' },
    31: { id: 31, ROLE_NM: 'Customer Relationship Supervisor' },
    32: { id: 32, ROLE_NM: 'Recovery Team Lead' },
    33: { id: 33, ROLE_NM: 'Business Analyst' },
    34: { id: 34, ROLE_NM: 'Credit Risk Analyst' },
    35: { id: 35, ROLE_NM: 'Head of Digital Banking' },
    36: { id: 36, ROLE_NM: 'Agency Banking Officer' },
    37: { id: 37, ROLE_NM: 'Channel Manager' },
  }).map(([id, role]) => [
    id,
    {
      ...role,
      permissions: ROLE_PERMISSION_MAPPING[id]?.permissions || {
        REPORT_ACCESS_LEVEL: [PERMISSIONS.REPORT.VIEW],
      },
    },
  ])
);

// Synchronize ROLE_MAPPING with Permissions model
export async function syncPermissions() {
  try {
    for (const [roleId, roleData] of Object.entries(ROLE_MAPPING)) {
      const existingPermissions = await Permissions.findOne({ BU_ROLE_ID: roleId }).lean();
      const permissionsData = {
        BU_ROLE_ID: parseInt(roleId),
        ROLE_NAME: roleData.ROLE_NM,
        IS_ACTIVE: true,
        DESCRIPTION: roleData.description || `Permissions for ${roleData.ROLE_NM}`,
        ...roleData.permissions,
      };

      if (existingPermissions) {
        await Permissions.updateOne(
          { BU_ROLE_ID: roleId },
          { $set: permissionsData },
          { runValidators: true }
        );
        logger.info(`Updated permissions for role ${roleData.ROLE_NM} (ID: ${roleId})`, {
          permissions: JSON.stringify(permissionsData),
        });
      } else {
        await Permissions.create(permissionsData);
        logger.info(`Created permissions for role ${roleData.ROLE_NM} (ID: ${roleId})`, {
          permissions: JSON.stringify(permissionsData),
        });
      }
    }
    logger.info('Permissions synchronization completed successfully');
  } catch (error) {
    logger.error('Error synchronizing permissions', {
      error: error.message,
      stack: error.stack,
    });
    throw new Error(`Failed to synchronize permissions: ${error.message}`);
  }
}

// Populate Business Unit Mapping
export async function populateBusinessUnitMapping() {
  try {
    const businessUnits = await BusinessUnit.find().lean();
    if (!businessUnits.length) {
      logger.warn('No business units found in the database');
      return {};
    }
    const BUSINESS_UNIT_MAPPING = {};
    businessUnits.forEach((bu) => {
      BUSINESS_UNIT_MAPPING[bu.BUSINESS_UNIT] = bu.BU_ID;
    });
    logger.info('Business unit mapping populated successfully', {
      mapping: BUSINESS_UNIT_MAPPING,
    });
    return BUSINESS_UNIT_MAPPING;
  } catch (error) {
    logger.error('Error fetching business units', {
      error: error.message,
      stack: error.stack,
    });
    throw new Error(`Failed to populate business unit mapping: ${error.message}`);
  }
}

// Enhanced role-to-BU mapping with permission validation
export async function mapRoleToBusinessUnit(roleId, branchName, requiredPermissions = []) {
  try {
    const BUSINESS_UNIT_MAPPING = await populateBusinessUnitMapping();
    if (!BUSINESS_UNIT_MAPPING[branchName]) {
      throw new Error(`Business unit ${branchName} not found`);
    }

    if (requiredPermissions.length > 0) {
      const missingPermissions = [];
      for (const perm of requiredPermissions) {
        const has = await roleHasPermission(roleId, perm);
        if (!has) {
          missingPermissions.push(perm);
        }
      }
      if (missingPermissions.length > 0) {
        throw new Error(
          `Role ${roleId} lacks required permissions: ${missingPermissions.join(', ')}`
        );
      }
    }

    // Note: Modifying the mapping here to associate roleId with branchName, but returning BU_ID
    BUSINESS_UNIT_MAPPING[roleId] = branchName;
    return BUSINESS_UNIT_MAPPING[branchName];
  } catch (error) {
    logger.error('Error mapping role to business unit', {
      error: error.message,
      roleId,
      branchName,
      stack: error.stack,
    });
    throw error;
  }
}

// Get complete role details including permissions
export function getRoleWithPermissions(roleId) {
  try {
    const role = ROLE_MAPPING[roleId];
    if (!role) {
      throw new Error(`Role ${roleId} not found`);
    }
    return {
      id: role.id,
      ROLE_NM: role.ROLE_NM,
      permissions: role.permissions,
    };
  } catch (error) {
    logger.error('Error fetching role details', {
      error: error.message,
      roleId,
      stack: error.stack,
    });
    throw error;
  }
}

// Check if role has specific permission
export async function roleHasPermission(roleId, permission) {
  try {
    if (parseInt(roleId) === 1) {
      logger.info('Administrator role detected, granting all permissions', { roleId, permission });
      return true;
    }

    const dbPermissions = await Permissions.findOne({ BU_ROLE_ID: roleId }).lean();
    if (dbPermissions) {
      // Flatten all permission arrays from the document (excluding non-permission fields)
      const allPermissions = [];
      Object.entries(dbPermissions).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          allPermissions.push(...value.filter(p => typeof p === 'string'));
        }
      });
      return allPermissions.includes(permission);
    }

    const role = ROLE_MAPPING[roleId];
    if (!role) {
      logger.warn(`Role ${roleId} not found in ROLE_MAPPING`, { permission });
      return false;
    }

    const rolePermissions = Object.values(role.permissions).flat();
    return rolePermissions.includes(permission);
  } catch (error) {
    logger.error('Permission check failed', {
      error: error.message,
      roleId,
      permission,
      stack: error.stack,
    });
    return false;
  }
}

// Verify Administrator has all permissions
export async function verifyAdministratorPermissions() {
  try {
    const adminRoleId = 1;
    const allPermissions = Object.values(PERMISSIONS).flatMap(group => Object.values(group).filter(p => typeof p === 'string'));
    
    logger.info(`Testing ${allPermissions.length} permissions for Administrator`, { roleId: adminRoleId });
    
    for (const permission of allPermissions) {
      const hasPermission = await roleHasPermission(adminRoleId, permission);
      if (!hasPermission) {
        logger.error(`Administrator missing permission: ${permission}`, { roleId: adminRoleId });
        return false;
      }
    }
    
    logger.info('Administrator has ALL permissions');
    return true;
  } catch (error) {
    logger.error('Error verifying administrator permissions', {
      error: error.message,
      stack: error.stack,
    });
    return false;
  }
}

// Get all permissions for a role grouped by category
export async function getRolePermissionsGrouped(roleId) {
  try {
    const dbPermissions = await Permissions.findOne({ BU_ROLE_ID: roleId }).lean();
    if (dbPermissions) {
      return Object.entries(dbPermissions).reduce((acc, [key, perms]) => {
        if (key.endsWith('_ACCESS_LEVEL')) {
          const group = key.replace('_ACCESS_LEVEL', '');
          acc[group] = Array.isArray(perms) ? perms : [];
        }
        return acc;
      }, {});
    }

    const role = getRoleWithPermissions(roleId);
    return Object.entries(role.permissions).reduce((acc, [key, perms]) => {
      const group = key.replace('_ACCESS_LEVEL', '');
      acc[group] = Array.isArray(perms) ? perms : [];
      return acc;
    }, {});
  } catch (error) {
    logger.error('Error fetching grouped permissions', {
      error: error.message,
      roleId,
      stack: error.stack,
    });
    throw new Error(`Failed to fetch permissions for role ${roleId}: ${error.message}`);
  }
}

// Validate if role can perform action
export async function canPerformAction(roleId, permissionGroup, action) {
  try {
    const permissions = await getRolePermissionsGrouped(roleId);
    const accessLevel = permissionGroup.toUpperCase() + '_ACCESS_LEVEL';
    const groupPerms = permissions[permissionGroup.toUpperCase()] || [];
    return groupPerms.includes(action);
  } catch (error) {
    logger.error('Error validating action', {
      error: error.message,
      roleId,
      permissionGroup,
      action,
      stack: error.stack,
    });
    return false;
  }
}

// Validate permission structure
export function validatePermissions() {
  const errors = [];
  
  Object.entries(ROLE_PERMISSION_MAPPING).forEach(([roleId, roleData]) => {
    Object.entries(roleData.permissions).forEach(([group, permissions]) => {
      const groupName = group.replace('_ACCESS_LEVEL', '');
      
      // Check if the permission group exists in PERMISSIONS
      if (!PERMISSIONS[groupName]) {
        errors.push(`Role ${roleId}: Permission group ${groupName} not found`);
      } else {
        // Check if each permission exists in the correct group
        permissions.forEach(permission => {
          const groupPermissions = safeGetPermissions(PERMISSIONS[groupName]);
          if (!groupPermissions.includes(permission)) {
            errors.push(`Role ${roleId}: Permission ${permission} not found in ${groupName}`);
          }
        });
      }
    });
  });
  
  if (errors.length > 0) {
    logger.warn('Permission validation errors', { errors });
    return false;
  }
  
  logger.info('Permission structure validated successfully');
  return true;
}

// MODULE_PERMISSIONS (aligned with permissions.js)
export const MODULE_PERMISSIONS = {
  // Account Permissions
  accountBalance: PERMISSIONS.ACCOUNT.VIEW_BALANCE,
  deposit101: PERMISSIONS.ACCOUNT.DEPOSIT_101,
  withdrawal102: PERMISSIONS.ACCOUNT.WITHDRAWAL_102,
  accountUpdate: PERMISSIONS.ACCOUNT.UPDATE,

  // AML Permissions
  amlThreshold: PERMISSIONS.AML.VIEW_THRESHOLD,
  amlApproval: PERMISSIONS.AML.APPROVE,
  configureAML: PERMISSIONS.AML.CONFIGURE,
  monitorAML: PERMISSIONS.AML.MONITOR,
  generateAMLReport: PERMISSIONS.AML.REPORT,
  suspendAMLTransaction: PERMISSIONS.AML.SUSPEND,

  // System Admin Permissions
  auditTrail: PERMISSIONS.SYSTEM_ADMIN.AUDIT_LOGS,
  licenseDetails: PERMISSIONS.SYSTEM_ADMIN.LICENSE_DETAILS,
  systemDate: PERMISSIONS.SYSTEM_ADMIN.SYSTEM_DATE,
  osTrigger: PERMISSIONS.SYSTEM_ADMIN.OS_TRIGGER,

  // Permission Management
  businessRole: PERMISSIONS.PERMISSION_MANAGEMENT.BUSINESS_ROLE,
  businessRoleList: PERMISSIONS.PERMISSION_MANAGEMENT.BUSINESS_ROLE_LIST,
  buRoleCreation: PERMISSIONS.PERMISSION_MANAGEMENT.BU_ROLE_CREATION,
  businessRoleQueue: PERMISSIONS.PERMISSION_MANAGEMENT.BUSINESS_ROLE_QUEUE,
  businessRoleQueueSetup: PERMISSIONS.PERMISSION_MANAGEMENT.BUSINESS_ROLE_QUEUE_SETUP,

  // Business Unit Permissions
  createBusinessUnit: PERMISSIONS.BUSINESS_UNIT.CREATE,
  businessUnit: PERMISSIONS.BUSINESS_UNIT.VIEW,
  securityBusinessUnit: PERMISSIONS.BUSINESS_UNIT.SECURITY,
  businessUnitRole: PERMISSIONS.BUSINESS_UNIT.ROLE,

  // Security Profile Permissions
  addUser: PERMISSIONS.SECURITY_PROFILE.ADD_USER,
  assignUserRole: PERMISSIONS.SECURITY_PROFILE.ASSIGN_ROLE,
  assignCsoRight: PERMISSIONS.SECURITY_PROFILE.ASSIGN_CSO_RIGHT,
  passwordReset: PERMISSIONS.SECURITY_PROFILE.RESET_PASSWORD,
  securityConsole: PERMISSIONS.SECURITY_PROFILE.CONSOLE,

  // Workflow Permissions
  workflowSetup: PERMISSIONS.WORKFLOW.CONFIGURE,
  workflowSubProcess: PERMISSIONS.WORKFLOW.MANAGE_SUBPROCESS,

  // Approval Permissions
  managerApproval: PERMISSIONS.APPROVAL.MANAGER,
  cashDepositApproval: PERMISSIONS.APPROVAL.CASH_DEPOSIT,
  glTransactionApproval: PERMISSIONS.APPROVAL.GL_TRANSACTION,
  loanApproval: PERMISSIONS.LOAN_OPERATIONS.APPROVE,

  // Loan Operations Permissions
  loanCreditApplication: PERMISSIONS.LOAN_OPERATIONS.CREDIT_APPLICATION,
  loanApplicationDetails: PERMISSIONS.LOAN_OPERATIONS.VIEW,
  loanDisbursement: PERMISSIONS.LOAN_OPERATIONS.DISBURSE,
  loanMontract: PERMISSIONS.LOAN_OPERATIONS.CREATE_CONTRACT,
  loanCalculator: PERMISSIONS.LOAN_OPERATIONS.PROCESS,
  emiCalculate: PERMISSIONS.LOAN_OPERATIONS.PROCESS,

  // Customer Permissions
  createCustomer: PERMISSIONS.CUSTOMER.CREATE,
  customerProfile: PERMISSIONS.CUSTOMER.PROFILE,
  customerIdentification: PERMISSIONS.CUSTOMER.IDENTIFICATION,
  customerApproval: PERMISSIONS.CUSTOMER.APPROVAL,

  // Deposit Permissions
  depositModule: PERMISSIONS.DEPOSIT.CREATE,
  depositApplication: PERMISSIONS.DEPOSIT.APPLICATION,
  depositApplicationDetails: PERMISSIONS.DEPOSIT.VIEW_DETAILS,
  depositApplicationApproval: PERMISSIONS.DEPOSIT.APPROVAL,

  // GUARANTOR PERMISSIONS - Comprehensive Set
  createGuarantor: PERMISSIONS.GUARANTOR.CREATE,
  viewGuarantor: PERMISSIONS.GUARANTOR.VIEW,
  viewGuarantorDetails: PERMISSIONS.GUARANTOR.VIEW_DETAILS,
  searchGuarantor: PERMISSIONS.GUARANTOR.SEARCH,
  approveGuarantor: PERMISSIONS.GUARANTOR.APPROVE,
  rejectGuarantor: PERMISSIONS.GUARANTOR.REJECT,
  verifyGuarantor: PERMISSIONS.GUARANTOR.VERIFY,
  updateGuarantor: PERMISSIONS.GUARANTOR.UPDATE,
  deleteGuarantor: PERMISSIONS.GUARANTOR.DELETE,
  exportGuarantor: PERMISSIONS.GUARANTOR.EXPORT,
  guarantorRemovalRequest: PERMISSIONS.GUARANTOR.REMOVAL_REQUEST,
  approveGuarantorRemoval: PERMISSIONS.GUARANTOR.APPROVE_REMOVAL,
  rejectGuarantorRemoval: PERMISSIONS.GUARANTOR.REJECT_REMOVAL,
  reactivateGuarantor: PERMISSIONS.GUARANTOR.REACTIVATE,
  deactivateGuarantor: PERMISSIONS.GUARANTOR.DEACTIVATE,
  guarantorBulkActions: PERMISSIONS.GUARANTOR.BULK_ACTIONS,
  guarantorReports: PERMISSIONS.GUARANTOR.REPORTS,
  guarantorDashboard: PERMISSIONS.GUARANTOR.DASHBOARD,
  guarantorAuditLog: PERMISSIONS.GUARANTOR.AUDIT_LOG,

  // Transaction Permissions
  cashWithdrawal: PERMISSIONS.TRANSACTION.WITHDRAWAL,
  cashDeposit: PERMISSIONS.TRANSACTION.DEPOSIT,
  openingDeposit: PERMISSIONS.TRANSACTION.OPENING_DEPOSIT,
  glToGlTransaction: PERMISSIONS.TRANSACTION.GL_TO_GL,
  creditGlTransaction: PERMISSIONS.TRANSACTION.CREDIT_GL,
  debitGlTransaction: PERMISSIONS.TRANSACTION.DEBIT_GL,
  reprintReceipt: PERMISSIONS.TRANSACTION.REPRINT_RECEIPT,
  viewRecentTransactions: PERMISSIONS.TRANSACTION.VIEW_RECENT,
  viewTransactionStats: PERMISSIONS.TRANSACTION.VIEW_STATS,

  // Rate Permissions
  loanInterestSetup: PERMISSIONS.RATE.LOAN_INTEREST,
  depositInterestSetup: PERMISSIONS.RATE.DEPOSIT_INTEREST,
  indexRate: PERMISSIONS.RATE.INDEX,

  // Loan Fee Permissions
  loanFeeSetup: PERMISSIONS.LOAN_FEE.SETUP,

  // Report Permissions
  customerReport: PERMISSIONS.REPORT.CUSTOMER,
  reports: PERMISSIONS.REPORT.ALL_REPORTS,
  termDepositReports: PERMISSIONS.REPORT.TERM_DEPOSIT,
  accountStatementReport: PERMISSIONS.REPORT.ACCOUNT_STATEMENT,
  trialBalanceReport: PERMISSIONS.REPORT.TRIAL_BALANCE,
  incomeExpenseReport: PERMISSIONS.REPORT.INCOME_EXPENSE,
  tellerSummaryReport: PERMISSIONS.REPORT.TELLER_SUMMARY,
  guarantorReport: PERMISSIONS.REPORT.GUARANTOR,
  performanceMetrics: PERMISSIONS.REPORT.PERFORMANCE_METRICS,

  // Product Permissions
  productSetup: PERMISSIONS.PRODUCT.SETUP,
  loanProductSetup: PERMISSIONS.PRODUCT.LOAN,
  productMapping: PERMISSIONS.PRODUCT.MAPPING,

  // Posting Permissions
  chartOfAccount: PERMISSIONS.POSTING.CHART_OF_ACCOUNT,
  glaSubfolderAccount: PERMISSIONS.POSTING.GL_SUBFOLDER,
  viewSubfolderAccount: PERMISSIONS.POSTING.VIEW_SUBFOLDER,
  department: PERMISSIONS.POSTING.DEPARTMENT,

  // Holiday Permissions
  holidayCalendar: PERMISSIONS.HOLIDAY.MANAGE,

  // Dashboard Permissions
  tellerDashboard: PERMISSIONS.DASHBOARD.TELLER_DASHBOARD,
  transactionOverview: PERMISSIONS.DASHBOARD.TRANSACTION_OVERVIEW,
  quickActions: PERMISSIONS.DASHBOARD.QUICK_ACTIONS,
  realTimeStats: PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
  creditOfficerDashboard: PERMISSIONS.DASHBOARD.CREDIT_OFFICER_DASHBOARD,
  managerDashboard: PERMISSIONS.DASHBOARD.MANAGER_DASHBOARD,
  guarantorDashboard: PERMISSIONS.DASHBOARD.GUARANTOR_DASHBOARD,
  buPerformance: PERMISSIONS.DASHBOARD.BU_PERFORMANCE,

  // Analytics Permissions
  viewTellerAnalytics: PERMISSIONS.ANALYTICS.VIEW_TELLER_ANALYTICS,

  // Performance Permissions
  viewPerformanceMetrics: PERMISSIONS.PERFORMANCE.VIEW_METRICS,
  viewTellerPerformance: PERMISSIONS.PERFORMANCE.VIEW_TELLER_PERFORMANCE,
  viewBranchPerformance: PERMISSIONS.PERFORMANCE.VIEW_BRANCH_PERFORMANCE,
  exportPerformanceData: PERMISSIONS.PERFORMANCE.EXPORT_PERFORMANCE_DATA,

  // Statistics Permissions
  viewRealTimeStats: PERMISSIONS.STATISTICS.VIEW_REAL_TIME,
  viewHistoricalStats: PERMISSIONS.STATISTICS.VIEW_HISTORICAL,
  viewFinancialStats: PERMISSIONS.STATISTICS.VIEW_FINANCIAL,
  viewOperationalStats: PERMISSIONS.STATISTICS.VIEW_OPERATIONAL,

  // ✅ NEW: TELLER STATS ENDPOINT MAPPINGS - ADD THESE TO FIX THE ERROR
  tellerTodayStats: PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
  todayStats: PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
  tellerStats: PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
  userTellerStats: PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
  usersTellerTodayStats: PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
  tellerDashboardStats: PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
  dashboardStats: PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
  
  // Alternative performance-based mappings
  tellerPerformance: PERMISSIONS.PERFORMANCE.VIEW_TELLER_PERFORMANCE,
  performanceMetrics: PERMISSIONS.PERFORMANCE.VIEW_METRICS,
  
  // Statistics-based mappings
  viewStatistics: PERMISSIONS.STATISTICS.VIEW_REAL_TIME,
  tellerAnalytics: PERMISSIONS.ANALYTICS.VIEW_TELLER_ANALYTICS,

  // Additional comprehensive mappings to cover all potential variations
  getTellerStats: PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
  getTodayStats: PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
  getUserTellerStats: PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
  apiTellerStats: PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
  apiTodayStats: PERMISSIONS.DASHBOARD.REAL_TIME_STATS
};

// ======================
// DEBUG PERMISSION MIDDLEWARE (TEMPORARY)
// ======================
export const checkPermissions = (moduleKey) => {
  return async (req, res, next) => {
    console.log('🔍 PERMISSION DEBUG START ======================');
    console.log('📝 Route:', req.method, req.path);
    console.log('🔑 Module Key Provided:', moduleKey);
    console.log('👤 User Role:', req.user?.role);
    console.log('🆔 User Role ID:', req.user?.roleId);
    console.log('📋 Available Module Keys:', Object.keys(MODULE_PERMISSIONS).slice(0, 10));
    
    // If moduleKey is undefined, try to derive it
    if (!moduleKey) {
      const derivedKey = deriveModuleKey(req.path);
      console.log('🔄 Derived Module Key:', derivedKey);
      moduleKey = derivedKey;
    }
    
    console.log('🎯 Final Module Key:', moduleKey);
    console.log('🔍 Permission Lookup:', MODULE_PERMISSIONS[moduleKey]);
    
    if (!moduleKey || !MODULE_PERMISSIONS[moduleKey]) {
      console.log('❌ PERMISSION ERROR: Invalid module key');
      return res.status(400).json({
        success: false,
        message: `No permission defined for module ${moduleKey || 'undefined'}`,
        errorCode: "INVALID_MODULE_KEY"
      });
    }
    
    console.log('✅ Module key found, proceeding with permission check...');
    console.log('🔍 PERMISSION DEBUG END ========================');
    
    // Continue with your existing permission check logic
    const requiredPermission = MODULE_PERMISSIONS[moduleKey];
    const userRoleId = req.user?.roleId;
    
    if (!userRoleId) {
      return res.status(401).json({
        success: false,
        message: "User role not found",
        errorCode: "UNAUTHORIZED"
      });
    }
    
    try {
      const hasPermission = await roleHasPermission(userRoleId, requiredPermission);
      
      if (!hasPermission) {
        console.log('❌ Permission denied for:', requiredPermission);
        return res.status(403).json({
          success: false,
          message: `Insufficient permissions. Required: ${requiredPermission}`,
          errorCode: "FORBIDDEN"
        });
      }
      
      console.log('✅ Permission granted for:', requiredPermission);
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: "Permission check failed",
        errorCode: "PERMISSION_ERROR"
      });
    }
  };
};

function deriveModuleKey(path) {
  const pathParts = path.split('/').filter(part => part);
  
  // Handle /api/users/teller/today-stats
  if (path.includes('/teller/today-stats')) {
    return 'tellerTodayStats';
  }
  
  // Generic derivation: take last meaningful part
  const lastPart = pathParts[pathParts.length - 1];
  return lastPart || 'dashboard'; // fallback
}

// Call during application startup
validatePermissions();


export default {
  ROLE_MAPPING,
  MODULE_PERMISSIONS,
  syncPermissions,
  populateBusinessUnitMapping,
  mapRoleToBusinessUnit,
  getRoleWithPermissions,
  roleHasPermission,
  verifyAdministratorPermissions,
  getRolePermissionsGrouped,
  canPerformAction,
  validatePermissions,
  checkPermissions, // ✅ ADD THIS TO EXPORT THE DEBUG FUNCTION
};