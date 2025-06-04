import UserRole from "../models/UserRole.js";
import Permissions from "../models/Permissions.js";
import mongoose from "mongoose";
import BusinessUnit from "../models/BusinessUnit.js";
import { ROLE_MAPPING } from '../constants/roleMapping.js'; // Import ROLE_MAPPING

// Example usage of ROLE_MAPPING
const assignUserRole = (roleId) => {
  const roleData = ROLE_MAPPING[roleId];
  if (!roleData) {
    throw new Error('Invalid Role ID');
  }
  return roleData;
};

// Function to validate and fetch the business unit for a specific role
async function validateAndFetchBusinessUnit(BU_ID) {
  const businessUnit = await BusinessUnit.findOne({ BU_ID });
  if (!businessUnit) {
    throw new Error("Invalid Business Unit provided.");
  }
  return businessUnit;
}

// Function to create Customer Service Officer Role
export const createCustomerServiceOfficer = async (req, res) => {
  try {
    const {
      USER_ID,
      SYSUSER_ID,
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
      Business_Unit,
    } = req.body;

    // Validate Business Unit
    const businessUnit = await BusinessUnit.findOne({ BU_ID: Business_Unit });
    if (!businessUnit) {
      return res.status(400).json({
        success: false,
        message: "Invalid Business Unit provided.",
      });
    }

    // Validate role ID and mapping
    const roleData = ROLE_MAPPING[USER_ROLE_ID];
    if (!roleData || roleData.ROLE_NM !== "Customer Service Officer") {
      return res.status(400).json({
        success: false,
        message: "Invalid role ID for Customer Service Officer.",
      });
    }

    const businessUnitName = await roleData.getBusinessUnit();
    if (!businessUnitName) {
      return res.status(400).json({
        success: false,
        message: "Business Unit not found.",
      });
    }

    // Create new UserRole
    const newUserRole = new UserRole({
      USER_ID,
      SYSUSER_ID,
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
      Business_Unit,
    });

    await newUserRole.save();

    return res.status(200).json({
      success: true,
      message: "Customer Service Officer role created successfully.",
    });
  } catch (error) {
    console.error("Error creating Customer Service Officer role:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create Customer Service Officer role.",
    });
  }
};


// Function to create UserRole dynamically
export const createUserRole = async (req, res) => {
  try {
    const { USER_ROLE_ID, Business_Unit, CREATED_BY, ...otherFields } = req.body;

    // Validate the role ID using ROLE_MAPPING
    const roleData = ROLE_MAPPING[USER_ROLE_ID];
    if (!roleData) {
      return res.status(400).json({ success: false, message: "Invalid ROLE_ID provided" });
    }

    // Check if the role name in ROLE_MAPPING corresponds to the expected role
    if (!roleData.ROLE_NM) {
      return res.status(400).json({ success: false, message: "Role name not found in ROLE_MAPPING" });
    }

    // Validate Business Unit
    const businessUnit = await BusinessUnit.findOne({ BU_ID: Business_Unit });
    if (!businessUnit) {
      return res.status(400).json({ success: false, message: "Invalid Business Unit provided." });
    }

    console.log("Role and Business Unit validated successfully.");

    // Create a new UserRole document
    const userRole = new UserRole({
      USER_ROLE_ID,
      Business_Unit,
      CREATED_BY,
      ...otherFields,
    });

    // Save the UserRole document to the database
    await userRole.save();

    // Return a success response
    return res.status(200).json({ success: true, message: "User role created successfully." });
  } catch (error) {
    console.error("Error creating user role:", error);
    return res.status(500).json({ success: false, message: "Failed to create user role." });
  }
};

// Function to fetch UserRoles
export const getAllUserRoles = async (req, res) => {
  const { page = 1, limit = 10 } = req.query;

  try {
    const userRoles = await UserRole.find()
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean(); // Use lean for better performance

    const updatedRoles = userRoles.map((role) => ({
      ...role,
      BU_ROLE_ID: ROLE_MAPPING[role.USER_ROLE_ID]?.ROLE_NM || "Unknown Role",
    }));

    const totalRoles = await UserRole.countDocuments();

    return res.status(200).json({
      success: true,
      total: totalRoles,
      currentPage: page,
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

// Function to fetch UserRole by USER_ID
export const getUserRoleByUserId = async (req, res) => {
  const { userId } = req.params;

  try {
    const userRole = await UserRole.findOne({ USER_ID: userId });

    if (!userRole) {
      return res.status(404).json({
        success: false,
        message: "UserRole not found for the specified USER_ID",
      });
    }

    const roleName = ROLE_MAPPING[userRole.USER_ROLE_ID]?.ROLE_NM || "Unknown Role";

    return res.status(200).json({
      success: true,
      userRole: { ...userRole._doc, USER_ROLE_ID: roleName },
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

// Function to delete a UserRole by ID
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
