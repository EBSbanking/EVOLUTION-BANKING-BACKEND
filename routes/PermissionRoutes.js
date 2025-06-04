import express from 'express';
import { createPermissionForRole, getPermissionsForRole } from '../controllers/PermissionsController.js';

const router = express.Router();

// Route to create a permission for a role
router.post('/create', createPermissionForRole);

// Route to fetch permissions for a role by roleId
router.get('/:roleId', getPermissionsForRole);

export default router;
