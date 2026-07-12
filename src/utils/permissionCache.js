// src/utils/permissionCache.js - UPDATED to use roles_vw view
import logger from './logger.js';
import sequelize from '../../config/db.js'; // ✅ Correct path: config is at project root

class PermissionCache {
  constructor() {
    this.cache = new Map();
    this.roles = {};
    this.initialized = false;
    this.initializationPromise = null;
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  async loadRolesFromMySQL() {
    try {
      console.log('🔄 Loading roles from MySQL using roles_vw view...');
      
      const [rows] = await sequelize.query(`
        SELECT 
          role_id, 
          role_name, 
          permissions, 
          description,
          active
        FROM roles_vw
        WHERE active = 1
      `);
      
      console.log(`✅ Loaded ${rows.length} roles from roles_vw view`);
      return rows;
    } catch (error) {
      console.error('❌ Failed to load roles from roles_vw:', error.message);
      
      // Fallback to direct table with aliases
      try {
        console.log('🔄 Trying fallback query to roles table...');
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
        console.log(`✅ Loaded ${rows.length} roles from roles table (fallback)`);
        return rows;
      } catch (fallbackError) {
        throw new Error(`Both view and table queries failed: ${error.message}, ${fallbackError.message}`);
      }
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
        
        const roles = await this.loadRolesFromMySQL();
        
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
          this.useFallbackMode();
          return false;
        }
      }
    })();

    return this.initializationPromise;
  }

  useFallbackMode() {
    console.log('📋 Using fallback role mapping...');
    this.roles = {
      1: { role_id: 1, role_name: 'Admin', permissions: '["*"]', active: 1 },
      2: { role_id: 2, role_name: 'Manager', permissions: '["view_customers","create_customers","edit_customers","delete_customers","approve_customers"]', active: 1 },
      3: { role_id: 3, role_name: 'Officer', permissions: '["view_customers","create_customers","edit_customers"]', active: 1 },
      4: { role_id: 4, role_name: 'Viewer', permissions: '["view_customers"]', active: 1 }
    };
    this.initialized = true;
    console.log('✅ Fallback roles loaded');
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
            } else if (rolePermissions === '["*"]') {
              permissions.add('*');
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
      if (userPermissions.includes('*')) return true;
      return userPermissions.includes(permission);
    } catch (error) {
      console.error('Permission check error:', error.message);
      return false;
    }
  }

  async checkAnyPermission(userId, permissions) {
    try {
      const userPermissions = await this.getUserPermissions(userId);
      if (userPermissions.includes('*')) return true;
      return permissions.some(perm => userPermissions.includes(perm));
    } catch (error) {
      console.error('Any permission check error:', error.message);
      return false;
    }
  }

  async checkAllPermissions(userId, permissions) {
    try {
      const userPermissions = await this.getUserPermissions(userId);
      if (userPermissions.includes('*')) return true;
      return permissions.every(perm => userPermissions.includes(perm));
    } catch (error) {
      console.error('All permissions check error:', error.message);
      return false;
    }
  }

  clearCache() {
    this.cache.clear();
    this.roles = {};
    this.initialized = false;
    this.initializationPromise = null;
    console.log('🗑️  Permission cache cleared');
  }

  getStats() {
    return {
      initialized: this.initialized,
      rolesCount: Object.keys(this.roles).length,
      cacheSize: this.cache.size,
      roles: Object.keys(this.roles).map(id => ({
        id,
        name: this.roles[id]?.role_name,
        active: this.roles[id]?.active
      }))
    };
  }

  debugRoles() {
    console.log('🔍 Loaded roles in cache:');
    Object.keys(this.roles).forEach(id => {
      console.log(`  ${id}: ${this.roles[id].role_name} (active: ${this.roles[id].active})`);
    });
  }
}

// Create singleton instance
const permissionCache = new PermissionCache();

// Auto-initialize on import – always runs in development/production
setTimeout(() => {
  permissionCache.initializeCache().catch(error => {
    console.error('Failed to auto-initialize permission cache:', error.message);
  });
}, 1000);

export default permissionCache;