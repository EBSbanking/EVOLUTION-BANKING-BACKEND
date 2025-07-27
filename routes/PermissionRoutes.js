import express from 'express';
import {
  createPermissionForRole,
  getPermissionsForRole,
  updatePermissionsForRole,
  patchPermissionsForRole,
  listAllRoles,
  cloneRolePermissions,
  deleteRolePermissions
} from '../controllers/PermissionsController.js';
import { 
  authenticate, 
  validatePermission,
  hasRole 
} from '../middlewares/authMiddleware.js';

const router = express.Router();

// Apply authentication and activity check to all permission routes
router.use(authenticate);
router.use(hasRole('ADMIN', 'SUPER_ADMIN', 'PERMISSION_MANAGER'));

// Permission Management Routes
router.post('/', 
  validatePermission({
    PERMISSION_MANAGEMENT: ['CREATE_PERMISSION']
  }),
  createPermissionForRole
);

router.get('/',
  validatePermission({
    PERMISSION_MANAGEMENT: ['VIEW_PERMISSIONS']
  }),
  listAllRoles
);

router.get('/:roleId',
  validatePermission({
    PERMISSION_MANAGEMENT: ['VIEW_PERMISSIONS']
  }),
  getPermissionsForRole
);

router.put('/:roleId',
  validatePermission({
    PERMISSION_MANAGEMENT: ['UPDATE_PERMISSIONS']
  }),
  updatePermissionsForRole
);

router.patch('/:roleId',
  validatePermission({
    PERMISSION_MANAGEMENT: ['UPDATE_PERMISSIONS']
  }),
  patchPermissionsForRole
);

router.post('/:roleId/clone',
  validatePermission({
    PERMISSION_MANAGEMENT: ['CREATE_PERMISSION', 'UPDATE_PERMISSIONS']
  }),
  cloneRolePermissions
);

// System Admin Only Routes
router.delete('/:roleId',
  hasRole('SUPER_ADMIN'),
  validatePermission({
    SYSTEM_ADMIN: ['MANAGE_SYSTEM_CONFIG'],
    PERMISSION_MANAGEMENT: ['UPDATE_PERMISSIONS']
  }),
  deleteRolePermissions
);

export default router;