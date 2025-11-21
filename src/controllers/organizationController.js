import mongoose from 'mongoose';
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

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Check for existing organization by name
      const existingOrgByName = await Organization.findOne({ 
        organizationName: organizationName.trim() 
      }).session(session);
      
      if (existingOrgByName) {
        logger.warn('Organization already exists', { organizationName });
        return res.status(409).json({ 
          success: false,
          message: `Organization "${organizationName}" already exists`,
          code: 'ORGANIZATION_EXISTS'
        });
      }

      // Check for existing organization by code if provided
      if (organizationCode) {
        // CORRECTED: Validate numeric organization code (1-9999)
        if (typeof organizationCode !== 'number' || organizationCode < 1 || organizationCode > 9999) {
          return res.status(400).json({ 
            success: false,
            message: 'Organization code must be a number between 1 and 9999',
            code: 'INVALID_ORGANIZATION_CODE'
          });
        }

        const existingOrgByCode = await Organization.findOne({ 
          organizationCode 
        }).session(session);
        
        if (existingOrgByCode) {
          logger.warn('Organization code already exists', { organizationCode });
          return res.status(409).json({ 
            success: false,
            message: `Organization code "${organizationCode}" already exists`,
            code: 'ORGANIZATION_CODE_EXISTS'
          });
        }
      }

      // Generate organization code if not provided
      const finalOrganizationCode = organizationCode || await generateOrganizationCode(organizationName);

      const organization = new Organization({
        organizationName: organizationName.trim(),
        organizationCode: finalOrganizationCode,
        description: description || '',
        contactEmail: contactEmail || '',
        phoneNumber: phoneNumber || '',
        status: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await organization.save({ session });
      logger.info('Created new organization', { 
        organizationName, 
        organizationCode: organization.organizationCode,
        id: organization._id 
      });

      return res.status(201).json({ 
        success: true,
        message: 'Organization created successfully', 
        data: organization 
      });
    });
  } catch (error) {
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
  } finally {
    session.endSession();
  }
};

export const getOrganizations = async (req, res) => {
  const { page = 1, limit = 10, search, status, organizationCode } = req.query;
  
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Build query
      let query = {};
      
      if (search) {
        query.$or = [
          { organizationName: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } }
        ];
      }
      
      if (status) {
        query.status = status;
      }

      if (organizationCode) {
        const code = parseInt(organizationCode);
        if (!isNaN(code)) {
          query.organizationCode = code;
        }
      }

      // Calculate pagination
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      // Fetch organizations with pagination
      const organizations = await Organization.find(query)
        .session(session)
        .sort({ organizationCode: 1 }) // Sort by numeric organization code
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      // Get total count for pagination
      const totalCount = await Organization.countDocuments(query).session(session);
      
      logger.info('Fetched organizations', { 
        count: organizations.length,
        totalCount,
        page: parseInt(page),
        limit: parseInt(limit)
      });

      return res.status(200).json({ 
        success: true,
        message: 'Organizations fetched successfully', 
        data: organizations,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalCount / parseInt(limit)),
          totalItems: totalCount,
          itemsPerPage: parseInt(limit)
        }
      });
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
  } finally {
    session.endSession();
  }
};

export const getOrganizationById = async (req, res) => {
  const { id } = req.params;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Validate ID format
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid organization ID format',
          code: 'INVALID_ID_FORMAT'
        });
      }

      const organization = await Organization.findById(id).session(session);
      
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
        data: organization 
      });
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
  } finally {
    session.endSession();
  }
};

export const getOrganizationByCode = async (req, res) => {
  const { code } = req.params;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // CORRECTED: Validate numeric code (1-9999)
      const organizationCode = parseInt(code);
      if (isNaN(organizationCode) || organizationCode < 1 || organizationCode > 9999) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid organization code format. Must be a number between 1 and 9999',
          code: 'INVALID_ORGANIZATION_CODE'
        });
      }

      const organization = await Organization.findOne({ organizationCode }).session(session);
      
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
        data: organization 
      });
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
  } finally {
    session.endSession();
  }
};

export const updateOrganization = async (req, res) => {
  const { id } = req.params;
  const { organizationName, organizationCode, description, contactEmail, phoneNumber, status } = req.body;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Validate ID format
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid organization ID format',
          code: 'INVALID_ID_FORMAT'
        });
      }

      const organization = await Organization.findById(id).session(session);
      
      if (!organization) {
        return res.status(404).json({ 
          success: false,
          message: 'Organization not found',
          code: 'ORGANIZATION_NOT_FOUND'
        });
      }

      // Check if new organization name already exists (if changing)
      if (organizationName && organizationName !== organization.organizationName) {
        const existingOrg = await Organization.findOne({ 
          organizationName: organizationName.trim(),
          _id: { $ne: id }
        }).session(session);
        
        if (existingOrg) {
          return res.status(409).json({ 
            success: false,
            message: `Organization "${organizationName}" already exists`,
            code: 'ORGANIZATION_EXISTS'
          });
        }
      }

      // Check if new organization code already exists (if changing)
      if (organizationCode && organizationCode !== organization.organizationCode) {
        // CORRECTED: Validate numeric organization code (1-9999)
        if (typeof organizationCode !== 'number' || organizationCode < 1 || organizationCode > 9999) {
          return res.status(400).json({ 
            success: false,
            message: 'Organization code must be a number between 1 and 9999',
            code: 'INVALID_ORGANIZATION_CODE'
          });
        }

        const existingOrg = await Organization.findOne({ 
          organizationCode,
          _id: { $ne: id }
        }).session(session);
        
        if (existingOrg) {
          return res.status(409).json({ 
            success: false,
            message: `Organization code "${organizationCode}" already exists`,
            code: 'ORGANIZATION_CODE_EXISTS'
          });
        }
      }

      // Update fields
      if (organizationName) organization.organizationName = organizationName.trim();
      if (organizationCode) organization.organizationCode = organizationCode;
      if (description !== undefined) organization.description = description;
      if (contactEmail !== undefined) organization.contactEmail = contactEmail;
      if (phoneNumber !== undefined) organization.phoneNumber = phoneNumber;
      if (status) organization.status = status;
      
      organization.updatedAt = new Date();

      await organization.save({ session });
      logger.info('Updated organization', { 
        id, 
        organizationName: organization.organizationName,
        organizationCode: organization.organizationCode 
      });

      return res.status(200).json({ 
        success: true,
        message: 'Organization updated successfully', 
        data: organization 
      });
    });
  } catch (error) {
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
  } finally {
    session.endSession();
  }
};

export const deleteOrganization = async (req, res) => {
  const { id } = req.params;

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Validate ID format
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ 
          success: false,
          message: 'Invalid organization ID format',
          code: 'INVALID_ID_FORMAT'
        });
      }

      const organization = await Organization.findById(id).session(session);
      
      if (!organization) {
        return res.status(404).json({ 
          success: false,
          message: 'Organization not found',
          code: 'ORGANIZATION_NOT_FOUND'
        });
      }

      // Check if organization has dependencies (branches, accounts, etc.)
      // You might want to add checks here before deletion

      await Organization.findByIdAndDelete(id).session(session);
      logger.info('Deleted organization', { 
        id, 
        organizationName: organization.organizationName,
        organizationCode: organization.organizationCode 
      });

      return res.status(200).json({ 
        success: true,
        message: 'Organization deleted successfully'
      });
    });
  } catch (error) {
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
  } finally {
    session.endSession();
  }
};

// CORRECTED: Helper function to generate numeric organization code (1-9999)
async function generateOrganizationCode(organizationName) {
  // Generate a base code from organization name
  const baseCode = Math.abs(organizationName.split('').reduce((acc, char) => {
    return acc + char.charCodeAt(0);
  }, 0)) % 9999 + 1; // CORRECTED: Ensure it's between 1 and 9999
  
  // Ensure code is unique
  let uniqueCode = baseCode;
  let counter = 1;
  
  while (await Organization.findOne({ organizationCode: uniqueCode })) {
    uniqueCode = (baseCode + counter) % 9999 + 1; // CORRECTED: Stay within 1-9999
    counter++;
    
    // Prevent infinite loop (safety check)
    if (counter > 1000) {
      throw new Error('Unable to generate unique organization code');
    }
  }
  
  return uniqueCode;
}