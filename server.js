// server.js - COMPLETE FIXED VERSION WITH GUARANTOR SYNC FIX & PIDUSAGE SUPPRESSION
// ============================================

// ============================================
// ✅ PIDUSAGE SUPPRESSION - MUST BE AT VERY TOP
// ============================================

// Force environment variables
process.env.PIDUSAGE_DISABLE = '1';
process.env.PIDUSAGE_NO_WMIC = '1';

// ✅ Use import instead of require for pidusage suppression
// Since this is an ES module, we need to use dynamic import

// Override console.error to filter pidusage messages
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

console.log('✅ PIDUSAGE SUPPRESSION ENABLED');

// ============================================
// IMPORTS
// ============================================

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import events from 'events';
import util from 'util';

// ✅ Increase max listeners to avoid warning
events.EventEmitter.defaultMaxListeners = 20;

// ✅ CRITICAL: Load .env BEFORE importing any local modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

// ============================================
// ✅ Map PAYSTACK_TEST_SECRET_KEY to PAYSTACK_SECRET_KEY if the latter is missing
// ============================================
if (process.env.PAYSTACK_TEST_SECRET_KEY && !process.env.PAYSTACK_SECRET_KEY) {
  process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_TEST_SECRET_KEY;
  console.log('✅ Mapped PAYSTACK_TEST_SECRET_KEY → PAYSTACK_SECRET_KEY');
}

if (!process.env.PAYSTACK_SECRET_KEY) {
  console.error('\n❌ FATAL: Neither PAYSTACK_SECRET_KEY nor PAYSTACK_TEST_SECRET_KEY is defined in .env');
  console.error('   Please add: PAYSTACK_TEST_SECRET_KEY=sk_test_...\n');
  process.exit(1);
} else {
  const maskedKey = process.env.PAYSTACK_SECRET_KEY.substring(0, 10) + '...';
  console.log(`✅ PAYSTACK_SECRET_KEY loaded (${maskedKey})`);
}

// ============================================
// ✅ CUSTOM ERROR LOGGER - Converts [object Object] to readable format
// ============================================
const formatError = (error) => {
  if (!error) return 'No error details';
  if (typeof error === 'string') return error;
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      sql: error.sql || undefined,
      parameters: error.parameters || undefined,
      parent: error.parent ? {
        code: error.parent.code,
        errno: error.parent.errno,
        sqlMessage: error.parent.sqlMessage,
        sqlState: error.parent.sqlState
      } : undefined
    };
  }
  return util.inspect(error, { depth: 10, colors: false, showHidden: false });
};

const logError = (prefix, error, additional = {}) => {
  const formatted = formatError(error);
  
  console.error(`\n❌ ${prefix}:`);
  console.error('🕐 Timestamp:', new Date().toISOString());
  
  if (typeof formatted === 'object') {
    try {
      const jsonStr = JSON.stringify(formatted, (key, value) => {
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack
          };
        }
        return value;
      }, 2);
      console.error('📋 Error Details:', jsonStr);
    } catch (e) {
      console.error('📋 Error Details:', util.inspect(formatted, { depth: 10, colors: false }));
    }
  } else {
    console.error('📋 Error Details:', formatted);
  }
  
  if (Object.keys(additional).length > 0) {
    try {
      console.error('📋 Additional Info:', JSON.stringify(additional, null, 2));
    } catch (e) {
      console.error('📋 Additional Info:', util.inspect(additional, { depth: 5 }));
    }
  }
  
  console.error('🔄 Stack Trace:', error.stack || 'No stack trace available');
  console.error('═'.repeat(50));
};

// ============================================
// Unhandled exception / rejection handlers
// ============================================
process.on('uncaughtException', (error) => {
  logError('UNCAUGHT EXCEPTION', error);
  setTimeout(() => {
    console.error('⚠️ Process exiting due to uncaught exception');
    process.exit(1);
  }, 2000);
});

process.on('unhandledRejection', (reason, promise) => {
  logError('UNHANDLED REJECTION', reason);
});

// ============================================
// Now import all other modules
// ============================================
import app from './src/app.js';
import { sequelize } from './config/db.js';
import { initializeModels } from './src/models/index.js';
import envManager from './src/Services/envManager.js';
import dataSourceManager from './src/Services/dataSourceManager.js';
import pluginManager from './src/Services/pluginManager.js';
import { startAccrualJob } from './src/jobs/accrualJob.js';
import Drawer from './src/models/Drawer.js';
import auditLogger from './src/utils/AuditLogger.js';
import AuditTrail from './src/models/AuditTrail.js';
import jobRegistry from './src/services/jobRegistry.js';
import { runEODLoanRepayment } from './scripts/eodLoanRepayment.js';
import { startAllWebhooks, stopAllWebhooks } from './src/routes/AdminRoutes.js';
import Guarantor from './src/models/Guarantor.js';
import LoanInterestRate from './src/models/LoanInterestRate.js';
import SystemDate from './src/models/SystemDate.js';
import RolesVw from './src/models/RolesVw.js';

// ============================================
// Import cron jobs
// ============================================
import './src/cronJobs/dailyInterestAccrual.js';
import './src/cronJobs/InterestAccrualJob.js';
import './src/scheduler/eodScheduler.js';

// Start all enabled webhooks on server startup
try {
  await startAllWebhooks();
} catch (error) {
  logError('Webhooks startup error', error);
}

// On shutdown, stop them
process.on('SIGTERM', async () => {
  try {
    await stopAllWebhooks();
  } catch (error) {
    logError('Webhooks shutdown error', error);
  }
  process.exit(0);
});

// Register EOD jobs
jobRegistry.registerJob(
  'EOD Loan Repayment',
  '30 23 * * *',
  async () => {
    console.log('🔄 Running EOD loan repayment...');
    await runEODLoanRepayment();
  },
  'End-of-day loan repayment processing (main)'
);

jobRegistry.registerJob(
  'EOD Loan Repayment (Backup)',
  '0 2 * * *',
  async () => {
    console.log('🔄 Running backup EOD loan repayment...');
    await runEODLoanRepayment();
  },
  'Backup EOD loan repayment at 2 AM'
);

// ============================================
// ✅ PATCH: Make auditLogger.info return a Promise
// ============================================
if (auditLogger && auditLogger.info && typeof auditLogger.info === 'function') {
  const originalInfo = auditLogger.info;
  auditLogger.info = function(...args) {
    try {
      const result = originalInfo.apply(this, args);
      if (result === undefined || !(result instanceof Promise)) {
        return Promise.resolve();
      }
      return result;
    } catch (err) {
      return Promise.reject(err);
    }
  };
  console.log('✅ auditLogger.info patched to return a Promise');
}

// ============================================
// Server configuration
// ============================================
const PORT = process.env.PORT || 3002;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log('🚀 Server configuration:');
console.log(`   PORT: ${PORT}`);
console.log(`   HOST: ${HOST}`);
console.log(`   NODE_ENV: ${NODE_ENV}`);

let server;

// ============================================
// Helper: Create ALL tables using raw SQL
// ============================================
async function createAllTables() {
  console.log('📦 Creating all tables if they don\'t exist...');
  
  try {
    // ============================================================
    // ADMIN TABLES
    // ============================================================
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS admin_data_sources (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        jndiName VARCHAR(255),
        host VARCHAR(255),
        port INT,
        \`database\` VARCHAR(255),
        username VARCHAR(255),
        password VARCHAR(255),
        poolMin INT DEFAULT 5,
        poolMax INT DEFAULT 20,
        targets VARCHAR(255),
        status ENUM('active', 'inactive', 'deleted') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_name (name),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ admin_data_sources table ready');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS admin_plugins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        version VARCHAR(50),
        description TEXT,
        status ENUM('active', 'stopped', 'deleted') DEFAULT 'stopped',
        file_path VARCHAR(500),
        auto_start BOOLEAN DEFAULT FALSE,
        targets VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_name (name),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ admin_plugins table ready');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS admin_env_vars (
        id INT AUTO_INCREMENT PRIMARY KEY,
        \`key\` VARCHAR(255) UNIQUE NOT NULL,
        value TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_key (\`key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ admin_env_vars table ready');

    // ============================================================
    // WEBHOOK CONFIGS
    // ============================================================
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS webhook_configs (
        id INT PRIMARY KEY AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        url VARCHAR(500) NOT NULL,
        enabled BOOLEAN DEFAULT TRUE,
        port INT,
        secret_key VARCHAR(255),
        events JSON,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_enabled (enabled),
        INDEX idx_name (name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ webhook_configs table ready');

    // ============================================================
    // DRAWER TABLES
    // ============================================================
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS drawers (
        id INT PRIMARY KEY AUTO_INCREMENT,
        DRAWER_ID VARCHAR(50) NOT NULL UNIQUE,
        DRAWER_NO VARCHAR(50) NOT NULL UNIQUE,
        DRAWER_NM VARCHAR(100),
        WF_STATUS VARCHAR(20) DEFAULT 'OPEN',
        CURRENT_BALANCE DECIMAL(20,2) DEFAULT 0,
        MIN_BAL DECIMAL(20,2) DEFAULT 0,
        MAX_BAL DECIMAL(20,2) DEFAULT 999999999.99,
        DRAWER_CASH_LIMIT_FG VARCHAR(1) DEFAULT 'N',
        VERSION_NO INT DEFAULT 1,
        USER_ID VARCHAR(50),
        BU_ID VARCHAR(10),
        BRANCH_ID VARCHAR(10),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_drawer_id (DRAWER_ID),
        INDEX idx_drawer_no (DRAWER_NO),
        INDEX idx_user_id (USER_ID),
        INDEX idx_status (WF_STATUS)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ drawers table ready');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS drawer_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        drawer_id INT NOT NULL,
        drawer_no VARCHAR(50) NOT NULL,
        transaction_type VARCHAR(20) NOT NULL,
        amount DECIMAL(20,2) NOT NULL,
        previous_balance DECIMAL(20,2) NOT NULL,
        new_balance DECIMAL(20,2) NOT NULL,
        transaction_ref_no VARCHAR(100),
        customer_account VARCHAR(20),
        description TEXT,
        user_id VARCHAR(100),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_drawer_id (drawer_id),
        INDEX idx_drawer_no (drawer_no),
        INDEX idx_transaction_ref (transaction_ref_no),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ drawer_transactions table ready');

    // ============================================================
    // VAULT TABLES
    // ============================================================
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS vaults (
        id INT PRIMARY KEY AUTO_INCREMENT,
        vault_id VARCHAR(50) NOT NULL UNIQUE,
        vault_name VARCHAR(100) NOT NULL,
        vault_type VARCHAR(50) NOT NULL,
        branch_code VARCHAR(10),
        drawer_id VARCHAR(50),
        current_balance DECIMAL(20,2) DEFAULT 0,
        min_balance DECIMAL(20,2) DEFAULT 0,
        max_balance DECIMAL(20,2) DEFAULT 999999999.99,
        status VARCHAR(20) DEFAULT 'ACTIVE',
        created_by VARCHAR(50),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_vault_id (vault_id),
        INDEX idx_branch_code (branch_code),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ vaults table ready');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS vault_approval_requests (
        id INT PRIMARY KEY AUTO_INCREMENT,
        vault_id INT NOT NULL,
        requested_by VARCHAR(50) NOT NULL,
        approved_by VARCHAR(50),
        request_type VARCHAR(50) NOT NULL,
        request_data JSON,
        status VARCHAR(20) DEFAULT 'PENDING',
        approved_at DATETIME,
        rejected_at DATETIME,
        rejection_reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_vault_id (vault_id),
        INDEX idx_requested_by (requested_by),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ vault_approval_requests table ready');

    // ============================================================
    // DEPOSIT TRANSACTIONS
    // ============================================================
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS deposit_transactions (
        id INT PRIMARY KEY AUTO_INCREMENT,
        customer_id VARCHAR(20),
        account_number VARCHAR(20),
        transaction_type VARCHAR(50),
        amount DECIMAL(20,2),
        emtl_amount DECIMAL(20,2) DEFAULT 0,
        total_debit DECIMAL(20,2) DEFAULT 0,
        emtl_applicable BOOLEAN DEFAULT FALSE,
        emtl_reason VARCHAR(255),
        emtl_gl_account VARCHAR(20),
        emtl_beneficiary VARCHAR(100),
        currency VARCHAR(3) DEFAULT 'NGN',
        status VARCHAR(20) DEFAULT 'PENDING',
        aml_risk_level VARCHAR(20),
        aml_risk_score INT,
        aml_indicators TEXT,
        created_by VARCHAR(100),
        transaction_date DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        branch_id VARCHAR(10),
        approved_by VARCHAR(100),
        approved_at DATETIME,
        transaction_ref_no VARCHAR(100) UNIQUE,
        description TEXT,
        requires_approval BOOLEAN DEFAULT FALSE,
        approved_by_role VARCHAR(100),
        approval_status VARCHAR(20) DEFAULT 'PENDING',
        depositor_name VARCHAR(100),
        INDEX idx_account_number (account_number),
        INDEX idx_created_by (created_by),
        INDEX idx_transaction_date (transaction_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ deposit_transactions table ready');

    // ============================================================
    // EMTL TABLES
    // ============================================================
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS emtl_collections (
        id INT PRIMARY KEY AUTO_INCREMENT,
        transaction_id VARCHAR(100) NOT NULL,
        transaction_reference VARCHAR(100) NOT NULL,
        customer_no VARCHAR(50) NOT NULL,
        account_no VARCHAR(20) NOT NULL,
        amount DECIMAL(20,2) NOT NULL,
        transfer_amount DECIMAL(20,2) NOT NULL,
        transfer_date DATETIME NOT NULL,
        channel VARCHAR(50) DEFAULT 'WEB',
        transaction_type VARCHAR(50) DEFAULT 'TRANSFER',
        status VARCHAR(20) DEFAULT 'PENDING_REMITTANCE',
        remittance_batch_id VARCHAR(100),
        remitted_date DATETIME,
        remittance_reference VARCHAR(100),
        gl_account VARCHAR(20) DEFAULT '2401000001',
        levy_calculation JSON,
        created_by VARCHAR(100) DEFAULT 'SYSTEM',
        created_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR(100),
        updated_date DATETIME,
        INDEX idx_transaction_id (transaction_id),
        INDEX idx_reference (transaction_reference),
        INDEX idx_account (account_no),
        INDEX idx_status (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ emtl_collections table ready');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS emtl_policies (
        id INT PRIMARY KEY AUTO_INCREMENT,
        policy_code VARCHAR(20) UNIQUE NOT NULL DEFAULT 'EMTL',
        policy_name VARCHAR(100) NOT NULL DEFAULT 'Electronic Money Transfer Levy',
        description TEXT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        priority INT NOT NULL DEFAULT 10,
        threshold DECIMAL(15,2) NOT NULL DEFAULT 10000.00,
        levy_amount DECIMAL(15,2) NOT NULL DEFAULT 50.00,
        levy_type ENUM('FLAT', 'PERCENTAGE') NOT NULL DEFAULT 'FLAT',
        percentage_rate DECIMAL(5,2),
        apply_on JSON NOT NULL,
        exemptions JSON NOT NULL,
        effective_date DATE NOT NULL,
        expiry_date DATE,
        gl_account VARCHAR(20) NOT NULL DEFAULT '2401000001',
        gl_account_name VARCHAR(100) NOT NULL DEFAULT 'EMTL Payable',
        beneficiary VARCHAR(100) NOT NULL DEFAULT 'FIRS',
        beneficiary_account VARCHAR(20) NOT NULL DEFAULT '0000000001',
        beneficiary_bank VARCHAR(50) NOT NULL DEFAULT 'CBN',
        is_active BOOLEAN NOT NULL DEFAULT true,
        version INT NOT NULL DEFAULT 1,
        created_by VARCHAR(50) NOT NULL DEFAULT 'SYSTEM',
        created_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_by VARCHAR(50),
        updated_date TIMESTAMP NULL,
        INDEX idx_enabled_active (enabled, is_active),
        INDEX idx_policy_code (policy_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ emtl_policies table ready');

    // ============================================================
    // GUARANTORS TABLE - Using the model's initializeTable method
    // ============================================================
    console.log('📦 Creating Guarantors table...');
    await Guarantor.initializeTable();
    console.log('✅ Guarantors table ready');

    // ============================================================
    // ROLES TABLE
    // ============================================================
    console.log('📦 Creating Roles table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS roles (
        role_id INT PRIMARY KEY,
        role_name VARCHAR(100) NOT NULL,
        description VARCHAR(255) NULL,
        active BOOLEAN DEFAULT TRUE,
        permissions JSON NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_role_name (role_name),
        INDEX idx_active (active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✅ Roles table ready');

    // Insert default roles if they don't exist
    await sequelize.query(`
      INSERT IGNORE INTO roles (role_id, role_name, description, active, permissions) VALUES
      (1, 'Super Admin', 'Full system access', 1, JSON_OBJECT('view_restricted_customers', true, 'manage_users', true, 'manage_roles', true)),
      (2, 'Admin', 'Administrative access', 1, JSON_OBJECT('view_restricted_customers', true, 'manage_users', true)),
      (3, 'Manager', 'Manager access', 1, JSON_OBJECT('view_restricted_customers', false)),
      (4, 'User', 'Standard user', 1, JSON_OBJECT('view_restricted_customers', false))
    `);
    console.log('✅ Default roles inserted');

    console.log('✅ All tables created successfully');
    return true;
    
  } catch (error) {
    logError('Error creating tables', error);
    return false;
  }
}

// ============================================
// Helper: Sync all models with Guarantor fix
// ============================================
async function syncAllModels() {
  console.log('🔄 Syncing all models...');
  
  try {
    // 1. Sync SystemDate first (depends on nothing)
    console.log('📦 Syncing SystemDate model...');
    try {
      await SystemDate.sync({ alter: true });
      console.log('✅ SystemDate model synced');
    } catch (error) {
      console.warn('⚠️ SystemDate alter sync failed, trying without alter...');
      await SystemDate.sync();
      console.log('✅ SystemDate model synced (without alter)');
    }
    
    // 2. Sync Drawer model
    console.log('📦 Syncing Drawer model...');
    await Drawer.sync({ alter: false });
    console.log('✅ Drawer model synced');
    
    // 3. ✅ FIXED: Sync Guarantor model with proper error handling
    console.log('📦 Syncing Guarantor model...');
    try {
      // First try with alter: true
      await Guarantor.sync({ alter: true });
      console.log('✅ Guarantor model synced with alter');
    } catch (syncError) {
      // If alter fails due to too many keys, try without alter
      if (syncError.message && syncError.message.includes('Too many keys')) {
        console.warn('⚠️ Guarantor has too many keys, syncing without alter...');
        try {
          await Guarantor.sync({ alter: false });
          console.log('✅ Guarantor model synced without alter');
        } catch (innerError) {
          console.error('❌ Failed to sync Guarantor:', innerError.message);
          // Try to sync with force: false
          try {
            await Guarantor.sync({ force: false });
            console.log('✅ Guarantor model synced with force: false');
          } catch (finalError) {
            console.error('❌ All sync attempts for Guarantor failed:', finalError.message);
          }
        }
      } else {
        throw syncError;
      }
    }
    
    // 4. Sync LoanInterestRate model
    console.log('📦 Syncing LoanInterestRate model...');
    await LoanInterestRate.sync({ alter: true });
    console.log('✅ LoanInterestRate model synced');
    
    // 5. Sync AuditTrail (development only)
    if (process.env.NODE_ENV === 'development') {
      console.log('📦 Syncing AuditTrail table (development only)...');
      try {
        await AuditTrail.sync({ alter: true });
        console.log('✅ AuditTrail table synced');
      } catch (auditError) {
        console.warn('⚠️ AuditTrail sync issue:', auditError.message);
      }
    }
    
    console.log('✅ All models synced successfully');
    return true;
    
  } catch (error) {
    logError('Error syncing models', error);
    return false;
  }
}

// ============================================
// Helper: Ensure roles_vw view exists
// ============================================
async function ensureRolesView() {
  try {
    console.log('📦 Checking roles_vw view...');
    await RolesVw.ensureViewExists();
    console.log('✅ roles_vw view ready');
    return true;
  } catch (error) {
    logError('Could not ensure roles_vw view', error);
    // Try to create it directly
    try {
      await sequelize.query(`DROP VIEW IF EXISTS roles_vw`);
      await sequelize.query(`
        CREATE VIEW roles_vw AS 
        SELECT 
          role_id,
          role_name,
          description,
          active,
          permissions,
          created_at,
          updated_at
        FROM roles
        WHERE active = 1
      `);
      console.log('✅ roles_vw view created directly');
      return true;
    } catch (err) {
      logError('Failed to create roles_vw view', err);
      return false;
    }
  }
}

// ============================================
// Start server
// ============================================
async function startServer() {
  console.log(`🔍 Starting server (single process) with PID ${process.pid}...`);

  try {
    // 1. Initialize Sequelize models
    console.log('🚀 Initializing models...');
    const models = await initializeModels();
    console.log('✅ Models initialized');

    // 2. CREATE ALL TABLES FIRST
    await createAllTables();

    // 3. SYNC ALL MODELS (with Guarantor fix)
    await syncAllModels();

    // 4. Ensure roles_vw view exists
    await ensureRolesView();

    // 5. Start accrual job
    startAccrualJob();

    // 6. Load admin configuration & dynamic plugins
    console.log('\n🔧 Initializing Admin Console components...');

    // Load environment variables from DB
    try {
      await envManager.loadAll();
      console.log('✅ Environment variables loaded from DB');
    } catch (envError) {
      console.warn('⚠️ Could not load env vars:', envError.message);
    }

    // Load data sources (connection pools)
    try {
      await dataSourceManager.loadFromDB();
      console.log('✅ Data sources loaded');
    } catch (dsError) {
      console.warn('⚠️ Could not load data sources:', dsError.message);
    }

    // Load and start plugins
    try {
      await pluginManager.loadPluginsFromDB(app);
      console.log('✅ Plugins loaded and started');
    } catch (pluginError) {
      console.warn('⚠️ Could not load plugins:', pluginError.message);
    }

    // ============================================================
    // ✅ HEALTH CHECK ENDPOINT
    // ============================================================
    app.get('/health', (req, res) => {
      res.json({
        status: 'OK',
        workerId: process.env.WORKER_ID || 'standalone',
        port: process.env.PORT,
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      });
    });

    // 7. Start HTTP server
    console.log(`\n🚀 Starting HTTP server on ${HOST}:${PORT}...`);
    
    server = app.listen(PORT, HOST, () => {
      const banner = `
${'🟢'.repeat(30)}
🟢                    SERVER IS RUNNING!                    
🟢                    http://${HOST}:${PORT}               
🟢                    Node Env: ${NODE_ENV}                  
🟢                    PID: ${process.pid}                    
🟢                    Started: ${new Date().toISOString()}
${'🟢'.repeat(30)}

📢 Available API Endpoints:
   • Health:        http://${HOST}:${PORT}/health
   • Login:         POST http://${HOST}:${PORT}/api/login/login
   • Admin Console: http://${HOST}:${PORT}/admin
   • API Root:      http://${HOST}:${PORT}/api
   • Server Time:   http://${HOST}:${PORT}/server-time
   • CORS Info:     http://${HOST}:${PORT}/cors-info

🔧 Service Status:
   • Database: ${process.env.DB_NAME || 'core_banking'} on ${process.env.DB_HOST || '127.0.0.1'}:${process.env.DB_PORT || 3306}
   • Redis: ${(process.env.REDIS_HOST && process.env.REDIS_HOST !== 'disabled') ? `${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}` : 'Disabled'}
   • Models Synced: ✅ All models synchronized
   • roles_vw: ✅ View ready

💡 Press Ctrl+C to stop the server

${'='.repeat(50)}
`;
      
      process.stdout.write(banner);
    });

    server.timeout = 300000;
    server.keepAliveTimeout = 300000;
    server.headersTimeout = 310000;
    server.maxHeadersCount = 2000;
    server.maxConnections = 10000;

    server.on('connection', (socket) => {
      socket.setNoDelay(true);
      socket.setKeepAlive(true, 60000);
    });

    server.on('error', (err) => {
      logError('Server error', err);
      if (err.code === 'EADDRINUSE') {
        console.error(`   Port ${PORT} is already in use`);
        console.log(`💡 Try killing the process using port ${PORT}:`);
        console.log(`   On Windows: netstat -ano | findstr :${PORT}`);
        console.log(`   On Linux: sudo lsof -i :${PORT}`);
      }
      process.exit(1);
    });

  } catch (err) {
    logError('FATAL: Failed to start server', err);
    process.exit(1);
  }
}

// ============================================
// Graceful shutdown
// ============================================
const gracefulShutdown = async () => {
  console.log(`\n👋 Shutdown signal received`);
  
  if (server) {
    server.close(async () => {
      console.log(`✅ HTTP server closed`);
      
      try {
        await pluginManager.stopAllPlugins();
        console.log('✅ Plugins stopped');
      } catch (err) {
        logError('Plugin shutdown error', err);
      }
      
      try {
        await dataSourceManager.closeAll();
        console.log('✅ Data sources closed');
      } catch (err) {
        logError('Data source shutdown error', err);
      }
      
      try {
        await sequelize.close();
        console.log('✅ Database connection closed');
      } catch (err) {
        logError('DB close error', err);
      }
      
      process.exit(0);
    });
    
    setTimeout(() => {
      console.error(`❌ Forced shutdown after timeout`);
      process.exit(1);
    }, 10000);
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start the server
startServer();

export default app;