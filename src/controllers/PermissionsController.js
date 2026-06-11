// controllers/permissionController.js
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import Permissions from '../models/Permissions.js';
import UserRole from '../models/UserRole.js';
import BusinessRole from '../models/BusinessRole.js';
import { ROLE_MAPPING, ROLE_PERMISSION_MAPPING } from '../constants/roleMapping.js';
import { ForbiddenError, NotFoundError } from '../middlewares/errors/index.js';

// rolePermissionService object for common operations
const rolePermissionService = {
  async fetchUserFromDB(userId) {
    try {
      const userRole = await UserRole.findOne({ 
        where: { USER_ID: userId },
        include: [{
          model: BusinessRole,
          as: 'businessRole',
          attributes: ['ROLE_ID', 'ROLE_NM', 'DESCRIPTION', 'IS_ACTIVE']
        }]
      });

      if (!userRole) {
        return null;
      }

      return userRole.toJSON();
    } catch (error) {
      console.error('Error fetching user from DB:', error);
      return null;
    }
  },

  hasPermission(roleId, permission) {
    const rolePermissions = ROLE_PERMISSION_MAPPING[roleId]?.permissions || {};
    const allPermissions = Object.values(rolePermissions).flat().filter(p => typeof p === 'string');
    return allPermissions.includes(permission);
  }
};

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

export const transformRoleData = (backendData) => {
  if (!backendData) return null;
  const rolePermissions = getDefaultPermissionsForRole(backendData.USER_ROLE_ID);
  return {
    id: backendData.id || backendData.USER_ID,
    USER_ROLE_ID: backendData.USER_ROLE_ID,
    ROLE_NM: backendData.ROLE_NM || backendData.businessRole?.ROLE_NM,
    ROLE_NAME: backendData.ROLE_NM || backendData.businessRole?.ROLE_NM,
    USER_ID: backendData.USER_ID,
    BUSINESS_UNIT: backendData.Business_Unit || backendData.BU_ID,
    BU_ID: backendData.BU_ID,
    REC_ST: backendData.REC_ST,
    VERSION_NO: backendData.VERSION_NO,
    CREATE_DT: backendData.CREATE_DT,
    SYS_CREATE_TS: backendData.SYS_CREATE_TS || backendData.ROW_TS,
    IS_ACTIVE: backendData.REC_ST === 'Active' || backendData.REC_ST === 'A',
    SUPERVISOR_FG: backendData.SUPERVISOR_FG,
    ALLOW_TXN_POSTING_FG: backendData.ALLOW_TXN_POSTING_FG,
    WF_ITEM_ACCESS_LEVEL: backendData.WF_ITEM_ACCESS_LEVEL,
    permissions: rolePermissions,
    businessRole: backendData.businessRole
  };
};

async function syncPermissionsWithRoles() {
  const transaction = await sequelize.transaction();
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
        const existing = await Permissions.findOne({ 
          where: { BU_ROLE_ID: parseInt(roleId, 10) },
          transaction
        });
        const permissionsData = {
          BU_ROLE_ID: parseInt(roleId, 10),
          ROLE_NAME: ROLE_MAPPING[roleId]?.ROLE_NM || `Role ${roleId}`,
          IS_ACTIVE: true,
          DESCRIPTION: `Permissions for ${ROLE_MAPPING[roleId]?.ROLE_NM || `Role ${roleId}`}`,
          ...defaultPermissions.permissions
        };

        if (existing) {
          await existing.update(permissionsData, { transaction });
          results.rolesUpdated++;
        } else {
          await Permissions.create(permissionsData, { transaction });
          results.rolesCreated++;
        }
        results.rolesProcessed++;
      } catch (error) {
        results.errors.push({ roleId, error: error.message });
      }
    }

    await transaction.commit();
    return results;
  } catch (error) {
    await transaction.rollback();
    console.error('Error syncing permissions:', error);
    throw error;
  }
}

function getDefaultPermissionsForRole(roleId) {
  return ROLE_PERMISSION_MAPPING[roleId]?.permissions || {};
}

export const createPermissionForRole = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { roleId, roleName } = req.body;
    if (!ROLE_MAPPING[roleId]) {
      await transaction.rollback();
      throw new ForbiddenError(`Invalid role ID: ${roleId}. Must be one of ${Object.keys(ROLE_MAPPING).join(', ')}`);
    }
    const existing = await Permissions.findOne({ 
      where: { BU_ROLE_ID: parseInt(roleId, 10) },
      transaction
    });
    if (existing) {
      await transaction.rollback();
      throw new ForbiddenError('Permissions already exist for this role');
    }
    const defaultPermissions = ROLE_PERMISSION_MAPPING[roleId]?.permissions || {};
    const permissionData = {
      BU_ROLE_ID: parseInt(roleId, 10),
      ROLE_NAME: roleName || ROLE_MAPPING[roleId]?.ROLE_NM || `Role ${roleId}`,
      IS_ACTIVE: true,
      DESCRIPTION: `Permissions for ${roleName || ROLE_MAPPING[roleId]?.ROLE_NM || `Role ${roleId}`}`,
      ...defaultPermissions
    };
    const newPermission = await Permissions.create(permissionData, { transaction });
    await transaction.commit();
    res.status(201).json({
      success: true,
      message: 'Permission template created successfully',
      data: transformPermissions(newPermission.toJSON())
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

export const checkUserPermission = async (req, res, next) => {
  const { userId, permission } = req.params;
  try {
    const userData = await rolePermissionService.fetchUserFromDB(userId);
    if (!userData) throw new NotFoundError('User not found');
    const hasPerm = rolePermissionService.hasPermission(userData.USER_ROLE_ID, permission);
    res.status(200).json({
      success: true,
      data: { 
        hasPermission: hasPerm, 
        userId, 
        permission, 
        roleId: userData.USER_ROLE_ID,
        roleName: userData.ROLE_NM || userData.businessRole?.ROLE_NM
      }
    });
  } catch (error) {
    next(error);
  }
};

export const listAllRoles = async (req, res, next) => {
  try {
    const permissions = await Permissions.findAll({ order: [['BU_ROLE_ID', 'ASC']] });
    res.status(200).json({
      success: true,
      data: permissions.map(permission => transformPermissions(permission.toJSON()))
    });
  } catch (error) {
    next(error);
  }
};

export const getPermissionsForRole = async (req, res, next) => {
  const { roleId } = req.params;
  try {
    const permission = await Permissions.findOne({ where: { BU_ROLE_ID: parseInt(roleId, 10) } });
    if (!permission) throw new NotFoundError('Permissions not found for this role');
    res.status(200).json({
      success: true,
      data: transformPermissions(permission.toJSON())
    });
  } catch (error) {
    next(error);
  }
};

export const cloneRolePermissions = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { sourceRoleId, targetRoleId } = req.body;
    if (sourceRoleId === targetRoleId) {
      await transaction.rollback();
      throw new ForbiddenError('Cannot clone permissions to the same role');
    }
    const sourcePermissions = await Permissions.findOne({ 
      where: { BU_ROLE_ID: parseInt(sourceRoleId, 10) },
      transaction
    });
    if (!sourcePermissions) {
      await transaction.rollback();
      throw new NotFoundError('Source role permissions not found');
    }
    const targetExists = await Permissions.findOne({ 
      where: { BU_ROLE_ID: parseInt(targetRoleId, 10) },
      transaction
    });
    if (targetExists) {
      await transaction.rollback();
      throw new ForbiddenError('Target role already has permissions');
    }
    const sourceData = sourcePermissions.toJSON();
    const permissionData = { ...sourceData };
    delete permissionData.id;
    delete permissionData.createdAt;
    delete permissionData.updatedAt;
    permissionData.BU_ROLE_ID = parseInt(targetRoleId, 10);
    permissionData.ROLE_NAME = ROLE_MAPPING[targetRoleId]?.ROLE_NM || `Role ${targetRoleId}`;
    const newPermissions = await Permissions.create(permissionData, { transaction });
    await transaction.commit();
    res.status(201).json({
      success: true,
      message: 'Permissions cloned successfully',
      data: transformPermissions(newPermissions.toJSON())
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

export const updatePermissionsForRole = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { roleId } = req.params;
    const updates = req.body;
    const permission = await Permissions.findOne({ 
      where: { BU_ROLE_ID: parseInt(roleId, 10) },
      transaction
    });
    if (!permission) {
      await transaction.rollback();
      throw new NotFoundError('Role permissions not found');
    }
    const invalidTypes = Object.keys(updates).filter(key => !key.endsWith('_ACCESS_LEVEL'));
    if (invalidTypes.length > 0) {
      await transaction.rollback();
      throw new ForbiddenError(`Invalid permission types: ${invalidTypes.join(', ')}`);
    }
    await permission.update(updates, { transaction });
    await transaction.commit();
    await permission.reload();
    res.status(200).json({
      success: true,
      message: 'Permissions fully updated',
      data: transformPermissions(permission.toJSON())
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

export const patchPermissionsForRole = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { roleId } = req.params;
    const { permissionType, permissions } = req.body;
    if (!permissionType.endsWith('_ACCESS_LEVEL')) {
      await transaction.rollback();
      throw new ForbiddenError('Invalid permission type');
    }
    const permission = await Permissions.findOne({ 
      where: { BU_ROLE_ID: parseInt(roleId, 10) },
      transaction
    });
    if (!permission) {
      await transaction.rollback();
      throw new NotFoundError('Role permissions not found');
    }
    await permission.update({ [permissionType]: permissions }, { transaction });
    await transaction.commit();
    await permission.reload();
    res.status(200).json({
      success: true,
      message: 'Permissions partially updated',
      data: {
        [permissionType]: permission[permissionType],
        roleId: permission.BU_ROLE_ID,
        roleName: permission.ROLE_NAME
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

export const deleteRolePermissions = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { roleId } = req.params;
    const permission = await Permissions.findOne({ 
      where: { BU_ROLE_ID: parseInt(roleId, 10) },
      transaction
    });
    if (!permission) {
      await transaction.rollback();
      throw new NotFoundError('Role permissions not found');
    }
    const deletedInfo = {
      BU_ROLE_ID: permission.BU_ROLE_ID,
      ROLE_NAME: permission.ROLE_NAME,
      deletedAt: new Date()
    };
    await permission.destroy({ transaction });
    await transaction.commit();
    res.status(200).json({
      success: true,
      message: 'Role permissions deleted successfully',
      data: deletedInfo
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

export const searchPermissions = async (req, res, next) => {
  try {
    const { 
      roleId, roleName, isActive, page = 1, limit = 10,
      sortBy = 'BU_ROLE_ID', sortOrder = 'ASC'
    } = req.query;
    const where = {};
    if (roleId) where.BU_ROLE_ID = parseInt(roleId, 10);
    if (roleName) where.ROLE_NAME = { [Op.iLike]: `%${roleName}%` };
    if (isActive !== undefined) where.IS_ACTIVE = isActive === 'true' || isActive === true;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const orderDirection = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    const { count, rows: permissions } = await Permissions.findAndCountAll({
      where,
      order: [[sortBy, orderDirection]],
      offset,
      limit: parseInt(limit)
    });
    res.status(200).json({
      success: true,
      data: permissions.map(permission => transformPermissions(permission.toJSON())),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      },
      filters: { roleId, roleName, isActive, results: count }
    });
  } catch (error) {
    next(error);
  }
};

export const getPermissionStatistics = async (req, res, next) => {
  try {
    const statistics = await Permissions.findAll({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalPermissions'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN "IS_ACTIVE" = true THEN 1 ELSE 0 END')), 'activePermissions'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN "IS_ACTIVE" = false THEN 1 ELSE 0 END')), 'inactivePermissions'],
        [sequelize.fn('MIN', sequelize.col('BU_ROLE_ID')), 'lowestRoleId'],
        [sequelize.fn('MAX', sequelize.col('BU_ROLE_ID')), 'highestRoleId']
      ],
      raw: true
    });
    const stats = statistics[0] || {
      totalPermissions: 0,
      activePermissions: 0,
      inactivePermissions: 0,
      lowestRoleId: null,
      highestRoleId: null
    };
    const roleDistribution = await Permissions.findAll({
      attributes: [
        'ROLE_NAME',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['ROLE_NAME'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
      raw: true
    });
    res.status(200).json({
      success: true,
      message: 'Permission statistics retrieved successfully',
      data: {
        statistics: {
          totalPermissions: parseInt(stats.totalPermissions) || 0,
          activePermissions: parseInt(stats.activePermissions) || 0,
          inactivePermissions: parseInt(stats.inactivePermissions) || 0,
          activationRate: parseInt(stats.totalPermissions) > 0 
            ? Math.round((parseInt(stats.activePermissions) / parseInt(stats.totalPermissions)) * 10000) / 100 
            : 0,
          roleIdRange: stats.highestRoleId && stats.lowestRoleId 
            ? `${stats.lowestRoleId} - ${stats.highestRoleId}` 
            : 'N/A'
        },
        roleDistribution: roleDistribution.map(item => ({
          roleName: item.ROLE_NAME,
          count: parseInt(item.count) || 0,
          percentage: parseInt(stats.totalPermissions) > 0 
            ? Math.round((parseInt(item.count) / parseInt(stats.totalPermissions)) * 10000) / 100 
            : 0
        })),
        lastSync: (await Permissions.max('updatedAt')) || 'Never',
        recommendations: generatePermissionRecommendations(stats)
      }
    });
  } catch (error) {
    next(error);
  }
};

export const bulkUpdatePermissions = async (req, res, next) => {
  const transaction = await sequelize.transaction();
  try {
    const { updates } = req.body;
    if (!Array.isArray(updates) || updates.length === 0) {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Updates array is required and must not be empty'
      });
    }
    const results = {
      successful: [],
      failed: [],
      totalProcessed: 0
    };
    for (const update of updates) {
      try {
        const { roleId, permissionType, permissions } = update;
        if (!roleId || !permissionType || !Array.isArray(permissions)) {
          results.failed.push({ ...update, error: 'Missing required fields or invalid permissions array' });
          continue;
        }
        if (!permissionType.endsWith('_ACCESS_LEVEL')) {
          results.failed.push({ ...update, error: 'Invalid permission type' });
          continue;
        }
        const permission = await Permissions.findOne({ 
          where: { BU_ROLE_ID: parseInt(roleId, 10) },
          transaction
        });
        if (!permission) {
          results.failed.push({ ...update, error: 'Role permissions not found' });
          continue;
        }
        await permission.update({ [permissionType]: permissions }, { transaction });
        results.successful.push({ ...update, updatedAt: new Date() });
        results.totalProcessed++;
      } catch (error) {
        results.failed.push({ ...update, error: error.message });
      }
    }
    await transaction.commit();
    res.status(200).json({
      success: true,
      message: 'Bulk permission update completed',
      data: {
        summary: {
          totalSubmitted: updates.length,
          totalProcessed: results.totalProcessed,
          successful: results.successful.length,
          failed: results.failed.length,
          successRate: updates.length > 0 ? (results.successful.length / updates.length) * 100 : 0
        },
        successful: results.successful,
        failed: results.failed.length > 0 ? results.failed : undefined
      }
    });
  } catch (error) {
    await transaction.rollback();
    next(error);
  }
};

function transformPermissions(permissionDoc) {
  if (!permissionDoc) return null;
  const permissionFields = {};
  Object.keys(permissionDoc).forEach(key => {
    if (key.endsWith('_ACCESS_LEVEL') && Array.isArray(permissionDoc[key])) {
      permissionFields[key] = permissionDoc[key];
    }
  });
  return {
    id: permissionDoc.id,
    BU_ROLE_ID: permissionDoc.BU_ROLE_ID,
    ROLE_NAME: permissionDoc.ROLE_NAME,
    IS_ACTIVE: permissionDoc.IS_ACTIVE,
    DESCRIPTION: permissionDoc.DESCRIPTION,
    ...permissionFields,
    createdAt: permissionDoc.createdAt,
    updatedAt: permissionDoc.updatedAt
  };
}

function generatePermissionRecommendations(stats) {
  const recommendations = [];
  const totalPermissions = parseInt(stats.totalPermissions) || 0;
  const activePermissions = parseInt(stats.activePermissions) || 0;
  if (activePermissions < totalPermissions * 0.5) {
    recommendations.push(
      'Low active permission rate. Review inactive permissions for cleanup.',
      'Consider reactivating or archiving inactive permissions.'
    );
  }
  if (totalPermissions > 100) {
    recommendations.push(
      'Large number of permissions. Consider implementing permission grouping.',
      'Review permission structure for optimization.'
    );
  }
  if (stats.lowestRoleId && stats.highestRoleId) {
    const range = stats.highestRoleId - stats.lowestRoleId;
    if (range > 50) {
      recommendations.push(
        'Wide role ID range detected. Consider role ID allocation strategy.',
        'Review role ID assignment for consistency.'
      );
    }
  }
  return recommendations;
}