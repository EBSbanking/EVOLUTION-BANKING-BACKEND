// utils/permissionHelpers.js
export function hasPermission(userPermissions, requiredPermission) {
  if (!userPermissions) return false;
  
  if (Array.isArray(userPermissions)) {
    return userPermissions.includes(requiredPermission);
  }
  
  if (typeof userPermissions === 'object' && userPermissions !== null) {
    const allPermissions = Object.values(userPermissions).flat();
    return allPermissions.includes(requiredPermission);
  }
  
  if (typeof userPermissions === 'string') {
    const permissionsArray = userPermissions.split(',').map(p => p.trim());
    return permissionsArray.includes(requiredPermission);
  }
  
  return false;
}

export function flattenPermissions(permissions) {
  if (Array.isArray(permissions)) return permissions;
  if (typeof permissions === 'object' && permissions !== null) {
    return Object.values(permissions).flat();
  }
  if (typeof permissions === 'string') {
    return permissions.split(',').map(p => p.trim());
  }
  return [];
}

export function checkMultiplePermissions(userPermissions, requiredPermissions) {
  if (!Array.isArray(requiredPermissions)) {
    requiredPermissions = [requiredPermissions];
  }
  
  return requiredPermissions.every(permission => 
    hasPermission(userPermissions, permission)
  );
}

export function hasAnyPermission(userPermissions, requiredPermissions) {
  if (!Array.isArray(requiredPermissions)) {
    requiredPermissions = [requiredPermissions];
  }
  
  return requiredPermissions.some(permission => 
    hasPermission(userPermissions, permission)
  );
}

// Middleware for route protection
export const requirePermission = (permission) => {
  return (req, res, next) => {
    try {
      const userPermissions = req.user?.permissions; // Assuming user is attached to request
      
      if (!userPermissions) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      if (!hasPermission(userPermissions, permission)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }
      
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

// Middleware for multiple permissions (all required)
export const requireAllPermissions = (permissions) => {
  return (req, res, next) => {
    try {
      const userPermissions = req.user?.permissions;
      
      if (!userPermissions) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      if (!checkMultiplePermissions(userPermissions, permissions)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }
      
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

// Middleware for any permission (at least one required)
export const requireAnyPermission = (permissions) => {
  return (req, res, next) => {
    try {
      const userPermissions = req.user?.permissions;
      
      if (!userPermissions) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }
      
      if (!hasAnyPermission(userPermissions, permissions)) {
        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }
      
      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Permission check failed'
      });
    }
  };
};

export default {
  hasPermission,
  flattenPermissions,
  checkMultiplePermissions,
  hasAnyPermission,
  requirePermission,
  requireAllPermissions,
  requireAnyPermission
};