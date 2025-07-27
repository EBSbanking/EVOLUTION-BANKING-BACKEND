import express from 'express';
import {
  createUserRole,
  createCustomerServiceOfficer,
  getUserRoleByUserId,
  getAllUserRoles,
  deleteUserRole,
  getAccessibleBUsForUser
} from '../controllers/UserRoleController.js';

const router = express.Router();

router.post('/create', createUserRole);
router.post('/create-cso', createCustomerServiceOfficer);
router.get('/:userId', getUserRoleByUserId);
router.get('/', getAllUserRoles);
router.delete('/:userRoleId', deleteUserRole);

// ✅ This is the clean standard way:
router.get('/accessible-business-units/:userId', getAccessibleBUsForUser);

export default router;
