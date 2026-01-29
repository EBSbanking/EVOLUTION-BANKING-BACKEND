// routes/guarantorAuditRoutes.js
import express from 'express';
import { 
  getGuarantorAuditHistory, 
  getAllAudits,
  getAuditStatistics 
} from '../controllers/guarantorAuditController.js';
import { paginate } from '../utils/pagination.js';
import GuarantorAudit from '../models/GuarantorAudit.js';

const router = express.Router();

// Route that uses pagination directly
router.get('/custom', async (req, res) => {
  try {
    const { page = 1, limit = 10, action } = req.query;
    
    const result = await paginate(GuarantorAudit, parseInt(page), parseInt(limit), {
      where: action ? { action } : {},
      order: [['createdAt', 'DESC']]
    });
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Standard routes
router.get('/guarantor/:guarantorId', getGuarantorAuditHistory);
router.get('/all', getAllAudits);
router.get('/stats', getAuditStatistics);

export default router;