import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import cors from 'cors';
import mongoose from 'mongoose';
import logger from './utils/logger.js';
import helmet from 'helmet';
import hpp from 'hpp';
import expressSession from 'express-session';
import fileUpload from 'express-fileupload';
import { v2 as cloudinaryV2 } from 'cloudinary';
import monitor from 'express-status-monitor';

// Fix for __dirname in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import all route files
import amlRoutes from './routes/amlRoutes.js'
import AMLThresholdRoutes from './routes/AMLThresholdRoutes.js'
import userRoutes from './routes/userRoutes.js';
import LoginRoutes from './routes/LoginRoutes.js';
import AuditTrailRoutes from './routes/AuditTrailRoutes.js';
import AutoReclassifyRoutes from './routes/AutoReclassifyRoutes.js';
import AnalyticsRoutes from './routes/AnalyticsRoute.js';
import BusinessRoleRoutes from './routes/BusinessRoleRoutes.js';
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
import DrawerCloseOutRoutes from './routes/DrawerCloseOutRoutes.js';
import DrawerCurrencyDenominationRoutes from './routes/DrawerCurrencyDenominationRoutes.js';
import DrawerCurrencyRoutes from './routes/DrawerCurrencyRoutes.js';
import DrawerRoutes from './routes/DrawerRoutes.js';
import DrawerUserRoleRoutes from './routes/DrawerUserRoleRoutes.js';
import drawerReassignmentRoutes from './routes/DrawerReassignmentRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import getRepaymentSchedule from './routes/repaymentScheduleRoutes.js';
import GLAccountRoutes from './routes/GLAccountRoutes.js';
import GLAccountTransactionSingleRoutes from './routes/GLAccountTransactionSingleRoutes.js';
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
import productsRoutes from './routes/productsRoutes.js';
import RelationshipofficerRoutes from './routes/RelationshipOfficerRoutes.js';
import SMSRoutes from './routes/SMSRoutes.js';
import SubfolderRoutes from './routes/SubfolderRoutes.js';
import systemDateRoutes from './routes/systemDateRoutes.js';
import TermDepositRoutes from './routes/TermDepositRoutes.js';
import TransactionPolicyRoutes from './routes/TransactionPolicyRoutes.js';
import TransactionRoutes from './routes/TransactionRoutes.js';
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


const app = express();

// ======================
// Environment Configuration
// ======================
dotenv.config();

// ======================
// Middleware Configuration
// ======================
app.use(helmet());
app.use(hpp());
app.use(monitor());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(fileUpload({ 
  useTempFiles: true,
  tempFileDir: '/tmp/',
  limits: { fileSize: 10 * 1024 * 1024 },
  abortOnLimit: true
}));

app.use(expressSession({
  secret: process.env.SESSION_SECRET || 'dev_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,            // Not using HTTPS in development
    httpOnly: true,
    maxAge: 86400000,         // 1 day
    sameSite: 'lax'           // Relaxed for local development (change to 'strict' in prod)
  }
}));


// Request logging middleware
const requestLogger = (req, res, next) => {
  const start = Date.now();
  const { method, url, ip, headers } = req;

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request', {
      method,
      url,
      ip,
      status: res.statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length') || '0',
      userAgent: headers['user-agent']
    });
  });
  next();
};

app.use(requestLogger);

// Cloudinary configuration
cloudinaryV2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// ======================
// Health & Utility Endpoints
// ======================
app.get('/server-time', (req, res) => {
  res.json({
    iso: new Date().toISOString(),
    local: new Date().toLocaleString(),
    timestamp: Date.now(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
  });
});

app.get('/health', async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState;
    res.json({
      status: dbStatus === 1 ? 'HEALTHY' : 'UNHEALTHY',
      dbStatus,
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      environment: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(503).json({
      status: 'UNHEALTHY',
      error: error.message
    });
  }
});

// ======================
// API Routes (Grouped by Functionality)
// ======================

// 1. Authentication & User Management
app.use('/api/users', userRoutes);
app.use('/api/login', LoginRoutes);
app.use('/api/user-role', UserRoleRoutes);
app.use('/api/permissions', PermissionRoutes);

//1.1 AML 
app.use('/api/aml', amlRoutes);
app.use('/api/aml-threshold', AMLThresholdRoutes );

// 2. Customer Management
app.use('/api/customer', CustomerRoutes);
app.use('/api/customers-account', CustomerAccountRoutes);
app.use('/api/customer-types', CustomerTypeRoutes);
app.use('/api/identifications', IdentificationInformationRoutes);
app.use('/api/guarantors', GuarantorRoutes);
app.use('/api/upload-guarantors', uploadGuarantorDocumentsRoutes);

// 3. Account & Transaction Management
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
app.use('/api/transaction', TransactionRoutes);
app.use('/api/cash-withdrawals', CashWithdrawalTransactionRoutes);
app.use('/api/withdrawals', withdrawalRoutes);

// 4. Loan Management
app.use('/api/loans', LoanAccountRoutes);
app.use('/api/loan-accounts-details', LoanAccountDetailsRoutes);
app.use('/api/loan-contract-form', LoanContractFormRoutes);
app.use('/api/loan-fees', LoanFeeRoutes);
app.use('/api/loan-product', LoanProductRoutes);
app.use('/api/loan-repayments', LoanRepaymentRoutes);
app.use('/api/overdue', OverdueLoanRoutes);
app.use('/api/repayment-schedule', getRepaymentSchedule);
app.use('/api/credit-applications', CreditApplicationRoutes);

// 5. Operational & System Management
app.use('/api/system-date', systemDateRoutes);
app.use('/api/holiday', holidayRoutes);
app.use('/api/business-units', BusinessUnitRoutes);
app.use('/api/business-roles', BusinessRoleRoutes);
app.use('/api/license', LicenseRoutes);
app.use('/api/countries', CountryRoutes);
app.use('/api/os', OsRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/product-mapping', productTypeMappingRoutes);

// 6. Workflow & Business Process
app.use('/api/workflow', WF_BUSINESS_PROCESS);
app.use('/api/workflow-queue', WF_QUEUERoutes);
app.use('/api/work-items', WF_WORK_ITEMRoutes);
app.use('/api/sub-process', WF_SUB_PROCESS);
app.use('/api/sub-process-policy', WF_SubProcessPolicy);
app.use('/api/business-role-queue', WF_BusinessRoleQueue);
app.use('/api/customer-workflow-routing', CustWorkflowRoutingRoutes);

// 7. Financial Management
app.use('/api/gl-accounts', GLAccountRoutes);
app.use('/api/gl-account-transactions', GLAccountTransactionSingleRoutes);
app.use('/api/ledgers', ledgerRoutes);
app.use('/api/interest-rates', InterestCalculationServiceRoutes);

// 8. Drawer & Cash Management
app.use('/api/drawer', DrawerRoutes);
app.use('/api/drawer-currency', DrawerCurrencyRoutes);
app.use('/api/drawer-currency-denomination', DrawerCurrencyDenominationRoutes);
app.use('/api/drawer-close-out', DrawerCloseOutRoutes);
app.use('/api/drawer-reassignments', drawerReassignmentRoutes);
app.use('/api/drawer-user-role', DrawerUserRoleRoutes);

// 9. Direct Debit & Payment Processing
app.use('/api/direct-debits', DirectDebitRoutes);
app.use('/api/direct-debit-requests', DirectDebitRequestRoutes);
app.use('/api/direct-debit-schedulers', DirectDebitSchedulerRoutes);

// 10. Notification & Communication
app.use('/api/notification', NotificationServiceRoutes);
app.use('/api/sms', SMSRoutes);

// 11. Analytics & Reporting
app.use('/api/analytics', AnalyticsRoutes);
app.use('/api/audit-trails', AuditTrailRoutes);
app.use('/api/dashboard', dashboardRoutes);

// 12. File & Document Management
app.use('/api/upload', uploadFileRoutes);
app.use('/api/subfolders', SubfolderRoutes);

// 13. Miscellaneous Services
app.use('/api/event', eventRoutes);
app.use('/api/reclassify', AutoReclassifyRoutes);
app.use('/api/officers', RelationshipofficerRoutes);
app.use('/api/policy', TransactionPolicyRoutes);



// 14. Sytem Initializer
app.use('/api/system', systemRoutes);
app.use('/api/config', configRoutes);


// ======================
// Static Files & React Routing
// ======================
const staticPath = path.join(__dirname, 'build');
app.use(express.static(staticPath));

// Catch-all for React routing (must be after all other routes)
app.get('*', (req, res) => {
  res.sendFile(path.join(staticPath, 'index.html'));
});

// ======================
// Error Handling
// ======================
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