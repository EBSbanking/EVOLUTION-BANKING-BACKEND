import mongoose from 'mongoose';
import BusinessUnit from '../models/BusinessUnit.js';
import Permissions from '../models/Permissions.js';
import UserRole from '../models/UserRole.js'; // ✅ Added UserRole import if needed for sync
import CustomerAccount from '../models/CustomerAccount.js';
import PERMISSIONS from '../constants/permissions.js';
import logger from '../utils/logger.js';

// ======================
// HELPER FUNCTIONS
// ======================
function safeGetPermissions(permissionGroup) {
  return permissionGroup && typeof permissionGroup === 'object' ? Object.values(permissionGroup).filter(p => typeof p === 'string') : [];
}

// ✅ Helper to filter out undefined permissions during validation
function filterValidPermissions(permissionsArray, groupName) {
  return permissionsArray.filter(permission => {
    if (permission === undefined) {
      logger.warn(`Undefined permission found in ${groupName}, skipping`);
      return false;
    }
    return true;
  });
}

// ======================
// ROLE PERMISSION MAPPING
// ======================
export const ROLE_PERMISSION_MAPPING = {
  // 1. Administrator - Full access to ALL permissions including VAULT
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
      // ✅ ADDED: VAULT PERMISSIONS FOR SENIOR FINANCIAL ACCOUNTANT
      VAULT_ACCESS_LEVEL: [
        // Core Vault Viewing
        PERMISSIONS.VAULT.VIEW_VAULTS,
        PERMISSIONS.VAULT.VIEW_VAULT_CONFIG,
        PERMISSIONS.VAULT.VIEW_AUTHORIZED_PERSONNEL,
        PERMISSIONS.VAULT.VIEW_ACCESS_LOGS,
        
        // Financial Analytics
        PERMISSIONS.VAULT.VIEW_VAULT_UTILIZATION,
        PERMISSIONS.VAULT.VIEW_SECURITY_COMPLIANCE,
        PERMISSIONS.VAULT.VIEW_VAULT_STATISTICS,
        PERMISSIONS.VAULT.VIEW_AUDIT_TRAIL,
        PERMISSIONS.VAULT.VIEW_VAULT_STATUS,
        
        // ✅ Branch Vault Permissions
        PERMISSIONS.VAULT.VIEW_BRANCH_VAULTS,
        PERMISSIONS.VAULT.VIEW_BRANCH_VAULT_STATUS,
        
        // Financial Operations
        PERMISSIONS.VAULT.VAULT_RECONCILIATION,
        PERMISSIONS.VAULT.VAULT_TRANSFER,
        PERMISSIONS.VAULT.VIEW_VAULT_CAPACITY,
        PERMISSIONS.VAULT.UPDATE_VAULT_CAPACITY,
        
        // Inventory & Asset Management
        PERMISSIONS.VAULT.VAULT_INVENTORY_VIEW,
        PERMISSIONS.VAULT.VAULT_INVENTORY_UPDATE,
        PERMISSIONS.VAULT.TRACK_VAULT_CONTENTS,
        PERMISSIONS.VAULT.VAULT_SPACE_ALLOCATION,
        
        // Audit & Compliance
        PERMISSIONS.VAULT.VAULT_AUDIT,
        PERMISSIONS.VAULT.VAULT_COMPLIANCE_CHECK,
        PERMISSIONS.VAULT.GENERATE_VAULT_REPORT,
        
        // Documentation & Policies
        PERMISSIONS.VAULT.VAULT_DOCUMENTATION,
        PERMISSIONS.VAULT.VAULT_POLICIES,
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
      // ✅ ADDED: VAULT PERMISSIONS FOR FINANCIAL ACCOUNTANT
      VAULT_ACCESS_LEVEL: [
        PERMISSIONS.VAULT.VIEW_VAULTS,
        PERMISSIONS.VAULT.VIEW_VAULT_CONFIG,
        PERMISSIONS.VAULT.VIEW_ACCESS_LOGS,
        PERMISSIONS.VAULT.VIEW_VAULT_UTILIZATION,
        PERMISSIONS.VAULT.VIEW_VAULT_STATISTICS,
        PERMISSIONS.VAULT.VIEW_VAULT_STATUS,
        // ✅ Limited Branch Vault Access
        PERMISSIONS.VAULT.VIEW_BRANCH_VAULTS,
        // ✅ Financial Monitoring
        PERMISSIONS.VAULT.VIEW_VAULT_CAPACITY,
        PERMISSIONS.VAULT.VAULT_INVENTORY_VIEW,
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
      // ✅ ADDED: VAULT PERMISSIONS FOR FINANCIAL ACCOUNTANT MANAGER
      VAULT_ACCESS_LEVEL: [
        PERMISSIONS.VAULT.VIEW_VAULTS,
        PERMISSIONS.VAULT.VIEW_VAULT_CONFIG,
        PERMISSIONS.VAULT.VIEW_AUTHORIZED_PERSONNEL,
        PERMISSIONS.VAULT.VIEW_ACCESS_LOGS,
        PERMISSIONS.VAULT.VIEW_VAULT_UTILIZATION,
        PERMISSIONS.VAULT.VIEW_SECURITY_COMPLIANCE,
        PERMISSIONS.VAULT.VIEW_VAULT_STATISTICS,
        PERMISSIONS.VAULT.VIEW_AUDIT_TRAIL,
        PERMISSIONS.VAULT.VIEW_VAULT_STATUS,
        // ✅ Branch Vault Permissions
        PERMISSIONS.VAULT.VIEW_BRANCH_VAULTS,
        PERMISSIONS.VAULT.VIEW_BRANCH_VAULT_STATUS,
        // ✅ Financial Operations
        PERMISSIONS.VAULT.VAULT_RECONCILIATION,
        PERMISSIONS.VAULT.VIEW_VAULT_CAPACITY,
        PERMISSIONS.VAULT.UPDATE_VAULT_CAPACITY,
        PERMISSIONS.VAULT.VAULT_INVENTORY_VIEW,
        PERMISSIONS.VAULT.TRACK_VAULT_CONTENTS,
        PERMISSIONS.VAULT.GENERATE_VAULT_REPORT,
        PERMISSIONS.VAULT.VAULT_AUDIT,
        PERMISSIONS.VAULT.VAULT_COMPLIANCE_CHECK,
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
      PERFORMANCE_ACCESS_LEVEL: [PERMISSIONS.PERFORMANCE.VIEW_METRICS],
      // ✅ ADDED: VAULT PERMISSIONS FOR FINANCE/ACCOUNTING ROLE
      VAULT_ACCESS_LEVEL: [
        PERMISSIONS.VAULT.VIEW_VAULTS,
        PERMISSIONS.VAULT.VIEW_VAULT_CONFIG,
        PERMISSIONS.VAULT.VIEW_AUTHORIZED_PERSONNEL,
        PERMISSIONS.VAULT.VIEW_ACCESS_LOGS,
        PERMISSIONS.VAULT.VIEW_VAULT_UTILIZATION,
        PERMISSIONS.VAULT.VIEW_SECURITY_COMPLIANCE,
        PERMISSIONS.VAULT.VIEW_VAULT_STATISTICS,
        PERMISSIONS.VAULT.VIEW_AUDIT_TRAIL,
        PERMISSIONS.VAULT.VIEW_VAULT_STATUS,
        // ✅ Branch Vault Permissions (view-only for accounting)
        PERMISSIONS.VAULT.VIEW_BRANCH_VAULTS,
        PERMISSIONS.VAULT.VIEW_BRANCH_VAULT_STATUS,
        // ✅ Financial Operations
        PERMISSIONS.VAULT.VAULT_RECONCILIATION,
        PERMISSIONS.VAULT.VIEW_VAULT_CAPACITY,
        PERMISSIONS.VAULT.VAULT_INVENTORY_VIEW,
        PERMISSIONS.VAULT.TRACK_VAULT_CONTENTS,
        PERMISSIONS.VAULT.GENERATE_VAULT_REPORT,
      ],
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
      PERFORMANCE_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.PERFORMANCE),
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
      PERFORMANCE_ACCESS_LEVEL: [PERMISSIONS.PERFORMANCE.VIEW_METRICS],
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
  // 19. Branch Manager - UPDATED WITH VAULT PERMISSIONS
  19: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.ACCOUNT),
      LOAN_OPERATIONS_ACCESS_LEVEL: [PERMISSIONS.LOAN_OPERATIONS.APPROVE],
      APPROVAL_ACCESS_LEVEL: [
        PERMISSIONS.APPROVAL.CUSTOMER_RELATED,
        PERMISSIONS.APPROVAL.STANDING_ORDER,
        PERMISSIONS.APPROVAL.VAULT_ACCESS,
        PERMISSIONS.APPROVAL.VAULT_OPERATION,
      ],
      DASHBOARD_ACCESS_LEVEL: [
        PERMISSIONS.DASHBOARD.VIEW,
        PERMISSIONS.DASHBOARD.TRANSACTION_OVERVIEW,
        PERMISSIONS.DASHBOARD.MANAGER_DASHBOARD,
        PERMISSIONS.DASHBOARD.QUICK_ACTIONS,
        PERMISSIONS.DASHBOARD.BU_PERFORMANCE,
      ],
      DEPOSIT_ACCESS_LEVEL: [PERMISSIONS.DEPOSIT.APPROVAL],
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW,
        PERMISSIONS.REPORT.PERFORMANCE_METRICS,
      ],
      RATE_ACCESS_LEVEL: [
        PERMISSIONS.RATE.DEPOSIT_INTEREST,
      ],
      PERFORMANCE_ACCESS_LEVEL: [PERMISSIONS.PERFORMANCE.VIEW_METRICS],
      // ✅ VAULT PERMISSIONS FOR BRANCH MANAGER - UPDATED
      VAULT_ACCESS_LEVEL: [
        PERMISSIONS.VAULT.CREATE_VAULT,
        PERMISSIONS.VAULT.VIEW_VAULTS,
        PERMISSIONS.VAULT.VIEW_VAULT_CONFIG,
        PERMISSIONS.VAULT.CONFIGURE_VAULT,
        PERMISSIONS.VAULT.UPDATE_VAULT,
        PERMISSIONS.VAULT.MANAGE_VAULT_ACCESS,
        PERMISSIONS.VAULT.AUTHORIZE_PERSONNEL,
        PERMISSIONS.VAULT.REVOKE_AUTHORIZATION,
        PERMISSIONS.VAULT.VIEW_AUTHORIZED_PERSONNEL,
        PERMISSIONS.VAULT.APPROVE_REQUEST,
        PERMISSIONS.VAULT.VIEW_PENDING_APPROVALS,
        PERMISSIONS.VAULT.RECORD_MAINTENANCE,
        PERMISSIONS.VAULT.VIEW_ACCESS_LOGS,
        PERMISSIONS.VAULT.VIEW_VAULT_UTILIZATION,
        PERMISSIONS.VAULT.VIEW_SECURITY_COMPLIANCE,
        PERMISSIONS.VAULT.VIEW_VAULT_STATISTICS,
        PERMISSIONS.VAULT.VIEW_AUDIT_TRAIL,
        PERMISSIONS.VAULT.OPEN_VAULT,
        PERMISSIONS.VAULT.CLOSE_VAULT,
        PERMISSIONS.VAULT.VIEW_VAULT_STATUS,
        // ✅ ADDED: Branch Vault Permissions for Branch Manager (deduplicated)
        PERMISSIONS.VAULT.VIEW_BRANCH_VAULTS,
        PERMISSIONS.VAULT.MANAGE_BRANCH_VAULTS,
        PERMISSIONS.VAULT.CONFIGURE_BRANCH_VAULT,
        PERMISSIONS.VAULT.VIEW_BRANCH_VAULT_STATUS,
        PERMISSIONS.VAULT.VAULT_DEPOSIT,
        PERMISSIONS.VAULT.VAULT_WITHDRAWAL,
        PERMISSIONS.VAULT.VAULT_TRANSFER,
        PERMISSIONS.VAULT.VAULT_RECONCILIATION,
        PERMISSIONS.VAULT.VIEW_VAULT_TRANSACTIONS,
        PERMISSIONS.VAULT.CANCEL_VAULT_TRANSACTION,
        PERMISSIONS.VAULT.EXPORT_VAULT_TRANSACTIONS,
      ],
    },
  },
  
  // 20. Branch Operation Supervisor - UPDATED WITH VAULT PERMISSIONS
  20: {
    permissions: {
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.ACCOUNT),
      DRAWER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DRAWER),
      APPROVAL_ACCESS_LEVEL: [
        PERMISSIONS.APPROVAL.CUSTOMER_RELATED,
        PERMISSIONS.APPROVAL.VAULT_ACCESS,
      ],
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.VIEW,
        PERMISSIONS.LOAN_OPERATIONS.PROCESS,
      ],
      DASHBOARD_ACCESS_LEVEL: [
        PERMISSIONS.DASHBOARD.VIEW,
        PERMISSIONS.DASHBOARD.BU_PERFORMANCE,
      ],
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW,
        PERMISSIONS.REPORT.PERFORMANCE_METRICS,
      ],
      // ✅ VAULT PERMISSIONS FOR BRANCH OPERATION SUPERVISOR
      VAULT_ACCESS_LEVEL: [
        PERMISSIONS.VAULT.VIEW_VAULTS,
        PERMISSIONS.VAULT.VIEW_VAULT_CONFIG,
        PERMISSIONS.VAULT.VIEW_AUTHORIZED_PERSONNEL,
        PERMISSIONS.VAULT.CREATE_APPROVAL_REQUEST,
        PERMISSIONS.VAULT.APPROVE_REQUEST,
        PERMISSIONS.VAULT.VIEW_PENDING_APPROVALS,
        PERMISSIONS.VAULT.LOG_ACCESS_ATTEMPT,
        PERMISSIONS.VAULT.RECORD_MAINTENANCE,
        PERMISSIONS.VAULT.VIEW_ACCESS_LOGS,
        PERMISSIONS.VAULT.VIEW_VAULT_UTILIZATION,
        PERMISSIONS.VAULT.VIEW_SECURITY_COMPLIANCE,
        PERMISSIONS.VAULT.OPEN_VAULT,
        PERMISSIONS.VAULT.CLOSE_VAULT,
        PERMISSIONS.VAULT.VIEW_VAULT_STATUS,
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
      PERFORMANCE_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.PERFORMANCE),
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
      LOAN_OPERATIONS_ACCESS_LEVEL: [
        PERMISSIONS.LOAN_OPERATIONS.CREDIT_APPLICATION,
        PERMISSIONS.LOAN_OPERATIONS.DISBURSE,
        PERMISSIONS.LOAN_OPERATIONS.VIEW,
        PERMISSIONS.LOAN_OPERATIONS.PROCESS,
      ],
      THRIFT_ACCESS_LEVEL: [
        PERMISSIONS.THRIFT.CREATE,
        PERMISSIONS.THRIFT.COLLECTION,
        PERMISSIONS.THRIFT.WITHDRAWAL,
      ],
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
      STANDING_ORDER_ACCESS_LEVEL: [
        PERMISSIONS.STANDING_ORDER.CREATE,
        PERMISSIONS.STANDING_ORDER.VIEW,
        PERMISSIONS.STANDING_ORDER.UPDATE,
        PERMISSIONS.STANDING_ORDER.DELETE,
      ],
    },
  },
  // 29. Teller - UPDATED PERMISSIONS
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
        PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
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
  // 30. Head Teller - UPDATED WITH VAULT PERMISSIONS
  30: {
    permissions: {
      DRAWER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.DRAWER),
      CUSTOMER_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: [
        PERMISSIONS.ACCOUNT.VIEW_BALANCE,
        PERMISSIONS.ACCOUNT.VIEW_STATEMENT,
        PERMISSIONS.ACCOUNT.FREEZE,
      ],
      APPROVAL_ACCESS_LEVEL: [
        PERMISSIONS.APPROVAL.TRANSACTION,
        PERMISSIONS.APPROVAL.VAULT_ACCESS,
      ],
      DEPOSIT_ACCESS_LEVEL: [PERMISSIONS.DEPOSIT.APPROVAL],
      DASHBOARD_ACCESS_LEVEL: [
        PERMISSIONS.DASHBOARD.VIEW,
        PERMISSIONS.DASHBOARD.TELLER_DASHBOARD,
        PERMISSIONS.DASHBOARD.BU_PERFORMANCE,
      ],
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW,
        PERMISSIONS.REPORT.TELLER_SUMMARY,
        PERMISSIONS.REPORT.PERFORMANCE_METRICS,
      ],
      PERFORMANCE_ACCESS_LEVEL: [PERMISSIONS.PERFORMANCE.VIEW_TELLER_PERFORMANCE],
      // ✅ VAULT PERMISSIONS FOR HEAD TELLER - UPDATED
      VAULT_ACCESS_LEVEL: [
        PERMISSIONS.VAULT.VIEW_VAULTS,
        PERMISSIONS.VAULT.VIEW_VAULT_CONFIG,
        PERMISSIONS.VAULT.VIEW_AUTHORIZED_PERSONNEL,
        PERMISSIONS.VAULT.CREATE_APPROVAL_REQUEST,
        PERMISSIONS.VAULT.APPROVE_REQUEST,
        PERMISSIONS.VAULT.VIEW_PENDING_APPROVALS,
        PERMISSIONS.VAULT.LOG_ACCESS_ATTEMPT,
        PERMISSIONS.VAULT.VIEW_ACCESS_LOGS,
        PERMISSIONS.VAULT.VIEW_VAULT_UTILIZATION,
        PERMISSIONS.VAULT.VIEW_SECURITY_COMPLIANCE,
        PERMISSIONS.VAULT.OPEN_VAULT,
        PERMISSIONS.VAULT.CLOSE_VAULT,
        PERMISSIONS.VAULT.VIEW_VAULT_STATUS,
        // ✅ ADDED: Branch Vault Permission
        PERMISSIONS.VAULT.VIEW_BRANCH_VAULTS,
        PERMISSIONS.VAULT.VAULT_DEPOSIT,
        PERMISSIONS.VAULT.VAULT_WITHDRAWAL,
        PERMISSIONS.VAULT.VAULT_TRANSFER,
        PERMISSIONS.VAULT.VAULT_RECONCILIATION,
        PERMISSIONS.VAULT.VIEW_VAULT_TRANSACTIONS,
        PERMISSIONS.VAULT.CANCEL_VAULT_TRANSACTION,
        PERMISSIONS.VAULT.EXPORT_VAULT_TRANSACTIONS,
      ],
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
      PERFORMANCE_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.PERFORMANCE),
      STATISTICS_ACCESS_LEVEL: safeGetPermissions(PERMISSIONS.STATISTICS),
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
      PERFORMANCE_ACCESS_LEVEL: [PERMISSIONS.PERFORMANCE.VIEW_METRICS],
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
      PERFORMANCE_ACCESS_LEVEL: [PERMISSIONS.PERFORMANCE.VIEW_METRICS],
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
  // 38. Vault Manager/Specialist - NEW ROLE
  38: {
    permissions: {
      // Focused on vault operations
      VAULT_ACCESS_LEVEL: [
        // Full Vault Management
        PERMISSIONS.VAULT.CREATE_VAULT,
        PERMISSIONS.VAULT.VIEW_VAULTS,
        PERMISSIONS.VAULT.VIEW_VAULT_CONFIG,
        PERMISSIONS.VAULT.CONFIGURE_VAULT,
        PERMISSIONS.VAULT.UPDATE_VAULT,
        PERMISSIONS.VAULT.DEACTIVATE_VAULT,
        
        // Full Access Control
        PERMISSIONS.VAULT.MANAGE_VAULT_ACCESS,
        PERMISSIONS.VAULT.AUTHORIZE_PERSONNEL,
        PERMISSIONS.VAULT.REVOKE_AUTHORIZATION,
        PERMISSIONS.VAULT.VIEW_AUTHORIZED_PERSONNEL,
        
        // Full Transaction Permissions
        PERMISSIONS.VAULT.VAULT_DEPOSIT,
        PERMISSIONS.VAULT.VAULT_WITHDRAWAL,
        PERMISSIONS.VAULT.VAULT_TRANSFER,
        PERMISSIONS.VAULT.VAULT_RECONCILIATION,
        PERMISSIONS.VAULT.VIEW_VAULT_TRANSACTIONS,
        PERMISSIONS.VAULT.CANCEL_VAULT_TRANSACTION,
        PERMISSIONS.VAULT.EXPORT_VAULT_TRANSACTIONS,
        
        // Full Security & Maintenance
        PERMISSIONS.VAULT.LOG_ACCESS_ATTEMPT,
        PERMISSIONS.VAULT.RECORD_MAINTENANCE,
        PERMISSIONS.VAULT.UPDATE_SECURITY_FEATURES,
        PERMISSIONS.VAULT.VIEW_ACCESS_LOGS,
        
        // Full Operational Access
        PERMISSIONS.VAULT.OPEN_VAULT,
        PERMISSIONS.VAULT.CLOSE_VAULT,
        PERMISSIONS.VAULT.VIEW_VAULT_STATUS,
        
        // All Branch Vault Permissions
        PERMISSIONS.VAULT.VIEW_BRANCH_VAULTS,
        PERMISSIONS.VAULT.MANAGE_BRANCH_VAULTS,
        PERMISSIONS.VAULT.CONFIGURE_BRANCH_VAULT,
        PERMISSIONS.VAULT.VIEW_BRANCH_VAULT_STATUS,
        PERMISSIONS.VAULT.BRANCH_VAULT_ACCESS,
        PERMISSIONS.VAULT.TRANSFER_BETWEEN_BRANCHES,
        
        // Additional Vault Permissions
        PERMISSIONS.VAULT.VIEW_VAULT_CAPACITY,
        PERMISSIONS.VAULT.UPDATE_VAULT_CAPACITY,
        PERMISSIONS.VAULT.VAULT_SPACE_ALLOCATION,
        PERMISSIONS.VAULT.VAULT_INVENTORY_VIEW,
        PERMISSIONS.VAULT.VAULT_INVENTORY_UPDATE,
        PERMISSIONS.VAULT.TRACK_VAULT_CONTENTS,
        PERMISSIONS.VAULT.GENERATE_VAULT_REPORT,
        PERMISSIONS.VAULT.VAULT_AUDIT,
        PERMISSIONS.VAULT.VAULT_COMPLIANCE_CHECK,
        PERMISSIONS.VAULT.EMERGENCY_VAULT_ACCESS,
        PERMISSIONS.VAULT.VAULT_LOCKDOWN,
        PERMISSIONS.VAULT.MANAGE_VAULT_SCHEDULE,
        PERMISSIONS.VAULT.VIEW_VAULT_CALENDAR,
        PERMISSIONS.VAULT.SET_VAULT_HOURS,
      ],
      // Supporting permissions
      REPORT_ACCESS_LEVEL: [
        PERMISSIONS.REPORT.VIEW,
        PERMISSIONS.REPORT.EXPORT,
      ],
      DASHBOARD_ACCESS_LEVEL: [
        PERMISSIONS.DASHBOARD.VIEW,
        PERMISSIONS.DASHBOARD.TRANSACTION_OVERVIEW,
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
    23: { id: 23, ROLE_NM: 'Payment and Reconciliation NGN' },
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
    38: { id: 38, ROLE_NM: 'Vault Manager' },
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
  vaultAccessApproval: PERMISSIONS.APPROVAL.VAULT_ACCESS,
  vaultOperationApproval: PERMISSIONS.APPROVAL.VAULT_OPERATION,

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

  // Standing Order Permissions
  standingOrderCreate: PERMISSIONS.STANDING_ORDER.CREATE,
  standingOrderView: PERMISSIONS.STANDING_ORDER.VIEW,
  standingOrderUpdate: PERMISSIONS.STANDING_ORDER.UPDATE,
  standingOrderDelete: PERMISSIONS.STANDING_ORDER.DELETE,

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

  // ✅ VAULT PERMISSIONS - Comprehensive Set - UPDATED WITH ALL PERMISSIONS
  // Basic Vault Operations
  CREATE_VAULT: PERMISSIONS.VAULT.CREATE_VAULT,
  VIEW_VAULTS: PERMISSIONS.VAULT.VIEW_VAULTS,
  UPDATE_VAULT: PERMISSIONS.VAULT.UPDATE_VAULT,
  DEACTIVATE_VAULT: PERMISSIONS.VAULT.DEACTIVATE_VAULT,
  OPEN_VAULT: PERMISSIONS.VAULT.OPEN_VAULT,
  CLOSE_VAULT: PERMISSIONS.VAULT.CLOSE_VAULT,
  VIEW_VAULT_STATUS: PERMISSIONS.VAULT.VIEW_VAULT_STATUS,
  
  // ✅ ADDED: Branch Vault Permissions
  VIEW_BRANCH_VAULTS: PERMISSIONS.VAULT.VIEW_BRANCH_VAULTS,
  MANAGE_BRANCH_VAULTS: PERMISSIONS.VAULT.MANAGE_BRANCH_VAULTS,
  CONFIGURE_BRANCH_VAULT: PERMISSIONS.VAULT.CONFIGURE_BRANCH_VAULT,
  VIEW_BRANCH_VAULT_STATUS: PERMISSIONS.VAULT.VIEW_BRANCH_VAULT_STATUS,
  BRANCH_VAULT_ACCESS: PERMISSIONS.VAULT.BRANCH_VAULT_ACCESS,
  
  // Vault Configuration
  CONFIGURE_VAULT: PERMISSIONS.VAULT.CONFIGURE_VAULT,
  VIEW_VAULT_CONFIG: PERMISSIONS.VAULT.VIEW_VAULT_CONFIG,
  
  // Access & Authorization
  MANAGE_VAULT_ACCESS: PERMISSIONS.VAULT.MANAGE_VAULT_ACCESS,
  AUTHORIZE_PERSONNEL: PERMISSIONS.VAULT.AUTHORIZE_PERSONNEL,
  REVOKE_AUTHORIZATION: PERMISSIONS.VAULT.REVOKE_AUTHORIZATION,
  VIEW_AUTHORIZED_PERSONNEL: PERMISSIONS.VAULT.VIEW_AUTHORIZED_PERSONNEL,
  
  // Approval Workflows
  CREATE_APPROVAL_REQUEST: PERMISSIONS.VAULT.CREATE_APPROVAL_REQUEST,
  APPROVE_REQUEST: PERMISSIONS.VAULT.APPROVE_REQUEST,
  VIEW_PENDING_APPROVALS: PERMISSIONS.VAULT.VIEW_PENDING_APPROVALS,
  
  // Security & Maintenance
  LOG_ACCESS_ATTEMPT: PERMISSIONS.VAULT.LOG_ACCESS_ATTEMPT,
  RECORD_MAINTENANCE: PERMISSIONS.VAULT.RECORD_MAINTENANCE,
  UPDATE_SECURITY_FEATURES: PERMISSIONS.VAULT.UPDATE_SECURITY_FEATURES,
  VIEW_ACCESS_LOGS: PERMISSIONS.VAULT.VIEW_ACCESS_LOGS,
  
  // Reporting & Analytics
  VIEW_VAULT_UTILIZATION: PERMISSIONS.VAULT.VIEW_VAULT_UTILIZATION,
  VIEW_SECURITY_COMPLIANCE: PERMISSIONS.VAULT.VIEW_SECURITY_COMPLIANCE,
  VIEW_VAULT_STATISTICS: PERMISSIONS.VAULT.VIEW_VAULT_STATISTICS,
  VIEW_AUDIT_TRAIL: PERMISSIONS.VAULT.VIEW_AUDIT_TRAIL,
  
  // Financial Operations
  VAULT_DEPOSIT: PERMISSIONS.VAULT.VAULT_DEPOSIT,
  VAULT_WITHDRAWAL: PERMISSIONS.VAULT.VAULT_WITHDRAWAL,
  VAULT_TRANSFER: PERMISSIONS.VAULT.VAULT_TRANSFER,
  VAULT_RECONCILIATION: PERMISSIONS.VAULT.VAULT_RECONCILIATION,
  
  VIEW_VAULT_TRANSACTIONS: PERMISSIONS.VAULT.VIEW_VAULT_TRANSACTIONS,
  CANCEL_VAULT_TRANSACTION: PERMISSIONS.VAULT.CANCEL_VAULT_TRANSACTION,
  EXPORT_VAULT_TRANSACTIONS: PERMISSIONS.VAULT.EXPORT_VAULT_TRANSACTIONS,
  
  // Audit & Compliance
  VAULT_AUDIT: PERMISSIONS.VAULT.VAULT_AUDIT,
  VAULT_COMPLIANCE_CHECK: PERMISSIONS.VAULT.VAULT_COMPLIANCE_CHECK,
  GENERATE_VAULT_REPORT: PERMISSIONS.VAULT.GENERATE_VAULT_REPORT,
  
  // Emergency Operations
  EMERGENCY_VAULT_ACCESS: PERMISSIONS.VAULT.EMERGENCY_VAULT_ACCESS,
  VAULT_LOCKDOWN: PERMISSIONS.VAULT.VAULT_LOCKDOWN,
  VAULT_ALARM_CONTROL: PERMISSIONS.VAULT.VAULT_ALARM_CONTROL,
  
  // Key Management
  MANAGE_VAULT_KEYS: PERMISSIONS.VAULT.MANAGE_VAULT_KEYS,
  ISSUE_TEMP_ACCESS: PERMISSIONS.VAULT.ISSUE_TEMP_ACCESS,
  TRACK_KEY_USAGE: PERMISSIONS.VAULT.TRACK_KEY_USAGE,
  
  // Capacity Management
  VIEW_VAULT_CAPACITY: PERMISSIONS.VAULT.VIEW_VAULT_CAPACITY,
  UPDATE_VAULT_CAPACITY: PERMISSIONS.VAULT.UPDATE_VAULT_CAPACITY,
  VAULT_SPACE_ALLOCATION: PERMISSIONS.VAULT.VAULT_SPACE_ALLOCATION,
  
  // Inventory Management
  VAULT_INVENTORY_VIEW: PERMISSIONS.VAULT.VAULT_INVENTORY_VIEW,
  VAULT_INVENTORY_UPDATE: PERMISSIONS.VAULT.VAULT_INVENTORY_UPDATE,
  TRACK_VAULT_CONTENTS: PERMISSIONS.VAULT.TRACK_VAULT_CONTENTS,
  
  // Schedule Management
  MANAGE_VAULT_SCHEDULE: PERMISSIONS.VAULT.MANAGE_VAULT_SCHEDULE,
  VIEW_VAULT_CALENDAR: PERMISSIONS.VAULT.VIEW_VAULT_CALENDAR,
  SET_VAULT_HOURS: PERMISSIONS.VAULT.SET_VAULT_HOURS,
  
  // Multi-level Access
  TIER1_VAULT_ACCESS: PERMISSIONS.VAULT.TIER1_VAULT_ACCESS,
  TIER2_VAULT_ACCESS: PERMISSIONS.VAULT.TIER2_VAULT_ACCESS,
  TIER3_VAULT_ACCESS: PERMISSIONS.VAULT.TIER3_VAULT_ACCESS,
  
  // Notification & Alerts
  VAULT_ALERTS: PERMISSIONS.VAULT.VAULT_ALERTS,
  CONFIGURE_VAULT_ALERTS: PERMISSIONS.VAULT.CONFIGURE_VAULT_ALERTS,
  ACKNOWLEDGE_VAULT_ALERT: PERMISSIONS.VAULT.ACKNOWLEDGE_VAULT_ALERT,
  
  // Documentation
  VAULT_DOCUMENTATION: PERMISSIONS.VAULT.VAULT_DOCUMENTATION,
  UPDATE_VAULT_DOCS: PERMISSIONS.VAULT.UPDATE_VAULT_DOCS,
  VAULT_POLICIES: PERMISSIONS.VAULT.VAULT_POLICIES,
  
  // Training & Certification
  VAULT_TRAINING: PERMISSIONS.VAULT.VAULT_TRAINING,
  CERTIFY_PERSONNEL: PERMISSIONS.VAULT.CERTIFY_PERSONNEL,
  VIEW_CERTIFICATIONS: PERMISSIONS.VAULT.VIEW_CERTIFICATIONS,

  // Alternative vault permission mappings for different route names (camelCase versions)
  createVault: PERMISSIONS.VAULT.CREATE_VAULT,
  viewVaults: PERMISSIONS.VAULT.VIEW_VAULTS,
  updateVault: PERMISSIONS.VAULT.UPDATE_VAULT,
  deactivateVault: PERMISSIONS.VAULT.DEACTIVATE_VAULT,
  configureVault: PERMISSIONS.VAULT.CONFIGURE_VAULT,
  viewVaultConfig: PERMISSIONS.VAULT.VIEW_VAULT_CONFIG,
  manageVaultAccess: PERMISSIONS.VAULT.MANAGE_VAULT_ACCESS,
  authorizePersonnel: PERMISSIONS.VAULT.AUTHORIZE_PERSONNEL,
  revokeAuthorization: PERMISSIONS.VAULT.REVOKE_AUTHORIZATION,
  viewAuthorizedPersonnel: PERMISSIONS.VAULT.VIEW_AUTHORIZED_PERSONNEL,
  createApprovalRequest: PERMISSIONS.VAULT.CREATE_APPROVAL_REQUEST,
  approveRequest: PERMISSIONS.VAULT.APPROVE_REQUEST,
  viewPendingApprovals: PERMISSIONS.VAULT.VIEW_PENDING_APPROVALS,
  logAccessAttempt: PERMISSIONS.VAULT.LOG_ACCESS_ATTEMPT,
  recordMaintenance: PERMISSIONS.VAULT.RECORD_MAINTENANCE,
  updateSecurityFeatures: PERMISSIONS.VAULT.UPDATE_SECURITY_FEATURES,
  viewAccessLogs: PERMISSIONS.VAULT.VIEW_ACCESS_LOGS,
  viewVaultUtilization: PERMISSIONS.VAULT.VIEW_VAULT_UTILIZATION,
  viewSecurityCompliance: PERMISSIONS.VAULT.VIEW_SECURITY_COMPLIANCE,
  viewVaultStatistics: PERMISSIONS.VAULT.VIEW_VAULT_STATISTICS,
  viewAuditTrail: PERMISSIONS.VAULT.VIEW_AUDIT_TRAIL,
  openVault: PERMISSIONS.VAULT.OPEN_VAULT,
  closeVault: PERMISSIONS.VAULT.CLOSE_VAULT,
  viewVaultStatus: PERMISSIONS.VAULT.VIEW_VAULT_STATUS,
  
  // ✅ ADDED: Branch Vault camelCase versions
  viewBranchVaults: PERMISSIONS.VAULT.VIEW_BRANCH_VAULTS,
  manageBranchVaults: PERMISSIONS.VAULT.MANAGE_BRANCH_VAULTS,
  configureBranchVault: PERMISSIONS.VAULT.CONFIGURE_BRANCH_VAULT,
  viewBranchVaultStatus: PERMISSIONS.VAULT.VIEW_BRANCH_VAULT_STATUS,
  branchVaultAccess: PERMISSIONS.VAULT.BRANCH_VAULT_ACCESS,

  // ✅ TELLER STATS ENDPOINT MAPPINGS
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

export async function roleHasPermission(roleId, permission) {
  try {
    console.log('🔍 roleHasPermission DEBUG START ======================');
    console.log('🎯 Checking role:', roleId, 'for permission:', permission);
    console.log('📝 Permission type:', typeof permission, 'Value:', permission);
    
    if (parseInt(roleId) === 1) {
      console.log('✅ Administrator role - granting all permissions');
      console.log('🔍 roleHasPermission DEBUG END ========================');
      return true;
    }

    // First, check database
    const Permissions = (await import('./models/Permissions.js')).default;
    const dbPermissions = await Permissions.findOne({ BU_ROLE_ID: roleId }).lean();
    
    if (dbPermissions) {
      console.log('📋 Found DB permissions for role:', roleId);
      
      // Method 1: Check specific permission group
      if (dbPermissions.VAULT_ACCESS_LEVEL && Array.isArray(dbPermissions.VAULT_ACCESS_LEVEL)) {
        console.log('📋 VAULT_ACCESS_LEVEL from DB:', dbPermissions.VAULT_ACCESS_LEVEL);
        console.log('🔍 Looking for permission in VAULT_ACCESS_LEVEL...');
        
        // Convert both to same case for comparison
        const dbPermissionSet = new Set(dbPermissions.VAULT_ACCESS_LEVEL.map(p => p.trim().toUpperCase()));
        const checkPermission = permission.trim().toUpperCase();
        
        console.log('📋 Permission set (uppercase):', Array.from(dbPermissionSet));
        console.log('🔍 Checking for (uppercase):', checkPermission);
        console.log('✅ Found?', dbPermissionSet.has(checkPermission));
        
        if (dbPermissionSet.has(checkPermission)) {
          console.log('✅ Permission found in VAULT_ACCESS_LEVEL');
          console.log('🔍 roleHasPermission DEBUG END ========================');
          return true;
        }
      }
      
      // Method 2: Check all permissions
      const allPermissions = [];
      Object.entries(dbPermissions).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          console.log(`📋 ${key}:`, value);
          allPermissions.push(...value.filter(p => typeof p === 'string'));
        }
      });
      
      console.log('📋 All permissions from DB:', allPermissions);
      
      // Compare with case insensitivity
      const found = allPermissions.some(p => 
        p.trim().toUpperCase() === permission.trim().toUpperCase()
      );
      
      console.log('🔍 Case-insensitive comparison result:', found);
      
      if (found) {
        console.log('✅ Permission found in all DB permissions');
        console.log('🔍 roleHasPermission DEBUG END ========================');
        return true;
      }
    }

    // Fallback to ROLE_MAPPING
    console.log('🔄 Checking ROLE_MAPPING for role:', roleId);
    const role = ROLE_MAPPING[roleId];
    
    if (!role) {
      console.log('❌ Role not found in ROLE_MAPPING');
      console.log('🔍 roleHasPermission DEBUG END ========================');
      return false;
    }
    
    console.log('📋 Role found:', role.ROLE_NM);
    
    if (role.permissions && role.permissions.VAULT_ACCESS_LEVEL) {
      console.log('📋 VAULT_ACCESS_LEVEL from ROLE_MAPPING:', role.permissions.VAULT_ACCESS_LEVEL);
      
      const rolePermissionSet = new Set(
        role.permissions.VAULT_ACCESS_LEVEL.map(p => p.trim().toUpperCase())
      );
      const checkPermission = permission.trim().toUpperCase();
      
      console.log('🔍 Checking for (uppercase):', checkPermission, 'in role permissions');
      console.log('✅ Found?', rolePermissionSet.has(checkPermission));
      
      if (rolePermissionSet.has(checkPermission)) {
        console.log('✅ Permission found in ROLE_MAPPING');
        console.log('🔍 roleHasPermission DEBUG END ========================');
        return true;
      }
    }
    
    console.log('❌ Permission not found anywhere');
    console.log('🔍 roleHasPermission DEBUG END ========================');
    return false;
    
  } catch (error) {
    console.error('❌ roleHasPermission error:', error);
    console.error('❌ Stack:', error.stack);
    return false;
  }
}

/////////////////////////////////////////////////////////////////
/// VAULT TRANSACTION TEST
////////////////////////////////////////////////////////////////

// Test function to verify vault transaction permissions
export async function testVaultTransactionPermissions() {
  const testRoles = [19, 20, 29, 30, 38]; // Roles that should have vault access
  
  console.log('🔍 Testing Vault Transaction Permissions ==================');
  
  for (const roleId of testRoles) {
    const role = ROLE_MAPPING[roleId];
    console.log(`\n📋 Testing Role: ${role?.ROLE_NM} (ID: ${roleId})`);
    
    // Test vault transaction permissions
    const vaultPermissions = role?.permissions?.VAULT_ACCESS_LEVEL || [];
    
    console.log('📊 Vault Permissions Count:', vaultPermissions.length);
    
    // Check specific transaction permissions
    const requiredPermissions = [
      'VAULT_DEPOSIT',
      'VAULT_WITHDRAWAL', 
      'VAULT_TRANSFER',
      'VIEW_VAULT_TRANSACTIONS'
    ];
    
    for (const perm of requiredPermissions) {
      const hasPerm = vaultPermissions.includes(perm);
      console.log(`  ${hasPerm ? '✅' : '❌'} ${perm}: ${hasPerm}`);
    }
  }
  
  console.log('\n✅ Vault Transaction Permissions Test Complete');
}
//////////////////////////////////////////////////////////////////

function deriveModuleKey(path, method) {
  const pathParts = path.split('/').filter(part => part);
  const lastPart = pathParts[pathParts.length - 1];
  
  // Handle vault-specific routes
  if (path.includes('/vaults')) {
    if (method === 'POST') return 'CREATE_VAULT';
    if (method === 'GET' && lastPart === 'vaults') return 'VIEW_VAULTS';
    if (method === 'GET' && path.includes('/configuration')) return 'VIEW_VAULT_CONFIG';
    if (method === 'PUT' && path.includes('/configuration')) return 'CONFIGURE_VAULT';
    if (method === 'PUT') return 'UPDATE_VAULT';
    if (method === 'DELETE') return 'DEACTIVATE_VAULT';
  }
  
  // Generic derivation
  return lastPart || 'dashboard';
}

// constants/roleMapping.js
export const checkPermissions = (moduleKey) => {
  return async (req, res, next) => {
    console.log('⚠️  TEMPORARY: checkPermissions bypassed for module:', moduleKey);
    next();
  };
};


// ======================
// TEMPORARY BYPASS FOR TESTING
// ======================
export const tempBypassPermissions = (req, res, next) => {
  console.log('⚠️  TEMPORARY: Permission check bypassed for testing');
  next();
};

// Enhanced sync with validation including vault transaction testing
export async function syncPermissionsWithValidation() {
  try {
    console.log('🔄 Starting enhanced permission sync with validation...');
    await syncPermissions();
    const adminValid = await verifyAdministratorPermissions();
    if (!adminValid) {
      throw new Error('Administrator permission validation failed');
    }
    await testVaultTransactionPermissions();
    const structureValid = validatePermissions();
    if (!structureValid) {
      throw new Error('Permission structure validation failed');
    }
    console.log('✅ Enhanced permission sync with validation completed successfully');
  } catch (error) {
    console.error('❌ Enhanced sync failed:', error.message);
    throw error;
  }
}

// Quick permission check for fallback
export async function quickPermissionCheck() {
  try {
    console.log('🔍 Running quick permission check...');
    const count = await Permissions.countDocuments();
    console.log(`📊 Found ${count} permission records in DB`);
    
    if (count === 0) {
      console.warn('⚠️ No permissions found in DB - full sync required');
      return false;
    }
    
    const adminValid = await verifyAdministratorPermissions();
    console.log(`👑 Admin permissions valid: ${adminValid}`);
    
    const structureValid = validatePermissions();
    console.log(`🔧 Structure valid: ${structureValid}`);
    
    const overallValid = adminValid && structureValid;
    console.log(`✅ Quick check ${overallValid ? 'PASSED' : 'FAILED'}`);
    return overallValid;
  } catch (error) {
    console.error('❌ Quick permission check failed:', error.message);
    return false;
  }
}

// Call during application startup
validatePermissions();

// At the bottom of your permissions.js file, update the default export:
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
  checkPermissions,
  tempBypassPermissions,
  testVaultTransactionPermissions,
  syncPermissionsWithValidation,
  quickPermissionCheck,
};