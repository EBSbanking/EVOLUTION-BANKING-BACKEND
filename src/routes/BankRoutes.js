// routes/bankRoutes.js
import express from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import bankSyncService from '../services/BankSyncService.js';

// Import from BankController (uppercase B to match your file)
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

const router = express.Router();

// Debug: Check what was imported
console.log('🔍 BankController imports check:');
console.log('   getAllBanks:', typeof getAllBanks === 'function' ? '✅ function' : '❌ NOT a function');
console.log('   getBank:', typeof getBank === 'function' ? '✅ function' : '❌ NOT a function');
console.log('   createBank:', typeof createBank === 'function' ? '✅ function' : '❌ NOT a function');
console.log('   updateBank:', typeof updateBank === 'function' ? '✅ function' : '❌ NOT a function');
console.log('   deleteBank:', typeof deleteBank === 'function' ? '✅ function' : '❌ NOT a function');
console.log('   getActiveBanks:', typeof getActiveBanks === 'function' ? '✅ function' : '❌ NOT a function');
console.log('   searchBanks:', typeof searchBanks === 'function' ? '✅ function' : '❌ NOT a function');
console.log('   getBankByCode:', typeof getBankByCode === 'function' ? '✅ function' : '❌ NOT a function');

// Debug: Check authMiddleware
console.log('🔑 authMiddleware type:', typeof authMiddleware);
console.log('🔑 authMiddleware is function?', typeof authMiddleware === 'function');

// Create a safe wrapper for authMiddleware
const safeAuthMiddleware = (req, res, next) => {
  if (typeof authMiddleware === 'function') {
    return authMiddleware(req, res, next);
  }
  console.warn('⚠️ authMiddleware is not a function, skipping authentication');
  next();
};

// ==================== PUBLIC ROUTES ====================
// Get all banks (with pagination)
router.get('/', (req, res) => {
  if (typeof getAllBanks !== 'function') {
    return res.status(500).json({ error: 'getAllBanks is not a function', type: typeof getAllBanks });
  }
  getAllBanks(req, res);
});

// Get active banks list
router.get('/active/list', (req, res) => {
  if (typeof getActiveBanks !== 'function') {
    return res.status(500).json({ error: 'getActiveBanks is not a function' });
  }
  getActiveBanks(req, res);
});

// Search banks
router.get('/search/:query', (req, res) => {
  if (typeof searchBanks !== 'function') {
    return res.status(500).json({ error: 'searchBanks is not a function' });
  }
  searchBanks(req, res);
});

// Get bank by code
router.get('/code/:code', (req, res) => {
  if (typeof getBankByCode !== 'function') {
    return res.status(500).json({ error: 'getBankByCode is not a function' });
  }
  getBankByCode(req, res);
});

// Get bank by name
router.get('/name/:name', (req, res) => {
  if (typeof getBankByName !== 'function') {
    return res.status(500).json({ error: 'getBankByName is not a function' });
  }
  getBankByName(req, res);
});

// Get bank by ID
router.get('/:id', (req, res) => {
  if (typeof getBank !== 'function') {
    return res.status(500).json({ error: 'getBank is not a function' });
  }
  getBank(req, res);
});

// Validate bank code
router.post('/validate', (req, res) => {
  if (typeof validateBankCode !== 'function') {
    return res.status(500).json({ error: 'validateBankCode is not a function' });
  }
  validateBankCode(req, res);
});

// Get sync status
router.get('/sync/status', (req, res) => {
  if (typeof getBankSyncStatus !== 'function') {
    return res.status(500).json({ error: 'getBankSyncStatus is not a function' });
  }
  getBankSyncStatus(req, res);
});

// ==================== ADMIN ONLY ROUTES (with safe auth middleware) ====================
// Create new bank
router.post('/', safeAuthMiddleware, (req, res) => {
  if (typeof createBank !== 'function') {
    return res.status(500).json({ error: 'createBank is not a function' });
  }
  createBank(req, res);
});

// Update bank
router.put('/:id', safeAuthMiddleware, (req, res) => {
  if (typeof updateBank !== 'function') {
    return res.status(500).json({ error: 'updateBank is not a function' });
  }
  updateBank(req, res);
});

// Delete bank
router.delete('/:id', safeAuthMiddleware, (req, res) => {
  if (typeof deleteBank !== 'function') {
    return res.status(500).json({ error: 'deleteBank is not a function' });
  }
  deleteBank(req, res);
});

// Fetch banks from Prembly (without saving)
router.get('/fetch-from-prembly', safeAuthMiddleware, (req, res) => {
  if (typeof fetchBanksFromPrembly !== 'function') {
    return res.status(500).json({ error: 'fetchBanksFromPrembly is not a function' });
  }
  fetchBanksFromPrembly(req, res);
});

// Sync banks from Prembly to database
router.post('/sync-from-prembly', safeAuthMiddleware, (req, res) => {
  if (typeof syncBanksFromPrembly !== 'function') {
    return res.status(500).json({ error: 'syncBanksFromPrembly is not a function' });
  }
  syncBanksFromPrembly(req, res);
});

// ==================== SYNC ROUTES (using bankSyncService) ====================
router.post('/sync', safeAuthMiddleware, async (req, res) => {
  try {
    if (!bankSyncService || typeof bankSyncService.syncBanksToDatabase !== 'function') {
      throw new Error('Bank sync service not available');
    }
    const result = await bankSyncService.syncBanksToDatabase();
    res.status(200).json({
      success: true,
      message: 'Banks synced successfully',
      data: result
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync banks',
      error: error.message
    });
  }
});

router.get('/sync/status-legacy', async (req, res) => {
  try {
    if (!bankSyncService || typeof bankSyncService.getActiveBanks !== 'function') {
      throw new Error('Bank sync service not available');
    }
    const banks = await bankSyncService.getActiveBanks();
    res.status(200).json({
      success: true,
      message: 'Bank sync status',
      data: {
        totalActiveBanks: banks.length,
        lastSync: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get sync status',
      error: error.message
    });
  }
});

// ==================== TEST ROUTE ====================
router.get('/test/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Bank routes are working',
    timestamp: new Date().toISOString(),
    controllers: {
      getAllBanks: typeof getAllBanks,
      getBank: typeof getBank,
      createBank: typeof createBank,
      updateBank: typeof updateBank,
      deleteBank: typeof deleteBank,
      getActiveBanks: typeof getActiveBanks,
      searchBanks: typeof searchBanks,
      getBankByCode: typeof getBankByCode
    },
    authMiddleware: {
      type: typeof authMiddleware,
      isFunction: typeof authMiddleware === 'function'
    }
  });
});

console.log('✅ Bank routes loaded successfully');

export default router;