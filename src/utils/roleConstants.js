// utils/roleConstants.js - CORRECTED AND SYNCED WITH roleMapping.js

export const ROLES = {
  ADMINISTRATOR: 1,
  HEAD_BANKING_SERVICES: 2,
  LOAN_PROCESSING_OFFICER: 3,
  SENIOR_FINANCIAL_ACCOUNTANT: 4,
  INTERNAL_CONTROL_OFFICER: 5,
  INTERNAL_CONTROL_MANAGER: 6,
  HEAD_OF_CREDIT: 7,
  INTERNAL_AUDIT_MANAGER: 8,
  HEAD_HUMAN_RESOURCES: 9,
  HUMAN_RESOURCE_OFFICER: 10,
  IT_MANAGER: 11,
  FINANCIAL_ACCOUNTANT: 12,
  FINANCIAL_ACCOUNTANT_MANAGER: 13,
  CHIEF_FINANCIAL_OFFICER: 14,
  CHIEF_EXECUTIVE_OFFICER: 15,
  TREASURER: 16,
  LOAN_PROCESSING_SUPERVISOR: 17,
  // Note: Role 18 is Senior Financial Accountant (duplicate of 4)
  SENIOR_FINANCIAL_ACCOUNTANT_2: 18,
  BRANCH_MANAGER: 19,
  BRANCH_OPERATION_SUPERVISOR: 20,
  CHIEF_OPERATION_OFFICER: 21,
  MARKETING_MANAGER: 22,
  PAYMENT_RECONCILIATION_NGN: 23,
  EOD_OPERATOR: 24,
  RECOVERY_OFFICER: 25,
  RELATIONSHIP_DEVELOPMENT_OFFICER: 26,
  CUSTOMER_RELATIONSHIP_OFFICER: 27,
  CUSTOMER_SERVICE_OFFICER: 28,
  TELLER: 29,
  HEAD_TELLER: 30,
  CUSTOMER_RELATIONSHIP_SUPERVISOR: 31,
  RECOVERY_TEAM_LEAD: 32,
  BUSINESS_ANALYST: 33,
  CREDIT_RISK_ANALYST: 34,
  HEAD_OF_DIGITAL_BANKING: 35,
  AGENCY_BANKING_OFFICER: 36,
  CHANNEL_MANAGER: 37,
  VAULT_MANAGER: 38
};

export const ROLE_NAMES = {
  1: 'Administrator',
  2: 'Head Banking Services',
  3: 'Loan Processing Officer',
  4: 'Senior Financial Accountant',
  5: 'Internal Control Officer',
  6: 'Internal Control Manager',
  7: 'Head of Credit',
  8: 'Internal Audit Manager',
  9: 'Head Human Resources',
  10: 'Human Resource Officer',
  11: 'IT Manager',
  12: 'Financial Accountant',
  13: 'Financial Accountant Manager',
  14: 'Chief Financial Officer',
  15: 'Chief Executive Officer',
  16: 'Treasurer',
  17: 'Loan Processing Supervisor',
  18: 'Senior Financial Accountant',
  19: 'Branch Manager',
  20: 'Branch Operation Supervisor',
  21: 'Chief Operation Officer',
  22: 'Marketing Manager',
  23: 'Payment and Reconciliation NGN',
  24: 'EOD Operator',
  25: 'Recovery Officer',
  26: 'Relationship Development Officer',
  27: 'Customer Relationship Officer',
  28: 'Customer Service Officer',
  29: 'Teller',
  30: 'Head Teller',
  31: 'Customer Relationship Supervisor',
  32: 'Recovery Team Lead',
  33: 'Business Analyst',
  34: 'Credit Risk Analyst',
  35: 'Head of Digital Banking',
  36: 'Agency Banking Officer',
  37: 'Channel Manager',
  38: 'Vault Manager'
};

// Map role names to IDs for quick lookup (case-insensitive)
export const ROLE_NAME_TO_ID = {
  'administrator': 1,
  'admin': 1,
  'head banking services': 2,
  'loan processing officer': 3,
  'senior financial accountant': 4,
  'internal control officer': 5,
  'internal control manager': 6,
  'head of credit': 7,
  'internal audit manager': 8,
  'head human resources': 9,
  'human resource officer': 10,
  'it manager': 11,
  'financial accountant': 12,
  'financial accountant manager': 13,
  'chief financial officer': 14,
  'cfo': 14,
  'chief executive officer': 15,
  'ceo': 15,
  'treasurer': 16,
  'loan processing supervisor': 17,
  'branch manager': 19,
  'branch operation supervisor': 20,
  'chief operation officer': 21,
  'coo': 21,
  'marketing manager': 22,
  'payment and reconciliation ngn': 23,
  'eod operator': 24,
  'recovery officer': 25,
  'relationship development officer': 26,
  'customer relationship officer': 27,
  'customer service officer': 28,
  'teller': 29,
  'head teller': 30,
  'customer relationship supervisor': 31,
  'recovery team lead': 32,
  'business analyst': 33,
  'credit risk analyst': 34,
  'head of digital banking': 35,
  'agency banking officer': 36,
  'channel manager': 37,
  'vault manager': 38
};

// Create reverse mapping (ID to Name - case insensitive lookup)
export const ROLE_ID_TO_NAME = {
  1: 'Administrator',
  2: 'Head Banking Services',
  3: 'Loan Processing Officer',
  4: 'Senior Financial Accountant',
  5: 'Internal Control Officer',
  6: 'Internal Control Manager',
  7: 'Head of Credit',
  8: 'Internal Audit Manager',
  9: 'Head Human Resources',
  10: 'Human Resource Officer',
  11: 'IT Manager',
  12: 'Financial Accountant',
  13: 'Financial Accountant Manager',
  14: 'Chief Financial Officer',
  15: 'Chief Executive Officer',
  16: 'Treasurer',
  17: 'Loan Processing Supervisor',
  18: 'Senior Financial Accountant',
  19: 'Branch Manager',
  20: 'Branch Operation Supervisor',
  21: 'Chief Operation Officer',
  22: 'Marketing Manager',
  23: 'Payment and Reconciliation NGN',
  24: 'EOD Operator',
  25: 'Recovery Officer',
  26: 'Relationship Development Officer',
  27: 'Customer Relationship Officer',
  28: 'Customer Service Officer',
  29: 'Teller',
  30: 'Head Teller',
  31: 'Customer Relationship Supervisor',
  32: 'Recovery Team Lead',
  33: 'Business Analyst',
  34: 'Credit Risk Analyst',
  35: 'Head of Digital Banking',
  36: 'Agency Banking Officer',
  37: 'Channel Manager',
  38: 'Vault Manager'
};

// APPROVAL_ROLES - Roles that can approve requests
export const APPROVAL_ROLES = {
  CHANNEL_MANAGER: ROLES.CHANNEL_MANAGER,
  HEAD_TELLER: ROLES.HEAD_TELLER,
  HEAD_BANKING_SERVICES: ROLES.HEAD_BANKING_SERVICES,
  BRANCH_MANAGER: ROLES.BRANCH_MANAGER,
  ADMINISTRATOR: ROLES.ADMINISTRATOR,
  CHIEF_EXECUTIVE_OFFICER: ROLES.CHIEF_EXECUTIVE_OFFICER,
  CHIEF_FINANCIAL_OFFICER: ROLES.CHIEF_FINANCIAL_OFFICER,
  CHIEF_OPERATION_OFFICER: ROLES.CHIEF_OPERATION_OFFICER
};

// CARD_APPROVAL_ROLES - Specific roles for card approvals
export const CARD_APPROVAL_ROLES = [
  ROLES.CHANNEL_MANAGER,
  ROLES.HEAD_TELLER,
  ROLES.HEAD_BANKING_SERVICES,
  ROLES.BRANCH_MANAGER,
  ROLES.ADMINISTRATOR,
  ROLES.CHIEF_EXECUTIVE_OFFICER
];

// CARD_ISSUANCE_ROLES - Roles that can issue cards directly
export const CARD_ISSUANCE_ROLES = [
  ROLES.ADMINISTRATOR,
  ROLES.CHIEF_EXECUTIVE_OFFICER,
  ROLES.HEAD_BANKING_SERVICES,
  ROLES.HEAD_OF_DIGITAL_BANKING,
  ROLES.CHANNEL_MANAGER
];

// ADMIN_ROLES - Administrative roles
export const ADMIN_ROLES = [
  ROLES.ADMINISTRATOR,
  ROLES.CHIEF_EXECUTIVE_OFFICER,
  ROLES.CHIEF_FINANCIAL_OFFICER,
  ROLES.CHIEF_OPERATION_OFFICER
];

// ==================== HELPER FUNCTIONS ====================

/**
 * Get role name from role ID
 * @param {number} roleId - The role ID
 * @returns {string} The role name
 */
export const getRoleName = (roleId) => {
  return ROLE_NAMES[roleId] || ROLE_ID_TO_NAME[roleId] || 'Unknown Role';
};

/**
 * Get role ID from role name (case-insensitive)
 * @param {string} roleName - The role name
 * @returns {number|null} The role ID or null if not found
 */
export const getRoleId = (roleName) => {
  if (!roleName) return null;
  
  // Try exact match first
  const exactMatch = Object.entries(ROLE_NAMES).find(([id, name]) => name === roleName);
  if (exactMatch) return parseInt(exactMatch[0]);
  
  // Try case-insensitive match
  const lowerName = roleName.toLowerCase();
  const match = Object.entries(ROLE_NAMES).find(([id, name]) => name.toLowerCase() === lowerName);
  if (match) return parseInt(match[0]);
  
  // Try from ROLE_NAME_TO_ID mapping
  if (ROLE_NAME_TO_ID[lowerName]) {
    return ROLE_NAME_TO_ID[lowerName];
  }
  
  return null;
};

/**
 * Check if a role ID is valid
 * @param {number} roleId - The role ID to check
 * @returns {boolean} True if valid
 */
export const isValidRoleId = (roleId) => {
  return !!ROLE_NAMES[roleId] || !!ROLE_ID_TO_NAME[roleId];
};

/**
 * Check if a role name is valid
 * @param {string} roleName - The role name to check
 * @returns {boolean} True if valid
 */
export const isValidRoleName = (roleName) => {
  if (!roleName) return false;
  const lowerName = roleName.toLowerCase();
  return Object.values(ROLE_NAMES).some(name => name.toLowerCase() === lowerName) ||
         !!ROLE_NAME_TO_ID[lowerName];
};

/**
 * Get all role IDs
 * @returns {number[]} Array of all role IDs
 */
export const getAllRoleIds = () => {
  return Object.keys(ROLE_NAMES).map(id => parseInt(id));
};

/**
 * Get all role names
 * @returns {string[]} Array of all role names
 */
export const getAllRoleNames = () => {
  return Object.values(ROLE_NAMES);
};

/**
 * Check if a role is an admin role
 * @param {number} roleId - The role ID to check
 * @returns {boolean} True if admin role
 */
export const isAdminRole = (roleId) => {
  return ADMIN_ROLES.includes(roleId);
};

/**
 * Check if a role can approve card requests
 * @param {number} roleId - The role ID to check
 * @returns {boolean} True if can approve
 */
export const canApproveCard = (roleId) => {
  return CARD_APPROVAL_ROLES.includes(roleId);
};

/**
 * Check if a role can issue cards directly
 * @param {number} roleId - The role ID to check
 * @returns {boolean} True if can issue directly
 */
export const canIssueCardDirectly = (roleId) => {
  return CARD_ISSUANCE_ROLES.includes(roleId);
};

// ==================== EXPORTS ====================
export default {
  ROLES,
  ROLE_NAMES,
  ROLE_NAME_TO_ID,
  ROLE_ID_TO_NAME,
  APPROVAL_ROLES,
  CARD_APPROVAL_ROLES,
  CARD_ISSUANCE_ROLES,
  ADMIN_ROLES,
  getRoleName,
  getRoleId,
  isValidRoleId,
  isValidRoleName,
  getAllRoleIds,
  getAllRoleNames,
  isAdminRole,
  canApproveCard,
  canIssueCardDirectly
};