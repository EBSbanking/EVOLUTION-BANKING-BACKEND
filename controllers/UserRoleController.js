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

// Validate BU_ID
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


// Generate or find existing BU_ROLE_ID
async function generateBuRoleId(BU_ID, USER_ROLE_ID, session) {
  const normalizedRoleId = normalizeRoleId(USER_ROLE_ID);
  const BU_ROLE_ID = parseInt(`${BU_ID}${normalizedRoleId.padStart(3, "0")}`);
  
  // Check if permissions already exist for this role in this business unit
  const existingPermission = await Permissions.findOne({ BU_ROLE_ID }).session(session);
  
  if (existingPermission) {
    // Permissions already exist for this role in this business unit, reuse them
    console.log(`Reusing existing permissions for BU_ROLE_ID: ${BU_ROLE_ID}`);
    return { BU_ROLE_ID, existingPermission: existingPermission._id };
  }
  
  // No existing permissions, return the ID for new creation
  return { BU_ROLE_ID, existingPermission: null };
}

// Validate permissions array
function validatePermissions(permissions) {
  const validPermissions = Object.values(PERMISSIONS).flatMap(category => Object.values(category));
  return permissions.every(perm => validPermissions.includes(perm));
}

// Create User Role
// Create User Role
export const createUserRole = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      USER_ROLE_ID,
      Business_Unit,
      BU_ID,
      CREATED_BY,
      USER_ID,
      EFF_FROM_DT,
      DEF_ROLE_FG = "N",
      SUPERVISOR_FG = "N",
      WF_ITEM_ACCESS_LEVEL = "BU",
      REC_ST = "A",
      VAULT_ACCESS_LEVEL = "BU",
      DRAWER_ACCESS_LEVEL = "BU",
      TXN_ENQUIRY_ACCESS_LVL = "BU",
      REPORT_ACCESS_LEVEL = "BU",
      CUSTOMER_ACCESS_LEVEL = "BU",
      ACCOUNT_ACCESS_LEVEL = "BU",
      CUST_POSTING_ACCESS_LEVEL = "BU",
      GL_POSTING_ACCESS_LEVEL = "BU",
      FIXED_ASSET_ACCESS_LEVEL = "BU",
      LOAN_FEE_ACCESS_LEVEL = "BU",
      LOAN_OPERATIONS_ACCESS_LEVEL = "BU",
      PERMISSION_MANAGEMENT_ACCESS_LEVEL = "BU",
      SYSTEM_ADMIN_ACCESS_LEVEL = "BU",
      DASHBOARD_ACCESS_LEVEL = "BU",
      MULTI_CRNCY_FG = "N",
      ROLE_NM,
      DESCRIPTION,
      permissions = [],
    } = req.body;

    // Validate required fields
    if (!USER_ROLE_ID || !BU_ID || !Business_Unit || !CREATED_BY || !USER_ID || !EFF_FROM_DT || !ROLE_NM) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Missing required fields: USER_ROLE_ID, BU_ID, Business_Unit, CREATED_BY, USER_ID, EFF_FROM_DT, or ROLE_NM",
      });
    }

    // Normalize roleId
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

    // Validate Business Unit
    const businessUnitDoc = await validateAndFetchBusinessUnit(BU_ID, session);
    const validatedBusinessUnit = businessUnitDoc.BUSINESS_UNIT;

    // Validate User exists
    const userExists = await User.exists({ user_name: USER_ID }).session(session);
    if (!userExists) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: `USER_ID ${USER_ID} does not exist in Users collection.`,
      });
    }

    // Generate SYSUSER_ID
    const generatedSysUserId = await generateSysUserId(session);

    // Generate or find BU_ROLE_ID
    const { BU_ROLE_ID, existingPermission } = await generateBuRoleId(BU_ID, USER_ROLE_ID, session);

    // Handle Administrator permissions (USER_ROLE_ID: 1)
    let finalPermissions = permissions;
    if (parseInt(normalizedRoleId) === 1) {
      finalPermissions = Object.values(PERMISSIONS).flatMap(category => Object.values(category));
      logger.info(`Assigning all permissions to Administrator role (USER_ROLE_ID: 1)`, {
        permissionsCount: finalPermissions.length,
      });
    } else if (permissions.length > 0 && !validatePermissions(permissions)) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "Invalid permissions provided.",
      });
    }

    let permissionDocId;
    
    // If permissions already exist, use the existing permission document
    if (existingPermission) {
      permissionDocId = existingPermission;
      console.log(`Using existing permissions document: ${permissionDocId}`);
    } else {
      // Create new Permissions document
      const permissionDocData = {
        BU_ROLE_ID,
        ROLE_NAME: roleData.ROLE_NM,
        VAULT_ACCESS_LEVEL,
        DRAWER_ACCESS_LEVEL,
        TXN_ENQUIRY_ACCESS_LVL,
        REPORT_ACCESS_LEVEL,
        CUSTOMER_ACCESS_LEVEL,
        ACCOUNT_ACCESS_LEVEL,
        CUST_POSTING_ACCESS_LEVEL,
        GL_POSTING_ACCESS_LEVEL,
        FIXED_ASSET_ACCESS_LEVEL,
        LOAN_FEE_ACCESS_LEVEL,
        LOAN_OPERATIONS_ACCESS_LEVEL,
        PERMISSION_MANAGEMENT_ACCESS_LEVEL,
        SYSTEM_ADMIN_ACCESS_LEVEL,
        DASHBOARD_ACCESS_LEVEL,
        WF_ITEM_ACCESS_LEVEL,
        permissions: finalPermissions,
        DESCRIPTION: DESCRIPTION || `Permissions for ${roleData.ROLE_NM} in BU ${BU_ID}`,
        IS_ACTIVE: true,
      };

      const permissionDoc = new Permissions(permissionDocData);
      await permissionDoc.save({ session });
      permissionDocId = permissionDoc._id;
      console.log(`Created new permissions document: ${permissionDocId}`);
    }

    // Prevent duplicates - check if user already has this role in this business unit
    const existingUserRole = await UserRole.findOne({
      USER_ID,
      USER_ROLE_ID: normalizedRoleId,
      BU_ID,
    }).session(session);
    
    if (existingUserRole) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: "User already has this role assigned in this business unit.",
      });
    }

    // Save UserRole
    const userRole = new UserRole({
      USER_ID,
      SYSUSER_ID: generatedSysUserId,
      USER_ROLE_ID: normalizedRoleId,
      ROLE_NM: ROLE_NM || roleData.ROLE_NM,
      Business_Unit: validatedBusinessUnit,
      BU_ID,
      CREATED_BY,
      EFF_FROM_DT: new Date(EFF_FROM_DT),
      DEF_ROLE_FG,
      SUPERVISOR_FG,
      WF_ITEM_ACCESS_LEVEL,
      REC_ST,
      VAULT_ACCESS_LEVEL,
      DRAWER_ACCESS_LEVEL,
      TXN_ENQUIRY_ACCESS_LVL,
      REPORT_ACCESS_LEVEL,
      CUSTOMER_ACCESS_LEVEL,
      ACCOUNT_ACCESS_LEVEL,
      CUST_POSTING_ACCESS_LEVEL,
      GL_POSTING_ACCESS_LEVEL,
      FIXED_ASSET_ACCESS_LEVEL,
      LOAN_FEE_ACCESS_LEVEL,
      LOAN_OPERATIONS_ACCESS_LEVEL,
      PERMISSION_MANAGEMENT_ACCESS_LEVEL,
      SYSTEM_ADMIN_ACCESS_LEVEL,
      DASHBOARD_ACCESS_LEVEL,
      MULTI_CRNCY_FG,
      permissions: permissionDocId, // Use either existing or new permissions document
    });

    await userRole.save({ session });

    await session.commitTransaction();
    logger.info(`User role created successfully for USER_ID: ${USER_ID}, BU_ROLE_ID: ${BU_ROLE_ID}`, {
      permissions: finalPermissions,
      usedExistingPermissions: !!existingPermission,
    });

    return res.status(200).json({
      success: true,
      message: "User role created successfully.",
      data: {
        ROLE_NM: userRole.ROLE_NM,
        USER_ROLE_ID: normalizedRoleId,
        SYSUSER_ID: generatedSysUserId,
        BU_ROLE_ID,
        permissions: finalPermissions,
        usedExistingPermissions: !!existingPermission,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Error creating user role:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create user role.",
      error: error.message,
    });
  } finally {
    session.endSession();
  }
};

// ✅ Create Customer Service Officer
export const createCustomerServiceOfficer = async (req, res) => {
  try {
    const {
      USER_ID,
      USER_ROLE_ID,
      EFF_FROM_DT,
      DEF_ROLE_FG,
      SUPERVISOR_FG,
      WF_ITEM_ACCESS_LEVEL,
      REC_ST,
      VAULT_ACCESS_LEVEL,
      DRAWER_ACCESS_LEVEL,
      TXN_ENQUIRY_ACCESS_LVL,
      REPORT_ACCESS_LEVEL,
      BU_ID,
      CREATED_BY,
    } = req.body;

    // ✅ Normalize roleId
    const normalizedRoleId = normalizeRoleId(USER_ROLE_ID);
    if (!normalizedRoleId) {
      return res.status(400).json({
        success: false,
        message: `Invalid USER_ROLE_ID provided: ${USER_ROLE_ID}`,
      });
    }

    const roleData = ROLE_MAPPING[normalizedRoleId];

    if (!roleData || roleData.ROLE_NM !== "Customer Service Officer") {
      return res.status(400).json({
        success: false,
        message: "Invalid role ID for Customer Service Officer.",
      });
    }

    // Validate Business Unit
    const businessUnitDoc = await validateAndFetchBusinessUnit(BU_ID);
    const Business_Unit = businessUnitDoc.BUSINESS_UNIT;

    // Validate User exists
    const userExists = await User.exists({ user_name: USER_ID });
    if (!userExists) {
      return res.status(400).json({
        success: false,
        message: `USER_ID ${USER_ID} does not exist in Users collection.`,
      });
    }

    const SYSUSER_ID = await generateSysUserId();

    // BU_ROLE_ID (Business Unit + RoleId)
    const BU_ROLE_ID = parseInt(`${BU_ID}${normalizedRoleId.padStart(3, "0")}`);

    // Ensure permissions exist
    const existingPermissions = await Permissions.findOne({ BU_ROLE_ID });
    if (!existingPermissions) {
      return res.status(400).json({
        success: false,
        message: `Permissions for role ${roleData.ROLE_NM} in business unit ${BU_ID} not found.`,
        expected_BU_ROLE_ID: BU_ROLE_ID,
      });
    }

    // Prevent duplicates
    const existingUserRole = await UserRole.findOne({
      USER_ID,
      USER_ROLE_ID: normalizedRoleId,
      BU_ID,
    });

    if (existingUserRole) {
      return res.status(400).json({
        success: false,
        message: "User already has this role assigned in this business unit.",
      });
    }

    // Create new user role
    const newUserRole = new UserRole({
      USER_ID,
      SYSUSER_ID,
      USER_ROLE_ID: normalizedRoleId,
      ROLE_NM: roleData.ROLE_NM,
      EFF_FROM_DT,
      DEF_ROLE_FG,
      SUPERVISOR_FG,
      WF_ITEM_ACCESS_LEVEL,
      REC_ST,
      VAULT_ACCESS_LEVEL,
      DRAWER_ACCESS_LEVEL,
      TXN_ENQUIRY_ACCESS_LVL,
      REPORT_ACCESS_LEVEL,
      Business_Unit,
      BU_ID,
      CREATED_BY,
      permissions: existingPermissions._id,
    });

    await newUserRole.save();

    return res.status(200).json({
      success: true,
      message: "Customer Service Officer role created successfully.",
      SYSUSER_ID,
      BU_ROLE_ID,
      permissions_id: existingPermissions._id,
    });
  } catch (error) {
    console.error("Error creating Customer Service Officer role:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create Customer Service Officer role.",
      error: error.message,
    });
  }
};


// Update User Role
export const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.params;
    const {
      USER_ROLE_ID,
      BU_ID,
      Business_Unit,
      ...updateData
    } = req.body;

    // Validate user exists
    const userExists = await User.exists({ user_name: userId });
    if (!userExists) {
      return res.status(400).json({
        success: false,
        message: `USER_ID ${userId} does not exist in Users collection.`,
      });
    }

    // Normalize roleId
    const normalizedRoleId = normalizeRoleId(USER_ROLE_ID);
    if (!normalizedRoleId) {
      return res.status(400).json({
        success: false,
        message: `Invalid USER_ROLE_ID provided: ${USER_ROLE_ID}`,
      });
    }

    const roleData = ROLE_MAPPING[normalizedRoleId];
    if (!roleData) {
      return res.status(400).json({
        success: false,
        message: `Role ID ${USER_ROLE_ID} not found in ROLE_MAPPING.`,
      });
    }

    // Validate Business Unit if provided
    let validatedBusinessUnit = Business_Unit;
    if (BU_ID) {
      const businessUnitDoc = await validateAndFetchBusinessUnit(BU_ID);
      validatedBusinessUnit = businessUnitDoc.BUSINESS_UNIT;
    }

    // Update or create if not exists
    const updatedUserRole = await UserRole.findOneAndUpdate(
      { USER_ID: userId, USER_ROLE_ID: normalizedRoleId, BU_ID },
      {
        ...updateData,
        ROLE_NM: roleData.ROLE_NM,
        Business_Unit: validatedBusinessUnit,
        USER_ROLE_ID: normalizedRoleId,
        BU_ID,
      },
      { new: true, upsert: true }
    ).populate("permissions");

    return res.status(200).json({
      success: true,
      message: "User role updated successfully.",
      userRole: updatedUserRole,
    });
  } catch (error) {
    console.error("Error updating UserRole:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to update UserRole.",
      error: error.message,
    });
  }
};

// Get Customer Service Officer by USER_ID
export const getCustomerServiceOfficerByUserId = async (req, res) => {
  try {
    const { userId } = req.params;

    const officer = await UserRole.findOne({ USER_ID: userId })
      .populate("permissions");

    if (!officer || ROLE_MAPPING[officer.USER_ROLE_ID]?.ROLE_NM !== "Customer Service Officer") {
      return res.status(404).json({
        success: false,
        message: `No Customer Service Officer found with USER_ID: ${userId}`,
      });
    }

    return res.status(200).json({
      success: true,
      officer,
    });
  } catch (error) {
    console.error("Error fetching Customer Service Officer:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch Customer Service Officer.",
      error: error.message,
    });
  }
};

// Fetch All Roles
export const getAllUserRoles = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  try {
    const userRoles = await UserRole.find()
      .populate("permissions")
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    const updatedRoles = userRoles.map((role) => ({
      ...role,
      ROLE_NAME: ROLE_MAPPING[String(role.USER_ROLE_ID)]?.ROLE_NM || "Unknown Role",
    }));

    const totalRoles = await UserRole.countDocuments();

    return res.status(200).json({
      success: true,
      total: totalRoles,
      currentPage: Number(page),
      totalPages: Math.ceil(totalRoles / limit),
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
};

// Get User Role by USER_ID
export const getUserRoleByUserId = async (req, res) => {
  const { userId } = req.params;

  try {
    const userRole = await UserRole.findOne({ USER_ID: userId }).populate("permissions");

    if (!userRole) {
      return res.status(404).json({
        success: false,
        message: "UserRole not found for the specified USER_ID",
      });
    }

    const roleName = ROLE_MAPPING[String(userRole.USER_ROLE_ID)]?.ROLE_NM || "Unknown Role";

    return res.status(200).json({
      success: true,
      userRole: {
        ...userRole._doc,
        ROLE_NAME: roleName,
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
};

// Delete User Role by ID
export const deleteUserRole = async (req, res) => {
  const { userRoleId } = req.params;

  try {
    const deletedUserRole = await UserRole.findByIdAndDelete(userRoleId);

    if (!deletedUserRole) {
      return res.status(404).json({
        success: false,
        message: "UserRole not found",
      });
    }

    // Optionally delete associated permissions
    if (deletedUserRole.permissions) {
      await Permissions.findByIdAndDelete(deletedUserRole.permissions);
    }

    return res.status(200).json({
      success: true,
      message: "UserRole deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting UserRole:", error);
    return res.status(500).json({
      success: false,
      message: "Error deleting UserRole",
      error: error.message,
    });
  }
};

// Accessible BUs by User
export const getAccessibleBUsForUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const userRole = await UserRole.findOne({ USER_ID: userId }).populate("permissions");

    if (!userRole || !userRole.permissions) {
      return res.status(404).json({ success: false, message: "User role or permissions not found." });
    }

    const userPermissions = [
      userRole.permissions.VAULT_ACCESS_LEVEL,
      userRole.permissions.DRAWER_ACCESS_LEVEL,
      userRole.permissions.TXN_ENQUIRY_ACCESS_LVL,
      userRole.permissions.REPORT_ACCESS_LEVEL,
      userRole.permissions.CUSTOMER_ACCESS_LEVEL,
      userRole.permissions.ACCOUNT_ACCESS_LEVEL,
      userRole.permissions.WF_ITEM_ACCESS_LEVEL,
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
};