// app.js - EXPRESS APP ONLY (NO SERVER STARTUP) - WITH LAZY LOADING & FIXED BODY PARSING
// ============================================
// PIDUSAGE ERROR SUPPRESSION - MUST BE AT VERY TOP
// ============================================

process.env.PIDUSAGE_NO_WMIC = '1';
process.env.PIDUSAGE_DISABLE = '1';

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
import Redis from 'ioredis';   // ✅ Redis client for traffic monitoring

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



// ✅ Import AdminUser from the correct path (root -> src/models)
import AdminUser from '../src/models/AdminUser.js';

// Initialize app
const app = express();
app.set('trust proxy', 1);

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
    'http://localhost:3002',
    'http://127.0.0.1:3000',
    'http://localhost:3001' ,  // ✅ If you run admin-ui on 3001, include it
    'http://localhost:4000'

  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-api-key', 
    'app-id', 
    'x-webhook-signature', 
    'x-nip-signature', 
    'x-encryption-metadata', 
    'range',
    'cache-control',   // ✅ ADD THIS
     'pragma',
     'expires'  
  ],
  exposedHeaders: ['Content-Range', 'X-Total-Count'],
};

console.log('🛡️ CORS Allowed Origins:', corsOptions.origin);
app.use(cors(corsOptions));

// Additional CORS headers
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && corsOptions.origin.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', corsOptions.methods.join(', '));
  res.header('Access-Control-Allow-Headers', corsOptions.allowedHeaders.join(', '));
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// ============================================
// MULTER ROUTES (MUST BE BEFORE BODY PARSERS)
// ============================================
app.use('/api/identification-information', IdentificationInformation);
console.log('✅ Identification upload route mounted (before body parsers)');

// ============================================
// BODY PARSERS (global)
// ============================================
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: true, limit: '500mb' }));

// ============================================
// REDIS TRAFFIC MONITORING (shared across PM2 workers)
// ============================================

// ✅ Handle misconfigured REDIS_HOST (like 'disabled')
const redisHost = (process.env.REDIS_HOST && process.env.REDIS_HOST !== 'disabled') 
  ? process.env.REDIS_HOST 
  : 'localhost';

const redis = new Redis({
  host: redisHost,
  port: process.env.REDIS_PORT || 6379,
  maxRetriesPerRequest: 3,
});

// ✅ Suppress connection errors to avoid log spam
redis.on('error', (err) => {
  if (!redis._errorLogged) {
    console.warn('⚠️ Redis connection error (traffic monitoring will fallback gracefully):', err.message);
    redis._errorLogged = true;
  }
});

// Make redis available to other modules (e.g., AdminRoutes)
app.set('redisClient', redis);

// Non-blocking traffic counter middleware using Redis
app.use((req, res, next) => {
  if (!req.path.startsWith('/api') || 
      req.path === '/api/health' || 
      req.path === '/api/admin/traffic' ||
      req.path === '/api/traffic') {
    return next();
  }

  const pathParts = req.path.split('/').filter(Boolean);
  let baseRoute = '/api';
  if (pathParts.length >= 2) baseRoute = `/${pathParts[0]}/${pathParts[1]}`;
  else if (pathParts.length === 1) baseRoute = `/${pathParts[0]}`;
  const key = `traffic:${baseRoute}`;

  // Fire-and-forget – no await, no blocking
  redis.incr(key).catch(() => {});
  redis.expire(key, 60).catch(() => {});

  next();
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
// CONDITIONAL FILE UPLOAD – SKIP FOR JSON AND BULK MULTIPART
// ============================================
app.use((req, res, next) => {
  const isBulkRoute = req.url.includes('/bulk/group-loans') || req.url.includes('/bulk/individual');
  const isMultipart = req.headers['content-type']?.includes('multipart/form-data');
  const isJson = req.headers['content-type']?.includes('application/json');
  
  // Skip fileUpload for JSON requests OR bulk multipart routes
  if (isJson || (isBulkRoute && isMultipart)) {
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

// ✅ Login route – placed after admin‑login and fileUpload
app.use('/api/login', loginRoutes);
console.log('✅ Login routes loaded directly');

// ============================================
// ORGANIZATION ROUTES
// ============================================
app.use('/api/organization', organizationRoutes);
console.log('✅ Organization routes loaded directly');

// ============================================
// MANUAL TRANSACTION ROUTES
// ============================================
console.log('\n🔧 ========================================');
console.log('🔧 SETTING UP MANUAL TRANSACTION ROUTES');
console.log('🔧 ==========================================\n');

import decryptPayload from './middleware/decryptPayload.js';
import transactionController from './Services/postTransaction.js';

if (transactionController && typeof transactionController.postTransaction === 'function') {
  console.log('✅ Transaction controller loaded successfully');
  const transactionRouter = express.Router();
  
  // ========== TRANSACTION POST ROUTES ==========
  transactionRouter.post('/transactions', decryptPayload, async (req, res) => {
    try {
      console.log('📥 Manual transaction: POST /transactions');
      await transactionController.postTransaction(req, res);
    } catch (error) {
      console.error('❌ Transaction error:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, message: 'Transaction processing failed', error: error.message });
      }
    }
  });
  
  transactionRouter.post('/transfer', decryptPayload, async (req, res) => {
    try {
      console.log('📥 Manual transaction: POST /transfer');
      await transactionController.postTransaction(req, res);
    } catch (error) {
      console.error('❌ Transaction error:', error);
      if (!res.headersSent) res.status(500).json({ error: error.message });
    }
  });
  
  transactionRouter.post('/payment', decryptPayload, async (req, res) => {
    try {
      console.log('📥 Manual transaction: POST /payment');
      await transactionController.postTransaction(req, res);
    } catch (error) {
      console.error('❌ Transaction error:', error);
      if (!res.headersSent) res.status(500).json({ error: error.message });
    }
  });
  
  // ========== TRANSACTION GET ROUTES ==========
  transactionRouter.get('/transactions/account/:accountNo/balance', async (req, res) => {
    try { 
      await transactionController.getAccountBalance(req, res); 
    } catch (error) { 
      res.status(500).json({ error: error.message }); 
    }
  });
  
  transactionRouter.get('/transactions/account/:accountNo', async (req, res) => {
    try { 
      await transactionController.getTransactionsByAccount(req, res); 
    } catch (error) { 
      res.status(500).json({ error: error.message }); 
    }
  });
  
  transactionRouter.get('/transactions/history', async (req, res) => {
    try { 
      await transactionController.getTransactionHistory(req, res); 
    } catch (error) { 
      res.status(500).json({ error: error.message }); 
    }
  });
  
  transactionRouter.get('/transactions/debug/accounts', async (req, res) => {
    try { 
      await transactionController.debugAccounts(req, res); 
    } catch (error) { 
      res.status(500).json({ error: error.message }); 
    }
  });
  
  // ============================================================
  // ✅ NEW: TELLER DAILY TRANSACTIONS ROUTES
  // ============================================================
  
  /**
   * Get daily transactions for a specific teller (path param)
   * GET /api/post-transactions/transactions/teller/daily/:userId?date=2026-07-11
   */
  transactionRouter.get('/transactions/teller/daily/:userId', async (req, res) => {
    try {
      console.log(`📊 Fetching daily transactions for teller: ${req.params.userId}`);
      await transactionController.getTellerDailyTransactions(req, res);
    } catch (error) {
      console.error('❌ Error in teller daily transactions route:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          message: 'Failed to fetch teller daily transactions',
          error: error.message 
        });
      }
    }
  });
  
  /**
   * Get daily transactions for a specific teller (query param)
   * GET /api/post-transactions/transactions/teller/daily?userId=PCO02&date=2026-07-11
   */
  transactionRouter.get('/transactions/teller/daily', async (req, res) => {
    try {
      console.log(`📊 Fetching daily transactions for teller: ${req.query.userId}`);
      await transactionController.getTellerDailyTransactions(req, res);
    } catch (error) {
      console.error('❌ Error in teller daily transactions route:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          message: 'Failed to fetch teller daily transactions',
          error: error.message 
        });
      }
    }
  });
  
  /**
   * Get teller transaction summary (for dashboard)
   * GET /api/post-transactions/transactions/teller/summary?userId=PCO02
   */
  transactionRouter.get('/transactions/teller/summary', async (req, res) => {
    try {
      console.log(`📊 Fetching transaction summary for teller: ${req.query.userId}`);
      await transactionController.getTellerTransactionSummary(req, res);
    } catch (error) {
      console.error('❌ Error in teller transaction summary route:', error);
      if (!res.headersSent) {
        res.status(500).json({ 
          success: false, 
          message: 'Failed to fetch teller transaction summary',
          error: error.message 
        });
      }
    }
  });
  
  // ============================================================
  // ✅ MOUNT THE ROUTER
  // ============================================================
  app.use('/api/post-transactions', transactionRouter);
  
  console.log('✅ Manual transaction routes registered successfully!');
  console.log('   - POST   /api/post-transactions/transactions');
  console.log('   - POST   /api/post-transactions/transfer');
  console.log('   - POST   /api/post-transactions/payment');
  console.log('   - GET    /api/post-transactions/transactions/account/:accountNo/balance');
  console.log('   - GET    /api/post-transactions/transactions/account/:accountNo');
  console.log('   - GET    /api/post-transactions/transactions/history');
  console.log('   - GET    /api/post-transactions/transactions/debug/accounts');
  console.log('   ✅ TELLER ROUTES:');
  console.log('   - GET    /api/post-transactions/transactions/teller/daily/:userId');
  console.log('   - GET    /api/post-transactions/transactions/teller/daily?userId=&date=');
  console.log('   - GET    /api/post-transactions/transactions/teller/summary?userId=');
  
} else {
  console.error('❌ CRITICAL: Transaction controller not available!');
}

// ============================================
// MANUAL BANK ROUTES
// ============================================
console.log('\n🔧 ========================================');
console.log('🔧 SETTING UP MANUAL BANK ROUTES');
console.log('🔧 ==========================================\n');

import BankRoutes from './routes/BankRoutes.js';
app.use('/api/banking', BankRoutes);
console.log('✅ Bank routes registered directly');

// ============================================
// ENHANCED LAZY LOAD ROUTES (with model initialisation)
// ============================================

const lazyLoadRoute = (routePath) => {
  return async (req, res, next) => {
    const skipRoutes = [
      // './routes/TransactionRoutes.js',   // ✅ REMOVED so it gets loaded
      
      './routes/QueueRoutes.js',
      './routes/OrganizationRoutes.js'
    ];
    if (skipRoutes.includes(routePath)) return next();
    
    try {
      const { initializeModels } = await import('./models/index.js');
      await initializeModels();   // Safe – runs only once
      
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

// Mount all lazy routes (list unchanged)
app.use('/api/inwardfunds', lazyLoadRoute('./routes/InwardFundsTransferRoutes.js'));
app.use('/api/webhook', lazyLoadRoute('./routes/WebhookRoutes.js'));
app.use('/api/nip/webhook', lazyLoadRoute('./routes/NipWebhookRoutes.js'));
app.use('/api/users', lazyLoadRoute('./routes/userRoutes.js'));
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
// app.use('/api/transaction', lazyLoadRoute('./routes/TransactionRoutes.js'));
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
app.use('/api/drawer', lazyLoadRoute('./routes/DrawerRoutes.js'));
app.use('/api/drawer-currency-denomination', lazyLoadRoute('./routes/DrawerCurrencyDenominationRoutes.js'));
app.use('/api/drawer-reassignments', lazyLoadRoute('./routes/DrawerReassignmentRoutes.js'));
app.use('/api/drawer-user-role', lazyLoadRoute('./routes/DrawerUserRoleRoutes.js'));
app.use('/api/direct-debits', lazyLoadRoute('./routes/DirectDebitRoutes.js'));
app.use('/api/direct-debit-requests', lazyLoadRoute('./routes/DirectDebitRequestRoute.js'));
app.use('/api/direct-debit-schedulers', lazyLoadRoute('./routes/DirectDebitSchedulerRoutes.js'));
app.use('/api/notification', lazyLoadRoute('./routes/NotificationServiceRoutes.js'));
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
app.use('/api/notifications', lazyLoadRoute('./routes/NotificationServiceRoutes.js'));
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
app.use('/api/transaction', TransactionRoutes);
app.use('/api/modules', ModuleRoutes);
app.use('/api/pending-gl-transactions', pendingGLTransactionRoutes);

// ============================================
// OUTWARD TRANSFER ROUTES (direct import)
// ============================================ 
app.use('/api/outward', outwardTransferRoutes);
// ============================================

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

// Simple health check for frontend (no /api prefix)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'Evolution Banking System API',
    uptime: process.uptime()
  });
});

// Detailed health check (with /api prefix, includes DB status)
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

// Server time utility
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

// ✅ NEW: Handle Malformed part header errors from busboy (e.g., vulnerability scanners)
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