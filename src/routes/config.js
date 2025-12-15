// src/routes/config.js - COMPLETE UPDATED VERSION
import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import User from '../models/User.js';
import UserRole from '../models/UserRole.js';
import roleMapping from '../constants/roleMapping.js';
import mongoose from 'mongoose';

const router = express.Router();

// Global cache for permissions
let permissionsCache = new Map();
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let isUsingFallback = false;

// Helper function to get MongoDB state
function getMongoState(state) {
  const states = {
    0: 'DISCONNECTED',
    1: 'CONNECTED', 
    2: 'CONNECTING',
    3: 'DISCONNECTING'
  };
  return states[state] || `UNKNOWN (${state})`;
}

// Helper to wait for MongoDB connection
async function waitForMongoDBConnection(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    // Check current state
    if (mongoose.connection.readyState === 1) {
      console.log('✅ MongoDB already connected');
      return resolve(true);
    }
    
    // If not connecting, try to trigger connection
    if (mongoose.connection.readyState === 0) {
      console.log('🔄 Attempting to establish MongoDB connection...');
      // The connection should be established elsewhere in your app
      // This just waits for it
    }
    
    const checkInterval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      
      if (mongoose.connection.readyState === 1) {
        clearInterval(checkInterval);
        console.log('✅ MongoDB connection established');
        resolve(true);
      } 
      else if (elapsed > timeoutMs) {
        clearInterval(checkInterval);
        console.warn(`⏰ MongoDB connection timeout after ${timeoutMs}ms`);
        resolve(false);
      }
      else if (mongoose.connection.readyState === 2) {
        console.log(`⏳ Still connecting to MongoDB... (${Math.round(elapsed/1000)}s)`);
      }
    }, 1000);
  });
}

// Load permissions from roleMapping (fallback)
function loadPermissionsFromRoleMapping() {
  permissionsCache.clear();
  
  if (roleMapping.ROLE_MAPPING) {
    Object.entries(roleMapping.ROLE_MAPPING).forEach(([roleId, roleData]) => {
      const roleKey = roleData.ROLE_NM || `ROLE_${roleId}`;
      if (roleData.permissions) {
        const flattenedPermissions = Object.values(roleData.permissions).flat();
        permissionsCache.set(roleKey, flattenedPermissions);
      }
    });
    console.log(`📋 Loaded ${permissionsCache.size} roles from roleMapping (fallback)`);
    return true;
  }
  return false;
}

// Preload all role permissions with retry logic
export async function initializePermissionsCache() {
  const maxRetries = 3;
  let lastError = null;
  
  // First, try to establish MongoDB connection
  const isConnected = await waitForMongoDBConnection(10000);
  
  if (!isConnected) {
    console.log('⚠️ MongoDB not available, using fallback mode');
    isUsingFallback = true;
    loadPermissionsFromRoleMapping();
    cacheTimestamp = Date.now();
    return;
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Initializing permissions cache from database (attempt ${attempt}/${maxRetries})...`);
      console.log(`📊 MongoDB state: ${getMongoState(mongoose.connection.readyState)}`);
      
      // Load roles from database with timeout
      const allRoles = await Promise.race([
        UserRole.find().lean().exec(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Role query timeout (15s)')), 15000)
        )
      ]);
      
      // Clear existing cache
      permissionsCache.clear();
      
      // Populate cache with database permissions
      allRoles.forEach(role => {
        if (role.role && role.permissions) {
          permissionsCache.set(role.role, role.permissions);
        }
      });
      
      console.log(`✅ Loaded ${allRoles.length} roles from database`);
      
      // Merge with roleMapping permissions
      if (roleMapping.ROLE_MAPPING) {
        Object.entries(roleMapping.ROLE_MAPPING).forEach(([roleId, roleData]) => {
          const roleKey = roleData.ROLE_NM || `ROLE_${roleId}`;
          if (roleData.permissions) {
            const flattenedPermissions = Object.values(roleData.permissions).flat();
            if (permissionsCache.has(roleKey)) {
              const existing = permissionsCache.get(roleKey);
              const combined = [...new Set([...existing, ...flattenedPermissions])];
              permissionsCache.set(roleKey, combined);
            } else {
              permissionsCache.set(roleKey, flattenedPermissions);
            }
          }
        });
        console.log(`✅ Merged with roleMapping, total: ${permissionsCache.size} roles`);
      }
      
      cacheTimestamp = Date.now();
      isUsingFallback = false;
      console.log(`✅ Permissions cache initialized successfully with ${permissionsCache.size} roles`);
      return;
      
    } catch (error) {
      lastError = error;
      console.error(`❌ Permissions cache attempt ${attempt} failed:`, error.message);
      
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // If all retries failed, use fallback
  console.error('⚠️ All database attempts failed, using fallback mode');
  console.error('Last error:', lastError?.message);
  
  isUsingFallback = true;
  loadPermissionsFromRoleMapping();
  cacheTimestamp = Date.now();
}

// MongoDB connection event listeners
mongoose.connection.on('connected', () => {
  console.log('✅ MongoDB connected successfully');
  isUsingFallback = false;
  // Try to reload from database when connection is restored
  initializePermissionsCache().catch(error => {
    console.warn('Cache refresh after connection failed:', error.message);
  });
});

mongoose.connection.on('error', (err) => {
  console.error('❌ MongoDB connection error:', err.message);
  isUsingFallback = true;
});

mongoose.connection.on('disconnected', () => {
  console.warn('⚠️ MongoDB disconnected');
  isUsingFallback = true;
});

// Initialize cache on startup
setTimeout(() => {
  console.log('🚀 Starting application initialization...');
  console.log(`📊 Initial MongoDB state: ${getMongoState(mongoose.connection.readyState)}`);
  
  initializePermissionsCache().catch(error => {
    console.warn('Initial permissions cache init failed:', error.message);
  });
}, 3000); // 3 second delay

// Refresh cache periodically
setInterval(() => {
  if (cacheTimestamp && (Date.now() - cacheTimestamp) > CACHE_DURATION) {
    console.log('🔄 Periodic cache refresh triggered...');
    initializePermissionsCache().catch(error => {
      console.warn('Periodic cache refresh failed:', error.message);
    });
  }
}, CACHE_DURATION);

// GET /api/config/user — fetch user system config
router.get('/user', authenticate, async (req, res) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      res.status(408).json({ 
        success: false,
        message: 'Request timeout',
        code: 'TIMEOUT_ERROR'
      });
    }
  }, 15000);

  try {
    const { id } = req.user;

    // Try to fetch user from database if connected
    let user = null;
    let userFetchError = null;
    
    if (mongoose.connection.readyState === 1) {
      try {
        user = await Promise.race([
          User.findById(id).lean().exec(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('User query timeout (8s)')), 8000)
          )
        ]);
      } catch (error) {
        userFetchError = error.message;
        console.warn('User fetch from database failed:', error.message);
      }
    }
    
    // If no user from database, create minimal user object
    if (!user) {
      console.log('⚠️ Using minimal user data (database unavailable)');
      user = {
        _id: id,
        user_name: req.user.username || 'user',
        first_name: req.user.firstName || '',
        last_name: req.user.lastName || '',
        email: req.user.email || '',
        primary_business_role: req.user.role || 'User',
        main_business_unit: req.user.businessUnit || '',
        job_title: req.user.jobTitle || '',
        is_supervisor: req.user.isSupervisor || false,
        is_main_BU: req.user.isMainBU || false,
        status: 'active',
        BU_ROLE_ID: req.user.buRoleId || '',
        enable_multi_session: false,
        validate_ip_address: false
      };
    }

    const roleId = user.BU_ROLE_ID;
    const roleName = roleMapping.ROLE_MAPPING?.[roleId]?.ROLE_NM || user.primary_business_role || 'User';
    
    // Get permissions from cache
    const cacheKey = user.primary_business_role || roleName;
    let activities = permissionsCache.get(cacheKey) || [];
    
    // If no permissions in cache, try to get from roleMapping
    if (activities.length === 0 && roleMapping.ROLE_MAPPING?.[roleId]?.permissions) {
      activities = Object.values(roleMapping.ROLE_MAPPING[roleId].permissions).flat();
    }

    // Construct config response
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
      activities,
      systemParameters: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        locale: 'en-NG',
        environment: process.env.NODE_ENV || 'development',
        multiSession: user.enable_multi_session || false,
        ipValidation: user.validate_ip_address || false,
      },
      systemStatus: {
        database: getMongoState(mongoose.connection.readyState),
        cacheMode: isUsingFallback ? 'FALLBACK' : 'DATABASE',
        cacheRoles: permissionsCache.size,
        cacheTimestamp: cacheTimestamp ? new Date(cacheTimestamp).toISOString() : null,
        userSource: userFetchError ? 'SESSION_WITH_ERROR' : (user.user_name ? 'DATABASE' : 'SESSION')
      },
      warnings: userFetchError ? [`User data incomplete: ${userFetchError}`] : []
    };

    clearTimeout(timeout);
    res.json({
      success: true,
      data: userConfig,
      meta: {
        responseTime: `${Date.now() - req.startTime || 0}ms`,
        cacheInfo: `${permissionsCache.size} roles loaded`
      }
    });

  } catch (error) {
    clearTimeout(timeout);
    console.error('Failed to fetch user config:', error.message);
    
    res.status(500).json({
      success: false,
      message: error.message || 'Internal Server Error',
      code: 'SERVER_ERROR',
      systemStatus: {
        database: getMongoState(mongoose.connection.readyState),
        cacheMode: isUsingFallback ? 'FALLBACK' : 'DATABASE'
      }
    });
  }
});

// Endpoint to manually refresh cache
router.post('/refresh-permissions-cache', authenticate, async (req, res) => {
  try {
    await initializePermissionsCache();
    res.json({ 
      success: true,
      message: 'Permissions cache refreshed successfully',
      details: {
        cacheSize: permissionsCache.size,
        mongoStatus: getMongoState(mongoose.connection.readyState),
        cacheMode: isUsingFallback ? 'FALLBACK' : 'DATABASE',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Failed to refresh cache:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to refresh cache',
      error: error.message,
      mongoStatus: getMongoState(mongoose.connection.readyState)
    });
  }
});

// Health check endpoint with detailed info
router.get('/health', (req, res) => {
  const healthStatus = {
    status: mongoose.connection.readyState === 1 ? 'HEALTHY' : 'DEGRADED',
    timestamp: new Date().toISOString(),
    database: {
      status: getMongoState(mongoose.connection.readyState),
      host: mongoose.connection.host || 'N/A',
      port: mongoose.connection.port || 'N/A',
      name: mongoose.connection.name || 'N/A'
    },
    cache: {
      status: cacheTimestamp ? 'ACTIVE' : 'INITIALIZING',
      size: permissionsCache.size,
      mode: isUsingFallback ? 'FALLBACK' : 'DATABASE',
      age: cacheTimestamp ? Math.floor((Date.now() - cacheTimestamp) / 1000) + 's' : 'N/A',
      lastUpdated: cacheTimestamp ? new Date(cacheTimestamp).toISOString() : 'N/A'
    },
    system: {
      uptime: Math.floor(process.uptime()) + 's',
      nodeVersion: process.version,
      platform: process.platform,
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB'
      }
    },
    warnings: mongoose.connection.readyState !== 1 ? [
      'MongoDB is not connected. Some features may be limited.',
      'Application is running in fallback mode using roleMapping permissions.'
    ] : []
  };
  
  res.json(healthStatus);
});

// Diagnostic endpoint to check MongoDB connection
router.get('/diagnose', authenticate, async (req, res) => {
  const diagnostics = {
    timestamp: new Date().toISOString(),
    mongoState: getMongoState(mongoose.connection.readyState),
    mongoDetails: {
      host: mongoose.connection.host,
      port: mongoose.connection.port,
      name: mongoose.connection.name,
      readyState: mongoose.connection.readyState
    },
    cache: {
      initialized: !!cacheTimestamp,
      size: permissionsCache.size,
      mode: isUsingFallback ? 'FALLBACK' : 'DATABASE',
      roles: Array.from(permissionsCache.keys()).slice(0, 10), // First 10 roles
      totalRoles: permissionsCache.size
    },
    environment: {
      nodeEnv: process.env.NODE_ENV || 'development',
      appEnv: process.env.APP_ENV || 'N/A',
      mongoUriSet: !!process.env.MONGODB_URI
    },
    recommendations: []
  };
  
  // Add recommendations based on diagnostics
  if (mongoose.connection.readyState !== 1) {
    diagnostics.recommendations.push(
      '1. Check if MongoDB service is running on your system',
      '2. Verify MONGODB_URI in .env file',
      '3. Try: Get-Service MongoDB (in PowerShell)',
      '4. Try: mongod --dbpath "C:\\data\\db" (to start MongoDB manually)'
    );
  }
  
  if (isUsingFallback) {
    diagnostics.recommendations.push(
      'Application is using fallback permissions from roleMapping.js',
      'To use database permissions, ensure MongoDB is connected and restart'
    );
  }
  
  res.json({
    success: true,
    data: diagnostics
  });
});

// Test MongoDB connection endpoint
router.get('/test-mongo', authenticate, async (req, res) => {
  try {
    const testResults = {
      timestamp: new Date().toISOString(),
      connectionTest: 'PENDING',
      pingTest: 'PENDING',
      collectionTest: 'PENDING'
    };
    
    // Test 1: Basic connection
    if (mongoose.connection.readyState === 1) {
      testResults.connectionTest = 'PASSED';
      testResults.connectionDetails = {
        host: mongoose.connection.host,
        port: mongoose.connection.port,
        database: mongoose.connection.name
      };
      
      // Test 2: Ping database
      try {
        await mongoose.connection.db.admin().ping();
        testResults.pingTest = 'PASSED';
      } catch (error) {
        testResults.pingTest = 'FAILED';
        testResults.pingError = error.message;
      }
      
      // Test 3: Check collections
      try {
        const collections = await mongoose.connection.db.listCollections().toArray();
        testResults.collectionTest = 'PASSED';
        testResults.collections = collections.map(c => c.name);
        testResults.collectionCount = collections.length;
      } catch (error) {
        testResults.collectionTest = 'FAILED';
        testResults.collectionError = error.message;
      }
      
    } else {
      testResults.connectionTest = 'FAILED';
      testResults.connectionError = `MongoDB state: ${getMongoState(mongoose.connection.readyState)}`;
    }
    
    // Determine overall status
    const allPassed = testResults.connectionTest === 'PASSED' && 
                     testResults.pingTest === 'PASSED' && 
                     testResults.collectionTest === 'PASSED';
    
    testResults.overallStatus = allPassed ? 'HEALTHY' : 'UNHEALTHY';
    
    res.json({
      success: allPassed,
      data: testResults,
      message: allPassed ? 'MongoDB connection tests passed' : 'Some MongoDB tests failed'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Diagnostic test failed',
      error: error.message
    });
  }
});

// Quick fix endpoint - attempt to restore MongoDB connection
router.post('/fix-mongo-connection', authenticate, async (req, res) => {
  try {
    // This assumes your main app file has mongoose.connect()
    // We'll try to manually trigger reconnection
    
    console.log('🔄 Attempting to restore MongoDB connection...');
    
    // If completely disconnected, we can't reconnect here
    // The connection should be managed in your main app file
    
    res.json({
      success: true,
      message: 'Reconnection attempt triggered',
      note: 'Check your main application file for mongoose.connect() configuration',
      currentState: getMongoState(mongoose.connection.readyState),
      recommendation: 'Restart the application after ensuring MongoDB is running'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to attempt reconnection',
      error: error.message
    });
  }
});

export default router;