// src/routes/ModuleRoutes.js
import express from 'express';
import { authenticate, isAdmin } from '../middlewares/auth.js'; // 👈 singular
import {
  getAllModules,
  getRoles,
  createModule,
  updateModule,
  deleteModule,
  updateModuleRoles,
  getUserModules,
} from '../controllers/ModuleController.js';

const router = express.Router();

router.get('/me', authenticate, getUserModules);
router.get('/', authenticate, isAdmin, getAllModules);
router.get('/roles', authenticate, isAdmin, getRoles);
router.post('/', authenticate, isAdmin, createModule);
router.put('/:id', authenticate, isAdmin, updateModule);
router.delete('/:id', authenticate, isAdmin, deleteModule);
router.put('/:id/roles', authenticate, isAdmin, updateModuleRoles);

export default router;