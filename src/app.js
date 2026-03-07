// app.js - EXPRESS APP ONLY (NO SERVER STARTUP) - WITH LAZY LOADING
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

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config();

// Import middleware
import { errorHandler } from './middlewares/errorHandler.js';
import { notFound } from './middlewares/errors/NotFoundError.js';

import ThriftSettingsRoutes from './routes/ThriftSettingsRoutes.js';

// Initialize express app
const app = express();

// ============================================
// SECURITY & MIDDLEWARE CONFIGURATION
// ============================================

// Security middleware
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

// ============================================
// CORS CONFIGURATION
// ============================================
const corsOptions = {
  origin: [
    'https://evolutionbankingsolution-lexicalresource.com.ng',
    'http://evolutionbankingsolution-lexicalresource.com.ng',
    'http://localhost:3000',
    'http://localhost:3002',
    'http://127.0.0.1:3000'
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'app-id', 'x-webhook-signature', 'x-nip-signature']
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

// Rate Limiting
const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    const isDev = process.env.NODE_ENV === 'development';
    const isLogin = req.path === '/api/users/users/login';
    const isLicense = req.path === '/api/license/validate-file';
    return isDev || isLogin || isLicense;
  }
});

// Webhook rate limiter (higher limits)
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many webhook requests',
  skip: (req) => process.env.NODE_ENV === 'development'
});

// Apply rate limiting
app.use('/api', apiLimiter);
app.use('/api/inwardfunds', webhookLimiter);
app.use('/api/webhook', webhookLimiter);
app.use('/api/nip', webhookLimiter);

app.use ('/api/thriftsetup', ThriftSettingsRoutes);

// Body parsing middleware - IMPORTANT: Raw body needed for webhook signature verification
app.use(express.json({ 
  limit: '50mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString();
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb', 
  parameterLimit: 100000,
  verify: (req, res, buf) => {
    req.rawBody = req.rawBody || buf.toString();
  }
}));
app.use(cookieParser());

// Compression middleware
app.use(compression());

// Logging middleware
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// File Upload
app.use(fileUpload({
  useTempFiles: false,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 50 * 1024 * 1024 },
  abortOnLimit: true,
  createParentPath: true,
  safeFileNames: true,
  preserveExtension: true
}));

// Session
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

// Static files
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
// HEALTH & UTILITY ENDPOINTS (These work immediately)
// ============================================

// Health check endpoint
app.get('/health', async (req, res) => {
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
    version: '1.0.0',
    dbStatus: dbDetails,
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    cors: { allowedOrigins: corsOptions.origin.length, currentOrigin: req.headers.origin || 'none' },
    webhooks: {
      inwardFunds: '/api/inwardfunds/webhook',
      multiGateway: '/api/webhook',
      nip: '/api/nip'
    }
  });
});

app.get('/server-time', (req, res) => res.json({
  iso: new Date().toISOString(),
  local: new Date().toLocaleString(),
  timestamp: Date.now(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
}));

// ============================================
// LAZY LOAD ROUTES - THESE LOAD AFTER SERVER STARTS
// ============================================

// Helper function to lazy load routes
const lazyLoadRoute = (routePath) => {
  return async (req, res, next) => {
    try {
      console.log(`🔄 Lazy loading route: ${routePath}`);
      const module = await import(routePath);
      const handler = module.default;
      handler(req, res, next);
    } catch (error) {
      console.error(`❌ Failed to lazy load route ${routePath}:`, error.message);
      
      // Return a 503 Service Unavailable with helpful message
      res.status(503).json({
        success: false,
        message: 'Service not available',
        error: `Route ${req.path} could not be loaded`,
        details: error.message,
        timestamp: new Date().toISOString()
      });
    }
  };
};

// Mount webhook routes lazily
app.use('/api/inwardfunds', lazyLoadRoute('./routes/InwardFundsTransferRoutes.js'));
app.use('/api/webhook', lazyLoadRoute('./routes/WebhookRoutes.js'));
app.use('/api/nip/webhook', lazyLoadRoute('./routes/NipWebhookRoutes.js'));

// Mount all other routes lazily
app.use('/api/users', lazyLoadRoute('./routes/userRoutes.js'));
app.use('/api/login', lazyLoadRoute('./routes/LoginRoutes.js'));
app.use('/api/user-role', lazyLoadRoute('./routes/UserRoleRoutes.js'));
app.use('/api/permissions', lazyLoadRoute('./routes/PermissionRoutes.js'));

app.use('/api/aml', lazyLoadRoute('./routes/amlRoutes.js'));
app.use('/api/aml-threshold', lazyLoadRoute('./routes/AMLThresholdRoutes.js'));

app.use('/api/customer', lazyLoadRoute('./routes/CustomerRoutes.js'));
app.use('/api/customers-account', lazyLoadRoute('./routes/CustomerAccountRoutes.js'));
app.use('/api/customer-types', lazyLoadRoute('./routes/CustomerTypeRoutes.js'));
app.use('/api/identifications', lazyLoadRoute('./routes/IdentificationInformationRoutes.js'));
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
app.use('/api/transaction', lazyLoadRoute('./routes/transactionsRoutes.js'));
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
app.use('/api/organization', lazyLoadRoute('./routes/OrganizationRoutes.js'));

app.use('/api/banking', lazyLoadRoute('./routes/BankRoutes.js'));
app.use('/api/teller', lazyLoadRoute('./routes/tellerStatsRoutes.js'));
app.use('/api/thrift-banking', lazyLoadRoute('./routes/ThriftRoutes.js'));

app.use('/api/users/credit-officer', lazyLoadRoute('./routes/creditOfficerRoutes.js'));
app.use('/api/thrift-report', lazyLoadRoute('./routes/TriftReportRoutes.js'));

app.use('/api/cleandb', lazyLoadRoute('./routes/CleanupDB.js'));

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

// Mount new MySQL/Sequelize routes
app.use('/api/penalties', lazyLoadRoute('./routes/LoanpenaltyRoutes.js'));
app.use('/api/organizations', lazyLoadRoute('./routes/OrganizationRoutes.js'));
app.use('/api/overdue-loans', lazyLoadRoute('./routes/OverdueLoansRoutes.js'));
app.use('/api/notifications', lazyLoadRoute('./routes/NotificationServiceRoutes.js'));
app.use('/api/guarantor-audits', lazyLoadRoute('./routes/GuarantorAuditRoutes.js'));
app.use('/api/next-of-kins', lazyLoadRoute('./routes/NextOfKinRoutes.js'));
app.use('/api/configuration', lazyLoadRoute('./routes/ConfigurationRoutes.js'));
app.use('/api/account-applications', lazyLoadRoute('./routes/AccountApplicationRoutes.js'));
app.use('/api/post-transactions', lazyLoadRoute('./routes/TransactionRoutes.js'));

// Encryption routes
app.use('/api/encyption-post-transactions', lazyLoadRoute('./routes/EncryptionRoutes.js'));

// ============================================
// API ROOT ENDPOINTS (These work immediately)
// ============================================

// Root API endpoint
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'Evolution Banking System API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    documentation: '/api-docs',
    health: '/health',
    serverTime: '/server-time',
    corsInfo: '/cors-info',
    note: 'Routes are loaded lazily. First request to any endpoint may be slow as it loads the route.',
    webhooks: {
      inwardFunds: {
        webhook: 'POST /api/inwardfunds/webhook',
        health: 'GET /api/inwardfunds/webhook/health'
      },
      multiGateway: {
        webhook: 'POST /api/webhook',
        gatewaySpecific: 'POST /api/webhook/:gateway',
        gateways: 'GET /api/webhook/gateways',
        health: 'GET /api/webhook/health'
      },
      nip: {
        fundsTransfer: 'POST /api/nip/fundstransfer',
        nameEnquiry: 'POST /api/nip/nameenquiry',
        statusEnquiry: 'POST /api/nip/statusenquiry',
        reversal: 'POST /api/nip/reversal',
        health: 'GET /api/nip/health'
      }
    }
  });
});

// API Documentation
app.get('/api-docs', (req, res) => {
  res.json({
    name: 'Evolution Banking System API',
    version: '1.0.0',
    description: 'Complete banking system API with lazy-loaded routes',
    baseUrl: '/api',
    note: 'Routes are loaded on first request. Initial request may be slower.',
    webhooks: {
      inwardFunds: { endpoint: '/api/inwardfunds/webhook', methods: ['POST'] },
      multiGateway: { endpoint: '/api/webhook', supportedGateways: ['nip', 'stripe', 'paypal', 'json'] },
      nip: { endpoints: ['/api/nip/fundstransfer', '/api/nip/nameenquiry', '/api/nip/statusenquiry', '/api/nip/reversal'] }
    }
  });
});

// CORS Debug endpoints
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
// WEBHOOK TEST ENDPOINTS (Development only)
// ============================================

if (process.env.NODE_ENV !== 'production') {
  app.get('/test/webhooks', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Webhook Tester</title>
        <style>
          body { font-family: Arial; padding: 20px; background: #f5f5f5; }
          .container { max-width: 1200px; margin: 0 auto; }
          .header { background: #2c3e50; color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
          .note { background: #f39c12; color: white; padding: 10px; border-radius: 5px; margin-bottom: 20px; }
          .endpoint { background: white; padding: 20px; margin: 10px 0; border-radius: 10px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); }
          .method { display: inline-block; padding: 3px 8px; border-radius: 5px; font-weight: bold; }
          .method.post { background: #27ae60; color: white; }
          .method.get { background: #3498db; color: white; }
          .success { color: #27ae60; }
          .error { color: #e74c3c; }
          textarea { width: 100%; height: 200px; font-family: monospace; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
          button { background: #3498db; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px; }
          button:hover { background: #2980b9; }
          .result { background: #2c3e50; color: white; padding: 20px; border-radius: 10px; margin-top: 20px; overflow-x: auto; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔌 Webhook Tester</h1>
            <p>Test all webhook endpoints</p>
          </div>
          
          <div class="note">
            ⚠️ Routes are loaded lazily. First request to each endpoint may be slow as it loads the route.
          </div>
          
          <!-- Rest of the HTML remains the same -->
          <div class="grid">
            <div>
              <h2>Inward Funds Webhook</h2>
              <div class="endpoint">
                <h3><span class="method post">POST</span> Inward Funds</h3>
                <code>/api/inwardfunds/webhook</code>
              </div>
              <div class="endpoint">
                <h3><span class="method get">GET</span> Health Check</h3>
                <code>/api/inwardfunds/webhook/health</code>
              </div>
            </div>
            
            <div>
              <h2>Multi-Gateway Webhook</h2>
              <div class="endpoint">
                <h3><span class="method post">POST</span> Auto-Detect</h3>
                <code>/api/webhook</code>
              </div>
              <div class="endpoint">
                <h3><span class="method post">POST</span> Gateway Specific</h3>
                <code>/api/webhook/:gateway</code>
              </div>
              <div class="endpoint">
                <h3><span class="method get">GET</span> Supported Gateways</h3>
                <code>/api/webhook/gateways</code>
              </div>
              <div class="endpoint">
                <h3><span class="method get">GET</span> Health</h3>
                <code>/api/webhook/health</code>
              </div>
            </div>
            
            <div>
              <h2>NIP Webhooks</h2>
              <div class="endpoint">
                <h3><span class="method post">POST</span> Funds Transfer</h3>
                <code>/api/nip/fundstransfer</code>
              </div>
              <div class="endpoint">
                <h3><span class="method post">POST</span> Name Enquiry</h3>
                <code>/api/nip/nameenquiry</code>
              </div>
              <div class="endpoint">
                <h3><span class="method post">POST</span> Status Enquiry</h3>
                <code>/api/nip/statusenquiry</code>
              </div>
              <div class="endpoint">
                <h3><span class="method post">POST</span> Reversal</h3>
                <code>/api/nip/reversal</code>
              </div>
              <div class="endpoint">
                <h3><span class="method get">GET</span> Health</h3>
                <code>/api/nip/health</code>
              </div>
            </div>
          </div>
          
          <h2>Test Webhook</h2>
          <div class="endpoint">
            <form id="webhookForm">
              <label>Endpoint:</label>
              <select id="endpoint" style="width: 100%; padding: 10px; margin: 10px 0;">
                <option value="/api/inwardfunds/webhook">Inward Funds Webhook</option>
                <option value="/api/webhook">Multi-Gateway (Auto-Detect)</option>
                <option value="/api/webhook/nip">Multi-Gateway (NIP)</option>
                <option value="/api/webhook/stripe">Multi-Gateway (Stripe)</option>
                <option value="/api/nip/fundstransfer">NIP Funds Transfer</option>
                <option value="/api/nip/nameenquiry">NIP Name Enquiry</option>
              </select>
              
              <label>Payload (JSON):</label>
              <textarea id="payload">{
  "transfers": [
    {
      "XFER_REF": "TEST" + Date.now(),
      "XFER_AMT": 5000,
      "XFER_CRNCY_ID": 1,
      "BENEFICIARY_ACCT": "1234567890",
      "BENEFICIARY_NM": "John Doe",
      "REMITTER_NM": "Jane Smith",
      "VALUE_DT": "${new Date().toISOString().split('T')[0]}"
    }
  ]
}</textarea>
              
              <button type="submit">Send Webhook</button>
            </form>
            <div id="result" class="result"></div>
          </div>
        </div>
        
        <script>
          document.getElementById('webhookForm').onsubmit = async (e) => {
            e.preventDefault();
            const endpoint = document.getElementById('endpoint').value;
            const payload = document.getElementById('payload').value;
            
            try {
              const response = await fetch(endpoint, {
                method: 'POST',
                headers: { 
                  'Content-Type': 'application/json',
                  'x-webhook-signature': 'test-signature',
                  'x-webhook-timestamp': Date.now().toString()
                },
                body: payload
              });
              
              const data = await response.json();
              document.getElementById('result').innerHTML = 
                '<h3 class="success">✅ Success!</h3><pre>' + 
                JSON.stringify(data, null, 2) + '</pre>';
            } catch (error) {
              document.getElementById('result').innerHTML = 
                '<h3 class="error">❌ Error: ' + error.message + '</h3>';
            }
          };
        </script>
      </body>
      </html>
    `);
  });
}

// ============================================
// ERROR HANDLING
// ============================================

// CORS Error Handler
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

// 404 handler
app.use('*', (req, res) => {
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
    method: req.method,
    timestamp: new Date().toISOString(),
    suggestions: [
      'Check the API documentation at /api-docs',
      'Verify the endpoint URL',
      'Ensure the HTTP method is correct'
    ],
    availableEndpoints: {
      apiRoot: '/api',
      documentation: '/api-docs',
      health: '/health',
      serverTime: '/server-time'
    }
  });
});

// Global error handler
app.use(errorHandler);

// Static Files for Production (React build)
if (process.env.NODE_ENV === 'production') {
  const staticPath = path.join(__dirname, 'build');
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

// Export the Express app
export default app;