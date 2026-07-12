// routes/banks.js
import { Router } from 'express';
import {
  getAllBanks,
  getBank,
  createBank,
  updateBank,
  deleteBank,
  getActiveBanks,
  searchBanks,
  getBankByCode,
  getBankByName,
  validateBankCode,
  fetchBanksFromPrembly,
  syncBanksFromPrembly,
  getBankSyncStatus
} from '../controllers/BankController.js';

// Optional authentication middleware (replace with your own)
// import { protect, admin } from '../middleware/auth.js';

const router = Router();

// ──────────────────────────────────────────────
//  Public Routes (no authentication required)
// ──────────────────────────────────────────────

// Get all banks (paginated, filterable)
router.get('/', getAllBanks);

// Get active banks (for dropdowns / select lists)
router.get('/active/list', getActiveBanks);

// Search banks by name, code, or long_code
router.get('/search/:query', searchBanks);

// Get a bank by its code (e.g., "044")
router.get('/code/:code', getBankByCode);

// Get a bank by name (partial match)
router.get('/name/:name', getBankByName);

// Validate a bank code (returns valid/invalid)
router.post('/validate', validateBankCode);

// Get single bank by ID
router.get('/:id', getBank);

// ──────────────────────────────────────────────
//  Prembly Integration Routes
// ──────────────────────────────────────────────

// Fetch banks from Prembly (read‑only, no DB storage)
router.get('/fetch-from-prembly', fetchBanksFromPrembly);

// Sync banks from Prembly to the database (upsert)
router.post('/sync-from-prembly', syncBanksFromPrembly);   // protect, admin

// Get sync status (counts, last update, etc.)
router.get('/sync-status', getBankSyncStatus);

// ──────────────────────────────────────────────
//  Admin Routes (manual CRUD operations)
// ──────────────────────────────────────────────

// Create a new bank (manual)
router.post('/', createBank);   // protect, admin

// Update an existing bank
router.put('/:id', updateBank);  // protect, admin

// Delete a bank
router.delete('/:id', deleteBank);  // protect, admin

export default router;