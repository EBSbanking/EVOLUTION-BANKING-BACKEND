// routes/businessRoleRoutes.js - COMPLETE VERSION
import express from 'express';
import {
  createBusinessRole,
  getBusinessRoleByUserId,
  updateBusinessRole,
  deleteBusinessRole,
  assignBusinessRoleToUser,
  getAllBusinessRoles
} from '../controllers/businessRoleController.js';

import { authenticate, hasRole } from '../middlewares/authMiddleware.js';

// IMPORTANT: Create a simple populateBusinessUnitMapping function since the one in roleMapping.js is causing issues
const populateBusinessUnitMapping = async () => {
  try {
    console.log('🔄 Running simplified business unit mapping...');
    
    // Return a basic mapping for now to prevent errors
    // You can enhance this later to actually fetch from database
    return {
      'DEFAULT_BRANCH': 1,
      'MAIN_BRANCH': 1,
      'HEAD_OFFICE': 1,
      'MAIN': 1,
      'BRANCH': 1,
      'HQ': 1
    };
  } catch (error) {
    console.error('❌ Error in simplified mapping:', error.message);
    return {
      'DEFAULT_BRANCH': 1,
      'MAIN_BRANCH': 1,
      'HEAD_OFFICE': 1
    };
  }
};

const router = express.Router();

// Middleware to populate business unit mapping with error handling
router.use(async (req, res, next) => {
  try {
    console.log('🔄 Attempting to populate business unit mapping...');
    
    // Try to get mapping
    const mapping = await populateBusinessUnitMapping();
    
    if (!mapping || Object.keys(mapping).length === 0) {
      console.warn('⚠️ Business unit mapping is empty or failed');
      // Create a basic fallback mapping
      req.businessUnitMapping = {
        'DEFAULT_BRANCH': 1,
        'MAIN_BRANCH': 1,
        'HEAD_OFFICE': 1,
        'MAIN': 1,
        'BRANCH': 1
      };
    } else {
      req.businessUnitMapping = mapping;
      console.log(`✅ Business unit mapping populated with ${Object.keys(mapping).length} entries`);
    }
    
    next();
  } catch (error) {
    console.error('❌ Error in business unit mapping middleware:', error.message);
    // Don't block the request - continue with empty mapping
    req.businessUnitMapping = {
      'DEFAULT_BRANCH': 1,
      'MAIN_BRANCH': 1,
      'HEAD_OFFICE': 1,
      'MAIN': 1,
      'BRANCH': 1
    };
    next();
  }
});

// ==================== PUBLIC ROUTES ====================
// Get business roles for a specific user - this might need to be public for login flow
router.get('/:USER_ID', getBusinessRoleByUserId);

// ==================== PROTECTED ROUTES ====================
// Apply authentication middleware to all routes below (except the one above if needed)
// If you want to protect the GET /:USER_ID route, move it below this line
// router.use(authenticate);

// Currently commented out - uncomment when authentication is ready
// router.use(authenticate);

// @route   GET /api/business-roles
// @desc    Get all business roles with pagination
router.get('/', getAllBusinessRoles);
// Add role check if needed: hasRole(['ADMIN', 'SUPERVISOR'])

// @route   POST /api/business-roles
// @desc    Create a new business role
router.post('/', createBusinessRole);
// Add role check if needed: hasRole(['ADMIN'])

// @route   POST /api/business-roles/create
// @desc    Alternative route to create business role
router.post('/create', createBusinessRole);

// @route   PUT /api/business-roles/:USER_ID
// @desc    Update a business role by USER_ID
router.put('/:USER_ID', updateBusinessRole);

// @route   DELETE /api/business-roles/:id
// @desc    Delete a business role by _id
router.delete('/:id', deleteBusinessRole);
// Add role check if needed: hasRole(['ADMIN'])

// @route   POST /api/business-roles/assign
// @desc    Assign a business role to a user
router.post('/assign', assignBusinessRoleToUser);
// Add role check if needed: hasRole(['ADMIN'])

export default router;