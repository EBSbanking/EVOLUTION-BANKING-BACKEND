// controllers/UserRoleController.js
import UserRole from '../models/UserRole.js';
import BusinessUnit from '../models/BusinessUnit.js';
import Permissions from '../models/Permissions.js';
import User from '../models/User.js';
import { ROLE_MAPPING, ROLE_PERMISSION_MAPPING } from '../constants/roleMapping.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { isBUAccessible, getAccessibleBusinessUnits } from '../utils/businessUnitUtils.js';
import { normalizeRoleId } from '../utils/roleUtils.js';
import logger from '../utils/logger.js';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

// Async handler utility
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Define ROLE_NAMES
const ROLE_NAMES = {
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
  23: 'Payment and Reconciliation USD',
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
};

// Function to automatically fix database schema
async function autoFixDatabaseSchema() {
  try {
    console.log('🔄 Checking and fixing database schema...');
    
    // Check current schema
    const [results] = await sequelize.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'user_roles' 
      AND TABLE_SCHEMA = DATABASE()
      AND COLUMN_NAME = 'user_id'
    `);
    
    if (results.length === 0) {
      console.log('❌ user_id column not found in user_roles table');
      return false;
    }
    
    const columnInfo = results[0];
    console.log('📊 Current user_id column info:', {
      DATA_TYPE: columnInfo.DATA_TYPE,
      IS_NULLABLE: columnInfo.IS_NULLABLE,
      COLUMN_DEFAULT: columnInfo.COLUMN_DEFAULT
    });
    
    // Fix 1: If column is NOT NULL and has no default value
    if (columnInfo.IS_NULLABLE === 'NO' && !columnInfo.COLUMN_DEFAULT) {
      console.log('🔧 Fixing: user_id is NOT NULL without default value');
      
      // First try to make it nullable
      try {
        await sequelize.query(`
          ALTER TABLE user_roles MODIFY user_id INT NULL
        `);
        console.log('✅ Made user_id column nullable');
      } catch (error) {
        console.warn('⚠️ Could not make user_id nullable:', error.message);
        
        // Try adding a default value instead
        try {
          await sequelize.query(`
            ALTER TABLE user_roles MODIFY user_id INT NOT NULL DEFAULT 0
          `);
          console.log('✅ Added default value 0 to user_id column');
        } catch (error2) {
          console.error('❌ Failed to add default value:', error2.message);
          return false;
        }
      }
    }
    
    // Fix 2: If column expects INTEGER but model might be sending wrong type
    if (columnInfo.DATA_TYPE === 'int' || columnInfo.DATA_TYPE === 'bigint') {
      console.log('✅ user_id column is already INTEGER type');
    } else {
      console.log(`⚠️ user_id column is ${columnInfo.DATA_TYPE}, converting to INTEGER`);
      try {
        await sequelize.query(`
          ALTER TABLE user_roles MODIFY user_id INT NULL
        `);
        console.log('✅ Converted user_id to INTEGER');
      } catch (error) {
        console.error('❌ Failed to convert user_id to INTEGER:', error.message);
      }
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error in autoFixDatabaseSchema:', error.message);
    return false;
  }
}

// Check and fix schema on startup
let schemaFixed = false;
async function initializeSchemaCheck() {
  try {
    schemaFixed = await autoFixDatabaseSchema();
    if (schemaFixed) {
      console.log('✅ Database schema checked and fixed if needed');
    } else {
      console.log('⚠️ Database schema check completed with warnings');
    }
  } catch (error) {
    console.error('❌ Failed to initialize schema check:', error.message);
  }
}

// Call on module load (but don't block)
setTimeout(() => {
  initializeSchemaCheck().catch(console.error);
}, 5000); // Wait 5 seconds after startup





// Generate Role ID
// async function generateRoleId(transaction) {
//   const lastEntry = await UserRole.findOne({
//     order: [['role_id', 'DESC']],
//     transaction
//   });

//   let nextId = 1;
//   if (lastEntry && lastEntry.role_id) {
//     const parsed = parseInt(lastEntry.role_id, 10);
//     if (!isNaN(parsed)) {
//       nextId = parsed + 1;
//     }
//   }
  
//   return nextId;
// }

async function validateAndFetchBusinessUnit(BU_ID, transaction) {
  const businessUnit = await BusinessUnit.findOne({ 
    where: { BU_ID: parseInt(BU_ID) || BU_ID } 
  }, { transaction });
  
  if (!businessUnit) {
    throw new Error("Invalid Business Unit provided.");
  }
  return businessUnit;
}

// Generate SYSUSER_ID
async function generateSysUserId(transaction) {
  const lastEntry = await UserRole.findOne({
    order: [['SYSUSER_ID', 'DESC']],
    transaction
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

// Generate Role ID
async function generateRoleId(transaction) {
  const lastEntry = await UserRole.findOne({
    order: [['role_id', 'DESC']],
    transaction
  });

  let nextId = 1;
  if (lastEntry && lastEntry.role_id) {
    const parsed = parseInt(lastEntry.role_id, 10);
    if (!isNaN(parsed)) {
      nextId = parsed + 1;
    }
  }
  
  return nextId;
}

// Validate permissions array
function validatePermissions(permissions) {
  const validPermissions = Object.values(PERMISSIONS).flatMap(category => Object.values(category));
  return permissions.every(perm => validPermissions.includes(perm));
}

// Get default permissions for a role based on access level
function getDefaultPermissionsForAccessLevel(accessLevel, roleId) {
  if (parseInt(roleId) === 1) {
    const allPermissions = {};
    Object.keys(PERMISSIONS).forEach(category => {
      const categoryKey = `${category}_ACCESS_LEVEL`;
      const categoryPermissions = PERMISSIONS[category];
      if (typeof categoryPermissions === 'object') {
        allPermissions[categoryKey] = Object.values(categoryPermissions);
      }
    });
    return allPermissions;
  }

  const defaultPermissions = {};
  const permissionMap = {
    DRAWER_ACCESS_LEVEL: [PERMISSIONS.DRAWER.VIEW],
    CUSTOMER_ACCESS_LEVEL: [PERMISSIONS.CUSTOMER.VIEW, PERMISSIONS.CUSTOMER.PROFILE],
    ACCOUNT_ACCESS_LEVEL: [PERMISSIONS.ACCOUNT.VIEW_BALANCE, PERMISSIONS.ACCOUNT.VIEW_STATEMENT],
    TRANSACTION_ACCESS_LEVEL: [PERMISSIONS.TRANSACTION.VIEW_HISTORY],
    DASHBOARD_ACCESS_LEVEL: [PERMISSIONS.DASHBOARD.VIEW],
    REPORT_ACCESS_LEVEL: [PERMISSIONS.REPORT.VIEW],
    LOAN_OPERATIONS_ACCESS_LEVEL: [PERMISSIONS.LOAN_OPERATIONS.VIEW],
    LOAN_FEE_ACCESS_LEVEL: [PERMISSIONS.LOAN_FEE.VIEW],
    FIXED_ASSET_ACCESS_LEVEL: [PERMISSIONS.FIXED_ASSET.VIEW],
    SYSTEM_ADMIN_ACCESS_LEVEL: [],
    PERMISSION_MANAGEMENT_ACCESS_LEVEL: [],
    POSTING_ACCESS_LEVEL: [PERMISSIONS.POSTING.CHART_OF_ACCOUNT],
    CREDIT_APPL_ACCESS_LEVEL: [PERMISSIONS.CREDIT_APPL.VIEW],
    APPROVAL_ACCESS_LEVEL: [],
    TREASURY_ACCESS_LEVEL: [PERMISSIONS.TREASURY.VIEW],
    OPERATIONS_ACCESS_LEVEL: [PERMISSIONS.OPERATIONS.VIEW],
    WORKFLOW_ACCESS_LEVEL: [],
    AML_ACCESS_LEVEL: [PERMISSIONS.AML.VIEW_THRESHOLD],
    BUSINESS_UNIT_ACCESS_LEVEL: [PERMISSIONS.BUSINESS_UNIT.VIEW],
    SECURITY_PROFILE_ACCESS_LEVEL: [],
    DEPOSIT_ACCESS_LEVEL: [PERMISSIONS.DEPOSIT.VIEW_DETAILS],
    GUARANTOR_ACCESS_LEVEL: [PERMISSIONS.GUARANTOR.VIEW],
    RATE_ACCESS_LEVEL: [PERMISSIONS.RATE.INDEX],
    PRODUCT_ACCESS_LEVEL: [PERMISSIONS.PRODUCT.VIEW],
    HOLIDAY_ACCESS_LEVEL: [PERMISSIONS.HOLIDAY.MANAGE],
    MARKETING_ACCESS_LEVEL: [],
    AGENCY_ACCESS_LEVEL: [],
    ANALYTICS_ACCESS_LEVEL: [PERMISSIONS.ANALYTICS.VIEW_BUSINESS_ANALYTICS],
    RISK_ACCESS_LEVEL: [PERMISSIONS.RISK.VIEW_RISK_REPORT],
    RECONCILIATION_ACCESS_LEVEL: [PERMISSIONS.RECONCILIATION.VIEW_RECONCILIATION_REPORT],
    PERFORMANCE_ACCESS_LEVEL: [PERMISSIONS.PERFORMANCE.VIEW_METRICS],
    STATISTICS_ACCESS_LEVEL: [PERMISSIONS.STATISTICS.VIEW_REAL_TIME],
    THRIFT_ACCESS_LEVEL: [PERMISSIONS.THRIFT.VIEW],
    // Added permissions from your large object
    ACCOUNT_BALANCE: PERMISSIONS.ACCOUNT?.VIEW_BALANCE || 'account.view_balance',
    DEPOSIT_101: PERMISSIONS.ACCOUNT?.DEPOSIT_101 || 'account.deposit_101',
    WITHDRAWAL_102: PERMISSIONS.ACCOUNT?.WITHDRAWAL_102 || 'account.withdrawal_102',
    ACCOUNT_UPDATE: PERMISSIONS.ACCOUNT?.UPDATE || 'account.update',
    AML_THRESHOLD: PERMISSIONS.AML?.VIEW_THRESHOLD || 'aml.view_threshold',
    AUDIT_TRAIL: PERMISSIONS.SYSTEM_ADMIN?.AUDIT_LOGS || 'system_admin.audit_logs',
    BUSINESS_ROLE: PERMISSIONS.PERMISSION_MANAGEMENT?.BUSINESS_ROLE || 'permission_management.business_role',
    CREATE_BUSINESS_UNIT: PERMISSIONS.BUSINESS_UNIT?.CREATE || 'business_unit.create',
    ADD_USER: PERMISSIONS.SECURITY_PROFILE?.ADD_USER || 'security_profile.add_user',
    WORKFLOW_SETUP: PERMISSIONS.WORKFLOW?.CONFIGURE || 'workflow.configure',
    MANAGER_APPROVAL: PERMISSIONS.APPROVAL?.MANAGER || 'approval.manager',
    LOAN_CREDIT_APPLICATION: PERMISSIONS.LOAN_OPERATIONS?.CREDIT_APPLICATION || 'loan_operations.credit_application',
    CREATE_CUSTOMER: PERMISSIONS.CUSTOMER?.CREATE || 'customer.create',
    DEPOSIT_MODULE: PERMISSIONS.DEPOSIT?.CREATE || 'deposit.create',
    CREATE_GUARANTOR: PERMISSIONS.GUARANTOR?.CREATE || 'guarantor.create',
    STANDING_ORDER_CREATE: PERMISSIONS.STANDING_ORDER?.CREATE || 'standing_order.create',
    CASH_WITHDRAWAL: PERMISSIONS.TRANSACTION?.WITHDRAWAL || 'transaction.withdrawal',
    LOAN_INTEREST_SETUP: PERMISSIONS.RATE?.LOAN_INTEREST || 'rate.loan_interest',
    LOAN_FEE_SETUP: PERMISSIONS.LOAN_FEE?.SETUP || 'loan_fee.setup',
    CUSTOMER_REPORT: PERMISSIONS.REPORT?.CUSTOMER || 'report.customer',
    PRODUCT_SETUP: PERMISSIONS.PRODUCT?.SETUP || 'product.setup',
    CHART_OF_ACCOUNT: PERMISSIONS.POSTING?.CHART_OF_ACCOUNT || 'posting.chart_of_account',
    TELLER_DASHBOARD: PERMISSIONS.DASHBOARD?.TELLER_DASHBOARD || 'dashboard.teller_dashboard',
    VIEW_TELLER_ANALYTICS: PERMISSIONS.ANALYTICS?.VIEW_TELLER_ANALYTICS || 'analytics.view_teller_analytics',
    VIEW_PERFORMANCE_METRICS: PERMISSIONS.PERFORMANCE?.VIEW_METRICS || 'performance.view_metrics',
    VIEW_REAL_TIME_STATS: PERMISSIONS.STATISTICS?.VIEW_REAL_TIME || 'statistics.view_real_time',
    CREATE_VAULT: PERMISSIONS.VAULT?.CREATE_VAULT || 'vault.create_vault',
    TELLER_TODAY_STATS: PERMISSIONS.DASHBOARD?.REAL_TIME_STATS || 'dashboard.real_time_stats',
    MANUAL_LOAN_REPAYMENT: PERMISSIONS.LOAN_REPAYMENT?.MANUAL || 'loan_repayment.manual',
    CREATE_GROUP_LOAN: PERMISSIONS.GROUP_LOAN?.CREATE || 'group_loan.create',
    PROCESS_BULK_OPERATIONS: PERMISSIONS.BULK_OPERATIONS?.PROCESS || 'bulk_operations.process',
    VIEW_AUDIT_LOGS: PERMISSIONS.AUDIT?.VIEW_LOGS || 'audit.view_logs',
    VIEW_NOTIFICATIONS: PERMISSIONS.NOTIFICATION?.VIEW || 'notification.view',
    PRINT_RECEIPT: PERMISSIONS.PRINT_EXPORT?.PRINT_RECEIPT || 'print_export.print_receipt',
    VIEW_QUEUE: PERMISSIONS.QUEUE?.VIEW_QUEUE || 'queue.view_queue',
    VIEW_HELP_DOCUMENTATION: PERMISSIONS.HELP?.VIEW_HELP || 'help.view_help',
    VIEW_MOBILE_APP: PERMISSIONS.MOBILE?.VIEW_MOBILE || 'mobile.view_mobile',
    CREATE_COLLECTION: PERMISSIONS.COLLECTION?.CREATE || 'collection.create',
    VIEW_LOAN_PORTFOLIO: PERMISSIONS.LOAN_PORTFOLIO?.VIEW || 'loan_portfolio.view',
  };

  // Apply access level logic
  Object.keys(permissionMap).forEach(category => {
    if (accessLevel === 'BU' || accessLevel === 'OWN BUSINESS UNIT') {
      defaultPermissions[category] = Array.isArray(permissionMap[category]) 
        ? permissionMap[category] 
        : [permissionMap[category]];
    } else if (accessLevel === 'ALL BUSINESS UNIT') {
      defaultPermissions[category] = Array.isArray(permissionMap[category]) 
        ? [...permissionMap[category]] 
        : [permissionMap[category]];
      
      // Add management permissions for broader access
      if (category === 'DRAWER_ACCESS_LEVEL') {
        defaultPermissions[category].push(PERMISSIONS.DRAWER.MANAGE);
      }
      if (category === 'CUSTOMER_ACCESS_LEVEL') {
        defaultPermissions[category].push(PERMISSIONS.CUSTOMER.CREATE, PERMISSIONS.CUSTOMER.UPDATE);
      }
    }
  });

  return defaultPermissions;
}

// Create User Role with Multiple Role Support - UPDATED to also create BusinessRole
export const createUserRole = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    // First, ensure database schema is fixed
    if (!schemaFixed) {
      console.log('🔄 Running schema check before creating user role...');
      schemaFixed = await autoFixDatabaseSchema();
      if (!schemaFixed) {
        console.warn('⚠️ Schema fix may have failed, proceeding anyway...');
      }
    }

    const {
      USER_ROLE_IDS,
      BU_ID,
      Business_Unit,
      CREATED_BY,
      USER_ID,
      SYSUSER_ID,
      EFF_FROM_DT,
      EFF_TO_DT = null,
      DEF_ROLE_FG = "N",
      SUPERVISOR_FG = "N",
      MULTI_CRNCY_FG = "N",
      REC_ST = "A",
      VAULT_ACCESS_LEVEL = ["BU"],
      DRAWER_ACCESS_LEVEL = ["BU"],
      TXN_ENQUIRY_ACCESS_LVL = ["BU"],
      CREDIT_APPL_ACCESS_LEVEL = ["BU"],
      CUSTOMER_ACCESS_LEVEL = ["BU"],
      ACCOUNT_ACCESS_LEVEL = ["BU"],
      WF_ITEM_ACCESS_LEVEL = ["BU"],
      REPORT_ACCESS_LEVEL = ["BU"],
      CUST_POSTING_ACCESS_LEVEL = ["BU"],
      GL_POSTING_ACCESS_LEVEL = ["BU"],
      FIXED_ASSET_ACCESS_LEVEL = ["BU"],
      LOAN_FEE_ACCESS_LEVEL = ["BU"],
      LOAN_OPERATIONS_ACCESS_LEVEL = ["BU"],
      PERMISSION_MANAGEMENT_ACCESS_LEVEL = ["BU"],
      SYSTEM_ADMIN_ACCESS_LEVEL = ["BU"],
      DASHBOARD_ACCESS_LEVEL = ["BU"],
      // BusinessRole specific fields
      ALLOW_TXN_POSTING_FG = "N",
      WF_ITEM_ACCESS_LEVEL_BUSINESS = "",
      createBusinessRole = true, // Flag to control BusinessRole creation
    } = req.body;

    console.log('🔧 CREATING USER ROLE - DEBUG:', {
      USER_ROLE_IDS,
      BU_ID,
      Business_Unit,
      USER_ID,
      SYSUSER_ID,
      createBusinessRole,
      received_ROLE_NMS: req.body.ROLE_NMS
    });

    // Validation
    if (!USER_ID) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'USER_ID is required'
      });
    }

    // FIX: Ensure USER_ROLE_IDS is an array
    let userRoleIdsArray = USER_ROLE_IDS;
    if (!Array.isArray(USER_ROLE_IDS)) {
      if (typeof USER_ROLE_IDS === 'string' || typeof USER_ROLE_IDS === 'number') {
        userRoleIdsArray = [parseInt(USER_ROLE_IDS)];
      } else {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'USER_ROLE_IDS must be an array or a single number/string'
        });
      }
    }

    if (!userRoleIdsArray || userRoleIdsArray.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'USER_ROLE_IDS is required and must be a non-empty array'
      });
    }

    if (!BU_ID || !Business_Unit || !CREATED_BY) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'BU_ID, Business_Unit, and CREATED_BY are required'
      });
    }

    if (!EFF_FROM_DT) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'EFF_FROM_DT is required'
      });
    }

    // Validate role IDs
    const invalidRoleIds = userRoleIdsArray.filter(roleId => !ROLE_MAPPING[roleId.toString()]);
    if (invalidRoleIds.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: `Invalid role IDs: ${invalidRoleIds.join(', ')}. Valid role IDs are: ${Object.keys(ROLE_MAPPING).join(', ')}`
      });
    }

    // ✅ Generate role names ONLY from USER_ROLE_IDS
    const ROLE_NMS = userRoleIdsArray.map(roleId => {
      const roleData = ROLE_MAPPING[roleId.toString()];
      return roleData?.ROLE_NM || `Role ${roleId}`;
    });

    console.log('📋 GENERATED ROLE NAMES (from USER_ROLE_IDS):', {
      USER_ROLE_IDS: userRoleIdsArray,
      generated_ROLE_NMS: ROLE_NMS
    });

    const ROLE_NM = ROLE_NMS[0] || 'Unknown Role';

    // Validate Business Unit
    let validatedBusinessUnit = Business_Unit;
    let businessUnitInfo = null;
    if (typeof validateAndFetchBusinessUnit === 'function') {
      try {
        const businessUnitDoc = await validateAndFetchBusinessUnit(BU_ID, transaction);
        validatedBusinessUnit = businessUnitDoc.BUSINESS_UNIT || Business_Unit;
        businessUnitInfo = businessUnitDoc;
      } catch (error) {
        console.warn('⚠️ Business unit validation failed, using provided value:', error.message);
      }
    }

    // FIX: Convert USER_ID to numeric user ID
    let numericUserId = USER_ID;
    let userName = USER_ID;
    let userRecord = null;
    
    // If USER_ID is not already a number, look up the user
    if (USER_ID && isNaN(parseInt(USER_ID))) {
      userRecord = await User.findOne({
        where: { 
          [Op.or]: [
            { user_name: USER_ID },
            { username: USER_ID }
          ]
        },
        attributes: ['id', 'user_name', 'first_name', 'last_name'],
        transaction
      });
      
      if (userRecord) {
        numericUserId = userRecord.id; // Use the numeric ID
        userName = userRecord.user_name || USER_ID;
        console.log('🔢 Converted username to numeric ID:', {
          username: USER_ID,
          numericId: numericUserId,
          userName: userName
        });
      } else {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `User with username '${USER_ID}' does not exist in Users table.`,
          suggestion: 'Please use a valid username or numeric user ID.'
        });
      }
    } else {
      // USER_ID is already numeric, verify it exists
      userRecord = await User.findOne({
        where: { id: parseInt(USER_ID) },
        attributes: ['id', 'user_name', 'first_name', 'last_name'],
        transaction
      });
      
      if (!userRecord) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `User with ID ${USER_ID} does not exist in Users table.`,
          suggestion: 'Please use a valid numeric user ID.'
        });
      }
      userName = userRecord.user_name || `User ${USER_ID}`;
    }

    // Check if user role already exists
    const existingUserRole = await UserRole.findOne({
      where: {
        BU_ID: BU_ID,
        user_id: numericUserId // Using numeric ID
      },
      transaction
    });

    if (existingUserRole) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: `User role already exists for BU_ID: ${BU_ID} and user ID: ${numericUserId} (username: ${userName})`,
        existingRole: {
          id: existingUserRole.id,
          USER_ROLE_IDS: existingUserRole.USER_ROLE_IDS,
          ROLE_NMS: existingUserRole.ROLE_NMS,
          BU_ID: existingUserRole.BU_ID,
          user_id: existingUserRole.user_id,
          SYSUSER_ID: existingUserRole.SYSUSER_ID
        }
      });
    }

    // Generate SYSUSER_ID
    let generatedSysUserId = SYSUSER_ID;
    if (!generatedSysUserId) {
      if (typeof generateSysUserId === 'function') {
        generatedSysUserId = await generateSysUserId(transaction);
      } else {
        generatedSysUserId = `SYS_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      }
    }

    // Generate role_id
    const role_id = await generateRoleId(transaction);

    // Process access level fields
    const processAccessLevel = (level) => {
      if (Array.isArray(level)) return level;
      if (typeof level === 'string') return [level];
      return ['BU'];
    };

    // Create proper access level arrays
    const accessLevels = {
      VAULT: processAccessLevel(VAULT_ACCESS_LEVEL),
      DRAWER: processAccessLevel(DRAWER_ACCESS_LEVEL),
      TXN_ENQUIRY: processAccessLevel(TXN_ENQUIRY_ACCESS_LVL),
      CREDIT_APPL: processAccessLevel(CREDIT_APPL_ACCESS_LEVEL),
      CUSTOMER: processAccessLevel(CUSTOMER_ACCESS_LEVEL),
      ACCOUNT: processAccessLevel(ACCOUNT_ACCESS_LEVEL),
      WF_ITEM: processAccessLevel(WF_ITEM_ACCESS_LEVEL),
      REPORT: processAccessLevel(REPORT_ACCESS_LEVEL),
      CUST_POSTING: processAccessLevel(CUST_POSTING_ACCESS_LEVEL),
      GL_POSTING: processAccessLevel(GL_POSTING_ACCESS_LEVEL),
      FIXED_ASSET: processAccessLevel(FIXED_ASSET_ACCESS_LEVEL),
      LOAN_FEE: processAccessLevel(LOAN_FEE_ACCESS_LEVEL),
      LOAN_OPERATIONS: processAccessLevel(LOAN_OPERATIONS_ACCESS_LEVEL),
      PERMISSION_MANAGEMENT: processAccessLevel(PERMISSION_MANAGEMENT_ACCESS_LEVEL),
      SYSTEM_ADMIN: processAccessLevel(SYSTEM_ADMIN_ACCESS_LEVEL),
      DASHBOARD: processAccessLevel(DASHBOARD_ACCESS_LEVEL),
    };

    // ✅ Create user role data with explicit user_id
    const userRoleData = {
      role_id,
      USER_ROLE_IDS: JSON.stringify(userRoleIdsArray),
      ROLE_NMS: JSON.stringify(ROLE_NMS),
      ROLE_NM,
      BU_ID,
      Business_Unit: validatedBusinessUnit,
      CREATED_BY,
      SYSUSER_ID: generatedSysUserId,
      user_id: numericUserId, // Explicitly include user_id
      EFF_FROM_DT: new Date(EFF_FROM_DT),
      EFF_TO_DT: EFF_TO_DT ? new Date(EFF_TO_DT) : null,
      DEF_ROLE_FG,
      SUPERVISOR_FG,
      MULTI_CRNCY_FG,
      WF_ITEM_ACCESS_LEVEL: JSON.stringify(accessLevels.WF_ITEM),
      REC_ST,
      VERSION_NO: 1,
      ROW_TS: new Date(),
      CREATE_DT: new Date(),
      VAULT_ACCESS_LEVEL: JSON.stringify(accessLevels.VAULT),
      DRAWER_ACCESS_LEVEL: JSON.stringify(accessLevels.DRAWER),
      TXN_ENQUIRY_ACCESS_LVL: JSON.stringify(accessLevels.TXN_ENQUIRY),
      CREDIT_APPL_ACCESS_LEVEL: JSON.stringify(accessLevels.CREDIT_APPL),
      CUSTOMER_ACCESS_LEVEL: JSON.stringify(accessLevels.CUSTOMER),
      ACCOUNT_ACCESS_LEVEL: JSON.stringify(accessLevels.ACCOUNT),
      REPORT_ACCESS_LEVEL: JSON.stringify(accessLevels.REPORT),
      CUST_POSTING_ACCESS_LEVEL: JSON.stringify(accessLevels.CUST_POSTING),
      GL_POSTING_ACCESS_LEVEL: JSON.stringify(accessLevels.GL_POSTING),
      FIXED_ASSET_ACCESS_LEVEL: JSON.stringify(accessLevels.FIXED_ASSET),
      LOAN_FEE_ACCESS_LEVEL: JSON.stringify(accessLevels.LOAN_FEE),
      LOAN_OPERATIONS_ACCESS_LEVEL: JSON.stringify(accessLevels.LOAN_OPERATIONS),
      PERMISSION_MANAGEMENT_ACCESS_LEVEL: JSON.stringify(accessLevels.PERMISSION_MANAGEMENT),
      SYSTEM_ADMIN_ACCESS_LEVEL: JSON.stringify(accessLevels.SYSTEM_ADMIN),
      DASHBOARD_ACCESS_LEVEL: JSON.stringify(accessLevels.DASHBOARD),
    };

    // Debug: Check what data we're sending
    console.log('📦 FINAL USER ROLE DATA (debug):', {
      role_id,
      user_id: userRoleData.user_id,
      user_id_type: typeof userRoleData.user_id,
      original_USER_ID: USER_ID,
      converted_numericId: numericUserId,
      SYSUSER_ID: userRoleData.SYSUSER_ID,
      USER_ROLE_IDS: userRoleData.USER_ROLE_IDS,
      ROLE_NMS: userRoleData.ROLE_NMS,
      all_fields: Object.keys(userRoleData)
    });

    // Try to create with retry logic
    let newUserRole;
    try {
      newUserRole = await UserRole.create(userRoleData, { transaction });
    } catch (createError) {
      // If create fails due to schema issue, try one more fix and retry
      if (createError.message.includes("Field 'user_id' doesn't have a default value") ||
          createError.message.includes("Incorrect integer value")) {
        
        console.log('🔄 Create failed due to schema issue, attempting emergency fix...');
        
        // Emergency schema fix
        try {
          await sequelize.query(`
            ALTER TABLE user_roles 
            MODIFY user_id INT NULL
          `, { transaction });
          console.log('✅ Emergency schema fix applied');
          
          // Retry the create
          newUserRole = await UserRole.create(userRoleData, { transaction });
        } catch (fixError) {
          console.error('❌ Emergency schema fix failed:', fixError.message);
          throw createError; // Re-throw the original error
        }
      } else {
        throw createError; // Re-throw other errors
      }
    }

    // ✅ CREATE BUSINESSROLE ENTRIES FOR EACH ROLE
    const createdBusinessRoles = [];
    if (createBusinessRole !== false) { // Default to true if not explicitly false
      try {
        // Import BusinessRole model
        const BusinessRole = (await import('../models/BusinessRole.js')).default;
        
        // For each role in USER_ROLE_IDS, create a BusinessRole entry
        for (const roleId of userRoleIdsArray) {
          const roleData = ROLE_MAPPING[roleId.toString()];
          if (!roleData) {
            console.warn(`⚠️ Skipping BusinessRole creation for invalid role ID: ${roleId}`);
            continue;
          }

          const businessRoleData = {
            ROLE_NM: roleData.ROLE_NM,
            ROLE_ID: roleId,
            USER_ID: USER_ID, // Original username
            BUSINESS_UNIT: validatedBusinessUnit,
            BU_ID: parseInt(BU_ID) || BU_ID,
            CREATED_BY: CREATED_BY,
            CREATED_BY_ROLE: CREATED_BY,
            SUPERVISOR_FG: SUPERVISOR_FG,
            ALLOW_TXN_POSTING_FG: ALLOW_TXN_POSTING_FG,
            REC_ST: REC_ST === 'A' ? 'Active' : 'Deactivated',
            WF_ITEM_ACCESS_LEVEL: WF_ITEM_ACCESS_LEVEL_BUSINESS || WF_ITEM_ACCESS_LEVEL[0] || '',
            // Set transaction posting based on role type
            ...(roleData.defaultTransactionPosting && { ALLOW_TXN_POSTING_FG: 'Y' })
          };

          // Check if BusinessRole already exists
          const existingBusinessRole = await BusinessRole.findOne({
            where: {
              USER_ID: USER_ID.toUpperCase(),
              ROLE_ID: roleId,
              BUSINESS_UNIT: validatedBusinessUnit,
              BU_ID: parseInt(BU_ID) || BU_ID
            },
            transaction
          });

          if (!existingBusinessRole) {
            const businessRole = await BusinessRole.create(businessRoleData, { transaction });
            createdBusinessRoles.push({
              id: businessRole.id,
              ROLE_NM: businessRole.ROLE_NM,
              ROLE_ID: businessRole.ROLE_ID,
              BUSINESS_UNIT: businessRole.BUSINESS_UNIT,
              BU_ID: businessRole.BU_ID,
              REC_ST: businessRole.REC_ST
            });
            console.log(`✅ Created BusinessRole: ${businessRole.ROLE_NM} for user ${USER_ID}`);
          } else {
            console.log(`⚠️ BusinessRole already exists: ${roleData.ROLE_NM} for user ${USER_ID}`);
            createdBusinessRoles.push({
              id: existingBusinessRole.id,
              ROLE_NM: existingBusinessRole.ROLE_NM,
              ROLE_ID: existingBusinessRole.ROLE_ID,
              BUSINESS_UNIT: existingBusinessRole.BUSINESS_UNIT,
              BU_ID: existingBusinessRole.BU_ID,
              REC_ST: existingBusinessRole.REC_ST,
              existing: true
            });
          }
        }
      } catch (businessRoleError) {
        console.error('❌ Error creating BusinessRole entries:', businessRoleError.message);
        // Don't rollback the entire transaction, just log the error
        // UserRole creation was successful, so we continue
      }
    }

    await transaction.commit();

    console.log('💾 SAVED USER ROLE:', {
      role_id: newUserRole.role_id,
      saved_USER_ROLE_IDS: newUserRole.USER_ROLE_IDS,
      saved_ROLE_NMS: newUserRole.ROLE_NMS,
      user_id: newUserRole.user_id,
      user_id_type: typeof newUserRole.user_id,
      SYSUSER_ID: newUserRole.SYSUSER_ID,
      businessRolesCreated: createdBusinessRoles.length
    });

    logger.info(`User roles created successfully for USER_ID: ${USER_ID} (numeric ID: ${numericUserId})`, {
      role_id: newUserRole.role_id,
      roles: ROLE_NMS,
      rolesCount: userRoleIdsArray.length,
      BU_ID,
      SYSUSER_ID: generatedSysUserId,
      userName: userName,
      businessRolesCreated: createdBusinessRoles.length
    });

    // Parse response data
    const parsedRoleIds = JSON.parse(newUserRole.USER_ROLE_IDS || '[]');
    const parsedRoleNames = JSON.parse(newUserRole.ROLE_NMS || '[]');

    return res.status(201).json({
      success: true,
      message: "User roles created successfully." + (createdBusinessRoles.length > 0 ? ` Also created ${createdBusinessRoles.length} BusinessRole entries.` : ''),
      data: {
        // UserRole data
        userRole: {
          role_id: newUserRole.role_id,
          id: newUserRole.id,
          ROLE_NMS: parsedRoleNames,
          USER_ROLE_IDS: parsedRoleIds,
          SYSUSER_ID: newUserRole.SYSUSER_ID,
          BU_ID: newUserRole.BU_ID,
          USER_ID: USER_ID, // Original username
          user_id: newUserRole.user_id, // Database field (numeric)
          rolesCount: userRoleIdsArray.length,
          accessLevels: {
            VAULT: JSON.parse(newUserRole.VAULT_ACCESS_LEVEL || '["BU"]'),
            DRAWER: JSON.parse(newUserRole.DRAWER_ACCESS_LEVEL || '["BU"]'),
            DASHBOARD: JSON.parse(newUserRole.DASHBOARD_ACCESS_LEVEL || '["BU"]'),
          }
        },
        // BusinessRole data (if created)
        businessRoles: createdBusinessRoles.length > 0 ? createdBusinessRoles : undefined,
        // User info
        userInfo: userRecord ? {
          id: userRecord.id,
          user_name: userRecord.user_name,
          name: `${userRecord.first_name || ''} ${userRecord.last_name || ''}`.trim()
        } : undefined,
        // Business unit info
        businessUnitInfo: businessUnitInfo ? {
          BU_ID: businessUnitInfo.BU_ID,
          BUSINESS_UNIT: businessUnitInfo.BUSINESS_UNIT,
          branch: businessUnitInfo.branch
        } : undefined
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("❌ Error creating user roles:", {
      message: error.message,
      stack: error.stack,
      sql: error.sql,
      parameters: error.parameters
    });
    
    // Enhanced error handling with schema fix suggestions
    if (error.message.includes("Field 'user_id' doesn't have a default value") ||
        error.message.includes("Incorrect integer value")) {
      
      // Try to auto-fix the schema
      try {
        console.log('🔄 Attempting automatic schema fix after error...');
        await autoFixDatabaseSchema();
        
        return res.status(500).json({
          success: false,
          message: "Database schema issue detected and attempted to fix.",
          suggestion: "Please try the request again. The system has attempted to fix the database schema automatically.",
          error: process.env.NODE_ENV === 'development' ? error.message : 'Schema auto-fix attempted'
        });
      } catch (fixError) {
        return res.status(500).json({
          success: false,
          message: "Database schema issue detected but auto-fix failed.",
          suggestion: "Please run this SQL command manually: ALTER TABLE user_roles MODIFY user_id INT NULL",
          error: process.env.NODE_ENV === 'development' ? `Original: ${error.message}, Fix: ${fixError.message}` : 'Schema issue requires manual fix'
        });
      }
    }
    
    if (error.message.includes('Unknown column') || error.message.includes('ER_BAD_FIELD_ERROR')) {
      return res.status(500).json({
        success: false,
        message: "Database schema mismatch.",
        error: process.env.NODE_ENV === 'development' ? error.message : 'Database schema error'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: "Failed to create user roles.",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});
// Add other functions (addRolesToUser, removeRolesFromUser) remain the same...

// Export a manual schema fix endpoint
export const fixDatabaseSchema = asyncHandler(async (req, res) => {
  try {
    console.log('🔧 Manual database schema fix requested...');
    const fixed = await autoFixDatabaseSchema();
    
    if (fixed) {
      schemaFixed = true;
      return res.status(200).json({
        success: true,
        message: "Database schema fixed successfully.",
        details: "user_id column has been modified to allow NULL values."
      });
    } else {
      return res.status(500).json({
        success: false,
        message: "Failed to fix database schema.",
        suggestion: "Please run this SQL command manually: ALTER TABLE user_roles MODIFY user_id INT NULL"
      });
    }
  } catch (error) {
    console.error('❌ Manual schema fix failed:', error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fix database schema.",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      manual_fix: "ALTER TABLE user_roles MODIFY user_id INT NULL"
    });
  }
});

// Export schema check endpoint
export const checkSchema = asyncHandler(async (req, res) => {
  try {
    const [results] = await sequelize.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'user_roles' 
      AND TABLE_SCHEMA = DATABASE()
      AND COLUMN_NAME = 'user_id'
    `);
    
    if (results.length === 0) {
      return res.status(404).json({
        success: false,
        message: "user_id column not found in user_roles table"
      });
    }
    
    const columnInfo = results[0];
    const needsFix = columnInfo.IS_NULLABLE === 'NO' && !columnInfo.COLUMN_DEFAULT;
    
    return res.status(200).json({
      success: true,
      data: {
        column_name: columnInfo.COLUMN_NAME,
        data_type: columnInfo.DATA_TYPE,
        is_nullable: columnInfo.IS_NULLABLE,
        column_default: columnInfo.COLUMN_DEFAULT,
        needs_fix: needsFix,
        status: needsFix ? 'NEEDS_FIX' : 'OK'
      },
      fix_suggestions: needsFix ? [
        "ALTER TABLE user_roles MODIFY user_id INT NULL",
        "ALTER TABLE user_roles MODIFY user_id INT NOT NULL DEFAULT 0"
      ] : []
    });
  } catch (error) {
    console.error('❌ Schema check failed:', error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to check database schema",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Add Roles to Existing User Role
// Add Roles to Existing User Role
export const addRolesToUser = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();
 
  try {
    const { userId } = req.params;
    const { USER_ROLE_IDS, ROLE_NMS, BU_ID, CREATED_BY } = req.body;
    
    if (!USER_ROLE_IDS || !Array.isArray(USER_ROLE_IDS) || USER_ROLE_IDS.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "USER_ROLE_IDS (array) is required",
      });
    }

    // Optional validation of ROLE_NMS
    let validatedRoleNames = null;
    if (ROLE_NMS && Array.isArray(ROLE_NMS)) {
      if (ROLE_NMS.length !== USER_ROLE_IDS.length) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "ROLE_NMS array length must match USER_ROLE_IDS",
        });
      }
      
      const validationErrors = USER_ROLE_IDS.map((id, index) => {
        const expectedName = ROLE_MAPPING[Number(id)]?.ROLE_NM;
        const providedName = ROLE_NMS[index];
        if (expectedName && providedName !== expectedName) {
          return `Role ID ${id}: Provided name "${providedName}" does not match expected "${expectedName}"`;
        }
        return null;
      }).filter(error => error !== null);
      
      if (validationErrors.length > 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "ROLE_NMS validation failed: " + validationErrors.join('; '),
        });
      }
      validatedRoleNames = ROLE_NMS;
    }

    // **FIX: Check if userId is a username and convert to numeric ID**
    let numericUserId = userId;
    let userRecord = null;
    
    // If userId is not numeric, look up the user
    if (userId && isNaN(parseInt(userId))) {
      userRecord = await User.findOne({
        where: { 
          [Op.or]: [
            { user_name: userId },
            { username: userId }
          ]
        },
        attributes: ['id', 'user_name'],
        transaction
      });
      
      if (userRecord) {
        numericUserId = userRecord.id;
        console.log('🔢 Converted username to numeric ID:', {
          username: userId,
          numericId: numericUserId
        });
      } else {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `User with username '${userId}' does not exist in Users table.`,
          suggestion: 'Please use a valid username or numeric user ID.'
        });
      }
    } else {
      // userId is numeric, verify it exists
      userRecord = await User.findOne({
        where: { id: parseInt(userId) },
        attributes: ['id', 'user_name'],
        transaction
      });
      
      if (!userRecord) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `User with ID ${userId} does not exist in Users table.`,
          suggestion: 'Please use a valid numeric user ID.'
        });
      }
    }

    // **FIX: Look for user role using user_id (lowercase) and numeric ID**
    const existingUserRole = await UserRole.findOne({
      where: {
        user_id: numericUserId, // Use lowercase user_id with numeric ID
        BU_ID: BU_ID
      },
      transaction
    });
    
    if (!existingUserRole) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User role not found for this user and business unit",
        details: {
          user_id: numericUserId,
          user_name: userRecord?.user_name,
          BU_ID: BU_ID
        }
      });
    }

    const currentRoleIds = JSON.parse(existingUserRole.USER_ROLE_IDS || '[]');
    const currentRoleNames = JSON.parse(existingUserRole.ROLE_NMS || '[]');
    
    const newNormalizedRoleIds = [];
    const newRoleNames = [];
   
    for (const USER_ROLE_ID of USER_ROLE_IDS) {
      const normalizedRoleId = normalizeRoleId(USER_ROLE_ID);
      if (!normalizedRoleId) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Invalid USER_ROLE_ID provided: ${USER_ROLE_ID}`,
        });
      }

      const roleData = ROLE_MAPPING[normalizedRoleId];
      if (!roleData) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Role ID ${USER_ROLE_ID} not found in ROLE_MAPPING.`,
        });
      }

      if (currentRoleIds.includes(normalizedRoleId)) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `User already has role: ${roleData.ROLE_NM}`,
        });
      }

      newNormalizedRoleIds.push(normalizedRoleId);
      const roleName = validatedRoleNames ? validatedRoleNames[USER_ROLE_IDS.indexOf(USER_ROLE_ID)] : roleData.ROLE_NM;
      newRoleNames.push(roleName);
    }

    // Update user role
    const updatedRoleIds = [...currentRoleIds, ...newNormalizedRoleIds];
    const updatedRoleNames = [...currentRoleNames, ...newRoleNames];
    
    await existingUserRole.update({
      USER_ROLE_IDS: JSON.stringify(updatedRoleIds),
      ROLE_NMS: JSON.stringify(updatedRoleNames),
      CREATED_BY: CREATED_BY || existingUserRole.CREATED_BY
    }, { transaction });

    // **FIX: Also update BusinessRole entries if they exist**
    try {
      const BusinessRole = (await import('../models/BusinessRole.js')).default;
      
      for (const roleId of newNormalizedRoleIds) {
        const roleData = ROLE_MAPPING[roleId.toString()];
        if (roleData) {
          // Check if BusinessRole already exists for this user and role
          const existingBusinessRole = await BusinessRole.findOne({
            where: {
              USER_ID: userRecord.user_name || userId,
              ROLE_ID: roleId,
              BU_ID: BU_ID
            },
            transaction
          });

          if (!existingBusinessRole) {
            // Create new BusinessRole entry
            await BusinessRole.create({
              ROLE_NM: roleData.ROLE_NM,
              ROLE_ID: roleId,
              USER_ID: userRecord.user_name || userId,
              BUSINESS_UNIT: existingUserRole.Business_Unit || 'Unknown',
              BU_ID: BU_ID,
              CREATED_BY: CREATED_BY || existingUserRole.CREATED_BY,
              CREATED_BY_ROLE: CREATED_BY || existingUserRole.CREATED_BY,
              SUPERVISOR_FG: existingUserRole.SUPERVISOR_FG || 'N',
              ALLOW_TXN_POSTING_FG: 'N',
              REC_ST: existingUserRole.REC_ST === 'A' ? 'Active' : 'Deactivated',
              WF_ITEM_ACCESS_LEVEL: ''
            }, { transaction });
            
            console.log(`✅ Created BusinessRole: ${roleData.ROLE_NM} for user ${userRecord.user_name || userId}`);
          }
        }
      }
    } catch (businessRoleError) {
      console.error('⚠️ Error creating BusinessRole entries:', businessRoleError.message);
      // Don't fail the entire operation if BusinessRole creation fails
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Roles added successfully to user.",
      data: {
        role_id: existingUserRole.role_id,
        user_id: numericUserId,
        user_name: userRecord.user_name,
        BU_ID: BU_ID,
        addedRoles: newRoleNames,
        addedRoleIds: newNormalizedRoleIds,
        totalRoles: updatedRoleIds.length,
        currentRoles: updatedRoleNames,
        currentRoleIds: updatedRoleIds
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error adding roles to user:", error);
    
    // Enhanced error logging
    console.error("Error details:", {
      message: error.message,
      sql: error.sql,
      parameters: error.parameters,
      stack: error.stack
    });
    
    // Provide helpful error messages
    if (error.message.includes('Unknown column') || error.message.includes('ER_BAD_FIELD_ERROR')) {
      return res.status(500).json({
        success: false,
        message: "Database schema mismatch detected.",
        error: `Column not found: ${error.message}`,
        suggestion: "Check if the user_roles table has the 'user_id' column (lowercase)."
      });
    }
    
    if (error.message.includes('Incorrect integer value')) {
      return res.status(500).json({
        success: false,
        message: "Data type mismatch.",
        error: "The user_id field expects a numeric value.",
        suggestion: "Ensure the userId parameter is a valid numeric user ID or username that can be converted to numeric ID."
      });
    }
    
    return res.status(500).json({
      success: false,
      message: "Failed to add roles to user.",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Remove Roles from User
export const removeRolesFromUser = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();

  try {
    const { userId } = req.params;
    const { USER_ROLE_IDS, ROLE_NMS, BU_ID } = req.body;
    
    if (!USER_ROLE_IDS || !Array.isArray(USER_ROLE_IDS) || USER_ROLE_IDS.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "USER_ROLE_IDS (array) is required",
      });
    }

    // Optional validation of ROLE_NMS
    if (ROLE_NMS && Array.isArray(ROLE_NMS)) {
      if (ROLE_NMS.length !== USER_ROLE_IDS.length) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "ROLE_NMS array length must match USER_ROLE_IDS",
        });
      }
      
      const validationErrors = USER_ROLE_IDS.map((id, index) => {
        const expectedName = ROLE_MAPPING[Number(id)]?.ROLE_NM;
        const providedName = ROLE_NMS[index];
        if (expectedName && providedName !== expectedName) {
          return `Role ID ${id}: Provided name "${providedName}" does not match expected "${expectedName}"`;
        }
        return null;
      }).filter(error => error !== null);
      
      if (validationErrors.length > 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: "ROLE_NMS validation failed: " + validationErrors.join('; '),
        });
      }
    }

    // **FIX: Convert username to numeric ID if needed**
    let numericUserId = userId;
    let userRecord = null;
    
    // If userId is not numeric, look up the user
    if (userId && isNaN(parseInt(userId))) {
      userRecord = await User.findOne({
        where: { 
          [Op.or]: [
            { user_name: userId },
            { username: userId }
          ]
        },
        attributes: ['id', 'user_name'],
        transaction
      });
      
      if (userRecord) {
        numericUserId = userRecord.id;
        console.log('🔢 Converted username to numeric ID:', {
          username: userId,
          numericId: numericUserId
        });
      } else {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `User with username '${userId}' does not exist in Users table.`,
          suggestion: 'Please use a valid username or numeric user ID.'
        });
      }
    } else {
      // userId is numeric, verify it exists
      userRecord = await User.findOne({
        where: { id: parseInt(userId) },
        attributes: ['id', 'user_name'],
        transaction
      });
      
      if (!userRecord) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `User with ID ${userId} does not exist in Users table.`,
          suggestion: 'Please use a valid numeric user ID.'
        });
      }
    }

    // **FIX: Use lowercase user_id in the query**
    const existingUserRole = await UserRole.findOne({
      where: {
        user_id: numericUserId, // Use lowercase user_id
        BU_ID: BU_ID
      },
      transaction
    });
   
    if (!existingUserRole) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: "User role not found for this user and business unit",
        details: {
          user_id: numericUserId,
          user_name: userRecord?.user_name,
          BU_ID: BU_ID
        }
      });
    }

    // ============================================
    // **FIXED SECTION: Safe JSON parsing with error handling**
    // ============================================
    
    // Helper function to safely parse JSON or handle other formats
    const safeParseJSON = (data, defaultValue = []) => {
      if (data === null || data === undefined || data === '') {
        return defaultValue;
      }
      
      // If it's already an array, return it
      if (Array.isArray(data)) {
        return data;
      }
      
      // If it's a string, try to parse it
      if (typeof data === 'string') {
        // First, try to parse as JSON
        try {
          const parsed = JSON.parse(data);
          return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
        } catch (jsonError) {
          console.log(`JSON parse failed for value: "${data}". Trying alternative formats...`);
          
          // Try to handle comma-separated strings
          if (data.includes(',')) {
            const items = data.split(',')
              .map(item => item.trim())
              .filter(item => item !== '');
            
            // Try to convert to numbers if possible
            return items.map(item => {
              const num = Number(item);
              return isNaN(num) ? item : num;
            });
          }
          
          // If it's a single value, wrap it in an array
          const trimmed = data.trim();
          if (trimmed !== '') {
            const num = Number(trimmed);
            return [isNaN(num) ? trimmed : num];
          }
          
          return defaultValue;
        }
      }
      
      // If it's a number or other type, wrap in array
      return [data];
    };

    // Debug logging
    console.log('Database USER_ROLE_IDS raw value:', existingUserRole.USER_ROLE_IDS);
    console.log('Type of USER_ROLE_IDS:', typeof existingUserRole.USER_ROLE_IDS);
    
    // Parse current data safely
    let currentUserRoleIds = safeParseJSON(existingUserRole.USER_ROLE_IDS);
    let currentRoleNms = safeParseJSON(existingUserRole.ROLE_NMS);
    
    // Double-check they are arrays
    if (!Array.isArray(currentUserRoleIds)) {
      console.warn('USER_ROLE_IDS is not an array after parsing, converting:', currentUserRoleIds);
      currentUserRoleIds = currentUserRoleIds ? [currentUserRoleIds] : [];
    }
    
    if (!Array.isArray(currentRoleNms)) {
      console.warn('ROLE_NMS is not an array after parsing, converting:', currentRoleNms);
      currentRoleNms = currentRoleNms ? [currentRoleNms] : [];
    }
    
    // Debug: Log parsed values
    console.log('Parsed currentUserRoleIds:', currentUserRoleIds, 'Length:', currentUserRoleIds.length);
    console.log('Parsed currentRoleNms:', currentRoleNms, 'Length:', currentRoleNms.length);
    
    // Normalize roles to remove
    const rolesToRemove = USER_ROLE_IDS.map(roleId => Number(normalizeRoleId(roleId))).filter(id => !isNaN(id));
    
    if (rolesToRemove.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "No valid role IDs provided to remove",
      });
    }

    // ============================================
    // **FIXED: Ensure we have valid arrays before filtering**
    // ============================================
    
    // Additional safety check before filter
    if (!Array.isArray(currentUserRoleIds)) {
      console.error('CRITICAL: currentUserRoleIds is not an array! Value:', currentUserRoleIds);
      await transaction.rollback();
      return res.status(500).json({
        success: false,
        message: "Internal server error: Invalid data format",
        error: "USER_ROLE_IDS data is corrupted",
        suggestion: "Check the database for invalid USER_ROLE_IDS values"
      });
    }

    // Filter out roles to remove
    const remainingRoles = currentUserRoleIds.filter(
      roleId => !rolesToRemove.includes(Number(roleId))
    );

    if (remainingRoles.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "Cannot remove all roles from user. User must have at least one role.",
      });
    }

    // Filter role names - with additional safety
    const remainingRoleNames = currentUserRoleIds
      .map((roleId, index) => {
        try {
          const numRoleId = Number(roleId);
          if (!rolesToRemove.includes(numRoleId)) {
            return currentRoleNms[index] || null;
          }
          return null;
        } catch (error) {
          console.error(`Error processing role at index ${index}:`, error);
          return null;
        }
      })
      .filter(name => name !== null && name !== undefined);

    // Get removed role names
    const removedRoleNames = ROLE_NMS && Array.isArray(ROLE_NMS) 
      ? rolesToRemove.map((roleId, index) => ROLE_NMS[USER_ROLE_IDS.indexOf(roleId)])
      : rolesToRemove.map(roleId => ROLE_MAPPING[roleId]?.ROLE_NM || 'Unknown Role');

    // ============================================
    // **FIX: Handle ROLE_NM field properly**
    // ============================================
    
    // Check database column length for ROLE_NM
    // Common column lengths: VARCHAR(50), VARCHAR(100), VARCHAR(255)
    // Get the first remaining role name (truncate if necessary)
    let newRoleNm = null;
    if (remainingRoleNames.length > 0) {
      // Get the first role name
      const firstRoleName = remainingRoleNames[0];
      
      // If ROLE_NM column is limited (e.g., VARCHAR(50)), truncate it
      // Check your database schema for the actual length
      const MAX_ROLE_NM_LENGTH = 50; // Adjust based on your schema
      
      if (firstRoleName && firstRoleName.length > MAX_ROLE_NM_LENGTH) {
        console.warn(`Role name "${firstRoleName}" exceeds ${MAX_ROLE_NM_LENGTH} characters, truncating...`);
        newRoleNm = firstRoleName.substring(0, MAX_ROLE_NM_LENGTH);
      } else {
        newRoleNm = firstRoleName;
      }
    }
    
    // Alternative: If ROLE_NM should store all remaining roles concatenated
    // const newRoleNm = remainingRoleNames.length > 0 
    //   ? remainingRoleNames.join(', ').substring(0, 50) // Truncate to 50 chars
    //   : null;

    // Update user role
    await existingUserRole.update({
      USER_ROLE_IDS: JSON.stringify(remainingRoles),
      ROLE_NMS: JSON.stringify(remainingRoleNames),
      ROLE_NM: newRoleNm, // This might be causing the "data too long" error
      ROW_TS: new Date()
    }, { transaction });

    // **FIX: Also remove BusinessRole entries if they exist**
    try {
      const BusinessRole = (await import('../models/BusinessRole.js')).default;
      
      for (const roleId of rolesToRemove) {
        const roleData = ROLE_MAPPING[roleId.toString()];
        if (roleData) {
          // Delete BusinessRole entry for this user and role
          await BusinessRole.destroy({
            where: {
              USER_ID: userRecord.user_name || userId,
              ROLE_ID: roleId,
              BU_ID: BU_ID
            },
            transaction
          });
          
          console.log(`🗑️ Removed BusinessRole: ${roleData.ROLE_NM} for user ${userRecord.user_name || userId}`);
        }
      }
    } catch (businessRoleError) {
      console.error('⚠️ Error removing BusinessRole entries:', businessRoleError.message);
      // Don't fail the entire operation if BusinessRole deletion fails
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "Roles removed successfully from user.",
      data: {
        role_id: existingUserRole.role_id,
        user_id: numericUserId,
        user_name: userRecord.user_name,
        BU_ID: BU_ID,
        removedRoles: removedRoleNames,
        removedRoleIds: rolesToRemove,
        remainingRoles: remainingRoleNames,
        remainingRoleIds: remainingRoles,
        newPrimaryRole: newRoleNm
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error removing roles from user:", error);
    
    // Enhanced error logging
    console.error("Error details:", {
      message: error.message,
      sql: error.sql,
      parameters: error.parameters,
      stack: error.stack
    });
    
    // Provide helpful error messages
    if (error.message.includes('Unknown column') || error.message.includes('ER_BAD_FIELD_ERROR')) {
      return res.status(500).json({
        success: false,
        message: "Database schema mismatch detected.",
        error: `Column not found: ${error.message}`,
        suggestion: "Check if the user_roles table has the 'user_id' column (lowercase)."
      });
    }
    
    if (error.message.includes('Incorrect integer value')) {
      return res.status(500).json({
        success: false,
        message: "Data type mismatch.",
        error: "The user_id field expects a numeric value.",
        suggestion: "Ensure the userId parameter is a valid numeric user ID or username that can be converted to numeric ID."
      });
    }
    
    // Handle the specific "data too long" error
    if (error.message.includes('Data too long for column') && error.message.includes('ROLE_NM')) {
      return res.status(500).json({
        success: false,
        message: "Database column length exceeded",
        error: "The ROLE_NM value is too long for the database column",
        suggestion: "Check the database schema for ROLE_NM column length and adjust accordingly"
      });
    }
    
    // Handle JSON parse errors specifically
    if (error.message.includes('JSON.parse') || error.message.includes('Unexpected token')) {
      return res.status(500).json({
        success: false,
        message: "Data format error",
        error: "Invalid JSON data in database",
        suggestion: "Check USER_ROLE_IDS and ROLE_NMS fields for valid JSON arrays"
      });
    }
    
    // Handle the specific filter error
    if (error.message.includes('currentUserRoleIds.filter') || error.message.includes('filter is not a function')) {
      return res.status(500).json({
        success: false,
        message: "Data processing error",
        error: "Invalid role data format",
        suggestion: "The USER_ROLE_IDS field contains invalid data. Contact administrator."
      });
    }
    
    return res.status(500).json({
      success: false,
      message: "Failed to remove roles from user.",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get User Roles with Combined Permissions - UPDATED
// Get User Roles with Combined Permissions - UPDATED
export const getUserRoleByUserId = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  try {
    // Look for user by user_id (numeric) or by username (if userId is a string)
    let userRole;
    
    if (userId && !isNaN(parseInt(userId))) {
      // userId is numeric, search by user_id
      userRole = await UserRole.findOne({ 
        where: { user_id: parseInt(userId) } 
      });
    } else {
      // userId is string (username), find the user first to get numeric ID
      const user = await User.findOne({
        where: { 
          [Op.or]: [
            { user_name: userId },
            { username: userId }
          ]
        },
        attributes: ['id', 'user_name']
      });
      
      if (user) {
        // Search by numeric user_id
        userRole = await UserRole.findOne({ 
          where: { user_id: user.id } 
        });
      }
    }

    if (!userRole) {
      return res.status(404).json({
        success: false,
        message: `UserRole not found for user: ${userId}`,
        suggestion: userId && isNaN(parseInt(userId)) 
          ? "The user might exist but doesn't have any roles assigned." 
          : "Check if the user ID is correct and if roles are assigned."
      });
    }

    // Parse role data with better error handling
    let roleIds = [];
    try {
      roleIds = JSON.parse(userRole.USER_ROLE_IDS || '[]');
      // Ensure roleIds is an array
      if (!Array.isArray(roleIds)) {
        console.warn(`USER_ROLE_IDS is not an array for user ${userId}:`, roleIds);
        roleIds = [];
      }
    } catch (error) {
      console.error(`Error parsing USER_ROLE_IDS for user ${userId}:`, error);
      roleIds = [];
    }

    // Parse role names with better error handling
    let roleNames = [];
    try {
      const parsedRoleNames = JSON.parse(userRole.ROLE_NMS || '[]');
      // Check if parsed value is an array
      if (Array.isArray(parsedRoleNames)) {
        roleNames = parsedRoleNames;
      }
    } catch (error) {
      console.error(`Error parsing ROLE_NMS for user ${userId}:`, error);
    }

    // If roleNames is empty but roleIds exists, try to get names from mapping
    if (roleNames.length === 0 && roleIds.length > 0 && Array.isArray(roleIds)) {
      try {
        // Ensure ROLE_MAPPING exists
        if (typeof ROLE_MAPPING === 'object' && ROLE_MAPPING !== null) {
          roleNames = roleIds.map(roleId => {
            const roleIdStr = String(roleId);
            return ROLE_MAPPING[roleIdStr]?.ROLE_NM || `Role ${roleId}`;
          });
        } else {
          roleNames = roleIds.map(roleId => `Role ${roleId}`);
        }
      } catch (error) {
        console.error(`Error mapping role names for user ${userId}:`, error);
        roleNames = roleIds.map(roleId => `Role ${roleId}`);
      }
    }

    // Get combined permissions from all roles
    let combinedPermissions = {};
    
    if (roleIds.length > 0 && Array.isArray(roleIds)) {
      try {
        // Import Permissions model
        const { default: Permissions } = await import('../models/Permissions.js');
        
        const permissionDocs = await Permissions.findAll({
          where: {
            BU_ROLE_ID: { [Op.in]: roleIds }
          },
          raw: true,
        });

        permissionDocs.forEach(doc => {
          Object.keys(doc).forEach(key => {
            if (key.endsWith('_ACCESS_LEVEL') && doc[key]) {
              try {
                const perms = JSON.parse(doc[key]);
                if (Array.isArray(perms)) {
                  if (!combinedPermissions[key]) combinedPermissions[key] = [];
                  combinedPermissions[key] = [...new Set([...combinedPermissions[key], ...perms])];
                }
              } catch (e) {
                // If not JSON, handle as single permission
                if (!combinedPermissions[key]) combinedPermissions[key] = [];
                if (!combinedPermissions[key].includes(doc[key])) {
                  combinedPermissions[key].push(doc[key]);
                }
              }
            }
          });
        });
      } catch (error) {
        console.error(`Error fetching permissions for roles ${roleIds}:`, error);
        // Continue without permissions rather than failing completely
      }
    }

    // Parse all access level fields from the user role
    const parsedAccessLevels = {};
    const accessLevelFields = [
      'VAULT_ACCESS_LEVEL', 'DRAWER_ACCESS_LEVEL', 'TXN_ENQUIRY_ACCESS_LVL',
      'CREDIT_APPL_ACCESS_LEVEL', 'CUSTOMER_ACCESS_LEVEL', 'ACCOUNT_ACCESS_LEVEL',
      'REPORT_ACCESS_LEVEL', 'CUST_POSTING_ACCESS_LEVEL', 'GL_POSTING_ACCESS_LEVEL',
      'FIXED_ASSET_ACCESS_LEVEL', 'LOAN_FEE_ACCESS_LEVEL', 'LOAN_OPERATIONS_ACCESS_LEVEL',
      'PERMISSION_MANAGEMENT_ACCESS_LEVEL', 'SYSTEM_ADMIN_ACCESS_LEVEL', 
      'DASHBOARD_ACCESS_LEVEL', 'WF_ITEM_ACCESS_LEVEL'
    ];

    accessLevelFields.forEach(field => {
      if (userRole[field]) {
        try {
          const parsedValue = JSON.parse(userRole[field]);
          // Only assign if it's an array or object
          if (Array.isArray(parsedValue) || typeof parsedValue === 'object') {
            parsedAccessLevels[field] = parsedValue;
          } else {
            parsedAccessLevels[field] = userRole[field];
          }
        } catch (e) {
          parsedAccessLevels[field] = userRole[field];
        }
      }
    });

    // Prepare response data
    const responseData = {
      ...userRole.toJSON(),
      USER_ROLE_IDS: roleIds,
      ROLE_NMS: roleNames,
      ROLE_NAMES: roleNames,
      ROLES_COUNT: roleIds.length,
      USER_ID: userRole.USER_ID || userRole.user_id, // Virtual field or actual
      // Parse all JSON fields
      ...parsedAccessLevels,
      // Add combined permissions
      COMBINED_PERMISSIONS: combinedPermissions,
      // Calculate access levels summary
      ACCESS_LEVELS_SUMMARY: {
        totalPermissions: Object.values(combinedPermissions).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0),
        permissionCategories: Object.keys(combinedPermissions).length,
        roleCount: roleIds.length,
        roles: roleNames
      }
    };

    console.log(`Fetched user role for user ID: ${userId}`, {
      roleCount: roleIds.length,
      permissionCategories: Object.keys(combinedPermissions).length
    });

    return res.status(200).json({
      success: true,
      message: "UserRole retrieved successfully",
      userRole: responseData,
    });
  } catch (error) {
    console.error("Error fetching UserRole by USER_ID:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching UserRole",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Check if user has specific roles
export const checkUserRoles = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { roles } = req.body;

  if (!roles || !Array.isArray(roles)) {
    return res.status(400).json({
      success: false,
      message: "Roles array is required",
    });
  }

  try {
    const userRole = await UserRole.findOne({ where: { USER_ID: userId } });
    
    if (!userRole) {
      return res.status(404).json({
        success: false,
        message: "UserRole not found for the specified USER_ID",
        hasRoles: false,
        userRoles: [],
      });
    }

    const userRoleNames = JSON.parse(userRole.ROLE_NMS || '[]') || 
      JSON.parse(userRole.USER_ROLE_IDS || '[]').map(roleId => 
        ROLE_MAPPING[String(roleId)]?.ROLE_NM
      ).filter(Boolean);

    const hasAllRoles = roles.every(role => userRoleNames.includes(role));
    const hasAnyRole = roles.some(role => userRoleNames.includes(role));

    return res.status(200).json({
      success: true,
      hasAllRoles,
      hasAnyRole,
      userRoles: userRoleNames,
      requestedRoles: roles,
    });
  } catch (error) {
    console.error("Error checking user roles:", error);
    return res.status(500).json({
      success: false,
      message: "Error checking user roles",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get All User Roles
// Get All User Roles - UPDATED
export const getAllUserRoles = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, sortBy = 'CREATE_DT', sortOrder = 'DESC' } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  try {
    // Validate sortBy field
    const validSortFields = ['role_id', 'CREATE_DT', 'ROLE_NM', 'SYSUSER_ID', 'BU_ID', 'user_id', 'ROW_TS'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'CREATE_DT';
    const order = [[sortField, sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC']];

    const { count, rows: userRoles } = await UserRole.findAndCountAll({
      limit: Number(limit),
      offset: offset,
      order: order,
      attributes: { 
        exclude: [] // Include all fields
      }
    });

    const updatedRoles = userRoles.map((role) => {
      const roleIds = JSON.parse(role.USER_ROLE_IDS || '[]');
      const roleNames = JSON.parse(role.ROLE_NMS || '[]') || 
        roleIds.map(roleId => ROLE_NAMES[String(roleId)] || "Unknown Role");

      // Parse all JSON fields
      const parsedRole = {
        ...role.toJSON(),
        ROLE_NAMES: roleNames,
        ROLES_COUNT: roleIds.length || 1,
        // Parse all JSON fields if they exist
        USER_ROLE_IDS: roleIds,
        ROLE_NMS: roleNames,
        VAULT_ACCESS_LEVEL: role.VAULT_ACCESS_LEVEL ? JSON.parse(role.VAULT_ACCESS_LEVEL) : ['BU'],
        DRAWER_ACCESS_LEVEL: role.DRAWER_ACCESS_LEVEL ? JSON.parse(role.DRAWER_ACCESS_LEVEL) : ['BU'],
        DASHBOARD_ACCESS_LEVEL: role.DASHBOARD_ACCESS_LEVEL ? JSON.parse(role.DASHBOARD_ACCESS_LEVEL) : ['BU'],
        TXN_ENQUIRY_ACCESS_LVL: role.TXN_ENQUIRY_ACCESS_LVL ? JSON.parse(role.TXN_ENQUIRY_ACCESS_LVL) : ['BU'],
        CREDIT_APPL_ACCESS_LEVEL: role.CREDIT_APPL_ACCESS_LEVEL ? JSON.parse(role.CREDIT_APPL_ACCESS_LEVEL) : ['BU'],
        CUSTOMER_ACCESS_LEVEL: role.CUSTOMER_ACCESS_LEVEL ? JSON.parse(role.CUSTOMER_ACCESS_LEVEL) : ['BU'],
        ACCOUNT_ACCESS_LEVEL: role.ACCOUNT_ACCESS_LEVEL ? JSON.parse(role.ACCOUNT_ACCESS_LEVEL) : ['BU'],
        REPORT_ACCESS_LEVEL: role.REPORT_ACCESS_LEVEL ? JSON.parse(role.REPORT_ACCESS_LEVEL) : ['BU'],
        CUST_POSTING_ACCESS_LEVEL: role.CUST_POSTING_ACCESS_LEVEL ? JSON.parse(role.CUST_POSTING_ACCESS_LEVEL) : ['BU'],
        GL_POSTING_ACCESS_LEVEL: role.GL_POSTING_ACCESS_LEVEL ? JSON.parse(role.GL_POSTING_ACCESS_LEVEL) : ['BU'],
        FIXED_ASSET_ACCESS_LEVEL: role.FIXED_ASSET_ACCESS_LEVEL ? JSON.parse(role.FIXED_ASSET_ACCESS_LEVEL) : ['BU'],
        LOAN_FEE_ACCESS_LEVEL: role.LOAN_FEE_ACCESS_LEVEL ? JSON.parse(role.LOAN_FEE_ACCESS_LEVEL) : ['BU'],
        LOAN_OPERATIONS_ACCESS_LEVEL: role.LOAN_OPERATIONS_ACCESS_LEVEL ? JSON.parse(role.LOAN_OPERATIONS_ACCESS_LEVEL) : ['BU'],
        PERMISSION_MANAGEMENT_ACCESS_LEVEL: role.PERMISSION_MANAGEMENT_ACCESS_LEVEL ? JSON.parse(role.PERMISSION_MANAGEMENT_ACCESS_LEVEL) : ['BU'],
        SYSTEM_ADMIN_ACCESS_LEVEL: role.SYSTEM_ADMIN_ACCESS_LEVEL ? JSON.parse(role.SYSTEM_ADMIN_ACCESS_LEVEL) : ['BU'],
        WF_ITEM_ACCESS_LEVEL: role.WF_ITEM_ACCESS_LEVEL ? JSON.parse(role.WF_ITEM_ACCESS_LEVEL) : ['BU'],
      };

      return parsedRole;
    });

    const totalPages = Math.ceil(count / Number(limit));

    console.log(`Fetched ${updatedRoles.length} user roles (page ${page}, limit ${limit}, sorted by ${sortField})`);

    return res.status(200).json({
      success: true,
      total: count,
      currentPage: Number(page),
      totalPages,
      sortBy: sortField,
      sortOrder: order[0][1],
      userRoles: updatedRoles,
    });
  } catch (error) {
    console.error("Error fetching UserRoles:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching UserRoles",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Update User Role - UPDATED
export const updateUserRole = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { userId, buId } = req.params; // Changed to userId and buId
    const {
      USER_ROLE_IDS,
      ROLE_NMS,
      BU_ID,
      Business_Unit,
      USER_ID, // Accept USER_ID for updating user reference
      ...updateData
    } = req.body;

    // Determine which BU_ID to use
    const targetBuId = BU_ID || buId;
    
    if (!targetBuId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "BU_ID is required for updating user role",
      });
    }

    // Check if user role exists
    const existingUserRole = await UserRole.findOne({
      where: { 
        BU_ID: targetBuId,
        user_id: userId // Changed from USER_ID to user_id
      },
      transaction
    });

    if (!existingUserRole) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `User role not found for user ID: ${userId} and BU_ID: ${targetBuId}`,
      });
    }

    // If USER_ID is provided in update, validate the user exists
    if (USER_ID) {
      let numericUserId = USER_ID;
      
      // Convert username to numeric ID if needed
      if (USER_ID && isNaN(parseInt(USER_ID))) {
        const userRecord = await User.findOne({
          where: { 
            [Op.or]: [
              { user_name: USER_ID },
              { username: USER_ID }
            ]
          },
          attributes: ['id'],
          transaction
        });
        
        if (userRecord) {
          numericUserId = userRecord.id;
        } else {
          await transaction.rollback();
          return res.status(400).json({
            success: false,
            message: `User with USER_ID ${USER_ID} does not exist`,
          });
        }
      }
      
      // Check if new user_id already has a role in this BU
      if (numericUserId !== existingUserRole.user_id) {
        const duplicateRole = await UserRole.findOne({
          where: { 
            BU_ID: targetBuId,
            user_id: numericUserId
          },
          transaction
        });
        
        if (duplicateRole) {
          await transaction.rollback();
          return res.status(409).json({
            success: false,
            message: `User with ID ${numericUserId} already has a role in business unit ${targetBuId}`,
          });
        }
        
        updateData.user_id = numericUserId;
      }
    }

    // Validate Business Unit if provided
    let validatedBusinessUnit = Business_Unit;
    if (Business_Unit) {
      try {
        const businessUnitDoc = await validateAndFetchBusinessUnit(targetBuId, transaction);
        validatedBusinessUnit = businessUnitDoc.BUSINESS_UNIT || Business_Unit;
      } catch (error) {
        console.warn('Business unit validation failed:', error.message);
      }
    }

    // Validate role IDs if provided
    if (USER_ROLE_IDS) {
      const userRoleIdsArray = Array.isArray(USER_ROLE_IDS) ? USER_ROLE_IDS : [USER_ROLE_IDS];
      const invalidRoleIds = userRoleIdsArray.filter(roleId => !ROLE_MAPPING[roleId.toString()]);
      
      if (invalidRoleIds.length > 0) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: `Invalid role IDs: ${invalidRoleIds.join(', ')}`,
        });
      }
      
      updateData.USER_ROLE_IDS = JSON.stringify(userRoleIdsArray);
      
      // Generate role names if ROLE_NMS not provided
      if (!ROLE_NMS) {
        const generatedRoleNames = userRoleIdsArray.map(roleId => {
          const roleData = ROLE_MAPPING[roleId.toString()];
          return roleData?.ROLE_NM || `Role ${roleId}`;
        });
        updateData.ROLE_NMS = JSON.stringify(generatedRoleNames);
        updateData.ROLE_NM = generatedRoleNames[0] || 'Unknown Role';
      }
    }

    // Handle ROLE_NMS if provided
    if (ROLE_NMS) {
      updateData.ROLE_NMS = JSON.stringify(ROLE_NMS);
      updateData.ROLE_NM = ROLE_NMS[0] || existingUserRole.ROLE_NM;
    }

    // Handle Business Unit
    if (validatedBusinessUnit) {
      updateData.Business_Unit = validatedBusinessUnit;
    }

    // Process access level fields if provided
    const accessLevelFields = [
      'VAULT_ACCESS_LEVEL', 'DRAWER_ACCESS_LEVEL', 'TXN_ENQUIRY_ACCESS_LVL',
      'CREDIT_APPL_ACCESS_LEVEL', 'CUSTOMER_ACCESS_LEVEL', 'ACCOUNT_ACCESS_LEVEL',
      'REPORT_ACCESS_LEVEL', 'CUST_POSTING_ACCESS_LEVEL', 'GL_POSTING_ACCESS_LEVEL',
      'FIXED_ASSET_ACCESS_LEVEL', 'LOAN_FEE_ACCESS_LEVEL', 'LOAN_OPERATIONS_ACCESS_LEVEL',
      'PERMISSION_MANAGEMENT_ACCESS_LEVEL', 'SYSTEM_ADMIN_ACCESS_LEVEL', 
      'DASHBOARD_ACCESS_LEVEL', 'WF_ITEM_ACCESS_LEVEL'
    ];

    accessLevelFields.forEach(field => {
      if (req.body[field] !== undefined) {
        const processAccessLevel = (level) => {
          if (Array.isArray(level)) return JSON.stringify(level);
          if (typeof level === 'string') return JSON.stringify([level]);
          return JSON.stringify(['BU']);
        };
        updateData[field] = processAccessLevel(req.body[field]);
      }
    });

    // Add update timestamp
    updateData.ROW_TS = new Date();

    // Update user role
    const [updatedCount] = await UserRole.update(updateData, {
      where: { 
        id: existingUserRole.id, // Use primary key for update
        BU_ID: targetBuId,
        user_id: userId
      },
      transaction
    });

    if (updatedCount === 0) {
      await transaction.rollback();
      return res.status(500).json({
        success: false,
        message: "Failed to update user role",
      });
    }

    // Fetch updated record
    const updatedUserRole = await UserRole.findByPk(existingUserRole.id, { transaction });

    await transaction.commit();

    // Parse JSON fields for response
    const parsedRole = updatedUserRole.toJSON();
    const roleIds = JSON.parse(parsedRole.USER_ROLE_IDS || '[]');
    const roleNames = JSON.parse(parsedRole.ROLE_NMS || '[]');

    return res.status(200).json({
      success: true,
      message: "User role updated successfully.",
      data: {
        ...parsedRole,
        USER_ROLE_IDS: roleIds,
        ROLE_NMS: roleNames,
        ROLE_NAMES: roleNames,
        ROLES_COUNT: roleIds.length,
        USER_ID: parsedRole.USER_ID || parsedRole.user_id,
      },
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error updating UserRole:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update UserRole.",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Delete User Role - UPDATED
export const deleteUserRole = asyncHandler(async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { userId, buId } = req.params; // Changed to userId and buId

    if (!userId || !buId) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: "userId and buId are required parameters",
      });
    }

    // Convert userId to numeric if it's a username
    let numericUserId = userId;
    if (userId && isNaN(parseInt(userId))) {
      const userRecord = await User.findOne({
        where: { 
          [Op.or]: [
            { user_name: userId },
            { username: userId }
          ]
        },
        attributes: ['id'],
        transaction
      });
      
      if (userRecord) {
        numericUserId = userRecord.id;
      } else {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `User with identifier ${userId} not found`,
        });
      }
    }

    // Find user role
    const userRole = await UserRole.findOne({
      where: { 
        BU_ID: buId,
        user_id: numericUserId
      },
      transaction
    });

    if (!userRole) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: `User role not found for user ID: ${numericUserId} and BU_ID: ${buId}`,
      });
    }

    // Store role info for response
    const roleInfo = {
      role_id: userRole.role_id,
      user_id: userRole.user_id,
      BU_ID: userRole.BU_ID,
      Business_Unit: userRole.Business_Unit,
      ROLE_NM: userRole.ROLE_NM,
      ROLE_NAMES: JSON.parse(userRole.ROLE_NMS || '[]')
    };

    // Delete user role
    await userRole.destroy({ transaction });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: "UserRole deleted successfully",
      deletedRole: roleInfo,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("Error deleting UserRole:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting UserRole",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get User Roles by Business Unit
export const getUserRolesByBusinessUnit = asyncHandler(async (req, res) => {
  const { buId } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  try {
    const { count, rows: userRoles } = await UserRole.findAndCountAll({
      where: { BU_ID: buId },
      limit: Number(limit),
      offset: offset,
      order: [['createdAt', 'DESC']]
    });

    const updatedRoles = userRoles.map((role) => {
      const roleIds = JSON.parse(role.USER_ROLE_IDS || '[]');
      const roleNames = JSON.parse(role.ROLE_NMS || '[]') || 
        roleIds.map(roleId => ROLE_MAPPING[String(roleId)]?.ROLE_NM || "Unknown Role");

      return {
        ...role.toJSON(),
        ROLE_NAMES: roleNames,
        ROLES_COUNT: roleIds.length || 1,
      };
    });

    const totalPages = Math.ceil(count / limit);

    return res.status(200).json({
      success: true,
      total: count,
      currentPage: Number(page),
      totalPages,
      userRoles: updatedRoles,
    });
  } catch (error) {
    console.error("Error fetching UserRoles by Business Unit:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching UserRoles by Business Unit",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// Get Users by Role Name
export const getUsersByRoleName = asyncHandler(async (req, res) => {
  const { roleName } = req.params;
  const { page = 1, limit = 10 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  try {
    // Find role IDs that match the role name
    const roleIds = Object.keys(ROLE_MAPPING).filter(
      roleId => ROLE_MAPPING[roleId]?.ROLE_NM === roleName
    ).map(Number);

    if (roleIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Role name '${roleName}' not found`,
      });
    }

    // Query user roles with role IDs in JSON array
    const { count, rows: userRoles } = await UserRole.findAndCountAll({
      where: sequelize.literal(`JSON_CONTAINS(USER_ROLE_IDS, '[${roleIds.join(',')}]')`),
      limit: Number(limit),
      offset: offset,
      order: [['createdAt', 'DESC']]
    });

    const updatedRoles = userRoles.map((role) => {
      const roleIds = JSON.parse(role.USER_ROLE_IDS || '[]');
      const roleNames = JSON.parse(role.ROLE_NMS || '[]') || 
        roleIds.map(roleId => ROLE_MAPPING[String(roleId)]?.ROLE_NM || "Unknown Role");

      return {
        ...role.toJSON(),
        ROLE_NAMES: roleNames,
        ROLES_COUNT: roleIds.length || 1,
      };
    });

    const totalPages = Math.ceil(count / limit);

    return res.status(200).json({
      success: true,
      total: count,
      currentPage: Number(page),
      totalPages,
      userRoles: updatedRoles,
    });
  } catch (error) {
    console.error("Error fetching users by role name:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching users by role name",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});


// Alternative version without JSON_CONTAINS
// Fixed version of getUsersByRoleId with better parsing
export const getUsersByRoleId = asyncHandler(async (req, res) => {
  const { roleId } = req.params;
  
  try {
    console.log(`🔍 SEARCHING FOR USERS WITH ROLE ID: ${roleId}`);
    
    const roleIdNum = parseInt(roleId);
    
    // Deep parsing function for corrupted JSON
    const deepParse = (input) => {
      if (!input) return [];
      if (Array.isArray(input)) return input;
      
      let result = input;
      // Keep parsing until it's no longer a string
      while (typeof result === 'string') {
        try {
          result = JSON.parse(result);
        } catch {
          break;
        }
      }
      
      // If we ended up with an array, great
      if (Array.isArray(result)) {
        return result.map(item => {
          // Clean up each item
          if (typeof item === 'string') {
            return item.replace(/[\[\]"]/g, '').trim();
          }
          return item;
        });
      }
      
      // If it's an object, extract values
      if (result && typeof result === 'object') {
        return Object.values(result).map(item => {
          if (typeof item === 'string') {
            return item.replace(/[\[\]"]/g, '').trim();
          }
          return item;
        });
      }
      
      // If it's a string, split by commas
      if (typeof result === 'string') {
        return result.split(',').map(item => 
          item.replace(/[\[\]"]/g, '').trim()
        ).filter(Boolean);
      }
      
      return [];
    };
    
    // Get ALL user roles
    const allUserRoles = await UserRole.findAll({
      raw: true
    });
    
    console.log(`📊 TOTAL USER ROLES FOUND: ${allUserRoles.length}`);
    
    // Filter user roles that contain the requested roleId
    const filteredUserRoles = allUserRoles.filter(userRole => {
      // Check direct role_id
      if (userRole.role_id !== null && userRole.role_id !== undefined) {
        const userRoleId = parseInt(userRole.role_id);
        if (userRoleId === roleIdNum) return true;
      }
      
      // Deep parse USER_ROLE_IDS
      if (userRole.USER_ROLE_IDS) {
        const parsedIds = deepParse(userRole.USER_ROLE_IDS);
        
        // Check each parsed ID
        for (const id of parsedIds) {
          // Remove any remaining brackets or quotes
          const cleanId = String(id).replace(/[\[\]"]/g, '').trim();
          const numId = parseInt(cleanId);
          if (!isNaN(numId) && numId === roleIdNum) return true;
          if (cleanId === String(roleIdNum)) return true;
        }
      }
      
      return false;
    });
    
    console.log(`✅ FOUND ${filteredUserRoles.length} USER ROLES FOR ROLE ID ${roleIdNum}`);
    
    // Prepare response
    const usersWithRoles = filteredUserRoles.map(userRole => ({
      user_id: userRole.user_id,
      SYSUSER_ID: userRole.SYSUSER_ID,
      role_id: userRole.role_id,
      BU_ID: userRole.BU_ID,
      Business_Unit: userRole.Business_Unit,
      ROLE_NM: userRole.ROLE_NM,
      // Include parsed data for debugging
      _debug: {
        raw_USER_ROLE_IDS: userRole.USER_ROLE_IDS,
        parsed_USER_ROLE_IDS: userRole.USER_ROLE_IDS ? deepParse(userRole.USER_ROLE_IDS) : []
      }
    }));
    
    return res.status(200).json({
      success: true,
      count: filteredUserRoles.length,
      roleId: roleIdNum,
      roleName: ROLE_MAPPING[roleId]?.ROLE_NM || `Role ${roleId}`,
      message: `Found ${filteredUserRoles.length} user(s) with role ID ${roleId}`,
      users: usersWithRoles
    });
    
  } catch (error) {
    console.error(`❌ ERROR:`, error);
    return res.status(500).json({
      success: false,
      message: "Error fetching users by role ID",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
      roleId
    });
  }
});

// Get User's Combined Permissions
export const getUserCombinedPermissions = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  try {
    const userRole = await UserRole.findOne({ where: { USER_ID: userId } });

    if (!userRole) {
      return res.status(404).json({
        success: false,
        message: "UserRole not found for the specified USER_ID",
      });
    }

    const permissions = JSON.parse(userRole.permissions || '{}');
    const combinedPermissions = {};

    Object.keys(permissions).forEach(key => {
      if (Array.isArray(permissions[key])) {
        if (!combinedPermissions[key]) {
          combinedPermissions[key] = [];
        }
        combinedPermissions[key] = [
          ...new Set([...combinedPermissions[key], ...permissions[key]])
        ];
      }
    });

    // Flatten all permissions
    const allPermissions = Object.values(combinedPermissions).flat();

    const roleIds = JSON.parse(userRole.USER_ROLE_IDS || '[]');
    const roleNames = JSON.parse(userRole.ROLE_NMS || '[]') || 
      roleIds.map(roleId => ROLE_MAPPING[String(roleId)]?.ROLE_NM || "Unknown Role");

    return res.status(200).json({
      success: true,
      permissions: {
        combined: combinedPermissions,
        flat: allPermissions,
        roles: roleNames,
      },
    });
  } catch (error) {
    console.error("Error fetching user combined permissions:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching user permissions",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});
// Get Accessible Business Units for a User
export const getAccessibleBUsForUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { includeAll = false } = req.query;

  try {
    // Find user roles for the specified user
    const userRoles = await UserRole.findAll({
      where: { 
        USER_ID: userId,
        ...(includeAll === 'false' ? { REC_ST: { [Op.in]: ['A', 'Y', 'Active'] } } : {})
      },
      attributes: ['BU_ID', 'Business_Unit', 'USER_ROLE_IDS', 'ROLE_NMS']
    });

    if (userRoles.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No business units found for user: ${userId}`,
        data: []
      });
    }

    // Process and deduplicate business units
    const businessUnitsMap = new Map();
    
    userRoles.forEach(userRole => {
      const buId = userRole.BU_ID;
      const businessUnit = userRole.Business_Unit;
      
      if (!businessUnitsMap.has(buId)) {
        businessUnitsMap.set(buId, {
          BU_ID: buId,
          BUSINESS_UNIT: businessUnit,
          roles: [],
          hasMultipleRoles: false
        });
      }
      
      // Parse role information
      const roleIds = JSON.parse(userRole.USER_ROLE_IDS || '[]');
      const roleNames = JSON.parse(userRole.ROLE_NMS || '[]') || 
        roleIds.map(roleId => ROLE_MAPPING[String(roleId)]?.ROLE_NM || "Unknown Role");
      
      const unitData = businessUnitsMap.get(buId);
      
      // Add roles if not already present
      roleIds.forEach((roleId, index) => {
        const roleName = roleNames[index] || ROLE_MAPPING[String(roleId)]?.ROLE_NM;
        if (!unitData.roles.some(r => r.roleId === roleId)) {
          unitData.roles.push({
            roleId,
            roleName: roleName || `Role ${roleId}`
          });
        }
      });
      
      unitData.hasMultipleRoles = unitData.roles.length > 1;
    });

    const businessUnits = Array.from(businessUnitsMap.values());
    
    // Sort by BU_ID
    businessUnits.sort((a, b) => a.BU_ID - b.BU_ID);

    return res.status(200).json({
      success: true,
      userId,
      count: businessUnits.length,
      data: businessUnits.map(unit => ({
        ...unit,
        roleCount: unit.roles.length,
        roles: unit.roles
      }))
    });

  } catch (error) {
    console.error("Error fetching accessible business units for user:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching accessible business units",
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

export default {
  createUserRole,
  addRolesToUser,
  removeRolesFromUser,
  getUserRoleByUserId,
  checkUserRoles,
  getAllUserRoles,
  updateUserRole,
  deleteUserRole,
  getUserRolesByBusinessUnit,
  getUsersByRoleName,
  getUsersByRoleId,
  getUserCombinedPermissions,
  getAccessibleBUsForUser
};