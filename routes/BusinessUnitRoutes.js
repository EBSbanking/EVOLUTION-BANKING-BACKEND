import express from 'express';
import {
  createBusinessUnit,
  getAllBusinessUnits,
  getBusinessUnitById,
  updateBusinessUnit,
  deleteBusinessUnit
} from '../controllers/BusinessUnitController.js';

import { getAccessibleBUsForUser } from '../controllers/UserRoleController.js'; // ⬅️ Add this import

const router = express.Router();

// Route to create a new business unit
router.post('/create', createBusinessUnit);

// Route to get all business units
router.get('/all', getAllBusinessUnits);

// Route to get a specific business unit by ID
router.get('/business-unit/:BU_ID', getBusinessUnitById);

// Route to update a business unit by ID
router.put('/business-unit/update/:BU_ID', updateBusinessUnit);

// Route to delete a business unit by ID
router.delete('/business-unit/delete/:BU_ID', deleteBusinessUnit);

// ✅ NEW: Route to get accessible business units for a given user
router.get('/accessible/:userId', getAccessibleBUsForUser);

export default router;
