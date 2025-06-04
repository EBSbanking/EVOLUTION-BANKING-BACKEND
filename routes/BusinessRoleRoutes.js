import express from 'express';
import { createBusinessRole, getBusinessRoleByUserId, updateBusinessRole, deleteBusinessRole, assignBusinessRoleToUser, getAllBusinessRoles } from '../controllers/BusinessRoleController.js'; // Import controllers

const router = express.Router(); // Initialize router

// Define routes
router.post('/business-roles', createBusinessRole);  // Create BusinessRole
router.get('/business-roles/:USER_ID', getBusinessRoleByUserId);  // Get BusinessRole by User ID
router.put('/business-roles/:id', updateBusinessRole);  // Update BusinessRole
router.delete('/business-roles/:id', deleteBusinessRole);  // Delete BusinessRole
router.post('/assign-role', assignBusinessRoleToUser);  // Assign BusinessRole to User
router.get('/business-roles', getAllBusinessRoles);  // Get all BusinessRoles

export default router;  // Export router to use in server.js or app.js
