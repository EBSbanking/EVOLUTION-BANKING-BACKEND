// routes/BranchRoutes.js
import express from 'express';

import {
  createBranch,
  getAllBranches,
  getBranchById,
  updateBranch,
  deleteBranch,
  getBranchBusinessUnits,
  getBranchesByOrganization,
  getUserBranches,
  getBusinessUnitById,
  getBusinessUnitByBU_ID
} from '../controllers/BranchController.js';

const router = express.Router();


// Branch endpoints
router.post('/branch', createBranch);
router.get('/branches', getAllBranches);
router.get('/branch/:id', getBranchById);
router.put('/branch/:id', updateBranch);
router.delete('/branch/:id', deleteBranch);
router.get('/branch/:id/business-units', getBranchBusinessUnits);
router.get('/branches/organization/:organizationName', getBranchesByOrganization);
router.get('/user-branches', getUserBranches);

// Business unit endpoints (if needed)
router.get('/business-units/:id', getBusinessUnitById);
router.get('/business-units/business-unit/:bu_id', getBusinessUnitByBU_ID);

export default router;