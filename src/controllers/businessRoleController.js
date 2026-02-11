// src/controllers/businessRoleController.js
import sequelize from '../../config/db.js';
import BusinessRole from '../models/BusinessRole.js';
import User from '../models/User.js';
import BusinessUnit from '../models/BusinessUnit.js';
import Branch from '../models/Branch.js';
import UserRole from '../models/UserRole.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';
import { isBUAccessible, getAccessibleBusinessUnits } from "../utils/businessUnitUtils.js";

// Create BusinessRole — full flow with branch integration
export const createBusinessRole = async (req, res) => {
  const transaction = await sequelize.transaction();
  
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

    // 1. VALIDATE REQUIRED FIELDS
    const requiredFields = { ROLE_NM, ROLE_ID, USER_ID };
    const missingFields = Object.entries(requiredFields)
      .filter(([_, value]) => !value)
      .map(([field]) => field);

    if (missingFields.length > 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Missing required fields',
        missingFields
      });
    }

    // 2. VERIFY ROLE_ID AND ROLE_NM MATCH
    const roleMapping = ROLE_MAPPING[ROLE_ID];
    if (!roleMapping || roleMapping.ROLE_NM.toUpperCase() !== ROLE_NM.toUpperCase()) {
      await transaction.rollback();
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
      const branch = await Branch.findOne({ 
        where: { branchCode: BU_ID },
        transaction 
      });
      
      if (!branch) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Branch with code ${BU_ID} not found`
        });
      }

      const businessUnit = await BusinessUnit.findOne({ 
        where: { 
          BU_ID: BU_ID,
          branchId: branch.id 
        },
        transaction
      });

      if (!businessUnit) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Business Unit not found for branch ${BU_ID}`
        });
      }

      finalBusinessUnit = businessUnit.BUSINESS_UNIT || branch.branchName;
      finalBU_ID = businessUnit.BU_ID;
      branchReference = branch.id;
    } else if (BUSINESS_UNIT) {
      const businessUnit = await BusinessUnit.findOne({ 
        where: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('BUSINESS_UNIT')),
          sequelize.fn('LOWER', BUSINESS_UNIT)
        ),
        transaction
      });
      
      if (!businessUnit) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Business Unit "${BUSINESS_UNIT}" not found`
        });
      }

      const branch = await Branch.findByPk(businessUnit.branchId, { transaction });
      if (!branch) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Branch not found for business unit ${BUSINESS_UNIT}`
        });
      }

      finalBusinessUnit = businessUnit.BUSINESS_UNIT;
      finalBU_ID = businessUnit.BU_ID;
      branchReference = branch.id;
    } else {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Either BUSINESS_UNIT or BU_ID (branch code) is required'
      });
    }

    // 4. CHECK FOR DUPLICATES
    const existingRole = await BusinessRole.findOne({
      where: sequelize.or(
        { ROLE_ID, USER_ID, BU_ID: finalBU_ID },
        { ROLE_NM, USER_ID, BUSINESS_UNIT: finalBusinessUnit }
      ),
      transaction
    });

    if (existingRole) {
      await transaction.rollback();
      return res.status(409).json({
        success: false,
        message: 'Role assignment already exists for this user and branch'
      });
    }

    // 5. CREATE NEW ROLE
    const newRole = await BusinessRole.create({
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
    }, { transaction });

    // 6. GET BRANCH INFO FOR RESPONSE
    const populatedRole = await BusinessRole.findByPk(newRole.id, {
      include: [{
        model: Branch,
        as: 'branch',
        attributes: ['branchName', 'branchCode', 'organizationName', 'organizationCode', 'address', 'status']
      }],
      transaction
    });

    await transaction.commit();

    // 7. SUCCESS RESPONSE
    return res.status(201).json({
      success: true,
      data: {
        id: populatedRole.id,
        role: populatedRole.ROLE_NM,
        user: populatedRole.USER_ID,
        businessUnit: populatedRole.BUSINESS_UNIT,
        buId: populatedRole.BU_ID,
        branch: populatedRole.branch ? {
          name: populatedRole.branch.branchName,
          code: populatedRole.branch.branchCode,
          organization: populatedRole.branch.organizationName,
          address: populatedRole.branch.address,
          status: populatedRole.branch.status
        } : null,
        permissions: {
          isSupervisor: populatedRole.SUPERVISOR_FG,
          canPostTransactions: populatedRole.ALLOW_TXN_POSTING_FG,
          workflowAccess: populatedRole.WF_ITEM_ACCESS_LEVEL
        }
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Role Creation Error:', error);

    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.errors.map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }))
      });
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      const duplicateMessage = getDuplicateKeyMessage(error);
      return res.status(409).json({
        success: false,
        message: duplicateMessage,
        code: 'DUPLICATE_RECORD'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      referenceId: `ERR-${Date.now()}`,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

export const getBusinessRoleByUserId = async (req, res) => {
  try {
    const { USER_ID } = req.params;

    console.log('🔍 Fetching business role for USER_ID:', USER_ID);

    // Check if BusinessRole model is available
    if (!BusinessRole) {
      throw new Error('BusinessRole model not properly initialized');
    }

    // Find business roles without the Branch association
    const businessRoles = await BusinessRole.findAll({ 
      where: { USER_ID },
      order: [['ROLE_ID', 'ASC']]
    });

    if (!businessRoles || businessRoles.length === 0) {
      return res.status(404).json({ 
        success: false,
        message: 'No business roles found for this USER_ID',
        USER_ID 
      });
    }

    res.status(200).json({ 
      success: true,
      message: 'BusinessRole retrieved successfully', 
      data: businessRoles,
      count: businessRoles.length
    });
  } catch (error) {
    console.error('❌ Error fetching BusinessRole:', error);
    
    res.status(500).json({ 
      success: false,
      message: 'Error fetching BusinessRole', 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? {
        name: error.name,
        stack: error.stack
      } : undefined
    });
  }
};

// Update a BusinessRole by USER_ID
export const updateBusinessRole = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { USER_ID } = req.params;
    const updateData = req.body;

    if (updateData.ROLE_ID && !ROLE_MAPPING[updateData.ROLE_ID]) {
      await transaction.rollback();
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
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Invalid Role Name',
          validRoles: Object.values(ROLE_MAPPING).map(role => role.ROLE_NM)
        });
      }
      updateData.ROLE_ID = matchingKey;
    }

    if (updateData.BU_ID) {
      const branch = await Branch.findOne({ 
        where: { branchCode: updateData.BU_ID },
        transaction 
      });
      
      if (!branch) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Branch with code ${updateData.BU_ID} not found`
        });
      }

      const businessUnit = await BusinessUnit.findOne({ 
        where: { BU_ID: updateData.BU_ID },
        transaction
      });

      if (!businessUnit) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Business Unit with ID ${updateData.BU_ID} not found`
        });
      }

      updateData.BUSINESS_UNIT = businessUnit.BUSINESS_UNIT;
      updateData.BRANCH_REF = branch.id;
    }

    // Find existing role
    const existingRole = await BusinessRole.findOne({ 
      where: { USER_ID },
      transaction 
    });

    if (!existingRole) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Business role not found',
        USER_ID
      });
    }

    // Update role
    const [updatedRows] = await BusinessRole.update(
      {
        ...updateData,
        LAST_UPDATED_BY: req.user?.user_name || 'system',
        LAST_UPDATED_DT: new Date(),
        ROW_TS: new Date()
      },
      {
        where: { USER_ID },
        transaction,
        validate: true,
        returning: true
      }
    );

    // Get updated role with branch info
    const updatedRole = await BusinessRole.findOne({
      where: { USER_ID },
      include: [{
        model: Branch,
        as: 'branch',
        attributes: ['branchName', 'branchCode', 'organizationName', 'organizationCode']
      }],
      transaction
    });

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Business role updated successfully',
      data: {
        roleId: updatedRole.id,
        roleName: updatedRole.ROLE_NM,
        businessUnit: updatedRole.BUSINESS_UNIT,
        buId: updatedRole.BU_ID,
        userId: updatedRole.USER_ID,
        status: updatedRole.REC_ST,
        branch: updatedRole.branch ? {
          name: updatedRole.branch.branchName,
          code: updatedRole.branch.branchCode
        } : null
      }
    });

  } catch (error) {
    await transaction.rollback();
    console.error('Business Role Update Error:', error);

    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: error.errors.map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }))
      });
    }

    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        message: getDuplicateKeyMessage(error),
        code: 'DUPLICATE_RECORD'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      referenceId: `ERR-${Date.now()}`
    });
  }
};

// Delete a BusinessRole by id
export const deleteBusinessRole = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;

    // Find role first to include in response
    const roleToDelete = await BusinessRole.findByPk(id, { transaction });

    if (!roleToDelete) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        message: 'BusinessRole not found',
        id 
      });
    }

    // Delete the role
    await BusinessRole.destroy({
      where: { id },
      transaction
    });

    await transaction.commit();

    res.status(200).json({ 
      success: true,
      message: 'BusinessRole deleted successfully',
      deletedRole: {
        roleName: roleToDelete.ROLE_NM,
        userId: roleToDelete.USER_ID,
        branchCode: roleToDelete.BU_ID
      }
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error deleting BusinessRole:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error deleting BusinessRole', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Assign BusinessRole to User
export const assignBusinessRoleToUser = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { USER_ID, ROLE_NM } = req.body;

    const [user, role] = await Promise.all([
      User.findOne({ where: { USER_ID }, transaction }),
      BusinessRole.findOne({ where: { ROLE_NM }, transaction })
    ]);

    if (!user) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        message: 'User not found',
        USER_ID 
      });
    }

    if (!role) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        message: 'Business Role not found',
        ROLE_NM 
      });
    }

    // Check if role already assigned (assuming UserRole model or similar)
    const existingUserRole = await UserRole.findOne({
      where: { 
        userId: user.id,
        businessRoleId: role.id 
      },
      transaction
    });

    if (existingUserRole) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Role is already assigned to this user',
        USER_ID,
        ROLE_NM
      });
    }

    // Create user-role association
    await UserRole.create({
      userId: user.id,
      businessRoleId: role.id,
      assignedBy: req.user?.user_name || 'system',
      assignedDate: new Date()
    }, { transaction });

    await transaction.commit();

    res.status(200).json({ 
      success: true,
      message: 'Business Role assigned to user successfully', 
      data: { 
        USER_ID, 
        ROLE_NM,
        assignedBy: req.user?.user_name || 'system',
        assignmentDate: new Date()
      } 
    });
  } catch (error) {
    await transaction.rollback();
    console.error('Error assigning role:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error assigning role', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get all BusinessRoles with pagination and filtering
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
    
    // Build query conditions
    const conditions = {};
    if (businessUnit) conditions.BUSINESS_UNIT = { [sequelize.Op.iLike]: `%${businessUnit}%` };
    if (branchCode) conditions.BU_ID = branchCode;
    if (role) conditions.ROLE_NM = { [sequelize.Op.iLike]: `%${role}%` };
    if (status) conditions.REC_ST = status;

    const offset = (page - 1) * limit;

    // Get roles with pagination
    const { rows: businessRoles, count } = await BusinessRole.findAndCountAll({
      where: conditions,
      include: [{
        model: Branch,
        as: 'branch',
        attributes: ['branchName', 'branchCode', 'organizationName', 'organizationCode', 'branchType', 'status']
      }],
      limit: parseInt(limit),
      offset: offset,
      order: [['CREATE_DT', 'DESC']]
    });

    res.status(200).json({ 
      success: true,
      message: 'BusinessRoles retrieved successfully', 
      data: businessRoles,
      meta: {
        total: count,
        pages: Math.ceil(count / limit),
        currentPage: parseInt(page),
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('Error fetching BusinessRoles:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error fetching BusinessRoles', 
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get BusinessRoles by Branch Code
export const getBusinessRolesByBranch = async (req, res) => {
  try {
    const { branchCode } = req.params;
    const { role, status, page = 1, limit = 10 } = req.query;

    const conditions = { BU_ID: branchCode };
    if (role) conditions.ROLE_NM = { [sequelize.Op.iLike]: `%${role}%` };
    if (status) conditions.REC_ST = status;

    const offset = (page - 1) * limit;

    const { rows: businessRoles, count } = await BusinessRole.findAndCountAll({
      where: conditions,
      include: [{
        model: Branch,
        as: 'branch',
        attributes: ['branchName', 'branchCode', 'organizationName', 'organizationCode', 'branchType', 'address', 'status']
      }],
      limit: parseInt(limit),
      offset: offset,
      order: [['CREATE_DT', 'DESC']]
    });

    const branch = await Branch.findOne({ where: { branchCode } });

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
        currentPage: parseInt(page)
      }
    });
  } catch (error) {
    console.error('Error fetching business roles by branch:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching business roles',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Get users by branch and role
export const getUsersByBranchAndRole = async (req, res) => {
  try {
    const { branchCode, roleName } = req.params;

    const businessRoles = await BusinessRole.findAll({
      where: {
        BU_ID: branchCode,
        ROLE_NM: { [sequelize.Op.iLike]: `%${roleName}%` },
        REC_ST: 'Active'
      },
      include: [{
        model: Branch,
        as: 'branch',
        attributes: ['branchName', 'branchCode', 'organizationName']
      }]
    });

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
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Helper function for duplicate key messages (Sequelize version)
export function getDuplicateKeyMessage(error) {
  const fields = error.fields || {};
  
  if (fields.USER_ID && fields.BU_ID) {
    return 'User already has a role assigned to this branch';
  }
  if (fields.USER_ID) {
    return 'User already has a business role assigned';
  }
  if (fields.ROLE_ID) {
    return 'Role ID already exists';
  }
  if (fields.BUSINESS_UNIT) {
    return 'Business unit already assigned';
  }
  
  return 'Duplicate key violation';
}

// Get role statistics
export const getRoleStatistics = async (req, res) => {
  try {
    const statistics = await BusinessRole.findAll({
      attributes: [
        'ROLE_NM',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN REC_ST = 'Active' THEN 1 ELSE 0 END")), 'activeCount'],
        [sequelize.fn('SUM', sequelize.literal("CASE WHEN SUPERVISOR_FG = 'Y' THEN 1 ELSE 0 END")), 'supervisorCount']
      ],
      group: ['ROLE_NM'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']]
    });

    const total = await BusinessRole.count();
    const activeTotal = await BusinessRole.count({ where: { REC_ST: 'Active' } });

    res.status(200).json({
      success: true,
      data: {
        statistics,
        totals: {
          total,
          active: activeTotal,
          inactive: total - activeTotal
        }
      }
    });
  } catch (error) {
    console.error('Error fetching role statistics:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};