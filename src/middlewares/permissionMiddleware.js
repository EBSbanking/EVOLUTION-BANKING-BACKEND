// src/utils/permissionCache.js - UPDATED VERSION
import logger from './logger.js';
import sequelize from '../config/db.js'; // Or however you get your sequelize instance

class PermissionCache {
  constructor() {
    this.cache = new Map(); // user_id -> permissions array
    this.roles = {}; // role_id -> role data
    this.initialized = false;
    this.initializationPromise = null;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  // ✅ UPDATED: Correct SQL query for your database schema
  async loadRolesFromMySQL() {
    try {
      console.log('🔄 Loading roles from MySQL...');
      
      // ✅ FIXED: Use correct column names for your database
      const [rows] = await sequelize.query(`
        SELECT 
          id as role_id, 
          name as role_name, 
          permissions, 
          description,
          is_active as active
        FROM roles
        WHERE is_active = 1
      `);
      
      console.log(`✅ Loaded ${rows.length} roles from MySQL`);
      return rows;
    } catch (error) {
      console.error('❌ Failed to load roles from MySQL:', error.message);
      throw error;
    }
  }

  async loadUserRolesFromMySQL(userId) {
    try {
      const [rows] = await sequelize.query(`
        SELECT role_id, user_id 
        FROM user_roles 
        WHERE user_id = ? AND REC_ST = 'A'
      `, [userId]);
      
      return rows.map(row => row.role_id);
    } catch (error) {
      console.error('Failed to load user roles:', error.message);
      return [];
    }
  }

  async initializeCache(retryCount = 0) {
    if (this.initialized) {
      return true;
    }

    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = (async () => {
      try {
        console.log('🔄 Initializing permissions cache from MySQL...');
        
        // ✅ Load roles with correct query
        const roles = await this.loadRolesFromMySQL();
        
        // Store roles in cache
        this.roles = roles.reduce((acc, role) => {
          acc[role.role_id] = role;
          return acc;
        }, {});
        
        console.log(`✅ Permissions cache initialized with ${Object.keys(this.roles).length} roles`);
        this.initialized = true;
        return true;
        
      } catch (error) {
        console.error(`❌ Permissions cache attempt ${retryCount + 1} failed: ${error.message}`);
        
        if (retryCount < this.maxRetries - 1) {
          console.log(`⏳ Retrying in ${this.retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, this.retryDelay * (retryCount + 1)));
          return this.initializeCache(retryCount + 1);
        } else {
          console.error('❌ All MySQL attempts failed, using fallback mode');
          console.log(`Last error: ${error.message}`);
          this.useFallbackMode();
          return false;
        }
      }
    })();

    return this.initializationPromise;
  }

  useFallbackMode() {
    console.log('📋 Loaded roles from fallback mapping');
    // Load from roleMapping or other fallback
    this.roles = {}; // Initialize with empty or fallback data
    this.initialized = true;
  }

  async getUserPermissions(userId) {
    try {
      await this.initializeCache();
      
      const roleIds = await this.loadUserRolesFromMySQL(userId);
      const permissions = new Set();
      
      roleIds.forEach(roleId => {
        const role = this.roles[roleId];
        if (role && role.permissions) {
          try {
            const rolePermissions = typeof role.permissions === 'string' 
              ? JSON.parse(role.permissions) 
              : role.permissions;
            
            if (Array.isArray(rolePermissions)) {
              rolePermissions.forEach(perm => permissions.add(perm));
            }
          } catch (error) {
            console.error(`Error parsing permissions for role ${roleId}:`, error.message);
          }
        }
      });
      
      return Array.from(permissions);
    } catch (error) {
      console.error('Failed to get user permissions:', error.message);
      return [];
    }
  }

  async checkPermission(userId, permission) {
    try {
      const userPermissions = await this.getUserPermissions(userId);
      return userPermissions.includes(permission);
    } catch (error) {
      console.error('Permission check error:', error.message);
      return false;
    }
  }

  async checkAnyPermission(userId, permissions) {
    try {
      const userPermissions = await this.getUserPermissions(userId);
      return permissions.some(perm => userPermissions.includes(perm));
    } catch (error) {
      console.error('Any permission check error:', error.message);
      return false;
    }
  }

  async checkAllPermissions(userId, permissions) {
    try {
      const userPermissions = await this.getUserPermissions(userId);
      return permissions.every(perm => userPermissions.includes(perm));
    } catch (error) {
      console.error('All permissions check error:', error.message);
      return false;
    }
  }

  clearCache() {
    this.cache.clear();
    this.initialized = false;
    this.initializationPromise = null;
    console.log('🗑️  Permission cache cleared');
  }

  getStats() {
    return {
      initialized: this.initialized,
      rolesCount: Object.keys(this.roles).length,
      cacheSize: this.cache.size
    };
  }
}

// Create singleton instance
const permissionCache = new PermissionCache();

// Auto-initialize on import (optional, can be called manually)
if (process.env.NODE_ENV !== 'test') {
  permissionCache.initializeCache().catch(error => {
    console.error('Failed to auto-initialize permission cache:', error.message);
  });
}

export default permissionCache;