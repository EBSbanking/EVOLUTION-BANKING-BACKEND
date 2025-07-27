import mongoose from 'mongoose';
import BusinessUnit from '../models/BusinessUnit.js';
import PERMISSIONS from '../constants/permissions.js';

// ======================
// HELPER FUNCTIONS
// ======================
function safeGetPermissions(permissionGroup) {
  return permissionGroup ? Object.values(permissionGroup) : [];
}

// ======================
// ROLE PERMISSION MAPPING
// ======================
const ROLE_PERMISSION_MAPPING = {
  // 1. Administrator - Full access
  1: {
    permissions: Object.keys(PERMISSIONS).reduce((acc, key) => {
      acc[`${key}_ACCESS_LEVEL`] = safeGetPermissions(PERMISSIONS[key]);
      return acc;
    }, {})
  },

  // 2. Head Banking Services
  2: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.ACCOUNT),
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.APPROVE,
        PERMISSIONS.LOAN_OPERATIONS.REJECT
      ],
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT)
    }
  },

  // 3. Loan Processing Officer
  3: {
    permissions: {
      LOAN_FEE_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_FEE.VIEW,
        PERMISSIONS.LOAN_FEE.TOGGLE_STATUS
      ],
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.DISBURSE,
        PERMISSIONS.LOAN_OPERATIONS.COLLECT
      ]
    }
  },

  // 4. Senior Financial Accountant
  4: {
    permissions: {
      POSTING_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.POSTING),
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW,
        PERMISSIONS.REPORT.EXPORT
      ],
      FIXED_ASSET_ACCESS_LEVEL: [
        PERMISSIONS.FIXED_ASSET.REGISTER,
        PERMISSIONS.FIXED_ASSET.DEPRECIATE
      ]
    }
  },

  // 5. Internal Control Officer
  5: {
    permissions: {
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW
      ],
      SYSTEM_ADMIN_ACCESS_LEVEL: [
        PERMISSIONS.SYSTEM_ADMIN.AUDIT_LOGS
      ]
    }
  },

  // 6. Internal Control Manager
  6: {
    permissions: {
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      SYSTEM_ADMIN_ACCESS_LEVEL: [
        PERMISSIONS.SYSTEM_ADMIN.AUDIT_LOGS
      ],
      PERMISSION_MANAGEMENT_ACCESS_LEVEL: [
        PERMISSIONS.PERMISSION_MANAGEMENT.VIEW_PERMISSIONS
      ]
    }
  },

  // 7. Head of Credit
  7: {
    permissions: {
      LOAN_FEE_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.LOAN_FEE),
      LOAN_OPERATIONS_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.LOAN_OPERATIONS),
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      CREDIT_APPL_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CREDIT_APPL)
    }
  },

  // 8. Internal Audit Manager
  8: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: [
        PERMISSIONS.SYSTEM_ADMIN.AUDIT_LOGS
      ],
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      PERMISSION_MANAGEMENT_ACCESS_LEVEL: [
        PERMISSIONS.PERMISSION_MANAGEMENT.VIEW_PERMISSIONS
      ]
    }
  },

  // 9. Head Human Resources
  9: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: [
        PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS
      ],
      PERMISSION_MANAGEMENT_ACCESS_LEVEL: [
        PERMISSIONS.PERMISSION_MANAGEMENT.ASSIGN_ROLES
      ]
    }
  },

  // 10. Human Resource Officer
  10: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: [
        PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS
      ]
    }
  },

  // 11. IT Manager
  11: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: [
        PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS,
        PERMISSIONS.SYSTEM_ADMIN.SYSTEM_CONFIG,
        PERMISSIONS.SYSTEM_ADMIN.ROLE_MANAGEMENT
      ],
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW,
        PERMISSIONS.REPORT.EXPORT
      ]
    }
  },

  // 12. Financial Accountant
  12: {
    permissions: {
      POSTING_ACCESS_LEVEL: [
        PERMISSIONS.POSTING.CREATE,
        PERMISSIONS.POSTING.VIEW
      ],
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      DASHBOARD_ACCESS_LEVEL: [
        PERMISSIONS.DASHBOARD.VIEW
      ],
      FIXED_ASSET_ACCESS_LEVEL: [
        PERMISSIONS.FIXED_ASSET.VIEW
      ]
    }
  },

  // 13. Financial Accountant Manager
  13: {
    permissions: {
      POSTING_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.POSTING),
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      FIXED_ASSET_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.FIXED_ASSET),
      APPROVAL_ACCESS_LEVEL: [
        PERMISSIONS.APPROVAL.FINANCIAL
      ]
    }
  },

  // 14. Chief Financial Officer
  14: {
    permissions: {
      POSTING_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.POSTING),
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      FIXED_ASSET_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.FIXED_ASSET)
    }
  },

  // 15. Chief Executive Officer
  15: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.SYSTEM_ADMIN),
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      APPROVAL_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.APPROVAL)
    }
  },

  // 16. Treasurer
  16: {
    permissions: {
      POSTING_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.POSTING),
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      TREASURY_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.TREASURY)
    }
  },

  // 17. Loan Processing Supervisor
  17: {
    permissions: {
      LOAN_OPERATIONS_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.LOAN_OPERATIONS),
      CUSTOMER_ACCESS_LEVEL: [
        PERMISSIONS.CUSTOMER.VIEW,
        PERMISSIONS.CUSTOMER.UPDATE
      ],
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW,
        PERMISSIONS.REPORT.EXPORT
      ]
    }
  },

  // 18. Senior Financial Accountant
  18: {
    permissions: {
      POSTING_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.POSTING),
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      FIXED_ASSET_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.FIXED_ASSET),
      APPROVAL_ACCESS_LEVEL: [
        PERMISSIONS.APPROVAL.FINANCIAL
      ]
    }
  },

  // 19. Branch Manager
  19: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.ACCOUNT),
      DRAWER_ACCESS_LEVEL: [
        PERMISSIONS.DRAWER.VIEW,
        PERMISSIONS.DRAWER.RECONCILE
      ],
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.APPROVE
      ]
    }
  },

  // 20. Branch Operation Supervisor
  20: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.ACCOUNT),
      DRAWER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DRAWER),
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.VIEW,
        PERMISSIONS.LOAN_OPERATIONS.PROCESS
      ]
    }
  },

  // 21. Chief Operation Officer
  21: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: [
        PERMISSIONS.SYSTEM_ADMIN.SYSTEM_CONFIG
      ],
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      OPERATIONS_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.OPERATIONS)
    }
  },

  // 22. Marketing Manager
  22: {
    permissions: {
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      MARKETING_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.MARKETING)
    }
  },

  // 23. Payment and Reconciliation USD
  23: {
    permissions: {
      POSTING_ACCESS_LEVEL: [
        PERMISSIONS.POSTING.CREATE,
        PERMISSIONS.POSTING.VIEW
      ],
      RECONCILIATION_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.RECONCILIATION)
    }
  },

  // 24. EOD Operator
  24: {
    permissions: {
      SYSTEM_ADMIN_ACCESS_LEVEL: [
        PERMISSIONS.SYSTEM_ADMIN.EOD_OPERATIONS
      ],
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW
      ]
    }
  },

  // 25. Recovery Officer
  25: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: [
        PERMISSIONS.CUSTOMER.VIEW
      ],
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.VIEW,
        PERMISSIONS.LOAN_OPERATIONS.RECOVERY
      ]
    }
  },

  // 26. Relationship Development Officer
  26: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW
      ]
    }
  },

  // 27. Customer Relationship Officer
  27: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: [
        PERMISSIONS.ACCOUNT.VIEW_BALANCE
      ]
    }
  },

  // 28. Customer Service Officer
  28: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: [
        PERMISSIONS.CUSTOMER.CREATE,
        PERMISSIONS.CUSTOMER.VIEW,
        PERMISSIONS.CUSTOMER.UPDATE,
        PERMISSIONS.CUSTOMER.KYC_VERIFY
      ],
      ACCOUNT_ACCESS_LEVEL: [
        PERMISSIONS.ACCOUNT.VIEW_BALANCE,
        PERMISSIONS.ACCOUNT.VIEW_STATEMENT,
        PERMISSIONS.ACCOUNT.OPEN,
        PERMISSIONS.ACCOUNT.FREEZE
      ],
      LOAN_FEE_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_FEE.VIEW,
        PERMISSIONS.LOAN_FEE.CREATE,
        PERMISSIONS.LOAN_FEE.UPDATE
      ],
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW
      ]
    }
  },

  // 29. Teller
  29: {
    permissions: {
      DRAWER_ACCESS_LEVEL: [
        PERMISSIONS.DRAWER.VIEW,
        PERMISSIONS.DRAWER.MANAGE
      ],
      CUSTOMER_ACCESS_LEVEL: [
        PERMISSIONS.CUSTOMER.VIEW,
        PERMISSIONS.CUSTOMER.UPDATE
      ],
      ACCOUNT_ACCESS_LEVEL: [
        PERMISSIONS.ACCOUNT.VIEW_BALANCE,
        PERMISSIONS.ACCOUNT.VIEW_STATEMENT,
        PERMISSIONS.ACCOUNT.FREEZE
      ],
      TRANSACTION_ACCESS_LEVEL: [
        PERMISSIONS.TRANSACTION.DEPOSIT,
        PERMISSIONS.TRANSACTION.WITHDRAWAL,
        PERMISSIONS.TRANSACTION.TRANSFER
      ]
    }
  },

  // 30. Head Teller
  30: {
    permissions: {
      DRAWER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DRAWER),
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: [
        PERMISSIONS.ACCOUNT.VIEW_BALANCE,
        PERMISSIONS.ACCOUNT.VIEW_DETAILS
      ],
      APPROVAL_ACCESS_LEVEL: [
        PERMISSIONS.APPROVAL.TRANSACTION
      ]
    }
  },

  // 31. Customer Relationship Supervisor
  31: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.ACCOUNT),
      APPROVAL_ACCESS_LEVEL: [
        PERMISSIONS.APPROVAL.CUSTOMER_RELATED
      ]
    }
  },

  // 32. Recovery Team Lead
  32: {
    permissions: {
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.VIEW,
        PERMISSIONS.LOAN_OPERATIONS.RECOVERY,
        PERMISSIONS.LOAN_OPERATIONS.APPROVE_RECOVERY
      ],
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT)
    }
  },

  // 33. Business Analyst
  33: {
    permissions: {
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      DASHBOARD_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DASHBOARD),
      ANALYTICS_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.ANALYTICS)
    }
  },

  // 34. Credit Risk Analyst
  34: {
    permissions: {
      REPORT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.REPORT),
      RISK_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.RISK),
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.VIEW,
        PERMISSIONS.LOAN_OPERATIONS.ASSESS
      ]
    }
  },

  // 36. Agency Banking Officer
  36: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: [
        PERMISSIONS.CUSTOMER.VIEW,
        PERMISSIONS.CUSTOMER.CREATE
      ],
      AGENCY_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.AGENCY),
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW
      ]
    }
  },

  // 37. Channel Manager
  37: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: [
        PERMISSIONS.CUSTOMER.VIEW,
        PERMISSIONS.CUSTOMER.UPDATE
      ],
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW
      ]
    }
  }
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
    37: { id: 37, ROLE_NM: 'Channel Manager' }
  }).map(([id, role]) => [
    id,
    {
      ...role,
      permissions: ROLE_PERMISSION_MAPPING[id]?.permissions || {},
      // Add default permissions for roles not explicitly mapped
      ...(!ROLE_PERMISSION_MAPPING[id] && {
        permissions: {
          REPORT_ACCESS_LEVEL: [PERMISSIONS.REPORT.VIEW]
        }
      })
    }
  ])
);

// Business Unit Mapping
export const BUSINESS_UNIT_MAPPING = {};

export async function populateBusinessUnitMapping() {
  try {
    const businessUnits = await BusinessUnit.find();
    businessUnits.forEach(bu => {
      BUSINESS_UNIT_MAPPING[bu.BUSINESS_UNIT] = bu.BU_ID;
    });
  } catch (error) {
    console.error("Error fetching business units:", error);
  }
}

// Enhanced role-to-BU mapping with permission validation
export function mapRoleToBusinessUnit(roleId, branchName, requiredPermissions = []) {
  if (!BUSINESS_UNIT_MAPPING[branchName]) {
    throw new Error(`Business unit ${branchName} not found`);
  }

  if (requiredPermissions.length > 0) {
    const missingPermissions = requiredPermissions.filter(perm => 
      !roleHasPermission(roleId, perm)
    );
    
    if (missingPermissions.length > 0) {
      throw new Error(
        `Role ${roleId} lacks required permissions: ${missingPermissions.join(', ')}`
      );
    }
  }

  BUSINESS_UNIT_MAPPING[roleId] = branchName;
}

// Get complete role details including permissions
export function getRoleWithPermissions(roleId) {
  const role = ROLE_MAPPING[roleId];
  if (!role) throw new Error(`Role ${roleId} not found`);
  return role;
}

// Check if role has specific permission
export function roleHasPermission(roleId, permission) {
  const role = ROLE_MAPPING[roleId];
  if (!role) return false;
  
  return Object.values(role.permissions)
    .flat()
    .includes(permission);
}

// Get all permissions for a role grouped by category
export function getRolePermissionsGrouped(roleId) {
  const role = getRoleWithPermissions(roleId);
  return Object.entries(role.permissions).reduce((acc, [key, perms]) => {
    const group = key.replace('_ACCESS_LEVEL', '');
    acc[group] = perms;
    return acc;
  }, {});
}

// Validate if role can perform action
export function canPerformAction(roleId, permissionGroup, action) {
  const role = getRoleWithPermissions(roleId);
  const accessLevel = `${permissionGroup}_ACCESS_LEVEL`;
  return role.permissions[accessLevel]?.includes(action) || false;
}