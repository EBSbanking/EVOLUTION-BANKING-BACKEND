// scripts/setupDatabaseDirect.js
import sequelizeInstance from '../config/db.js';
import bcrypt from 'bcrypt';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const setupDatabaseDirect = async () => {
  try {
    console.log('🚀 Setting up database directly...');
    
    // Test connection
    let sequelize;
    
    // Check different export patterns
    if (sequelizeInstance.default && sequelizeInstance.default.authenticate) {
      // If default export is sequelize instance
      sequelize = sequelizeInstance.default;
    } else if (sequelizeInstance.getSequelize && typeof sequelizeInstance.getSequelize === 'function') {
      // If there's a getSequelize function
      sequelize = sequelizeInstance.getSequelize();
    } else if (sequelizeInstance.sequelize) {
      // If sequelize is a property
      sequelize = sequelizeInstance.sequelize;
    } else if (sequelizeInstance.authenticate) {
      // If it's already the sequelize instance
      sequelize = sequelizeInstance;
    } else {
      console.error('❌ Could not find sequelize instance in db config');
      console.log('Available exports:', Object.keys(sequelizeInstance));
      process.exit(1);
    }
    
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // First, check if tables exist and drop them in correct order
    console.log('🔍 Checking existing tables...');
    try {
      // Check if user_roles table exists first (it references users and roles)
      const [tables] = await sequelize.query(`
        SELECT TABLE_NAME 
        FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = 'core_banking' 
        AND TABLE_NAME IN ('user_roles', 'customers', 'roles', 'users')
      `);
      
      if (tables.length > 0) {
        console.log('🗑️  Dropping existing tables...');
        
        // Drop tables in correct order (children first, then parents)
        const tableOrder = ['user_roles', 'customers', 'roles', 'users'];
        
        for (const table of tableOrder) {
          const tableExists = tables.some(t => t.TABLE_NAME === table);
          if (tableExists) {
            try {
              // Disable foreign key checks temporarily
              await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
              await sequelize.query(`DROP TABLE IF EXISTS ${table}`);
              await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');
              console.log(`  ✓ Dropped table: ${table}`);
            } catch (error) {
              console.log(`  ⚠️ Could not drop ${table}: ${error.message}`);
            }
          }
        }
      } else {
        console.log('📭 No existing tables found, creating fresh...');
      }
    } catch (error) {
      console.log('ℹ️ Could not check existing tables, continuing with creation...');
    }
    
    // Create essential tables directly
    
    // 1. Create users table (updated to match your User model)
    console.log('📋 Creating users table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT UNIQUE,
        username VARCHAR(100) UNIQUE,
        user_name VARCHAR(100) UNIQUE,
        password VARCHAR(255) NOT NULL,
        default_password VARCHAR(255),
        passwordHistory JSON DEFAULT (JSON_ARRAY()),
        passwordChangedAt DATETIME,
        password_expiry_date DATETIME,
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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_username (username),
        INDEX idx_email (email),
        INDEX idx_status (status),
        INDEX idx_user_name (user_name),
        INDEX idx_user_id (user_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Users table created');
    
    // 2. Create roles table
    console.log('📋 Creating roles table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        code VARCHAR(50) NOT NULL UNIQUE,
        description VARCHAR(255),
        permissions TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Roles table created');
    
    // 3. Create user_roles join table (matching your User model association)
    console.log('📋 Creating user_roles join table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS user_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        role_id INT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
        FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE ON UPDATE CASCADE,
        UNIQUE KEY unique_user_role (user_id, role_id),
        INDEX idx_user_id (user_id),
        INDEX idx_role_id (role_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ User_roles table created');
    
    // 4. Create customers table
    console.log('📋 Creating customers table...');
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        CUST_ID VARCHAR(255),
        CUST_NO VARCHAR(255),
        TITLE_ID VARCHAR(50),
        FIRST_NAME VARCHAR(255),
        MIDDLE_NAME VARCHAR(255),
        LAST_NAME VARCHAR(255),
        CUST_NM VARCHAR(255),
        HOME_ADDRESS TEXT,
        EMAIL_ADDRESS VARCHAR(255),
        BU_ID VARCHAR(100),
        MAIDEN_NM VARCHAR(255),
        BIRTH_DT DATE,
        CNTRY_OF_BIRTH_ID VARCHAR(100),
        CUST_CAT VARCHAR(100),
        CAMPAIGN_ID VARCHAR(100),
        GENDER_TY VARCHAR(50),
        COUNTRY_NM VARCHAR(100),
        STATE VARCHAR(100),
        NIN VARCHAR(50),
        BVN VARCHAR(50),
        LOCAL_GOV VARCHAR(100),
        OPENING_RSN_ID VARCHAR(100),
        OPENED_DT DATE,
        RESIDENT_CNTRY_ID VARCHAR(100),
        RISK_CLASS VARCHAR(50),
        STMNT_FREQ_CD VARCHAR(50),
        STMNT_FREQ_VALUE VARCHAR(50),
        CREATED_BY VARCHAR(255),
        USER_ID VARCHAR(255),
        CREATE_DT DATETIME,
        INDUSTRY_ID VARCHAR(100),
        INDUSTRY_CD VARCHAR(100),
        TAX_STATUS VARCHAR(50),
        MARITAL_ST VARCHAR(50),
        TAX_GRP_ID VARCHAR(100),
        OPERATIONS_CRNCY_ID VARCHAR(100),
        EMP_ST VARCHAR(50),
        ORGANISATION_NM VARCHAR(255),
        REGISTRATION_ADDRESS TEXT,
        REGISTRATION_DT DATE,
        ALERT_DELIVERY_METHOD VARCHAR(50),
        KYC_LEVEL VARCHAR(50),
        PHONE_NO VARCHAR(50),
        SMS VARCHAR(50) DEFAULT 'Enabled',
        IS_PEP BOOLEAN DEFAULT FALSE,
        SANCTION_SCORE INT DEFAULT 10,
        DOCUMENT_VERIFICATION_STATUS VARCHAR(50) DEFAULT 'Pending',
        REC_ST VARCHAR(50) DEFAULT 'PENDING',
        status VARCHAR(50) DEFAULT 'Pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_cust_id (CUST_ID),
        INDEX idx_cust_no (CUST_NO),
        INDEX idx_email (EMAIL_ADDRESS),
        INDEX idx_status (status),
        INDEX idx_phone (PHONE_NO)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log('✅ Customers table created');
    
    // Insert default roles
    console.log('🌱 Inserting default roles...');
    await sequelize.query(`
      INSERT IGNORE INTO roles (name, code, description, permissions, is_active) VALUES
      ('Admin', 'ADMIN', 'System administrator with full access', '["*"]', true),
      ('Manager', 'MANAGER', 'Manager with customer management access', '["view_customers", "create_customers", "edit_customers", "delete_customers", "approve_customers"]', true),
      ('Officer', 'OFFICER', 'Relationship officer', '["view_customers", "create_customers", "edit_customers"]', true),
      ('Viewer', 'VIEWER', 'Read-only access', '["view_customers"]', true);
    `);
    console.log('✅ Default roles inserted');
    
    // Get Admin role ID for later use
    const [adminRoleResult] = await sequelize.query(
      'SELECT id FROM roles WHERE code = ?',
      { replacements: ['ADMIN'] }
    );
    const adminRoleId = adminRoleResult.length > 0 ? adminRoleResult[0].id : null;
    
    // Get Officer role ID for later use
    const [officerRoleResult] = await sequelize.query(
      'SELECT id FROM roles WHERE code = ?',
      { replacements: ['OFFICER'] }
    );
    const officerRoleId = officerRoleResult.length > 0 ? officerRoleResult[0].id : null;
    
    // Create default admin user
    console.log('👤 Creating default admin user...');
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    let adminId;
    try {
      // Check if admin user already exists
      const [existingAdmin] = await sequelize.query(
        'SELECT id FROM users WHERE username = ?',
        { replacements: ['admin'] }
      );
      
      if (existingAdmin.length > 0) {
        adminId = existingAdmin[0].id;
        console.log('ℹ️ Admin user already exists, updating...');
        
        // Update admin user
        await sequelize.query(
          `UPDATE users SET 
            password = ?, default_password = ?, email = ?,
            first_name = ?, last_name = ?, roles = ?,
            primary_role = ?, BU_ROLE_ID = ?, primary_business_role = ?,
            status = ?, isAdmin = ?, is_active = ?, utype = ?
          WHERE id = ?`,
          { replacements: [
            hashedPassword, hashedPassword, 'admin@example.com',
            'System', 'Administrator', JSON.stringify(['Admin']), 
            'Admin', 'ADMIN', 'Admin',
            'Active', true, 'Active', 'Staff',
            adminId
          ] }
        );
      } else {
        // Create new admin user
        const [adminResult] = await sequelize.query(
          `INSERT INTO users (
            user_name, username, password, default_password, email, 
            first_name, last_name, roles, primary_role, BU_ROLE_ID,
            primary_business_role, status, isAdmin, is_active, utype
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          { replacements: [
            'admin', 'admin', hashedPassword, hashedPassword, 'admin@example.com',
            'System', 'Administrator', JSON.stringify(['Admin']), 'Admin', 'ADMIN',
            'Admin', 'Active', true, 'Active', 'Staff'
          ] }
        );
        
        adminId = adminResult.insertId;
      }
      
      console.log(`✅ Admin user ready (password: admin123) with ID: ${adminId}`);
      
      // Create or update user_role association for admin
      if (adminRoleId) {
        // Check if association already exists
        const [existingAssoc] = await sequelize.query(
          'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ?',
          { replacements: [adminId, adminRoleId] }
        );
        
        if (existingAssoc.length === 0) {
          await sequelize.query(
            'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
            { replacements: [adminId, adminRoleId] }
          );
          console.log('✅ Created user-role association for admin');
        } else {
          console.log('ℹ️ User-role association for admin already exists');
        }
      }
    } catch (error) {
      console.error('⚠️ Error creating/updating admin user:', error.message);
    }
    
    // Create a regular user for testing
    console.log('👤 Creating test user...');
    const testPassword = await bcrypt.hash('test123', 10);
    
    let testUserId;
    try {
      // Check if test user already exists
      const [existingTestUser] = await sequelize.query(
        'SELECT id FROM users WHERE username = ?',
        { replacements: ['test.user'] }
      );
      
      if (existingTestUser.length > 0) {
        testUserId = existingTestUser[0].id;
        console.log('ℹ️ Test user already exists, updating...');
        
        // Update test user
        await sequelize.query(
          `UPDATE users SET 
            password = ?, default_password = ?, email = ?,
            first_name = ?, last_name = ?, roles = ?,
            primary_role = ?, BU_ROLE_ID = ?, primary_business_role = ?,
            status = ?, isAdmin = ?, is_active = ?, utype = ?
          WHERE id = ?`,
          { replacements: [
            testPassword, testPassword, 'test@example.com',
            'Test', 'User', JSON.stringify(['Officer']), 
            'Officer', 'OFFICER', 'Staff',
            'Active', false, 'Active', 'Staff',
            testUserId
          ] }
        );
      } else {
        // Create new test user
        const [testResult] = await sequelize.query(
          `INSERT INTO users (
            user_name, username, password, default_password, email, 
            first_name, last_name, roles, primary_role, BU_ROLE_ID,
            primary_business_role, status, isAdmin, is_active, utype
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          { replacements: [
            'test.user', 'test.user', testPassword, testPassword, 'test@example.com',
            'Test', 'User', JSON.stringify(['Officer']), 'Officer', 'OFFICER',
            'Staff', 'Active', false, 'Active', 'Staff'
          ] }
        );
        
        testUserId = testResult.insertId;
      }
      
      console.log(`✅ Test user ready (password: test123) with ID: ${testUserId}`);
      
      // Create or update user_role association for test user
      if (officerRoleId) {
        // Check if association already exists
        const [existingAssoc] = await sequelize.query(
          'SELECT id FROM user_roles WHERE user_id = ? AND role_id = ?',
          { replacements: [testUserId, officerRoleId] }
        );
        
        if (existingAssoc.length === 0) {
          await sequelize.query(
            'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
            { replacements: [testUserId, officerRoleId] }
          );
          console.log('✅ Created user-role association for test user');
        } else {
          console.log('ℹ️ User-role association for test user already exists');
        }
      }
    } catch (error) {
      console.error('⚠️ Error creating/updating test user:', error.message);
    }
    
    // Create a sample customer
    console.log('👥 Creating sample customer...');
    try {
      const [existingCustomer] = await sequelize.query(
        'SELECT id FROM customers WHERE CUST_ID = ?',
        { replacements: ['CUST001'] }
      );
      
      if (existingCustomer.length === 0) {
        await sequelize.query(`
          INSERT INTO customers (
            CUST_ID, CUST_NO, FIRST_NAME, LAST_NAME, EMAIL_ADDRESS, 
            PHONE_NO, status, CUST_NM, BU_ID, GENDER_TY,
            COUNTRY_NM, STATE, NIN, BVN, KYC_LEVEL
          ) VALUES (
            'CUST001', '100001', 'John', 'Doe', 'john.doe@example.com',
            '+1234567890', 'Active', 'John Doe', '001', 'Male',
            'United States', 'California', 'NIN123456', 'BVN789012', 'Level 2'
          )
        `);
        console.log('✅ Created sample customer');
      } else {
        console.log('ℹ️ Sample customer already exists');
      }
    } catch (error) {
      console.error('⚠️ Error creating sample customer:', error.message);
    }
    
    // Show summary
    console.log('\n📊 Database Summary:');
    const tables = ['users', 'roles', 'user_roles', 'customers'];
    
    for (const table of tables) {
      try {
        const [result] = await sequelize.query(`SELECT COUNT(*) as count FROM ${table}`);
        console.log(`  ${table}: ${result[0].count} records`);
      } catch (error) {
        console.log(`  ${table}: Error - ${error.message}`);
      }
    }
    
    // Show user details
    console.log('\n👥 User Details:');
    try {
      const [users] = await sequelize.query(`
        SELECT u.id, u.user_name, u.username, u.email, u.status, 
               GROUP_CONCAT(r.name) as roles
        FROM users u
        LEFT JOIN user_roles ur ON u.id = ur.user_id
        LEFT JOIN roles r ON ur.role_id = r.id
        GROUP BY u.id
      `);
      
      users.forEach(user => {
        console.log(`  ${user.user_name} (${user.email}) - Roles: ${user.roles || 'None'}`);
      });
    } catch (error) {
      console.log('  Could not fetch user details:', error.message);
    }
    
    console.log('\n🎉 Database setup complete!');
    console.log('\n🔑 Default credentials:');
    console.log('   Admin:');
    console.log('     Username: admin');
    console.log('     Password: admin123');
    console.log('   Test User:');
    console.log('     Username: test.user');
    console.log('     Password: test123');
    console.log('\n💡 Next: Run your application and access the admin panel.');
    
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
};

setupDatabaseDirect();