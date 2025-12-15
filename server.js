// server.js - FULLY FIXED VERSION
import app from './src/app.js';
import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import connectDB from './config/db.js';
import logger from './src/utils/logger.js';
import { initializeSystemDates } from './src/controllers/OsController.js';
import os from 'os';
import fs from 'fs';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Global variable to store system user ID
let SYSTEM_USER_ID = null;

// Role mapping for system user
const ROLE_MAPPING = {
  'EOD_OPERATOR': 24,
  'ADMINISTRATOR': 1,
  'TELLER': 29,
  'CUSTOMER_SERVICE_OFFICER': 28
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

// Initialize counters safely (standalone version)
const initializeCounters = async () => {
  try {
    console.log('🔄 Initializing account counters...');
    
    // Ensure MongoDB is connected
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ MongoDB not connected, skipping counter initialization');
      return;
    }
    
    const db = mongoose.connection.db;
    
    // Check if counters collection exists
    const collections = await db.listCollections().toArray();
    const hasCountersCollection = collections.some(col => col.name === 'counters');
    
    if (!hasCountersCollection) {
      console.log('📁 Creating counters collection...');
      await db.createCollection('counters');
    }
    
    // Default counters to initialize
    const defaultCounters = [
      { _id: 'accountNumber', sequence_value: 1000000000 },
      { _id: 'customerId', sequence_value: 1000 },
      { _id: 'transactionId', sequence_value: 1000000 },
      { _id: 'loanAccount', sequence_value: 9000000000 },
      { _id: 'savingsAccount', sequence_value: 8000000000 },
      { _id: 'currentAccount', sequence_value: 7000000000 },
      { _id: 'fixedDeposit', sequence_value: 6000000000 }
    ];
    
    let initializedCount = 0;
    
    for (const counter of defaultCounters) {
      try {
        const existing = await db.collection('counters').findOne({ _id: counter._id });
        
        if (!existing) {
          await db.collection('counters').insertOne({
            _id: counter._id,
            sequence_value: counter.sequence_value,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          console.log(`   ✅ Created counter: ${counter._id} = ${counter.sequence_value}`);
          initializedCount++;
        } else {
          console.log(`   📊 Counter exists: ${counter._id} = ${existing.sequence_value}`);
        }
      } catch (counterError) {
        console.log(`   ⚠️ Error with counter ${counter._id}:`, counterError.message);
      }
    }
    
    console.log(`✅ Counters initialized: ${initializedCount} new counters created`);
    return initializedCount;
    
  } catch (error) {
    console.log('⚠️ Counter initialization failed:', error.message);
    // Don't throw, just log - this is non-critical
  }
};

// DIRECT MongoDB cleanup - bypasses Mongoose completely
const cleanupInvalidDataDirect = async () => {
  try {
    console.log('🧹 DIRECT CLEANUP: Fixing invalid data using raw MongoDB operations...');
    
    // Check connection first
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ MongoDB not connected, skipping cleanup');
      return 0;
    }
    
    const db = mongoose.connection.db;
    let totalFixed = 0;
    
    // 1. Clean up User collection - Convert string roles to numbers
    console.log('   🔧 Fixing User collection...');
    
    try {
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
    } catch (userError) {
      console.log('   ⚠️ User cleanup error:', userError.message);
    }
    
    // 2. Clean up SystemDate collection
    console.log('   🔧 Fixing SystemDate collection...');
    
    try {
      const systemDates = await db.collection('systemdates').find({}).toArray();
      console.log(`   📊 Found ${systemDates.length} SystemDate documents`);
      
      for (const systemDate of systemDates) {
        const updateDoc = {};
        let needsUpdate = false;
        
        // Fix lastEODProcessedBy if it's a string
        if (typeof systemDate.lastEODProcessedBy === 'string') {
          updateDoc.lastEODProcessedBy = null;
          needsUpdate = true;
          console.log(`     🔄 SystemDate ${systemDate._id}: lastEODProcessedBy "${systemDate.lastEODProcessedBy}" -> null`);
        }
        
        if (needsUpdate) {
          await db.collection('systemdates').updateOne(
            { _id: systemDate._id },
            { $set: updateDoc }
          );
          totalFixed++;
        }
      }
    } catch (systemDateError) {
      console.log('   ⚠️ SystemDate cleanup error:', systemDateError.message);
    }
    
    console.log(`✅ DIRECT CLEANUP: Fixed ${totalFixed} documents`);
    return totalFixed;
    
  } catch (error) {
    console.log('⚠️ DIRECT CLEANUP error:', error.message);
    return 0;
  }
};

// Get System User ID Helper
const getSystemUserId = async () => {
  if (SYSTEM_USER_ID) {
    return SYSTEM_USER_ID;
  }
  
  try {
    // Use direct MongoDB query
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ MongoDB not connected for system user lookup');
      return null;
    }
    
    const db = mongoose.connection.db;
    const systemUser = await db.collection('users').findOne({ 
      $or: [
        { username: 'system' },
        { user_name: 'system' }
      ]
    });
    
    if (systemUser && systemUser._id) {
      SYSTEM_USER_ID = systemUser._id.toString();
      console.log(`📋 Retrieved System User ID: ${SYSTEM_USER_ID}`);
      return SYSTEM_USER_ID;
    }
    
    console.log('⚠️ System user not found');
    return null;
  } catch (error) {
    console.log('⚠️ Error getting system user ID:', error.message);
    return null;
  }
};

// Create System User
const createSystemUserIfNotExists = async () => {
  try {
    console.log('🔄 Checking/Creating system user...');
    
    // Check connection first
    if (mongoose.connection.readyState !== 1) {
      console.log('⚠️ MongoDB not connected, skipping system user creation');
      return null;
    }
    
    const db = mongoose.connection.db;
    
    // Check if system user exists
    const existingSystemUser = await db.collection('users').findOne({ 
      $or: [
        { username: 'system' },
        { user_name: 'system' }
      ]
    });
    
    if (existingSystemUser) {
      console.log('✅ System user already exists');
      SYSTEM_USER_ID = existingSystemUser._id.toString();
      
      // Fix role if needed
      let needsUpdate = false;
      const updateDoc = {};
      
      if (typeof existingSystemUser.primary_role === 'string') {
        updateDoc.primary_role = ROLE_MAPPING.EOD_OPERATOR;
        needsUpdate = true;
      } else if (existingSystemUser.primary_role !== ROLE_MAPPING.EOD_OPERATOR) {
        updateDoc.primary_role = ROLE_MAPPING.EOD_OPERATOR;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await db.collection('users').updateOne(
          { _id: existingSystemUser._id },
          { $set: updateDoc }
        );
        console.log(`✅ Updated system user role`);
      }
      
      return existingSystemUser;
    }
    
    // Create new system user
    console.log('🔄 Creating new system user...');
    
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
    console.log(`✅ System user created with ID: ${SYSTEM_USER_ID}`);
    
    return { ...systemUser, _id: result.insertedId };
    
  } catch (error) {
    console.log('⚠️ System user creation failed:', error.message);
    return null;
  }
};

// Initialize application safely
const safeInitializeApplication = async () => {
  try {
    console.log('🛡️ Starting SAFE application initialization...');

    // Wait for MongoDB connection
    const waitForMongoConnection = async (maxWaitTime = 20000) => {
      const startTime = Date.now();
      
      return new Promise((resolve) => {
        const checkConnection = () => {
          const currentTime = Date.now();
          const elapsedTime = currentTime - startTime;

          if (mongoose.connection.readyState === 1) {
            console.log('✅ MongoDB connection ready');
            resolve(true);
          } else if (elapsedTime >= maxWaitTime) {
            console.log('⚠️ MongoDB connection timeout');
            resolve(false);
          } else {
            setTimeout(checkConnection, 1000);
          }
        };
        
        checkConnection();
      });
    };

    const isConnected = await waitForMongoConnection(20000);
    
    if (!isConnected) {
      console.log('⚠️ MongoDB not connected, skipping application initialization');
      return;
    }

    console.log('✅ Database ready, initializing application...');
    
    // Import and run initializeApplication
    try {
      const { default: initializeApplication } = await import('./src/utils/initializeApplication.js');
      await initializeApplication();
      logger.info('✅ Application initialization completed successfully');
    } catch (initError) {
      console.log('⚠️ Application initialization failed:', initError.message);
    }
    
  } catch (error) {
    console.error('❌ Application initialization failed:', error.message);
  }
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
// BASIC API ENDPOINTS
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
    database: getDbStateText(mongoose.connection.readyState),
    systemUserId: SYSTEM_USER_ID ? 'Available' : 'Not set'
  });
});

// ============================================
// EOD MANAGEMENT ENDPOINTS
// ============================================

app.post('/api/system/eod/start', async (req, res) => {
  try {
    const { processedBy = 'system' } = req.body;
    
    const userId = await getSystemUserId();
    if (!userId) {
      return res.status(500).json({
        success: false,
        error: 'System user not available'
      });
    }
    
    console.log(`🔄 Starting EOD process with system user ID: ${userId}`);
    
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

app.get('/api/system/eod/status', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected'
      });
    }
    
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
        lastUpdated: systemDate.lastUpdated
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/system/date/info', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected'
      });
    }
    
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
        lastUpdated: systemDate.lastUpdated
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.get('/api/system/user/info', async (req, res) => {
  try {
    const systemUserId = await getSystemUserId();
    if (!systemUserId) {
      return res.status(404).json({
        success: false,
        message: 'System user not found'
      });
    }
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected'
      });
    }
    
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
        primary_role_name: ROLE_REVERSE_MAPPING[systemUser.primary_role] || 'Unknown',
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
    
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database not connected'
      });
    }
    
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
// SERVER STARTUP
// ============================================

const startServer = async () => {
  try {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 STARTING EVOLUTION BANKING BACKEND SERVER');
    console.log('='.repeat(60));

    // STEP 1: Connect to MongoDB
    console.log('🔄 STEP 1: Connecting to MongoDB...');
    await connectDB();
    logger.info('✅ MongoDB connected successfully');

    // STEP 2: Wait for stable connection
    console.log('🔄 STEP 2: Waiting for MongoDB connection...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // STEP 3: Emergency cleanup
    console.log('🔄 STEP 3: Running direct data cleanup...');
    if (mongoose.connection.readyState === 1) {
      const fixed = await cleanupInvalidDataDirect();
      if (fixed > 0) console.log(`✅ Cleaned up ${fixed} documents`);
    } else {
      console.log('⚠️ MongoDB not connected, skipping cleanup');
    }

    // STEP 4: Create system user
    console.log('🔄 STEP 4: Ensuring system user exists...');
    if (mongoose.connection.readyState === 1) {
      await createSystemUserIfNotExists();
    } else {
      console.log('⚠️ MongoDB not connected, skipping system user creation');
    }

    // STEP 5: Initialize counters
    console.log('🔄 STEP 5: Initializing account counters...');
    if (mongoose.connection.readyState === 1) {
      await initializeCounters();
    } else {
      console.log('⚠️ MongoDB not connected, skipping counter initialization');
    }

    // STEP 6: Initialize system dates
    console.log('🔄 STEP 6: Initializing system dates...');
    try {
      await initializeSystemDates();
      logger.info('✅ System dates initialized');
    } catch (e) {
      logger.warn('System dates init failed:', e.message);
    }

    // STEP 7: Start server
    console.log('🔄 STEP 7: Starting HTTP server...');
    const PORT = process.env.PORT || 5000;
    const HOST = '0.0.0.0';

    const server = app.listen(PORT, HOST, () => {
      const networkIP = getNetworkIP();
      console.log('\n' + '='.repeat(60));
      console.log('✅ SERVER RUNNING SUCCESSFULLY');
      console.log('='.repeat(60));
      console.log(`Local: http://localhost:${PORT}`);
      console.log(`Network: http://${networkIP}:${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`Database: ${getDbStateText(mongoose.connection.readyState)}`);
      console.log('='.repeat(60) + '\n');

      // Background application init
      setTimeout(() => {
        safeInitializeApplication();
      }, 3000);
    });

    // Configure graceful shutdown
    const configureShutdown = (server) => {
      const shutdown = async (signal) => {
        console.log(`Shutdown signal received: ${signal}`);
        
        server.close(async () => {
          console.log('✅ HTTP server closed');
          
          try {
            if (mongoose.connection.readyState === 1) {
              await mongoose.connection.close();
              console.log('✅ MongoDB connection closed');
            }
          } catch (dbError) {
            console.error('❌ Error closing MongoDB connection:', dbError.message);
          }
          
          console.log('🛑 Shutdown completed');
          process.exit(0);
        });
      };

      process.on('SIGINT', () => shutdown('SIGINT'));
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    };

    configureShutdown(server);

  } catch (error) {
    logger.error('❌ Fatal startup error:', error);
    console.error('❌ Server startup failed:', error.message);
    process.exit(1);
  }
};

// Start the server
startServer();