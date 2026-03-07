// routes/ThriftSettingsRoutes.js
import express from 'express';
import ThriftSettingsController from '../controllers/ThriftSettingsController.js';

const router = express.Router();

// ============================================
// SETTINGS MANAGEMENT ROUTES
// ============================================

// Get all settings
router.get('/settings', ThriftSettingsController.getAllSettings);

// Get specific GL accounts for thrift
router.get('/settings/gl-accounts', ThriftSettingsController.getThriftGLAccounts);

// Get settings for thrift account creation
router.get('/settings/account-creation', ThriftSettingsController.getThriftAccountSettings);

// Get single setting by key
router.get('/settings/:key', ThriftSettingsController.getSettingByKey);

// Create or update a setting
router.put('/settings/:key', ThriftSettingsController.createOrUpdateSetting);
router.post('/settings/:key', ThriftSettingsController.createOrUpdateSetting); // Alternative

// Batch update multiple settings
router.post('/settings/batch', ThriftSettingsController.batchUpdateSettings);

// Delete a setting
router.delete('/settings/:key', ThriftSettingsController.deleteSetting);

// Initialize default settings
router.post('/settings/init/default', ThriftSettingsController.initializeDefaultSettings);

export default router;