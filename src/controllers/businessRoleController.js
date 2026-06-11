import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import BusinessRole from '../models/BusinessRole.js';
import User from '../models/User.js';
import BusinessUnit from '../models/BusinessUnit.js';
import Branch from '../models/Branch.js';
import UserRole from '../models/UserRole.js';
import { isBUAccessible, getAccessibleBusinessUnits } from '../utils/businessUnitUtils.js';

// ============ FIX: Import ROLE_MAPPING from roleMapping.js ============
import { ROLE_MAPPING, getRoleById, isValidRoleId, isValidRoleName } from '../constants/roleMapping.js';

// Helper function for duplicate key messages
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

// ============ CREATE BUSINESS ROLE ============
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
      ALLOW_EXCH_RATE_OVR_FG = 'N',
      DEF_ROLE_FG = 'N',
      WF_ITEM_ACCESS_LEVEL = ''
    } = req.body;

    console.log('Creating business role with data:', { USER_ID, ROLE_ID, ROLE_NM, BU_ID, BUSINESS_UNIT });

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

    // 2. VERIFY ROLE_ID AND ROLE_NM MATCH (Using imported ROLE_MAPPING)
    const roleMapping = ROLE_MAPPING[ROLE_ID];
    if (!roleMapping || roleMapping.ROLE_NM.toUpperCase() !== ROLE_NM.toUpperCase()) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Role ID and Role Name mismatch',
        expectedRoleName: roleMapping?.ROLE_NM || 'Unknown Role ID',
        validRoles: Object.values(ROLE_MAPPING).map(r => ({ id: r.id, name: r.ROLE_NM }))
      });
    }

    // 3. RESOLVE BRANCH/BUSINESS UNIT RELATIONSHIP
    let finalBusinessUnit = BUSINESS_UNIT;
    let finalBU_ID = BU_ID;
    let branchReference = null;

    if (BU_ID) {
      // Find branch by BU_ID (branchCode)
      const branch = await Branch.findOne({ 
        where: { branchCode: BU_ID.toString().padStart(3, '0') },
        attributes: ['id', 'branchName', 'branchCode', 'organizationName', 'organizationCode', 'address', 'status'],
        transaction 
      });
      
      if (!branch) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Branch with code ${BU_ID} not found`
        });
      }

      // Try to find business unit
      const businessUnit = await BusinessUnit.findOne({ 
        where: { 
          BU_ID: parseInt(BU_ID)
        },
        attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION'],
        transaction
      });

      if (businessUnit) {
        finalBusinessUnit = businessUnit.BUSINESS_UNIT;
        finalBU_ID = businessUnit.BU_ID;
      } else {
        finalBusinessUnit = branch.branchName;
        finalBU_ID = parseInt(BU_ID);
      }
      branchReference = branch.id;

    } else if (BUSINESS_UNIT) {
      // Find business unit by name
      const businessUnit = await BusinessUnit.findOne({ 
        where: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('BUSINESS_UNIT')),
          sequelize.fn('LOWER', BUSINESS_UNIT)
        ),
        attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION'],
        transaction
      });
      
      if (!businessUnit) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Business Unit "${BUSINESS_UNIT}" not found`
        });
      }

      // Try to find branch by BU_ID
      const branchCode = businessUnit.BU_ID.toString().padStart(3, '0');
      const branch = await Branch.findOne({ 
        where: { branchCode: branchCode },
        attributes: ['id', 'branchName', 'branchCode', 'organizationName', 'organizationCode', 'address', 'status'],
        transaction 
      });
      
      finalBusinessUnit = businessUnit.BUSINESS_UNIT;
      finalBU_ID = businessUnit.BU_ID;
      branchReference = branch ? branch.id : null;
      
    } else {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Either BUSINESS_UNIT or BU_ID (branch code) is required'
      });
    }

    // 4. CHECK FOR DUPLICATES
    const existingRole = await BusinessRole.findOne({
      where: {
        [Op.or]: [
          { 
            ROLE_ID: ROLE_ID, 
            USER_ID: USER_ID, 
            BU_ID: finalBU_ID 
          },
          { 
            ROLE_NM: roleMapping.ROLE_NM, 
            USER_ID: USER_ID, 
            BUSINESS_UNIT: finalBusinessUnit 
          }
        ]
      },
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
      ALLOW_TXN_POSTING_FG: ALLOW_TXN_POSTING_FG?.toUpperCase() === 'Y' ? 'Y' : 'N',
      ALLOW_EXCH_RATE_OVR_FG: ALLOW_EXCH_RATE_OVR_FG?.toUpperCase() === 'Y' ? 'Y' : 'N',
      DEF_ROLE_FG: DEF_ROLE_FG?.toUpperCase() === 'Y' ? 'Y' : 'N',
      WF_ITEM_ACCESS_LEVEL,
      CREATED_BY: req.user?.user_name || 'system',
      CREATED_BY_ROLE: req.user?.role || 'system',
      CREATE_DT: new Date(),
      ROW_TS: new Date()
    }, { transaction });

    // 6. GET BRANCH INFO FOR RESPONSE
    let branchInfo = null;
    if (branchReference) {
      const branch = await Branch.findOne({
        where: { id: branchReference },
        attributes: ['branchName', 'branchCode', 'organizationName', 'organizationCode', 'address', 'status'],
        transaction
      });
      
      if (branch) {
        branchInfo = {
          name: branch.branchName,
          code: branch.branchCode,
          organization: branch.organizationName,
          address: branch.address,
          status: branch.status
        };
      }
    }

    await transaction.commit();

    return res.status(201).json({
      success: true,
      data: {
        id: newRole.id,
        role: newRole.ROLE_NM,
        user: newRole.USER_ID,
        businessUnit: newRole.BUSINESS_UNIT,
        buId: newRole.BU_ID,
        branch: branchInfo,
        permissions: {
          isSupervisor: newRole.SUPERVISOR_FG === 'Y',
          canPostTransactions: newRole.ALLOW_TXN_POSTING_FG === 'Y',
          canOverrideExchangeRate: newRole.ALLOW_EXCH_RATE_OVR_FG === 'Y',
          isDefaultRole: newRole.DEF_ROLE_FG === 'Y',
          workflowAccess: newRole.WF_ITEM_ACCESS_LEVEL
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
      return res.status(409).json({
        success: false,
        message: getDuplicateKeyMessage(error),
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

// ============ GET BUSINESS ROLE BY USER ID (FIXED) ============
export const getBusinessRoleByUserId = async (req, res) => {
  try {
    const { USER_ID } = req.params;

    console.log('🔍 Fetching business role for USER_ID:', USER_ID);

    if (!BusinessRole) {
      throw new Error('BusinessRole model not properly initialized');
    }

    // Convert to string
    const userIdStr = String(USER_ID);
    
    // Try both exact match and numeric conversion
    let whereCondition = { USER_ID: userIdStr };
    
    const userIdNum = parseInt(userIdStr, 10);
    if (!isNaN(userIdNum)) {
      whereCondition = {
        [Op.or]: [
          { USER_ID: userIdStr },
          { USER_ID: userIdNum }
        ]
      };
    }

    // Find business roles
    const businessRoles = await BusinessRole.findAll({ 
      where: whereCondition,
      order: [['ROLE_ID', 'ASC']]
    });

    // Return response with data (could be empty array)
    return res.status(200).json({ 
      success: true,
      message: businessRoles.length ? 'Business roles retrieved successfully' : 'No business roles found for this user',
      data: businessRoles,
      count: businessRoles.length,
      // Include role mapping info for debugging (using imported ROLE_MAPPING)
      availableRoles: Object.values(ROLE_MAPPING).map(r => ({ id: r.id, name: r.ROLE_NM }))
    });
    
  } catch (error) {
    console.error('❌ Error fetching BusinessRole:', error);
    
    return res.status(500).json({ 
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

// ============ UPDATE BUSINESS ROLE (FIXED) ============
export const updateBusinessRole = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { USER_ID } = req.params;
    const updateData = req.body;

    console.log('Updating business role for USER_ID:', USER_ID, 'with data:', updateData);

    // Validate ROLE_ID if provided (using imported ROLE_MAPPING)
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

    // Sync ROLE_NM with ROLE_ID if needed
    if (updateData.ROLE_ID && !updateData.ROLE_NM) {
      updateData.ROLE_NM = ROLE_MAPPING[updateData.ROLE_ID].ROLE_NM;
    }

    // Find ROLE_ID from ROLE_NM if needed
    if (updateData.ROLE_NM && !updateData.ROLE_ID) {
      const matchingKey = Object.keys(ROLE_MAPPING).find(key => 
        ROLE_MAPPING[key].ROLE_NM.toUpperCase() === updateData.ROLE_NM.toUpperCase()
      );
      if (!matchingKey) {
        await transaction.rollback();
        return res.status(400).json({
          success: false,
          message: 'Invalid Role Name',
          validRoles: Object.values(ROLE_MAPPING).map(role => role.ROLE_NM)
        });
      }
      updateData.ROLE_ID = parseInt(matchingKey);
    }

    // Handle BU_ID/BUSINESS_UNIT relationship
    let branchReference = null;
    let finalBusinessUnit = updateData.BUSINESS_UNIT;
    let finalBU_ID = updateData.BU_ID;

    if (updateData.BU_ID) {
      const branch = await Branch.findOne({ 
        where: { branchCode: updateData.BU_ID.toString().padStart(3, '0') },
        attributes: ['id', 'branchName', 'branchCode', 'organizationName', 'organizationCode'],
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
        where: { BU_ID: parseInt(updateData.BU_ID) },
        attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION'],
        transaction
      });

      if (businessUnit) {
        updateData.BUSINESS_UNIT = businessUnit.BUSINESS_UNIT;
        updateData.BU_ID = businessUnit.BU_ID;
        branchReference = branch.id;
      } else {
        updateData.BUSINESS_UNIT = branch.branchName;
        updateData.BU_ID = parseInt(updateData.BU_ID);
        branchReference = branch.id;
      }
    } else if (updateData.BUSINESS_UNIT) {
      const businessUnit = await BusinessUnit.findOne({ 
        where: sequelize.where(
          sequelize.fn('LOWER', sequelize.col('BUSINESS_UNIT')),
          sequelize.fn('LOWER', updateData.BUSINESS_UNIT)
        ),
        attributes: ['id', 'BU_ID', 'BUSINESS_UNIT', 'DESCRIPTION'],
        transaction
      });

      if (!businessUnit) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          message: `Business Unit "${updateData.BUSINESS_UNIT}" not found`
        });
      }

      const branchCode = businessUnit.BU_ID.toString().padStart(3, '0');
      const branch = await Branch.findOne({ 
        where: { branchCode: branchCode },
        attributes: ['id', 'branchName', 'branchCode', 'organizationName', 'organizationCode'],
        transaction 
      });

      updateData.BUSINESS_UNIT = businessUnit.BUSINESS_UNIT;
      updateData.BU_ID = businessUnit.BU_ID;
      branchReference = branch ? branch.id : null;
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

    // Prepare update data
    const updatePayload = {
      ROLE_NM: updateData.ROLE_NM || existingRole.ROLE_NM,
      ROLE_ID: updateData.ROLE_ID || existingRole.ROLE_ID,
      BUSINESS_UNIT: updateData.BUSINESS_UNIT || existingRole.BUSINESS_UNIT,
      BU_ID: updateData.BU_ID || existingRole.BU_ID,
      REC_ST: updateData.REC_ST || existingRole.REC_ST,
      VERSION_NO: updateData.VERSION_NO || existingRole.VERSION_NO,
      SUPERVISOR_FG: updateData.SUPERVISOR_FG || existingRole.SUPERVISOR_FG,
      ALLOW_TXN_POSTING_FG: updateData.ALLOW_TXN_POSTING_FG || existingRole.ALLOW_TXN_POSTING_FG,
      ALLOW_EXCH_RATE_OVR_FG: updateData.ALLOW_EXCH_RATE_OVR_FG || existingRole.ALLOW_EXCH_RATE_OVR_FG,
      DEF_ROLE_FG: updateData.DEF_ROLE_FG || existingRole.DEF_ROLE_FG,
      WF_ITEM_ACCESS_LEVEL: updateData.WF_ITEM_ACCESS_LEVEL || existingRole.WF_ITEM_ACCESS_LEVEL,
      BRANCH_REF: branchReference || existingRole.BRANCH_REF,
      LAST_UPDATED_BY: req.user?.user_name || 'system',
      LAST_UPDATED_DT: new Date(),
      ROW_TS: new Date()
    };

    // Update role
    await BusinessRole.update(
      updatePayload,
      {
        where: { USER_ID },
        transaction,
        validate: true
      }
    );

    // Get updated role
    const updatedRole = await BusinessRole.findOne({
      where: { USER_ID },
      transaction
    });

    // Get branch info
    let branchInfo = null;
    if (updatedRole.BRANCH_REF) {
      const branch = await Branch.findOne({
        where: { id: updatedRole.BRANCH_REF },
        attributes: ['branchName', 'branchCode', 'organizationName', 'organizationCode'],
        transaction
      });
      
      if (branch) {
        branchInfo = {
          name: branch.branchName,
          code: branch.branchCode,
          organization: branch.organizationName
        };
      }
    }

    await transaction.commit();

    return res.status(200).json({
      success: true,
      message: 'Business role updated successfully',
      data: {
        id: updatedRole.id,
        roleName: updatedRole.ROLE_NM,
        businessUnit: updatedRole.BUSINESS_UNIT,
        buId: updatedRole.BU_ID,
        userId: updatedRole.USER_ID,
        status: updatedRole.REC_ST,
        branch: branchInfo,
        permissions: {
          isSupervisor: updatedRole.SUPERVISOR_FG === 'Y',
          canPostTransactions: updatedRole.ALLOW_TXN_POSTING_FG === 'Y',
          canOverrideExchangeRate: updatedRole.ALLOW_EXCH_RATE_OVR_FG === 'Y',
          isDefaultRole: updatedRole.DEF_ROLE_FG === 'Y',
          workflowAccess: updatedRole.WF_ITEM_ACCESS_LEVEL
        }
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
      referenceId: `ERR-${Date.now()}`,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// ============ DELETE BUSINESS ROLE ============
export const deleteBusinessRole = async (req, res) => {
  const transaction = await sequelize.transaction();
  
  try {
    const { id } = req.params;

    const roleToDelete = await BusinessRole.findByPk(id, { transaction });

    if (!roleToDelete) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        message: 'BusinessRole not found',
        id 
      });
    }

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

// ============ ASSIGN BUSINESS ROLE TO USER ============
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
        message: 'Role is already assigned to this user'
      });
    }

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

// ============ GET ALL BUSINESS ROLES ============
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
    
    const conditions = {};
    if (businessUnit) conditions.BUSINESS_UNIT = { [Op.iLike]: `%${businessUnit}%` };
    if (branchCode) conditions.BU_ID = branchCode;
    if (role) conditions.ROLE_NM = { [Op.iLike]: `%${role}%` };
    if (status) conditions.REC_ST = status;

    const offset = (page - 1) * limit;

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

// ============ GET BUSINESS ROLES BY BRANCH ============
export const getBusinessRolesByBranch = async (req, res) => {
  try {
    const { branchCode } = req.params;
    const { role, status, page = 1, limit = 10 } = req.query;

    const conditions = { BU_ID: branchCode };
    if (role) conditions.ROLE_NM = { [Op.iLike]: `%${role}%` };
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

// ============ GET USERS BY BRANCH AND ROLE ============
export const getUsersByBranchAndRole = async (req, res) => {
  try {
    const { branchCode, roleName } = req.params;

    const businessRoles = await BusinessRole.findAll({
      where: {
        BU_ID: branchCode,
        ROLE_NM: { [Op.iLike]: `%${roleName}%` },
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

// ============ GET ROLE STATISTICS ============
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