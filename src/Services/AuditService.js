// services/AuditService.js
import GuarantorAudit from '../models/GuarantorAudit.js';
import sequelize from '../../config/db.js';
import { Op } from 'sequelize';

class AuditService {
  // Log guarantor-specific action
  static async logGuarantorAction({
    guarantorId,
    action,
    changedFields = [],
    previousValues = null,
    performedBy,
    notes = '',
    ipAddress = '',
    relationshipOfficer = {}
  }) {
    try {
      console.log('📝 Logging guarantor action:', { guarantorId, action, performedBy });
      
      const auditLog = await GuarantorAudit.create({
        guarantorId,
        action,
        changedFields,
        previousValues,
        performedBy,
        notes,
        ipAddress,
        relationshipOfficer
      });
      
      console.log('✅ Guarantor audit logged:', auditLog.id);
      return auditLog;
    } catch (error) {
      console.error('❌ Failed to log guarantor audit:', error);
      throw error;
    }
  }


// In services/AuditService.js - update the logAuditTrail function
static async logAuditTrail({
  entityId,
  entityType = 'general',
  action,
  changedFields = [],
  previousValues = null,
  performedBy, // This is the problematic parameter
  notes = '',
  ipAddress = '',
  userInfo = {}
}) {
  try {
    console.log('📝 Logging generic audit:', { entityId, entityType, action, performedBy });
    
    // FIX: Provide a default value if performedBy is undefined
    const performedByValue = performedBy || 
                            userInfo?.id || 
                            userInfo?.username || 
                            'system';
    
    const auditLog = await GuarantorAudit.create({
      guarantorId: entityId,
      action,
      changedFields,
      previousValues,
      performedBy: performedByValue, // Use the default value
      notes,
      ipAddress,
      relationshipOfficer: userInfo,
      metadata: {
        entityType,
        entityId,
        timestamp: new Date().toISOString()
      }
    });
    
    console.log(`✅ Audit logged: ${action} on ${entityType} ${entityId} by ${performedByValue}`);
    return auditLog;
  } catch (error) {
    console.error('❌ Failed to log audit trail:', error);
    throw error;
  }
}
  static async getGuarantorAuditHistory(guarantorId, options = {}) {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      action
    } = options;
    
    const offset = (page - 1) * limit;
    
    const where = { guarantorId };
    
    // Filter by date range
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }
    
    // Filter by action
    if (action) {
      where.action = action;
    }
    
    console.log('🔍 Fetching guarantor audit history:', { guarantorId, where });
    
    const { count, rows } = await GuarantorAudit.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });
    
    const totalPages = Math.ceil(count / limit);
    
    return {
      success: true,
      data: {
        audits: rows,
        pagination: {
          total: count,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    };
  }

  static async getRecentActions(limit = 10) {
    try {
      console.log('🔍 Fetching recent audits:', limit);
      const audits = await GuarantorAudit.findAll({
        order: [['createdAt', 'DESC']],
        limit
      });
      
      return {
        success: true,
        data: audits
      };
    } catch (error) {
      console.error('❌ Failed to fetch recent audits:', error);
      throw error;
    }
  }

  static async getActionsByUser(performedBy, limit = 50) {
    try {
      console.log('🔍 Fetching audits by user:', performedBy);
      const audits = await GuarantorAudit.findAll({
        where: { performedBy },
        order: [['createdAt', 'DESC']],
        limit
      });
      
      return {
        success: true,
        data: audits
      };
    } catch (error) {
      console.error('❌ Failed to fetch user audits:', error);
      throw error;
    }
  }

  // Get audit trail for any entity
  static async getEntityAuditTrail(entityId, entityType, options = {}) {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      action
    } = options;
    
    const offset = (page - 1) * limit;
    
    const where = {
      [Op.or]: [
        { guarantorId: entityId },
        sequelize.where(
          sequelize.fn('JSON_EXTRACT', sequelize.col('metadata'), '$.entityId'),
          entityId.toString()
        )
      ]
    };
    
    if (entityType) {
      where[Op.or].push(
        sequelize.where(
          sequelize.fn('JSON_EXTRACT', sequelize.col('metadata'), '$.entityType'),
          entityType
        )
      );
    }
    
    // Filter by date range
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }
    
    // Filter by action
    if (action) {
      where.action = action;
    }
    
    console.log('🔍 Fetching entity audit trail:', { entityId, entityType, where });
    
    const { count, rows } = await GuarantorAudit.findAndCountAll({
      where,
      limit,
      offset,
      order: [['createdAt', 'DESC']]
    });
    
    const totalPages = Math.ceil(count / limit);
    
    return {
      success: true,
      data: {
        audits: rows,
        pagination: {
          total: count,
          page,
          limit,
          totalPages,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    };
  }

  // New: Get audit stats
  static async getAuditStats() {
    try {
      const totalAudits = await GuarantorAudit.count();
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayAudits = await GuarantorAudit.count({
        where: { createdAt: { [Op.gte]: today } }
      });
      
      const recentUsers = await GuarantorAudit.findAll({
        attributes: ['performedBy'],
        group: ['performedBy'],
        limit: 5,
        order: [[sequelize.fn('MAX', sequelize.col('createdAt')), 'DESC']]
      });
      
      return {
        success: true,
        data: {
          totalAudits,
          todayAudits,
          recentUsers: recentUsers.map(r => r.performedBy)
        }
      };
    } catch (error) {
      console.error('❌ Failed to get audit stats:', error);
      throw error;
    }
  }
}

// Export the logAuditTrail function as a named export
export const logAuditTrail = AuditService.logAuditTrail;

// Also export other commonly used functions
export const logGuarantorAction = AuditService.logGuarantorAction;
export const getGuarantorAuditHistory = AuditService.getGuarantorAuditHistory;
export const getAuditStats = AuditService.getAuditStats;

// Export the class as default
export default AuditService;