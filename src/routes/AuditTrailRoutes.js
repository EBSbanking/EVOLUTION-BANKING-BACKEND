import express from 'express';
import {
    createAuditTrail,
    getAllAuditTrails,
    getAuditTrailById,
    updateAuditTrail,
    deleteAuditTrail,
    archiveAuditTrail,
    restoreAuditTrail // ✅ optional: if you want to bring it back
} from '../controllers/AudiTrailController.js';

const router = express.Router();

// ✅ Create a new audit trail entry
router.post('/', createAuditTrail);

// ✅ Get all audit trail entries (unarchived by default, supports dateFrom and dateTo query params)
router.get('/', getAllAuditTrails);

// ✅ Get a single audit trail entry by ID
router.get('/:id', getAuditTrailById);

// ✅ Update an audit trail entry
router.put('/:id', updateAuditTrail);

// ✅ Delete an audit trail entry (permanent)
router.delete('/:id', deleteAuditTrail);

// ✅ Archive an audit trail entry (soft delete)
router.patch('/archive/:id', archiveAuditTrail);

// ✅ Restore an archived audit trail entry (optional)
router.patch('/restore/:id', restoreAuditTrail);

export default router;