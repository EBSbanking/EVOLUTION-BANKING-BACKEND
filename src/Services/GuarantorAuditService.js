// controllers/guarantorAuditController.js
import { paginate, getGuarantorAudits } from '../utils/pagination.js';
import GuarantorAudit from '../models/GuarantorAudit.js';

export const getGuarantorAuditHistory = async (req, res) => {
  try {
    const { guarantorId } = req.params;
    const { page = 1, limit = 20, action } = req.query;
    
    // Option 1: Use the specialized function
    const result = await getGuarantorAudits(guarantorId, parseInt(page), parseInt(limit));
    
    // Option 2: Use the generic paginate function
    const result2 = await paginate(GuarantorAudit, parseInt(page), parseInt(limit), {
      where: { guarantorId },
      order: [['createdAt', 'DESC']]
    });
    
    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching guarantor audits:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch audit history'
    });
  }
};

export const getAllAudits = async (req, res) => {
  try {
    const { page = 1, limit = 50, startDate, endDate } = req.query;
    
    const where = {};
    
    // Add date filters
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.$gte = new Date(startDate);
      if (endDate) where.createdAt.$lte = new Date(endDate);
    }
    
    const result = await paginate(GuarantorAudit, parseInt(page), parseInt(limit), {
      where,
      order: [['createdAt', 'DESC']]
    });
    
    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Error fetching all audits:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch audits'
    });
  }
};