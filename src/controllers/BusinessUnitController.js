// controllers/businessUnitController.js

import BusinessUnit from '../models/BusinessUnit.js'; // Import the BusinessUnit model
import { ROLE_MAPPING } from '../constants/roleMapping.js';
import {logger } from '../utils/logger.js';

// Create a new business unit
export const createBusinessUnit = async (req, res) => {
  logger.info('createBusinessUnit hit', { body: req.body, ip: req.ip });

  try {
    const { BU_ID, BUSINESS_UNIT, DESCRIPTION, ADDRESS } = req.body;

    // Validate required fields
    if (!BU_ID || !BUSINESS_UNIT || !DESCRIPTION || !ADDRESS) {
      logger.error('Missing required fields', { BU_ID, BUSINESS_UNIT, DESCRIPTION, ADDRESS });
      return res.status(400).send({
        success: false,
        message: 'All fields (BU_ID, BUSINESS_UNIT, DESCRIPTION, ADDRESS) are required',
        code: 'INVALID_REQUEST'
      });
    }

    const businessUnit = new BusinessUnit({
      BU_ID,
      BUSINESS_UNIT,
      DESCRIPTION,
      ADDRESS,
      created_at: req.body.created_at ? new Date(req.body.created_at) : new Date()
    });
    await businessUnit.save();

    logger.info('Business Unit created successfully', { BU_ID, BUSINESS_UNIT });

    res.status(201).send({
      success: true,
      message: `Business Unit with BU_ID: ${businessUnit.BU_ID}, BUSINESS_UNIT: "${businessUnit.BUSINESS_UNIT}" created successfully`,
      data: businessUnit
    });
  } catch (error) {
    logger.error('Error creating business unit', { error: error.message, BU_ID: req.body.BU_ID });
    res.status(error.code === 11000 ? 409 : 400).send({
      success: false,
      message: error.code === 11000 ? `Business Unit with BU_ID ${req.body.BU_ID} already exists` : 'Error creating business unit',
      code: error.code === 11000 ? 'DUPLICATE_KEY' : 'INVALID_REQUEST',
      error: error.message
    });
  }
};


// ✅ Validate if role ID is valid
const validateBusinessUnitRoles = (roleId) => {
  if (!ROLE_MAPPING[roleId]) {
    throw new Error('Invalid Role ID');
  }
  return ROLE_MAPPING[roleId];
};

// ✅ Get all business units
export const getAllBusinessUnits = async (req, res) => {
  try {
    const businessUnits = await BusinessUnit.find();
    res.status(200).send(businessUnits);
  } catch (error) {
    res.status(500).send({ message: 'Error fetching business units', error });
  }
};

// ✅ Get business unit by BU_ID
// Get business unit by BU_ID
export const getBusinessUnitById = async (req, res) => {
  logger.info('getBusinessUnitById hit', { params: req.params, ip: req.ip });

  try {
    const buIdParam = req.params.id || req.params.BU_ID;
    const buId = Number(buIdParam);

    if (isNaN(buId)) {
      logger.error('Invalid Business Unit ID', { buIdParam });
      return res.status(400).send({
        message: 'Invalid Business Unit ID',
        code: 'INVALID_REQUEST'
      });
    }

    const businessUnit = await BusinessUnit.findOne({ BU_ID: buId });

    if (!businessUnit) {
      logger.warn('Business Unit not found', { BU_ID: buId });
      return res.status(404).send({
        message: 'Business Unit not found',
        code: 'NOT_FOUND'
      });
    }

    logger.info('Business Unit retrieved successfully', { BU_ID: buId });
    res.status(200).send(businessUnit);
  } catch (error) {
    logger.error('Error fetching business unit', { error: error.message, BU_ID: req.params.id });
    res.status(500).send({
      message: 'Error fetching business unit',
      code: 'INTERNAL_SERVER_ERROR',
      error: error.message
    });
  }
};

// Update business unit by Mongo `_id`
export const updateBusinessUnit = async (req, res) => {
  logger.info('updateBusinessUnit hit', { params: req.params, body: req.body, ip: req.ip });

  try {
    const businessUnit = await BusinessUnit.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!businessUnit) {
      logger.warn('Business Unit not found', { id: req.params.id });
      return res.status(404).send({
        message: 'Business Unit not found',
        code: 'NOT_FOUND'
      });
    }

    logger.info('Business Unit updated successfully', { BU_ID: businessUnit.BU_ID });
    res.status(200).send(businessUnit);
  } catch (error) {
    logger.error('Error updating business unit', { error: error.message, id: req.params.id });
    res.status(error.code === 11000 ? 409 : 400).send({
      message: error.code === 11000 ? `Business Unit with BU_ID ${req.body.BU_ID} already exists` : 'Error updating business unit',
      code: error.code === 11000 ? 'DUPLICATE_KEY' : 'INVALID_REQUEST',
      error: error.message
    });
  }
};

// Delete business unit by Mongo `_id`
export const deleteBusinessUnit = async (req, res) => {
  logger.info('deleteBusinessUnit hit', { params: req.params, ip: req.ip });

  try {
    const businessUnit = await BusinessUnit.findByIdAndDelete(req.params.id);

    if (!businessUnit) {
      logger.warn('Business Unit not found', { id: req.params.id });
      return res.status(404).send({
        message: 'Business Unit not found',
        code: 'NOT_FOUND'
      });
    }

    logger.info('Business Unit deleted successfully', { BU_ID: businessUnit.BU_ID });
    res.status(200).send({
      message: 'Business Unit deleted successfully'
    });
  } catch (error) {
    logger.error('Error deleting business unit', { error: error.message, id: req.params.id });
    res.status(500).send({
      message: 'Error deleting business unit',
      code: 'INTERNAL_SERVER_ERROR',
      error: error.message
    });
  }
};

export const getAccessibleBUsForUser = async (req, res) => {
  try {
    const { userId } = req.params;

    const userRole = await UserRole.findOne({ USER_ID: userId }).populate('permissions');

    if (!userRole || !userRole.permissions) {
      return res.status(404).json({ success: false, message: 'User role or permissions not found.' });
    }

    const userPermissions = Object.values(userRole.permissions).filter(value =>
      ['ALL BUSINESS UNIT', 'PARENT BUSINESS UNIT STRUCTURE', 'OWN BUSINESS UNIT'].includes(value)
    );

    // ✅ This is correct and unchanged
    const accessibleBUs = await getAccessibleBusinessUnits(userPermissions, userRole.Business_Unit);

    return res.status(200).json({ success: true, businessUnits: accessibleBUs });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: 'Error fetching accessible business units', error: err.message });
  }
};
