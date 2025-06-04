import BusinessUnit from '../models/BusinessUnit.js'; // Import the BusinessUnit model
import { ROLE_MAPPING } from '../constants/roleMapping.js';

// Create a new business unit
export const createBusinessUnit = async (req, res) => {
    try {
        const businessUnit = new BusinessUnit(req.body);
        await businessUnit.save();
        res.status(201).send(businessUnit);
    } catch (error) {
        res.status(400).send({ message: 'Error creating business unit', error });
    }
};

const validateBusinessUnitRoles = (roleId) => {
  if (!ROLE_MAPPING[roleId]) {
    throw new Error('Invalid Role ID');
  }
  return ROLE_MAPPING[roleId];
};

// Get all business units
export const getAllBusinessUnits = async (req, res) => {
    try {
        const businessUnits = await BusinessUnit.find();
        res.status(200).send(businessUnits);
    } catch (error) {
        res.status(500).send({ message: 'Error fetching business units', error });
    }
};

// Get business unit by ID
export const getBusinessUnitById = async (req, res) => {
    try {
        const businessUnit = await BusinessUnit.findOne({ buId: req.params.id });
        if (!businessUnit) {
            return res.status(404).send({ message: 'Business Unit not found' });
        }
        res.status(200).send(businessUnit);
    } catch (error) {
        res.status(500).send({ message: 'Error fetching business unit', error });
    }
};


// Update business unit by ID
export const updateBusinessUnit = async (req, res) => {
    try {
        const businessUnit = await BusinessUnit.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!businessUnit) {
            return res.status(404).send({ message: 'Business Unit not found' });
        }
        res.status(200).send(businessUnit);
    } catch (error) {
        res.status(400).send({ message: 'Error updating business unit', error });
    }
};

// Delete business unit by ID
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
