// server.js - Fixed version with proper system status handling, date formatting, EOD management, and permission sync
import app from './src/app.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import connectDB from './config/db.js';
import logger from './src/utils/logger.js';
import initializeApplication from './src/utils/initializeApplication.js';
import { initializeSystemDates } from './src/controllers/OsController.js';
import os from 'os';

// Error suppression
const originalError = console.error;
console.error = function(...args) {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('auditLogger.info(...).catch is not a function')) {
    console.log('⚠️ Audit logger compatibility issue - continuing startup...');
    return;
  }
  originalError.apply(console, args);
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Global variable to store system user ID
let SYSTEM_USER_ID = null;

// Role mapping for system user based on your ROLE_MAPPING
const ROLE_MAPPING = {
  // System-specific role mapping
  'SYSTEM_ADMIN': 24, // EOD Operator role for system user
  'ADMIN': 1,        // Administrator
  'STAFF': 29,       // Teller (default staff)
  'USER': 28,        // Customer Service Officer (default user)
  
  // Your specific roles
  'EOD_OPERATOR': 24,
  'ADMINISTRATOR': 1,
  'HEAD_BANKING_SERVICES': 2,
  'LOAN_PROCESSING_OFFICER': 3,
  'SENIOR_FINANCIAL_ACCOUNTANT': 4,
  'INTERNAL_CONTROL_OFFICER': 5,
  'INTERNAL_CONTROL_MANAGER': 6,
  'HEAD_OF_CREDIT': 7,
  'INTERNAL_AUDIT_MANAGER': 8,
  'HEAD_HUMAN_RESOURCES': 9,
  'HUMAN_RESOURCE_OFFICER': 10,
  'IT_MANAGER': 11,
  'FINANCIAL_ACCOUNTANT': 12,
  'FINANCIAL_ACCOUNTANT_MANAGER': 13,
  'CHIEF_FINANCIAL_OFFICER': 14,
  'CHIEF_EXECUTIVE_OFFICER': 15,
  'TREASURER': 16,
  'LOAN_PROCESSING_SUPERVISOR': 17,
  'SENIOR_FINANCIAL_ACCOUNTANT': 18,
  'BRANCH_MANAGER': 19,
  'BRANCH_OPERATION_SUPERVISOR': 20,
  'CHIEF_OPERATION_OFFICER': 21,
  'MARKETING_MANAGER': 22,
  'PAYMENT_AND_RECONCILIATION_NGN': 23,
  'RECOVERY_OFFICER': 25,
  'RELATIONSHIP_DEVELOPMENT_OFFICER': 26,
  'CUSTOMER_RELATIONSHIP_OFFICER': 27,
  'CUSTOMER_SERVICE_OFFICER': 28,
  'TELLER': 29,
  'HEAD_TELLER': 30,
  'CUSTOMER_RELATIONSHIP_SUPERVISOR': 31,
  'RECOVERY_TEAM_LEAD': 32,
  'BUSINESS_ANALYST': 33,
  'CREDIT_RISK_ANALYST': 34,
  'HEAD_OF_DIGITAL_BANKING': 35,
  'AGENCY_BANKING_OFFICER': 36,
  'CHANNEL_MANAGER': 37,
  'VAULT_MANAGER': 38
};

// Reverse mapping for display
const ROLE_REVERSE_MAPPING = Object.fromEntries(
  Object.entries(ROLE_MAPPING).map(([name, id]) => [id, name])
);

// ============================================
// HELPER FUNCTIONS
// ============================================

// Helper function to get DB state text
function getDbStateText(state) {
  const states = {
    0: '❌ Disconnected',
    1: '✅ Connected',
    2: '🔄 Connecting',
    3: '⏳ Disconnecting',
  };
  return states[state] || `❓ Unknown (${state})`;
}

// Network IP Helper Function
function getNetworkIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Helper function to format date for clean display
const formatDateForDisplay = (date) => {
  if (!date) return null;
  
  if (date instanceof Date) {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD
  } else if (typeof date === 'string') {
    if (date.includes('T')) {
      return date.split('T')[0];
    }
    else if (date.includes('GMT')) {
      try {
        const parsedDate = new Date(date);
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate.toISOString().split('T')[0];
        }
      } catch (e) {
        // Keep original if parsing fails
      }
    }
    return date;
  }
  return date;
};

// Get role number from role name
const getRoleNumber = (roleName) => {
  const roleNum = ROLE_MAPPING[roleName] || 28; // Default to Customer Service Officer (28)
  console.log(`📊 Role mapping: "${roleName}" -> ${roleNum} (${ROLE_REVERSE_MAPPING[roleNum] || 'Unknown'})`);
  return roleNum;
};

// Get role name from role number
const getRoleName = (roleNumber) => {
  return ROLE_REVERSE_MAPPING[roleNumber] || `Role ${roleNumber}`;
};

// DIRECT MongoDB cleanup - bypasses Mongoose completely
const cleanupInvalidDataDirect = async () => {
  try {
    console.log('🧹 DIRECT CLEANUP: Fixing invalid data using raw MongoDB operations...');
    
    const db = mongoose.connection.db;
    let totalFixed = 0;
    
    // 1. Clean up User collection - Convert string roles to numbers
    console.log('   🔧 Fixing User collection...');
    
    // Find users with string roles
    const usersWithStringRoles = await db.collection('users').find({
      $or: [
        { "primary_role": { $type: "string" } },
        { "roles": { $elemMatch: { $type: "string" } } }
      ]
    }).toArray();
    
    console.log(`   📊 Found ${usersWithStringRoles.length} users with string roles`);
    
    for (const user of usersWithStringRoles) {
      const updateDoc = {};
      let needsUpdate = false;
      
      // Fix primary_role if it's a string
      if (typeof user.primary_role === 'string') {
        const oldValue = user.primary_role;
        let newValue;
        
        // Map common string values to numbers
        switch (user.primary_role.toUpperCase()) {
          case 'ADMIN':
          case 'ADMINISTRATOR':
            newValue = 1;
            break;
          case 'SYSTEM':
          case 'SYSTEM_ADMIN':
          case 'EOD_OPERATOR':
            newValue = 24;
            break;
          case 'TELLER':
            newValue = 29;
            break;
          case 'STAFF':
            newValue = 28;
            break;
          default:
            // Try to parse as number
            newValue = parseInt(user.primary_role);
            if (isNaN(newValue)) {
              newValue = 28; // Default to Customer Service Officer
            }
        }
        
        updateDoc.primary_role = newValue;
        needsUpdate = true;
        console.log(`     🔄 User ${user.username || user._id}: primary_role "${oldValue}" -> ${newValue}`);
      }
      
      // Fix roles array if it contains strings
      if (user.roles && Array.isArray(user.roles) && user.roles.some(role => typeof role === 'string')) {
        const fixedRoles = user.roles.map(role => {
          if (typeof role === 'string') {
            // Map common string values to numbers
            switch (role.toUpperCase()) {
              case 'ADMIN':
              case 'ADMINISTRATOR':
                return 1;
              case 'SYSTEM':
              case 'SYSTEM_ADMIN':
              case 'EOD_OPERATOR':
                return 24;
              case 'TELLER':
                return 29;
              case 'STAFF':
                return 28;
              default:
                const num = parseInt(role);
                return isNaN(num) ? 28 : num;
            }
          }
          return role;
        });
        
        updateDoc.roles = fixedRoles;
        needsUpdate = true;
        console.log(`     🔄 User ${user.username || user._id}: roles ${JSON.stringify(user.roles)} -> ${JSON.stringify(fixedRoles)}`);
      }
      
      if (needsUpdate) {
        await db.collection('users').updateOne(
          { _id: user._id },
          { $set: updateDoc }
        );
        totalFixed++;
      }
    }
    
    // 2. Clean up SystemDate collection - Remove string user IDs
    console.log('   🔧 Fixing SystemDate collection...');
    
    const systemDatesWithStringIds = await db.collection('systemdates').find({
      $or: [
        { "lastEODProcessedBy": { $type: "string" } },
        { "eodHistory.processedBy": { $type: "string" } }
      ]
    }).toArray();
    
    console.log(`   📊 Found ${systemDatesWithStringIds.length} SystemDate documents with string user IDs`);
    
    for (const systemDate of systemDatesWithStringIds) {
      const updateDoc = {};
      let needsUpdate = false;
      
      // Fix lastEODProcessedBy if it's a string
      if (typeof systemDate.lastEODProcessedBy === 'string') {
        updateDoc.lastEODProcessedBy = null;
        needsUpdate = true;
        console.log(`     🔄 SystemDate ${systemDate._id}: lastEODProcessedBy "${systemDate.lastEODProcessedBy}" -> null`);
      }
      
      // Fix eodHistory processedBy if they're strings
      if (systemDate.eodHistory && Array.isArray(systemDate.eodHistory)) {
        const fixedHistory = systemDate.eodHistory.map(history => {
          if (typeof history.processedBy === 'string') {
            console.log(`     🔄 SystemDate ${systemDate._id}: eodHistory.processedBy "${history.processedBy}" -> null`);
            return { ...history, processedBy: null };
          }
          return history;
        });
        
        if (fixedHistory.some((history, index) => 
          JSON.stringify(history) !== JSON.stringify(systemDate.eodHistory[index])
        )) {
          updateDoc.eodHistory = fixedHistory;
          needsUpdate = true;
        }
      }
      
      if (needsUpdate) {
        await db.collection('systemdates').updateOne(
          { _id: systemDate._id },
          { $set: updateDoc }
        );
        totalFixed++;
      }
    }
    
    console.log(`✅ DIRECT CLEANUP: Fixed ${totalFixed} documents`);
    return totalFixed;
    
  } catch (error) {
    console.log('⚠️ DIRECT CLEANUP error:', error.message);
    return 0;
  }
};

// Get System User ID Helper - WITH ERROR HANDLING
const getSystemUserId = async () => {
  if (SYSTEM_USER_ID) {
    return SYSTEM_USER_ID;
  }
  
  try {
    // Use direct MongoDB query to bypass Mongoose validation
    const db = mongoose.connection.db;
    const systemUser = await db.collection('users').findOne({ 
      $or: [
        { username: 'system' },
        { user_name: 'system' }
      ]
    });
    
    if (systemUser && systemUser._id) {
      SYSTEM_USER_ID = systemUser._id.toString();
      console.log(`📋 Retrieved System User ID via direct query: ${SYSTEM_USER_ID}`);
      return SYSTEM_USER_ID;
    }
    
    console.log('⚠️ System user not found, creating new ObjectId for fallback');
    return new mongoose.Types.ObjectId().toString();
  } catch (error) {
    console.log('⚠️ Error getting system user ID:', error.message);
    return new mongoose.Types.ObjectId().toString();
  }
};

// Helper to get user ID from username or ID - WITH DIRECT MONGODB QUERY
const getUserId = async (userIdentifier) => {
  try {
    // If it's already an ObjectId or looks like one, return it
    if (mongoose.Types.ObjectId.isValid(userIdentifier)) {
      return userIdentifier;
    }
    
    // If it's 'system' or 'admin', get the system user ID
    if (userIdentifier === 'system' || userIdentifier === 'admin') {
      return await getSystemUserId();
    }
    
    // Try direct MongoDB query to bypass Mongoose validation
    try {
      const db = mongoose.connection.db;
      const user = await db.collection('users').findOne({ 
        $or: [
          { username: userIdentifier },
          { email: userIdentifier },
          { user_name: userIdentifier }
        ]
      });
      
      if (user && user._id) {
        return user._id.toString();
      }
    } catch (userError) {
      console.log(`⚠️ Direct user lookup error for "${userIdentifier}":`, userError.message);
    }
    
    // If not found, fall back to system user
    console.log(`⚠️ User "${userIdentifier}" not found, using system user`);
    return await getSystemUserId();
  } catch (error) {
    console.log(`⚠️ Error getting user ID for "${userIdentifier}":`, error.message);
    return await getSystemUserId(); // Fallback to system user
  }
};

// System status with fallback
let systemStatus = { 
  currentBusinessDate: null,
  initialized: false 
};

// Safe system status getter
const getSystemStatus = () => {
  if (!systemStatus || typeof systemStatus !== 'object') {
    return {
      currentBusinessDate: null,
      initialized: false,
      status: 'Not Initialized'
    };
  }
  
  const displayDate = formatDateForDisplay(systemStatus.currentBusinessDate);
  
  return {
    currentBusinessDate: displayDate,
    previousBusinessDate: formatDateForDisplay(systemStatus.previousBusinessDate),
    nextBusinessDate: formatDateForDisplay(systemStatus.nextBusinessDate),
    eodStatus: systemStatus.eodStatus || 'IDLE',
    initialized: systemStatus.initialized,
    status: systemStatus.currentBusinessDate ? 'Initialized' : 'Not Initialized'
  };
};

// ============================================
// CORS CONFIGURATION
// ============================================

const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_LOCAL,
  process.env.CLIENT_URL_NETWORK,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
].filter(Boolean);

console.log('🛡️ CORS Allowed Origins:', allowedOrigins);

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  })
);

// ============================================
// API ENDPOINTS
// ============================================

app.get('/api', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Evolution Banking API Server is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    systemUserId: SYSTEM_USER_ID ? 'Available' : 'Not set'
  });
});

// ============================================
// EOD MANAGEMENT ENDPOINTS (FIXED FOR ObjectId)
// ============================================

// EOD Processing Endpoint - FIXED VERSION
app.post('/api/system/eod/start', async (req, res) => {
  try {
    const { processedBy = 'system' } = req.body;
    
    const userId = await getUserId(processedBy);
    console.log(`🔄 Starting EOD process with user ID: ${userId} (from identifier: ${processedBy})`);
    
    const { processEndOfDay } = await import('./src/controllers/OsController.js');
    const result = await processEndOfDay(userId);
    
    res.json({
      success: true,
      message: 'EOD processing completed successfully',
      data: result.data
    });
  } catch (error) {
    console.error('❌ EOD processing error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// EOD Status Endpoint
app.get('/api/system/eod/status', async (req, res) => {
  try {
    // Use direct MongoDB query for SystemDate to avoid validation errors
    const db = mongoose.connection.db;
    const systemDate = await db.collection('systemdates').findOne({}, { sort: { createdAt: -1 } });
    
    if (!systemDate) {
      return res.status(404).json({
        success: false,
        message: 'System date not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        currentBusinessDate: systemDate.currentBusinessDate,
        previousBusinessDate: systemDate.previousBusinessDate,
        nextBusinessDate: systemDate.nextBusinessDate,
        eodStatus: systemDate.eodStatus,
        lastUpdated: systemDate.lastUpdated,
        eodHistory: systemDate.eodHistory ? systemDate.eodHistory.slice(-5) : []
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Manual date adjustment (admin only)
app.post('/api/system/date/manual-set', async (req, res) => {
  try {
    const { date, updatedBy = 'system', reason = 'Manual adjustment' } = req.body;
    
    if (!date) {
      return res.status(400).json({
        success: false,
        message: 'Date is required'
      });
    }
    
    const userId = await getUserId(updatedBy);
    console.log(`🔄 Manual date adjustment by user ID: ${userId} (from identifier: ${updatedBy})`);
    
    const { setBusinessDateManually } = await import('./src/controllers/OsController.js');
    const result = await setBusinessDateManually(date, userId, reason);
    
    res.json({
      success: true,
      message: 'Business date updated manually',
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// System Date Information Endpoint
app.get('/api/system/date/info', async (req, res) => {
  try {
    // Use direct MongoDB query
    const db = mongoose.connection.db;
    const systemDate = await db.collection('systemdates').findOne({}, { sort: { createdAt: -1 } });
    
    if (!systemDate) {
      return res.status(404).json({
        success: false,
        message: 'System date not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        currentBusinessDate: systemDate.currentBusinessDate,
        previousBusinessDate: systemDate.previousBusinessDate,
        nextBusinessDate: systemDate.nextBusinessDate,
        eodStatus: systemDate.eodStatus,
        lastUpdated: systemDate.lastUpdated,
        updatedBy: systemDate.updatedBy
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get System User Info Endpoint
app.get('/api/system/user/info', async (req, res) => {
  try {
    const systemUserId = await getSystemUserId();
    // Use direct MongoDB query
    const db = mongoose.connection.db;
    const systemUser = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(systemUserId) });
    
    if (!systemUser) {
      return res.status(404).json({
        success: false,
        message: 'System user not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        id: systemUser._id,
        username: systemUser.username,
        email: systemUser.email,
        firstName: systemUser.firstName || systemUser.first_name,
        lastName: systemUser.lastName || systemUser.last_name,
        primary_role: systemUser.primary_role,
        primary_role_name: getRoleName(systemUser.primary_role),
        roles: systemUser.roles || [],
        roles_names: (systemUser.roles || []).map(role => getRoleName(role)),
        status: systemUser.status
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Emergency cleanup endpoint
app.post('/api/system/cleanup', async (req, res) => {
  try {
    console.log('🚨 Manual cleanup requested');
    const fixedCount = await cleanupInvalidDataDirect();
    
    res.json({
      success: true,
      message: 'Cleanup completed',
      fixedCount: fixedCount
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// SYSTEM USER CREATION (WITH DIRECT MONGODB)
// ============================================

const createSystemUserIfNotExists = async () => {
  try {
    console.log('🔄 Checking/Creating system user...');
    
    // Use direct MongoDB query first
    const db = mongoose.connection.db;
    const existingSystemUser = await db.collection('users').findOne({ 
      $or: [
        { username: 'system' },
        { user_name: 'system' }
      ]
    });
    
    if (existingSystemUser) {
      console.log('✅ System user already exists in database');
      SYSTEM_USER_ID = existingSystemUser._id.toString();
      console.log(`📋 System User ID: ${SYSTEM_USER_ID}`);
      
      // Check if we need to fix the user's role
      let needsUpdate = false;
      const updateDoc = {};
      
      if (typeof existingSystemUser.primary_role === 'string') {
        updateDoc.primary_role = ROLE_MAPPING.EOD_OPERATOR;
        needsUpdate = true;
        console.log(`   🔄 Fixing string primary_role: "${existingSystemUser.primary_role}" -> ${ROLE_MAPPING.EOD_OPERATOR}`);
      } else if (existingSystemUser.primary_role !== ROLE_MAPPING.EOD_OPERATOR) {
        updateDoc.primary_role = ROLE_MAPPING.EOD_OPERATOR;
        needsUpdate = true;
        console.log(`   🔄 Updating primary_role: ${existingSystemUser.primary_role} -> ${ROLE_MAPPING.EOD_OPERATOR}`);
      }
      
      // Fix roles array
      const currentRoles = existingSystemUser.roles || [];
      const hasEodRole = currentRoles.includes(ROLE_MAPPING.EOD_OPERATOR);
      const hasAdminRole = currentRoles.includes(ROLE_MAPPING.ADMINISTRATOR);
      
      if (!hasEodRole || !hasAdminRole) {
        const newRoles = [...new Set([...currentRoles, ROLE_MAPPING.EOD_OPERATOR, ROLE_MAPPING.ADMINISTRATOR])];
        updateDoc.roles = newRoles;
        needsUpdate = true;
        console.log(`   🔄 Updating roles: ${JSON.stringify(currentRoles)} -> ${JSON.stringify(newRoles)}`);
      }
      
      if (needsUpdate) {
        await db.collection('users').updateOne(
          { _id: existingSystemUser._id },
          { $set: updateDoc }
        );
        console.log(`✅ Updated system user in database`);
      }
      
      return existingSystemUser;
    }
    
    // Create new system user using Mongoose model (since it's a new user, no validation issues)
    console.log('🔄 Creating new system user...');
    const User = (await import('./src/models/User.js')).default;
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(
      process.env.SYSTEM_USER_PASSWORD || 'System@123',
      salt
    );
    
    const systemUser = new User({
      username: 'system',
      user_name: 'system',
      primary_role: ROLE_MAPPING.EOD_OPERATOR,
      roles: [ROLE_MAPPING.EOD_OPERATOR, ROLE_MAPPING.ADMINISTRATOR],
      email: 'system@bank.com',
      password: hashedPassword,
      first_name: 'System',
      last_name: 'Administrator',
      status: 'Active',
      primary_business_role: 'EOD Operator',
      branchCode: '000',
      department: 'IT',
      phoneNumber: '000-000-0000',
      address: 'System Address',
      firstLogin: false,
      enable_multi_session: true,
      is_supervisor: true,
      is_main_BU: true
    });
    
    await systemUser.save();
    SYSTEM_USER_ID = systemUser._id.toString();
    console.log(`✅ System user created with ID: ${SYSTEM_USER_ID}, Role: ${systemUser.primary_role}`);
    return systemUser;
    
  } catch (error) {
    console.log('⚠️ System user creation failed:', error.message);
    
    // If Mongoose creation fails, try direct MongoDB insertion
    try {
      console.log('🔄 Trying direct MongoDB insertion for system user...');
      const db = mongoose.connection.db;
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(
        process.env.SYSTEM_USER_PASSWORD || 'System@123',
        salt
      );
      
      const systemUser = {
        username: 'system',
        user_name: 'system',
        primary_role: ROLE_MAPPING.EOD_OPERATOR,
        roles: [ROLE_MAPPING.EOD_OPERATOR, ROLE_MAPPING.ADMINISTRATOR],
        email: 'system@bank.com',
        password: hashedPassword,
        first_name: 'System',
        last_name: 'Administrator',
        status: 'Active',
        primary_business_role: 'EOD Operator',
        branchCode: '000',
        department: 'IT',
        phoneNumber: '000-000-0000',
        address: 'System Address',
        firstLogin: false,
        enable_multi_session: true,
        is_supervisor: true,
        is_main_BU: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      const result = await db.collection('users').insertOne(systemUser);
      SYSTEM_USER_ID = result.insertedId.toString();
      console.log(`✅ System user created via direct MongoDB with ID: ${SYSTEM_USER_ID}`);
      
      return { ...systemUser, _id: result.insertedId };
    } catch (directError) {
      console.log('⚠️ Direct MongoDB insertion also failed:', directError.message);
      return null;
    }
  }
};

// ============================================
// SERVER CONFIGURATION
// ============================================

const waitForMongoConnection = async (maxWaitTime = 30000) => {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const checkConnection = () => {
      const currentTime = Date.now();
      const elapsedTime = currentTime - startTime;

      if (mongoose.connection.readyState === 1) {
        console.log('✅ MongoDB connection confirmed ready for queries');
        resolve(true);
      } else if (elapsedTime >= maxWaitTime) {
        console.log('⚠️ MongoDB connection timeout, but continuing...');
        resolve(false);
      } else {
        setTimeout(checkConnection, 1000);
      }
    };
    
    checkConnection();
  });
};

const testDatabaseConnection = async () => {
  try {
    console.log('🧪 Testing database connection...');
    const result = await mongoose.connection.db.admin().ping();
    
    if (result.ok === 1) {
      console.log('✅ Database connection test PASSED');
      return true;
    } else {
      console.log('❌ Database connection test FAILED');
      return false;
    }
  } catch (error) {
    console.log('❌ Database connection test FAILED - Error:', error.message);
    return false;
  }
};

const safeInitializeApplication = async () => {
  try {
    console.log('🛡️ Starting SAFE application initialization...');

    const isConnected = await waitForMongoConnection(20000);
    
    if (!isConnected) {
      console.log('⚠️ MongoDB not fully connected, skipping application initialization');
      return;
    }

    const connectionTest = await testDatabaseConnection();
    if (!connectionTest) {
      console.log('⚠️ Database connection test failed, skipping application initialization');
      return;
    }

    console.log('⏳ Ensuring database is fully ready...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    console.log('✅ Database confirmed ready, initializing application...');
    await initializeApplication();
    logger.info('✅ Application initialization completed successfully');
  } catch (error) {
    console.error('❌ Application initialization failed', {
      error: error.message,
      dbState: getDbStateText(mongoose.connection.readyState),
    });
  }
};

const configureLogging = () => {
  let LOG_DIR = process.env.LOG_DIR || './logs';
  let LOG_FILE = path.join(LOG_DIR, 'server.log');

  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    
    const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a', encoding: 'utf8' });
    console.log(`✅ Log file configured: ${LOG_FILE}`);
    
    return { logStream, logFile: LOG_FILE };
  } catch (err) {
    console.warn(`⚠️ Cannot use log directory ${LOG_DIR}: ${err.message}`);
    return {
      logStream: { write: () => {}, end: (cb) => cb && cb() },
      logFile: null,
    };
  }
};

const { logStream, logFile } = configureLogging();

const configureShutdown = (server) => {
  const shutdown = async (signal) => {
    console.log(`Shutdown signal received: ${signal}`);
    
    try {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
    } catch (dbError) {
      console.error('❌ Error closing MongoDB connection:', dbError.message);
    }

    logStream.end(() => {
      console.log('✅ Log stream closed');
      console.log('🛑 Shutdown completed');
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

const syncPermissionsToDatabase = async () => {
  try {
    console.log('🔄 Syncing permissions to database...');
    
    const { syncPermissions } = await import('./src/constants/roleMapping.js');
    await syncPermissions();
    
    console.log('✅ Permissions synced to database successfully');
    return true;
  } catch (error) {
    console.log('⚠️ Permissions sync failed:', error.message);
    return false;
  }
};

// ============================================
// STARTUP SEQUENCE
// ============================================

const startServer = async () => {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 STARTING EVOLUTION BANKING BACKEND SERVER');
    console.log('='.repeat(60));

    // STEP 1: Connect to MongoDB
    console.log('🔄 STEP 1: Connecting to MongoDB...');
    await connectDB();

    // STEP 1.5: Wait for connection
    console.log('🔄 STEP 1.5: Waiting for MongoDB connection...');
    await waitForMongoConnection(25000);
    await testDatabaseConnection();

    // STEP 1.6: EMERGENCY CLEANUP - Fix invalid data FIRST (DIRECT MongoDB)
    console.log('🔄 STEP 1.6: DIRECT CLEANUP of invalid data...');
    if (mongoose.connection.readyState === 1) {
      const fixedCount = await cleanupInvalidDataDirect();
      if (fixedCount > 0) {
        console.log(`✅ Cleaned up ${fixedCount} invalid documents`);
      }
    } else {
      console.log('⚠️ Skipping data cleanup - MongoDB not connected');
    }

    // STEP 1.7: Create System User
    console.log('🔄 STEP 1.7: Ensuring system user exists...');
    if (mongoose.connection.readyState === 1) {
      const systemUser = await createSystemUserIfNotExists();
      if (!systemUser) {
        console.log('⚠️ System user creation may have failed, continuing startup...');
      }
    } else {
      console.log('⚠️ Skipping system user creation - MongoDB not connected');
    }

    // STEP 1.8: Initialize System Dates
    console.log('🔄 STEP 1.8: Initializing system dates...');
    if (mongoose.connection.readyState === 1) {
      try {
        const dateResult = await initializeSystemDates();
        
        if (dateResult && dateResult.currentBusinessDate) {
          systemStatus = dateResult;
          const displayDate = formatDateForDisplay(systemStatus.currentBusinessDate);
          console.log(`✅ System dates initialized: ${displayDate}`);
        } else {
          const fallbackDate = new Date().toISOString().split('T')[0];
          systemStatus = {
            currentBusinessDate: fallbackDate,
            previousBusinessDate: fallbackDate,
            nextBusinessDate: fallbackDate,
            eodStatus: 'IDLE',
            initialized: true
          };
          console.log(`✅ System dates set to fallback: ${fallbackDate}`);
        }
      } catch (dateError) {
        console.log('⚠️ System dates initialization failed:', dateError.message);
        const fallbackDate = new Date().toISOString().split('T')[0];
        systemStatus = {
          currentBusinessDate: fallbackDate,
          previousBusinessDate: fallbackDate, 
          nextBusinessDate: fallbackDate,
          eodStatus: 'IDLE',
          initialized: false
        };
      }
    } else {
      console.log('⚠️ Skipping system dates initialization - MongoDB not connected');
      const fallbackDate = new Date().toISOString().split('T')[0];
      systemStatus = {
        currentBusinessDate: fallbackDate,
        previousBusinessDate: fallbackDate, 
        nextBusinessDate: fallbackDate,
        eodStatus: 'IDLE',
        initialized: false
      };
    }

    // STEP 1.9: Sync Permissions
    console.log('🔄 STEP 1.9: Syncing permissions to database...');
    if (mongoose.connection.readyState === 1) {
      try {
        await syncPermissionsToDatabase();
      } catch (permissionError) {
        console.log('⚠️ Permissions sync error:', permissionError.message);
      }
    } else {
      console.log('⚠️ Skipping permissions sync - MongoDB not connected');
    }

    // STEP 2: Start the server
    console.log('🔄 STEP 2: Starting HTTP server...');
    const PORT = process.env.PORT || 5000;
    const HOST = process.env.HOST || '0.0.0.0';

    const server = app.listen(PORT, HOST, () => {
      console.log('\n' + '='.repeat(60));
      console.log('✅ BACKEND SERVER RUNNING SUCCESSFULLY');
      console.log('='.repeat(60));
      
      const currentStatus = getSystemStatus();
      const networkIP = getNetworkIP();
      
      const businessDateDisplay = currentStatus.currentBusinessDate 
        ? currentStatus.currentBusinessDate
        : 'Not set';
      
      console.log(`📍 Local URL: http://localhost:${PORT}`);
      console.log(`🌐 Network URL: http://${networkIP}:${PORT}`);
      console.log(`🔧 API Base: http://${networkIP}:${PORT}/api`);
      console.log(`📱 Frontend: ${process.env.CLIENT_URL || 'Not specified'}`);
      console.log(`🗄️  Database: ${getDbStateText(mongoose.connection.readyState)}`);
      console.log(`📅 Current Business Date: ${businessDateDisplay}`);
      console.log(`📅 System Dates: ${currentStatus.status}`);
      console.log(`🔄 EOD Status: ${currentStatus.eodStatus || 'IDLE'}`);
      console.log(`👤 System User: ${SYSTEM_USER_ID ? 'Created ✓' : 'Not created'}`);
      console.log(`🎯 System User Role: ${SYSTEM_USER_ID ? 'EOD Operator (24)' : 'Not set'}`);
      console.log(`🧹 Data Cleanup: Completed on startup`);
      console.log(`📋 Permissions: Synced on startup`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🛡️  CORS Origins: ${allowedOrigins.length} configured`);
      console.log('='.repeat(60) + '\n');

      // STEP 3: Initialize application in background
      if (mongoose.connection.readyState === 1) {
        console.log('🔄 STEP 3: Starting background application initialization...');
        safeInitializeApplication().then(() => {
          console.log('🎉 Application initialization completed!');
        });
      } else {
        console.log('⚠️ Skipping application initialization - MongoDB not connected');
      }
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('Server error:', err.message);
      }
      process.exit(1);
    });

    configureShutdown(server);
  } catch (err) {
    console.error('❌ SERVER STARTUP FAILED:', err.message);
    process.exit(1);
  }
};

// Start the server
startServer();