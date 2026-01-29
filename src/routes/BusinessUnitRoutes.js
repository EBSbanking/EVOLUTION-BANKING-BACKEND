// routes/businessUnitRoutes.js
import express from 'express';
import {
  getAllBusinessUnits,
  getBusinessUnitById,
  getBusinessUnitByBuId,
  createBusinessUnit,       // Standalone business unit creation
  updateBusinessUnit,
  deleteBusinessUnit,
  getBusinessUnitsByStatus,
  searchBusinessUnits,
  getUnassignedBusinessUnits
} from '../controllers/BusinessUnitController.js';

const router = express.Router();

// Business Unit routes
router.get('/', getAllBusinessUnits);
router.get('/unassigned', getUnassignedBusinessUnits);
router.get('/search/:query', searchBusinessUnits);
router.get('/status/:status', getBusinessUnitsByStatus);
router.get('/bu-id/:buId', getBusinessUnitByBuId);
router.get('/:id', getBusinessUnitById);
router.post('/', createBusinessUnit);  // Standalone business unit
router.put('/:id', updateBusinessUnit);
router.delete('/:id', deleteBusinessUnit);

export default router;