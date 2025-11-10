// middleware/permissionMiddleware.js - FULLY UPDATED with Enhanced getUserPermissions
import { roleHasPermission } from '../constants/roleMapping.js';
import PERMISSIONS from '../constants/permissions.js';

// ✅ UNIFIED PERMISSION MIDDLEWARE (Combines all approaches)
export const checkPermission = (permissionKey) => {
  return async (req, res, next) => {
    try {
      const user = req.user;
      
      // ✅ CRITICAL: Enhanced admin check
      const isAdmin = (
        user?.isAdmin === true ||
        user?.role_name === 'Administrator' ||
        user?.role === 'Administrator' ||
        user?.role === 'SuperAdmin' ||
        (user?.roles && user.roles.includes('Administrator'))
      );

      // ✅ ADMIN BYPASS: Allow all administrators to bypass permission checks
      if (isAdmin) {
        console.log('🔐 ADMIN BYPASS: Administrator bypassing permission check for:', permissionKey);
        return next();
      }

      // ✅ ROLE-BASED PERMISSION CHECK (for non-admin users)
      if (user?.roleId) {
        const hasPermission = await roleHasPermission(user.roleId, permissionKey);
        if (hasPermission) {
          console.log('✅ Role-based permission granted:', { roleId: user.roleId, permissionKey });
          return next();
        }
      }

      // ✅ FALLBACK: Legacy role-permission mapping (if no roleId)
      const userPermissions = getUserPermissions(user?.role);
      if (userPermissions && userPermissions.includes(permissionKey)) {
        console.log('✅ Legacy permission granted:', { role: user?.role, permissionKey });
        return next();
      }

      // ❌ PERMISSION DENIED
      console.log('❌ PERMISSION DENIED:', {
        user: user?.user_name || user?.name,
        role: user?.role,
        roleId: user?.roleId,
        requiredPermission: permissionKey,
        isAdmin: isAdmin
      });

      return res.status(403).json({
        success: false,
        message: `Access denied: No permission for ${permissionKey}`,
        errorCode: 'INSUFFICIENT_PERMISSIONS',
        requiredPermission: permissionKey
      });

    } catch (error) {
      console.error('❌ Permission check error:', error);
      return res.status(500).json({
        success: false,
        message: "Error checking permissions",
        error: error.message
      });
    }
  };
};

// ✅ UNIFIED ADMIN ROLE CHECK - CLEANED UP
export const checkAdminRole = (req, res, next) => {
  // Enhanced debug logging
  console.log('🔐 Admin Check - User Details:', {
    userId: req.user?.userId,
    username: req.user?.user_name,
    allRoles: req.user?.roles || [],
    effectiveRole: req.user?.role_name,
    isAdminFlag: req.user?.isAdmin,
    role: req.user?.role
  });

  // ✅ CONSISTENT: Check multiple possible admin indicators
  const isAdmin = (
    req.user?.isAdmin === true ||
    req.user?.role_name === 'Administrator' ||
    req.user?.role === 'Administrator' ||
    req.user?.role === 'SuperAdmin' || // ✅ ADDED: SuperAdmin support
    (req.user?.roles && req.user.roles.includes('Administrator'))
  );

  if (!req.user || !isAdmin) {
    console.warn('❌ Admin access denied for user:', req.user?.user_name);
    return res.status(403).json({
      success: false, // ✅ CONSISTENT: Added success field
      message: 'Only Administrators can perform this action.',
      userDetails: {
        userId: req.user?.userId,
        username: req.user?.user_name,
        allRoles: req.user?.roles || [],
        effectiveRole: req.user?.role_name,
        isAdminFlag: req.user?.isAdmin,
        role: req.user?.role
      },
      required: {
        role: 'Administrator',
        orFlag: 'isAdmin: true'
      }
    });
  }

  console.log('✅ Admin access granted to:', req.user.user_name);
  next();
};

// ✅ HELPER: Get user permissions (legacy fallback) - FULLY UPDATED with all roles and permissions
export const getUserPermissions = (userRole) => {
  const rolePermissions = {
    Administrator: Object.values(PERMISSIONS).flatMap(category => 
      Object.values(category)
    ),
    'Head Banking Services': [
      PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS, // ✅ ADDED: For deactivate/activate
      PERMISSIONS.SYSTEM_ADMIN.VIEW_USERS,
      PERMISSIONS.SYSTEM_ADMIN.ACTIVATE_USER,
      PERMISSIONS.SYSTEM_ADMIN.DEACTIVATE_USER,
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.CUSTOMER.UPDATE,
      PERMISSIONS.ACCOUNT.VIEW_BALANCE,
      PERMISSIONS.TRANSACTION.VIEW_HISTORY,
      PERMISSIONS.LOAN_OPERATIONS.APPROVE,
      PERMISSIONS.LOAN_OPERATIONS.REJECT,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
      PERMISSIONS.RATE.LOAN_INTEREST,
    ],
    'Loan Processing Officer': [
      PERMISSIONS.LOAN_FEE.VIEW,
      PERMISSIONS.LOAN_FEE.TOGGLE_STATUS,
      PERMISSIONS.LOAN_OPERATIONS.DISBURSE,
      PERMISSIONS.LOAN_OPERATIONS.COLLECT,
    ],
    'Senior Financial Accountant': [
      PERMISSIONS.POSTING.CUSTOMER_POSTING,
      PERMISSIONS.POSTING.GL_POSTING,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.REPORT.EXPORT,
      PERMISSIONS.FIXED_ASSET.REGISTER,
      PERMISSIONS.FIXED_ASSET.DEPRECIATE,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
    ],
    'Internal Control Officer': [
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.SYSTEM_ADMIN.AUDIT_LOGS,
    ],
    'Internal Control Manager': [
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.SYSTEM_ADMIN.AUDIT_LOGS,
      PERMISSIONS.PERMISSION_MANAGEMENT.VIEW_PERMISSIONS,
    ],
    'Head of Credit': [
      PERMISSIONS.LOAN_FEE.VIEW,
      PERMISSIONS.LOAN_OPERATIONS.APPROVE,
      PERMISSIONS.LOAN_OPERATIONS.REJECT,
      PERMISSIONS.CREDIT_APPL.CREATE,
      PERMISSIONS.CREDIT_APPL.REVIEW,
      PERMISSIONS.CREDIT_APPL.APPROVE,
      PERMISSIONS.CREDIT_APPL.REJECT,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.RATE.LOAN_INTEREST,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
    ],
    'Internal Audit Manager': [
      PERMISSIONS.SYSTEM_ADMIN.AUDIT_LOGS,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.PERMISSION_MANAGEMENT.VIEW_PERMISSIONS,
    ],
    'Head Human Resources': [
      PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS,
      PERMISSIONS.PERMISSION_MANAGEMENT.ASSIGN_ROLES,
    ],
    'Human Resource Officer': [
      PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS,
    ],
    'IT Manager': [
      PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS,
      PERMISSIONS.SYSTEM_ADMIN.SYSTEM_CONFIG,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.REPORT.EXPORT,
    ],
    'Financial Accountant': [
      PERMISSIONS.POSTING.CUSTOMER_POSTING,
      PERMISSIONS.POSTING.GL_POSTING,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.FIXED_ASSET.VIEW,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
    ],
    'Financial Accountant Manager': [
      PERMISSIONS.POSTING.CUSTOMER_POSTING,
      PERMISSIONS.POSTING.GL_POSTING,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.REPORT.EXPORT,
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.FIXED_ASSET.VIEW,
      PERMISSIONS.APPROVAL.FINANCIAL,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
      PERMISSIONS.RATE.INDEX,
    ],
    'Chief Financial Officer': [
      PERMISSIONS.POSTING.CUSTOMER_POSTING,
      PERMISSIONS.POSTING.GL_POSTING,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.FIXED_ASSET.VIEW,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
      PERMISSIONS.RATE.INDEX,
      PERMISSIONS.PERFORMANCE.VIEW_METRICS,
    ],
    'Chief Executive Officer': [
      PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS,
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.APPROVAL.CUSTOMER_RELATED,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
      PERMISSIONS.PERFORMANCE.VIEW_METRICS,
    ],
    'Treasurer': [
      PERMISSIONS.POSTING.CUSTOMER_POSTING,
      PERMISSIONS.POSTING.GL_POSTING,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.TREASURY.VIEW,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
      PERMISSIONS.PERFORMANCE.VIEW_METRICS,
    ],
    'Loan Processing Supervisor': [
      PERMISSIONS.LOAN_OPERATIONS.APPROVE,
      PERMISSIONS.LOAN_OPERATIONS.REJECT,
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.CUSTOMER.UPDATE,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.RATE.LOAN_INTEREST,
    ],
    'Senior Financial Accountant': [
      PERMISSIONS.POSTING.CUSTOMER_POSTING,
      PERMISSIONS.POSTING.GL_POSTING,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.FIXED_ASSET.VIEW,
      PERMISSIONS.APPROVAL.FINANCIAL,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
    ],
    'Branch Manager': [
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.CUSTOMER.UPDATE,
      PERMISSIONS.ACCOUNT.VIEW_BALANCE,
      PERMISSIONS.LOAN_OPERATIONS.APPROVE,
      PERMISSIONS.APPROVAL.CUSTOMER_RELATED,
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.DEPOSIT.APPROVAL,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
      PERMISSIONS.PERFORMANCE.VIEW_METRICS,
    ],
    'Branch Operation Supervisor': [
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.CUSTOMER.UPDATE,
      PERMISSIONS.ACCOUNT.VIEW_BALANCE,
      PERMISSIONS.DRAWER.VIEW,
      PERMISSIONS.APPROVAL.CUSTOMER_RELATED,
      PERMISSIONS.LOAN_OPERATIONS.VIEW,
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.REPORT.VIEW,
    ],
    'Chief Operation Officer': [
      PERMISSIONS.SYSTEM_ADMIN.SYSTEM_CONFIG,
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.OPERATIONS.VIEW,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
      PERMISSIONS.PERFORMANCE.VIEW_METRICS,
    ],
    'Marketing Manager': [
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.MARKETING.CREATE_CAMPAIGN,
      PERMISSIONS.MARKETING.VIEW_ANALYTICS,
    ],
    'Payment and Reconciliation USD': [
      PERMISSIONS.POSTING.CUSTOMER_POSTING,
      PERMISSIONS.POSTING.GL_POSTING,
      PERMISSIONS.RECONCILIATION.PROCESS_RECONCILIATION,
    ],
    'EOD Operator': [
      PERMISSIONS.SYSTEM_ADMIN.OS_TRIGGER,
      PERMISSIONS.REPORT.VIEW,
    ],
    'Recovery Officer': [
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.LOAN_OPERATIONS.VIEW,
      PERMISSIONS.LOAN_OPERATIONS.COLLECT,
    ],
    'Relationship Development Officer': [
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.REPORT.VIEW,
    ],
    'Customer Relationship Officer': [
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.CUSTOMER.UPDATE,
      PERMISSIONS.ACCOUNT.VIEW_BALANCE,
    ],
    'Customer Service Officer': [
      PERMISSIONS.CUSTOMER.CREATE,
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.CUSTOMER.UPDATE,
      PERMISSIONS.CUSTOMER.KYC_VERIFY,
      PERMISSIONS.ACCOUNT.OPEN,
      PERMISSIONS.ACCOUNT.FREEZE,
      PERMISSIONS.LOAN_FEE.VIEW,
      PERMISSIONS.LOAN_FEE.CREATE,
      PERMISSIONS.LOAN_FEE.UPDATE,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.DASHBOARD.CREDIT_OFFICER_DASHBOARD,
      PERMISSIONS.PRODUCT.VIEW,
      PERMISSIONS.LOAN_OPERATIONS.CREDIT_APPLICATION,
      PERMISSIONS.LOAN_OPERATIONS.DISBURSE,
      PERMISSIONS.THRIFT.CREATE,
      PERMISSIONS.THRIFT.COLLECTION,
      PERMISSIONS.THRIFT.WITHDRAWAL,
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
      PERMISSIONS.STANDING_ORDER.CREATE,
      PERMISSIONS.STANDING_ORDER.VIEW,
      PERMISSIONS.STANDING_ORDER.UPDATE,
      PERMISSIONS.STANDING_ORDER.DELETE,
    ],
    'Teller': [
      PERMISSIONS.DASHBOARD.TELLER_DASHBOARD,
      PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
      PERMISSIONS.TRANSACTION.DEPOSIT,
      PERMISSIONS.TRANSACTION.WITHDRAWAL,
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.ACCOUNT.VIEW_BALANCE,
      PERMISSIONS.DRAWER.VIEW,
      PERMISSIONS.DRAWER.MANAGE,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.REPORT.TELLER_SUMMARY,
      PERMISSIONS.THRIFT.WITHDRAWAL,
    ],
    'Head Teller': [
      PERMISSIONS.DASHBOARD.TELLER_DASHBOARD,
      PERMISSIONS.DASHBOARD.REAL_TIME_STATS,
      PERMISSIONS.DASHBOARD.BU_PERFORMANCE,
      PERMISSIONS.DRAWER.VIEW,
      PERMISSIONS.DRAWER.MANAGE,
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.CUSTOMER.UPDATE,
      PERMISSIONS.ACCOUNT.VIEW_BALANCE,
      PERMISSIONS.ACCOUNT.FREEZE,
      PERMISSIONS.APPROVAL.TRANSACTION,
      PERMISSIONS.DEPOSIT.APPROVAL,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.REPORT.TELLER_SUMMARY,
      PERMISSIONS.PERFORMANCE.VIEW_TELLER_PERFORMANCE,
    ],
    'Customer Relationship Supervisor': [
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.CUSTOMER.UPDATE,
      PERMISSIONS.CUSTOMER.APPROVAL,
      PERMISSIONS.ACCOUNT.VIEW_BALANCE,
      PERMISSIONS.APPROVAL.CUSTOMER_RELATED,
    ],
    'Recovery Team Lead': [
      PERMISSIONS.LOAN_OPERATIONS.VIEW,
      PERMISSIONS.LOAN_OPERATIONS.COLLECT,
      PERMISSIONS.LOAN_OPERATIONS.APPROVE,
      PERMISSIONS.REPORT.VIEW,
    ],
    'Business Analyst': [
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.ANALYTICS.VIEW_BUSINESS_ANALYTICS,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
      PERMISSIONS.PERFORMANCE.VIEW_METRICS,
      PERMISSIONS.STATISTICS.VIEW_REAL_TIME,
    ],
    'Credit Risk Analyst': [
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.RISK.VIEW_RISK_REPORT,
      PERMISSIONS.LOAN_OPERATIONS.VIEW,
      PERMISSIONS.LOAN_OPERATIONS.PROCESS,
      PERMISSIONS.RATE.LOAN_INTEREST,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
      PERMISSIONS.PERFORMANCE.VIEW_METRICS,
    ],
    'Head of Digital Banking': [
      PERMISSIONS.SYSTEM_ADMIN.SYSTEM_CONFIG,
      PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.DASHBOARD.VIEW,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
      PERMISSIONS.PERFORMANCE.VIEW_METRICS,
    ],
    'Agency Banking Officer': [
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.CUSTOMER.CREATE,
      PERMISSIONS.AGENCY.MANAGE_AGENCY,
      PERMISSIONS.REPORT.VIEW,
    ],
    'Channel Manager': [
      PERMISSIONS.CUSTOMER.VIEW,
      PERMISSIONS.CUSTOMER.UPDATE,
      PERMISSIONS.REPORT.VIEW,
      PERMISSIONS.RATE.DEPOSIT_INTEREST,
    ],
  };
  return rolePermissions[userRole] || [];
};

// ✅ SPECIALIZED: Teller dashboard access (using unified permission system)
export const checkTellerDashboardAccess = async (req, res, next) => {
  return checkPermission(PERMISSIONS.DASHBOARD.REAL_TIME_STATS)(req, res, next);
};

// ✅ GENERIC: Role-based permission middleware (now uses unified system)
export const requireRolePermission = (permission) => {
  return checkPermission(permission);
};

// ✅ ENHANCED: Role authorization with permissions
export const authorizeRolesWithPermissions = (roles, requiredPermission = null) => {
  return async (req, res, next) => {
    try {
      // First check role access
      if (!req.user || !req.user.role) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: No user role found'
        });
      }

      if (!roles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Forbidden: You do not have access to this role'
        });
      }

      // Then check specific permission if provided
      if (requiredPermission) {
        return checkPermission(requiredPermission)(req, res, next);
      }

      next();
    } catch (error) {
      console.error('❌ Authorize roles with permissions error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error checking access'
      });
    }
  };
};

export default {
  checkAdminRole,
  checkPermission,
  checkTellerDashboardAccess,
  requireRolePermission,
  authorizeRolesWithPermissions,
  getUserPermissions
};