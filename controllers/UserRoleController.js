import mongoose from "mongoose";
import UserRole from "../models/UserRole.js";
import BusinessUnit from "../models/BusinessUnit.js";
import Permissions from "../models/Permissions.js";
import { ROLE_MAPPING } from "../constants/roleMapping.js";
import { isBUAccessible, getAccessibleBusinessUnits } from "../utils/businessUnitUtils.js";
import User from "../models/User.js";

// ✅ Validate BU_ID
async function validateAndFetchBusinessUnit(BU_ID) {
  const businessUnit = await BusinessUnit.findOne({ BU_ID });
  if (!businessUnit) {
    throw new Error("Invalid Business Unit provided.");
  }
  return businessUnit;
}

// ✅ Generate SYSUSER_ID
async function generateSysUserId() {
  const lastEntry = await UserRole.findOne({})
    .sort({ SYSUSER_ID: -1 })
    .limit(1)
    .lean();

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

    const normalizedRoleId = String(USER_ROLE_ID);
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

    // Validate User exists by correct field (assuming user_name)
    const userExists = await User.exists({ user_name: USER_ID });
    if (!userExists) {
      return res.status(400).json({
        success: false,
        message: `USER_ID ${USER_ID} does not exist in Users collection.`,
      });
    }

    const SYSUSER_ID = await generateSysUserId();

    const permissions = new Permissions(roleData.permissions);
    await permissions.save();

    const newUserRole = new UserRole({
      USER_ID,
      SYSUSER_ID,
      USER_ROLE_ID: normalizedRoleId,
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
      permissions: permissions._id,
    });

    await newUserRole.save();

    return res.status(200).json({
      success: true,
      message: "Customer Service Officer role created successfully.",
      SYSUSER_ID,
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

// ✅ Generic Role Creation
export const createUserRole = async (req, res) => {
  try {
    const {
      USER_ROLE_ID,
      Business_Unit,
      BU_ID,
      CREATED_BY,
      USER_ID,
      SYSUSER_ID, // Ignore this from client, generate internally
      ...otherFields
    } = req.body;

    // Validate user exists by the correct field (assuming user_name)
    const userExists = await User.exists({ user_name: USER_ID });
    if (!userExists) {
      return res.status(400).json({
        success: false,
        message: `USER_ID ${USER_ID} does not exist in Users collection.`,
      });
    }

    const normalizedRoleId = parseInt(USER_ROLE_ID);
    const roleData = ROLE_MAPPING[normalizedRoleId];

    if (!roleData) {
      return res.status(400).json({
        success: false,
        message: `Invalid ROLE_ID provided: ${USER_ROLE_ID}`,
      });
    }

    // Validate Business Unit
    await validateAndFetchBusinessUnit(BU_ID);

    // Generate SYSUSER_ID internally
    const generatedSysUserId = await generateSysUserId();

    // Save permissions
    const permissions = new Permissions({ BU_ROLE_ID: normalizedRoleId });
    await permissions.save();

    // Create UserRole
    const userRole = new UserRole({
      USER_ID,
      SYSUSER_ID: generatedSysUserId,
      USER_ROLE_ID: normalizedRoleId,
      BU_ROLE_ID: normalizedRoleId,
      ROLE_NM: roleData.ROLE_NM,
      Business_Unit,
      BU_ID,
      CREATED_BY,
      permissions: permissions._id,
      ...otherFields,
    });

    await userRole.save();

    return res.status(200).json({
      success: true,
      message: "User role created successfully.",
      data: {
        ROLE_NM: roleData.ROLE_NM,
        USER_ROLE_ID: normalizedRoleId,
        SYSUSER_ID: generatedSysUserId,
      },
    });
  } catch (error) {
    console.error("Error creating user role:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create user role.",
      error: error.message,
    });
  }
};

// ✅ Fetch All Roles
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

// ✅ Get User Role by USER_ID
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

// ✅ Delete User Role by ID
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

// ✅ Accessible BUs by User
export const getAccessibleBUsForUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const userRole = await UserRole.findOne({ USER_ID: userId }).populate("permissions");

    if (!userRole || !userRole.permissions) {
      return res.status(404).json({ success: false, message: "User role or permissions not found." });
    }

    const userPermissions = Object.values(userRole.permissions).filter((value) =>
      ["ALL BUSINESS UNIT", "PARENT BUSINESS UNIT STRUCTURE", "OWN BUSINESS UNIT"].includes(value)
    );

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
