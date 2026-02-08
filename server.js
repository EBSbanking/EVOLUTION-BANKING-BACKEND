// server.js - UPDATED VERSION WITH IMPROVED MODEL LOADING
import app from './src/app.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
// Import sequelize from db.js - use the getSequelize function since that's what's exported
import { getSequelize, checkDatabaseHealth } from './config/db.js';
import os from 'os';
import fs from 'fs/promises';
import configurationService from './src/Services/ConfigurationService.js';
import SavingsProduct from './src/models/SavingsProduct.js';
import { LoanInterestRate } from './src/models/LoanInterestRate.js';
import LoanAccount from './src/models/LoanAccount.js';
import LoanFee from './src/models/LoanFee.js';
import Approval from './src/models/Approval.js';




// Fix __dirname for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const AUTO_SYNC_DB = process.env.AUTO_SYNC_DB === 'true';

await configurationService.initialize();

await LoanFee.initializeTable();

    

// ============================================
// GET SEQUELIZE INSTANCE
// ============================================

// Use getSequelize() to get the instance
const sequelize = getSequelize();

// ============================================
// EMERGENCY TABLE CREATION FOR MISSING TABLES
// ============================================

const createMissingTables = async () => {
  console.log('\n🔍 Checking for missing critical tables...');
  
  const criticalTables = [
    'customers',
    'customer_accounts',
    'account_applications',
    'counters'
  ];
  
  const createdTables = [];
  const failedTables = [];
  
  for (const tableName of criticalTables) {
    try {
      const [tables] = await sequelize.query(`SHOW TABLES LIKE '${tableName}'`);
      
      if (tables.length === 0) {
        console.log(`   ⚠️  Table ${tableName} doesn't exist, creating...`);
        
        let createQuery = '';
        
        switch (tableName) {
          case 'customer_accounts':
            createQuery = `
              CREATE TABLE customer_accounts (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                customer_id BIGINT NOT NULL,
                account_number VARCHAR(20) UNIQUE NOT NULL,
                status VARCHAR(20) DEFAULT 'PENDING' NOT NULL,
                account_type VARCHAR(20) DEFAULT 'SAVINGS',
                available_balance DECIMAL(20,2) DEFAULT 0.00,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_customer_id (customer_id),
                INDEX idx_account_number (account_number),
                INDEX idx_status (status)
              ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `;
            break;
            
          case 'customers':
            createQuery = `
              CREATE TABLE customers (
                id BIGINT AUTO_INCREMENT PRIMARY KEY,
                CUST_ID VARCHAR(50) UNIQUE NOT NULL,
                CUST_NO VARCHAR(50),
                CUST_NM VARCHAR(255),
                FIRST_NAME VARCHAR(100),
                LAST_NAME VARCHAR(100),
                EMAIL_ADDRESS VARCHAR(255),
                PHONE_NO VARCHAR(20),
                REC_ST VARCHAR(20) DEFAULT 'PENDING',
                status VARCHAR(20) DEFAULT 'Pending',
                APPROVED_BY VARCHAR(100),
                APPROVED_DT DATETIME,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_cust_id (CUST_ID),
                INDEX idx_cust_no (CUST_NO)
              ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `;
            break;
            
          case 'account_applications':
            // This should already exist from fixAccountApplicationSchema()
            continue;
            
          case 'counters':
            createQuery = `
              CREATE TABLE counters (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(50) UNIQUE NOT NULL,
                seq INT DEFAULT 0 NOT NULL,
                description VARCHAR(255),
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                INDEX idx_name (name)
              ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
            `;
            break;
        }
        
        if (createQuery) {
          await sequelize.query(createQuery);
          console.log(`   ✅ Created table: ${tableName}`);
          createdTables.push(tableName);
        }
      } else {
        console.log(`   ✅ Table exists: ${tableName}`);
      }
    } catch (error) {
      console.log(`   ❌ Failed to create ${tableName}: ${error.message}`);
      failedTables.push(tableName);
    }
  }
  
  console.log(`\n📊 Emergency table creation summary:`);
  console.log(`   Created: ${createdTables.length} tables`);
  console.log(`   Failed: ${failedTables.length} tables`);
  
  if (createdTables.length > 0) {
    console.log(`   Created tables: ${createdTables.join(', ')}`);
  }
  
  if (failedTables.length > 0) {
    console.log(`   Failed tables: ${failedTables.join(', ')}`);
  }
  
  return createdTables.length > 0;
};



const initializeServer = async () => {
  try {
    console.log('🚀 Starting application initialization...');
    
    // ... existing initialization code ...
    
    // Auto-create Approval table
    console.log('🔄 Auto-creating approval_requests table...');
    await Approval.sync({ alter: true }); // This creates table if it doesn't exist
    console.log('✅ approval_requests table ready');
    
    // ... rest of your server startup code ...
    
  } catch (error) {
    console.error('Error during server initialization:', error);
    process.exit(1);
  }
};

initializeServer();

// ============================================
// LOAD SPECIFIC MODELS TO AVOID COLUMN ERRORS
// ============================================

const loadModelsSafely = async () => {
  console.log('\n📦 Loading models from models directory...');
  
  const modelPriority = [
    // Critical models first (must work)
    'Counter', 'User', 'Customer', 'CustomerAccount',

     'Drawer', 'AuditTrail',
    
    // AccountApplication should be loaded early to fix schema issues
    'AccountApplication',
    
    // Other important models
    'Transaction', 'LoanDisbursement', 'Disbursement', 'LoanRepayment',
    'LoanProduct', 'LoanAccount', 'CreditApplication', 'Guarantor',
    'LoanInterestRate', 'ProductTypeMapping', 'LoanFee',
    'InterestAccrual', 'LoanPortfolio', 'GLAccount', 'Charge',
    'LoanContractForm', 'WF_WORK_ITEM', 'Thrift', 'AuditTrail',
    'BusinessUnit', 'UserRole'
  ];
  
  const skipModels = [
    'Account',
    'RepaymentSchedule',
    'RateIndex',
    'Permission',
    'DepositTransaction',
    'LoanFee',
    'InterestAccrual'
  ];
  
  const loadedModels = [];
  const failedModels = [];
  
  for (const modelName of modelPriority) {
    if (skipModels.includes(modelName)) {
      console.log(`   ⏭️  Skipping ${modelName} (known issues)`);
      continue;
    }
    
    try {
      const modelPath = path.resolve(__dirname, `./src/models/${modelName}.js`);
      
      try {
        await fs.access(modelPath);
      } catch {
        console.log(`   ⚠️  ${modelName} - File not found`);
        continue;
      }
      
      console.log(`   📂 Loading ${modelName} from ${modelPath}...`);
      const modelModule = await import(`./src/models/${modelName}.js`);
      const model = modelModule.default;
      
      if (model) {
        // Check if model is properly initialized
        if (typeof model.init === 'function') {
          // Initialize the model if not already done
          if (!sequelize.isDefined(modelName)) {
            try {
              model.init(model.rawAttributes || {}, model.options || {});
              console.log(`   ✅ ${modelName} - Model initialized`);
            } catch (initError) {
              console.log(`   ❌ ${modelName} - Failed to initialize: ${initError.message}`);
              failedModels.push({ model: modelName, error: `Init failed: ${initError.message}` });
              continue;
            }
          }
          
          loadedModels.push(modelName);
          console.log(`   ✅ ${modelName} loaded and registered`);
        } else {
          console.log(`   ⚠️  ${modelName} - Model doesn't have init method`);
          failedModels.push({ model: modelName, error: 'Model missing init method' });
        }
      } else {
        console.log(`   ⚠️  ${modelName} - Imported but model is undefined`);
        failedModels.push({ model: modelName, error: 'Model is undefined after import' });
      }
    } catch (error) {
      failedModels.push({ model: modelName, error: error.message });
      console.log(`   ❌ ${modelName} - ${error.message}`);
      console.log(`   Stack: ${error.stack?.split('\n')[1]}`);
    }
  }
  
  console.log(`\n📊 Model loading summary:`);
  console.log(`   Loaded: ${loadedModels.length} models`);
  console.log(`   Failed: ${failedModels.length} models`);
  console.log(`   Skipped: ${skipModels.length} models`);
  
  if (failedModels.length > 0) {
    console.log('\n❌ Failed models:');
    failedModels.forEach(f => console.log(`   - ${f.model}: ${f.error}`));
  }
  
  return loadedModels.length > 0;
};

// ============================================
// FIX FOR AccountApplication MODEL SCHEMA ISSUE
// ============================================

const fixAccountApplicationSchema = async () => {
  console.log('\n🔧 Checking AccountApplication schema...');
  
  try {
    // First, check what columns exist in the database
    const tableInfo = await sequelize.query(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'account_applications'
      AND TABLE_SCHEMA = DATABASE()
      ORDER BY ORDINAL_POSITION
    `, { type: sequelize.QueryTypes.SELECT });
    
    console.log(`📋 Found ${tableInfo.length} columns in account_applications table`);
    
    // List of columns that should exist according to the model
    const requiredColumns = [
      'approved_by', 'approved_at', 'rejected_by', 'rejected_at',
      'branch_name', 'user_id'
    ];
    
    const existingColumns = tableInfo.map(col => col.COLUMN_NAME);
    const missingColumns = requiredColumns.filter(col => !existingColumns.includes(col));
    
    if (missingColumns.length > 0) {
      console.log(`⚠️  Missing columns: ${missingColumns.join(', ')}`);
      
      // Add missing columns
      for (const column of missingColumns) {
        try {
          let columnDefinition = '';
          
          switch (column) {
            case 'approved_by':
            case 'rejected_by':
            case 'user_id':
              columnDefinition = 'VARCHAR(100) NULL';
              break;
            case 'branch_name':
              columnDefinition = 'VARCHAR(255) NULL';
              break;
            case 'approved_at':
            case 'rejected_at':
              columnDefinition = 'DATETIME NULL';
              break;
            default:
              columnDefinition = 'VARCHAR(255) NULL';
          }
          
          await sequelize.query(`
            ALTER TABLE account_applications 
            ADD COLUMN ${column} ${columnDefinition}
          `);
          
          console.log(`   ✅ Added column: ${column}`);
        } catch (alterError) {
          console.log(`   ⚠️  Failed to add column ${column}: ${alterError.message}`);
        }
      }
    } else {
      console.log('✅ All required columns exist');
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error checking AccountApplication schema:', error.message);
    return false;
  }
};

// ============================================
// SAFE DATABASE SYNC WITH COLUMN FIXES
// ============================================

const syncDatabaseSafely = async () => {
  console.log('\n🔄 Synchronizing database...');
  
  try {
    // Fix AccountApplication schema first
    await fixAccountApplicationSchema();
    
    // Get all loaded models
    const modelNames = Object.keys(sequelize.models);
    console.log(`📋 Found ${modelNames.length} models to sync`);
    
    if (modelNames.length === 0) {
      console.log('⚠️  No models found to sync');
      return true;
    }
    
    // List of models that are known to have issues
    const skipModels = [
      'LoanDisbursement', // Missing ACCT_NO column
      'Counter', // Missing created_at, updated_at columns
      'DepositTransaction', 
      'AML'
    ];
    
    let successCount = 0;
    let errorCount = 0;
    
    // Sync models one by one
    for (const modelName of modelNames) {
      if (skipModels.includes(modelName)) {
        console.log(`   ⏭️  Skipping ${modelName} (known issues)`);
        continue;
      }
      
      try {
        console.log(`   🔄 Syncing ${modelName}...`);
        
        // Use safer sync options - don't alter in production
        const syncOptions = {
          alter: NODE_ENV === 'development' && AUTO_SYNC_DB,
          force: false
        };
        
        // This will create the table if it doesn't exist
        await sequelize.models[modelName].sync(syncOptions);
        console.log(`   ✅ ${modelName} synced`);
        successCount++;
      } catch (modelError) {
        console.log(`   ❌ ${modelName} sync failed: ${modelError.message}`);
        errorCount++;
      }
    }
    
    console.log(`\n📊 Sync summary:`);
    console.log(`   ✅ Success: ${successCount} models`);
    console.log(`   ❌ Errors: ${errorCount} models`);
    console.log(`   ⏭️  Skipped: ${skipModels.length} models`);
    
    return successCount > 0;
    
  } catch (error) {
    console.error('❌ Database sync failed:', error.message);
    return false;
  }
};

// ============================================
// ATTACH DATABASE TO REQUESTS (CRITICAL!)
// ============================================

console.log('\n🔗 Attaching database to requests...');

// This middleware MUST come before any routes
app.use((req, res, next) => {
  console.log(`📡 Request received for: ${req.method} ${req.path}`);
  
  // Attach sequelize instance to all requests
  req.sequelize = sequelize;
  req.db = {
    sequelize: sequelize,
    models: sequelize.models || {},
    query: async (sql, params = []) => {
      const [results] = await sequelize.query(sql, { replacements: params });
      return results;
    },
    execute: async (sql, params = []) => {
      const [results] = await sequelize.query(sql, { replacements: params });
      return results;
    }
  };
  
  console.log(`✅ Database attached to request. Models available: ${Object.keys(sequelize.models || {}).length}`);
  next();
});

// ============================================
// MOUNT DRAWER ROUTES
// ============================================

console.log('\n🔗 Loading Drawer Routes...');

try {
  const drawerRoutesModule = await import('./src/routes/DrawerRoutes.js');
  const drawerRoutes = drawerRoutesModule.default;
  
  // Test middleware before routes
  drawerRoutes.use((req, res, next) => {
    console.log(`🎯 Drawer route hit: ${req.method} ${req.path}`);
    console.log(`📊 Has sequelize: ${!!req.sequelize}`);
    console.log(`📊 Has db: ${!!req.db}`);
    next();
  });
  
  app.use('/api/drawer', drawerRoutes);
  console.log('✅ Drawer Routes mounted at /api/drawer');
  
} catch (error) {
  console.error('❌ Failed to load Drawer Routes:', error.message);
  console.error('Error stack:', error.stack);
}

// ============================================
// DATABASE ATTACHMENT MIDDLEWARE (CRITICAL FIX)
// ============================================

console.log('\n🔗 ADDING DATABASE MIDDLEWARE...');

// This middleware MUST come BEFORE any routes
const attachDatabaseMiddleware = (req, res, next) => {
  console.log(`🔗 Database middleware executing for: ${req.method} ${req.originalUrl}`);
  
  // Attach sequelize to request
  req.sequelize = sequelize;
  req.db = {
    sequelize: sequelize,
    models: sequelize.models || {},
    query: async (sql, params) => {
      const [results] = await sequelize.query(sql, { replacements: params });
      return results;
    }
  };
  
  console.log(`✅ Database attached. Models available: ${Object.keys(sequelize.models || {}).length}`);
  next();
};

// Apply to ALL requests
app.use(attachDatabaseMiddleware);

// Or apply only to API routes
// app.use('/api', attachDatabaseMiddleware);

// Test endpoint
app.get('/api/debug-middleware', (req, res) => {
  console.log('Debug middleware endpoint called');
  res.json({
    success: true,
    hasSequelize: !!req.sequelize,
    hasDb: !!req.db,
    middlewareExecuted: true,
    timestamp: new Date().toISOString()
  });
});

// ============================================
// DATABASE SCHEMA REPAIR FUNCTION
// ============================================

const repairDatabaseSchema = async () => {
  console.log('\n🔧 Checking and repairing database schema...');
  
  const repairs = [];
  
  try {
    // 1. Fix counters table
    try {
      await sequelize.query(`
        ALTER TABLE counters 
        ADD COLUMN IF NOT EXISTS created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        ADD COLUMN IF NOT EXISTS description VARCHAR(255) NULL
      `);
      repairs.push('✅ Counters table fixed');
    } catch (error) {
      repairs.push(`⚠️  Counters: ${error.message}`);
    }
    
    // 2. Check account_applications table
    try {
      const [appColumns] = await sequelize.query(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'account_applications'
        AND TABLE_SCHEMA = DATABASE()
      `);
      
      const appColumnNames = appColumns.map(col => col.COLUMN_NAME);
      const requiredAppColumns = ['approved_by', 'approved_at', 'rejected_by', 'rejected_at'];
      const missingAppColumns = requiredAppColumns.filter(col => !appColumnNames.includes(col));
      
      if (missingAppColumns.length > 0) {
        for (const column of missingAppColumns) {
          try {
            if (column.includes('_by')) {
              await sequelize.query(`ALTER TABLE account_applications ADD COLUMN ${column} VARCHAR(100) NULL`);
            } else if (column.includes('_at')) {
              await sequelize.query(`ALTER TABLE account_applications ADD COLUMN ${column} DATETIME NULL`);
            }
          } catch (colError) {
            // Ignore if column already exists
          }
        }
        repairs.push('✅ Account applications table updated');
      }
    } catch (error) {
      repairs.push(`⚠️  Account applications: ${error.message}`);
    }
    
    // 3. Fix loan_disbursements table (remove problematic index)
    try {
      // Check if the problematic index exists
      const [indexes] = await sequelize.query(`SHOW INDEX FROM loan_disbursements`);
      const idxAcctNoIndex = indexes.find(idx => idx.Key_name === 'idx_acct_no_unique');
      
      if (idxAcctNoIndex) {
        // First check if ACCT_NO column exists
        const [columns] = await sequelize.query(`
          SELECT COLUMN_NAME 
          FROM INFORMATION_SCHEMA.COLUMNS 
          WHERE TABLE_NAME = 'loan_disbursements'
          AND COLUMN_NAME = 'ACCT_NO'
        `);
        
        if (columns.length === 0) {
          // Column doesn't exist, drop the index
          await sequelize.query(`ALTER TABLE loan_disbursements DROP INDEX idx_acct_no_unique`);
          repairs.push('✅ Removed problematic index from loan_disbursements');
        }
      }
    } catch (error) {
      repairs.push(`⚠️  Loan disbursements: ${error.message}`);
    }
    
    console.log('\n📊 Schema repair summary:');
    repairs.forEach(repair => console.log(`   ${repair}`));
    
    return repairs.some(repair => repair.startsWith('✅'));
    
  } catch (error) {
    console.error('❌ Schema repair failed:', error.message);
    return false;
  }
};

// ============================================
// COUNTER INITIALIZATION
// ============================================

// Initialize table on startup
await SavingsProduct.initializeTable();

// Fixed: Use ensureTableExists instead of initializeTable
try {
  console.log('🚀 Auto-initializing LoanAccount table...');
  
  // Check which method exists on LoanAccount
  if (typeof LoanAccount.initializeTable === 'function') {
    console.log('📝 Using initializeTable method...');
    await LoanAccount.initializeTable();
  } else if (typeof LoanAccount.ensureTableExists === 'function') {
    console.log('📝 Using ensureTableExists method...');
    await LoanAccount.ensureTableExists();
  } else if (typeof LoanAccount.sync === 'function') {
    console.log('📝 Using sync method...');
    await LoanAccount.sync({ force: false });
  } else {
    console.log('⚠️  No initialization method found on LoanAccount, trying to sync anyway');
    try {
      await LoanAccount.sync({ force: false });
    } catch (syncError) {
      console.error('❌ Sync failed:', syncError.message);
    }
  }
  console.log('✅ LoanAccount table ready');
} catch (error) {
  console.error('❌ Error initializing LoanAccount table:', error.message);
  // Don't crash the server, just log the error
}

const initializeCounters = async () => {
  console.log('\n📊 Initializing counters...');

  // Simple sync call for LoanInterestRate
  try {
    if (LoanInterestRate && typeof LoanInterestRate.syncTable === 'function') {
      await LoanInterestRate.syncTable({ alter: true });
      console.log('✅ LoanInterestRate table ready');
    } else {
      console.log('⚠️  LoanInterestRate.syncTable not available');
    }
  } catch (err) {
    console.error('❌ LoanInterestRate table sync failed:', err.message);
  }
  
  try {
    // First check if counters table exists and has basic structure
    const [tables] = await sequelize.query("SHOW TABLES LIKE 'counters'");
    
    if (tables.length === 0) {
      console.log('⚠️  Counters table does not exist, skipping initialization');
      return false;
    }
    
    // Check what columns exist in counters table
    const [columns] = await sequelize.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'counters'
      AND TABLE_SCHEMA = DATABASE()
    `);
    
    const columnNames = columns.map(col => col.COLUMN_NAME);
    console.log(`📋 Counters table columns: ${columnNames.join(', ')}`);
    
    // Try to insert counters with only existing columns
    const countersExist = await sequelize.query(
      'SELECT COUNT(*) as count FROM counters',
      { type: sequelize.QueryTypes.SELECT }
    );
    
    if (parseInt(countersExist[0].count) === 0) {
      console.log('Creating default counters...');
      
      try {
        // Use minimal insert based on available columns
        if (columnNames.includes('name') && columnNames.includes('seq')) {
          await sequelize.query(`
            INSERT INTO counters (name, seq) VALUES
            ('customer', 1000),
            ('account', 10000),
            ('transaction', 100000),
            ('application', 1)
          `);
          console.log('✅ Default counters created');
          return true;
        } else {
          console.log('⚠️  Counters table missing required columns (name, seq)');
          return false;
        }
      } catch (sqlError) {
        console.log('Counter creation failed:', sqlError.message);
        
        // Try alternative approach - check if we need to add columns
        if (sqlError.message.includes('created_at')) {
          console.log('🔧 Attempting to fix counters table schema...');
          try {
            // Add missing timestamp columns
            await sequelize.query(`
              ALTER TABLE counters 
              ADD COLUMN IF NOT EXISTS created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              ADD COLUMN IF NOT EXISTS updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            `);
            
            // Now try inserting again
            await sequelize.query(`
              INSERT INTO counters (name, seq) VALUES
              ('customer', 1000),
              ('account', 10000),
              ('transaction', 100000),
              ('application', 1)
            `);
            console.log('✅ Counters table fixed and initialized');
            return true;
          } catch (fixError) {
            console.log('Could not fix counters table:', fixError.message);
            return false;
          }
        }
        return false;
      }
    } else {
      console.log(`📊 Found existing counters in table`);
      return true;
    }
    
  } catch (error) {
    console.error('❌ Counter initialization failed:', error.message);
    // Don't fail the whole server if counters fail
    console.log('⚠️  Continuing without counters...');
    return false;
  }
};

// ============================================
// ULTIMATE PERMISSIONS CACHE FIX
// ============================================

const fixPermissionsCacheGlobally = () => {
  console.log('🔧 Installing global MySQL query patch...');
  
  try {
    // Get the mysql2 module
    const mysql = require('mysql2');
    
    // 1. Patch createPool method
    const originalCreatePool = mysql.createPool;
    
    mysql.createPool = function(config) {
      const pool = originalCreatePool.call(this, config);
      
      // Patch the query method
      const originalQuery = pool.query;
      
      pool.query = function(sql, values, callback) {
        // Fix ALL roles queries
        if (typeof sql === 'string') {
          // Fix: SELECT role_id, role_name FROM roles WHERE active = 1
          if (sql.includes('SELECT role_id, role_name') && sql.includes('FROM roles') && sql.includes('WHERE active = 1')) {
            console.log('🔴 INTERCEPTED AND PATCHING ROLES QUERY:', sql.substring(0, 100) + '...');
            
            // Use the roles_vw view
            sql = `
              SELECT 
                role_id, 
                role_name, 
                permissions, 
                description,
                active
              FROM roles_vw
              WHERE active = 1
            `;
          }
          // Also fix any other variations
          else if (sql.includes('SELECT role_id, role_name FROM roles')) {
            console.log('🔴 INTERCEPTED ROLES QUERY (variation):', sql.substring(0, 100) + '...');
            sql = `
              SELECT 
                role_id, 
                role_name, 
                permissions, 
                description,
                active
              FROM roles_vw
              WHERE active = 1
            `;
          }
          // Fix: SELECT role_id, role_name, permissions, description FROM roles WHERE active = 1
          else if (sql.includes('role_id, role_name, permissions, description') && sql.includes('FROM roles')) {
            console.log('🔴 INTERCEPTED FULL ROLES QUERY');
            sql = `
              SELECT 
                role_id, 
                role_name, 
                permissions, 
                description,
                active
              FROM roles_vw
              WHERE active = 1
            `;
          }
        }
        
        return originalQuery.call(this, sql, values, callback);
      };
      
      return pool;
    };
    
    // 2. Also patch createConnection for direct connections
    const originalCreateConnection = mysql.createConnection;
    
    mysql.createConnection = function(config) {
      const connection = originalCreateConnection.call(this, config);
      
      const originalQuery = connection.query;
      connection.query = function(sql, values, callback) {
        if (typeof sql === 'string' && sql.includes('SELECT role_id, role_name FROM roles')) {
          console.log('🔴 INTERCEPTED CONNECTION ROLES QUERY');
          sql = `
            SELECT 
              role_id, 
              role_name, 
              permissions, 
              description,
              active
            FROM roles_vw
            WHERE active = 1
          `;
        }
        return originalQuery.call(this, sql, values, callback);
      };
      
      return connection;
    };
    
    // 3. Patch Sequelize queries too
    if (sequelize && sequelize.query) {
      const originalSequelizeQuery = sequelize.query;
      
      sequelize.query = function(sql, options) {
        if (typeof sql === 'string') {
          if (sql.includes('SELECT role_id, role_name FROM roles')) {
            console.log('🔴 INTERCEPTED SEQUELIZE ROLES QUERY');
            sql = `
              SELECT 
                role_id, 
                role_name, 
                permissions, 
                description,
                active
              FROM roles_vw
              WHERE active = 1
            `;
          }
        }
        return originalSequelizeQuery.call(this, sql, options);
      };
    }
    
    console.log('✅ Global MySQL query patch installed');
    return true;
    
  } catch (error) {
    console.error('❌ Failed to install global patch:', error.message);
    return false;
  }
};

// Call it immediately
fixPermissionsCacheGlobally();

// ============================================
// DEBUG: TRACE THE PROBLEMATIC QUERY SOURCE
// ============================================

const traceQuerySource = () => {
  console.log('🔍 Installing query source tracer...');
  
  // Override Error.captureStackTrace to add our own trace
  const originalCaptureStackTrace = Error.captureStackTrace;
  
  Error.captureStackTrace = function(error, constructorOpt) {
    originalCaptureStackTrace(error, constructorOpt);
    
    // Create a custom error for SQL queries
    if (error.message && error.message.includes('Unknown column')) {
      console.log('🔴 CAPTURED SQL ERROR STACK:');
      console.log(error.stack);
      
      // Also log the current call stack
      console.log('🔴 CURRENT CALL STACK:');
      const stack = new Error().stack;
      console.log(stack);
    }
  };
  
  // Also monkey-patch console.error to catch SQL errors
  const originalConsoleError = console.error;
  
  console.error = function(...args) {
    if (args[0] && typeof args[0] === 'string' && args[0].includes('Unknown column')) {
      console.log('🔴 CAUGHT SQL ERROR IN CONSOLE:');
      console.log(args[0]);
      
      // Log stack trace
      const stack = new Error().stack;
      console.log('🔴 ERROR STACK TRACE:');
      console.log(stack);
    }
    return originalConsoleError.apply(console, args);
  };
  
  console.log('✅ Query source tracer installed');
};

// ============================================
// CUSTOMER APPROVAL SYSTEM INITIALIZATION
// ============================================

const initCustomerApprovalSystem = async () => {
  console.log('\n🎯 Initializing Customer Approval System...');
  
  try {
    // Import the initialization function
    const { initializeCustomerApprovalSystem } = await import('./src/controllers/CustomerController.js');
    
    const success = await initializeCustomerApprovalSystem();
    
    if (success) {
      console.log('✅ Customer approval system ready');
    } else {
      console.warn('⚠️ Customer approval system initialization had issues');
    }
    
    return success;
  } catch (error) {
    console.error('❌ Failed to initialize customer approval system:', error.message);
    
    if (error.message.includes("Cannot find module") || 
        error.message.includes("initializeCustomerApprovalSystem is not a function")) {
      console.log('ℹ️  Customer approval functions not available, using fallback');
      
      // Create basic customer table structure if needed
      try {
        await sequelize.query(`
          CREATE TABLE IF NOT EXISTS customers (
            id INT AUTO_INCREMENT PRIMARY KEY,
            CUST_ID VARCHAR(50) UNIQUE NOT NULL,
            CUST_NO VARCHAR(50),
            CUST_NM VARCHAR(255),
            FIRST_NAME VARCHAR(100),
            LAST_NAME VARCHAR(100),
            EMAIL_ADDRESS VARCHAR(255),
            PHONE_NO VARCHAR(20),
            REC_ST VARCHAR(20) DEFAULT 'PENDING',
            status VARCHAR(20) DEFAULT 'Pending',
            APPROVED_BY VARCHAR(100),
            APPROVED_DT DATETIME,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
            updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
          )
        `);
        console.log('✅ Basic customers table ensured');
        return true;
      } catch (createError) {
        console.error('Failed to create customers table:', createError.message);
        return false;
      }
    }
    
    console.error('Error stack:', error.stack);
    return false;
  }
};

// Simple debug middleware - add this AFTER all route mounting
app.use((req, res, next) => {
  console.log(`\n=== Route Debug ===`);
  console.log(`Request: ${req.method} ${req.originalUrl}`);
  console.log(`Path: ${req.path}`);
  console.log(`Base URL: ${req.baseUrl}`);
  
  // Check if this is the thrift banking route
  if (req.originalUrl.includes('thrift-banking')) {
    console.log('⚠️ This is a thrift-banking request');
    console.log('Looking for:', req.originalUrl);
  }
  
  next();
});

// ============================================
// MAIN SERVER STARTUP
// ============================================

const startServer = async () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 STARTING EVOLUTION BANKING BACKEND SERVER');
  console.log('='.repeat(60));
  console.log(`Environment: ${NODE_ENV}`);
  console.log(`Port: ${PORT}`);
  console.log(`Host: ${HOST}`);
  console.log(`Auto Sync: ${AUTO_SYNC_DB}`);
  console.log(`Database: ${process.env.DB_NAME || 'core_banking'}`);
  
  try {
    // STEP 1: Connect to database
    console.log('\n🔌 Connecting to database...');
    await sequelize.authenticate();
    console.log('✅ Database connected');
    
    // Check database health
    const dbHealth = await checkDatabaseHealth();
    console.log('📊 Database health:', dbHealth.status);
    
    // STEP 1.5: Emergency table creation if needed
    console.log('\n🆘 Emergency table check...');
    const tablesCreated = await createMissingTables();
    if (tablesCreated) {
      console.log('✅ Emergency tables created/verified');
    }
    
    // STEP 2: Repair schema before loading models
    console.log('\n🔧 Checking database schema...');
    await repairDatabaseSchema();
    
    // STEP 3: Load models
    console.log('\n📦 Loading models...');
    const modelsLoaded = await loadModelsSafely();
    
    if (!modelsLoaded && NODE_ENV === 'production') {
      console.error('❌ Cannot start in production without models');
      process.exit(1);
    }
    
    // STEP 4: Sync database (more permissive now)
    const dbSynced = await syncDatabaseSafely();
    
    if (!dbSynced && NODE_ENV === 'production') {
      console.error('❌ Cannot start in production without database sync');
      process.exit(1);
    }
    
    // STEP 5: Initialize counters (with better error handling)
    console.log('\n📊 Initializing system data...');
    const countersInitialized = await initializeCounters();
    
    // STEP 6: Initialize Customer Approval System
    console.log('\n🎯 Initializing business systems...');
    const approvalSystemReady = await initCustomerApprovalSystem();
    
    // STEP 7: Attach database to app requests
    app.use((req, res, next) => {
      req.db = {
        sequelize,
        getSequelize: () => sequelize,
        models: sequelize.models || {},
        countersInitialized,
        approvalSystemReady
      };
      next();
    });
    
    // Add a test endpoint to verify database connection
    app.get('/api/test-db', async (req, res) => {
      try {
        const [results] = await sequelize.query('SELECT 1 as test, NOW() as timestamp');
        res.json({ 
          success: true, 
          database: 'Connected', 
          result: results[0],
          dbHealth: await checkDatabaseHealth()
        });
      } catch (error) {
        res.status(500).json({ 
          success: false, 
          error: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    });
    
    // STEP 8: Start HTTP server
    console.log('\n🌐 Starting HTTP server...');
    
    const networkIP = (() => {
      try {
        const interfaces = os.networkInterfaces();
        for (const name of Object.keys(interfaces)) {
          for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
              return iface.address;
            }
          }
        }
      } catch (error) {
        // Ignore
      }
      return 'localhost';
    })();
    
    const server = app.listen(PORT, HOST, () => {
      console.log(`
╔════════════════════════════════════════════════════════════════════════╗
║                    Evolution Banking System API                       ║
╠════════════════════════════════════════════════════════════════════════╣
║  Status:      ${'✅ RUNNING'.padEnd(48)}                                ║
║  Time:        ${new Date().toLocaleString().padEnd(48)}                ║
║  Environment: ${NODE_ENV.padEnd(48)}                                  ║
║  Database:    ${'✅ Connected'.padEnd(48)}                             ║
║  DB Health:   ${dbHealth.status.padEnd(48)}                           ║
║  Models:      ${(modelsLoaded ? '✅ Loaded' : '⚠️  Partial').padEnd(48)}  ║
║  Sync:        ${(dbSynced ? '✅ Complete' : '⚠️  Partial').padEnd(48)}    ║
║  Counters:    ${(countersInitialized ? '✅ Initialized' : '⚠️  Partial').padEnd(48)} ║
║  Approval Sys:${(approvalSystemReady ? '✅ Ready' : '⚠️  Issues').padEnd(48)}  ║
║  Auto Sync:   ${(AUTO_SYNC_DB ? '✅ Enabled' : '❌ Disabled').padEnd(48)}  ║
║                                                                        ║
║  Server URLs:                                                         ║
║  ─────────────────────────────────────────────────────────────────────║
║  Local:       http://localhost:${PORT}                                   ║
║  Network:     http://${networkIP}:${PORT}                                 ║
║                                                                        ║
║  Health:      http://localhost:${PORT}/health                           ║
║  Test DB:     http://localhost:${PORT}/api/test-db                      ║
╚════════════════════════════════════════════════════════════════════════╝
      `);
    });
    
    // STEP 9: Setup graceful shutdown
    const shutdown = (signal) => {
      console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);
      
      server.close(() => {
        console.log('✅ HTTP server closed');
        
        sequelize.close()
          .then(() => {
            console.log('✅ Database connections closed');
            process.exit(0);
          })
          .catch(error => {
            console.error('⚠️  Error closing database:', error.message);
            process.exit(0);
          });
      });
      
      setTimeout(() => {
        console.error('⏰ Shutdown timeout, forcing exit');
        process.exit(1);
      }, 10000);
    };
    
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    
    process.on('uncaughtException', (error) => {
      console.error('🚨 Uncaught Exception:', error.message);
      if (error.stack) console.error(error.stack);
      shutdown('UNCAUGHT_EXCEPTION');
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error('🚨 Unhandled Rejection at:', promise);
      console.error('Reason:', reason);
    });
    
  } catch (error) {
    console.error('\n❌ Server startup failed:', error.message);
    console.error('Error stack:', error.stack);
    
    if (NODE_ENV === 'production') {
      console.error('🚨 Production startup failed - exiting');
      process.exit(1);
    } else {
      console.log('⚠️  Development mode - trying to start server anyway');
      
      try {
        const server = app.listen(PORT, HOST, () => {
          console.log(`
╔══════════════════════════════════════════════════════════╗
║          Evolution Banking System API                    ║
╠══════════════════════════════════════════════════════════╣
║  ⚠️  STARTED WITH ERRORS                                ║
║     http://localhost:${PORT}                               ║
║                                                          ║
║  🔗 Health: http://localhost:${PORT}/health               ║
║  🔗 Test DB: http://localhost:${PORT}/api/test-db         ║
╚══════════════════════════════════════════════════════════╝
          `);
        });
      } catch (startError) {
        console.error('❌ Could not start server at all:', startError.message);
        process.exit(1);
      }
    }
  }
};

// ============================================
// EXPORT AND START SERVER
// ============================================

// Start the server
if (process.env.NODE_ENV !== 'test') {
  startServer();
}

export default app;