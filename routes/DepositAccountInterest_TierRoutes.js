// DepositAccountInterestRoute.js
import express from 'express';
import { 
  createTier, 
  getAllTiers, 
  getTierById, 
  updateTier, 
  deleteTier,
  getTiersByProductId,
  calculateAndApplyTieredInterest
} from '../controllers/DepositAccountInterest_TierController.js';

const router = express.Router();

// Routes for Deposit Account Interest Tiers
router.post('/create', createTier);
router.get('/', getAllTiers);
router.get('/:id', getTierById);
router.get('/product/:productId', getTiersByProductId); // ✅ ADD THIS ROUTE
router.put('/:id', updateTier);
router.delete('/:id', deleteTier);
router.post('/calculate-interest', calculateAndApplyTieredInterest); // Optional: if you have this function

export default router;