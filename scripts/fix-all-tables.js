// fix-sync.js - UPDATED WITH CORRECT CUSTOMER TABLE
import { getPool } from '../config/db.js';

async function cleanSync() {
  console.log('🧹 Cleaning and syncing core tables only...\n');
  
  const pool = getPool();
  const conn = await pool.getConnection();
  
  try {
    // 1. First, check what tables exist
    console.log('1️⃣ Checking existing tables...');
    const [existingTables] = await conn.query('SHOW TABLES');
    const tableNames = existingTables.map(t => t[`Tables_in_${process.env.DB_NAME || 'core_banking'}`]);
    console.log(`   Found ${tableNames.length} tables`);
    
    // 2. Handle users table specifically
    console.log('\n2️⃣ Handling users table...');
    
    if (tableNames.includes('users')) {
      console.log('   Users table exists, checking schema...');
      
      try {
        // Check if is_active column exists
        const [columns] = await conn.query("SHOW COLUMNS FROM users LIKE 'is_active'");
        if (columns.length === 0) {
          console.log('   Adding missing column: is_active');
          await conn.query("ALTER TABLE users ADD COLUMN is_active VARCHAR(50) DEFAULT 'Active'");
        }
        
        // Check if utype column exists
        const [utypeColumns] = await conn.query("SHOW COLUMNS FROM users LIKE 'utype'");
        if (utypeColumns.length === 0) {
          console.log('   Adding missing column: utype');
          await conn.query("ALTER TABLE users ADD COLUMN utype VARCHAR(50) DEFAULT 'Staff'");
        }
        
        console.log('   ✅ Users table schema updated');
      } catch (error) {
        console.log('   ⚠️ Error updating users table:', error.message);
      }
    } else {
      // Create users table if it doesn't exist
      console.log('   Creating users table...');
      await conn.query(`
        CREATE TABLE IF NOT EXISTS users (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('   ✅ Users table created');
    }
    
    // 3. Create customers table based on your model
    console.log('\n3️⃣ Creating/checking customers table...');
    
    if (tableNames.includes('customers')) {
      console.log('   Customers table exists, checking structure...');
      
      // Check if table has correct structure, if not, recreate
      try {
        const [columns] = await conn.query("SHOW COLUMNS FROM customers LIKE 'CUST_ID'");
        if (columns.length === 0) {
          console.log('   Customers table has wrong structure, recreating...');
          await conn.query('DROP TABLE IF EXISTS customers');
          await createCustomersTable(conn);
          console.log('   ✅ Customers table recreated');
        } else {
          console.log('   ✅ Customers table has correct structure');
        }
      } catch (error) {
        console.log('   ⚠️ Error checking customers table:', error.message);
      }
    } else {
      await createCustomersTable(conn);
      console.log('   ✅ Customers table created');
    }
    
    // 4. Create other core tables
    console.log('\n4️⃣ Creating/checking other core tables...');
    
    const coreTables = [
      {
        name: 'accounts',
        sql: `CREATE TABLE IF NOT EXISTS accounts (
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
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      },
      {
        name: 'counters',
        sql: `CREATE TABLE IF NOT EXISTS counters (
          _id VARCHAR(50) PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          seq INT NOT NULL DEFAULT 1,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
      }
    ];
    
    for (const table of coreTables) {
      if (!tableNames.includes(table.name)) {
        await conn.query(table.sql);
        console.log(`   ✅ Created ${table.name} table`);
      } else {
        console.log(`   ⏭️ ${table.name} table already exists`);
      }
    }
    
    // 5. Check and create admin user
    console.log('\n5️⃣ Checking admin user...');
    await createOrUpdateAdminUser(conn);
    
    // 6. Insert default counters
    console.log('\n6️⃣ Setting up counters...');
    await setupCounters(conn);
    
    // 7. Create a test customer
    console.log('\n7️⃣ Creating test customer...');
    await createTestCustomer(conn);
    
    console.log('\n✅ Database sync completed successfully!');
    
    // 8. Show final status
    await showDatabaseStatus(conn);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    conn.release();
    await pool.end();
  }
}

// Helper function to create customers table
async function createCustomersTable(conn) {
  await conn.query(`
    CREATE TABLE customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      CUST_ID VARCHAR(50) NOT NULL UNIQUE COMMENT 'Customer ID',
      CUST_NO VARCHAR(50) NOT NULL UNIQUE COMMENT 'Customer number',
      TITLE_ID VARCHAR(10) COMMENT 'Title (Mr, Mrs, Dr, etc.)',
      FIRST_NAME VARCHAR(100) COMMENT 'First name',
      MIDDLE_NAME VARCHAR(100) COMMENT 'Middle name',
      LAST_NAME VARCHAR(100) COMMENT 'Last name',
      CUST_NM VARCHAR(255) COMMENT 'Customer full name',
      HOME_ADDRESS VARCHAR(500) NOT NULL COMMENT 'Home address',
      EMAIL_ADDRESS VARCHAR(255) COMMENT 'Email address',
      BU_ID VARCHAR(50) NOT NULL COMMENT 'Business unit ID',
      MAIDEN_NM VARCHAR(100) COMMENT 'Maiden name',
      BIRTH_DT DATE COMMENT 'Birth date',
      CNTRY_OF_BIRTH_ID VARCHAR(10) DEFAULT 'NGA' COMMENT 'Country of birth ID',
      CUST_CAT VARCHAR(50) COMMENT 'Customer category',
      CAMPAIGN_ID VARCHAR(50) COMMENT 'Campaign ID',
      GENDER_TY VARCHAR(10) COMMENT 'Gender type',
      NIN VARCHAR(11) COMMENT 'National Identity Number (11 digits)',
      BVN VARCHAR(11) UNIQUE COMMENT 'Bank Verification Number (11 digits)',
      COUNTRY_NM VARCHAR(100) DEFAULT 'Nigeria' COMMENT 'Country name',
      STATE VARCHAR(100) COMMENT 'State',
      LOCAL_GOV VARCHAR(100) COMMENT 'Local government',
      OPENING_RSN_ID VARCHAR(50) COMMENT 'Opening reason ID',
      OPENED_DT DATE COMMENT 'Account opened date',
      RESIDENT_CNTRY_ID VARCHAR(10) DEFAULT 'NGA' COMMENT 'Resident country ID',
      RISK_CLASS VARCHAR(50) COMMENT 'Risk class',
      STMNT_FREQ_CD VARCHAR(10) COMMENT 'Statement frequency code',
      STMNT_FREQ_VALUE INT COMMENT 'Statement frequency value',
      CREATED_BY VARCHAR(100) COMMENT 'Created by user',
      USER_ID VARCHAR(50) COMMENT 'User ID',
      CREATE_DT DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'Create date',
      INDUSTRY_ID VARCHAR(50) COMMENT 'Industry ID',
      INDUSTRY_CD VARCHAR(50) COMMENT 'Industry code',
      TAX_STATUS VARCHAR(50) COMMENT 'Tax status',
      MARITAL_ST VARCHAR(20) COMMENT 'Marital status',
      TAX_GRP_ID VARCHAR(50) COMMENT 'Tax group ID',
      OPERATIONS_CRNCY_ID VARCHAR(10) DEFAULT 'NGN' COMMENT 'Operations currency ID',
      EMP_ST VARCHAR(50) COMMENT 'Employment status',
      ORGANISATION_NM VARCHAR(255) COMMENT 'Organization name',
      REGISTRATION_ADDRESS VARCHAR(500) COMMENT 'Registration address',
      REGISTRATION_DT DATE COMMENT 'Registration date',
      ALERT_DELIVERY_METHOD VARCHAR(50) COMMENT 'Alert delivery method',
      KYC_LEVEL VARCHAR(50) COMMENT 'KYC level',
      PHONE_NO VARCHAR(20) COMMENT 'Phone number',
      SMS VARCHAR(20) COMMENT 'SMS number',
      REC_ST VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'Record status (uppercase)',
      status VARCHAR(20) NOT NULL DEFAULT 'Pending' COMMENT 'Status (lowercase for compatibility)',
      EVENT_ID VARCHAR(50) COMMENT 'Event ID',
      IS_PEP BOOLEAN NOT NULL DEFAULT false COMMENT 'Is Politically Exposed Person',
      SANCTION_SCORE INT COMMENT 'Sanction score',
      DOCUMENT_VERIFICATION_STATUS VARCHAR(50) DEFAULT 'Pending' COMMENT 'Document verification status',
      APPROVED_BY VARCHAR(100) COMMENT 'Approved by user',
      APPROVED_DT DATETIME COMMENT 'Approval date',
      SUSPENDED_BY VARCHAR(100) COMMENT 'Suspended by user',
      SUSPENDED_DT DATETIME COMMENT 'Suspension date',
      SUSPENSION_REASON TEXT COMMENT 'Suspension reason',
      CLOSED_BY VARCHAR(100) COMMENT 'Closed by user',
      CLOSED_DT DATETIME COMMENT 'Closure date',
      CLOSURE_REASON TEXT COMMENT 'Closure reason',
      REJECTED_BY VARCHAR(100) COMMENT 'Rejected by user',
      REJECTED_DT DATETIME COMMENT 'Rejection date',
      REJECTION_REASON TEXT COMMENT 'Rejection reason',
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      
      -- Indexes matching your model
      INDEX idx_cust_id (CUST_ID),
      INDEX idx_cust_no (CUST_NO),
      INDEX idx_bvn (BVN),
      INDEX idx_nin (NIN),
      INDEX idx_email (EMAIL_ADDRESS),
      INDEX idx_phone (PHONE_NO),
      INDEX idx_first_name (FIRST_NAME),
      INDEX idx_last_name (LAST_NAME),
      INDEX idx_cust_nm (CUST_NM),
      INDEX idx_rec_st (REC_ST),
      INDEX idx_status (status),
      INDEX idx_bu_id (BU_ID),
      INDEX idx_rec_st_create_dt (REC_ST, CREATE_DT),
      INDEX idx_bu_id_rec_st (BU_ID, REC_ST),
      INDEX idx_kyc_level_rec_st (KYC_LEVEL, REC_ST),
      INDEX idx_is_pep_rec_st (IS_PEP, REC_ST)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

// Helper function to create or update admin user
async function createOrUpdateAdminUser(conn) {
  try {
    const [existingAdmin] = await conn.query("SELECT COUNT(*) as count FROM users WHERE username = 'admin'");
    
    if (existingAdmin[0].count === 0) {
      // Hash password for 'admin123'
      const bcrypt = await import('bcrypt');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await conn.query(`
        INSERT INTO users (
          user_id, username, user_name, password, email, first_name, last_name, 
          status, isAdmin, roles, primary_business_role, branch, is_active, utype
        ) VALUES (
          1001, 
          'admin', 
          'admin', 
          ?, 
          'admin@evolutionbanking.com',
          'System',
          'Administrator',
          'Active',
          TRUE,
          JSON_ARRAY('admin', 'superuser'),
          'Administrator',
          1,
          'Active',
          'Staff'
        )
      `, [hashedPassword]);
      console.log('   ✅ Created admin user (password: admin123)');
    } else {
      console.log('   ✅ Admin user already exists');
      
      // Update admin user to ensure it has correct permissions
      const bcrypt = await import('bcrypt');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await conn.query(`
        UPDATE users SET 
          password = ?,
          isAdmin = TRUE,
          status = 'Active',
          roles = JSON_ARRAY('admin', 'superuser'),
          primary_business_role = 'Administrator',
          branch = 1,
          is_active = 'Active',
          utype = 'Staff'
        WHERE username = 'admin'
      `, [hashedPassword]);
      console.log('   ✅ Updated admin user permissions');
    }
  } catch (error) {
    console.log('   ⚠️ Error with admin user:', error.message);
  }
}

// Helper function to setup counters
async function setupCounters(conn) {
  const counters = [
    { id: 'customerId', name: 'Customer ID', seq: 1000, description: 'Generates customer IDs' },
    { id: 'accountNo', name: 'Account Number', seq: 100000, description: 'Generates account numbers' },
    { id: 'transactionId', name: 'Transaction ID', seq: 10000, description: 'Generates transaction IDs' },
    { id: 'loanId', name: 'Loan ID', seq: 1000, description: 'Generates loan IDs' }
  ];
  
  for (const counter of counters) {
    try {
      await conn.query(`
        INSERT INTO counters (_id, name, seq, description) 
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE seq = VALUES(seq), description = VALUES(description)
      `, [counter.id, counter.name, counter.seq, counter.description]);
      console.log(`   ✅ Counter: ${counter.name}`);
    } catch (error) {
      console.log(`   ⚠️ Error with counter ${counter.name}:`, error.message);
    }
  }
}

// Helper function to create a test customer
async function createTestCustomer(conn) {
  try {
    const [existingCustomer] = await conn.query("SELECT COUNT(*) as count FROM customers WHERE CUST_NO = 'CUST001'");
    
    if (existingCustomer[0].count === 0) {
      await conn.query(`
        INSERT INTO customers (
          CUST_ID, CUST_NO, TITLE_ID, FIRST_NAME, LAST_NAME, CUST_NM,
          HOME_ADDRESS, EMAIL_ADDRESS, BU_ID, BIRTH_DT, GENDER_TY,
          NIN, BVN, COUNTRY_NM, STATE, PHONE_NO, REC_ST, status,
          KYC_LEVEL, IS_PEP, CREATED_BY, CREATE_DT
        ) VALUES (
          'CUST001', 'CUST001', 'Mr', 'John', 'Doe', 'John Doe',
          '123 Main Street, Lagos', 'john.doe@example.com', 'BU001',
          '1985-05-15', 'Male', '12345678901', '09876543219',
          'Nigeria', 'Lagos', '+2348012345678', 'ACTIVE', 'Active',
          'COMPLETE', false, 'system', NOW()
        )
      `);
      console.log('   ✅ Created test customer: John Doe (CUST001)');
    } else {
      console.log('   ✅ Test customer already exists');
    }
  } catch (error) {
    console.log('   ⚠️ Error creating test customer:', error.message);
  }
}

// Helper function to show database status
async function showDatabaseStatus(conn) {
  try {
    const [tables] = await conn.query('SHOW TABLES');
    console.log(`\n📊 Total tables: ${tables.length}`);
    
    for (const table of tables) {
      const tableName = table[`Tables_in_${process.env.DB_NAME || 'core_banking'}`];
      const [count] = await conn.query(`SELECT COUNT(*) as total FROM ${tableName}`);
      console.log(`   - ${tableName}: ${count[0].total} records`);
    }
    
    // Show sample data
    console.log('\n👤 Sample users:');
    const [users] = await conn.query(`
      SELECT id, username, user_name, email, first_name, last_name, 
             status, isAdmin, created_at 
      FROM users 
      LIMIT 3
    `);
    
    users.forEach(user => {
      console.log(`   ${user.username} (${user.email}) - ${user.status} ${user.isAdmin ? '[Admin]' : ''}`);
    });
    
    console.log('\n👥 Sample customers:');
    const [customers] = await conn.query(`
      SELECT id, CUST_ID, CUST_NO, FIRST_NAME, LAST_NAME, EMAIL_ADDRESS,
             PHONE_NO, REC_ST, status, CREATE_DT
      FROM customers 
      LIMIT 3
    `);
    
    customers.forEach(customer => {
      console.log(`   ${customer.CUST_NO}: ${customer.FIRST_NAME} ${customer.LAST_NAME} - ${customer.status}`);
    });
    
  } catch (error) {
    console.log('⚠️ Error showing status:', error.message);
  }
}

cleanSync();