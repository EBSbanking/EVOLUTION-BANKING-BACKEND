// controllers/businessUnitController.js

import BusinessUnit from '../models/BusinessUnit.js'; // Import the BusinessUnit model
import { ROLE_MAPPING } from '../constants/roleMapping.js';

// ✅ Create a new business unit
export const createBusinessUnit = async (req, res) => {
  try {
    const businessUnit = new BusinessUnit(req.body);
    await businessUnit.save();
    res.status(201).send(businessUnit);
  } catch (error) {
    res.status(400).send({ message: 'Error creating business unit', error });
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
export const getBusinessUnitById = async (req, res) => {
  try {
    const buId = parseInt(req.params.id, 10); // Ensure it's a number
    const businessUnit = await BusinessUnit.findOne({ BU_ID: buId });
    if (!businessUnit) {
      return res.status(404).send({ message: 'Business Unit not found' });
    }
    res.status(200).send(businessUnit);
  } catch (error) {
    res.status(500).send({ message: 'Error fetching business unit', error });
  }
};

// ✅ Update business unit by Mongo `_id`
export const updateBusinessUnit = async (req, res) => {
  try {
    const businessUnit = await BusinessUnit.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });
    if (!businessUnit) {
      return res.status(404).send({ message: 'Business Unit not found' });
    }
    res.status(200).send(businessUnit);
  } catch (error) {
    res.status(400).send({ message: 'Error updating business unit', error });
  }
};

// ✅ Delete business unit by Mongo `_id`
export const deleteBusinessUnit = async (req, res) => {
  try {
    const businessUnit = await BusinessUnit.findByIdAndDelete(req.params.id);
    if (!businessUnit) {
      return res.status(404).send({ message: 'Business Unit not found' });
    }
    res.status(200).send({ message: 'Business Unit deleted successfully' });
  } catch (error) {
    res.status(500).send({ message: 'Error deleting business unit', error });
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
