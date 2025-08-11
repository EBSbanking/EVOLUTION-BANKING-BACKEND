import express from 'express';
import {
  createBusinessRole,
  getBusinessRoleByUserId,
  updateBusinessRole,
  deleteBusinessRole,
  assignBusinessRoleToUser,
  getAllBusinessRoles
} from '../controllers/businessRoleController.js'; // adjust path if needed

import { populateBusinessUnitMapping } from '../constants/roleMapping.js';
import { authenticate, hasRole } from '../middlewares/authMiddleware.js'; // assuming you have auth middleware

const router = express.Router();

// Middleware: Populate Business Unit Mapping (called on all routes here)
router.use(async (req, res, next) => {
  try {
    await populateBusinessUnitMapping();
    next();
  } catch (error) {
    console.error("Error populating business unit mapping:", error);
    res.status(500).json({ 
      message: "Error populating business unit mapping", 
      error: error.message 
    });
  }
});

// Middleware: Authentication for all routes
router.use(authenticate); // only if needed for all routes

// @route   POST /api/business-roles
// @desc    Create a new business role
router.post('/create', createBusinessRole);

// @route   GET /api/business-roles
// @desc    Get all business roles with pagination
router.get('/', getAllBusinessRoles);

// @route   GET /api/business-roles/:USER_ID
// @desc    Get a specific business role by USER_ID
router.get('/:USER_ID', getBusinessRoleByUserId);

// @route   PUT /api/business-roles/:USER_ID
// @desc    Update a business role by USER_ID
router.put('/:USER_ID', updateBusinessRole);

// @route   DELETE /api/business-roles/:id
// @desc    Delete a business role by _id
router.delete('/:id', deleteBusinessRole);

// @route   POST /api/business-roles/assign
// @desc    Assign a business role to a user
router.post('/assign', assignBusinessRoleToUser);

export default router;
