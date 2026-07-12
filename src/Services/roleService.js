// src/services/roleService.js
import sequelize from '../../config/db.js';
import { QueryTypes } from 'sequelize';

// Cache for roles to avoid repeated database queries
let cachedRoles = null;
let rolesLoaded = false;

/**
 * Get all roles from the database
 * Tries roles_vw first, falls back to roles table
 */
export const getRoles = async () => {
  // Return cached roles if already loaded
  if (rolesLoaded && cachedRoles) {
    return cachedRoles;
  }

  try {
    let roles = null;

    // Try 1: Query the view
    try {
      roles = await sequelize.query(
        'SELECT role_id, role_name, description, active FROM roles_vw ORDER BY role_id',
        { type: QueryTypes.SELECT }
      );
      if (roles && roles.length > 0) {
        console.log(`✅ Loaded ${roles.length} roles from roles_vw`);
        cachedRoles = roles;
        rolesLoaded = true;
        return roles;
      }
    } catch (viewError) {
      console.log('ℹ️ roles_vw not found, trying roles table');
    }

    // Try 2: Fallback to roles table
    try {
      roles = await sequelize.query(
        'SELECT role_id, role_name, description, active FROM roles ORDER BY role_id',
        { type: QueryTypes.SELECT }
      );
      if (roles && roles.length > 0) {
        console.log(`✅ Loaded ${roles.length} roles from roles table`);
        cachedRoles = roles;
        rolesLoaded = true;
        return roles;
      }
    } catch (tableError) {
      console.error('❌ Failed to load roles from roles table:', tableError.message);
    }

    // If all fails, return empty array
    return [];
  } catch (error) {
    console.error('❌ Failed to load roles:', error.message);
    return [];
  }
};

/**
 * Get a single role by ID
 */
export const getRoleById = async (roleId) => {
  try {
    const roles = await getRoles();
    return roles.find(role => role.role_id === parseInt(roleId));
  } catch (error) {
    console.error(`❌ Failed to get role ${roleId}:`, error.message);
    return null;
  }
};

/**
 * Get a single role by name
 */
export const getRoleByName = async (roleName) => {
  try {
    const roles = await getRoles();
    return roles.find(role => role.role_name === roleName);
  } catch (error) {
    console.error(`❌ Failed to get role ${roleName}:`, error.message);
    return null;
  }
};

/**
 * Get active roles only
 */
export const getActiveRoles = async () => {
  try {
    const roles = await getRoles();
    return roles.filter(role => role.active === 1 || role.active === true);
  } catch (error) {
    console.error('❌ Failed to get active roles:', error.message);
    return [];
  }
};

/**
 * Clear the roles cache (useful after role updates)
 */
export const clearRolesCache = () => {
  cachedRoles = null;
  rolesLoaded = false;
  console.log('🔄 Roles cache cleared');
};

export default {
  getRoles,
  getRoleById,
  getRoleByName,
  getActiveRoles,
  clearRolesCache
};