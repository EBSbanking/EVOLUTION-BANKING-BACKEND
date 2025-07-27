import Permissions from '../models/Permissions.js';
import { PERMISSIONS } from '../constants/permissions.js';
import { ForbiddenError, NotFoundError } from '../middlewares/errors/index.js';

// Create permission for a role
export const createPermissionForRole = async (req, res, next) => {
  const { roleId } = req.body;

  try {
    // Check if permissions already exist
    const existing = await Permissions.findOne({ roleId });
    if (existing) {
      throw new Error('Permissions already exist for this role');
    }

    // Create with default empty arrays for all permission types
    const defaultPermissions = Object.keys(PERMISSIONS).reduce((acc, key) => {
      acc[`${key}_ACCESS_LEVEL`] = [];
      return acc;
    }, {});

    const newPermission = new Permissions({
      roleId,
      ...defaultPermissions
    });

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
    const permission = await Permissions.findOne({ roleId }).lean();
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
    const sourcePermissions = await Permissions.findOne({ roleId: sourceRoleId }).lean();
    if (!sourcePermissions) {
      throw new NotFoundError('Source role permissions not found');
    }

    // Check if target already has permissions
    const targetExists = await Permissions.findOne({ roleId: targetRoleId });
    if (targetExists) {
      throw new ForbiddenError('Target role already has permissions');
    }

    // Create new permissions object for target role
    const permissionData = { ...sourcePermissions };
    delete permissionData._id;
    delete permissionData.createdAt;
    delete permissionData.updatedAt;
    delete permissionData.__v;
    permissionData.roleId = targetRoleId;

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
      { roleId },
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
      { roleId },
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
    const deleted = await Permissions.findOneAndDelete({ roleId });
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
  }, { roleId: permissionDoc.roleId });
}