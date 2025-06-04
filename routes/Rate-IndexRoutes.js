import express from 'express';
import { createRateIndex,  updateRateIndex, getAllRateIndices, getRateIndexById, deleteRateIndex } from '../controllers/Rate-IndexController.js'; // Import controller functions

const router = express.Router();

// Create a new rate index
router.post('/create', createRateIndex);

// Update an existing rate index
router.put('/update/:id', updateRateIndex);

// Get all rate indices
router.get('/rate-index', getAllRateIndices);

// Get a specific rate index by ID
router.get('/:id', getRateIndexById);

// Delete a rate index by ID
router.delete('/delete/:id', deleteRateIndex);




export default router;
