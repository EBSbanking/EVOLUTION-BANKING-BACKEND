import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';
import Organization from '../models/organization.js';

export const createOrganization = async (req, res) => {
  const { organizationName } = req.body;

  if (!organizationName) {
    logger.error('organizationName is required');
    return res.status(400).json({ message: 'organizationName is required' });
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const existingOrg = await Organization.findOne({ organizationName }).session(session);
      if (existingOrg) {
        logger.warn('Organization already exists', { organizationName });
        return res.status(400).json({ message: `Organization ${organizationName} already exists` });
      }

      const organization = new Organization({
        organizationName: organizationName.trim(),
        createdAt: new Date(),
        updatedAt: new Date()
      });
      await organization.save({ session });
      logger.info('Created new organization', { organizationName });

      return res.status(201).json({ message: 'Organization created successfully', organization });
    });
  } catch (error) {
    logger.error('Error creating organization', { error: error.message, stack: error.stack });
    return res.status(500).json({ message: 'Error creating organization', error: error.message });
  } finally {
    session.endSession();
  }
};

export const getOrganizations = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      // Fetch all organizations
      const organizations = await Organization.find({}).session(session).lean(); // Use lean for performance
      logger.info('Fetched organizations', { count: organizations.length });

      return res.status(200).json({ 
        message: 'Organizations fetched successfully', 
        data: organizations 
      });
    });
  } catch (error) {
    logger.error('Error fetching organizations', { error: error.message, stack: error.stack });
    return res.status(500).json({ message: 'Error fetching organizations', error: error.message });
  } finally {
    session.endSession();
  }
};

