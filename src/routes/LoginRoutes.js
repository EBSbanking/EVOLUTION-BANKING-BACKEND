// routes/authRoutes.js - COMPLETE FIXED VERSION WITH 2FA SUPPORT & FORBIDDEN PASSWORDS
import express from 'express';
import asyncHandler from 'express-async-handler';
import { 
  login, 
  changePassword,
  emergencyPasswordReset, 
  testConfigService,
  clearUserSession,
  clearAllUserSessions,
  changeFirstLoginPassword,
  // 2FA Controllers
  initiate2FA,
  verify2FAToken,
  verifyHardware2FA,
  resend2FAToken,
  get2FAStatus,
  configure2FA,
  testSMSConfig,
  getSMSStatus,
  get2FAStatistics,
  // RFID Controllers
  rfidLogin,
  verifyRFID2FA,
  getUserRFIDTokens,
  deactivateRFIDToken,
  getRFIDStatus,
  initializeRFIDReader,
  simulateRFIDCard,
  // ✅ FORBIDDEN PASSWORDS CONTROLLERS
  getForbiddenPasswords,
  addForbiddenPassword,
  removeForbiddenPassword,
  deleteForbiddenPassword,
  resetForbiddenPasswords,
  updateForbiddenPasswords
} from '../controllers/LoginController.js';
import verifyToken from '../middlewares/verifyToken.js';
import { restrictToPermission } from '../middlewares/rbac.js';
import { checkPermission } from '../middlewares/rolePermissionMiddleware.js';
import User from '../models/User.js';
import Permissions from '../models/Permissions.js';
import { ROLE_MAPPING, getRoleWithPermissions } from '../constants/roleMapping.js';
import PERMISSIONS from '../constants/permissions.js';
import logger from '../utils/logger.js';
import { checkLicenseForRoute } from '../middlewares/licenseMiddleware.js';

const router = express.Router();

// Helper: Validate numeric ID
const isValidId = (id) => {
  if (!id) return false;
  const parsed = parseInt(id, 10);
  return !isNaN(parsed) && parsed > 0;
};

// Helper: Get accessible business units
const getAccessibleBusinessUnits = (userData, reqUser) => {
  if (userData.accessibleBusinessUnits && Array.isArray(userData.accessibleBusinessUnits)) {
    return userData.accessibleBusinessUnits;
  }
  if (reqUser?.accessibleBusinessUnits && Array.isArray(reqUser.accessibleBusinessUnits)) {
    return reqUser.accessibleBusinessUnits;
  }
  return [userData.main_business_unit || reqUser?.main_business_unit || 'Wethral'];
};

// ============================================
// ✅ AUTHENTICATION ROUTES - COMPLETE SET
// ============================================

/**
 * 🔐 LOGIN ENDPOINTS
 * Your frontend calls /login/login, we support both formats
 */
router.post('/login', login);                    // Standard endpoint
router.post('/login/login', login);             // Your frontend uses this! ✅

/**
 * 🔑 PASSWORD MANAGEMENT
 */
// Change password with current password verification
router.post('/change-first-password', changeFirstLoginPassword);

// Emergency password reset (admin only - should be protected!)
router.post('/emergency-reset', emergencyPasswordReset);

/**
 * 🧹 SESSION MANAGEMENT - NEW ENDPOINTS
 */
// Clear a specific user's session (invalidate all their tokens)
router.post('/clear-session', verifyToken, clearUserSession);

// Clear all users' sessions (admin only)
router.post('/clear-all-sessions', verifyToken, clearAllUserSessions);

// Alternative: Clear session by user ID (can be called by admin)
router.post('/clear-session/:userId', async (req, res) => {
  // Forward to clearUserSession with user_id from params
  req.body.user_id = req.params.userId;
  return clearUserSession(req, res);
});

/**
 * 🚪 LOGOUT ENDPOINTS
 */
// Public logout
router.post('/logout', checkLicenseForRoute, (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const tokenFromHeader = authHeader && authHeader.split(' ')[1];
    const { refreshToken, accessToken } = req.body;
    
    const accessTokenToInvalidate = tokenFromHeader || accessToken;
    
    logger.info('User logged out (public endpoint)', {
      logoutTime: new Date().toISOString(),
      hasAccessToken: !!accessTokenToInvalidate,
      hasRefreshToken: !!refreshToken,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || req.connection.remoteAddress
    });
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
      data: {
        logoutTime: new Date().toISOString(),
        accessTokenInvalidated: !!accessTokenToInvalidate,
        refreshTokenInvalidated: !!refreshToken,
        note: 'Client should clear tokens from storage'
      }
    });
  } catch (error) {
    logger.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
});

// Protected logout with authentication
router.post('/logout-protected', verifyToken, checkLicenseForRoute, async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const authHeader = req.headers['authorization'];
    const accessToken = authHeader && authHeader.split(' ')[1];
    
    logger.info('Authenticated user logged out', {
      userId: req.user?.userId,
      username: req.user?.user_name,
      logoutTime: new Date().toISOString(),
      hasRefreshToken: !!refreshToken,
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || req.connection.remoteAddress
    });
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully',
      data: {
        userId: req.user?.userId,
        username: req.user?.user_name,
        logoutTime: new Date().toISOString(),
        accessTokenInvalidated: !!accessToken,
        refreshTokenInvalidated: !!refreshToken,
        sessionEnded: true
      }
    });
  } catch (error) {
    logger.error('Protected logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
      error: error.message
    });
  }
});

// ============================================
// ✅ 2FA ROUTES - COMPLETE SET
// ============================================

/**
 * 🔐 2FA INITIATION & VERIFICATION
 * These are called during the 2FA flow
 */
// Initiate 2FA - Send SMS/Email token
router.post('/2fa/initiate', initiate2FA);

// Verify 2FA token (Email/SMS)
router.post('/2fa/verify', verify2FAToken);

// Verify Hardware 2FA (RFID)
router.post('/2fa/verify-hardware', verifyHardware2FA);

// Resend 2FA token
router.post('/2fa/resend', resend2FAToken);

/**
 * 🔐 2FA STATUS & CONFIGURATION (Authenticated)
 */
// Get user's 2FA status
router.get('/2fa/status', verifyToken, checkLicenseForRoute, get2FAStatus);

// Configure 2FA (Admin only)
router.put(
  '/2fa/configure',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.MANAGE_USERS),
  checkLicenseForRoute,
  configure2FA
);

// Test SMS configuration (Admin only)
router.post(
  '/2fa/test-sms',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
  testSMSConfig
);

// Get SMS delivery status (Authenticated)
router.get('/2fa/sms-status/:smsId', verifyToken, checkLicenseForRoute, getSMSStatus);

// Get 2FA statistics (Admin only)
router.get(
  '/2fa/statistics',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
  get2FAStatistics
);

// ============================================
// ✅ RFID ROUTES - COMPLETE SET
// ============================================

/**
 * 🔐 RFID 2FA LOGIN (Public)
 */
// RFID login endpoint
router.post('/rfid/login', rfidLogin);

// Verify RFID 2FA token
router.post('/rfid/verify', verifyRFID2FA);

/**
 * 🔐 RFID TOKEN MANAGEMENT (Authenticated)
 */
// Get user's RFID tokens
router.get('/rfid/tokens', verifyToken, checkLicenseForRoute, getUserRFIDTokens);

// Deactivate RFID token
router.delete(
  '/rfid/tokens/:tokenId',
  verifyToken,
  checkLicenseForRoute,
  deactivateRFIDToken
);

// Get RFID reader status
router.get('/rfid/status', verifyToken, checkLicenseForRoute, getRFIDStatus);

// Initialize RFID reader (Admin only)
router.post(
  '/rfid/initialize',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
  initializeRFIDReader
);

// Simulate RFID card (Admin only - for testing)
router.post(
  '/rfid/simulate',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
  simulateRFIDCard
);

// ============================================
// ✅ FORBIDDEN PASSWORDS ROUTES (Admin only)
// ============================================

/**
 * 📋 FORBIDDEN PASSWORDS MANAGEMENT
 * These routes allow administrators to manage the forbidden passwords list
 */

// Get all forbidden passwords (paginated)
router.get(
  '/forbidden-passwords',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
  getForbiddenPasswords
);

// Add a forbidden password
router.post(
  '/forbidden-passwords',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
  addForbiddenPassword
);

// Remove a forbidden password (soft delete - deactivate)
router.delete(
  '/forbidden-passwords/:password',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
  removeForbiddenPassword
);

// Permanently delete a forbidden password
router.delete(
  '/forbidden-passwords/permanent/:password',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
  deleteForbiddenPassword
);

// Reset forbidden passwords to default
router.post(
  '/forbidden-passwords/reset',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
  resetForbiddenPasswords
);

// Bulk update forbidden passwords
router.put(
  '/forbidden-passwords',
  verifyToken,
  checkPermission(PERMISSIONS.SYSTEM_ADMIN.ADMIN_ACCESS),
  checkLicenseForRoute,
  updateForbiddenPasswords
);

// ============================================
// 👤 USER PROFILE & SESSION
// ============================================

/**
 * Get authenticated user details (/me)
 * Includes 2FA and RFID status
 */
router.get(
  '/me',
  verifyToken,
  checkLicenseForRoute,
  asyncHandler(async (req, res) => {
    try {
      // Validate user ID from token
      if (!req.user || !req.user.userId || !isValidId(req.user.userId)) {
        logger.warn('Invalid or missing userId in /me', {
          userId: req.user?.userId,
          tokenKeys: req.user ? Object.keys(req.user) : null
        });
        return res.status(401).json({
          success: false,
          message: 'Invalid or missing user ID in token'
        });
      }

      // Fetch user using Sequelize
      const user = await User.findByPk(req.user.userId, {
        attributes: { 
          include: [
            'rfid_enabled',
            'two_factor_enabled',
            'two_factor_methods',
            'two_factor_phone',
            'two_factor_email'
          ] 
        }
      });
      
      if (!user) {
        logger.warn('User not found in /me', { userId: req.user.userId });
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      const userData = user.get({ plain: true });

      // Resolve BU_ROLE_ID
      let BU_ROLE_ID = userData.BU_ROLE_ID?.toString();
      if (!BU_ROLE_ID && userData.role) {
        const roleMap = Object.fromEntries(
          Object.values(ROLE_MAPPING).map(r => [r.ROLE_NM, r.id.toString()])
        );
        BU_ROLE_ID = roleMap[userData.role] || '29';
      }
      BU_ROLE_ID = BU_ROLE_ID || req.user.roleId?.toString() || '29';

      // Resolve permissions
      let permissions = userData.permissions || {};
      let roleName = userData.primary_business_role || 'Staff';

      if (Object.keys(permissions).length === 0 && BU_ROLE_ID !== '0') {
        const permDoc = await Permissions.findOne({
          where: { BU_ROLE_ID: parseInt(BU_ROLE_ID) }
        });

        if (permDoc) {
          permissions = permDoc.permissions || {};
          roleName = permDoc.ROLE_NAME || roleName;
        } else {
          const roleDetails = getRoleWithPermissions(BU_ROLE_ID);
          if (roleDetails) {
            permissions = roleDetails.permissions || {};
            roleName = roleDetails.ROLE_NM || roleName;
          } else {
            permissions = {
              DASHBOARD_ACCESS_LEVEL: [
                PERMISSIONS.DASHBOARD.VIEW,
                PERMISSIONS.DASHBOARD.TRANSACTION_OVERVIEW,
                PERMISSIONS.DASHBOARD.TELLER_DASHBOARD,
                PERMISSIONS.DASHBOARD.QUICK_ACTIONS,
              ],
              ACCOUNT_ACCESS_LEVEL: [
                PERMISSIONS.ACCOUNT.DEPOSIT_101,
                PERMISSIONS.ACCOUNT.WITHDRAWAL_102,
                PERMISSIONS.ACCOUNT.VIEW_BALANCE,
                PERMISSIONS.ACCOUNT.VIEW_STATEMENT,
              ],
              TRANSACTION_ACCESS_LEVEL: [
                PERMISSIONS.TRANSACTION.DEPOSIT,
                PERMISSIONS.TRANSACTION.WITHDRAWAL,
                PERMISSIONS.TRANSACTION.TRANSFER,
                PERMISSIONS.TRANSACTION.OPENING_DEPOSIT,
                PERMISSIONS.TRANSACTION.VIEW_HISTORY,
              ],
              CUSTOMER_ACCESS_LEVEL: [
                PERMISSIONS.CUSTOMER.VIEW,
                PERMISSIONS.CUSTOMER.UPDATE,
                PERMISSIONS.CUSTOMER.PROFILE,
              ],
              DRAWER_ACCESS_LEVEL: [
                PERMISSIONS.DRAWER.VIEW,
                PERMISSIONS.DRAWER.MANAGE,
                PERMISSIONS.DRAWER.RECONCILE,
              ],
              REPORT_ACCESS_LEVEL: [
                PERMISSIONS.REPORT.VIEW,
                PERMISSIONS.REPORT.TELLER_SUMMARY,
              ],
            };
            roleName = 'Teller';
          }
        }
      }

      const isAdmin = userData.isAdmin || req.user.isAdmin || BU_ROLE_ID === '1';
      const accessibleBusinessUnits = getAccessibleBusinessUnits(userData, req.user);
      const tokenIssuedAt = req.user.iat ? new Date(req.user.iat * 1000).toISOString() : null;
      const tokenExpiresAt = req.user.exp ? new Date(req.user.exp * 1000).toISOString() : null;

      // Get available 2FA methods
      let twoFAMethods = [];
      let twoFAEnabled = userData.two_factor_enabled || false;
      
      if (twoFAEnabled) {
        if (userData.two_factor_methods?.hardware_token && userData.rfid_enabled) {
          twoFAMethods.push('hardware_token');
        }
        if (userData.two_factor_methods?.email_token) {
          twoFAMethods.push('email_token');
        }
        if (userData.two_factor_methods?.sms_token && userData.two_factor_phone) {
          twoFAMethods.push('sms_token');
        }
      }

      logger.info('Authenticated user details fetched', {
        userId: userData.id,
        user_name: userData.user_name,
        role: roleName,
        isAdmin,
        twoFAEnabled,
        twoFAMethods
      });

      res.json({
        success: true,
        message: 'Authenticated user details',
        user: {
          userId: userData.id,
          user_name: userData.user_name || userData.username,
          email: userData.email || req.user.email || '',
          role: roleName,
          BU_ROLE_ID,
          primary_business_role: userData.primary_business_role || roleName,
          businessUnit: userData.main_business_unit || req.user.businessUnit || 'Wethral',
          permissions,
          isAdmin,
          accessibleBusinessUnits,
          tokenIssuedAt,
          tokenExpiresAt,
          first_name: userData.first_name,
          last_name: userData.last_name,
          status: userData.status,
          employer_number: userData.employer_number,
          // 2FA Information
          two_factor_enabled: twoFAEnabled,
          two_factor_methods: userData.two_factor_methods || {
            hardware_token: false,
            email_token: false,
            sms_token: false
          },
          two_factor_phone: userData.two_factor_phone || null,
          two_factor_email: userData.two_factor_email || null,
          rfid_enabled: userData.rfid_enabled || false,
          two_fa_methods_list: twoFAMethods
        },
        sessionInfo: {
          authenticated: true,
          timestamp: new Date().toISOString(),
          userAgent: req.headers['user-agent']
        }
      });
    } catch (error) {
      logger.error('Error in /me endpoint', {
        error: error.message,
        stack: error.stack,
        userId: req.user?.userId
      });
      res.status(500).json({
        success: false,
        message: 'Server error',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
      });
    }
  })
);

/**
 * 🏢 BUSINESS ROLE ENDPOINT
 * ✅ CRITICAL - Your frontend redirects here after login!
 */
router.get('/business-role', verifyToken, (req, res) => {
  console.log('🏢 Business role endpoint accessed:', {
    userId: req.user?.userId,
    user_name: req.user?.user_name,
    BU_ROLE_ID: req.user?.BU_ROLE_ID,
    isAdmin: req.user?.isAdmin
  });

  res.json({
    success: true,
    message: 'Business role information',
    user: {
      userId: req.user?.userId,
      user_name: req.user?.user_name,
      BU_ROLE_ID: req.user?.BU_ROLE_ID,
      role: req.user?.role,
      isAdmin: req.user?.isAdmin,
      businessUnit: req.user?.businessUnit || 'Wethral',
      two_factor_enabled: req.user?.two_factor_enabled || false
    },
    availableRoles: req.user?.isAdmin ? ['Administrator', 'Manager', 'Teller'] : [req.user?.role],
    defaultRole: req.user?.role,
    redirectTo: '/dashboard'
  });
});

// ============================================
// 🔐 LOGIN VALIDATION ENDPOINT
// ============================================
router.post('/login/validate', asyncHandler(async (req, res) => {
  try {
    const { user_name, password } = req.body;
    
    // Validate input
    if (!user_name || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }
    
    // Find user
    const user = await User.findOne({ where: { user_name } });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }
    
    // Check if account is locked
    if (user.locked) {
      return res.status(401).json({
        success: false,
        message: 'Account locked due to too many failed attempts',
        locked: true
      });
    }
    
    // Validate password
    const isValidPassword = await user.validatePassword(password);
    if (!isValidPassword) {
      // Track failed attempts
      await user.increment('failedLoginAttempts');
      
      const attempts = user.failedLoginAttempts + 1;
      const maxAttempts = 3;
      const remainingAttempts = Math.max(0, maxAttempts - attempts);
      
      if (attempts >= maxAttempts) {
        await user.update({ locked: true });
        return res.status(401).json({
          success: false,
          message: 'Account locked due to too many failed attempts',
          locked: true
        });
      }
      
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials',
        remainingAttempts
      });
    }
    
    // ✅ Check if user has 2FA enabled
    if (user.two_factor_enabled) {
      // Generate a session ID for 2FA
      const sessionId = generateSessionId();
      
      // Determine available 2FA methods
      const methods = [];
      const twoFactorMethods = user.two_factor_methods || {};
      
      if (twoFactorMethods.hardware_token && user.rfid_enabled) {
        methods.push({
          type: 'hardware_token',
          label: 'Hardware Token (HID)',
          description: 'Tap your HID Mini Token on the reader'
        });
      }
      if (twoFactorMethods.email_token && user.email) {
        methods.push({
          type: 'email_token',
          label: 'Email Token',
          description: `Send code to ${user.email}`
        });
      }
      if (twoFactorMethods.sms_token && user.phone) {
        methods.push({
          type: 'sms_token',
          label: 'SMS Token',
          description: `Send code to ${user.phone}`
        });
      }
      
      // ✅ Return 2FA required response
      return res.json({
        success: true,
        twoFactorEnabled: true,
        require2FA: true,
        userId: user.id,
        sessionId: sessionId,
        methods: methods,
        message: '2FA verification required',
        remainingAttempts: 3
      });
    }
    
    // ✅ No 2FA - Login successful
    // Generate JWT token
    const token = generateJWT(user);
    const refreshToken = generateRefreshToken(user);
    
    // Reset failed attempts
    await user.update({ 
      failedLoginAttempts: 0,
      lastLogin: new Date()
    });
    
    return res.json({
      success: true,
      token,
      refreshToken,
      user: {
        userId: user.id,
        user_name: user.user_name,
        email: user.email,
        phone: user.phone,
        BU_ROLE_ID: user.BU_ROLE_ID,
        role: user.role,
        requiresPasswordChange: user.requiresPasswordChange || false,
        two_factor_enabled: false
      },
      expiresIn: 3600
    });
    
  } catch (error) {
    console.error('Login validation error:', error);
    return res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
}));

// Helper function to generate session ID
function generateSessionId() {
  return `2fa_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

// Helper function to generate JWT
function generateJWT(user) {
  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_SECRET || 'your-secret-key';
  return jwt.sign(
    { 
      userId: user.id, 
      user_name: user.user_name,
      role: user.role,
      BU_ROLE_ID: user.BU_ROLE_ID
    },
    secret,
    { expiresIn: '1h' }
  );
}

function generateRefreshToken(user) {
  const jwt = require('jsonwebtoken');
  const secret = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
  return jwt.sign(
    { userId: user.id },
    secret,
    { expiresIn: '7d' }
  );
}

// ============================================
// 🧪 TEST ENDPOINTS
// ============================================

// Test Configuration Service
router.get('/test-config', testConfigService);

// Test auth status
router.get('/status', (req, res) => {
  res.json({
    success: true,
    message: 'Auth routes are working',
    timestamp: new Date().toISOString(),
    endpoints: {
      login: ['/login', '/login/login', '/login/validate'],
      password: ['/change-first-password', '/emergency-reset'],
      session: ['/clear-session', '/clear-all-sessions', '/clear-session/:userId'],
      logout: ['/logout', '/logout-protected'],
      profile: ['/me'],
      businessRole: ['/business-role'],
      // 2FA Endpoints
      twoFA: {
        initiate: '/2fa/initiate',
        verify: '/2fa/verify',
        verifyHardware: '/2fa/verify-hardware',
        resend: '/2fa/resend',
        status: '/2fa/status',
        configure: '/2fa/configure',
        testSMS: '/2fa/test-sms',
        smsStatus: '/2fa/sms-status/:smsId',
        statistics: '/2fa/statistics'
      },
      // RFID Endpoints
      rfid: {
        login: '/rfid/login',
        verify: '/rfid/verify',
        tokens: '/rfid/tokens',
        deactivate: '/rfid/tokens/:tokenId',
        status: '/rfid/status',
        initialize: '/rfid/initialize',
        simulate: '/rfid/simulate'
      },
      // ✅ FORBIDDEN PASSWORDS ENDPOINTS
      forbiddenPasswords: {
        list: '/forbidden-passwords (GET)',
        add: '/forbidden-passwords (POST)',
        remove: '/forbidden-passwords/:password (DELETE)',
        permanentDelete: '/forbidden-passwords/permanent/:password (DELETE)',
        reset: '/forbidden-passwords/reset (POST)',
        bulkUpdate: '/forbidden-passwords (PUT)'
      }
    }
  });
});

export default router;