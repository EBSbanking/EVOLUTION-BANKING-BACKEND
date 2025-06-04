import express from 'express';
import session from 'express-session';
import mongoose from 'mongoose';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import fileUpload from 'express-fileupload';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import morgan from 'morgan';
import cloudinary from 'cloudinary';
import { v2 as cloudinaryV2 } from 'cloudinary';
import { format } from 'date-fns';
import multer from 'multer';
import { ObjectId } from 'mongodb';

import AnalyticsRoutes from './routes/AnalyticsRoute.js';
import CountryRoutes from './routes/CountryRoutes.js';
import userRoutes from './routes/userRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import depositRoutes from './routes/DepositRoutes.js';
import LoginRoutes from './routes/LoginRoutes.js';
import CustomerRoutes from './routes/CustomerRoutes.js';
import CustomerTypeRoutes from './routes/CustomerTypeRoutes.js';
import IdentificationInformationRoutes from './routes/IdentificationInformationRoutes.js';
import uploadFileRoutes from './routes/uploadFileRoutes.js'; 
import CreditApplicationRoutes from './routes/CreditApplicationRoutes.js';
import LoanAccountRoutes from './routes/LoanAccountRoutes.js';
import LoanRepaymentRoutes from './routes/LoanRepaymentRoute.js';
import GLAccountTransactionRoutes from './routes/GLAccountRoutes.js';
import errorHandler from './middlewares/errorHandler.js';
import CashWithdrawalTransactionRoutes from './routes/CashWithdrawalTransactionRoutes.js';
import GLAccountRoutes from './routes/GLAccountRoutes.js';
import DrawerRoutes from './routes/DrawerRoutes.js';
import DepositAccountSummaryRoutes from './routes/DepositAccountSummaryRoutes.js';
import TransactionRoutes from './routes/TransactionRoutes.js';
import CustWorkflowRoutingRoutes from './routes/CustWorkflowRoutingRoutes.js';
import DrawerCurrencyDenominationRoutes from './routes/DrawerCurrencyDenominationRoutes.js';
import DrawerUserRoleRoutes from './routes/DrawerUserRoleRoutes.js'; 
import DrawerCloseOutRoutes from './routes/DrawerCloseOutRoutes.js'; 
import DrawerCurrencyRoutes from './routes/DrawerCurrencyRoutes.js';
import drawerReassignmentRoutes from './routes/DrawerReassignmentRoutes.js';
import DepositSearchRoutes from './routes/DepositSearchRoutes.js';
import DepositAccountHistoryRoutes from './routes/DepositAccountHistoryRoutes.js';
import DepositAccountInterestRoutes from './routes/DepositAccountInterestRoute.js';
import DepositAccountInterestOptionRoutes from './routes/DepositAccountInterestOptionRoutes.js';
import Deposit_Account_INTEREST$AUDRoutes from './routes/Deposit_Account_INTEREST$AUDRoutes.js';
import DepositAccountInterest_TierRoutes from './routes/DepositAccountInterest_TierRoutes.js';
import DepositAccountMonthlyStatRoute from './routes/DepositAccountMonthlyStatRoute.js';
import DepositTransactionRoutes from './routes/DepositTransactionRoutes.js';
import DirectDebitRoutes from './routes/DirectDebitRoutes.js';
import DirectDebitSchedulerRoutes from './routes/DirectDebitSchedulerRoutes.js';
import DirectDebitRequestRoutes from './routes/DirectDebitRequestRoute.js';
import BusinessRoleRoutes from './routes/BusinessRoleRoutes.js';
import BusinessUnitRoutes from './routes/BusinessUnitRoutes.js'
import UserRoleRoutes from './routes/UserRoleRoutes.js'; 
import PermissionRoutes from './routes/PermissionRoutes.js'; 
import connectDatabase from './src/db.js'; 
import RelationshipofficerRoutes from './routes/RelationshipOfficerRoutes.js';
import CustomerAccountRoutes from './routes/CustomerAccountRoutes.js';
import TermDepositRoutes from './routes/TermDepositRoutes.js';
import ledgerRoutes from './routes/LedgerRoutes.js';
import DepositRoutes from './routes/DepositRoutes.js';
import SubfolderRoutes from './routes/SubfolderRoutes.js';
import withdrawalRoutes from './routes/withdrawalRoutes.js';
import LoanInterestRate from './routes/LoanInterestRateRoutes.js';
import getRepaymentSchedule from './routes/repaymentScheduleRoutes.js';
import RateIndexRoutes from './routes/Rate-IndexRoutes.js';
import productsRoutes from './routes/productsRoutes.js';
import DepositAccountApplicationRoutes from './routes/DepositAccountApplicationRoutes.js';
import WF_BUSINESS_PROCESS from './routes/WF_BUSINESS_PROCESSRoutes.js';
import WF_SUB_PROCESS from './routes/WF_SUB_PROCESSRoutes.js';
import WF_BusinessRoleQueue from './routes/WF_BusinessRoleQueueRoutes.js';
import WF_SubProcessPolicy from './routes/WF_SubProcessPolicyRoutes.js';
import WFQueue from './routes/WF_QUEUERoutes.js';
import WF_WORK_ITEM from './routes/WF_WORK_ITEMRoutes.js';
import NotificationServiceRoutes from './routes/NotificationServiceRoutes.js';
import TransactionPolicy from './routes/TransactionPolicyRoutes.js';
import eventRoutes from './routes/eventRoutes.js';
import SMSRoutes from './routes/SMSRoutes.js';
import AuditTrailRoutes from './routes/AuditTrailRoutes.js';
import AutoReclassifyRoutes from './routes/AutoReclassifyRoutes.js';
import LoanContractFormRoutes from './routes/LoanContractFormRoutes.js';
import OverdueLoanRoutes from './routes/OverdueLoansRoutes.js'
import OsRoutes from './routes/OsRoutes.js'
import GLAccountTransactionSingleRoutes from './routes/GLAccountTransactionSingleRoutes.js'


// import cronJobs from './cronJobs/cronJobs.js'; // Just importing the file, no need for default export or named import
import './cronJobs/cronJobs.js';


// Load environment variables
dotenv.config();


// Start the cron jobs
// cronJobs();  // This will start the cron job automatically when the server starts

// Connect to the database
connectDatabase().then(() => {
    // Your server logic here
});

// Logger setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({ filename: 'logs/app.log' }),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' })
  ]
});

// Validate environment variables
const requiredEnvVars = ['MONGODB_URI', 'SESSION_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'];
requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    logger.error(`Missing required environment variable: ${varName}`);
    process.exit(1);
  }
});

// Configure Cloudinary
cloudinaryV2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Check if Cloudinary is connected (place this after setting up Cloudinary)
cloudinaryV2.api.resources()
  .then(result => {
    console.log('Cloudinary Connection Successful:', result);
  })
  .catch(error => {
    console.error('Cloudinary Connection Failed:', error);
  });

// MongoDB connection with retry logic
const connectToDatabase = async () => {
  try {
    const options = { useNewUrlParser: true, useUnifiedTopology: true };
    await mongoose.connect(process.env.MONGODB_URI, options);
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    setTimeout(connectToDatabase, 5000);
  }
};
connectToDatabase();

// Create express app
const app = express();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../uploads')); // Temporary directory
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB file size limit
  },
});

// CORS Configuration
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://another-domain.com',
  'http://192.168.137.79:3000',
];
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, origin || '*');
    } else {
      logger.warn(`Blocked CORS request from origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
}));

// Security headers
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: "Too many requests, please try again later."
});
app.use(limiter);

// Add request logging
app.use(morgan('combined'));

// Middlewares
// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: '/tmp/', // Specify a temporary directory
  limits: { fileSize: 10 * 1024 * 1024 },
  abortOnLimit: true,
  responseOnLimit: 'File size limit exceeded.'
}));
app.use(express.static(path.join(process.cwd(), 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 24
  },
}));

// Routes
app.use('/api/analytics', AnalyticsRoutes);
app.use('/api/audit-trails', AuditTrailRoutes);
app.use('/api/reclassify', AutoReclassifyRoutes);
app.use('/api/business-units', BusinessUnitRoutes);
app.use('/users', userRoutes);
app.use('/users/dashboard', dashboardRoutes);
app.use('/api/', depositRoutes);
app.use('/login', LoginRoutes);
app.use('/api/countries', CountryRoutes);
app.use('/api/customer', CustomerRoutes);
app.use('/customer-types', CustomerTypeRoutes);
app.use('/api/identifications', IdentificationInformationRoutes);
app.use('/api/upload', uploadFileRoutes);
app.use('/api/credit-applications', CreditApplicationRoutes);
app.use('/api/loans', LoanAccountRoutes);
app.use('/api/loan-repayments', LoanRepaymentRoutes);
app.use('/api/gl-accounts', GLAccountTransactionRoutes);
app.use('/api/gl-account-transactions', GLAccountTransactionSingleRoutes);
app.use('/api/cash-withdrawals', CashWithdrawalTransactionRoutes);
app.use('/api/gl-accounts', GLAccountRoutes);
app.use('/api/drawer', DrawerRoutes);
app.use('/api/transaction', TransactionRoutes);
app.use('/api/deposit-summary', DepositAccountSummaryRoutes);
app.use('/api', CustWorkflowRoutingRoutes);
app.use('/api/drawerCurrency', DrawerCurrencyDenominationRoutes);
app.use('/api/drawerUserRole', DrawerUserRoleRoutes);
app.use('/api/drawerCloseOut', DrawerCloseOutRoutes);
app.use('/api/drawer-currency', DrawerCurrencyRoutes);
app.use('/api/drawer-reassignments', drawerReassignmentRoutes);
app.use('/api', DepositSearchRoutes);
app.use('/api/deposit-account-application', DepositAccountApplicationRoutes);
app.use('/api/deposit-account-history', DepositAccountHistoryRoutes);
app.use('/api/deposit-account-interest', DepositAccountInterestRoutes);
app.use('/api/deposit-account-interest-option', DepositAccountInterestOptionRoutes);
app.use('/api/deposit-account-interest-audit', Deposit_Account_INTEREST$AUDRoutes);
app.use('/api/deposit-account-interest-tier', DepositAccountInterest_TierRoutes);
app.use('/api/deposit-account-monthly-stat', DepositAccountMonthlyStatRoute);
app.use('/api/deposit-transaction', DepositTransactionRoutes);
app.use('/api', DirectDebitRoutes);
app.use('/api/direct-debit-schedulers', DirectDebitSchedulerRoutes);
app.use('/api/direct-debit-requests', DirectDebitRequestRoutes);
app.use('/api', BusinessRoleRoutes);
app.use('/api/user-role', UserRoleRoutes);
app.use('/api/Permissions', PermissionRoutes);
app.use('/api/officers', RelationshipofficerRoutes);
app.use('/api/customers-account', CustomerAccountRoutes);
app.use('/api/term-deposit', TermDepositRoutes);
app.use('/api/ledgers', ledgerRoutes);
app.use('/api/deposit', DepositRoutes);
app.use('/api/subfolders', SubfolderRoutes); 
app.use('/api/withdrawals', withdrawalRoutes); 
app.use('/api/interest-loan', LoanInterestRate);
app.use('/api', getRepaymentSchedule);
app.use('/api/rate-index', RateIndexRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/workflow', WF_BUSINESS_PROCESS);
app.use('/api/sub-process', WF_SUB_PROCESS);
app.use('/api/business-role-queue', WF_BusinessRoleQueue);
app.use('/api/sub-process-policy', WF_SubProcessPolicy);
app.use('/api/workflow-queue', WFQueue);
app.use('/api/work-items', WF_WORK_ITEM);
app.use('/api/notification', NotificationServiceRoutes);
app.use('/api/transaction-policies', TransactionPolicy);
app.use('/api/event', eventRoutes);
app.use('/api/sms', SMSRoutes);
app.use('/api/loan-contract-form', LoanContractFormRoutes);
app.use('/api/overdue', OverdueLoanRoutes);
app.use('/api/os', OsRoutes);




// Utility function for updating GL accounts
const updateGLAccounts = async () => {
  try {
    const result = await mongoose.connection.collection('glaccounts').updateMany(
      { GL_ACCT_ID: null },
      { $set: { GL_ACCT_ID: new ObjectId().toString() } } // Generate unique ObjectIds
    );

    logger.info(`${result.modifiedCount} GL account records updated.`);
  } catch (error) {
    logger.error('Error updating GL accounts:', error);
  }
};

// Call the utility function after the database connection is established
connectToDatabase().then(() => {
  updateGLAccounts(); // Update GL accounts once the database is connected
});



// Server time route with custom format
app.get('/server-time', (req, res) => {
  const currentDateTime = format(new Date(), 'yyyy-MM-dd HH:mm:ss'); // Format date and time
  res.status(200).json({ serverDateTime: currentDateTime });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Catch-all route for unmatched paths
app.use((req, res) => {
  res.status(404).json({ message: 'Resource not found' });
});

// Error handling middleware
app.use(errorHandler);

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await mongoose.connection.close();
  process.exit(0);
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  logger.info(`Server is running on port ${port}`);
});

export default app;
