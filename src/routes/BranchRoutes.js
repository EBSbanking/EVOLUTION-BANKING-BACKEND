// routes/branchRoutes.js
import express from 'express';
const router = express.Router();
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

// GET all branches with optional query parameters
// URL: /api/branches?includeBusinessUnits=true&organizationName=ACME
router.get('/', getAllBranches);

// GET branches by organization name
// URL: /api/branches/organization/ACME?includeBusinessUnits=true
router.get('/organization/:organizationName', getBranchesByOrganization);

// GET single branch by ID
// URL: /api/branches/507f1f77bcf86cd799439011?includeBusinessUnits=true
router.get('/:id', getBranchById);

// GET branch by branch code
// URL: /api/branches/code/010?includeBusinessUnits=true
router.get('/code/:branchCode', getBranchByCode);

// GET business units for a specific branch
// URL: /api/branches/507f1f77bcf86cd799439011/business-units
router.get('/:id/business-units', getBranchBusinessUnits);

// POST create new branch
// URL: /api/branches
router.post('/branch', createBranch);

// PUT update branch by ID
// URL: /api/branches/507f1f77bcf86cd799439011
router.put('/:id', updateBranch);

// DELETE branch by ID
// URL: /api/branches/507f1f77bcf86cd799439011
router.delete('/:id', deleteBranch);

export default router;