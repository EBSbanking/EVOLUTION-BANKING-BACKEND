import express from 'express';
import { createBranch, createBranches, getBranch, getAllBranches } from '../controllers/BranchController.js';

const router = express.Router();

// Route for creating a department
router.post('/create', createBranch);
router.post('/branchs/bulk', createBranches);

// Route for getting a department
router.get('/branch', getBranch); // For query parameters

router.get('/branches/all', getAllBranches);

export default router;