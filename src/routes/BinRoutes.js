// routes/binRoutes.js
import express from 'express';
import binService from '../services/binService.js';
import { authenticate, authorize } from '../middlewares/auth.js';

const router = express.Router();

// ✅ Define all admin role variants
const ADMIN_ROLES = ['ADMIN', 'ADMINISTRATOR', 'SUPER_ADMIN', 'SYSTEM_ADMIN'];

/**
 * GET /api/admin/bins
 * Get all active BINs
 */
router.get('/bins', authenticate, authorize(ADMIN_ROLES), async (req, res) => {
  try {
    const bins = await binService.getAllActiveBINs();
    res.json({ success: true, data: bins });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/bins/:bin
 * Get BIN mapping by BIN
 */
router.get('/bins/:bin', authenticate, authorize(ADMIN_ROLES), async (req, res) => {
  try {
    const mapping = await binService.getBINMapping(req.params.bin);
    if (!mapping) {
      return res.status(404).json({ success: false, error: 'BIN not found' });
    }
    res.json({ success: true, data: mapping });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/admin/bins
 * Create or update BIN mapping
 */
router.post('/bins', authenticate, authorize(ADMIN_ROLES), async (req, res) => {
  try {
    const mapping = await binService.upsertBINMapping(req.body);
    res.json({ success: true, data: mapping });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/bins/validate/:cardNumber
 * Validate card with BIN
 * ✅ This one only requires authentication (no admin role needed)
 */
router.get('/bins/validate/:cardNumber', authenticate, async (req, res) => {
  try {
    const result = await binService.validateCardWithBIN(req.params.cardNumber);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/bins/bank/:bankName
 * Get BINs by bank name
 */
router.get('/bins/bank/:bankName', authenticate, authorize(ADMIN_ROLES), async (req, res) => {
  try {
    const bins = await binService.getBINsByBank(req.params.bankName);
    res.json({ success: true, data: bins });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/bins/scheme/:scheme
 * Get BINs by card scheme
 */
router.get('/bins/scheme/:scheme', authenticate, authorize(ADMIN_ROLES), async (req, res) => {
  try {
    const bins = await binService.getBINsByScheme(req.params.scheme);
    res.json({ success: true, data: bins });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/admin/bins/prepaid
 * Get all prepaid BINs
 */
router.get('/bins/prepaid', authenticate, authorize(ADMIN_ROLES), async (req, res) => {
  try {
    const bins = await binService.getPrepaidBINs();
    res.json({ success: true, data: bins });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;