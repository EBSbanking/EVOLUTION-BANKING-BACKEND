// src/controllers/businessRoleController.js
import mongoose from 'mongoose';
import BusinessRole from '../models/BusinessRole.js';
import User from '../models/User.js';
import BusinessUnit from '../models/BusinessUnit.js';
import Branch from '../models/Branch.js';
import UserRole from '../models/UserRole.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';
import { isBUAccessible, getAccessibleBusinessUnits } from "../utils/businessUnitUtils.js";

// Create BusinessRole — full flow with branch integration
export const createBusinessRole = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
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

    // 1. VALIDATE REQUIRED FIELDS
    const requiredFields = { ROLE_NM, ROLE_ID, USER_ID };
    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value)
      .map(([field]) => field);

    if (missingFields.length > 0) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        missingFields
      });
    }

    // 2. VERIFY ROLE_ID AND ROLE_NM MATCH
    const roleMapping = ROLE_MAPPING[ROLE_ID];
    if (!roleMapping || roleMapping.ROLE_NM.toUpperCase() !== ROLE_NM.toUpperCase()) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Role ID and Role Name mismatch',
        expectedRoleName: roleMapping?.ROLE_NM || 'Unknown Role ID'
      });
    }

    // 3. ✅ RESOLVE BRANCH/BUSINESS UNIT RELATIONSHIP
    let finalBusinessUnit = BUSINESS_UNIT;
    let finalBU_ID = BU_ID;
    let branchReference = null;

    if (BU_ID) {
      const branch = await Branch.findOne({ branchCode: BU_ID }).session(session);
      if (!branch) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: `Branch with code ${BU_ID} not found`
        });
      }

      const businessUnit = await BusinessUnit.findOne({ 
        BU_ID: BU_ID,
        branch: branch._id 
      }).session(session);

      if (!businessUnit) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: `Business Unit not found for branch ${BU_ID}`
        });
      }

      finalBusinessUnit = businessUnit.BUSINESS_UNIT || branch.branchName;
      finalBU_ID = businessUnit.BU_ID;
      branchReference = branch._id;
    } else if (BUSINESS_UNIT) {
      const businessUnit = await BusinessUnit.findOne({ 
        BUSINESS_UNIT: new RegExp(BUSINESS_UNIT, 'i') 
      }).session(session);
      
      if (!businessUnit) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: `Business Unit "${BUSINESS_UNIT}" not found`
        });
      }

      const branch = await Branch.findById(businessUnit.branch).session(session);
      if (!branch) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: `Branch not found for business unit ${BUSINESS_UNIT}`
        });
      }

      finalBusinessUnit = businessUnit.BUSINESS_UNIT;
      finalBU_ID = businessUnit.BU_ID;
      branchReference = branch._id;
    } else {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Either BUSINESS_UNIT or BU_ID (branch code) is required'
      });
    }

    // 4. CHECK FOR DUPLICATES
    const existingRole = await BusinessRole.findOne({
      $or: [
        { ROLE_ID, USER_ID, BU_ID: finalBU_ID },
        { ROLE_NM, USER_ID, BUSINESS_UNIT: finalBusinessUnit }
      ]
    }).session(session);

    if (existingRole) {
      await session.abortTransaction();
      return res.status(409).json({
        success: false,
        message: 'Role assignment already exists for this user and branch'
      });
    }

    // 5. CREATE NEW ROLE
    const newRole = new BusinessRole({
      ROLE_NM: roleMapping.ROLE_NM,
      ROLE_ID,
      USER_ID,
      BUSINESS_UNIT: finalBusinessUnit,
      BU_ID: finalBU_ID,
      BRANCH_REF: branchReference,
      REC_ST: REC_ST?.toUpperCase() === 'ACTIVE' ? 'Active' : 'Inactive',
      VERSION_NO: VERSION_NO || 1,
      SUPERVISOR_FG: SUPERVISOR_FG?.toUpperCase() === 'Y' ? 'Y' : 'N',
      ALLOW_TXN_POSTING_FG: ALLOW_TXN_POSTING_FG.toUpperCase() === 'Y' ? 'Y' : 'N',
      WF_ITEM_ACCESS_LEVEL,
      CREATED_BY: req.user?.user_name || 'system',
      CREATED_BY_ROLE: req.user?.role || 'system',
      CREATE_DT: new Date(),
      ROW_TS: new Date()
    });

    await newRole.save({ session });

    // 6. POPULATE BRANCH INFO FOR RESPONSE
    const populatedRole = await BusinessRole.findById(newRole._id)
      .populate('BRANCH_REF', 'branchName branchCode organizationName organizationCode address status');

    await session.commitTransaction();

    // 7. SUCCESS RESPONSE
    return res.status(201).json({
      success: true,
      data: {
        id: populatedRole._id,
        role: populatedRole.ROLE_NM,
        user: populatedRole.USER_ID,
        businessUnit: populatedRole.BUSINESS_UNIT,
        buId: populatedRole.BU_ID,
        branch: populatedRole.BRANCH_REF ? {
          name: populatedRole.BRANCH_REF.branchName,
          code: populatedRole.BRANCH_REF.branchCode,
          organization: populatedRole.BRANCH_REF.organizationName,
          address: populatedRole.BRANCH_REF.address,
          status: populatedRole.BRANCH_REF.status
        } : null,
        permissions: {
          isSupervisor: populatedRole.SUPERVISOR_FG,
          canPostTransactions: populatedRole.ALLOW_TXN_POSTING_FG,
          workflowAccess: populatedRole.WF_ITEM_ACCESS_LEVEL
        }
      }
    });

  } catch (error) {
    await session.abortTransaction();
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
  } finally {
    session.endSession();
  }
};

// Get BusinessRole by User ID
export const getBusinessRoleByUserId = async (req, res) => {
  try {
    const { USER_ID } = req.params;

    const businessRole = await BusinessRole.findOne({ USER_ID })
      .populate('BRANCH_REF', 'branchName branchCode organizationName organizationCode address status branchType');

    if (!businessRole) {
      return res.status(404).json({ 
        success: false,
        message: 'BusinessRole not found for this USER_ID',
        USER_ID 
      });
    }

    res.status(200).json({ 
      success: true,
      message: 'BusinessRole retrieved successfully', 
      data: businessRole 
    });
  } catch (error) {
    console.error('Error fetching BusinessRole:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching BusinessRole', 
      error: error.message 
    });
  }
};

// Update a BusinessRole by USER_ID
export const updateBusinessRole = async (req, res) => {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction();
    
    const { USER_ID } = req.params;
    const updateData = req.body;

    if (updateData.ROLE_ID && !ROLE_MAPPING[updateData.ROLE_ID]) {
      await session.abortTransaction();
      return res.status(400).json({
        success: false,
        message: 'Invalid Role ID',
        validRoles: Object.entries(ROLE_MAPPING).map(([id, role]) => ({
          id: Number(id),
          name: role.ROLE_NM
        }))
      });
    }

    if (updateData.ROLE_ID && !updateData.ROLE_NM) {
      updateData.ROLE_NM = ROLE_MAPPING[updateData.ROLE_ID].ROLE_NM;
    }

    if (updateData.ROLE_NM && !updateData.ROLE_ID) {
      const matchingKey = Object.keys(ROLE_MAPPING).find(key => ROLE_MAPPING[key].ROLE_NM === updateData.ROLE_NM);
      if (!matchingKey) {
        await session.abortTransaction();
        return res.status(400).json({
          success: false,
          message: 'Invalid Role Name',
          validRoles: Object.values(ROLE_MAPPING).map(role => role.ROLE_NM)
        });
      }
      updateData.ROLE_ID = matchingKey;
    }

    if (updateData.BU_ID) {
      const branch = await Branch.findOne({ branchCode: updateData.BU_ID }).session(session);
      if (!branch) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: `Branch with code ${updateData.BU_ID} not found`
        });
      }

      const businessUnit = await BusinessUnit.findOne({ 
        BU_ID: updateData.BU_ID 
      }).session(session);

      if (!businessUnit) {
        await session.abortTransaction();
        return res.status(404).json({
          success: false,
          message: `Business Unit with ID ${updateData.BU_ID} not found`
        });
      }

      updateData.BUSINESS_UNIT = businessUnit.BUSINESS_UNIT;
      updateData.BRANCH_REF = branch._id;
    }

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
        context: 'query',
        session
      }
    ).populate('BRANCH_REF', 'branchName branchCode organizationName organizationCode');

    if (!updatedRole) {
      await session.abortTransaction();
      return res.status(404).json({
        success: false,
        message: 'Business role not found',
        USER_ID
      });
    }

    await session.commitTransaction();

    return res.status(200).json({
      success: true,
      message: 'Business role updated successfully',
      data: {
        roleId: updatedRole._id,
        roleName: updatedRole.ROLE_NM,
        businessUnit: updatedRole.BUSINESS_UNIT,
        buId: updatedRole.BU_ID,
        userId: updatedRole.USER_ID,
        status: updatedRole.REC_ST,
        branch: updatedRole.BRANCH_REF ? {
          name: updatedRole.BRANCH_REF.branchName,
          code: updatedRole.BRANCH_REF.branchCode
        } : null
      }
    });

  } catch (error) {
    await session.abortTransaction();
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
  } finally {
    session.endSession();
  }
};

// Delete a BusinessRole by _id
export const deleteBusinessRole = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedBusinessRole = await BusinessRole.findByIdAndDelete(id);

    if (!deletedBusinessRole) {
      return res.status(404).json({ 
        success: false,
        message: 'BusinessRole not found',
        id 
      });
    }

    res.status(200).json({ 
      success: true,
      message: 'BusinessRole deleted successfully',
      deletedRole: {
        roleName: deletedBusinessRole.ROLE_NM,
        userId: deletedBusinessRole.USER_ID,
        branchCode: deletedBusinessRole.BU_ID
      }
    });
  } catch (error) {
    console.error('Error deleting BusinessRole:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting BusinessRole', 
      error: error.message 
    });
  }
};

// ✅ ADD BACK THE MISSING FUNCTION
export const assignBusinessRoleToUser = async (req, res) => {
  try {
    const { USER_ID, ROLE_NM } = req.body;

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

// Get all BusinessRoles
export const getAllBusinessRoles = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      businessUnit, 
      branchCode,
      role,
      status 
    } = req.query;
    
    const query = {};
    if (businessUnit) query.BUSINESS_UNIT = new RegExp(businessUnit, 'i');
    if (branchCode) query.BU_ID = branchCode;
    if (role) query.ROLE_NM = new RegExp(role, 'i');
    if (status) query.REC_ST = status;

    const businessRoles = await BusinessRole.find(query)
      .populate('BRANCH_REF', 'branchName branchCode organizationName organizationCode branchType status')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ CREATE_DT: -1 });

    const count = await BusinessRole.countDocuments(query);

    res.status(200).json({ 
      success: true,
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
      success: false,
      message: 'Error fetching BusinessRoles', 
      error: error.message 
    });
  }
};

// Get BusinessRoles by Branch Code
export const getBusinessRolesByBranch = async (req, res) => {
  try {
    const { branchCode } = req.params;
    const { role, status, page = 1, limit = 10 } = req.query;

    const query = { BU_ID: branchCode };
    if (role) query.ROLE_NM = new RegExp(role, 'i');
    if (status) query.REC_ST = status;

    const businessRoles = await BusinessRole.find(query)
      .populate('BRANCH_REF', 'branchName branchCode organizationName organizationCode branchType address status')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ CREATE_DT: -1 });

    const count = await BusinessRole.countDocuments(query);

    const branch = await Branch.findOne({ branchCode });

    res.status(200).json({
      success: true,
      data: {
        branch: branch ? {
          name: branch.branchName,
          code: branch.branchCode,
          organization: branch.organizationName,
          type: branch.branchType,
          status: branch.status
        } : null,
        businessRoles,
        count: businessRoles.length,
        total: count,
        pages: Math.ceil(count / limit),
        currentPage: page
      }
    });
  } catch (error) {
    console.error('Error fetching business roles by branch:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching business roles',
      error: error.message
    });
  }
};

// Get users by branch and role
export const getUsersByBranchAndRole = async (req, res) => {
  try {
    const { branchCode, roleName } = req.params;

    const businessRoles = await BusinessRole.find({
      BU_ID: branchCode,
      ROLE_NM: new RegExp(roleName, 'i'),
      REC_ST: 'Active'
    }).populate('BRANCH_REF', 'branchName branchCode organizationName');

    res.status(200).json({
      success: true,
      data: {
        branchCode,
        roleName,
        users: businessRoles.map(role => ({
          userId: role.USER_ID,
          roleName: role.ROLE_NM,
          isSupervisor: role.SUPERVISOR_FG,
          canPostTransactions: role.ALLOW_TXN_POSTING_FG
        })),
        count: businessRoles.length
      }
    });
  } catch (error) {
    console.error('Error fetching users by branch and role:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching users',
      error: error.message
    });
  }
};

// Helper function for duplicate key messages
export function getDuplicateKeyMessage(error) {
  if (error.keyPattern?.USER_ID && error.keyPattern?.BU_ID) {
    return 'User already has a role assigned to this branch';
  }
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