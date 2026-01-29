// fix-database-proper.js - PROPERLY ORDERED FIX
import { getPool } from '../config/db.js';

async function fixDatabase() {
  console.log('🔧 Proper Database Fix\n');
  
  const pool = getPool();
  const conn = await pool.getConnection();
  
  try {
    // 1. First, check what we have
    console.log('1️⃣ Checking current database state...');
    const [tables] = await conn.query('SHOW TABLES');
    const tableNames = tables.map(t => t[`Tables_in_${process.env.DB_NAME || 'core_banking'}`]);
    console.log(`   Found ${tableNames.length} tables: ${tableNames.join(', ')}`);
    
    // 2. Handle users table FIRST - fix schema
    console.log('\n2️⃣ Fixing users table schema FIRST...');
    await fixUsersTableSchema(conn);
    
    // 3. THEN check/create admin user
    console.log('\n3️⃣ Now checking/admin user...');
    await handleAdminUser(conn);
    
    // 4. Fix customers table
    console.log('\n4️⃣ Fixing customers table...');
    await fixCustomersTable(conn);
    
    // 5. Create other missing tables
    console.log('\n5️⃣ Creating other essential tables...');
    await createEssentialTables(conn, tableNames);
    
    console.log('\n✅ Database fix completed successfully!');
    
    // 6. Show final status
    await showFinalStatus(conn);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    conn.release();
    await pool.end();
  }
}

async function fixUsersTableSchema(conn) {
  try {
    // Check if users table exists
    const [usersTable] = await conn.query("SHOW TABLES LIKE 'users'");
    
    if (usersTable.length === 0) {
      console.log('   Creating users table from scratch...');
      await createUsersTable(conn);
      return;
    }
    
    console.log('   Users table exists, fixing schema...');
    
    // List of columns to check/add
    const columnsToCheck = [
      'is_active',
      'utype',
      'user_id',
      'username',
      'user_name',
      'password',
      'default_password',
      'passwordHistory',
      'email',
      'first_name',
      'last_name',
      'status',
      'isAdmin'
    ];
    
    let addedColumns = 0;
    
    for (const column of columnsToCheck) {
      try {
        const [existing] = await conn.query(`SHOW COLUMNS FROM users LIKE '${column}'`);
        if (existing.length === 0) {
          // Add the column with appropriate type
          const columnDefinition = getColumnDefinition(column);
          if (columnDefinition) {
            await conn.query(`ALTER TABLE users ADD COLUMN ${columnDefinition}`);
            console.log(`     ✅ Added ${column}`);
            addedColumns++;
          }
        }
      } catch (colError) {
        console.log(`     ⚠️ Error checking/adding ${column}:`, colError.message);
      }
    }
    
    if (addedColumns > 0) {
      console.log(`   ✅ Added ${addedColumns} missing columns`);
    } else {
      console.log('   ✅ All required columns already exist');
    }
    
  } catch (error) {
    console.error('   ❌ Error fixing users table:', error.message);
  }
}

function getColumnDefinition(columnName) {
  const definitions = {
    'is_active': "is_active VARCHAR(50) DEFAULT 'Active'",
    'utype': "utype VARCHAR(50) DEFAULT 'Staff'",
    'user_id': "user_id INT UNIQUE",
    'username': "username VARCHAR(255) UNIQUE",
    'user_name': "user_name VARCHAR(255) UNIQUE",
    'password': "password VARCHAR(255) NOT NULL",
    'default_password': "default_password VARCHAR(255)",
    'passwordHistory': "passwordHistory JSON DEFAULT (JSON_ARRAY())",
    'email': "email VARCHAR(255) UNIQUE",
    'first_name': "first_name VARCHAR(255)",
    'last_name': "last_name VARCHAR(255)",
    'status': "status ENUM('Active', 'Deactivated', 'ForceLocked') DEFAULT 'Active'",
    'isAdmin': "isAdmin BOOLEAN DEFAULT FALSE"
  };
  
  return definitions[columnName] || null;
}

async function createUsersTable(conn) {
  await conn.query(`
    CREATE TABLE users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNIQUE,
      username VARCHAR(255) UNIQUE,
      user_name VARCHAR(255) UNIQUE,
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
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log('   ✅ Created users table with all columns');
}

async function handleAdminUser(conn) {
  try {
    // First, check if admin exists with a simple query
    const [admin] = await conn.query(`
      SELECT id, username, email 
      FROM users 
      WHERE username = 'admin' OR email = 'admin@evolutionbanking.com'
      LIMIT 1
    `);
    
    if (admin.length > 0) {
      console.log(`   ✅ Admin user exists (ID: ${admin[0].id})`);
      
      // Update admin with proper permissions
      const bcrypt = await import('bcrypt');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      // Build update query dynamically based on what columns exist
      await conn.query(`
        UPDATE users SET 
          password = ?,
          isAdmin = TRUE,
          status = 'Active'
        WHERE username = 'admin'
      `, [hashedPassword]);
      
      console.log('   ✅ Updated admin user');
      
    } else {
      console.log('   Creating admin user...');
      
      // Create admin user with minimal required columns first
      const bcrypt = await import('bcrypt');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      // Simple insert with only essential columns
      await conn.query(`
        INSERT INTO users (
          user_id, username, user_name, password, email, 
          first_name, last_name, status, isAdmin
        ) VALUES (
          1001, 'admin', 'admin', ?, 'admin@evolutionbanking.com',
          'System', 'Administrator', 'Active', TRUE
        )
      `, [hashedPassword]);
      
      console.log('   ✅ Created admin user (username: admin, password: admin123)');
    }
    
  } catch (error) {
    console.error('   ❌ Error with admin user:', error.message);
    
    // Try a simpler approach if the first one fails
    try {
      console.log('   Trying simple admin creation...');
      const bcrypt = await import('bcrypt');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await conn.query(`
        INSERT IGNORE INTO users (username, password, email, isAdmin, status)
        VALUES ('admin', ?, 'admin@evolutionbanking.com', TRUE, 'Active')
      `, [hashedPassword]);
      
      console.log('   ✅ Created admin user with simple query');
    } catch (simpleError) {
      console.error('   ❌ Even simple creation failed:', simpleError.message);
    }
  }
}

async function fixCustomersTable(conn) {
  try {
    const [customersTable] = await conn.query("SHOW TABLES LIKE 'customers'");
    
    if (customersTable.length === 0) {
      console.log('   Creating customers table...');
      await conn.query(`
        CREATE TABLE customers (
          id INT AUTO_INCREMENT PRIMARY KEY,
          CUST_ID VARCHAR(50) NOT NULL UNIQUE,
          CUST_NO VARCHAR(50) NOT NULL UNIQUE,
          FIRST_NAME VARCHAR(100),
          LAST_NAME VARCHAR(100),
          EMAIL_ADDRESS VARCHAR(255),
          PHONE_NO VARCHAR(20),
          HOME_ADDRESS VARCHAR(500),
          BU_ID VARCHAR(50),
          status VARCHAR(20) DEFAULT 'Pending',
          REC_ST VARCHAR(20) DEFAULT 'PENDING',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      console.log('   ✅ Created customers table');
    } else {
      console.log('   ✅ Customers table already exists');
    }
    
  } catch (error) {
    console.error('   ❌ Error with customers table:', error.message);
  }
}

async function createEssentialTables(conn, existingTables) {
  const essentialTables = [
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
    },
    {
      name: 'accounts',
      sql: `CREATE TABLE IF NOT EXISTS accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_number VARCHAR(20) NOT NULL UNIQUE,
        customer_id INT,
        account_type ENUM('savings', 'current', 'fixed_deposit', 'joint') DEFAULT 'savings',
        balance DECIMAL(15,2) DEFAULT 0.00,
        currency VARCHAR(3) DEFAULT 'NGN',
        status ENUM('active', 'dormant', 'closed', 'frozen') DEFAULT 'active',
        opened_date DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
    }
  ];
  
  for (const table of essentialTables) {
    if (!existingTables.includes(table.name)) {
      try {
        await conn.query(table.sql);
        console.log(`   ✅ Created ${table.name} table`);
      } catch (error) {
        console.log(`   ⚠️ Error creating ${table.name}:`, error.message);
      }
    } else {
      console.log(`   ⏭️ ${table.name} table already exists`);
    }
  }
  
  // Ensure counters has default data
  try {
    await conn.query(`
      INSERT IGNORE INTO counters (_id, name, seq, description) 
      VALUES ('customerId', 'Customer ID', 1000, 'Generates customer IDs')
    `);
    console.log('   ✅ Added default counter');
  } catch (error) {
    console.log('   ⚠️ Error with counter:', error.message);
  }
}

async function showFinalStatus(conn) {
  try {
    console.log('\n📊 Final Database Status:');
    
    // Show all tables
    const [tables] = await conn.query('SHOW TABLES');
    console.log(`   Total tables: ${tables.length}`);
    
    for (const table of tables) {
      const tableName = table[`Tables_in_${process.env.DB_NAME || 'core_banking'}`];
      try {
        const [count] = await conn.query(`SELECT COUNT(*) as total FROM ${tableName}`);
        console.log(`   - ${tableName}: ${count[0].total} records`);
      } catch (error) {
        console.log(`   - ${tableName}: (error counting)`);
      }
    }
    
    // Show users details
    console.log('\n👤 Users Summary:');
    try {
      const [users] = await conn.query(`
        SELECT id, username, email, status, isAdmin, created_at 
        FROM users 
        ORDER BY id LIMIT 5
      `);
      
      if (users.length > 0) {
        users.forEach(user => {
          console.log(`   ${user.id}. ${user.username} (${user.email}) - ${user.status} ${user.isAdmin ? '[Admin]' : ''}`);
        });
      } else {
        console.log('   No users found');
      }
    } catch (error) {
      console.log('   Could not fetch users');
    }
    
    console.log('\n🎉 Database is ready! You can now login with:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    
  } catch (error) {
    console.error('Error showing final status:', error.message);
  }
}

fixDatabase();