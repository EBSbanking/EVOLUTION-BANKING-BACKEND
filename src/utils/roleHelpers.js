// utils/roleHelpers.js
import { ROLE_MAPPING, getRoleWithPermissions, roleHasPermission } from '../../src/Services/rolePermissionService.js';

/**
 * Get role name by role ID
 * @param {string|number} buRoleId - Role ID
 * @returns {string} Role name
 */
export const getRoleName = (buRoleId) => {
  // First try to get from ROLE_MAPPING
  const roleId = buRoleId?.toString();
  if (roleId && ROLE_MAPPING[roleId]) {
    return ROLE_MAPPING[roleId].ROLE_NM;
  }
  
  // Fallback to legacy role map
  const roleMap = {
    '1': 'Super Administrator',
    '2': 'Head Banking Services',
    '3': 'Loan Processing Officer',
    '4': 'Senior Financial Accountant',
    '5': 'Internal Control Officer',
    '6': 'Internal Control Manager',
    '7': 'Head of Credit',
    '8': 'Internal Audit Manager',
    '9': 'Head Human Resources',
    '10': 'Human Resource Officer',
    '11': 'IT Manager',
    '12': 'Financial Accountant',
    '13': 'Financial Accountant Manager',
    '14': 'Chief Financial Officer',
    '15': 'Chief Executive Officer',
    '16': 'Treasurer',
    '17': 'Loan Processing Supervisor',
    '18': 'Senior Financial Accountant',
    '19': 'Branch Manager',
    '20': 'Branch Operation Supervisor',
    '21': 'Chief Operation Officer',
    '22': 'Marketing Manager',
    '23': 'Payment and Reconciliation USD',
    '24': 'EOD Operator',
    '25': 'Recovery Officer',
    '26': 'Relationship Development Officer',
    '27': 'Customer Relationship Officer',
    '28': 'Customer Service Officer',
    '29': 'Teller',
    '30': 'Head Teller',
    '31': 'Customer Relationship Supervisor',
    '32': 'Recovery Team Lead',
    '33': 'Business Analyst',
    '34': 'Credit Risk Analyst',
    '35': 'Head of Digital Banking',
    '36': 'Agency Banking Officer',
    '37': 'Channel Manager'
  };
  
  return roleMap[roleId] || 'User';
};

/**
 * Get role details by ID
 * @param {string|number} roleId - Role ID
 * @returns {Object|null} Role details
 */
export const getRoleDetails = (roleId) => {
  const id = roleId?.toString();
  if (id && ROLE_MAPPING[id]) {
    return {
      id: ROLE_MAPPING[id].id,
      name: ROLE_MAPPING[id].ROLE_NM,
      permissions: ROLE_MAPPING[id].permissions || {}
    };
  }
  return null;
};

/**
 * Get all roles list
 * @returns {Array} Array of roles with id and name
 */
export const getRolesList = () => {
  return Object.entries(ROLE_MAPPING).map(([id, role]) => ({
    id: parseInt(id),
    name: role.ROLE_NM,
    description: role.description || ''
  }));
};

/**
 * Check if a user has a specific permission
 * @param {string|number} roleId - Role ID
 * @param {string} permission - Permission to check
 * @returns {Promise<boolean>}
 */
export const hasPermission = async (roleId, permission) => {
  return await roleHasPermission(roleId, permission);
};

/**
 * Get permissions for a role
 * @param {string|number} roleId - Role ID
 * @returns {Array} Array of permissions
 */
export const getPermissionsForRole = (roleId) => {
  const role = getRoleWithPermissions(roleId);
  if (!role) return [];
  
  const permissions = [];
  Object.values(role.permissions || {}).forEach(perms => {
    if (Array.isArray(perms)) {
      permissions.push(...perms);
    }
  });
  return permissions;
};

/**
 * Get grouped permissions for a role
 * @param {string|number} roleId - Role ID
 * @returns {Object} Grouped permissions
 */
export const getGroupedPermissions = (roleId) => {
  const role = getRoleWithPermissions(roleId);
  if (!role) return {};
  return role.permissions || {};
};

/**
 * Check if role is admin
 * @param {string|number} roleId - Role ID
 * @returns {boolean}
 */
export const isAdminRole = (roleId) => {
  const id = roleId?.toString();
  return id === '1';
};

/**
 * Get role hierarchy level
 * @param {string|number} roleId - Role ID
 * @returns {number} Hierarchy level
 */
export const getRoleLevel = (roleId) => {
  const id = roleId?.toString();
  const levels = {
    '1': 100, // Super Admin
    '15': 90, // CEO
    '14': 85, // CFO
    '21': 80, // COO
    '2': 75,  // Head Banking Services
    '7': 70,  // Head of Credit
    '9': 70,  // Head Human Resources
    '11': 70, // IT Manager
    '35': 70, // Head of Digital Banking
    '13': 65, // Financial Accountant Manager
    '8': 60,  // Internal Audit Manager
    '6': 60,  // Internal Control Manager
    '19': 55, // Branch Manager
    '4': 50,  // Senior Financial Accountant
    '17': 45, // Loan Processing Supervisor
    '30': 45, // Head Teller
    '31': 45, // Customer Relationship Supervisor
    '32': 45, // Recovery Team Lead
    '3': 35,  // Loan Processing Officer
    '5': 35,  // Internal Control Officer
    '10': 35, // Human Resource Officer
    '12': 35, // Financial Accountant
    '16': 35, // Treasurer
    '20': 35, // Branch Operation Supervisor
    '22': 35, // Marketing Manager
    '23': 35, // Payment and Reconciliation USD
    '24': 35, // EOD Operator
    '25': 35, // Recovery Officer
    '26': 35, // Relationship Development Officer
    '27': 35, // Customer Relationship Officer
    '33': 35, // Business Analyst
    '34': 35, // Credit Risk Analyst
    '36': 35, // Agency Banking Officer
    '37': 35, // Channel Manager
    '28': 30, // Customer Service Officer
    '29': 20  // Teller
  };
  return levels[id] || 0;
};

/**
 * Check if role has higher or equal level than target
 * @param {string|number} roleId - Role ID
 * @param {string|number} targetRoleId - Target Role ID
 * @returns {boolean}
 */
export const hasRoleLevel = (roleId, targetRoleId) => {
  const level = getRoleLevel(roleId);
  const targetLevel = getRoleLevel(targetRoleId);
  return level >= targetLevel;
};

/**
 * Get role description
 * @param {string|number} roleId - Role ID
 * @returns {string}
 */
export const getRoleDescription = (roleId) => {
  const id = roleId?.toString();
  const descriptions = {
    '1': 'Has full system access with all permissions',
    '2': 'Oversees all banking operations and services',
    '3': 'Processes and manages loan applications',
    '4': 'Manages financial accounting and reporting',
    '5': 'Monitors internal controls and compliance',
    '6': 'Manages internal control team',
    '7': 'Oversees credit operations and approvals',
    '8': 'Manages internal audit functions',
    '9': 'Oversees HR operations',
    '10': 'Handles HR administrative tasks',
    '11': 'Manages IT infrastructure and systems',
    '12': 'Handles financial accounting tasks',
    '13': 'Manages financial accounting team',
    '14': 'Oversees financial operations',
    '15': 'Highest executive authority',
    '16': 'Manages treasury operations',
    '17': 'Supervises loan processing team',
    '19': 'Manages branch operations',
    '20': 'Supervises branch operations',
    '21': 'Oversees all operational activities',
    '22': 'Manages marketing and campaigns',
    '23': 'Handles USD payment reconciliation',
    '24': 'Performs End of Day operations',
    '25': 'Manages loan recovery',
    '26': 'Develops customer relationships',
    '27': 'Manages customer relationships',
    '28': 'Handles customer service',
    '29': 'Processes teller transactions',
    '30': 'Supervises teller operations',
    '31': 'Supervises customer relationship team',
    '32': 'Leads recovery team',
    '33': 'Analyzes business data and trends',
    '34': 'Analyzes credit risks',
    '35': 'Oversees digital banking',
    '36': 'Handles agency banking',
    '37': 'Manages banking channels'
  };
  return descriptions[id] || 'Standard user role';
};

/**
 * Get role permissions count
 * @param {string|number} roleId - Role ID
 * @returns {number}
 */
export const getRolePermissionsCount = (roleId) => {
  const permissions = getPermissionsForRole(roleId);
  return permissions.length;
};

/**
 * Format role for display
 * @param {string|number} roleId - Role ID
 * @returns {Object}
 */
export const getFormattedRole = (roleId) => {
  const id = roleId?.toString();
  return {
    id: parseInt(id),
    name: getRoleName(roleId),
    description: getRoleDescription(roleId),
    level: getRoleLevel(roleId),
    isAdmin: isAdminRole(roleId),
    permissionsCount: getRolePermissionsCount(roleId),
    details: getRoleDetails(roleId)
  };
};

// Export all functions as default
export default {
  getRoleName,
  getRoleDetails,
  getRolesList,
  hasPermission,
  getPermissionsForRole,
  getGroupedPermissions,
  isAdminRole,
  getRoleLevel,
  hasRoleLevel,
  getRoleDescription,
  getRolePermissionsCount,
  getFormattedRole
};