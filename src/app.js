import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import cors from 'cors';
import helmet from 'helmet';
import hpp from 'hpp';
import expressSession from 'express-session';
import fileUpload from 'express-fileupload';
import { v2 as cloudinaryV2 } from 'cloudinary';
import monitor from 'express-status-monitor';
import rateLimit from 'express-rate-limit';
import logger from './utils/logger.js';
import permissionSync from './utils/permissionSync.js';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// Log environment variables for debugging
logger.info('Environment variables loaded', {
  CLIENT_URL: process.env.CLIENT_URL,
  CLIENT_URL_LOCAL: process.env.CLIENT_URL_LOCAL,
  CLIENT_URL_NETWORK: process.env.CLIENT_URL_NETWORK,
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  RATE_LIMIT_WINDOW_MS: process.env.RATE_LIMIT_WINDOW_MS,
  RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS
});

const app = express();

// Security & Middleware
app.use(helmet());
app.use(hpp());
app.use(monitor());

// Rate Limiting (bypass for development or login endpoint)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  message: 'Too many requests from this IP, please try again later.',
  skip: (req) => {
    const isDev = process.env.NODE_ENV === 'development';
    const isLogin = req.path === '/api/users/users/login';
    logger.info('Rate limit check', { path: req.path, isDev, isLogin, skip: isDev || isLogin });
    return isDev || isLogin;
  }
});

app.use(limiter);

// Enhanced CORS Configuration (consolidated - no duplicate)
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_LOCAL,
  process.env.CLIENT_URL_NETWORK
].filter(Boolean);

logger.info('CORS allowed origins loaded:', { allowedOrigins });

app.use(cors({
  origin: (origin, callback) => {
    logger.info('CORS origin check', { origin, allowedOrigins });
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, origin || true);
    } else {
      logger.warn('CORS blocked', { origin, allowedOrigins });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'X-Requested-With', 
    'Accept', 
    'Origin',
    'x-request-id'
  ]
}));

// Body Parsers with increased limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '50mb',
  parameterLimit: 100000
}));

// File Upload Configuration - Use memory storage
app.use(fileUpload({
  useTempFiles: false, // Store files in memory as buffers
  limits: { 
    fileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 50 * 1024 * 1024 // 50MB
  },
  abortOnLimit: true,
  createParentPath: true,
  safeFileNames: true,
  preserveExtension: true
}));

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

// Request Logging
app.use((req, res, next) => {
  const start = Date.now();
  const { method, url, headers, ip } = req;

  logger.info('Incoming request', {
    method,
    url,
    ip,
    origin: headers.origin,
    userAgent: headers['user-agent'],
    authorization: headers.authorization ? 'Bearer <hidden>' : 'No Authorization'
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method,
      url,
      ip,
      status: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length') || '0',
      userAgent: headers['user-agent'],
      responseHeaders: {
        'Access-Control-Allow-Origin': res.get('Access-Control-Allow-Origin'),
        'Access-Control-Allow-Methods': res.get('Access-Control-Allow-Methods'),
        'Access-Control-Allow-Headers': res.get('Access-Control-Allow-Headers')
      }
    });
  });

  next();
});

// Cloudinary Config with fallback
const cloudinaryConfig = {
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
};

// Check if Cloudinary is properly configured
const isCloudinaryConfigured = cloudinaryConfig.cloud_name && 
                              cloudinaryConfig.api_key && 
                              cloudinaryConfig.api_secret;

if (isCloudinaryConfigured) {
  cloudinaryV2.config(cloudinaryConfig);
  console.log('✅ Cloudinary configured successfully');
} else {
  console.warn('⚠️ Cloudinary not configured - file uploads will be disabled');
  console.warn('💡 Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET environment variables');
}

// Alternative: If using CLOUDINARY_URL
if (process.env.CLOUDINARY_URL) {
  // Validate CLOUDINARY_URL format
  if (process.env.CLOUDINARY_URL.startsWith('cloudinary://')) {
    cloudinaryV2.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET
    });
    console.log('✅ Cloudinary configured via CLOUDINARY_URL');
  } else {
    console.error('❌ Invalid CLOUDINARY_URL format. Should start with "cloudinary://"');
  }
} else {
  console.warn('⚠️ CLOUDINARY_URL not set - file uploads disabled');
}

// Health & Utility Endpoints
app.get('/server-time', (req, res) => {
  res.json({
    iso: new Date().toISOString(),
    local: new Date().toLocaleString(),
    timestamp: Date.now(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
});

app.get('/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  res.json({
    status: dbStatus === 1 ? 'HEALTHY' : 'UNHEALTHY',
    dbStatus,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// ----------------------------
// API Route Imports
// ----------------------------
import amlRoutes from './routes/amlRoutes.js';
import AMLThresholdRoutes from './routes/AMLThresholdRoutes.js';
import userRoutes from './routes/userRoutes.js';
import LoginRoutes from './routes/LoginRoutes.js';
import AuditTrailRoutes from './routes/AuditTrailRoutes.js';
import AutoReclassifyRoutes from './routes/AutoReclassifyRoutes.js';
import AnalyticsRoutes from './routes/AnalyticsRoute.js';
import businessRoleRoutes from './routes/businessRoleRoutes.js';
import BusinessUnitRoutes from './routes/BusinessUnitRoutes.js';
import CashWithdrawalTransactionRoutes from './routes/CashWithdrawalTransactionRoutes.js';
import CountryRoutes from './routes/CountryRoutes.js';
import CreditApplicationRoutes from './routes/CreditApplicationRoutes.js';
import CustWorkflowRoutingRoutes from './routes/CustWorkflowRoutingRoutes.js';
import CustomerAccountRoutes from './routes/CustomerAccountRoutes.js';
import CustomerRoutes from './routes/CustomerRoutes.js'; // ✅ This includes batch upload
import CustomerTypeRoutes from './routes/CustomerTypeRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import DepositAccountApplicationRoutes from './routes/DepositAccountApplicationRoutes.js';
import DepositAccountHistoryRoutes from './routes/DepositAccountHistoryRoutes.js';
import DepositAccountInterestOptionRoutes from './routes/DepositAccountInterestOptionRoutes.js';
import DepositAccountInterestRoutes from './routes/DepositAccountInterestRoute.js';
import DepositAccountInterest_TierRoutes from './routes/DepositAccountInterest_TierRoutes.js';
import DepositAccountMonthlyStatRoute from './routes/DepositAccountMonthlyStatRoute.js';
import DepositAccountSummaryRoutes from './routes/DepositAccountSummaryRoutes.js';
import DepositRoutes from './routes/DepositRoutes.js';
import DepositSearchRoutes from './routes/DepositSearchRoutes.js';
import DepositTransactionRoutes from './routes/DepositTransactionRoutes.js';
import Deposit_Account_INTEREST$AUDRoutes from './routes/Deposit_Account_INTEREST$AUDRoutes.js';
import DirectDebitRequestRoutes from './routes/DirectDebitRequestRoute.js';
import DirectDebitRoutes from './routes/DirectDebitRoutes.js';
import DirectDebitSchedulerRoutes from './routes/DirectDebitSchedulerRoutes.js';
import DrawerCurrencyDenominationRoutes from './routes/DrawerCurrencyDenominationRoutes.js';
import DrawerRoutes from './routes/DrawerRoutes.js';
import DrawerUserRoleRoutes from './routes/DrawerUserRoleRoutes.js';
import drawerReassignmentRoutes from './routes/DrawerReassignmentRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import getRepaymentSchedule from './routes/repaymentScheduleRoutes.js';
import GLAccountRoutes from './routes/GLAccountRoutes.js';
import GLAccountTransactionRoutes from './routes/GLAccountTransactionRoutes.js';
import GuarantorRoutes from './routes/GuarantorRoutes.js';
import holidayRoutes from './routes/holidayRoutes.js';
import IdentificationInformationRoutes from './routes/IdentificationInformationRoutes.js';
import InterestCalculationServiceRoutes from './routes/InterestCalculationServiceRoutes.js';
import ledgerRoutes from './routes/LedgerRoutes.js';
import LicenseRoutes from './routes/LicenseRoutes.js';
import LoanAccountDetailsRoutes from './routes/LoanAccountDetailsRoutes.js';
import LoanAccountRoutes from './routes/LoanAccountRoutes.js';
import LoanContractFormRoutes from './routes/LoanContractFormRoutes.js';
import LoanFeeRoutes from './routes/LoanFeeRoutes.js';
import LoanProductRoutes from './routes/LoanProductRoutes.js';
import LoanRepaymentRoutes from './routes/LoanRepaymentRoute.js';
import NotificationServiceRoutes from './routes/NotificationServiceRoutes.js';
import OsRoutes from './routes/OsRoutes.js';
import OverdueLoanRoutes from './routes/OverdueLoansRoutes.js';
import PermissionRoutes from './routes/PermissionRoutes.js';
import productTypeMappingRoutes from './routes/productTypeMappingRoutes.js';
import RelationshipofficerRoutes from './routes/RelationshipOfficerRoutes.js';
import SMSRoutes from './routes/SMSRoutes.js';
import SubfolderRoutes from './routes/SubfolderRoutes.js';
import systemDateRoutes from './routes/systemDateRoutes.js';
import TermDepositRoutes from './routes/TermDepositRoutes.js';
import TransactionPolicyRoutes from './routes/TransactionPolicyRoutes.js';
import transactionRoutes from './routes/transactionsRoutes.js';
import uploadFileRoutes from './routes/uploadFileRoutes.js';
import uploadGuarantorDocumentsRoutes from './routes/uploadGuarantorDocumentsRoutes.js';
import UserRoleRoutes from './routes/UserRoleRoutes.js';
import WF_BUSINESS_PROCESS from './routes/WF_BUSINESS_PROCESSRoutes.js';
import WF_BusinessRoleQueue from './routes/WF_BusinessRoleQueueRoutes.js';
import WF_QUEUERoutes from './routes/WF_QUEUERoutes.js';
import WF_SUB_PROCESS from './routes/WF_SUB_PROCESSRoutes.js';
import WF_SubProcessPolicy from './routes/WF_SubProcessPolicyRoutes.js';
import WF_WORK_ITEMRoutes from './routes/WF_WORK_ITEMRoutes.js';
import withdrawalRoutes from './routes/withdrawalRoutes.js';
import systemRoutes from './routes/system.js';
import configRoutes from './routes/config.js';
import InwardFundsTransferWebhook from './routes/InwardFundsTransferWebhook.js';
import reportRoutes from './routes/reportRoutes.js';
import accountStatementRoutes from './routes/accountStatementRoutes.js';
import incomeExpenseRoutes from './routes/incomeExpenseRoutes.js';
import SavingsProductsRoutes from './routes/SavingsProductsRoutes.js';
import ChargeRoutes from './routes/ChargeRoutes.js';
import identifierRoutes from './routes/identifierRoutes.js';
import glCategoriesRoutes from './routes/glCategoriesRoutes.js';
import BranchRoutes from './routes/BranchRoutes.js';
import OrganizationRoutes from './routes/OrganizationRoutes.js';
import bankingRoutes from './routes/bankingRoutes.js';
import tellerStatsRoutes from './routes/tellerStatsRoutes.js';
import ThriftRoutes from './routes/ThriftRoutes.js';
import creditOfficerRoutes from './routes/creditOfficerRoutes.js';
import TriftReportRoutes from './routes/TriftReportRoutes.js';
import CleanupDB from './routes/CleanupDB.js';
import StandingOrderRoutes from './routes/StandingOrderRoutes.js';
import LoanPortfolioRoutes from './routes/LoanPortfolioRoutes.js';
import GroupRoutes from './routes/GroupRoutes.js';
import groupSavingsRoutes from './routes/groupSavingsRoutes.js';
import uploadTestRoutes from './routes/uploadTest.js';

// ----------------------------
// Mount API Routes
// ----------------------------
app.use('/api/users', userRoutes);
app.use('/api/login', LoginRoutes);
app.use('/api/user-role', UserRoleRoutes);
app.use('/api/permissions', PermissionRoutes);

app.use('/api/aml', amlRoutes);
app.use('/api/aml-threshold', AMLThresholdRoutes);

app.use('/api/customer', CustomerRoutes); // ✅ This now includes batch upload routes
app.use('/api/customers-account', CustomerAccountRoutes);
app.use('/api/customer-types', CustomerTypeRoutes);
app.use('/api/identifications', IdentificationInformationRoutes);
app.use('/api/guarantors', GuarantorRoutes);
app.use('/api/upload-guarantors', uploadGuarantorDocumentsRoutes);

app.use('/api/deposit', DepositRoutes);
app.use('/api/deposit-transaction', DepositTransactionRoutes);
app.use('/api/deposit-summary', DepositAccountSummaryRoutes);
app.use('/api/deposit-account-application', DepositAccountApplicationRoutes);
app.use('/api/deposit-account-history', DepositAccountHistoryRoutes);
app.use('/api/deposit-account-interest', DepositAccountInterestRoutes);
app.use('/api/deposit-account-interest-audit', Deposit_Account_INTEREST$AUDRoutes);
app.use('/api/deposit-account-interest-option', DepositAccountInterestOptionRoutes);
app.use('/api/deposit-account-interest-tier', DepositAccountInterest_TierRoutes);
app.use('/api/deposit-account-monthly-stat', DepositAccountMonthlyStatRoute);
app.use('/api/deposit-search', DepositSearchRoutes);
app.use('/api/term-deposit', TermDepositRoutes);
app.use('/api/transaction', transactionRoutes);
app.use('/api/cash-withdrawals', CashWithdrawalTransactionRoutes);
app.use('/api/withdrawals', withdrawalRoutes);

app.use('/api/loans', LoanAccountRoutes);
app.use('/api/loan-accounts-details', LoanAccountDetailsRoutes);
app.use('/api/loan-contract-form', LoanContractFormRoutes);
app.use('/api/loan-fees', LoanFeeRoutes);
app.use('/api/loan-product', LoanProductRoutes);
app.use('/api/loan-repayments', LoanRepaymentRoutes);
app.use('/api/overdue', OverdueLoanRoutes);
app.use('/api/repayment-schedule', getRepaymentSchedule);
app.use('/api/credit-applications', CreditApplicationRoutes);

app.use('/api/system-date', systemDateRoutes);
app.use('/api/holiday', holidayRoutes);
app.use('/api/business-units', BusinessUnitRoutes);
app.use('/api/business-roles', businessRoleRoutes);
app.use('/api/license', LicenseRoutes);
app.use('/api/countries', CountryRoutes);
app.use('/api/os', OsRoutes);
app.use('/api/products', SavingsProductsRoutes);
app.use('/api/product-mapping', productTypeMappingRoutes);

app.use('/api/workflow', WF_BUSINESS_PROCESS);
app.use('/api/workflow-queue', WF_QUEUERoutes);
app.use('/api/work-items', WF_WORK_ITEMRoutes);
app.use('/api/sub-process', WF_SUB_PROCESS);
app.use('/api/sub-process-policy', WF_SubProcessPolicy);
app.use('/api/business-role-queue', WF_BusinessRoleQueue);
app.use('/api/customer-workflow-routing', CustWorkflowRoutingRoutes);

app.use('/api/gl-accounts', GLAccountRoutes);
app.use('/api/gl-transactions', GLAccountTransactionRoutes);
app.use('/api/ledgers', ledgerRoutes);
app.use('/api/interest-rates', InterestCalculationServiceRoutes);

app.use('/api/drawer', DrawerRoutes);
app.use('/api/drawer-currency-denomination', DrawerCurrencyDenominationRoutes);
app.use('/api/drawer-reassignments', drawerReassignmentRoutes);
app.use('/api/drawer-user-role', DrawerUserRoleRoutes);

app.use('/api/direct-debits', DirectDebitRoutes);
app.use('/api/direct-debit-requests', DirectDebitRequestRoutes);
app.use('/api/direct-debit-schedulers', DirectDebitSchedulerRoutes);

app.use('/api/notification', NotificationServiceRoutes);
app.use('/api/sms', SMSRoutes);

app.use('/api/analytics', AnalyticsRoutes);
app.use('/api/audit-trails', AuditTrailRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.use('/api/upload', uploadFileRoutes);
app.use('/api/subfolders', SubfolderRoutes);

app.use('/api/event', eventRoutes);
app.use('/api/reclassify', AutoReclassifyRoutes);
app.use('/api/officers', RelationshipofficerRoutes);
app.use('/api/policy', TransactionPolicyRoutes);

app.use('/api/system', systemRoutes);
app.use('/api/config', configRoutes);

app.use('/api/inwardfunds', InwardFundsTransferWebhook);

app.use('/api/reports', reportRoutes);
app.use('/api/account-report', accountStatementRoutes);
app.use('/api/reports/income-expense', incomeExpenseRoutes);

app.use('/api/savings-product', SavingsProductsRoutes);
app.use('/api/charges', ChargeRoutes);
app.use('/api/identifiers', identifierRoutes);
app.use('/api/gl-categories', glCategoriesRoutes);
app.use('/api/branchs', BranchRoutes);
app.use('/api/organization', OrganizationRoutes);

app.use('/api/banking', bankingRoutes);
app.use('/api/teller', tellerStatsRoutes);
app.use('/api/thrift-banking', ThriftRoutes);

app.use('/api/users/credit-officer', creditOfficerRoutes);
app.use('/api/thrift-report', TriftReportRoutes);

app.use('/api/cleandb', CleanupDB);

app.use('/api/standing-order', StandingOrderRoutes);

app.use('/api/portfolio-report', LoanPortfolioRoutes);

app.use('/api/group', GroupRoutes);

// Group Savings Routes
app.use('/api/group-savings', groupSavingsRoutes);
app.use('/api/debug', uploadTestRoutes);

// ----------------------------
// Static Files & React Build (Production Only)
// ----------------------------
if (process.env.NODE_ENV === 'production') {
  const staticPath = path.join(__dirname, 'build');
  app.use(express.static(staticPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(staticPath, 'index.html'));
  });
}

// ----------------------------
// Error Handling
// ----------------------------
app.use((err, req, res, next) => {
  logger.error('Server error', {
    error: err.message,
    stack: err.stack,
    url: req.originalUrl
  });

  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

export default app;