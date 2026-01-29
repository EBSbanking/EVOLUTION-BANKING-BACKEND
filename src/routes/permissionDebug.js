// routes/permissionDebug.js
import express from 'express';
import permissionCache from '../utils/permissionCache.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';

const router = express.Router();

// Debug endpoint (only in development)
router.get('/debug/permissions', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  
  try {
    const userId = req.query.userId || req.user?.id;
    const roleId = req.query.roleId;
    
    let result = {
      success: true,
      cacheInitialized: permissionCache.initialized,
      useDatabase: permissionCache.useDatabase,
      totalRoles: permissionCache.roles.size
    };
    
    if (userId) {
      const permissions = await permissionCache.getUserPermissions(userId);
      result.user = {
        id: userId,
        permissionsCount: permissions.length,
        permissions: permissions.slice(0, 20) // First 20 only
      };
    }
    
    if (roleId) {
      const role = permissionCache.roles.get(parseInt(roleId));
      result.role = role ? {
        id: role.id,
        name: role.name,
        permissionsCount: role.permissions.length,
        source: role.source,
        samplePermissions: role.permissions.slice(0, 10)
      } : null;
    }
    
    // List all roles
    result.allRoles = Array.from(permissionCache.roles.values()).map(r => ({
      id: r.id,
      name: r.name,
      permissionsCount: r.permissions.length,
      source: r.source
    }));
    
    res.json(result);
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Test permission check
router.get('/debug/test-permission', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(404).json({ success: false, message: 'Not found' });
  }
  
  try {
    const userId = req.query.userId || req.user?.id;
    const permission = req.query.permission || 'VIEW_DASHBOARD';
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'userId required'
      });
    }
    
    const hasPermission = await permissionCache.checkPermission(userId, permission);
    
    res.json({
      success: true,
      userId,
      permission,
      hasPermission,
      userPermissions: await permissionCache.getUserPermissions(userId)
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

export default router;