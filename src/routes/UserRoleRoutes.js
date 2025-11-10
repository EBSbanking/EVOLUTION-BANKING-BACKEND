// routes/userRoleRoutes.js
import express from 'express';
import {
  createUserRole,
  addRolesToUser,
  removeRolesFromUser,
  getUserRoleByUserId,
  checkUserRoles,
  getAllUserRoles,
  updateUserRole,
  deleteUserRole,
  getUserRolesByBusinessUnit,
  getUsersByRoleName,
  getAccessibleBUsForUser,
  getUserCombinedPermissions
} from '../controllers/UserRoleController.js';

const router = express.Router();

// ✅ Create general user role
router.post('/create', createUserRole);

// ✅ Add roles to existing user
router.post('/add-roles/:userId', addRolesToUser);

// ✅ Remove roles from user
router.post('/remove-roles/:userId', removeRolesFromUser);

// ✅ Update User Role (generic or CSO)
router.put('/update/:userId', updateUserRole);

// ✅ Get user role by USER_ID
router.get('/:userId', getUserRoleByUserId);

// ✅ Check user roles (e.g., validate/verify roles for user)
router.get('/check/:userId', checkUserRoles);

// ✅ Get all user roles
router.get('/', getAllUserRoles);

// ✅ Get user roles by business unit
router.get('/by-business-unit/:buId', getUserRolesByBusinessUnit);

// ✅ Get users by role name
router.get('/users/by-role/:roleName', getUsersByRoleName);

// ✅ Delete user role
router.delete('/:userRoleId', deleteUserRole);

// ✅ Get accessible business units for a user
router.get('/accessible-business-units/:userId', getAccessibleBUsForUser);

// ✅ Get combined permissions for user (from all roles)
router.get('/permissions/combined/:userId', getUserCombinedPermissions);

export default router;