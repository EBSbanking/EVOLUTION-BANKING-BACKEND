import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import User from '../models/User.js';
import UserRole from '../models/UserRole.js';
import roleMapping from '../constants/roleMapping.js';

const router = express.Router();

// Global cache for permissions
let permissionsCache = new Map();
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Preload all role permissions once
export async function initializePermissionsCache() {
  try {
    console.log('Initializing permissions cache...');
    const allRoles = await UserRole.find().lean();
    
    // Clear existing cache
    permissionsCache.clear();
    
    // Populate cache with database permissions
    allRoles.forEach(role => {
      permissionsCache.set(role.role, role.permissions || []);
    });
    
    // Add role mapping permissions as fallback
    if (roleMapping.ROLE_MAPPING) {
      Object.entries(roleMapping.ROLE_MAPPING).forEach(([roleId, roleData]) => {
        const roleKey = roleData.ROLE_NM || `ROLE_${roleId}`;
        if (roleData.permissions && !permissionsCache.has(roleKey)) {
          const flattenedPermissions = Object.values(roleData.permissions).flat();
          permissionsCache.set(roleKey, flattenedPermissions);
        }
      });
    }
    
    cacheTimestamp = Date.now();
    console.log(`Permissions cache initialized with ${permissionsCache.size} roles`);
  } catch (error) {
    console.error('Failed to initialize permissions cache:', error);
  }
}

// Initialize cache on startup
initializePermissionsCache();

// Refresh cache periodically (optional)
setInterval(() => {
  if (cacheTimestamp && (Date.now() - cacheTimestamp) > CACHE_DURATION) {
    initializePermissionsCache();
  }
}, CACHE_DURATION);

// GET /api/config/user — fetch user system config (OPTIMIZED)
router.get('/user', authenticate, async (req, res) => {
  // Set timeout for the request (5 seconds max)
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).json({ message: 'Request timeout' });
    }
  }, 5000);

  try {
    const { id } = req.user;

    // 1. Fetch user ONLY (single database call)
    const user = await User.findById(id).lean();
    if (!user) {
      clearTimeout(timeout);
      return res.status(404).json({ message: 'User not found' });
    }

    const roleId = user.BU_ROLE_ID;
    
    // 2. Get role name from mapping (no database call)
    const roleName = roleMapping.ROLE_MAPPING?.[roleId]?.ROLE_NM || user.primary_business_role || 'User';
    
    // 3. Get permissions from CACHE (no database call)
    const cacheKey = user.primary_business_role || roleName;
    const activities = permissionsCache.get(cacheKey) || [];

    // 4. Construct config response
    const userConfig = {
      id: user._id,
      username: user.user_name,
      name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
      email: user.email,
      role: roleName,
      businessUnit: user.main_business_unit,
      jobTitle: user.job_title,
      isSupervisor: user.is_supervisor,
      isMainBU: user.is_main_BU,
      status: user.status,
      buRoleId: roleId,
      activities, // from cache - no database call
      systemParameters: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: 'en-NG',
        environment: process.env.NODE_ENV || 'development',
        multiSession: user.enable_multi_session,
        ipValidation: user.validate_ip_address,
      }
    };

    clearTimeout(timeout);
    res.json(userConfig);

  } catch (error) {
    clearTimeout(timeout);
    console.error('Failed to fetch user config:', error);
    
    if (error.name === 'TimeoutError') {
      return res.status(408).json({ message: 'Request timeout' });
    }
    
    res.status(500).json({ message: 'Internal Server Error' });
  }
});

// Endpoint to manually refresh cache (optional)
router.post('/refresh-permissions-cache', authenticate, async (req, res) => {
  try {
    await initializePermissionsCache();
    res.json({ message: 'Permissions cache refreshed successfully' });
  } catch (error) {
    console.error('Failed to refresh cache:', error);
    res.status(500).json({ message: 'Failed to refresh cache' });
  }
});

export default router;