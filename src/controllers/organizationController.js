import sequelize from '../../config/db.js';
import { Op } from 'sequelize';
import { logger } from '../utils/logger.js';
import Organization from '../models/organization.js';

export const createOrganization = async (req, res) => {
  const { organizationName, organizationCode, description, contactEmail, phoneNumber } = req.body;

  // Enhanced validation
  if (!organizationName) {
    return res.status(400).json({ 
      success: false,
      message: 'organizationName is required',
      code: 'MISSING_ORGANIZATION_NAME'
    });
  }

  const transaction = await sequelize.transaction();
  try {
    // Check for existing organization by name
    const existingOrgByName = await Organization.findOne({ 
      where: { organizationName: organizationName.trim() },
      transaction
    });
    
    if (existingOrgByName) {
      await transaction.rollback();
      logger.warn('Organization already exists', { organizationName });
      return res.status(409).json({ 
        success: false,
        message: `Organization "${organizationName}" already exists`,
        code: 'ORGANIZATION_EXISTS'
      });
    }

    // Check for existing organization by code if provided
    if (organizationCode) {
      // Validate numeric organization code (1-9999)
      if (typeof organizationCode !== 'number' || organizationCode < 1 || organizationCode > 9999) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false,
          message: 'Organization code must be a number between 1 and 9999',
          code: 'INVALID_ORGANIZATION_CODE'
        });
      }

      const existingOrgByCode = await Organization.findOne({ 
        where: { organizationCode },
        transaction
      });
      
      if (existingOrgByCode) {
        await transaction.rollback();
        logger.warn('Organization code already exists', { organizationCode });
        return res.status(409).json({ 
          success: false,
          message: `Organization code "${organizationCode}" already exists`,
          code: 'ORGANIZATION_CODE_EXISTS'
        });
      }
    }

    // Generate organization code if not provided
    const finalOrganizationCode = organizationCode || await generateOrganizationCode(organizationName, transaction);

    const organization = await Organization.create({
      organizationName: organizationName.trim(),
      organizationCode: finalOrganizationCode,
      description: description || '',
      contactEmail: contactEmail || '',
      phoneNumber: phoneNumber || '',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date()
    }, { transaction });

    await transaction.commit();

    logger.info('Created new organization', { 
      organizationName, 
      organizationCode: organization.organizationCode,
      id: organization.id 
    });

    return res.status(201).json({ 
      success: true,
      message: 'Organization created successfully', 
      data: organization.toJSON()
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error creating organization', { 
      error: error.message, 
      stack: error.stack,
      organizationName 
    });
    return res.status(500).json({ 
      success: false,
      message: 'Error creating organization', 
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

export const getOrganizations = async (req, res) => {
  const { page = 1, limit = 10, search, status, organizationCode } = req.query;
  
  try {
    // Build query
    const where = {};
    
    if (search) {
      where[Op.or] = [
        { organizationName: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    if (status) {
      where.status = status;
    }

    if (organizationCode) {
      const code = parseInt(organizationCode);
      if (!isNaN(code)) {
        where.organizationCode = code;
      }
    }

    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Fetch organizations with pagination
    const { count, rows: organizations } = await Organization.findAndCountAll({
      where,
      order: [['organizationCode', 'ASC']], // Sort by numeric organization code
      offset,
      limit: parseInt(limit)
    });
    
    logger.info('Fetched organizations', { 
      count: organizations.length,
      totalCount: count,
      page: parseInt(page),
      limit: parseInt(limit)
    });

    return res.status(200).json({ 
      success: true,
      message: 'Organizations fetched successfully', 
      data: organizations.map(org => org.toJSON()),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    });
  } catch (error) {
    logger.error('Error fetching organizations', { 
      error: error.message, 
      stack: error.stack 
    });
    return res.status(500).json({ 
      success: false,
      message: 'Error fetching organizations', 
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

export const getOrganizationById = async (req, res) => {
  const { id } = req.params;

  try {
    // Validate ID format (assuming it's a Sequelize integer ID)
    if (!id || isNaN(parseInt(id))) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid organization ID format',
        code: 'INVALID_ID_FORMAT'
      });
    }

    const organization = await Organization.findByPk(id);
    
    if (!organization) {
      return res.status(404).json({ 
        success: false,
        message: 'Organization not found',
        code: 'ORGANIZATION_NOT_FOUND'
      });
    }

    logger.info('Fetched organization by ID', { id });
    
    return res.status(200).json({ 
      success: true,
      message: 'Organization fetched successfully', 
      data: organization.toJSON()
    });
  } catch (error) {
    logger.error('Error fetching organization by ID', { 
      error: error.message, 
      stack: error.stack,
      id 
    });
    return res.status(500).json({ 
      success: false,
      message: 'Error fetching organization', 
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

export const getOrganizationByCode = async (req, res) => {
  const { code } = req.params;

  try {
    // Validate numeric code (1-9999)
    const organizationCode = parseInt(code);
    if (isNaN(organizationCode) || organizationCode < 1 || organizationCode > 9999) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid organization code format. Must be a number between 1 and 9999',
        code: 'INVALID_ORGANIZATION_CODE'
      });
    }

    const organization = await Organization.findOne({ 
      where: { organizationCode }
    });
    
    if (!organization) {
      return res.status(404).json({ 
        success: false,
        message: `Organization with code ${organizationCode} not found`,
        code: 'ORGANIZATION_NOT_FOUND'
      });
    }

    logger.info('Fetched organization by code', { organizationCode });
    
    return res.status(200).json({ 
      success: true,
      message: 'Organization fetched successfully', 
      data: organization.toJSON()
    });
  } catch (error) {
    logger.error('Error fetching organization by code', { 
      error: error.message, 
      stack: error.stack,
      code 
    });
    return res.status(500).json({ 
      success: false,
      message: 'Error fetching organization', 
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

export const updateOrganization = async (req, res) => {
  const { id } = req.params;
  const { organizationName, organizationCode, description, contactEmail, phoneNumber, status } = req.body;

  const transaction = await sequelize.transaction();
  try {
    // Validate ID format
    if (!id || isNaN(parseInt(id))) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Invalid organization ID format',
        code: 'INVALID_ID_FORMAT'
      });
    }

    const organization = await Organization.findByPk(id, { transaction });
    
    if (!organization) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        message: 'Organization not found',
        code: 'ORGANIZATION_NOT_FOUND'
      });
    }

    // Check if new organization name already exists (if changing)
    if (organizationName && organizationName !== organization.organizationName) {
      const existingOrg = await Organization.findOne({ 
        where: { 
          organizationName: organizationName.trim(),
          id: { [Op.ne]: id }
        },
        transaction
      });
      
      if (existingOrg) {
        await transaction.rollback();
        return res.status(409).json({ 
          success: false,
          message: `Organization "${organizationName}" already exists`,
          code: 'ORGANIZATION_EXISTS'
        });
      }
    }

    // Check if new organization code already exists (if changing)
    if (organizationCode && organizationCode !== organization.organizationCode) {
      // Validate numeric organization code (1-9999)
      if (typeof organizationCode !== 'number' || organizationCode < 1 || organizationCode > 9999) {
        await transaction.rollback();
        return res.status(400).json({ 
          success: false,
          message: 'Organization code must be a number between 1 and 9999',
          code: 'INVALID_ORGANIZATION_CODE'
        });
      }

      const existingOrg = await Organization.findOne({ 
        where: { 
          organizationCode,
          id: { [Op.ne]: id }
        },
        transaction
      });
      
      if (existingOrg) {
        await transaction.rollback();
        return res.status(409).json({ 
          success: false,
          message: `Organization code "${organizationCode}" already exists`,
          code: 'ORGANIZATION_CODE_EXISTS'
        });
      }
    }

    // Update fields
    const updateData = {
      updatedAt: new Date()
    };

    if (organizationName) updateData.organizationName = organizationName.trim();
    if (organizationCode) updateData.organizationCode = organizationCode;
    if (description !== undefined) updateData.description = description;
    if (contactEmail !== undefined) updateData.contactEmail = contactEmail;
    if (phoneNumber !== undefined) updateData.phoneNumber = phoneNumber;
    if (status) updateData.status = status;

    await organization.update(updateData, { transaction });
    await transaction.commit();

    logger.info('Updated organization', { 
      id, 
      organizationName: organization.organizationName,
      organizationCode: organization.organizationCode 
    });

    return res.status(200).json({ 
      success: true,
      message: 'Organization updated successfully', 
      data: organization.toJSON()
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error updating organization', { 
      error: error.message, 
      stack: error.stack,
      id 
    });
    return res.status(500).json({ 
      success: false,
      message: 'Error updating organization', 
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

export const deleteOrganization = async (req, res) => {
  const { id } = req.params;

  const transaction = await sequelize.transaction();
  try {
    // Validate ID format
    if (!id || isNaN(parseInt(id))) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Invalid organization ID format',
        code: 'INVALID_ID_FORMAT'
      });
    }

    const organization = await Organization.findByPk(id, { transaction });
    
    if (!organization) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        message: 'Organization not found',
        code: 'ORGANIZATION_NOT_FOUND'
      });
    }

    // Check if organization has dependencies (branches, accounts, etc.)
    // You might want to add checks here before deletion
    // Example: Check if organization has branches
    // const branchCount = await Branch.count({ where: { organizationId: id }, transaction });
    // if (branchCount > 0) {
    //   await transaction.rollback();
    //   return res.status(400).json({ 
    //     success: false,
    //     message: 'Cannot delete organization with existing branches',
    //     code: 'ORGANIZATION_HAS_DEPENDENCIES'
    //   });
    // }

    await organization.destroy({ transaction });
    await transaction.commit();

    logger.info('Deleted organization', { 
      id, 
      organizationName: organization.organizationName,
      organizationCode: organization.organizationCode 
    });

    return res.status(200).json({ 
      success: true,
      message: 'Organization deleted successfully'
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error deleting organization', { 
      error: error.message, 
      stack: error.stack,
      id 
    });
    return res.status(500).json({ 
      success: false,
      message: 'Error deleting organization', 
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Enhanced function: Search organizations with advanced filtering
export const searchOrganizations = async (req, res) => {
  try {
    const { 
      search, 
      status, 
      organizationCode, 
      contactEmail,
      phoneNumber,
      startDate,
      endDate,
      page = 1, 
      limit = 10,
      sortBy = 'organizationCode',
      sortOrder = 'ASC'
    } = req.query;

    const where = {};
    
    // Text search
    if (search) {
      where[Op.or] = [
        { organizationName: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } }
      ];
    }
    
    // Status filter
    if (status) {
      where.status = status;
    }

    // Organization code filter
    if (organizationCode) {
      const code = parseInt(organizationCode);
      if (!isNaN(code)) {
        where.organizationCode = code;
      }
    }

    // Contact email filter
    if (contactEmail) {
      where.contactEmail = { [Op.iLike]: `%${contactEmail}%` };
    }

    // Phone number filter
    if (phoneNumber) {
      where.phoneNumber = { [Op.iLike]: `%${phoneNumber}%` };
    }

    // Date range filter
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) where.createdAt[Op.lte] = new Date(endDate);
    }

    // Calculate pagination
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Validate sort order
    const validSortOrders = ['ASC', 'DESC'];
    const orderDirection = validSortOrders.includes(sortOrder.toUpperCase()) 
      ? sortOrder.toUpperCase() 
      : 'ASC';

    // Fetch organizations with pagination and sorting
    const { count, rows: organizations } = await Organization.findAndCountAll({
      where,
      order: [[sortBy, orderDirection]],
      offset,
      limit: parseInt(limit)
    });
    
    logger.info('Searched organizations', { 
      count: organizations.length,
      totalCount: count,
      filters: { search, status, organizationCode }
    });

    return res.status(200).json({ 
      success: true,
      message: 'Organizations search completed successfully', 
      data: organizations.map(org => org.toJSON()),
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / parseInt(limit)),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      },
      filters: {
        applied: { search, status, organizationCode, contactEmail, phoneNumber, startDate, endDate },
        totalResults: count
      }
    });
  } catch (error) {
    logger.error('Error searching organizations', { 
      error: error.message, 
      stack: error.stack 
    });
    return res.status(500).json({ 
      success: false,
      message: 'Error searching organizations', 
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Enhanced function: Get organization statistics
export const getOrganizationStatistics = async (req, res) => {
  try {
    const { organizationId, organizationCode } = req.query;

    let where = {};
    if (organizationId) where.id = organizationId;
    if (organizationCode) where.organizationCode = organizationCode;

    // Get basic statistics
    const stats = await Organization.findAll({
      where,
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'totalOrganizations'],
        [sequelize.fn('SUM', sequelize.literal('CASE WHEN status = \'ACTIVE\' THEN 1 ELSE 0 END')), 'activeOrganizations'],
        [sequize.fn('SUM', sequelize.literal('CASE WHEN status = \'INACTIVE\' THEN 1 ELSE 0 END')), 'inactiveOrganizations'],
        [sequelize.fn('MIN', sequelize.col('createdAt')), 'oldestOrganizationDate'],
        [sequelize.fn('MAX', sequelize.col('createdAt')), 'newestOrganizationDate'],
        [sequelize.fn('MIN', sequelize.col('organizationCode')), 'lowestOrgCode'],
        [sequelize.fn('MAX', sequelize.col('organizationCode')), 'highestOrgCode']
      ],
      raw: true
    });

    const statistics = stats[0] || {
      totalOrganizations: 0,
      activeOrganizations: 0,
      inactiveOrganizations: 0,
      oldestOrganizationDate: null,
      newestOrganizationDate: null,
      lowestOrgCode: null,
      highestOrgCode: null
    };

    // Get status distribution
    const statusDistribution = await Organization.findAll({
      where,
      attributes: [
        'status',
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: ['status'],
      raw: true
    });

    // Get organizations by month/year created
    const monthlyDistribution = await Organization.findAll({
      where,
      attributes: [
        [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('createdAt')), 'month'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'count']
      ],
      group: [sequelize.fn('DATE_TRUNC', 'month', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE_TRUNC', 'month', sequelize.col('createdAt')), 'DESC']],
      limit: 12,
      raw: true
    });

    logger.info('Fetched organization statistics', { 
      totalOrganizations: statistics.totalOrganizations 
    });

    return res.status(200).json({ 
      success: true,
      message: 'Organization statistics fetched successfully', 
      data: {
        statistics: {
          totalOrganizations: parseInt(statistics.totalOrganizations) || 0,
          activeOrganizations: parseInt(statistics.activeOrganizations) || 0,
          inactiveOrganizations: parseInt(statistics.inactiveOrganizations) || 0,
          oldestOrganizationDate: statistics.oldestOrganizationDate,
          newestOrganizationDate: statistics.newestOrganizationDate,
          lowestOrgCode: statistics.lowestOrgCode,
          highestOrgCode: statistics.highestOrgCode,
          orgCodeRange: statistics.highestOrgCode && statistics.lowestOrgCode 
            ? `${statistics.lowestOrgCode} - ${statistics.highestOrgCode}` 
            : 'N/A'
        },
        statusDistribution: statusDistribution.map(item => ({
          status: item.status,
          count: parseInt(item.count) || 0,
          percentage: statistics.totalOrganizations > 0 
            ? Math.round((parseInt(item.count) / parseInt(statistics.totalOrganizations)) * 10000) / 100 
            : 0
        })),
        monthlyDistribution: monthlyDistribution.map(item => ({
          month: item.month,
          count: parseInt(item.count) || 0
        })),
        recommendations: generateOrganizationRecommendations(statistics)
      }
    });
  } catch (error) {
    logger.error('Error fetching organization statistics', { 
      error: error.message, 
      stack: error.stack 
    });
    return res.status(500).json({ 
      success: false,
      message: 'Error fetching organization statistics', 
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Enhanced function: Deactivate organization (soft delete)
export const deactivateOrganization = async (req, res) => {
  const { id } = req.params;
  const { deactivationReason } = req.body;

  const transaction = await sequelize.transaction();
  try {
    // Validate ID format
    if (!id || isNaN(parseInt(id))) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Invalid organization ID format',
        code: 'INVALID_ID_FORMAT'
      });
    }

    const organization = await Organization.findByPk(id, { transaction });
    
    if (!organization) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        message: 'Organization not found',
        code: 'ORGANIZATION_NOT_FOUND'
      });
    }

    // Check if already inactive
    if (organization.status === 'INACTIVE') {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Organization is already inactive',
        code: 'ORGANIZATION_ALREADY_INACTIVE'
      });
    }

    // Deactivate the organization
    await organization.update({
      status: 'INACTIVE',
      deactivationDate: new Date(),
      deactivationReason: deactivationReason || 'Admin requested deactivation',
      updatedAt: new Date()
    }, { transaction });

    await transaction.commit();

    logger.info('Deactivated organization', { 
      id, 
      organizationName: organization.organizationName,
      deactivationReason 
    });

    return res.status(200).json({ 
      success: true,
      message: 'Organization deactivated successfully', 
      data: organization.toJSON()
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error deactivating organization', { 
      error: error.message, 
      stack: error.stack,
      id 
    });
    return res.status(500).json({ 
      success: false,
      message: 'Error deactivating organization', 
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Enhanced function: Reactivate organization
export const reactivateOrganization = async (req, res) => {
  const { id } = req.params;

  const transaction = await sequelize.transaction();
  try {
    // Validate ID format
    if (!id || isNaN(parseInt(id))) {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Invalid organization ID format',
        code: 'INVALID_ID_FORMAT'
      });
    }

    const organization = await Organization.findByPk(id, { transaction });
    
    if (!organization) {
      await transaction.rollback();
      return res.status(404).json({ 
        success: false,
        message: 'Organization not found',
        code: 'ORGANIZATION_NOT_FOUND'
      });
    }

    // Check if already active
    if (organization.status === 'ACTIVE') {
      await transaction.rollback();
      return res.status(400).json({ 
        success: false,
        message: 'Organization is already active',
        code: 'ORGANIZATION_ALREADY_ACTIVE'
      });
    }

    // Reactivate the organization
    await organization.update({
      status: 'ACTIVE',
      reactivationDate: new Date(),
      deactivationReason: null,
      updatedAt: new Date()
    }, { transaction });

    await transaction.commit();

    logger.info('Reactivated organization', { 
      id, 
      organizationName: organization.organizationName
    });

    return res.status(200).json({ 
      success: true,
      message: 'Organization reactivated successfully', 
      data: organization.toJSON()
    });
  } catch (error) {
    await transaction.rollback();
    logger.error('Error reactivating organization', { 
      error: error.message, 
      stack: error.stack,
      id 
    });
    return res.status(500).json({ 
      success: false,
      message: 'Error reactivating organization', 
      error: error.message,
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Helper function to generate numeric organization code (1-9999)
async function generateOrganizationCode(organizationName, transaction = null) {
  // Generate a base code from organization name
  const baseCode = Math.abs(organizationName.split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0)) % 9999 + 1; // Ensure it's between 1 and 9999
  
  // Ensure code is unique
  let uniqueCode = baseCode;
  let counter = 1;
  
  const findOptions = transaction ? { transaction } : {};
  
  while (await Organization.findOne({ 
    where: { organizationCode: uniqueCode },
    ...findOptions
  })) {
    uniqueCode = (baseCode + counter) % 9999 + 1; // Stay within 1-9999
    counter++;
    
    // Prevent infinite loop (safety check)
    if (counter > 1000) {
      throw new Error('Unable to generate unique organization code');
    }
  }
  
  return uniqueCode;
}

// Helper function to generate organization recommendations
function generateOrganizationRecommendations(statistics) {
  const recommendations = [];
  const totalOrgs = parseInt(statistics.totalOrganizations) || 0;
  const activeOrgs = parseInt(statistics.activeOrganizations) || 0;
  const inactiveOrgs = parseInt(statistics.inactiveOrganizations) || 0;

  if (inactiveOrgs > 0 && (inactiveOrgs / totalOrgs) > 0.3) {
    recommendations.push(
      'High number of inactive organizations. Consider reviewing and potentially removing inactive ones.',
      'Contact inactive organization administrators for status updates.'
    );
  }

  if (totalOrgs > 50) {
    recommendations.push(
      'Large number of organizations. Consider implementing organization grouping or categorization.',
      'Review organization code allocation strategy for scalability.'
    );
  }

  if (statistics.lowestOrgCode && statistics.highestOrgCode) {
    const codeRange = statistics.highestOrgCode - statistics.lowestOrgCode;
    if (codeRange > 8000) {
      recommendations.push(
        'Wide organization code range detected. Consider code range optimization.',
        'Implement organization code allocation strategy to minimize gaps.'
      );
    }
  }

  return recommendations;
}