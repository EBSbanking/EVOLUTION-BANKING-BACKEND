import express from 'express';
import {
  createDrawerReassignment,
  getAllDrawerReassignments,
  getDrawerReassignmentById,
  updateDrawerReassignment,
  deleteDrawerReassignment
} from '../controllers/DrawerReassignmentController.js';

const router = express.Router();

// Route to create a new Drawer Reassignment entry
router.post('/', createDrawerReassignment);

// Route to get all Drawer Reassignment entries
router.get('/', getAllDrawerReassignments);

// Route to get a specific Drawer Reassignment entry by ID
router.get('/:id', getDrawerReassignmentById);

// Route to update a Drawer Reassignment entry by ID
router.put('/:id', updateDrawerReassignment);

// Route to delete a Drawer Reassignment entry by ID
router.delete('/:id', deleteDrawerReassignment);

export default router;
