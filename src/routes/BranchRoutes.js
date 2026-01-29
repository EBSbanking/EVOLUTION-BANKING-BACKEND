import express from 'express';
import {
  createBranch,
  getAllBranches,
  getBranchById,
  getBranchByCode,
  updateBranch,
  deleteBranch,
  getBranchBusinessUnits,
  getBranchesByOrganization
} from '../controllers/BranchController.js';

const router = express.Router();

// OPTION A: If you want /api/branches
router.route('/')
  .get(getAllBranches)
  .post(createBranch);

// OPTION B: If you want /api/branch/branch (duplicate path)
router.route('/branch')
  .post(createBranch); // Add this line

// Rest of your routes
router.route('/code/:branchCode')
  .get(getBranchByCode);

router.route('/organization/:organizationName')
  .get(getBranchesByOrganization);

router.route('/:id')
  .get(getBranchById)
  .put(updateBranch)
  .delete(deleteBranch);

router.route('/:id/business-units')
  .get(getBranchBusinessUnits);

export default router;