// src/routes/CustomerTypeRoutes.js - TEMPORARY FIX
import express from 'express';
import {
  createCustomerType,
  getAllCustomerTypes,
  getCustomerTypeById,
  updateCustomerType,
  deleteCustomerType,
  activateCustomerType,
  deactivateCustomerType
} from '../controllers/customerTypeController.js';

const router = express.Router();

// Temporarily remove protect middleware
// import { protect, authorize } from '../middleware/authMiddleware.js';

// Routes WITHOUT authentication (temporary)
router.route('/')
  .get(getAllCustomerTypes)
  .post(createCustomerType); // Line 30 - removed protect

router.route('/:id')
  .get(getCustomerTypeById)
  .put(updateCustomerType)
  .delete(deleteCustomerType);

router.put('/:id/activate', activateCustomerType);
router.put('/:id/deactivate', deactivateCustomerType);

export default router;