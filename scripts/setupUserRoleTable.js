// scripts/setupUserRoleTable.js
import { initializeModels, getSequelize } from '../src/models/index.js';

const setupUserRoleTable = async () => {
  try {
    console.log('🚀 Setting up UserRole table...');
    
    // Initialize models
    await initializeModels();
    const sequelize = getSequelize();
    
    if (!sequelize) {
      throw new Error('Sequelize instance not available');
    }
    
    // Test connection
    await sequelize.authenticate();
    console.log('✅ Database connection established');
    
    // Create UserRole table manually (in case model isn't loaded)
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS user_roles (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ROLE_NM VARCHAR(100) NOT NULL,
        SYSUSER_ID VARCHAR(100) NOT NULL,
        Business_Unit VARCHAR(100) NOT NULL,
        BU_ID VARCHAR(10) NOT NULL DEFAULT '000',
        USER_ROLE_IDS JSON,
        ROLE_NMS JSON,
        EFF_FROM_DT DATETIME DEFAULT CURRENT_TIMESTAMP,
        EFF_TO_DT DATETIME DEFAULT NULL,
        DEF_ROLE_FG ENUM('Y', 'N') DEFAULT 'N',
        SUPERVISOR_FG ENUM('Y', 'N') DEFAULT 'N',
        MULTI_CRNCY_FG ENUM('Y', 'N') DEFAULT 'N',
        WF_ITEM_ACCESS_LEVEL JSON,
        REC_ST ENUM('Y', 'N', 'A') DEFAULT 'A',
        VERSION_NO INT DEFAULT 1,
        ROW_TS DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        user_id VARCHAR(100) DEFAULT 'SYSTEM',
        CREATE_DT DATETIME DEFAULT CURRENT_TIMESTAMP,
        CREATED_BY VARCHAR(100) DEFAULT 'SYSTEM',
        VAULT_ACCESS_LEVEL JSON,
        DRAWER_ACCESS_LEVEL JSON,
        TXN_ENQUIRY_ACCESS_LVL JSON,
        CREDIT_APPL_ACCESS_LEVEL JSON,
        CUSTOMER_ACCESS_LEVEL JSON,
        ACCOUNT_ACCESS_LEVEL JSON,
        REPORT_ACCESS_LEVEL JSON,
        CUST_POSTING_ACCESS_LEVEL JSON,
        GL_POSTING_ACCESS_LEVEL JSON,
        FIXED_ASSET_ACCESS_LEVEL JSON,
        LOAN_FEE_ACCESS_LEVEL JSON,
        LOAN_OPERATIONS_ACCESS_LEVEL JSON,
        PERMISSION_MANAGEMENT_ACCESS_LEVEL JSON,
        SYSTEM_ADMIN_ACCESS_LEVEL JSON,
        DASHBOARD_ACCESS_LEVEL JSON,
        INDEX idx_user_id (user_id),
        INDEX idx_bu_id (BU_ID),
        INDEX idx_sysuser_id (SYSUSER_ID),
        INDEX idx_role_nm (ROLE_NM)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;
    
    await sequelize.query(createTableSQL);
    console.log('✅ UserRole table created/verified');
    
    // Insert sample data
    const sampleData = [
      {
        ROLE_NM: 'System Administrator',
        SYSUSER_ID: 'SYS001',
        Business_Unit: 'Head Office',
        BU_ID: '001',
        USER_ROLE_IDS: JSON.stringify([1, 2, 3]),
        ROLE_NMS: JSON.stringify(['Admin', 'Manager', 'Supervisor']),
        user_id: 'admin',
        CREATED_BY: 'SYSTEM',
        VAULT_ACCESS_LEVEL: JSON.stringify(['SU']),
        CUSTOMER_ACCESS_LEVEL: JSON.stringify(['ALL'])
      },
      {
        ROLE_NM: 'Branch Manager',
        SYSUSER_ID: 'SYS002',
        Business_Unit: 'Main Branch',
        BU_ID: '002',
        USER_ROLE_IDS: JSON.stringify([2]),
        ROLE_NMS: JSON.stringify(['Manager']),
        user_id: 'manager',
        CREATED_BY: 'SYSTEM',
        VAULT_ACCESS_LEVEL: JSON.stringify(['BU']),
        CUSTOMER_ACCESS_LEVEL: JSON.stringify(['BU'])
      }
    ];
    
    for (const data of sampleData) {
      // Check if exists
      const [existing] = await sequelize.query(
        'SELECT id FROM user_roles WHERE user_id = ? AND BU_ID = ?',
        { replacements: [data.user_id, data.BU_ID] }
      );
      
      if (existing.length === 0) {
        const columns = Object.keys(data).join(', ');
        const placeholders = Object.keys(data).map(() => '?').join(', ');
        const values = Object.values(data);
        
        await sequelize.query(
          `INSERT INTO user_roles (${columns}) VALUES (${placeholders})`,
          { replacements: values }
        );
        
        console.log(`✅ Created role: ${data.ROLE_NM} for ${data.user_id}`);
      } else {
        console.log(`ℹ️ Role already exists: ${data.ROLE_NM} for ${data.user_id}`);
      }
    }
    
    // Verify
    const [results] = await sequelize.query('SELECT COUNT(*) as count FROM user_roles');
    console.log(`\n📊 Total user roles: ${results[0].count}`);
    
    const [roles] = await sequelize.query('SELECT ROLE_NM, user_id, BU_ID FROM user_roles');
    console.log('📋 User roles in database:');
    roles.forEach(role => {
      console.log(`  - ${role.ROLE_NM} (User: ${role.user_id}, BU: ${role.BU_ID})`);
    });
    
    console.log('\n🎉 UserRole table setup complete!');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ UserRole table setup failed:', error);
    process.exit(1);
  }
};

setupUserRoleTable();