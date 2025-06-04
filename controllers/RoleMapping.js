import { ROLE_MAPPING } from "../constants/roleMapping";
import RoleMapping from "../models/RoleMapping";
import authorizeRoles from "../middlewares/roleMiddleware.js";

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
  
    // Create the new RoleMapping instance
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
    });
  
    try {
      // Save the role mapping to the database
      await newRoleMapping.save();
      return res.status(201).json({
        success: true,
        message: "Role Mapping created successfully",
        data: newRoleMapping,
      });
    } catch (error) {
      console.error("Error saving role mapping:", error);
      return res.status(500).json({
        success: false,
        message: "Error saving role mapping",
      });
    }
  };
  

export default createRoleMapping;
