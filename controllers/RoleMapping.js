import { ROLE_MAPPING } from "../constants/roleMapping";
import RoleMapping from "../models/RoleMapping";
import authorizeRoles from "../middlewares/roleMiddleware.js";
import Permission from "../models/Permissions.js";

const createRoleMapping = async (req, res) => {
    const { USER_ROLE_ID, USER_ID, CREATED_BY, EFF_FROM_DT, DEF_ROLE_FG, SUPERVISOR_FG, WF_ITEM_ACCESS_LEVEL, REC_ST } = req.body;
  
    // Log to debug
    console.log('Received USER_ROLE_ID:', USER_ROLE_ID);
  
    // Look up role data using ROLE_MAPPING with string keys
    const roleData = ROLE_MAPPING[USER_ROLE_ID];
  
    // Check if the role data exists
    if (!roleData) {
      return res.status(400).json({
        success: false,
        message: "Invalid ROLE_ID provided"  // Provide the role name instead of number
      });
    }

    try {
      // Create permissions for the role
      const permissions = new Permission({
        BU_ROLE_ID: USER_ROLE_ID,
        DRAWER_ACCESS_LEVEL: roleData.permissions.DRAWER_ACCESS_LEVEL,
        CUST_POSTING_ACCESS_LEVEL: roleData.permissions.CUST_POSTING_ACCESS_LEVEL,
        GL_POSTING_ACCESS_LEVEL: roleData.permissions.GL_POSTING_ACCESS_LEVEL,
        TXN_ENQUIRY_ACCESS_LVL: roleData.permissions.TXN_ENQUIRY_ACCESS_LVL,
        FIXED_ASSET_ACCESS_LEVEL: roleData.permissions.FIXED_ASSET_ACCESS_LEVEL,
        REPORT_ACCESS_LEVEL: roleData.permissions.REPORT_ACCESS_LEVEL,
        DASHBOARD_ACCESS_LEVEL: roleData.permissions.DASHBOARD_ACCESS_LEVEL,
        CREDIT_APPL_ACCESS_LEVEL: roleData.permissions.CREDIT_APPL_ACCESS_LEVEL,
        CUSTOMER_ACCESS_LEVEL: roleData.permissions.CUSTOMER_ACCESS_LEVEL,
        ACCOUNT_ACCESS_LEVEL: roleData.permissions.ACCOUNT_ACCESS_LEVEL
      });

      // Save permissions to database
      const savedPermissions = await permissions.save();

      // Create the new RoleMapping instance with permissions reference
      const newRoleMapping = new RoleMapping({
        ROLE_ID: USER_ROLE_ID,  // This is the string role ID
        ROLE_NM: roleData.ROLE_NM,
        Business_Unit: roleData.getBusinessUnit(),
        USER_ID,
        CREATED_BY,
        EFF_FROM_DT,
        DEF_ROLE_FG,
        SUPERVISOR_FG,
        WF_ITEM_ACCESS_LEVEL,
        REC_ST,
        PERMISSIONS_ID: savedPermissions._id // Reference to the saved permissions
      });
  
      // Save the role mapping to the database
      await newRoleMapping.save();
      
      return res.status(201).json({
        success: true,
        message: "Role Mapping created successfully",
        data: {
          roleMapping: newRoleMapping,
          permissions: savedPermissions
        },
      });
    } catch (error) {
      console.error("Error saving role mapping:", error);
      return res.status(500).json({
        success: false,
        message: "Error saving role mapping",
        error: error.message
      });
    }
};

export default createRoleMapping;