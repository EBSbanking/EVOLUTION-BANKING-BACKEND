import { ROLE_PERMISSION_MAPPING } from '../constants/roleMapping.js';
import Permissions from '../models/Permissions.js';
import { PERMISSIONS } from '../constants/permissions.js';

class RolePermissionService {
  // Sync permissions with predefined roles
  async syncPermissions() {
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
          const rolePermissions = ROLE_PERMISSION_MAPPING[roleId];
          
          // Check if permissions already exist for this role
          const existing = await Permissions.findOne({ roleId });
          
          if (existing) {
            // Update existing permissions with default mappings
            const updates = this.mapPermissionsToAccessLevels(rolePermissions);
            await Permissions.findOneAndUpdate(
              { roleId },
              { $set: updates },
              { new: true, runValidators: true }
            );
            results.rolesUpdated++;
          } else {
            // Create new permissions with default mappings
            const permissionData = this.mapPermissionsToAccessLevels(rolePermissions);
            const newPermission = new Permissions({
              roleId,
              ...permissionData
            });
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

      return {
        success: true,
        message: 'Permissions synchronized successfully',
        data: results
      };
    } catch (error) {
      console.error('Error syncing permissions:', error);
      throw error;
    }
  }

  // Transform backend role data to frontend format
  transformRoleData(backendData) {
    if (!backendData) return null;
    
    // Get permissions based on ROLE_ID from your ROLE_PERMISSION_MAPPING
    const rolePermissions = this.getDefaultPermissionsForRole(backendData.ROLE_ID);
    
    return {
      id: backendData._id || backendData.USER_ID,
      ROLE_ID: backendData.ROLE_ID,
      ROLE_NM: backendData.ROLE_NM,
      ROLE_NAME: backendData.ROLE_NM,
      USER_ID: backendData.USER_ID,
      BUSINESS_UNIT: backendData.BUSINESS_UNIT,
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
  }

  // Get default permissions for a role
  getDefaultPermissionsForRole(roleId) {
    return ROLE_PERMISSION_MAPPING[roleId] || [];
  }

  // Map permissions to your ACCESS_LEVEL format
  mapPermissionsToAccessLevels(permissions) {
    const accessLevels = {};
    
    // Initialize all permission types with empty arrays
    Object.keys(PERMISSIONS).forEach(key => {
      accessLevels[`${key}_ACCESS_LEVEL`] = [];
    });

    // Map permissions to their respective ACCESS_LEVEL arrays
    permissions.forEach(permission => {
      // Find which permission category this belongs to
      for (const [category, perms] of Object.entries(PERMISSIONS)) {
        if (Object.values(perms).includes(permission)) {
          const accessLevelKey = `${category}_ACCESS_LEVEL`;
          if (!accessLevels[accessLevelKey].includes(permission)) {
            accessLevels[accessLevelKey].push(permission);
          }
          break;
        }
      }
    });
    
    return accessLevels;
  }

  // Get permissions for multiple roles
  getPermissionsForRoles(roleIds) {
    const allPermissions = new Set();
    
    roleIds.forEach(roleId => {
      const rolePerms = this.getDefaultPermissionsForRole(roleId);
      rolePerms.forEach(perm => allPermissions.add(perm));
    });
    
    return Array.from(allPermissions);
  }

  // Check if a role has specific permission
  hasPermission(roleId, permission) {
    const rolePerms = this.getDefaultPermissionsForRole(roleId);
    return rolePerms.includes(permission);
  }

  // Additional utility methods
  async getUserWithPermissions(userId) {
    // Fetch user data from database
    const userData = await this.fetchUserFromDB(userId);
    
    // Transform the data for frontend
    return this.transformRoleData(userData);
  }

  async fetchUserFromDB(userId) {
    // Your database query logic here
    // Example:
    // return await UserModel.findById(userId).populate('role');
    
    // Mock data for demonstration
    return {
      _id: userId,
      USER_ID: userId,
      ROLE_ID: 'TELLER', // This would come from your actual user data
      ROLE_NM: 'Teller',
      BUSINESS_UNIT: 'BRANCH_001',
      BU_ID: 'BU001',
      REC_ST: 'Active',
      VERSION_NO: 1,
      CREATE_DT: new Date(),
      SYS_CREATE_TS: new Date(),
      SUPERVISOR_FG: false,
      ALLOW_TXN_POSTING_FG: true,
      WF_ITEM_ACCESS_LEVEL: 'MEDIUM'
    };
  }
}

// Export as singleton instance
export default new RolePermissionService();