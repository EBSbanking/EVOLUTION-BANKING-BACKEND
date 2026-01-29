// utils/pagination.js
export const paginate = async (model, page = 1, limit = 10, options = {}) => {
  const offset = (page - 1) * limit;
  
  const { count, rows } = await model.findAndCountAll({
    ...options,
    limit,
    offset,
    distinct: true
  });
  
  const totalPages = Math.ceil(count / limit);
  
  return {
    data: rows,
    pagination: {
      total: count,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1
    }
  };
};

// Usage with GuarantorAudit
export const getGuarantorAudits = async (guarantorId, page = 1, limit = 10) => {
  return await paginate(GuarantorAudit, page, limit, {
    where: { guarantorId },
    order: [['createdAt', 'DESC']]
  });
};