// scripts/createUserRole.js - MySQL VERSION
import { initializeModels, getSequelize } from '../src/models/index.js';

// Connect to MySQL
async function connectDB() {
  try {
    // Initialize models (this connects to the database)
    const models = await initializeModels();
    const sequelize = getSequelize();
    
    if (!sequelize) {
      throw new Error('Failed to connect to database');
    }
    
    console.log("✅ Connected to MySQL successfully");

    // Create a new UserRole
    const userId = 'admin123';  // This can be provided manually or via some input
    await createUserRole(userId);

  } catch (error) {
    console.error("❌ Error connecting to MySQL:", error);
    process.exit(1);
  }
}

// Function to get the next sequence for USER_ROLE_ID
const getNextUserRoleId = async () => {
  try {
    const sequelize = getSequelize();
    
    // Create or update counter table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS counters (
        name VARCHAR(50) PRIMARY KEY,
        seq INT DEFAULT 1
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // Get or create counter
    const [existing] = await sequelize.query(
      'SELECT seq FROM counters WHERE name = ?',
      { replacements: ['user_role_id'] }
    );
    
    let newSeq;
    if (existing.length === 0) {
      // Create new counter
      await sequelize.query(
        'INSERT INTO counters (name, seq) VALUES (?, 2)',
        { replacements: ['user_role_id'] }
      );
      newSeq = 1;
    } else {
      // Update existing counter
      const currentSeq = existing[0].seq;
      await sequelize.query(
        'UPDATE counters SET seq = seq + 1 WHERE name = ?',
        { replacements: ['user_role_id'] }
      );
      newSeq = currentSeq;
    }
    
    return newSeq;
  } catch (error) {
    console.error('❌ Error getting next USER_ROLE_ID:', error);
    return 1; // fallback to 1 if there's an error
  }
};

// Function to create a new UserRole
const createUserRole = async (userId) => {
  try {
    const sequelize = getSequelize();
    const userRoleId = await getNextUserRoleId();
    
    // Randomly select access levels and permissions
    const wfItemAccessLevel = ['BU', 'ALL', 'SU'][Math.floor(Math.random() * 3)];
    const recSt = ['A', 'D'][Math.floor(Math.random() * 2)];

    const custPostingAccessLevel = ['ALL', 'BU'][Math.floor(Math.random() * 2)];
    const glPostingAccessLevel = ['ALL', 'SU'][Math.floor(Math.random() * 2)];
    const drawerAccessLevel = ['BU', 'SU'][Math.floor(Math.random() * 2)];
    const txnEnquiryAccessLevel = ['BU', 'ALL', 'SU'][Math.floor(Math.random() * 3)];
    const fixedAssetAccessLevel = ['ALL', 'BU', 'SU'][Math.floor(Math.random() * 3)];
    const reportAccessLevel = ['ALL', 'BU', 'SU'][Math.floor(Math.random() * 3)];
    const grpActivityDownloadPerm = 'NOT_APPLY'; // Only one option
    const grpActivityUploadPerm = 'NOT_APPLY'; // Only one option
    const dashboardAccessLevel = ['BU', 'SU', 'ALL'][Math.floor(Math.random() * 3)];
    const creditApplAccessLevel = ['BU', 'ALL'][Math.floor(Math.random() * 2)];
    const customerAccessLevel = ['BU', 'ALL', 'SU'][Math.floor(Math.random() * 3)];
    const accountAccessLevel = ['BU', 'SU', 'ALL'][Math.floor(Math.random() * 3)];
    
    // Randomly select VAULT_ACCESS_LEVEL between 'BU' and 'SU'
    const vaultAccessLevel = ['BU', 'SU'][Math.floor(Math.random() * 2)];

    // Create USER_ROLES table if it doesn't exist
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS USER_ROLES (
        USER_ROLE_ID INT PRIMARY KEY AUTO_INCREMENT,
        SYSUSER_ID INT,
        BU_ROLE_ID INT,
        EFF_FROM_DT DATETIME,
        EFF_TO_DT DATETIME DEFAULT NULL,
        DEF_ROLE_FG CHAR(1) DEFAULT 'N',
        SUPERVISOR_FG CHAR(1) DEFAULT 'N',
        MULTI_CRNCY_FG CHAR(1) DEFAULT 'N',
        WF_ITEM_ACCESS_LEVEL VARCHAR(10),
        REC_ST CHAR(1) DEFAULT 'A',
        VERSION_NO INT DEFAULT 1,
        ROW_TS TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        USER_ID VARCHAR(100),
        CREATE_DT DATETIME,
        CREATED_BY VARCHAR(100),
        SYS_CREATE_TS TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        VAULT_ACCESS_LEVEL VARCHAR(10),
        DRAWER_ACCESS_LEVEL VARCHAR(10),
        CUST_POSTING_ACCESS_LEVEL VARCHAR(10),
        GL_POSTING_ACCESS_LEVEL VARCHAR(10),
        TXN_ENQUIRY_ACCESS_LVL VARCHAR(10),
        FIXED_ASSET_ACCESS_LEVEL VARCHAR(10),
        REPORT_ACCESS_LEVEL VARCHAR(10),
        GRP_ACTIVITY_DOWNLOAD_PERM VARCHAR(20),
        GRP_ACTIVITY_UPLOAD_PERM VARCHAR(20),
        DASHBOARD_ACCESS_LEVEL VARCHAR(10),
        FAV_DASHBOARD_BU_ROLE_ID INT DEFAULT NULL,
        CREDIT_APPL_ACCESS_LEVEL VARCHAR(10),
        CUSTOMER_ACCESS_LEVEL VARCHAR(10),
        ACCOUNT_ACCESS_LEVEL VARCHAR(10),
        BU_RESPONSIBLE_CENTRE_ID INT DEFAULT NULL,
        INDEX idx_user_id (USER_ID),
        INDEX idx_bu_role_id (BU_ROLE_ID),
        INDEX idx_sysuser_id (SYSUSER_ID)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    
    // Insert new user role
    await sequelize.query(`
      INSERT INTO USER_ROLES (
        USER_ROLE_ID,
        SYSUSER_ID,
        BU_ROLE_ID,
        EFF_FROM_DT,
        EFF_TO_DT,
        DEF_ROLE_FG,
        SUPERVISOR_FG,
        MULTI_CRNCY_FG,
        WF_ITEM_ACCESS_LEVEL,
        REC_ST,
        VERSION_NO,
        ROW_TS,
        USER_ID,
        CREATE_DT,
        CREATED_BY,
        SYS_CREATE_TS,
        VAULT_ACCESS_LEVEL,
        DRAWER_ACCESS_LEVEL,
        CUST_POSTING_ACCESS_LEVEL,
        GL_POSTING_ACCESS_LEVEL,
        TXN_ENQUIRY_ACCESS_LVL,
        FIXED_ASSET_ACCESS_LEVEL,
        REPORT_ACCESS_LEVEL,
        GRP_ACTIVITY_DOWNLOAD_PERM,
        GRP_ACTIVITY_UPLOAD_PERM,
        DASHBOARD_ACCESS_LEVEL,
        FAV_DASHBOARD_BU_ROLE_ID,
        CREDIT_APPL_ACCESS_LEVEL,
        CUSTOMER_ACCESS_LEVEL,
        ACCOUNT_ACCESS_LEVEL,
        BU_RESPONSIBLE_CENTRE_ID
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `, {
      replacements: [
        userRoleId,
        2, // SYSUSER_ID
        3, // BU_ROLE_ID
        new Date(), // EFF_FROM_DT
        null, // EFF_TO_DT
        'N', // DEF_ROLE_FG
        'N', // SUPERVISOR_FG
        'N', // MULTI_CRNCY_FG
        wfItemAccessLevel,
        recSt,
        1, // VERSION_NO
        new Date(), // ROW_TS
        userId,
        new Date(), // CREATE_DT
        'admin', // CREATED_BY
        new Date(), // SYS_CREATE_TS
        vaultAccessLevel,
        drawerAccessLevel,
        custPostingAccessLevel,
        glPostingAccessLevel,
        txnEnquiryAccessLevel,
        fixedAssetAccessLevel,
        reportAccessLevel,
        grpActivityDownloadPerm,
        grpActivityUploadPerm,
        dashboardAccessLevel,
        null, // FAV_DASHBOARD_BU_ROLE_ID
        creditApplAccessLevel,
        customerAccessLevel,
        accountAccessLevel,
        null // BU_RESPONSIBLE_CENTRE_ID
      ]
    });
    
    // Get the created record
    const [createdRoles] = await sequelize.query(
      'SELECT * FROM USER_ROLES WHERE USER_ROLE_ID = ?',
      { replacements: [userRoleId] }
    );
    
    if (createdRoles.length > 0) {
      console.log('✅ UserRole created:', createdRoles[0]);
    } else {
      console.log('✅ UserRole created but could not retrieve');
    }
    
  } catch (error) {
    console.error('❌ Error creating UserRole:', error);
  }
};

// Call the connectDB function to run the entire process
connectDB();