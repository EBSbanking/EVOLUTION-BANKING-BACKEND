import express from 'express';
import { createDrawerUserRole, getAllDrawerUserRoles, getDrawerUserRoleById, updateDrawerUserRole, deleteDrawerUserRole } from '../controllers/DrawerUserRoleController.js';

const router = express.Router();

// Routes for DrawerUserRole
router.post('/drawerUserRole', createDrawerUserRole); // Create a new Drawer User Role
router.get('/drawerUserRoles', getAllDrawerUserRoles); // Get all Drawer User Roles
router.get('/drawerUserRole/:id', getDrawerUserRoleById); // Get a Drawer User Role by ID
router.put('/drawerUserRole/:id', updateDrawerUserRole); // Update a Drawer User Role by ID
router.delete('/drawerUserRole/:id', deleteDrawerUserRole); // Delete a Drawer User Role by ID

export default router;
