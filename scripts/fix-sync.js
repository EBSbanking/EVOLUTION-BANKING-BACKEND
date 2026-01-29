// fix-sync.js - UPDATED WITH CORRECT USER TABLE
import { getPool } from '../config/db.js';

async function cleanSync() {
  console.log('🧹 Cleaning and syncing core tables only...\n');
  
  const pool = getPool();
  const conn = await pool.getConnection();
  
  try {
    // 1. Drop problematic foreign key constraints
    console.log('1️⃣ Dropping problematic foreign keys...');
    
    // List of tables with FK issues
    const problematicTables = [
      'loan_products',
      'loan_interest_rates',
      'term_deposits',
      'insurance_policies',
      'identification_information',
      'drawer_currency_denominations',
      'drawer_user_roles',
      'drawer_reassignments',
      'loan_events',
      'pending_gl_transactions',
      'glaccount_seg',
      'loan_account_summaries'
    ];
    
    for (const table of problematicTables) {
      try {
        const [rows] = await conn.query(`
          SELECT CONSTRAINT_NAME 
          FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
          WHERE TABLE_SCHEMA = 'core_banking' 
          AND TABLE_NAME = '${table}' 
          AND REFERENCED_TABLE_NAME IS NOT NULL
        `);
        
        for (const row of rows) {
          await conn.query(`ALTER TABLE ${table} DROP FOREIGN KEY ${row.CONSTRAINT_NAME}`);
          console.log(`   Dropped FK: ${table}.${row.CONSTRAINT_NAME}`);
        }
      } catch (error) {
        // Table might not exist
      }
    }
    
    // 2. Create core tables manually - UPDATED USERS TABLE
    console.log('\n2️⃣ Creating core tables...');
    
    const coreTables = [
      // Users and Authentication - UPDATED TO MATCH YOUR MODEL
      `CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNIQUE,
        username VARCHAR(255) UNIQUE,
        user_name VARCHAR(255) UNIQUE,
        password VARCHAR(255) NOT NULL,
        default_password VARCHAR(255) COMMENT 'Stores hashed default password for first login check',
        passwordHistory JSON DEFAULT (JSON_ARRAY()),
        passwordChangedAt DATETIME,
        password_expiry_date DATETIME COMMENT 'Password expires after 90 days by default',
        temp_password_token VARCHAR(255),
        temp_token_expire DATETIME,
        is_first_login BOOLEAN DEFAULT TRUE,
        force_password_change BOOLEAN DEFAULT FALSE,
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        middle_name VARCHAR(255),
        preferred_name VARCHAR(255),
        job_title VARCHAR(255),
        email VARCHAR(255) UNIQUE,
        employer_number VARCHAR(255),
        customer_number VARCHAR(255),
        roles JSON DEFAULT (JSON_ARRAY()),
        primary_role VARCHAR(255),
        BU_ROLE_ID VARCHAR(255),
        primary_business_role VARCHAR(255) DEFAULT 'Staff',
        main_business_unit VARCHAR(255),
        responsibility_centre VARCHAR(255),
        branch INT,
        start_date DATETIME,
        expiry_date DATETIME,
        earliest_login_time TIME DEFAULT '00:00:00',
        latest_login_time TIME DEFAULT '23:59:59',
        internal_employee_enabled BOOLEAN DEFAULT FALSE,
        enable_multi_session BOOLEAN DEFAULT FALSE,
        validate_ip_address BOOLEAN DEFAULT FALSE,
        ip_address VARCHAR(255),
        is_supervisor BOOLEAN DEFAULT FALSE,
        is_main_BU BOOLEAN DEFAULT FALSE,
        status ENUM('Active', 'Deactivated', 'ForceLocked') DEFAULT 'Active',
        failed_attempts INT DEFAULT 0,
        lock_until DATETIME,
        reset_token VARCHAR(255),
        session_token VARCHAR(255),
        token VARCHAR(255),
        current_sessions JSON DEFAULT (JSON_ARRAY()),
        login_history JSON DEFAULT (JSON_ARRAY()),
        force_lock_reason VARCHAR(255),
        force_locked_by INT,
        force_locked_at DATETIME,
        last_login DATETIME,
        last_updated DATETIME,
        created_by INT,
        updated_by INT,
        businessUnit VARCHAR(255),
        accessibleBusinessUnits JSON DEFAULT (JSON_ARRAY()),
        permissions JSON DEFAULT (JSON_ARRAY()),
        isAdmin BOOLEAN DEFAULT FALSE,
        is_active VARCHAR(50) DEFAULT 'Active',
        utype VARCHAR(50) DEFAULT 'Staff',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        
        INDEX idx_email (email),
        INDEX idx_username (username),
        INDEX idx_user_name (user_name),
        INDEX idx_status (status),
        INDEX idx_branch (branch),
        INDEX idx_primary_business_role (primary_business_role),
        INDEX idx_last_login (last_login),
        INDEX idx_password_expiry (password_expiry_date),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      
      // Customers
      `CREATE TABLE IF NOT EXISTS customers (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        customer_id VARCHAR(20) UNIQUE,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE,
        phone VARCHAR(20),
        address TEXT,
        date_of_birth DATE,
        gender ENUM('male', 'female', 'other'),
        status ENUM('active', 'inactive', 'pending') DEFAULT 'active',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      
      // Accounts
      `CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
        account_number VARCHAR(20) NOT NULL UNIQUE,
        customer_id VARCHAR(36) NOT NULL,
        account_type ENUM('savings', 'current', 'fixed_deposit', 'joint') DEFAULT 'savings',
        balance DECIMAL(15,2) DEFAULT 0.00,
        currency VARCHAR(3) DEFAULT 'NGN',
        status ENUM('active', 'dormant', 'closed', 'frozen') DEFAULT 'active',
        opened_date DATE,
        closed_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      
      // Counters (Fixed version)
      `CREATE TABLE IF NOT EXISTS counters (
        _id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        seq INT NOT NULL DEFAULT 1,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    ];
    
    for (const sql of coreTables) {
      await conn.query(sql);
      console.log('   ✅ Created table');
    }
    
    // 3. Insert default admin user if not exists
    console.log('\n3️⃣ Creating default admin user...');
    const [existingAdmin] = await conn.query("SELECT COUNT(*) as count FROM users WHERE username = 'admin'");
    
    if (existingAdmin[0].count === 0) {
      // Hash password for 'admin123'
      const bcrypt = await import('bcrypt');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await conn.query(`
        INSERT INTO users (
          user_id, username, user_name, password, email, first_name, last_name, 
          roles, primary_business_role, branch, status, isAdmin, is_active, utype
        ) VALUES (
          1001, 
          'admin', 
          'admin', 
          ?, 
          'admin@evolutionbanking.com',
          'System',
          'Administrator',
          JSON_ARRAY('admin', 'superuser'),
          'Administrator',
          1,
          'Active',
          TRUE,
          'Active',
          'Staff'
        )
      `, [hashedPassword]);
      console.log('   ✅ Created admin user (password: admin123)');
    } else {
      console.log('   ✅ Admin user already exists');
    }
    
    // 4. Insert default counter
    await conn.query(`
      INSERT IGNORE INTO counters (_id, name, seq, description) 
      VALUES ('customerId', 'Customer ID', 1000, 'Generates customer IDs')
    `);
    console.log('   ✅ Added default counter');
    
    console.log('\n✅ Core tables created successfully!');
    
    // 5. Show created tables
    const [tables] = await conn.query('SHOW TABLES');
    console.log(`\n📊 Total tables: ${tables.length}`);
    
    for (const table of tables) {
      const tableName = table[`Tables_in_${process.env.DB_NAME || 'core_banking'}`];
      console.log(`   - ${tableName}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    conn.release();
    await pool.end();
  }
}

cleanSync();