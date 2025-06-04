import express from 'express';
import AutoReclassifyInformationController, { 
  createReclassification, 
  getReclassificationById, 
  updateReclassification, 
  deleteReclassification, 
  getAllReclassifications 
} from '../controllers/AutoReclassifyInformationController.js'; // Fixed syntax

const router = express.Router(); // Initialize router

router.post('/', createReclassification);
router.get('/', getAllReclassifications);
router.get('/:id', getReclassificationById);
router.put('/:id', updateReclassification);
router.delete('/:id', deleteReclassification);

export default router; // Use ES Module export
