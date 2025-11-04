// src/controllers/businessRoleController.js
import mongoose from 'mongoose';
import BusinessRole from '../models/BusinessRole.js';
import User from '../models/User.js';
import BusinessUnit from '../models/BusinessUnit.js';
import UserRole from '../models/UserRole.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';
import { isBUAccessible, getAccessibleBusinessUnits } from "../utils/businessUnitUtils.js";

// Create BusinessRole — full flow with authorization, validation, and workflow access
export const createBusinessRole = async (req, res) => {
  try {
    const {
      ROLE_NM,
      REC_ST,
      VERSION_NO,
      USER_ID,
      ROLE_ID,
      BUSINESS_UNIT,
      BU_ID,
      SUPERVISOR_FG,
      ALLOW_TXN_POSTING_FG = 'N',
      WF_ITEM_ACCESS_LEVEL = ''
    } = req.body;

    // 1. VERIFY ADMIN PRIVILEGES (uncomment if using req.user from middleware)
    // if (!req.user?.isAdmin) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Administrator privileges required'
    //   });
    // }

    // 2. VALIDATE REQUIRED FIELDS
    const requiredFields = { ROLE_NM, ROLE_ID, USER_ID, BUSINESS_UNIT, BU_ID };
    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value)
      .map(([field]) => field);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        missingFields
      });
    }

    // 3. VERIFY ROLE_ID AND ROLE_NM MATCH
    const roleMapping = ROLE_MAPPING[ROLE_ID];
    if (!roleMapping || roleMapping.ROLE_NM.toUpperCase() !== ROLE_NM.toUpperCase()) {
      return res.status(400).json({
        success: false,
        message: 'Role ID and Role Name mismatch',
        expectedRoleName: roleMapping?.ROLE_NM || 'Unknown Role ID'
      });
    }

    // 4. CHECK FOR DUPLICATES
    const existingRole = await BusinessRole.findOne({
      $or: [
        { ROLE_ID, USER_ID },
        { ROLE_NM, USER_ID, BUSINESS_UNIT }
      ]
    });

    if (existingRole) {
      return res.status(409).json({
        success: false,
        message: 'Role assignment already exists'
      });
    }

    // 5. CREATE NEW ROLE
    const newRole = new BusinessRole({
      ROLE_NM: roleMapping.ROLE_NM, // canonical name from mapping
      ROLE_ID,
      USER_ID,
      BUSINESS_UNIT,
      BU_ID,
      REC_ST: REC_ST?.toUpperCase() === 'ACTIVE' ? 'Active' : 'Inactive',
      VERSION_NO: VERSION_NO || 1,
      SUPERVISOR_FG: SUPERVISOR_FG?.toUpperCase() === 'Y' ? 'Y' : 'N',
      ALLOW_TXN_POSTING_FG: ALLOW_TXN_POSTING_FG.toUpperCase() === 'Y' ? 'Y' : 'N',
      WF_ITEM_ACCESS_LEVEL, // workflow access level
      CREATED_BY: req.user?.user_name || 'system', // Fallback if no user
      CREATED_BY_ROLE: req.user?.role || 'system',
      CREATE_DT: new Date(),
      ROW_TS: new Date()
    });

    await newRole.save();

    // 6. SUCCESS RESPONSE
    return res.status(201).json({
      success: true,
      data: {
        id: newRole._id,
        role: newRole.ROLE_NM,
        user: newRole.USER_ID,
        businessUnit: newRole.BUSINESS_UNIT,
        permissions: {
          isSupervisor: newRole.SUPERVISOR_FG,
          canPostTransactions: newRole.ALLOW_TXN_POSTING_FG,
          workflowAccess: newRole.WF_ITEM_ACCESS_LEVEL
        }
      }
    });

  } catch (error) {
    console.error('Role Creation Error:', error);

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message
        }))
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error'
    });
  }
};

// Get BusinessRole by User ID
export const getBusinessRoleByUserId = async (req, res) => {
  try {
    const { USER_ID } = req.params;

    const businessRole = await BusinessRole.findOne({ USER_ID });

    if (!businessRole) {
      return res.status(404).json({ 
        message: 'BusinessRole not found for this USER_ID',
        USER_ID 
      });
    }

    res.status(200).json({ 
      message: 'BusinessRole retrieved successfully', 
      data: businessRole 
    });
  } catch (error) {
    console.error('Error fetching BusinessRole:', error);
    res.status(500).json({ 
      message: 'Error fetching BusinessRole', 
      error: error.message 
    });
  }
};

// Update a BusinessRole by USER_ID (note: param is USER_ID, not _id)
export const updateBusinessRole = async (req, res) => {
  try {
    const { USER_ID } = req.params;
    const updateData = req.body;

    // Verify admin privileges (uncomment if using req.user)
    // if (!req.user.isAdmin) {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Administrator privileges required',
    //     solution: 'Contact your system administrator',
    //     yourRole: req.user.role
    //   });
    // }

    // Validate ROLE_ID if provided
    if (updateData.ROLE_ID && !ROLE_MAPPING[updateData.ROLE_ID]) {
      return res.status(400).json({
        success: false,
        message: 'Invalid Role ID',
        validRoles: Object.entries(ROLE_MAPPING).map(([id, role]) => ({
          id: Number(id),
          name: role.ROLE_NM
        }))
      });
    }

    // If updating ROLE_ID without ROLE_NM, auto-fill ROLE_NM
    if (updateData.ROLE_ID && !updateData.ROLE_NM) {
      updateData.ROLE_NM = ROLE_MAPPING[updateData.ROLE_ID].ROLE_NM;
    }

    // If updating ROLE_NM without ROLE_ID, find matching ROLE_ID
    if (updateData.ROLE_NM && !updateData.ROLE_ID) {
      const matchingKey = Object.keys(ROLE_MAPPING).find(key => ROLE_MAPPING[key].ROLE_NM === updateData.ROLE_NM);
      if (!matchingKey) {
        return res.status(400).json({
          success: false,
          message: 'Invalid Role Name',
          validRoles: Object.values(ROLE_MAPPING).map(role => role.ROLE_NM)
        });
      }
      updateData.ROLE_ID = matchingKey;
    }

    // Perform the update
    const updatedRole = await BusinessRole.findOneAndUpdate(
      { USER_ID },
      {
        ...updateData,
        LAST_UPDATED_BY: req.user?.user_name || 'system',
        LAST_UPDATED_DT: new Date(),
        ROW_TS: new Date()
      },
      { 
        new: true,
        runValidators: true,
        context: 'query'
      }
    );

    if (!updatedRole) {
      return res.status(404).json({
        success: false,
        message: 'Business role not found',
        USER_ID
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Business role updated successfully',
      data: {
        roleId: updatedRole._id,
        roleName: updatedRole.ROLE_NM,
        businessUnit: updatedRole.BUSINESS_UNIT,
        userId: updatedRole.USER_ID,
        status: updatedRole.REC_ST
      }
    });

  } catch (error) {
    console.error('Business Role Update Error:', error);

    if (error.name === 'ValidationError') {
      const errors = {};
      Object.keys(error.errors).forEach(key => {
        errors[key] = {
          message: error.errors[key].message,
          value: error.errors[key].value
        };
      });
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      referenceId: `ERR-${Date.now()}`
    });
  }
};

// Delete a BusinessRole by _id
export const deleteBusinessRole = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify user has permission to delete (uncomment if using req.user)
    // if (!req.user.isAdmin) {
    //   return res.status(403).json({
    //     message: 'Only Administrators can delete BusinessRoles'
    //   });
    // }

    const deletedBusinessRole = await BusinessRole.findByIdAndDelete(id);

    if (!deletedBusinessRole) {
      return res.status(404).json({ 
        message: 'BusinessRole not found',
        id 
      });
    }

    res.status(200).json({ 
      message: 'BusinessRole deleted successfully',
      deletedRole: deletedBusinessRole.ROLE_NM
    });
  } catch (error) {
    console.error('Error deleting BusinessRole:', error);
    res.status(500).json({ 
      message: 'Error deleting BusinessRole', 
      error: error.message 
    });
  }
};

// Assign BusinessRole to User
export const assignBusinessRoleToUser = async (req, res) => {
  try {
    const { USER_ID, ROLE_NM } = req.body;

    // Verify user has permission to assign roles (uncomment if using req.user)
    // if (!req.user.isAdmin) {
    //   return res.status(403).json({
    //     message: 'Only Administrators can assign roles'
    //   });
    // }

    const [user, role] = await Promise.all([
      User.findOne({ USER_ID }),
      BusinessRole.findOne({ ROLE_NM })
    ]);

    if (!user) {
      return res.status(404).json({ 
        message: 'User not found',
        USER_ID 
      });
    }

    if (!role) {
      return res.status(404).json({ 
        message: 'Business Role not found',
        ROLE_NM 
      });
    }

    if (user.roles && user.roles.includes(role._id)) {
      return res.status(400).json({ 
        message: 'Role is already assigned to this user',
        USER_ID,
        ROLE_NM
      });
    }

    user.roles = [...(user.roles || []), role._id];
    await user.save();

    res.status(200).json({ 
      message: 'Business Role assigned to user successfully', 
      data: { 
        USER_ID, 
        ROLE_NM,
        assignedBy: req.user?.user_name || 'system',
        assignmentDate: new Date()
      } 
    });
  } catch (error) {
    console.error('Error assigning role:', error);
    res.status(500).json({ 
      message: 'Error assigning role', 
      error: error.message 
    });
  }
};

// Get all BusinessRoles (with pagination/filtering)
export const getAllBusinessRoles = async (req, res) => {
  try {
    const { page = 1, limit = 10, businessUnit } = req.query;
    const query = businessUnit ? { BUSINESS_UNIT: businessUnit } : {};

    const businessRoles = await BusinessRole.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ CREATE_DT: -1 });

    const count = await BusinessRole.countDocuments(query);

    res.status(200).json({ 
      message: 'BusinessRoles retrieved successfully', 
      data: businessRoles,
      meta: {
        total: count,
        pages: Math.ceil(count / limit),
        currentPage: page
      }
    });
  } catch (error) {
    console.error('Error fetching BusinessRoles:', error);
    res.status(500).json({ 
      message: 'Error fetching BusinessRoles', 
      error: error.message 
    });
  }
};

// Helper function for duplicate key messages (if needed elsewhere)
export function getDuplicateKeyMessage(error) {
  if (error.keyPattern?.USER_ID) {
    return 'User already has a business role assigned';
  }
  if (error.keyPattern?.ROLE_ID) {
    return 'Role ID already exists';
  }
  if (error.keyPattern?.BUSINESS_UNIT) {
    return 'Business unit already assigned';
  }
  return 'Duplicate key violation';
}