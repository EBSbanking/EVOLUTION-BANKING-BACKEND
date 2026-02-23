// src/routes/chartofAccountRoutes.js
import express from 'express';
import { chartofAccountController } from '../controllers/chartofAccountController.js';

const router = express.Router();

// ============================================
// CRUD Routes
// ============================================
router.post('/', chartofAccountController.createAccount);
router.get('/', chartofAccountController.getAccounts);
router.get('/summary/balance', chartofAccountController.getBalanceSummary);
router.get('/summary/mapping', chartofAccountController.getMappingStatistics);
router.get('/:id', chartofAccountController.getAccount);
router.put('/:id', chartofAccountController.updateAccount);
router.delete('/:id', chartofAccountController.deleteAccount);

// ============================================
// 🔥 NEW: Clone Routes
// ============================================
router.post('/clone-branch', chartofAccountController.cloneCOAForBranch);

// ============================================
// Special Operations
// ============================================
router.post('/:id/balance', chartofAccountController.updateBalance);
router.post('/:id/map-gl', chartofAccountController.mapToGLAccount);
router.post('/bulk/create', chartofAccountController.bulkCreateAccounts);

export default router;