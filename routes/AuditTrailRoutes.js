import express from 'express';
import {
    createAuditTrail,
    getAllAuditTrails,
    getAuditTrailById,
    updateAuditTrail,
    deleteAuditTrail
} from '../controllers/AudiTrailController.js';

const router = express.Router();

// Create a new audit trail entry
router.post('/', createAuditTrail);

// Get all audit trail entries
router.get('/', getAllAuditTrails);

// Get a single audit trail entry by ID
router.get('/:id', getAuditTrailById);

// Update an audit trail entry
router.put('/:id', updateAuditTrail);

// Delete an audit trail entry
router.delete('/:id', deleteAuditTrail);

export default router;
