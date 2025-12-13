// migration/fixMigration.js
import mysql from 'mysql2/promise';
import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: `${__dirname}/../.env` });

async function migrateUserRoles() {
  console.log('🚀 Starting UserRole Migration\n');
  
  let mysqlConnection = null;
  let mongoClient = null;
  
  try {
    // MySQL Configuration
    const mysqlConfig = {
      host: process.env.MYSQL_HOST || 'localhost',
      user: process.env.MYSQL_USER || 'root',
      password: process.env.MYSQL_PASSWORD || '',
      database: process.env.MYSQL_DATABASE || 'core_x_banking',
      port: parseInt(process.env.MYSQL_PORT) || 3306,
    };

    // MongoDB Configuration
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/core_banking';
    
    // Role mapping
    const roleMapping = {
      589: 28, // Customer Service Officer
      596: 29, // Teller
      582: 30, // Head Teller
      603: 19, // Branch Manager
      631: 16, // Treasurer
      638: 27, // Customer Relationship Officer
      1: 1,    // Administrator
    };
    
    const branchMapping = {
      1: '100',
      22: '101',
      29: '102',
      36: '103',
      43: '104',
    };
    
    console.log('🔌 Connecting to databases...');
    
    // Connect to MySQL
    console.log('1. Connecting to MySQL...');
    mysqlConnection = await mysql.createConnection(mysqlConfig);
    console.log('✅ Connected to MySQL');
    
    // Connect to MongoDB
    console.log('2. Connecting to MongoDB...');
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    const mongoDb = mongoClient.db();
    console.log('✅ Connected to MongoDB');
    
    // Step 1: Fetch legacy users
    console.log('\n📊 Fetching legacy users from MySQL...');
    const [legacyUsers] = await mysqlConnection.execute(`
      SELECT 
        id,
        username,
        fname,
        lname,
        email,
        password,
        role,
        branch,
        is_active,
        phone_no,
        date_joined,
        created_by
      FROM users
      WHERE username IS NOT NULL 
      AND username != ''
      AND (username LIKE 'ST%' OR username = 'larsdan')
      ORDER BY id
    `);
    
    console.log(`📄 Found ${legacyUsers.length} users in legacy database\n`);
    
    if (legacyUsers.length === 0) {
      console.log('❌ No users found to migrate');
      return;
    }
    
    // Get existing SYSUSER_IDs
    const userRolesCollection = mongoDb.collection('userroles');
    const businessUnitsCollection = mongoDb.collection('businessunits');
    const usersCollection = mongoDb.collection('users');
    
    const lastUserRole = await userRolesCollection
      .find({})
      .sort({ SYSUSER_ID: -1 })
      .limit(1)
      .toArray();
    
    let nextSysUserId = 1;
    if (lastUserRole.length > 0 && lastUserRole[0].SYSUSER_ID) {
      const lastId = parseInt(lastUserRole[0].SYSUSER_ID, 10);
      if (!isNaN(lastId)) {
        nextSysUserId = lastId + 1;
      }
    }
    
    // Step 2: Process each user
    console.log(`📋 Processing ${legacyUsers.length} users...\n`);
    
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < legacyUsers.length; i++) {
      const legacyUser = legacyUsers[i];
      const { username, email, role, branch, is_active, date_joined, created_by } = legacyUser;
      
      console.log(`[${i + 1}/${legacyUsers.length}] Processing: ${username}`);
      
      try {
        // Check if user exists in MongoDB
        const existingUser = await usersCollection.findOne({ user_name: username });
        if (!existingUser) {
          console.log(`   ⚠️ User ${username} not found in MongoDB, skipping...`);
          skipCount++;
          continue;
        }
        
        // Check if UserRole already exists
        const existingUserRole = await userRolesCollection.findOne({ USER_ID: username });
        if (existingUserRole) {
          console.log(`   ⏩ UserRole already exists for ${username}, skipping...`);
          skipCount++;
          continue;
        }
        
        // Map role
        const legacyRoleId = parseInt(role);
        const newRoleId = roleMapping[legacyRoleId] || 28;
        const roleName = getRoleName(newRoleId);
        
        // Map branch
        const branchNum = parseInt(branch);
        const buId = branchMapping[branchNum] || '100';
        
        // Get business unit name
        let businessUnitName = `Business Unit ${buId}`;
        try {
          const businessUnit = await businessUnitsCollection.findOne({ BU_ID: buId });
          if (businessUnit && businessUnit.BUSINESS_UNIT) {
            businessUnitName = businessUnit.BUSINESS_UNIT;
          }
        } catch (error) {
          console.log(`   ⚠️ Could not fetch business unit ${buId}: ${error.message}`);
        }
        
        // Generate SYSUSER_ID
        const sysuserId = nextSysUserId.toString().padStart(3, '0');
        nextSysUserId++;
        
        // Transform status
        const recSt = is_active === 'Active' ? 'A' : 'I';
        
        // Create UserRole document
        const userRoleData = {
          USER_ROLE_IDS: [newRoleId],
          ROLE_NMS: [roleName],
          ROLE_NM: roleName,
          BU_ID: buId,
          Business_Unit: businessUnitName,
          USER_ID: username,
          SYSUSER_ID: sysuserId,
          EFF_FROM_DT: date_joined ? new Date(date_joined) : new Date(),
          EFF_TO_DT: null,
          DEF_ROLE_FG: "Y",
          SUPERVISOR_FG: [19, 30, 1].includes(newRoleId) ? "Y" : "N",
          MULTI_CRNCY_FG: "N",
          REC_ST: recSt,
          VERSION_NO: 1,
          CREATED_BY: created_by || 'system',
          CREATED_DT: new Date(),
          ROW_TS: new Date(),
          // Access levels
          VAULT_ACCESS_LEVEL: ["OWN BUSINESS UNIT"],
          DRAWER_ACCESS_LEVEL: ["OWN BUSINESS UNIT"],
          TXN_ENQUIRY_ACCESS_LVL: ["OWN BUSINESS UNIT"],
          CREDIT_APPL_ACCESS_LEVEL: ["BU"],
          CUSTOMER_ACCESS_LEVEL: ["OWN BUSINESS UNIT"],
          ACCOUNT_ACCESS_LEVEL: ["OWN BUSINESS UNIT"],
          REPORT_ACCESS_LEVEL: ["ALL BUSINESS UNIT"],
          CUST_POSTING_ACCESS_LEVEL: ["OWN BUSINESS UNIT"],
          GL_POSTING_ACCESS_LEVEL: ["BU"],
          FIXED_ASSET_ACCESS_LEVEL: ["BU"],
          LOAN_FEE_ACCESS_LEVEL: ["BU"],
          LOAN_OPERATIONS_ACCESS_LEVEL: ["BU"],
          PERMISSION_MANAGEMENT_ACCESS_LEVEL: ["BU"],
          SYSTEM_ADMIN_ACCESS_LEVEL: ["BU"],
          DASHBOARD_ACCESS_LEVEL: ["BU"],
          WF_ITEM_ACCESS_LEVEL: ["OWN BUSINESS UNIT"],
          permissions: []
        };
        
        // Save UserRole
        await userRolesCollection.insertOne(userRoleData);
        
        console.log(`   ✅ Created UserRole for ${username}`);
        console.log(`      Role: ${roleName}, BU: ${businessUnitName}, SYSUSER_ID: ${sysuserId}`);
        
        successCount++;
        
      } catch (error) {
        console.log(`   ❌ Error processing ${username}: ${error.message}`);
        errorCount++;
      }
    }
    
    // Step 3: Summary
    console.log('\n📈 ========== MIGRATION SUMMARY ==========');
    console.log(`   Total users processed: ${legacyUsers.length}`);
    console.log(`   Successfully migrated: ${successCount}`);
    console.log(`   Skipped: ${skipCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log('=========================================\n');
    
    if (successCount > 0) {
      console.log('✅ Migration completed successfully!');
    } else {
      console.log('⚠️ No users were migrated. Check if users exist in MongoDB.');
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    // Cleanup
    if (mysqlConnection) {
      await mysqlConnection.end();
      console.log('✅ Disconnected from MySQL');
    }
    if (mongoClient) {
      await mongoClient.close();
      console.log('✅ Disconnected from MongoDB');
    }
  }
}

function getRoleName(roleId) {
  const roleNames = {
    1: 'Administrator',
    16: 'Treasurer',
    19: 'Branch Manager',
    27: 'Customer Relationship Officer',
    28: 'Customer Service Officer',
    29: 'Teller',
    30: 'Head Teller'
  };
  return roleNames[roleId] || 'Staff';
}

// Execute immediately
migrateUserRoles().catch(console.error);