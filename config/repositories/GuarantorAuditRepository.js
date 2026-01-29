import GuarantorAudit from '../models/GuarantorAudit.js';
import { paginate } from '../utils/pagination.js';

class GuarantorAuditRepository {
  async findByGuarantorId(guarantorId, options = {}) {
    const {
      page = 1,
      limit = 20,
      includeActions = [],
      excludeActions = []
    } = options;
    
    const where = { guarantorId };
    
    // Filter by included actions
    if (includeActions.length > 0) {
      where.action = includeActions;
    }
    
    // Filter by excluded actions
    if (excludeActions.length > 0) {
      where.action = { $notIn: excludeActions };
    }
    
    return await paginate(GuarantorAudit, page, limit, {
      where,
      order: [['createdAt', 'DESC']]
    });
  }
  
  async findByPerformer(performedBy, options = {}) {
    const { page = 1, limit = 50 } = options;
    
    return await paginate(GuarantorAudit, page, limit, {
      where: { performedBy },
      order: [['createdAt', 'DESC']]
    });
  }
  
  async createAudit(auditData) {
    return await GuarantorAudit.create(auditData);
  }
}

export default new GuarantorAuditRepository();