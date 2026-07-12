// src/routes/chartofAccountRoutes.js
import express from 'express';
import { chartofAccountController } from '../controllers/chartofAccountController.js';

const router = express.Router();

// ============================================
// 🔥 NEW: Specific routes (must come before /:id)
// ============================================

// Get the full hierarchical tree
router.get('/tree', chartofAccountController.getTree);

// Summary and analytics
router.get('/summary/balance', chartofAccountController.getBalanceSummary);
router.get('/summary/mapping', chartofAccountController.getMappingStatistics);

// Clone COA for new branch
router.post('/clone-branch', chartofAccountController.cloneCOAForBranch);

// ============================================
// CRUD Routes (generic)
// ============================================

// Create account
router.post('/', chartofAccountController.createAccount);

// Get all accounts (flat list with pagination)
router.get('/', chartofAccountController.getAccounts);

// Get single account by ID (must come after specific routes)
router.get('/:id', chartofAccountController.getAccount);

// Update account
router.put('/:id', chartofAccountController.updateAccount);

// Delete account (soft delete)
router.delete('/:id', chartofAccountController.deleteAccount);

// ============================================
// Special Operations
// ============================================

// Update balance
router.post('/:id/balance', chartofAccountController.updateBalance);

// Map to GL account
router.post('/:id/map-gl', chartofAccountController.mapToGLAccount);

// Bulk create accounts
router.post('/bulk/create', chartofAccountController.bulkCreateAccounts);

export default router;