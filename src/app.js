///////////////////////////////////////////////////////////////////////////////
////======APP WITH FIXED USER ROUTES (DIRECT IMPORT)======///////////////////
// app.js - EXPRESS APP ONLY (NO SERVER STARTUP) - WITH LAZY LOADING & FIXED BODY PARSING
// ============================================
// PIDUSAGE ERROR SUPPRESSION - MUST BE AT VERY TOP
// ============================================

// ✅ Force disable pidusage BEFORE any imports
const originalConsoleError = console.error;
console.error = function(...args) {
    const message = args[0];
    if (message && typeof message === 'string') {
        if (message.includes('spawn wmic ENOENT') || 
            message.includes('pidusage') ||
            (message.includes('Command "wmic"') && message.includes('failed'))) {
            return;
        }
    }
    originalConsoleError.apply(console, args);
};

// ============================================
// GLOBAL ERROR HANDLERS (Must be at the top)
// ============================================

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('⚠️ UNCAUGHT EXCEPTION:');
  console.error('Time:', new Date().toISOString());
  console.error('Message:', err.message);
  console.error('Stack:', err.stack);
  
  // Log but don't exit immediately
  // Give time for cleanup if needed
  setTimeout(() => {
    console.error('⚠️ Process exiting due to uncaught exception');
    process.exit(1);
  }, 1000);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('⚠️ UNHANDLED REJECTION:');
  console.error('Time:', new Date().toISOString());
  console.error('Message:', err.message || err);
  console.error('Stack:', err.stack);
  // Don't exit immediately, but log the error
});

// ============================================
// IMPORTS
// ============================================

import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import morgan from 'morgan';
import expressSession from 'express-session';
import fileUpload from 'express-fileupload';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { v2 as cloudinaryV2 } from 'cloudinary';
import monitor from 'express-status-monitor';
import fs from 'fs';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';

// Fix __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// Import middleware
import { errorHandler } from './middlewares/errorHandler.js';
import ThriftSettingsRoutes from './routes/ThriftSettingsRoutes.js';
import { sequelize } from '../config/db.js';
import DebitCardRoutes from './routes/DebitCardRoutes.js';
import binCardCounterRoutes from './routes/binCardCounterRoutes.js';
import adminRoutes from './routes/AdminRoutes.js';

// Direct route imports (non-lazy)
import loginRoutes from './routes/LoginRoutes.js';
import BulkGroupLoanRoutes from './routes/BulkGroupLoanRoutes.js';
import BulkLoanRoutes from './routes/BulkLoanRoutes.js';
import organizationRoutes from './routes/OrganizationRoutes.js';
import CardSettlementConfigRoutes from './routes/CardSettlementConfigRoutes.js';
import IdentificationInformation from './routes/IdentificationInformationRoutes.js';
import outwardTransferRoutes from './routes/OutwardTransferRoutes.js';
import TransactionRoutes from './routes/TransactionRoutes.js';
import ModuleRoutes from './routes/ModuleRoutes.js';
import pendingGLTransactionRoutes from './routes/PendingGLTransactionRoutes.js';
import EMTLRoutes from './routes/EMTLRoutes.js';
import JournalEntryRoutes from './routes/JournalEntryRoutes.js';
import EmailStatementRoutes from './routes/EmailStatementRoutes.js';
import SystemDateRoutes from './routes/systemDateRoutes.js';
import BinRoutes from './routes/BinRoutes.js';



// EOY Report Routes
import EOYRoutes from './routes/EOYRoutes.js';
// EOM Report Routes
import EOMRoutes from './routes/EOMRoutes.js';


// Channel Routes

import InwardFundsTransferRoutes from './routes/InwardFundsTransferRoutes.js';
import ExternalTransferRoutes from './routes/ExternalTransferRoutes.js';
import CardPaymentRoutes from './routes/CardPaymentRoutes.js';
import CardApprovalRoutes from './routes/CardApprovalRoutes.js';

// ✅ Import AdminUser from the correct path
import AdminUser from '../src/models/AdminUser.js';
import LogRoutes from './routes/LogRoutes.js';

// ✅ IMPORT BANK ROUTES
import BankRoutes from './routes/BankRoutes.js';

// ✅ IMPORT NOTIFICATION ROUTES - Direct import (NOT lazy loaded)
import NotificationRoutes from './routes/NotificationRoutes.js';

// COLLATERAL ROUTES
import CollateralRoutes from '../src/routes/CollateralRoutes.js';

// ✅ IMPORT USER ROUTES - Direct import (FIX FOR 503 ERROR)
import userRoutes from './routes/userRoutes.js';

// Initialize app
const app = express();
app.set('trust proxy', 1);

// ============================================
// WINSTON LOGGER SETUP (More robust logging)
// ============================================

import winston from 'winston';

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: 'evolution-banking-api' },
  transports: [
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      handleExceptions: true,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      handleExceptions: true,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
      handleExceptions: true
    })
  ],
  exitOnError: false // Don't exit on error
});

// Override console methods to use Winston
console.log = (...args) => logger.info(args.join(' '));
console.error = (...args) => logger.error(args.join(' '));
console.warn = (...args) => logger.warn(args.join(' '));
console.info = (...args) => logger.info(args.join(' '));

// ============================================
// CORS CONFIGURATION (MUST BE FIRST)
// ============================================

const corsOptions = {
  origin: [
    'https://evolutionbankingsolution-lexicalresource.com.ng',
    'https://evolutionbankingsolution-LARSDAN.com.ng',
    'http://evolutionbankingsolution-lexicalresource.com.ng',
    'http://evolutionbankingsolution-LARSDAN.com.ng',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:4000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:3002',
    'http://192.168.1.*',  // For local network access
    'http://10.*.*.*',     // For local network access
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH', 'HEAD'],
  allowedHeaders: [
    // Standard headers
    'Content-Type',
    'Authorization',
    'Accept',
    'Origin',
    'User-Agent',
    'Referer',
    'Range',
    'Cache-Control',
    'Pragma',
    'Expires',
    'If-Modified-Since',
    'If-None-Match',
    
    // Custom headers - Backend specific
    'x-api-key',
    'app-id',
    'x-webhook-signature',
    'x-nip-signature',
    'x-encryption-metadata',
    'x-encrypted',
    'x-encryption-version',
    'x-skip-encryption',
    
    // ✅ BUSINESS UNIT / BRANCH HEADERS - REQUIRED FOR APPROVAL/REJECTION
    'x-business-unit',
    'x-branch-name',
    'x-branch-code',
    'x-branch-id',           // ✅ CRITICAL - Used for branch identification
    'x-user-id',              // ✅ CRITICAL - Used for user identification
    'x-is-admin',             // ✅ For admin role verification
    'x-role',                 // ✅ For role verification
    
    // Organization headers
    'x-organization-id',
    'x-organization-name',
    
    // Additional headers
    'x-requested-with',
    'x-forwarded-for',
    'x-real-ip',
    'x-trace-id',
    'x-correlation-id',
    'x-session-id',
    'x-device-id',
    'x-platform',
    'x-version',
    'x-build-number',
  ],
  exposedHeaders: [
    // Standard exposed headers
    'Content-Range',
    'X-Total-Count',
    'X-Content-Range',
    
    // Business unit headers
    'X-Business-Unit',
    'X-Branch-Name',
    'X-Branch-Code',
    'X-Branch-Id',            // ✅ Expose branch ID to frontend
    'X-User-Id',              // ✅ Expose user ID to frontend
    
    // Organization headers
    'X-Organization-Id',
    'X-Organization-Name',
    
    // Additional headers
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-Id',
    'X-Correlation-Id',
    'X-Session-Id',
    'X-Trace-Id',
    'X-Debug-Info',
    'X-Response-Time',
  ],
  maxAge: 86400, // 24 hours - Cache preflight requests
};

console.log('🛡️ CORS Allowed Origins:', corsOptions.origin);
console.log('🛡️ CORS Allowed Headers:', corsOptions.allowedHeaders);
console.log('🛡️ CORS Exposed Headers:', corsOptions.exposedHeaders);

// Apply CORS middleware
app.use(cors(corsOptions));

// ============================================
// COMPREHENSIVE CORS HEADERS MIDDLEWARE
// ============================================
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Check if origin is allowed
  const isAllowedOrigin = corsOptions.origin.some(allowed => {
    if (typeof allowed === 'string') {
      // Handle wildcard patterns like http://192.168.1.*
      if (allowed.includes('*')) {
        const pattern = allowed.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        return regex.test(origin);
      }
      return allowed === origin;
    }
    return false;
  });

  if (origin && isAllowedOrigin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (process.env.NODE_ENV === 'development') {
    // Allow any origin in development
    res.header('Access-Control-Allow-Origin', origin || '*');
  } else if (origin && !isAllowedOrigin) {
    console.warn(`⚠️ CORS: Origin ${origin} not allowed`);
  }
  
  // Allow credentials
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Allow methods
  res.header('Access-Control-Allow-Methods', corsOptions.methods.join(', '));
  
  // ✅ ALLOW ALL HEADERS - Comprehensive list including x-branch-id
  const allowedHeaders = [
    // Standard headers
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'User-Agent',
    'Referer',
    'Range',
    'Cache-Control',
    'Pragma',
    'Expires',
    'If-Modified-Since',
    'If-None-Match',
    
    // Custom headers
    'x-api-key',
    'app-id',
    'x-webhook-signature',
    'x-nip-signature',
    'x-encryption-metadata',
    'x-encrypted',
    'x-encryption-version',
    'x-skip-encryption',
    
    // ✅ BUSINESS UNIT / BRANCH HEADERS
    'x-business-unit',
    'x-branch-name',
    'x-branch-code',
    'x-branch-id',           // ✅ CRITICAL
    'x-user-id',              // ✅ CRITICAL
    'x-is-admin',
    'x-role',
    
    // Organization headers
    'x-organization-id',
    'x-organization-name',
    
    // Additional headers
    'x-forwarded-for',
    'x-real-ip',
    'x-trace-id',
    'x-correlation-id',
    'x-session-id',
    'x-device-id',
    'x-platform',
    'x-version',
    'x-build-number',
    
    // CORS required headers
    'access-control-allow-origin',
    'access-control-allow-methods',
    'access-control-allow-headers',
    'access-control-allow-credentials',
    'access-control-expose-headers',
  ].join(', ');
  
  res.header('Access-Control-Allow-Headers', allowedHeaders);
  
  // ✅ EXPOSE HEADERS to frontend
  const exposedHeaders = [
    'Content-Range',
    'X-Total-Count',
    'X-Content-Range',
    'X-Business-Unit',
    'X-Branch-Name',
    'X-Branch-Code',
    'X-Branch-Id',            // ✅ Expose branch ID
    'X-User-Id',              // ✅ Expose user ID
    'X-Organization-Id',
    'X-Organization-Name',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-Id',
    'X-Correlation-Id',
    'X-Session-Id',
    'X-Trace-Id',
    'X-Debug-Info',
    'X-Response-Time',
  ].join(', ');
  
  res.header('Access-Control-Expose-Headers', exposedHeaders);
  
  // Handle preflight OPTIONS requests
  if (req.method === 'OPTIONS') {
    console.log(`🔄 OPTIONS request for: ${req.path} from ${origin}`);
    res.header('Access-Control-Max-Age', '86400'); // 24 hours
    return res.status(200).end();
  }
  
  next();
});

// ============================================
// DEVELOPMENT MODE - PERMISSIVE CORS
// ============================================
if (process.env.NODE_ENV === 'development') {
  console.log('🔧 Development mode: Using permissive CORS');
  
  app.use((req, res, next) => {
    const origin = req.headers.origin || '*';
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
    
    // ✅ ALLOW ALL HEADERS in development
    const allHeaders = [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'User-Agent',
      'Referer',
      'Range',
      'Cache-Control',
      'Pragma',
      'Expires',
      'If-Modified-Since',
      'If-None-Match',
      'x-api-key',
      'app-id',
      'x-webhook-signature',
      'x-nip-signature',
      'x-encryption-metadata',
      'x-encrypted',
      'x-encryption-version',
      'x-skip-encryption',
      'x-business-unit',
      'x-branch-name',
      'x-branch-code',
      'x-branch-id',           // ✅ ALLOWED
      'x-user-id',              // ✅ ALLOWED
      'x-is-admin',
      'x-role',
      'x-organization-id',
      'x-organization-name',
      'x-forwarded-for',
      'x-real-ip',
      'x-trace-id',
      'x-correlation-id',
      'x-session-id',
      'x-device-id',
      'x-platform',
      'x-version',
      'x-build-number',
      'access-control-allow-origin',
      'access-control-allow-methods',
      'access-control-allow-headers',
      'access-control-allow-credentials',
      'access-control-expose-headers',
    ].join(', ');
    
    res.header('Access-Control-Allow-Headers', allHeaders);
    
    // ✅ EXPOSE ALL HEADERS in development
    const exposeHeaders = [
      'Content-Range',
      'X-Total-Count',
      'X-Content-Range',
      'X-Business-Unit',
      'X-Branch-Name',
      'X-Branch-Code',
      'X-Branch-Id',
      'X-User-Id',
      'X-Organization-Id',
      'X-Organization-Name',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
      'X-Request-Id',
      'X-Correlation-Id',
      'X-Session-Id',
      'X-Trace-Id',
      'X-Debug-Info',
      'X-Response-Time',
    ].join(', ');
    
    res.header('Access-Control-Expose-Headers', exposeHeaders);
    
    if (req.method === 'OPTIONS') {
      res.header('Access-Control-Max-Age', '86400');
      return res.status(200).end();
    }
    next();
  });
}

// ============================================
// CORS ERROR HANDLING MIDDLEWARE
// ============================================
app.use((err, req, res, next) => {
  if (err.name === 'CORSError') {
    console.error('❌ CORS Error:', err.message);
    return res.status(403).json({
      success: false,
      message: 'CORS policy violation',
      details: err.message,
      origin: req.headers.origin,
      method: req.method,
    });
  }
  next(err);
});

// ============================================
// DEBUG ENDPOINT FOR CORS TESTING
// ============================================
app.options('/cors-test', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-branch-id, x-user-id');
  res.sendStatus(200);
});

app.get('/cors-test', (req, res) => {
  res.json({
    success: true,
    message: 'CORS test successful',
    headers: req.headers,
    timestamp: new Date().toISOString(),
    cors: {
      origin: req.headers.origin,
      allowedHeaders: corsOptions.allowedHeaders,
      exposedHeaders: corsOptions.exposedHeaders,
    }
  });
});

console.log('✅ CORS configuration complete');
console.log(`📋 Allowed Origins: ${corsOptions.origin.length} origins`);
console.log(`📋 Allowed Headers: ${corsOptions.allowedHeaders.length} headers`);
console.log(`📋 Exposed Headers: ${corsOptions.exposedHeaders.length} headers`);

// ============================================
// MULTER ROUTES (MUST BE BEFORE BODY PARSERS)
// ============================================
app.use('/api/identification-information', IdentificationInformation);
console.log('✅ Identification upload route mounted (before body parsers)');


// Email Statement Routes
// Add this where you mount other routes
app.use('/api/email-statements', EmailStatementRoutes);
console.log('✅ Email Statement routes registered at /api/email-statements');

// ============================================
// BODY PARSERS (global)
// ============================================
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// ============================================
// REDIS TRAFFIC MONITORING (WITH IMPROVED ERROR HANDLING)
// ============================================

const redisHost = (process.env.REDIS_HOST && process.env.REDIS_HOST !== 'disabled') 
  ? process.env.REDIS_HOST 
  : 'localhost';

const redisPort = process.env.REDIS_PORT || 6379;

// Enhanced Redis configuration with better error handling
const redis = new Redis({
  host: redisHost,
  port: redisPort,
  maxRetriesPerRequest: 3,
  connectTimeout: 5000,
  retryStrategy: (times) => {
    if (times > 3) {
      console.warn('⚠️ Redis connection failed after 3 retries, traffic monitoring disabled');
      return null; // Stop retrying
    }
    return Math.min(times * 100, 3000);
  },
  // Additional options for stability
  enableReadyCheck: true,
  lazyConnect: false,
  keepAlive: 30000,
  reconnectOnError: (err) => {
    const targetError = 'READONLY';
    if (err.message.includes(targetError)) {
      return true; // Reconnect for this specific error
    }
    return false;
  }
});

let redisConnected = false;
let redisErrorLogged = false;

redis.on('connect', () => {
  console.log('✅ Redis connected for traffic monitoring on port', redisPort);
  redisConnected = true;
  redisErrorLogged = false;
});

redis.on('ready', () => {
  console.log('✅ Redis is ready');
  redisConnected = true;
});

redis.on('error', (err) => {
  if (!redisErrorLogged) {
    console.warn('⚠️ Redis connection error:', err.message);
    redisErrorLogged = true;
    redisConnected = false;
  }
});

redis.on('close', () => {
  console.warn('⚠️ Redis connection closed');
  redisConnected = false;
});

redis.on('reconnecting', () => {
  console.log('🔄 Redis reconnecting...');
});

app.set('redisClient', redis);

// Traffic counter middleware with try-catch for write operations
app.use((req, res, next) => {
  if (!req.path.startsWith('/api') || 
      req.path === '/api/health' || 
      req.path === '/api/traffic' ||
      req.path === '/api/traffic/stats' ||
      req.path === '/api/traffic/status' ||
      req.path === '/api/traffic-test') {
    return next();
  }

  if (!redisConnected) {
    return next();
  }

  try {
    const pathParts = req.path.split('/').filter(Boolean);
    let baseRoute = '/api';
    if (pathParts.length >= 2) {
      baseRoute = `/${pathParts[0]}/${pathParts[1]}`;
    } else if (pathParts.length === 1) {
      baseRoute = `/${pathParts[0]}`;
    }
    const key = `traffic:${baseRoute}`;

    // Wrap Redis write operations in try-catch
    try {
      redis.incr(key).catch(() => {});
      redis.expire(key, 60).catch(() => {});
    } catch (redisError) {
      console.error('Redis write error:', redisError.message);
      // Handle gracefully - don't crash the request
    }
  } catch (error) {
    console.error('Traffic counter error:', error.message);
    // Continue without traffic counting
  }

  next();
});

// ============================================
// PUBLIC TRAFFIC ENDPOINTS (NO AUTH REQUIRED)
// ============================================

app.get('/api/traffic/status', (req, res) => {
  res.json({
    success: true,
    redisConnected: redisConnected || false,
    redisStatus: redisConnected ? 'Connected' : 'Disconnected',
    redisHost: redisHost,
    redisPort: redisPort,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/traffic/stats', async (req, res) => {
  try {
    if (!redisConnected) {
      return res.json({
        success: true,
        data: {
          totalRequests: 0,
          uniqueRoutes: 0,
          topRoutes: [],
          allRoutes: [],
          redisConnected: false,
          message: 'Redis not connected'
        },
        timestamp: new Date().toISOString()
      });
    }

    try {
      const keys = await redis.keys('traffic:*');
      const stats = [];
      let totalRequests = 0;

      for (const key of keys) {
        try {
          const count = await redis.get(key);
          const route = key.replace('traffic:', '');
          const numCount = parseInt(count) || 0;
          totalRequests += numCount;
          stats.push({ route, count: numCount, percentage: 0 });
        } catch (getError) {
          console.error('Error getting Redis key:', getError.message);
          // Continue with other keys
        }
      }

      stats.forEach(stat => {
        stat.percentage = totalRequests > 0 ? ((stat.count / totalRequests) * 100).toFixed(1) : 0;
      });

      stats.sort((a, b) => b.count - a.count);
      const topRoutes = stats.slice(0, 20);

      res.json({
        success: true,
        data: {
          totalRequests,
          uniqueRoutes: stats.length,
          topRoutes,
          allRoutes: stats,
          redisConnected: true,
          timestamp: new Date().toISOString()
        }
      });
    } catch (redisError) {
      console.error('Redis stats error:', redisError);
      throw redisError;
    }
  } catch (error) {
    console.error('❌ Traffic stats error:', error);
    res.json({
      success: false,
      data: {
        totalRequests: 0,
        uniqueRoutes: 0,
        topRoutes: [],
        allRoutes: [],
        redisConnected: false,
        error: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

app.get('/api/traffic-test', (req, res) => {
  res.json({
    success: true,
    redisConnected: redisConnected || false,
    redisStatus: redisConnected ? 'Connected' : 'Disconnected',
    message: redisConnected ? 'Redis is running' : 'Redis is not running',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// ✅ ADMIN LOGIN – with its own explicit JSON parser
// ============================================
app.post('/api/login/admin-login', express.json(), async (req, res) => {
  console.log('📥 Admin login body:', req.body);
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }

  try {
    const admin = await AdminUser.findOne({ where: { username } });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const isValid = await admin.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = jwt.sign(
      { userId: admin.id, username: admin.username, role: 'admin_console' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({ success: true, token });
  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ============================================
// SECURITY & MIDDLEWARE (non-body-consuming)
// ============================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(hpp());
app.use(monitor());
app.use(cookieParser());
app.use(compression());
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// Set sequelize in app
app.set('sequelize', sequelize);
console.log('✅ Sequelize instance set in app');

// ============================================
// RATE LIMITING
// ============================================

const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    const isDev = process.env.NODE_ENV === 'development';
    const isLogin = req.path === '/api/users/users/login';
    const isLicense = req.path === '/api/license/validate-file';
    const isBulkUpload = req.path === '/api/bulk/group-loans/disburse' || req.path.includes('/bulk/group-loans');
    return isDev || isLogin || isLicense || isBulkUpload;
  }
});

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many webhook requests',
  skip: (req) => process.env.NODE_ENV === 'development'
});

app.use('/api', apiLimiter);
app.use('/api/inwardfunds', webhookLimiter);
app.use('/api/webhook', webhookLimiter);
app.use('/api/nip', webhookLimiter);

// ============================================
// SESSION & STATIC FILES
// ============================================

app.use(expressSession({
  secret: process.env.SESSION_SECRET || 'dev_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 86400000,
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax'
  }
}));

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

// Cloudinary Config
const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
};
if (cloudinaryConfig.cloud_name && cloudinaryConfig.api_key && cloudinaryConfig.api_secret) {
  cloudinaryV2.config(cloudinaryConfig);
  console.log('✅ Cloudinary configured');
} else {
  console.warn('⚠️ Cloudinary not configured - missing credentials');
}

// ============================================
// QUEUE SYSTEM SETUP (optional)
// ============================================
let queueEnabled = false;
if (process.env.QUEUE_ENABLED === 'true') {
  try {
    const Queue = (await import('bull')).default;
    const Redis = (await import('ioredis')).default;
    const { Op } = await import('sequelize');
    const redisQueue = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          console.warn('⚠️ Redis connection failed after 3 retries, queue disabled');
          return null;
        }
        return Math.min(times * 100, 3000);
      }
    });
    const requestQueue = new Queue('requests', { redis: redisQueue });
    requestQueue.process('customer-search', 10, async (job) => {
      const { searchTerm } = job.data;
      const Customer = (await import('./models/Customer.js')).default;
      return await Customer.findAll({ 
        where: { name: { [Op.like]: `%${searchTerm}%` } },
        limit: 100
      });
    });
    const queueRequest = (queueName) => {
      return async (req, res) => {
        try {
          const job = await requestQueue.add(queueName, {
            method: req.method,
            url: req.url,
            body: req.body,
            query: req.query,
            timestamp: Date.now()
          }, { attempts: 3, backoff: { type: 'exponential', delay: 1000 } });
          const result = await job.finished();
          res.json(result);
        } catch (error) {
          console.error('Queue processing error:', error);
          res.status(503).json({ success: false, message: 'Queue service unavailable. Please try again.', error: error.message });
        }
      };
    };
    app.post('/api/queued/customer-search', queueRequest('customer-search'));
    queueEnabled = true;
    console.log('✅ Queue system enabled - Redis connected');
    console.log('   - POST /api/queued/customer-search');
  } catch (error) {
    console.warn('⚠️ Queue system disabled - Redis not available:', error.message);
  }
} else {
  console.log('ℹ️ Queue system disabled (set QUEUE_ENABLED=true to enable)');
}

// ============================================
// CREATE UPLOAD DIRECTORIES
// ============================================
const uploadsDir = 'uploads/';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`📁 Created uploads directory: ${uploadsDir}`);
}
const bulkLoansDir = path.join(uploadsDir, 'bulk-loans');
if (!fs.existsSync(bulkLoansDir)) {
  fs.mkdirSync(bulkLoansDir, { recursive: true });
  console.log(`📁 Created bulk-loans directory: ${bulkLoansDir}`);
}

// ============================================
// CONDITIONAL FILE UPLOAD – SKIP FOR JSON, BULK MULTIPART, AND PLUGIN UPLOADS
// ============================================
app.use((req, res, next) => {
  const isBulkRoute = req.url.includes('/bulk/group-loans') || req.url.includes('/bulk/individual');
  const isPluginRoute = req.url.includes('/plugins/upload');
  const isMultipart = req.headers['content-type']?.includes('multipart/form-data');
  const isJson = req.headers['content-type']?.includes('application/json');
  const isWebhook = req.url.includes('/webhook');
  
  if (isJson || isPluginRoute || isWebhook || (isBulkRoute && isMultipart)) {
    console.log('🔧 Skipping fileUpload for route:', req.url);
    return next();
  }
  
  fileUpload({
    useTempFiles: false,
    limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 50 * 1024 * 1024 },
    abortOnLimit: true,
    createParentPath: true,
    safeFileNames: true,
    preserveExtension: true
  })(req, res, next);
});

// ============================================
// DIRECT ROUTES (NOT LAZY) – MUST BE AFTER BODY PARSERS
// ============================================

app.use('/api/thriftsetup', ThriftSettingsRoutes);
app.use('/api/bulk/group-loans', BulkGroupLoanRoutes);
console.log('✅ Bulk group loan routes loaded directly');

app.use('/api/login', loginRoutes);
console.log('✅ Login routes loaded directly');

app.use('/api/organization', organizationRoutes);
console.log('✅ Organization routes loaded directly');

// ============================================
// ✅ USER ROUTES - Direct import (FIX FOR 503 ERROR)
// ============================================
console.log('\n🔧 ========================================');
console.log('🔧 SETTING UP USER ROUTES');
console.log('🔧 ==========================================\n');

app.use('/api/users', userRoutes);
console.log('✅ User routes registered directly!');
console.log('   - Base path: /api/users');
console.log('   - Routes: GET /, POST /register, PUT /:id, etc.');

// ============================================
// ✅ NOTIFICATION ROUTES - Direct import (NOT lazy loaded)
// ============================================
console.log('\n🔧 ========================================');
console.log('🔧 SETTING UP NOTIFICATION ROUTES');
console.log('🔧 ==========================================\n');

app.use('/api/notifications', NotificationRoutes);
console.log('✅ Notification routes registered directly!');
console.log('   - Base path: /api/notifications');
console.log('   - Routes: GET /user/:userId/:roleId, PUT /:id/read, etc.');

// ============================================
// ✅ TRANSACTION ROUTES - BOTH SINGULAR AND PLURAL
// ============================================
console.log('\n🔧 ========================================');
console.log('🔧 SETTING UP TRANSACTION ROUTES');
console.log('🔧 ==========================================\n');

// Mount the consolidated transaction routes at BOTH paths
app.use('/api/transaction', TransactionRoutes);
app.use('/api/transactions', TransactionRoutes);  // Alias for backward compatibility

console.log('✅ Transaction routes registered successfully!');
console.log('   - All routes are defined in ./routes/TransactionRoutes.js');
console.log('   - Base path: /api/transaction');
console.log('   - Alias path: /api/transactions (for backward compatibility)');

// ============================================
// MANUAL BANK ROUTES
// ============================================
console.log('\n🔧 ========================================');
console.log('🔧 SETTING UP MANUAL BANK ROUTES');
console.log('🔧 ==========================================\n');

app.use('/api/banking', BankRoutes);
console.log('✅ Bank routes registered directly');

// ============================================
// ENHANCED LAZY LOAD ROUTES (with model initialisation)
// ============================================

const lazyLoadRoute = (routePath) => {
  return async (req, res, next) => {
    // ✅ Skip routes that are already loaded directly
    const skipRoutes = [
      './routes/QueueRoutes.js',
      './routes/OrganizationRoutes.js',
      './routes/userRoutes.js',        // ✅ Skip - loaded directly
      './routes/NotificationRoutes.js', // ✅ Skip - loaded directly
      './routes/LoginRoutes.js',        // ✅ Skip - loaded directly
      './routes/TransactionRoutes.js',  // ✅ Skip - loaded directly
      './routes/BankRoutes.js'          // ✅ Skip - loaded directly
    ];
    if (skipRoutes.includes(routePath)) {
      console.warn(`⚠️ Route ${routePath} is skipped (loaded directly)`);
      return next();
    }
    
    try {
      const { initializeModels } = await import('./models/index.js');
      await initializeModels();
      
      const module = await import(routePath);
      const handler = module.default;
      handler(req, res, next);
    } catch (error) {
      console.error(`❌ Failed to lazy load route ${routePath}:`, error.message);
      res.status(503).json({ 
        success: false, 
        message: 'Service temporarily unavailable', 
        error: `Route ${req.path} could not be loaded`,
        details: error.message 
      });
    }
  };
};


// Channel routes ////////////////////////////////////////////////////////////////
app.use('/api/inwardfunds', InwardFundsTransferRoutes);
app.use('/api/external-transfers', ExternalTransferRoutes);
app.use('/api/card-payments', CardPaymentRoutes);
app.use('/api/card-approvals', CardApprovalRoutes);
app.use('/api/bin', BinRoutes);


// ============================================
// EOY REPORT ROUTES
// ============================================
app.use('/api/eoy', EOYRoutes);
console.log('✅ EOY report routes registered at /api/eoy');
// ============================================

// ============================================
// EOM REPORT ROUTES
// ============================================
app.use('/api/eom', EOMRoutes);
console.log('✅ EOM report routes registered at /api/eom');
// ============================================
 

// Mount the consolidated transaction routes at BOTH paths
app.use('/api/webhook', lazyLoadRoute('./routes/WebhookRoutes.js'));
app.use('/api/nip/webhook', lazyLoadRoute('./routes/NipWebhookRoutes.js'));
app.use('/api/user-role', lazyLoadRoute('./routes/UserRoleRoutes.js'));
app.use('/api/permissions', lazyLoadRoute('./routes/PermissionRoutes.js'));
app.use('/api/aml', lazyLoadRoute('./routes/amlRoutes.js'));
app.use('/api/aml-threshold', lazyLoadRoute('./routes/AMLThresholdRoutes.js'));
app.use('/api/customer', lazyLoadRoute('./routes/CustomerRoutes.js'));
app.use('/api/customers-account', lazyLoadRoute('./routes/CustomerAccountRoutes.js'));
app.use('/api/customer-types', lazyLoadRoute('./routes/CustomerTypeRoutes.js'));
app.use('/api/guarantors', lazyLoadRoute('./routes/GuarantorRoutes.js'));
app.use('/api/upload-guarantors', lazyLoadRoute('./routes/uploadGuarantorDocumentsRoutes.js'));
app.use('/api/deposit', lazyLoadRoute('./routes/DepositRoutes.js'));
app.use('/api/deposit-transaction', lazyLoadRoute('./routes/DepositTransactionRoutes.js'));
app.use('/api/deposit-summary', lazyLoadRoute('./routes/DepositAccountSummaryRoutes.js'));
app.use('/api/deposit-account-application', lazyLoadRoute('./routes/DepositAccountApplicationRoutes.js'));
app.use('/api/deposit-account-history', lazyLoadRoute('./routes/DepositAccountHistoryRoutes.js'));
app.use('/api/deposit-account-interest', lazyLoadRoute('./routes/DepositAccountInterestRoute.js'));
app.use('/api/deposit-account-interest-audit', lazyLoadRoute('./routes/Deposit_Account_INTEREST$AUDRoutes.js'));
app.use('/api/deposit-account-interest-option', lazyLoadRoute('./routes/DepositAccountInterestOptionRoutes.js'));
app.use('/api/deposit-account-interest-tier', lazyLoadRoute('./routes/DepositAccountInterest_TierRoutes.js'));
app.use('/api/deposit-account-monthly-stat', lazyLoadRoute('./routes/DepositAccountMonthlyStatRoute.js'));
app.use('/api/deposit-search', lazyLoadRoute('./routes/DepositSearchRoutes.js'));
app.use('/api/term-deposit', lazyLoadRoute('./routes/TermDepositRoutes.js'));
app.use('/api/cash-withdrawals', lazyLoadRoute('./routes/CashWithdrawalTransactionRoutes.js'));
app.use('/api/withdrawals', lazyLoadRoute('./routes/withdrawalRoutes.js'));
app.use('/api/loans', lazyLoadRoute('./routes/LoanAccountRoutes.js'));
app.use('/api/loan-accounts-details', lazyLoadRoute('./routes/LoanAccountDetailsRoutes.js'));
app.use('/api/loan-contract-form', lazyLoadRoute('./routes/LoanContractFormRoutes.js'));
app.use('/api/loan-fees', lazyLoadRoute('./routes/LoanFeeRoutes.js'));
app.use('/api/loan-product', lazyLoadRoute('./routes/LoanProductRoutes.js'));
app.use('/api/loan-repayments', lazyLoadRoute('./routes/LoanRepaymentRoute.js'));
app.use('/api/overdue', lazyLoadRoute('./routes/OverdueLoansRoutes.js'));
app.use('/api/repayment-schedule', lazyLoadRoute('./routes/repaymentScheduleRoutes.js'));
app.use('/api/credit-applications', lazyLoadRoute('./routes/CreditApplicationRoutes.js'));
app.use('/api/system-date', lazyLoadRoute('./routes/systemDateRoutes.js'));
app.use('/api/holiday', lazyLoadRoute('./routes/holidayRoutes.js'));
app.use('/api/business-units', lazyLoadRoute('./routes/BusinessUnitRoutes.js'));
app.use('/api/business-roles', lazyLoadRoute('./routes/businessRoleRoutes.js'));
app.use('/api/license', lazyLoadRoute('./routes/LicenseRoutes.js'));
app.use('/api/countries', lazyLoadRoute('./routes/CountryRoutes.js'));
app.use('/api/os', lazyLoadRoute('./routes/OsRoutes.js'));
app.use('/api/products', lazyLoadRoute('./routes/SavingsProductsRoutes.js'));
app.use('/api/product-mapping', lazyLoadRoute('./routes/productTypeMappingRoutes.js'));
app.use('/api/workflow', lazyLoadRoute('./routes/WF_BUSINESS_PROCESSRoutes.js'));
app.use('/api/workflow-queue', lazyLoadRoute('./routes/WF_QUEUERoutes.js'));
app.use('/api/work-items', lazyLoadRoute('./routes/WF_WORK_ITEMRoutes.js'));
app.use('/api/sub-process', lazyLoadRoute('./routes/WF_SUB_PROCESSRoutes.js'));
app.use('/api/sub-process-policy', lazyLoadRoute('./routes/WF_SubProcessPolicyRoutes.js'));
app.use('/api/business-role-queue', lazyLoadRoute('./routes/WF_BusinessRoleQueueRoutes.js'));
app.use('/api/customer-workflow-routing', lazyLoadRoute('./routes/CustWorkflowRoutingRoutes.js'));
app.use('/api/gl-accounts', lazyLoadRoute('./routes/GLAccountRoutes.js'));
app.use('/api/gl-transactions', lazyLoadRoute('./routes/GLAccountTransactionRoutes.js'));
app.use('/api/ledgers', lazyLoadRoute('./routes/LedgerRoutes.js'));
app.use('/api/interest-rates', lazyLoadRoute('./routes/InterestCalculationServiceRoutes.js'));

// ============================================
// Admin-ui LogRoutes
// ============================================
app.use('/api/logs', lazyLoadRoute('./routes/LogRoutes.js'));


app.use('/api/drawer', lazyLoadRoute('./routes/DrawerRoutes.js'));
// Log all routes for debugging
console.log('\n=== ALL REGISTERED ROUTES ===');
app._router.stack.forEach((middleware) => {
  if (middleware.route) {
    const methods = Object.keys(middleware.route.methods).join(', ').toUpperCase();
    console.log(`${methods} ${middleware.route.path}`);
  }
  if (middleware.name === 'router') {
    middleware.handle.stack.forEach((layer) => {
      if (layer.route) {
        const methods = Object.keys(layer.route.methods).join(', ').toUpperCase();
        console.log(`${methods} /api/drawer${layer.route.path}`);
      }
    });
  }
});
app.use('/api/drawer-currency-denomination', lazyLoadRoute('./routes/DrawerCurrencyDenominationRoutes.js'));
app.use('/api/drawer-reassignments', lazyLoadRoute('./routes/DrawerReassignmentRoutes.js'));
app.use('/api/drawer-user-role', lazyLoadRoute('./routes/DrawerUserRoleRoutes.js'));
app.use('/api/direct-debits', lazyLoadRoute('./routes/DirectDebitRoutes.js'));
app.use('/api/direct-debit-requests', lazyLoadRoute('./routes/DirectDebitRequestRoute.js'));
app.use('/api/direct-debit-schedulers', lazyLoadRoute('./routes/DirectDebitSchedulerRoutes.js'));
app.use('/api/sms', lazyLoadRoute('./routes/SMSRoutes.js'));
app.use('/api/analytics', lazyLoadRoute('./routes/AnalyticsRoute.js'));
app.use('/api/audit-trails', lazyLoadRoute('./routes/AuditTrailRoutes.js'));
app.use('/api/audit', lazyLoadRoute('./routes/AuditTrailRoutes.js'));
app.use('/api/dashboard', lazyLoadRoute('./routes/dashboardRoutes.js'));
app.use('/api/upload', lazyLoadRoute('./routes/uploadFileRoutes.js'));
app.use('/api/subfolders', lazyLoadRoute('./routes/SubfolderRoutes.js'));
app.use('/api/event', lazyLoadRoute('./routes/eventRoutes.js'));
app.use('/api/reclassify', lazyLoadRoute('./routes/AutoReclassifyRoutes.js'));
app.use('/api/officers', lazyLoadRoute('./routes/RelationshipOfficerRoutes.js'));
app.use('/api/policy', lazyLoadRoute('./routes/TransactionPolicyRoutes.js'));
app.use('/api/system', lazyLoadRoute('./routes/system.js'));
app.use('/api/config', lazyLoadRoute('./routes/config.js'));
app.use('/api/reports', lazyLoadRoute('./routes/reportRoutes.js'));
app.use('/api/account-report', lazyLoadRoute('./routes/accountStatementRoutes.js'));
app.use('/api/reports/income-expense', lazyLoadRoute('./routes/incomeExpenseRoutes.js'));
app.use('/api/savings-product', lazyLoadRoute('./routes/SavingsProductsRoutes.js'));
app.use('/api/charges', lazyLoadRoute('./routes/ChargeRoutes.js'));
app.use('/api/identifiers', lazyLoadRoute('./routes/identifierRoutes.js'));
app.use('/api/gl-categories', lazyLoadRoute('./routes/glCategoriesRoutes.js'));
app.use('/api/branches', lazyLoadRoute('./routes/BranchRoutes.js'));
app.use('/api/teller', lazyLoadRoute('./routes/tellerStatsRoutes.js'));
app.use('/api/thrift-banking', lazyLoadRoute('./routes/ThriftRoutes.js'));
app.use('/api/users/credit-officer', lazyLoadRoute('./routes/creditOfficerRoutes.js'));
app.use('/api/thrift-report', lazyLoadRoute('./routes/TriftReportRoutes.js'));
app.use('/api/standing-order', lazyLoadRoute('./routes/StandingOrderRoutes.js'));
app.use('/api/portfolio-report', lazyLoadRoute('./routes/LoanPortfolioRoutes.js'));
app.use('/api/group', lazyLoadRoute('./routes/GroupRoutes.js'));
app.use('/api/group-savings', lazyLoadRoute('./routes/GroupSavingsRoutes.js'));
app.use('/api/debug', lazyLoadRoute('./routes/uploadTest.js'));
app.use('/api/loan-account-summary', lazyLoadRoute('./routes/LoanAccountSummaryRoutes.js'));
app.use('/api/loan-repayment-transaction', lazyLoadRoute('./routes/loanRepaymentTransactionRoutes.js'));
app.use('/api/collections', lazyLoadRoute('./routes/CollectionRoutes.js'));
app.use('/api/accounts', lazyLoadRoute('./routes/AccountRoutes.js'));
app.use('/api/chart-of-accounts', lazyLoadRoute('./routes/chartofAccountRoutes.js'));
app.use('/api/account-statements', lazyLoadRoute('./routes/accountStatementRoutes.js'));
app.use('/api/vault-config', lazyLoadRoute('./routes/vaultConfigRoutes.js'));
app.use('/api/vault', lazyLoadRoute('./routes/VaultRoutes.js'));
app.use('/api/test', lazyLoadRoute('./routes/testRoutes.js'));
app.use('/api/vault/transactions', lazyLoadRoute('./routes/VaultTransactions.js'));
app.use('/api/calculator', lazyLoadRoute('./routes/loanCalculatorRoutes.js'));
app.use('/api/portfolio', lazyLoadRoute('./routes/PorfolioRoutes.js'));
app.use('/api/index-rates', lazyLoadRoute('./routes/RateIndexRoutes.js'));
app.use("/api/customer-transactions", lazyLoadRoute('./routes/customerTransactionRoutes.js'));
app.use("/api/Loan-disbursement-report", lazyLoadRoute('./routes/DisbursementReportRoutes.js'));
app.use('/api/penalties', lazyLoadRoute('./routes/LoanpenaltyRoutes.js'));
app.use('/api/organizations', lazyLoadRoute('./routes/OrganizationRoutes.js'));
app.use('/api/overdue-loans', lazyLoadRoute('./routes/OverdueLoansRoutes.js'));
// ✅ NOTIFICATION ROUTES - REMOVED LAZY LOAD (now using direct import above)
// app.use('/api/notifications', lazyLoadRoute('./routes/NotificationServiceRoutes.js'));
app.use('/api/guarantor-audits', lazyLoadRoute('./routes/GuarantorAuditRoutes.js'));
app.use('/api/next-of-kins', lazyLoadRoute('./routes/NextOfKinRoutes.js'));
app.use('/api/configuration', lazyLoadRoute('./routes/ConfigurationRoutes.js'));
app.use('/api/account-applications', lazyLoadRoute('./routes/AccountApplicationRoutes.js'));
app.use('/api/encyption-post-transactions', lazyLoadRoute('./routes/EncryptionRoutes.js'));
app.use('/api/bulk/individual', BulkLoanRoutes);
app.use('/api/debit-cards', DebitCardRoutes);
app.use('/api/bin-cards', binCardCounterRoutes);
app.use('/api/config', CardSettlementConfigRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/modules', ModuleRoutes);
app.use('/api/pending-gl-transactions', pendingGLTransactionRoutes);
app.use('/api/outward', outwardTransferRoutes);
app.use('/api/emt', EMTLRoutes);
app.use('/api/journal-entries', JournalEntryRoutes);
app.use('/api/collateral', CollateralRoutes)

// ============================================
// DEBUG MIDDLEWARE FOR BULK UPLOADS (optional)
// ============================================
app.use('/api/bulk/group-loans', (req, res, next) => {
  console.log('\n=== BULK UPLOAD REQUEST DEBUG ===');
  console.log('Method:', req.method);
  console.log('URL:', req.url);
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Content-Length:', req.headers['content-length']);
  console.log('================================\n');
  next();
});

// ============================================
// SERVE REACT ADMIN UI (built from admin-ui)
// ============================================
const adminBuildPath = path.join(__dirname, 'public/admin');
if (fs.existsSync(adminBuildPath)) {
  app.use('/admin', express.static(adminBuildPath));
  app.get('/admin/*', (req, res) => {
    res.sendFile(path.join(adminBuildPath, 'index.html'));
  });
  console.log('✅ Admin UI will be available at /admin');
} else {
  console.warn('⚠️ Admin UI not built. Run "npm run build" in admin-ui folder.');
}

// ============================================
// HEALTH & UTILITY ENDPOINTS
// ============================================

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Evolution Banking System API',
    uptime: process.uptime()
  });
});

app.get('/api/health', async (req, res) => {
  let dbStatus = 'UNHEALTHY';
  let dbDetails = 'Disconnected';
  try {
    const { sequelize } = await import('../config/db.js');
    await sequelize.authenticate();
    dbStatus = 'HEALTHY';
    dbDetails = 'Connected';
  } catch (err) {
    dbDetails = err.message;
  }
  res.status(dbStatus === 'HEALTHY' ? 200 : 503).json({
    status: dbStatus,
    timestamp: new Date().toISOString(),
    service: 'Evolution Banking System API',
    version: '2.0.0',
    dbStatus: dbDetails,
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

app.get('/server-time', (req, res) => res.json({
  iso: new Date().toISOString(),
  local: new Date().toLocaleString(),
  timestamp: Date.now(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
}));

// ============================================
// API ROOT ENDPOINTS
// ============================================
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Evolution Banking System API',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
    documentation: '/api-docs',
    health: '/health',
    serverTime: '/server-time',
    corsInfo: '/cors-info',
    limits: {
      maxFileSize: '500MB',
      uploadTimeout: '30 minutes',
      bodyParserLimit: '500MB'
    },
    bulkUpload: {
      template: 'GET /api/bulk/group-loans/template',
      upload: 'POST /api/bulk/group-loans/disburse',
      testUpload: 'POST /api/bulk/group-loans/test-upload',
      maxFileSize: '500MB',
      timeout: '30 minutes',
      supportedFormats: ['.xlsx', '.xls', '.csv']
    },
    queue: {
      enabled: queueEnabled,
      endpoints: queueEnabled ? ['POST /api/queued/customer-search'] : []
    }
  });
});

app.get('/api-docs', (req, res) => {
  res.json({
    name: 'Evolution Banking System API',
    version: '1.0.0',
    description: 'Complete banking system API',
    baseUrl: '/api',
    limits: {
      maxFileSize: '500MB',
      uploadTimeout: '30 minutes',
      bodyParserLimit: '500MB'
    },
    bulkUpload: {
      description: 'Bulk upload endpoints for processing group loan disbursements',
      endpoints: {
        downloadTemplate: 'GET /api/bulk/group-loans/template',
        uploadAndProcess: 'POST /api/bulk/group-loans/disburse',
        testUpload: 'POST /api/bulk/group-loans/test-upload',
        maxFileSize: '500MB',
        timeout: '30 minutes',
        maxRecords: '20000'
      }
    }
  });
});

app.get('/cors-info', (req, res) => res.json({
  allowedOrigins: corsOptions.origin,
  currentOrigin: req.headers.origin || 'No origin',
  allowedMethods: corsOptions.methods,
  allowedHeaders: corsOptions.allowedHeaders
}));

app.options('/cors-test', (req, res) => res.status(200).end());
app.post('/cors-test', (req, res) => res.json({
  message: 'CORS test successful',
  origin: req.headers.origin,
  timestamp: new Date().toISOString()
}));

// ============================================
// ERROR HANDLING (must be last)
// ============================================

app.use((err, req, res, next) => {
  if (err.message && err.message.includes('Malformed part header')) {
    return res.status(400).send('Bad Request');
  }
  next(err);
});

app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      error: 'CORS Policy Failed',
      allowedOrigins: corsOptions.origin,
      currentOrigin: req.headers.origin,
      timestamp: new Date().toISOString()
    });
  }
  next(err);
});

app.use('*', (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

app.use(errorHandler);

// ============================================
// PRODUCTION STATIC BUILD HANDLING
// ============================================
if (process.env.NODE_ENV === 'production') {
  const staticPath = path.join(__dirname, 'build');
  if (fs.existsSync(staticPath)) {
    app.use(express.static(staticPath));
    app.get('*', (req, res) => {
      if (req.originalUrl.startsWith('/api')) {
        return res.status(404).json({
          success: false,
          message: `API route not found: ${req.originalUrl}`,
          timestamp: new Date().toISOString()
        });
      }
      res.sendFile(path.join(staticPath, 'index.html'));
    });
  }
}

export default app;