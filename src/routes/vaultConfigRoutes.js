// src/routes/vaultConfigRoutes.js - CORRECTED VERSION
import express from 'express';
import VaultConfigController from '../controllers/VaultConfigController.js';
import { authenticate, validatePermission } from '../middlewares/authMiddleware.js';

const router = express.Router();

// ✅ CORRECT: Pass middleware as reference (no parentheses)
router.get('/:id', authenticate, VaultConfigController.getVaultConfiguration);
router.put('/:id', authenticate, validatePermission('vault_config_write'), VaultConfigController.setVaultConfiguration);
router.post('/:id/reset', authenticate, validatePermission('vault_config_write'), VaultConfigController.resetVaultConfiguration);

// ✅ CORRECT: Category-based configurations
router.get('/category/:category/template', authenticate, VaultConfigController.getConfigurationTemplate);
router.put('/category/:category', authenticate, validatePermission('vault_config_write'), VaultConfigController.setConfigurationByCategory);

// ✅ CORRECT: Default configurations and statistics
router.get('/defaults/all', authenticate, VaultConfigController.getDefaultConfigurations);
router.get('/statistics/overview', authenticate, VaultConfigController.getConfigurationStatistics);

export default router;