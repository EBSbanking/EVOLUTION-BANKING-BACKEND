// server.js - COMPLETE FIXED VERSION WITH ALL ROUTES AND CORRECTED PATHS
import app from './src/app.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import cors from 'cors';
// Import sequelize from db.js
import { getSequelize, checkDatabaseHealth } from './config/db.js';
import fs from 'fs/promises';
import configurationService from './src/Services/ConfigurationService.js';
import SavingsProduct from './src/models/SavingsProduct.js';
import { LoanInterestRate } from './src/models/LoanInterestRate.js';
import LoanAccount from './src/models/LoanAccount.js';
import LoanFee from './src/models/LoanFee.js';
import Approval from './src/models/Approval.js';
import express from 'express';
import BvnRoutes from './src/routes/BankRoutes.js';
import Transaction from './src/models/Transaction.js';

// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

// ============================================
// PORT CONFIGURATION
// ============================================
const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://evolutionbankingsolution-lexicalresource.com.ng';

// ============================================
// INITIALIZE SERVICES
// ============================================
await configurationService.initialize();

// ============================================
// GET SEQUELIZE INSTANCE
// ============================================
const sequelize = getSequelize();

// ============================================
// PROXY TRUST CONFIGURATION (FOR SSL/Nginx)
// ============================================
app.set('trust proxy', 1);

// ============================================
// CORS CONFIGURATION - UPDATED WITH HTTPS
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
  allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'app-id'],
  maxAge: 86400
};

console.log('\n🔌 CORS Configuration:', corsOptions.origin);

app.use(cors(corsOptions));

// Keep this line for preflight requests
app.options('*', cors(corsOptions));

// ============================================
// CORS DEBUG ENDPOINT
// ============================================
app.get('/cors-check', (req, res) => {
  res.json({
    message: 'CORS Debug Info',
    yourOrigin: req.headers.origin || 'No origin',
    allowedOrigins: corsOptions.origin,
    headers: req.headers,
    time: new Date().toISOString()
  });
});

// ============================================
// API ENDPOINTS FOR FRONTEND COMPATIBILITY
// ============================================

// Health endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'API is healthy',
    uptime: process.uptime()
  });
});

// Ping endpoint
app.get('/api/ping', (req, res) => {
  res.json({ success: true, message: 'pong', timestamp: new Date().toISOString() });
});

// Audit endpoint
app.post('/api/audit', (req, res) => {
  console.log('📝 Audit log received');
  if (req.body) {
    console.log('   Action:', req.body.action);
    console.log('   User:', req.body.userId);
  }
  res.json({ success: true, message: 'Audit logged' });
});

// Client errors endpoint
app.post('/api/errors/client', (req, res) => {
  console.error('🚨 Client error reported:');
  if (req.body) {
    console.error('   Error:', req.body.error || req.body.message);
    console.error('   URL:', req.body.url);
    console.error('   User:', req.body.userId);
  }
  res.json({ success: true, message: 'Error logged' });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'API is working',
    endpoints: ['GET /api/health', 'POST /api/audit', 'POST /api/errors/client', 'GET /api/ping']
  });
});

// Serve static images
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// Fallback for images (returns a transparent pixel)
app.get('/images/*', (req, res) => {
  // Return a 1x1 transparent pixel
  res.set('Content-Type', 'image/png');
  res.send(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));
});

// Bundle.js placeholder (fix 404)
app.get('/path/to/your/bundle.js', (req, res) => {
  res.type('application/javascript').send('console.log("Bundle placeholder loaded");');
});

// ============================================
// SERVE STATIC FILES
// ============================================
const publicDir = path.join(__dirname, 'public');
console.log(`📁 Public directory: ${publicDir}`);

// Create public directory if it doesn't exist
try {
  await fs.mkdir(publicDir, { recursive: true });

  // Create a simple login.html file if it doesn't exist
  const loginHtmlPath = path.join(publicDir, 'login.html');
  try {
    await fs.access(loginHtmlPath);
  } catch {
    console.log('📝 Creating default login.html...');
    const loginHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Evolution Banking - Login</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .container {
            background: white;
            border-radius: 20px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            padding: 40px;
            width: 100%;
            max-width: 400px;
        }
        .logo {
            text-align: center;
            margin-bottom: 30px;
        }
        .logo h1 {
            color: #333;
            font-size: 28px;
        }
        .logo span {
            color: #667eea;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: #555;
            font-weight: 500;
        }
        .form-group input {
            width: 100%;
            padding: 12px;
            border: 2px solid #e0e0e0;
            border-radius: 8px;
            font-size: 16px;
            transition: border-color 0.3s;
        }
        .form-group input:focus {
            outline: none;
            border-color: #667eea;
        }
        button {
            width: 100%;
            padding: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: transform 0.2s;
        }
        button:hover {
            transform: translateY(-2px);
        }
        .message {
            text-align: center;
            margin-top: 20px;
            color: #e74c3c;
            min-height: 24px;
        }
        .redirect-message {
            text-align: center;
            margin-top: 20px;
            color: #666;
        }
        .redirect-message a {
            color: #667eea;
            text-decoration: none;
            font-weight: 600;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo">
            <h1>Evolution <span>Banking</span></h1>
        </div>
        <form id="loginForm">
            <div class="form-group">
                <label for="username">Username</label>
                <input type="text" id="username" placeholder="Enter your username" required>
            </div>
            <div class="form-group">
                <label for="password">Password</label>
                <input type="password" id="password" placeholder="Enter your password" required>
            </div>
            <button type="submit">Login</button>
            <div class="message" id="message"></div>
        </form>
        <div class="redirect-message">
            <a href="/">Go to Homepage</a>
        </div>
    </div>

    <script>
        document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault();
            const message = document.getElementById('message');
            message.textContent = 'Logging in...';

            try {
                const response = await fetch('/api/login/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_name: document.getElementById('username').value,
                        password: document.getElementById('password').value
                    })
                });

                const data = await response.json();

                if (data.success && data.token) {
                    message.style.color = '#2ecc71';
                    message.textContent = 'Login successful! Redirecting...';
                    localStorage.setItem('authToken', data.token);
                    setTimeout(() => {
                        window.location.href = '/dashboard';
                    }, 2000);
                } else {
                    message.style.color = '#e74c3c';
                    message.textContent = data.message || 'Login failed';
                }
            } catch (error) {
                message.style.color = '#e74c3c';
                message.textContent = 'Connection error. Please try again.';
            }
        });
    </script>
</body>
</html>`;
    await fs.writeFile(loginHtmlPath, loginHtml);
    console.log('✅ Default login.html created');
  }

  // Create a simple home.html file
  const homeHtmlPath = path.join(publicDir, 'home.html');
  try {
    await fs.access(homeHtmlPath);
  } catch {
    console.log('📝 Creating default home.html...');
    const homeHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Evolution Banking - Home</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: #f5f5f5;
        }
        .navbar {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            color: white;
        }
        .navbar h1 {
            max-width: 1200px;
            margin: 0 auto;
        }
        .container {
            max-width: 1200px;
            margin: 40px auto;
            padding: 0 20px;
        }
        .card {
            background: white;
            border-radius: 10px;
            padding: 30px;
            margin-bottom: 30px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        h2 { margin-bottom: 20px; color: #333; }
        p { color: #666; line-height: 1.6; }
        .button {
            display: inline-block;
            padding: 12px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            text-decoration: none;
            border-radius: 5px;
            margin-top: 20px;
        }
        .footer {
            text-align: center;
            padding: 20px;
            color: #666;
        }
    </style>
</head>
<body>
    <div class="navbar">
        <h1>Evolution Banking</h1>
    </div>
    <div class="container">
        <div class="card">
            <h2>Welcome to Evolution Banking</h2>
            <p>Your trusted banking partner for all your financial needs.</p>
            <a href="/login" class="button">Go to Login</a>
        </div>
    </div>
    <div class="footer">
        <p>&copy; 2026 Evolution Banking. All rights reserved.</p>
    </div>
</body>
</html>`;
    await fs.writeFile(homeHtmlPath, homeHtml);
    console.log('✅ Default home.html created');
  }

  // Create dashboard.html file
  const dashboardHtmlPath = path.join(publicDir, 'dashboard.html');
  try {
    await fs.access(dashboardHtmlPath);
  } catch {
    console.log('📝 Creating default dashboard.html...');
    const dashboardHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Evolution Banking - Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; }
        .navbar { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 20px; color: white; }
        .container { max-width: 1200px; margin: 40px auto; padding: 0 20px; }
        .card { background: white; border-radius: 10px; padding: 30px; margin-bottom: 30px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .logout-btn { background: #e74c3c; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; float: right; }
    </style>
</head>
<body>
    <div class="navbar">
        <h1>Evolution Banking - Dashboard <button class="logout-btn" onclick="logout()">Logout</button></h1>
    </div>
    <div class="container">
        <div class="card">
            <h2>Welcome to your Dashboard</h2>
            <p>You have successfully logged in!</p>
        </div>
    </div>
    <script>
        function logout() {
            localStorage.removeItem('authToken');
            window.location.href = '/login';
        }

        // Check if user is authenticated
        if (!localStorage.getItem('authToken')) {
            window.location.href = '/login';
        }
    </script>
</body>
</html>`;
    await fs.writeFile(dashboardHtmlPath, dashboardHtml);
    console.log('✅ Default dashboard.html created');
  }

} catch (error) {
  console.error('❌ Error creating public directory:', error.message);
}

// Serve static files from public directory
app.use(express.static(publicDir));

// ============================================
// DATABASE SYNC FUNCTION
// ============================================
const syncDatabaseOnStart = async () => {
  try {
    console.log('🔌 Syncing database on startup...');

    // Check database connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');

    // Sync models (use { alter: true } for development, { force: false } for production)
    if (NODE_ENV === 'development') {
      // In development, you can use alter to update tables
      await sequelize.sync({ alter: true });
      console.log('✅ Database synced with alterations');
    } else {
      // In production, just ensure tables exist without altering
      await sequelize.sync({ force: false });
      console.log('✅ Database synced (safe mode)');
    }

    console.log('✅ Database sync completed successfully');
    return true;
  } catch (error) {
    console.error('❌ Database sync failed:', error.message);
    return false;
  }
};

// ============================================
// COUNTERS INITIALIZATION FUNCTION
// ============================================
const initializeCounters = async () => {
  console.log('\n📊 Initializing counters...');
  try {
    // Check if counters table exists
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'counters'");

    if (tables.length === 0) {
      console.log('⚠️ Counters table does not exist, creating...');
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS counters (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(50) UNIQUE NOT NULL,
          seq INT DEFAULT 0 NOT NULL,
          description VARCHAR(255),
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_name (name)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    }

    // Insert default counters if none exist
    const [counters] = await sequelize.query('SELECT COUNT(*) as count FROM counters');
    if (counters[0].count === 0) {
      await sequelize.query(`
        INSERT INTO counters (name, seq) VALUES
        ('customer', 1000),
        ('account', 10000),
        ('transaction', 100000),
        ('application', 1)
      `);
      console.log('✅ Default counters created');
    } else {
      console.log('✅ Counters already initialized');
    }
    return true;
  } catch (error) {
    console.error('❌ Counter initialization failed:', error.message);
    return false;
  }
};

// ============================================
// FIX APPROVAL TABLE FUNCTION
// ============================================
const fixApprovalTableIssue = async () => {
  console.log('\n🔧 Checking approval_requests table...');
  try {
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'approval_requests'");
    if (tables.length === 0) {
      console.log('Creating approval_requests table...');
      await sequelize.query(`
        CREATE TABLE IF NOT EXISTS approval_requests (
          id INT AUTO_INCREMENT PRIMARY KEY,
          request_type VARCHAR(100) NOT NULL,
          status VARCHAR(50) DEFAULT 'PENDING',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_status (status)
        ) ENGINE=InnoDB
      `);
      console.log('✅ approval_requests table created');
    } else {
      console.log('✅ approval_requests table exists');
    }
    return true;
  } catch (error) {
    console.error('❌ Error with approval table:', error.message);
    return false;
  }
};

// ============================================
// CREATE MISSING TABLES FUNCTION
// ============================================
const createMissingTables = async () => {
  console.log('\n🔍 Checking for missing critical tables...');

  const criticalTables = [
    'customers',
    'customer_accounts',
    'account_applications',
    'counters',
    'bvn_verifications'
  ];

  const createdTables = [];

  for (const tableName of criticalTables) {
    try {
      const [tables] = await sequelize.query(`SHOW TABLES LIKE '${tableName}'`);
      if (tables.length === 0) {
        console.log(`   ⚠️ Table ${tableName} doesn't exist, creating...`);

        if (tableName === 'bvn_verifications') {
          await sequelize.query(`
            CREATE TABLE bvn_verifications (
              id BIGINT AUTO_INCREMENT PRIMARY KEY,
              bvn VARCHAR(11) NOT NULL,
              customer_id VARCHAR(50),
              first_name VARCHAR(100),
              last_name VARCHAR(100),
              phone_number VARCHAR(20),
              date_of_birth DATE,
              verified BOOLEAN DEFAULT FALSE,
              verification_status VARCHAR(50),
              response_data JSON,
              ip_address VARCHAR(45),
              verified_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
              INDEX idx_bvn (bvn),
              INDEX idx_customer_id (customer_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
          `);
          console.log(`   ✅ Created table: ${tableName}`);
          createdTables.push(tableName);
        }
      } else {
        console.log(`   ✅ Table exists: ${tableName}`);
      }
    } catch (error) {
      console.log(`   ❌ Failed to create ${tableName}: ${error.message}`);
    }
  }
  return createdTables.length > 0;
};

// ============================================
// DATABASE ATTACHMENT MIDDLEWARE
// ============================================
console.log('\n🔗 Attaching database to requests...');

app.use((req, res, next) => {
  req.sequelize = sequelize;
  req.db = {
    sequelize: sequelize,
    models: sequelize.models || {},
    query: async (sql, params = []) => {
      const [results] = await sequelize.query(sql, { replacements: params });
      return results;
    }
  };
  next();
});

// ============================================
// MIDDLEWARE TO CHECK IF REQUEST IS FOR API OR PAGE
// ============================================
app.use((req, res, next) => {
  // Store this for later use in error handlers
  req.isApiRequest = req.path.startsWith('/api') ||
                     req.headers.accept?.includes('application/json') ||
                     req.xhr;
  next();
});

// ============================================
// CREATE ROUTE FILES IF THEY DON'T EXIST
// ============================================
const ensureRouteFiles = async () => {
  console.log('\n📁 Checking route files...');

  const routesDir = path.join(__dirname, 'src/routes');
  try {
    await fs.mkdir(routesDir, { recursive: true });

    // Create BvnRoutes.js if it doesn't exist
    const bvnRoutesPath = path.join(routesDir, 'BvnRoutes.js');
    try {
      await fs.access(bvnRoutesPath);
      console.log('✅ BvnRoutes.js exists');
    } catch {
      console.log('📝 Creating BvnRoutes.js...');
      const bvnRoutesContent = `import express from 'express';
import axios from 'axios';
const router = express.Router();

const PREMBLY_API_KEY = process.env.PREMBLY_API_KEY || 'test_sk_b8ba7dba69424d0b98fc119d95dbb5c1';
const PREMBLY_API_URL = 'https://api.prembly.com/v1/verify';

router.post('/verify', async (req, res) => {
  try {
    const { type, number, bvn } = req.body;
    const bvnNumber = number || bvn;

    const response = await axios.post(PREMBLY_API_URL, {
      type: 'bvn',
      number: bvnNumber
    }, {
      headers: { 'x-api-key': PREMBLY_API_KEY }
    });

    res.json({ success: true, data: response.data });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;`;
      await fs.writeFile(bvnRoutesPath, bvnRoutesContent);
      console.log('✅ Created BvnRoutes.js');
    }

    // Create LoginRoutes.js if it doesn't exist
    const loginRoutesPath = path.join(routesDir, 'LoginRoutes.js');
    try {
      await fs.access(loginRoutesPath);
      console.log('✅ LoginRoutes.js exists');
    } catch {
      console.log('📝 Creating LoginRoutes.js...');
      const loginRoutesContent = `import express from 'express';
import jwt from 'jsonwebtoken';
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

router.post('/login', async (req, res) => {
  try {
    const { user_name, password } = req.body;

    // Simple test login
    if (user_name === 'GLR001' && password === 'password123') {
      const token = jwt.sign(
        { userId: 'GLR001', username: user_name },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.json({
        success: true,
        token,
        user: {
          id: 'GLR001',
          username: user_name,
          name: 'Admin User',
          role: 'admin'
        }
      });
    } else {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;`;
      await fs.writeFile(loginRoutesPath, loginRoutesContent);
      console.log('✅ Created LoginRoutes.js');
    }

    // Create DrawerRoutes.js placeholder if it doesn't exist
    const drawerRoutesPath = path.join(routesDir, 'DrawerRoutes.js');
    try {
      await fs.access(drawerRoutesPath);
      console.log('✅ DrawerRoutes.js exists');
    } catch {
      console.log('📝 Creating DrawerRoutes.js placeholder...');
      const drawerRoutesContent = `import express from 'express';
const router = express.Router();

router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Drawer routes working' });
});

export default router;`;
      await fs.writeFile(drawerRoutesPath, drawerRoutesContent);
      console.log('✅ Created DrawerRoutes.js');
    }

    // Create thriftRoutes.js if it doesn't exist
    const thriftRoutesPath = path.join(routesDir, 'thriftRoutes.js');
    try {
      await fs.access(thriftRoutesPath);
      console.log('✅ thriftRoutes.js exists');
    } catch {
      console.log('📝 Creating thriftRoutes.js...');
      const thriftRoutesContent = `import express from 'express';
import ThriftController from '../controllers/ThriftController.js';
import { 
  getThrift, 
  getCustomer, 
  getTransaction,
  getSequelize,
  initializeModels 
} from '../models/index.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Middleware to ensure models are initialized
router.use(async (req, res, next) => {
  try {
    await initializeModels();
    next();
  } catch (error) {
    logger.error('Failed to initialize models:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server initialization failed',
      error: error.message 
    });
  }
});

// ============================================
// HEALTH CHECK ROUTE
// ============================================
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Thrift service is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// ============================================
// SEARCH ROUTES
// ============================================
router.get('/search/customers', ThriftController.searchCustomersByName);
router.get('/search/thrift-accounts', ThriftController.searchThriftAccountsByName);
router.get('/search/quick', ThriftController.quickSearchForCollection);

// ============================================
// THRIFT ACCOUNT CREATION ROUTES
// ============================================
router.post('/accounts', ThriftController.createThriftAccount);
router.post('/accounts/existing-customer', ThriftController.createThriftAccountForExistingCustomer);

// ============================================
// COLLECTION PROCESSING ROUTES
// ============================================
router.post('/collections/daily', ThriftController.processDailyCollection);

// ============================================
// WITHDRAWAL ROUTES
// ============================================
router.post('/withdrawals/request', ThriftController.processWithdrawal);
router.post('/withdrawals/approve', ThriftController.approveWithdrawal);
router.get('/withdrawals/pending', ThriftController.getPendingWithdrawals);
router.get('/withdrawals/details/:transactionId', ThriftController.getWithdrawalApprovalDetails);

// ============================================
// ACCOUNT INFORMATION ROUTES
// ============================================
router.get('/accounts/:CUST_ID/:ACCT_NO/summary', ThriftController.getAccountSummary);
router.get('/accounts/customer/:customerId', ThriftController.getCustomerThriftAccounts);
router.get('/accounts', ThriftController.getAllThriftAccounts);
router.get('/accounts/:accountNo', ThriftController.getThriftAccount);
router.patch('/accounts/:accountNo/status', ThriftController.updateThriftStatus);
router.get('/accounts/:accountNo/transactions', ThriftController.getThriftTransactions);
router.get('/transactions/:CUST_ID?/:ACCT_NO?', ThriftController.getTransactionHistory);

export default router;`;
      await fs.writeFile(thriftRoutesPath, thriftRoutesContent);
      console.log('✅ Created thriftRoutes.js');
    }

  } catch (error) {
    console.error('❌ Error ensuring route files:', error.message);
  }
};

// ============================================
// MOUNT ROUTES
// ============================================

// Ensure route files exist before mounting
await ensureRouteFiles();

// Mount Thrift Routes - ADDED
console.log('\n🔧 Loading Thrift Routes...');
try {
  const thriftRoutesModule = await import('./src/routes/ThriftRoutes.js');
  const thriftRoutes = thriftRoutesModule.default;
  app.use('/api/thrift-banking', thriftRoutes);
  console.log('✅ Thrift Routes mounted at /api/thrift-banking');
} catch (error) {
  console.error('❌ Failed to load Thrift Routes:', error.message);
  console.error('   Stack:', error.stack);
}

// Mount Drawer Routes
console.log('\n🔧 Loading Drawer Routes...');
try {
  const drawerRoutesModule = await import('./src/routes/DrawerRoutes.js');
  const drawerRoutes = drawerRoutesModule.default;
  app.use('/api/drawer', drawerRoutes);
  console.log('✅ Drawer Routes mounted at /api/drawer');
} catch (error) {
  console.error('❌ Failed to load Drawer Routes:', error.message);
}

// Mount BVN Routes
console.log('\n🔧 Loading BVN Routes...');
try {
  const bvnRoutesModule = await import('./src/routes/BvnRoutes.js');
  const bvnRoutes = bvnRoutesModule.default;
  app.use('/api/bvn', bvnRoutes);
  console.log('✅ BVN Routes mounted at /api/bvn');
} catch (error) {
  console.error('❌ Failed to load BVN Routes:', error.message);
}

// Mount Login Routes
console.log('\n🔧 Loading Login Routes...');
try {
  const loginRoutesModule = await import('./src/routes/LoginRoutes.js');
  const loginRoutes = loginRoutesModule.default;
  app.use('/api/login', loginRoutes);
  console.log('✅ Login Routes mounted at /api/login');
} catch (error) {
  console.error('❌ Failed to load Login Routes:', error.message);
}

// ============================================
// DEBUG ROUTES ENDPOINT - ADDED HERE
// ============================================
console.log('\n🔍 Adding debug routes endpoint...');
app.get('/api/debug/routes', (req, res) => {
  const routes = [];
  
  app._router.stack.forEach(middleware => {
    if (middleware.route) {
      // Routes registered directly on app
      routes.push({
        path: middleware.route.path,
        methods: Object.keys(middleware.route.methods)
      });
    } else if (middleware.name === 'router' && middleware.handle.stack) {
      // Routes registered via router (like /api/bvn, /api/login, etc.)
      const basePath = middleware.regexp.source
        .replace('\\/?(?=\\/|$)', '')
        .replace(/\\\//g, '/')
        .replace('\\/?', '')
        .replace(/\(\?:\(\[\^\\\/\]\+\?\)\)/g, ':param')
        .replace(/^\^/, '');
      
      middleware.handle.stack.forEach(handler => {
        if (handler.route) {
          const path = basePath + handler.route.path;
          routes.push({
            path: path,
            methods: Object.keys(handler.route.methods)
          });
        }
      });
    }
  });
  
  // Also check for routes registered with app.use without a router
  app._router.stack.forEach(middleware => {
    if (middleware.name === 'bound dispatch' && middleware.route) {
      // Already handled above
    }
  });
  
  res.json({
    success: true,
    totalRoutes: routes.length,
    routes: routes.sort((a, b) => a.path.localeCompare(b.path)),
    timestamp: new Date().toISOString()
  });
});

// ============================================
// FRONTEND ROUTES - REDIRECT TO REACT APP
// ============================================
console.log('\n🌐 Setting up frontend routes...');

// Redirect root to frontend
app.get('/', (req, res) => {
  console.log('🔍 Redirecting / to frontend');
  res.redirect('https://evolutionbankingsolution-lexicalresource.com.ng/');
});

// Redirect login page to frontend login
app.get('/login', (req, res) => {
  console.log('🔍 Redirecting /login to frontend');
  res.redirect('https://evolutionbankingsolution-lexicalresource.com.ng/login');
});

// Redirect dashboard to frontend dashboard
app.get('/dashboard', (req, res) => {
  console.log('🔍 Redirecting /dashboard to frontend');
  res.redirect('https://evolutionbankingsolution-lexicalresource.com.ng/dashboard');
});

// Catch-all for any other frontend routes
app.get('*', (req, res, next) => {
  // Don't redirect API requests, health checks, etc.
  if (req.path.startsWith('/api') || 
      req.path.startsWith('/health') || 
      req.path.startsWith('/cors-check') ||
      req.path.startsWith('/images')) {
    return next();
  }
  
  // For all other routes, redirect to frontend
  console.log(`🔍 Redirecting ${req.path} to frontend`);
  res.redirect(`https://evolutionbankingsolution-lexicalresource.com.ng${req.path}`);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    port: PORT,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV
  });
});

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'Server is running',
    port: PORT,
    environment: NODE_ENV,
    endpoints: [
      'POST /api/thrift-banking/accounts',
      'POST /api/login/login',
      'POST /api/bvn/verify',
      'GET /api/bvn/history/:bvn',
      'POST /api/bvn/lookup',
      'GET /api/drawer/*',
      'GET /health',
      'GET /api/debug/routes'
    ]
  });
});

// ============================================
// IMPORT ERROR HANDLER - FIXED PATH
// ============================================
console.log('\n🔧 Setting up error handler...');
import errorHandler from './src/middlewares/errorHandler.js';  // FIXED: Added src/ and correct folder name

// ============================================
// 404 HANDLER - This must come AFTER all routes
// ============================================
app.use('*', (req, res, next) => {
  // Check if it's an API request
  if (req.path.startsWith('/api') || req.headers.accept?.includes('application/json')) {
    const error = new Error(`API endpoint not found: ${req.method} ${req.path}`);
    error.status = 404;
    error.statusCode = 404;
    error.name = 'RouteNotFoundError';
    return next(error);
  }

  // For all other routes, redirect to login page
  console.log(`🔍 Redirecting non-API route to login: ${req.path}`);
  res.redirect('/login');
});

// ============================================
// USE THE ERROR HANDLER
// ============================================
app.use(errorHandler);

// ============================================
// STARTUP FUNCTION
// ============================================
const startup = async () => {
  console.log('\n🚀 Evolution Banking - Starting Server');
  console.log('='.repeat(60));
  console.log(`🔧 Backend Port: ${PORT}`);
  console.log(`🔧 Environment: ${NODE_ENV}`);
  console.log(`🔧 Frontend URL: ${FRONTEND_URL}`);
  console.log('='.repeat(60));

  try {
    // Initialize configuration
    console.log('⚙️ Loading configuration...');
    await configurationService.initialize();

    // Sync database on startup
    await syncDatabaseOnStart();

    // Initialize critical tables
    console.log('\n📊 Initializing tables...');
    try {
      await SavingsProduct.initializeTable();
      console.log('✅ SavingsProduct table ready');
    } catch (e) {
      console.log('⚠️ SavingsProduct:', e.message);
    }

    try {
      await LoanFee.initializeTable();
      console.log('✅ LoanFee table ready');
    } catch (e) {
      console.log('⚠️ LoanFee:', e.message);
    }

    // Create missing tables
    console.log('\n🔍 Checking for missing tables...');
    await createMissingTables();

    // Initialize counters
    await initializeCounters();

    // Fix approval table
    await fixApprovalTableIssue();

    // Start server
    console.log('\n' + '='.repeat(60));
    console.log('✅ All pre-startup tasks completed');
    console.log(`🚀 Starting server on port ${PORT}...`);

    const server = app.listen(PORT, HOST, () => {
      console.log(`
╔══════════════════════════════════════════════════════════╗
║          Evolution Banking System API                    ║
╠══════════════════════════════════════════════════════════╣
║  ✅ SERVER RUNNING                                        ║
║     http://${HOST}:${PORT}                               ║
║                                                          ║
║  🌐 Pages:                                               ║
║     • Home: http://${HOST}:${PORT}/                     ║
║     • Login: http://${HOST}:${PORT}/login               ║
║     • Dashboard: http://${HOST}:${PORT}/dashboard       ║
║                                                          ║
║  🔧 API Endpoints:                                       ║
║     • Thrift: POST /api/thrift-banking/accounts          ║
║     • Health: http://${HOST}:${PORT}/health             ║
║     • Test: http://${HOST}:${PORT}/api/test             ║
║     • Login: POST /api/login/login                       ║
║     • BVN: POST /api/bvn/verify                          ║
║     • Debug Routes: GET /api/debug/routes                ║
║     • CORS Debug: http://${HOST}:${PORT}/cors-check      ║
╚══════════════════════════════════════════════════════════╝
      `);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => {
      console.log('\n🔻 Shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('\n🔻 Shutting down gracefully...');
      server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
      });
    });

    return server;

  } catch (error) {
    console.error('\n❌ Startup failed:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
};

// ============================================
// START THE SERVER
// ============================================
if (process.env.NODE_ENV !== 'test') {
  startup();
}

export default app;