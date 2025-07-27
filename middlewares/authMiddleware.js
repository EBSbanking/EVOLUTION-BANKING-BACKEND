// middlewares/authMiddleware.js
import jwt from 'jsonwebtoken';
// import { ForbiddenError, UnauthorizedError } from './errors/index.js';
import Permissions from '../models/Permissions.js';

const secretKey = process.env.JWT_SECRET_KEY;

// 1. Authentication Middleware
export const authenticate = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Unauthorized: No token provided'
        });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({
            success: false,
            message: 'Forbidden: Invalid token'
        });
    }
};


// 2. Permission Middleware
export const validatePermission = (requiredPermissions = {}) => {
  return async (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');

      if (req.user.roles?.includes('SUPER_ADMIN')) {
        return next();
      }

      const userPermissions = await Permissions.findOne({
        BU_ROLE_ID: req.user.roleId,
      }).lean();

      if (!userPermissions) {
        throw new ForbiddenError('No permissions assigned to your role');
      }

      for (const [group, perms] of Object.entries(requiredPermissions)) {
        const field = `${group}_ACCESS_LEVEL`;
        const allowed = userPermissions[field] || [];

        const missing = perms.filter(p => !allowed.includes(p));
        if (missing.length > 0) {
          throw new ForbiddenError(`Missing ${group} permissions: ${missing.join(', ')}`);
        }
      }

      next();
    } catch (error) {
      console.error('Permission validation error:', error.message);
      next(error);
    }
  };
};

// 3. Role Middleware
export const hasRole = (...roles) => {
  return (req, res, next) => {
    try {
      if (!req.user) throw new UnauthorizedError('Authentication required');

      const hasRequiredRole = roles.some(role => req.user.roles?.includes(role));
      if (!hasRequiredRole) {
        throw new ForbiddenError(`Requires one of these roles: ${roles.join(', ')}`);
      }

      next();
    } catch (error) {
      console.error('Role validation error:', error.message);
      next(error);
    }
  };
};

// 4. Combined Auth + Permission Middleware
export const authWithPermissions = (requiredPermissions = {}) => [
  authenticate,
  validatePermission(requiredPermissions),
];

// 5. Token Generator
export const generateToken = (payload) => {
  return jwt.sign(payload, secretKey, { expiresIn: '1h' });
};
