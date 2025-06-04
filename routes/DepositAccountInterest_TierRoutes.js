// DepositAccountInterestRoute.js
import express from 'express';
import { createTier, getAllTiers, getTierById, updateTier , deleteTier } from '../controllers/DepositAccountInterest_TierController.js';

const router = express.Router();

// Routes for Deposit Account Interest Tiers
router.post('/create', createTier);  // Use createInterestTier here
router.get('/', getAllTiers);
router.get('/:id', getTierById);
router.put('/:id', updateTier);
router.delete('/:id', deleteTier);

export default router;
