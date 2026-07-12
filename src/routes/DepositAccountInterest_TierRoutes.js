// routes/DepositAccountInterestRoute.js
import express from 'express';
import { 
  createTier,
  getAllTiers,
  getTierById,
  getTierByTierId,
  getTiersByProductType,
  updateTier,
  deleteTier,
  bulkCreateTiers,
  getApplicableTierForAccount,
  getTierSummary,
  searchTiers,
  getTierStatistics,
  calculateAndApplyTieredInterest,
  applyTieredInterestToAllAccounts
} from '../controllers/DepositAccountInterest_TierController.js';
import { authenticate } from '../middlewares/auth.js';

const router = express.Router();

// ============================================================
// PUBLIC ROUTES (No authentication required)
// ============================================================

// Create tier
router.post('/', createTier);

// ============================================================
// PROTECTED ROUTES (Authentication required)
// ============================================================

// ========== GET ROUTES ==========

// Get all tiers (with filters: ?product_type=SAVINGS&is_active=true)
router.get('/', authenticate, getAllTiers);

// Get tier by ID (database primary key)
router.get('/:id', authenticate, getTierById);

// Get tier by tier ID (custom tier identifier)
router.get('/tier/:tierId', authenticate, getTierByTierId);

// Get tiers by product type (PRODUCT_TYPE like SAVINGS, TERM_DEPOSIT)
router.get('/product/:productType', authenticate, getTiersByProductType);

// Get tier summary by product type
router.get('/summary/:productType', authenticate, getTierSummary);

// Get tier statistics (overall summary)
router.get('/stats/summary', authenticate, getTierStatistics);

// Search tiers with filters
router.get('/search', authenticate, searchTiers);

// Get applicable tier for an account
router.get('/account/:accountId', authenticate, getApplicableTierForAccount);

// ========== UPDATE & DELETE ROUTES ==========

// Update tier
router.put('/:id', authenticate, updateTier);

// Delete tier
router.delete('/:id', authenticate, deleteTier);

// ========== BULK OPERATIONS ==========

// Bulk create tiers
router.post('/bulk', authenticate, bulkCreateTiers);

// ========== INTEREST CALCULATION ROUTES ==========

// Calculate and apply tiered interest to all accounts
router.post('/apply-interest', authenticate, calculateAndApplyTieredInterest);

// Apply tiered interest to all accounts (alias)
router.post('/apply', authenticate, applyTieredInterestToAllAccounts);

export default router;