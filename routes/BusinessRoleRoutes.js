import express from 'express';
import {
  createBusinessRole,
  getBusinessRoleByUserId,
  updateBusinessRole,
  deleteBusinessRole,
  assignBusinessRoleToUser,
  getAllBusinessRoles
} from '../controllers/BusinessRoleController.js';
import verifyToken from '../middlewares/verifyToken.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';
import { authorizeBusinessUnit } from '../middlewares/authorizeBusinessUnit.js';

const router = express.Router();

// ✅ Protected Business Role Routes
router.post('/business-roles',
  verifyToken,
  (req, res, next) => {
    // Explicit admin check using ROLE_MAPPING
    if (req.user.role === ROLE_MAPPING[1].ROLE_NM || req.user.isAdmin) {
      return next();
    }
    res.status(403).json({ 
      success: false,
      message: 'Administrator privileges required',
      requiredRole: ROLE_MAPPING[1].ROLE_NM,
      yourRole: req.user.role
    });
  },
  authorizeBusinessUnit({ 
    accessType: 'ROLE_MANAGEMENT_ACCESS_LVL',
    requireAllBusinessUnits: true 
  }),
  createBusinessRole
);

// ✅ Get all business roles (admin-only)
router.get('/business-roles',
  verifyToken,
  (req, res, next) => {
    if (req.user.isAdmin) return next();
    res.status(403).json({ 
      success: false,
      message: 'Admin access required'
    });
  },
  getAllBusinessRoles
);

// ✅ Business role assignment
router.post('/assign-role',
  verifyToken,
  authorizeBusinessUnit({ 
    accessType: 'ROLE_ASSIGNMENT_ACCESS_LVL'
  }),
  assignBusinessRoleToUser
);

// Other routes with appropriate protection
router.get('/business-roles/:USER_ID', 
  verifyToken,
  authorizeBusinessUnit(),
  getBusinessRoleByUserId
);

router.put('/business-roles/:USER_ID',
  verifyToken,
  authorizeBusinessUnit({
    accessType: 'ROLE_MANAGEMENT_ACCESS_LVL'
  }),
  updateBusinessRole
);

router.delete('/business-roles/:id',
  verifyToken,
  (req, res, next) => {
    if (req.user.isAdmin) return next();
    res.status(403).json({
      success: false,
      message: 'Only administrators can delete roles'
    });
  },
  deleteBusinessRole
);

export default router;