// src/routes/UserRoleRoutes.js
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
  getUserCombinedPermissions,
  getUsersByRoleId
} from '../controllers/UserRoleController.js';

const router = express.Router();

// ========== DEBUG & TEST ROUTES FIRST ==========
// Test if router is working
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'UserRoleRoutes router is working!',
    timestamp: new Date().toISOString()
  });
});

// List all routes in this router
router.get('/list-routes', (req, res) => {
  const routes = router.stack
    .filter(layer => layer.route)
    .map(layer => ({
      method: Object.keys(layer.route.methods)[0].toUpperCase(),
      path: layer.route.path
    }));
  
  res.json({
    success: true,
    message: 'Routes in UserRoleRouter',
    basePath: '/api/user-roles',
    routes: routes,
    total: routes.length
  });
});

// ========== MAIN ROUTES ==========

// CREATE & UPDATE
router.post('/create', createUserRole);
router.post('/add-roles/:userId', addRolesToUser);
router.post('/remove-roles/:userId', removeRolesFromUser);
router.put('/update/:userId', updateUserRole);

// READ
router.get('/:userId', getUserRoleByUserId);
router.get('/check/:userId', checkUserRoles);
router.get('/', getAllUserRoles);
router.get('/by-business-unit/:buId', getUserRolesByBusinessUnit);

// READ - Users by role criteria
router.get('/users/by-role/:roleName', getUsersByRoleName);
router.get('/users/by-role-id/:roleId', getUsersByRoleId);
router.get('/users/role-id/:roleId', getUsersByRoleId);

// DELETE
router.delete('/:userRoleId', deleteUserRole);

// PERMISSIONS & ACCESS
router.get('/accessible-business-units/:userId', getAccessibleBUsForUser);
router.get('/permissions/combined/:userId', getUserCombinedPermissions);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'UserRoleRoutes is healthy',
    timestamp: new Date().toISOString()
  });
});

export default router;