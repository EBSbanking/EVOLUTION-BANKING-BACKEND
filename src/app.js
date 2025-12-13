// app.js
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
import mongoose from 'mongoose';
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
  RATE_LIMIT_MAX_REQUESTS: process.env.RATE_LIMIT_MAX_REQUESTS,
  MONGODB_URI: process.env.MONGODB_URI ? 'Set' : 'Missing'
});

const app = express();

// Mongoose Config
mongoose.set('bufferTimeoutMS', 30000);
mongoose.set('bufferCommands', false);

// Security & Middleware
app.use(helmet());
app.use(hpp());
app.use(monitor());

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
app.use(limiter);

// Enhanced CORS Configuration
const allowedOrigins = [
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

// Additional CORS handling
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

// Body Parsers
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb', parameterLimit: 100000 }));

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

// Request Logging
app.use((req, res, next) => {
  const start = Date.now();
  const { method, url, headers, ip } = req;
  logger.info('Incoming request', { method, url, ip, origin: headers.origin });
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', { method, url, ip, status: res.statusCode, duration: `${duration}ms` });
  });
  next();
});

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
  console.warn('⚠️ Cloudinary not configured');
}

// Health Endpoints
app.get('/server-time', (req, res) => res.json({
  iso: new Date().toISOString(),
  local: new Date().toLocaleString(),
  timestamp: Date.now(),
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
}));

app.get('/health', async (req, res) => {
  const dbStatus = mongoose.connection.readyState;
  res.status(dbStatus === 1 ? 200 : 503).json({
    status: dbStatus === 1 ? 'HEALTHY' : 'UNHEALTHY',
    timestamp: new Date().toISOString(),
    service: 'Banking System API',
    version: '1.0.0',
     endpoints: {
      systemDate: '/api/system/date',
      os: '/api/os',
      vaults: '/api/vaults',
      vaultTransactions: '/api/vault/transactions',
      drawers: '/api/drawers'
    },
    dbStatus,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    environment: process.env.NODE_ENV || 'development',
    cors: { allowedOrigins: allowedOrigins.length, currentOrigin: req.headers.origin || 'none' }
  });
});

// CORS Debug
app.get('/cors-info', (req, res) => res.json({ allowedOrigins, currentOrigin: req.headers.origin || 'No origin' }));
app.options('/cors-test', (req, res) => res.status(200).end());
app.post('/cors-test', (req, res) => res.json({ message: 'CORS test successful', origin: req.headers.origin }));

// CORS Error Handler
app.use((err, req, res, next) => {
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS Policy Failed', allowedOrigins });
  }
  next(err);
});

// API Route Imports
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
import groupSavingsRoutes from './routes/groupSavingsRoutes.js';
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

// Mount API Routes
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


// Static Files (Production)
if (process.env.NODE_ENV === 'production') {
  const staticPath = path.join(__dirname, 'build');
  app.use(express.static(staticPath));
  app.get('*', (req, res) => res.sendFile(path.join(staticPath, 'index.html')));
}

// General Error Handler
app.use((err, req, res, next) => {
  logger.error('Server error', { error: err.message, stack: err.stack, url: req.originalUrl });
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Initialization Function
async function initializeApplication() {
  console.log('🚀 Initializing application...');
  try {
    await permissionSync.syncPermissionsWithValidation();
    console.log('✅ Application initialization complete');
  } catch (error) {
    console.error('❌ Application initialization failed:', error);
    try {
      console.log('🔄 Running quick permission check...');
      await permissionSync.quickPermissionCheck();
    } catch (checkError) {
      console.error('❌ Quick check also failed:', checkError.message);
    }
  }
}

// Start Server Function
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('✅ MongoDB connected successfully');

    await initializeApplication();

    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
    });

    process.on('SIGTERM', () => {
      console.log('SIGTERM received, closing gracefully');
      mongoose.connection.close(() => {
        server.close(() => process.exit(0));
      });
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Global Error Handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});

// Start Everything
// startServer();

export default app;