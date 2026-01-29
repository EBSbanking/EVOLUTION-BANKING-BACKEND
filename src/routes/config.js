// src/routes/config.js - MySQL VERSION
import express from 'express';
import { authenticate } from '../middlewares/authMiddleware.js';
import roleMapping from '../constants/roleMapping.js';
import { getPool, checkConnection } from '../../config/db.js'; // MySQL pool

const router = express.Router();

// Global cache for permissions
let permissionsCache = new Map();
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
let isUsingFallback = false;

// Helper function to get MySQL state
function getMySQLState() {
  return 'MySQL_CONNECTION'; // Simplified for MySQL
}

// Helper to wait for MySQL connection
async function waitForMySQLConnection(timeoutMs = 30000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    try {
      const isConnected = await checkConnection();
      if (isConnected) {
        console.log('✅ MySQL already connected');
        return true;
      }
      console.log(`⏳ Still connecting to MySQL... (${Math.round((Date.now() - startTime)/1000)}s)`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log('MySQL connection check failed:', error.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  console.warn(`⏰ MySQL connection timeout after ${timeoutMs}ms`);
  return false;
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

// Load permissions from MySQL database
async function loadPermissionsFromMySQL() {
  const pool = getPool();
  try {
    console.log('🔄 Loading permissions from MySQL...');
    
    // Assuming you have a roles table with permissions
    const [rows] = await pool.query(`
      SELECT role_name, permissions 
      FROM roles 
      WHERE active = 1
    `);
    
    permissionsCache.clear();
    
    rows.forEach(row => {
      if (row.role_name && row.permissions) {
        // Parse permissions if stored as JSON string
        const permissions = typeof row.permissions === 'string' 
          ? JSON.parse(row.permissions)
          : row.permissions;
        permissionsCache.set(row.role_name, permissions);
      }
    });
    
    console.log(`✅ Loaded ${rows.length} roles from MySQL database`);
    return rows.length;
  } catch (error) {
    console.error('❌ Failed to load permissions from MySQL:', error.message);
    throw error;
  }
}

// Load roles from MySQL
async function loadRolesFromMySQL() {
  const pool = getPool();
  try {
    console.log('🔄 Loading roles from MySQL...');
    
    // Assuming you have a roles table
    const [rows] = await pool.query(`
      SELECT role_id, role_name, permissions, description 
      FROM roles 
      WHERE active = 1
    `);
    
    permissionsCache.clear();
    
    rows.forEach(row => {
      if (row.role_name && row.permissions) {
        // Parse permissions if stored as JSON string
        const permissions = typeof row.permissions === 'string' 
          ? JSON.parse(row.permissions)
          : row.permissions;
        permissionsCache.set(row.role_name, permissions);
      }
    });
    
    console.log(`✅ Loaded ${rows.length} roles from MySQL`);
    return rows;
  } catch (error) {
    console.error('❌ Failed to load roles from MySQL:', error.message);
    throw error;
  }
}

// Preload all role permissions with retry logic
export async function initializePermissionsCache() {
  const maxRetries = 3;
  let lastError = null;
  
  // First, try to establish MySQL connection
  const isConnected = await waitForMySQLConnection(10000);
  
  if (!isConnected) {
    console.log('⚠️ MySQL not available, using fallback mode');
    isUsingFallback = true;
    loadPermissionsFromRoleMapping();
    cacheTimestamp = Date.now();
    return;
  }
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Initializing permissions cache from MySQL (attempt ${attempt}/${maxRetries})...`);
      
      // Load roles from database with timeout
      const allRoles = await Promise.race([
        loadRolesFromMySQL(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Role query timeout (15s)')), 15000)
        )
      ]);
      
      console.log(`✅ Loaded ${allRoles.length} roles from MySQL`);
      
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
  console.error('⚠️ All MySQL attempts failed, using fallback mode');
  console.error('Last error:', lastError?.message);
  
  isUsingFallback = true;
  loadPermissionsFromRoleMapping();
  cacheTimestamp = Date.now();
}

// Initialize cache on startup
setTimeout(() => {
  console.log('🚀 Starting application initialization...');
  
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

    // Try to fetch user from MySQL database if connected
    let user = null;
    let userFetchError = null;
    
    try {
      const isConnected = await checkConnection();
      if (isConnected) {
        const pool = getPool();
        const [rows] = await Promise.race([
          pool.query('SELECT * FROM users WHERE user_id = ?', [id]),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('User query timeout (8s)')), 8000)
          )
        ]);
        
        if (rows && rows.length > 0) {
          user = rows[0];
        }
      }
    } catch (error) {
      userFetchError = error.message;
      console.warn('User fetch from MySQL failed:', error.message);
    }
    
    // If no user from database, create minimal user object from session
    if (!user) {
      console.log('⚠️ Using minimal user data (MySQL unavailable)');
      user = {
        user_id: id,
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
      id: user.user_id,
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
        database: 'MySQL', // Simplified
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
        database: 'MySQL',
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
        databaseStatus: 'MySQL',
        cacheMode: isUsingFallback ? 'FALLBACK' : 'DATABASE',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Failed to refresh cache:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to refresh cache',
      error: error.message
    });
  }
});

// Health check endpoint with detailed info
router.get('/health', async (req, res) => {
  try {
    const isConnected = await checkConnection();
    
    const healthStatus = {
      status: isConnected ? 'HEALTHY' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      database: {
        type: 'MySQL',
        status: isConnected ? 'CONNECTED' : 'DISCONNECTED',
        connection: isConnected ? 'OK' : 'FAILED'
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
      warnings: !isConnected ? [
        'MySQL is not connected. Some features may be limited.',
        'Application is running in fallback mode using roleMapping permissions.'
      ] : []
    };
    
    res.json(healthStatus);
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      error: error.message
    });
  }
});

// Diagnostic endpoint to check MySQL connection
router.get('/diagnose', authenticate, async (req, res) => {
  try {
    const isConnected = await checkConnection();
    
    const diagnostics = {
      timestamp: new Date().toISOString(),
      database: {
        type: 'MySQL',
        status: isConnected ? 'CONNECTED' : 'DISCONNECTED'
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
        dbHost: process.env.DB_HOST || 'N/A',
        dbName: process.env.DB_NAME || 'N/A'
      },
      recommendations: []
    };
    
    // Add recommendations based on diagnostics
    if (!isConnected) {
      diagnostics.recommendations.push(
        '1. Check if MySQL service is running on your system',
        '2. Verify DB_HOST, DB_USER, DB_PASSWORD, DB_NAME in .env file',
        '3. Try: sudo systemctl status mysql (on Linux)',
        '4. Try: mysql -u root -p (to test MySQL CLI connection)'
      );
    }
    
    if (isUsingFallback) {
      diagnostics.recommendations.push(
        'Application is using fallback permissions from roleMapping.js',
        'To use database permissions, ensure MySQL is connected and restart'
      );
    }
    
    res.json({
      success: true,
      data: diagnostics
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test MySQL connection endpoint
router.get('/test-mysql', authenticate, async (req, res) => {
  try {
    const pool = getPool();
    const testResults = {
      timestamp: new Date().toISOString(),
      connectionTest: 'PENDING',
      pingTest: 'PENDING',
      queryTest: 'PENDING'
    };
    
    // Test 1: Basic connection
    try {
      const isConnected = await checkConnection();
      if (isConnected) {
        testResults.connectionTest = 'PASSED';
      } else {
        testResults.connectionTest = 'FAILED';
        testResults.connectionError = 'MySQL not connected';
      }
    } catch (error) {
      testResults.connectionTest = 'FAILED';
      testResults.connectionError = error.message;
    }
    
    // Test 2: Ping database
    if (testResults.connectionTest === 'PASSED') {
      try {
        await pool.query('SELECT 1 as ping');
        testResults.pingTest = 'PASSED';
      } catch (error) {
        testResults.pingTest = 'FAILED';
        testResults.pingError = error.message;
      }
    }
    
    // Test 3: Check tables
    if (testResults.pingTest === 'PASSED') {
      try {
        const [tables] = await pool.query(`
          SELECT TABLE_NAME 
          FROM information_schema.TABLES 
          WHERE TABLE_SCHEMA = ?
        `, [process.env.DB_NAME || 'your_database']);
        
        testResults.queryTest = 'PASSED';
        testResults.tables = tables.map(t => t.TABLE_NAME);
        testResults.tableCount = tables.length;
      } catch (error) {
        testResults.queryTest = 'FAILED';
        testResults.queryError = error.message;
      }
    }
    
    // Determine overall status
    const allPassed = testResults.connectionTest === 'PASSED' && 
                     testResults.pingTest === 'PASSED' && 
                     testResults.queryTest === 'PASSED';
    
    testResults.overallStatus = allPassed ? 'HEALTHY' : 'UNHEALTHY';
    
    res.json({
      success: allPassed,
      data: testResults,
      message: allPassed ? 'MySQL connection tests passed' : 'Some MySQL tests failed'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Diagnostic test failed',
      error: error.message
    });
  }
});

export default router;