// src/models/Role.js
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class Role extends Model {}

Role.init(
  {
    role_id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: false,
      allowNull: false,
      field: 'role_id',
    },
    role_name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'role_name',
    },
    description: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'description',
    },
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'active',
    },
    // ✅ ADDED: permissions column (JSON type for flexibility)
    permissions: {
      type: DataTypes.JSON,
      allowNull: true,
      defaultValue: {},
      field: 'permissions',
      comment: 'JSON object of permissions for this role',
      get() {
        const rawValue = this.getDataValue('permissions');
        if (!rawValue) return {};
        if (typeof rawValue === 'string') {
          try {
            return JSON.parse(rawValue);
          } catch (e) {
            return {};
          }
        }
        return rawValue;
      },
      set(value) {
        if (typeof value === 'object') {
          this.setDataValue('permissions', JSON.stringify(value));
        } else {
          this.setDataValue('permissions', value);
        }
      }
    },
    created_at: {
      type: DataTypes.DATE,
      field: 'created_at',
    },
    updated_at: {
      type: DataTypes.DATE,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    modelName: 'Role',
    tableName: 'roles',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    underscored: false,
    freezeTableName: true,
  }
);

// ===== STATIC HELPER METHODS =====

/**
 * Get all active roles
 */
Role.getActiveRoles = async function() {
  try {
    return await this.findAll({
      where: { active: true },
      raw: true,
    });
  } catch (error) {
    console.error('Error getting active roles:', error.message);
    throw error;
  }
};

/**
 * Get role by ID
 */
Role.getRoleById = async function(roleId) {
  try {
    return await this.findOne({
      where: { role_id: roleId, active: true },
      raw: true,
    });
  } catch (error) {
    console.error('Error getting role by ID:', error.message);
    throw error;
  }
};

/**
 * Get role by name
 */
Role.getRoleByName = async function(roleName) {
  try {
    return await this.findOne({
      where: { role_name: roleName, active: true },
      raw: true,
    });
  } catch (error) {
    console.error('Error getting role by name:', error.message);
    throw error;
  }
};

/**
 * Update role
 */
Role.updateRole = async function(roleId, updateData) {
  try {
    const role = await this.findByPk(roleId);
    if (!role) {
      throw new Error('Role not found');
    }
    await role.update(updateData);
    return role;
  } catch (error) {
    console.error('Error updating role:', error.message);
    throw error;
  }
};

/**
 * Get roles with their permissions
 */
Role.getRolesWithPermissions = async function() {
  try {
    return await this.findAll({
      where: { active: true },
      attributes: ['role_id', 'role_name', 'description', 'permissions'],
      raw: true,
    });
  } catch (error) {
    console.error('Error getting roles with permissions:', error.message);
    throw error;
  }
};

/**
 * Check if a role has a specific permission
 */
Role.hasPermission = async function(roleId, permissionKey) {
  try {
    const role = await this.findByPk(roleId);
    if (!role || !role.permissions) {
      return false;
    }
    
    const permissions = typeof role.permissions === 'string' 
      ? JSON.parse(role.permissions) 
      : role.permissions;
    
    return permissions[permissionKey] === true;
  } catch (error) {
    console.error('Error checking permission:', error.message);
    return false;
  }
};

/**
 * Get roles from view (compatible with roles_vw)
 */
Role.getRolesFromView = async function() {
  try {
    // Try to query the view first
    const [results] = await sequelize.query(`
      SELECT 
        role_id as id,
        role_name,
        description,
        active,
        permissions,
        created_at,
        updated_at
      FROM roles_vw
      WHERE active = 1
    `);
    return results;
  } catch (error) {
    console.warn('⚠️ Failed to get roles from view, falling back to table:', error.message);
    // Fallback: query the table directly
    return await this.getRolesWithPermissions();
  }
};

/**
 * Sync the role table and create/update view
 */
Role.syncTable = async function() {
  try {
    // Sync the table
    await this.sync({ alter: true });
    console.log('✅ Role table synced');
    
    // Create or update the view
    try {
      await sequelize.query(`
        CREATE OR REPLACE VIEW roles_vw AS 
        SELECT 
          role_id,
          role_name,
          description,
          active,
          permissions,
          created_at,
          updated_at
        FROM roles
      `);
      console.log('✅ Roles view (roles_vw) updated successfully');
    } catch (viewError) {
      console.warn('⚠️ Could not create/update roles_vw view:', viewError.message);
    }
    
    return true;
  } catch (error) {
    console.error('Error syncing Role table:', error.message);
    return false;
  }
};

// ===== INSTANCE METHODS =====

/**
 * Check if this role has a specific permission
 */
Role.prototype.hasPermission = function(permissionKey) {
  if (!this.permissions) return false;
  
  const permissions = typeof this.permissions === 'string' 
    ? JSON.parse(this.permissions) 
    : this.permissions;
  
  return permissions[permissionKey] === true;
};

/**
 * Get all permissions for this role
 */
Role.prototype.getPermissions = function() {
  if (!this.permissions) return {};
  
  return typeof this.permissions === 'string' 
    ? JSON.parse(this.permissions) 
    : this.permissions;
};

/**
 * Set permissions for this role
 */
Role.prototype.setPermissions = function(permissions) {
  if (typeof permissions === 'object') {
    this.permissions = permissions;
  }
  return this;
};

export default Role;