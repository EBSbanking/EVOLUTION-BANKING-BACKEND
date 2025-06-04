// controllers/PermissionsController.js

import Permissions from '../models/Permissions.js';  // Default import
import UserRole from '../models/UserRole.js';
import User from '../models/User.js';

// Your controller logic... // Correct import for named export
// Create permission for a role
export const createPermissionForRole = async (req, res) => {
  const { USER_ROLE_ID, DRAWER_ACCESS_LEVEL, CUST_POSTING_ACCESS_LEVEL, GL_POSTING_ACCESS_LEVEL, TXN_ENQUIRY_ACCESS_LVL, FIXED_ASSET_ACCESS_LEVEL, REPORT_ACCESS_LEVEL, DASHBOARD_ACCESS_LEVEL, CREDIT_APPL_ACCESS_LEVEL, CUSTOMER_ACCESS_LEVEL, ACCOUNT_ACCESS_LEVEL } = req.body;

  try {
    const newPermission = new Permissions({
      roleId: USER_ROLE_ID,  // Use the role ID from the request body
      DRAWER_ACCESS_LEVEL,
      CUST_POSTING_ACCESS_LEVEL,
      GL_POSTING_ACCESS_LEVEL,
      TXN_ENQUIRY_ACCESS_LVL,
      FIXED_ASSET_ACCESS_LEVEL,
      REPORT_ACCESS_LEVEL,
      DASHBOARD_ACCESS_LEVEL,
      CREDIT_APPL_ACCESS_LEVEL,
      CUSTOMER_ACCESS_LEVEL,
      ACCOUNT_ACCESS_LEVEL
    });

    await newPermission.save();
    res.status(201).json({ success: true, message: 'Permission successfully saved!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error saving permission', error });
  }
};

// Get permissions for a role by roleId
export const getPermissionsForRole = async (req, res) => {
  const { roleId } = req.params;

  try {
    const permission = await Permissions.findOne({ roleId });

    if (!permission) {
      return res.status(404).json({ success: false, message: 'Permissions not found for this role' });
    }

    res.status(200).json({ success: true, permission });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching permissions', error });
  }
};
