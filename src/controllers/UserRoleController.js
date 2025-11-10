// src/controllers/UserRoleController.js - COMPLETE with Multiple Role Support
import mongoose from "mongoose";
import UserRole from "../models/UserRole.js";
import BusinessUnit from "../models/BusinessUnit.js";
import Permissions from "../models/Permissions.js";
import { ROLE_MAPPING, ROLE_PERMISSION_MAPPING } from "../constants/roleMapping.js";
import { PERMISSIONS } from "../constants/permissions.js";
import { isBUAccessible, getAccessibleBusinessUnits } from "../utils/businessUnitUtils.js";
import User from "../models/User.js";
import { normalizeRoleId } from "../utils/roleUtils.js";
import logger from "../utils/logger.js";
import { asyncHandler } from "../middlewares/asyncHandler.js";

// Define ROLE_NAMES here (export if needed in other files)
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
  18: 'Senior Financial Accountant', // Note: Duplicate with 4? Adjust if needed
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
  // Add more as needed
};


async function validateAndFetchBusinessUnit(BU_ID, session) {
  const businessUnit = await BusinessUnit.findOne({ BU_ID }).session(session);
  if (!businessUnit) {
    throw new Error("Invalid Business Unit provided.");
  }
  return businessUnit;
}

// Generate SYSUSER_ID
async function generateSysUserId(session) {
  const lastEntry = await UserRole.findOne({})
    .sort({ SYSUSER_ID: -1 })
    .lean()
    .session(session);
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

// Generate or find existing BU_ROLE_ID for multiple roles
async function generateBuRoleIds(BU_ID, USER_ROLE_IDS, session) {
  const buRoleIds = [];
  const existingPermissions = [];
  const newRoleIds = [];

  for (const USER_ROLE_ID of USER_ROLE_IDS) {
    const normalizedRoleId = normalizeRoleId(USER_ROLE_ID);
    const BU_ROLE_ID = parseInt(`${BU_ID}${normalizedRoleId.padStart(3, "0")}`);
    
    // Check if permissions already exist for this role in this business unit
    const existingPermission = await Permissions.findOne({ BU_ROLE_ID }).session(session);
    
    if (existingPermission) {
      console.log(`Reusing existing permissions for BU_ROLE_ID: ${BU_ROLE_ID}`);
      existingPermissions.push(existingPermission._id);
    } else {
      newRoleIds.push({ BU_ROLE_ID, normalizedRoleId });
    }
    
    buRoleIds.push(BU_ROLE_ID);
  }
  
  return { buRoleIds, existingPermissions, newRoleIds };
}

// Validate permissions array
function validatePermissions(permissions) {
  const validPermissions = Object.values(PERMISSIONS).flatMap(category => Object.values(category));
  return permissions.every(perm => validPermissions.includes(perm));
}

// FIXED: Get default permissions for a role based on access level
function getDefaultPermissionsForAccessLevel(accessLevel, roleId) {
  // For Administrator role (1), return all permissions
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

  // For other roles, return basic permissions based on access level
  const defaultPermissions = {};
  
  // Define basic permissions for each category based on access level
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
  };

  // Apply access level logic
  Object.keys(permissionMap).forEach(category => {
    if (accessLevel === 'BU' || accessLevel === 'OWN BUSINESS UNIT') {
      defaultPermissions[category] = permissionMap[category];
    } else if (accessLevel === 'ALL BUSINESS UNIT') {
      // For all business unit access, grant more permissions
      defaultPermissions[category] = [...permissionMap[category]];
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

// ✅ UPDATED: Create User Role with Multiple Role Support - SIMPLIFIED VERSION
export const createUserRole = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const {
      USER_ROLE_IDS, // ✅ Array of role IDs
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
      // Access levels - handle both string and array formats
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
      permissions = [],
    } = req.body;

    console.log('🔧 CREATING USER ROLE - DEBUG:', {
      USER_ROLE_IDS,
      BU_ID,
      Business_Unit,
      USER_ID,
      SYSUSER_ID
    });

    // ✅ VALIDATION: Check required fields
    if (!USER_ROLE_IDS || !Array.isArray(USER_ROLE_IDS) || USER_ROLE_IDS.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'USER_ROLE_IDS is required and must be a non-empty array'
      });
    }

    if (!BU_ID || !Business_Unit || !CREATED_BY) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'BU_ID, Business_Unit, and CREATED_BY are required'
      });
    }

    if (!EFF_FROM_DT) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'EFF_FROM_DT is required'
      });
    }

    // ✅ VALIDATION: Check if role IDs exist in ROLE_MAPPING
    const invalidRoleIds = USER_ROLE_IDS.filter(roleId => !ROLE_MAPPING[roleId.toString()]);
    if (invalidRoleIds.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `Invalid role IDs: ${invalidRoleIds.join(', ')}. Valid role IDs are: ${Object.keys(ROLE_MAPPING).join(', ')}`
      });
    }

    // ✅ GENERATE: Role names from ROLE_MAPPING
    const ROLE_NMS = USER_ROLE_IDS.map(roleId => {
      const roleData = ROLE_MAPPING[roleId.toString()];
      return roleData?.ROLE_NM || `Role ${roleId}`;
    });

    console.log('📋 GENERATED ROLE NAMES:', ROLE_NMS);

    // ✅ GENERATE: Primary role name (use first role as primary)
    const ROLE_NM = ROLE_NMS[0] || 'Unknown Role';

    // ✅ VALIDATE: Business Unit exists
    const businessUnitDoc = await validateAndFetchBusinessUnit(BU_ID, session);
    const validatedBusinessUnit = businessUnitDoc.BUSINESS_UNIT;

    // ✅ CHECK: If user role already exists for this BU_ID and USER_ID combination
    if (USER_ID) {
      const existingUserRole = await UserRole.findOne({
        BU_ID: BU_ID,
        USER_ID: USER_ID
      }).session(session);

      if (existingUserRole) {
        await session.abortTransaction();
        return res.status(409).json({
          success: false,
          message: `User role already exists for BU_ID: ${BU_ID} and USER_ID: ${USER_ID}`,
          existingRole: {
            _id: existingUserRole._id,
            USER_ROLE_IDS: existingUserRole.USER_ROLE_IDS,
            ROLE_NMS: existingUserRole.ROLE_NMS,
            BU_ID: existingUserRole.BU_ID,
            USER_ID: existingUserRole.USER_ID
          }
        });
      }

      // ✅ VALIDATE: User exists if USER_ID is provided
      const userExists = await User.exists({ user_name: USER_ID }).session(session);
      if (!userExists) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `USER_ID ${USER_ID} does not exist in Users collection.`,
        });
      }
    }

    // ✅ GENERATE: SYSUSER_ID if not provided
    const generatedSysUserId = SYSUSER_ID || await generateSysUserId(session);

    // ✅ PROCESS: Access level fields (convert string to array if needed)
    const processAccessLevel = (level) => {
      if (Array.isArray(level)) return level;
      if (typeof level === 'string') return [level];
      return ['BU'];
    };

    const userRoleData = {
      USER_ROLE_IDS,
      ROLE_NMS,
      ROLE_NM, // ✅ Primary role name (backward compatibility)
      BU_ID,
      Business_Unit: validatedBusinessUnit,
      CREATED_BY,
      SYSUSER_ID: generatedSysUserId,
      USER_ID: USER_ID || null,
      EFF_FROM_DT: new Date(EFF_FROM_DT),
      EFF_TO_DT: EFF_TO_DT ? new Date(EFF_TO_DT) : null,
      DEF_ROLE_FG,
      SUPERVISOR_FG,
      MULTI_CRNCY_FG,
      REC_ST,
      permissions: permissions || [],
      // Process all access levels
      VAULT_ACCESS_LEVEL: processAccessLevel(VAULT_ACCESS_LEVEL),
      DRAWER_ACCESS_LEVEL: processAccessLevel(DRAWER_ACCESS_LEVEL),
      TXN_ENQUIRY_ACCESS_LVL: processAccessLevel(TXN_ENQUIRY_ACCESS_LVL),
      CREDIT_APPL_ACCESS_LEVEL: processAccessLevel(CREDIT_APPL_ACCESS_LEVEL),
      CUSTOMER_ACCESS_LEVEL: processAccessLevel(CUSTOMER_ACCESS_LEVEL),
      ACCOUNT_ACCESS_LEVEL: processAccessLevel(ACCOUNT_ACCESS_LEVEL),
      WF_ITEM_ACCESS_LEVEL: processAccessLevel(WF_ITEM_ACCESS_LEVEL),
      REPORT_ACCESS_LEVEL: processAccessLevel(REPORT_ACCESS_LEVEL),
      CUST_POSTING_ACCESS_LEVEL: processAccessLevel(CUST_POSTING_ACCESS_LEVEL),
      GL_POSTING_ACCESS_LEVEL: processAccessLevel(GL_POSTING_ACCESS_LEVEL),
      FIXED_ASSET_ACCESS_LEVEL: processAccessLevel(FIXED_ASSET_ACCESS_LEVEL),
      LOAN_FEE_ACCESS_LEVEL: processAccessLevel(LOAN_FEE_ACCESS_LEVEL),
      LOAN_OPERATIONS_ACCESS_LEVEL: processAccessLevel(LOAN_OPERATIONS_ACCESS_LEVEL),
      PERMISSION_MANAGEMENT_ACCESS_LEVEL: processAccessLevel(PERMISSION_MANAGEMENT_ACCESS_LEVEL),
      SYSTEM_ADMIN_ACCESS_LEVEL: processAccessLevel(SYSTEM_ADMIN_ACCESS_LEVEL),
      DASHBOARD_ACCESS_LEVEL: processAccessLevel(DASHBOARD_ACCESS_LEVEL),
    };

    console.log('📦 FINAL USER ROLE DATA:', {
      USER_ROLE_IDS: userRoleData.USER_ROLE_IDS,
      ROLE_NMS: userRoleData.ROLE_NMS,
      BU_ID: userRoleData.BU_ID,
      USER_ID: userRoleData.USER_ID,
      SYSUSER_ID: userRoleData.SYSUSER_ID
    });

    // ✅ CREATE: User Role document
    const newUserRole = new UserRole(userRoleData);
    await newUserRole.save({ session });

    await session.commitTransaction();

    logger.info(`User roles created successfully for USER_ID: ${USER_ID}`, {
      roles: ROLE_NMS,
      rolesCount: USER_ROLE_IDS.length,
      BU_ID,
      SYSUSER_ID: generatedSysUserId
    });

    return res.status(201).json({
      success: true,
      message: "User roles created successfully.",
      data: {
        _id: newUserRole._id,
        ROLE_NMS: ROLE_NMS,
        USER_ROLE_IDS: USER_ROLE_IDS,
        SYSUSER_ID: generatedSysUserId,
        BU_ID: BU_ID,
        USER_ID: USER_ID,
        rolesCount: USER_ROLE_IDS.length,
        accessLevels: {
          VAULT: userRoleData.VAULT_ACCESS_LEVEL,
          DRAWER: userRoleData.DRAWER_ACCESS_LEVEL,
          DASHBOARD: userRoleData.DASHBOARD_ACCESS_LEVEL,
        }
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error creating user roles:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create user roles.",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
});

// ✅ UPDATED: Add Roles to Existing User Role - Optional ROLE_NMS validation
export const addRolesToUser = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
 
  try {
    const { userId } = req.params;
    const { USER_ROLE_IDS, ROLE_NMS, BU_ID, CREATED_BY } = req.body; // ✅ Added ROLE_NMS (optional for validation)
    
    if (!USER_ROLE_IDS || !Array.isArray(USER_ROLE_IDS) || USER_ROLE_IDS.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "USER_ROLE_IDS (array) is required",
      });
    }

    // ✅ Optional: Validate ROLE_NMS if provided (must match USER_ROLE_IDS length)
    let validatedRoleNames = null;
    if (ROLE_NMS && Array.isArray(ROLE_NMS)) {
      if (ROLE_NMS.length !== USER_ROLE_IDS.length) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "ROLE_NMS array length must match USER_ROLE_IDS",
        });
      }
      // Validate names match mapping for each ID
      const validationErrors = USER_ROLE_IDS.map((id, index) => {
        const expectedName = ROLE_MAPPING[Number(id)]?.ROLE_NM;
        const providedName = ROLE_NMS[index];
        if (expectedName && providedName !== expectedName) {
          return `Role ID ${id}: Provided name "${providedName}" does not match expected "${expectedName}"`;
        }
        return null;
      }).filter(error => error !== null);
      
      if (validationErrors.length > 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "ROLE_NMS validation failed: " + validationErrors.join('; '),
        });
      }
      validatedRoleNames = ROLE_NMS; // Use provided if valid
    }

    const existingUserRole = await UserRole.findOne({ USER_ID: userId, BU_ID }).session(session);
    if (!existingUserRole) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User role not found for this user and business unit",
      });
    }

    const newNormalizedRoleIds = [];
    const newRoleNames = [];
   
    for (const USER_ROLE_ID of USER_ROLE_IDS) {
      const normalizedRoleId = normalizeRoleId(USER_ROLE_ID);
      if (!normalizedRoleId) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Invalid USER_ROLE_ID provided: ${USER_ROLE_ID}`,
        });
      }

      const roleData = ROLE_MAPPING[normalizedRoleId];
      if (!roleData) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `Role ID ${USER_ROLE_ID} not found in ROLE_MAPPING.`,
        });
      }

      if (existingUserRole.USER_ROLE_IDS.includes(normalizedRoleId)) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: `User already has role: ${roleData.ROLE_NM}`,
        });
      }

      newNormalizedRoleIds.push(normalizedRoleId);
      // ✅ Use validated names if provided, else from mapping
      const roleName = validatedRoleNames ? validatedRoleNames[USER_ROLE_IDS.indexOf(USER_ROLE_ID)] : roleData.ROLE_NM;
      newRoleNames.push(roleName);
    }

    // Update user role with new roles
    existingUserRole.USER_ROLE_IDS.push(...newNormalizedRoleIds);
    existingUserRole.ROLE_NMS.push(...newRoleNames);
    existingUserRole.CREATED_BY = CREATED_BY || existingUserRole.CREATED_BY;

    await existingUserRole.save({ session });
    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "Roles added successfully to user.",
      data: {
        addedRoles: newRoleNames,
        addedRoleIds: newNormalizedRoleIds,
        totalRoles: existingUserRole.USER_ROLE_IDS.length,
        currentRoles: existingUserRole.ROLE_NMS,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error adding roles to user:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to add roles to user.",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
});

// ✅ UPDATED: Remove Roles from User - Optional ROLE_NMS validation in request
export const removeRolesFromUser = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
 
  try {
    const { userId } = req.params;
    const { USER_ROLE_IDS, ROLE_NMS, BU_ID } = req.body; // ✅ Added ROLE_NMS (optional for validation)
    
    if (!USER_ROLE_IDS || !Array.isArray(USER_ROLE_IDS) || USER_ROLE_IDS.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "USER_ROLE_IDS (array) is required",
      });
    }

    // ✅ Optional: Validate ROLE_NMS if provided (must match USER_ROLE_IDS length)
    if (ROLE_NMS && Array.isArray(ROLE_NMS)) {
      if (ROLE_NMS.length !== USER_ROLE_IDS.length) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "ROLE_NMS array length must match USER_ROLE_IDS",
        });
      }
      // Validate names match mapping for each ID
      const validationErrors = USER_ROLE_IDS.map((id, index) => {
        const expectedName = ROLE_MAPPING[Number(id)]?.ROLE_NM;
        const providedName = ROLE_NMS[index];
        if (expectedName && providedName !== expectedName) {
          return `Role ID ${id}: Provided name "${providedName}" does not match expected "${expectedName}"`;
        }
        return null;
      }).filter(error => error !== null);
      
      if (validationErrors.length > 0) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: "ROLE_NMS validation failed: " + validationErrors.join('; '),
        });
      }
    }

    // ✅ Ensure BU_ID is string to match DB
    const buIdString = String(BU_ID);

    // ✅ First, fetch to get current state and compute updates
    const existingUserRole = await UserRole.findOne({
      USER_ID: userId,
      BU_ID: buIdString
    }).session(session);
   
    if (!existingUserRole) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User role not found for this user and business unit",
      });
    }

    // ✅ Safety: Ensure arrays exist
    const currentUserRoleIds = Array.isArray(existingUserRole.USER_ROLE_IDS) ? [...existingUserRole.USER_ROLE_IDS] : [];
    const currentRoleNms = Array.isArray(existingUserRole.ROLE_NMS) ? [...existingUserRole.ROLE_NMS] : [];

    // ✅ Normalize to NUMBERS for consistent comparison (DB likely stores numbers)
    const rolesToRemove = USER_ROLE_IDS.map(roleId => Number(normalizeRoleId(roleId))).filter(id => !isNaN(id));
    
    if (rolesToRemove.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "No valid role IDs provided to remove",
      });
    }

    // ✅ Compute remaining role IDs (numbers)
    const remainingRoles = currentUserRoleIds.filter(
      roleId => !rolesToRemove.includes(Number(roleId))
    );

    if (remainingRoles.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Cannot remove all roles from user. User must have at least one role.",
      });
    }

    // ✅ Compute remaining role names (parallel filtering, using numbers)
    const remainingRoleNames = currentUserRoleIds.map((roleId, index) => {
      const numRoleId = Number(roleId);
      if (!rolesToRemove.includes(numRoleId)) {
        return currentRoleNms[index] || null;
      }
      return null;
    }).filter(name => name !== null && name !== undefined);

    // ✅ If ROLE_NMS provided in request, use for removed names; else fallback to mapping
    const removedRoleNames = ROLE_NMS && Array.isArray(ROLE_NMS) 
      ? rolesToRemove.map((roleId, index) => ROLE_NMS[USER_ROLE_IDS.indexOf(roleId)]) // Match by original index
      : rolesToRemove.map(roleId => ROLE_MAPPING[roleId]?.ROLE_NM || 'Unknown Role');

    // ✅ Compute new ROLE_NM (first remaining)
    const newRoleNm = remainingRoleNames.length > 0 ? remainingRoleNames[0] : null;

    console.log('🔍 COMPUTED UPDATES:', {
      originalIds: currentUserRoleIds,
      rolesToRemove, // Now numbers
      remainingRoles,
      remainingRoleNames,
      newRoleNm
    });

    // ✅ Use findOneAndUpdate for atomic update within transaction
    const updateResult = await UserRole.findOneAndUpdate(
      { USER_ID: userId, BU_ID: buIdString },
      {
        $set: {
          USER_ROLE_IDS: remainingRoles,
          ROLE_NMS: remainingRoleNames,
          ROLE_NM: newRoleNm,
          ROW_TS: new Date() // Update timestamp if needed
        }
      },
      {
        new: true, // Return updated document
        session
      }
    );

    if (!updateResult) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "Failed to update user role",
      });
    }

    await session.commitTransaction();

    console.log('🔍 DB CONFIRMED UPDATE:', {
      updatedIds: updateResult.USER_ROLE_IDS,
      updatedNms: updateResult.ROLE_NMS
    });

    return res.status(200).json({
      success: true,
      message: "Roles removed successfully from user.",
      data: {
        removedRoles: removedRoleNames,
        remainingRoles: updateResult.ROLE_NMS,
        remainingRoleIds: updateResult.USER_ROLE_IDS,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error removing roles from user:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to remove roles from user.",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
});

// ✅ UPDATED: Get User Roles with Combined Permissions
export const getUserRoleByUserId = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  try {
    const userRole = await UserRole.findOne({ USER_ID: userId }).populate("permissions");

    if (!userRole) {
      return res.status(404).json({
        success: false,
        message: "UserRole not found for the specified USER_ID",
      });
    }

    const roleNames = userRole.ROLE_NMS || userRole.USER_ROLE_IDS.map(roleId => 
      ROLE_MAPPING[String(roleId)]?.ROLE_NM || "Unknown Role"
    );

    let combinedPermissions = {};
    if (userRole.permissions && Array.isArray(userRole.permissions)) {
      userRole.permissions.forEach(permissionDoc => {
        if (permissionDoc && typeof permissionDoc === 'object') {
          Object.keys(permissionDoc).forEach(key => {
            if (Array.isArray(permissionDoc[key])) {
              if (!combinedPermissions[key]) {
                combinedPermissions[key] = [];
              }
              combinedPermissions[key] = [
                ...new Set([...combinedPermissions[key], ...permissionDoc[key]])
              ];
            }
          });
        }
      });
    }

    return res.status(200).json({
      success: true,
      userRole: {
        ...userRole._doc,
        ROLE_NAMES: roleNames,
        COMBINED_PERMISSIONS: combinedPermissions,
      },
    });
  } catch (error) {
    console.error("Error fetching UserRole by USER_ID:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching UserRole",
      error: error.message,
    });
  }
});

// ✅ UPDATED: Check if user has specific roles
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
    const userRole = await UserRole.findOne({ USER_ID: userId });
    
    if (!userRole) {
      return res.status(404).json({
        success: false,
        message: "UserRole not found for the specified USER_ID",
        hasRoles: false,
        userRoles: [],
      });
    }

    const userRoleNames = userRole.ROLE_NMS || userRole.USER_ROLE_IDS.map(roleId => 
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
      error: error.message,
    });
  }
});

export const getAllUserRoles = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const skip = (Number(page) - 1) * Number(limit); // Ensure numbers

  try {
    // Fetch with pagination and populate
    const userRoles = await UserRole.find({})
      .populate("permissions") // Assumes 'permissions' is a ref field in model
      .skip(skip)
      .limit(Number(limit))
      .lean();

    // 🔒 SAFETY CHECK: Ensure userRoles is always an array
    const safeUserRoles = Array.isArray(userRoles) ? userRoles : [];

    // Map with safe handling for multiple roles
    const updatedRoles = safeUserRoles.map((role) => {
      // Safe handling for USER_ROLE_IDS
      const roleIds = Array.isArray(role.USER_ROLE_IDS) ? role.USER_ROLE_IDS : [];
      
      // Generate role names safely using ROLE_NAMES (now defined above)
      const roleNames = roleIds.length > 0 
        ? roleIds.map(roleId => ROLE_NAMES[String(roleId)] || "Unknown Role")
        : [ROLE_NAMES[String(role.ROLE_ID)] || "Unknown Role"]; // Fallback to single role if no array

      return {
        ...role,
        ROLE_NAMES: role.ROLE_NMS || roleNames, // Use existing or computed
        ROLES_COUNT: roleIds.length || 1,
        // Optionally include populated permissions if needed
        permissions: role.permissions || [],
      };
    });

    const totalRoles = await UserRole.countDocuments({});

    console.log(`Fetched ${updatedRoles.length} user roles (page ${page}, limit ${limit})`); // Debug log

    return res.status(200).json({
      success: true,
      total: totalRoles,
      currentPage: Number(page),
      totalPages: Math.ceil(totalRoles / Number(limit)),
      userRoles: updatedRoles,
    });
  } catch (error) {
    console.error("Error fetching UserRoles:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching UserRoles",
      error: error.message,
    });
  }
});


// ✅ UPDATED: Update User Role
export const updateUserRole = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { userId } = req.params;
    const {
      USER_ROLE_IDS,
      ROLE_NMS,
      BU_ID,
      Business_Unit,
      ...updateData
    } = req.body;

    const userExists = await User.exists({ user_name: userId });
    if (!userExists) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `USER_ID ${userId} does not exist in Users collection.`,
      });
    }

    let validatedBusinessUnit = Business_Unit;
    if (BU_ID) {
      const businessUnitDoc = await validateAndFetchBusinessUnit(BU_ID, session);
      validatedBusinessUnit = businessUnitDoc.BUSINESS_UNIT;
    }

    const updatedUserRole = await UserRole.findOneAndUpdate(
      { USER_ID: userId, BU_ID },
      {
        ...updateData,
        ROLE_NMS,
        USER_ROLE_IDS,
        Business_Unit: validatedBusinessUnit,
        BU_ID,
      },
      { new: true, upsert: false, session }
    ).populate("permissions");

    if (!updatedUserRole) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "User role not found for update",
      });
    }

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "User role updated successfully.",
      userRole: updatedUserRole,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error updating UserRole:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update UserRole.",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
});

// ✅ UPDATED: Delete User Role by ID
export const deleteUserRole = asyncHandler(async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const { userRoleId } = req.params;

    const deletedUserRole = await UserRole.findByIdAndDelete(userRoleId).session(session);

    if (!deletedUserRole) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: "UserRole not found",
      });
    }

    // Delete associated permissions
    if (deletedUserRole.permissions && Array.isArray(deletedUserRole.permissions)) {
      await Permissions.deleteMany({
        _id: { $in: deletedUserRole.permissions }
      }).session(session);
    }

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: "UserRole and associated permissions deleted successfully",
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error deleting UserRole:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting UserRole",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
});

// ✅ UPDATED: Get User Roles by Business Unit
export const getUserRolesByBusinessUnit = asyncHandler(async (req, res) => {
  const { buId } = req.params;
  const { page = 1, limit = 10 } = req.query;

  try {
    const userRoles = await UserRole.find({ BU_ID: buId })
      .populate("permissions")
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const updatedRoles = userRoles.map((role) => ({
      ...role,
      ROLE_NAMES: role.ROLE_NMS || role.USER_ROLE_IDS.map(roleId => 
        ROLE_MAPPING[String(roleId)]?.ROLE_NM || "Unknown Role"
      ),
      ROLES_COUNT: role.USER_ROLE_IDS?.length || 1,
    }));

    const totalRoles = await UserRole.countDocuments({ BU_ID: buId });

    return res.status(200).json({
      success: true,
      total: totalRoles,
      currentPage: Number(page),
      totalPages: Math.ceil(totalRoles / limit),
      userRoles: updatedRoles,
    });
  } catch (error) {
    console.error("Error fetching UserRoles by Business Unit:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching UserRoles by Business Unit",
      error: error.message,
    });
  }
});

// ✅ UPDATED: Get Users by Role Name
export const getUsersByRoleName = asyncHandler(async (req, res) => {
  const { roleName } = req.params;
  const { page = 1, limit = 10 } = req.query;

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

    const userRoles = await UserRole.find({
      USER_ROLE_IDS: { $in: roleIds }
    })
      .populate("permissions")
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const updatedRoles = userRoles.map((role) => ({
      ...role,
      ROLE_NAMES: role.ROLE_NMS || role.USER_ROLE_IDS.map(roleId => 
        ROLE_MAPPING[String(roleId)]?.ROLE_NM || "Unknown Role"
      ),
      ROLES_COUNT: role.USER_ROLE_IDS?.length || 1,
    }));

    const totalRoles = await UserRole.countDocuments({
      USER_ROLE_IDS: { $in: roleIds }
    });

    return res.status(200).json({
      success: true,
      total: totalRoles,
      currentPage: Number(page),
      totalPages: Math.ceil(totalRoles / limit),
      userRoles: updatedRoles,
    });
  } catch (error) {
    console.error("Error fetching users by role name:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching users by role name",
      error: error.message,
    });
  }
});

// ✅ UPDATED: Accessible BUs by User
export const getAccessibleBUsForUser = asyncHandler(async (req, res) => {
  try {
    const { userId } = req.params;

    const userRole = await UserRole.findOne({ USER_ID: userId }).populate("permissions");

    if (!userRole || !userRole.permissions) {
      return res.status(404).json({ success: false, message: "User role or permissions not found." });
    }

    const userPermissions = [
      userRole.VAULT_ACCESS_LEVEL,
      userRole.DRAWER_ACCESS_LEVEL,
      userRole.TXN_ENQUIRY_ACCESS_LVL,
      userRole.REPORT_ACCESS_LEVEL,
      userRole.CUSTOMER_ACCESS_LEVEL,
      userRole.ACCOUNT_ACCESS_LEVEL,
      userRole.WF_ITEM_ACCESS_LEVEL,
    ].filter((value) => ["ALL BUSINESS UNIT", "PARENT BUSINESS UNIT STRUCTURE", "OWN BUSINESS UNIT"].includes(value));

    const accessibleBUs = await getAccessibleBusinessUnits(userPermissions, userRole.Business_Unit);

    return res.status(200).json({ success: true, businessUnits: accessibleBUs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      message: "Error fetching accessible business units",
      error: err.message,
    });
  }
});

// ✅ NEW: Get User's Combined Permissions
export const getUserCombinedPermissions = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  try {
    const userRole = await UserRole.findOne({ USER_ID: userId }).populate("permissions");

    if (!userRole) {
      return res.status(404).json({
        success: false,
        message: "UserRole not found for the specified USER_ID",
      });
    }

    let combinedPermissions = {};
    if (userRole.permissions && Array.isArray(userRole.permissions)) {
      userRole.permissions.forEach(permissionDoc => {
        if (permissionDoc && typeof permissionDoc === 'object') {
          Object.keys(permissionDoc).forEach(key => {
            if (Array.isArray(permissionDoc[key])) {
              if (!combinedPermissions[key]) {
                combinedPermissions[key] = [];
              }
              combinedPermissions[key] = [
                ...new Set([...combinedPermissions[key], ...permissionDoc[key]])
              ];
            }
          });
        }
      });
    }

    // Flatten all permissions for easy checking
    const allPermissions = Object.values(combinedPermissions).flat();

    return res.status(200).json({
      success: true,
      permissions: {
        combined: combinedPermissions,
        flat: allPermissions,
        roles: userRole.ROLE_NMS || userRole.USER_ROLE_IDS.map(roleId => 
          ROLE_MAPPING[String(roleId)]?.ROLE_NM || "Unknown Role"
        ),
      },
    });
  } catch (error) {
    console.error("Error fetching user combined permissions:", error);
    return res.status(500).json({
      success: false,
      message: "Error fetching user permissions",
      error: error.message,
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
  getAccessibleBUsForUser,
  getUserCombinedPermissions,
};