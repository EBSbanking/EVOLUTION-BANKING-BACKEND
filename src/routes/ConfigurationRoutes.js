// src/routes/configurationRoutes.js
import express from 'express';
import {
  getConfigurations,
  getConfiguration,
  updateConfiguration,
  getLoginSettings,
  updateLoginSettings,
  getCategories
} from '../controllers/ConfigurationController.js';
import { authenticate, authorize } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', authenticate, getConfigurations);
router.get('/categories', authenticate, getCategories);
router.get('/login-settings', authenticate, authorize(['Administrator']), getLoginSettings);
router.get('/:key', authenticate, getConfiguration);

router.put('/', authenticate, authorize(['Administrator']), updateConfiguration);
router.put('/login-settings', authenticate, authorize(['Administrator']), updateLoginSettings);

export default router;