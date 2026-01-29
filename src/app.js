// app.js - EXPRESS APP ONLY (NO SERVER STARTUP)
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
      scriptSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));
app.use(hpp());
app.use(monitor());

// Enhanced CORS Configuration
const allowedOrigins = [
  process.env.REACT_APP_FRONTEND_URL,
  process.env.CLIENT_URL,
  process.env.CLIENT_URL_LOCAL,
  process.env.CLIENT_URL_NETWORK,
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
].filter(Boolean);

console.log('🛡️ CORS Allowed Origins:', allowedOrigins);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    console.log('🚫 CORS Blocked:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'x-request-id', 'x-auth-token']
}));

// Additional CORS headers
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, x-request-id, x-auth-token');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// Rate Limiting
const limiter = rateLimit({
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
app.use('/api', limiter);

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb', parameterLimit: 100000 }));
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
    maxAge: 86400000, // 24 hours
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
// HEALTH & UTILITY ENDPOINTS
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
    cors: { allowedOrigins: allowedOrigins.length, currentOrigin: req.headers.origin || 'none' }
  });
});

app.get('/server-time', (req, res) => res.json({
  iso: new Date().toISOString(),
  local: new Date().toLocaleString(),
  timestamp: Date.now(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
}));

// ============================================
// API ROOT ENDPOINTS - ADDED
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
    endpoints: {
      // Customer Management
      customer: '/api/customer',
      nextOfKin: '/api/next-of-kins',
      customerTypes: '/api/customer-types',
      
      // User Management
      users: '/api/users',
      login: '/api/login',
      userRoles: '/api/user-role',
      permissions: '/api/permissions',
      
      // Account Management
      accounts: '/api/accounts',
      deposits: '/api/deposit',
      loans: '/api/loans',
      transactions: '/api/transaction',
      
      // Workflow
      workflow: '/api/workflow',
      workItems: '/api/work-items',
      
      // AML & Compliance
      aml: '/api/aml',
      amlThreshold: '/api/aml-threshold',
      
      // System
      system: '/api/system',
      configuration: '/api/configuration',
      license: '/api/license',
      
      // Reports
      reports: '/api/reports',
      analytics: '/api/analytics',
      dashboard: '/api/dashboard',
      
      // Test & Debug
      test: '/api/test',
      debug: '/api/debug',
      health: '/health'
    }
  });
});

// API version endpoint
app.get('/api/v1', (req, res) => {
  res.json({
    success: true,
    message: 'API v1',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    documentation: 'Visit /api for full endpoint list'
  });
});

// API Documentation
app.get('/api-docs', (req, res) => {
  res.json({
    name: 'Evolution Banking System API',
    version: '1.0.0',
    description: 'Complete banking system API with customer management, transactions, loans, deposits, and workflow automation',
    baseUrl: '/api',
    endpoints: {
      // New MySQL/Sequelize endpoints
      penalty: '/api/penalties',
      organization: '/api/organizations',
      overdue_loans: '/api/overdue-loans',
      notifications: '/api/notifications',
      guarantor_audits: '/api/guarantor-audits',
      insurance_policies: '/api/insurance-policies',
      interest_accruals: '/api/interest-accruals',
      // Legacy endpoints (from your existing system)
      users: '/api/users',
      customers: '/api/customer',
      deposits: '/api/deposit',
      loans: '/api/loans',
      workflow: '/api/workflow',
      gl_accounts: '/api/gl-accounts',
      vault: '/api/vault',
      nextOfKin: '/api/next-of-kins',
      configuration: '/api/configuration'
    }
  });
});

// CORS Debug endpoints
app.get('/cors-info', (req, res) => res.json({ 
  allowedOrigins, 
  currentOrigin: req.headers.origin || 'No origin',
  allowedMethods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
  allowedHeaders: 'Content-Type, Authorization, X-Requested-With, Accept, Origin, x-request-id, x-auth-token'
}));
app.options('/cors-test', (req, res) => res.status(200).end());
app.post('/cors-test', (req, res) => res.json({ 
  message: 'CORS test successful', 
  origin: req.headers.origin,
  timestamp: new Date().toISOString()
}));

// ============================================
// IMPORT ALL EXISTING ROUTES
// ============================================

// Import your existing routes (unchanged)
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
import CustomerRoutes from './routes/CustomerRoutes.js';
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
import BankRoutes from './routes/BankRoutes.js';
import tellerStatsRoutes from './routes/tellerStatsRoutes.js';
import ThriftRoutes from './routes/ThriftRoutes.js';
import creditOfficerRoutes from './routes/creditOfficerRoutes.js';
import TriftReportRoutes from './routes/TriftReportRoutes.js';
import CleanupDB from './routes/CleanupDB.js';
import StandingOrderRoutes from './routes/StandingOrderRoutes.js';
import LoanPortfolioRoutes from './routes/LoanPortfolioRoutes.js';
import GroupRoutes from './routes/GroupRoutes.js';
import groupSavingsRoutes from './routes/GroupSavingsRoutes.js';
import uploadTestRoutes from './routes/uploadTest.js';
import LoanAccountSummaryRoutes from './routes/LoanAccountSummaryRoutes.js';
import loanRepaymentTransactionRoutes from './routes/loanRepaymentTransactionRoutes.js';
import CollectionRoutes from './routes/CollectionRoutes.js';
import AccountRoutes from './routes/AccountRoutes.js';
import chartofAccountRoutes from './routes/chartofAccountRoutes.js';
import AccountStatementRoutes from './routes/accountStatementRoutes.js';
import VaultRoutes from './routes/VaultRoutes.js';
import vaultConfigRoutes from './routes/vaultConfigRoutes.js';
import testRoutes from './routes/testRoutes.js';
import vaultTransactionRoutes from './routes/VaultTransactions.js';
import loanCalculatorRoutes from './routes/loanCalculatorRoutes.js';
import PortfolioRoutes from './routes/PorfolioRoutes.js';
import RateIndexRoutes from './routes/RateIndexRoutes.js';
import customerTransactionRoutes from './routes/customerTransactionRoutes.js';
import DisbursementReportRoutes from './routes/DisbursementReportRoutes.js';
import ConfigurationRoutes from './routes/ConfigurationRoutes.js';

// Import new MySQL/Sequelize routes
import penaltyRoutes from './routes/LoanpenaltyRoutes.js';
import organizationRoutes from './routes/OrganizationRoutes.js';
import overdueLoanRoutes from './routes/OverdueLoansRoutes.js';
import notificationRoutes from './routes/NotificationServiceRoutes.js';
import guarantorAuditRoutes from './routes/guarantorAuditRoutes.js';
import NextOfKinRoutes from './routes/NextOfKinRoutes.js';
import AccountApplicationRoutes from './routes/AccountApplicationRoutes.js';
import TransactionRoutes from './routes/TransactionRoutes.js';
import EncrytionRoutes from './routes/EncryptionRoutes.js';

// ============================================
// MOUNT ALL ROUTES
// ============================================

// Mount your existing routes (unchanged)
app.use('/api/users', userRoutes);
app.use('/api/login', LoginRoutes);
app.use('/api/user-role', UserRoleRoutes);
app.use('/api/permissions', PermissionRoutes);

app.use('/api/aml', amlRoutes);
app.use('/api/aml-threshold', AMLThresholdRoutes);

app.use('/api/customer', CustomerRoutes);
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
app.use('/api/branches', BranchRoutes);
app.use('/api/organization', OrganizationRoutes);

app.use('/api/banking', BankRoutes);
app.use('/api/teller', tellerStatsRoutes);
app.use('/api/thrift-banking', ThriftRoutes);

app.use('/api/users/credit-officer', creditOfficerRoutes);
app.use('/api/thrift-report', TriftReportRoutes);

app.use('/api/cleandb', CleanupDB);

app.use('/api/standing-order', StandingOrderRoutes);

app.use('/api/portfolio-report', LoanPortfolioRoutes);

app.use('/api/group', GroupRoutes);

app.use('/api/group-savings', groupSavingsRoutes);
app.use('/api/debug', uploadTestRoutes);
app.use('/api/branch', BranchRoutes);

app.use('/api/loan-account-summary', LoanAccountSummaryRoutes);
app.use('/api/loan-repayment-transaction', loanRepaymentTransactionRoutes);
app.use('/api/collections', CollectionRoutes);
app.use('/api/accounts', AccountRoutes);
app.use('/api/chart-of-accounts', chartofAccountRoutes);
app.use('/api/account-statements', AccountStatementRoutes);

app.use('/api/vault-config', vaultConfigRoutes);
app.use('/api/vault', VaultRoutes);
app.use('/api/test', testRoutes);
app.use('/api/vault/transactions', vaultTransactionRoutes);
app.use('/api/calculator', loanCalculatorRoutes);
app.use('/api/portfolio', PortfolioRoutes);
app.use('/api/index-rates', RateIndexRoutes);

app.use("/api/customer-transactions", customerTransactionRoutes);
app.use("/api/Loan-disbursement-report", DisbursementReportRoutes);

// Mount new MySQL/Sequelize routes
app.use('/api/penalties', penaltyRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/overdue-loans', overdueLoanRoutes);
app.use('/api/notifications', NotificationServiceRoutes);
app.use('/api/guarantor-audits', guarantorAuditRoutes);
app.use('/api/next-of-kins', NextOfKinRoutes);
app.use('/api/configuration', ConfigurationRoutes);
app.use('/api/account-applications', AccountApplicationRoutes);
app.use('/api/post-transactions', TransactionRoutes);

//EncytionRoutes//
app.use('/api/encyption-post-transactions', EncrytionRoutes);

// ============================================
// ERROR HANDLING
// ============================================

// CORS Error Handler
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ 
      error: 'CORS Policy Failed', 
      allowedOrigins,
      currentOrigin: req.headers.origin,
      timestamp: new Date().toISOString()
    });
  }
  next(err);
});

// 404 handler - Enhanced to provide more information
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.originalUrl}`,
    method: req.method,
    timestamp: new Date().toISOString(),
    suggestions: [
      'Check the API documentation at /api-docs',
      'Verify the endpoint URL',
      'Ensure the HTTP method is correct',
      'Check if you have proper permissions'
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
    // Don't show React app for API routes
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

// Export the Express app (NO SERVER STARTUP HERE)
export default app;