// middleware/licenseValidation.js
import License from '../models/License.js';
import User from '../models/User.js';
import ActiveSession from '../models/ActiveSession.js';
import { Op } from 'sequelize';

export const checkLicenseLimits = async (req, res, next) => {
  try {
    // 1. Check if license exists and is valid
    const license = await getActiveLicense();
    
    if (!license || license.isExpired()) {
      return res.status(403).json({
        message: 'License expired or not found',
        code: 'LICENSE_EXPIRED'
      });
    }

    // 2. Check user count limit
    const totalUsers = await User.count({
      where: { status: 'ACTIVE' }
    });

    if (license.max_users && totalUsers >= license.max_users) {
      return res.status(403).json({
        message: 'Maximum user limit reached',
        limit: license.max_users,
        current: totalUsers,
        code: 'USER_LIMIT_REACHED'
      });
    }

    // 3. Check active sessions limit (optional)
    const activeSessions = await ActiveSession.count({
      where: {
        expires_at: { [Op.gt]: new Date() }
      }
    });

    // Add session limit if needed
    const maxConcurrentSessions = license.max_concurrent_sessions || 100;
    if (activeSessions >= maxConcurrentSessions) {
      return res.status(403).json({
        message: 'Maximum concurrent sessions reached',
        limit: maxConcurrentSessions,
        current: activeSessions,
        code: 'SESSION_LIMIT_REACHED'
      });
    }

    // 4. Check branch limit if branch_id is provided
    if (req.body.branch_id && license.max_branches) {
      const uniqueBranches = await User.count({
        distinct: true,
        col: 'branch_id',
        where: { 
          branch_id: { [Op.not]: null }
        }
      });

      if (uniqueBranches >= license.max_branches) {
        return res.status(403).json({
          message: 'Maximum branch limit reached',
          limit: license.max_branches,
          current: uniqueBranches,
          code: 'BRANCH_LIMIT_REACHED'
        });
      }
    }

    // 5. Check features
    if (license.features) {
      const requiredFeature = req.headers['x-required-feature'];
      if (requiredFeature && !license.features[requiredFeature]) {
        return res.status(403).json({
          message: 'Feature not available in your license',
          feature: requiredFeature,
          code: 'FEATURE_NOT_AVAILABLE'
        });
      }
    }

    // License checks passed
    req.license = license;
    next();
  } catch (error) {
    console.error('License validation error:', error);
    res.status(500).json({
      message: 'License validation failed',
      error: error.message
    });
  }
};

const getActiveLicense = async () => {
  try {
    // Read license from file
    const licenseFilePath = process.env.LICENSE_FILE_PATH || 'license.txt';
    
    if (!fs.existsSync(licenseFilePath)) {
      return null;
    }

    const encryptedKey = fs.readFileSync(licenseFilePath, 'utf8').trim();
    
    if (!encryptedKey) {
      return null;
    }

    // Find in database
    const license = await License.findOne({
      where: { encrypted_key: encryptedKey }
    });

    return license;
  } catch (error) {
    console.error('Error getting active license:', error);
    return null;
  }
};