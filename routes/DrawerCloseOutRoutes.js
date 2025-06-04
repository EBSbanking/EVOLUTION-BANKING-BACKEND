import express from 'express';
import {
  createDrawerCloseOut,
  getAllDrawerCloseOuts,
  getDrawerCloseOutById,
  updateDrawerCloseOut,
  deleteDrawerCloseOut,
} from '../controllers/DrawerCloseOutController.js';

const router = express.Router();

// Route to create a new Drawer CloseOut record
router.post('/create', createDrawerCloseOut);

// Route to get all Drawer CloseOut records
router.get('/', getAllDrawerCloseOuts);

// Route to get a single Drawer CloseOut record by ID
router.get('/:id', getDrawerCloseOutById);

// Route to update a Drawer CloseOut record by ID
router.put('/:id', updateDrawerCloseOut);

// Route to delete a Drawer CloseOut record by ID
router.delete('/:id', deleteDrawerCloseOut);

export default router;
