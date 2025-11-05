// routes/userRoleRoutes.js
import express from 'express';
import {
  createUserRole,
  createCustomerServiceOfficer,
  getUserRoleByUserId,
  getAllUserRoles,
  deleteUserRole,
  getAccessibleBUsForUser,
  getCustomerServiceOfficerByUserId,
  updateUserRole   // ✅ added import
} from '../controllers/UserRoleController.js';

const router = express.Router();

// ✅ Create general user role
router.post('/create', createUserRole);

// ✅ Create Customer Service Officer
router.post('/create-cso', createCustomerServiceOfficer);

// ✅ Get Customer Service Officer by USER_ID
router.get('/cso/:userId', getCustomerServiceOfficerByUserId);

// ✅ Update User Role (generic or CSO)
router.put('/update/:userId', updateUserRole);

// ✅ Get user role by USER_ID
router.get('/:userId', getUserRoleByUserId);

// ✅ Get all user roles
router.get('/', getAllUserRoles);

// ✅ Delete user role
router.delete('/:userRoleId', deleteUserRole);

// ✅ Get accessible business units for a user
router.get('/accessible-business-units/:userId', getAccessibleBUsForUser);

export default router;
