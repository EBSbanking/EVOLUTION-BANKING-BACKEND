// pco_banking_backend/routes/DepositAccountInterest_TierRoutes.js
import express from 'express';  // Ensure you import express

import {
  createTier,
  getAllTiers,
  getTierById,
  updateTier,
  deleteTier
} from '../controllers/DepositAccountInterest_TierController.js';

const router = express.Router();

// Routes for Deposit Account Interest Tiers
router.post('/', createTier);  // Create a new tier
router.get('/', getAllTiers);  // Get all tiers
router.get('/:id', getTierById);  // Get a tier by ID
router.put('/:id', updateTier);  // Update a tier by ID
router.delete('/:id', deleteTier);  // Delete a tier by ID

export default router;
