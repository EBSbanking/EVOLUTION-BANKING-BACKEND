import express from 'express';
import mongoose from 'mongoose';
import BusinessRole from '../models/BusinessRole.js';
import User from '../models/User.js';
import { ROLE_MAPPING } from '../constants/roleMapping.js';
import UserRole from '../models/UserRole.js';
import BusinessUnit from '../models/BusinessUnit.js';
import { populateBusinessUnitMapping } from '../constants/roleMapping.js';

const router = express.Router();  // Initialize the router

// Middleware to populate business unit mapping before proceeding with the route
router.use(async (req, res, next) => {
  try {
    await populateBusinessUnitMapping(); // Populate the business unit mapping before processing the request
    next(); // Proceed with the next middleware/route handler
  } catch (error) {
    console.error("Error populating business unit mapping:", error);
    res.status(500).json({ message: "Error populating business unit mapping", error: error.message });
  }
});

// Create a new BusinessRole
export const createBusinessRole = async (req, res) => {
  try {
    const {
      REC_ST,
      VERSION_NO,
      USER_ID,
      CREATE_DT,
      SYS_CREATE_TS,
      CREATED_BY,
      ALLOW_TXN_POSTING_FG,
      ALLOW_EXCH_RATE_OVR_FG,
      BU_ROLE_ID,
      EFF_FROM_DT,
      DEF_ROLE_FG,
      SUPERVISOR_FG,
      WF_ITEM_ACCESS_LEVEL,
      Business_Unit,  // Ensure this field is passed correctly
    } = req.body;

    // Fetch ROLE_NM and Business_Unit from ROLE_MAPPING
    const roleMapping = ROLE_MAPPING[BU_ROLE_ID];

    if (!roleMapping) {
      console.log(`Invalid ROLE_ID: ${BU_ROLE_ID}`);
      return res.status(400).json({ message: 'Invalid ROLE_ID provided' });
    }

    const ROLE_NM = roleMapping; // Since ROLE_MAPPING only stores role names
    const BUSINESS_UNIT = Business_Unit || roleMapping;  // Use passed Business_Unit or fallback

    // Check if the BusinessUnit exists
    const existingBusinessUnit = await BusinessUnit.findOne({ BUSINESS_UNIT });

    // If BusinessUnit doesn't exist, create it
    if (!existingBusinessUnit) {
      const newBusinessUnit = new BusinessUnit({
        BU_ID: new mongoose.Types.ObjectId(),
        BUSINESS_UNIT,
        DESCRIPTION: 'Description for ' + BUSINESS_UNIT,
        ADDRESS: 'Address for ' + BUSINESS_UNIT,
      });
      await newBusinessUnit.save();
    }

    // Create the new BusinessRole
    const newBusinessRole = new BusinessRole({
      ROLE_NM,
      REC_ST,
      VERSION_NO,
      USER_ID,
      CREATE_DT,
      SYS_CREATE_TS,
      CREATED_BY,
      ALLOW_TXN_POSTING_FG,
      ALLOW_EXCH_RATE_OVR_FG,
      ROLE_ID: BU_ROLE_ID,
      BUSINESS_UNIT,  // Consistent use of BUSINESS_UNIT
      EFF_FROM_DT,
      DEF_ROLE_FG,
      SUPERVISOR_FG,
      WF_ITEM_ACCESS_LEVEL,
    });

    // Save the BusinessRole
    await newBusinessRole.save();
    res.status(201).json({ message: 'BusinessRole created successfully', data: newBusinessRole });
  } catch (error) {
    console.error('Error creating BusinessRole:', error);
    res.status(500).json({ message: 'Error creating BusinessRole', error: error.message });
  }
};



// Get BusinessRole by User ID
export const getBusinessRoleByUserId = async (req, res) => {
  try {
    const { USER_ID } = req.params;

    const businessRole = await BusinessRole.findOne({ USER_ID });

    if (!businessRole) {
      return res.status(404).json({ message: 'BusinessRole not found for this USER_ID' });
    }

    res.status(200).json({ message: 'BusinessRole retrieved successfully', data: businessRole });
  } catch (error) {
    console.error('Error fetching BusinessRole:', error);
    res.status(500).json({ message: 'Error fetching BusinessRole', error: error.message });
  }
};

// Update a BusinessRole by ID
export const updateBusinessRole = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedBusinessRole = await BusinessRole.findByIdAndUpdate(id, req.body, { new: true });

    if (!updatedBusinessRole) {
      return res.status(404).json({ message: 'BusinessRole not found' });
    }

    res.status(200).json({ message: 'BusinessRole updated successfully', data: updatedBusinessRole });
  } catch (error) {
    res.status(500).json({ message: 'Error updating BusinessRole', error: error.message });
  }
};

// Delete a BusinessRole by ID
export const deleteBusinessRole = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedBusinessRole = await BusinessRole.findByIdAndDelete(id);

    if (!deletedBusinessRole) {
      return res.status(404).json({ message: 'BusinessRole not found' });
    }

    res.status(200).json({ message: 'BusinessRole deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting BusinessRole', error: error.message });
  }
};

// Assign BusinessRole to User
export const assignBusinessRoleToUser = async (req, res) => {
  try {
    const { USER_ID, ROLE_NM } = req.body;

    const user = await User.findOne({ USER_ID });
    const role = await BusinessRole.findOne({ ROLE_NM });

    if (!user || !role) {
      return res.status(404).json({ message: 'User or Business Role not found' });
    }

    if (user.roles.includes(role._id)) {
      return res.status(400).json({ message: 'Role is already assigned to this user' });
    }

    user.roles.push(role._id);
    await user.save();

    res.status(200).json({ message: 'Business Role assigned to user successfully', data: { USER_ID, ROLE_NM } });
  } catch (error) {
    console.error('Error assigning role:', error);
    res.status(500).json({ message: 'Error assigning role', error: error.message });
  }
};

export const getAllBusinessRoles = async (req, res) => {
  try {
    const businessRoles = await BusinessRole.find();
    res.status(200).json({ message: 'BusinessRoles retrieved successfully', data: businessRoles });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching BusinessRoles', error: error.message });
  }
};

export default router;  // Export the router
