import mongoose from 'mongoose';
import Permissions from '../models/Permissions.js';
import UserRole from '../models/UserRole.js'; // Import UserRole model
import BusinessRole from '../models/BusinessRole.js'; // Import BusinessRole model
import { ROLE_MAPPING, ROLE_PERMISSION_MAPPING } from '../constants/roleMapping.js';
import { ForbiddenError, NotFoundError } from '../middlewares/errors/index.js';

// rolePermissionService object for common operations
const rolePermissionService = {
  async fetchUserFromDB(userId) {
    // Fetch from UserRole model
    const userRole = await UserRole.findOne({ USER_ID: userId }).lean();
    if (!userRole) {
      return null;
    }
    // Optionally populate BusinessRole if needed
    return {
      ...userRole,
      businessRole: await BusinessRole.findOne({ ROLE_ID: userRole.USER_ROLE_ID }).lean()
    };
  },

  hasPermission(roleId, permission) {
    // Use ROLE_PERMISSION_MAPPING to check permission
    const rolePermissions = ROLE_PERMISSION_MAPPING[roleId]?.permissions || {};
    const allPermissions = Object.values(rolePermissions).flat().filter(p => typeof p === 'string');
    return allPermissions.includes(permission);
  }
};

// Sync permissions with predefined roles
export const syncPermissions = async (req, res, next) => {
  try {
    const syncResult = await syncPermissionsWithRoles();
    
    res.status(200).json({
      success: true,
      message: 'Permissions synchronized successfully',
      data: syncResult
    });
  } catch (error) {
    next(error);
  }
};

// Get user role data with transformed permissions
export const getUserRoleData = async (req, res, next) => {
  const { userId } = req.params;

  try {
    const userData = await rolePermissionService.fetchUserFromDB(userId);
    
    if (!userData) {
      throw new NotFoundError('User not found');
    }

    const transformedData = transformRoleData(userData);
    
    res.status(200).json({
      success: true,
      data: transformedData
    });
  } catch (error) {
    next(error);
  }
};

// Transform role data for frontend
export const transformRoleData = (backendData) => {
  if (!backendData) return null;
  
  // Get permissions based on USER_ROLE_ID from ROLE_PERMISSION_MAPPING
  const rolePermissions = getDefaultPermissionsForRole(backendData.USER_ROLE_ID);
  
  return {
    id: backendData._id || backendData.USER_ID,
    USER_ROLE_ID: backendData.USER_ROLE_ID,
    ROLE_NM: backendData.ROLE_NM,
    ROLE_NAME: backendData.ROLE_NM,
    USER_ID: backendData.USER_ID,
    BUSINESS_UNIT: backendData.Business_Unit,
    BU_ID: backendData.BU_ID,
    REC_ST: backendData.REC_ST,
    VERSION_NO: backendData.VERSION_NO,
    CREATE_DT: backendData.CREATE_DT,
    SYS_CREATE_TS: backendData.SYS_CREATE_TS || backendData.ROW_TS,
    IS_ACTIVE: backendData.REC_ST === 'Active',
    SUPERVISOR_FG: backendData.SUPERVISOR_FG,
    ALLOW_TXN_POSTING_FG: backendData.ALLOW_TXN_POSTING_FG,
    WF_ITEM_ACCESS_LEVEL: backendData.WF_ITEM_ACCESS_LEVEL,
    permissions: rolePermissions
  };
};

// Helper function to sync permissions with predefined roles
async function syncPermissionsWithRoles() {
  try {
    const roles = Object.keys(ROLE_PERMISSION_MAPPING);
    const results = {
      rolesProcessed: 0,
      rolesCreated: 0,
      rolesUpdated: 0,
      errors: [],
      timestamp: new Date().toISOString()
    };

    for (const roleId of roles) {
      try {
        const defaultPermissions = ROLE_PERMISSION_MAPPING[roleId];
        
        // Check if permissions already exist for this role using BU_ROLE_ID
        const existing = await Permissions.findOne({ BU_ROLE_ID: parseInt(roleId, 10) });
        
        const permissionsData = {
          BU_ROLE_ID: parseInt(roleId, 10),
          ROLE_NAME: ROLE_MAPPING[roleId]?.ROLE_NM || `Role ${roleId}`,
          IS_ACTIVE: true,
          DESCRIPTION: `Permissions for ${ROLE_MAPPING[roleId]?.ROLE_NM || `Role ${roleId}`}`,
          ...defaultPermissions.permissions
        };

        if (existing) {
          // Update existing permissions with default mappings
          await Permissions.findOneAndUpdate(
            { BU_ROLE_ID: parseInt(roleId, 10) },
            { $set: permissionsData },
            { new: true, runValidators: true }
          );
          results.rolesUpdated++;
        } else {
          // Create new permissions with default mappings
          const newPermission = new Permissions(permissionsData);
          await newPermission.save();
          results.rolesCreated++;
        }
        
        results.rolesProcessed++;
      } catch (error) {
        results.errors.push({
          roleId,
          error: error.message
        });
      }
    }

    return results;
  } catch (error) {
    console.error('Error syncing permissions:', error);
    throw error;
  }
}

// Get default permissions for a role
function getDefaultPermissionsForRole(roleId) {
  return ROLE_PERMISSION_MAPPING[roleId]?.permissions || {};
}

// Create permission for a role
export const createPermissionForRole = async (req, res, next) => {
  const { roleId, roleName } = req.body;

  try {
    // Validate roleId exists in ROLE_MAPPING
    if (!ROLE_MAPPING[roleId]) {
      throw new ForbiddenError(`Invalid role ID: ${roleId}. Must be one of ${Object.keys(ROLE_MAPPING).join(', ')}`);
    }

    // Check if permissions already exist
    const existing = await Permissions.findOne({ BU_ROLE_ID: parseInt(roleId, 10) });
    if (existing) {
      throw new ForbiddenError('Permissions already exist for this role');
    }

    // Use predefined permissions from ROLE_PERMISSION_MAPPING
    const defaultPermissions = ROLE_PERMISSION_MAPPING[roleId]?.permissions || {};

    const permissionData = {
      BU_ROLE_ID: parseInt(roleId, 10),
      ROLE_NAME: roleName || ROLE_MAPPING[roleId]?.ROLE_NM || `Role ${roleId}`,
      IS_ACTIVE: true,
      DESCRIPTION: `Permissions for ${roleName || ROLE_MAPPING[roleId]?.ROLE_NM || `Role ${roleId}`}`,
      ...defaultPermissions
    };

    const newPermission = new Permissions(permissionData);
    await newPermission.save();
    
    res.status(201).json({
      success: true,
      message: 'Permission template created successfully',
      data: transformPermissions(newPermission.toObject())
    });
  } catch (error) {
    next(error);
  }
};

export const checkUserPermission = async (req, res, next) => {
  const { userId, permission } = req.params;
  try {
    const userData = await rolePermissionService.fetchUserFromDB(userId);
    if (!userData) {
      throw new NotFoundError('User not found');
    }
    const hasPerm = rolePermissionService.hasPermission(userData.USER_ROLE_ID, permission);
    res.status(200).json({
      success: true,
      data: { hasPermission: hasPerm, userId, permission, roleId: userData.USER_ROLE_ID }
    });
  } catch (error) {
    next(error);
  }
};

// Get all roles with permissions
export const listAllRoles = async (req, res, next) => {
  try {
    const permissions = await Permissions.find().lean();
    res.status(200).json({
      success: true,
      data: permissions.map(transformPermissions)
    });
  } catch (error) {
    next(error);
  }
};

// Get permissions for a role
export const getPermissionsForRole = async (req, res, next) => {
  const { roleId } = req.params;

  try {
    const permission = await Permissions.findOne({ BU_ROLE_ID: parseInt(roleId, 10) }).lean();
    if (!permission) {
      throw new NotFoundError('Permissions not found for this role');
    }

    res.status(200).json({
      success: true,
      data: transformPermissions(permission)
    });
  } catch (error) {
    next(error);
  }
};

// Clone permissions from one role to another
export const cloneRolePermissions = async (req, res, next) => {
  const { sourceRoleId, targetRoleId } = req.body;

  try {
    // Validate source and target are different
    if (sourceRoleId === targetRoleId) {
      throw new ForbiddenError('Cannot clone permissions to the same role');
    }

    // Get source permissions
    const sourcePermissions = await Permissions.findOne({ BU_ROLE_ID: parseInt(sourceRoleId, 10) }).lean();
    if (!sourcePermissions) {
      throw new NotFoundError('Source role permissions not found');
    }

    // Check if target already has permissions
    const targetExists = await Permissions.findOne({ BU_ROLE_ID: parseInt(targetRoleId, 10) });
    if (targetExists) {
      throw new ForbiddenError('Target role already has permissions');
    }

    // Create new permissions object for target role
    const permissionData = { ...sourcePermissions };
    delete permissionData._id;
    delete permissionData.createdAt;
    delete permissionData.updatedAt;
    delete permissionData.__v;
    permissionData.BU_ROLE_ID = parseInt(targetRoleId, 10);
    permissionData.ROLE_NAME = ROLE_MAPPING[targetRoleId]?.ROLE_NM || `Role ${targetRoleId}`;

    const newPermissions = new Permissions(permissionData);
    await newPermissions.save();

    res.status(201).json({
      success: true,
      message: 'Permissions cloned successfully',
      data: transformPermissions(newPermissions.toObject())
    });
  } catch (error) {
    next(error);
  }
};

// Full update (PUT) - replaces entire permissions object
export const updatePermissionsForRole = async (req, res, next) => {
  const { roleId } = req.params;
  const updates = req.body;

  try {
    // Validate all permission types
    const invalidTypes = Object.keys(updates).filter(
      key => !key.endsWith('_ACCESS_LEVEL') || !PERMISSIONS[key.replace('_ACCESS_LEVEL', '')]
    );

    if (invalidTypes.length > 0) {
      throw new ForbiddenError(`Invalid permission types: ${invalidTypes.join(', ')}`);
    }

    // Validate all permission values
    for (const [type, permissions] of Object.entries(updates)) {
      const validPermissions = Object.values(
        PERMISSIONS[type.replace('_ACCESS_LEVEL', '')] || {}
      );
      const invalid = permissions.filter(p => !validPermissions.includes(p));
      
      if (invalid.length > 0) {
        throw new ForbiddenError(`Invalid permissions for ${type}: ${invalid.join(', ')}`);
      }
    }

    const updated = await Permissions.findOneAndUpdate(
      { BU_ROLE_ID: parseInt(roleId, 10) },
      { $set: updates },
      { new: true, runValidators: true, upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'Permissions fully updated',
      data: transformPermissions(updated.toObject())
    });
  } catch (error) {
    next(error);
  }
};

// Partial update (PATCH) - updates specific permission types
export const patchPermissionsForRole = async (req, res, next) => {
  const { roleId } = req.params;
  const { permissionType, permissions } = req.body;

  try {
    // Validate permission type
    if (!permissionType.endsWith('_ACCESS_LEVEL') || 
        !PERMISSIONS[permissionType.replace('_ACCESS_LEVEL', '')]) {
      throw new ForbiddenError('Invalid permission type');
    }

    // Validate permissions
    const validPermissions = Object.values(
      PERMISSIONS[permissionType.replace('_ACCESS_LEVEL', '')] || {}
    );
    const invalid = permissions.filter(p => !validPermissions.includes(p));
    
    if (invalid.length > 0) {
      throw new ForbiddenError(`Invalid permissions: ${invalid.join(', ')}`);
    }

    const updated = await Permissions.findOneAndUpdate(
      { BU_ROLE_ID: parseInt(roleId, 10) },
      { $set: { [permissionType]: permissions } },
      { new: true, runValidators: true }
    );

    if (!updated) {
      throw new NotFoundError('Role permissions not found');
    }

    res.status(200).json({
      success: true,
      message: 'Permissions partially updated',
      data: {
        [permissionType]: updated[permissionType]
      }
    });
  } catch (error) {
    next(error);
  }
};

// Delete role permissions (System Admin only)
export const deleteRolePermissions = async (req, res, next) => {
  const { roleId } = req.params;

  try {
    const deleted = await Permissions.findOneAndDelete({ BU_ROLE_ID: parseInt(roleId, 10) });
    if (!deleted) {
      throw new NotFoundError('Role permissions not found');
    }

    res.status(200).json({
      success: true,
      message: 'Role permissions deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// Helper function to transform permissions to client-friendly format
function transformPermissions(permissionDoc) {
  return Object.entries(PERMISSIONS).reduce((acc, [key]) => {
    acc[key] = permissionDoc[`${key}_ACCESS_LEVEL`] || [];
    return acc;
  }, { BU_ROLE_ID: permissionDoc.BU_ROLE_ID });
}