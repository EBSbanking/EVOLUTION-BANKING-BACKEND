

// middlewares/businessUnitAuth.js
import { ROLE_MAPPING, BUSINESS_UNIT_MAPPING } from '../constants/roleMapping.js';
import RoleMapping from '../models/RoleMapping.js';

export const authorizeBusinessUnit = (options = {}) => {
  return async (req, res, next) => {
    try {
      // 1. ADMIN BYPASS CHECK (using ROLE_MAPPING)
      if (req.user?.isAdmin || req.user?.role === ROLE_MAPPING[1].ROLE_NM) {
        console.log(`Administrator override by ${req.user.user_name}`);
        req.authorizedBusinessUnit = {
          id: 'ALL',
          name: 'ALL BUSINESS UNITS',
          accessLevel: 'ALL'
        };
        return next();
      }

      // 2. STANDARD USER VALIDATION
      const userId = req.user?.USER_ID || req.body.USER_ID;
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'User identification missing'
        });
      }

      // 3. GET USER ROLE MAPPING
      const roleMapping = await RoleMapping.findOne({ USER_ID: userId }).lean();
      
      if (!roleMapping) {
        return res.status(403).json({
          success: false,
          message: 'No role assignment found for user'
        });
      }

      // 4. CHECK BUSINESS UNIT ACCESS USING BUSINESS_UNIT_MAPPING
      const userBU = roleMapping.Business_Unit;
      const requestedBU = req.body.BUSINESS_UNIT || req.query.bu;
      
      // Check if user's BU exists in the mapping
      if (!BUSINESS_UNIT_MAPPING[userBU]) {
        return res.status(403).json({
          success: false,
          message: 'Your business unit is not properly configured',
          userBusinessUnit: userBU
        });
      }

      // 5. VALIDATE ACCESS LEVELS
      const isSameBU = userBU === requestedBU;
      const isAuthorized = !requestedBU || isSameBU || 
                         (options.allowAll && roleMapping.ROLE_ID === 1); // Admin role ID

      if (!isAuthorized) {
        return res.status(403).json({
          success: false,
          message: 'Unauthorized business unit access',
          userBusinessUnit: userBU,
          requestedBusinessUnit: requestedBU,
          allowed: isSameBU ? 'OWN BUSINESS UNIT' : 'None'
        });
      }

      // 6. ATTACH CONTEXT FOR DOWNSTREAM USE
      req.authorizedBusinessUnit = {
        id: BUSINESS_UNIT_MAPPING[userBU],
        name: userBU,
        accessLevel: isSameBU ? 'OWN' : 'ALL'
      };

      next();
    } catch (error) {
      console.error('Business Unit Authorization Error:', error);
      res.status(500).json({
        success: false,
        message: 'Authorization service unavailable',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  };
};