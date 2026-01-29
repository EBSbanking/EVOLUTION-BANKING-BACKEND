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
// Add this function to guarantorAuditController.js
export const getAuditStatistics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    // Get total count
    const totalCount = await GuarantorAudit.count();
    
    // Get today's count
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);
    
    const todayCount = await GuarantorAudit.count({
      where: {
        createdAt: {
          $gte: todayStart,
          $lte: todayEnd
        }
      }
    });
    
    // Get counts by action type
    const actionStats = await GuarantorAudit.findAll({
      attributes: [
        'action',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['action'],
      raw: true
    });
    
    // Get counts by user (top users)
    const userStats = await GuarantorAudit.findAll({
      attributes: [
        'userId',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['userId'],
      order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
      limit: 10,
      raw: true
    });
    
    return res.json({
      success: true,
      data: {
        totalCount,
        todayCount,
        actionStats,
        userStats
      }
    });
  } catch (error) {
    console.error('Error fetching audit statistics:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch audit statistics'
    });
  }
};